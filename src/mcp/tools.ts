// MCP tool definitions + handlers.
// Two tools per design doc:
//   read_agent_context(path)         → IR JSON
//   convert_agent_context(ir, targets) → file map { path: content }
//
// Tool handlers are pure async functions that take parsed input and return
// JSON-serializable output. The transport layer (stdio JSON-RPC, HTTP, etc.)
// wraps them.

import { type Bundle, type TargetFormat } from "../ir.ts";
import { ingest, render } from "../pipeline.ts";

export const TOOL_DEFINITIONS = [
  {
    name: "read_agent_context",
    description:
      "Parse all agent-context files in a repo (CLAUDE.md, AGENTS.md, .cursor/rules, .clinerules, .windsurf/rules, .aider.conf.yml, etc.) and return a unified IR. Use this to see what rules a project has across every AI-coding-tool format.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description: "Absolute or cwd-relative path to the repo root. Defaults to cwd.",
        },
      },
    },
  },
  {
    name: "convert_agent_context",
    description:
      "Convert an agent-context IR (returned by read_agent_context) to one or more target formats. Returns rendered file contents keyed by repo-relative path.",
    inputSchema: {
      type: "object" as const,
      required: ["ir", "targets"] as const,
      properties: {
        ir: {
          type: "object" as const,
          description:
            "Bundle IR returned by read_agent_context. Must include rules[], detected_formats[], warnings[], config_extras{}.",
        },
        targets: {
          type: "array" as const,
          items: {
            type: "string" as const,
            enum: [
              "agents-md",
              "claude-md",
              "gemini-md",
              "cursor-mdc",
              "windsurf-mdc",
              "cline-dir",
              "conventions-md",
            ],
          },
          description: "Target formats to render to.",
        },
      },
    },
  },
] as const;

export type ReadAgentContextInput = { path?: string };

export async function readAgentContext(input: ReadAgentContextInput): Promise<Bundle> {
  const path = input.path && input.path.length > 0 ? input.path : process.cwd();
  return await ingest(path);
}

export type ConvertAgentContextInput = {
  ir: Bundle;
  targets: TargetFormat[];
};

export type ConvertAgentContextOutput = {
  files: Record<string, string>;
  warnings: string[];
};

export async function convertAgentContext(
  input: ConvertAgentContextInput,
): Promise<ConvertAgentContextOutput> {
  if (!input.ir || !Array.isArray(input.ir.rules)) {
    throw new Error("convert_agent_context: input.ir must be a Bundle with rules[]");
  }
  if (!Array.isArray(input.targets) || input.targets.length === 0) {
    throw new Error("convert_agent_context: input.targets must be a non-empty array of TargetFormat");
  }

  const files: Record<string, string> = {};
  const warnings: string[] = [];
  for (const t of input.targets) {
    const r = render(input.ir, t);
    Object.assign(files, r.files);
    for (const w of r.warnings) warnings.push(w);
  }
  return { files, warnings };
}
