"""
Adaptive Image Service - Intelligently decides whether to generate or search for images.
Uses LLM to classify prompts and aggregates results from multiple sources.
"""
import asyncio
from typing import List, Literal, Optional
from pydantic import BaseModel
import aiohttp

from clients import unsplash_client, wikimedia_client
from services.image_generation_service import ImageGenerationService
from utils.get_env import get_pexels_api_key_env, get_pixabay_api_key_env
from services.llm_client import LLMClient
from utils.llm_provider import get_model
from models.llm_message import LLMSystemMessage, LLMUserMessage


class ImageAlternative(BaseModel):
    """Represents a single image alternative."""
    url: str
    thumbnail_url: Optional[str] = None
    source: str  # "unsplash", "wikimedia", "pexels", "pixabay", "ai"
    attribution: Optional[str] = None
    description: Optional[str] = None


class AdaptiveImageResponse(BaseModel):
    """Response from the adaptive image service."""
    decision: Literal["generate", "search"]
    reason: str
    images: List[ImageAlternative]


class AdaptiveImageService:
    """
    Adaptive image selection service that decides whether to generate
    or search for images based on the prompt content.
    """
    
    def __init__(self, output_directory: str):
        self.output_directory = output_directory
        self.image_gen_service = ImageGenerationService(output_directory)
    
    async def decide_image_source(self, prompt: str) -> tuple[Literal["generate", "search"], str]:
        """
        Use LLM to decide whether to generate or search for an image.
        First checks for scientific/educational keywords to force SEARCH.
        
        Returns:
            Tuple of (decision, reason)
        """
        prompt_lower = prompt.lower()
        
        # KEYWORD-BASED PRE-CLASSIFICATION - forces SEARCH for scientific content
        # Physics keywords
        physics_keywords = [
            "pendulum", "oscillation", "wave", "frequency", "amplitude", "period",
            "momentum", "velocity", "acceleration", "force", "gravity", "friction",
            "energy", "kinetic", "potential", "thermodynamics", "heat", "temperature",
            "pressure", "volume", "gas", "molecule", "atom", "particle", "electron",
            "photon", "quantum", "relativity", "electromagnetic", "magnetic", "electric",
            "circuit", "resistance", "voltage", "current", "capacitor", "inductor",
            "lens", "mirror", "optics", "refraction", "reflection", "diffraction",
            "formula", "equation", "physics", "mechanics", "dynamics", "statics",
            "sinusoidal", "harmonic", "spring", "mass", "weight", "newton", "joule",
            "watt", "hertz", "wavelength", "spectrum", "radiation", "nuclear"
        ]
        
        # Chemistry keywords
        chemistry_keywords = [
            "molecule", "atom", "chemical", "reaction", "compound", "element",
            "periodic", "electron", "proton", "neutron", "ion", "bond", "covalent",
            "ionic", "hydrogen", "oxygen", "carbon", "nitrogen", "sulfur",
            "acid", "base", "ph", "oxidation", "reduction", "catalyst",
            "organic", "inorganic", "polymer", "protein", "enzyme", "dna", "rna",
            "chemistry", "molecular", "crystal", "solution", "concentration",
            "molar", "molarity", "titration", "equilibrium"
        ]
        
        # Biology keywords
        biology_keywords = [
            "cell", "dna", "rna", "gene", "chromosome", "mitosis", "meiosis",
            "protein", "enzyme", "bacteria", "virus", "organism", "species",
            "evolution", "natural selection", "genetics", "heredity", "mutation",
            "photosynthesis", "respiration", "metabolism", "ecosystem", "biome",
            "anatomy", "physiology", "organ", "tissue", "neuron", "synapse",
            "biology", "biological", "microscope", "specimen", "bacteria",
            "membrane", "nucleus", "cytoplasm", "mitochondria", "chloroplast"
        ]
        
        # Math/Statistics keywords
        math_keywords = [
            "graph", "chart", "diagram", "formula", "equation", "statistics",
            "percentage", "ratio", "proportion", "function", "derivative", "integral",
            "algebra", "geometry", "trigonometry", "calculus", "probability",
            "distribution", "mean", "median", "deviation", "variance", "correlation",
            "pie chart", "bar chart", "histogram", "scatter", "plot", "axis",
            "coordinate", "vector", "matrix", "theorem", "proof", "calculation"
        ]
        
        # Educational/Technical keywords
        educational_keywords = [
            "diagram", "schematic", "illustration", "infographic", "model",
            "educational", "classroom", "blackboard", "whiteboard", "textbook",
            "scientific", "technical", "labeled", "annotation", "scheme",
            "structure", "system", "process", "cycle", "flow", "mechanism"
        ]
        
        # Check all keyword categories
        all_search_keywords = (
            physics_keywords + chemistry_keywords + biology_keywords + 
            math_keywords + educational_keywords
        )
        
        matched_keywords = [kw for kw in all_search_keywords if kw in prompt_lower]
        
        if matched_keywords:
            reason = f"Scientific/educational content detected: {', '.join(matched_keywords[:3])}"
            print(f"Adaptive Image: Forced SEARCH due to keywords: {matched_keywords[:5]}")
            return "search", reason
        
        # If no keywords matched, use LLM for decision
        llm_client = LLMClient()
        model = get_model()
        
        system_prompt = """You are an image source classifier. Your PRIMARY goal is to use SEARCH for anything that needs ACCURACY or SPECIFICITY.

STRONGLY PREFER "search" for:
- Diagrams, charts, graphs, infographics
- Formulas, equations, mathematical concepts
- Statistics, data visualizations, percentages
- Technical illustrations, schematics, blueprints
- Scientific concepts, biological structures, chemistry
- Real objects, products, devices, tools
- Famous people, landmarks, logos, brands
- Historical photos, events, documents
- Maps, geographic content
- Business concepts (meetings, teamwork, office)
- Medical/health imagery
- Educational content, learning materials

Use "generate" ONLY for:
- Purely abstract art with no real-world equivalent
- Fantasy/sci-fi scenes that don't exist
- Highly stylized artistic interpretations
- Metaphorical imagery where accuracy doesn't matter

DEFAULT TO "search" when uncertain. Real photos are more credible for presentations.

Respond ONLY with valid JSON:
{"decision": "search", "reason": "brief explanation"}
or
{"decision": "generate", "reason": "brief explanation"}"""

        user_prompt = f"""Classify this image prompt:

Prompt: "{prompt}"

Examples (most should be SEARCH):
- "pie chart showing market share" → {{"decision": "search", "reason": "Data visualization needs real chart"}}
- "E=mc² formula" → {{"decision": "search", "reason": "Scientific formula needs accurate representation"}}
- "business team meeting" → {{"decision": "search", "reason": "Real workplace photo more credible"}}
- "DNA double helix" → {{"decision": "search", "reason": "Scientific structure needs accuracy"}}
- "growth statistics graph" → {{"decision": "search", "reason": "Statistical data needs real chart"}}
- "laptop on desk" → {{"decision": "search", "reason": "Real object, stock photo works best"}}
- "Eiffel Tower" → {{"decision": "search", "reason": "Real landmark, actual photos available"}}
- "abstract flowing colors" → {{"decision": "generate", "reason": "Pure abstract art, no real equivalent"}}
- "fantasy dragon castle" → {{"decision": "generate", "reason": "Fictional scene requires AI"}}

Your response (JSON only):"""

        try:
            messages = [
                LLMSystemMessage(role="system", content=system_prompt),
                LLMUserMessage(role="user", content=user_prompt)
            ]
            
            response = await llm_client.generate(model, messages, max_tokens=200)
            
            # Parse JSON response
            import json
            import re
            
            # Extract JSON from response
            json_match = re.search(r'\{[^}]+\}', response)
            if json_match:
                result = json.loads(json_match.group())
                decision = result.get("decision", "search")
                reason = result.get("reason", "Default decision")
                
                if decision not in ["generate", "search"]:
                    decision = "search"
                
                return decision, reason
            
        except Exception as e:
            print(f"Error in LLM classification: {e}")
        
        # Default to search for safety (cheaper, faster)
        return "search", "Defaulting to search due to classification error"
    
    async def search_pexels_multiple(self, query: str, count: int = 3) -> List[ImageAlternative]:
        """Search Pexels for multiple images."""
        api_key = get_pexels_api_key_env()
        if not api_key:
            return []
        
        try:
            async with aiohttp.ClientSession(trust_env=True) as session:
                response = await session.get(
                    "https://api.pexels.com/v1/search",
                    params={"query": query, "per_page": count},
                    headers={"Authorization": api_key},
                )
                data = await response.json()
                
                results = []
                for photo in data.get("photos", []):
                    results.append(ImageAlternative(
                        url=photo["src"]["large"],
                        thumbnail_url=photo["src"]["medium"],
                        source="pexels",
                        attribution=f"Photo by {photo.get('photographer', 'Unknown')} on Pexels",
                        description=photo.get("alt", "")
                    ))
                return results
                
        except Exception as e:
            print(f"Pexels search error: {e}")
            return []
    
    async def search_pixabay_multiple(self, query: str, count: int = 3) -> List[ImageAlternative]:
        """Search Pixabay for multiple images."""
        api_key = get_pixabay_api_key_env()
        if not api_key:
            return []
        
        try:
            async with aiohttp.ClientSession(trust_env=True) as session:
                response = await session.get(
                    "https://pixabay.com/api/",
                    params={
                        "key": api_key,
                        "q": query,
                        "image_type": "photo",
                        "per_page": count,
                    },
                )
                data = await response.json()
                
                results = []
                for hit in data.get("hits", []):
                    results.append(ImageAlternative(
                        url=hit["largeImageURL"],
                        thumbnail_url=hit["previewURL"],
                        source="pixabay",
                        attribution=f"Photo by {hit.get('user', 'Unknown')} on Pixabay",
                        description=hit.get("tags", "")
                    ))
                return results
                
        except Exception as e:
            print(f"Pixabay search error: {e}")
            return []
    
    async def search_multiple_sources(self, query: str, per_source: int = 2) -> List[ImageAlternative]:
        """
        Search multiple image sources in parallel.
        
        Args:
            query: Search query
            per_source: Number of images to fetch from each source
        
        Returns:
            Combined list of images from all sources
        """
        # Run all searches in parallel
        tasks = [
            unsplash_client.search_images(query, per_source),
            wikimedia_client.search_images(query, per_source),
            self.search_pexels_multiple(query, per_source),
            self.search_pixabay_multiple(query, per_source),
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        all_images: List[ImageAlternative] = []
        
        # Process Unsplash results
        if isinstance(results[0], list):
            for img in results[0]:
                all_images.append(ImageAlternative(
                    url=img.url,
                    thumbnail_url=img.thumbnail_url,
                    source="unsplash",
                    attribution=img.attribution,
                    description=img.description
                ))
        
        # Process Wikimedia results
        if isinstance(results[1], list):
            for img in results[1]:
                all_images.append(ImageAlternative(
                    url=img.url,
                    thumbnail_url=img.thumbnail_url,
                    source="wikimedia",
                    attribution=img.attribution,
                    description=img.description
                ))
        
        # Process Pexels results
        if isinstance(results[2], list):
            all_images.extend(results[2])
        
        # Process Pixabay results
        if isinstance(results[3], list):
            all_images.extend(results[3])
        
        # Interleave results from different sources for variety
        # Group by source, then interleave
        by_source = {}
        for img in all_images:
            if img.source not in by_source:
                by_source[img.source] = []
            by_source[img.source].append(img)
        
        interleaved = []
        max_len = max(len(v) for v in by_source.values()) if by_source else 0
        for i in range(max_len):
            for source in ["unsplash", "pexels", "wikimedia", "pixabay"]:
                if source in by_source and i < len(by_source[source]):
                    interleaved.append(by_source[source][i])
        
        return interleaved[:10]  # Return max 10 alternatives
    
    async def get_adaptive_image(
        self, prompt: str, language: str = "English"
    ) -> AdaptiveImageResponse:
        """
        Main entry point - decides whether to generate or search,
        then returns appropriate images.
        
        Args:
            prompt: The image description/prompt
        
        Returns:
            AdaptiveImageResponse with decision, reason, and images
        """
        # Step 1: Decide approach
        decision, reason = await self.decide_image_source(prompt)
        
        print(f"Adaptive Image Decision: {decision} - {reason}")
        
        images: List[ImageAlternative] = []
        
        if decision == "search":
            # Step 2a: Search multiple sources
            images = await self.search_multiple_sources(prompt, per_source=2)
            
            if not images:
                # Fallback to generation if search fails
                decision = "generate"
                reason = "Search returned no results, falling back to AI generation"
        
        if decision == "generate":
            # Step 2b: Generate with AI
            from models.image_prompt import ImagePrompt
            image_prompt = ImagePrompt(prompt=prompt, language=language)
            
            try:
                result = await self.image_gen_service.generate_image(image_prompt)
                
                if isinstance(result, str):
                    # URL or path
                    images = [ImageAlternative(
                        url=result,
                        source="ai",
                        attribution="AI Generated",
                        description=prompt
                    )]
                else:
                    # ImageAsset
                    images = [ImageAlternative(
                        url=result.path,
                        source="ai",
                        attribution="AI Generated",
                        description=prompt
                    )]
            except Exception as e:
                print(f"AI generation error: {e}")
                # Return placeholder
                images = [ImageAlternative(
                    url="/static/images/placeholder.jpg",
                    source="placeholder",
                    attribution="Placeholder",
                    description="Image generation failed"
                )]
        
        return AdaptiveImageResponse(
            decision=decision,
            reason=reason,
            images=images
        )
