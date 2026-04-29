import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TOOL_DEFINITIONS,
  readAgentContext,
  convertAgentContext,
} from "../src/mcp/tools.ts";

function makeTempRepo(setup: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "actx-mcp-"));
  for (const [rel, content] of Object.entries(setup)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return dir;
}

describe("MCP tool definitions", () => {
  test("two tools registered with required fields", () => {
    expect(TOOL_DEFINITIONS.length).toBe(2);
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toEqual(["read_agent_context", "convert_agent_context"]);
    for (const t of TOOL_DEFINITIONS) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
    }
  });
});

describe("read_agent_context tool", () => {
  test("returns Bundle with rules from a real repo", async () => {
    const dir = makeTempRepo({
      "AGENTS.md": "# rules\n\n- one\n- two\n",
      "CLAUDE.md": "# claude\n\n- specific\n",
    });
    try {
      const bundle = await readAgentContext({ path: dir });
      expect(bundle.rules.length).toBe(2);
      expect(bundle.detected_formats.sort()).toEqual(["agents-md", "claude-md"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("convert_agent_context tool", () => {
  test("renders one Bundle into multiple targets", async () => {
    const dir = makeTempRepo({ "AGENTS.md": "# x\n\n- a\n" });
    try {
      const bundle = await readAgentContext({ path: dir });
      const out = await convertAgentContext({
        ir: bundle,
        targets: ["agents-md", "claude-md", "cursor-mdc"],
      });
      expect(out.files["AGENTS.md"]).toBeDefined();
      expect(out.files["CLAUDE.md"]).toBeDefined();
      expect(Object.keys(out.files).some((k) => k.startsWith(".cursor/rules/"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rejects empty targets", async () => {
    const dir = makeTempRepo({ "AGENTS.md": "# x\n" });
    try {
      const bundle = await readAgentContext({ path: dir });
      await expect(
        convertAgentContext({ ir: bundle, targets: [] }),
      ).rejects.toThrow(/non-empty array/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rejects malformed IR", async () => {
    await expect(
      convertAgentContext({
        ir: { foo: "bar" } as unknown as Parameters<typeof convertAgentContext>[0]["ir"],
        targets: ["agents-md"],
      }),
    ).rejects.toThrow(/must be a Bundle/);
  });
});
