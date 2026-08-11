/**
 * Committed negative fixtures for the boundary guards (C2 review): the
 * enforcement itself is under test, so a future loosening of a rule fails
 * CI instead of regressing silently. Each fixture is a REALISTIC bypass —
 * including the exact relative-path forms that existed before C1.
 *
 * Lives in scripts/ (outside src/) so the guard's scan area never contains
 * its own fixture strings.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "lint-layering.sh");

function runGuard(files: Record<string, string>): { ok: boolean; out: string } {
  const root = mkdtempSync(join(tmpdir(), "layering-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    try {
      const out = execFileSync("sh", [SCRIPT, root], { encoding: "utf8" });
      return { ok: true, out };
    } catch (err) {
      const e = err as { status?: number; stdout?: string };
      return { ok: false, out: e.stdout ?? "" };
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const CLEAN = {
  "agent/index.ts": 'import { getSigningAuthority } from "../lib/agent/signer.js";\n',
  "agent/evaluate.ts": 'export { evaluateTransaction } from "zhentan-screening/evaluate";\n',
  "lib/supabase/agentData.ts":
    'import type { PatternsFile } from "zhentan-screening/risk";\n',
  "lib/agent/signer.ts": "const x = 1;\n",
  "lib/execution/execute.ts": 'import { getSigningAuthority } from "../../agent/index.js";\n',
  "lib/runtime/jobsPolicy.ts": 'import { computeInputHash } from "zhentan-screening/protocol";\n',
};

describe("lint-layering guards", () => {
  it("passes a clean tree (sanctioned imports only)", () => {
    const r = runGuard(CLEAN);
    expect(r.out).toContain("layering ok");
    expect(r.ok).toBe(true);
  });

  it("rule 1: catches lib/ importing routes/ at any depth", () => {
    const r = runGuard({
      ...CLEAN,
      "lib/safe/bad.ts": 'import { x } from "../../routes/execute.js";\n',
    });
    expect(r.ok).toBe(false);
    expect(r.out).toContain("RULE 1 VIOLATION");
  });

  it("rule 2: catches raw signHash( outside the signer module", () => {
    const r = runGuard({
      ...CLEAN,
      "routes/bad.ts": "const y = await kit.signHash(h);\n",
    });
    expect(r.ok).toBe(false);
    expect(r.out).toContain("RULE 2 VIOLATION");
  });

  it("rule 3: catches the pre-C1 relative form ../agent/signer.js from inside lib/", () => {
    const r = runGuard({
      ...CLEAN,
      "lib/execution/bad.ts": 'import { getSigningAuthority } from "../agent/signer.js";\n',
    });
    expect(r.ok).toBe(false);
    expect(r.out).toContain("RULE 3 VIOLATION");
  });

  it("rule 3: catches the lib-anchored form from routes/", () => {
    const r = runGuard({
      ...CLEAN,
      "routes/bad.ts": 'import { getSigningAuthority } from "../lib/agent/signer.js";\n',
    });
    expect(r.ok).toBe(false);
    expect(r.out).toContain("RULE 3 VIOLATION");
  });

  it("rule 4: catches ./supabase/agentData.js from inside lib/", () => {
    const r = runGuard({
      ...CLEAN,
      "lib/bad.ts": 'import { getPatternsForSafe } from "./supabase/agentData.js";\n',
    });
    expect(r.ok).toBe(false);
    expect(r.out).toContain("RULE 4 VIOLATION");
  });

  it("rule 4: catches a ./agentData.js re-export from lib/supabase/index.ts", () => {
    const r = runGuard({
      ...CLEAN,
      "lib/supabase/index.ts": 'export * from "./agentData.js";\n',
    });
    expect(r.ok).toBe(false);
    expect(r.out).toContain("RULE 4 VIOLATION");
  });

  it("rule 5: catches a route importing the risk engine directly", () => {
    const r = runGuard({
      ...CLEAN,
      "routes/bad.ts": 'import { analyzeRisk } from "zhentan-screening/risk";\n',
    });
    expect(r.ok).toBe(false);
    expect(r.out).toContain("RULE 5 VIOLATION");
  });

  it("rule 6: catches inline evaluation returning to a route", () => {
    const r = runGuard({
      ...CLEAN,
      "routes/bad.ts": 'const risk = evaluateTransaction(tx, patterns, decoded);\n',
    });
    expect(r.ok).toBe(false);
    expect(r.out).toContain("RULE 6 VIOLATION");
  });

  it("rule 6: evaluateRequest in requests.ts stays permitted (pre-IP)", () => {
    const r = runGuard({
      ...CLEAN,
      "routes/requests.ts": 'const risk = evaluateRequest(tx, patterns);\n',
    });
    expect(r.out).toContain("layering ok");
    expect(r.ok).toBe(true);
  });

  it("rule 5: catches evaluate imported around the agent surface", () => {
    const r = runGuard({
      ...CLEAN,
      "lib/bad.ts": 'import { evaluateTransaction } from "zhentan-screening/evaluate";\n',
    });
    expect(r.ok).toBe(false);
    expect(r.out).toContain("RULE 5 VIOLATION");
  });
});
