import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseAgentsMd } from "../src/parsers/agents-md.ts";
import { parseCursorMdc } from "../src/parsers/cursor-mdc.ts";
import { parseConventionsMd } from "../src/parsers/conventions-md.ts";

import { renderClaudeMd } from "../src/renderers/claude-md.ts";
import { renderGeminiMd } from "../src/renderers/gemini-md.ts";
import { renderCursorMdc } from "../src/renderers/cursor-mdc.ts";
import { renderWindsurfMdc } from "../src/renderers/windsurf-mdc.ts";
import { renderClineDir } from "../src/renderers/cline-dir.ts";
import { renderConventionsMd } from "../src/renderers/conventions-md.ts";

const FIX = (p: string) => resolve(import.meta.dir, "fixtures", p);
const read = (p: string) => readFileSync(p, "utf8");

describe("renderClaudeMd", () => {
  test("single-rule = body_md verbatim into CLAUDE.md", async () => {
    const path = FIX("agents-md/basic.md");
    const bundle = await parseAgentsMd({ path, content: read(path) });
    const out = renderClaudeMd(bundle);
    expect(Object.keys(out.files)).toEqual(["CLAUDE.md"]);
    expect(out.files["CLAUDE.md"]).toContain("# Project Conventions");
  });
});

describe("renderGeminiMd", () => {
  test("single-rule emits to GEMINI.md", async () => {
    const path = FIX("agents-md/basic.md");
    const bundle = await parseAgentsMd({ path, content: read(path) });
    const out = renderGeminiMd(bundle);
    expect(Object.keys(out.files)).toEqual(["GEMINI.md"]);
  });
});

describe("renderCursorMdc", () => {
  test("emits one .mdc per rule with frontmatter from activation", async () => {
    const r1 = await parseCursorMdc({
      path: ".cursor/rules/always.mdc",
      content: read(FIX("cursor-mdc/always.mdc")),
    });
    const r2 = await parseCursorMdc({
      path: ".cursor/rules/glob.mdc",
      content: read(FIX("cursor-mdc/glob.mdc")),
    });
    const merged = {
      rules: [...r1.rules, ...r2.rules],
      config_extras: {},
      detected_formats: ["cursor-mdc" as const],
      warnings: [],
    };
    const out = renderCursorMdc(merged);
    expect(Object.keys(out.files).sort()).toEqual([".cursor/rules/always.mdc", ".cursor/rules/glob.mdc"]);
    expect(out.files[".cursor/rules/always.mdc"]!).toContain("alwaysApply: true");
    expect(out.files[".cursor/rules/glob.mdc"]!).toContain("globs: src/services/**/*.ts");
    expect(out.files[".cursor/rules/glob.mdc"]!).toContain("alwaysApply: false");
  });
});

describe("renderWindsurfMdc", () => {
  test("emits .windsurf/rules/*.md with trigger field", async () => {
    const r = await parseCursorMdc({
      path: ".cursor/rules/always.mdc",
      content: read(FIX("cursor-mdc/always.mdc")),
    });
    const out = renderWindsurfMdc(r);
    const path = Object.keys(out.files)[0]!;
    expect(path.startsWith(".windsurf/rules/")).toBe(true);
    expect(out.files[path]).toContain("trigger: always_on");
  });

  test("emits W003 when rule body is huge", async () => {
    const big = "z".repeat(13_500);
    const bundle = {
      rules: [
        {
          id: "deadbeef",
          source: { format: "agents-md" as const, path: "AGENTS.md", scope: "workspace" as const },
          activation: { kind: "always" as const },
          body_md: big,
          precedence_path: [],
          metadata: { char_count: big.length, has_code_blocks: false, contains_imports: false },
          warnings: [],
        },
      ],
      config_extras: {},
      detected_formats: ["agents-md" as const],
      warnings: [],
    };
    const out = renderWindsurfMdc(bundle);
    expect(out.warnings.some((w) => w.startsWith("W003"))).toBe(true);
  });
});

describe("renderClineDir", () => {
  test("emits numbered files preserving ordering_hint", async () => {
    const r1 = await parseConventionsMd({ path: "a.md", content: "# coding\n\n- ts\n" });
    const r2 = await parseConventionsMd({ path: "b.md", content: "# testing\n\n- bun\n" });
    const merged = {
      rules: [...r1.rules, ...r2.rules],
      config_extras: {},
      detected_formats: ["conventions-md" as const],
      warnings: [],
    };
    const out = renderClineDir(merged);
    const paths = Object.keys(out.files).sort();
    expect(paths.length).toBe(2);
    expect(paths.every((p) => p.startsWith(".clinerules/"))).toBe(true);
    expect(paths[0]).toMatch(/^\.clinerules\/01-/);
    expect(paths[1]).toMatch(/^\.clinerules\/02-/);
  });

  test("disabled rule (toggle_state=false) emits paths: []", () => {
    const bundle = {
      rules: [
        {
          id: "abc",
          source: { format: "cline-dir" as const, path: "x.md", scope: "workspace" as const },
          activation: { kind: "always" as const },
          body_md: "# disabled\n",
          precedence_path: [],
          toggle_state: false,
          metadata: { char_count: 0, has_code_blocks: false, contains_imports: false },
          warnings: [],
        },
      ],
      config_extras: {},
      detected_formats: ["cline-dir" as const],
      warnings: [],
    };
    const out = renderClineDir(bundle);
    const content = Object.values(out.files)[0]!;
    expect(content).toContain("paths: []");
  });
});

describe("renderConventionsMd", () => {
  test("emits CONVENTIONS.md + aider_conf snippet", async () => {
    const path = FIX("conventions-md/basic.md");
    const bundle = await parseConventionsMd({ path, content: read(path) });
    const out = renderConventionsMd(bundle);
    expect(out.files["CONVENTIONS.md"]).toContain("Use httpx");
    expect(out.aider_conf_snippet["read"]).toEqual(["CONVENTIONS.md"]);
    expect(out.aider_conf_snippet["cache-prompts"]).toBe(true);
  });
});
