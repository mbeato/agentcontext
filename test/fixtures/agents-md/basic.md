# Project Conventions

This is a Bun + Hono service. AI agents working on this repo should follow the
rules below.

## Build / test

- Use `bun install` not `npm install`.
- Run `bun test` before committing.
- All new HTTP endpoints must include a happy-path test.

## Code style

- 2-space indent for TS, 4-space for Python.
- No trailing whitespace.
- Prefer named exports over default exports.

## Security

- Never commit `.env` or any file matching `*-secret*`.
- All user input must be validated at route boundaries.

## Useful commands

| What | How |
|---|---|
| Dev server | `bun --hot src/server.ts` |
| Type check | `bun run typecheck` |
| Single test | `bun test path/to/file.test.ts` |
