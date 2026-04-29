// End-to-end-ish: detect → ingest → render against a temp directory.
import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest, render, renderMany } from "../src/pipeline.ts";
import { detect, nodeFsAdapter } from "../src/detect.ts";

function makeTempRepo(setup: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agentcontext-"));
  for (const [rel, content] of Object.entries(setup)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return dir;
}

describe("detect", () => {
  test("finds AGENTS.md, CLAUDE.md, .cursor/rules/*.mdc, .clinerules dir", async () => {
    const dir = makeTempRepo({
      "AGENTS.md": "# A\n",
      "CLAUDE.md": "# C\n",
      ".cursor/rules/x.mdc": "---\nalwaysApply: true\n---\n\n# x\n",
      ".clinerules/01-rule.md": "# r\n",
      "README.md": "# readme\n",
    });
    try {
      const fs = await nodeFsAdapter();
      const result = await detect(dir, fs);
      const formats = result.files.map((f) => f.format).sort();
      expect(formats).toEqual(["agents-md", "claude-md", "cline-dir", "cursor-mdc"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ingest", () => {
  test("merges rules from multiple formats into one Bundle", async () => {
    const dir = makeTempRepo({
      "AGENTS.md": "# Agents content\n",
      ".cursor/rules/coding.mdc": "---\nalwaysApply: true\n---\n\n# Coding\n",
    });
    try {
      const bundle = await ingest(dir);
      expect(bundle.rules.length).toBe(2);
      expect(bundle.detected_formats.sort()).toEqual(["agents-md", "cursor-mdc"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("renderMany emits canonical AGENTS.md + per-tool shims", async () => {
    const dir = makeTempRepo({
      "AGENTS.md": "# top\n\n- rule one\n- rule two\n",
    });
    try {
      const bundle = await ingest(dir);
      const out = renderMany(bundle, ["agents-md", "claude-md", "cursor-mdc"]);
      expect(out.files["AGENTS.md"]).toBeDefined();
      expect(out.files["CLAUDE.md"]).toBeDefined();
      // cursor-mdc emits one .mdc — name will derive from heading slug
      const mdcKey = Object.keys(out.files).find((k) => k.startsWith(".cursor/rules/"));
      expect(mdcKey).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("render", () => {
  test("agents-md target produces single AGENTS.md file", async () => {
    const dir = makeTempRepo({ "AGENTS.md": "# x\n" });
    try {
      const bundle = await ingest(dir);
      const out = render(bundle, "agents-md");
      expect(Object.keys(out.files)).toEqual(["AGENTS.md"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
