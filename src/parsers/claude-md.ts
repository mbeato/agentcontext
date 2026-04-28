// Parser: CLAUDE.md
// Day 1 scope: single CLAUDE.md file with @-import resolution (max 5 hops).
// Defers to Day 2: .claude/rules/*.md path-scoped rules, walked-up project files,
// user-level ~/.claude/CLAUDE.md, managed-policy files.
//
// Spec: free-form markdown, no required schema. HTML block-level comments are
// stripped by Claude Code at injection time — we preserve them in the IR
// (round-trip needs them). The renderer can drop them on emit if desired.

import { resolve, dirname, isAbsolute } from "node:path";
import { type Bundle, type Rule, ruleId, ruleMetadata, assertValidRule, emptyBundle } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";
import { formatWarning } from "../warnings.ts";

const MAX_IMPORT_DEPTH = 5;

export type ReadFile = (path: string) => Promise<string>;

export type ParseClaudeMdInput = {
  path: string;
  content: string;
  readFile?: ReadFile; // optional — pure parser when omitted (no import resolution)
};

export async function parseClaudeMd(input: ParseClaudeMdInput): Promise<Bundle> {
  const bundle = emptyBundle();
  const expanded = await expandImports(
    input.content,
    input.path,
    input.readFile,
    new Set(),
    0,
    bundle,
  );
  const body_md = canonicalizeMarkdown(expanded);

  if (body_md === "") {
    bundle.warnings.push("W099: empty CLAUDE.md");
    bundle.detected_formats.push("claude-md");
    return bundle;
  }

  const id = await ruleId("claude-md", input.path, body_md);
  const rule: Rule = {
    id,
    source: { format: "claude-md", path: input.path, scope: "workspace" },
    activation: { kind: "always" },
    body_md,
    precedence_path: pathSegments(input.path),
    metadata: ruleMetadata(body_md),
    warnings: [],
  };
  assertValidRule(rule);
  bundle.rules.push(rule);
  bundle.detected_formats.push("claude-md");
  return bundle;
}

// Match @-imports. Only block-form (start of line or after whitespace).
// Spec note: imports inside fenced code blocks are NOT skipped per current
// Claude docs — only HTML comments get stripped. We follow doc behavior.
const IMPORT_LINE_RE = /(^|[\s])@([^\s@]+)/g;

async function expandImports(
  content: string,
  filePath: string,
  readFile: ReadFile | undefined,
  visited: Set<string>,
  depth: number,
  bundle: Bundle,
): Promise<string> {
  if (!readFile) return content; // pure mode — leave imports literal

  if (depth >= MAX_IMPORT_DEPTH) {
    bundle.warnings.push(formatWarning("W030", `at depth ${depth} in ${filePath}`));
    return content;
  }

  const baseDir = dirname(filePath);
  let result = "";
  let lastIndex = 0;

  // Use a manual scan so async readFile awaits work cleanly in order.
  const matches: Array<{ match: string; spec: string; index: number; lead: string }> = [];
  for (const m of content.matchAll(IMPORT_LINE_RE)) {
    matches.push({ match: m[0]!, spec: m[2]!, index: m.index!, lead: m[1]! });
  }

  for (const m of matches) {
    result += content.slice(lastIndex, m.index);
    const importPath = resolveImportPath(m.spec, baseDir);
    if (visited.has(importPath)) {
      result += m.match; // circular — leave literal
      lastIndex = m.index + m.match.length;
      continue;
    }
    try {
      const importedRaw = await readFile(importPath);
      const nextVisited = new Set(visited);
      nextVisited.add(importPath);
      const importedExpanded = await expandImports(
        importedRaw,
        importPath,
        readFile,
        nextVisited,
        depth + 1,
        bundle,
      );
      result += m.lead + importedExpanded;
    } catch {
      // import target not found — leave literal, don't crash
      result += m.match;
    }
    lastIndex = m.index + m.match.length;
  }
  result += content.slice(lastIndex);
  return result;
}

function resolveImportPath(spec: string, baseDir: string): string {
  if (spec.startsWith("~/")) {
    const home = process.env.HOME || "";
    return resolve(home, spec.slice(2));
  }
  if (isAbsolute(spec)) return spec;
  return resolve(baseDir, spec);
}

function pathSegments(p: string): string[] {
  const parts = p.split("/");
  parts.pop();
  return parts.filter((s) => s !== "" && s !== ".");
}
