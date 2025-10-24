/**
 * Evaluation hooks for tuning context efficiency.
 */

/** Approximate tokens by characters / 4 (UTF-8 heuristic). */
export function estimateTokensFromChars(charCount) {
  return Math.max(1, Math.floor(charCount / 4));
}

/**
 * Compute input token estimate across history, context, and input messages.
 */
export function collectInputMetrics({ historyMsgs = [], contextText = "", inputMessages = [] }) {
  const historyChars = historyMsgs.reduce((acc, m) => acc + String(m?.content || "").length, 0);
  const contextChars = String(contextText || "").length;
  const inputChars = inputMessages.reduce((acc, m) => acc + String(m?.content || "").length, 0);
  const totalChars = historyChars + contextChars + inputChars;
  const tokenEstimate = estimateTokensFromChars(totalChars);
  return { historyChars, contextChars, inputChars, totalChars, tokenEstimate };
}

/**
 * relevance/token ratio based on similarity scores and token count.
 */
export function relevanceTokenRatio({ items = [], tokenCount }) {
  const relevanceSum = items.reduce((acc, it) => acc + (Number(it.sim) || 0), 0);
  const t = Math.max(1, Number(tokenCount) || 1);
  return relevanceSum / t;
}

/**
 * Simple quality heuristic for coherence/factuality.
 */
export function heuristicQualityScore(text) {
  const s = String(text || "");
  const sentences = s.split(/[.!?]+\s+/).filter(Boolean);
  const avgLen = sentences.length ? (s.length / sentences.length) : s.length;
  const hasNumbers = /\d/.test(s) ? 1 : 0;
  const hasLinks = /(https?:\/\/|www\.)/.test(s) ? 1 : 0;
  const repetitionPenalty = /(\b\w+\b)(?:\s+\1){2,}/i.test(s) ? -0.5 : 0;
  const score = Math.max(0, Math.min(1, (hasNumbers * 0.2 + hasLinks * 0.2 + (avgLen > 60 ? 0.2 : 0.1) + repetitionPenalty + 0.5)));
  return score;
}

/**
 * Log metrics for tuning.
 */
export function logTuningMetrics({ phase, inputMetrics, relevancePerToken, outputTokens, qualityScore, details = {} }) {
  const msg = {
    phase,
    input_token_estimate: inputMetrics?.tokenEstimate ?? 'n/a',
    input_char_total: inputMetrics?.totalChars ?? 'n/a',
    relevance_per_token: relevancePerToken ?? 'n/a',
    output_tokens: outputTokens ?? 'n/a',
    quality_score: qualityScore ?? 'n/a',
    details,
  };
  // eslint-disable-next-line no-console
  console.log('[Memory/Tuning]', JSON.stringify(msg));
}