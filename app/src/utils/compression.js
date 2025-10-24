/**
 * Context compression utilities.
 * Token cost: Low to medium per chunk; scales with number of chunks compressed.
 * Use a lightweight LLM to compress retrieved contexts to ~40–60% of original length
 * while preserving factual and relational information.
 */
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import config from "../config/config.js";

/**
 * Compress an array of text chunks with a lightweight model.
 * @param {Object} params
 * @param {string[]} params.chunks - Raw context chunks to compress.
 * @param {number} [params.targetLow=0.4] - Lower bound ratio of original length.
 * @param {number} [params.targetHigh=0.6] - Upper bound ratio of original length.
 * @param {string} [params.instruction] - Optional user instruction/background.
 * @returns {{ compressed: string[], ratios: number[] }}
 */
export async function compressChunks({ chunks, targetLow = 0.4, targetHigh = 0.6, instruction }) {
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

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You compress context for efficient retrieval. Preserve facts, entities, relations, constraints, and numbers. Remove filler, examples, and redundant phrasing. Target 40–60% of original tokens. Return plain text only.",
    ],
    instruction ? ["system", `User instruction (preferences/background): ${String(instruction).trim()}`] : null,
    ["human", "Compress this context while retaining key facts and relations:\n\n{chunk}"],
  ].filter(Boolean));

  const chain = prompt.pipe(llm);
  const compressed = [];
  const ratios = [];

  for (const ch of chunks) {
    const originalLen = String(ch || "").length;
    if (!originalLen) {
      compressed.push("");
      ratios.push(0);
      continue;
    }
    const res = await chain.invoke({ chunk: String(ch) });
    let text = typeof res?.content === "string" ? res.content : JSON.stringify(res?.content ?? "");
    // Soft clamp to target ratio by truncation if the model overshoots.
    const desiredLow = Math.floor(originalLen * targetLow);
    const desiredHigh = Math.floor(originalLen * targetHigh);
    if (text.length > desiredHigh) {
      text = text.slice(0, desiredHigh);
    }
    const ratio = originalLen ? text.length / originalLen : 0;
    compressed.push(text);
    ratios.push(ratio);
  }

  return { compressed, ratios };
}