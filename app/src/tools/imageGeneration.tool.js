/**
 * Image Generation Tool using Nanobanana API
 * 
 * Allows LLM to generate or edit images based on user requests
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import config from "../config/config.js";

// Tool input schema
const ImageGenerationSchema = z.object({
  prompt: z.string().describe("Detailed description of the image to generate or edit. Max 5000 characters."),
  image_urls: z.array(z.string().url()).optional().describe("Array of image URLs for editing. Required for image editing tasks."),
  output_format: z.enum(["png", "jpeg"]).default("png").describe("Output image format"),
  image_size: z.enum(["1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9", "auto"])
    .default("1:1")
    .describe("Aspect ratio of the output image"),
});

/**
 * Generate or edit image using Nanobanana API
 */
export const generateImage = tool(
  async ({ prompt, image_urls, output_format, image_size }) => {
    const apiKey = config.nanobanana.apiKey;
    const callBackUrl = config.nanobanana.callbackUrl;
    
    if (!apiKey) {
      return {
        success: false,
        error: "Nanobanana API key not configured",
      };
    }
    
    try {
      // Determine model based on whether we're editing or generating
      const model = image_urls && image_urls.length > 0 
        ? "google/nano-banana-edit" 
        : "google/nano-banana";
      
      const requestBody = {
        model,
        callBackUrl,
        input: {
          prompt: prompt.substring(0, 5000), // Enforce max length
          output_format: output_format || "png",
          image_size: image_size || "1:1",
        },
      };
      
      // Add image URLs if editing
      if (image_urls && image_urls.length > 0) {
        requestBody.input.image_urls = image_urls;
      }
      
      console.log(`[Image Tool] Creating task with Nanobanana API (${model})`);
      console.log(`[Image Tool] Prompt: ${prompt.substring(0, 100)}...`);
      
      const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Image Tool] API Error: ${response.status} - ${errorText}`);
        return {
          success: false,
          error: `Image generation API error: ${response.status}`,
        };
      }
      
      const data = await response.json();
      
      if (data.code === 200 && data.data?.taskId) {
        const taskId = data.data.taskId;
        console.log(`[Image Tool] Task created successfully: ${taskId}`);
        
        return {
          success: true,
          taskId,
          status: "processing",
          message: `Image generation started. Task ID: ${taskId}. I'll notify you when it's ready.`,
          model,
          prompt: prompt.substring(0, 200),
        };
      } else {
        console.error(`[Image Tool] Unexpected response:`, data);
        return {
          success: false,
          error: data.message || "Unexpected response from image generation API",
        };
      }
    } catch (error) {
      console.error(`[Image Tool] Error:`, error);
      return {
        success: false,
        error: `Failed to start image generation: ${error.message}`,
      };
    }
  },
  {
    name: "generate_image",
    description: `Generate or edit images based on text descriptions.

WHEN TO USE:
- User asks to create, generate, or make an image
- User wants to edit or modify an existing image
- User needs visual content generated from text

REQUIRED PARAMETERS:
- prompt (string): A detailed description of the image to generate. ALWAYS extract this from the user's request.

OPTIONAL PARAMETERS:
- image_size (string): Aspect ratio like "1:1", "16:9", "9:16" (default: "1:1")
- output_format (string): "png" or "jpeg" (default: "png")
- image_urls (array): URLs of images to edit (only for editing tasks)

EXAMPLE CALLS:
- User: "generate an image of a sunset" → {prompt: "a beautiful sunset over the ocean", image_size: "16:9"}
- User: "create a logo" → {prompt: "a modern minimalist logo design", image_size: "1:1"}
- User: "make a picture of a flying banana" → {prompt: "a yellow banana with wings flying through the sky", image_size: "1:1"}

IMPORTANT: Always extract and include the 'prompt' parameter from the user's request. Never call this tool without a prompt.`,
    schema: ImageGenerationSchema,
  }
);

/**
 * Query image generation task status
 */
export async function queryImageTask(taskId) {
  const apiKey = config.nanobanana.apiKey;
  
  if (!apiKey) {
    throw new Error("Nanobanana API key not configured");
  }
  
  try {
    const response = await fetch(
      `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`,
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`Query failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error(`[Image Tool] Query error:`, error);
    throw error;
  }
}

