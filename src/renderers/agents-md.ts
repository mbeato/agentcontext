// Renderer: AGENTS.md
// Day 1 scope: emit one root AGENTS.md.
//   - Single Rule: body_md verbatim (round-trip-safe for agents-md → IR → agents-md).
//   - Multiple Rules: H2 per source rule, italic preamble for activation hints.
//
// AGENTS.md has no frontmatter and no schema. Activation modes from source
// formats collapse into prose preamble lines — this is the documented
// lossy boundary (W042).

import { type Bundle, type Rule, type Activation } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";

export type RenderAgentsMdOutput = {
  files: Record<string, string>; // path → content
  warnings: string[];
};

export function renderAgentsMd(bundle: Bundle): RenderAgentsMdOutput {
  const warnings = [...bundle.warnings];

  if (bundle.rules.length === 0) {
    return { files: { "AGENTS.md": "" }, warnings };
  }

  if (bundle.rules.length === 1) {
    const r = bundle.rules[0]!;
    // Single-rule fast path — preserves byte-identical round-trip from agents-md.
    return { files: { "AGENTS.md": canonicalizeMarkdown(r.body_md) }, warnings };
  }

  // Multi-rule: combine into one file with H2 headers + activation preamble.
  const parts: string[] = [];
  for (const r of bundle.rules) {
    parts.push(formatRuleSection(r, warnings));
  }
  const content = canonicalizeMarkdown(parts.join("\n\n"));
  return { files: { "AGENTS.md": content }, warnings };
}

function formatRuleSection(r: Rule, warnings: string[]): string {
  const heading = headingFromSource(r);
  const preamble = activationPreamble(r.activation);
  const lines: string[] = [`## ${heading}`];
  if (preamble) {
    lines.push("", `*${preamble}*`);
    if (r.activation.kind !== "always") {
      warnings.push(`W042: activation collapsed to prose for rule ${r.id} (${r.source.format})`);
    }
  }
  lines.push("", r.body_md.trim());
  return lines.join("\n");
}

function headingFromSource(r: Rule): string {
  // Prefer last path segment without extension; fall back to id.
  const fname = r.source.path.split("/").pop() || "";
  const base = fname.replace(/\.(md|mdc|txt)$/, "");
  return base || `rule-${r.id}`;
}

function activationPreamble(a: Activation): string | null {
  switch (a.kind) {
    case "always":
      return null;
    case "glob":
      return `Apply when editing files matching: ${a.patterns.join(", ")}`;
    case "model_decision":
      return `Apply when relevant: ${a.description}`;
    case "manual":
      return `Apply on @-mention: @${a.mention}`;
  }
}
