# Zhentan Design System — sync notes

## Shape & pipeline
- Repo is a **Next.js app**, not a packaged component library. No `dist/`, no Storybook.
- Components are **pre-bundled** by `.ds-sync/prebuild.mjs` (esbuild) from raw `.tsx`:
  entry `.design-sync/ds-entry.tsx` (re-exports only the scoped brand/UI set) →
  `client/.ds-dist/ds.mjs`. The converter then runs with `--entry client/.ds-dist/ds.mjs`
  (so `PKG_DIR` resolves to `client/`).
- Prebuild MUST: jsx=automatic; alias react/react-dom/jsx-runtime → `.design-sync/shims/*.cjs`
  (window.React) and bundle them in (NO external react — a stray CJS `require("react/jsx-runtime")`
  becomes a "Dynamic require not supported" throw in the converter's IIFE → bundle fails to load →
  every card shows "⚠ no PascalCase exports"); `define` + `banner` for `process` (next/link, pulled
  in via BrandMark.tsx, references `process.env.__NEXT_*`).
- CSS is a **statically compiled Tailwind v4** stylesheet: `client/.ds-styles.css` =
  Google-Fonts @import + font var defs + `@tailwindcss/cli -i client/src/app/globals.css`.
  Regenerate it on re-sync (utilities are otherwise generated on-demand and won't ship).
- Fonts (Manrope/JetBrains) load via remote @import; `runtimeFontPrefixes` suppresses [FONT_MISSING].

## Verification
- User declined the playwright/chromium download. Render-checked instead with the system
  `google-chrome --headless --dump-dom` against a local `python3 -m http.server -d ds-bundle`.

## Re-sync risks
- Rebuild order: `node .ds-sync/prebuild.mjs` → recompile `client/.ds-styles.css` → converter.
- If the brand/UI component APIs change, update `dtsPropsFor` in config (hand-written, no dist .d.ts).
