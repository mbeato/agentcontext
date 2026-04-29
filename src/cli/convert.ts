// `agentcontext convert --from <fmt> --to <fmt> [--in path] [--out path]`
// Single-direction conversion. --to all emits every target format.

import { resolve, dirname, join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { type SourceFormat, type TargetFormat, emptyBundle } from "../ir.ts";
import { render, renderMany } from "../pipeline.ts";

import { parseAgentsMd } from "../parsers/agents-md.ts";
import { parseClaudeMd } from "../parsers/claude-md.ts";
import { parseGeminiMd } from "../parsers/gemini-md.ts";
import { parseCursorMdc } from "../parsers/cursor-mdc.ts";
import { parseCursorLegacy } from "../parsers/cursor-legacy.ts";
import { parseWindsurfMdc } from "../parsers/windsurf-mdc.ts";
import { parseWindsurfLegacy } from "../parsers/windsurf-legacy.ts";
import { parseClineFile } from "../parsers/cline-file.ts";
import { parseConventionsMd } from "../parsers/conventions-md.ts";

const ALL_TARGETS: TargetFormat[] = [
  "agents-md",
  "claude-md",
  "gemini-md",
  "cursor-mdc",
  "windsurf-mdc",
  "cline-dir",
  "conventions-md",
];

export async function runConvert(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args.from || !args.to) {
    console.error("usage: agentcontext convert --from <fmt> --to <fmt> [--in <path>] [--out <path>]");
    return 1;
  }
  const inPath = resolve(args.in || ".");
  const outDir = resolve(args.out || ".");

  const bundle = emptyBundle();
  const sub = await parseByFormat(args.from, inPath);
  bundle.rules.push(...sub.rules);
  for (const w of sub.warnings) bundle.warnings.push(w);

  if (bundle.rules.length === 0) {
    console.error(`No rules parsed from ${inPath} as ${args.from}`);
    return 1;
  }

  const targets: TargetFormat[] = args.to === "all" ? ALL_TARGETS : [args.to as TargetFormat];
  const out = renderMany(bundle, targets);

  for (const [relPath, content] of Object.entries(out.files)) {
    const abs = join(outDir, relPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    console.log(`wrote ${abs}  (${content.length} bytes)`);
  }
  for (const w of out.warnings) console.log(w);
  return 0;
}

async function parseByFormat(format: string, path: string): Promise<{ rules: import("../ir.ts").Rule[]; warnings: string[] }> {
  const content = await readFile(path, "utf8");
  const reader = (p: string) => readFile(p, "utf8");
  switch (format as SourceFormat) {
    case "agents-md":
      return parseAgentsMd({ path, content });
    case "claude-md":
      return parseClaudeMd({ path, content, readFile: reader });
    case "gemini-md":
      return parseGeminiMd({ path, content, readFile: reader });
    case "cursor-mdc":
      return parseCursorMdc({ path, content });
    case "cursor-legacy":
      return parseCursorLegacy({ path, content });
    case "windsurf-mdc":
      return parseWindsurfMdc({ path, content });
    case "windsurf-legacy":
      return parseWindsurfLegacy({ path, content });
    case "cline-file":
      return parseClineFile({ path, content });
    case "cline-dir":
      throw new Error("cline-dir requires a directory; not yet wired into convert. Use sync.");
    case "conventions-md":
      return parseConventionsMd({ path, content });
    default:
      throw new Error(`Unknown source format: ${format}`);
  }
}

type ConvertArgs = { from?: string; to?: string; in?: string; out?: string };

function parseArgs(argv: string[]): ConvertArgs {
  const out: ConvertArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === "--from" && next) { out.from = next; i++; }
    else if (a === "--to" && next) { out.to = next; i++; }
    else if (a === "--in" && next) { out.in = next; i++; }
    else if (a === "--out" && next) { out.out = next; i++; }
  }
  // Drive renderMany to consume the import without leaving it dead.
  void render;
  return out;
}
