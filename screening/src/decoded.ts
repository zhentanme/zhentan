/**
 * Decoded-calldata shapes consumed by the risk engine. The DECODER itself
 * (viem/protocol-kit calldata parsing) stays in the backend — the runtime
 * receives `decoded` pre-computed in the job payload, so these are types
 * only and this package stays dependency-free.
 */

export interface DecodedCall {
  to: string;
  value: bigint;
  data: `0x${string}`;
}

export type DecodedKind =
  | {
      kind: "transfer";
      recipient: string;
      /** null = native BNB */
      tokenAddress: string | null;
      amountWei: bigint;
    }
  | {
      kind: "swap";
      router: string;
      /** Router label from the allowlist, null when the router is unknown. */
      routerName: string | null;
      /** null = selling native BNB (value-bearing router call). */
      sellTokenAddress: string | null;
      sellAmountWei: bigint;
      approval: {
        tokenAddress: string;
        spender: string;
        amountWei: bigint;
        infinite: boolean;
      } | null;
    }
  | {
      kind: "approval";
      tokenAddress: string;
      spender: string;
      amountWei: bigint;
      infinite: boolean;
    }
  | {
      kind: "config";
      /**
       * Present when the backend validated the calls as a wallet-profile
       * transition (validateTransitionTx: whitelisted owner-management
       * self-calls ending in a managed state). The engine auto-approves
       * validated transitions; unvalidated config stays review-worthy.
       */
      transition?: { endState: string; validated: true };
    }
  | { kind: "dapp-call"; target: string; selector: string | null }
  | { kind: "unknown" };
