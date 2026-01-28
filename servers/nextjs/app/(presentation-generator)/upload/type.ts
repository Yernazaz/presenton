export interface UploadedFile {
  id: string;
  file: File;
  size: string;
}
export enum ThemeType {
  Light = "light",
  Dark = "dark",
  Custom = "custom",
  Faint_Yellow = "faint_yellow",
  Royal_Blue = "royal_blue",
  Light_Red = "light_red",
  Dark_Pink = "dark_pink",
}

export enum LanguageType {
  English = "English",
  Russian = "Russian (Русский)",
  Kazakh = "Kazakh (Қазақша)",
}

export interface PresentationConfig {
  slides: string | null;
  language: LanguageType | null;
  prompt: string;
  tone: ToneType;
  verbosity: VerbosityType;
  instructions: string;
  includeTableOfContents: boolean;
  includeTitleSlide: boolean;
  webSearch: boolean;

  // Optional teacher context for templates
  grade?: string;
  subject?: "math" | "physics" | "biology" | "literature";
  prompt_template_id?: string | null;
}

export enum ToneType {
  Default = "default",
  Casual = "casual",
  Professional = "professional",
  Funny = "funny",
  Educational = "educational",
  Sales_Pitch = "sales_pitch",
}

export enum VerbosityType {
  Concise = "concise",
  Standard = "standard",
  Text_Heavy = "text-heavy",
}
