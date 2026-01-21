from typing import Optional


SCHOOL_CONTEXT_MARKER = "## School Context"


def build_school_instructions(
    subject: Optional[str],
    user_instructions: Optional[str],
) -> Optional[str]:
    subject_value = (subject or "").strip()
    if not subject_value:
        return user_instructions

    existing = user_instructions or ""
    if SCHOOL_CONTEXT_MARKER in existing:
        return user_instructions

    school_context = f"""{SCHOOL_CONTEXT_MARKER}
- Audience: school students
- Subject: {subject_value}
- Keep explanations age-appropriate and curriculum-aligned.
- Define new terms briefly; include simple examples and short practice-style questions when helpful.
- Prefer clear structure: definitions → examples → key takeaways.
"""

    existing_stripped = existing.strip()
    if not existing_stripped:
        return school_context

    return f"{school_context}\n{existing_stripped}"

