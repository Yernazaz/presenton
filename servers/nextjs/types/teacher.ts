export type Subject = "math" | "physics" | "biology" | "literature";

export interface TeacherSettings {
  teacher_id: string;
  default_grade: number;
  default_subject: Subject;
  default_prompt_template_id: string | null;
  updated_at: string;
}

export interface TeacherSettingsUpdate {
  default_grade?: number;
  default_subject?: Subject;
  default_prompt_template_id?: string | null;
}

export interface TeacherPromptTemplate {
  id: string;
  teacher_id: string;
  name: string;
  template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeacherClassSubjectTemplate {
  id: string;
  teacher_id: string;
  grade: number;
  subject: Subject;
  template: string;
  updated_at: string;
}

export interface ResolvedTeacherTemplates {
  effective_instructions: string | null;
  grade: number | null;
  subject: Subject | null;
  prompt_template_id: string | null;
  used: {
    prompt_template: string | null;
    class_subject_template: string | null;
  };
}

export interface ResolveTemplatesRequest {
  instructions?: string | null;
  grade?: number | null;
  subject?: Subject | null;
  prompt_template_id?: string | null;
  disable_prompt_template?: boolean | null;
}
