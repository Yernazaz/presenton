from datetime import datetime
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlmodel import Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime


class TeacherClassSubjectTemplateModel(SQLModel, table=True):
    __tablename__ = "teacher_class_subject_templates"
    __table_args__ = (
        UniqueConstraint("teacher_id", "grade", "subject", name="uq_teacher_grade_subject"),
    )

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    teacher_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("teachers.id", ondelete="CASCADE"), index=True, nullable=False
        )
    )
    grade: int = Field(index=True)
    subject: str = Field(sa_column=Column(String, index=True, nullable=False))
    template: str = Field(sa_column=Column(Text, nullable=False))
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=get_current_utc_datetime,
            onupdate=get_current_utc_datetime,
        ),
    )

