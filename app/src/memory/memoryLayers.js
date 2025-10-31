import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { summarizeMessages, RECENT_MESSAGE_COUNT, SUMMARY_CAP_CHARS } from "../utils/summary.js";
import { getEmbeddingsClient } from "../utils/embeddingsClient.js";
import { ensureIndexedForConversation, retrieveContextsWithScores } from "../utils/rag.js";
import { getCachedTurns, getCachedSummary } from "./cache.js";
import config from "../config/config.js";

/**
 * Short-term memory: last k messages.
 * Token cost: proportional to sum of last k message lengths.
 * Uses cached turns to avoid redundant DB calls.
 */
export async function getShortTermMemory({ pb, conversationId, k = RECENT_MESSAGE_COUNT, cachedTurns = null }) {
  if (!conversationId) return [];
  
  // Use cached turns if provided, otherwise fetch
  const turns = cachedTurns || await getCachedTurns(pb, conversationId);
  
  const msgs = [];
  for (const t of turns) {
    if (t.user_text) msgs.push(new HumanMessage(String(t.user_text)));
    if (t.assistant_text) msgs.push(new AIMessage(String(t.assistant_text)));
  }
  return msgs.slice(Math.max(0, msgs.length - k));
}

/**
 * Long-term summarized memory using a lightweight model.
 * Token cost: one summarization pass per new chunk; summary cached and reused.
 * Uses cached turns and cached summaries to avoid redundant work.
 */
export async function getLongTermSummary({ pb, conversationId, instruction, cachedTurns = null }) {
  if (!conversationId) return null;
  
  // Use cached turns if provided, otherwise fetch
  const turns = cachedTurns || await getCachedTurns(pb, conversationId);
  
  const msgs = [];
  for (const t of turns) {
    if (t.user_text) msgs.push(new HumanMessage(String(t.user_text)));
    if (t.assistant_text) msgs.push(new AIMessage(String(t.assistant_text)));
  }
  
  if (msgs.length <= RECENT_MESSAGE_COUNT) return null;
  
  // Try to get cached summary
  const turnCount = turns.length;
  const cachedSummary = await getCachedSummary(conversationId, turnCount, async () => {
    // Generate new summary only if not cached
    const { apiKey, baseUrl, models } = config.openrouter;
    const llm = new ChatOpenAI({
      apiKey,
      model: models.lightweight,
      configuration: {
        baseURL: baseUrl,
        defaultHeaders: {
          "HTTP-Referer": config.appBaseUrl,
          "X-Title": "Thirra AI",
        },
      },
    });
    
    const older = msgs.slice(0, msgs.length - RECENT_MESSAGE_COUNT);
    const summary = await summarizeMessages({ 
      model: llm, 
      instruction, 
      messagesToSummarize: older, 
      existingSummary: "" 
    });
    const trimmed = String(summary || "").replace(/\s+/g, " ").trim().slice(0, SUMMARY_CAP_CHARS);
    return trimmed || null;
  });
  
  if (!cachedSummary) return null;
  return new SystemMessage(`Earlier conversation summary (compact):\n${cachedSummary}`);
}

/**
 * Semantic recall with threshold (compression removed - Token Budget handles it)
 * - Computes similarity scores and applies threshold > 0.8 * max(sim).
 * Token cost: retrieval embeddings only
 */
export async function getSemanticContext({ pb, conversationId, query, instruction, kDynamic = 2, thresholdFactor = 0.8 }) {
  const embeddings = getEmbeddingsClient();
  await ensureIndexedForConversation({ pb, conversationId, embeddings, files: [] });
  const { chunks, maxSim } = await retrieveContextsWithScores({ conversationId, query, embeddings, topK: Math.max(1, kDynamic) });
  const cutoff = maxSim * thresholdFactor;
  const filtered = chunks.filter(c => c.sim >= cutoff);
  
  if (filtered.length === 0) {
    return { contextText: "", stats: { maxSim, cutoff, selected: 0 }, items: [] };
  }

  // No compression - Token Budget handles it more efficiently
  const items = filtered.map((chunk) => ({ 
    text: chunk.text, 
    sim: chunk.sim 
  }));
  const contextText = items.map((x) => `- ${x.text}`).join("\n");
  
  return { contextText, stats: { maxSim, cutoff, selected: filtered.length }, items };
}

/**
 * Combined memory builder - Optimized with single DB call
 * Returns { historyMsgs, contextText, metrics } for use in prompting.
 */
export async function buildCombinedMemory({ pb, conversationId, query, instruction }) {
  // Fetch turns ONCE and reuse for all layers
  const turns = await getCachedTurns(pb, conversationId);
  
  // Short-term (pass cached turns)
  const short = await getShortTermMemory({ 
    pb, 
    conversationId, 
    k: RECENT_MESSAGE_COUNT, 
    cachedTurns: turns 
  });
  
  // Long-term summary (pass cached turns)
  const summaryMsg = await getLongTermSummary({ 
    pb, 
    conversationId, 
    instruction, 
    cachedTurns: turns 
  });
  
  const historyMsgs = summaryMsg ? [summaryMsg, ...short] : short;

  // Semantic recall (dynamic k: base 2; bump to 3 if query looks complex)
  const complexity = estimateQueryComplexity(query);
  const kDynamic = complexity >= 0.6 ? 3 : 2;
  const { contextText, stats, items } = await getSemanticContext({ 
    pb, 
    conversationId, 
    query, 
    instruction, 
    kDynamic 
  });

  const metrics = { 
    semanticRecall: stats, 
    shortCount: short.length, 
    hasSummary: !!summaryMsg,
    turnsCached: turns.length > 0,
  };
  
  return { historyMsgs, contextText, metrics, items };
}

/**
 * Lightweight complexity heuristic for dynamic tuning.
 */
export function estimateQueryComplexity(query) {
  const q = String(query || "").toLowerCase();
  const lenScore = Math.min(1, q.length / 400);
  const hasOps = /how|why|compare|design|implement|debug|optimi|trade[- ]?off|architecture|performance/.test(q) ? 0.3 : 0;
  const hasRefs = /previous|earlier|as we discussed|context|memory|file|code/.test(q) ? 0.3 : 0;
  return Math.max(0, Math.min(1, lenScore + hasOps + hasRefs));
}