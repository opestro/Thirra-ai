/**
 * Token Budget Management - Keep costs low
 * 
 * Strategies:
 * 1. Compress older messages
 * 2. Truncate long messages
 * 3. Remove repetitive content
 * 4. Prioritize recent context
 */

import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

// Approximate token estimation (4 chars ≈ 1 token)
function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

// Get total tokens from messages
function getTotalTokens(messages) {
  return messages.reduce((sum, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return sum + estimateTokens(content);
  }, 0);
}

/**
 * Compress message content to target percentage
 */
function compressMessage(content, targetRatio = 0.3) {
  const text = String(content);
  const targetLength = Math.floor(text.length * targetRatio);
  
  if (text.length <= targetLength) return text;
  
  // Keep first and last parts, summarize middle
  const keepStart = Math.floor(targetLength * 0.6);
  const keepEnd = Math.floor(targetLength * 0.4);
  
  return text.slice(0, keepStart) + ' [...] ' + text.slice(-keepEnd);
}

/**
 * Apply token budget to message history
 * 
 * @param {Array} messages - Message array
 * @param {Object} options - Budget options
 * @returns {Array} - Optimized messages
 */
export function applyTokenBudget(messages, options = {}) {
  const {
    maxTokens = 2000,        // Maximum tokens for history
    recentCount = 4,          // Keep last N messages uncompressed
    compressionRatio = 0.3,   // Compress older messages to 30%
    maxMessageTokens = 500,   // Max tokens per message
  } = options;
  
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }
  
  // Split into recent (keep) and older (compress)
  const recentMessages = messages.slice(-recentCount);
  const olderMessages = messages.slice(0, -recentCount);
  
  // Compress older messages
  const compressedOlder = olderMessages.map(msg => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const tokens = estimateTokens(content);
    
    if (tokens > maxMessageTokens) {
      const compressed = compressMessage(content, compressionRatio);
      
      if (msg instanceof HumanMessage) {
        return new HumanMessage(compressed);
      } else if (msg instanceof AIMessage) {
        return new AIMessage(compressed);
      } else {
        return new SystemMessage(compressed);
      }
    }
    
    return msg;
  });
  
  // Truncate recent messages if they're too long
  const truncatedRecent = recentMessages.map(msg => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const tokens = estimateTokens(content);
    
    if (tokens > maxMessageTokens * 2) { // Allow recent to be longer
      const targetLength = Math.floor(content.length * 0.6);
      const truncated = content.slice(0, targetLength) + ' [...]';
      
      if (msg instanceof HumanMessage) {
        return new HumanMessage(truncated);
      } else if (msg instanceof AIMessage) {
        return new AIMessage(truncated);
      } else {
        return new SystemMessage(truncated);
      }
    }
    
    return msg;
  });
  
  // Combine and check total
  let combined = [...compressedOlder, ...truncatedRecent];
  let totalTokens = getTotalTokens(combined);
  
  // If still over budget, drop oldest messages
  while (totalTokens > maxTokens && combined.length > recentCount) {
    combined.shift(); // Remove oldest
    totalTokens = getTotalTokens(combined);
  }
  
  // Final safety: if still over, keep only recent
  if (totalTokens > maxTokens) {
    combined = truncatedRecent;
    totalTokens = getTotalTokens(combined);
    
    // Last resort: truncate recent messages more aggressively
    if (totalTokens > maxTokens) {
      combined = truncatedRecent.map(msg => {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const targetLength = Math.floor((content.length * maxTokens) / totalTokens);
        const truncated = content.slice(0, targetLength) + ' [...]';
        
        if (msg instanceof HumanMessage) {
          return new HumanMessage(truncated);
        } else if (msg instanceof AIMessage) {
          return new AIMessage(truncated);
        } else {
          return new SystemMessage(truncated);
        }
      });
    }
  }
  
  return combined;
}

/**
 * Smart deduplication - remove repetitive content
 */
export function deduplicateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 2) {
    return messages;
  }
  
  const seen = new Set();
  const deduplicated = [];
  
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const normalized = content.toLowerCase().trim().slice(0, 100); // First 100 chars as signature
    
    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduplicated.push(msg);
    }
  }
  
  return deduplicated;
}

/**
 * Get cost-optimized history
 */
export function getCostOptimizedHistory(messages, maxTokens = 2000) {
  // 1. Deduplicate
  let optimized = deduplicateMessages(messages);
  
  // 2. Apply token budget
  optimized = applyTokenBudget(optimized, {
    maxTokens,
    recentCount: 4,
    compressionRatio: 0.3,
    maxMessageTokens: 500,
  });
  
  return optimized;
}

/**
 * Estimate and log token usage
 */
export function logTokenUsage(label, messages) {
  const tokens = getTotalTokens(messages);
  console.log(`[Token Budget] ${label}: ~${tokens} tokens (${messages.length} messages)`);
  return tokens;
}

