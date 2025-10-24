// Centralized environment configuration
// Loads environment variables once at startup and exposes a single config object
// Note: This module should be imported anywhere env vars are needed

import dotenv from 'dotenv';

// Load .env exactly once. Node's module cache ensures this module runs a single time.
dotenv.config({ override: true });

const env = process.env;

const port = parseInt(env.PORT || '4000', 10);

export const config = {
  nodeEnv: env.NODE_ENV || 'development',
  port,
  appBaseUrl: env.APP_BASE_URL || `http://localhost:${port}`,
  openrouter: {
    apiKey: env.OPENROUTER_API_KEY || '',
    model: env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    baseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    embedModel: env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-large',
  },
  pocketbase: {
    url: env.POCKETBASE_URL || 'http://127.0.0.1:8090',
  },
  prompt: {
    recentMessageCount: parseInt(env.RECENT_MESSAGE_COUNT || '3', 10),
    ragTopK: parseInt(env.RAG_TOP_K || '2', 10),
    chunkSize: 1000,
    chunkOverlap: 150,
    retrievalChunkMaxChars: parseInt(env.RETRIEVAL_CHUNK_MAX_CHARS || '450', 10),
    promptCharBudget: parseInt(env.PROMPT_CHAR_BUDGET || '4500', 10),
    maxHistoryChars: 1600,
    compressedRecentChars: 240,
    summaryCapChars: parseInt(env.SUMMARY_CAP_CHARS || '600', 10),
  },
};

export function assertRequiredEnv() {
  if (!config.openrouter.apiKey) {
    const err = new Error('OpenRouter API key missing');
    err.status = 500;
    throw err;
  }
}

export default config;