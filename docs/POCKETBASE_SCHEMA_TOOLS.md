# PocketBase Schema Updates for Tool Calling

## Overview

To support tool calling (image generation, etc.), we need to extend the PocketBase schema to store tool call data and results.

## New Collections

### 1. `tool_calls` Collection

Stores information about tool invocations and their results.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `turn` | Relation | Yes | Reference to the `turns` collection |
| `tool_name` | Text | Yes | Name of the tool called (e.g., "generate_image") |
| `tool_call_id` | Text | Yes | Unique ID from the LLM's tool call |
| `arguments` | JSON | Yes | Arguments passed to the tool |
| `result` | JSON | No | Result returned by the tool |
| `status` | Select | Yes | One of: "pending", "processing", "completed", "failed" |
| `error` | Text | No | Error message if failed |
| `external_id` | Text | No | External task/job ID (e.g., Nanobanana taskId) |
| `metadata` | JSON | No | Additional metadata (cost, duration, etc.) |

**Indexes:**
- `turn` (for querying tool calls by turn)
- `external_id` (for webhook lookups)
- `status` (for querying pending/processing tasks)

**Rules:**
- Create: Authenticated users only
- Read: Own tool calls only (via turn → conversation → user)
- Update: System only (for webhook updates)
- Delete: Own tool calls only

### 2. Update `turns` Collection

Add a field to track if a turn contains tool calls:

**New Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `has_tool_calls` | Bool | No | Whether this turn includes tool calls |
| `tool_count` | Number | No | Number of tools called in this turn |

## Schema Creation Commands

### SQL for `tool_calls` Collection

```sql
-- Create tool_calls collection
CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  turn TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  arguments TEXT NOT NULL, -- JSON
  result TEXT, -- JSON
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  error TEXT,
  external_id TEXT,
  metadata TEXT, -- JSON
  created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_tool_calls_turn ON tool_calls(turn);
CREATE INDEX idx_tool_calls_external_id ON tool_calls(external_id);
CREATE INDEX idx_tool_calls_status ON tool_calls(status);
CREATE INDEX idx_tool_calls_tool_call_id ON tool_calls(tool_call_id);

-- Trigger to update 'updated' timestamp
CREATE TRIGGER update_tool_calls_updated 
AFTER UPDATE ON tool_calls
BEGIN
  UPDATE tool_calls SET updated = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

### PocketBase Admin UI Steps

1. **Create `tool_calls` Collection:**
   - Name: `tool_calls`
   - Type: Base collection
   
2. **Add Fields:**
   ```
   turn           | Relation  | Required | Single | turns collection
   tool_name      | Text      | Required | Max: 100
   tool_call_id   | Text      | Required | Max: 100
   arguments      | JSON      | Required
   result         | JSON      | Optional
   status         | Select    | Required | Options: pending, processing, completed, failed
   error          | Text      | Optional
   external_id    | Text      | Optional | Max: 200
   metadata       | JSON      | Optional
   ```

3. **API Rules:**
   - **List/Search**: `@request.auth.id != "" && turn.conversation.user = @request.auth.id`
   - **View**: `@request.auth.id != "" && turn.conversation.user = @request.auth.id`
   - **Create**: `@request.auth.id != ""`
   - **Update**: `@request.auth.id = "" || turn.conversation.user = @request.auth.id`
   - **Delete**: `@request.auth.id != "" && turn.conversation.user = @request.auth.id`

4. **Update `turns` Collection:**
   Add these fields:
   ```
   has_tool_calls | Bool      | Optional | Default: false
   tool_count     | Number    | Optional | Default: 0 | Min: 0
   ```

## Usage Example

### Creating a Tool Call Record

```javascript
// When LLM requests a tool call
const toolCallRecord = await pb.collection('tool_calls').create({
  turn: turnId,
  tool_name: 'generate_image',
  tool_call_id: 'call_abc123',
  arguments: JSON.stringify({
    prompt: 'A beautiful sunset',
    image_size: '1:1'
  }),
  status: 'processing',
  external_id: 'task_xyz789',
  metadata: JSON.stringify({
    model: 'google/nano-banana',
    cost_estimate: 100
  })
});
```

### Updating When Webhook Receives Result

```javascript
// When Nanobanana webhook receives completion
const toolCall = await pb.collection('tool_calls').getFirstListItem(
  `external_id="${taskId}"`
);

await pb.collection('tool_calls').update(toolCall.id, {
  status: 'completed',
  result: JSON.stringify({
    imageUrls: ['https://example.com/image.jpg'],
    costTime: 8,
    consumeCredits: 100
  }),
  metadata: JSON.stringify({
    ...JSON.parse(toolCall.metadata || '{}'),
    completed_at: new Date().toISOString()
  })
});
```

### Querying Tool Calls for a Turn

```javascript
// Get all tool calls for a turn
const toolCalls = await pb.collection('tool_calls').getList(1, 50, {
  filter: `turn="${turnId}"`,
  sort: 'created'
});

// Check if any are still processing
const hasPending = toolCalls.items.some(tc => 
  tc.status === 'pending' || tc.status === 'processing'
);
```

## Migration Notes

1. **Backup**: Always backup your PocketBase data before schema changes
2. **Existing Data**: No migration needed for existing conversations/turns
3. **Testing**: Test webhook endpoint with manual Nanobanana API calls first
4. **Monitoring**: Monitor `tool_calls` collection for stuck "processing" records

## Security Considerations

1. **Webhook Authentication**: 
   - Consider adding HMAC signature verification for webhooks
   - Use IP whitelisting if possible

2. **Rate Limiting**: 
   - Limit number of tool calls per user per hour
   - Add cost tracking to prevent abuse

3. **Data Privacy**: 
   - Tool call arguments may contain sensitive data
   - Ensure proper access controls via API rules

4. **External IDs**: 
   - Store external task IDs securely
   - Don't expose internal database IDs in webhooks

## Future Enhancements

1. **Tool Call History**: Add analytics for tool usage
2. **Cost Tracking**: Track credits/costs per user
3. **Retry Logic**: Automatic retry for failed tool calls
4. **Tool Call Limits**: Per-user quotas and rate limits
5. **Caching**: Cache image results to avoid regeneration

## Status Values

| Status | Description | Transitions |
|--------|-------------|-------------|
| `pending` | Tool call created, not yet sent to external API | → `processing`, `failed` |
| `processing` | Request sent to external API, waiting for result | → `completed`, `failed` |
| `completed` | Tool execution successful, result stored | Terminal state |
| `failed` | Tool execution failed, error stored | Terminal state |

## Webhook Flow

```
1. LLM requests tool → Create tool_call (status: pending)
2. Call external API → Update to processing, store external_id
3. Webhook receives result → Update to completed/failed with result
4. Client polls/subscribes → Get tool_call status and result
```

