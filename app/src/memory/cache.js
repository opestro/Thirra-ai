/**
 * Memory caching layer to avoid redundant DB calls and computations
 * 
 * Caches:
 * - Conversation turns (avoid 3× DB calls)
 * - Summaries (avoid regenerating every turn)
 */

// Turn cache: conversationId -> { turns, timestamp }
const turnsCache = new Map();
const TURNS_CACHE_TTL = 30000; // 30 seconds

// Summary cache: conversationId -> { summary, turnCount, timestamp }
const summaryCache = new Map();
const SUMMARY_CACHE_TTL = 120000; // 2 minutes

/**
 * Get cached turns or fetch from database
 */
export async function getCachedTurns(pb, conversationId) {
  if (!conversationId) return [];
  
  const now = Date.now();
  const cached = turnsCache.get(conversationId);
  
  // Return cached if still valid
  if (cached && (now - cached.timestamp) < TURNS_CACHE_TTL) {
    return cached.turns;
  }
  
  // Fetch from database
  const turns = await pb.collection("turns").getFullList(500, {
    filter: `conversation = "${conversationId}"`,
    sort: "created",
  });
  
  // Cache for next time
  turnsCache.set(conversationId, {
    turns,
    timestamp: now,
  });
  
  return turns;
}

/**
 * Get cached summary or generate new one
 */
export async function getCachedSummary(conversationId, currentTurnCount, generateFn) {
  if (!conversationId || currentTurnCount <= 5) return null;
  
  const cached = summaryCache.get(conversationId);
  
  // Return cached if turn count hasn't changed much
  if (cached && Math.abs(cached.turnCount - currentTurnCount) < 2) {
    return cached.summary;
  }
  
  // Generate new summary
  const summary = await generateFn();
  
  if (summary) {
    summaryCache.set(conversationId, {
      summary,
      turnCount: currentTurnCount,
      timestamp: Date.now(),
    });
  }
  
  return summary;
}

/**
 * Invalidate cache when new turn is added
 */
export function invalidateTurnCache(conversationId) {
  turnsCache.delete(conversationId);
  // Note: We keep summary cache - it's still valid for 1-2 new turns
}

/**
 * Clear all caches (for testing or memory management)
 */
export function clearAllCaches() {
  turnsCache.clear();
  summaryCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    turns: {
      size: turnsCache.size,
      entries: Array.from(turnsCache.entries()).map(([id, data]) => ({
        conversationId: id,
        turnCount: data.turns.length,
        age: Date.now() - data.timestamp,
      })),
    },
    summaries: {
      size: summaryCache.size,
      entries: Array.from(summaryCache.entries()).map(([id, data]) => ({
        conversationId: id,
        turnCount: data.turnCount,
        age: Date.now() - data.timestamp,
      })),
    },
  };
}

