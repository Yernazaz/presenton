from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.sql.auth_token import AuthTokenModel
from models.sql.teacher import TeacherModel
from services.database import get_async_session
from utils.auth_utils import generate_bearer_token
from utils.datetime_utils import get_current_utc_datetime


http_bearer = HTTPBearer(auto_error=False)

def _to_utc_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        # SQLite commonly returns naive datetimes even if timezone=True.
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def issue_token(
    sql_session: AsyncSession,
    teacher_id,
    ttl_days: int = 30,
) -> AuthTokenModel:
    token = AuthTokenModel(
        teacher_id=teacher_id,
        token=generate_bearer_token(),
        expires_at=get_current_utc_datetime() + timedelta(days=ttl_days),
        revoked=False,
    )
    sql_session.add(token)
    await sql_session.commit()
    return token


async def _get_teacher_from_token(
    sql_session: AsyncSession, token_value: str
) -> Optional[TeacherModel]:
    now = _to_utc_aware(get_current_utc_datetime())
    token_row = await sql_session.scalar(
        select(AuthTokenModel).where(AuthTokenModel.token == token_value)
    )
    if not token_row:
        return None
    if token_row.revoked:
        return None
    if token_row.expires_at and _to_utc_aware(token_row.expires_at) < now:
        return None
    teacher = await sql_session.get(TeacherModel, token_row.teacher_id)
    return teacher


async def get_optional_current_teacher(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    sql_session: AsyncSession = Depends(get_async_session),
) -> Optional[TeacherModel]:
    token_value: Optional[str] = None
    if credentials and credentials.scheme.lower() == "bearer":
        token_value = credentials.credentials
    else:
        token_value = request.cookies.get("auth_token")

    if not token_value:
        return None

    teacher = await _get_teacher_from_token(sql_session, token_value)
    if not teacher:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return teacher


async def get_current_teacher(
    teacher: Optional[TeacherModel] = Depends(get_optional_current_teacher),
) -> TeacherModel:
    if not teacher:
        raise HTTPException(status_code=401, detail="Authorization required")
    return teacher


async def revoke_token(
    sql_session: AsyncSession, token_value: str
) -> None:
    token_row = await sql_session.scalar(
        select(AuthTokenModel).where(AuthTokenModel.token == token_value)
    )
    if not token_row:
        return
    token_row.revoked = True
    sql_session.add(token_row)
    await sql_session.commit()
