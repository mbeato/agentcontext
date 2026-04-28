// Parser: AGENTS.md
// Day 1 scope: single root file, no nested-file walk-up.
// Spec: agents.md is freeform markdown, no frontmatter, no required schema.
// One file → one Rule. Multiple H2s do not split into multiple Rules — that's
// a render-time decision (the --split flag).

import { type Bundle, type Rule, ruleId, ruleMetadata, assertValidRule, emptyBundle } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";

export type ParseAgentsMdInput = {
  path: string;
  content: string;
};

export async function parseAgentsMd(input: ParseAgentsMdInput): Promise<Bundle> {
  const bundle = emptyBundle();
  const body_md = canonicalizeMarkdown(input.content);

  if (body_md === "") {
    bundle.warnings.push("W099: empty AGENTS.md");
    bundle.detected_formats.push("agents-md");
    return bundle;
  }

  const id = await ruleId("agents-md", input.path, body_md);
  const rule: Rule = {
    id,
    source: { format: "agents-md", path: input.path, scope: "workspace" },
    activation: { kind: "always" },
    body_md,
    precedence_path: pathSegments(input.path),
    metadata: ruleMetadata(body_md),
    warnings: [],
  };
  assertValidRule(rule);
  bundle.rules.push(rule);
  bundle.detected_formats.push("agents-md");
  return bundle;
}

function pathSegments(p: string): string[] {
  // Strip filename, return directory segments. Empty for root file.
  const parts = p.split("/");
  parts.pop();
  return parts.filter((s) => s !== "" && s !== ".");
}
