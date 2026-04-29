# SHIP — v0.1.0 ready

Three days. Two npm packages. One conway sub-app. 62 tests green.

## Repos

| Repo | Path | Branch | Tag | Commits |
|---|---|---|---|---|
| `mbeato/agentcontext` | `~/agentcontext` | main | v0.1.0 | 3 |
| `mbeato/agentcontext-mcp` | `~/agentcontext-mcp` | main | v0.1.0 | 1 |
| Conway sub-app | `~/conway/apis/agentcontext/` | (worktree branch) | — | uncommitted |

## Manual steps you need to take

### 1. Push the two new repos to GitHub

```sh
gh repo create mbeato/agentcontext --public --source=/Users/vtx/agentcontext --remote=origin --push
gh repo create mbeato/agentcontext-mcp --public --source=/Users/vtx/agentcontext-mcp --remote=origin --push
```

Then push the tags:
```sh
cd ~/agentcontext && git push origin v0.1.0
cd ~/agentcontext-mcp && git push origin v0.1.0
```

### 2. npm publish (in order — wrapper depends on the lib)

The MCP wrapper currently has `"@mbeato/agentcontext": "file:../agentcontext"` for local dev. Flip it to a real version range right before publishing:

```sh
cd ~/agentcontext
npm publish --access public

# After lib is on npm, fix the wrapper's dep:
cd ~/agentcontext-mcp
# Edit package.json: change "file:../agentcontext" → "^0.1.0"
npm publish --access public

# Restore file: dep for local dev:
# Edit package.json back to "file:../agentcontext"
bun install
```

Verify:
```sh
npx @mbeato/agentcontext inspect /Users/vtx/conway     # should show 2 rules detected
npx -y @mbeato/agentcontext-mcp <<< '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### 3. Conway sub-app — review + commit + deploy

The Hono sub-app is wired in but **not committed** because the conway worktree had pre-existing in-progress changes I didn't want to bundle in:

| File | What I changed | Status |
|---|---|---|
| `apis/agentcontext/index.ts` | NEW — Hono app w/ landing + /normalize + 301 redirect | untracked |
| `apis/agentcontext/landing.html` | NEW — single-page landing with paste-form demo | untracked |
| `apis/registry.ts` | +1 import line (line 24), +2 registry entries (`agentsmd`, `agentcontext`) | mixed (other in-progress edits already present) |
| `package.json` | +1 line: `"@mbeato/agentcontext": "file:../agentcontext"` | mixed |
| `bun.lock` | regenerated | mixed |

To commit just my pieces:
```sh
cd ~/conway
git add apis/agentcontext/
git add -p apis/registry.ts package.json bun.lock     # cherry-pick my hunks
git commit -m "feat(agentcontext): wire AGENTS.md normalizer sub-app at agentsmd.apimesh.xyz"
```

After publishing the npm packages, flip the conway dep too:
```sh
# In ~/conway/package.json change:  "@mbeato/agentcontext": "file:../agentcontext"
#                              to:  "@mbeato/agentcontext": "^0.1.0"
bun install
```

This is required for the production deploy (the rsync to /opt/conway-agent doesn't carry sibling directories).

### 4. DNS for the two subdomains

The conway router already handles `*.apimesh.xyz` via Caddy wildcard TLS — the `agentsmd` and `agentcontext` subdomain entries in `apis/registry.ts` make them route to the same Hono app. The 301 redirect from `agentcontext.apimesh.xyz` → `agentsmd.apimesh.xyz` is handled in code (apis/agentcontext/index.ts:46).

No DNS changes needed if Cloudflare is already serving wildcard `*.apimesh.xyz`.

### 5. MCP Registry submission

After npm publish:
- Submit `@mbeato/agentcontext-mcp` to https://registry.modelcontextprotocol.io
- Submit to PulseMCP
- Submit to x402.org/ecosystem (low priority — not x402-themed)

### 6. Cold-outreach kickoff (Week 2 of WEDGES.md plan)

Per the wedge research, the buyer pool is the 3,732 +1 reactors on anthropics/claude-code#6235 plus the cross-search of `gh search code "filename:.cursorrules"` + `filename:CLAUDE.md` + `filename:.clinerules`. The pitch:

> Subject: built a one-liner for the AGENTS.md / CLAUDE.md / .cursorrules thing
>
> max here. saw your repo has both CLAUDE.md and .cursor/rules — i built a small tool that keeps them in sync from one source.
>
> npx @mbeato/agentcontext inspect
>
> takes 2 seconds. free. open source. let me know if you'd want a webhook/github-app version.

## What ships in v0.1

### Library + CLI (`@mbeato/agentcontext`)
- 11 parsers (10 source formats + tier-B aider config)
- 7 renderers (no `.cursorrules`, no `.aider.conf.yml`-as-rules)
- `detect()` — root-level + 1-deep directory scan
- `ingest()` — detect → parse → merge → Bundle
- `render()` / `renderMany()`
- CLI: `inspect`, `convert`, `sync` (dry-run + `--write`)
- 12 numbered warnings (W001-W099)
- Round-trip determinism: byte-identical for lossless pairs, IR-identical for cursor-mdc/windsurf-mdc round-trips, bounded-diff for documented-lossy directions

### MCP server (`@mbeato/agentcontext-mcp`)
- Stdio JSON-RPC 2.0 transport
- Two tools: `read_agent_context(path)`, `convert_agent_context(ir, targets)`
- MCP-2024-11-05 minimum surface

### Hosted endpoint (`agentsmd.apimesh.xyz` — needs deploy)
- `GET /` — landing page with paste-form demo
- `POST /normalize` — `{ source_format, content, targets }` → `{ files, warnings, detected_formats }`
- `agentcontext.apimesh.xyz` 301 → `agentsmd.apimesh.xyz`
- Rate-limited 60/min global, 30/min on /normalize, 100K char input cap

### Tests
- 62 passing across 9 files
- Layer 1: per-format parser + renderer unit tests
- Layer 2: lossless round-trip (agents-md, claude-md, gemini-md, cursor-mdc IR, windsurf-mdc IR, conventions-md)
- Layer 3: cross-format diff-bound (cursor-mdc → agents-md → cursor-mdc; windsurf-mdc → agents-md → windsurf-mdc; oversize body → windsurf W003)
- MCP tool definitions + handler invocation tests
- Pipeline e2e against temp dirs

## What's deferred to v0.2+

- Walked-up nested `AGENTS.md` / `CLAUDE.md` files
- `.claude/rules/*.md` path-scoped rules emission
- Cline directory scoped rule activation roundtrip
- GitHub App that auto-PRs canonical AGENTS.md on push
- Private-repo support (paid tier)
- Hosted `GET /inspect?repo=<url>` flywheel (server-side GitHub fetch)
- Layer 4 e2e tests against fixture repos with golden snapshots
