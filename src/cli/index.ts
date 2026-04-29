#!/usr/bin/env bun
// CLI entry. Three verbs: inspect, convert, sync.
// No third-party CLI parser — argv is small enough to handle directly.

import { runInspect } from "./inspect.ts";
import { runConvert } from "./convert.ts";
import { runSync } from "./sync.ts";

const HELP = `agentcontext — normalize AGENTS.md / CLAUDE.md / .cursor/rules / .clinerules / .windsurf/rules

Usage:
  agentcontext inspect [path]
      Show what's in this repo: detected formats, rule count, warnings.

  agentcontext convert --from <fmt> --to <fmt> [--in <path>] [--out <path>]
      Convert one format to another. Use --to all to emit all targets.

  agentcontext sync [--write] [--shims claude,gemini,cursor,windsurf,cline,aider]
      Detect everything, normalize to AGENTS.md, optionally write per-tool shims.
      Without --write: dry-run, prints proposed file list.

Formats:
  Source: agents-md, claude-md, gemini-md, cursor-mdc, cursor-legacy,
          windsurf-mdc, windsurf-legacy, cline-file, cline-dir, conventions-md
  Target: agents-md, claude-md, gemini-md, cursor-mdc, windsurf-mdc,
          cline-dir, conventions-md   (no cursor-legacy, no aider-conf-as-rules)

Docs: https://agentsmd.apimesh.xyz
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const verb = argv[0];

  if (!verb || verb === "--help" || verb === "-h") {
    console.log(HELP);
    return 0;
  }

  const rest = argv.slice(1);
  switch (verb) {
    case "inspect":
      return await runInspect(rest);
    case "convert":
      return await runConvert(rest);
    case "sync":
      return await runSync(rest);
    case "version":
    case "--version":
    case "-v": {
      const pkg = await import("../../package.json", { with: { type: "json" } });
      console.log((pkg as unknown as { default: { version: string } }).default.version);
      return 0;
    }
    default:
      console.error(`Unknown verb: ${verb}\n`);
      console.error(HELP);
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error("agentcontext: fatal:", err instanceof Error ? err.message : err);
    process.exit(2);
  },
);
