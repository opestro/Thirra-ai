// Lightweight in-memory facts store keyed by conversationId
// Stores simple assignments like x=90 across turns within a conversation

const factsByConversation = new Map(); // conversationId -> Map<string, string>
const MAX_FACTS_PER_CONVERSATION = 50;

function normalizeKey(key) {
  return String(key || '').trim().toLowerCase();
}

export function upsertFacts(conversationId, facts = []) {
  if (!conversationId) return;
  if (!Array.isArray(facts) || facts.length === 0) return;
  let store = factsByConversation.get(conversationId);
  if (!store) {
    store = new Map();
    factsByConversation.set(conversationId, store);
  }
  for (const f of facts) {
    if (!f || !f.key) continue;
    const k = normalizeKey(f.key);
    const v = String(f.value ?? '').trim();
    if (!k || !v) continue;
    // Latest value wins
    store.set(k, v);
    // Bound size
    if (store.size > MAX_FACTS_PER_CONVERSATION) {
      // Remove oldest inserted key (Map iteration order)
      const firstKey = store.keys().next().value;
      if (firstKey != null) store.delete(firstKey);
    }
  }
}

export function getFacts(conversationId) {
  const store = conversationId ? factsByConversation.get(conversationId) : null;
  if (!store || store.size === 0) return [];
  return Array.from(store.entries()).map(([key, value]) => ({ key, value }));
}

export function getFactsText(conversationId) {
  const arr = getFacts(conversationId);
  if (!arr.length) return '';
  return arr.map(({ key, value }) => `${key}=${value}`).join('; ');
}

export function clearFacts(conversationId) {
  if (!conversationId) return;
  factsByConversation.delete(conversationId);
}

export function _debugGetStore() {
  return factsByConversation;
}