import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "docs/design/boards/**", "data/**", "drizzle/**", ".claude/worktrees/**"]),
  {
    // CLAUDE.md rule 2: validators and play loops stay pure — no database, React, Next or app code.
    files: ["src/games/**/*.ts"],
    ignores: ["src/games/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "next", "next/*"], message: "Game modules are pure (CLAUDE.md rule 2)." },
            { group: ["drizzle-orm", "drizzle-orm/*", "postgres", "@neondatabase/*"], message: "Game modules are pure (CLAUDE.md rule 2)." },
            { group: ["@/db", "@/db/*", "@/lib/*", "@/components/*", "@/app/*"], message: "Game modules are pure (CLAUDE.md rule 2)." },
          ],
        },
      ],
    },
  },
]);
