// Keeps the publicly served skill file (zhentan.me/SKILL.md) in lockstep with
// the canonical agent/SKILL.md — a hand-maintained fork here once drifted into
// documenting the retired curl + bearer-token flow.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "agent", "SKILL.md");
const dest = join(here, "..", "public", "SKILL.md");
copyFileSync(src, dest);
console.log("Synced agent/SKILL.md -> client/public/SKILL.md");
