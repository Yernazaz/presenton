from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlmodel import Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime


class TeacherSettingsModel(SQLModel, table=True):
    __tablename__ = "teacher_settings"

    teacher_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("teachers.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
            index=True,
        )
    )
    default_grade: int = Field(sa_column=Column(Integer, nullable=False), default=5)
    default_subject: str = Field(
        sa_column=Column(String, nullable=False), default="math"
    )
    default_prompt_template_id: Optional[uuid.UUID] = Field(default=None)
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=get_current_utc_datetime,
            onupdate=get_current_utc_datetime,
        ),
    )
