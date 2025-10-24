import { ChatOpenAI } from "@langchain/openai";
import { buildSummarizedHistory } from "../utils/summary.js";
import { applyPromptBudgetGuard } from "../utils/promptBudget.js";
import { getEmbeddingsClient } from "../utils/embeddingsClient.js";
import { ensureIndexedForConversation, retrieveRelevantContexts } from "../utils/rag.js";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import config from "../config/config.js";


function buildSystemPrompt(userInstruction) {
  const base = "You are a helpful assistant. When files are attached, read their content and use it to answer. If content is truncated, state that clearly.";
  return `${base}\nUser instruction: ${String(userInstruction).trim()}`;
}


function buildAttachmentMessages(files = []) {
  const messages = [];
  const hasFiles = Array.isArray(files) && files.length > 0;
  if (!hasFiles) return messages;

  const MAX_CHARS = 5000; // reduced from 20000 to shrink prompt size
  for (const f of files) {
    const name = f.originalname || 'attachment';
    const type = f.mimetype || 'application/octet-stream';
    const ext = (name.split('.').pop() || '').toLowerCase();
    const isTextLike = (type || '').startsWith('text/')
      || /(json|xml|yaml|yml|csv|markdown|md|html)/i.test(type || '')
      || /(txt|md|json|csv|html|xml|yaml|yml)$/i.test(ext || '');
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

// Centralized prompt-related constants
const RECENT_MESSAGE_COUNT = config.prompt.recentMessageCount;
const RAG_TOP_K = config.prompt.ragTopK;
const RETRIEVAL_CHUNK_MAX_CHARS = config.prompt.retrievalChunkMaxChars;
const PROMPT_CHAR_BUDGET = config.prompt.promptCharBudget;
const MAX_HISTORY_CHARS = config.prompt.maxHistoryChars; // proactive cap before total budget
const COMPRESSED_RECENT_CHARS = config.prompt.compressedRecentChars; // per compressed recent message
const SUMMARY_CAP_CHARS = config.prompt.summaryCapChars;



export async function streamAssistantTextWithMemory({ pb, conversationId, prompt, files = [], userInstruction }) {
  const { apiKey, model, baseUrl } = config.openrouter;

  const systemPrompt = buildSystemPrompt(userInstruction);

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
    new MessagesPlaceholder("input_messages"),
  ]);

  const chatModel = new ChatOpenAI({
    apiKey,
    model,
    configuration: {
      baseURL: baseUrl,
      defaultHeaders: {
        'HTTP-Referer': config.appBaseUrl,
        'X-Title': 'Thirra AI',
      },
    },
  });

  const embeddings = getEmbeddingsClient();
  await ensureIndexedForConversation({ pb, conversationId, embeddings, files });

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

  const chain = promptTemplate.pipe(chatModel);
  const baseHistory = await buildSummarizedHistory({ pb, conversationId, model: chatModel, instruction: userInstruction });

  const inputCharsCombined = inputMessages.reduce((acc, m) => acc + String(m.content || '').length, 0);
  const { historyMsgs } = applyPromptBudgetGuard({ baseHistory, inputMessages, prompt, PROMPT_CHAR_BUDGET, MAX_HISTORY_CHARS, COMPRESSED_RECENT_CHARS, SUMMARY_CAP_CHARS });


  let stream;
  try {
    stream = await chain.stream({ input_messages: inputMessages, history: historyMsgs });
  } catch (e) {
    if (String(e?.message || '').includes('401')) {
      console.warn('[LLM] Unauthorized; retrying stream with OpenRouter key...');
      stream = await chain.stream({ input_messages: inputMessages, history: historyMsgs });
    } else {
      throw e;
    }
  }

  async function* textChunks() {
    let promptTokens;
    let completionTokens;
    let totalTokens;
    for await (const chunk of stream) {
      const usage = chunk?.usage_metadata || chunk?.response_metadata?.usage || chunk?.response_metadata?.tokenUsage;
      if (usage) {
        promptTokens = usage?.input_tokens ?? usage?.promptTokens ?? promptTokens;
        completionTokens = usage?.output_tokens ?? usage?.completionTokens ?? completionTokens;
        totalTokens = usage?.total_tokens ?? usage?.totalTokens ?? ((promptTokens != null && completionTokens != null) ? (promptTokens + completionTokens) : totalTokens);
      }
      const c = chunk?.content;
      if (typeof c === 'string') {
        yield c;
      } else if (Array.isArray(c)) {
        const textParts = c.map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part.text === 'string') return part.text;
          return '';
        }).join('');
        if (textParts) yield textParts;
      } else {
        const t = String(c || '');
        if (t) yield t;
      }
    }
    if (promptTokens != null || completionTokens != null || totalTokens != null) {
      console.log(`[LLM Tokens/Stream] conv=${conversationId || 'new'} prompt=${promptTokens ?? 'n/a'} completion=${completionTokens ?? 'n/a'} total=${totalTokens ?? 'n/a'}`);
    }
  }

  return textChunks();
}