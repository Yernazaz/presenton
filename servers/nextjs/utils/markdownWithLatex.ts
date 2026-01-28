import katex from "katex";
import { marked } from "marked";

type TokenReplacement = { token: string; value: string };

let markedConfigured = false;
function configureMarked() {
  if (markedConfigured) return;
  markedConfigured = true;

  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  // Disable automatic URL/email linkification (we still allow explicit markdown links).
  marked.use({
    tokenizer: {
      url() {
        return false;
      },
    },
  });
}

function replaceWithTokens(
  input: string,
  regex: RegExp,
  tokenPrefix: string
): { text: string; replacements: TokenReplacement[] } {
  const replacements: TokenReplacement[] = [];
  let index = 0;

  const text = input.replace(regex, (match) => {
    const token = `@@${tokenPrefix}_${index}@@`;
    replacements.push({ token, value: match });
    index += 1;
    return token;
  });

  return { text, replacements };
}

function restoreTokens(text: string, replacements: TokenReplacement[]): string {
  let result = text;
  for (const { token, value } of replacements) {
    result = result.split(token).join(value);
  }
  return result;
}

function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .replace(/\\\[((?:.|\n)+?)\\\]/g, (_m, latex) => `$$${latex}$$`)
    .replace(/\\\(((?:.|\n)+?)\\\)/g, (_m, latex) => `$${latex}$`);
}

function repairJsonControlChars(markdown: string): string {
  // If LaTeX backslashes are NOT doubled inside JSON, sequences like `\text` or `\rightarrow`
  // are parsed as JSON escapes (`\t`, `\r`, `\b`, `\f`) and become control characters.
  // Repair them by turning the control chars back into their original escape prefix.
  return markdown
    .replace(/\u0009(?=[A-Za-z])/g, "\\t") // TAB
    .replace(/\u000d(?=[A-Za-z])/g, "\\r") // CR
    .replace(/\u0008(?=[A-Za-z])/g, "\\b") // BS
    .replace(/\u000c(?=[A-Za-z])/g, "\\f"); // FF
}

function readBracedGroup(
  source: string,
  openBraceIndex: number
): { content: string; endIndex: number } | null {
  if (source[openBraceIndex] !== "{") return null;

  let depth = 0;
  let content = "";
  for (let i = openBraceIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      if (depth > 1) content += ch;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { content, endIndex: i };
      content += ch;
      continue;
    }
    if (depth >= 1) content += ch;
  }

  return null;
}

function stripDollarsInsideTextCommands(markdown: string): string {
  // Models sometimes produce `\\text{$...$}` or `\\text{...$}` which makes KaTeX fail.
  // Strip `$` (and escaped `\\$`) inside `\\text{...}` blocks.
  const needle = "\\text{";
  let out = "";
  let i = 0;

  while (i < markdown.length) {
    const start = markdown.indexOf(needle, i);
    if (start === -1) {
      out += markdown.slice(i);
      break;
    }

    out += markdown.slice(i, start);

    const openBraceIndex = start + needle.length - 1; // points at "{"
    const group = readBracedGroup(markdown, openBraceIndex);
    if (!group) {
      // Unbalanced braces; keep the rest unchanged to avoid making it worse.
      out += markdown.slice(start);
      break;
    }

    const cleaned = group.content.replace(/\\\$/g, "").replace(/\$/g, "");
    out += `\\text{${cleaned}}`;
    i = group.endIndex + 1;
  }

  return out;
}

function stripDanglingDisplayMathDelimiters(markdown: string): string {
  // If there is an unpaired "$$" somewhere, KaTeX won't render any $$...$$ segments properly.
  // Prefer a conservative fix: only remove the last "$$" when the count is odd.
  const matches = Array.from(markdown.matchAll(/\$\$/g));
  if (matches.length % 2 === 0) return markdown;
  const last = matches[matches.length - 1];
  const index = last.index;
  if (typeof index !== "number" || index < 0) return markdown;
  return markdown.slice(0, index) + markdown.slice(index + 2);
}

function repairBareLatexCommands(markdown: string): string {
  // Some broken outputs lose the leading backslash entirely (e.g. `ext{...}` or `ightarrow`).
  // These substrings are extremely unlikely in normal Russian/English text, so it is safe to repair.
  return markdown
    .replace(/(^|[^\\A-Za-z])ext\{/g, (_m, prefix) => `${prefix}\\text{`)
    .replace(/(^|[^\\A-Za-z])ightarrow/g, (_m, prefix) => `${prefix}\\rightarrow`)
    .replace(/(^|[^\\A-Za-z])xrightarrow/g, (_m, prefix) => `${prefix}\\xrightarrow`)
    .replace(/(^|[^\\A-Za-z])uparrow/g, (_m, prefix) => `${prefix}\\uparrow`)
    .replace(/(^|[^\\A-Za-z])downarrow/g, (_m, prefix) => `${prefix}\\downarrow`);
}

function repairTabEscapesInsideMath(markdown: string): string {
  // Sometimes upstream strings may contain a literal tab character where `\t` was intended,
  // e.g. `\text{...}` becomes `<TAB>ext{...}`. Repair it inside math only.
  const repair = (latex: string) => latex.replace(/\t(?=[A-Za-z])/g, "\\t");

  // Block math: $$...$$ (can be multiline)
  let out = markdown.replace(/\$\$([\s\S]+?)\$\$/g, (_m, latex) => {
    return `$$${repair(String(latex))}$$`;
  });

  // Inline math: $...$ (single-line)
  out = out.replace(/(^|[^$])\$([^\n$]+?)\$(?!\$)/g, (_m, prefix, latex) => {
    return `${prefix}$${repair(String(latex))}$`;
  });

  return out;
}

function repairUnbalancedInlineDollarDelimiters(markdown: string): string {
  // Best-effort: if a line has an odd count of single `$` delimiters (not `$$`),
  // remove the last `$` on that line. Avoid touching lines that contain `$$` because
  // block math may span lines and we don't want to corrupt it.
  const lines = markdown.split("\n");
  let inBlockMath = false;

  const result = lines.map((line) => {
    const blockMatches = line.match(/\$\$/g) || [];
    const hasBlockTokens = blockMatches.length > 0;

    let outLine = line;

    if (!inBlockMath && !hasBlockTokens) {
      const dollarIndices: number[] = [];
      for (let i = 0; i < outLine.length; i += 1) {
        if (outLine[i] !== "$") continue;
        // Skip escaped dollars.
        if (i > 0 && outLine[i - 1] === "\\") continue;
        // Skip `$$` (shouldn't exist in this branch, but keep safe).
        if (i + 1 < outLine.length && outLine[i + 1] === "$") continue;
        if (i > 0 && outLine[i - 1] === "$") continue;
        dollarIndices.push(i);
      }

      if (dollarIndices.length % 2 === 1) {
        const removeAt = dollarIndices[dollarIndices.length - 1];
        outLine = outLine.slice(0, removeAt) + outLine.slice(removeAt + 1);
      }
    }

    if (blockMatches.length % 2 === 1) {
      inBlockMath = !inBlockMath;
    }

    return outLine;
  });

  return result.join("\n");
}

function normalizeLatexArtifacts(markdown: string): string {
  let text = markdown;

  text = repairJsonControlChars(text);

  // Fix double-escaped LaTeX commands like "\\dfrac" -> "\dfrac"
  text = text.replace(/\\\\(?=[A-Za-z])/g, "\\");

  // Remove stray backslashes right before display math delimiters (often used as markdown escaping).
  // NOTE: replacement strings treat `$$` specially, so use a function to preserve literal `$$`.
  text = text.replace(/\\\s*\$\$/g, () => "$$");

  text = stripDollarsInsideTextCommands(text);
  text = stripDanglingDisplayMathDelimiters(text);
  text = repairBareLatexCommands(text);

  // Repair `\t...` escapes that may have turned into real tab characters inside math.
  text = repairTabEscapesInsideMath(text);

  // Some model outputs mistakenly use "\" before Cyrillic (often intended as a newline).
  text = text.replace(/\\(?=[А-Яа-яЁё])/g, "\n");

  text = repairUnbalancedInlineDollarDelimiters(text);

  return autoWrapLatexFragments(text);
}

function autoWrapLatexFragments(markdown: string): string {
  // Wrap non-Cyrillic fragments that look like LaTeX/math in $...$ so KaTeX can render them.
  const isCyrillic = (ch: string) => /[А-Яа-яЁё]/.test(ch);
  const hasLatexSignal = (s: string) =>
    /\\[A-Za-z]+/.test(s) || /[_^][{(]?[A-Za-z0-9]/.test(s) || /[=<>]/.test(s);

  let out = "";
  let buf = "";
  let latexBraceDepth = 0;

  const flush = () => {
    if (!buf) return;
    const trimmed = buf.trim();
    // Do not wrap fragments that already contain math delimiters; that often creates stray `$` in output.
    if (trimmed.includes("$")) {
      out += buf;
      buf = "";
      return;
    }
    if (trimmed && hasLatexSignal(trimmed) && containsLikelyLatexMath(trimmed)) {
      const delimiter = trimmed.includes("\n") || trimmed.length > 80 ? "$$" : "$";
      // Avoid String.replace replacement-string `$` semantics.
      out += buf.replace(trimmed, () => `${delimiter}${trimmed}${delimiter}`);
    } else {
      out += buf;
    }
    buf = "";
  };

  for (let i = 0; i < markdown.length; i += 1) {
    const ch = markdown[i];

    // If we're inside a brace block that started right after a latex command (e.g. \text{...}),
    // keep all characters (including Cyrillic) in the buffer so we can wrap the whole expression.
    if (latexBraceDepth > 0) {
      buf += ch;
      if (ch === "{") latexBraceDepth += 1;
      if (ch === "}") latexBraceDepth -= 1;
      continue;
    }

    if (ch === "\\") {
      // Capture a latex command name and, if it immediately opens `{...}`, capture the brace scope.
      buf += ch;
      let j = i + 1;
      while (j < markdown.length && /[A-Za-z]/.test(markdown[j])) {
        buf += markdown[j];
        j += 1;
      }
      if (j < markdown.length && markdown[j] === "{") {
        buf += "{";
        latexBraceDepth = 1;
        i = j;
        continue;
      }
      i = j - 1;
      continue;
    }

    if (isCyrillic(ch)) {
      flush();
      out += ch;
      continue;
    }

    buf += ch;
  }
  flush();
  return out;
}

function escapeLatexText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/#/g, "\\#");
}

function containsLikelyLatexMath(text: string): boolean {
  // A conservative set of signals that typically appear in LaTeX math.
  return /\\(text|frac|dfrac|sqrt|sum|int|prod|lim|log|ln|sin|cos|tan|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega|cdot|times|pm|leq|geq|neq|approx|uparrow|downarrow|rightarrow|leftarrow|xrightarrow|Rightarrow|Leftarrow|Leftrightarrow|begin\{aligned\}|begin\{matrix\}|begin\{bmatrix\}|begin\{pmatrix\})/.test(
    text
  );
}

function autoWrapLatexMathIfMissingDelimiters(markdown: string): string {
  // If there are obvious LaTeX math commands but no math delimiters anywhere,
  // wrap the whole string as inline math (best-effort for short fields).
  if (markdown.includes("$") || markdown.includes("\\(") || markdown.includes("\\[")) {
    return markdown;
  }
  if (!containsLikelyLatexMath(markdown)) {
    return markdown;
  }
  const delimiter = markdown.includes("\n") ? "$$" : "$";
  return `${delimiter}${markdown}${delimiter}`;
}

function autoLatexifyArrowSchemes(markdown: string): string {
  const lines = markdown.split("\n");
  const isListLike = (line: string) => /^\s*([-*+]|\d+\.)\s+/.test(line);
  const isArrowLine = (line: string) => /(<=>|<->|=>|<=|->|<-)/.test(line);
  const alreadyMathy = (line: string) =>
    line.includes("$") ||
    line.includes("\\begin{") ||
    line.includes("\\(") ||
    line.includes("\\[") ||
    line.includes("\\");

  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (
      !trimmed ||
      isListLike(line) ||
      !isArrowLine(line) ||
      alreadyMathy(line)
    ) {
      out.push(line);
      i += 1;
      continue;
    }

    // Group consecutive arrow lines into one aligned block.
    const run: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const t = l.trim();
      if (!t || isListLike(l) || !isArrowLine(l) || alreadyMathy(l)) break;
      run.push(l);
      i += 1;
    }

    const latexLines = run.map((l) => {
      const escaped = escapeLatexText(l.trim());
      return escaped
        .replaceAll("<=>", "\\Leftrightarrow ")
        .replaceAll("<->", "\\leftrightarrow ")
        .replaceAll("=>", "\\Rightarrow ")
        .replaceAll("<=", "\\Leftarrow ")
        .replaceAll("->", "\\rightarrow ")
        .replaceAll("<-", "\\leftarrow ");
    });

    out.push(`$$\\begin{aligned} ${latexLines.join(" \\\\ ")} \\end{aligned}$$`);
  }

  return out.join("\n");
}

export function renderMarkdownWithLatex(markdown: string): string {
  configureMarked();
  // Avoid treating code as math
  const fenced = replaceWithTokens(markdown, /```[\s\S]*?```/g, "CODEFENCE");
  const inlined = replaceWithTokens(fenced.text, /`[^`]*`/g, "CODEINLINE");

  const normalized = autoLatexifyArrowSchemes(
    autoWrapLatexMathIfMissingDelimiters(
      normalizeLatexArtifacts(normalizeMathDelimiters(inlined.text))
    )
  );

  const mathReplacements: TokenReplacement[] = [];
  let mathIndex = 0;

  // Block math: $$...$$ (can be multiline)
  let withMathTokens = normalized.replace(/\$\$([\s\S]+?)\$\$/g, (_m, latex) => {
    const token = `@@KATEX_BLOCK_${mathIndex}@@`;
    const html = katex.renderToString(String(latex).trim(), {
      throwOnError: false,
      displayMode: true,
      strict: "ignore",
    });
    mathReplacements.push({ token, value: html });
    mathIndex += 1;
    return token;
  });

  // Inline math: $...$ (single-line)
  withMathTokens = withMathTokens.replace(
    /(^|[^$])\$([^\n$]+?)\$(?!\$)/g,
    (_m, prefix, latex) => {
      const token = `@@KATEX_INLINE_${mathIndex}@@`;
      const html = katex.renderToString(String(latex).trim(), {
        throwOnError: false,
        displayMode: false,
        strict: "ignore",
      });
      mathReplacements.push({ token, value: html });
      mathIndex += 1;
      return `${prefix}${token}`;
    }
  );

  // Restore code before markdown parsing
  const markdownRestored = restoreTokens(
    restoreTokens(withMathTokens, inlined.replacements),
    fenced.replacements
  );

  const parsedHtml = marked.parse(markdownRestored) as string;
  return restoreTokens(parsedHtml, mathReplacements);
}

export function renderInlineMarkdownWithLatex(markdown: string): string {
  configureMarked();
  // Avoid treating code as math
  const fenced = replaceWithTokens(markdown, /```[\s\S]*?```/g, "CODEFENCE");
  const inlined = replaceWithTokens(fenced.text, /`[^`]*`/g, "CODEINLINE");

  const normalized = autoLatexifyArrowSchemes(
    autoWrapLatexMathIfMissingDelimiters(
      normalizeLatexArtifacts(normalizeMathDelimiters(inlined.text))
    )
  );

  const mathReplacements: TokenReplacement[] = [];
  let mathIndex = 0;

  // Block math: $$...$$ (can be multiline)
  let withMathTokens = normalized.replace(/\$\$([\s\S]+?)\$\$/g, (_m, latex) => {
    const token = `@@KATEX_BLOCK_${mathIndex}@@`;
    const html = katex.renderToString(String(latex).trim(), {
      throwOnError: false,
      displayMode: true,
      strict: "ignore",
    });
    mathReplacements.push({ token, value: html });
    mathIndex += 1;
    return token;
  });

  // Inline math: $...$ (single-line)
  withMathTokens = withMathTokens.replace(
    /(^|[^$])\$([^\n$]+?)\$(?!\$)/g,
    (_m, prefix, latex) => {
      const token = `@@KATEX_INLINE_${mathIndex}@@`;
      const html = katex.renderToString(String(latex).trim(), {
        throwOnError: false,
        displayMode: false,
        strict: "ignore",
      });
      mathReplacements.push({ token, value: html });
      mathIndex += 1;
      return `${prefix}${token}`;
    }
  );

  const markdownRestored = restoreTokens(
    restoreTokens(withMathTokens, inlined.replacements),
    fenced.replacements
  );

  const parsedHtml = marked.parseInline(markdownRestored) as string;
  return restoreTokens(parsedHtml, mathReplacements);
}
