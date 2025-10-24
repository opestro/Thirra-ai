import { getShortTermMemory } from '../memory/memoryLayers.js';
import config from '../config/config.js';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

// Stub PocketBase client
const pb = {
  collection() {
    return {
      async getFullList() {
        // Build 10 alternating user/assistant turns
        const turns = [];
        for (let i = 0; i < 10; i++) {
          turns.push({ user_text: `User msg ${i+1}` });
          turns.push({ assistant_text: `Assistant msg ${i+1}` });
        }
        return turns;
      },
    };
  },
};

async function run() {
  const kConfigured = config.prompt.recentMessageCount;
  console.log('Configured RECENT_MESSAGE_COUNT =', kConfigured);
  const short = await getShortTermMemory({ pb, conversationId: 'demo' });
  console.log('Short-term messages returned =', short.length);
  console.log('First type:', short[0] instanceof HumanMessage ? 'Human' : (short[0] instanceof AIMessage ? 'AI' : 'System'));
  console.log('Last message sample:', String(short[short.length - 1].content));
  const ok = short.length === kConfigured;
  console.log(ok ? '✅ Short-term length matches configuration' : '❌ Mismatch with configuration');
}

run().catch(err => {
  console.error('Error running testMemoryConfig:', err);
  process.exit(1);
});