import { test, expect, describe } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

import { parseCursorMdc } from "../src/parsers/cursor-mdc.ts";
import { parseGeminiMd } from "../src/parsers/gemini-md.ts";
import { parseWindsurfMdc } from "../src/parsers/windsurf-mdc.ts";
import { parseWindsurfLegacy } from "../src/parsers/windsurf-legacy.ts";
import { parseClineFile } from "../src/parsers/cline-file.ts";
import { parseClineDir } from "../src/parsers/cline-dir.ts";
import { parseConventionsMd } from "../src/parsers/conventions-md.ts";
import { parseAiderConf } from "../src/parsers/aider-conf.ts";
import { parseCursorLegacy } from "../src/parsers/cursor-legacy.ts";

const FIX = (p: string) => resolve(import.meta.dir, "fixtures", p);
const read = (p: string) => readFileSync(p, "utf8");
const reader = async (p: string) => read(p);
const lister = async (p: string) =>
  readdirSync(p).map((name) => ({ name, isDirectory: statSync(join(p, name)).isDirectory() }));

describe("parseGeminiMd", () => {
  test("happy path + W040 for Gemini Added Memories", async () => {
    const path = FIX("gemini-md/basic.md");
    const bundle = await parseGeminiMd({ path, content: read(path) });
    expect(bundle.rules.length).toBe(1);
    expect(bundle.rules[0]!.body_md).toContain("Gemini Added Memories");
    expect(bundle.warnings.some((w) => w.startsWith("W040"))).toBe(true);
  });

  test("@-imports inside code blocks are NOT expanded (W031)", async () => {
    const path = "/tmp/g.md";
    const content = "# top\n\n```ts\n@./should-not-expand.md\n```\n";
    // Provide a readFile that would crash if called for the in-code import.
    const bundle = await parseGeminiMd({
      path,
      content,
      readFile: async () => {
        throw new Error("must not read in-code import");
      },
    });
    expect(bundle.rules[0]!.body_md).toContain("@./should-not-expand.md");
    expect(bundle.warnings.some((w) => w.startsWith("W031"))).toBe(true);
  });

  test("@-imports in prose ARE expanded", async () => {
    const path = "/tmp/g.md";
    const content = "# top\n\n@/tmp/imp.md\n\nend.\n";
    const bundle = await parseGeminiMd({
      path,
      content,
      readFile: async (p) => {
        if (p === "/tmp/imp.md") return "## imported content here\n";
        throw new Error(`unexpected read ${p}`);
      },
    });
    expect(bundle.rules[0]!.body_md).toContain("imported content here");
  });
});

describe("parseWindsurfMdc", () => {
  test("trigger: always_on → always activation", async () => {
    const path = FIX("windsurf-mdc/always.md");
    const bundle = await parseWindsurfMdc({ path, content: read(path) });
    const r = bundle.rules[0]!;
    expect(r.activation.kind).toBe("always");
    expect(r.body_md).toContain("# Project rules");
  });

  test("trigger: glob → glob activation with patterns", async () => {
    const path = FIX("windsurf-mdc/glob.md");
    const bundle = await parseWindsurfMdc({ path, content: read(path) });
    const r = bundle.rules[0]!;
    expect(r.activation.kind).toBe("glob");
    if (r.activation.kind === "glob") {
      expect(r.activation.patterns).toEqual(["src/api/**/*.ts"]);
    }
  });

  test("oversize workspace rule emits W003", async () => {
    const big = "x".repeat(13_000);
    const content = `---\ntrigger: always_on\n---\n\n${big}\n`;
    const bundle = await parseWindsurfMdc({ path: ".windsurf/rules/big.md", content });
    expect(bundle.warnings.some((w) => w.startsWith("W003"))).toBe(true);
  });

  test("oversize global rule emits W004", async () => {
    const big = "y".repeat(7_000);
    const content = `---\ntrigger: always_on\n---\n\n${big}\n`;
    const bundle = await parseWindsurfMdc({
      path: "~/.codeium/windsurf/memories/big.md",
      content,
      scope: "global",
    });
    expect(bundle.warnings.some((w) => w.startsWith("W004"))).toBe(true);
  });
});

describe("parseWindsurfLegacy", () => {
  test("happy path", async () => {
    const path = FIX("windsurf-legacy/.windsurfrules");
    const bundle = await parseWindsurfLegacy({ path, content: read(path) });
    expect(bundle.rules.length).toBe(1);
    expect(bundle.rules[0]!.activation.kind).toBe("always");
    expect(bundle.rules[0]!.body_md).toContain("Cascade rules");
  });
});

describe("parseClineFile", () => {
  test("paths frontmatter → glob activation", async () => {
    const path = FIX("cline-file/basic");
    const bundle = await parseClineFile({ path, content: read(path) });
    const r = bundle.rules[0]!;
    expect(r.activation.kind).toBe("glob");
    if (r.activation.kind === "glob") {
      expect(r.activation.patterns).toEqual(["src/**/*.ts"]);
    }
  });

  test("empty paths array → toggle_state false", async () => {
    const content = "---\npaths: []\n---\n\n# disabled\n";
    const bundle = await parseClineFile({ path: ".clinerules", content });
    expect(bundle.rules[0]!.toggle_state).toBe(false);
  });
});

describe("parseClineDir", () => {
  test("reads .md files in numeric-prefix order, skips reserved subdirs", async () => {
    const dirPath = FIX("cline-dir");
    const bundle = await parseClineDir({ path: dirPath, listDir: lister, readFile: reader });
    expect(bundle.rules.length).toBe(3);
    expect(bundle.rules[0]!.body_md).toContain("Coding standards");
    expect(bundle.rules[1]!.body_md).toContain("Testing rules");
    expect(bundle.rules[2]!.body_md).toContain("Miscellaneous");
    // Ordering hint preserved
    expect(bundle.rules[0]!.ordering_hint).toBe(1);
    expect(bundle.rules[1]!.ordering_hint).toBe(2);
    expect(bundle.rules[2]!.ordering_hint).toBe(99);
  });

  test("reserved subdir produces W050", async () => {
    const fakeLister = async (p: string) => {
      if (p === "/fake/.clinerules") {
        return [
          { name: "01-rule.md", isDirectory: false },
          { name: "workflows", isDirectory: true },
        ];
      }
      if (p === "/fake/.clinerules/workflows") return [{ name: "x.md", isDirectory: false }];
      return [];
    };
    const fakeReader = async (p: string) => {
      if (p === "/fake/.clinerules/01-rule.md") return "# rule\n";
      throw new Error(`unexpected ${p}`);
    };
    const bundle = await parseClineDir({ path: "/fake/.clinerules", listDir: fakeLister, readFile: fakeReader });
    expect(bundle.warnings.some((w) => w.startsWith("W050"))).toBe(true);
    expect(bundle.rules.length).toBe(1);
  });
});

describe("CRLF + BOM regression (QUALITY-REVIEW B2 + C1)", () => {
  test("cursor-mdc with CRLF line endings still parses frontmatter", async () => {
    const content = "---\r\nalwaysApply: true\r\n---\r\n\r\n# Project rules\r\n\r\n- TS strict\r\n";
    const bundle = await parseCursorMdc({ path: ".cursor/rules/x.mdc", content });
    expect(bundle.rules.length).toBe(1);
    expect(bundle.rules[0]!.activation.kind).toBe("always");
    expect(bundle.rules[0]!.body_md).toContain("# Project rules");
    expect(bundle.rules[0]!.body_md).not.toContain("---");
  });

  test("cursor-mdc with UTF-8 BOM still parses frontmatter", async () => {
    const content = "﻿---\nalwaysApply: true\n---\n\n# Body\n";
    const bundle = await parseCursorMdc({ path: ".cursor/rules/x.mdc", content });
    expect(bundle.rules[0]!.activation.kind).toBe("always");
    expect(bundle.rules[0]!.body_md).toContain("# Body");
  });

  test("windsurf-mdc with CRLF still parses trigger field", async () => {
    const content = "---\r\ntrigger: glob\r\nglobs: src/**/*.ts\r\n---\r\n\r\n# x\r\n";
    const bundle = await parseWindsurfMdc({ path: ".windsurf/rules/x.md", content });
    expect(bundle.rules[0]!.activation.kind).toBe("glob");
  });

  test("cline-file with CRLF still parses paths field", async () => {
    const content = "---\r\npaths:\r\n  - \"src/**/*.ts\"\r\n---\r\n\r\n# rules\r\n";
    const bundle = await parseClineFile({ path: ".clinerules", content });
    expect(bundle.rules[0]!.activation.kind).toBe("glob");
  });
});

describe("parseConventionsMd", () => {
  test("happy path → one always Rule", async () => {
    const path = FIX("conventions-md/basic.md");
    const bundle = await parseConventionsMd({ path, content: read(path) });
    expect(bundle.rules.length).toBe(1);
    expect(bundle.rules[0]!.activation.kind).toBe("always");
    expect(bundle.rules[0]!.source.format).toBe("conventions-md");
  });
});

describe("parseAiderConf", () => {
  test("config_extras populated, read: list resolves to rules", async () => {
    const path = FIX("aider-conf/basic.yml");
    const bundle = await parseAiderConf({
      path,
      content: read(path),
      readFile: async (p: string) => {
        // The fixture's read: points at CONVENTIONS.md in the SAME directory as the .yml
        if (p.endsWith("CONVENTIONS.md")) return read(FIX("aider-conf/CONVENTIONS.md"));
        throw new Error(`unexpected read ${p}`);
      },
    });
    expect(bundle.config_extras.aider_conf).toBeDefined();
    expect((bundle.config_extras.aider_conf as Record<string, unknown>)["model"]).toBe("claude-opus-4-7");
    expect(bundle.rules.length).toBe(1);
    expect(bundle.rules[0]!.body_md).toContain("Project conventions");
  });

  test("path-traversal guard: absolute read: outside sandbox is blocked", async () => {
    // Reproduction of SECURITY-AUDIT.md FINDING-01.
    const content = "read:\n  - /etc/hosts\n";
    let attemptedRead = false;
    const bundle = await parseAiderConf({
      path: "/tmp/poison/.aider.conf.yml",
      content,
      readFile: async () => {
        attemptedRead = true;
        return "should-never-be-called";
      },
    });
    expect(attemptedRead).toBe(false);
    expect(bundle.warnings.some((w) => w.includes("blocked: outside sandbox root"))).toBe(true);
    expect(bundle.rules.length).toBe(0);
  });

  test("path-traversal guard: ../ traversal outside sandbox is blocked", async () => {
    const content = "read:\n  - ../../../etc/hosts\n";
    let attemptedRead = false;
    const bundle = await parseAiderConf({
      path: "/tmp/poison/.aider.conf.yml",
      content,
      readFile: async () => {
        attemptedRead = true;
        return "leak";
      },
    });
    expect(attemptedRead).toBe(false);
    expect(bundle.warnings.some((w) => w.includes("blocked"))).toBe(true);
  });

  test("path-traversal guard: opt-out flag allows absolute reads", async () => {
    const content = "read:\n  - /tmp/some-shared-conventions.md\n";
    let read_path = "";
    const bundle = await parseAiderConf({
      path: "/tmp/.aider.conf.yml",
      content,
      readFile: async (p: string) => {
        read_path = p;
        return "# shared\n";
      },
      allowAbsoluteReads: true,
    });
    expect(read_path).toBe("/tmp/some-shared-conventions.md");
    expect(bundle.rules.length).toBe(1);
  });

  test("missing read: target emits W020", async () => {
    const content = "read: [does-not-exist.md]\n";
    const bundle = await parseAiderConf({
      path: "/tmp/.aider.conf.yml",
      content,
      readFile: async () => {
        throw new Error("ENOENT");
      },
    });
    expect(bundle.warnings.some((w) => w.startsWith("W020"))).toBe(true);
  });
});

describe("parseCursorLegacy", () => {
  test("happy path", async () => {
    const path = FIX("cursor-legacy/.cursorrules");
    const bundle = await parseCursorLegacy({ path, content: read(path) });
    expect(bundle.rules.length).toBe(1);
    expect(bundle.rules[0]!.source.format).toBe("cursor-legacy");
  });
});
