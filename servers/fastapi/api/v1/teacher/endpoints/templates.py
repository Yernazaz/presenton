from typing import List, Optional
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from pydantic import BaseModel

from constants.education_templates import SUPPORTED_SCHOOL_SUBJECTS
from models.sql.teacher import TeacherModel
from models.sql.teacher_class_subject_template import TeacherClassSubjectTemplateModel
from models.sql.teacher_prompt_template import TeacherPromptTemplateModel
from services.auth import get_current_teacher
from services.database import get_async_session
from services.teacher_template_service import resolve_teacher_instructions


TEMPLATES_ROUTER = APIRouter(prefix="/templates", tags=["Teacher"])


@TEMPLATES_ROUTER.get("/prompts", response_model=List[TeacherPromptTemplateModel])
async def list_prompt_templates(
    teacher: TeacherModel = Depends(get_current_teacher),
    sql_session: AsyncSession = Depends(get_async_session),
):
    rows = await sql_session.scalars(
        select(TeacherPromptTemplateModel)
        .where(TeacherPromptTemplateModel.teacher_id == teacher.id)
        .order_by(TeacherPromptTemplateModel.updated_at.desc())
    )
    return rows


@TEMPLATES_ROUTER.post("/prompts", response_model=TeacherPromptTemplateModel)
async def create_prompt_template(
    name: str = Body(...),
    template: str = Body(...),
    is_active: bool = Body(default=True),
    teacher: TeacherModel = Depends(get_current_teacher),
    sql_session: AsyncSession = Depends(get_async_session),
):
    row = TeacherPromptTemplateModel(
        teacher_id=teacher.id,
        name=name,
        template=template,
        is_active=is_active,
    )
    sql_session.add(row)
    await sql_session.commit()
    return row


@TEMPLATES_ROUTER.put("/prompts/{id}", response_model=TeacherPromptTemplateModel)
async def update_prompt_template(
    id: uuid.UUID = Path(...),
    name: Optional[str] = Body(default=None),
    template: Optional[str] = Body(default=None),
    is_active: Optional[bool] = Body(default=None),
    teacher: TeacherModel = Depends(get_current_teacher),
    sql_session: AsyncSession = Depends(get_async_session),
):
    row = await sql_session.get(TeacherPromptTemplateModel, id)
    if not row or row.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    if name is not None:
        row.name = name
    if template is not None:
        row.template = template
    if is_active is not None:
        row.is_active = is_active
    sql_session.add(row)
    await sql_session.commit()
    return row


@TEMPLATES_ROUTER.delete("/prompts/{id}", status_code=204)
async def delete_prompt_template(
    id: uuid.UUID = Path(...),
    teacher: TeacherModel = Depends(get_current_teacher),
    sql_session: AsyncSession = Depends(get_async_session),
):
    row = await sql_session.get(TeacherPromptTemplateModel, id)
    if not row or row.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    await sql_session.delete(row)
    await sql_session.commit()


@TEMPLATES_ROUTER.get(
    "/class-subject", response_model=List[TeacherClassSubjectTemplateModel]
)
async def list_class_subject_templates(
    teacher: TeacherModel = Depends(get_current_teacher),
    sql_session: AsyncSession = Depends(get_async_session),
):
    rows = await sql_session.scalars(
        select(TeacherClassSubjectTemplateModel)
        .where(TeacherClassSubjectTemplateModel.teacher_id == teacher.id)
        .order_by(TeacherClassSubjectTemplateModel.grade, TeacherClassSubjectTemplateModel.subject)
    )
    return rows


@TEMPLATES_ROUTER.put("/class-subject", response_model=List[TeacherClassSubjectTemplateModel])
async def bulk_update_class_subject_templates(
    updates: List[dict] = Body(...),
    teacher: TeacherModel = Depends(get_current_teacher),
    sql_session: AsyncSession = Depends(get_async_session),
):
    """
    updates: [{ "grade": 1..11, "subject": "math|physics|biology|literature", "template": "..." }, ...]
    """
    updated_rows: List[TeacherClassSubjectTemplateModel] = []
    for item in updates:
        grade = int(item.get("grade"))
        subject = str(item.get("subject"))
        template = str(item.get("template"))
        if grade < 1 or grade > 11:
            raise HTTPException(status_code=400, detail="grade must be 1..11")
        if subject not in SUPPORTED_SCHOOL_SUBJECTS:
            raise HTTPException(status_code=400, detail="Unsupported subject")

        row = await sql_session.scalar(
            select(TeacherClassSubjectTemplateModel).where(
                (TeacherClassSubjectTemplateModel.teacher_id == teacher.id)
                & (TeacherClassSubjectTemplateModel.grade == grade)
                & (TeacherClassSubjectTemplateModel.subject == subject)
            )
        )
        if not row:
            row = TeacherClassSubjectTemplateModel(
                teacher_id=teacher.id,
                grade=grade,
                subject=subject,
                template=template,
            )
        else:
            row.template = template
        sql_session.add(row)
        updated_rows.append(row)

    await sql_session.commit()
    return updated_rows


class ResolveTemplatesRequest(BaseModel):
    instructions: Optional[str] = None
    grade: Optional[int] = None
    subject: Optional[str] = None
    prompt_template_id: Optional[uuid.UUID] = None
    disable_prompt_template: bool = False


@TEMPLATES_ROUTER.post("/resolve")
async def resolve_templates(
    request: ResolveTemplatesRequest,
    teacher: TeacherModel = Depends(get_current_teacher),
    sql_session: AsyncSession = Depends(get_async_session),
):
    if request.grade is not None and (request.grade < 1 or request.grade > 11):
        raise HTTPException(status_code=400, detail="grade must be 1..11")
    if request.subject is not None and request.subject not in SUPPORTED_SCHOOL_SUBJECTS:
        raise HTTPException(status_code=400, detail="Unsupported subject")

    effective, grade, subject, prompt_template_id, prompt_text, class_text = (
        await resolve_teacher_instructions(
            request.instructions,
            request.grade,
            request.subject,
            request.prompt_template_id,
            request.disable_prompt_template,
            sql_session,
            teacher,
        )
    )
    return {
        "effective_instructions": effective,
        "grade": grade,
        "subject": subject,
        "prompt_template_id": str(prompt_template_id) if prompt_template_id else None,
        "used": {
            "prompt_template": prompt_text,
            "class_subject_template": class_text,
        },
    }
