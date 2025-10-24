import { extractAssignments } from '../utils/extractFacts.js';
import { upsertFacts, getFactsText, getFacts, clearFacts } from '../memory/facts.store.js';
import { buildUnifiedSystemPrompt } from '../utils/unifiedOutput.js';

const convId = 'test-conv-123';

function log(label, value) {
  console.log(label + ':', typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

// 1) Extract simple assignments
const s1 = 'x=90';
const s2 = 'value of y is 123';
const s3 = 'set x to 42';
const s4 = 'z : "ready"';

log('Assignments from s1', extractAssignments(s1));
log('Assignments from s2', extractAssignments(s2));
log('Assignments from s3', extractAssignments(s3));
log('Assignments from s4', extractAssignments(s4));

// 2) Upsert into facts store
upsertFacts(convId, extractAssignments(s1));
upsertFacts(convId, extractAssignments(s2));
log('Facts after s1+s2', getFacts(convId));
log('FactsText after s1+s2', getFactsText(convId));

// 3) Update existing fact
upsertFacts(convId, extractAssignments(s3));
log('Facts after updating x', getFacts(convId));
log('FactsText after updating x', getFactsText(convId));

// 4) Add string value
upsertFacts(convId, extractAssignments(s4));
log('Facts after adding z', getFacts(convId));
log('FactsText after adding z', getFactsText(convId));

// 5) Build unified system prompt with facts
const prompt = buildUnifiedSystemPrompt({
  needsTitle: true,
  userInstruction: 'Remember known facts and be concise.',
  contextText: '- Context item A\n- Context item B',
  factsText: getFactsText(convId)
});

log('Unified System Prompt (snippet)', prompt.slice(0, 400) + '...');

// 6) Clear facts
clearFacts(convId);
log('Facts after clear', getFacts(convId));
log('FactsText after clear', getFactsText(convId));