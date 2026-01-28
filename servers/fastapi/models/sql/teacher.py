from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import Column, DateTime, String
from sqlmodel import Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime


class TeacherModel(SQLModel, table=True):
    __tablename__ = "teachers"

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    email: str = Field(
        sa_column=Column(String, unique=True, index=True, nullable=False)
    )
    full_name: str = Field(sa_column=Column(String, nullable=False))
    phone: Optional[str] = Field(sa_column=Column(String), default=None)
    school: Optional[str] = Field(sa_column=Column(String), default=None)
    position: Optional[str] = Field(sa_column=Column(String), default=None)

    password_hash: str = Field(sa_column=Column(String, nullable=False))

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

