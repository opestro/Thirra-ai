import { ChatOpenAI } from "@langchain/openai";
import { buildSummarizedHistory } from "../utils/summary.js";
import { applyPromptBudgetGuard } from "../utils/promptBudget.js";
import { createEmbeddingsClient } from "../utils/embeddings.js";
import { ensureIndexedForConversation, retrieveRelevantContexts } from "../utils/rag.js";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { BaseChatMessageHistory } from "@langchain/core/chat_history";

class EphemeralChatMessageHistory extends BaseChatMessageHistory {
  constructor(initialMessages = []) {
    super();
    this._messages = Array.isArray(initialMessages) ? [...initialMessages] : [];
  }
  async getMessages() {
    return this._messages;
  }
  async addMessage(message) {
    this._messages.push(message);
  }
  async clear() {
    this._messages = [];
  }
  async addAIMessage(text) {
    this._messages.push(new AIMessage(text));
  }
  async addUserMessage(text) {
    this._messages.push(new HumanMessage(text));
  }
}

function buildSystemPrompt(userInstruction) {
  const base = "You are a helpful assistant. When files are attached, read their content and use it to answer. If content is truncated, state that clearly.";
  if (userInstruction && String(userInstruction).trim().length > 0) {
    return `${base}\nUser instruction: ${String(userInstruction).trim()}`;
  }
  return base;
}

async function buildHistoryFromPocketBase(pb, conversationId) {
  if (!conversationId) return new EphemeralChatMessageHistory([]);
  const turns = await pb.collection('turns').getFullList(500, {
    filter: `conversation = "${conversationId}"`,
    sort: 'index',
  });
  const msgs = [];
  for (const t of turns) {
    if (t.user_text) msgs.push(new HumanMessage(String(t.user_text)));
    if (t.assistant_text) msgs.push(new AIMessage(String(t.assistant_text)));
  }
  return new EphemeralChatMessageHistory(msgs);
}

function buildAttachmentMessages(files = []) {
  const messages = [];
  const hasFiles = Array.isArray(files) && files.length > 0;
  if (!hasFiles) return messages;

  const MAX_CHARS = 5000; // reduced from 20000 to shrink prompt size
  for (const f of files) {
    const name = f.originalname || 'attachment';
    const type = f.mimetype || 'application/octet-stream';
    const isTextLike = (type || '').startsWith('text/') || /(json|xml|yaml|yml|csv|markdown|md|html)/i.test(type || '');
    let contentStr = '';
    if (isTextLike) {
      try {
        contentStr = Buffer.from(f.buffer).toString('utf-8');
      } catch (_) {
        contentStr = '';
      }
    }
    if (contentStr) {
      if (contentStr.length > MAX_CHARS) {
        contentStr = contentStr.slice(0, MAX_CHARS) + '\n[...truncated...]';
      }
      messages.push(new HumanMessage(`Attached file: ${name}\nType: ${type}\n---\n${contentStr}`));
    } else {
      messages.push(new HumanMessage(`Attached file: ${name}\nType: ${type}\nContent: [binary or unsupported format; content omitted]`));
    }
  }
  return messages;
}

const RECENT_MESSAGE_COUNT = parseInt(process.env.RECENT_MESSAGE_COUNT || '3', 10);
const RAG_TOP_K = 2;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
const RETRIEVAL_CHUNK_MAX_CHARS = 450; // tighter per chunk
const PROMPT_CHAR_BUDGET = 4500; // ~1100 tokens heuristic
const MAX_HISTORY_CHARS = 1600; // proactive cap before total budget
const COMPRESSED_RECENT_CHARS = 240; // per compressed recent message
const SUMMARY_CAP_CHARS = 600; // tighter summary cap






export async function generateAssistantTextWithMemory({ pb, conversationId, prompt, files = [], userInstruction }) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

  if (!OPENROUTER_API_KEY) {
    const err = new Error('OpenRouter API key missing');
    err.status = 500;
    throw err;
  }

  const systemPrompt = buildSystemPrompt(userInstruction);

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
    new MessagesPlaceholder("input_messages"),
  ]);

  const model = new ChatOpenAI({
    apiKey: OPENROUTER_API_KEY,
    model: OPENROUTER_MODEL,
    configuration: {
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_BASE_URL || 'http://localhost:4000',
        'X-Title': 'Thirra AI',
      },
    },
  });

  const embeddings = createEmbeddingsClient();
  await ensureIndexedForConversation({ pb, conversationId, embeddings, files });

  // Retrieve contexts and build input with budget guard
  let topK = RAG_TOP_K;
  let perChunk = RETRIEVAL_CHUNK_MAX_CHARS;
  let retrieved = await retrieveRelevantContexts({ conversationId, query: prompt, embeddings, topK, maxCharsPerChunk: perChunk });
  const retrievedMsg = retrieved.length ? new SystemMessage(`Retrieved context (top-${topK}):\n` + retrieved.map((x) => `- ${x}`).join('\n')) : null;

  let inputMessages = [
    ...(retrievedMsg ? [retrievedMsg] : []),
    ...buildAttachmentMessages(files),
    new HumanMessage(String(prompt)),
  ];
  const inputCharLen = inputMessages.reduce((acc, m) => acc + String(m.content || '').length, 0);
  if (inputCharLen > PROMPT_CHAR_BUDGET) {
    topK = 2; perChunk = 350;
    retrieved = await retrieveRelevantContexts({ conversationId, query: prompt, embeddings, topK, maxCharsPerChunk: perChunk });
    const retr2 = retrieved.length ? new SystemMessage(`Retrieved context (top-${topK}):\n` + retrieved.map((x) => `- ${x}`).join('\n')) : null;
    inputMessages = [
      ...(retr2 ? [retr2] : []),
      ...buildAttachmentMessages(files),
      new HumanMessage(String(prompt)),
    ];
  }
  const inputCharLen2 = inputMessages.reduce((acc, m) => acc + String(m.content || '').length, 0);
  if (inputCharLen2 > PROMPT_CHAR_BUDGET) {
    topK = 1; perChunk = 300;
    retrieved = await retrieveRelevantContexts({ conversationId, query: prompt, embeddings, topK, maxCharsPerChunk: perChunk });
    const retr3 = retrieved.length ? new SystemMessage(`Retrieved context (top-${topK}):\n` + retrieved.map((x) => `- ${x}`).join('\n')) : null;
    inputMessages = [
      ...(retr3 ? [retr3] : []),
      ...buildAttachmentMessages(files),
      new HumanMessage(String(prompt)),
    ];
  }

  const chain = promptTemplate.pipe(model);

  // Build history messages as before
  const baseHistory = await buildSummarizedHistory({ pb, conversationId, model, instruction: userInstruction });
  
  // Compute character budgets
  const historyCharLen = baseHistory.reduce((acc, m) => acc + String(m.content || '').length, 0);
  const inputCharsCombined = inputMessages.reduce((acc, m) => acc + String(m.content || '').length, 0);
  const { historyMsgs, totalChars } = applyPromptBudgetGuard({ baseHistory, inputMessages, prompt, PROMPT_CHAR_BUDGET, MAX_HISTORY_CHARS, COMPRESSED_RECENT_CHARS, SUMMARY_CAP_CHARS });
console.log(`[Prompt Budget] history_chars=${historyMsgs.reduce((a,m)=>a+String(m.content||'').length,0)} input_chars=${inputCharsCombined} total_chars=${totalChars}`);
  
  let result;
  try {
    result = await chain.invoke({ input_messages: inputMessages, history: historyMsgs });
  } catch (e) {
    if (String(e?.message || '').includes('401')) {
      console.warn('[LLM] Unauthorized; retrying with OpenRouter key...');
      result = await chain.invoke({ input_messages: inputMessages, history: historyMsgs });
    } else {
      throw e;
    }
  }
  const usage = result?.usage_metadata || result?.response_metadata?.usage || result?.response_metadata?.tokenUsage;
  const promptTokens = usage?.input_tokens ?? usage?.promptTokens;
  const completionTokens = usage?.output_tokens ?? usage?.completionTokens;
  const totalTokens = usage?.total_tokens ?? usage?.totalTokens ?? ((promptTokens != null && completionTokens != null) ? (promptTokens + completionTokens) : undefined);
  console.log(`[LLM Tokens] conv=${conversationId || 'new'} prompt=${promptTokens ?? 'n/a'} completion=${completionTokens ?? 'n/a'} total=${totalTokens ?? 'n/a'}`);
  
  const content = result?.content;
  return typeof content === 'string' ? content : JSON.stringify(content);
}