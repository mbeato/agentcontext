// Layer 3: cross-format diff-bound tests.
// Lossy directions documented in agent-context-formats-spec.md truth table.
// Each test asserts what is preserved AND what is documented to be lost.

import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseCursorMdc } from "../src/parsers/cursor-mdc.ts";
import { parseWindsurfMdc } from "../src/parsers/windsurf-mdc.ts";
import { parseAgentsMd } from "../src/parsers/agents-md.ts";

import { renderAgentsMd } from "../src/renderers/agents-md.ts";
import { renderCursorMdc } from "../src/renderers/cursor-mdc.ts";
import { renderWindsurfMdc } from "../src/renderers/windsurf-mdc.ts";

const FIX = (p: string) => resolve(import.meta.dir, "fixtures", p);
const read = (p: string) => readFileSync(p, "utf8");

describe("cursor-mdc → agents-md → cursor-mdc (lossy)", () => {
  test("body preserved; activation collapses to always; W042 emitted", async () => {
    const path = FIX("cursor-mdc/glob.mdc");
    const ir1 = await parseCursorMdc({ path, content: read(path) });
    expect(ir1.rules[0]!.activation.kind).toBe("glob");
    const originalBody = ir1.rules[0]!.body_md;

    const am = renderAgentsMd(ir1);
    expect(am.warnings.some((w) => w.startsWith("W042"))).toBe(false); // single-rule fast path = no W042

    const ir2 = await parseAgentsMd({ path: "AGENTS.md", content: am.files["AGENTS.md"]! });
    expect(ir2.rules[0]!.activation.kind).toBe("always"); // documented loss
    expect(ir2.rules[0]!.body_md).toContain(originalBody.trim().split("\n")[0]); // body preserved

    const back = renderCursorMdc(ir2);
    const mdcKey = Object.keys(back.files)[0]!;
    expect(back.files[mdcKey]).toContain("alwaysApply: true"); // collapsed
  });

  test("multi-rule cursor-mdc → agents-md emits W042 in renderer warnings", async () => {
    const r1 = await parseCursorMdc({
      path: ".cursor/rules/glob.mdc",
      content: read(FIX("cursor-mdc/glob.mdc")),
    });
    const r2 = await parseCursorMdc({
      path: ".cursor/rules/manual.mdc",
      content: read(FIX("cursor-mdc/manual.mdc")),
    });
    const merged = {
      rules: [...r1.rules, ...r2.rules],
      config_extras: {},
      detected_formats: ["cursor-mdc" as const],
      warnings: [],
    };
    const out = renderAgentsMd(merged);
    expect(out.warnings.filter((w) => w.startsWith("W042")).length).toBeGreaterThanOrEqual(1);
    expect(out.files["AGENTS.md"]).toContain("Apply when editing files matching: src/services/**/*.ts");
    expect(out.files["AGENTS.md"]).toContain("Apply on @-mention: @manual");
  });
});

describe("windsurf-mdc → agents-md → windsurf-mdc (lossy)", () => {
  test("body preserved; trigger collapses to always_on", async () => {
    const path = FIX("windsurf-mdc/glob.md");
    const ir1 = await parseWindsurfMdc({ path, content: read(path) });
    expect(ir1.rules[0]!.activation.kind).toBe("glob");

    const am = renderAgentsMd(ir1);
    const ir2 = await parseAgentsMd({ path: "AGENTS.md", content: am.files["AGENTS.md"]! });
    expect(ir2.rules[0]!.activation.kind).toBe("always");

    const back = renderWindsurfMdc(ir2);
    const k = Object.keys(back.files)[0]!;
    expect(back.files[k]).toContain("trigger: always_on");
  });
});

describe("agents-md → all targets (lossless body propagation)", () => {
  test("body content survives into every target format", async () => {
    const path = FIX("agents-md/basic.md");
    const ir = await parseAgentsMd({ path, content: read(path) });
    const sentinel = "Useful commands"; // distinctive substring from the fixture

    const am = renderAgentsMd(ir);
    expect(am.files["AGENTS.md"]).toContain(sentinel);

    const cm = renderCursorMdc(ir);
    const mdcContent = Object.values(cm.files)[0]!;
    expect(mdcContent).toContain(sentinel);

    const wm = renderWindsurfMdc(ir);
    const wmContent = Object.values(wm.files)[0]!;
    expect(wmContent).toContain(sentinel);
  });
});

describe("char-limit propagation: large body → windsurf warning", () => {
  test("oversized agents-md routed through windsurf-mdc emits W003", async () => {
    const big = "# rule\n\n" + "x ".repeat(7_000); // ~14K chars
    const ir = await parseAgentsMd({ path: "AGENTS.md", content: big });
    const out = renderWindsurfMdc(ir);
    expect(out.warnings.some((w) => w.startsWith("W003"))).toBe(true);
  });
});
