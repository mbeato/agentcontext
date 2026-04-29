// Parser: legacy `.cursorrules` (single root file).
// INGEST ONLY. Per spec, the renderer must NEVER emit .cursorrules — it's
// silently ignored by Cursor in Agent mode. Convert these into IR and emit
// .cursor/rules/*.mdc instead.

import { type Bundle, type Rule, ruleId, ruleMetadata, assertValidRule, emptyBundle } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";

export async function parseCursorLegacy(input: { path: string; content: string }): Promise<Bundle> {
  const bundle = emptyBundle();
  const body_md = canonicalizeMarkdown(input.content);

  if (body_md === "") {
    bundle.warnings.push("W099: empty .cursorrules");
    bundle.detected_formats.push("cursor-legacy");
    return bundle;
  }

  const id = await ruleId("cursor-legacy", input.path, body_md);
  const rule: Rule = {
    id,
    source: { format: "cursor-legacy", path: input.path, scope: "workspace" },
    activation: { kind: "always" },
    body_md,
    precedence_path: pathSegments(input.path),
    metadata: ruleMetadata(body_md),
    warnings: [],
  };
  assertValidRule(rule);
  bundle.rules.push(rule);
  bundle.detected_formats.push("cursor-legacy");
  return bundle;
}

function pathSegments(p: string): string[] {
  const parts = p.split("/");
  parts.pop();
  return parts.filter((s) => s !== "" && s !== ".");
}
