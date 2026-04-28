# @mbeato/agentcontext

Normalize agent-context files across the format zoo: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, `.cursorrules`, `.windsurf/rules/*.md`, `.windsurfrules`, `.clinerules`, `.clinerules/*.md`, `CONVENTIONS.md`.

One source of truth — emit per-tool shims for everything else.

## Status

v0.1 — early. CLI + MCP + hosted endpoint at https://agentsmd.apimesh.xyz coming.

## Install

```sh
npx @mbeato/agentcontext inspect
```

## Why

Every AI coding tool invented its own rules-file format. Maintaining `CLAUDE.md` + `.cursor/rules/*.mdc` + `.clinerules` + `AGENTS.md` by hand drifts. This tool keeps them in sync.

## License

MIT
