// Layer 2 lossless round-trip — Day 2 additions.
// Pairs claimed lossless in the Step-1 truth table:
//   claude-md ↔ claude-md     (single rule, no @-imports)
//   gemini-md ↔ gemini-md
//   cursor-mdc ↔ cursor-mdc   (one .mdc → IR → one .mdc)
//   windsurf-mdc ↔ windsurf-mdc
//   conventions-md ↔ conventions-md

import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseClaudeMd } from "../src/parsers/claude-md.ts";
import { parseGeminiMd } from "../src/parsers/gemini-md.ts";
import { parseCursorMdc } from "../src/parsers/cursor-mdc.ts";
import { parseWindsurfMdc } from "../src/parsers/windsurf-mdc.ts";
import { parseConventionsMd } from "../src/parsers/conventions-md.ts";

import { renderClaudeMd } from "../src/renderers/claude-md.ts";
import { renderGeminiMd } from "../src/renderers/gemini-md.ts";
import { renderCursorMdc } from "../src/renderers/cursor-mdc.ts";
import { renderWindsurfMdc } from "../src/renderers/windsurf-mdc.ts";
import { renderConventionsMd } from "../src/renderers/conventions-md.ts";

import { canonicalizeMarkdown } from "../src/canonicalize.ts";

const FIX = (p: string) => resolve(import.meta.dir, "fixtures", p);
const read = (p: string) => readFileSync(p, "utf8");

describe("round-trip: claude-md ↔ claude-md (no imports)", () => {
  test("basic.md identical after roundtrip", async () => {
    const path = FIX("claude-md/basic.md");
    const original = read(path);
    const bundle = await parseClaudeMd({ path, content: original });
    const out = renderClaudeMd(bundle);
    expect(out.files["CLAUDE.md"]).toBe(canonicalizeMarkdown(original));
  });
});

describe("round-trip: gemini-md ↔ gemini-md", () => {
  test("basic.md identical after roundtrip", async () => {
    const path = FIX("gemini-md/basic.md");
    const original = read(path);
    const bundle = await parseGeminiMd({ path, content: original });
    const out = renderGeminiMd(bundle);
    expect(out.files["GEMINI.md"]).toBe(canonicalizeMarkdown(original));
  });
});

describe("round-trip: cursor-mdc ↔ cursor-mdc", () => {
  // The frontmatter YAML emit may key-reorder vs the input, but the parsed activation
  // and body_md must be invariant. We check the IR shape, not the file bytes.
  test.each([
    ["always.mdc"],
    ["glob.mdc"],
    ["manual.mdc"],
  ])("%s preserves activation + body across roundtrip", async (file) => {
    const path = FIX(`cursor-mdc/${file}`);
    const bundle1 = await parseCursorMdc({ path, content: read(path) });
    const out = renderCursorMdc(bundle1);
    const rendered = Object.values(out.files)[0]!;
    const bundle2 = await parseCursorMdc({ path, content: rendered });
    expect(bundle2.rules[0]!.activation).toEqual(bundle1.rules[0]!.activation);
    expect(bundle2.rules[0]!.body_md).toBe(bundle1.rules[0]!.body_md);
  });
});

describe("round-trip: windsurf-mdc ↔ windsurf-mdc", () => {
  test.each([["always.md"], ["glob.md"]])(
    "%s preserves activation + body",
    async (file) => {
      const path = FIX(`windsurf-mdc/${file}`);
      const bundle1 = await parseWindsurfMdc({ path, content: read(path) });
      const out = renderWindsurfMdc(bundle1);
      const rendered = Object.values(out.files)[0]!;
      const bundle2 = await parseWindsurfMdc({ path, content: rendered });
      expect(bundle2.rules[0]!.activation).toEqual(bundle1.rules[0]!.activation);
      expect(bundle2.rules[0]!.body_md).toBe(bundle1.rules[0]!.body_md);
    },
  );
});

describe("round-trip: conventions-md ↔ conventions-md", () => {
  test("basic.md byte-identical", async () => {
    const path = FIX("conventions-md/basic.md");
    const original = read(path);
    const bundle = await parseConventionsMd({ path, content: original });
    const out = renderConventionsMd(bundle);
    expect(out.files["CONVENTIONS.md"]).toBe(canonicalizeMarkdown(original));
  });
});
