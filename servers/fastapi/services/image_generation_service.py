import asyncio
import base64
import json
import os
import aiohttp
from fastapi import HTTPException
from google import genai
from openai import NOT_GIVEN, AsyncOpenAI
from models.image_prompt import ImagePrompt
from models.sql.image_asset import ImageAsset
from utils.get_env import (
    get_dall_e_3_quality_env,
    get_gpt_image_1_5_quality_env,
    get_pexels_api_key_env,
    get_unsplash_api_key_env,
)
from utils.get_env import get_pixabay_api_key_env
from utils.get_env import get_comfyui_url_env
from utils.get_env import get_comfyui_workflow_env
from utils.image_provider import (
    is_gpt_image_1_5_selected,
    is_image_generation_disabled,
    is_pixels_selected,
    is_pixabay_selected,
    is_gemini_flash_selected,
    is_nanobanana_pro_selected,
    is_dalle3_selected,
    is_comfyui_selected,
)
import uuid


# Global lock for OpenAI Agent (serialize requests to prevent breaking the agent)
OPENAI_AGENT_LOCK = asyncio.Lock()

class ImageGenerationService:
    
    def __init__(self, output_directory: str):
        self.output_directory = output_directory
        self.is_image_generation_disabled = is_image_generation_disabled()
        self.image_gen_func = self.get_image_gen_func()
    


    def get_image_gen_func(self):
        if self.is_image_generation_disabled:
            return None

        if is_pixabay_selected():
            return self.get_image_from_pixabay
        elif is_pixels_selected():
            return self.get_image_from_pexels
        elif is_gemini_flash_selected():
            return self.generate_image_gemini_flash
        elif is_nanobanana_pro_selected():
            return self.generate_image_nanobanana_pro
        elif is_dalle3_selected():
            return self.generate_image_openai_dalle3
        elif is_gpt_image_1_5_selected():
            return self.generate_image_openai_gpt_image_1_5
        elif is_comfyui_selected():
            return self.generate_image_comfyui
        return None

    def is_stock_provider_selected(self):
        return is_pixels_selected() or is_pixabay_selected()


    async def search_via_openai_agent(
        self, query: str, agent_url: str, language: str = "English"
    ) -> list[str]:
        """
        Classify query using OpenAI Agent, then search images using Brave Search API.
        Agent returns: action (search/generate) and semantic search_query.
        Uses lock to prevent concurrent requests (agent can't handle parallel calls).
        """
        import aiohttp
        print(f"🔍 Agent Classification: Analyzing '{query}' (language: {language})")
        
        # Serialize requests to prevent breaking the agent
        async with OPENAI_AGENT_LOCK:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{agent_url}/search",
                        json={"query": query, "language": language},
                        timeout=aiohttp.ClientTimeout(total=30)
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            action = data.get("action")
                            search_query = data.get("search_query")
                            search_query_en = data.get("search_query_en")
                            
                            if action == "generate":
                                print(f"🎨 Agent Decision: GENERATE (artistic/abstract content)")
                                return []  # Empty list triggers AI generation
                            
                            elif action == "search":
                                if search_query:
                                    print(f"📚 Agent Decision: SEARCH with query: '{search_query}'")
                                    # Search using Brave with the semantic query
                                    try:
                                        urls = await self._search_brave_images(
                                            search_query, language=language
                                        )
                                        source = "brave"
                                        if not urls:
                                            # Fall back to public sources that may work better with English queries.
                                            fallback_query = (
                                                search_query_en
                                                if isinstance(search_query_en, str) and search_query_en.strip()
                                                else search_query
                                            )
                                            urls = await self._search_wikimedia_images(fallback_query, count=5)
                                            source = "wikimedia"
                                        if not urls:
                                            urls = await self._search_pexels_images(
                                                (search_query_en or search_query), count=5
                                            )
                                            source = "pexels"
                                        if not urls:
                                            urls = await self._search_unsplash_images(
                                                (search_query_en or search_query), count=5
                                            )
                                            source = "unsplash"
                                        if not urls:
                                            urls = await self._search_pixabay_images(
                                                (search_query_en or search_query), count=5
                                            )
                                            source = "pixabay"
                                        if not urls:
                                            urls = await self._search_duckduckgo_images(
                                                (search_query_en or search_query), language=language
                                            )
                                            source = "duckduckgo"
                                        if urls:
                                            print(f"✓ {source} found {len(urls)} images for '{search_query}'")
                                            return urls
                                        else:
                                            print(f"✗ No images found for '{search_query}', falling back to generation")
                                            return []
                                    except Exception as e:
                                        print(f"✗ Brave Search Error: {e}")
                                        return []
                                else:
                                    print(f"⚠️ Agent: search action but no search_query, using generation")
                                    return []
                            else:
                                print(f"⚠️ Agent: Unknown action '{action}', using generation")
                                return []
                        else:
                            text = await response.text()
                            print(f"✗ OpenAI Agent: HTTP {response.status} - {text}")
            except Exception as e:
                print(f"✗ OpenAI Agent Error: {e}")
                
        return []
    
    def _brave_search_language_params(self, language: str) -> dict:
        """
        Brave Search API language options.

        Docs (images): https://api.search.brave.com/app/documentation/web-search/images
        """
        language_normalized = (language or "").strip().lower()
        if (
            "russian" in language_normalized
            or "рус" in language_normalized
            or language_normalized.startswith("ru")
        ):
            return {"country": "RU", "search_lang": "ru", "ui_lang": "ru-RU"}
        if (
            "kazakh" in language_normalized
            or "қаз" in language_normalized
            or "қазақ" in language_normalized
            or language_normalized.startswith("kk")
        ):
            return {"country": "KZ", "search_lang": "kk", "ui_lang": "kk-KZ"}
        return {"country": "US", "search_lang": "en", "ui_lang": "en-US"}

    def _duckduckgo_region(self, language: str) -> str:
        language_normalized = (language or "").strip().lower()
        if (
            "russian" in language_normalized
            or "рус" in language_normalized
            or language_normalized.startswith("ru")
        ):
            return "ru-ru"
        if (
            "kazakh" in language_normalized
            or "қаз" in language_normalized
            or "қазақ" in language_normalized
            or language_normalized.startswith("kk")
        ):
            # DuckDuckGo does not consistently support kk; default to Kazakhstan/Russian locale.
            return "kz-ru"
        return "us-en"

    async def _search_brave_images(self, query: str, language: str = "English") -> list[str]:
        """Search images using Brave Search API."""
        api_key = os.getenv("BRAVE_SEARCH_API_KEY")
        if not api_key:
            print("✗ Missing BRAVE_SEARCH_API_KEY")
            return []

        def _looks_like_image_url(url: str) -> bool:
            try:
                from urllib.parse import urlparse

                path = (urlparse(url).path or "").lower()
                for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".svg"):
                    if path.endswith(ext):
                        return True
                # Common CDN / image hosting paths without extensions.
                if "/wp-content/uploads/" in path or "/images/" in path:
                    return True
            except Exception:
                pass
            return False

        try:
            # Brave Images API supports only: off|strict
            params = {"q": query, "count": "5", "safesearch": "off"}
            params.update(self._brave_search_language_params(language))

            async with aiohttp.ClientSession(trust_env=True) as session:
                async with session.get(
                    "https://api.search.brave.com/res/v1/images/search",
                    params=params,
                    headers={
                        "Accept": "application/json",
                        "X-Subscription-Token": api_key,
                        "User-Agent": "presenton/1.0",
                    },
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        results = data.get("results") or []
                        urls: list[str] = []
                        for r in results:
                            if not isinstance(r, dict):
                                continue
                            # Brave images results commonly use:
                            # - r["url"] as the source page URL
                            # - r["properties"]["url"] as the direct image URL
                            candidates: list[str] = []

                            props = r.get("properties")
                            if isinstance(props, dict):
                                v = props.get("url")
                                if isinstance(v, str):
                                    candidates.append(v)

                            thumb = r.get("thumbnail")
                            if isinstance(thumb, dict):
                                v = thumb.get("src")
                                if isinstance(v, str):
                                    candidates.append(v)

                            for k in ("image", "src", "url"):
                                v = r.get(k)
                                if isinstance(v, str):
                                    candidates.append(v)

                            picked = None
                            for v in candidates:
                                if not (isinstance(v, str) and v.startswith("http")):
                                    continue
                                if _looks_like_image_url(v):
                                    picked = v
                                    break
                            if not picked:
                                for v in candidates:
                                    if isinstance(v, str) and v.startswith("http"):
                                        picked = v
                                        break
                            if picked:
                                urls.append(picked)
                        return urls
                    else:
                        error_text = await response.text()
                        print(f"✗ Brave API error: {response.status} - {error_text}")
                        return []
        except Exception as e:
            print(f"✗ Brave API exception: {e}")
            return []

    async def _search_duckduckgo_images(
        self, query: str, language: str = "English", max_results: int = 5
    ) -> list[str]:
        """
        Fallback image search using DuckDuckGo.
        Returns direct image URLs.
        """
        try:
            from duckduckgo_search import DDGS  # type: ignore
        except Exception as e:
            print(f"✗ DuckDuckGo Search unavailable: {e}")
            return []

        region = self._duckduckgo_region(language)

        def _run() -> list[str]:
            urls: list[str] = []
            with DDGS() as ddgs:
                for r in ddgs.images(
                    keywords=query,
                    region=region,
                    safesearch="moderate",
                    max_results=max_results,
                ):
                    url = r.get("image")
                    if isinstance(url, str) and url.startswith("http"):
                        urls.append(url)
            return urls

        try:
            urls = await asyncio.to_thread(_run)
            if urls:
                print(f"✓ DuckDuckGo found {len(urls)} images for '{query}' (region={region})")
            else:
                print(f"✗ DuckDuckGo: No images found for '{query}' (region={region})")
            return urls
        except Exception as e:
            print(f"✗ DuckDuckGo search error: {e}")
            return []

    async def _search_wikimedia_images(self, query: str, count: int = 5) -> list[str]:
        try:
            from clients import wikimedia_client

            results = await wikimedia_client.search_images(query, per_page=count)
            urls = [img.url for img in results if getattr(img, "url", None)]
            if urls:
                print(f"✓ Wikimedia found {len(urls)} images for '{query}'")
            else:
                print(f"✗ Wikimedia: No images found for '{query}'")
            return urls
        except Exception as e:
            print(f"✗ Wikimedia search error: {e}")
            return []

    async def _search_unsplash_images(self, query: str, count: int = 5) -> list[str]:
        try:
            from clients import unsplash_client

            results = await unsplash_client.search_images(query, per_page=count)
            urls = [img.url for img in results if getattr(img, "url", None)]
            if urls:
                print(f"✓ Unsplash found {len(urls)} images for '{query}'")
            else:
                print(f"✗ Unsplash: No images found for '{query}'")
            return urls
        except Exception as e:
            print(f"✗ Unsplash search error: {e}")
            return []

    async def _search_pexels_images(self, query: str, count: int = 5) -> list[str]:
        api_key = get_pexels_api_key_env()
        if not api_key:
            return []

        try:
            async with aiohttp.ClientSession(trust_env=True) as session:
                async with session.get(
                    "https://api.pexels.com/v1/search",
                    params={"query": query, "per_page": str(count)},
                    headers={"Authorization": api_key},
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        print(f"✗ Pexels API error: {response.status} - {error_text}")
                        return []
                    data = await response.json()
                    photos = data.get("photos", []) or []
                    urls: list[str] = []
                    for photo in photos:
                        if not isinstance(photo, dict):
                            continue
                        src = photo.get("src") or {}
                        if not isinstance(src, dict):
                            continue
                        url = src.get("large") or src.get("original")
                        if isinstance(url, str) and url:
                            urls.append(url)
                    if urls:
                        print(f"✓ Pexels found {len(urls)} images for '{query}'")
                    else:
                        print(f"✗ Pexels: No images found for '{query}'")
                    return urls
        except Exception as e:
            print(f"✗ Pexels search error: {e}")
            return []

    async def _search_pixabay_images(self, query: str, count: int = 5) -> list[str]:
        api_key = get_pixabay_api_key_env()
        if not api_key:
            return []

        try:
            async with aiohttp.ClientSession(trust_env=True) as session:
                async with session.get(
                    "https://pixabay.com/api/",
                    params={
                        "key": api_key,
                        "q": query,
                        "image_type": "photo",
                        "per_page": str(count),
                    },
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        print(f"✗ Pixabay API error: {response.status} - {error_text}")
                        return []
                    data = await response.json()
                    hits = data.get("hits", []) or []
                    urls: list[str] = []
                    for hit in hits:
                        if not isinstance(hit, dict):
                            continue
                        url = hit.get("largeImageURL")
                        if isinstance(url, str) and url:
                            urls.append(url)
                    if urls:
                        print(f"✓ Pixabay found {len(urls)} images for '{query}'")
                    else:
                        print(f"✗ Pixabay: No images found for '{query}'")
                    return urls
        except Exception as e:
            print(f"✗ Pixabay search error: {e}")
            return []

    async def search_multiple_sources(self, query: str, language: str = "English") -> list[str]:
        """
        Search images using OpenAI Agent.
        Agent classifies (search/generate) and provides semantic query, 
        then searches Google Images API.
        """
        import os
        agent_url = os.getenv("OPENAI_AGENT_URL")
        if agent_url:
            results = await self.search_via_openai_agent(query, agent_url, language)
            return results
        
        # No agent configured - return empty (fallback to generation)
        return []

    async def generate_image(self, prompt: ImagePrompt) -> str | ImageAsset:
        """
        Generates an image based on the provided prompt.
        Uses OpenAI agent for classification (search vs generate).
        """
        if self.is_image_generation_disabled:
            print("Image generation is disabled. Using placeholder image.")
            return "/static/images/placeholder.jpg"
            
        # Get search prompt if needed
        is_stock = self.is_stock_provider_selected()
        image_prompt = prompt.get_image_prompt(with_theme=not is_stock)
        
        # Try to search using OpenAI agent
        results = await self.search_multiple_sources(image_prompt, prompt.language)
        
        if results:
            # Return first image with candidates in extras
            return ImageAsset(
                path=results[0],
                is_uploaded=False,
                extras={
                    "prompt": prompt.prompt,
                    "candidates": results,
                    "source": "search"
                }
            )

        # Fallback to generation
        if not self.image_gen_func:
            print("No image generation function found. Using placeholder image.")
            return "/static/images/placeholder.jpg"

        print(f"Generating image for: {image_prompt[:80]}...")

        try:
            if self.is_stock_provider_selected():
                image_path = await self.image_gen_func(image_prompt)
            else:
                image_path = await self.image_gen_func(
                    image_prompt, self.output_directory
                )
            if image_path:
                if image_path.startswith("http"):
                    return image_path
                elif os.path.exists(image_path):
                    return ImageAsset(
                        path=image_path,
                        is_uploaded=False,
                        extras={
                            "prompt": prompt.prompt,
                            "theme_prompt": prompt.theme_prompt,
                        },
                    )
            raise Exception(f"Image not found at {image_path}")

        except Exception as e:
            print(f"Error generating image: {e}")
            return "/static/images/placeholder.jpg"

    async def generate_image_openai(
        self, prompt: str, output_directory: str, model: str, quality: str
    ) -> str:
        client = AsyncOpenAI()
        result = await client.images.generate(
            model=model,
            prompt=prompt,
            n=1,
            quality=quality,
            response_format="b64_json" if model == "dall-e-3" else NOT_GIVEN,
            size="1024x1024",
        )
        image_path = os.path.join(output_directory, f"{uuid.uuid4()}.png")
        with open(image_path, "wb") as f:
            f.write(base64.b64decode(result.data[0].b64_json))
        return image_path

    async def generate_image_openai_dalle3(
        self, prompt: str, output_directory: str
    ) -> str:
        return await self.generate_image_openai(
            prompt,
            output_directory,
            "dall-e-3",
            get_dall_e_3_quality_env() or "standard",
        )

    async def generate_image_openai_gpt_image_1_5(
        self, prompt: str, output_directory: str
    ) -> str:
        return await self.generate_image_openai(
            prompt,
            output_directory,
            "gpt-image-1.5",
            get_gpt_image_1_5_quality_env() or "medium",
        )

    async def _generate_image_google(
        self, prompt: str, output_directory: str, model: str
    ) -> str:
        """Base method for Google image generation models."""
        client = genai.Client()
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=model,
            contents=[prompt],
        )

        image_path = None
        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                image = part.as_image()
                image_path = os.path.join(output_directory, f"{uuid.uuid4()}.jpg")
                image.save(image_path)

        if not image_path:
            raise HTTPException(
                status_code=500, detail=f"No image generated by google {model}"
            )

        return image_path

    async def generate_image_gemini_flash(
        self, prompt: str, output_directory: str
    ) -> str:
        """Generate image using Gemini Flash (gemini-2.5-flash-image-preview)."""
        return await self._generate_image_google(
            prompt, output_directory, "gemini-2.5-flash-image-preview"
        )

    async def generate_image_nanobanana_pro(
        self, prompt: str, output_directory: str
    ) -> str:
        """Generate image using NanoBanana Pro (gemini-3-pro-image-preview)."""
        return await self._generate_image_google(
            prompt, output_directory, "gemini-3-pro-image-preview"
        )

    async def get_image_from_pexels(self, prompt: str) -> str:
        async with aiohttp.ClientSession(trust_env=True) as session:
            response = await session.get(
                "https://api.pexels.com/v1/search",
                params={"query": prompt, "per_page": 1},
                headers={"Authorization": f"{get_pexels_api_key_env()}"},
            )
            data = await response.json()
            image_url = data["photos"][0]["src"]["large"]
            return image_url

    async def get_image_from_pixabay(self, prompt: str) -> str:
        async with aiohttp.ClientSession(trust_env=True) as session:
            response = await session.get(
                "https://pixabay.com/api/",
                params={
                    "key": get_pixabay_api_key_env(),
                    "q": prompt,
                    "image_type": "photo",
                    "per_page": 3,
                },
            )
            data = await response.json()
            image_url = data["hits"][0]["largeImageURL"]
            return image_url

    async def generate_image_comfyui(self, prompt: str, output_directory: str) -> str:
        """
        Generate image using ComfyUI workflow API.

        User provides:
        - COMFYUI_URL: ComfyUI server URL (e.g., http://192.168.1.7:8188)
        - COMFYUI_WORKFLOW: Workflow JSON exported from ComfyUI

        The workflow should have a CLIPTextEncode node with "Positive" in the title
        where the prompt will be injected.

        Args:
            prompt: The text prompt for image generation
            output_directory: Directory to save the generated image

        Returns:
            Path to the generated image file
        """
        comfyui_url = get_comfyui_url_env()
        workflow_json = get_comfyui_workflow_env()

        if not comfyui_url:
            raise ValueError("COMFYUI_URL environment variable is not set")

        if not workflow_json:
            raise ValueError(
                "COMFYUI_WORKFLOW environment variable is not set. Please provide a ComfyUI workflow JSON."
            )

        # Ensure URL doesn't have trailing slash
        comfyui_url = comfyui_url.rstrip("/")

        # Parse the workflow JSON
        try:
            workflow = json.loads(workflow_json)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid workflow JSON: {str(e)}")

        # Find and update the positive prompt node
        workflow = self._inject_prompt_into_workflow(workflow, prompt)

        async with aiohttp.ClientSession(trust_env=True) as session:
            # Step 1: Submit workflow
            prompt_id = await self._submit_comfyui_workflow(
                session, comfyui_url, workflow
            )

            # Step 2: Wait for completion
            status_data = await self._wait_for_comfyui_completion(
                session, comfyui_url, prompt_id
            )

            # Step 3: Download the generated image
            image_path = await self._download_comfyui_image(
                session, comfyui_url, status_data, prompt_id, output_directory
            )

            return image_path

    def _inject_prompt_into_workflow(self, workflow: dict, prompt: str) -> dict:
        """
        Find the prompt node in the workflow and inject the prompt text.
        Looks for a node with title 'Input Prompt' (case-insensitive).

        User must rename their prompt node to 'Input Prompt' in ComfyUI.
        """
        for node_id, node_data in workflow.items():
            meta = node_data.get("_meta", {})
            title = meta.get("title", "").lower()

            if title == "input prompt":
                if "inputs" in node_data and "text" in node_data["inputs"]:
                    node_data["inputs"]["text"] = prompt
                    print(
                        f"Injected prompt into node {node_id}: {meta.get('title', '')}"
                    )
                    return workflow

        raise ValueError(
            "Could not find a node with title 'Input Prompt' in the workflow. Please rename your prompt node to 'Input Prompt' in ComfyUI."
        )

    async def _submit_comfyui_workflow(
        self, session: aiohttp.ClientSession, comfyui_url: str, workflow: dict
    ) -> str:
        """Submit workflow to ComfyUI and return the prompt_id."""
        client_id = str(uuid.uuid4())
        payload = {"prompt": workflow, "client_id": client_id}

        response = await session.post(
            f"{comfyui_url}/prompt",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=30),
        )

        if response.status != 200:
            error_text = await response.text()
            raise Exception(f"Failed to submit workflow to ComfyUI: {error_text}")

        data = await response.json()
        prompt_id = data.get("prompt_id")

        if not prompt_id:
            raise Exception("No prompt_id returned from ComfyUI")

        print(f"ComfyUI workflow submitted. Prompt ID: {prompt_id}")
        return prompt_id

    async def _wait_for_comfyui_completion(
        self,
        session: aiohttp.ClientSession,
        comfyui_url: str,
        prompt_id: str,
        timeout: int = 300,
        poll_interval: int = 4,
    ) -> dict:
        """Poll ComfyUI history endpoint until workflow completes."""
        start_time = asyncio.get_event_loop().time()

        while True:
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > timeout:
                raise Exception(f"ComfyUI workflow timed out after {timeout} seconds")

            await asyncio.sleep(poll_interval)

            response = await session.get(
                f"{comfyui_url}/history/{prompt_id}",
                timeout=aiohttp.ClientTimeout(total=30),
            )

            if response.status != 200:
                continue

            try:
                status_data = await response.json()
            except Exception as _:
                continue

            if prompt_id in status_data:
                execution_data = status_data[prompt_id]

                # Check for completion
                if "status" in execution_data:
                    status = execution_data["status"]
                    if status.get("completed", False):
                        print("ComfyUI workflow completed successfully")
                        return status_data
                    if "error" in status:
                        raise Exception(f"ComfyUI workflow error: {status['error']}")

                # Also check if outputs exist (alternative completion check)
                if "outputs" in execution_data and execution_data["outputs"]:
                    print("ComfyUI workflow completed (outputs found)")
                    return status_data

            print(f"Waiting for ComfyUI workflow... ({int(elapsed)}s)")

    async def _download_comfyui_image(
        self,
        session: aiohttp.ClientSession,
        comfyui_url: str,
        status_data: dict,
        prompt_id: str,
        output_directory: str,
    ) -> str:
        """Download the generated image from ComfyUI."""
        if prompt_id not in status_data:
            raise Exception("Prompt ID not found in status data")

        outputs = status_data[prompt_id].get("outputs", {})

        if not outputs:
            raise Exception("No outputs found in ComfyUI response")

        # Find the first image in outputs
        for node_id, node_output in outputs.items():
            if "images" in node_output:
                for image_info in node_output["images"]:
                    filename = image_info["filename"]
                    subfolder = image_info.get("subfolder", "")

                    # Build view params
                    params = {"filename": filename, "type": "output"}
                    if subfolder:
                        params["subfolder"] = subfolder

                    # Download the image
                    response = await session.get(
                        f"{comfyui_url}/view",
                        params=params,
                        timeout=aiohttp.ClientTimeout(total=60),
                    )

                    if response.status == 200:
                        image_data = await response.read()

                        # Determine extension
                        ext = filename.split(".")[-1] if "." in filename else "png"
                        image_path = os.path.join(
                            output_directory, f"{uuid.uuid4()}.{ext}"
                        )

                        with open(image_path, "wb") as f:
                            f.write(image_data)

                        print(f"Downloaded image from ComfyUI: {image_path}")
                        return image_path
                    else:
                        raise Exception(f"Failed to download image: {response.status}")

        raise Exception("No images found in ComfyUI outputs")
