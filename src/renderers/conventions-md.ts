// Renderer: CONVENTIONS.md (Aider).
// Single flat markdown file. Plus an .aider.conf.yml snippet that sets
// `read: [CONVENTIONS.md]` and `cache-prompts: true` — but never overwrites
// existing keys (caller merges).

import { stringify as yamlStringify } from "yaml";
import { type Bundle, type Rule, type Activation } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";

export type RenderConventionsMdOutput = {
  files: Record<string, string>;
  warnings: string[];
  /** Snippet for .aider.conf.yml — caller responsible for merging into existing config. */
  aider_conf_snippet: Record<string, unknown>;
};

export function renderConventionsMd(bundle: Bundle): RenderConventionsMdOutput {
  const warnings = [...bundle.warnings];

  if (bundle.rules.length === 0) {
    return {
      files: { "CONVENTIONS.md": "" },
      warnings,
      aider_conf_snippet: { read: ["CONVENTIONS.md"], "cache-prompts": true },
    };
  }
  if (bundle.rules.length === 1) {
    const r = bundle.rules[0]!;
    return {
      files: { "CONVENTIONS.md": canonicalizeMarkdown(r.body_md) },
      warnings,
      aider_conf_snippet: { read: ["CONVENTIONS.md"], "cache-prompts": true },
    };
  }

  const parts: string[] = [];
  for (const r of bundle.rules) parts.push(formatSection(r, warnings));
  return {
    files: { "CONVENTIONS.md": canonicalizeMarkdown(parts.join("\n\n")) },
    warnings,
    aider_conf_snippet: { read: ["CONVENTIONS.md"], "cache-prompts": true },
  };
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

/** Helper for callers wanting a literal .aider.conf.yml file string. */
export function aiderConfYaml(snippet: Record<string, unknown>): string {
  return yamlStringify(snippet);
}
