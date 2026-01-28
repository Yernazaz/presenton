from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from constants.education_templates import (
    SUPPORTED_SCHOOL_SUBJECTS,
    default_class_subject_template,
)
from models.sql.teacher import TeacherModel
from models.sql.teacher_class_subject_template import TeacherClassSubjectTemplateModel
from models.sql.teacher_settings import TeacherSettingsModel
from services.auth import get_current_teacher, issue_token, revoke_token
from services.database import get_async_session
from utils.auth_utils import hash_password, verify_password


AUTH_ROUTER = APIRouter(prefix="", tags=["Auth"])
http_bearer = HTTPBearer(auto_error=False)


@AUTH_ROUTER.post("/register")
async def register(
    email: str = Body(...),
    password: str = Body(...),
    full_name: str = Body(...),
    phone: Optional[str] = Body(default=None),
    school: Optional[str] = Body(default=None),
    position: Optional[str] = Body(default=None),
    sql_session: AsyncSession = Depends(get_async_session),
):
    normalized_email = email.strip().lower()
    existing = await sql_session.scalar(
        select(TeacherModel).where(TeacherModel.email == normalized_email)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    try:
        password_hash = hash_password(password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    teacher = TeacherModel(
        email=normalized_email,
        full_name=full_name.strip(),
        phone=phone,
        school=school,
        position=position,
        password_hash=password_hash,
    )
    sql_session.add(teacher)
    await sql_session.commit()

    # Default per-teacher templates (grades 1..11 x 4 subjects)
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

    settings = TeacherSettingsModel(
        teacher_id=teacher.id, default_grade=5, default_subject="math"
    )
    sql_session.add(settings)
    await sql_session.commit()

    token = await issue_token(sql_session, teacher.id)
    return {
        "token": token.token,
        "teacher": {
            "id": str(teacher.id),
            "email": teacher.email,
            "full_name": teacher.full_name,
            "phone": teacher.phone,
            "school": teacher.school,
            "position": teacher.position,
        },
    }


@AUTH_ROUTER.post("/login")
async def login(
    email: str = Body(...),
    password: str = Body(...),
    sql_session: AsyncSession = Depends(get_async_session),
):
    teacher = await sql_session.scalar(select(TeacherModel).where(TeacherModel.email == email.strip().lower()))
    if not teacher or not verify_password(password, teacher.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = await issue_token(sql_session, teacher.id)
    return {"token": token.token}


@AUTH_ROUTER.get("/me")
async def me(teacher: TeacherModel = Depends(get_current_teacher)):
    return {
        "id": str(teacher.id),
        "email": teacher.email,
        "full_name": teacher.full_name,
        "phone": teacher.phone,
        "school": teacher.school,
        "position": teacher.position,
        "created_at": teacher.created_at,
        "updated_at": teacher.updated_at,
    }


@AUTH_ROUTER.post("/logout")
async def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    sql_session: AsyncSession = Depends(get_async_session),
):
    if not credentials or credentials.scheme.lower() != "bearer":
        return {"ok": True}
    await revoke_token(sql_session, credentials.credentials)
    return {"ok": True}
