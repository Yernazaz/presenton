"""
Wikimedia Commons API client for searching free images.
API docs: https://www.mediawiki.org/wiki/API:Main_page
No API key required.
"""
import aiohttp
from typing import List, Optional
from pydantic import BaseModel
import urllib.parse


class WikimediaImage(BaseModel):
    """Represents an image result from Wikimedia Commons."""
    id: str
    url: str
    thumbnail_url: str
    title: str
    description: Optional[str] = None
    source: str = "wikimedia"
    attribution: str


async def search_images(query: str, per_page: int = 5) -> List[WikimediaImage]:
    """
    Search for images on Wikimedia Commons.
    
    Args:
        query: Search query string
        per_page: Number of results to return
    
    Returns:
        List of WikimediaImage objects
    """
    # Use the MediaWiki API to search Commons
    base_url = "https://commons.wikimedia.org/w/api.php"
    
    # First, search for files
    search_params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": f"filetype:bitmap {query}",
        "gsrnamespace": "6",  # File namespace
        "gsrlimit": str(per_page),
        "prop": "imageinfo",
        "iiprop": "url|extmetadata|size",
        "iiurlwidth": "800",  # Get a resized version
    }
    
    try:
        headers = {
            "User-Agent": "Presenton/1.0 (https://github.com/Start-Presenton/presenton; contact@presenton.io)"
        }
        async with aiohttp.ClientSession(trust_env=True) as session:
            async with session.get(base_url, params=search_params, headers=headers) as response:
                if response.status != 200:
                    print(f"Wikimedia API error: {response.status}")
                    return []
                
                data = await response.json()
                pages = data.get("query", {}).get("pages", {})
                
                results = []
                for page_id, page_data in pages.items():
                    if page_id == "-1":
                        continue
                    
                    imageinfo = page_data.get("imageinfo", [{}])[0]
                    if not imageinfo:
                        continue
                    
                    # Get image URLs
                    full_url = imageinfo.get("url", "")
                    thumb_url = imageinfo.get("thumburl", full_url)
                    
                    # Get metadata for attribution
                    extmeta = imageinfo.get("extmetadata", {})
                    artist = extmeta.get("Artist", {}).get("value", "Unknown")
                    # Clean HTML from artist name
                    import re
                    artist = re.sub(r'<[^>]+>', '', artist).strip()
                    
                    description = extmeta.get("ImageDescription", {}).get("value", "")
                    description = re.sub(r'<[^>]+>', '', description).strip()[:200] if description else None
                    
                    title = page_data.get("title", "").replace("File:", "")
                    
                    image = WikimediaImage(
                        id=str(page_id),
                        url=thumb_url if thumb_url else full_url,  # Use thumb for faster loading
                        thumbnail_url=thumb_url if thumb_url else full_url,
                        title=title,
                        description=description,
                        attribution=f"Image by {artist} via Wikimedia Commons (CC)"
                    )
                    results.append(image)
                
                return results
                
    except Exception as e:
        print(f"Error searching Wikimedia: {e}")
        return []
