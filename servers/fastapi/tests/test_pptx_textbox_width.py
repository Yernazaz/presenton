import asyncio
import tempfile

from models.pptx_models import (
    PptxParagraphModel,
    PptxPositionModel,
    PptxPresentationModel,
    PptxSlideModel,
    PptxTextBoxModel,
)
from services.pptx_presentation_creator import PptxPresentationCreator


def test_pptx_textbox_width_does_not_crash():
    pptx_model = PptxPresentationModel(
        slides=[
            PptxSlideModel(
                shapes=[
                    PptxTextBoxModel(
                        position=PptxPositionModel(left=20, top=20, width=200, height=60),
                        paragraphs=[PptxParagraphModel(text="Hello")],
                    )
                ]
            )
        ]
    )

    temp_dir = tempfile.mkdtemp(prefix="presenton-test-")
    pptx_creator = PptxPresentationCreator(pptx_model, temp_dir)
    asyncio.run(pptx_creator.create_ppt())

