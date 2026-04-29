// Parser: .cursor/rules/*.mdc
// Day 1 scope: single .mdc file. Directory walk and nested .cursor/rules/ defer to Day 2.
//
// Spec: YAML frontmatter (delimited by ---) with three documented fields:
//   description: string  — used in "model_decision" mode
//   globs:       string | string[]  — file-pattern matcher
//   alwaysApply: boolean — if true, always include
//
// Activation derivation (per spec):
//   alwaysApply: true                              → always
//   globs set                                      → glob
//   alwaysApply: false + description, no globs     → model_decision
//   no alwaysApply, no globs, no description       → manual (@-mention)

import { parse as parseYaml } from "yaml";
import { type Bundle, type Rule, type Activation, ruleId, ruleMetadata, assertValidRule, emptyBundle } from "../ir.ts";
import { canonicalizeMarkdown, normalizeLineEndings } from "../canonicalize.ts";
import { basename } from "node:path";

export type ParseCursorMdcInput = {
  path: string;
  content: string;
};

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

export async function parseCursorMdc(input: ParseCursorMdcInput): Promise<Bundle> {
  const bundle = emptyBundle();
  let frontmatter: Record<string, unknown> = {};
  // Normalize line endings + strip BOM so CRLF / Windows / BOM-prefixed files
  // don't silently bypass the frontmatter regex (QUALITY-REVIEW B2 + C1).
  const normalized = normalizeLineEndings(input.content);
  let body = normalized;

  const m = normalized.match(FRONTMATTER_RE);
  if (m) {
    try {
      const parsed = parseYaml(m[1]!);
      if (parsed && typeof parsed === "object") {
        frontmatter = parsed as Record<string, unknown>;
      }
    } catch {
      bundle.warnings.push("W099: cursor-mdc frontmatter parse failed; treating as body");
    }
    body = normalized.slice(m[0].length);
  }

  const body_md = canonicalizeMarkdown(body);
  const activation = deriveActivation(frontmatter, input.path);

  if (body_md === "" && activation.kind === "manual") {
    bundle.warnings.push(`W099: empty cursor-mdc rule at ${input.path}`);
    bundle.detected_formats.push("cursor-mdc");
    return bundle;
  }

  const id = await ruleId("cursor-mdc", input.path, body_md);
  const rule: Rule = {
    id,
    source: { format: "cursor-mdc", path: input.path, scope: "workspace" },
    activation,
    body_md,
    precedence_path: pathSegments(input.path),
    metadata: ruleMetadata(body_md),
    warnings: [],
  };
  assertValidRule(rule);
  bundle.rules.push(rule);
  bundle.detected_formats.push("cursor-mdc");
  return bundle;
}

function deriveActivation(fm: Record<string, unknown>, path: string): Activation {
  const alwaysApply = fm["alwaysApply"] === true;
  const globsRaw = fm["globs"];
  const description = typeof fm["description"] === "string" ? (fm["description"] as string).trim() : "";

  if (alwaysApply) return { kind: "always" };

  const patterns = normalizeGlobs(globsRaw);
  if (patterns.length > 0) return { kind: "glob", patterns };

  if (description) return { kind: "model_decision", description };

  // Manual: rule activated by @-mention. Mention name = filename without .mdc.
  const name = basename(path).replace(/\.mdc$/, "");
  return { kind: "manual", mention: name };
}

function normalizeGlobs(g: unknown): string[] {
  if (!g) return [];
  if (typeof g === "string") {
    return g.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(g)) {
    return g.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function pathSegments(p: string): string[] {
  const parts = p.split("/");
  parts.pop();
  return parts.filter((s) => s !== "" && s !== ".");
}
