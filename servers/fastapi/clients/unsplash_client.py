"""
Unsplash API client for searching images.
API docs: https://unsplash.com/documentation
"""
import aiohttp
from typing import List, Optional
from pydantic import BaseModel
import os


class UnsplashImage(BaseModel):
    """Represents an image result from Unsplash."""
    id: str
    url: str
    thumbnail_url: str
    description: Optional[str] = None
    photographer: str
    photographer_url: str
    source: str = "unsplash"
    attribution: str


def get_unsplash_api_key() -> Optional[str]:
    """Get Unsplash API key from environment."""
    return os.getenv("UNSPLASH_API_KEY")


async def search_images(query: str, per_page: int = 5) -> List[UnsplashImage]:
    """
    Search for images on Unsplash.
    
    Args:
        query: Search query string
        per_page: Number of results to return (max 30)
    
    Returns:
        List of UnsplashImage objects
    """
    api_key = get_unsplash_api_key()
    if not api_key:
        print("Unsplash API key not configured, skipping Unsplash search")
        return []
    
    url = "https://api.unsplash.com/search/photos"
    headers = {
        "Authorization": f"Client-ID {api_key}",
        "Accept-Version": "v1"
    }
    params = {
        "query": query,
        "per_page": min(per_page, 30),
        "orientation": "landscape"
    }
    
    try:
        async with aiohttp.ClientSession(trust_env=True) as session:
            async with session.get(url, headers=headers, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print(f"Unsplash API error: {response.status} - {error_text}")
                    return []
                
                data = await response.json()
                results = []
                
                for photo in data.get("results", []):
                    user = photo.get("user", {})
                    image = UnsplashImage(
                        id=photo["id"],
                        url=photo["urls"]["regular"],
                        thumbnail_url=photo["urls"]["thumb"],
                        description=photo.get("description") or photo.get("alt_description"),
                        photographer=user.get("name", "Unknown"),
                        photographer_url=user.get("links", {}).get("html", ""),
                        attribution=f"Photo by {user.get('name', 'Unknown')} on Unsplash"
                    )
                    results.append(image)
                
                return results
                
    except Exception as e:
        print(f"Error searching Unsplash: {e}")
        return []
