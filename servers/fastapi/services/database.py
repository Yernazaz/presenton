from collections.abc import AsyncGenerator
import os
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlmodel import SQLModel

from models.sql.async_presentation_generation_status import (
    AsyncPresentationGenerationTaskModel,
)
from models.sql.auth_token import AuthTokenModel
from models.sql.image_asset import ImageAsset
from models.sql.key_value import KeyValueSqlModel
from models.sql.ollama_pull_status import OllamaPullStatus
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from models.sql.presentation_layout_code import PresentationLayoutCodeModel
from models.sql.teacher import TeacherModel
from models.sql.teacher_class_subject_template import TeacherClassSubjectTemplateModel
from models.sql.teacher_prompt_template import TeacherPromptTemplateModel
from models.sql.teacher_settings import TeacherSettingsModel
from models.sql.template import TemplateModel
from models.sql.webhook_subscription import WebhookSubscription
from utils.db_utils import get_database_url_and_connect_args


database_url, connect_args = get_database_url_and_connect_args()

sql_engine: AsyncEngine = create_async_engine(database_url, connect_args=connect_args)
async_session_maker = async_sessionmaker(sql_engine, expire_on_commit=False)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


# Container DB (Lives inside the container)
container_db_url = "sqlite+aiosqlite:////app/container.db"
container_db_engine: AsyncEngine = create_async_engine(
    container_db_url, connect_args={"check_same_thread": False}
)
container_db_async_session_maker = async_sessionmaker(
    container_db_engine, expire_on_commit=False
)


async def get_container_db_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with container_db_async_session_maker() as session:
        yield session


# Create Database and Tables
async def create_db_and_tables():
    async with sql_engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: SQLModel.metadata.create_all(
                sync_conn,
                tables=[
                    TeacherModel.__table__,
                    AuthTokenModel.__table__,
                    TeacherPromptTemplateModel.__table__,
                    TeacherClassSubjectTemplateModel.__table__,
                    TeacherSettingsModel.__table__,
                    PresentationModel.__table__,
                    SlideModel.__table__,
                    KeyValueSqlModel.__table__,
                    ImageAsset.__table__,
                    PresentationLayoutCodeModel.__table__,
                    TemplateModel.__table__,
                    WebhookSubscription.__table__,
                    AsyncPresentationGenerationTaskModel.__table__,
                ],
            )
        )

        # Minimal auto-migrations for existing DBs (no Alembic here).
        # Ensures newly added nullable columns exist.
        dialect = conn.dialect.name

        async def _get_existing_columns_sqlite(table: str) -> set[str]:
            result = await conn.exec_driver_sql(f"PRAGMA table_info({table})")
            rows = result.fetchall()
            return {row[1] for row in rows}  # row[1] is column name

        async def _ensure_column_sqlite(table: str, column: str, ddl_type: str):
            cols = await _get_existing_columns_sqlite(table)
            if column in cols:
                return
            await conn.exec_driver_sql(
                f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"
            )

        async def _ensure_column_information_schema(
            table: str, column: str, ddl_type: str
        ):
            q = (
                "SELECT 1 FROM information_schema.columns "
                f"WHERE table_name = '{table}' AND column_name = '{column}'"
            )
            result = await conn.exec_driver_sql(q)
            if result.first():
                return
            await conn.exec_driver_sql(
                f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"
            )

        if dialect == "sqlite":
            # SQLModel default table names for models without __tablename__ are lowercase class names.
            await _ensure_column_sqlite("presentations", "teacher_id", "TEXT")
            for candidate in ("imageasset", "image_asset", "image_assets"):
                try:
                    await _ensure_column_sqlite(candidate, "teacher_id", "TEXT")
                    break
                except Exception:
                    continue
        elif dialect in {"postgresql", "mysql"}:
            await _ensure_column_information_schema("presentations", "teacher_id", "UUID")
            # Try a few common table names to be safe.
            for candidate in ("imageasset", "image_asset", "image_assets"):
                try:
                    await _ensure_column_information_schema(candidate, "teacher_id", "UUID")
                    break
                except Exception:
                    continue

    async with container_db_engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: SQLModel.metadata.create_all(
                sync_conn,
                tables=[OllamaPullStatus.__table__],
            )
        )
