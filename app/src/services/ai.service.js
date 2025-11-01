/**
 * Clean AI Service - Unified LangChain Integration
 * 
 * Handles AI responses with memory and RAG support
 * Simplified from multiple service files into one clean implementation
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage } from "@langchain/core/messages";
import { buildCombinedMemory } from "../memory/memoryLayers.js";
import { extractAssignments } from "../utils/extractFacts.js";
import { upsertFacts, getFactsText } from "../memory/facts.store.js";
import { getCostOptimizedHistory, logTokenUsage } from "../utils/tokenBudget.js";
import { routeQuery, estimateCostSavings } from "../utils/queryRouter.js";
import config from "../config/config.js";

/**
 * Build system prompt with context and facts
 */
function buildSystemPrompt({ userInstruction, contextText, factsText }) {
  let prompt = "You are a helpful AI assistant. ";
  
  if (contextText) {
    prompt += "Use this context if relevant:\n" + contextText + "\n\n";
  }
  
  if (factsText) {
    prompt += "Remember these facts:\n" + factsText + "\n\n";
  }
  
  if (userInstruction) {
    prompt += "User preference: " + userInstruction + "\n\n";
  }
  
  prompt += "Provide clear, concise, and helpful responses.";
  
  return prompt;
}

/**
 * Process file attachments into messages
 */
function processAttachments(files = []) {
  const messages = [];
  const MAX_CHARS = 5000;
  
  if (!Array.isArray(files) || files.length === 0) return messages;
  
  for (const file of files) {
    const name = file.originalname || 'attachment';
    const type = file.mimetype || 'application/octet-stream';
    const ext = (name.split('.').pop() || '').toLowerCase();
    
    const isText = (type || '').startsWith('text/') ||
      /(json|xml|yaml|csv|markdown|html)/.test(type) ||
      /(txt|md|json|csv|html|xml|yaml)$/.test(ext);
    
    if (isText) {
      try {
        let content = Buffer.from(file.buffer).toString('utf-8');
        if (content.length > MAX_CHARS) {
          content = content.slice(0, MAX_CHARS) + '\n[...truncated...]';
        }
        messages.push(new HumanMessage(`File: ${name}\n---\n${content}`));
      } catch (_) {
        messages.push(new HumanMessage(`File: ${name} (could not read)`));
      }
    } else {
      messages.push(new HumanMessage(`File: ${name} (binary file)`));
    }
  }
  
  return messages;
}

/**
 * Stream AI response with memory and RAG
 */
export async function streamAIResponse({
  pb,
  conversationId,
  prompt,
  files = [],
  userInstruction = null,
}) {
  const { apiKey, baseUrl } = config.openrouter;
  
  // Build memory (short-term + summary + semantic RAG)
  const { historyMsgs, contextText } = await buildCombinedMemory({
    pb,
    conversationId,
    query: prompt,
    instruction: userInstruction,
  });
  
  // Apply cost optimization to history
  const maxHistoryTokens = config.prompt.maxHistoryTokens || 2000;
  const optimizedHistory = getCostOptimizedHistory(historyMsgs, maxHistoryTokens);
  
  logTokenUsage('Before optimization', historyMsgs);
  logTokenUsage('After optimization', optimizedHistory);
  
  // 🔀 INTELLIGENT ROUTING: Select optimal model based on query
  const { model, category, reasoning } = await routeQuery(prompt, optimizedHistory);
  console.log(`[Router] Selected ${model} for ${category} task: ${reasoning}`);
  
  // Extract and store facts from prompt
  try {
    const facts = extractAssignments(String(prompt || ''));
    if (facts.length && conversationId) {
      upsertFacts(conversationId, facts);
    }
  } catch (_) {}
  
  const factsText = conversationId ? getFactsText(conversationId) : '';
  
  // Build prompt template
  const systemPrompt = buildSystemPrompt({ userInstruction, contextText, factsText });
  
  const template = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
    new MessagesPlaceholder("input_messages"),
  ]);
  
  // Create model
  const llm = new ChatOpenAI({
    apiKey,
    model,
    temperature: 0.7,
    maxTokens: config.prompt.maxOutputTokens || 2048,
    configuration: {
      baseURL: baseUrl,
      defaultHeaders: {
        'HTTP-Referer': config.appBaseUrl,
        'X-Title': 'Thirra AI',
      },
    },
  });
  
  // Prepare input messages
  const inputMessages = [
    ...processAttachments(files),
    new HumanMessage(String(prompt)),
  ];
  
  // Create chain and stream with optimized history
  const chain = template.pipe(llm);
  const stream = await chain.stream({
    history: optimizedHistory, // Use cost-optimized history
    input_messages: inputMessages,
  });
  
  // Track usage and reasoning
  let promptTokens;
  let completionTokens;
  let totalTokens;
  let reasoningTokens;
  let isReasoning = false;
  let hasStartedOutput = false;
  
  // Detect reasoning models upfront by model name
  const isKnownReasoningModel = /gpt-5|o1-preview|o1-mini|o3|deepseek.*reason/i.test(model);
  
  async function* textGenerator() {
    // For known reasoning models, immediately signal reasoning phase
    if (isKnownReasoningModel) {
      isReasoning = true;
      console.log(`[AI] 🧠 Reasoning model detected: ${model} - expecting reasoning phase`);
      yield '___REASONING_START___';
    }
    
    for await (const chunk of stream) {
      // Extract usage metadata (including reasoning tokens)
      const usage = chunk?.usage_metadata || chunk?.response_metadata?.usage;
      if (usage) {
        promptTokens = usage?.input_tokens ?? usage?.promptTokens ?? promptTokens;
        completionTokens = usage?.output_tokens ?? usage?.completionTokens ?? completionTokens;
        totalTokens = usage?.total_tokens ?? usage?.totalTokens ?? totalTokens;
        
        // Track reasoning tokens (for o1/o3/gpt-5 models)
        const details = usage?.output_token_details || usage?.completion_tokens_details || {};
        const newReasoningTokens = details?.reasoning_tokens ?? details?.reasoning ?? 0;
        if (newReasoningTokens > (reasoningTokens || 0)) {
          reasoningTokens = newReasoningTokens;
        }
      }
      
      // Method 1: Check for reasoning contentBlocks (LangChain native)
      const contentBlocks = chunk?.contentBlocks || chunk?.content_blocks || [];
      const reasoningBlocks = contentBlocks.filter(block => block?.type === 'reasoning');
      const hasReasoningBlocks = reasoningBlocks.length > 0;
      
      // Method 2: Check for reasoning_details in metadata
      const hasReasoningDetails = chunk?.reasoning_details?.length > 0 || 
                                  chunk?.response_metadata?.reasoning_details?.length > 0;
      
      // Detect reasoning phase from chunk metadata (for unknown reasoning models)
      if ((hasReasoningBlocks || hasReasoningDetails) && !isReasoning) {
        isReasoning = true;
        console.log(`[AI] 🧠 Reasoning phase detected from chunk metadata`);
        yield '___REASONING_START___';
      }
      
      // Stream reasoning content (what the model is thinking)
      if (hasReasoningBlocks) {
        for (const reasoningBlock of reasoningBlocks) {
          const reasoningText = reasoningBlock?.reasoning || reasoningBlock?.text;
          if (reasoningText) {
            // Yield reasoning content with special marker
            yield `___REASONING_CONTENT___${reasoningText}___END_REASONING_CONTENT___`;
          }
        }
        continue; // Skip regular content processing
      }
      
      // Skip empty chunks during reasoning phase
      if (isReasoning && hasReasoningDetails) {
        continue;
      }
      
      // Extract text content (actual output)
      const content = chunk?.content;
      if (typeof content === 'string' && content) {
        if (isReasoning && !hasStartedOutput) {
          hasStartedOutput = true;
          console.log(`[AI] ✅ Reasoning complete (${reasoningTokens || 0} reasoning tokens), starting output`);
          yield '___REASONING_END___';
        }
        yield content;
      } else if (Array.isArray(content)) {
        const text = content.map(part => 
          typeof part === 'string' ? part : part?.text || ''
        ).join('');
        if (text) {
          if (isReasoning && !hasStartedOutput) {
            hasStartedOutput = true;
            console.log(`[AI] ✅ Reasoning complete (${reasoningTokens || 0} reasoning tokens), starting output`);
            yield '___REASONING_END___';
          }
          yield text;
        }
      }
    }
    
    if (totalTokens) {
      const logParts = [`[AI] Tokens - prompt: ${promptTokens}, completion: ${completionTokens}`];
      if (reasoningTokens) {
        logParts.push(`reasoning: ${reasoningTokens}`);
      }
      logParts.push(`total: ${totalTokens}`);
      console.log(logParts.join(', '));
      
      // Show cost savings from routing
      const savings = estimateCostSavings(category, totalTokens);
      console.log(`[Router] Cost Optimization:`, savings);
    }
  }
  
  const generator = textGenerator();
  
  // Attach usage getter (including reasoning tokens)
  generator.getUsage = () => ({
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens,
  });
  
  return generator;
}

/**
 * Generate conversation title
 */
export async function generateTitle(prompt) {
  try {
    const { apiKey, baseUrl, models } = config.openrouter;
    
    // Use lightweight model for title generation
    const model = models.lightweight;
    
    console.log(`[Title Generation] Using model: ${model}`);
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': config.appBaseUrl,
        'X-Title': 'Thirra AI',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Generate a concise 4-6 word conversation title. Return ONLY the title, no quotes or explanation.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 20,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Title Generation] Failed: ${response.status} - ${errorText}`);
      return 'New Conversation';
    }
   
    const data = await response.json();
    console.log(`[Title Generation] Response: ${JSON.stringify(data)}`);
    const title = data?.choices?.[0]?.message?.content || '';
    
    if (!title) {
      console.warn('[Title Generation] Empty response from API');
      return 'New Conversation';
    }
    
    const cleanTitle = String(title).trim().slice(0, 120);
    console.log(`[Title Generation] Generated: "${cleanTitle}"`);
    return cleanTitle;
  } catch (error) {
    console.error('[Title Generation] Error:', error.message);
    return 'New Conversation';
  }
}

