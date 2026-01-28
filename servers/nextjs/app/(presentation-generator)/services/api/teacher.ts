import { ApiResponseHandler } from "@/app/(presentation-generator)/services/api/api-error-handler";
import type {
  Subject,
  TeacherClassSubjectTemplate,
  TeacherPromptTemplate,
  TeacherSettings,
  TeacherSettingsUpdate,
  ResolveTemplatesRequest,
  ResolvedTeacherTemplates,
} from "@/types/teacher";

export class TeacherApi {
  static async getSettings(): Promise<TeacherSettings> {
    const response = await fetch(`/api/v1/teacher/settings`, { method: "GET" });
    return ApiResponseHandler.handleResponse(response, "Failed to load settings");
  }

  static async updateSettings(update: TeacherSettingsUpdate): Promise<TeacherSettings> {
    const response = await fetch(`/api/v1/teacher/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(update),
    });
    return ApiResponseHandler.handleResponse(response, "Failed to update settings");
  }

  static async listPromptTemplates(): Promise<TeacherPromptTemplate[]> {
    const response = await fetch(`/api/v1/teacher/templates/prompts`, {
      method: "GET",
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to load prompt templates"
    );
  }

  static async createPromptTemplate(input: {
    name: string;
    template: string;
    is_active?: boolean;
  }): Promise<TeacherPromptTemplate> {
    const response = await fetch(`/api/v1/teacher/templates/prompts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        template: input.template,
        is_active: input.is_active ?? true,
      }),
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to create prompt template"
    );
  }

  static async updatePromptTemplate(
    id: string,
    update: Partial<Pick<TeacherPromptTemplate, "name" | "template" | "is_active">>
  ): Promise<TeacherPromptTemplate> {
    const response = await fetch(`/api/v1/teacher/templates/prompts/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(update),
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to update prompt template"
    );
  }

  static async deletePromptTemplate(id: string): Promise<void> {
    const response = await fetch(`/api/v1/teacher/templates/prompts/${id}`, {
      method: "DELETE",
    });
    await ApiResponseHandler.handleResponse(
      response,
      "Failed to delete prompt template"
    );
  }

  static async listClassSubjectTemplates(): Promise<TeacherClassSubjectTemplate[]> {
    const response = await fetch(`/api/v1/teacher/templates/class-subject`, {
      method: "GET",
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to load class/subject templates"
    );
  }

  static async upsertClassSubjectTemplate(input: {
    grade: number;
    subject: Subject;
    template: string;
  }): Promise<TeacherClassSubjectTemplate[]> {
    const response = await fetch(`/api/v1/teacher/templates/class-subject`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { grade: input.grade, subject: input.subject, template: input.template },
      ]),
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to update class/subject template"
    );
  }

  static async resolveTemplates(
    input: ResolveTemplatesRequest
  ): Promise<ResolvedTeacherTemplates> {
    const response = await fetch(`/api/v1/teacher/templates/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instructions: input.instructions ?? null,
        grade: input.grade ?? null,
        subject: input.subject ?? null,
        prompt_template_id: input.prompt_template_id ?? null,
        disable_prompt_template: !!input.disable_prompt_template,
      }),
    });
    return ApiResponseHandler.handleResponse(response, "Failed to resolve templates");
  }
}
