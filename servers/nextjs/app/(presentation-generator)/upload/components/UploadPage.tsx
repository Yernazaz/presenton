/**
 * UploadPage Component
 * 
 * This component handles the presentation generation upload process, allowing users to:
 * - Configure presentation settings (slides, language)
 * - Input prompts
 * - Upload supporting documents
 * 
 * @component
 */

"use client";
import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { clearOutlines, setPresentationId } from "@/store/slices/presentationGeneration";
import { ConfigurationSelects } from "./ConfigurationSelects";
import { PromptInput } from "./PromptInput";
import {  LanguageType, PresentationConfig, ToneType, VerbosityType } from "../type";
import SupportingDoc from "./SupportingDoc";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { OverlayLoader } from "@/components/ui/overlay-loader";
import Wrapper from "@/components/Wrapper";
import { setPptGenUploadState } from "@/store/slices/presentationGenUpload";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { TeacherApi } from "@/app/(presentation-generator)/services/api/teacher";
import type { ResolvedTeacherTemplates, TeacherPromptTemplate, Subject } from "@/types/teacher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Types for loading state
interface LoadingState {
  isLoading: boolean;
  message: string;
  duration?: number;
  showProgress?: boolean;
  extra_info?: string;
}

const UploadPage = () => {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();

  // State management
  const [files, setFiles] = useState<File[]>([]);
  const [config, setConfig] = useState<PresentationConfig>({
    slides: "8",
    language: LanguageType.English,
    prompt: "",
    tone: ToneType.Default,
    verbosity: VerbosityType.Standard,
    instructions: "",
    includeTableOfContents: false,
    includeTitleSlide: false,
    webSearch: false,
    grade: "5",
    subject: "math",
    prompt_template_id: null,
  });

  const [promptTemplates, setPromptTemplates] = useState<TeacherPromptTemplate[]>([]);
  const [resolvedTemplates, setResolvedTemplates] = useState<ResolvedTeacherTemplates | null>(null);
  const [resolving, setResolving] = useState(false);
  const resolveSeqRef = React.useRef(0);

  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    message: "",
    duration: 4,
    showProgress: false,
    extra_info: "",
  });

  /**
   * Updates the presentation configuration
   * @param key - Configuration key to update
   * @param value - New value for the configuration
   */
  const handleConfigChange = (key: keyof PresentationConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  React.useEffect(() => {
    (async () => {
      try {
        const templates = await TeacherApi.listPromptTemplates();
        setPromptTemplates(templates);
      } catch {
        // ignore (e.g. not logged in)
      }
    })();
  }, []);

  const resolveTemplates = async () => {
    const seq = ++resolveSeqRef.current;
    setResolving(true);
    try {
      const res = await TeacherApi.resolveTemplates({
        instructions: config.instructions || null,
        grade: config.grade ? Number(config.grade) : null,
        subject: (config.subject as Subject) || null,
        prompt_template_id: config.prompt_template_id || null,
        disable_prompt_template: config.prompt_template_id === "",
      });
      if (seq === resolveSeqRef.current) {
        setResolvedTemplates(res);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resolve templates");
    } finally {
      if (seq === resolveSeqRef.current) {
        setResolving(false);
      }
    }
  };

  React.useEffect(() => {
    const handle = setTimeout(() => {
      resolveTemplates();
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.grade, config.subject, config.prompt_template_id]);

  /**
   * Validates the current configuration and files
   * @returns boolean indicating if the configuration is valid
   */
  const validateConfiguration = (): boolean => {
    if (!config.language || !config.slides) {
      toast.error("Please select number of Slides & Language");
      return false;
    }

    if (!config.prompt.trim() && files.length === 0) {
      toast.error("No Prompt or Document Provided");
      return false;
    }
    return true;
  };

  /**
   * Handles the presentation generation process
   */
  const handleGeneratePresentation = async () => {
    if (!validateConfiguration()) return;

    try {
      const hasUploadedAssets = files.length > 0;

      if (hasUploadedAssets) {
        await handleDocumentProcessing();
      } else {
        await handleDirectPresentationGeneration();
      }
    } catch (error) {
      handleGenerationError(error);
    }
  };

  /**
   * Handles document processing
   */
  const handleDocumentProcessing = async () => {
    setLoadingState({
      isLoading: true,
      message: "Processing documents...",
      showProgress: true,
      duration: 90,
      extra_info: files.length > 0 ? "It might take a few minutes for large documents." : "",
    });

    let documents = [];

    if (files.length > 0) {
      trackEvent(MixpanelEvent.Upload_Upload_Documents_API_Call);
      const uploadResponse = await PresentationGenerationApi.uploadDoc(files);
      documents = uploadResponse;
    }

    const promises: Promise<any>[] = [];

    if (documents.length > 0) {
      trackEvent(MixpanelEvent.Upload_Decompose_Documents_API_Call);
      promises.push(PresentationGenerationApi.decomposeDocuments(documents));
    }
    const responses = await Promise.all(promises);
    dispatch(setPptGenUploadState({
      config,
      files: responses,
    }));
    dispatch(clearOutlines())
    trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/documents-preview" });
    router.push("/documents-preview");
  };

  /**
   * Handles direct presentation generation without documents
   */
  const handleDirectPresentationGeneration = async () => {
    setLoadingState({
      isLoading: true,
      message: "Generating outlines...",
      showProgress: true,
      duration: 30,
    });

    // Use the first available layout group for direct generation
    trackEvent(MixpanelEvent.Upload_Create_Presentation_API_Call);
    const createResponse = await PresentationGenerationApi.createPresentation({
      content: config?.prompt ?? "",
      n_slides: config?.slides ? parseInt(config.slides) : null,
      file_paths: [],
      language: config?.language ?? "",
      tone: config?.tone,
      verbosity: config?.verbosity,
      instructions: config?.instructions || null,
      include_table_of_contents: !!config?.includeTableOfContents,
      include_title_slide: !!config?.includeTitleSlide,
      web_search: !!config?.webSearch,
      grade: config.grade ? Number(config.grade) : null,
      subject: config.subject || null,
      prompt_template_id: config.prompt_template_id || null,
      disable_prompt_template: config.prompt_template_id === "",
    });


    dispatch(setPresentationId(createResponse.id));
    dispatch(clearOutlines())
    trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/outline" });
    router.push("/outline");
  };

  /**
   * Handles errors during presentation generation
   */
  const handleGenerationError = (error: any) => {
    console.error("Error in upload page", error);
    setLoadingState({
      isLoading: false,
      message: "",
      duration: 0,
      showProgress: false,
    });
    toast.error("Error", {
      description: error.message || "Error in upload page.",
    });
  };

  return (
    <Wrapper className="pb-10 lg:max-w-[70%] xl:max-w-[65%]">
      <OverlayLoader
        show={loadingState.isLoading}
        text={loadingState.message}
        showProgress={loadingState.showProgress}
        duration={loadingState.duration}
        extra_info={loadingState.extra_info}
      />
      <div className="flex flex-col gap-4 md:items-center md:flex-row justify-between py-4">
        <p></p>
        <ConfigurationSelects
          config={config}
          onConfigChange={handleConfigChange}
        />
      </div>

      <div className="relative">
        <PromptInput
          value={config.prompt}
          onChange={(value) => handleConfigChange("prompt", value)}
          data-testid="prompt-input"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Шаблоны для генерации</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Класс</Label>
              <Select value={config.grade || "5"} onValueChange={(v) => handleConfigChange("grade", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Класс" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 11 }, (_, i) => String(i + 1)).map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Предмет</Label>
              <Select
                value={config.subject || "math"}
                onValueChange={(v) => handleConfigChange("subject", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Предмет" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="math">Математика</SelectItem>
                  <SelectItem value="physics">Физика</SelectItem>
                  <SelectItem value="biology">Биология</SelectItem>
                  <SelectItem value="literature">Литература</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Мой шаблон</Label>
              <Select
                value={config.prompt_template_id || "none"}
                onValueChange={(v) => handleConfigChange("prompt_template_id", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Не выбран" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не использовать</SelectItem>
                  {promptTemplates
                    .filter((t) => t.is_active)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Link href="/prompts" className="text-xs text-gray-600 hover:text-gray-900 underline underline-offset-2">
                Управлять шаблонами
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={resolveTemplates} disabled={resolving}>
              {resolving ? "Проверяю..." : "Проверить шаблоны"}
            </Button>
            <span className="text-xs text-gray-500">
              Покажет, что реально уйдёт в `instructions` при генерации.
            </span>
          </div>

          {resolvedTemplates && (
            <div className="space-y-2">
              <Label>Итоговый instructions (preview)</Label>
              <Textarea value={resolvedTemplates.effective_instructions || ""} readOnly rows={8} />
            </div>
          )}
        </CardContent>
      </Card>
      <SupportingDoc
        files={[...files]}
        onFilesChange={setFiles}
        data-testid="file-upload-input"
      />
      <Button
        onClick={handleGeneratePresentation}
        className="w-full rounded-[32px] flex items-center justify-center py-6 bg-[#5141e5] text-white font-instrument_sans font-semibold text-xl hover:bg-[#5141e5]/80 transition-colors duration-300"
        data-testid="next-button"
      >
        <span>Next</span>
        <ChevronRight className="!w-6 !h-6" />
      </Button>
    </Wrapper>
  );
};

export default UploadPage;
