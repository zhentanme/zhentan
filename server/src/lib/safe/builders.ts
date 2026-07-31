/**
 * Builder registry for agent-initiated transactions.
 *
 * Each settlement kind is one entry: `build(params) → { calls, display }`.
 * The shared buildSafeTx below (server port of the client builder in
 * client/src/lib/safe/safeTx.ts — keep the encodings in lockstep) turns the
 * calls into a standard SafeTx: single call → plain CALL, several calls →
 * MultiSendCallOnly batch. Adding a new agent-initiable kind = one entry
 * here + a decoder case in kind.ts + a risk strategy in risk.ts.
 */
import {
  encodeFunctionData,
  encodePacked,
  concatHex,
  parseUnits,
  size,
  type Address,
  type Hex,
} from "viem";

import {
  ERC20_TRANSFER_ABI,
  ERC20_APPROVE_ABI,
  MULTISEND_ABI,
  MULTISEND_CALL_ONLY,
  NATIVE_TOKEN_ADDRESS,
} from "../constants.js";
import { getPancakeSwapQuote } from "../pancakeswap.js";
import { fetchTokenPositions } from "../zerion.js";
import type { RequestKind, SafeTxData } from "../../types.js";

export interface SafeCall {
  to: Address;
  value: bigint;
  data: Hex;
}

/** Display fields the queued row is stamped with (what the user sees). */
export interface BuiltCalls {
  calls: SafeCall[];
  display: {
    to: string;
    amount: string;
    token: string;
    tokenAddress: string;
    toTokenAddress?: string;
  };
}

export interface TransferBuildParams {
  safeAddress: string;
  to: string;
  amount: string; // human-readable
  token: string; // symbol
}

export interface SwapBuildParams {
  safeAddress: string;
  fromToken: string; // symbol
  toToken: string; // symbol
  sellAmount: string; // human-readable
  /** Fraction, e.g. 0.005 = 0.5%. */
  slippage?: number;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const DEFAULT_SLIPPAGE = 0.005;

/** Resolve a token symbol → { address, decimals } from the Safe's holdings. */
export async function resolveTokenBySymbol(
  safeAddress: string,
  symbol: string
): Promise<{ address: string; decimals: number } | null> {
  if (symbol.toUpperCase() === "BNB") {
    return { address: NATIVE_TOKEN_ADDRESS, decimals: 18 };
  }
  try {
    const { tokens } = await fetchTokenPositions(safeAddress);
    const t = tokens.find(
      (x) => x.address && x.symbol?.toUpperCase() === symbol.toUpperCase()
    );
    if (t?.address) return { address: t.address, decimals: t.decimals };
  } catch {
    /* fall through */
  }
  return null;
}

async function buildTransferCalls(params: TransferBuildParams): Promise<BuiltCalls | null> {
  const { safeAddress, to, amount, token } = params;
  const tk = await resolveTokenBySymbol(safeAddress, token);
  if (!tk) return null;

  const amountWei = parseUnits(amount, tk.decimals);
  const isNative = tk.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  const call: SafeCall = isNative
    ? { to: to as Address, value: amountWei, data: "0x" as Hex }
    : {
        to: tk.address as Address,
        value: 0n,
        data: encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [to as Address, amountWei],
        }),
      };
  return {
    calls: [call],
    display: { to, amount, token, tokenAddress: tk.address },
  };
}

async function buildSwapCalls(params: SwapBuildParams): Promise<BuiltCalls | null> {
  const { safeAddress, fromToken, toToken, sellAmount } = params;
  const [from, to] = await Promise.all([
    resolveTokenBySymbol(safeAddress, fromToken),
    resolveTokenBySymbol(safeAddress, toToken),
  ]);
  if (!from || !to) return null;

  const sellAmountWei = parseUnits(sellAmount, from.decimals);
  const quote = await getPancakeSwapQuote({
    fromToken: from.address,
    toToken: to.address,
    amount: sellAmountWei.toString(),
    fromAddress: safeAddress,
    slippage: params.slippage ?? DEFAULT_SLIPPAGE,
  });
  if (!quote) return null;

  const isNativeSell =
    from.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  const calls: SafeCall[] = [];
  if (!isNativeSell) {
    // Exact-amount approval only — the agent never asks the user to sign an
    // unlimited approval (the risk engine flags those).
    calls.push({
      to: from.address as Address,
      value: 0n,
      data: encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [quote.approvalAddress as Address, sellAmountWei],
      }),
    });
  }
  calls.push({
    to: quote.transaction.to as Address,
    value: BigInt(quote.transaction.value || "0"),
    data: quote.transaction.data as Hex,
  });

  return {
    calls,
    display: {
      to: quote.transaction.to,
      amount: sellAmount,
      token: `${fromToken.toUpperCase()} → ${toToken.toUpperCase()}`,
      tokenAddress: from.address,
      toTokenAddress: to.address,
    },
  };
}

/** One entry per agent-initiable kind. */
export const KIND_BUILDERS: {
  transfer: (p: TransferBuildParams) => Promise<BuiltCalls | null>;
  swap: (p: SwapBuildParams) => Promise<BuiltCalls | null>;
} = {
  transfer: buildTransferCalls,
  swap: buildSwapCalls,
};

export function isAgentInitiableKind(kind: string): kind is RequestKind {
  return kind in KIND_BUILDERS;
}

/**
 * Server port of the client's buildSafeTx: single call → operation 0,
 * several → packed MultiSendCallOnly batch (operation 1). Gas fields zero —
 * the relayer (agent EOA) pays.
 */
export function buildSafeTxFromCalls(calls: SafeCall[], nonce: number): SafeTxData {
  if (calls.length === 0) throw new Error("buildSafeTxFromCalls requires at least one call");

  if (calls.length === 1) {
    const { to, value, data } = calls[0];
    return {
      to,
      value: value.toString(),
      data,
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: ZERO_ADDRESS,
      refundReceiver: ZERO_ADDRESS,
      nonce,
    };
  }

  // MultiSend packed encoding per tx: operation(1) | to(20) | value(32) | dataLength(32) | data
  const packed = calls.map((c) =>
    encodePacked(
      ["uint8", "address", "uint256", "uint256", "bytes"],
      [0, c.to, c.value, BigInt(size(c.data)), c.data]
    )
  );
  return {
    to: MULTISEND_CALL_ONLY,
    value: "0",
    data: encodeFunctionData({
      abi: MULTISEND_ABI,
      functionName: "multiSend",
      args: [concatHex(packed)],
    }),
    operation: 1,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: ZERO_ADDRESS,
    refundReceiver: ZERO_ADDRESS,
    nonce,
  };
}
