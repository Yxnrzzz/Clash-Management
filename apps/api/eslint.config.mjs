// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "prisma/migrations/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: "commonjs",
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // NestJS/Prisma code leans on decorators and Prisma's untyped raw-query
      // and generated-client escape hatches, which type-checked lint rules
      // can't fully see through. Downgrade to warnings instead of disabling
      // outright so genuinely unsafe code elsewhere still gets flagged.
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      // Nest constructor-injection params are conventionally unused directly
      // (accessed via `this.foo`) — only flag genuinely unused locals.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Matches "*.spec.ts" and "*.e2e-spec.ts" alike — a plain "**/*.spec.ts"
    // glob requires a literal dot right before "spec", which "e2e-spec.ts"
    // doesn't have (hyphen, not dot), so e2e specs were silently excluded
    // from this relaxation. Same class of bug as the Jest testRegex fix in
    // package.json — both defaults quietly never matched this file's name.
    files: ["**/*.spec.ts", "**/*.e2e-spec.ts"],
    rules: {
      // Test doubles/mocks routinely need loose typing.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // `expect(mockObj.method).toHaveBeenCalledWith(...)` on a jest.fn()
      // mock is the standard Nest testing pattern and reads as an unbound
      // method reference to the type checker, even though it's never
      // invoked detached from `mockObj`. False positive, not a real bug.
      "@typescript-eslint/unbound-method": "off",
      // Jest's `as jest.Mocked<Foo>` casts on DI-provided mocks often look
      // "unnecessary" to the checker because the mock object structurally
      // matches, but they document intent and keep mocks type-checked if
      // the real interface changes shape.
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },
);
