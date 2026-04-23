import {
  createPublicClient,
  getAddress,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { bsc } from "viem/chains";
import {
  CurrencyAmount,
  ERC20Token,
  Native,
  Percent,
  TradeType,
  type Currency,
} from "@pancakeswap/sdk";
import {
  SmartRouter,
  SwapRouter,
  SMART_ROUTER_ADDRESSES,
} from "@pancakeswap/smart-router";

import { BSC_RPC, NATIVE_TOKEN_ADDRESS } from "./constants.js";

const BSC_CHAIN_ID = 56;
const ROUTER_ADDRESS = SMART_ROUTER_ADDRESSES[BSC_CHAIN_ID] as Address;

const PANCAKE_TOOL = {
  key: "pancakeswap",
  name: "PancakeSwap",
  logoURI: "https://pancakeswap.finance/logo.png",
};

// SmartRouter expects a viem PublicClient via callback. Increasing the multicall
// batch size keeps on-chain pool discovery to a small number of RPC roundtrips.
const publicClient: PublicClient = createPublicClient({
  chain: bsc,
  transport: http(process.env.BSC_RPC_URL || BSC_RPC),
  batch: { multicall: { batchSize: 1024 * 200 } },
});

const quoteProvider = SmartRouter.createQuoteProvider({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChainProvider: () => publicClient as any,
});

const ERC20_META_ABI = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

async function resolveCurrency(address: string): Promise<Currency> {
  if (address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
    return Native.onChain(BSC_CHAIN_ID);
  }
  const addr = getAddress(address);
  const [decimals, symbol] = await Promise.all([
    publicClient.readContract({
      address: addr,
      abi: ERC20_META_ABI,
      functionName: "decimals",
    }),
    publicClient
      .readContract({
        address: addr,
        abi: ERC20_META_ABI,
        functionName: "symbol",
      })
      .catch(() => "TOKEN"),
  ]);
  return new ERC20Token(BSC_CHAIN_ID, addr, Number(decimals), String(symbol));
}

export interface PancakeSwapQuote {
  buyAmount: string;
  buyAmountUSD: string;
  sellAmountUSD: string;
  transaction: {
    to: string;
    value: string;
    data: string;
    gasLimit: string;
    gasPrice: string;
    chainId: number;
  };
  approvalAddress: string;
  tool: { key: string; name: string; logoURI: string };
}

export interface PancakeSwapQuoteParams {
  fromToken: string;
  toToken: string;
  amount: string;
  fromAddress: string;
  /** Slippage as a fraction (0.01 = 1%). Clamped to [0.0001, 0.5]. */
  slippage: number;
}

export async function getPancakeSwapQuote(
  params: PancakeSwapQuoteParams
): Promise<PancakeSwapQuote | null> {
  const { fromToken, toToken, amount, fromAddress } = params;

  const [from, to] = await Promise.all([
    resolveCurrency(fromToken),
    resolveCurrency(toToken),
  ]);

  if (from.equals(to)) return null;

  const inputAmount = CurrencyAmount.fromRawAmount(from, amount);

  // On-chain pool discovery only — subgraphs don't reliably index low-liquidity
  // pairs, which is exactly the case this fallback exists for.
  const [v2Pools, v3Pools] = await Promise.all([
    SmartRouter.getV2CandidatePools({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChainProvider: () => publicClient as any,
      currencyA: from,
      currencyB: to,
    }).catch(() => []),
    SmartRouter.getV3CandidatePools({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChainProvider: () => publicClient as any,
      currencyA: from,
      currencyB: to,
    }).catch(() => []),
  ]);

  const pools = [...v2Pools, ...v3Pools];
  if (!pools.length) return null;

  const trade = await SmartRouter.getBestTrade(
    inputAmount,
    to,
    TradeType.EXACT_INPUT,
    {
      gasPriceWei: () => publicClient.getGasPrice(),
      maxHops: 3,
      maxSplits: 2,
      poolProvider: SmartRouter.createStaticPoolProvider(pools),
      quoteProvider,
      quoterOptimization: true,
    }
  );

  if (!trade) return null;

  const slippageBps = Math.min(5_000, Math.max(1, Math.round(params.slippage * 10_000)));
  const tolerance = new Percent(slippageBps, 10_000);

  const { value, calldata } = SwapRouter.swapCallParameters(trade, {
    recipient: getAddress(fromAddress),
    slippageTolerance: tolerance,
  });

  return {
    buyAmount: trade.outputAmount.quotient.toString(),
    buyAmountUSD: "",
    sellAmountUSD: "",
    transaction: {
      to: ROUTER_ADDRESS,
      value,
      data: calldata,
      // Gas is repriced by the bundler/paymaster at user-op time; quote-time
      // estimation here would just fail for unfunded Safes.
      gasLimit: "0",
      gasPrice: "0",
      chainId: BSC_CHAIN_ID,
    },
    approvalAddress: ROUTER_ADDRESS,
    tool: PANCAKE_TOOL,
  };
}
