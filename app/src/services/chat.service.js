import { invalidateTurnCache } from '../memory/cache.js';

export async function createConversation(req, title) {
  try {
    return await req.pb.collection('conversations').create({ title, owner: req.user.id });
  } catch (e) {
    const msg = e?.response?.message || e.message || 'Failed to create conversation';
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }
}

export async function getConversationMeta(req, conversationId) {
  try {
    const c = await req.pb.collection('conversations').getOne(conversationId);
    return { id: c.id, title: c.title, created: c.created, updated: c.updated };
  } catch {
    return { id: conversationId, title: 'Conversation', created: '', updated: '' };
  }
}

/**
 * Get conversation turns with tool calls
 */
export async function getConversationTurns(req, conversationId) {
  try {
    const turns = await req.pb.collection('turns').getFullList({
      filter: `conversation="${conversationId}"`,
      sort: 'created',
    });
    
    // Get tool calls for all turns
    const turnIds = turns.map(t => t.id);
    let toolCallsByTurn = {};
    
    if (turnIds.length > 0) {
      const toolCalls = await req.pb.collection('tool_calls').getFullList({
        filter: turnIds.map(id => `turn="${id}"`).join(' || '),
        sort: 'created',
      });
      
      // Group by turn
      toolCalls.forEach(tc => {
        if (!toolCallsByTurn[tc.turn]) {
          toolCallsByTurn[tc.turn] = [];
        }
        
        // PocketBase JSON fields are already parsed objects
        const parseIfNeeded = (value, fallback = null) => {
          if (!value) return fallback;
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch {
              return fallback;
            }
          }
          return value; // Already an object
        };
        
        toolCallsByTurn[tc.turn].push({
          id: tc.id,
          tool_name: tc.tool_name,
          tool_call_id: tc.tool_call_id,
          arguments: parseIfNeeded(tc.arguments, {}),
          result: parseIfNeeded(tc.result, null),
          status: tc.status,
          error: tc.error,
          external_id: tc.external_id,
          created: tc.created,
          updated: tc.updated,
        });
      });
    }
    
    // Format turns with tool calls
    return turns.map(turn => ({
      id: turn.id,
      user_text: turn.user_text,
      assistant_text: turn.assistant_text,
      user_attachments: turn.user_attachments || [],
      assistant_attachments: turn.assistant_attachments || [],
      prompt_tokens: turn.prompt_tokens || 0,
      completion_tokens: turn.completion_tokens || 0,
      total_tokens: turn.total_tokens || 0,
      created: turn.created,
      updated: turn.updated,
      tool_calls: toolCallsByTurn[turn.id] || [],
    }));
  } catch (error) {
    console.error('[Chat Service] Error fetching turns:', error);
    throw error;
  }
}

export async function createTurn(req, { conversationId, prompt, assistantText, files = [], assistantAttachments = [], usage = {} }) {
  const hasUserFiles = Array.isArray(files) && files.length > 0;
  const hasAssistantFiles = Array.isArray(assistantAttachments) && assistantAttachments.length > 0;

  const promptTokens = Number(usage?.promptTokens ?? 0) || 0;
  const completionTokens = Number(usage?.completionTokens ?? 0) || 0;
  const totalTokens = Number(usage?.totalTokens ?? (promptTokens + completionTokens)) || 0;

  if (hasUserFiles || hasAssistantFiles) {
    const form = new FormData();
    form.append('conversation', conversationId);
    form.append('user_text', prompt);
    form.append('assistant_text', assistantText);
    if (promptTokens) form.append('prompt_tokens', String(promptTokens));
    if (completionTokens) form.append('completion_tokens', String(completionTokens));
    if (totalTokens) form.append('total_tokens', String(totalTokens));

    // user attachments
    if (hasUserFiles) {
      for (const f of files) {
        const blob = new Blob([f.buffer], { type: f.mimetype || 'application/octet-stream' });
        form.append('user_attachments', blob, f.originalname || 'upload.bin');
      }
    }

    // assistant attachments
    if (hasAssistantFiles) {
      for (const a of assistantAttachments) {
        const blob = new Blob([a.buffer], { type: a.mimeType || 'application/octet-stream' });
        form.append('assistant_attachments', blob, a.filename || 'assistant.bin');
      }
    }

    const turn = await req.pb.collection('turns').create(form);
    await updateUsageAggregates(req, { conversationId, promptTokens, completionTokens, totalTokens });
    
    // Invalidate cache after new turn
    invalidateTurnCache(conversationId);
    
    return turn;
  }

  const payload = {
    conversation: conversationId,
    user_text: prompt,
    assistant_text: assistantText,
  };
  if (promptTokens) payload.prompt_tokens = promptTokens;
  if (completionTokens) payload.completion_tokens = completionTokens;
  if (totalTokens) payload.total_tokens = totalTokens;

  const turn = await req.pb.collection('turns').create(payload);
  await updateUsageAggregates(req, { conversationId, promptTokens, completionTokens, totalTokens });
  
  // Invalidate cache after new turn
  invalidateTurnCache(conversationId);
  
  return turn;
}

async function updateUsageAggregates(req, { conversationId, promptTokens = 0, completionTokens = 0, totalTokens = 0 }) {
  try {
    // Update conversation totals
    const conv = await req.pb.collection('conversations').getOne(conversationId);
    const newConvTotals = {
      prompt_tokens_total: Number(conv?.prompt_tokens_total ?? 0) + (promptTokens || 0),
      completion_tokens_total: Number(conv?.completion_tokens_total ?? 0) + (completionTokens || 0),
      total_tokens: Number(conv?.total_tokens ?? 0) + (totalTokens || 0),
    };
    await req.pb.collection('conversations').update(conversationId, newConvTotals);
  } catch (e) {
    console.warn('[Usage] Failed to update conversation totals:', e?.message || e);
  }

  try {
    // Update user totals
    const userId = req.user?.id;
    if (userId) {
      const user = await req.pb.collection('users').getOne(userId);
      const newUserTotals = {
        tokens_total: Number(user?.tokens_total ?? 0) + (totalTokens || 0),
      };
      await req.pb.collection('users').update(userId, newUserTotals);
    }
  } catch (e) {
    console.warn('[Usage] Failed to update user totals:', e?.message || e);
  }
}