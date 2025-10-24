// Utility to extract simple assignments from user text
// Supports patterns: x=90, x : 90, x is 90, value of x is 90, set x to 90

function pushFact(arr, key, value) {
  const k = String(key || '').trim();
  const v = String(value ?? '').trim();
  if (!k || !v) return;
  arr.push({ key: k, value: v });
}

export function extractAssignments(input) {
  const text = String(input || '');
  if (!text) return [];
  const facts = [];

  // Pattern: key = value
  const eqRe = /\b([A-Za-z_][\w.-]*)\s*=\s*(["']?)([^\s"']+)\2\b/g;
  let m;
  while ((m = eqRe.exec(text)) !== null) {
    pushFact(facts, m[1], m[3]);
  }

  // Pattern: key : value
  const colonRe = /\b([A-Za-z_][\w.-]*)\s*:\s*(["']?)([^\s"']+)\2\b/g;
  while ((m = colonRe.exec(text)) !== null) {
    pushFact(facts, m[1], m[3]);
  }

  // Pattern: (value of )key is value
  const isRe = /\b(?:value\s+of\s+)?([A-Za-z_][\w.-]*)\s+is\s+(["']?)([^\s"']+)\2\b/gi;
  while ((m = isRe.exec(text)) !== null) {
    pushFact(facts, m[1], m[3]);
  }

  // Pattern: set key to value
  const setRe = /\bset\s+([A-Za-z_][\w.-]*)\s+to\s+(["']?)([^\s"']+)\2\b/gi;
  while ((m = setRe.exec(text)) !== null) {
    pushFact(facts, m[1], m[3]);
  }

  // Deduplicate by latest occurrence per key (preserve order of last mentions)
  const latestPerKey = new Map();
  for (const f of facts) {
    latestPerKey.set(f.key.toLowerCase(), f.value);
  }
  const unique = Array.from(latestPerKey.entries()).map(([key, value]) => ({ key, value }));

  return unique;
}