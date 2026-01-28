"use client";
import React, { useMemo } from "react";
import { useDispatch } from "react-redux";
import { useLayout } from "../context/LayoutContext";
import EditableLayoutWrapper from "../components/EditableLayoutWrapper";
import SlideErrorBoundary from "../components/SlideErrorBoundary";
import TiptapTextReplacer from "../components/TiptapTextReplacer";
import LatexTextReplacer from "../components/LatexTextReplacer";
import { updateSlideContent } from "../../../store/slices/presentationGeneration";
import { updateTextStyle } from "../../../store/slices/presentationGeneration";
import { Loader2 } from "lucide-react";
import TextStyleReplacer from "../components/TextStyleReplacer";

export const useTemplateLayouts = () => {
  const dispatch = useDispatch();
  const { getLayoutById, getLayout, loading } =
    useLayout();

  const getTemplateLayout = useMemo(() => {
    return (layoutId: string, groupName: string) => {
      const layout = getLayoutById(layoutId);
      if (layout) {
        return getLayout(layoutId);
      }
      return null;
    };
  }, [getLayoutById, getLayout]);



  // Render slide content with group validation, automatic Tiptap text editing, and editable images/icons
  const renderSlideContent = useMemo(() => {
    return (slide: any, isEditMode: boolean) => {

      const Layout = getTemplateLayout(slide.layout, slide.layout_group);
      if (loading) {
        return (
          <div className="flex flex-col items-center justify-center aspect-video h-full bg-gray-100 rounded-lg">
            <Loader2 className="w-8 h-8 animate-spin text-blue-800" />
          </div>
        );
      }
      if (!Layout) {
        return (
          <div className="flex flex-col items-center justify-center aspect-video h-full bg-gray-100 rounded-lg">
            <p className="text-gray-600 text-center text-base">
              Layout &quot;{slide.layout}&quot; not found in &quot;
              {slide.layout_group}&quot; group
            </p>
          </div>
        );
      }

      const isFreeform =
        typeof slide?.layout === "string" && slide.layout.startsWith("freeform:");

      // Freeform layout is already a builder (it manages its own text/images),
      // so do not run replacers that assume static DOM text.
      if (isFreeform) {
        return (
          <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
            {(Layout as any)
              ? React.createElement(Layout as any, {
                  data: slide.content,
                  isEditMode,
                  slideIndex: slide.index,
                })
              : null}
          </SlideErrorBoundary>
        );
      }

      if (isEditMode) {
        return (
          <EditableLayoutWrapper
            slideIndex={slide.index}
            slideData={slide.content}
            properties={slide.properties}
          >
            <TextStyleReplacer slideData={slide.content} properties={slide.properties}>
              <LatexTextReplacer slideData={slide.content}>
                <TiptapTextReplacer
                  key={slide.id}
                  slideData={slide.content}
                  slideIndex={slide.index}
                  properties={slide.properties}
                  onContentChange={(
                    content: string,
                    dataPath: string,
                    slideIndex?: number
                  ) => {
                    if (dataPath && slideIndex !== undefined) {
                      dispatch(
                        updateSlideContent({
                          slideIndex: slideIndex,
                          dataPath: dataPath,
                          content: content,
                        })
                      );
                    }
                  }}
                  onTextStyleChange={(dataPath, style, slideIndex) => {
                    if (!dataPath || slideIndex === undefined) return;
                    dispatch(updateTextStyle({ slideIndex, dataPath, style }));
                  }}
                >
                  <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
                    {(Layout as any)
                      ? React.createElement(Layout as any, {
                          data: slide.content,
                          isEditMode: true,
                          slideIndex: slide.index,
                        })
                      : null}
                  </SlideErrorBoundary>
                </TiptapTextReplacer>
              </LatexTextReplacer>
            </TextStyleReplacer>
          </EditableLayoutWrapper>
        );
      }
      return (
        <TextStyleReplacer slideData={slide.content} properties={slide.properties}>
          <LatexTextReplacer slideData={slide.content}>
            <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
              {(Layout as any)
                ? React.createElement(Layout as any, {
                    data: slide.content,
                    isEditMode: false,
                    slideIndex: slide.index,
                  })
                : null}
            </SlideErrorBoundary>
          </LatexTextReplacer>
        </TextStyleReplacer>
      );
    };
  }, [getTemplateLayout, dispatch]);

  return {
    getTemplateLayout,
    renderSlideContent,
    loading,
  };
};
