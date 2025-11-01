# Tool Calling with LangChain

## Overview

The Thirra AI app now supports **tool calling** (also known as function calling), allowing the LLM to interact with external services and perform actions beyond text generation.

### Current Tools

| Tool | Description | API | Status |
|------|-------------|-----|--------|
| `generate_image` | Generate or edit images from text descriptions | Nanobanana (kie.ai) | ✅ Active |

## How It Works

### 1. Tool Definition

Tools are defined using LangChain's `tool` function with Zod schemas:

```javascript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const ImageGenerationSchema = z.object({
  prompt: z.string().describe("Detailed description of the image"),
  image_size: z.enum(["1:1", "16:9", "9:16"]).default("1:1"),
  output_format: z.enum(["png", "jpeg"]).default("png"),
});

export const generateImage = tool(
  async ({ prompt, image_size, output_format }) => {
    // Call external API
    const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "google/nano-banana", input: { prompt, image_size, output_format } }),
    });
    
    const data = await response.json();
    return { success: true, taskId: data.data.taskId };
  },
  {
    name: "generate_image",
    description: "Generate images when user requests visual content",
    schema: ImageGenerationSchema,
  }
);
```

### 2. Binding Tools to Model

Tools are automatically bound to the model in `ai.service.js`:

```javascript
let llm = new ChatOpenAI({ model, apiKey });

// Bind tools
const availableTools = [generateImage];
llm = llm.bindTools(availableTools);
```

### 3. Tool Execution Flow

```
User: "Generate an image of a sunset"
  ↓
LLM: [decides to use generate_image tool]
  ↓
Controller: Detects tool call in stream
  ↓
Service: Executes generateImage({ prompt: "a sunset", ... })
  ↓
External API: Creates task, returns taskId
  ↓
PocketBase: Stores tool_call record
  ↓
Client: Receives tool_results event
  ↓
Webhook: Receives completion, updates record
  ↓
Client: Can query tool status
```

## Stream Response Format

When a tool is called, the client receives these events:

```json
{"type":"init","conversation":{...}}
{"type":"chunk","text":"I'll generate that image for you."}
{"type":"tool_calls","count":1,"tools":[{"name":"generate_image","args":{...}}]}
{"type":"tool_results","results":[{"tool":"generate_image","success":true,"data":{...}}]}
{"type":"final","data":{...}}
```

### Event Types

| Type | When | Description |
|------|------|-------------|
| `tool_calls` | After text chunks | LLM decided to call tools |
| `tool_results` | After execution | Results from tool execution |

### Example Tool Result

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
        "message": "Image generation started..."
      }
    }
  ]
}
```

## Client Implementation

### Basic Tool Handling

```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Generate an image of a sunset' })
});

for await (const line of response.body) {
  const chunk = JSON.parse(line);
  
  if (chunk.type === 'chunk') {
    appendText(chunk.text);
  } else if (chunk.type === 'tool_calls') {
    showToolCallNotification(chunk.tools);
  } else if (chunk.type === 'tool_results') {
    handleToolResults(chunk.results);
  }
}
```

### Advanced: Showing Tool Execution

```javascript
function handleToolResults(results) {
  results.forEach(result => {
    if (result.tool === 'generate_image') {
      if (result.success && result.data.taskId) {
        // Show processing indicator
        showImageGenerating(result.data.taskId);
        
        // Poll for status
        pollImageStatus(result.data.taskId);
      } else {
        showError(result.data.error);
      }
    }
  });
}

async function pollImageStatus(taskId) {
  const interval = setInterval(async () => {
    const response = await fetch(`/api/webhooks/nanobanana/status/${taskId}`);
    const data = await response.json();
    
    if (data.data.state === 'success') {
      clearInterval(interval);
      const resultJson = JSON.parse(data.data.resultJson);
      displayImage(resultJson.resultUrls[0]);
    } else if (data.data.state === 'fail') {
      clearInterval(interval);
      showError(data.data.failMsg);
    }
  }, 2000);
}
```

## PocketBase Schema

Tool calls are stored in the `tool_calls` collection:

```javascript
{
  id: "record_id",
  turn: "turn_id",              // Link to conversation turn
  tool_name: "generate_image",
  tool_call_id: "call_abc123",  // LLM's tool call ID
  arguments: "{\"prompt\":\"a sunset\",\"image_size\":\"1:1\"}",
  result: "{\"taskId\":\"task_123\",\"status\":\"processing\"}",
  status: "completed",           // pending, processing, completed, failed
  external_id: "task_123",       // For webhook lookups
  metadata: "{\"model\":\"google/nano-banana\"}",
  created: "2025-11-01 12:00:00",
  updated: "2025-11-01 12:00:05"
}
```

### Querying Tool Calls

```javascript
// Get all tool calls for a conversation
const turn = await pb.collection('turns').getOne(turnId);
const toolCalls = await pb.collection('tool_calls').getFullList({
  filter: `turn="${turnId}"`,
  sort: 'created'
});

// Check if image generation is complete
const imageTools = toolCalls.filter(tc => 
  tc.tool_name === 'generate_image' && tc.status === 'completed'
);
```

## Configuration

### Environment Variables

```bash
# Required for image generation
NANOBANANA_API_KEY=your_api_key_here

# Optional: Custom webhook URL (defaults to APP_BASE_URL/api/webhooks/nanobanana)
NANOBANANA_CALLBACK_URL=https://your-domain.com/api/webhooks/nanobanana
```

### Enabling/Disabling Tools

Tools are automatically enabled when their API keys are configured:

```javascript
// In config.js
nanobanana: {
  apiKey: env.NANOBANANA_API_KEY,
  callbackUrl: env.NANOBANANA_CALLBACK_URL || `${appBaseUrl}/api/webhooks/nanobanana`,
}

// In ai.service.js
const availableTools = [];
if (config.nanobanana.apiKey) {
  availableTools.push(generateImage);
}
```

## Adding New Tools

### 1. Create Tool File

Create `/app/src/tools/yourTool.tool.js`:

```javascript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const YourToolSchema = z.object({
  param1: z.string().describe("Description for LLM"),
  param2: z.number().optional(),
});

export const yourTool = tool(
  async ({ param1, param2 }) => {
    // Your tool logic
    return { success: true, result: "..." };
  },
  {
    name: "your_tool_name",
    description: "When to use this tool (for LLM)",
    schema: YourToolSchema,
  }
);
```

### 2. Register Tool

Update `/app/src/services/ai.service.js`:

```javascript
import { yourTool } from "../tools/yourTool.tool.js";

// In streamAIResponse function
const availableTools = [];
if (config.nanobanana.apiKey) {
  availableTools.push(generateImage);
}
if (config.yourService.apiKey) {
  availableTools.push(yourTool);
}
```

### 3. Handle Tool Execution

Update `/app/src/services/ai.service.js` in `executeToolCalls`:

```javascript
if (toolCall.name === 'generate_image') {
  result = await generateImage.invoke(toolCall.args);
} else if (toolCall.name === 'your_tool_name') {
  result = await yourTool.invoke(toolCall.args);
}
```

## Best Practices

### 1. Tool Descriptions

Write clear, specific descriptions for the LLM:

```javascript
✅ Good:
description: "Generate or edit images based on text descriptions. Use when user asks to create, generate, make, or edit images."

❌ Bad:
description: "Image tool"
```

### 2. Error Handling

Always return structured errors:

```javascript
try {
  const response = await callExternalAPI();
  return { success: true, data: response };
} catch (error) {
  return { success: false, error: error.message };
}
```

### 3. Async Operations

For long-running operations (like image generation):
- Return task ID immediately
- Use webhooks for completion
- Allow client to poll status

### 4. Security

- Validate all tool inputs
- Rate limit tool calls per user
- Sanitize external API responses
- Never expose API keys to client

### 5. Cost Tracking

```javascript
const metadata = {
  cost: consumeCredits,
  duration: costTime,
  model: "google/nano-banana",
};
```

## Webhooks

### Nanobanana Webhook Endpoint

`POST /api/webhooks/nanobanana`

Receives notifications when image generation completes:

```javascript
// Success
{
  "code": 200,
  "data": {
    "taskId": "task_123",
    "state": "success",
    "resultJson": "{\"resultUrls\":[\"https://example.com/image.jpg\"]}",
    "costTime": 8,
    "consumeCredits": 100
  }
}

// Failure
{
  "code": 501,
  "data": {
    "taskId": "task_123",
    "state": "fail",
    "failCode": "500",
    "failMsg": "Internal server error"
  }
}
```

### Webhook Security

To secure webhooks (recommended for production):

1. **IP Whitelisting**:
```javascript
const ALLOWED_IPS = ['xxx.xxx.xxx.xxx'];
if (!ALLOWED_IPS.includes(req.ip)) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

2. **HMAC Signature Verification**:
```javascript
const crypto = require('crypto');
const signature = req.headers['x-signature'];
const payload = JSON.stringify(req.body);
const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');
  
if (signature !== expected) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

## Troubleshooting

### Tool Not Being Called

1. **Check tool description**: Make it more specific
2. **Check model**: Some models don't support tool calling well
3. **Check logs**: Look for `[AI] Tools enabled: ...`
4. **Test with explicit request**: "Use the generate_image tool to..."

### Tool Execution Fails

1. **Check API key**: `console.log(config.nanobanana.apiKey)`
2. **Check API response**: Log full response in tool
3. **Check schema validation**: Ensure args match schema
4. **Check network**: Verify external API is accessible

### Webhook Not Received

1. **Check callback URL**: Must be publicly accessible
2. **Check PocketBase auth**: Webhook endpoint should not require auth
3. **Test manually**: Use `curl` to send test webhook
4. **Check logs**: Look for `[Webhook]` messages

### Tool Call Record Not Found

1. **Check timing**: Record created after turn
2. **Check external_id**: Must match taskId
3. **Check PocketBase schema**: Ensure `tool_calls` collection exists
4. **Check permissions**: Webhook endpoint needs PocketBase access

## Performance Considerations

- Tool calls add latency (external API + database writes)
- Use streaming to show progress
- Consider caching for repeated requests
- Monitor external API rate limits
- Track costs per tool per user

## Monitoring

Log these metrics:
- Tool call frequency
- Tool execution time
- Tool success/failure rate
- External API costs
- Webhook delivery time

## Future Enhancements

- [ ] Tool call history analytics
- [ ] User quotas and rate limiting
- [ ] Tool result caching
- [ ] Multi-step tool workflows
- [ ] Tool call approval (human-in-the-loop)
- [ ] More tools (web search, calculator, etc.)

