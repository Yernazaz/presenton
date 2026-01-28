import { build } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const samples = [
  `Биосинтез:\\ $$\\\\text{preproinsulin} \\\\rightarrow \\\\text{proinsulin} \\\\xrightarrow{\\\\text{ферментативная обработка}} \\\\text{insulin (A и B цепи)}$$ Подробная схема:\\ $$\\\\text{preproinsulin (сигн. пептид)} \\\\xrightarrow{\\\\text{клиппинг сигнала}} \\\\text{proinsulin (A–C–B)} \\\\xrightarrow{\\\\substack{\\\\text{сборка и образование }\\\\mathrm{S!–!S}\\\\\\\\text{и протеолитическая обработка}}} \\\\text{insulin (A + B) + C\\\\text{-}peptide}$$`,
  `$$\\\\text{Животный инсулин} \\\\xrightarrow{\\\\text{аллергии, дефицит, несовпадение}} \\\\text{Необходимость биотехнологии} \\\\xrightarrow{\\\\text{рекомбинантный инсулин}} \\\\text{Безопасность, масштабное производство}$$`,
  `$$ ext{Выделение/синтез гена} \\\\rightarrow \\\\text{Встраивание в вектор} \\\\rightarrow \\\\text{Трансформация в }E.;coli \\\\rightarrow \\\\text{Культивирование / ферментация} \\\\rightarrow \\\\text{Выражение белка (проинсулин)} \\\\rightarrow \\\\text{Обработка: очистка, сворачивание, расщепление до активного инсулина} \\\\rightarrow \\\\text{Формулирование и контроль качества}$$`,
];

const { outputFiles } = await build({
  absWorkingDir: __dirname,
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  stdin: {
    loader: "ts",
    resolveDir: __dirname,
    contents: `
      import { renderInlineMarkdownWithLatex } from "../utils/markdownWithLatex";
      export function run(samples: string[]) {
        const failures: Array<{ sample: string; reason: string }> = [];
        for (const sample of samples) {
          const html = renderInlineMarkdownWithLatex(sample);
          if (!html.includes("katex")) {
            failures.push({ sample, reason: "no katex html" });
            continue;
          }
          if (html.includes("katex-error")) {
            failures.push({ sample, reason: "katex-error present" });
            continue;
          }
        }
        return failures;
      }
    `,
  },
});

const code = outputFiles?.[0]?.text;
if (!code) {
  console.error("Failed to build latex smoke bundle.");
  process.exit(1);
}

const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const mod = await import(url);
const failures = mod.run(samples);

if (failures.length > 0) {
  console.error("LaTeX smoke test failed:");
  for (const f of failures) {
    console.error("-", f.reason, ":", f.sample);
  }
  process.exit(1);
}

console.log("LaTeX smoke test: OK");

