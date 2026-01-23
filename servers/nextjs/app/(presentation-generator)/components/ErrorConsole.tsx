"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type ErrorEntry = {
  ts: number;
  source: "window.error" | "unhandledrejection" | "console.error" | "slide";
  message: string;
  stack?: string;
  componentStack?: string;
};

const STORAGE_KEY = "presenton_error_log_v1";
const MAX_ENTRIES = 200;

function readLog(): ErrorEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ErrorEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLog(entries: ErrorEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // ignore
  }
}

export default function ErrorConsole() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ErrorEntry[]>([]);

  const add = useCallback((entry: ErrorEntry) => {
    setEntries((prev) => {
      const next = [...prev, entry].slice(-MAX_ENTRIES);
      writeLog(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setEntries(readLog());
  }, []);

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      add({
        ts: Date.now(),
        source: "window.error",
        message: event.message || String(event.error || "Unknown error"),
        stack: event.error?.stack,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      add({
        ts: Date.now(),
        source: "unhandledrejection",
        message:
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : JSON.stringify(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };

    const onSlideError = (event: Event) => {
      const detail = (event as CustomEvent<ErrorEntry>).detail;
      if (!detail) return;
      add(detail);
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("presenton:slide-error", onSlideError as EventListener);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("presenton:slide-error", onSlideError as EventListener);
    };
  }, [add]);

  useEffect(() => {
    const original = console.error;
    console.error = (...args: any[]) => {
      try {
        const msg = args
          .map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : JSON.stringify(a)))
          .join(" ");
        add({ ts: Date.now(), source: "console.error", message: msg });
      } catch {
        // ignore
      }
      original(...args);
    };
    return () => {
      console.error = original;
    };
  }, [add]);

  const count = entries.length;
  const last10 = useMemo(() => entries.slice(-10).reverse(), [entries]);

  const clear = () => {
    setEntries([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const copy = async () => {
    const text = JSON.stringify(entries, null, 2);
    await navigator.clipboard.writeText(text);
  };

  return (
    <>
      <button
        type="button"
        className="fixed bottom-4 right-4 z-[9999] rounded-full border bg-white px-3 py-2 text-xs shadow"
        onClick={() => setOpen((v) => !v)}
        title="Show captured errors"
      >
        Errors: {count}
      </button>

      {open && (
        <div className="fixed inset-0 z-[9998] bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-16 right-4 w-[min(720px,calc(100vw-2rem))] max-h-[70vh] overflow-auto rounded-lg bg-white shadow-xl border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b px-3 py-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Captured errors</div>
              <div className="flex gap-2">
                <button className="text-xs border rounded px-2 py-1" onClick={copy}>
                  Copy
                </button>
                <button className="text-xs border rounded px-2 py-1" onClick={clear}>
                  Clear
                </button>
                <button className="text-xs border rounded px-2 py-1" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="p-3 space-y-2">
              {last10.length === 0 ? (
                <div className="text-sm text-gray-600">No errors captured yet.</div>
              ) : (
                last10.map((e) => (
                  <div key={e.ts} className="text-xs border rounded p-2 bg-gray-50">
                    <div className="text-gray-700">
                      {new Date(e.ts).toLocaleString()} · {e.source}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words">{e.message}</div>
                    {e.stack ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer">stack</summary>
                        <pre className="whitespace-pre-wrap break-words">{e.stack}</pre>
                      </details>
                    ) : null}
                    {e.componentStack ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer">component stack</summary>
                        <pre className="whitespace-pre-wrap break-words">{e.componentStack}</pre>
                      </details>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
