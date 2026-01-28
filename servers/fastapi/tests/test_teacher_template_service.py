import asyncio
import uuid
from unittest.mock import AsyncMock

from models.sql.teacher import TeacherModel
from models.sql.teacher_prompt_template import TeacherPromptTemplateModel
from models.sql.teacher_settings import TeacherSettingsModel
from services.teacher_template_service import resolve_teacher_instructions


def test_disable_prompt_template_overrides_default_prompt_template():
    teacher_id = uuid.uuid4()
    template_id = uuid.uuid4()

    teacher = TeacherModel(
        id=teacher_id,
        email="teacher@example.com",
        full_name="Teacher",
        password_hash="hash",
    )
    settings = TeacherSettingsModel(
        teacher_id=teacher_id,
        default_prompt_template_id=template_id,
    )
    tmpl = TeacherPromptTemplateModel(
        id=template_id,
        teacher_id=teacher_id,
        name="Default",
        template="MY_TEMPLATE",
        is_active=True,
    )

    sql_session = AsyncMock()

    async def get_side_effect(model, key):
        if model is TeacherSettingsModel and key == teacher_id:
            return settings
        if model is TeacherPromptTemplateModel and key == template_id:
            return tmpl
        return None

    sql_session.get.side_effect = get_side_effect
    sql_session.scalar.return_value = None

    effective, grade, subject, resolved_id, prompt_text, class_text = asyncio.run(
        resolve_teacher_instructions(
            "BASE",
            grade=None,
            subject=None,
            prompt_template_id=None,
            disable_prompt_template=False,
            sql_session=sql_session,
            teacher=teacher,
        )
    )
    assert effective == "BASE\n\nMY_TEMPLATE"
    assert grade == settings.default_grade
    assert subject == settings.default_subject
    assert resolved_id == template_id
    assert prompt_text == "MY_TEMPLATE"
    assert class_text is None

    effective2, _, _, resolved_id2, prompt_text2, _ = asyncio.run(
        resolve_teacher_instructions(
            "BASE",
            grade=None,
            subject=None,
            prompt_template_id=None,
            disable_prompt_template=True,
            sql_session=sql_session,
            teacher=teacher,
        )
    )
    assert effective2 == "BASE"
    assert resolved_id2 is None
    assert prompt_text2 is None

