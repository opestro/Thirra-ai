# Persistent Tool State for Image Generation

## Problem

When a user requests image generation:
1. AI calls the tool
2. Frontend shows a placeholder/loading image
3. Image generates asynchronously (webhook updates PocketBase)
4. **User leaves the page** → Image state is lost
5. User returns → Can't see the generated image

## Solution

Store tool call state in PocketBase and load it with conversation history.

## Backend Implementation

### 1. New API Endpoint

**GET `/api/conversations/:id/turns`**

Returns conversation turns with embedded tool call data:

```json
{
  "success": true,
  "conversationId": "abc123",
  "turns": [
    {
      "id": "turn_1",
      "user_text": "Generate an image of a sunset",
      "assistant_text": "I'll generate that image for you.",
      "tool_calls": [
        {
          "id": "tool_xyz",
          "tool_name": "generate_image",
          "arguments": {"prompt": "sunset", "image_size": "16:9"},
          "result": {
            "resultUrls": ["https://example.com/sunset.jpg"],
            "costTime": 8
          },
          "status": "completed",
          "external_id": "task_123",
          "created": "2025-11-01T12:00:00Z",
          "updated": "2025-11-01T12:00:08Z"
        }
      ],
      "created": "2025-11-01T12:00:00Z"
    }
  ]
}
```

### 2. Tool Call Status Values

| Status | Description | Frontend Action |
|--------|-------------|-----------------|
| `pending` | Tool call created, not yet executed | Show loading |
| `processing` | External API processing (has `external_id`) | Resume polling |
| `completed` | Tool finished successfully, has `result` | Display result |
| `failed` | Tool execution failed, has `error` | Show error |

## Frontend Implementation

### React Hook with Persistent State

```typescript
import { useState, useEffect } from 'react';

interface ToolCall {
  id: string;
  tool_name: string;
  arguments: any;
  result: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  external_id?: string;
  error?: string;
}

interface Turn {
  id: string;
  user_text: string;
  assistant_text: string;
  tool_calls: ToolCall[];
  created: string;
}

export function useConversationHistory(conversationId: string) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!conversationId) return;

    loadHistory();
  }, [conversationId]);

  async function loadHistory() {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/turns`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('pb_auth')}`,
        },
      });

      const data = await response.json();
      setTurns(data.turns);

      // Resume polling for any processing images
      data.turns.forEach((turn: Turn) => {
        turn.tool_calls.forEach((toolCall) => {
          if (toolCall.status === 'processing' && toolCall.external_id) {
            console.log(`Resuming polling for ${toolCall.external_id}`);
            pollImageGeneration(toolCall.external_id, turn.id, toolCall.id);
          }
        });
      });
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function pollImageGeneration(taskId: string, turnId: string, toolCallId: string) {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/webhooks/nanobanana/status/${taskId}`);
        const data = await response.json();

        if (data.data.state === 'success') {
          clearInterval(interval);
          
          const result = JSON.parse(data.data.resultJson);
          
          // Update the tool call in state
          setTurns(prev => prev.map(turn => {
            if (turn.id !== turnId) return turn;
            
            return {
              ...turn,
              tool_calls: turn.tool_calls.map(tc => {
                if (tc.id !== toolCallId) return tc;
                
                return {
                  ...tc,
                  status: 'completed',
                  result: {
                    resultUrls: result.resultUrls,
                    costTime: data.data.costTime,
                  },
                };
              }),
            };
          }));
        } else if (data.data.state === 'fail') {
          clearInterval(interval);
          
          // Update with error
          setTurns(prev => prev.map(turn => {
            if (turn.id !== turnId) return turn;
            
            return {
              ...turn,
              tool_calls: turn.tool_calls.map(tc => {
                if (tc.id !== toolCallId) return tc;
                
                return {
                  ...tc,
                  status: 'failed',
                  error: data.data.failMsg,
                };
              }),
            };
          }));
        }
      } catch (error) {
        console.error('Poll error:', error);
      }
    }, 2000);

    // Timeout after 2 minutes
    setTimeout(() => clearInterval(interval), 120000);
  }

  return { turns, isLoading, refreshHistory: loadHistory };
}
```

### Display Component

```typescript
function MessageWithTools({ turn }: { turn: Turn }) {
  return (
    <div className="message assistant">
      <p>{turn.assistant_text}</p>
      
      {turn.tool_calls.map((toolCall) => (
        <ToolCallDisplay key={toolCall.id} toolCall={toolCall} />
      ))}
    </div>
  );
}

function ToolCallDisplay({ toolCall }: { toolCall: ToolCall }) {
  if (toolCall.tool_name === 'generate_image') {
    return <ImageToolDisplay toolCall={toolCall} />;
  }
  
  return null;
}

function ImageToolDisplay({ toolCall }: { toolCall: ToolCall }) {
  if (toolCall.status === 'completed' && toolCall.result?.resultUrls) {
    return (
      <div className="generated-image">
        <img src={toolCall.result.resultUrls[0]} alt="Generated" />
        <div className="image-meta">
          Generated in {toolCall.result.costTime}s
        </div>
      </div>
    );
  }

  if (toolCall.status === 'processing') {
    return (
      <div className="image-loading">
        <div className="skeleton-image" />
        <p>🎨 Generating image...</p>
      </div>
    );
  }

  if (toolCall.status === 'failed') {
    return (
      <div className="image-error">
        ❌ Image generation failed: {toolCall.error}
      </div>
    );
  }

  return (
    <div className="image-pending">
      ⏳ Image generation queued...
    </div>
  );
}
```

## Complete Flow

### 1. Initial Request (User sends message)

```
User: "Generate a sunset image"
  ↓
Backend: Creates turn + tool_call record (status: processing, external_id: task_123)
  ↓
Frontend: Shows skeleton placeholder
  ↓
Frontend: Starts polling task_123
```

### 2. User Leaves Page

```
User closes tab/navigates away
  ↓
Polling stops
  ↓
Webhook still updates PocketBase (status: completed, result: {...})
```

### 3. User Returns

```
User opens conversation
  ↓
Frontend: GET /api/conversations/:id/turns
  ↓
Backend: Returns turns with tool_calls (status: completed ✅)
  ↓
Frontend: Finds completed tool_call, displays image immediately
  ↓
No polling needed!
```

### 4. User Returns While Processing

```
User opens conversation
  ↓
Frontend: GET /api/conversations/:id/turns
  ↓
Backend: Returns turns with tool_calls (status: processing, external_id: task_123)
  ↓
Frontend: Resumes polling task_123
  ↓
Webhook completes → Poll detects → Updates UI
```

## CSS for Skeleton Loading

```css
.skeleton-image {
  width: 100%;
  aspect-ratio: 16/9;
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 8px;
}

@keyframes loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.generated-image img {
  width: 100%;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.image-meta {
  font-size: 0.875rem;
  color: #666;
  margin-top: 8px;
}
```

## Best Practices

### 1. Cache Tool Call State Locally

```typescript
// Store in memory to avoid refetching on every render
const [toolCallCache, setToolCallCache] = useState(new Map());

function updateToolCallCache(turnId: string, toolCallId: string, updates: Partial<ToolCall>) {
  setToolCallCache(prev => {
    const key = `${turnId}-${toolCallId}`;
    const cached = prev.get(key) || {};
    const updated = new Map(prev);
    updated.set(key, { ...cached, ...updates });
    return updated;
  });
}
```

### 2. Debounce Polling

```typescript
// Don't poll multiple times for the same task
const activePolls = useRef(new Set<string>());

function pollImageGeneration(taskId: string, turnId: string, toolCallId: string) {
  if (activePolls.current.has(taskId)) {
    console.log(`Already polling ${taskId}`);
    return;
  }
  
  activePolls.current.add(taskId);
  
  // ... polling logic ...
  
  // Remove when done
  clearInterval(interval);
  activePolls.current.delete(taskId);
}
```

### 3. Handle Network Errors

```typescript
async function pollImageGeneration(taskId: string) {
  let consecutiveErrors = 0;
  const maxErrors = 3;

  const interval = setInterval(async () => {
    try {
      const response = await fetch(`/api/webhooks/nanobanana/status/${taskId}`);
      consecutiveErrors = 0; // Reset on success
      
      // ... handle response ...
    } catch (error) {
      consecutiveErrors++;
      
      if (consecutiveErrors >= maxErrors) {
        clearInterval(interval);
        console.error('Too many errors, stopping poll');
        showError('Failed to load image status');
      }
    }
  }, 2000);
}
```

### 4. Show Progress Indicator

```typescript
function ImageToolDisplay({ toolCall }: { toolCall: ToolCall }) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (toolCall.status !== 'processing') return;

    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [toolCall.status]);

  if (toolCall.status === 'processing') {
    return (
      <div className="image-loading">
        <div className="skeleton-image" />
        <p>🎨 Generating image... {elapsedTime}s</p>
        <progress value={elapsedTime} max={30} />
      </div>
    );
  }

  // ...
}
```

## Testing

### Test Scenario 1: Normal Flow

1. Send: "Generate image of sunset"
2. See skeleton loading
3. Wait for completion
4. See image displayed

### Test Scenario 2: Refresh During Processing

1. Send: "Generate image of sunset"
2. Refresh page immediately
3. Should see skeleton + resume polling
4. Should complete and display image

### Test Scenario 3: Return After Completion

1. Send: "Generate image of sunset"
2. Close tab
3. Wait 10 seconds (for completion)
4. Open conversation again
5. Should see completed image immediately (no polling)

### Test Scenario 4: Multiple Images

1. Send: "Generate 3 different images"
2. Should show 3 skeletons
3. Each polls independently
4. Each updates when ready

## PocketBase Notes

For the expand to work, ensure PocketBase has this relation configured:

**In `tool_calls` collection settings:**
- Relation field: `turn` → `turns` collection
- Relation name: `tool_calls_via_turn`

This allows: `expand: 'tool_calls_via_turn'` in the API call.

## Summary

✅ **Backend**: Tool calls stored in database
✅ **API**: Returns turns with tool_calls
✅ **Frontend**: Loads history with tool state
✅ **Polling**: Resumes for processing images
✅ **Display**: Shows completed images immediately

The user can now close the tab, come back later, and see their generated images! 🎨✨

