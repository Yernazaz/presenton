import { NextResponse, type NextRequest } from "next/server";
import { spawnSync } from "node:child_process";

type MarkdownToLatexRequest = {
  markdown: string;
  from?: string;
  to?: string;
};

function runPandoc(markdown: string, from: string, to: string) {
  return spawnSync("pandoc", ["--from", from, "--to", to], {
    input: markdown,
    encoding: "utf-8",
    maxBuffer: 1000 * 1024,
  });
}

export async function POST(request: NextRequest) {
  let payload: MarkdownToLatexRequest;
  try {
    payload = (await request.json()) as MarkdownToLatexRequest;
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const { markdown, from = "markdown", to = "latex" } = payload || {};

  if (!markdown || typeof markdown !== "string") {
    return NextResponse.json(
      { error: "The 'markdown' field is required and must be a string" },
      { status: 400 }
    );
  }

  const pandoc = runPandoc(markdown, from, to);

  if (pandoc.error) {
    const errno = pandoc.error as NodeJS.ErrnoException;
    return NextResponse.json(
      {
        error:
          errno.code === "ENOENT"
            ? "pandoc binary not found. Please install pandoc in your environment."
            : "Failed to start pandoc",
        details: errno.message,
      },
      { status: 500 }
    );
  }

  if (pandoc.status !== 0) {
    return NextResponse.json(
      {
        error: "pandoc failed to convert the markdown",
        details: pandoc.stderr,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      latex: pandoc.stdout,
      warnings: pandoc.stderr?.trim() || undefined,
    },
    { status: 200 }
  );
}
