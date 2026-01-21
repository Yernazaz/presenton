import katex from "katex";
import { marked } from "marked";

type TokenReplacement = { token: string; value: string };

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

export function renderMarkdownWithLatex(markdown: string): string {
  // Avoid treating code as math
  const fenced = replaceWithTokens(markdown, /```[\s\S]*?```/g, "CODEFENCE");
  const inlined = replaceWithTokens(fenced.text, /`[^`]*`/g, "CODEINLINE");

  const normalized = normalizeMathDelimiters(inlined.text);

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

