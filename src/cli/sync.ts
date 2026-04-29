// `agentcontext sync [--write] [--shims a,b,c]` — magic button.
// Detects everything in cwd, normalizes to AGENTS.md (always), optionally
// emits per-tool shims for the formats listed in --shims.
// Without --write, dry-run prints proposed file list + diff summary.

import { resolve, join, dirname } from "node:path";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { type TargetFormat } from "../ir.ts";
import { ingest, render } from "../pipeline.ts";

const SHIM_MAP: Record<string, TargetFormat> = {
  claude: "claude-md",
  gemini: "gemini-md",
  cursor: "cursor-mdc",
  windsurf: "windsurf-mdc",
  cline: "cline-dir",
  aider: "conventions-md",
};

export async function runSync(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const root = resolve(args.path || ".");
  const bundle = await ingest(root);

  if (bundle.rules.length === 0) {
    console.log(`No rules found in ${root}. Nothing to sync.`);
    return 0;
  }

  // Always emit AGENTS.md as the canonical hub.
  const targets: TargetFormat[] = ["agents-md"];
  for (const shim of args.shims) {
    const t = SHIM_MAP[shim];
    if (!t) {
      console.error(`Unknown shim '${shim}'. Valid: ${Object.keys(SHIM_MAP).join(", ")}`);
      return 1;
    }
    if (!targets.includes(t)) targets.push(t);
  }

  const proposed: Array<{ relPath: string; content: string; existing?: string }> = [];
  for (const t of targets) {
    const r = render(bundle, t);
    for (const [p, content] of Object.entries(r.files)) {
      let existing: string | undefined;
      try {
        existing = await readFile(join(root, p), "utf8");
      } catch { /* not present */ }
      proposed.push({ relPath: p, content, existing });
    }
  }

  // Print summary.
  console.log(`Detected: ${bundle.detected_formats.join(", ")}`);
  console.log(`Rules: ${bundle.rules.length}`);
  console.log(`Proposed file changes (${proposed.length}):`);
  for (const p of proposed) {
    const verb = p.existing === undefined ? "create" : p.existing === p.content ? "unchanged" : "update";
    console.log(`  ${verb.padEnd(9)} ${p.relPath}  (${p.content.length} bytes)`);
  }

  if (!args.write) {
    console.log("\n(dry run — pass --write to apply)");
    return 0;
  }

  for (const p of proposed) {
    const abs = join(root, p.relPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, p.content, "utf8");
  }
  console.log(`\nWrote ${proposed.length} file(s).`);
  return 0;
}

type SyncArgs = { write: boolean; shims: string[]; path?: string };

function parseArgs(argv: string[]): SyncArgs {
  const out: SyncArgs = { write: false, shims: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === "--write") out.write = true;
    else if (a === "--shims" && next) { out.shims = next.split(",").map((s) => s.trim()).filter(Boolean); i++; }
    else if (!a.startsWith("--")) out.path = a;
  }
  return out;
}
