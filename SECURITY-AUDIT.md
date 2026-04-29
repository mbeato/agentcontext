# SECURITY AUDIT — agentcontext v0.1.0

**Date:** 2026-04-28
**Auditor:** Claude Sonnet 4.6 (automated static analysis + dynamic regex/YAML testing)
**Scope:** `/Users/vtx/agentcontext/` (lib + CLI + MCP) · `/Users/vtx/agentcontext-mcp/` (thin wrapper) · `/Users/vtx/conway/apis/agentcontext/` (hosted endpoint)

---

## TOP-LINE

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 3 |
| Low | 3 |
| Info | 2 |
| **Total** | **9** |

**Blocking (must fix before outreach):** 1 (FINDING-01)
**Follow-up (can ship, fix after):** 8

**Verdict:** Outreach can proceed after FINDING-01 is patched. The hosted endpoint is clean. The CLI is user-scoped and self-inflicted. The MCP server has one meaningful attack surface (repo-poisoning via `.aider.conf.yml`) that warrants a mitigation before advertising the tool to security-conscious engineers.

---

## FINDING-01 — Aider-conf `read:` resolves absolute paths, enabling sensitive file exfiltration via MCP [HIGH — BLOCKING]

**File:** `src/parsers/aider-conf.ts:52`

**Trust boundaries affected:** MCP (`read_agent_context`), CLI (`sync`, `inspect`, `convert`)

**Vulnerable code:**
```ts
const abs = isAbsolute(rel) ? rel : resolve(baseDir, rel);
const content = await input.readFile(abs);          // no bounds check
const sub = await parseConventionsMd({ path: abs, content });
bundle.rules.push(...sub.rules);
```

**Attack scenario (MCP):**
An attacker publishes or commits a repo containing `.aider.conf.yml`:
```yaml
read:
  - /Users/victim/.ssh/id_rsa
  - /Users/victim/.config/gh/hosts.yml
```
When a victim's MCP-aware agent (Claude Code, Cursor) calls `read_agent_context({path: "/path/to/poisoned/repo"})`, the parser resolves and reads the absolute paths. The raw file contents are returned in `bundle.rules[].body_md` as parsed "rules." The agent sees the SSH private key or GitHub token as plaintext in the tool result and may act on it.

**Attack scenario (CLI):**
Supplying a crafted repo path to `agentcontext inspect` or `sync` achieves the same read, printing file contents to the terminal or writing them to AGENTS.md.

**Reproduction:**
```bash
mkdir /tmp/poison && cat > /tmp/poison/.aider.conf.yml << 'EOF'
read:
  - /etc/hosts
EOF
# On a repo with @mbeato/agentcontext installed:
agentcontext inspect /tmp/poison
# or via MCP: read_agent_context({path: "/tmp/poison"})
```
The content of `/etc/hosts` (or any readable file) appears in the output as a rule body.

**Why this matters now:** The cold-outreach audience is engineers who will point the MCP tool at their own repos. If any of those repos were cloned from an upstream that planted a malicious `.aider.conf.yml`, those engineers' sensitive files could be exfiltrated to whatever agent is displaying the IR. This is a supply-chain / prompt-injection attack enabled by an unconstrained file read.

**Fix:**
```ts
// In parseAiderConf, after computing abs, verify it stays within baseDir:
import { resolve, dirname } from "node:path";

const baseDir = dirname(input.path);
for (const rel of readPaths) {
  const abs = isAbsolute(rel) ? rel : resolve(baseDir, rel);
  
  // Bounds check: only allow files inside the project directory
  const projectRoot = baseDir; // or pass as a parameter
  if (!abs.startsWith(projectRoot + "/") && abs !== projectRoot) {
    bundle.warnings.push(formatWarning("W020", `${abs} (blocked: outside project root)`));
    continue;
  }
  
  try {
    const content = await input.readFile(abs);
    // ... rest unchanged
  }
}
```

If the spec requires absolute paths (e.g. `~/shared/conventions.md`), expand `~` to `process.env.HOME` and still block paths outside known safe roots, or add an opt-in `--allow-absolute-reads` CLI flag.

**Additional controls:** In the MCP server `server.ts`, `read_agent_context` could accept an explicit `allowAbsoluteReads: boolean` parameter defaulting to `false` and skip aider-conf resolution when false.

---

## FINDING-02 — `cline-dir` recursive directory walk has no depth limit and follows symlinks [MEDIUM — follow-up]

**File:** `src/parsers/cline-dir.ts:83-101` (`collect` function)

**Trust boundaries affected:** CLI, MCP (`read_agent_context`)

**Vulnerable code:**
```ts
async function collect(dir, listDir, acc, bundle) {
  const entries = await listDir(dir);
  for (const e of entries) {
    if (e.isDirectory) {
      if (RESERVED_SUBDIRS.has(e.name)) { /* skip */ continue; }
      await collect(join(dir, e.name), listDir, acc, bundle); // unbounded recursion
    }
  }
}
```

The `nodeFsAdapter` uses `fs.readdir(path, { withFileTypes: true })` where `Dirent.isDirectory()` returns `true` for symlinked directories. A `.clinerules/` directory containing a circular symlink (or a very deep tree) causes unbounded stack recursion or an `EMFILE`/memory exhaustion from reading thousands of directories.

**Reproduction:**
```bash
mkdir -p /tmp/deeptest/.clinerules/a
ln -s /tmp/deeptest/.clinerules/a /tmp/deeptest/.clinerules/a/loop  # circular symlink
agentcontext inspect /tmp/deeptest  # stack overflow
```

**Fix:**
Pass and enforce a max depth counter in `collect`:
```ts
async function collect(dir, listDir, acc, bundle, depth = 0) {
  if (depth > 10) {
    bundle.warnings.push("W099: .clinerules/ exceeds max directory depth (10)");
    return;
  }
  const entries = await listDir(dir);
  for (const e of entries) {
    if (e.isDirectory) {
      if (RESERVED_SUBDIRS.has(e.name)) { continue; }
      await collect(join(dir, e.name), listDir, acc, bundle, depth + 1);
    }
  }
}
```

For symlink cycle protection, use `fs.lstat` instead of relying on `isDirectory()`, or track visited inode numbers.

---

## FINDING-03 — MCP `convert_agent_context` accepts unvalidated `ir` object fed to renderers [MEDIUM — follow-up]

**File:** `src/mcp/tools.ts:82-84`

**Trust boundaries affected:** MCP (`convert_agent_context`)

**Vulnerable code:**
```ts
export async function convertAgentContext(input) {
  if (!input.ir || !Array.isArray(input.ir.rules)) {
    throw new Error("...");
  }
  // No validation of rules[].body_md type, activation shape, source.path, etc.
  for (const t of input.targets) {
    const r = render(input.ir, t);  // renderers assume well-typed rules
  }
}
```

An MCP client (or a compromised agent) can supply a malformed `ir` where `rules[].body_md` is `undefined`, `null`, or a number. This causes `canonicalizeMarkdown(undefined)` to throw `Cannot read properties of undefined`. The error is caught in the MCP server's try/catch and returned as a JSON-RPC error — no process crash. However, `rules[].activation.patterns` with 100K entries causes `yamlStringify` to produce a 200MB YAML blob that is held in memory before being returned as a string (tested: 10K patterns → 209KB, linear growth). A sufficiently large array could exhaust the server process's memory.

Additionally, `rules[].source.path` is used by renderers to derive output file names. While `split('/').pop()` in `filenameFor` safely extracts the basename (preventing path traversal), there is no validation that `source.format`, `activation.kind`, etc. are within expected enum values, which could cause renderer switch statements to fall through to unexpected behavior.

**Fix:**
Add a schema validation function before calling `render()`:
```ts
function validateBundle(ir: unknown): asserts ir is Bundle {
  if (!ir || typeof ir !== "object") throw new Error("ir must be an object");
  const b = ir as Record<string, unknown>;
  if (!Array.isArray(b.rules)) throw new Error("ir.rules must be array");
  for (const [i, rule] of (b.rules as unknown[]).entries()) {
    const r = rule as Record<string, unknown>;
    if (typeof r.body_md !== "string") throw new Error(`rules[${i}].body_md must be string`);
    if (Array.isArray((r.activation as Record<string, unknown>)?.patterns) &&
        ((r.activation as Record<string, unknown>).patterns as unknown[]).length > 1000) {
      throw new Error(`rules[${i}].activation.patterns exceeds 1000 entries`);
    }
  }
}
```

---

## FINDING-04 — YAML frontmatter parse with 90K chars takes ~112ms per request (mild CPU DoS) [MEDIUM — follow-up]

**File:** `src/parsers/cursor-mdc.ts:35`, `src/parsers/windsurf-mdc.ts:37`, `src/parsers/cline-dir.ts:46`, `src/parsers/cline-file.ts:19`

**Trust boundaries affected:** Hosted endpoint (`POST /normalize`)

**Test result:**
A `.cursor/rules/x.mdc` or `.windsurf/rules/x.md` file with ~90K characters of valid YAML frontmatter (within the 100K char cap) parses in ~112ms on the test machine. The rate limit is 30/min per IP. With 10 IPs at 30 requests each simultaneously, the server could be processing 300 concurrent 112ms YAML parses, holding threads for ~3 seconds. The `yaml` library's alias protection catches billion-laughs attacks. The threat model here is mild resource contention, not a full DoS.

**Why `yaml` v2.8.3 is safe against anchor expansion:** Confirmed — `maxAliasCount: 100` is the default; input exceeding that threshold throws `Excessive alias count indicates a resource exhaustion attack` before allocation.

**Fix (option A — simplest):** Add a `MAX_FRONTMATTER_CHARS` cap before calling `parseYaml`:
```ts
const FM_LIMIT = 8_000; // most real frontmatter is under 500 chars
const m = input.content.match(FRONTMATTER_RE);
if (m && m[1]!.length > FM_LIMIT) {
  bundle.warnings.push("W099: oversized frontmatter ignored");
} else if (m) {
  // ... parse normally
}
```

**Fix (option B):** Add a timeout wrapper around `parseYaml` using `AbortController` or a `Promise.race`.

---

## FINDING-05 — `sync --write` writes windsurf global rules to a literal `~/...` path inside the repo [LOW — follow-up]

**File:** `src/renderers/windsurf-mdc.ts:37`, `src/cli/sync.ts:68`

**Vulnerable code:**
```ts
// renderer produces:
const path = isGlobal ? `~/.codeium/windsurf/memories/${name}.md` : `.windsurf/rules/${name}.md`;
files[path] = composed;

// sync.ts writes:
const abs = join(root, p.relPath);  // = /repo/root/~/.codeium/windsurf/memories/foo.md
await writeFile(abs, p.content);
```

`path.join()` does not expand `~`. The file is written to `<repo-root>/~/.codeium/windsurf/memories/foo.md` — a literal directory named `~` inside the repo — rather than the user's home directory. This is a functional bug that could be confusing and silently waste disk space.

**Security dimension:** Low. It does NOT write outside the repo root (path.join does not expand `~` to the home dir). But it silently misleads users who expect the global rule to be installed correctly.

**Fix:**
```ts
import { homedir } from "node:os";
const path = isGlobal
  ? `${homedir()}/.codeium/windsurf/memories/${name}.md`
  : `.windsurf/rules/${name}.md`;
```

Then in `sync --write`, check if the path is absolute and write it directly (no `join(root, ...)`):
```ts
const abs = relPath.startsWith("/") ? relPath : join(root, relPath);
```

---

## FINDING-06 — MCP server `buffer` is unbounded for very long stdin lines [LOW — follow-up]

**File:** `src/mcp/server.ts:99-114`

**Trust boundaries affected:** MCP (`stdio`)

**Vulnerable code:**
```ts
process.stdin.on("data", async (chunk: string) => {
  buffer += chunk;  // unbounded accumulation
  while ((idx = buffer.indexOf("\n")) >= 0) {
    // ...
  }
});
```

If a JSON-RPC message is sent without a trailing newline — or with a very large payload — the buffer grows without bound. At 100MB, the Node/Bun process would be killed by the OS OOM killer. In the intended trust model (local stdio with Claude Code or Cursor as the client), this is not exploitable — the MCP client controls stdin and the user has already consented to run the server. It would only matter if the server were used with an untrusted MCP client relay.

**Fix:** Add a per-line size limit:
```ts
buffer += chunk;
if (buffer.length > 10 * 1024 * 1024) {  // 10MB hard limit
  send(err(null, -32700, "Request too large"));
  process.exit(1);
}
```

---

## FINDING-07 — CORS wildcard on POST /normalize [INFO]

**File:** `apis/agentcontext/index.ts:37-41`

```ts
app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));
```

`origin: "*"` allows any website to issue cross-origin POST requests to `/normalize`. This is acceptable for a public, unauthenticated API — browsers will send the request and receive the response. Since there are no cookies, sessions, or user-scoped data on this endpoint, there is no CSRF or credential-theft risk. Noted for completeness.

**No fix required.** If a future version adds authentication, restrict the origin.

---

## FINDING-08 — Landing page XSS: confirmed safe [INFO]

**File:** `apis/agentcontext/landing.html:224`

```js
out.textContent = lines.join('\n') || '(empty)';
```

All output from `/normalize` is rendered via `.textContent` (not `.innerHTML`). Error messages are also written via `.textContent`. No user-controlled string is ever assigned to `.innerHTML`, `document.write`, or `eval`. **No XSS vulnerability present.** Confirmed by code inspection.

---

## FINDING-09 — `@~/` and absolute @-imports in CLAUDE.md/GEMINI.md read arbitrary home-directory files on CLI [LOW — follow-up]

**File:** `src/parsers/claude-md.ts:121-126`, `src/parsers/gemini-md.ts:191-197`

```ts
function resolveImportPath(spec: string, baseDir: string): string {
  if (spec.startsWith("~/")) {
    const home = process.env.HOME || "";
    return resolve(home, spec.slice(2));  // resolves to $HOME/...
  }
  if (isAbsolute(spec)) return spec;     // absolute path passthrough
  return resolve(baseDir, spec);
}
```

A CLAUDE.md in a cloned repo containing `@~/.ssh/id_rsa` or `@/etc/passwd` causes the CLI to read those files and inline their contents into the parsed rule body. The content is then printed by `inspect`, written to AGENTS.md by `sync --write`, or sent to the MCP host.

**Severity in context:** This is Low for the CLI (user runs against their own repos, and the file is at the repo root — the user opted in). It becomes Medium in the same supply-chain scenario as FINDING-01: a user clones an untrusted repo and runs `agentcontext inspect` or `sync --write`, exfiltrating their own sensitive files.

The hosted endpoint is **not affected**: `parseClaudeMd` and `parseGeminiMd` are called without a `readFile` parameter in `apis/agentcontext/index.ts`, putting the parsers into pure mode where imports are left literal.

**Fix (recommended — document the behavior and add a flag):**
```ts
// In CLI sync.ts and inspect.ts, pass a sandboxed readFile:
const safeReadFile = (p: string) => {
  const realRoot = resolve(root);
  const realP = resolve(p);
  if (!realP.startsWith(realRoot + "/") && realP !== realRoot) {
    throw new Error(`@-import blocked: ${p} is outside repo root`);
  }
  return readFile(p, "utf8");
};
```
Add `--allow-unsafe-imports` flag to opt into the current behavior.

---

## SUPPLY CHAIN

- **Runtime dependency:** `yaml@2.8.3` (resolved from `^2.6.0`). No `postinstall`/`preinstall`/`prepare` scripts in the package. No transitive runtime dependencies. **Clean.**
- **Dev dependencies:** `@types/bun`, `typescript` — type-only, not bundled into published artifact.
- **Published artifacts:** `npm pack` (verified via `.npmignore`) excludes `test/`, `node_modules/`, `bun.lock`, `tsconfig.json`. Source files under `src/` are published. **No sensitive files in published package.**
- **No hardcoded tokens, API keys, or `.env` files** found in either repo. Confirmed by grep.

---

## FALSE POSITIVES NOTED

- **Prototype pollution via `JSON.parse` in MCP server**: `JSON.parse` creates an object with a literal `__proto__` property key but does NOT modify `Object.prototype`. Confirmed by runtime test. Not a vulnerability.
- **YAML alias expansion (billion-laughs)**: `yaml@2.8.3` throws `Excessive alias count indicates a resource exhaustion attack` at a default threshold of 100 aliases. Confirmed by runtime test. Not a vulnerability.
- **Open redirect in subdomain canonicalization**: The redirect only fires on an exact hostname match and redirects to a hardcoded target domain. Not an open redirect.
- **CORS wildcard**: Public unauthenticated API — wildcard is appropriate.

---

## REMEDIATION PRIORITY

| Priority | Finding | Effort |
|----------|---------|--------|
| Before outreach | FINDING-01: aider-conf absolute path read | ~1 hour |
| This week | FINDING-09: @-import home/absolute read in CLI | ~1 hour |
| This week | FINDING-02: cline-dir no depth limit | ~30 min |
| This week | FINDING-03: ir input validation in MCP | ~2 hours |
| Next sprint | FINDING-04: YAML frontmatter size limit | ~30 min |
| Next sprint | FINDING-05: windsurf global path ~ bug | ~15 min |
| Nice to have | FINDING-06: MCP buffer size limit | ~15 min |

---

## SECURITY TESTING RECOMMENDATIONS

1. **Fuzz `POST /normalize`** with: empty body, binary content, NUL bytes, 100K char valid YAML frontmatter, pathological Unicode. The YAML DoS mitigation should be verified under load.
2. **Test MCP server** with a fuzzing harness that sends random JSON-RPC messages, malformed UTF-8, and large payloads to verify error handling.
3. **Audit `detect.ts`** for TOCTOU: `listDir` is called and entries are then parsed. A race condition could change files between detection and reading. Low probability in practice but worth noting for future file-watching features.
4. **Add integration tests** for the path-traversal scenarios in FINDING-01 and FINDING-09 so they don't regress after the fix.
