// Warning catalog. Numbered for greppable CI logs. Severity governs CLI exit codes.

export type Severity = "info" | "warn" | "error";

export type WarningDef = {
  code: string;
  severity: Severity;
  message: string;
};

export const WARNINGS = {
  W001: { code: "W001", severity: "warn", message: "Both .clinerules (file) and .clinerules/ (dir) present" },
  W002: { code: "W002", severity: "error", message: "Refused to write .cursorrules (deprecated); use .cursor/rules/*.mdc" },
  W003: { code: "W003", severity: "warn", message: "Windsurf workspace rule exceeds 12,000 chars — will silently truncate" },
  W004: { code: "W004", severity: "warn", message: "Windsurf global rule exceeds 6,000 chars" },
  W010: { code: "W010", severity: "info", message: "Auto-split AGENTS.md by H2 into nested files" },
  W020: { code: "W020", severity: "warn", message: ".aider.conf.yml read: references missing file" },
  W030: { code: "W030", severity: "warn", message: "CLAUDE.md @-import recursion limit (5 hops) reached" },
  W031: { code: "W031", severity: "warn", message: "GEMINI.md @-import in code block ignored (per spec)" },
  W040: { code: "W040", severity: "info", message: "## Gemini Added Memories section preserved verbatim" },
  W042: { code: "W042", severity: "info", message: "Activation mode collapsed to always (lossy down-conversion)" },
  W050: { code: "W050", severity: "warn", message: "Tier-C reserved subdir skipped (.clinerules/workflows/, hooks/, skills/)" },
  W099: { code: "W099", severity: "warn", message: "Format auto-detected but no parser claims it" },
} as const satisfies Record<string, WarningDef>;

export type WarningCode = keyof typeof WARNINGS;

export function formatWarning(code: WarningCode, detail?: string): string {
  const w = WARNINGS[code];
  return detail ? `${w.code}: ${w.message} (${detail})` : `${w.code}: ${w.message}`;
}

export function severityOf(line: string): Severity | null {
  const m = line.match(/^(W\d{3})/);
  if (!m) return null;
  const code = m[1] as WarningCode;
  return WARNINGS[code]?.severity ?? null;
}
