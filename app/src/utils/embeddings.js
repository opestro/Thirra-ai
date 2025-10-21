import { OpenAIEmbeddings } from "@langchain/openai";

export function createEmbeddingsClient() {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const OPENROUTER_EMBED_MODEL = process.env.OPENROUTER_EMBED_MODEL || "openai/text-embedding-3-large";
  return new OpenAIEmbeddings({
    apiKey: OPENROUTER_API_KEY,
    model: OPENROUTER_EMBED_MODEL,
    configuration: {
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": process.env.APP_BASE_URL || "http://localhost:4000",
        "X-Title": "Thirra AI",
      },
    },
  });
}