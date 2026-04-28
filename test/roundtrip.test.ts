// Layer 2: lossless round-trip tests.
// Spec: parse(F, X) → render(F, _) → out  must equal canonicalize(X).
// Day 1 only covers agents-md ↔ agents-md (the trivially lossless case).
// Other lossless pairs (claude-md ↔ claude-md, cursor-mdc ↔ cursor-mdc, etc.)
// land in Day 2 once their renderers exist.

import { test, expect, describe } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseAgentsMd } from "../src/parsers/agents-md.ts";
import { renderAgentsMd } from "../src/renderers/agents-md.ts";
import { canonicalizeMarkdown } from "../src/canonicalize.ts";

const FIX = (p: string) => resolve(import.meta.dir, "fixtures", p);
const read = (p: string) => readFileSync(p, "utf8");

describe("round-trip: agents-md ↔ agents-md", () => {
  const dir = FIX("agents-md");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    test(`${file}: render(parse(X)) === canonicalize(X)`, async () => {
      const path = resolve(dir, file);
      const original = read(path);
      const bundle = await parseAgentsMd({ path, content: original });
      const out = renderAgentsMd(bundle);
      const rendered = out.files["AGENTS.md"]!;

      expect(rendered).toBe(canonicalizeMarkdown(original));
    });
  }

  test("synthetic edge cases", async () => {
    const cases = [
      "# Just one heading\n",
      "trailing whitespace   \nlines should be trimmed\t\n",
      "\n\n\n# leading blank lines\n\n\nbody\n\n\n",
      "no trailing newline at end",
      "# H1\n\n## H2\n\n- list\n- items\n\n```ts\nconst x = 1;\n```\n",
    ];
    for (const original of cases) {
      const bundle = await parseAgentsMd({ path: "AGENTS.md", content: original });
      const out = renderAgentsMd(bundle);
      const rendered = out.files["AGENTS.md"]!;
      expect(rendered).toBe(canonicalizeMarkdown(original));
    }
  });
});
