import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAgentsMd } from "../src/parsers/agents-md.ts";
import { parseCursorMdc } from "../src/parsers/cursor-mdc.ts";
import { renderAgentsMd } from "../src/renderers/agents-md.ts";

const FIX = (p: string) => resolve(import.meta.dir, "fixtures", p);
const read = (p: string) => readFileSync(p, "utf8");

describe("renderAgentsMd", () => {
  test("single rule emits body_md verbatim into AGENTS.md", async () => {
    const path = FIX("agents-md/basic.md");
    const bundle = await parseAgentsMd({ path, content: read(path) });
    const out = renderAgentsMd(bundle);
    expect(Object.keys(out.files)).toEqual(["AGENTS.md"]);
    const content = out.files["AGENTS.md"]!;
    expect(content).toContain("# Project Conventions");
    expect(content.endsWith("\n")).toBe(true);
  });

  test("empty bundle emits empty AGENTS.md", () => {
    const out = renderAgentsMd({
      rules: [],
      config_extras: {},
      detected_formats: [],
      warnings: [],
    });
    expect(out.files["AGENTS.md"]).toBe("");
  });

  test("multi-rule emits H2 sections with activation preambles", async () => {
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
    const out = renderAgentsMd(merged);
    const content = out.files["AGENTS.md"]!;

    expect(content).toContain("## always");
    expect(content).toContain("## glob");
    expect(content).toContain("*Apply when editing files matching: src/services/**/*.ts*");
    expect(out.warnings.some((w) => w.startsWith("W042"))).toBe(true);
  });
});
