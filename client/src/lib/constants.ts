import { type Hex } from "viem";

export const SAFE_SINGLETON: Hex =
  "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
export const SAFE_PROXY_FACTORY: Hex =
  "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
export const SAFE_VERSION = "1.4.1" as const;

/** Canonical Safe 1.4.1 MultiSendCallOnly — batches calls inside one SafeTx (operation=1). */
export const MULTISEND_CALL_ONLY: Hex =
  "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";

export const MULTISEND_ABI = [
  {
    name: "multiSend",
    type: "function" as const,
    stateMutability: "payable" as const,
    inputs: [{ name: "transactions", type: "bytes" as const }],
    outputs: [],
  },
] as const;

/** Safe owner-management fragments used by the 2-of-3 upgrade flow. */
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
    name: "getOwners",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs: [],
    outputs: [{ type: "address[]" as const }],
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
 * flow. Must match the server's copy in server/src/lib/constants.ts exactly.
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

export const BSC_RPC = process.env.NEXT_PUBLIC_BSC_RPC_URL || "https://1rpc.io/bnb";
export const BSC_EXPLORER_URL = "https://bscscan.com";

