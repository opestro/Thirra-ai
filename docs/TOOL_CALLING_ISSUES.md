# Tool Calling Issues & Debugging

## Issue: Empty Tool Names in Streaming

### Symptoms

Logs show:
```
[AI] Tool calls detected: generate_image
[AI] Tool calls detected:                    ← Empty on second chunk!
[Tools] Executing                            ← No tool name
[Tools] execution failed: Unknown tool:      ← Empty name
```

### Root Cause

**Tool calls are sent in multiple chunks during streaming.** LangChain streams partial tool call data, and the last chunk may overwrite the complete data with incomplete data.

Example streaming sequence:
1. **Chunk 1**: `{ tool_calls: [{ name: "generate_image", args: {...} }] }` ✅ Complete
2. **Chunk 2**: `{ tool_calls: [{ name: "", args: {} }] }` ❌ Incomplete (overwrites!)

### Solution Applied

**1. Filter Incomplete Tool Calls** (`ai.service.js`)
```javascript
// Only keep tool calls that have names
if (chunk?.tool_calls && chunk.tool_calls.length > 0) {
  const completeCalls = chunk.tool_calls.filter(tc => tc.name);
  if (completeCalls.length > 0) {
    toolCalls = completeCalls;
    console.log(`[AI] Tool calls detected: ${toolCalls.map(tc => tc.name).join(', ')}`);
  } else {
    console.log(`[AI] Tool calls chunk received but incomplete (no names yet)`);
  }
}
```

**2. Validate Before Execution** (`ai.service.js`)
```javascript
if (!toolCall.name) {
  console.error(`[Tools] Invalid tool call - missing name:`, toolCall);
  return error response;
}
```

**3. Filter Invalid Calls in Controllers** (`chat.controller.js`, `unifiedChat.controller.js`)
```javascript
const validToolCalls = toolCalls.filter(tc => tc.name && tc.id);

if (validToolCalls.length === 0) {
  console.error(`[Chat] No valid tool calls found!`);
}

// Only process valid tool calls
const toolsToExecute = validToolCalls.length > 0 ? validToolCalls : toolCalls;
```

## Debugging Tool Call Issues

### Step 1: Check AI Service Logs

Look for tool call detection:
```
[AI] Tools enabled: generate_image
[AI] Tool calls detected: generate_image        ← Should see tool name
[AI] Tool calls chunk received but incomplete   ← OK if followed by complete call
```

**Bad signs:**
```
[AI] Tool calls detected:                       ← Empty! Problem here
```

### Step 2: Check Controller Logs

```
[Chat] Processing 1 tool call(s)
[Chat] Tool calls: [ { id: 'abc', name: 'generate_image', hasArgs: true } ]  ← Check structure
[Chat] No valid tool calls found!               ← Red flag!
```

### Step 3: Check Tool Execution

```
[Tools] Executing generate_image                ← Should see tool name
[Tools] Tool call ID: call_abc123               ← Should have ID
[Tools] Arguments received: {...}               ← Should have args
```

**Errors to look for:**
```
[Tools] Invalid tool call - missing name:       ← Tool call has no name
[Tools] execution failed: Unknown tool:         ← Empty tool name
```

## Common Causes

### 1. **Model-Specific Streaming Format**

Some models (DeepSeek, Grok) may stream tool calls differently.

**Debug:**
```javascript
// In ai.service.js, add temporary logging
if (chunk?.tool_calls) {
  console.log('[DEBUG] Tool call chunk:', JSON.stringify(chunk.tool_calls, null, 2));
}
```

### 2. **LangChain Version Compatibility**

Tool calling format changed between LangChain versions.

**Check versions:**
```bash
npm list @langchain/core @langchain/openai
```

**Expected:**
- `@langchain/core`: ^1.0.1
- `@langchain/openai`: ^1.0.0

### 3. **OpenRouter Model Support**

Not all OpenRouter models support tool calling well.

**Known issues:**
- ✅ Claude 3.5 Sonnet: Excellent
- ✅ GPT-4o: Excellent
- ⚠️ DeepSeek: May have streaming issues
- ❌ Older models: May not support tools

### 4. **Tool Schema Issues**

Tool definition might confuse the model.

**Check tool binding:**
```javascript
// Should see this in logs
[AI] Tools enabled: generate_image
```

If not shown, check:
1. `config.nanobanana.apiKey` is set
2. Tool is imported correctly
3. `bindTools()` is called

## Testing Tool Calls

### Test 1: Simple Image Generation

```bash
curl -X POST http://localhost:4000/api/chat/stream \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"generate a red apple"}'
```

**Expected logs:**
```
[Router] Selected anthropic/claude-3.5-sonnet for general task
[AI] Tools enabled: generate_image
[AI] Tool calls detected: generate_image
[Tools] Executing generate_image
[Tools] Tool call ID: call_xyz
[Tools] Arguments received: {"prompt":"a red apple"}
[Webhook] Image generation successful
```

### Test 2: Different Models

Force specific models to test compatibility:

```javascript
// Temporarily in ai.service.js
const model = 'anthropic/claude-3.5-sonnet'; // Force Claude
// const model = routingDecision.model; // Comment out routing
```

### Test 3: Non-Streaming (Debug Only)

```javascript
// Temporarily disable streaming to test
const response = await llm.invoke(messages);
console.log('[DEBUG] Full response:', response);
console.log('[DEBUG] Tool calls:', response.tool_calls);
```

## Model Recommendations for Tool Calling

Based on testing:

| Model | Tool Support | Streaming | Notes |
|-------|-------------|-----------|-------|
| Claude 3.5 Sonnet | ⭐⭐⭐⭐⭐ | Perfect | Best choice |
| GPT-4o | ⭐⭐⭐⭐⭐ | Perfect | Excellent |
| GPT-4 Turbo | ⭐⭐⭐⭐ | Good | Reliable |
| DeepSeek v3 | ⭐⭐⭐ | Issues | Use for non-tool tasks |
| Grok | ⭐⭐⭐ | Variable | Beta support |
| GPT-3.5 | ⭐⭐ | Basic | Limited |

## Quick Fixes

### Fix 1: Force Better Model for Tool Calls

```javascript
// In utils/queryRouter.js
export async function routeQuery(query) {
  // Check if query needs tool calling (image generation, etc.)
  const needsTools = /generate|create|make|edit.*image|picture|photo/i.test(query);
  
  if (needsTools) {
    return {
      category: 'coding', // Forces Claude/GPT
      model: config.openrouter.models.coding,
      reasoning: 'Tool calling - using reliable model',
    };
  }
  
  // ... rest of routing logic
}
```

### Fix 2: Retry with Better Model

```javascript
// In ai.service.js - executeToolCalls
if (!toolCall.name && userPrompt) {
  console.log('[Tools] Invalid tool call, retrying with better model...');
  
  // Re-invoke with explicit tool instructions
  const betterModel = new ChatOpenAI({
    model: 'anthropic/claude-3.5-sonnet',
    // ... config
  }).bindTools([generateImage]);
  
  const response = await betterModel.invoke([
    new SystemMessage('Call the generate_image tool with this prompt:'),
    new HumanMessage(userPrompt),
  ]);
  
  // Process response.tool_calls
}
```

### Fix 3: Manual Tool Extraction

```javascript
// In ai.service.js - as last resort
if (toolCalls.length === 0 && assistantText.includes('image')) {
  console.log('[AI] No tool calls detected, manually triggering...');
  
  toolCalls = [{
    id: 'manual_' + Date.now(),
    name: 'generate_image',
    args: { prompt: originalPrompt }
  }];
}
```

## Prevention

### 1. Use Reliable Models

Update routing to prefer Claude/GPT for tool calls:
```javascript
// config.js
models: {
  coding: 'anthropic/claude-3.5-sonnet', // Good for tools
  general: 'anthropic/claude-3.5-sonnet', // Use same for consistency
  // Not: 'deepseek/deepseek-chat' for tool calls
}
```

### 2. Add Retry Logic

```javascript
// Retry up to 2 times with better model
let attempts = 0;
while (toolCalls.length === 0 && attempts < 2) {
  // Retry logic
}
```

### 3. Monitor Tool Success Rate

```javascript
// Track tool call success
const toolMetrics = {
  total: 0,
  successful: 0,
  failed: 0,
  invalidName: 0,
};

// Log periodically
if (toolMetrics.invalidName > toolMetrics.successful * 0.1) {
  console.warn('[Metrics] High tool failure rate - consider model change');
}
```

## Need Help?

1. **Enable debug logging** (see above)
2. **Test with Claude** (most reliable)
3. **Check model compatibility** table
4. **Verify API keys** and configuration
5. **Review LangChain docs** for model-specific quirks

If issue persists, it's likely a model streaming compatibility issue with LangChain + OpenRouter.

