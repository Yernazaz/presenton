from typing import Optional
from pydantic import BaseModel


class ImagePrompt(BaseModel):
    prompt: str
    theme_prompt: Optional[str] = None
    language: str = "English"

    def get_image_prompt(self, with_theme: bool = False) -> str:
        if with_theme and self.theme_prompt:
            return f"{self.prompt}, {self.theme_prompt}"
        return self.prompt
