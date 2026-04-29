// Parser: .windsurf/rules/*.md
// Spec: YAML frontmatter with `trigger:` field (different vocabulary from cursor-mdc):
//   trigger: always_on        → always
//   trigger: glob   + globs   → glob
//   trigger: model_decision   → model_decision
//   trigger: manual           → manual
//
// Hard char limits (load-bearing per agent-context-formats-spec):
//   workspace rule: 12,000 chars  (W003)
//   global rule:     6,000 chars  (W004)
// We warn on parse — actual truncation happens server-side at Windsurf.

import { parse as parseYaml } from "yaml";
import { basename } from "node:path";
import { type Bundle, type Rule, type Activation, ruleId, ruleMetadata, assertValidRule, emptyBundle } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";
import { formatWarning } from "../warnings.ts";

export type ParseWindsurfMdcInput = {
  path: string;
  content: string;
  scope?: "workspace" | "global"; // global rules have lower char limit
};

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;
const WORKSPACE_LIMIT = 12_000;
const GLOBAL_LIMIT = 6_000;

export async function parseWindsurfMdc(input: ParseWindsurfMdcInput): Promise<Bundle> {
  const bundle = emptyBundle();
  let frontmatter: Record<string, unknown> = {};
  let body = input.content;

  const m = input.content.match(FRONTMATTER_RE);
  if (m) {
    try {
      const parsed = parseYaml(m[1]!);
      if (parsed && typeof parsed === "object") frontmatter = parsed as Record<string, unknown>;
    } catch {
      bundle.warnings.push("W099: windsurf-mdc frontmatter parse failed; treating as body");
    }
    body = input.content.slice(m[0].length);
  }

  const body_md = canonicalizeMarkdown(body);
  const scope = input.scope ?? "workspace";
  const limit = scope === "global" ? GLOBAL_LIMIT : WORKSPACE_LIMIT;
  const code = scope === "global" ? "W004" : "W003";

  if (body_md.length > limit) {
    bundle.warnings.push(formatWarning(code, `${input.path}: ${body_md.length} chars > ${limit}`));
  }

  const activation = deriveActivation(frontmatter, input.path);
  if (body_md === "" && activation.kind === "manual") {
    bundle.warnings.push(`W099: empty windsurf-mdc rule at ${input.path}`);
    bundle.detected_formats.push("windsurf-mdc");
    return bundle;
  }

  const id = await ruleId("windsurf-mdc", input.path, body_md);
  const rule: Rule = {
    id,
    source: { format: "windsurf-mdc", path: input.path, scope: scope === "global" ? "global" : "workspace" },
    activation,
    body_md,
    precedence_path: pathSegments(input.path),
    metadata: ruleMetadata(body_md),
    warnings: [],
  };
  assertValidRule(rule);
  bundle.rules.push(rule);
  bundle.detected_formats.push("windsurf-mdc");
  return bundle;
}

function deriveActivation(fm: Record<string, unknown>, path: string): Activation {
  const trigger = typeof fm["trigger"] === "string" ? (fm["trigger"] as string).trim() : "";
  const description = typeof fm["description"] === "string" ? (fm["description"] as string).trim() : "";
  const patterns = normalizeGlobs(fm["globs"]);

  switch (trigger) {
    case "always_on":
      return { kind: "always" };
    case "glob":
      if (patterns.length > 0) return { kind: "glob", patterns };
      return { kind: "always" }; // degenerate: glob trigger w/ no patterns
    case "model_decision":
      if (description) return { kind: "model_decision", description };
      return { kind: "always" };
    case "manual":
      return { kind: "manual", mention: basename(path).replace(/\.(md|mdc)$/, "") };
  }
  // No trigger field — root-level workspace rules treat as always-on per spec.
  if (patterns.length > 0) return { kind: "glob", patterns };
  if (description) return { kind: "model_decision", description };
  return { kind: "always" };
}

function normalizeGlobs(g: unknown): string[] {
  if (!g) return [];
  if (typeof g === "string") return g.split(",").map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(g))
    return g.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean);
  return [];
}

function pathSegments(p: string): string[] {
  const parts = p.split("/");
  parts.pop();
  return parts.filter((s) => s !== "" && s !== ".");
}
