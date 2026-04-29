// Renderer: .cursor/rules/*.mdc
// One file per Rule. Frontmatter derived from Rule.activation.
// File name = source basename if cursor-mdc, else slug from heading or id.

import { stringify as yamlStringify } from "yaml";
import { type Bundle, type Rule, type Activation } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";

export type RenderCursorMdcOutput = {
  files: Record<string, string>;
  warnings: string[];
};

export function renderCursorMdc(bundle: Bundle): RenderCursorMdcOutput {
  const warnings = [...bundle.warnings];
  const files: Record<string, string> = {};
  const usedNames = new Set<string>();

  for (const r of bundle.rules) {
    const name = uniqueName(filenameFor(r), usedNames);
    usedNames.add(name);
    const fm = frontmatterFor(r.activation);
    const body = canonicalizeMarkdown(r.body_md);
    files[`.cursor/rules/${name}.mdc`] = composeFile(fm, body);
  }
  return { files, warnings };
}

function frontmatterFor(a: Activation): Record<string, unknown> {
  switch (a.kind) {
    case "always":
      return { alwaysApply: true };
    case "glob":
      return {
        globs: a.patterns.length === 1 ? a.patterns[0] : a.patterns,
        alwaysApply: false,
      };
    case "model_decision":
      return { description: a.description, alwaysApply: false };
    case "manual":
      return { alwaysApply: false };
  }
}

function composeFile(fm: Record<string, unknown>, body: string): string {
  const fmText = yamlStringify(fm).trimEnd();
  return `---\n${fmText}\n---\n\n${body}`;
}

function filenameFor(r: Rule): string {
  if (r.source.format === "cursor-mdc") {
    const base = (r.source.path.split("/").pop() || "").replace(/\.mdc$/, "");
    if (base) return base;
  }
  const headingMatch = r.body_md.match(/^#\s+(.+)$/m);
  if (headingMatch) return slugify(headingMatch[1]!);
  return `rule-${r.id}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "rule";
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) return name;
  let i = 2;
  while (used.has(`${name}-${i}`)) i++;
  return `${name}-${i}`;
}
