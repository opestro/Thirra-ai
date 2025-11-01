import dotenv from 'dotenv';
dotenv.config({ override: true });

const env = process.env;

// Server settings from environment with sensible defaults
const port = parseInt(env.PORT ?? '4000', 10) || 4000;
const appBaseUrl = env.APP_BASE_URL || `http://localhost:${port}`;

export const config = {
  // Read from env (deployment-time):
  nodeEnv: env.NODE_ENV || 'development',
  
  // Fixed/derived server values
  port,
  appBaseUrl,

  pocketbase: {
    url: env.POCKETBASE_URL, // required at deploy time
  },

  openrouter: {
    apiKey: env.OPENROUTER_API_KEY, // required at deploy time
    baseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    
    // Model routing for cost optimization
    models: {
      // Classifier model (cheapest, for routing decisions)
      classifier: env.OPENROUTER_CLASSIFIER_MODEL || 'openai/gpt-5-mini',
      
      // Coding tasks - best code quality
      coding: env.OPENROUTER_CODING_MODEL || 'anthropic/claude-sonnet-4.5',
      
      // General queries - cost-effective
      general: env.OPENROUTER_GENERAL_MODEL || 'deepseek/deepseek-chat-v3.1',
      
      // Heavy work (research, resumes, complex analysis)
      heavy: env.OPENROUTER_HEAVY_MODEL || 'openai/gpt-5',
      
      // Lightweight for summaries
      lightweight: env.OPENROUTER_LIGHTWEIGHT_MODEL || 'google/gemini-2.5-flash',
    },
    
    // Embeddings
    embedModel: env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-large',
    
    // Default/fallback model
    defaultModel: env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3.1',
  },

  // Prompt and memory settings
  prompt: {
    recentMessageCount: parseInt(env.RECENT_MESSAGE_COUNT ?? '5', 10),
    ragTopK: parseInt(env.RAG_TOP_K ?? '4', 10),
    chunkSize: parseInt(env.CHUNK_SIZE ?? '1000', 10),
    chunkOverlap: parseInt(env.CHUNK_OVERLAP ?? '150', 10),
    maxOutputTokens: parseInt(env.MAX_OUTPUT_TOKENS ?? '2048', 10),
    maxHistoryTokens: parseInt(env.MAX_HISTORY_TOKENS ?? '2000', 10), // Cost optimization
  },

  // Nanobanana (Image Generation)
  nanobanana: {
    apiKey: env.NANOBANANA_API_KEY, // optional
    callbackUrl: env.NANOBANANA_CALLBACK_URL || `${appBaseUrl}/api/webhooks/nanobanana`,
  },
};

export function assertRequiredEnv() {
  const missing = [];
  if (!config.openrouter.apiKey) missing.push('OPENROUTER_API_KEY');
  if (!config.pocketbase.url) missing.push('POCKETBASE_URL');
  if (missing.length) {
    const err = new Error(`Missing required environment: ${missing.join(', ')}`);
    err.status = 500;
    throw err;
  }
}

export default config;