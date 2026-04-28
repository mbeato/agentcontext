# CLAUDE.md

## Hard rules

- No inflated metrics — every number must be interview-defensible.
- Use Bun for everything (per project CLAUDE.md).
- Never include "Co-Authored-By: Claude" in git commit messages.

## Build / test

- `bun test` runs the suite.
- `bun run typecheck` for TS validation.

## Workflow

- Test-first for non-trivial changes.
- Small commits, reversible operations only without confirmation.
