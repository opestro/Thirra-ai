/**
 * Tool Calls Service
 * 
 * Handles tool call creation and updates in PocketBase
 */

/**
 * Create tool call record
 */
export async function createToolCall(pb, { turnId, toolCall, result, externalId }) {
  try {
    const record = await pb.collection('tool_calls').create({
      turn: turnId,
      tool_name: toolCall.name,
      tool_call_id: toolCall.id,
      arguments: JSON.stringify(toolCall.args || {}),
      result: result ? JSON.stringify(result) : null,
      status: result ? 'completed' : 'processing',
      external_id: externalId || null,
      metadata: JSON.stringify({
        created_at: new Date().toISOString(),
        model: toolCall.model || null,
      }),
    });
    
    console.log(`[ToolCalls] Created record: ${record.id} for tool ${toolCall.name}`);
    return record;
  } catch (error) {
    console.error('[ToolCalls] Failed to create record:', error);
    throw error;
  }
}

/**
 * Update tool call with result
 */
export async function updateToolCallResult(pb, toolCallId, { result, status, error }) {
  try {
    const updates = {
      status: status || 'completed',
    };
    
    if (result) {
      updates.result = JSON.stringify(result);
    }
    
    if (error) {
      updates.error = error;
      updates.status = 'failed';
    }
    
    const record = await pb.collection('tool_calls').update(toolCallId, updates);
    console.log(`[ToolCalls] Updated record: ${toolCallId}`);
    return record;
  } catch (error) {
    console.error('[ToolCalls] Failed to update record:', error);
    throw error;
  }
}

/**
 * Find tool call by external ID (for webhooks)
 */
export async function findToolCallByExternalId(pb, externalId) {
  try {
    const record = await pb.collection('tool_calls').getFirstListItem(
      `external_id="${externalId}"`
    );
    return record;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get tool calls for a turn
 */
export async function getToolCallsForTurn(pb, turnId) {
  try {
    const records = await pb.collection('tool_calls').getFullList({
      filter: `turn="${turnId}"`,
      sort: 'created',
    });
    return records;
  } catch (error) {
    console.error('[ToolCalls] Failed to get tool calls:', error);
    return [];
  }
}

