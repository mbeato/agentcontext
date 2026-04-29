// `agentcontext inspect [path]` — wedge demo command.
// Output: detected formats, rule count per format, total chars, warnings.
// Designed to be screenshot-able and copy-paste-able into cold outreach.

import { resolve } from "node:path";
import { ingest } from "../pipeline.ts";
import { severityOf } from "../warnings.ts";
import { type Activation } from "../ir.ts";

export async function runInspect(argv: string[]): Promise<number> {
  const path = resolve(argv[0] || ".");
  const bundle = await ingest(path);

  const lines: string[] = [];
  lines.push(`agentcontext inspect ${path}`);
  lines.push("");

  if (bundle.detected_formats.length === 0) {
    lines.push("No agent-context files detected.");
    lines.push("");
    lines.push("Looking for: AGENTS.md, CLAUDE.md, GEMINI.md, .cursor/rules/, .cursorrules,");
    lines.push("             .windsurf/rules/, .windsurfrules, .clinerules (file or dir),");
    lines.push("             CONVENTIONS.md, .aider.conf.yml");
    console.log(lines.join("\n"));
    return 0;
  }

  lines.push(`Detected formats: ${bundle.detected_formats.join(", ")}`);
  lines.push(`Total rules: ${bundle.rules.length}`);
  lines.push("");

  // Per-format breakdown
  const byFormat = new Map<string, typeof bundle.rules>();
  for (const r of bundle.rules) {
    if (!byFormat.has(r.source.format)) byFormat.set(r.source.format, []);
    byFormat.get(r.source.format)!.push(r);
  }
  for (const [fmt, rs] of byFormat) {
    const totalChars = rs.reduce((s, r) => s + r.metadata.char_count, 0);
    lines.push(`  ${fmt}: ${rs.length} rule(s), ${totalChars.toLocaleString()} chars`);
    for (const r of rs) {
      const act = describeActivation(r.activation);
      const rel = r.source.path.replace(path + "/", "");
      lines.push(`    - ${rel}  [${act}]`);
    }
  }

  // Warnings, grouped by severity.
  const errors: string[] = [];
  const warns: string[] = [];
  const infos: string[] = [];
  for (const w of bundle.warnings) {
    const sev = severityOf(w);
    if (sev === "error") errors.push(w);
    else if (sev === "warn") warns.push(w);
    else infos.push(w);
  }
  if (errors.length || warns.length || infos.length) {
    lines.push("");
    if (errors.length) {
      lines.push(`Errors (${errors.length}):`);
      for (const w of errors) lines.push(`  ${w}`);
    }
    if (warns.length) {
      lines.push(`Warnings (${warns.length}):`);
      for (const w of warns) lines.push(`  ${w}`);
    }
    if (infos.length) {
      lines.push(`Info (${infos.length}):`);
      for (const w of infos) lines.push(`  ${w}`);
    }
  }

  lines.push("");
  lines.push(`Next: agentcontext sync --write   # normalize to AGENTS.md + per-tool shims`);
  console.log(lines.join("\n"));
  return errors.length > 0 ? 1 : 0;
}

function describeActivation(a: Activation): string {
  switch (a.kind) {
    case "always":
      return "always";
    case "glob":
      return `glob: ${a.patterns.join(",")}`;
    case "model_decision":
      return `model_decision: ${a.description}`;
    case "manual":
      return `manual: @${a.mention}`;
  }
}
