import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Separate NestJS backend package with its own lint/tsconfig — not part
    // of this Next.js app's source.
    "apps/**",
    // Claude Code worktrees/scratch dirs can contain their own build output
    // (.next, node_modules) that would otherwise get linted as if it were
    // this app's source, producing thousands of false-positive errors.
    ".claude/**",
  ]),
]);

export default eslintConfig;
