from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlmodel import Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime


class AuthTokenModel(SQLModel, table=True):
    __tablename__ = "auth_tokens"

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    teacher_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("teachers.id", ondelete="CASCADE"), index=True, nullable=False
        )
    )
    token: str = Field(
        sa_column=Column(String, unique=True, index=True, nullable=False)
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, default=get_current_utc_datetime
        ),
    )
    expires_at: Optional[datetime] = Field(
        sa_column=Column(DateTime(timezone=True), nullable=True), default=None
    )
    revoked: bool = Field(sa_column=Column(Boolean), default=False)

