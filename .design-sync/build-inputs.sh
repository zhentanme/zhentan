#!/usr/bin/env bash
# Rebuilds the two converter inputs for the Zhentan design-system sync:
#   1. client/.ds-dist/ds.mjs  — the pre-bundled scoped components (esbuild)
#   2. client/.ds-styles.css   — statically compiled Tailwind v4 + fonts
# Run from the repo root, after the converter deps are staged in .ds-sync/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NODE_PATH="$ROOT/.ds-sync/node_modules" node .design-sync/prebuild.mjs
( cd client && "$ROOT/.ds-sync/node_modules/.bin/tailwindcss" -i src/app/globals.css -o "$ROOT/.design-sync/dist/tw.css" )
{
  echo "@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');"
  echo ":root{--font-manrope:'Manrope',ui-sans-serif,system-ui,sans-serif;--font-jetbrains:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;}"
  cat .design-sync/dist/tw.css
} > client/.ds-styles.css
echo "OK: client/.ds-dist/ds.mjs + client/.ds-styles.css"
