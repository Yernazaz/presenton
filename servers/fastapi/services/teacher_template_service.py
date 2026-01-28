from typing import Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from constants.education_templates import SUPPORTED_SCHOOL_SUBJECTS
from models.sql.teacher import TeacherModel
from models.sql.teacher_class_subject_template import TeacherClassSubjectTemplateModel
from models.sql.teacher_prompt_template import TeacherPromptTemplateModel
from models.sql.teacher_settings import TeacherSettingsModel


def _join_instructions(*parts: Optional[str]) -> Optional[str]:
    cleaned = [p.strip() for p in parts if p and p.strip()]
    if not cleaned:
        return None
    return "\n\n".join(cleaned)


async def resolve_teacher_instructions(
    base_instructions: Optional[str],
    grade: Optional[int],
    subject: Optional[str],
    prompt_template_id: Optional[uuid.UUID],
    disable_prompt_template: bool,
    sql_session: AsyncSession,
    teacher: Optional[TeacherModel],
) -> tuple[
    Optional[str],
    Optional[int],
    Optional[str],
    Optional[uuid.UUID],
    Optional[str],
    Optional[str],
]:
    if not teacher:
        return (base_instructions, grade, subject, prompt_template_id, None, None)

    settings = await sql_session.get(TeacherSettingsModel, teacher.id)
    resolved_grade = grade if grade is not None else (settings.default_grade if settings else None)
    resolved_subject = subject if subject is not None else (settings.default_subject if settings else None)
    resolved_prompt_template_id: Optional[uuid.UUID] = None
    if not disable_prompt_template:
        resolved_prompt_template_id = (
            prompt_template_id
            if prompt_template_id is not None
            else (settings.default_prompt_template_id if settings else None)
        )

    prompt_template_text: Optional[str] = None
    class_subject_text: Optional[str] = None

    if resolved_prompt_template_id:
        tmpl = await sql_session.get(TeacherPromptTemplateModel, resolved_prompt_template_id)
        if tmpl and tmpl.teacher_id == teacher.id and tmpl.is_active:
            prompt_template_text = tmpl.template

    if resolved_grade is not None and resolved_subject is not None:
        if 1 <= resolved_grade <= 11 and resolved_subject in SUPPORTED_SCHOOL_SUBJECTS:
            class_tmpl = await sql_session.scalar(
                select(TeacherClassSubjectTemplateModel).where(
                    (TeacherClassSubjectTemplateModel.teacher_id == teacher.id)
                    & (TeacherClassSubjectTemplateModel.grade == resolved_grade)
                    & (TeacherClassSubjectTemplateModel.subject == resolved_subject)
                )
            )
            if class_tmpl:
                class_subject_text = class_tmpl.template

    effective = _join_instructions(base_instructions, prompt_template_text, class_subject_text)
    return (
        effective,
        resolved_grade,
        resolved_subject,
        resolved_prompt_template_id,
        prompt_template_text,
        class_subject_text,
    )


async def apply_teacher_templates_to_request(
    request,
    sql_session: AsyncSession,
    teacher: Optional[TeacherModel],
):
    """
    Mutates request.instructions by appending teacher templates, if teacher provided.
    Also fills missing grade/subject/prompt_template_id from teacher settings.
    """
    disable_prompt_template = bool(getattr(request, "disable_prompt_template", False))
    effective, resolved_grade, resolved_subject, resolved_prompt_template_id, _, _ = (
        await resolve_teacher_instructions(
            request.instructions,
            getattr(request, "grade", None),
            getattr(request, "subject", None),
            getattr(request, "prompt_template_id", None),
            disable_prompt_template,
            sql_session,
            teacher,
        )
    )
    request.instructions = effective
    if hasattr(request, "grade"):
        request.grade = resolved_grade
    if hasattr(request, "subject"):
        request.subject = resolved_subject
    if hasattr(request, "prompt_template_id"):
        request.prompt_template_id = resolved_prompt_template_id
    return request
