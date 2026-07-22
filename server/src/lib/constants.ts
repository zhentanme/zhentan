import type { Hex } from "viem";

export const SAFE_SINGLETON: Hex =
  "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
export const SAFE_PROXY_FACTORY: Hex =
  "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
export const SAFE_VERSION = "1.4.1" as const;

/** Canonical Safe 1.4.1 MultiSendCallOnly — batches calls inside one SafeTx (operation=1). */
export const MULTISEND_CALL_ONLY: Hex =
  "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";

/** 4-byte selector of Safe's addOwnerWithThreshold(address,uint256). */
export const ADD_OWNER_WITH_THRESHOLD_SELECTOR = "0x0d582f13" as const;

/** Safe owner-management + introspection fragments used by the 2-of-3 flows. */
export const SAFE_ABI = [
  {
    name: "addOwnerWithThreshold",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "owner", type: "address" as const },
      { name: "_threshold", type: "uint256" as const },
    ],
    outputs: [],
  },
  {
    name: "removeOwner",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "prevOwner", type: "address" as const },
      { name: "owner", type: "address" as const },
      { name: "_threshold", type: "uint256" as const },
    ],
    outputs: [],
  },
  {
    name: "getOwners",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs: [],
    outputs: [{ type: "address[]" as const }],
  },
  {
    name: "getThreshold",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs: [],
    outputs: [{ type: "uint256" as const }],
  },
  {
    name: "nonce",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs: [],
    outputs: [{ type: "uint256" as const }],
  },
] as const;

/**
 * EIP-712 SafeTx type — the message signed for the Safe Transaction Service
 * flow. Must match the client's copy in client/src/lib/constants.ts exactly.
 */
export const SAFE_TX_TYPES = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const BSC_RPC =  process.env.BSC_RPC_URL || "https://1rpc.io/bnb";

/** Zero address used to identify native BNB transfers. */
export const NATIVE_TOKEN_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

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

export function getPimlicoRpcUrl(apiKey: string): string {
  return `https://api.pimlico.io/v2/binance/rpc?apikey=${apiKey}`;
}
