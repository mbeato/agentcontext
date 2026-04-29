// Parser: legacy `.windsurfrules` (single root file, pre-Wave 8).
// INGEST ONLY. Modern target is .windsurf/rules/*.md.

import { type Bundle, type Rule, ruleId, ruleMetadata, assertValidRule, emptyBundle } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";
import { formatWarning } from "../warnings.ts";

const WORKSPACE_LIMIT = 12_000;

export async function parseWindsurfLegacy(input: { path: string; content: string }): Promise<Bundle> {
  const bundle = emptyBundle();
  const body_md = canonicalizeMarkdown(input.content);

  if (body_md === "") {
    bundle.warnings.push("W099: empty .windsurfrules");
    bundle.detected_formats.push("windsurf-legacy");
    return bundle;
  }
  if (body_md.length > WORKSPACE_LIMIT) {
    bundle.warnings.push(formatWarning("W003", `${input.path}: ${body_md.length} chars > ${WORKSPACE_LIMIT}`));
  }

  const id = await ruleId("windsurf-legacy", input.path, body_md);
  const rule: Rule = {
    id,
    source: { format: "windsurf-legacy", path: input.path, scope: "workspace" },
    activation: { kind: "always" },
    body_md,
    precedence_path: pathSegments(input.path),
    metadata: ruleMetadata(body_md),
    warnings: [],
  };
  assertValidRule(rule);
  bundle.rules.push(rule);
  bundle.detected_formats.push("windsurf-legacy");
  return bundle;
}

function pathSegments(p: string): string[] {
  const parts = p.split("/");
  parts.pop();
  return parts.filter((s) => s !== "" && s !== ".");
}
