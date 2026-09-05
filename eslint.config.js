import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // hr/ is a fully vendored, standalone third-party Django app (Horilla -
    // its own README/LICENSE/git history), not part of this Vite/React
    // build. It was never meant to be in ESLint's scope; linting it as
    // TypeScript inflated the reported error count by ~40x (4700+ of ~4900
    // total problems came from its jQuery/vendor JS, not from this app's
    // own code).
    // supabase/functions/ is Deno runtime code (remote esm.sh imports, Deno
    // globals, its own `deno-lint-ignore` comments) linted by `deno lint`,
    // not this Node/TS-ESLint config — it was never meant to be in scope
    // either.
    ignores: ["dist", "hr/**", "supabase/.temp/**", "supabase/functions/**"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
