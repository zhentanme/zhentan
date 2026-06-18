// Pre-bundle the scoped components from raw .tsx with JSX=automatic and the
// @/ path alias. React / react-dom / jsx-runtime are aliased to tiny
// window.React shims and bundled in — so the output has ZERO external imports
// (no bare `react/jsx-runtime` import or require for the converter's IIFE pass
// to choke on). The converter then just wraps this plain JS into the
// window.ZhentanUI IIFE.
import { build } from "esbuild";
import { resolve } from "node:path";

const CLIENT = resolve("client");
const shim = (p) => resolve(".design-sync/shims", p);

await build({
  entryPoints: [resolve(".design-sync/ds-entry.tsx")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: resolve("client/.ds-dist/ds.mjs"),
  alias: {
    react: shim("react.cjs"),
    "react/jsx-runtime": shim("jsx-runtime.cjs"),
    "react/jsx-dev-runtime": shim("jsx-runtime.cjs"),
    "react-dom": shim("react-dom.cjs"),
    "react-dom/client": shim("react-dom.cjs"),
  },
  jsx: "automatic",
  jsxImportSource: "react",
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "var process=(typeof globalThis!=='undefined'&&globalThis.process)||{env:{NODE_ENV:'development'}};" },
  loader: { ".svg": "dataurl", ".png": "dataurl" },
  absWorkingDir: CLIENT,
  tsconfigRaw: JSON.stringify({
    compilerOptions: { jsx: "react-jsx", baseUrl: ".", paths: { "@/*": ["./src/*"] } },
  }),
  logLevel: "info",
});
console.log("OK -> client/.ds-dist/ds.mjs");
