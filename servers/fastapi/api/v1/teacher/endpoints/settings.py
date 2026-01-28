from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from constants.education_templates import SUPPORTED_SCHOOL_SUBJECTS
from constants.education_templates import default_class_subject_template
from models.sql.teacher import TeacherModel
from models.sql.teacher_class_subject_template import TeacherClassSubjectTemplateModel
from models.sql.teacher_prompt_template import TeacherPromptTemplateModel
from models.sql.teacher_settings import TeacherSettingsModel
from services.auth import get_current_teacher
from services.database import get_async_session


SETTINGS_ROUTER = APIRouter(prefix="/settings", tags=["Teacher"])

class TeacherSettingsUpdate(BaseModel):
    default_grade: Optional[int] = None
    default_subject: Optional[str] = None
    default_prompt_template_id: Optional[uuid.UUID] = None


@SETTINGS_ROUTER.get("")
async def get_settings(
    teacher: TeacherModel = Depends(get_current_teacher),
    sql_session: AsyncSession = Depends(get_async_session),
):
    settings = await sql_session.get(TeacherSettingsModel, teacher.id)
    if not settings:
        settings = TeacherSettingsModel(teacher_id=teacher.id)
        sql_session.add(settings)
        await sql_session.commit()

    # Ensure per-grade/per-subject templates exist for older teachers.
    any_template = await sql_session.scalar(
        select(TeacherClassSubjectTemplateModel).where(
            TeacherClassSubjectTemplateModel.teacher_id == teacher.id
        )
    )
    if not any_template:
        templates = []
        for grade in range(1, 12):
            for subject in SUPPORTED_SCHOOL_SUBJECTS:
                templates.append(
                    TeacherClassSubjectTemplateModel(
                        teacher_id=teacher.id,
                        grade=grade,
                        subject=subject,
                        template=default_class_subject_template(grade, subject),
                    )
                )
        sql_session.add_all(templates)
        await sql_session.commit()
    return settings


@SETTINGS_ROUTER.put("")
async def update_settings(
    update: TeacherSettingsUpdate,
    teacher: TeacherModel = Depends(get_current_teacher),
    sql_session: AsyncSession = Depends(get_async_session),
):
    settings = await sql_session.get(TeacherSettingsModel, teacher.id)
    if not settings:
        settings = TeacherSettingsModel(teacher_id=teacher.id)

    if "default_grade" in update.model_fields_set:
        if update.default_grade is None:
            raise HTTPException(status_code=400, detail="default_grade is required")
        if update.default_grade < 1 or update.default_grade > 11:
            raise HTTPException(status_code=400, detail="default_grade must be 1..11")
        settings.default_grade = update.default_grade

    if "default_subject" in update.model_fields_set:
        if update.default_subject is None:
            raise HTTPException(status_code=400, detail="default_subject is required")
        if update.default_subject not in SUPPORTED_SCHOOL_SUBJECTS:
            raise HTTPException(status_code=400, detail="Unsupported subject")
        settings.default_subject = update.default_subject

    if "default_prompt_template_id" in update.model_fields_set:
        if update.default_prompt_template_id is None:
            settings.default_prompt_template_id = None
        else:
            tmpl = await sql_session.get(
                TeacherPromptTemplateModel, update.default_prompt_template_id
            )
            if not tmpl or tmpl.teacher_id != teacher.id:
                raise HTTPException(status_code=404, detail="Prompt template not found")
            settings.default_prompt_template_id = update.default_prompt_template_id

    sql_session.add(settings)
    await sql_session.commit()
    return settings
