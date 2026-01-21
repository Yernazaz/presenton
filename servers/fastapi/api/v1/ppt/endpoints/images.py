from typing import List
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.image_prompt import ImagePrompt
from models.sql.image_asset import ImageAsset
from services.database import get_async_session
from services.image_generation_service import ImageGenerationService
from utils.asset_directory_utils import get_images_directory
import os
import uuid
from utils.file_utils import get_file_name_with_random_uuid

IMAGES_ROUTER = APIRouter(prefix="/images", tags=["Images"])


@IMAGES_ROUTER.get("/generate")
async def generate_image(
    prompt: str,
    language: str = "English",
    sql_session: AsyncSession = Depends(get_async_session),
):
    images_directory = get_images_directory()
    image_prompt = ImagePrompt(prompt=prompt, language=language)
    image_generation_service = ImageGenerationService(images_directory)

    image = await image_generation_service.generate_image(image_prompt)
    if not isinstance(image, ImageAsset):
        return image

    sql_session.add(image)
    await sql_session.commit()

    return image.path


@IMAGES_ROUTER.get("/generated", response_model=List[ImageAsset])
async def get_generated_images(sql_session: AsyncSession = Depends(get_async_session)):
    try:
        images = await sql_session.scalars(
            select(ImageAsset)
            .where(ImageAsset.is_uploaded == False)
            .order_by(ImageAsset.created_at.desc())
        )
        return images
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve generated images: {str(e)}"
        )


@IMAGES_ROUTER.post("/upload")
async def upload_image(
    file: UploadFile = File(...), sql_session: AsyncSession = Depends(get_async_session)
):
    try:
        new_filename = get_file_name_with_random_uuid(file)
        image_path = os.path.join(
            get_images_directory(), os.path.basename(new_filename)
        )

        with open(image_path, "wb") as f:
            f.write(await file.read())

        image_asset = ImageAsset(path=image_path, is_uploaded=True)

        sql_session.add(image_asset)
        await sql_session.commit()

        return image_asset
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")


@IMAGES_ROUTER.get("/uploaded", response_model=List[ImageAsset])
async def get_uploaded_images(sql_session: AsyncSession = Depends(get_async_session)):
    try:
        images = await sql_session.scalars(
            select(ImageAsset)
            .where(ImageAsset.is_uploaded == True)
            .order_by(ImageAsset.created_at.desc())
        )
        return images
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve uploaded images: {str(e)}"
        )


@IMAGES_ROUTER.delete("/{id}", status_code=204)
async def delete_uploaded_image_by_id(
    id: uuid.UUID, sql_session: AsyncSession = Depends(get_async_session)
):
    try:
        # Fetch the asset to get its actual file path
        image = await sql_session.get(ImageAsset, id)
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")

        os.remove(image.path)

        await sql_session.delete(image)
        await sql_session.commit()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete image: {str(e)}")


# ============ Adaptive Image Endpoints ============

from pydantic import BaseModel
from services.adaptive_image_service import AdaptiveImageService, AdaptiveImageResponse


class AdaptiveImageRequest(BaseModel):
    """Request model for adaptive image endpoint."""
    prompt: str
    language: str = "English"


@IMAGES_ROUTER.post("/adaptive", response_model=AdaptiveImageResponse)
async def get_adaptive_image(request: AdaptiveImageRequest):
    """
    Intelligently decide whether to generate or search for an image based on the prompt.
    
    - For abstract/artistic concepts: Uses AI generation
    - For real objects/people/places: Searches multiple sources (Unsplash, Wikimedia, Pexels, Pixabay)
    
    Returns 5+ alternatives when searching, or 1 generated image.
    """
    images_directory = get_images_directory()
    adaptive_service = AdaptiveImageService(images_directory)
    
    try:
        result = await adaptive_service.get_adaptive_image(
            prompt=request.prompt, language=request.language
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to get adaptive image: {str(e)}"
        )


@IMAGES_ROUTER.get("/search-multiple")
async def search_multiple_sources(query: str, per_source: int = 2):
    """
    Search multiple image sources for a query.
    Returns images from Unsplash, Wikimedia, Pexels, and Pixabay.
    
    Args:
        query: Search query
        per_source: Number of images per source (default 2)
    """
    images_directory = get_images_directory()
    adaptive_service = AdaptiveImageService(images_directory)
    
    try:
        images = await adaptive_service.search_multiple_sources(query, per_source)
        return {"images": images}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to search images: {str(e)}"
        )


@IMAGES_ROUTER.get("/details", response_model=ImageAsset)
async def get_image_details(url: str, sql_session: AsyncSession = Depends(get_async_session)):
    """
    Get image details (including alternative candidates) by URL.
    """
    try:
        # Extract filename from URL (handle cases like /static/images/foo.jpg)
        filename = url.split("/")[-1]
        
        # Search for asset ending with this filename
        # We use like because exact path might differ (absolute vs relative)
        statement = select(ImageAsset).where(ImageAsset.path.like(f"%{filename}"))
        result = await sql_session.scalars(statement)
        image = result.first()
        
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
            
        return image
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to retrieve details: {str(e)}")
