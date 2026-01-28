SUPPORTED_SCHOOL_SUBJECTS = ["math", "physics", "biology", "literature"]


def default_class_subject_template(grade: int, subject: str) -> str:
    # Minimal starter templates (RU) that the teacher can edit later.
    # These are appended to generation instructions.
    base = (
        "Ты — помощник учителя. Генерируй материал строго под школьный уровень.\n"
        f"Класс: {grade}\n"
        f"Предмет: {subject}\n"
        "Требования:\n"
        "- Пиши понятно и структурировано.\n"
        "- Добавляй примеры и краткие определения.\n"
        "- Без лишней воды.\n"
    )

    if subject == "math":
        return (
            base
            + "Для математики:\n"
            "- Если есть формулы — показывай вывод/обоснование кратко.\n"
            "- В конце добавь 2–3 задания для самопроверки.\n"
        )
    if subject == "physics":
        return (
            base
            + "Для физики:\n"
            "- Обязательно обозначай величины и единицы измерения.\n"
            "- Добавь 1 пример задачи с решением.\n"
        )
    if subject == "biology":
        return (
            base
            + "Для биологии:\n"
            "- Делай акцент на терминах и причинно‑следственных связях.\n"
            "- Добавь 3–5 ключевых терминов в конце.\n"
        )
    if subject == "literature":
        return (
            base
            + "Для литературы:\n"
            "- Добавляй контекст (эпоха/автор), основные темы и тезисы.\n"
            "- Можно привести 1–2 короткие цитаты (без больших фрагментов).\n"
        )

    return base

