// Parser: legacy single-file .clinerules at project root.
// Plain text or markdown, optional YAML frontmatter `paths:` for conditional activation.
// Ingest only — renderer for cline-dir is the modern target; we never write the legacy file.

import { parse as parseYaml } from "yaml";
import { type Bundle, type Rule, type Activation, ruleId, ruleMetadata, assertValidRule, emptyBundle } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

export async function parseClineFile(input: { path: string; content: string }): Promise<Bundle> {
  const bundle = emptyBundle();
  let frontmatter: Record<string, unknown> = {};
  let body = input.content;

  const m = input.content.match(FRONTMATTER_RE);
  if (m) {
    try {
      const parsed = parseYaml(m[1]!);
      if (parsed && typeof parsed === "object") frontmatter = parsed as Record<string, unknown>;
    } catch {
      bundle.warnings.push("W099: cline-file frontmatter parse failed");
    }
    body = input.content.slice(m[0].length);
  }

  const body_md = canonicalizeMarkdown(body);
  if (body_md === "") {
    bundle.warnings.push("W099: empty .clinerules");
    bundle.detected_formats.push("cline-file");
    return bundle;
  }

  const activation = deriveActivation(frontmatter);
  const toggle_state = !(Array.isArray(frontmatter["paths"]) && (frontmatter["paths"] as unknown[]).length === 0);

  const id = await ruleId("cline-file", input.path, body_md);
  const rule: Rule = {
    id,
    source: { format: "cline-file", path: input.path, scope: "workspace" },
    activation,
    body_md,
    precedence_path: pathSegments(input.path),
    toggle_state,
    metadata: ruleMetadata(body_md),
    warnings: [],
  };
  assertValidRule(rule);
  bundle.rules.push(rule);
  bundle.detected_formats.push("cline-file");
  return bundle;
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
