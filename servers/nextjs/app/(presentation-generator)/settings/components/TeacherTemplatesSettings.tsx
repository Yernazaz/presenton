"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { TeacherApi } from "@/app/(presentation-generator)/services/api/teacher";
import type {
  Subject,
  TeacherClassSubjectTemplate,
  TeacherPromptTemplate,
  TeacherSettings,
} from "@/types/teacher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const SUBJECTS: Subject[] = ["math", "physics", "biology", "literature"];
const SUBJECT_LABEL: Record<Subject, string> = {
  math: "Математика",
  physics: "Физика",
  biology: "Биология",
  literature: "Литература",
};

const GRADES = Array.from({ length: 11 }, (_, i) => String(i + 1));

function normalizeTemplateId(value: string): string | null {
  if (value === "none") return null;
  return value;
}

export function TeacherTemplatesSettings() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<TeacherSettings | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<TeacherPromptTemplate[]>([]);
  const [classTemplates, setClassTemplates] = useState<TeacherClassSubjectTemplate[]>([]);

  const [savingDefaults, setSavingDefaults] = useState(false);

  // Defaults draft
  const [defaultGrade, setDefaultGrade] = useState<string>("5");
  const [defaultSubject, setDefaultSubject] = useState<Subject>("math");
  const [defaultPromptTemplateId, setDefaultPromptTemplateId] = useState<string>("none");

  // Create template
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [newActive, setNewActive] = useState(true);
  const [creating, setCreating] = useState(false);

  // Edit template
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Class/subject editor
  const [csGrade, setCsGrade] = useState<string>("5");
  const [csSubject, setCsSubject] = useState<Subject>("math");
  const [csTemplate, setCsTemplate] = useState("");
  const [savingClassSubject, setSavingClassSubject] = useState(false);

  const activePromptTemplates = useMemo(
    () => promptTemplates.filter((t) => t.is_active),
    [promptTemplates]
  );

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, prompts, cls] = await Promise.all([
        TeacherApi.getSettings(),
        TeacherApi.listPromptTemplates(),
        TeacherApi.listClassSubjectTemplates(),
      ]);
      setSettings(s);
      setPromptTemplates(prompts);
      setClassTemplates(cls);

      setDefaultGrade(String(s.default_grade));
      setDefaultSubject(s.default_subject);
      setDefaultPromptTemplateId(s.default_prompt_template_id ?? "none");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load teacher settings";
      toast.error(message);
      if (message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("authorization")) {
        router.replace(`/auth/login?next=${encodeURIComponent(pathname || "/settings")}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const grade = Number(csGrade);
    const row = classTemplates.find((t) => t.grade === grade && t.subject === csSubject);
    setCsTemplate(row?.template ?? "");
  }, [csGrade, csSubject, classTemplates]);

  const saveDefaults = async () => {
    setSavingDefaults(true);
    try {
      const updated = await TeacherApi.updateSettings({
        default_grade: Number(defaultGrade),
        default_subject: defaultSubject,
        default_prompt_template_id: normalizeTemplateId(defaultPromptTemplateId),
      });
      setSettings(updated);
      toast.success("Сохранено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingDefaults(false);
    }
  };

  const startEdit = (tmpl: TeacherPromptTemplate) => {
    setEditId(tmpl.id);
    setEditName(tmpl.name);
    setEditTemplate(tmpl.template);
    setEditActive(tmpl.is_active);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName("");
    setEditTemplate("");
    setEditActive(true);
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSavingEdit(true);
    try {
      const updated = await TeacherApi.updatePromptTemplate(editId, {
        name: editName,
        template: editTemplate,
        is_active: editActive,
      });
      setPromptTemplates((prev) => prev.map((t) => (t.id === editId ? updated : t)));
      toast.success("Шаблон обновлён");
      cancelEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update template");
    } finally {
      setSavingEdit(false);
    }
  };

  const createTemplate = async () => {
    if (!newName.trim() || !newTemplate.trim()) {
      toast.error("Заполни название и текст шаблона");
      return;
    }
    setCreating(true);
    try {
      const created = await TeacherApi.createPromptTemplate({
        name: newName.trim(),
        template: newTemplate,
        is_active: newActive,
      });
      setPromptTemplates((prev) => [created, ...prev]);
      setNewName("");
      setNewTemplate("");
      setNewActive(true);
      toast.success("Шаблон создан");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create template");
    } finally {
      setCreating(false);
    }
  };

  const setAsDefault = async (id: string | null) => {
    try {
      const updated = await TeacherApi.updateSettings({
        default_prompt_template_id: id,
      });
      setSettings(updated);
      setDefaultPromptTemplateId(id ?? "none");
      toast.success("Дефолт обновлён");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update default");
    }
  };

  const deleteTemplate = async (id: string) => {
    setDeletingId(id);
    try {
      await TeacherApi.deletePromptTemplate(id);
      setPromptTemplates((prev) => prev.filter((t) => t.id !== id));
      if (settings?.default_prompt_template_id === id) {
        await setAsDefault(null);
      }
      toast.success("Удалено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete template");
    } finally {
      setDeletingId(null);
    }
  };

  const saveClassSubject = async () => {
    setSavingClassSubject(true);
    try {
      await TeacherApi.upsertClassSubjectTemplate({
        grade: Number(csGrade),
        subject: csSubject,
        template: csTemplate,
      });
      // Reload to get ids/updated_at
      const refreshed = await TeacherApi.listClassSubjectTemplates();
      setClassTemplates(refreshed);
      toast.success("Сохранено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save class template");
    } finally {
      setSavingClassSubject(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Шаблоны промптов</CardTitle>
        <CardDescription>
          Создавай свои шаблоны и выбирай дефолт, который будет автоматически добавляться к генерации.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-gray-600">Загрузка...</div>
        ) : (
          <Tabs defaultValue="defaults" className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="defaults">Дефолт</TabsTrigger>
              <TabsTrigger value="prompts">Мои шаблоны</TabsTrigger>
              <TabsTrigger value="class">Класс/предмет</TabsTrigger>
            </TabsList>

            <TabsContent value="defaults">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Класс по умолчанию</Label>
                  <Select value={defaultGrade} onValueChange={setDefaultGrade}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выбери класс" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Предмет по умолчанию</Label>
                  <Select value={defaultSubject} onValueChange={(v) => setDefaultSubject(v as Subject)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выбери предмет" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SUBJECT_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Дефолтный шаблон (мой)</Label>
                  <Select value={defaultPromptTemplateId} onValueChange={setDefaultPromptTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Не выбран" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Не использовать</SelectItem>
                      {activePromptTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button onClick={saveDefaults} disabled={savingDefaults}>
                  {savingDefaults ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="prompts">
              <div className="rounded-lg border p-4">
                <div className="text-sm font-semibold">Создать шаблон</div>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div className="space-y-2">
                    <Label>Название</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Например: Мой стиль" />
                  </div>
                  <div className="space-y-2">
                    <Label>Текст шаблона</Label>
                    <Textarea value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)} rows={6} placeholder="Что добавлять к instructions..." />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={newActive} onCheckedChange={setNewActive} />
                    <span className="text-sm text-gray-700">Активен</span>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={createTemplate} disabled={creating}>
                      {creating ? "Создание..." : "Создать"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {promptTemplates.length === 0 ? (
                  <div className="text-sm text-gray-600">Пока нет шаблонов.</div>
                ) : (
                  promptTemplates.map((t) => {
                    const isDefault = settings?.default_prompt_template_id === t.id;
                    const isEditing = editId === t.id;
                    return (
                      <div key={t.id} className="rounded-lg border p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold truncate">{t.name}</div>
                              {isDefault && (
                                <span className="text-xs rounded-full bg-violet-100 text-violet-800 px-2 py-0.5">
                                  default
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {t.is_active ? "Активен" : "Выключен"}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {!isDefault && (
                              <Button variant="secondary" onClick={() => setAsDefault(t.id)}>
                                Сделать дефолтом
                              </Button>
                            )}
                            <Button variant="outline" onClick={() => (isEditing ? cancelEdit() : startEdit(t))}>
                              {isEditing ? "Закрыть" : "Редактировать"}
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => deleteTemplate(t.id)}
                              disabled={deletingId === t.id}
                            >
                              {deletingId === t.id ? "Удаление..." : "Удалить"}
                            </Button>
                          </div>
                        </div>

                        {isEditing && (
                          <div className="mt-4 grid grid-cols-1 gap-3">
                            <div className="space-y-2">
                              <Label>Название</Label>
                              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label>Текст</Label>
                              <Textarea value={editTemplate} onChange={(e) => setEditTemplate(e.target.value)} rows={8} />
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch checked={editActive} onCheckedChange={setEditActive} />
                              <span className="text-sm text-gray-700">Активен</span>
                            </div>
                            <div className="flex gap-2">
                              <Button onClick={saveEdit} disabled={savingEdit}>
                                {savingEdit ? "Сохранение..." : "Сохранить"}
                              </Button>
                              <Button variant="secondary" onClick={cancelEdit}>
                                Отмена
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="class">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Класс</Label>
                  <Select value={csGrade} onValueChange={setCsGrade}>
                    <SelectTrigger>
                      <SelectValue placeholder="Класс" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Предмет</Label>
                  <Select value={csSubject} onValueChange={(v) => setCsSubject(v as Subject)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Предмет" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SUBJECT_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Label>Шаблон для выбранного класса/предмета</Label>
                <Textarea value={csTemplate} onChange={(e) => setCsTemplate(e.target.value)} rows={10} />
                <div className="flex gap-2">
                  <Button onClick={saveClassSubject} disabled={savingClassSubject}>
                    {savingClassSubject ? "Сохранение..." : "Сохранить"}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
