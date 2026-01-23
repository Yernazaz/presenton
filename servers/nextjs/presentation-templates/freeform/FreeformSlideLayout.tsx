"use client";

import React, { useMemo, useRef, useState } from "react";
import * as z from "zod";
import { useDispatch } from "react-redux";
import { Trash2 } from "lucide-react";
import {
  appendSlideArrayItem,
  removeSlideArrayItem,
  updateSlideValue,
} from "@/store/slices/presentationGeneration";
import TiptapText from "@/app/(presentation-generator)/components/TiptapText";
import { ImageSchema } from "@/presentation-templates/defaultSchemes";
import ImageEditor from "@/app/(presentation-generator)/components/ImageEditor";

export const layoutId = "freeform-slide";
export const layoutName = "Freeform (Builder)";
export const layoutDescription =
  "A blank slide where you can add and position text/images freely.";

const TextElementSchema = z.object({
  id: z.string().min(1),
  type: z.literal("text"),
  x: z.number().min(0).max(1280).default(80),
  y: z.number().min(0).max(720).default(80),
  w: z.number().min(40).max(1280).default(520),
  h: z.number().min(20).max(720).default(120),
  // Allow long markdown/LaTeX blocks; fitting is handled by the UI.
  text: z.string().min(0).max(5000).default("Click to edit text..."),
  fontFamily: z.string().optional(),
  fontSize: z.number().min(10).max(96).optional(),
});

const ImageElementSchema = z.object({
  id: z.string().min(1),
  type: z.literal("image"),
  x: z.number().min(0).max(1280).default(80),
  y: z.number().min(0).max(720).default(240),
  w: z.number().min(40).max(1280).default(520),
  h: z.number().min(40).max(720).default(320),
  // Freeform can accept relative/local URLs (e.g. `/app_data/...`, `blob:...`),
  // so don't require strict `url()` validation here.
  image: ImageSchema.extend({
    __image_url__: z.string().min(1),
    // Prompts can be long (copied from LLM output); keep it permissive.
    __image_prompt__: z.string().min(0).max(500).default(""),
  }).default({
    __image_url__:
      "https://images.pexels.com/photos/31527637/pexels-photo-31527637.jpeg",
    __image_prompt__: "Placeholder image",
  }),
});

const ElementSchema = z.discriminatedUnion("type", [
  TextElementSchema,
  ImageElementSchema,
]);

const freeformSchema = z.object({
  title: z.string().min(0).max(80).default(""),
  elements: z.array(ElementSchema).default([
    {
      id: "el-1",
      type: "text" as const,
      x: 80,
      y: 80,
      w: 1120,
      h: 120,
      text: "Click to edit. Use toolbar to add elements.",
      fontSize: 44,
      fontFamily: "Inter",
    },
  ]),
});

export const Schema = freeformSchema;
export type FreeformSlideData = z.infer<typeof freeformSchema>;

type LayoutProps = {
  data?: Partial<FreeformSlideData>;
  isEditMode?: boolean;
  slideIndex?: number;
};

type DragMode = "move" | "resize";

const dynamicSlideLayout: React.FC<LayoutProps> = ({
  data: slideData,
  isEditMode = false,
  slideIndex,
}) => {
  const dispatch = useDispatch();
  const data = freeformSchema.parse(slideData || {});

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState<number | null>(null);
  const dragRef = useRef<{
    id: string;
    mode: DragMode;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    index: number;
  } | null>(null);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const idx = data.elements.findIndex((e) => e.id === selectedId);
    return idx >= 0 ? { idx, el: data.elements[idx] } : null;
  }, [data.elements, selectedId]);

  const isValidSlideIndex = (idx: number | undefined): idx is number =>
    typeof idx === "number";

  const addText = () => {
    if (!isValidSlideIndex(slideIndex)) return;
    const id = `el-${crypto.randomUUID()}`;
    dispatch(
      appendSlideArrayItem({
        slideIndex,
        dataPath: "elements",
        value: {
          id,
          type: "text",
          x: 120,
          y: 120,
          w: 520,
          h: 140,
          text: "New text",
          fontFamily: "Inter",
          fontSize: 20,
        },
      })
    );
    setSelectedId(id);
  };

  const addImage = () => {
    if (!isValidSlideIndex(slideIndex)) return;
    const id = `el-${crypto.randomUUID()}`;
    dispatch(
      appendSlideArrayItem({
        slideIndex,
        dataPath: "elements",
        value: {
          id,
          type: "image",
          x: 120,
          y: 280,
          w: 520,
          h: 300,
          image: {
            __image_url__:
              "https://images.pexels.com/photos/31527637/pexels-photo-31527637.jpeg",
            __image_prompt__: "Placeholder image",
          },
        },
      })
    );
    setSelectedId(id);
  };

  const deleteSelected = () => {
    if (!isValidSlideIndex(slideIndex)) return;
    if (!selected) return;
    dispatch(
      removeSlideArrayItem({
        slideIndex,
        dataPath: "elements",
        index: selected.idx,
      })
    );
    setSelectedId(null);
  };

  const deleteAtIndex = (idx: number) => {
    if (!isValidSlideIndex(slideIndex)) return;
    dispatch(
      removeSlideArrayItem({
        slideIndex,
        dataPath: "elements",
        index: idx,
      })
    );
    setSelectedId(null);
  };

  const startDrag = (
    e: React.PointerEvent,
    idx: number,
    id: string,
    mode: DragMode
  ) => {
    if (!isValidSlideIndex(slideIndex)) return;
    e.preventDefault();
    e.stopPropagation();
    const el = data.elements[idx] as any;
    dragRef.current = {
      id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      origW: el.w,
      origH: el.h,
      index: idx,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(id);
  };

  const onDragMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!isValidSlideIndex(slideIndex)) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    const nextX =
      drag.mode === "move" ? Math.max(0, Math.min(1280 - 10, drag.origX + dx)) : drag.origX;
    const nextY =
      drag.mode === "move" ? Math.max(0, Math.min(720 - 10, drag.origY + dy)) : drag.origY;

    const nextW =
      drag.mode === "resize"
        ? Math.max(40, Math.min(1280 - drag.origX, drag.origW + dx))
        : drag.origW;
    const nextH =
      drag.mode === "resize"
        ? Math.max(20, Math.min(720 - drag.origY, drag.origH + dy))
        : drag.origH;

    dispatch(
      updateSlideValue({
        slideIndex,
        dataPath: `elements[${drag.index}].x`,
        value: nextX,
      })
    );
    dispatch(
      updateSlideValue({
        slideIndex,
        dataPath: `elements[${drag.index}].y`,
        value: nextY,
      })
    );
    dispatch(
      updateSlideValue({
        slideIndex,
        dataPath: `elements[${drag.index}].w`,
        value: nextW,
      })
    );
    dispatch(
      updateSlideValue({
        slideIndex,
        dataPath: `elements[${drag.index}].h`,
        value: nextH,
      })
    );
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div
      className="w-full rounded-sm max-w-[1280px] shadow-lg max-h-[720px] aspect-video bg-white relative z-20 mx-auto overflow-hidden"
      style={{ fontFamily: "Inter" }}
      onPointerMove={isEditMode ? onDragMove : undefined}
      onPointerUp={isEditMode ? endDrag : undefined}
      onPointerCancel={isEditMode ? endDrag : undefined}
      onClick={() => setSelectedId(null)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (!isEditMode) return;
        if (!selected) return;
        const target = e.target as HTMLElement | null;
        const isTyping =
          !!target &&
          (target.isContentEditable ||
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            !!target.closest(".tiptap-text-editor"));
        if (isTyping) return;

        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          deleteSelected();
        }
      }}
    >
      {isEditMode &&
        activeImageIdx !== null &&
        isValidSlideIndex(slideIndex) &&
        data.elements[activeImageIdx] &&
        (data.elements[activeImageIdx] as any).type === "image" && (
          <ImageEditor
            initialImage={(data.elements[activeImageIdx] as any).image?.__image_url__ || null}
            slideIndex={slideIndex}
            promptContent={(data.elements[activeImageIdx] as any).image?.__image_prompt__ || ""}
            onClose={() => setActiveImageIdx(null)}
            onImageChange={(newUrl, prompt) => {
              dispatch(
                updateSlideValue({
                  slideIndex,
                  dataPath: `elements[${activeImageIdx}].image.__image_url__`,
                  value: newUrl,
                })
              );
              if (prompt !== undefined) {
                dispatch(
                  updateSlideValue({
                    slideIndex,
                    dataPath: `elements[${activeImageIdx}].image.__image_prompt__`,
                    value: prompt,
                  })
                );
              }
            }}
          />
        )}

      {isEditMode && (
        <div className="absolute top-3 right-3 z-50 flex flex-col sm:flex-row gap-2 bg-white/90 border border-gray-200 rounded-md shadow-sm p-2">
          <button
            className="text-xs px-2 py-1 rounded bg-gray-900 text-white whitespace-nowrap"
            onClick={(e) => {
              e.stopPropagation();
              addText();
            }}
          >
            Add text
          </button>
          <button
            className="text-xs px-2 py-1 rounded bg-gray-900 text-white whitespace-nowrap"
            onClick={(e) => {
              e.stopPropagation();
              addImage();
            }}
          >
            Add image
          </button>
          <button
            className="text-xs px-2 py-1 rounded border whitespace-nowrap"
            disabled={!selected}
            onClick={(e) => {
              e.stopPropagation();
              deleteSelected();
            }}
          >
            Delete
          </button>
        </div>
      )}

      {data.elements.map((el: any, idx: number) => {
        const isSelected = el.id === selectedId;
        const baseStyle: React.CSSProperties = {
          position: "absolute",
          left: el.x,
          top: el.y,
          width: el.w,
          height: el.h,
        };

        return (
          <div
            key={el.id}
            style={baseStyle}
            className={[
              "overflow-hidden",
              isSelected && isEditMode ? "ring-2 ring-blue-500" : "",
            ].join(" ")}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(el.id);
            }}
          >
            {isSelected && isEditMode ? (
              <button
                type="button"
                className="absolute top-1 right-1 z-50 rounded bg-white/95 border shadow p-1 hover:bg-red-50"
                title="Delete element"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  deleteAtIndex(idx);
                }}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            ) : null}

            {isEditMode && (
              <>
                <div
                  className="absolute left-0 top-0 z-40 w-5 h-5 bg-blue-500/80 cursor-move"
                  title="Move"
                  onPointerDown={(e) => startDrag(e, idx, el.id, "move")}
                />
                <div
                  className="absolute right-0 bottom-0 z-40 w-5 h-5 bg-blue-500/80 cursor-nwse-resize"
                  title="Resize"
                  onPointerDown={(e) => startDrag(e, idx, el.id, "resize")}
                />
              </>
            )}

            {el.type === "text" ? (
              <div className="w-full h-full p-2">
                <TiptapText
                  content={el.text || ""}
                  textStyle={{
                    fontFamily: el.fontFamily,
                    fontSize: el.fontSize,
                  }}
                  toolbarMode="header"
                  onTextStyleChange={(style) => {
                    if (!isValidSlideIndex(slideIndex)) return;
                    dispatch(
                      updateSlideValue({
                        slideIndex,
                        dataPath: `elements[${idx}].fontFamily`,
                        value: style.fontFamily,
                      })
                    );
                    dispatch(
                      updateSlideValue({
                        slideIndex,
                        dataPath: `elements[${idx}].fontSize`,
                        value: style.fontSize,
                      })
                    );
                  }}
                  onContentChange={(next) => {
                    if (!isValidSlideIndex(slideIndex)) return;
                    dispatch(
                      updateSlideValue({
                        slideIndex,
                        dataPath: `elements[${idx}].text`,
                        value: next,
                      })
                    );
                  }}
                  className="w-full h-full"
                  placeholder="Enter text..."
                />
              </div>
            ) : (
              <img
                src={el.image?.__image_url__ || ""}
                alt={el.image?.__image_prompt__ || "image"}
                className="w-full h-full object-fill cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isEditMode) return;
                  setSelectedId(el.id);
                  setActiveImageIdx(idx);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default dynamicSlideLayout;
