// Parser: .aider.conf.yml — TIER-B (config, not rules).
// Per spec: do NOT round-trip this through AGENTS.md. Only extract:
//   - read: list of file paths to load as actual rules sources
//   - other config keys → bundle.config_extras.aider_conf for renderer reuse
//
// Resolves `read:` entries via supplied readFile + recurses into CONVENTIONS.md
// parser; missing paths emit W020 but don't crash.

import { parse as parseYaml } from "yaml";
import { resolve, dirname, isAbsolute } from "node:path";
import { type Bundle, emptyBundle } from "../ir.ts";
import { formatWarning } from "../warnings.ts";
import { parseConventionsMd } from "./conventions-md.ts";

export type ReadFile = (path: string) => Promise<string>;

export type ParseAiderConfInput = {
  path: string;
  content: string;
  readFile?: ReadFile;
};

export async function parseAiderConf(input: ParseAiderConfInput): Promise<Bundle> {
  const bundle = emptyBundle();
  let parsed: unknown;
  try {
    parsed = parseYaml(input.content);
  } catch {
    bundle.warnings.push("W099: .aider.conf.yml parse failed");
    return bundle;
  }
  if (!parsed || typeof parsed !== "object") return bundle;

  const conf = parsed as Record<string, unknown>;
  bundle.config_extras.aider_conf = conf;

  const readField = conf["read"];
  if (!readField) return bundle;
  const readPaths: string[] = Array.isArray(readField)
    ? readField.filter((p): p is string => typeof p === "string")
    : typeof readField === "string"
      ? [readField]
      : [];

  if (readPaths.length === 0 || !input.readFile) {
    bundle.detected_formats.push("conventions-md");
    return bundle;
  }

  const baseDir = dirname(input.path);
  for (const rel of readPaths) {
    const abs = isAbsolute(rel) ? rel : resolve(baseDir, rel);
    try {
      const content = await input.readFile(abs);
      const sub = await parseConventionsMd({ path: abs, content });
      bundle.rules.push(...sub.rules);
      for (const w of sub.warnings) bundle.warnings.push(w);
    } catch {
      bundle.warnings.push(formatWarning("W020", abs));
    }
  }
  bundle.detected_formats.push("conventions-md");
  return bundle;
}
