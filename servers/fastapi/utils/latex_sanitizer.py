from __future__ import annotations

from typing import Any


_CONTROL_CHAR_REPLACEMENTS = {
    # JSON escape sequences that often appear in LaTeX commands when the model forgets to escape backslashes:
    # "\text" -> "\t" + "ext" (tab), "\rightarrow" -> "\r" + "ightarrow" (carriage return), etc.
    "\t": "\\t",
    "\r": "\\r",
    "\b": "\\b",
    "\f": "\\f",
}


def sanitize_latex_escapes(value: Any) -> Any:
    """
    Best-effort repair for LaTeX backslashes lost to JSON escapes in LLM structured output.

    If a model outputs JSON strings containing LaTeX commands with single backslashes, sequences like
    `\text` or `\rightarrow` are valid JSON escapes (`\t`, `\r`) and become control characters after parsing.
    This function traverses nested dict/list structures and replaces those control characters with their
    literal backslash escapes (e.g. TAB -> "\\t") so the UI can render KaTeX correctly.
    """
    if isinstance(value, str):
        out = value
        for control_char, replacement in _CONTROL_CHAR_REPLACEMENTS.items():
            if control_char in out:
                out = out.replace(control_char, replacement)
        return out

    if isinstance(value, list):
        return [sanitize_latex_escapes(item) for item in value]

    if isinstance(value, dict):
        return {key: sanitize_latex_escapes(item) for key, item in value.items()}

    return value

