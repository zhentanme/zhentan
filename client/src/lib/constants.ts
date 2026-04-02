import { type Hex } from "viem";

export const SAFE_SINGLETON: Hex =
  "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
export const SAFE_PROXY_FACTORY: Hex =
  "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
export const SAFE_VERSION = "1.4.1" as const;

export const USDC_DECIMALS = 18;

export const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "to", type: "address" as const },
      { name: "amount", type: "uint256" as const },
    ],
    outputs: [{ type: "bool" as const }],
  },
] as const;

export const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "spender", type: "address" as const },
      { name: "amount", type: "uint256" as const },
    ],
    outputs: [{ type: "bool" as const }],
  },
] as const;

export const ERC20_BALANCE_OF_ABI = [
  {
    name: "balanceOf",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs: [{ name: "account", type: "address" as const }],
    outputs: [{ type: "uint256" as const }],
  },
] as const;

/** Zero address used for native token (BNB) in portfolio and propose. */
export const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";
export const NATIVE_DECIMALS = 18;

export const BSC_RPC = "https://1rpc.io/bnb";
export const BSC_EXPLORER_URL = "https://bscscan.com";

export function getPimlicoRpcUrl(apiKey: string): string {
  return `https://api.pimlico.io/v2/binance/rpc?apikey=${apiKey}`;
}
