/**
 * Kind decoder — classifies any SafeTx payload from its CALLDATA (never from
 * client-supplied display fields) into a settlement kind. One decode, shared
 * by risk analysis, deep-analyze, pattern learning and request validation, so
 * every consumer agrees on what a transaction actually does.
 *
 * Extending to a new kind = one case here + one builder entry in builders.ts
 * + one strategy branch in risk.ts.
 */
import {
  decodeFunctionData,
  isAddressEqual,
  maxUint256,
  type Address,
  type Hex,
} from "viem";
import { decodeMultiSendData } from "@safe-global/protocol-kit";

import {
  ERC20_TRANSFER_ABI,
  ERC20_APPROVE_ABI,
  MULTISEND_CALL_ONLY,
  KNOWN_ROUTERS,
} from "../constants.js";
import type { PendingTransaction, SafeTxData } from "../../types.js";

// The decoded SHAPES live in zhentan-screening (the runtime consumes them
// from job payloads); the decoder below stays backend-side. Re-exported so
// every existing `safe/kind.js` importer keeps working unchanged.
import type { DecodedCall, DecodedKind } from "zhentan-screening/decoded";
export type { DecodedCall, DecodedKind };

/** Treat approvals at or above half of uint256 max as effectively infinite. */
const INFINITE_THRESHOLD = maxUint256 / 2n;

function tryDecodeErc20(
  call: DecodedCall
): { fn: "transfer" | "approve"; arg0: string; amount: bigint } | null {
  try {
    const t = decodeFunctionData({ abi: ERC20_TRANSFER_ABI, data: call.data });
    const [to, amount] = t.args as readonly [Address, bigint];
    return { fn: "transfer", arg0: to, amount };
  } catch {
    /* not transfer */
  }
  try {
    const a = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: call.data });
    const [spender, amount] = a.args as readonly [Address, bigint];
    return { fn: "approve", arg0: spender, amount };
  } catch {
    /* not approve */
  }
  return null;
}

function routerName(address: string): string | null {
  return KNOWN_ROUTERS[address.toLowerCase()] ?? null;
}

/** Unwrap a SafeTx into its constituent calls (MultiSend batches flatten). */
export function unwrapCalls(safeTx: SafeTxData): DecodedCall[] {
  if (
    safeTx.operation === 1 &&
    isAddressEqual(safeTx.to as Address, MULTISEND_CALL_ONLY as Address)
  ) {
    try {
      return decodeMultiSendData(safeTx.data as Hex).map((t) => ({
        to: t.to,
        value: BigInt(t.value),
        data: t.data as Hex,
      }));
    } catch {
      // Fall through — treat as a single opaque call.
    }
  }
  return [
    { to: safeTx.to, value: BigInt(safeTx.value), data: safeTx.data as Hex },
  ];
}

/**
 * Classify a SafeTx. `safeAddress` distinguishes config self-calls; rows
 * without a safeTx payload (legacy 4337) return "unknown" and callers fall
 * back to transfer-shaped behavior.
 */
export function decodeSafeTxKind(
  safeTx: SafeTxData | undefined,
  safeAddress: string
): DecodedKind {
  if (!safeTx) return { kind: "unknown" };

  const calls = unwrapCalls(safeTx);
  if (calls.length === 0) return { kind: "unknown" };

  // Owner/config management: every call targets the Safe itself (the
  // wallet-profile transitions; validated separately by validateTransitionTx).
  if (calls.every((c) => isAddressEqual(c.to as Address, safeAddress as Address))) {
    return { kind: "config" };
  }

  // Single call: native transfer / ERC20 transfer / approval / router / dapp.
  if (calls.length === 1) {
    const call = calls[0];
    if (call.data === "0x" || call.data === "0x00") {
      return {
        kind: "transfer",
        recipient: call.to,
        tokenAddress: null,
        amountWei: call.value,
      };
    }
    const name = routerName(call.to);
    if (name !== null) {
      // Single router call: selling native BNB (value-bearing) or a token
      // approved in an earlier tx — either way the sell token isn't in this
      // payload, so it stays null.
      return {
        kind: "swap",
        router: call.to,
        routerName: name,
        sellTokenAddress: null,
        sellAmountWei: call.value,
        approval: null,
      };
    }
    const erc20 = tryDecodeErc20(call);
    if (erc20?.fn === "transfer") {
      return {
        kind: "transfer",
        recipient: erc20.arg0,
        tokenAddress: call.to,
        amountWei: erc20.amount,
      };
    }
    if (erc20?.fn === "approve") {
      return {
        kind: "approval",
        tokenAddress: call.to,
        spender: erc20.arg0,
        amountWei: erc20.amount,
        infinite: erc20.amount >= INFINITE_THRESHOLD,
      };
    }
    return {
      kind: "dapp-call",
      target: call.to,
      selector: call.data.length >= 10 ? call.data.slice(0, 10) : null,
    };
  }

  // Batch: the canonical swap shape is [ERC20 approve, router call] — an
  // approval whose spender is the router target of a later call.
  const approvals = calls
    .map((c) => ({ call: c, erc20: tryDecodeErc20(c) }))
    .filter((x) => x.erc20?.fn === "approve");
  const routerCall = calls.find((c) => routerName(c.to) !== null);
  if (routerCall) {
    const matching = approvals.find(
      (a) => a.erc20 && isAddressEqual(a.erc20.arg0 as Address, routerCall.to as Address)
    );
    return {
      kind: "swap",
      router: routerCall.to,
      routerName: routerName(routerCall.to),
      sellTokenAddress: matching ? matching.call.to : null,
      sellAmountWei: matching ? matching.erc20!.amount : routerCall.value,
      approval: matching
        ? {
            tokenAddress: matching.call.to,
            spender: matching.erc20!.arg0,
            amountWei: matching.erc20!.amount,
            infinite: matching.erc20!.amount >= INFINITE_THRESHOLD,
          }
        : null,
    };
  }

  // A batch that is entirely ERC20/native transfers is still a transfer for
  // risk purposes only when it has ONE recipient; otherwise it's a dapp-call
  // (multi-recipient batches need their own kind before relaxing this).
  const transfers = calls.map((c) =>
    c.data === "0x"
      ? { recipient: c.to, tokenAddress: null as string | null, amountWei: c.value }
      : (() => {
          const t = tryDecodeErc20(c);
          return t?.fn === "transfer"
            ? { recipient: t.arg0, tokenAddress: c.to as string | null, amountWei: t.amount }
            : null;
        })()
  );
  if (transfers.every((t) => t !== null)) {
    const recipients = new Set(transfers.map((t) => t!.recipient.toLowerCase()));
    if (recipients.size === 1) {
      const first = transfers[0]!;
      return {
        kind: "transfer",
        recipient: first.recipient,
        tokenAddress: first.tokenAddress,
        amountWei: first.amountWei,
      };
    }
  }

  const first = calls.find((c) => c.data !== "0x") ?? calls[0];
  return {
    kind: "dapp-call",
    target: first.to,
    selector: first.data.length >= 10 ? first.data.slice(0, 10) : null,
  };
}

/** Convenience: decode from a stored transaction row. */
export function decodeTxKind(tx: PendingTransaction): DecodedKind {
  return decodeSafeTxKind(tx.safeTx, tx.safeAddress);
}
