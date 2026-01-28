from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlmodel import Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime


class TeacherPromptTemplateModel(SQLModel, table=True):
    __tablename__ = "teacher_prompt_templates"

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    teacher_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("teachers.id", ondelete="CASCADE"), index=True, nullable=False
        )
    )
    name: str = Field(sa_column=Column(String, nullable=False))
    template: str = Field(sa_column=Column(Text, nullable=False))
    is_active: bool = Field(sa_column=Column(Boolean), default=True)
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, default=get_current_utc_datetime
        ),
    )
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=get_current_utc_datetime,
            onupdate=get_current_utc_datetime,
        ),
    )

