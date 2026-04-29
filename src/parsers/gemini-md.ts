// Parser: GEMINI.md
// Like CLAUDE.md but @-imports are CODE-BLOCK-AWARE (per gemini-cli/marked).
// Imports inside fenced code blocks (```...```) and inline code (`...`)
// are explicitly NOT expanded (W031).
//
// Day 1 scope: single GEMINI.md file. Walked-up workspace files + JIT loading
// defer to Day 3 if at all (rarely needed for the wedge).
//
// Spec: free-form markdown, no schema. Reserved section "## Gemini Added Memories"
// must be preserved verbatim by any round-trip — it's where save_memory writes.

import { resolve, dirname, isAbsolute } from "node:path";
import { type Bundle, type Rule, ruleId, ruleMetadata, assertValidRule, emptyBundle } from "../ir.ts";
import { canonicalizeMarkdown } from "../canonicalize.ts";
import { formatWarning } from "../warnings.ts";

const MAX_IMPORT_DEPTH = 5;

export type ReadFile = (path: string) => Promise<string>;

export type ParseGeminiMdInput = {
  path: string;
  content: string;
  readFile?: ReadFile;
};

export async function parseGeminiMd(input: ParseGeminiMdInput): Promise<Bundle> {
  const bundle = emptyBundle();
  const expanded = await expandImportsCodeAware(
    input.content,
    input.path,
    input.readFile,
    new Set(),
    0,
    bundle,
  );
  const body_md = canonicalizeMarkdown(expanded);

  if (body_md === "") {
    bundle.warnings.push("W099: empty GEMINI.md");
    bundle.detected_formats.push("gemini-md");
    return bundle;
  }

  if (body_md.includes("## Gemini Added Memories")) {
    bundle.warnings.push(formatWarning("W040"));
  }

  const id = await ruleId("gemini-md", input.path, body_md);
  const rule: Rule = {
    id,
    source: { format: "gemini-md", path: input.path, scope: "workspace" },
    activation: { kind: "always" },
    body_md,
    precedence_path: pathSegments(input.path),
    metadata: ruleMetadata(body_md),
    warnings: [],
  };
  assertValidRule(rule);
  bundle.rules.push(rule);
  bundle.detected_formats.push("gemini-md");
  return bundle;
}

// Split content into segments alternating between code (skip) and prose (expand).
// Detects fenced blocks (``` or ~~~) and inline code (`...`).
type Segment = { kind: "code" | "prose"; text: string };

function segmentByCode(content: string): Segment[] {
  const segments: Segment[] = [];
  // Match fenced code blocks first (greedy), then inline code spans.
  // Keep it simple: scan line-by-line for fences, then within prose regions
  // strip inline `code` spans.
  const lines = content.split("\n");
  let inFence = false;
  let fenceMarker = "";
  let buf: string[] = [];

  const flushProse = () => {
    if (buf.length === 0) return;
    const proseText = buf.join("\n");
    // Within prose, peel out inline code spans as separate code segments.
    let lastIndex = 0;
    const re = /`+[^`\n]+`+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(proseText))) {
      if (m.index > lastIndex) segments.push({ kind: "prose", text: proseText.slice(lastIndex, m.index) });
      segments.push({ kind: "code", text: m[0] });
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < proseText.length) segments.push({ kind: "prose", text: proseText.slice(lastIndex) });
    buf = [];
  };
  const flushCode = () => {
    if (buf.length === 0) return;
    segments.push({ kind: "code", text: buf.join("\n") });
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = line.match(/^(```+|~~~+)/);
    if (!inFence && fenceMatch) {
      flushProse();
      buf.push(line);
      inFence = true;
      fenceMarker = fenceMatch[1]!;
    } else if (inFence) {
      buf.push(line);
      if (line.startsWith(fenceMarker)) {
        flushCode();
        inFence = false;
      }
    } else {
      buf.push(line);
    }
    if (i < lines.length - 1) buf[buf.length - 1] = (buf[buf.length - 1] || "") + "\n";
  }
  if (inFence) flushCode();
  else flushProse();
  return segments;
}

const IMPORT_LINE_RE = /(^|[\s])@([^\s@]+)/g;

async function expandImportsCodeAware(
  content: string,
  filePath: string,
  readFile: ReadFile | undefined,
  visited: Set<string>,
  depth: number,
  bundle: Bundle,
): Promise<string> {
  if (!readFile) return content;
  if (depth >= MAX_IMPORT_DEPTH) {
    bundle.warnings.push(formatWarning("W030", `at depth ${depth} in ${filePath}`));
    return content;
  }

  const segs = segmentByCode(content);
  const baseDir = dirname(filePath);
  const out: string[] = [];

  for (const seg of segs) {
    if (seg.kind === "code") {
      // Check if it contained an @-import — surface W031 once per file.
      if (IMPORT_LINE_RE.test(seg.text)) {
        bundle.warnings.push(formatWarning("W031", `in ${filePath}`));
        IMPORT_LINE_RE.lastIndex = 0;
      }
      out.push(seg.text);
      continue;
    }
    let result = "";
    let lastIndex = 0;
    const matches: Array<{ match: string; spec: string; index: number; lead: string }> = [];
    for (const m of seg.text.matchAll(IMPORT_LINE_RE)) {
      matches.push({ match: m[0]!, spec: m[2]!, index: m.index!, lead: m[1]! });
    }
    for (const m of matches) {
      result += seg.text.slice(lastIndex, m.index);
      const importPath = resolveImportPath(m.spec, baseDir);
      if (visited.has(importPath)) {
        result += m.match;
      } else {
        try {
          const importedRaw = await readFile(importPath);
          const next = new Set(visited);
          next.add(importPath);
          const importedExpanded = await expandImportsCodeAware(
            importedRaw,
            importPath,
            readFile,
            next,
            depth + 1,
            bundle,
          );
          result += m.lead + importedExpanded;
        } catch {
          result += m.match;
        }
      }
      lastIndex = m.index + m.match.length;
    }
    result += seg.text.slice(lastIndex);
    out.push(result);
  }
  return out.join("");
}

function resolveImportPath(spec: string, baseDir: string): string {
  if (spec.startsWith("~/")) {
    const home = process.env.HOME || "";
    return resolve(home, spec.slice(2));
  }
  if (isAbsolute(spec)) return spec;
  return resolve(baseDir, spec);
}

function pathSegments(p: string): string[] {
  const parts = p.split("/");
  parts.pop();
  return parts.filter((s) => s !== "" && s !== ".");
}
