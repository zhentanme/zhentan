/**
 * Wallet profiles — client mirror of server/src/lib/safe/profiles.ts.
 *
 *   starter    [embedded]                 t=1  no agent; screening unavailable
 *   guarded    [embedded, agent]          t=2  screening structurally mandatory
 *   protected  [embedded, backup, agent]  t=2  full model: screening + sovereignty
 *   detached   user keys only             t=2  exit state (agent removed)
 *
 * A profile is computed from (owners, threshold, agent membership) — never
 * stored — so it cannot drift from chain truth.
 */
export type WalletProfile = "starter" | "guarded" | "protected";
export type WalletState = WalletProfile | "detached" | "unknown";

export function classifyProfile(
  owners: string[],
  threshold: number,
  agentAddress: string
): WalletState {
  const lower = owners.map((o) => o.toLowerCase());
  const agent = agentAddress.toLowerCase();
  const hasAgent = lower.includes(agent);
  const userKeys = lower.filter((o) => o !== agent).length;

  if (!hasAgent) {
    if (owners.length === 1 && threshold === 1) return "starter";
    if (owners.length >= 2 && threshold === 2) return "detached";
    return "unknown";
  }
  if (userKeys === 1 && threshold === 2) return "guarded";
  if (userKeys === 2 && threshold === 2) return "protected";
  return "unknown";
}
