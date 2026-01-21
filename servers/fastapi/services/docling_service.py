try:
    from docling.document_converter import (
        DocumentConverter,
        PdfFormatOption,
        PowerpointFormatOption,
        WordFormatOption,
    )
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.datamodel.base_models import InputFormat
    DOCLING_AVAILABLE = True
except ImportError:
    DOCLING_AVAILABLE = False
    # Define placeholder classes to avoid NameErrors in type hints or unused imports if needed
    # But for now we just use DOCLING_AVAILABLE check.


class DoclingService:
    def __init__(self):
        if not DOCLING_AVAILABLE:
            print("WARNING: Docling not installed. Document parsing will fail if attempted.")
            self.converter = None
            return

        self.pipeline_options = PdfPipelineOptions()
        self.pipeline_options.do_ocr = False

        self.converter = DocumentConverter(
            allowed_formats=[InputFormat.PPTX, InputFormat.PDF, InputFormat.DOCX],
            format_options={
                InputFormat.DOCX: WordFormatOption(
                    pipeline_options=self.pipeline_options,
                ),
                InputFormat.PPTX: PowerpointFormatOption(
                    pipeline_options=self.pipeline_options,
                ),
                InputFormat.PDF: PdfFormatOption(
                    pipeline_options=self.pipeline_options,
                ),
            },
        )

    def parse_to_markdown(self, file_path: str) -> str:
        if not DOCLING_AVAILABLE or not self.converter:
            raise ImportError("Docling is not installed. Cannot parse documents. To use this feature, run with full Docker image.")

        result = self.converter.convert(file_path)
        return result.document.export_to_markdown()
