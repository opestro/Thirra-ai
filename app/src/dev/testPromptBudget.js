import { applyPromptBudgetGuard } from '../utils/promptBudget.js';
import config from '../config/config.js';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

function makeText(len, char='x') {
  return Array(len).fill(char).join('');
}

async function run() {
  const MAX_HISTORY_CHARS = config.prompt.maxHistoryChars;
  const COMPRESSED_RECENT_CHARS = config.prompt.compressedRecentChars;
  const PROMPT_CHAR_BUDGET = config.prompt.promptCharBudget;
  const SUMMARY_CAP_CHARS = config.prompt.summaryCapChars;

  console.log('Config:', { MAX_HISTORY_CHARS, COMPRESSED_RECENT_CHARS, PROMPT_CHAR_BUDGET, SUMMARY_CAP_CHARS });

  // Build base history with large messages to force compression
  const baseHistory = [
    new SystemMessage('Earlier conversation summary (compact): ' + makeText(800, 'A')),
    new HumanMessage(makeText(700, 'U')),
    new AIMessage(makeText(700, 'R')),
    new HumanMessage(makeText(700, 'U')),
    new AIMessage(makeText(700, 'R')),
    new HumanMessage(makeText(700, 'U')),
  ];

  const inputMessages = [ new HumanMessage('QUERY: demo prompt') ];

  const { historyMsgs } = applyPromptBudgetGuard({
    baseHistory,
    inputMessages,
    prompt: 'demo prompt',
    PROMPT_CHAR_BUDGET,
    MAX_HISTORY_CHARS,
    COMPRESSED_RECENT_CHARS,
    SUMMARY_CAP_CHARS,
  });

  const totalChars = historyMsgs.reduce((acc, m) => acc + String(m.content || '').length, 0);
  console.log('History message count:', historyMsgs.length);
  console.log('Total chars after guard:', totalChars);
  console.log('Messages:');
  historyMsgs.forEach((m, i) => {
    const role = m instanceof HumanMessage ? 'human' : (m instanceof AIMessage ? 'assistant' : 'system');
    const sample = String(m.content || '').slice(0, 80).replace(/\n/g, ' ');
    console.log(`  ${i+1}. [${role}] ${sample}${sample.length >= 80 ? '...' : ''}`);
  });
}

run().catch(err => {
  console.error('Error running testPromptBudget:', err);
  process.exit(1);
});