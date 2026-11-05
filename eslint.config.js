import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dev-dist", "docs/design/boards", "data"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Rule 2 (CLAUDE.md): validators and play loops stay pure.
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["src/games/**/*.ts"],
    ignores: ["src/games/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["dexie", "react", "react-dom", "@/core/*", "@/components/*", "@/app/*"] },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
);
