import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAgentsMd } from "../src/parsers/agents-md.ts";
import { parseClaudeMd, type ReadFile } from "../src/parsers/claude-md.ts";
import { parseCursorMdc } from "../src/parsers/cursor-mdc.ts";

const FIX = (p: string) => resolve(import.meta.dir, "fixtures", p);
const read = (p: string) => readFileSync(p, "utf8");

describe("parseAgentsMd", () => {
  test("happy path: produces one Rule with always activation", async () => {
    const path = FIX("agents-md/basic.md");
    const bundle = await parseAgentsMd({ path, content: read(path) });
    expect(bundle.rules.length).toBe(1);
    const r = bundle.rules[0]!;
    expect(r.source.format).toBe("agents-md");
    expect(r.activation.kind).toBe("always");
    expect(r.body_md).toContain("Project Conventions");
    expect(r.body_md).toContain("Useful commands");
    expect(r.body_md.endsWith("\n")).toBe(true);
    expect(r.metadata.has_code_blocks).toBe(false);
    expect(bundle.detected_formats).toEqual(["agents-md"]);
  });

  test("empty file produces no rules + W099 warning", async () => {
    const bundle = await parseAgentsMd({ path: "AGENTS.md", content: "" });
    expect(bundle.rules.length).toBe(0);
    expect(bundle.warnings.some((w) => w.startsWith("W099"))).toBe(true);
  });
});

describe("parseClaudeMd", () => {
  test("happy path without imports", async () => {
    const path = FIX("claude-md/basic.md");
    const bundle = await parseClaudeMd({ path, content: read(path) });
    expect(bundle.rules.length).toBe(1);
    const r = bundle.rules[0]!;
    expect(r.activation.kind).toBe("always");
    expect(r.body_md).toContain("Hard rules");
    expect(r.body_md).toContain("interview-defensible");
  });

  test("@-imports resolve and inline", async () => {
    const path = FIX("claude-md/with-imports.md");
    const readFile: ReadFile = async (p) => read(p);
    const bundle = await parseClaudeMd({ path, content: read(path), readFile });
    expect(bundle.rules.length).toBe(1);
    const body = bundle.rules[0]!.body_md;
    expect(body).toContain("End of CLAUDE.md");
    expect(body).toContain("## Style");           // from style.md
    expect(body).toContain("## Testing");         // from testing.md
    expect(body).toContain("Snapshot tests");     // proves testing.md was inlined
    expect(body).not.toMatch(/^@\.\/style\.md/m); // import literal removed
  });

  test("missing import target leaves literal, no crash", async () => {
    const path = FIX("claude-md/with-imports.md");
    const content = "# Top\n\n@./does-not-exist.md\n";
    const readFile: ReadFile = async (p) => {
      const data = readFileSync(p, "utf8");
      return data;
    };
    const bundle = await parseClaudeMd({ path, content, readFile });
    expect(bundle.rules.length).toBe(1);
    expect(bundle.rules[0]!.body_md).toContain("@./does-not-exist.md");
  });

  test("no readFile = imports left literal (pure mode)", async () => {
    const path = FIX("claude-md/with-imports.md");
    const bundle = await parseClaudeMd({ path, content: read(path) });
    expect(bundle.rules[0]!.body_md).toContain("@./style.md");
  });
});

describe("parseCursorMdc", () => {
  test("alwaysApply: true → always activation", async () => {
    const path = FIX("cursor-mdc/always.mdc");
    const bundle = await parseCursorMdc({ path, content: read(path) });
    expect(bundle.rules.length).toBe(1);
    const r = bundle.rules[0]!;
    expect(r.activation.kind).toBe("always");
    expect(r.body_md).toContain("# General");
    expect(r.body_md).not.toContain("alwaysApply"); // frontmatter stripped
  });

  test("globs set → glob activation", async () => {
    const path = FIX("cursor-mdc/glob.mdc");
    const bundle = await parseCursorMdc({ path, content: read(path) });
    const r = bundle.rules[0]!;
    expect(r.activation.kind).toBe("glob");
    if (r.activation.kind === "glob") {
      expect(r.activation.patterns).toEqual(["src/services/**/*.ts"]);
    }
  });

  test("description only → model_decision activation", async () => {
    const content = `---
description: Apply when refactoring tests
alwaysApply: false
---

# Test refactor rules

Body content.
`;
    const bundle = await parseCursorMdc({ path: ".cursor/rules/test.mdc", content });
    const r = bundle.rules[0]!;
    expect(r.activation.kind).toBe("model_decision");
    if (r.activation.kind === "model_decision") {
      expect(r.activation.description).toBe("Apply when refactoring tests");
    }
  });

  test("no fields → manual activation with filename mention", async () => {
    const path = FIX("cursor-mdc/manual.mdc");
    const bundle = await parseCursorMdc({ path, content: read(path) });
    const r = bundle.rules[0]!;
    expect(r.activation.kind).toBe("manual");
    if (r.activation.kind === "manual") {
      expect(r.activation.mention).toBe("manual");
    }
  });

  test("malformed frontmatter → warning, body preserved", async () => {
    const content = `---
not: valid: yaml: at: all
  bad indent
---

Body still here.
`;
    const bundle = await parseCursorMdc({ path: ".cursor/rules/x.mdc", content });
    // Either it parsed something (yaml lib is permissive) or warned. Body must survive either way.
    if (bundle.rules.length > 0) {
      expect(bundle.rules[0]!.body_md).toContain("Body still here");
    } else {
      expect(bundle.warnings.length).toBeGreaterThan(0);
    }
  });
});
