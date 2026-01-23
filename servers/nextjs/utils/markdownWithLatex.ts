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

function normalizeLatexArtifacts(markdown: string): string {
  let text = markdown;

  // Fix double-escaped LaTeX commands like "\\dfrac" -> "\dfrac"
  text = text.replace(/\\\\(?=[A-Za-z])/g, "\\");

  // Some model outputs mistakenly use "\" before Cyrillic (often intended as a newline).
  text = text.replace(/\\(?=[А-Яа-яЁё])/g, "\n");

  // If dollar delimiters are unbalanced, strip them and rely on fragment wrapping below.
  const dollarCount = (text.match(/\$/g) || []).length;
  if (dollarCount % 2 === 1) {
    text = text.replace(/\$/g, "");
  }

  return autoWrapLatexFragments(text);
}

function autoWrapLatexFragments(markdown: string): string {
  // Wrap non-Cyrillic fragments that look like LaTeX/math in $...$ so KaTeX can render them.
  const isCyrillic = (ch: string) => /[А-Яа-яЁё]/.test(ch);
  const hasLatexSignal = (s: string) =>
    /\\[A-Za-z]+/.test(s) || /[_^][{(]?[A-Za-z0-9]/.test(s) || /[=<>]/.test(s);

  let out = "";
  let buf = "";

  const flush = () => {
    if (!buf) return;
    const trimmed = buf.trim();
    if (trimmed && hasLatexSignal(trimmed) && containsLikelyLatexMath(trimmed)) {
      const delimiter = trimmed.includes("\n") || trimmed.length > 80 ? "$$" : "$";
      out += buf.replace(trimmed, `${delimiter}${trimmed}${delimiter}`);
    } else {
      out += buf;
    }
    buf = "";
  };

  for (let i = 0; i < markdown.length; i += 1) {
    const ch = markdown[i];
    if (isCyrillic(ch)) {
      flush();
      out += ch;
    } else {
      buf += ch;
    }
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
  return /\\(frac|sqrt|sum|int|prod|lim|log|ln|sin|cos|tan|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega|cdot|times|pm|leq|geq|neq|approx|rightarrow|leftarrow|Rightarrow|Leftarrow|Leftrightarrow|begin\{aligned\}|begin\{matrix\}|begin\{bmatrix\}|begin\{pmatrix\}|\\)/.test(
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
