# Streaming API Documentation for Frontend

## Overview

The chat API uses NDJSON (Newline Delimited JSON) streaming to provide real-time responses, including tool calls (like image generation).

## Endpoints

### POST `/api/chat/stream`
### POST `/api/unified-chat/stream`

Both endpoints support the same streaming format.

## Request Format

```javascript
POST /api/chat/stream
Content-Type: application/json
Authorization: Bearer <your_pocketbase_token>

{
  "conversationId": "optional_existing_conversation_id",
  "prompt": "Generate an image of a sunset"
}
```

## Response Format

The response is a stream of NDJSON events. Each line is a separate JSON object.

### Event Types

| Type | When | Description |
|------|------|-------------|
| `init` | First event | Conversation metadata |
| `reasoning` | During reasoning | Reasoning model thinking (GPT-5, o1, etc.) |
| `chunk` | During generation | Text content chunks |
| `tool_calls` | After text | LLM decided to use tools |
| `tool_results` | After execution | Results from tool execution |
| `final` | Last event | Complete turn data |
| `error` | On error | Error information |

## Complete Event Flow

### Standard Chat (No Tools)

```json
{"type":"init","conversation":{"id":"abc123","title":"My Chat","created":"...","updated":"..."}}
{"type":"chunk","text":"Hello! "}
{"type":"chunk","text":"How can "}
{"type":"chunk","text":"I help you?"}
{"type":"final","data":{"conversation":{...},"turn":{...}}}
```

### Chat with Reasoning Model

```json
{"type":"init","conversation":{...}}
{"type":"reasoning","status":"start","message":"Thinking..."}
{"type":"reasoning","status":"thinking","content":"Analyzing the request..."}
{"type":"reasoning","status":"thinking","content":"Considering options..."}
{"type":"reasoning","status":"complete","message":"Analysis complete"}
{"type":"chunk","text":"Based on my analysis, "}
{"type":"chunk","text":"here's what I found..."}
{"type":"final","data":{...}}
```

### Chat with Tool Calling (Image Generation)

```json
{"type":"init","conversation":{"id":"xyz789","title":"Image Request","created":"...","updated":"..."}}
{"type":"chunk","text":"I'll generate that image for you. "}
{"type":"chunk","text":"Let me create it now."}
{"type":"tool_calls","count":1,"tools":[{"name":"generate_image","args":{"prompt":"a beautiful sunset","image_size":"16:9"}}]}
{"type":"tool_results","results":[{"tool":"generate_image","success":true,"data":{"taskId":"task_123","status":"processing","message":"Image generation started..."}}]}
{"type":"final","data":{"conversation":{...},"turn":{...}}}
```

## Detailed Event Schemas

### 1. Init Event

```typescript
{
  type: "init",
  conversation: {
    id: string,           // Conversation ID
    title: string,        // Conversation title
    created: string,      // ISO timestamp
    updated: string       // ISO timestamp
  }
}
```

### 2. Reasoning Events

```typescript
// Start
{
  type: "reasoning",
  status: "start",
  message: "Thinking..." | "🧠 Thinking..."
}

// Thinking (actual reasoning content - may not be available for all models)
{
  type: "reasoning",
  status: "thinking",
  content: string  // What the model is thinking
}

// Complete
{
  type: "reasoning",
  status: "complete",
  message: "Analysis complete" | "✅ Analysis complete"
}
```

### 3. Chunk Event

```typescript
{
  type: "chunk",
  text: string  // Part of the assistant's response
}
```

### 4. Tool Calls Event

```typescript
{
  type: "tool_calls",
  count: number,
  tools: Array<{
    name: string,      // Tool name (e.g., "generate_image")
    args: object       // Tool arguments
  }>
}
```

**Example:**
```json
{
  "type": "tool_calls",
  "count": 1,
  "tools": [
    {
      "name": "generate_image",
      "args": {
        "prompt": "a beautiful sunset over the ocean",
        "image_size": "16:9",
        "output_format": "png"
      }
    }
  ]
}
```

### 5. Tool Results Event

```typescript
{
  type: "tool_results",
  results: Array<{
    tool: string,      // Tool name
    success: boolean,  // Execution success
    data: object       // Tool-specific result data
  }>
}
```

**Image Generation Result:**
```json
{
  "type": "tool_results",
  "results": [
    {
      "tool": "generate_image",
      "success": true,
      "data": {
        "success": true,
        "taskId": "task_12345678",
        "status": "processing",
        "message": "Image generation started. Task ID: task_12345678. I'll notify you when it's ready.",
        "model": "google/nano-banana",
        "prompt": "a beautiful sunset over the ocean"
      }
    }
  ]
}
```

**Tool Error Result:**
```json
{
  "type": "tool_results",
  "results": [
    {
      "tool": "generate_image",
      "success": false,
      "data": {
        "success": false,
        "error": "API key not configured"
      }
    }
  ]
}
```

### 6. Final Event

```typescript
{
  type: "final",
  data: {
    conversation: {
      id: string,
      title: string,
      created: string,
      updated: string
    },
    turn: {
      id: string,
      user_text: string,
      assistant_text: string,
      user_attachments: Array<any>,
      assistant_attachments: Array<any>,
      created: string,
      updated: string
    }
  }
}
```

### 7. Error Event

```typescript
{
  type: "error",
  message: string
}
```

## Frontend Implementation Examples

### React Implementation

```typescript
import { useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string[];
  toolCalls?: any[];
  toolResults?: any[];
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReasoning, setIsReasoning] = useState(false);
  const [currentReasoning, setCurrentReasoning] = useState<string[]>([]);

  async function sendMessage(prompt: string) {
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    setIsLoading(true);

    // Prepare assistant message
    let assistantMessage: Message = { role: 'assistant', content: '' };
    let conversationId: string | null = null;

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('pb_auth')}`,
        },
        body: JSON.stringify({ prompt, conversationId }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Parse NDJSON stream
        const lines = decoder.decode(value).split('\n').filter(Boolean);
        
        for (const line of lines) {
          const event = JSON.parse(line);

          switch (event.type) {
            case 'init':
              conversationId = event.conversation.id;
              break;

            case 'reasoning':
              if (event.status === 'start') {
                setIsReasoning(true);
                setCurrentReasoning([]);
              } else if (event.status === 'thinking') {
                setCurrentReasoning(prev => [...prev, event.content]);
              } else if (event.status === 'complete') {
                setIsReasoning(false);
                assistantMessage.reasoning = currentReasoning;
              }
              break;

            case 'chunk':
              assistantMessage.content += event.text;
              // Update UI in real-time
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg?.role === 'assistant') {
                  lastMsg.content = assistantMessage.content;
                } else {
                  newMessages.push({ ...assistantMessage });
                }
                return newMessages;
              });
              break;

            case 'tool_calls':
              assistantMessage.toolCalls = event.tools;
              console.log('Tools called:', event.tools);
              break;

            case 'tool_results':
              assistantMessage.toolResults = event.results;
              
              // Handle image generation specifically
              event.results.forEach((result: any) => {
                if (result.tool === 'generate_image' && result.success) {
                  handleImageGeneration(result.data);
                }
              });
              break;

            case 'final':
              // Save complete turn data if needed
              console.log('Turn complete:', event.data);
              break;

            case 'error':
              console.error('Stream error:', event.message);
              break;
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
      setIsReasoning(false);
    }
  }

  function handleImageGeneration(data: any) {
    if (data.taskId) {
      // Poll for image completion
      pollImageStatus(data.taskId);
    }
  }

  async function pollImageStatus(taskId: string) {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/webhooks/nanobanana/status/${taskId}`);
        const data = await response.json();

        if (data.data.state === 'success') {
          clearInterval(interval);
          const result = JSON.parse(data.data.resultJson);
          // Display image
          displayImage(result.resultUrls[0]);
        } else if (data.data.state === 'fail') {
          clearInterval(interval);
          console.error('Image generation failed:', data.data.failMsg);
        }
      } catch (error) {
        console.error('Poll error:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Timeout after 2 minutes
    setTimeout(() => clearInterval(interval), 120000);
  }

  function displayImage(url: string) {
    setMessages(prev => {
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg?.role === 'assistant') {
        lastMsg.content += `\n\n![Generated Image](${url})`;
      }
      return newMessages;
    });
  }

  return { messages, sendMessage, isLoading, isReasoning, currentReasoning };
}
```

### Vanilla JavaScript Implementation

```javascript
class ChatStream {
  constructor(apiUrl, authToken) {
    this.apiUrl = apiUrl;
    this.authToken = authToken;
    this.onInit = null;
    this.onChunk = null;
    this.onReasoning = null;
    this.onToolCalls = null;
    this.onToolResults = null;
    this.onFinal = null;
    this.onError = null;
  }

  async send(prompt, conversationId = null) {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
      },
      body: JSON.stringify({ prompt, conversationId }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line);
          this.handleEvent(event);
        } catch (error) {
          console.error('Parse error:', error, 'Line:', line);
        }
      }
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case 'init':
        this.onInit?.(event.conversation);
        break;
      case 'reasoning':
        this.onReasoning?.(event);
        break;
      case 'chunk':
        this.onChunk?.(event.text);
        break;
      case 'tool_calls':
        this.onToolCalls?.(event.tools);
        break;
      case 'tool_results':
        this.onToolResults?.(event.results);
        break;
      case 'final':
        this.onFinal?.(event.data);
        break;
      case 'error':
        this.onError?.(event.message);
        break;
    }
  }
}

// Usage
const chat = new ChatStream('/api/chat/stream', 'your_token');

chat.onChunk = (text) => {
  document.getElementById('response').textContent += text;
};

chat.onToolCalls = (tools) => {
  console.log('AI is using tools:', tools);
  document.getElementById('status').textContent = `Using ${tools[0].name}...`;
};

chat.onToolResults = (results) => {
  results.forEach(result => {
    if (result.tool === 'generate_image' && result.success) {
      document.getElementById('status').textContent = 
        'Image generation started! Task ID: ' + result.data.taskId;
    }
  });
};

chat.send('Generate an image of a sunset');
```

### Vue 3 Composition API

```vue
<script setup>
import { ref, computed } from 'vue';

const messages = ref([]);
const isLoading = ref(false);
const isReasoning = ref(false);
const reasoningSteps = ref([]);

async function sendMessage(prompt) {
  messages.value.push({ role: 'user', content: prompt });
  isLoading.value = true;

  let assistantContent = '';
  
  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('pb_auth')}`,
      },
      body: JSON.stringify({ prompt }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    messages.value.push({ role: 'assistant', content: '', toolCalls: [] });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(Boolean);
      
      for (const line of lines) {
        const event = JSON.parse(line);
        const lastMessage = messages.value[messages.value.length - 1];

        switch (event.type) {
          case 'reasoning':
            if (event.status === 'start') {
              isReasoning.value = true;
              reasoningSteps.value = [];
            } else if (event.status === 'thinking') {
              reasoningSteps.value.push(event.content);
            } else if (event.status === 'complete') {
              isReasoning.value = false;
            }
            break;

          case 'chunk':
            lastMessage.content += event.text;
            break;

          case 'tool_calls':
            lastMessage.toolCalls = event.tools;
            break;

          case 'tool_results':
            lastMessage.toolResults = event.results;
            handleToolResults(event.results);
            break;
        }
      }
    }
  } finally {
    isLoading.value = false;
  }
}

function handleToolResults(results) {
  results.forEach(result => {
    if (result.tool === 'generate_image' && result.success) {
      // Handle image generation
      pollImageStatus(result.data.taskId);
    }
  });
}
</script>
```

## Best Practices

### 1. Handle All Event Types

Always handle all event types, even if you don't display them:

```javascript
switch (event.type) {
  case 'init':
  case 'reasoning':
  case 'chunk':
  case 'tool_calls':
  case 'tool_results':
  case 'final':
  case 'error':
    // Handle each type
    break;
  default:
    console.warn('Unknown event type:', event.type);
}
```

### 2. Buffer Incomplete Lines

NDJSON chunks may split lines:

```javascript
let buffer = '';

for await (const chunk of stream) {
  buffer += decoder.decode(chunk);
  const lines = buffer.split('\n');
  buffer = lines.pop(); // Keep last (potentially incomplete) line
  
  for (const line of lines) {
    if (line.trim()) {
      const event = JSON.parse(line);
      // Handle event
    }
  }
}
```

### 3. Show Tool Execution Status

```javascript
if (event.type === 'tool_calls') {
  showLoadingIndicator(`Generating ${event.tools[0].name}...`);
}

if (event.type === 'tool_results') {
  hideLoadingIndicator();
  if (event.results[0].success) {
    showSuccess('Tool executed successfully!');
  }
}
```

### 4. Poll for Async Tool Results

Image generation is async:

```javascript
function pollImageStatus(taskId) {
  const interval = setInterval(async () => {
    const status = await fetch(`/api/webhooks/nanobanana/status/${taskId}`);
    const data = await status.json();
    
    if (data.data.state === 'success') {
      clearInterval(interval);
      displayImage(data.data.resultJson);
    }
  }, 2000);
}
```

### 5. Handle Errors Gracefully

```javascript
chat.onError = (message) => {
  showErrorToast(message);
  console.error('Chat error:', message);
};
```

## Testing

### Curl Example

```bash
curl -N -X POST http://localhost:4000/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token" \
  -d '{"prompt": "Generate an image of a sunset"}'
```

Expected output:
```
{"type":"init","conversation":{...}}
{"type":"chunk","text":"I'll generate that image for you."}
{"type":"tool_calls","count":1,"tools":[...]}
{"type":"tool_results","results":[...]}
{"type":"final","data":{...}}
```

## Summary

- **NDJSON Format**: Each line is a separate JSON object
- **Multiple Event Types**: Handle init, reasoning, chunk, tool_calls, tool_results, final, error
- **Real-time Updates**: Stream chunks as they arrive
- **Tool Handling**: Detect tool calls and handle results
- **Async Operations**: Poll for image generation completion
- **Error Handling**: Always handle errors gracefully

For more details, see:
- [TOOL_CALLING.md](TOOL_CALLING.md) - Tool calling documentation
- [REASONING_MODELS.md](../REASONING_MODELS.md) - Reasoning model details

