// Renderer: CLAUDE.md
// Day 2 scope: emit one root CLAUDE.md from a Bundle.
// Single-rule fast path = body_md verbatim (round-trip-safe for claude-md ↔ claude-md).
// Multi-rule = H2 sections + activation preambles (lossy, W042).
// .claude/rules/*.md path-scoped emission defers to Day 3.

import { type Bundle, type Rule, type Activation } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";

export type RenderClaudeMdOutput = {
  files: Record<string, string>;
  warnings: string[];
};

export function renderClaudeMd(bundle: Bundle): RenderClaudeMdOutput {
  const warnings = [...bundle.warnings];

  if (bundle.rules.length === 0) {
    return { files: { "CLAUDE.md": "" }, warnings };
  }
  if (bundle.rules.length === 1) {
    const r = bundle.rules[0]!;
    return { files: { "CLAUDE.md": canonicalizeMarkdown(r.body_md) }, warnings };
  }

  const parts: string[] = [];
  for (const r of bundle.rules) parts.push(formatSection(r, warnings));
  return { files: { "CLAUDE.md": canonicalizeMarkdown(parts.join("\n\n")) }, warnings };
}

function formatSection(r: Rule, warnings: string[]): string {
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
