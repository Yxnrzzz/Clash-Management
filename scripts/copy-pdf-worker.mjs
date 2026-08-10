// Copies pdf.js's worker into public/ so it's served as a plain static
// file (/pdf.worker.min.mjs) at a stable path in dev, build, and Docker —
// no bundler-specific worker resolution (new URL(..., import.meta.url) is
// fragile across Turbopack dev vs `next build`). Run automatically via the
// predev/prebuild npm hooks below; the copy itself is gitignored since it's
// regenerated from node_modules on every install.
import { copyFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const dest = new URL("../public/pdf.worker.min.mjs", import.meta.url);

if (!existsSync(source)) {
  throw new Error(`pdf.worker.min.mjs not found at ${source} — is pdfjs-dist installed?`);
}
copyFileSync(source, dest);
console.log(`Copied pdf.js worker to ${dest.pathname}`);
