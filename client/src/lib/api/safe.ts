import type { ApiFetchFn } from "./client";

export interface DeployResult {
  success: boolean;
  safeAddress: string;
  alreadyDeployed?: boolean;
  txHash?: string;
}

export function safeApi(req: ApiFetchFn) {
  return {
    /** Eagerly deploy the 2-of-3 Safe (agent pays gas). Idempotent. */
    async deploy(ownerAddresses: string[]): Promise<DeployResult> {
      const res = await req("/safe/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerAddresses }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Safe deploy failed");
      }
      return data as DeployResult;
    },

    /** Next unused Safe nonce (Transaction Service aware). */
    async nonce(safeAddress: string): Promise<number> {
      const res = await req(`/safe/nonce?safe=${safeAddress}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to fetch Safe nonce");
      }
      const data = (await res.json()) as { nonce: number };
      return data.nonce;
    },
  };
}
