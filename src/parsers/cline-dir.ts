// Parser: .clinerules/ directory of .md/.txt files.
// Reserved subdirs (workflows/, hooks/, skills/) MUST be skipped — they belong
// to other Cline subsystems (W050).
// Numeric-prefixed files (01-, 02-, ...) define load order; preserved as ordering_hint.
// Optional YAML frontmatter `paths:` for conditional activation per file.

import { parse as parseYaml } from "yaml";
import { join } from "node:path";
import { type Bundle, type Rule, type Activation, ruleId, ruleMetadata, assertValidRule, emptyBundle } from "../ir.ts";
import { canonicalizeMarkdown, normalizeLineEndings } from "../canonicalize.ts";
import { formatWarning } from "../warnings.ts";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;
const RESERVED_SUBDIRS = new Set(["workflows", "hooks", "skills"]);
const NUMERIC_PREFIX = /^(\d+)[-_]/;

export type ListDir = (path: string) => Promise<Array<{ name: string; isDirectory: boolean }>>;
export type ReadFile = (path: string) => Promise<string>;

export type ParseClineDirInput = {
  path: string; // path to the .clinerules directory
  listDir: ListDir;
  readFile: ReadFile;
};

export async function parseClineDir(input: ParseClineDirInput): Promise<Bundle> {
  const bundle = emptyBundle();
  const files: Array<{ name: string; abs: string }> = [];
  await collect(input.path, input.listDir, files, bundle);

  // Sort: numeric prefix first (ascending), then alphabetical.
  files.sort((a, b) => {
    const am = a.name.match(NUMERIC_PREFIX);
    const bm = b.name.match(NUMERIC_PREFIX);
    if (am && bm) return parseInt(am[1]!) - parseInt(bm[1]!);
    if (am) return -1;
    if (bm) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const [i, f] of files.entries()) {
    const raw = await input.readFile(f.abs);
    // CRLF + BOM normalization (QUALITY-REVIEW B2 + C1).
    const content = normalizeLineEndings(raw);
    let frontmatter: Record<string, unknown> = {};
    let body = content;
    const m = content.match(FRONTMATTER_RE);
    if (m) {
      try {
        const parsed = parseYaml(m[1]!);
        if (parsed && typeof parsed === "object") frontmatter = parsed as Record<string, unknown>;
      } catch {
        bundle.warnings.push(`W099: ${f.abs} frontmatter parse failed`);
      }
      body = content.slice(m[0].length);
    }
    const body_md = canonicalizeMarkdown(body);
    if (body_md === "") continue;

    const paths = frontmatter["paths"];
    const isDisabled = Array.isArray(paths) && paths.length === 0;
    const activation = deriveActivation(frontmatter);

    const id = await ruleId("cline-dir", f.abs, body_md);
    const numericMatch = f.name.match(NUMERIC_PREFIX);
    const rule: Rule = {
      id,
      source: { format: "cline-dir", path: f.abs, scope: "workspace" },
      activation,
      body_md,
      precedence_path: pathSegments(f.abs),
      ordering_hint: numericMatch ? parseInt(numericMatch[1]!) : i,
      toggle_state: !isDisabled,
      metadata: ruleMetadata(body_md),
      warnings: [],
    };
    assertValidRule(rule);
    bundle.rules.push(rule);
  }

  bundle.detected_formats.push("cline-dir");
  return bundle;
}

async function collect(
  dir: string,
  listDir: ListDir,
  acc: Array<{ name: string; abs: string }>,
  bundle: Bundle,
): Promise<void> {
  const entries = await listDir(dir);
  for (const e of entries) {
    if (e.isDirectory) {
      if (RESERVED_SUBDIRS.has(e.name)) {
        bundle.warnings.push(formatWarning("W050", `${join(dir, e.name)}`));
        continue;
      }
      await collect(join(dir, e.name), listDir, acc, bundle);
    } else if (e.name.endsWith(".md") || e.name.endsWith(".txt")) {
      acc.push({ name: e.name, abs: join(dir, e.name) });
    }
  }
}

function deriveActivation(fm: Record<string, unknown>): Activation {
  const paths = fm["paths"];
  if (Array.isArray(paths) && paths.length > 0) {
    const patterns = paths.filter((p): p is string => typeof p === "string");
    if (patterns.length > 0) return { kind: "glob", patterns };
  }
  return { kind: "always" };
}

function pathSegments(p: string): string[] {
  const parts = p.split("/");
  parts.pop();
  return parts.filter((s) => s !== "" && s !== ".");
}
