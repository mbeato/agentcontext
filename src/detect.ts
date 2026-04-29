// Detection: scan a directory and return the agent-context formats present.
// Filesystem operations are abstracted so the pure-IR core has no FS coupling.

import { type SourceFormat } from "./ir.ts";

export type DirEntry = { name: string; isDirectory: boolean };
export type FsAdapter = {
  listDir: (path: string) => Promise<DirEntry[]>;
  exists: (path: string) => Promise<boolean>;
};

export type DetectedFile = {
  format: SourceFormat;
  path: string; // absolute or root-relative
  scope?: "global" | "workspace";
};

export type DetectResult = {
  files: DetectedFile[];
  warnings: string[]; // e.g. W001 both .clinerules file + dir
};

// Detection rules: which paths/filenames map to which format.
//
// Ordering matters for the W001 conflict check (clinerules file + dir).
// We do NOT walk the directory recursively — only root-level discovery for v0.1.
// Subdirectory rules (.cursor/rules/, .windsurf/rules/, .clinerules/) are
// scanned one level deep; nested AGENTS.md / CLAUDE.md walk-up is Day 3.

export async function detect(rootPath: string, fs: FsAdapter): Promise<DetectResult> {
  const files: DetectedFile[] = [];
  const warnings: string[] = [];

  const rootEntries = await fs.listDir(rootPath);
  const rootByName = new Map(rootEntries.map((e) => [e.name, e]));

  // Single-file root formats
  if (rootByName.has("AGENTS.md")) files.push({ format: "agents-md", path: `${rootPath}/AGENTS.md` });
  if (rootByName.has("CLAUDE.md")) files.push({ format: "claude-md", path: `${rootPath}/CLAUDE.md` });
  if (rootByName.has("GEMINI.md")) files.push({ format: "gemini-md", path: `${rootPath}/GEMINI.md` });
  if (rootByName.has("CONVENTIONS.md")) files.push({ format: "conventions-md", path: `${rootPath}/CONVENTIONS.md` });
  if (rootByName.has(".cursorrules")) files.push({ format: "cursor-legacy", path: `${rootPath}/.cursorrules` });
  if (rootByName.has(".windsurfrules")) files.push({ format: "windsurf-legacy", path: `${rootPath}/.windsurfrules` });
  if (rootByName.has(".aider.conf.yml")) files.push({ format: "conventions-md", path: `${rootPath}/.aider.conf.yml` });

  // .clinerules: file or directory
  const cline = rootByName.get(".clinerules");
  if (cline) {
    if (cline.isDirectory) {
      files.push({ format: "cline-dir", path: `${rootPath}/.clinerules` });
    } else {
      files.push({ format: "cline-file", path: `${rootPath}/.clinerules` });
    }
  }
  // Both file AND directory (rare — different on-disk states): warn loudly.
  // listDir typically returns either-or; if both somehow present, the second
  // detection picks up via direct existence checks.
  if (cline?.isDirectory && (await fs.exists(`${rootPath}/.clinerules.md`))) {
    warnings.push("W001: both .clinerules (file) and .clinerules/ (dir) present");
  }

  // .cursor/rules/*.mdc
  const cursorDir = rootByName.get(".cursor");
  if (cursorDir?.isDirectory) {
    const cursorEntries = await fs.listDir(`${rootPath}/.cursor`);
    if (cursorEntries.some((e) => e.name === "rules" && e.isDirectory)) {
      const rulesEntries = await fs.listDir(`${rootPath}/.cursor/rules`);
      for (const e of rulesEntries) {
        if (!e.isDirectory && (e.name.endsWith(".mdc") || e.name.endsWith(".md"))) {
          files.push({ format: "cursor-mdc", path: `${rootPath}/.cursor/rules/${e.name}` });
        }
      }
    }
  }

  // .windsurf/rules/*.md
  const wsDir = rootByName.get(".windsurf");
  if (wsDir?.isDirectory) {
    const wsEntries = await fs.listDir(`${rootPath}/.windsurf`);
    if (wsEntries.some((e) => e.name === "rules" && e.isDirectory)) {
      const rulesEntries = await fs.listDir(`${rootPath}/.windsurf/rules`);
      for (const e of rulesEntries) {
        if (!e.isDirectory && (e.name.endsWith(".md") || e.name.endsWith(".mdc"))) {
          files.push({ format: "windsurf-mdc", path: `${rootPath}/.windsurf/rules/${e.name}` });
        }
      }
    }
  }

  return { files, warnings };
}

// Default adapter using node:fs/promises. Bun-native — no extra deps.
export async function nodeFsAdapter(): Promise<FsAdapter> {
  const fs = await import("node:fs/promises");
  return {
    listDir: async (path: string) => {
      try {
        const entries = await fs.readdir(path, { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
      } catch {
        return [];
      }
    },
    exists: async (path: string) => {
      try {
        await fs.access(path);
        return true;
      } catch {
        return false;
      }
    },
  };
}
