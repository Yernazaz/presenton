"use client";

import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TiptapText from "./TiptapText";

interface TiptapTextReplacerProps {
  children: ReactNode;
  slideData?: any;
  slideIndex?: number;
  properties?: any;
  onContentChange?: (
    content: string,
    path: string,
    slideIndex?: number
  ) => void;
  onTextStyleChange?: (
    dataPath: string,
    style: { fontFamily?: string; fontSize?: number },
    slideIndex?: number
  ) => void;
}

type OverlayRect = { top: number; left: number; width: number; height: number };

function getValueByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const tokens = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current: any = obj;
  for (const token of tokens) {
    if (current == null) return undefined;
    current = current[token as keyof typeof current];
  }
  return current;
}

function getDirectTextContent(element: HTMLElement): string {
  let text = "";
  const childNodes = Array.from(element.childNodes);
  for (const node of childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
    }
  }
  return text;
}

function hasTextChildren(element: HTMLElement): boolean {
  const children = Array.from(element.children) as HTMLElement[];
  return children.some((child) => getDirectTextContent(child).trim().length > 1);
}

function isInIgnoredElementTree(element: HTMLElement): boolean {
  const ignoredElementTypes = new Set([
    "TABLE",
    "TBODY",
    "THEAD",
    "TFOOT",
    "TR",
    "TD",
    "TH",
    "SVG",
    "G",
    "PATH",
    "CIRCLE",
    "RECT",
    "LINE",
    "CANVAS",
    "VIDEO",
    "AUDIO",
    "IFRAME",
    "EMBED",
    "OBJECT",
    "SELECT",
    "OPTION",
    "OPTGROUP",
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "BUTTON",
  ]);

  const ignoredClassPatterns = [
    "chart",
    "graph",
    "visualization",
    "menu",
    "dropdown",
    "tooltip",
    "editor",
    "wysiwyg",
    "calendar",
    "datepicker",
    "slider",
    "carousel",
    "flowchart",
    "mermaid",
    "diagram",
  ];

  let currentElement: HTMLElement | null = element;
  while (currentElement) {
    if (ignoredElementTypes.has(currentElement.tagName)) return true;
    const className =
      currentElement.className && typeof currentElement.className === "string"
        ? currentElement.className.toLowerCase()
        : "";
    if (ignoredClassPatterns.some((pattern) => className.includes(pattern))) return true;
    if (currentElement.id?.includes("mermaid")) return true;
    if (currentElement.closest(".katex")) return true;

    if (
      currentElement.hasAttribute("contenteditable") ||
      currentElement.hasAttribute("data-chart") ||
      currentElement.hasAttribute("data-visualization") ||
      currentElement.hasAttribute("data-interactive")
    ) {
      return true;
    }

    currentElement = currentElement.parentElement;
  }

  return false;
}

function shouldSkipElement(element: HTMLElement): boolean {
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(element.tagName)) return true;
  if (element.closest(".tiptap-text-editor")) return true;
  if (element.closest("[data-tiptap-overlay-root='true']")) return true;
  if (isInIgnoredElementTree(element)) return true;

  if (element.querySelector("img, svg, button, input, textarea, select, a[href]")) {
    return true;
  }

  const text = getDirectTextContent(element).trim();
  if (text.length < 3) return true;
  if (hasTextChildren(element)) return true;

  return false;
}

function findDataPath(
  data: any,
  targetText: string,
  path = ""
): { path: string; originalText: string } {
  if (!data || typeof data !== "object") return { path: "", originalText: "" };

  for (const [key, value] of Object.entries(data)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (typeof value === "string" && value.trim() === targetText.trim()) {
      return { path: currentPath, originalText: value };
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const result = findDataPath(value[i], targetText, `${currentPath}[${i}]`);
        if (result.path) return result;
      }
    } else if (typeof value === "object" && value !== null) {
      const result = findDataPath(value, targetText, currentPath);
      if (result.path) return result;
    }
  }

  return { path: "", originalText: "" };
}

function getOverlayRect(element: HTMLElement): OverlayRect {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
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

function findEditableHost(target: HTMLElement, container: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = target;
  while (current && current !== container) {
    if (!current.isConnected) return null;
    if (shouldSkipElement(current)) {
      current = current.parentElement;
      continue;
    }
    const text = getDirectTextContent(current).trim();
    if (text.length >= 3) return current;
    current = current.parentElement;
  }
  return null;
}

const TiptapTextReplacer: React.FC<TiptapTextReplacerProps> = ({
  children,
  slideData,
  slideIndex,
  onContentChange = () => {},
  onTextStyleChange = () => {},
  properties,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<{
    host: HTMLElement;
    opacity: string;
    pointerEvents: string;
  } | null>(null);

  const [active, setActive] = useState<{
    host: HTMLElement;
    rect: OverlayRect;
    style: React.CSSProperties;
    dataPath: string;
    fallbackText: string;
    key: number;
  } | null>(null);

  const closeEditor = useCallback(() => {
    // Defer close to let ProseMirror finish blur handling.
    requestAnimationFrame(() => {
      if (restoreRef.current) {
        const { host, opacity, pointerEvents } = restoreRef.current;
        try {
          host.style.opacity = opacity;
          host.style.pointerEvents = pointerEvents;
        } catch {}
        restoreRef.current = null;
      }
      setActive(null);
    });
  }, []);

  const openEditor = useCallback(
    (host: HTMLElement) => {
      const text = getDirectTextContent(host).trim();
      if (text.length < 3) return;
      const { path } = findDataPath(slideData, text);

      restoreRef.current = {
        host,
        opacity: host.style.opacity,
        pointerEvents: host.style.pointerEvents,
      };
      host.style.opacity = "0";
      host.style.pointerEvents = "none";

      setActive({
        host,
        rect: getOverlayRect(host),
        style: getOverlayTextStyle(host),
        dataPath: path,
        fallbackText: text,
        key: Date.now(),
      });
    },
    [slideData]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseDownCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (active) return;
      const host = findEditableHost(target, container);
      if (!host) return;

      e.preventDefault();
      e.stopPropagation();
      openEditor(host);
    };

    container.addEventListener("mousedown", onMouseDownCapture, true);
    return () => container.removeEventListener("mousedown", onMouseDownCapture, true);
  }, [active, openEditor]);

  useEffect(() => {
    if (!active) return;

    const updateRect = () => {
      setActive((prev) => {
        if (!prev) return prev;
        if (!prev.host.isConnected) return prev;
        return { ...prev, rect: getOverlayRect(prev.host) };
      });
    };

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [active]);

  useEffect(() => {
    // IMPORTANT: do not close on outside mousedown.
    // Let Tiptap/ProseMirror handle blur and teardown cleanly; otherwise we can
    // unmount the editor while it's still processing blur, leading to
    // intermittent `Node.removeChild` during DOM cleanup.
    return;
  }, [active, closeEditor]);

  const activeTextStyle = useMemo(() => {
    if (!active) return undefined;
    if (!active.dataPath) return undefined;
    return properties?.textStyles ? properties.textStyles[active.dataPath] : undefined;
  }, [active, properties]);

  const activeContent = useMemo(() => {
    if (!active) return "";
    const fromPath = active.dataPath ? getValueByPath(slideData, active.dataPath) : undefined;
    return (fromPath ?? active.fallbackText ?? "").toString();
  }, [active, slideData]);

  return (
    <div ref={containerRef} className="tiptap-text-replacer">
      {children}
      {active
        ? createPortal(
            <div
              ref={overlayRef}
              data-tiptap-overlay-root="true"
              style={{
                position: "fixed",
                top: active.rect.top,
                left: active.rect.left,
                width: active.rect.width,
                height: active.rect.height,
                zIndex: 9999,
                pointerEvents: "auto",
                ...active.style,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
            >
              <TiptapText
                key={active.key}
                content={activeContent}
                textStyle={activeTextStyle}
                startInEditMode
                autoFocus
                toolbarMode="header"
                onExit={closeEditor}
                onTextStyleChange={(style) => {
                  if (!active.dataPath) return;
                  onTextStyleChange(active.dataPath, style, slideIndex);
                }}
                onContentChange={(content) => {
                  if (!active.dataPath) return;
                  onContentChange(content, active.dataPath, slideIndex);
                }}
                placeholder="Enter text..."
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default TiptapTextReplacer;
