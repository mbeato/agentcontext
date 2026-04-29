// Renderer: .clinerules/ directory of .md files.
// Numeric-prefixed for deterministic load order (01-, 02-, ...).
// Disabled rules (toggle_state === false) emit `paths: []` per spec.

import { stringify as yamlStringify } from "yaml";
import { type Bundle, type Rule, type Activation } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";

export type RenderClineDirOutput = {
  files: Record<string, string>;
  warnings: string[];
};

export function renderClineDir(bundle: Bundle): RenderClineDirOutput {
  const warnings = [...bundle.warnings];
  const files: Record<string, string> = {};
  const usedNames = new Set<string>();

  // Sort by ordering_hint (when present) for deterministic file numbering.
  const sorted = [...bundle.rules].sort((a, b) => {
    const ah = a.ordering_hint ?? Number.MAX_SAFE_INTEGER;
    const bh = b.ordering_hint ?? Number.MAX_SAFE_INTEGER;
    return ah - bh;
  });

  for (const [i, r] of sorted.entries()) {
    const baseName = filenameFor(r);
    const prefix = String(i + 1).padStart(2, "0");
    const name = uniqueName(`${prefix}-${baseName}`, usedNames);
    usedNames.add(name);

    const fm = frontmatterFor(r.activation, r.toggle_state ?? true);
    const body = canonicalizeMarkdown(r.body_md);
    const composed = fm ? composeFile(fm, body) : body;
    files[`.clinerules/${name}.md`] = composed;
  }
  return { files, warnings };
}

function frontmatterFor(a: Activation, enabled: boolean): Record<string, unknown> | null {
  if (!enabled) return { paths: [] };
  switch (a.kind) {
    case "always":
      return null;
    case "glob":
      return { paths: a.patterns };
    case "model_decision":
      return null;
    case "manual":
      return null;
  }
}

function composeFile(fm: Record<string, unknown>, body: string): string {
  const fmText = yamlStringify(fm).trimEnd();
  return `---\n${fmText}\n---\n\n${body}`;
}

function filenameFor(r: Rule): string {
  if (r.source.format === "cline-dir" || r.source.format === "cline-file") {
    const base = (r.source.path.split("/").pop() || "").replace(/\.(md|txt)$/, "");
    if (base) return base.replace(/^\d+[-_]/, "");
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
