"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import { createPortal } from "react-dom";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Underline from "@tiptap/extension-underline";
import {
  Bold,
  Italic,
  Underline as UnderlinedIcon,
  Strikethrough,
  Code,
} from "lucide-react";
import { renderInlineMarkdownWithLatex } from "@/utils/markdownWithLatex";
import { useActiveTiptapToolbar } from "./ActiveTiptapToolbarContext";


interface TiptapTextProps {
  content: string;
 
  onContentChange?: (content: string) => void;
  textStyle?: { fontFamily?: string; fontSize?: number };
  onTextStyleChange?: (style: { fontFamily?: string; fontSize?: number }) => void;
  className?: string;
  placeholder?: string;
  startInEditMode?: boolean;
  autoFocus?: boolean;
  onExit?: () => void;
  toolbarMode?: "bubble" | "floating" | "static" | "header" | "none";
 
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function autoFitText(element: HTMLElement, minScale = 0.7) {
  const computed = window.getComputedStyle(element);
  const baseFontSize = Number.parseFloat(computed.fontSize || "0");
  if (!Number.isFinite(baseFontSize) || baseFontSize <= 0) return;

  const target = element;
  const originalInline = target.style.fontSize;

  const fits = () =>
    target.scrollHeight <= target.clientHeight + 1 &&
    target.scrollWidth <= target.clientWidth + 1;

  // Only try to fit when the container actually constrains the content.
  if (target.clientHeight === 0 || target.clientWidth === 0) return;

  target.style.fontSize = `${baseFontSize}px`;
  if (fits()) return;

  const minFontSize = Math.max(10, baseFontSize * minScale);
  let current = baseFontSize;

  while (current > minFontSize) {
    current -= 1;
    target.style.fontSize = `${current}px`;
    if (fits()) return;
  }

  if (!fits() && originalInline) {
    target.style.fontSize = originalInline;
  }
}

const TiptapText: React.FC<TiptapTextProps> = ({
  content,
  onContentChange,
  textStyle,
  onTextStyleChange,
  className = "",
  placeholder = "Enter text...",
  startInEditMode = false,
  autoFocus = false,
  onExit,
  toolbarMode = "bubble",
}) => {
  const [isEditing, setIsEditing] = React.useState(startInEditMode);
  const displayRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(false);
  const toolbarCtx = useActiveTiptapToolbar();
  const toolbarContainerRef = useRef<HTMLDivElement>(null);
  const [floatingPos, setFloatingPos] = useState<{ top: number; left: number } | null>(null);

  const effectiveContent = useMemo(() => (content ?? "").toString(), [content]);

  const editor = useEditor({
    extensions: [StarterKit, Markdown, Underline],
    content: effectiveContent || "",

    editorProps: {
      attributes: {
        class: `outline-none focus:outline-none transition-all duration-200 ${className}`,
        "data-placeholder": placeholder,
      },
    },
    onFocus: () => {
      if (toolbarMode !== "header") return;
      if (!toolbarCtx) return;
      toolbarCtx.setActive({ editor, textStyle, onTextStyleChange });
    },
    onBlur: ({ editor }) => {
      if (exitingRef.current) return;
      exitingRef.current = true;

      // const element = editor?.options.element;
      // element?.classList.add("tiptap-text-edited");
      const markdown = editor?.storage.markdown.getMarkdown();
      // Bubble menu interactions are handled via preventDefault to keep focus,
      // so it's safe to persist even empty text (user may intentionally clear it).
      if (onContentChange) {
        onContentChange(markdown);
      }
      // Defer teardown to avoid ProseMirror cleanup racing React unmount.
      setTimeout(() => {
        setIsEditing(false);
        if (toolbarMode === "header") {
          toolbarCtx?.clearIfEditor(editor);
        }
        onExit?.();
        exitingRef.current = false;
      }, 0);
    },
    editable: true,
    immediatelyRender: true,
  });

  const updateFloatingPos = useCallback(() => {
    if (toolbarMode !== "floating") return;
    if (!isEditing) return;
    const editorEl = editorRef.current;
    const toolbarEl = toolbarContainerRef.current;
    if (!editorEl || !toolbarEl) return;

    const rect = editorEl.getBoundingClientRect();
    const toolbarRect = toolbarEl.getBoundingClientRect();

    const margin = 8;
    const preferredTop = rect.top - toolbarRect.height - margin;
    const top =
      preferredTop >= margin ? preferredTop : Math.min(window.innerHeight - toolbarRect.height - margin, rect.bottom + margin);

    const preferredLeft = rect.left;
    const left = Math.max(
      margin,
      Math.min(window.innerWidth - toolbarRect.width - margin, preferredLeft)
    );

    setFloatingPos({ top, left });
  }, [toolbarMode, isEditing]);

  useLayoutEffect(() => {
    if (toolbarMode !== "floating") return;
    if (!isEditing) return;
    updateFloatingPos();
  }, [toolbarMode, isEditing, updateFloatingPos, effectiveContent]);

  useEffect(() => {
    if (toolbarMode !== "floating") return;
    if (!isEditing) return;

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateFloatingPos();
      });
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [toolbarMode, isEditing, updateFloatingPos]);

  useEffect(() => {
    if (!editor) return;
    if (!isEditing) return;
    if (!autoFocus) return;
    const raf = requestAnimationFrame(() => editor.chain().focus().run());
    return () => cancelAnimationFrame(raf);
  }, [editor, isEditing, autoFocus]);

  // Update editor content when content prop changes
  useEffect(() => {
    if (!editor) return;
    // Compare against current plain text to avoid unnecessary updates
    const currentText = editor?.storage.markdown.getMarkdown();
    if ((effectiveContent || "") !== currentText) {
      editor.commands.setContent(effectiveContent || "");
    }
  }, [effectiveContent, editor]);

 

  if (!editor) {
    return <div className={className}>{effectiveContent || placeholder}</div>;
  }

  const renderedHtml = useMemo(() => {
    const source = effectiveContent || placeholder;
    try {
      const html = renderInlineMarkdownWithLatex(source);
      return html || escapeHtml(source);
    } catch {
      return escapeHtml(source);
    }
  }, [effectiveContent, placeholder]);

  useLayoutEffect(() => {
    // Fit both display and editor containers (used in PDF/PPTX export too).
    // Run after render to measure sizes.
    const element = isEditing ? editorRef.current : displayRef.current;
    if (!element) return;

    const raf = requestAnimationFrame(() => autoFitText(element));
    return () => cancelAnimationFrame(raf);
  }, [renderedHtml, isEditing]);

  if (!isEditing) {
    return (
      <div
        ref={displayRef}
        className={`tiptap-text-editor w-full ${className}`}
        style={{
          lineHeight: "inherit",
          fontSize: textStyle?.fontSize ? `${textStyle.fontSize}px` : "inherit",
          fontWeight: "inherit",
          fontFamily: textStyle?.fontFamily || "inherit",
          color: "inherit",
          textAlign: "inherit",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
        dangerouslySetInnerHTML={{ __html: renderedHtml || "" }}
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
          queueMicrotask(() => editor.commands.focus("end"));
          if (toolbarMode === "header") {
            toolbarCtx?.setActive({ editor, textStyle, onTextStyleChange });
          }
        }}
      />
    );
  }

  return (
    <>
      {toolbarMode !== "none" && toolbarMode !== "header" ? (
        toolbarMode === "bubble" ? (
          <BubbleMenu
            editor={editor}
            className="z-50"
            // BubbleMenu uses tippy which can throw `Node.removeChild` on teardown in some
            // edge cases; use `toolbarMode="static"` where stability matters.
            tippyOptions={{ duration: 100, interactive: true }}
          >
            <TiptapFormattingToolbar
              editor={editor}
              textStyle={textStyle}
              onTextStyleChange={onTextStyleChange}
            />
          </BubbleMenu>
        ) : toolbarMode === "floating" ? (
          isEditing && typeof document !== "undefined"
            ? createPortal(
                <div
                  ref={toolbarContainerRef}
                  style={{
                    position: "fixed",
                    top: floatingPos?.top ?? -9999,
                    left: floatingPos?.left ?? -9999,
                    zIndex: 10000,
                    pointerEvents: "auto",
                  }}
                >
                  <TiptapFormattingToolbar
                    editor={editor}
                    textStyle={textStyle}
                    onTextStyleChange={onTextStyleChange}
                  />
                </div>,
                document.body
              )
            : null
        ) : (
          <div className="relative z-50">
            <div className="absolute -top-14 left-0">
              <TiptapFormattingToolbar
                editor={editor}
                textStyle={textStyle}
                onTextStyleChange={onTextStyleChange}
              />
            </div>
          </div>
        )
      ) : null}

      <EditorContent
        editor={editor}
        ref={editorRef}
        className={`tiptap-text-editor w-full`}
        style={{
          // Ensure the editor maintains the same visual appearance
          lineHeight: "inherit",
          fontSize: textStyle?.fontSize ? `${textStyle.fontSize}px` : "inherit",
          fontWeight: "inherit",
          fontFamily: textStyle?.fontFamily || "inherit",
          color: "inherit",
          textAlign: "inherit",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      />
    </>
  );
};

export function TiptapFormattingToolbar({
  editor,
  textStyle,
  onTextStyleChange,
}: {
  editor: any;
  textStyle?: { fontFamily?: string; fontSize?: number };
  onTextStyleChange?: (style: { fontFamily?: string; fontSize?: number }) => void;
}) {
  return (
    <div
      style={{
        zIndex: 100,
      }}
      className="flex flex-wrap max-w-[min(92vw,900px)] text-black bg-white rounded-lg shadow-lg p-2 gap-1 border border-gray-200"
      onMouseDown={(e) => {
        // Keep editor focused while interacting with toolbar.
        e.preventDefault();
      }}
    >
      <select
        className="text-xs border rounded px-1 py-0.5 bg-white"
        value={textStyle?.fontFamily || ""}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          onTextStyleChange?.({
            fontFamily: e.target.value || undefined,
            fontSize: textStyle?.fontSize,
          });
          queueMicrotask(() => editor?.chain().focus().run());
        }}
        title="Font family"
      >
        <option value="">(inherit)</option>
        <option value="Inter">Inter</option>
        <option value="Poppins">Poppins</option>
        <option value="Playfair Display">Playfair Display</option>
        <option value="Roboto">Roboto</option>
        <option value="Arial">Arial</option>
        <option value="Times New Roman">Times New Roman</option>
      </select>

      <button
        onMouseDown={(e) => {
          e.preventDefault();
          onTextStyleChange?.({
            fontFamily: textStyle?.fontFamily,
            fontSize: Math.max(10, (textStyle?.fontSize || 16) - 1),
          });
          editor?.chain().focus().run();
        }}
        className="px-2 text-xs border rounded hover:bg-gray-100"
        title="Font size -"
      >
        A-
      </button>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          onTextStyleChange?.({
            fontFamily: textStyle?.fontFamily,
            fontSize: Math.min(96, (textStyle?.fontSize || 16) + 1),
          });
          editor?.chain().focus().run();
        }}
        className="px-2 text-xs border rounded hover:bg-gray-100"
        title="Font size +"
      >
        A+
      </button>

      <button
        onMouseDown={(e) => {
          e.preventDefault();
          editor?.chain().focus().toggleBold().run();
        }}
        className={`p-1 rounded hover:bg-gray-100 transition-colors ${
          editor?.isActive("bold") ? "bg-blue-100 text-blue-600" : ""
        }`}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          editor?.chain().focus().toggleItalic().run();
        }}
        className={`p-1 rounded hover:bg-gray-100 transition-colors ${
          editor?.isActive("italic") ? "bg-blue-100 text-blue-600" : ""
        }`}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          editor?.chain().focus().toggleUnderline().run();
        }}
        className={`p-1 rounded hover:bg-gray-100 transition-colors ${
          editor?.isActive("underline") ? "bg-blue-100 text-blue-600" : ""
        }`}
        title="Underline"
      >
        <UnderlinedIcon className="h-4 w-4" />
      </button>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          editor?.chain().focus().toggleStrike().run();
        }}
        className={`p-1 rounded hover:bg-gray-100 transition-colors ${
          editor?.isActive("strike") ? "bg-blue-100 text-blue-600" : ""
        }`}
        title="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </button>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          editor?.chain().focus().toggleCode().run();
        }}
        className={`p-1 rounded hover:bg-gray-100 transition-colors ${
          editor?.isActive("code") ? "bg-blue-100 text-blue-600" : ""
        }`}
        title="Code"
      >
        <Code className="h-4 w-4" />
      </button>
    </div>
  );
}

export default TiptapText;
