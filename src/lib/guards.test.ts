// CLAUDE.md rule 9: every exported Server Function and every route handler opens with `requireOwner()`, except the
// sign-in routes, which are public by design and check their own signed cookies. A new public route is added here
// with its reason, and to `isPublicPath`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PUBLIC_ROUTES: Record<string, string> = {
  "src/app/api/auth/login/route.ts": "starts the Google sign-in; reads and writes no data",
  "src/app/api/auth/callback/google/route.ts": "finishes the sign-in; checks its own signed flow cookie",
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const files = walk("src").map((p) => p.split(path.sep).join("/"));
const isServerFunctionFile = (p: string) => /^\s*["']use server["']/.test(readFileSync(p, "utf8"));
const exported = (src: string) => [...src.matchAll(/export\s+async\s+function\s+(\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)];

describe("guards", () => {
  const targets = files.filter((p) => (p.endsWith("/route.ts") && !(p in PUBLIC_ROUTES)) || (p.endsWith(".ts") && isServerFunctionFile(p)));

  it("finds the files it checks", () => {
    expect(targets.length).toBeGreaterThan(0);
  });

  for (const file of targets) {
    it(`${file}: every export opens with requireOwner()`, () => {
      const fns = exported(readFileSync(file, "utf8"));
      expect(fns.length, "no exported async function found").toBeGreaterThan(0);
      for (const [, name, body] of fns) {
        const first = body!.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("//"));
        expect(first, `${name} must start with "const owner = await requireOwner();"`).toMatch(/^const \w+ = await requireOwner\(\);$/);
      }
    });
  }
});
