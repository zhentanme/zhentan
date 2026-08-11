/**
 * Runtime-local decision store (D2) — append-only JSONL, one line per
 * screening decision this runtime produced. This is the runtime's OWN
 * record: D4's signing authority verifies sign requests against locally
 * recorded decisions, and E3 builds behavioral projections here. Local
 * filesystem only — never the backend's database.
 */
import { appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { RiskResult } from "zhentan-screening";

export interface DecisionRecord {
  jobId: string;
  txId: string;
  txVersion: number;
  safeAddress: string;
  inputHash: string;
  decision: RiskResult;
  evaluatedAt: string;
  recordedAt: string;
}

function storePath(): string {
  return process.env.DECISION_STORE_PATH ?? join(process.cwd(), "data", "decisions.jsonl");
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
