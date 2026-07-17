/**
 * Verification-driven backfill of creation snapshots for accounts created
 * before the birth-certificate columns existed.
 *
 * For each user_details row without creation_owners, tries candidate
 * recipes and writes a snapshot ONLY when the re-derived address matches
 * the stored safe_address exactly. Anything that doesn't verify is
 * reported for manual review — addresses are never written on faith.
 *
 * Usage (from server/):
 *   npx tsx --env-file=.env scripts/backfill-creation-snapshots.ts          # dry run
 *   npx tsx --env-file=.env scripts/backfill-creation-snapshots.ts --write  # persist
 */
import { privateKeyToAccount } from "viem/accounts";

import { supabase } from "../src/lib/supabase/client.js";
import { setCreationSnapshot } from "../src/lib/supabase/db.js";
import type { UserDetailsRow } from "../src/lib/supabase/types.js";
import {
  deriveSafe,
  DEFAULT_SALT_NONCE,
  DERIVATION_V1_4337,
  DERIVATION_V2_VANILLA,
  type DerivationVersion,
} from "../src/lib/safe/derive.js";

const WRITE = process.argv.includes("--write");

interface Candidate {
  label: string;
  owners: string[];
  threshold: number;
  version: DerivationVersion;
}

function candidatesFor(row: UserDetailsRow, agent: string): Candidate[] {
  const out: Candidate[] = [];
  const signer = row.signer_address;
  const external = row.external_wallet_address;
  const version = (row.derivation_version ?? DERIVATION_V1_4337) as DerivationVersion;

  // (a) Current live set — correct for any account that never changed owners.
  if (row.safe_owners?.length && row.safe_threshold) {
    out.push({
      label: "current owners/threshold",
      owners: row.safe_owners,
      threshold: row.safe_threshold,
      version,
    });
  }
  // (b) Legacy v1 2-of-2 pair — correct for pre-refactor accounts that were
  //     later upgraded (live set no longer matches birth).
  if (signer) {
    out.push({
      label: "legacy v1 [signer, agent] t=2",
      owners: [signer, agent],
      threshold: 2,
      version: DERIVATION_V1_4337,
    });
  }
  // (c) Canonical 3-owner set under both versions — covers accounts created
  //     2-of-3 whose rows predate stored owner sets.
  if (signer && external) {
    for (const v of [DERIVATION_V2_VANILLA, DERIVATION_V1_4337] as const) {
      out.push({
        label: `canonical 3-owner v${v}`,
        owners: [signer, external, agent],
        threshold: 2,
        version: v,
      });
    }
  }
  return out;
}

async function main() {
  const agentPk = process.env.AGENT_PRIVATE_KEY;
  if (!agentPk) throw new Error("AGENT_PRIVATE_KEY required (agent address is a derivation input)");
  const agent = privateKeyToAccount(agentPk as `0x${string}`).address;

  const { data, error } = await supabase
    .from("user_details")
    .select("*")
    .is("creation_owners", null)
    .returns<UserDetailsRow[]>();
  if (error) throw error;

  const rows = data ?? [];
  console.log(`${rows.length} account(s) without a creation snapshot${WRITE ? "" : " (DRY RUN)"}\n`);

  let written = 0;
  const unresolved: string[] = [];

  for (const row of rows) {
    let matched: Candidate | null = null;
    for (const candidate of candidatesFor(row, agent)) {
      try {
        const derived = await deriveSafe(
          candidate.owners,
          candidate.threshold,
          candidate.version,
          DEFAULT_SALT_NONCE
        );
        if (derived.address.toLowerCase() === row.safe_address.toLowerCase()) {
          matched = candidate;
          break;
        }
      } catch (err) {
        console.warn(`  ${row.safe_address} candidate "${candidate.label}" errored: ${err}`);
      }
    }

    if (!matched) {
      unresolved.push(row.safe_address);
      console.log(`✗ ${row.safe_address} — no candidate recipe reproduces the address`);
      continue;
    }

    console.log(`✓ ${row.safe_address} — ${matched.label}`);
    if (WRITE) {
      await setCreationSnapshot(row.safe_address, {
        owners: matched.owners,
        threshold: matched.threshold,
        saltNonce: DEFAULT_SALT_NONCE,
        derivationVersion: matched.version,
      });
      written++;
    }
  }

  console.log(
    `\nDone. verified=${rows.length - unresolved.length} written=${written} unresolved=${unresolved.length}`
  );
  if (unresolved.length) {
    console.log("Manual review needed for:");
    for (const a of unresolved) console.log(`  ${a}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
