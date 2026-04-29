# Ship status — agentcontext v0.1.0 (2026-04-29)

## ✅ Live now

| Surface | URL / location | Notes |
|---|---|---|
| `@mbeato/agentcontext@0.1.0` | https://www.npmjs.com/package/@mbeato/agentcontext | npm publish complete (auth: mbeato) |
| `@mbeato/agentcontext-mcp@0.1.0` | https://www.npmjs.com/package/@mbeato/agentcontext-mcp | npm publish complete |
| `mbeato/agentcontext` | https://github.com/mbeato/agentcontext | public, v0.1.0 tag pushed |
| `mbeato/agentcontext-mcp` | https://github.com/mbeato/agentcontext-mcp | public, v0.1.0 tag pushed |
| Conway PR #4 | https://github.com/mbeato/APIMesh/pull/4 | feat/agentcontext branch — needs your review + merge |
| Cold-outreach drafts (30) | `/tmp/outreach/drafts.md` + `drafts.csv` | tier-3 (upvote-only personalization) |

## 🟡 Waiting on you

### 1. MCP Registry submission — needs your GitHub OAuth

The `mcp-publisher login github` device-flow is **still waiting** in the background.
Process started 12+ minutes ago. Device codes expire at ~15 min.

**Action:** open https://github.com/login/device, enter code **`715F-5F96`**, authorize.

If the code has expired, run this to issue a new one:
```sh
cd ~/agentcontext-mcp && mcp-publisher login github
```

After auth completes, I (or you) run:
```sh
cd ~/agentcontext-mcp && mcp-publisher publish
```

PulseMCP will pick it up automatically (they ingest the Official Registry weekly — no separate submission needed).

### 2. Conway PR — review + merge

PR #4 is ready: https://github.com/mbeato/APIMesh/pull/4

Before merge, flip `package.json` to use the npm-published version:
```sh
# Edit ~/conway/package.json:
#   "@mbeato/agentcontext": "file:../agentcontext"  →  "@mbeato/agentcontext": "^0.1.0"
cd ~/conway && bun install
```
Otherwise the production deploy can't resolve the dep (the rsync to `/opt/conway-agent` doesn't carry sibling directories).

Then deploy: `bash scripts/deploy.sh`.

### 3. Cold-outreach send

Drafts live at:
- `/tmp/outreach/drafts.md` — markdown with all 30 personalized drafts (preview + per-recipient body)
- `/tmp/outreach/drafts.csv` — CSV for outreach tools (Apollo, Mixmax, etc.)

**Pool:** 300 of 3,782 reactors fetched · 95 had public email · top 30 ranked by `public_repos`.

All currently tier-3 (upvote signal only). I tried to enrich with per-user repo signals via GitHub Code Search but hit a secondary rate limit (separate from the documented 30/min). If you want richer personalization, run `bash /tmp/outreach/scan-repos.sh` after waiting ~15 min.

**Voice profile applied:** lowercase, terse, signs as `max`, no buzzwords.

**Send recommendations:**
- Use a separate domain (per WEDGES.md): get `max@agentcontext.dev` via Fastmail or Proton, OR use a Gmail+ alias
- Spread over multiple days — < 50/day is the deliverability sweet spot
- First-touch only. Wait 5-7 days before any follow-up
- Day 30 hard exit per WEDGES.md if zero paying customers

## 📊 Numbers

- 3 days of work, 5 commits across 2 new repos + 1 conway commit
- 62/62 tests green, typecheck clean both packages
- 11 parsers + 7 renderers + 12 numbered warnings
- 0 runtime deps beyond `yaml`
- Conway sub-app: 5 files / 406 LOC

## What I couldn't do this session

- **Playwright:** unavailable mid-session (browser closed). MCP Registry device-flow auth fell back to copy-paste-the-code mode for you.
- **GitHub Code Search enrichment:** secondary rate limit hit immediately. The scan-repos.sh script is ready to run later.
- **Email sending:** intentionally not automated — drafts are review-ready, you push the button.
- **mcp.so submission:** their site returns 403 to my fetches. Manual submit if you want it.

## Outstanding tasks

- [ ] Authorize MCP Registry device flow → `mcp-publisher publish`
- [ ] Merge PR #4 (after flipping `^0.1.0` dep)
- [ ] Deploy conway → live https://agentsmd.apimesh.xyz
- [ ] Send first 10 of the 30 drafts
- [ ] Set up `max@agentcontext.dev` (or sender alias)
- [ ] Optionally re-run `scan-repos.sh` for tier-1/2 personalization
- [ ] Optional: submit to mcp.so manually
