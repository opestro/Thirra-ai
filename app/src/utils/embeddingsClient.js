// Embeddings client singleton
// This module creates the OpenAIEmbeddings client once and reuses it globally.
// Rationale:
// - Configuration is loaded once at startup via config.js (dotenv runs a single time).
// - Avoid recreating clients inside request-handling or response-generation functions.
// - Import and reuse the same instance or call getEmbeddingsClient(), which is lazy
//   and returns the same instance every time.

import { OpenAIEmbeddings } from "@langchain/openai";
import config from "../config/config.js";

let _embeddingsClient = null;

export function getEmbeddingsClient() {
  if (_embeddingsClient) return _embeddingsClient;
  const { apiKey, baseUrl, embedModel } = config.openrouter;
  _embeddingsClient = new OpenAIEmbeddings({
    apiKey,
    model: embedModel,
    configuration: {
      baseURL: baseUrl,
      defaultHeaders: {
        "HTTP-Referer": config.appBaseUrl,
        "X-Title": "Thirra AI",
      },
    },
  });
  return _embeddingsClient;
}

// Eager singleton export for modules that prefer a direct instance.
export const embeddingsClient = getEmbeddingsClient();