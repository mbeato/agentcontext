// Canonical intermediate representation for agent-context normalization.
// All parsers emit IR. All renderers consume IR. Conversion = parse → IR → render.

export type SourceFormat =
  | "agents-md"
  | "claude-md"
  | "gemini-md"
  | "cursor-legacy"
  | "cursor-mdc"
  | "windsurf-legacy"
  | "windsurf-mdc"
  | "cline-file"
  | "cline-dir"
  | "conventions-md";

export type TargetFormat = Exclude<
  SourceFormat,
  "cursor-legacy" | "windsurf-legacy" | "cline-file"
>;

export type RuleScope = "global" | "workspace" | "subtree";

export type Activation =
  | { kind: "always" }
  | { kind: "glob"; patterns: string[] }
  | { kind: "model_decision"; description: string }
  | { kind: "manual"; mention: string };

export type RuleSource = {
  format: SourceFormat;
  path: string;
  scope: RuleScope;
};

export type RuleMetadata = {
  char_count: number;
  has_code_blocks: boolean;
  contains_imports: boolean;
  last_modified?: string;
};

export type Rule = {
  id: string;
  source: RuleSource;
  activation: Activation;
  body_md: string;
  precedence_path: string[];
  ordering_hint?: number;
  toggle_state?: boolean;
  metadata: RuleMetadata;
  warnings: string[];
};

export type Bundle = {
  rules: Rule[];
  config_extras: {
    aider_conf?: Record<string, unknown>;
  };
  detected_formats: SourceFormat[];
  warnings: string[];
};

const FENCE_RE = /^```|^~~~/m;
const IMPORT_RE = /(^|\s)@[^\s]+/;

export function ruleMetadata(body_md: string): RuleMetadata {
  return {
    char_count: body_md.length,
    has_code_blocks: FENCE_RE.test(body_md),
    contains_imports: IMPORT_RE.test(body_md),
  };
}

// Stable content-derived id. Format-prefixed so the same body in different
// source formats is still distinguishable for diff/round-trip purposes.
export async function ruleId(format: SourceFormat, path: string, body_md: string): Promise<string> {
  const data = new TextEncoder().encode(`${format}\0${path}\0${body_md}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 8; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex;
}

// Invariant guards — call at parser/renderer boundaries.
export function assertValidRule(r: Rule): void {
  if (!r.id) throw new Error("Rule.id required");
  if (!r.source) throw new Error("Rule.source required");
  if (typeof r.body_md !== "string") throw new Error("Rule.body_md must be string");
  if (!Array.isArray(r.precedence_path)) throw new Error("Rule.precedence_path must be array");
  switch (r.activation.kind) {
    case "always":
      break;
    case "glob":
      if (!Array.isArray(r.activation.patterns) || r.activation.patterns.length === 0)
        throw new Error("glob activation requires non-empty patterns[]");
      break;
    case "model_decision":
      if (typeof r.activation.description !== "string" || !r.activation.description)
        throw new Error("model_decision activation requires description");
      break;
    case "manual":
      if (typeof r.activation.mention !== "string" || !r.activation.mention)
        throw new Error("manual activation requires mention");
      break;
  }
}

export function emptyBundle(): Bundle {
  return {
    rules: [],
    config_extras: {},
    detected_formats: [],
    warnings: [],
  };
}
