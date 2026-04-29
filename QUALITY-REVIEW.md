# Quality Review — agentcontext v0.1.0

**Reviewer:** Claude Sonnet 4.6 (automated static + dynamic analysis)
**Date:** 2026-04-28
**Scope:** `/Users/vtx/agentcontext/` (lib + CLI) and `/Users/vtx/agentcontext-mcp/` (MCP wrapper)

---

## Summary

**Total findings: 12**
Blockers: 2 | Concerning: 5 | Nice-to-have: 5

**Verdict:** Two issues stop the "30 engineers run `npx @mbeato/agentcontext inspect`" scenario cold. Fix the `npx`-on-plain-node failure and the CRLF frontmatter corruption before sending cold outreach. Everything else is shippable with follow-up.

---

## BLOCKER Issues

### B1 — `npx @mbeato/agentcontext inspect` fails on any machine without bun installed

**File:line:** `/Users/vtx/agentcontext/package.json:6-8`, `/Users/vtx/agentcontext/src/cli/index.ts:1`

**What's wrong:** The `bin` field points at a raw `.ts` file with a `#!/usr/bin/env bun` shebang. npm installs `.ts` source; when npx runs the binary, the OS tries to exec `bun`. Engineers who have Node+npm but not bun get `env: bun: No such file or directory` and see nothing useful.

**Concrete failure scenario:** Any engineer on a machine with Node 18+ / npm but no bun — which is plausible for backend engineers and CI environments — runs `npx @mbeato/agentcontext inspect` and the process immediately exits with a non-zero code and a cryptic OS error.

**Fix:** Bundle to a single CJS/ESM `.js` file before publish, exactly how `@mbeato/apimesh-mcp-server` was fixed (MEMORY.md: "bundles via `bun build --target=node`"). Add a `prepublish` script:
```json
"scripts": {
  "build": "bun build ./src/cli/index.ts --outfile dist/cli.js --target=node --minify",
  "prepublish": "bun run build"
},
"bin": { "agentcontext": "./dist/cli.js" }
```
Do the same for `agentcontext-mcp`. Same shebang problem there (`./src/index.ts`).

**Severity:** BLOCKER — the primary call-to-action in cold outreach emails is `npx @mbeato/agentcontext inspect`. If it fails for any engineer, that's a broken first impression.

---

### B2 — CRLF line endings in .mdc / .md frontmatter silently corrupt the parsed rule

**File:line:** `/Users/vtx/agentcontext/src/parsers/cursor-mdc.ts:25`, `/Users/vtx/agentcontext/src/parsers/windsurf-mdc.ts:25`, `/Users/vtx/agentcontext/src/parsers/cline-dir.ts:13`, `/Users/vtx/agentcontext/src/parsers/cline-file.ts:9`

**What's wrong:** `FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/` requires Unix LF. Files with CRLF line endings (common on Windows, and on repos with `* text=auto` in `.gitattributes`) fail to match. The entire file — including the raw `---\r\nalwaysApply: true\r\n---` markers — becomes the rule body, and activation defaults to `manual`. This produces wrong activation AND injects YAML fence markers into `body_md`.

**Concrete failure scenario:** Engineer on Windows creates `.cursor/rules/coding.mdc` via VS Code (which defaults to CRLF on Windows). They run `agentcontext inspect`; the tool reports the rule as `[manual: @coding]` instead of `[always]`. If they then `sync --write`, the rendered AGENTS.md contains the raw YAML frontmatter as visible content.

**Fix:** Pre-normalize line endings before regex matching in all parsers:
```ts
const normalizedContent = input.content.replace(/\r\n?/g, "\n");
const m = normalizedContent.match(FRONTMATTER_RE);
```
Apply in the four parsers that use `FRONTMATTER_RE` directly. The same pre-normalization already happens in `canonicalizeMarkdown` (which is called after), but the frontmatter is stripped before canonicalize runs.

**Severity:** BLOCKER — incorrect activation mode AND frontmatter content in body is silent data corruption. No crash, no warning, wrong output.

---

## CONCERNING Issues

### C1 — BOM (UTF-8 byte-order mark) at file start prevents frontmatter detection

**File:line:** Same four parsers as B2, same `FRONTMATTER_RE`.

**What's wrong:** A file beginning with `\xEF\xBB\xBF` (UTF-8 BOM, emitted by Windows Notepad, some GitHub editors, and repos where `core.autocrlf` interacts with encoding) causes `/^---/` to fail at position 0 because `^` matches after the BOM character, not before it.

**Concrete failure scenario:** Engineer checks in a `.mdc` file with BOM. Frontmatter is silently ignored; whole file including raw `---` delimiters lands in `body_md`; activation defaults to `manual`.

**Fix:** Strip BOM before any parsing:
```ts
const cleaned = input.content.replace(/^﻿/, "");
```
Apply in each parser's entry point before the frontmatter regex.

**Severity:** Concerning — same class of silent corruption as B2, but less common (BOM is rarer than CRLF on developer machines).

---

### C2 — Hosted endpoint claim in README is false at ship time

**File:line:** `/Users/vtx/agentcontext/README.md:74,84`

**What's wrong:** README says "Try it without installing: https://agentsmd.apimesh.xyz" and "Working CLI + MCP + library + hosted endpoint." SHIP-STATUS.md confirms Conway PR #4 is not yet merged or deployed. Engineers who click the link during or after cold outreach receive a 404 or no response.

**Concrete failure scenario:** Cold outreach email goes out. Engineer reads README. Clicks the link. Gets 404. Assumes the project is abandoned or half-built. First impression damaged.

**Fix:** Either deploy (merge PR #4, flip dep to `^0.1.0`, run `deploy.sh`) before sending outreach — or change the README to "Coming soon: https://agentsmd.apimesh.xyz" until the deploy is live. Do not send the 30 outreach emails until one of these two things is true.

**Severity:** Concerning — reputational. Not a technical bug but directly tied to the cold outreach outcome.

---

### C3 — `agentcontext-mcp` package.json has version 0.1.1 but README and SHIP files say v0.1.0

**File:line:** `/Users/vtx/agentcontext-mcp/package.json:3`

**What's wrong:** The MCP wrapper is at `0.1.1` while the lib is at `0.1.0` and all docs reference `v0.1.0`. Confusing for anyone who reads the source.

**Fix:** Align versions before next publish, or document why they diverged.

**Severity:** Concerning — minor inconsistency but signals rushed ship; engineers who read the source will notice.

---

### C4 — `sync --write` overwrites existing files without `--force` confirmation

**File:line:** `/Users/vtx/agentcontext/src/cli/sync.ts:66-71`

**What's wrong:** The design doc specified "refuses to overwrite without `--force`" but this was not implemented. `sync --write` silently overwrites any existing `.cursor/rules/*.mdc`, `CLAUDE.md`, etc. The dry-run shows a diff, but once the engineer adds `--write`, all files are replaced without a secondary prompt.

**Concrete failure scenario:** Engineer has hand-crafted `.cursor/rules/*.mdc` files with careful `model_decision` activations. They run `sync --write --shims cursor` to add AGENTS.md. All their .mdc files are overwritten with `alwaysApply: true` (since the source is AGENTS.md which has no activation metadata).

**Fix:** Skip files where `existing === content` (already done — shows "unchanged"). For files where `existing !== content`, require an explicit `--force` flag or print a confirmation prompt before overwriting non-new files:
```ts
const needsUpdate = proposed.filter(p => p.existing !== undefined && p.existing !== p.content);
if (needsUpdate.length > 0 && !args.force) {
  console.error(`Would overwrite ${needsUpdate.length} existing files. Pass --force to proceed.`);
  return 1;
}
```

**Severity:** Concerning — data loss potential in the primary write path.

---

### C5 — `detect.ts` W001 check tests the wrong filename (`.clinerules.md` not `.clinerules`)

**File:line:** `/Users/vtx/agentcontext/src/detect.ts:58`

**What's wrong:** The W001 conflict check tests `fs.exists(${rootPath}/.clinerules.md)` to detect the case where both `.clinerules` (file) and `.clinerules/` (dir) exist. But `.clinerules.md` is a completely different filename that has no semantic meaning here. The OS prevents both a file and directory with the identical name `.clinerules` from coexisting on most filesystems, so this check effectively never fires.

**Fix:** The true W001 scenario — both file and dir — cannot coexist on a normal filesystem. The W001 warning makes more sense as a guard emitted when the SAME content appears in both `.clinerules` (file) and `.clinerules/*.md` entries after detection. Either remove the dead check or document that W001 is informational only for the merged-detection case. At minimum, remove the misleading `await fs.exists(".clinerules.md")` call.

**Severity:** Concerning — dead code that signals a misunderstanding of the file-vs-dir conflict. W001 never fires in practice, so users with genuine conflicts get no warning.

---

## NICE-TO-HAVE Issues

### N1 — `IMPORT_LINE_RE` is a module-level stateful `/g` regex shared across calls in `gemini-md.ts`

**File:line:** `/Users/vtx/agentcontext/src/parsers/gemini-md.ts:124`

**What's wrong:** `IMPORT_LINE_RE` is declared with `/g` at module scope. It is called with `.test()` (which advances `lastIndex`) then `.lastIndex = 0` is reset manually, and later with `.matchAll()`. While the current code resets `lastIndex = 0` on line 149 after `test()`, the pattern is fragile. If any future refactor adds a `test()` call without the reset, imports will be silently missed on the segment after the one that matched.

**Fix:** Replace the module-level constant with a factory function:
```ts
function importRe() { return /(^|[\s])@([^\s@]+)/g; }
```
Or use `RegExp` constructor inline at each call site. This eliminates the stateful hazard entirely.

**Severity:** Nice-to-have — not currently broken (the reset is present), but a maintenance trap.

---

### N2 — `segmentByCode` in `gemini-md.ts` closes fences early on info-string lines

**File:line:** `/Users/vtx/agentcontext/src/parsers/gemini-md.ts:109-112`

**What's wrong:** `if (line.startsWith(fenceMarker))` inside the `inFence` branch closes the fence when any line starts with the opening marker string. A line like ` ```typescript` (inside a fenced block showing a nested example) would prematurely close the outer fence at that line, causing the remainder to be treated as prose and @-imports inside the "code" section to be expanded.

**Concrete failure scenario:** A GEMINI.md that documents how to write `.mdc` files includes:
```
```example
Here's a cursor rule:
```ts
@./style.md
```
```
The `@./style.md` would be treated as a prose import and expanded (defeating W031 protection).

**Fix:** Compare the full line (trimmed) against the fence marker, not `startsWith`:
```ts
if (line.trim() === fenceMarker || line.trim().startsWith(fenceMarker + " ")) { ... }
// Actually: CommonMark spec says closing fence is the marker followed by optional spaces only
if (/^(```+|~~~+)\s*$/.test(line) && line.startsWith(fenceMarker)) { ... }
```

**Severity:** Nice-to-have — rare real-world trigger (nested fence examples in GEMINI.md), and the consequence is an @-import being expanded rather than left literal, which is graceful not catastrophic.

---

### N3 — `sync` writes global windsurf rules to `<root>/~/.codeium/...` instead of `$HOME`

**File:line:** `/Users/vtx/agentcontext/src/cli/sync.ts:67`, `/Users/vtx/agentcontext/src/renderers/windsurf-mdc.ts:37`

**What's wrong:** `renderWindsurfMdc` emits path `~/.codeium/windsurf/memories/name.md` for global-scope rules. `sync.ts` then does `join(root, p)` which produces `<root>/~/.codeium/windsurf/memories/name.md` — writing a literal `~` directory inside the repo.

**Concrete failure scenario:** Not currently reachable because `detect.ts` does not scan `~/.codeium/windsurf/memories/` (global windsurf rules aren't ingested). But once that's added (natural v0.2 feature), sync would corrupt repos with a spurious `~/` subdirectory.

**Fix:** In `sync.ts`, detect and expand `~/` paths before the `join`:
```ts
const abs = p.startsWith("~/")
  ? join(process.env.HOME ?? "~", p.slice(2))
  : join(root, p);
```

**Severity:** Nice-to-have — not reachable in v0.1 (global windsurf rules not detected), but will be a blocker when detection is extended.

---

### N4 — `.aider.conf.yml` registered as `conventions-md` format in `detect.ts` creates `detected_formats` double-entry

**File:line:** `/Users/vtx/agentcontext/src/detect.ts:44`

**What's wrong:** `detect.ts` registers `.aider.conf.yml` as format `"conventions-md"`. If a repo has both `CONVENTIONS.md` and `.aider.conf.yml`, `detected_formats` ends up with `["conventions-md", "conventions-md"]`. `inspect` deduplicates via `!merged.detected_formats.includes(f)` in the pipeline... actually it does not — the pipeline only deduplicates per sub-bundle's formats against the merged list. Two separate sub-bundles each pushing `"conventions-md"` would result in a duplicate.

**Fix:** Either assign `.aider.conf.yml` its own format string (`"aider-conf"`) or deduplicate detected_formats in the pipeline with a Set.

**Severity:** Nice-to-have — cosmetic duplication in inspect output; no functional impact.

---

### N5 — No test coverage for CRLF inputs, BOM, or "real-world fixture" round-trip

**File:line:** `/Users/vtx/agentcontext/test/`

**What's wrong:** 62 tests pass, but none exercise: (a) CRLF line endings in frontmatter, (b) BOM-prefixed files, (c) any real-world CLAUDE.md or AGENTS.md beyond the small hand-written fixtures. The round-trip guarantee is tested only against synthetic fixtures that were written specifically to be well-formed.

**Missing test cases to add (specific):**
- `parseCursorMdc`: fixture with `\r\n` line endings in frontmatter — should parse `alwaysApply: true` correctly
- `parseCursorMdc`: fixture with UTF-8 BOM — should not prevent frontmatter detection
- `parseClaudeMd`: round-trip against this repo's actual `CLAUDE.md` (2.5KB, @-imports, code blocks)
- `parseAgentsMd`: AGENTS.md with Windows CRLF throughout
- `parseWindsurfMdc`: `trigger: glob` with CRLF — should produce glob activation, not manual
- `parseClineDir`: directory with a file whose frontmatter has tabs (YAML with tab indentation) — currently graceful but untested

**Severity:** Nice-to-have — the test gap is what allowed B2 to slip through.

---

## README / SHIP-STATUS Drift Summary

| Claim | Status |
|---|---|
| "Working CLI + MCP + library + hosted endpoint" | CLI/MCP/lib: true. Hosted endpoint: NOT deployed. |
| "62 tests passing" | Confirmed true. |
| "11 parsers + 7 renderers + 12 numbered warnings" | Confirmed true. |
| "0 runtime deps beyond `yaml`" | Confirmed true. |
| Round-trip byte-identical for lossless pairs | True for LF files. False for CRLF files (B2). |
| `npx @mbeato/agentcontext inspect` | Fails on machines without bun (B1). |

---

## Automated Fix Priority Order

1. **Fix B2 (CRLF):** Mechanical, 4-line change per parser, HIGH confidence. Add one `replace(/\r\n?/g, "\n")` before frontmatter regex in all four parsers. Add test.
2. **Fix B1 (npx/bun):** Add `bun build --target=node` bundling, point `bin` at `dist/`. Same fix needed in both `agentcontext` and `agentcontext-mcp`. Then republish.
3. **Fix C1 (BOM):** One-liner per parser, HIGH confidence. Add after CRLF fix.
4. **Fix C3 (README hosted claim):** Either deploy or change README copy before outreach.
5. **Fix C4 (--force):** Medium complexity, MEDIUM confidence. Needs test for the "overwrite existing" path.
6. **Fix C5 (W001 dead check):** Low risk to remove the dead `exists(".clinerules.md")` call.
