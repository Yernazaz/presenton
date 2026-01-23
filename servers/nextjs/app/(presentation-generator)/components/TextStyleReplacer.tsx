"use client";

import React, { ReactNode, useLayoutEffect, useRef } from "react";

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
    "img",
  ]);
  if (skipTags.has(tagName)) return true;
  if (element.closest(".katex")) return true;
  if (element.hasAttribute("data-text-style-processed")) return true;
  return false;
}

function findDataPath(
  data: any,
  targetText: string,
  path = ""
): string | null {
  if (!data || typeof data !== "object") return null;

  for (const [key, value] of Object.entries(data)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (typeof value === "string" && value.trim() === targetText.trim()) {
      return currentPath;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const result = findDataPath(value[i], targetText, `${currentPath}[${i}]`);
        if (result) return result;
      }
    } else if (typeof value === "object" && value !== null) {
      const result = findDataPath(value, targetText, currentPath);
      if (result) return result;
    }
  }

  return null;
}

export default function TextStyleReplacer({
  children,
  slideData,
  properties,
}: {
  children: ReactNode;
  slideData?: any;
  properties?: any;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    if (!slideData) return;

    const styleMap: Record<string, { fontFamily?: string; fontSize?: number }> =
      properties?.textStyles || {};

    const container = containerRef.current;
    const allElements = container.querySelectorAll("*");

    allElements.forEach((node) => {
      const element = node as HTMLElement;
      if (shouldSkipElement(element)) return;

      const childElements = Array.from(element.children).filter(
        (c) => (c as HTMLElement).tagName !== "BR"
      );
      if (childElements.length > 0) return;

      const rawText = getTextWithLineBreaksFromChildNodes(element);
      const trimmed = rawText.trim();
      if (!trimmed) return;

      const dataPath = findDataPath(slideData, trimmed);
      if (!dataPath) return;

      const style = styleMap[dataPath];
      if (!style) return;

      if (style.fontFamily) element.style.fontFamily = style.fontFamily;
      if (style.fontSize) element.style.fontSize = `${style.fontSize}px`;

      element.setAttribute("data-text-style-processed", "true");
    });
  }, [slideData, properties]);

  return <div ref={containerRef}>{children}</div>;
}
