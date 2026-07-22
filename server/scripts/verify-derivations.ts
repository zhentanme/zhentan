/**
 * Standing derivation audit: for every account with a creation snapshot,
 * re-derives the address from the birth certificate and reports any row
 * whose stored safe_address doesn't match. A mismatch here means either a
 * corrupted record or a derivation recipe that drifted — both are
 * ship-stopping, so this should be run after any change to lib/safe/derive.ts.
 *
 * Usage (from server/): npx tsx --env-file=.env scripts/verify-derivations.ts
 */
import { supabase } from "../src/lib/supabase/client.js";
import type { UserDetailsRow } from "../src/lib/supabase/types.js";
import { deriveSafe, type DerivationVersion } from "../src/lib/safe/derive.js";

async function main() {
  const { data, error } = await supabase
    .from("user_details")
    .select("*")
    .not("creation_owners", "is", null)
    .returns<UserDetailsRow[]>();
  if (error) throw error;

  const rows = data ?? [];
  console.log(`Verifying ${rows.length} creation snapshot(s)\n`);

  let mismatches = 0;
  for (const row of rows) {
    try {
      const derived = await deriveSafe(
        row.creation_owners!,
        row.creation_threshold!,
        (row.derivation_version ?? 1) as DerivationVersion,
        row.creation_salt_nonce
      );
      if (derived.address.toLowerCase() === row.safe_address.toLowerCase()) {
        console.log(`✓ ${row.safe_address} (v${row.derivation_version})`);
      } else {
        mismatches++;
        console.error(
          `✗ ${row.safe_address} — snapshot derives ${derived.address} (v${row.derivation_version})`
        );
      }
    } catch (err) {
      mismatches++;
      console.error(`✗ ${row.safe_address} — derivation errored: ${err}`);
    }
  }

  console.log(`\nDone. ok=${rows.length - mismatches} mismatched=${mismatches}`);
  if (mismatches) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
