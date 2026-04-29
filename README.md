# @mbeato/agentcontext

One source of truth for the agent-context format zoo.

Maintain `AGENTS.md` once. Sync `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, `.windsurf/rules/*.md`, `.clinerules/*.md`, `CONVENTIONS.md` automatically.

## Why

Every AI coding tool invented its own rules-file format. Eleven of them, last we counted. Maintaining `CLAUDE.md` + `AGENTS.md` + `.cursorrules` + `.cursor/rules/*.mdc` + `.clinerules/*.md` + `.windsurfrules` + `.windsurf/rules/*.md` + `CONVENTIONS.md` by hand drifts within weeks. This tool keeps them in sync.

## Quickstart

```sh
# See what's in this repo
npx @mbeato/agentcontext inspect

# Detect everything, normalize to AGENTS.md, write per-tool shims
npx @mbeato/agentcontext sync --write --shims claude,cursor,cline,windsurf,gemini,aider

# Or convert one direction explicitly
npx @mbeato/agentcontext convert --from cursor-mdc --to agents-md --in .cursor/rules/style.mdc
```

## What gets read and written

| Format | Read | Write | Notes |
|---|---|---|---|
| `AGENTS.md` | ✓ | ✓ | Canonical hub |
| `CLAUDE.md` | ✓ | ✓ | @-imports resolved (5 hops) |
| `GEMINI.md` | ✓ | ✓ | Code-block-aware @-imports; preserves `## Gemini Added Memories` |
| `.cursor/rules/*.mdc` | ✓ | ✓ | All 4 activation modes (alwaysApply / globs / description / manual) |
| `.cursorrules` | ✓ | ✗ | Read-only — deprecated by Cursor in Agent mode |
| `.windsurf/rules/*.md` | ✓ | ✓ | All 4 triggers; warns on 12K char limit |
| `.windsurfrules` | ✓ | ✗ | Read-only — pre-Wave-8 legacy |
| `.clinerules` (file) | ✓ | ✗ | Read-only — pre-v3.7.0 legacy |
| `.clinerules/*.md` | ✓ | ✓ | Skips reserved subdirs (workflows/, hooks/, skills/) |
| `CONVENTIONS.md` | ✓ | ✓ | Aider community pattern; emits matching `.aider.conf.yml` snippet |
| `.aider.conf.yml` | partial | ✗ | Reads `read:` list only — never round-tripped (it's CLI config, not rules) |

## Library

```ts
import { ingest, render, renderMany } from "@mbeato/agentcontext";

const bundle = await ingest("/path/to/repo");
console.log(bundle.detected_formats); // ["agents-md", "claude-md", "cursor-mdc"]
console.log(bundle.rules.length);

const out = renderMany(bundle, ["agents-md", "claude-md", "cursor-mdc"]);
for (const [path, content] of Object.entries(out.files)) {
  console.log(path, content.length);
}
for (const w of out.warnings) console.log(w); // W003, W042, etc.
```

## MCP server

There's a separate package `@mbeato/agentcontext-mcp` that exposes two MCP tools (`read_agent_context`, `convert_agent_context`) for any MCP-aware agent.

```jsonc
// MCP client config
{
  "mcpServers": {
    "agentcontext": {
      "command": "npx",
      "args": ["-y", "@mbeato/agentcontext-mcp"]
    }
  }
}
```

## Hosted endpoint

`https://agentsmd.apimesh.xyz` — landing + `POST /normalize` (deploying this week — until then, use the CLI or MCP).

`POST /normalize` will accept `{ source_format, content, targets }` and return `{ files, warnings, detected_formats }`. Free, rate-limited.

## Round-trip guarantee

Lossless pairs (e.g., `agents-md ↔ agents-md`, `cursor-mdc ↔ cursor-mdc`, `conventions-md ↔ conventions-md`) round-trip byte-identical after canonicalization. Lossy directions (e.g., `cursor-mdc → agents-md` collapses activation modes into prose) emit numbered warnings (W001–W099) so you can grep CI logs.

## Status

v0.1.2 — early. Working CLI + MCP + library. Hosted endpoint deploying this week. Not yet: walked-up nested `AGENTS.md` / `CLAUDE.md`, `.claude/rules/*.md` path-scoped rules, GitHub App for auto-PR sync.

## License

MIT
