// Canonicalization for byte-identical round-trip comparison.
// Round-trip rule: parse(format, X) → render(format, _) → out  must equal canon(X) after canon(out).

// Markdown canonical form:
//   - line endings normalized to \n
//   - trailing whitespace stripped from each line
//   - file ends with exactly one trailing \n (unless empty)
//   - tabs left intact (some markdown parsers treat them semantically)
//
// We deliberately do NOT normalize:
//   - heading levels, list markers, indent depth — those are semantic to the user
//   - YAML frontmatter key order — handled by format-specific renderer
export function canonicalizeMarkdown(s: string): string {
  if (s === "") return "";
  const lines = s.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/g, ""));
  // Drop leading empty lines.
  while (lines.length > 0 && lines[0] === "") lines.shift();
  // Drop trailing empty lines, then add exactly one trailing \n.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return "";
  return lines.join("\n") + "\n";
}
