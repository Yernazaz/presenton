/**
 * API client for adaptive image selection.
 * Provides methods to get intelligently-selected images based on prompts.
 */

import { ApiResponseHandler } from "./api-error-handler";

export interface ImageAlternative {
  url: string;
  thumbnail_url?: string;
  source: "unsplash" | "wikimedia" | "pexels" | "pixabay" | "ai" | "placeholder";
  attribution?: string;
  description?: string;
}

export interface AdaptiveImageResponse {
  decision: "generate" | "search";
  reason: string;
  images: ImageAlternative[];
}

export interface SearchMultipleResponse {
  images: ImageAlternative[];
}

const API_BASE = "/api/v1/ppt/images";

export class AdaptiveImageApi {
  /**
   * Get an adaptive image based on the prompt.
   * The service decides whether to generate or search for images.
   * 
   * @param prompt - Description of the image needed
   * @returns Response with decision, reason, and images
   */
  static async getAdaptiveImage(prompt: string): Promise<AdaptiveImageResponse> {
    const response = await fetch(`${API_BASE}/adaptive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to get adaptive image"
    ) as AdaptiveImageResponse;
  }

  /**
   * Search multiple sources for images.
   * Returns images from Unsplash, Wikimedia, Pexels, and Pixabay.
   * 
   * @param query - Search query
   * @param perSource - Number of images per source (default 2)
   * @returns List of image alternatives
   */
  static async searchMultipleSources(
    query: string,
    perSource: number = 2
  ): Promise<SearchMultipleResponse> {
    const params = new URLSearchParams({
      query,
      per_source: perSource.toString(),
    });

    const response = await fetch(`${API_BASE}/search-multiple?${params}`, {
      method: "GET",
    });

    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to search images"
    ) as SearchMultipleResponse;
  }
}

