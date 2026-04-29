export * from "./ir.ts";
export * from "./warnings.ts";
export { canonicalizeMarkdown } from "./canonicalize.ts";

// Parsers
export { parseAgentsMd } from "./parsers/agents-md.ts";
export { parseClaudeMd } from "./parsers/claude-md.ts";
export { parseGeminiMd } from "./parsers/gemini-md.ts";
export { parseCursorMdc } from "./parsers/cursor-mdc.ts";
export { parseCursorLegacy } from "./parsers/cursor-legacy.ts";
export { parseWindsurfMdc } from "./parsers/windsurf-mdc.ts";
export { parseWindsurfLegacy } from "./parsers/windsurf-legacy.ts";
export { parseClineFile } from "./parsers/cline-file.ts";
export { parseClineDir } from "./parsers/cline-dir.ts";
export { parseConventionsMd } from "./parsers/conventions-md.ts";
export { parseAiderConf } from "./parsers/aider-conf.ts";

// Renderers
export { renderAgentsMd } from "./renderers/agents-md.ts";
export { renderClaudeMd } from "./renderers/claude-md.ts";
export { renderGeminiMd } from "./renderers/gemini-md.ts";
export { renderCursorMdc } from "./renderers/cursor-mdc.ts";
export { renderWindsurfMdc } from "./renderers/windsurf-mdc.ts";
export { renderClineDir } from "./renderers/cline-dir.ts";
export { renderConventionsMd, aiderConfYaml } from "./renderers/conventions-md.ts";

// Pipeline
export { detect, nodeFsAdapter, type FsAdapter, type DirEntry } from "./detect.ts";
export { ingest, render, renderMany, type RenderOutput } from "./pipeline.ts";
