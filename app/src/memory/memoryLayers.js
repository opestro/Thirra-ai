import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { summarizeMessages, RECENT_MESSAGE_COUNT, SUMMARY_CAP_CHARS } from "../utils/summary.js";
import { getEmbeddingsClient } from "../utils/embeddingsClient.js";
import { ensureIndexedForConversation, retrieveContextsWithScores } from "../utils/rag.js";
import { compressChunks } from "../utils/compression.js";
import config from "../config/config.js";

/**
 * Short-term memory: last k messages.
 * Token cost: proportional to sum of last k message lengths.
 */
export async function getShortTermMemory({ pb, conversationId, k = RECENT_MESSAGE_COUNT }) {
  if (!conversationId) return [];
  const turns = await pb.collection("turns").getFullList(500, {
    filter: `conversation = "${conversationId}"`,
    sort: "created",
  });
  const msgs = [];
  for (const t of turns) {
    if (t.user_text) msgs.push(new HumanMessage(String(t.user_text)));
    if (t.assistant_text) msgs.push(new AIMessage(String(t.assistant_text)));
  }
  return msgs.slice(Math.max(0, msgs.length - k));
}

/**
 * Long-term summarized memory using a lightweight model.
 * Token cost: one summarization pass per new chunk; summary reused across turns.
 */
export async function getLongTermSummary({ pb, conversationId, instruction }) {
  if (!conversationId) return null;
  const { apiKey, baseUrl, lightweightModel } = config.openrouter;
  const llm = new ChatOpenAI({
    apiKey,
    model: lightweightModel,
    configuration: {
      baseURL: baseUrl,
      defaultHeaders: {
        "HTTP-Referer": config.appBaseUrl,
        "X-Title": "Thirra AI",
      },
    },
  });

  const turns = await pb.collection("turns").getFullList(500, {
    filter: `conversation = "${conversationId}"`,
    sort: "created",
  });
  const msgs = [];
  for (const t of turns) {
    if (t.user_text) msgs.push(new HumanMessage(String(t.user_text)));
    if (t.assistant_text) msgs.push(new AIMessage(String(t.assistant_text)));
  }
  if (msgs.length <= RECENT_MESSAGE_COUNT) return null;
  const older = msgs.slice(0, msgs.length - RECENT_MESSAGE_COUNT);
  const summary = await summarizeMessages({ model: llm, instruction, messagesToSummarize: older, existingSummary: "" });
  const trimmed = String(summary || "").replace(/\s+/g, " ").trim().slice(0, SUMMARY_CAP_CHARS);
  if (!trimmed) return null;
  return new SystemMessage(`Earlier conversation summary (compact):\n${trimmed}`);
}

/**
 * Semantic recall with threshold and compression.
 * - Computes similarity scores and applies threshold > 0.8 * max(sim).
 * - Compresses selected chunks to ~40–60% tokens.
 * Token cost: retrieval embeddings + compression passes per selected chunk.
 */
export async function getSemanticContext({ pb, conversationId, query, instruction, kDynamic = 2, thresholdFactor = 0.8 }) {
  const embeddings = getEmbeddingsClient();
  await ensureIndexedForConversation({ pb, conversationId, embeddings, files: [] });
  const { chunks, maxSim } = await retrieveContextsWithScores({ conversationId, query, embeddings, topK: Math.max(1, kDynamic) });
  const cutoff = maxSim * thresholdFactor;
  const filtered = chunks.filter(c => c.sim >= cutoff);
  const rawTexts = filtered.map(c => c.text);
  if (rawTexts.length === 0) return { contextText: "", stats: { maxSim, cutoff, selected: 0 } };

  const { compressed, ratios } = await compressChunks({ chunks: rawTexts, targetLow: 0.4, targetHigh: 0.6, instruction });
  const items = compressed.map((t, i) => ({ text: t, sim: filtered[i]?.sim ?? 0, ratio: ratios[i] ?? 0 }));
  const contextText = items.filter(x => x.text).map((x) => `- ${x.text}`).join("\n");
  return { contextText, stats: { maxSim, cutoff, selected: rawTexts.length, ratios }, items };
}

/**
 * Combined memory builder.
 * Returns { historyMsgs, contextText, metrics } for use in prompting.
 */
export async function buildCombinedMemory({ pb, conversationId, query, instruction }) {
  // Short-term
  const short = await getShortTermMemory({ pb, conversationId, k: RECENT_MESSAGE_COUNT });
  // Long-term summary
  const summaryMsg = await getLongTermSummary({ pb, conversationId, instruction });
  const historyMsgs = summaryMsg ? [summaryMsg, ...short] : short;

  // Semantic recall (dynamic k: base 2; bump to 3 if query looks complex)
  const complexity = estimateQueryComplexity(query);
  const kDynamic = complexity >= 0.6 ? 3 : 2;
  const { contextText, stats, items } = await getSemanticContext({ pb, conversationId, query, instruction, kDynamic });

  const metrics = { semanticRecall: stats, shortCount: short.length, hasSummary: !!summaryMsg };
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