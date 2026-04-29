// Renderer: .windsurf/rules/*.md
// One file per Rule. Frontmatter uses `trigger:` field per Windsurf vocabulary.
// Hard-warns on >12K chars (workspace) or >6K chars (global).

import { stringify as yamlStringify } from "yaml";
import { type Bundle, type Rule, type Activation } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";
import { formatWarning } from "../warnings.ts";

export type RenderWindsurfMdcOutput = {
  files: Record<string, string>;
  warnings: string[];
};

const WORKSPACE_LIMIT = 12_000;
const GLOBAL_LIMIT = 6_000;

export function renderWindsurfMdc(bundle: Bundle): RenderWindsurfMdcOutput {
  const warnings = [...bundle.warnings];
  const files: Record<string, string> = {};
  const usedNames = new Set<string>();

  for (const r of bundle.rules) {
    const isGlobal = r.source.scope === "global";
    const name = uniqueName(filenameFor(r), usedNames);
    usedNames.add(name);
    const fm = frontmatterFor(r.activation, isGlobal);
    const body = canonicalizeMarkdown(r.body_md);
    const composed = fm ? composeFile(fm, body) : body;

    const limit = isGlobal ? GLOBAL_LIMIT : WORKSPACE_LIMIT;
    const code = isGlobal ? "W004" : "W003";
    if (composed.length > limit) {
      warnings.push(formatWarning(code, `${name}.md: ${composed.length} chars > ${limit}`));
    }

    const path = isGlobal ? `~/.codeium/windsurf/memories/${name}.md` : `.windsurf/rules/${name}.md`;
    files[path] = composed;
  }
  return { files, warnings };
}

function frontmatterFor(a: Activation, isGlobal: boolean): Record<string, unknown> | null {
  // Per spec: global rules and root-level always-on rules omit frontmatter.
  if (isGlobal) return null;
  switch (a.kind) {
    case "always":
      return { trigger: "always_on" };
    case "glob":
      return {
        trigger: "glob",
        globs: a.patterns.length === 1 ? a.patterns[0] : a.patterns,
      };
    case "model_decision":
      return { trigger: "model_decision", description: a.description };
    case "manual":
      return { trigger: "manual" };
  }
}

function composeFile(fm: Record<string, unknown>, body: string): string {
  const fmText = yamlStringify(fm).trimEnd();
  return `---\n${fmText}\n---\n\n${body}`;
}

function filenameFor(r: Rule): string {
  if (r.source.format === "windsurf-mdc") {
    const base = (r.source.path.split("/").pop() || "").replace(/\.(md|mdc)$/, "");
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
