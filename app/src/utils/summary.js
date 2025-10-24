import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

const summaryCache = new Map(); // conversationId -> { summary: string, summarizedCount: number }
import config from "../config/config.js";
export const RECENT_MESSAGE_COUNT = config.prompt.recentMessageCount;
export const SUMMARY_CAP_CHARS = config.prompt.summaryCapChars;

export async function messagesToText(msgs) {
  return msgs
    .map((m) => {
      const role = m instanceof HumanMessage ? "user" : (m instanceof AIMessage ? "assistant" : "system");
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `${role}: ${content}`;
    })
    .join("\n\n");
}

export async function summarizeMessages({ model, instruction, messagesToSummarize, existingSummary }) {
  const summarizerPrompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a precise summarizer. Create a concise, structured summary capturing goals, facts, constraints, key decisions, unresolved questions, and action items. Preserve crucial numbers, names, links, and user preferences. Avoid fluff. Return 80-140 words if possible."],
    instruction ? ["system", `User instruction (preferences/background): ${String(instruction).trim()}`] : null,
    existingSummary ? ["system", `Existing summary to refine:\n${existingSummary}`] : null,
    ["human", "Summarize these messages while preserving essential context:\n\n{content}"]
  ].filter(Boolean));
  const chain = summarizerPrompt.pipe(model);
  const content = messagesToText(messagesToSummarize);
  const result = await chain.invoke({ content });
  const text = result?.content;
  return typeof text === "string" ? text : JSON.stringify(text);
}

export async function buildSummarizedHistory({ pb, conversationId, model, instruction }) {
  if (!conversationId) return [];
  const turns = await pb.collection("turns").getFullList(500, {
    filter: `conversation = "${conversationId}"`,
    sort: "created",
  });
  const all = [];
  for (const t of turns) {
    if (t.user_text) all.push(new HumanMessage(String(t.user_text)));
    if (t.assistant_text) all.push(new AIMessage(String(t.assistant_text)));
  }
  if (all.length <= RECENT_MESSAGE_COUNT) return all;

  const older = all.slice(0, all.length - RECENT_MESSAGE_COUNT);
  const recent = all.slice(-RECENT_MESSAGE_COUNT);

  const cache = summaryCache.get(conversationId) || { summary: "", summarizedCount: 0 };
  if (older.length > cache.summarizedCount) {
    const newPortion = older.slice(cache.summarizedCount);
    const updated = await summarizeMessages({
      model,
      instruction,
      messagesToSummarize: newPortion,
      existingSummary: cache.summary,
    });
    cache.summary = updated;
    cache.summarizedCount = older.length;
    summaryCache.set(conversationId, cache);
  }

  const history = [];
  if (cache.summary && cache.summary.trim().length > 0) {
    const trimmed = cache.summary.replace(/\s+/g, " ").trim().slice(0, SUMMARY_CAP_CHARS);
    history.push(new SystemMessage(`Earlier conversation summary (compact):\n${trimmed}`));
  }
  history.push(...recent);
  return history;
}