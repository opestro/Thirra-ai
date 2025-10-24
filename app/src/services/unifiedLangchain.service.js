import { ChatOpenAI } from "@langchain/openai";
import { applyPromptBudgetGuard } from "../utils/promptBudget.js";
import { buildCombinedMemory } from "../memory/memoryLayers.js";
import { collectInputMetrics, relevanceTokenRatio, heuristicQualityScore, logTuningMetrics } from "../utils/eval.js";
import { buildUnifiedSystemPrompt, parseUnifiedOutput, validateParsedOutput, fallbackParse } from "../utils/unifiedOutput.js";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import config from "../config/config.js";
import { extractAssignments } from "../utils/extractFacts.js";
import { upsertFacts, getFactsText } from "../memory/facts.store.js";

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
const PROMPT_CHAR_BUDGET = config.prompt.promptCharBudget;
const MAX_HISTORY_CHARS = config.prompt.maxHistoryChars;
const COMPRESSED_RECENT_CHARS = config.prompt.compressedRecentChars;
const SUMMARY_CAP_CHARS = config.prompt.summaryCapChars;
const MAX_CONTEXT_TOKENS = config.prompt.maxContextTokens;

/**
 * Stream unified assistant response with title, summary, and response in one call
 * @param {Object} params - { pb, conversationId, prompt, files, userInstruction, needsTitle }
 * @returns {AsyncGenerator} - Streaming generator with unified output parsing
 */
export async function streamUnifiedAssistantResponse({ pb, conversationId, prompt, files = [], userInstruction, needsTitle = false }) {
  const { apiKey, model, baseUrl } = config.openrouter;

  // Build layered memory
  const { historyMsgs: baseHistory, contextText: initialContext, metrics, items } = await buildCombinedMemory({ 
    pb, 
    conversationId, 
    query: prompt, 
    instruction: userInstruction 
  });

  // Extract and upsert facts from current prompt
  try {
    const facts = extractAssignments(String(prompt || ''));
    if (facts.length && conversationId) {
      upsertFacts(conversationId, facts);
    }
  } catch (_) {}

  const factsText = conversationId ? getFactsText(conversationId) : '';

  // Build unified system prompt
  const systemPrompt = buildUnifiedSystemPrompt({
    needsTitle,
    userInstruction,
    contextText: initialContext,
    factsText
  });

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

  // Assemble input messages: attachments + query
  let inputMessages = [
    ...buildAttachmentMessages(files),
    new HumanMessage(`QUERY: ${String(prompt)}`),
  ];

  // Apply history budget guard
  const { historyMsgs } = applyPromptBudgetGuard({ 
    baseHistory, 
    inputMessages, 
    prompt, 
    PROMPT_CHAR_BUDGET, 
    MAX_HISTORY_CHARS, 
    COMPRESSED_RECENT_CHARS, 
    SUMMARY_CAP_CHARS 
  });

  // Estimate token usage and prune context if exceeding 60% of max window
  let contextText = initialContext;
  const preMetrics = collectInputMetrics({ historyMsgs, contextText, inputMessages });
  const threshold = Math.floor(MAX_CONTEXT_TOKENS * 0.6);
  
  if (preMetrics.tokenEstimate > threshold && Array.isArray(items) && items.length > 0) {
    // Drop least relevant items until under threshold
    const sorted = [...items].sort((a, b) => a.sim - b.sim);
    let kept = [];
    for (const it of sorted.reverse()) { // keep from most to least
      kept.push(it);
      const ctx = kept.map(x => `- ${x.text}`).join('\n');
      const est = collectInputMetrics({ historyMsgs, contextText: ctx, inputMessages }).tokenEstimate;
      if (est > threshold) continue;
      contextText = ctx;
      break;
    }
    // If still over threshold, fall back to fewer items or empty context
    if (collectInputMetrics({ historyMsgs, contextText, inputMessages }).tokenEstimate > threshold) {
      const topOne = sorted.length ? `- ${sorted[sorted.length - 1].text}` : '';
      contextText = topOne;
    }
  }

  // Update system prompt with final context
  const finalSystemPrompt = buildUnifiedSystemPrompt({
    needsTitle,
    userInstruction,
    contextText,
    factsText
  });

  const finalPromptTemplate = ChatPromptTemplate.fromMessages([
    ["system", finalSystemPrompt],
    new MessagesPlaceholder("history"),
    new MessagesPlaceholder("input_messages"),
  ]);

  // Log pre-phase tuning metrics
  const relPerTok = relevanceTokenRatio({ items, tokenCount: preMetrics.tokenEstimate });
  logTuningMetrics({ phase: 'pre', inputMetrics: preMetrics, relevancePerToken: relPerTok, details: metrics });

  const chain = finalPromptTemplate.pipe(chatModel);

  let stream;
  try {
    stream = await chain.stream({ history: historyMsgs, input_messages: inputMessages });
  } catch (e) {
    if (String(e?.message || '').includes('401')) {
      console.warn('[LLM] Unauthorized; retrying stream with OpenRouter key...');
      stream = await chain.stream({ history: historyMsgs, input_messages: inputMessages });
    } else {
      throw e;
    }
  }

  // Expose usage counters across the generator lifecycle
  let promptTokens;
  let completionTokens;
  let totalTokens;
  let rawOutput = '';

  async function* unifiedTextChunks() {
    for await (const chunk of stream) {
      const usage = chunk?.usage_metadata || chunk?.response_metadata?.usage || chunk?.response_metadata?.tokenUsage;
      if (usage) {
        promptTokens = usage?.input_tokens ?? usage?.promptTokens ?? promptTokens;
        completionTokens = usage?.output_tokens ?? usage?.completionTokens ?? completionTokens;
        totalTokens = usage?.total_tokens ?? usage?.totalTokens ?? ((promptTokens != null && completionTokens != null) ? (promptTokens + completionTokens) : totalTokens);
      }
      
      const c = chunk?.content;
      let chunkText = '';
      
      if (typeof c === 'string') {
        chunkText = c;
      } else if (Array.isArray(c)) {
        chunkText = c.map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part.text === 'string') return part.text;
          return '';
        }).join('');
      } else {
        chunkText = String(c || '');
      }
      
      if (chunkText) {
        rawOutput += chunkText;
        yield chunkText;
      }
    }
    
    if (promptTokens != null || completionTokens != null || totalTokens != null) {
      console.log(`[LLM Tokens/Unified] conv=${conversationId || 'new'} prompt=${promptTokens ?? 'n/a'} completion=${completionTokens ?? 'n/a'} total=${totalTokens ?? 'n/a'}`);
      // Post-phase metrics
      logTuningMetrics({ 
        phase: 'post', 
        inputMetrics: preMetrics, 
        relevancePerToken: relPerTok, 
        outputTokens: totalTokens, 
        details: { contextPruned: contextText.length, unified: true } 
      });
    }
  }

  const gen = unifiedTextChunks();
  
  // Enhanced methods for unified output
  gen.getUsage = () => ({ promptTokens, completionTokens, totalTokens });
  gen.computeQualityScore = (text) => heuristicQualityScore(text);
  
  // Parse unified output when stream completes
  gen.parseOutput = () => {
    const parsed = parseUnifiedOutput(rawOutput);
    const validation = validateParsedOutput(parsed, needsTitle);
    
    if (!validation.isValid) {
      console.warn('[Unified] Primary parsing failed, attempting fallback:', validation.missingFields);
      const fallback = fallbackParse(rawOutput, needsTitle);
      return {
        ...fallback,
        validation,
        usedFallback: true
      };
    }
    
    return {
      ...parsed,
      validation,
      usedFallback: false
    };
  };
  
  // Get raw output for debugging
  gen.getRawOutput = () => rawOutput;
  
  return gen;
}

/**
 * Generate title only (for backward compatibility)
 * @param {string} prompt - User prompt to generate title from
 * @returns {Promise<string>} - Generated title
 */
export async function generateTitleFromPrompt(prompt) {
  const { apiKey, model, baseUrl } = config.openrouter;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Generate a concise conversation title (4–6 words). Respond ONLY with the title, no quotes.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(text || resp.statusText || 'OpenRouter request failed');
    err.status = resp.status || 502;
    throw err;
  }
  
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const title = typeof content === 'string' ? content : JSON.stringify(content);
  return String(title).trim().slice(0, 120) || 'New Conversation';
}