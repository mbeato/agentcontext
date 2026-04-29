// Pipeline: orchestrates detect → parse → merge into a single Bundle.
// Then optionally renders to N target formats.

import { readFile as fsReadFile } from "node:fs/promises";
import { type Bundle, type SourceFormat, type TargetFormat, emptyBundle } from "./ir.ts";
import { detect, type FsAdapter, nodeFsAdapter } from "./detect.ts";

import { parseAgentsMd } from "./parsers/agents-md.ts";
import { parseClaudeMd } from "./parsers/claude-md.ts";
import { parseGeminiMd } from "./parsers/gemini-md.ts";
import { parseCursorMdc } from "./parsers/cursor-mdc.ts";
import { parseCursorLegacy } from "./parsers/cursor-legacy.ts";
import { parseWindsurfMdc } from "./parsers/windsurf-mdc.ts";
import { parseWindsurfLegacy } from "./parsers/windsurf-legacy.ts";
import { parseClineFile } from "./parsers/cline-file.ts";
import { parseClineDir } from "./parsers/cline-dir.ts";
import { parseConventionsMd } from "./parsers/conventions-md.ts";
import { parseAiderConf } from "./parsers/aider-conf.ts";

import { renderAgentsMd } from "./renderers/agents-md.ts";
import { renderClaudeMd } from "./renderers/claude-md.ts";
import { renderGeminiMd } from "./renderers/gemini-md.ts";
import { renderCursorMdc } from "./renderers/cursor-mdc.ts";
import { renderWindsurfMdc } from "./renderers/windsurf-mdc.ts";
import { renderClineDir } from "./renderers/cline-dir.ts";
import { renderConventionsMd } from "./renderers/conventions-md.ts";

export type ReadDirContents = (path: string) => Promise<Array<{ name: string; isDirectory: boolean }>>;

export type IngestOptions = {
  fs?: FsAdapter;
  readFile?: (p: string) => Promise<string>;
  listDir?: ReadDirContents;
};

export async function ingest(rootPath: string, opts: IngestOptions = {}): Promise<Bundle> {
  const fs = opts.fs ?? (await nodeFsAdapter());
  const readFile = opts.readFile ?? ((p: string) => fsReadFile(p, "utf8"));
  const listDir = opts.listDir ?? fs.listDir;

  const detection = await detect(rootPath, fs);
  const merged = emptyBundle();
  for (const w of detection.warnings) merged.warnings.push(w);

  for (const file of detection.files) {
    const sub = await parseSingle(file.format, file.path, readFile, listDir);
    merged.rules.push(...sub.rules);
    for (const w of sub.warnings) merged.warnings.push(w);
    if (sub.config_extras.aider_conf) merged.config_extras.aider_conf = sub.config_extras.aider_conf;
    for (const f of sub.detected_formats) {
      if (!merged.detected_formats.includes(f)) merged.detected_formats.push(f);
    }
  }
  return merged;
}

async function parseSingle(
  format: SourceFormat,
  path: string,
  readFile: (p: string) => Promise<string>,
  listDir: ReadDirContents,
): Promise<Bundle> {
  switch (format) {
    case "agents-md": {
      const content = await readFile(path);
      return parseAgentsMd({ path, content });
    }
    case "claude-md": {
      const content = await readFile(path);
      return parseClaudeMd({ path, content, readFile });
    }
    case "gemini-md": {
      const content = await readFile(path);
      return parseGeminiMd({ path, content, readFile });
    }
    case "cursor-mdc": {
      const content = await readFile(path);
      return parseCursorMdc({ path, content });
    }
    case "cursor-legacy": {
      const content = await readFile(path);
      return parseCursorLegacy({ path, content });
    }
    case "windsurf-mdc": {
      const content = await readFile(path);
      return parseWindsurfMdc({ path, content });
    }
    case "windsurf-legacy": {
      const content = await readFile(path);
      return parseWindsurfLegacy({ path, content });
    }
    case "cline-file": {
      const content = await readFile(path);
      return parseClineFile({ path, content });
    }
    case "cline-dir": {
      return parseClineDir({ path, listDir, readFile });
    }
    case "conventions-md": {
      // Detection routes both CONVENTIONS.md and .aider.conf.yml here.
      // .aider.conf.yml is YAML; CONVENTIONS.md is markdown. Distinguish by extension.
      const content = await readFile(path);
      if (path.endsWith(".aider.conf.yml") || path.endsWith("aider.conf.yml")) {
        return parseAiderConf({ path, content, readFile });
      }
      return parseConventionsMd({ path, content });
    }
  }
}

export type RenderOutput = {
  files: Record<string, string>;
  warnings: string[];
};

export type RenderOptions = {
  /** Optional .aider.conf.yml snippet to merge when emitting conventions-md. */
  preserveAiderConf?: boolean;
};

export function render(bundle: Bundle, target: TargetFormat, _opts: RenderOptions = {}): RenderOutput {
  switch (target) {
    case "agents-md":
      return renderAgentsMd(bundle);
    case "claude-md":
      return renderClaudeMd(bundle);
    case "gemini-md":
      return renderGeminiMd(bundle);
    case "cursor-mdc":
      return renderCursorMdc(bundle);
    case "windsurf-mdc":
      return renderWindsurfMdc(bundle);
    case "cline-dir":
      return renderClineDir(bundle);
    case "conventions-md": {
      const { files, warnings } = renderConventionsMd(bundle);
      return { files, warnings };
    }
  }
}

/** Convenience: render to many targets, merging into one file map. */
export function renderMany(bundle: Bundle, targets: TargetFormat[]): RenderOutput {
  const files: Record<string, string> = {};
  const warnings: string[] = [];
  for (const t of targets) {
    const r = render(bundle, t);
    Object.assign(files, r.files);
    for (const w of r.warnings) warnings.push(w);
  }
  return { files, warnings };
}
