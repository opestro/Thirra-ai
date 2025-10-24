import dotenv from 'dotenv';
dotenv.config({ override: true });

const env = process.env;

// Fixed server settings
// Server settings from environment with sensible defaults
const port = parseInt(env.PORT, 10) || 4000;
const appBaseUrl = env.APP_BASE_URL || `http://localhost:${port}`;

export const config = {
  // Read from env (deployment-time):
  nodeEnv: env.NODE_ENV || 'development',
  pocketbase: {
    url: env.POCKETBASE_URL, // required at deploy time
  },
  openrouter: {
    apiKey: env.OPENROUTER_API_KEY, // required at deploy time

    // Fixed defaults (do not read from env):
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    embedModel: 'openai/text-embedding-3-large',
    lightweightModel: 'openai/gpt-4o-mini',
  },

  // Fixed app/server values
  port,
  appBaseUrl,

  // Fixed prompt/memory tuning values
  prompt: {
    recentMessageCount: 5,
    ragTopK: 4,
    chunkSize: 1000,
    chunkOverlap: 150,
    retrievalChunkMaxChars: 12000,
    promptCharBudget: 4500,
    maxHistoryChars: 1600,
    compressedRecentChars: 240,
    summaryCapChars: 600,
    maxContextTokens: 128000,
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