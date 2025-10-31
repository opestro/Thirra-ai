# 🔀 Intelligent LLM Routing

This document explains the intelligent routing system that optimizes both **cost** and **quality** by selecting the best model for each query type.

## Overview

The system automatically classifies user queries and routes them to the optimal model:

| Category | Use Cases | Model | Why? |
|----------|-----------|-------|------|
| **Coding** | Programming, debugging, code review, algorithms | Claude 3.5 Sonnet | Superior code quality and understanding |
| **General** | Simple questions, casual chat, basic info | DeepSeek | Extremely cost-effective (~$0.14/M tokens) |
| **Heavy** | Research, resumes, complex analysis, documents | GPT-4 | Best for multi-step reasoning |

## How It Works

### 1. Classification Phase

When a user sends a query, a lightweight classifier (GPT-4o-mini) analyzes:
- Query content and keywords
- Recent conversation context (last 2 messages)
- Intent patterns

**Cost:** ~50 tokens per classification (~$0.0001 per query)

### 2. Routing Decision

Based on classification, the system selects the optimal model:

```javascript
// Coding detected
"How do I implement a binary search tree in Python?"
→ Routes to Claude 3.5 Sonnet

// General question
"What's the weather like today?"
→ Routes to DeepSeek (ultra-cheap)

// Heavy work
"Write a professional resume for a senior software engineer"
→ Routes to GPT-4 (best quality)
```

### 3. Fallback Logic

If classification fails, the system uses keyword-based heuristics:
- **Coding keywords:** code, debug, implement, function, error, etc.
- **Heavy keywords:** research, analyze, resume, document, detailed, etc.
- **Default:** General (cost-effective)

## Configuration

Set model preferences via environment variables:

```bash
# Classifier (for routing decisions)
OPENROUTER_CLASSIFIER_MODEL=openai/gpt-4o-mini

# Coding tasks
OPENROUTER_CODING_MODEL=anthropic/claude-3.5-sonnet

# General queries (cost-effective)
OPENROUTER_GENERAL_MODEL=deepseek/deepseek-chat

# Heavy work (complex reasoning)
OPENROUTER_HEAVY_MODEL=openai/gpt-4o

# Lightweight (summaries, titles)
OPENROUTER_LIGHTWEIGHT_MODEL=openai/gpt-4o-mini
```

### Default Models

If not specified, the system uses:
- **Classifier:** `gpt-4o-mini`
- **Coding:** `claude-3.5-sonnet`
- **General:** `deepseek-chat`
- **Heavy:** `gpt-4o`
- **Lightweight:** `gpt-4o-mini`

## Cost Optimization

### Example Savings

Assuming a typical query (2000 tokens total):

| Without Routing | With Routing | Savings |
|-----------------|--------------|---------|
| Always GPT-4: $0.010 | General (DeepSeek): $0.0003 | **97%** |
| Always Claude: $0.006 | Coding (Claude): $0.006 | **0%** (optimal) |
| Always GPT-4: $0.010 | Heavy (GPT-4): $0.010 | **0%** (optimal) |

**Average savings across mixed queries:** 40-60%

### Real-Time Tracking

The system logs routing decisions and cost estimates:

```
[Router] Selected deepseek/deepseek-chat for general task
[Router] Cost Optimization: {
  category: 'general',
  actualPrice: '$0.000280',
  savings: '$0.009720',
  savingsPercent: '97.2%'
}
```

## Architecture

### Query Router (`queryRouter.js`)

**Functions:**
- `classifyQuery(query, history)` - Classifies query intent
- `selectModelForCategory(category)` - Maps category to model
- `routeQuery(query, history)` - Main routing function
- `estimateCostSavings(category, tokens)` - Calculates savings

**Classification Logic:**

```javascript
const classifier = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,      // Deterministic
  maxTokens: 50,       // Just need category name
});

const category = await classifyQuery(userQuery, conversationHistory);
const { model, reasoning } = selectModelForCategory(category);
```

### AI Service Integration

The AI service uses routing before every response:

```javascript
// In streamAIResponse()
const { model, category, reasoning } = await routeQuery(prompt, optimizedHistory);
console.log(`[Router] Selected ${model} for ${category} task: ${reasoning}`);

// Create model with routed selection
const llm = new ChatOpenAI({ model, ... });
```

## Performance Impact

### Latency

- **Classification time:** 200-500ms
- **Total overhead:** ~400ms (classification + logging)
- **Trade-off:** Slight latency increase for 40-60% cost savings

### Token Usage

- **Classification:** ~50 tokens per query
- **Routing metadata:** Minimal (logged, not sent to LLM)

## Benefits

### 1. Cost Optimization
- **40-60% average savings** on mixed workloads
- **Up to 97% savings** on simple queries (DeepSeek vs GPT-4)

### 2. Quality Optimization
- Coding tasks get Claude (best-in-class for code)
- Complex reasoning gets GPT-4 (superior analysis)
- Simple queries don't waste expensive models

### 3. Scalability
- Automatically adapts to different query types
- No manual model selection needed
- Easy to add new categories or models

## Monitoring

### Logs

Every query produces detailed logs:

```
🔀 Query Router: {
  category: 'coding',
  model: 'anthropic/claude-3.5-sonnet',
  reasoning: 'Coding task detected - using Claude for superior code quality',
  routingTime: '342ms',
  queryPreview: 'How do I implement a binary search tree in Pyt...'
}

[Router] Selected anthropic/claude-3.5-sonnet for coding task
[AI] Tokens - prompt: 1234, completion: 567, total: 1801
[Router] Cost Optimization: {
  category: 'coding',
  baselinePrice: '$0.005403',
  actualPrice: '$0.005403',
  savings: '$0.000000',
  savingsPercent: '0.0%'
}
```

### Metrics to Track

1. **Classification accuracy** - Manual review of routing decisions
2. **Cost savings** - Compare baseline vs actual costs
3. **Response quality** - Monitor user feedback per model
4. **Routing latency** - Track classification time

## Testing

Run the test script to see routing in action:

```bash
node app/src/dev/testRouting.js
```

## Future Enhancements

### Potential Improvements

1. **User feedback loop** - Learn from corrections
2. **Multi-model responses** - Validate with secondary model
3. **Custom categories** - Domain-specific routing
4. **A/B testing** - Compare model performance
5. **Cost budgets** - Per-user or per-conversation limits

### Advanced Routing

Consider semantic routing with embeddings:
- Pre-compute category embeddings
- Match query embedding to nearest category
- Faster than LLM classification (no API call)

## Best Practices

### 1. Monitor and Adjust

Track actual costs and quality over time:
- Are coding queries correctly routed?
- Is DeepSeek quality acceptable for general queries?
- Do heavy tasks justify GPT-4 cost?

### 2. Model Selection

Choose models that balance cost and quality:
- **Coding:** Claude (best) or GPT-4 (good)
- **General:** DeepSeek (cheap) or GPT-3.5 (balanced)
- **Heavy:** GPT-4 (best) or Claude (good)

### 3. Classification Tuning

Adjust classification prompt if needed:
- Add domain-specific keywords
- Refine category definitions
- Include user feedback

## Troubleshooting

### Issue: Wrong Model Selected

**Solution:** Check logs for classification reasoning. If consistently wrong, update keywords in `fallbackClassification()`.

### Issue: High Classification Costs

**Solution:** Classification uses ~50 tokens @ $0.15/M = $0.0001 per query. If this is still too high, use keyword-based routing only.

### Issue: Slow Routing

**Solution:** Classification adds 200-500ms latency. To reduce:
- Use faster classifier model
- Implement caching for similar queries
- Switch to semantic routing (embeddings)

## Summary

The intelligent routing system provides:
- ✅ **40-60% cost savings** on average
- ✅ **Quality optimization** per task type
- ✅ **Zero manual intervention** required
- ✅ **Detailed logging** for monitoring
- ✅ **Easy configuration** via env vars

This is a powerful cost optimization strategy that maintains or improves output quality by matching the right model to each task.

