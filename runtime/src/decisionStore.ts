/**
 * Runtime-local decision store (D2) — append-only JSONL, one line per
 * screening decision this runtime produced. This is the runtime's OWN
 * record: D4's signing authority verifies sign requests against locally
 * recorded decisions, and E3 builds behavioral projections here. Local
 * filesystem only — never the backend's database.
 */
import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import type { RiskResult } from "zhentan-screening";

export interface DecisionRecord {
  jobId: string;
  txId: string;
  txVersion: number;
  safeAddress: string;
  inputHash: string;
  /** SafeTx hash computed BY THIS RUNTIME from the screened fields — the
   *  content binding the signing authority verifies (D4). Null for
   *  non-SafeTx screening inputs. */
  safeTxHash?: string | null;
  decision: RiskResult;
  evaluatedAt: string;
  recordedAt: string;
}

function storePath(): string {
  return process.env.DECISION_STORE_PATH ?? join(process.cwd(), "data", "decisions.jsonl");
}

/**
 * Look up the LATEST decision this runtime recorded for a transaction (D4):
 * the signing authority verifies against its OWN record — a decision
 * claimed in a sign-job payload is not evidence. Returns null when this
 * runtime never screened the transaction (→ refuse and force a re-screen).
 */
export function findDecision(txId: string): DecisionRecord | null {
  try {
    const lines = readFileSync(storePath(), "utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const record = JSON.parse(line) as DecisionRecord;
        if (record.txId === txId) return record;
      } catch {
        /* skip corrupt line */
      }
    }
    return null;
  } catch {
    return null; // no store file yet = no decisions recorded
  }
}

let dirReady = false;

/** Best-effort append — a store failure must never fail the job. */
export function recordDecision(record: DecisionRecord): void {
  try {
    const path = storePath();
    if (!dirReady) {
      mkdirSync(dirname(path), { recursive: true });
      dirReady = true;
    }
    appendFileSync(path, `${JSON.stringify(record)}\n`);
  } catch (err) {
    console.error("Decision store append failed:", err instanceof Error ? err.message : err);
  }
}
