"use client";

import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { renderInlineMarkdownWithLatex } from "@/utils/markdownWithLatex";

interface LatexTextReplacerProps {
  children: ReactNode;
  slideData?: any;
}

function getTextWithLineBreaksFromChildNodes(element: HTMLElement): string {
  let text = "";
  const childNodes = Array.from(element.childNodes);
  for (const node of childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "BR") {
        text += "\n";
      }
    }
  }
  return text;
}

function shouldSkipElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  const skipTags = new Set([
    "script",
    "style",
    "noscript",
    "pre",
    "code",
    "textarea",
    "input",
    "select",
    "option",
    "svg",
    "path",
    "g",
    "canvas",
  ]);
  if (skipTags.has(tagName)) return true;
  if (element.closest(".katex")) return true;
  if (element.closest("[data-mdlatex-overlay-root='true']")) return true;
  return false;
}

function isProbablyMarkdownOrLatex(text: string): boolean {
  return (
    // LaTeX-ish
    text.includes("$") ||
    text.includes("\\(") ||
    text.includes("\\)") ||
    text.includes("\\[") ||
    text.includes("\\]") ||
    text.includes("\\frac") ||
    text.includes("\\dfrac") ||
    text.includes("\\sqrt") ||
    text.includes("\\begin") ||
    // Markdown-ish
    /(^|\s)[*_~`]/.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text) ||
    /^(\s*[-*+]|\s*\d+\.)\s+/.test(text) ||
    /^#{1,6}\s+/.test(text)
  );
}

type OverlayItem = {
  id: string;
  host: HTMLElement;
  html: string;
  rect: { top: number; left: number; width: number; height: number };
  style: React.CSSProperties;
};

function getRectRelativeToContainer(el: HTMLElement, container: HTMLElement) {
  const r = el.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  return {
    top: r.top - c.top + container.scrollTop,
    left: r.left - c.left + container.scrollLeft,
    width: r.width,
    height: r.height,
  };
}

function getOverlayTextStyle(element: HTMLElement): React.CSSProperties {
  const computed = window.getComputedStyle(element);
  return {
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    fontStyle: computed.fontStyle,
    lineHeight: computed.lineHeight,
    letterSpacing: computed.letterSpacing,
    textAlign: computed.textAlign as any,
    color: computed.color,
    whiteSpace: computed.whiteSpace as any,
    paddingTop: computed.paddingTop,
    paddingRight: computed.paddingRight,
    paddingBottom: computed.paddingBottom,
    paddingLeft: computed.paddingLeft,
    boxSizing: "border-box",
  };
}

const LatexTextReplacer: React.FC<LatexTextReplacerProps> = ({
  children,
  slideData,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<
    Map<HTMLElement, { opacity: string; pointerEvents: string }>
  >(new Map());
  const [items, setItems] = useState<OverlayItem[]>([]);

  const clearOverlays = useCallback(() => {
    restoreRef.current.forEach((restore, host) => {
      try {
        host.style.opacity = restore.opacity;
        host.style.pointerEvents = restore.pointerEvents;
      } catch {}
    });
    restoreRef.current.clear();
    setItems([]);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Rebuild overlays on data change (generation edits) to keep content in sync.
    clearOverlays();

    const build = () => {
      if (!container.isConnected) return;
      const next: OverlayItem[] = [];
      const allElements = container.querySelectorAll("*");

      allElements.forEach((node) => {
        const element = node as HTMLElement;
        if (!element.isConnected) return;
        if (shouldSkipElement(element)) return;

        const childElements = Array.from(element.children).filter(
          (c) => (c as HTMLElement).tagName !== "BR"
        );
        if (childElements.length > 0) return;

        const rawText = getTextWithLineBreaksFromChildNodes(element);
        const trimmed = rawText.trim();
        if (!trimmed) return;
        if (trimmed.length < 2) return;
        if (!isProbablyMarkdownOrLatex(trimmed)) return;

        let html = "";
        try {
          html = renderInlineMarkdownWithLatex(rawText);
        } catch {
          return;
        }
        if (!html) return;

        // If rendering doesn't change anything, don't overlay.
        const normalizedRaw = rawText.replace(/\s+/g, " ").trim();
        const normalizedHtmlText = html
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const htmlAddsValue =
          normalizedHtmlText !== normalizedRaw || html.includes("katex");
        if (!htmlAddsValue) return;

        // Hide original without touching its DOM subtree.
        if (!restoreRef.current.has(element)) {
          restoreRef.current.set(element, {
            opacity: element.style.opacity,
            pointerEvents: element.style.pointerEvents,
          });
        }
        element.style.opacity = "0";

        next.push({
          id: `${Date.now()}-${next.length}`,
          host: element,
          html,
          rect: getRectRelativeToContainer(element, container),
          style: getOverlayTextStyle(element),
        });
      });

      setItems(next);
    };

    // Delay one frame so CSS/styles settle (including TextStyleReplacer).
    const raf = requestAnimationFrame(build);
    return () => cancelAnimationFrame(raf);
  }, [slideData, clearOverlays]);

  useEffect(() => {
    if (items.length === 0) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const container = containerRef.current;
      if (!container) return;
      setItems((prev) =>
        prev
          .filter((it) => it.host.isConnected)
          .map((it) => ({
            ...it,
            rect: getRectRelativeToContainer(it.host, container),
            style: getOverlayTextStyle(it.host),
          }))
      );
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items.length]);

  useEffect(() => {
    return () => {
      clearOverlays();
    };
  }, [clearOverlays]);

  const portals = useMemo(() => {
    if (items.length === 0) return null;
    const container = containerRef.current;
    if (!container) return null;
    return createPortal(
      <>
        {items.map((it) => (
          <div
            key={it.id}
            data-mdlatex-overlay-root="true"
            style={{
              position: "absolute",
              top: it.rect.top,
              left: it.rect.left,
              width: it.rect.width,
              height: it.rect.height,
              zIndex: 20,
              pointerEvents: "none",
              overflow: "hidden",
              ...it.style,
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
              }}
              // Reset typical markdown margins so layout matches original text boxes.
              className="[&_*]:m-0 [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_li]:m-0"
              dangerouslySetInnerHTML={{ __html: it.html }}
            />
          </div>
        ))}
      </>,
      container
    );
  }, [items]);

  return (
    <div ref={containerRef} className="relative">
      {children}
      {portals}
    </div>
  );
};

export default LatexTextReplacer;
