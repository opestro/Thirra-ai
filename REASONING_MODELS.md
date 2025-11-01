# 🧠 Reasoning Models Support

This document explains how the system detects and handles reasoning models (like GPT-5, o1, o3) that have a "thinking phase" before outputting.

## What are Reasoning Models?

Reasoning models (e.g., GPT-5, o1, o3, o1-mini) work differently from standard LLMs:

1. **Reasoning Phase** - The model "thinks" internally before responding
2. **Internal Reasoning Tokens** - Uses tokens for reasoning (not visible in output)
3. **Empty Chunks** - During reasoning, the stream may return empty content
4. **Final Output** - After reasoning completes, the actual response streams

## How Detection Works

The system uses **4 methods** to detect reasoning phases, with **proactive detection** happening first:

### Method 1: Proactive Model Name Detection (Primary)

```javascript
const isKnownReasoningModel = /gpt-5|o1-preview|o1-mini|o3|deepseek.*reason/i.test(model);

if (isKnownReasoningModel) {
  console.log(`[AI] 🧠 Reasoning model detected: ${model}`);
  yield '___REASONING_START___'; // Signal BEFORE streaming starts
}
```

**Why this is first:** Reasoning models are known upfront by name. This allows us to show "Thinking..." status **immediately** before any chunks arrive, preventing content from streaming during the reasoning phase.

### Method 2: Content Blocks (LangChain Native)

```javascript
const contentBlocks = chunk?.contentBlocks || [];
const hasReasoningBlocks = contentBlocks.some(block => block?.type === 'reasoning');
```

LangChain exposes reasoning as special `contentBlocks` with `type: 'reasoning'`. Used as fallback for unknown reasoning models.

### Method 3: Reasoning Details in Metadata

```javascript
const hasReasoningDetails = chunk?.reasoning_details?.length > 0;
```

Some providers return encrypted `reasoning_details` in the response metadata.

### Method 4: Reasoning Tokens in Usage

```javascript
const details = usage?.output_token_details || {};
const reasoningTokens = details?.reasoning_tokens ?? 0;
```

Reasoning tokens appear in `usage_metadata.output_token_details.reasoning_tokens`. Used for tracking and logging.

## Implementation

### In `ai.service.js`

```javascript
// Detect reasoning models UPFRONT by model name (before streaming)
const isKnownReasoningModel = /gpt-5|o1-preview|o1-mini|o3|deepseek.*reason/i.test(model);

async function* textGenerator() {
  // Proactive detection: Signal reasoning BEFORE streaming starts
  if (isKnownReasoningModel) {
    isReasoning = true;
    console.log(`[AI] 🧠 Reasoning model detected: ${model}`);
    yield '___REASONING_START___'; // Client sees "Thinking..." immediately
  }
  
  for await (const chunk of stream) {
    // Fallback: Detect from chunk metadata (for unknown reasoning models)
    if ((hasReasoningBlocks || hasReasoningDetails) && !isReasoning) {
      isReasoning = true;
      yield '___REASONING_START___';
    }
    
    // Skip reasoning chunks
    if (isReasoning && (hasReasoningBlocks || hasReasoningDetails)) {
      continue;
    }
    
    // Once content starts, reasoning is complete
    if (content && isReasoning && !hasStartedOutput) {
      hasStartedOutput = true;
      console.log(`[AI] ✅ Reasoning complete (${reasoningTokens} reasoning tokens)`);
      yield '___REASONING_END___';
    }
    
    // Stream actual content
    yield content;
  }
}
```

### In Controllers

Controllers detect the special markers and send reasoning status to clients:

```javascript
for await (const chunk of chunkGen) {
  if (chunk === '___REASONING_START___') {
    res.write(JSON.stringify({ 
      type: 'reasoning', 
      status: 'start', 
      message: '🧠 Thinking...' 
    }) + '\n');
    continue;
  }
  
  if (chunk === '___REASONING_END___') {
    res.write(JSON.stringify({ 
      type: 'reasoning', 
      status: 'complete', 
      message: '✅ Analysis complete' 
    }) + '\n');
    continue;
  }
  
  // Regular content
  res.write(JSON.stringify({ type: 'chunk', text: chunk }) + '\n');
}
```

## Stream Response Format

When using reasoning models, the client receives reasoning status **FIRST**, followed by **reasoning content** (what the model is thinking), then the final answer:

```json
{"type":"init","conversation":{...}}
{"type":"reasoning","status":"start","message":"🧠 Thinking..."}
{"type":"reasoning","status":"thinking","content":"The user is asking about market analysis..."}
{"type":"reasoning","status":"thinking","content":"I need to consider competitive landscape..."}
{"type":"reasoning","status":"thinking","content":"Key factors to analyze: pricing, features, barriers..."}
{"type":"reasoning","status":"complete","message":"✅ Analysis complete"}
{"type":"chunk","text":"Based on my analysis, "}
{"type":"chunk","text":"the answer is..."}
{"type":"final","data":{...}}
```

### Response Types

| Type | Status | Description | Example |
|------|--------|-------------|---------|
| `reasoning` | `start` | Reasoning phase begins | `{type: 'reasoning', status: 'start', message: '🧠 Thinking...'}` |
| `reasoning` | `thinking` | **What model is thinking** | `{type: 'reasoning', status: 'thinking', content: 'Need to analyze...'}` |
| `reasoning` | `complete` | Reasoning phase ends | `{type: 'reasoning', status: 'complete', message: '✅ Analysis complete'}` |
| `chunk` | - | Regular response text | `{type: 'chunk', text: 'Based on'}` |

**Key difference from non-reasoning models:**
- Reasoning status appears **immediately** after init
- Content chunks start **only after** reasoning completes
- No mixed content during reasoning phase

### Visual Comparison

**❌ Before Fix (Wrong Order):**
```
init → chunk chunk chunk chunk reasoning(start) → final
```
Content was streaming during reasoning phase!

**✅ After Fix (Correct Order with Reasoning Content):**
```
init → reasoning(start) → reasoning(thinking: "analyzing...") → reasoning(thinking: "considering...") → reasoning(complete) → chunk chunk chunk → final
```
Now you can see what the model is thinking in real-time!

## Usage Metadata

Reasoning tokens are tracked separately:

```javascript
{
  promptTokens: 132,
  completionTokens: 280,
  totalTokens: 412,
  reasoningTokens: 256  // ← Internal reasoning tokens
}
```

**Note:** `completionTokens` includes `reasoningTokens` + actual output tokens.

## Logs

When a reasoning model is active (with proactive detection):

```
[Router] Selected openai/gpt-5 for heavy task
[AI] 🧠 Reasoning model detected: openai/gpt-5 - expecting reasoning phase
[AI] ✅ Reasoning complete (256 reasoning tokens), starting output
[AI] Tokens - prompt: 132, completion: 280, reasoning: 256, total: 412
```

**Note:** The reasoning detection now happens **immediately** when the model is created, not during chunk processing.

## Supported Models

Reasoning models that work with **proactive detection** (detected immediately by name):

| Model | Provider | Detection | Reasoning Tokens |
|-------|----------|-----------|------------------|
| `openai/gpt-5` | OpenAI | ✅ Proactive | ✅ |
| `openai/gpt-5-nano` | OpenAI | ✅ Proactive | ✅ |
| `openai/o1-preview` | OpenAI | ✅ Proactive | ✅ |
| `openai/o1-mini` | OpenAI | ✅ Proactive | ✅ |
| `openai/o3` | OpenAI | ✅ Proactive | ✅ (when available) |
| `deepseek/deepseek-reasoner` | DeepSeek | ✅ Proactive | ✅ |
| Other reasoning models | Various | Fallback | ✅ (if metadata present) |

**Proactive detection** means the reasoning status appears **immediately** before streaming starts.
**Fallback detection** means the system detects reasoning from chunk metadata during streaming.

## Client Implementation

### Simple Display (Without Reasoning Content)

```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  body: JSON.stringify({ prompt: 'Your question' })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = JSON.parse(decoder.decode(value));
  
  if (chunk.type === 'reasoning') {
    if (chunk.status === 'start') {
      showReasoningSpinner('🧠 Thinking...');
    } else if (chunk.status === 'complete') {
      hideReasoningSpinner();
    }
  } else if (chunk.type === 'chunk') {
    appendText(chunk.text);
  }
}
```

### Advanced Display (With Reasoning Content Visible)

```javascript
const reasoningContainer = document.getElementById('reasoning');
const answerContainer = document.getElementById('answer');

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = JSON.parse(decoder.decode(value));
  
  if (chunk.type === 'reasoning') {
    if (chunk.status === 'start') {
      reasoningContainer.innerHTML = '<div class="thinking-header">🧠 Model is thinking...</div>';
    } else if (chunk.status === 'thinking') {
      // Show what the model is thinking!
      const step = document.createElement('div');
      step.className = 'reasoning-step';
      step.textContent = `• ${chunk.content}`;
      reasoningContainer.appendChild(step);
    } else if (chunk.status === 'complete') {
      reasoningContainer.innerHTML += '<div class="thinking-complete">✅ Analysis complete</div>';
    }
  } else if (chunk.type === 'chunk') {
    answerContainer.textContent += chunk.text;
  }
}
```

**UI Example:**
```
┌─────────────────────────────────┐
│ 🧠 Model is thinking...         │
│ • Analyzing market landscape    │
│ • Considering competitive gaps  │
│ • Evaluating entry barriers     │
│ ✅ Analysis complete            │
└─────────────────────────────────┘

Based on my analysis, the best 
approach for your POS solution...
```

### With Progress Indicator

```javascript
let reasoningStartTime;

if (chunk.type === 'reasoning' && chunk.status === 'start') {
  reasoningStartTime = Date.now();
  showProgress('Analyzing your question...');
}

if (chunk.type === 'reasoning' && chunk.status === 'complete') {
  const duration = Date.now() - reasoningStartTime;
  showNotification(`Analysis complete in ${duration}ms`);
}
```

## Cost Implications

Reasoning tokens are **more expensive** than regular tokens:

| Token Type | Cost (GPT-5) | Example |
|------------|--------------|---------|
| Input | $0.50/M | Your prompt |
| Output (regular) | $1.50/M | Model's response |
| **Reasoning** | **$4.00/M** | Internal thinking |

### Example Calculation

```
Query: "Solve this complex math problem..."

Tokens used:
- Prompt: 50 tokens × $0.50/M = $0.000025
- Reasoning: 500 tokens × $4.00/M = $0.002000
- Output: 100 tokens × $1.50/M = $0.000150
Total: $0.002175 for this query
```

**Tip:** Use reasoning models only for tasks that benefit from deep thinking (via intelligent routing).

## Troubleshooting

### Issue: No reasoning detection

**Symptoms:**
- Empty chunks during model thinking
- No reasoning logs appear
- Client receives empty content

**Solution:**
1. Check that you're using a reasoning model (`gpt-5`, `o1`, `o3`)
2. Verify LangChain is up-to-date: `npm update @langchain/openai`
3. Check logs for `[AI] 🧠 Reasoning phase detected`

### Issue: Reasoning tokens not tracked

**Symptoms:**
- `reasoningTokens` is `undefined` in usage metadata
- Logs don't show reasoning token count

**Solution:**
The provider might not expose reasoning tokens. Check:
- Provider supports reasoning token reporting
- Using OpenRouter with a reasoning model
- Response metadata includes `output_token_details.reasoning_tokens`

### Issue: Client doesn't show reasoning status

**Symptoms:**
- No "Thinking..." message appears
- Blank screen during reasoning phase

**Solution:**
1. Check client code handles `type: 'reasoning'` events
2. Verify NDJSON parsing is correct
3. Test with a simple `console.log()` to see all chunk types

## Configuration

### Enable/Disable Reasoning Detection

To disable reasoning detection (stream all chunks including empty ones):

```javascript
// In ai.service.js, comment out reasoning detection:

// if (hasReasoningBlocks || hasReasoningDetails || ...) {
//   // Skip this entire block
// }

// Just stream everything:
if (content) yield content;
```

### Customize Reasoning Messages

Change messages in controllers:

```javascript
if (chunk === '___REASONING_START___') {
  res.write(JSON.stringify({ 
    type: 'reasoning', 
    status: 'start', 
    message: 'Analyzing your question...' // ← Customize
  }) + '\n');
}
```

## Best Practices

1. **Use reasoning models strategically** - Route complex queries to reasoning models, simple ones to fast models
2. **Show progress indicators** - Let users know the model is thinking
3. **Set timeouts appropriately** - Reasoning takes longer (5-30 seconds typical)
4. **Monitor costs** - Reasoning tokens are 2-3× more expensive
5. **Log reasoning time** - Track how long reasoning takes for performance monitoring

## Important Notes

### Reasoning Content Availability

**⚠️ Provider-Dependent:** Not all reasoning models expose reasoning content:

| Provider | Reasoning Content | Format |
|----------|-------------------|---------|
| **Anthropic (Claude)** | ✅ Yes | Plain text in `contentBlocks` |
| **OpenAI (o1/o3)** | ❌ Encrypted | Encrypted in `reasoning_details` |
| **OpenAI (GPT-5)** | ⚠️ Limited | May be encrypted or unavailable |
| **DeepSeek Reasoner** | ✅ Yes | Plain text (if enabled) |

**OpenAI's Approach:**
- o1/o3 models encrypt reasoning for competitive reasons
- You'll see `reasoning_details` with encrypted data
- Can still detect reasoning phase and token count
- But cannot see actual reasoning content

**Anthropic's Approach:**
- Claude reasoning models expose plain text reasoning
- Full visibility into thinking process
- Better for debugging and understanding

**What This Means:**
- Your system will work with all reasoning models
- Reasoning status (`start`/`complete`) always works
- Reasoning content (`thinking`) only works if provider exposes it
- System gracefully handles both cases

## Summary

✅ **Reasoning detection is now active** - System detects when models are thinking
✅ **Reasoning content streaming** - See what model is thinking (if provider exposes it)
✅ **Multiple detection methods** - Uses LangChain's native support + fallbacks
✅ **Client notifications** - Sends reasoning status events to frontend
✅ **Cost tracking** - Logs reasoning tokens separately
✅ **Works with all providers** - OpenAI, Anthropic, DeepSeek, etc. via OpenRouter

Your app now gracefully handles reasoning models with full transparency (when available)! 🎉

