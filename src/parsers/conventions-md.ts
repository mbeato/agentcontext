// Parser: CONVENTIONS.md (Aider community pattern).
// Plain markdown, no schema, no frontmatter. Essentially identical to AGENTS.md
// for IR purposes — different format tag for round-trip identity.

import { type Bundle, type Rule, ruleId, ruleMetadata, assertValidRule, emptyBundle } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";

export async function parseConventionsMd(input: { path: string; content: string }): Promise<Bundle> {
  const bundle = emptyBundle();
  const body_md = canonicalizeMarkdown(input.content);

  if (body_md === "") {
    bundle.warnings.push("W099: empty CONVENTIONS.md");
    bundle.detected_formats.push("conventions-md");
    return bundle;
  }

  const id = await ruleId("conventions-md", input.path, body_md);
  const rule: Rule = {
    id,
    source: { format: "conventions-md", path: input.path, scope: "workspace" },
    activation: { kind: "always" },
    body_md,
    precedence_path: pathSegments(input.path),
    metadata: ruleMetadata(body_md),
    warnings: [],
  };
  assertValidRule(rule);
  bundle.rules.push(rule);
  bundle.detected_formats.push("conventions-md");
  return bundle;
}

function pathSegments(p: string): string[] {
  const parts = p.split("/");
  parts.pop();
  return parts.filter((s) => s !== "" && s !== ".");
}
