import { ChatOpenAI } from "@langchain/openai";
import config from "../config/config.js";

/**
 * Query classification categories for model routing
 */
export const QueryCategory = {
  CODING: 'coding',      // Programming, debugging, code review
  GENERAL: 'general',    // Simple questions, casual conversation
  HEAVY: 'heavy',        // Research, analysis, complex documents
};

/**
 * Classify user query to determine optimal model
 * Uses a lightweight classifier for fast, cheap routing
 */
export async function classifyQuery(query, conversationHistory = []) {
  const { apiKey, baseUrl, models } = config.openrouter;
  
  // Create lightweight classifier
  const classifier = new ChatOpenAI({
    model: models.classifier,
    temperature: 0,
    maxTokens: 50,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: baseUrl,
    },
  });

  // Build context from recent history (last 2 messages for efficiency)
  const recentContext = conversationHistory.slice(-2).map(msg => 
    `${msg._getType()}: ${msg.content}`
  ).join('\n');

  const classificationPrompt = `Classify this user query into ONE category:

Categories:
- coding: Programming questions, debugging, code review, technical implementation, algorithms, software development
- general: Simple questions, greetings, casual conversation, basic information, small talk
- heavy: Research tasks, document creation (resumes, reports), complex analysis, detailed explanations, multi-step reasoning

Context from conversation:
${recentContext || 'No prior context'}

User query: "${query}"

Respond with ONLY the category name (coding, general, or heavy).`;

  try {
    const response = await classifier.invoke(classificationPrompt);
    const category = response.content.trim().toLowerCase();
    
    // Validate and default to general if invalid
    if (Object.values(QueryCategory).includes(category)) {
      return category;
    }
    
    console.warn(`Invalid classification: ${category}, defaulting to general`);
    return QueryCategory.GENERAL;
  } catch (error) {
    console.error('Classification error:', error.message);
    // Fallback: simple heuristics
    return fallbackClassification(query);
  }
}

/**
 * Fallback classification using simple keyword matching
 * Used when LLM classification fails
 */
function fallbackClassification(query) {
  const lowerQuery = query.toLowerCase();
  
  // Coding keywords
  const codingKeywords = [
    'code', 'program', 'function', 'debug', 'error', 'bug', 'implement',
    'algorithm', 'javascript', 'python', 'java', 'react', 'api', 'database',
    'class', 'method', 'variable', 'syntax', 'compile', 'runtime'
  ];
  
  // Heavy work keywords
  const heavyKeywords = [
    'research', 'analyze', 'resume', 'cv', 'report', 'document', 'thesis',
    'essay', 'detailed', 'comprehensive', 'in-depth', 'investigate', 'compare',
    'evaluate', 'assessment', 'proposal', 'presentation'
  ];
  
  // Check for coding
  if (codingKeywords.some(keyword => lowerQuery.includes(keyword))) {
    return QueryCategory.CODING;
  }
  
  // Check for heavy work
  if (heavyKeywords.some(keyword => lowerQuery.includes(keyword))) {
    return QueryCategory.HEAVY;
  }
  
  // Default to general
  return QueryCategory.GENERAL;
}

/**
 * Select optimal model based on query category
 * Returns { model, reasoning }
 */
export function selectModelForCategory(category) {
  const { models } = config.openrouter;
  
  const modelMap = {
    [QueryCategory.CODING]: {
      model: models.coding,
      reasoning: 'Coding task detected - using Claude for superior code quality'
    },
    [QueryCategory.GENERAL]: {
      model: models.general,
      reasoning: 'General query detected - using cost-effective DeepSeek'
    },
    [QueryCategory.HEAVY]: {
      model: models.heavy,
      reasoning: 'Heavy work detected - using GPT-4 for complex reasoning'
    },
  };
  
  return modelMap[category] || {
    model: models.general,
    reasoning: 'Unknown category - defaulting to general model'
  };
}

/**
 * Main routing function: classify query and select model
 * Returns { model, category, reasoning }
 */
export async function routeQuery(query, conversationHistory = []) {
  const startTime = Date.now();
  
  // Classify query
  const category = await classifyQuery(query, conversationHistory);
  
  // Select model
  const { model, reasoning } = selectModelForCategory(category);
  
  const routingTime = Date.now() - startTime;
  
  // Log routing decision
  console.log('🔀 Query Router:', {
    category,
    model,
    reasoning,
    routingTime: `${routingTime}ms`,
    queryPreview: query.substring(0, 50) + (query.length > 50 ? '...' : '')
  });
  
  return {
    model,
    category,
    reasoning,
    routingTime
  };
}

/**
 * Estimate cost savings from routing
 * (Simplified - actual costs vary by provider)
 */
export function estimateCostSavings(category, tokenCount) {
  // Rough cost estimates (per 1M tokens)
  const costs = {
    [QueryCategory.CODING]: 3.0,  // Claude Sonnet
    [QueryCategory.GENERAL]: 0.14, // DeepSeek (very cheap)
    [QueryCategory.HEAVY]: 5.0,    // GPT-4
  };
  
  const baselineCost = 3.0; // If we used expensive model for everything
  const actualCost = costs[category] || costs[QueryCategory.GENERAL];
  
  const baselinePrice = (baselineCost * tokenCount) / 1_000_000;
  const actualPrice = (actualCost * tokenCount) / 1_000_000;
  const savings = baselinePrice - actualPrice;
  const savingsPercent = ((savings / baselinePrice) * 100).toFixed(1);
  
  return {
    category,
    baselinePrice: `$${baselinePrice.toFixed(6)}`,
    actualPrice: `$${actualPrice.toFixed(6)}`,
    savings: `$${savings.toFixed(6)}`,
    savingsPercent: `${savingsPercent}%`
  };
}

