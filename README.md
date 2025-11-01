# Thirra AI

A clean, production-ready AI chat API with advanced memory and RAG capabilities.

## Features

- **🔀 Intelligent Routing**: Automatic model selection based on query type (40-60% cost savings)
- **🛠️ Tool Calling**: LLM can use external tools (image generation, and more)
- **🧠 Smart Memory System**: Three-layer memory (short-term, long-term summaries, semantic recall)
- **📚 RAG (Retrieval-Augmented Generation)**: Semantic search with embeddings
- **💾 Facts Store**: Persistent conversation context
- **💰 Cost Optimization**: Smart token budget management (60-90% savings)
- **⚡ Performance Optimized**: Intelligent caching (4× faster responses)
- **📎 File Attachments**: Support for text files in conversations
- **🔐 Authentication**: PocketBase integration with cookie/bearer auth
- **🌊 Streaming**: Real-time NDJSON streaming responses

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Running PocketBase instance
- OpenRouter API key

### 2. Install

```bash
npm install
```

### 3. Configure

Create `.env`:

```bash
# Required
PORT=4000
NODE_ENV=development
POCKETBASE_URL=http://127.0.0.1:8090
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Optional - Model routing (for cost optimization)
OPENROUTER_CODING_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_GENERAL_MODEL=deepseek/deepseek-chat
OPENROUTER_HEAVY_MODEL=openai/gpt-4o
OPENROUTER_LIGHTWEIGHT_MODEL=openai/gpt-4o-mini
OPENROUTER_EMBED_MODEL=openai/text-embedding-3-large

# Optional - Tool calling (image generation)
NANOBANANA_API_KEY=your_nanobanana_api_key

# Optional - PocketBase admin (for webhooks)
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=your_secure_admin_password

# Optional - Performance tuning
MAX_OUTPUT_TOKENS=2048
MAX_HISTORY_TOKENS=2000    # Cost optimization (keeps prompt tokens low)
RECENT_MESSAGE_COUNT=5
RAG_TOP_K=4
```

### 4. Run

```bash
# Development (with test UI)
npm run rundev

# Production
npm start
```

Server will run on `http://localhost:4000`

## API Endpoints

### Authentication

```bash
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Users

```bash
GET    /api/users/me
PATCH  /api/users/me
PATCH  /api/users/me/password
DELETE /api/users/me
```

### Conversations

```bash
GET /api/conversations
GET /api/conversations/:id
```

### Chat (Streaming)

```bash
POST /api/chat/stream
POST /api/unified-chat/unified  # With auto-title generation
```

**Request body:**
```json
{
  "conversationId": "optional-existing-conversation-id",
  "prompt": "Your message here"
}
```

**With file attachments** (multipart/form-data):
- Field: `user_attachments` (max 10 files)
- Supported: text files, JSON, CSV, etc.

**Response** (NDJSON stream):
```json
{"type":"init","conversation":{"id":"...","title":"..."}}
{"type":"chunk","text":"Response "}
{"type":"chunk","text":"continues..."}
{"type":"tool_calls","count":1,"tools":[{"name":"generate_image","args":{...}}]}
{"type":"tool_results","results":[{"tool":"generate_image","success":true,"data":{...}}]}
{"type":"final","data":{...}}
```

### Comprehensive API Documentation

For complete API documentation with all event types, schemas, and frontend integration examples:

📚 **[API_STREAMING.md](docs/API_STREAMING.md)** - Full streaming API reference
- All event types: init, reasoning, chunk, tool_calls, tool_results, final, error
- Complete schemas and examples
- Best practices and error handling

💻 **[API_EXAMPLES.md](docs/API_EXAMPLES.md)** - Ready-to-use code examples
- React + TypeScript (with hooks)
- Next.js App Router
- Vue 3 + Pinia
- Plain HTML + JavaScript

🛠️ **[TOOL_CALLING.md](docs/TOOL_CALLING.md)** - Tool calling system
- How tools work with LangChain
- Adding new tools
- Webhook handling for async operations

## Architecture

### Core Services

- **`ai.service.js`** - Main AI service with LangChain integration
- **`chat.service.js`** - Conversation and turn management
- **`attachments.service.js`** - File attachment handling

### Memory System

- **`memory/memoryLayers.js`** - Three-layer memory architecture
  - Short-term: Last N messages
  - Long-term: Summarized older conversations
  - Semantic: RAG-based contextual retrieval

- **`memory/facts.store.js`** - Key-value facts storage per conversation

### RAG System

- **`utils/rag.js`** - Semantic search with embeddings
  - In-memory vector store per conversation
  - Automatic chunking and indexing
  - Cosine similarity-based retrieval

### Intelligent Routing

- **`utils/queryRouter.js`** - Automatic model selection
  - Classifies queries into: coding, general, or heavy work
  - Routes to optimal model for cost/quality balance
  - Real-time cost tracking and savings estimation

| Query Type | Model | Use Case |
|------------|-------|----------|
| Coding | Claude 3.5 Sonnet | Programming, debugging, code review |
| General | DeepSeek | Simple questions, casual chat (97% cheaper) |
| Heavy | GPT-4 | Research, resumes, complex analysis |

**Cost Savings**: 40-60% average, up to 97% on simple queries

See [INTELLIGENT_ROUTING.md](INTELLIGENT_ROUTING.md) for detailed documentation.

### Tool Calling

- **`tools/imageGeneration.tool.js`** - Image generation with Nanobanana API
- **`services/toolCalls.service.js`** - Tool call storage and management
- **`controllers/webhooks.controller.js`** - Webhook handling for async operations

The LLM can automatically use tools when appropriate:
- **Image Generation**: Creates images from text descriptions
- **Extensible**: Easy to add new tools

**Example Flow:**
1. User: "Generate an image of a sunset"
2. LLM: Calls `generate_image` tool
3. API: Creates image generation task
4. Webhook: Notifies when complete
5. User: Receives generated image URL

See [TOOL_CALLING.md](docs/TOOL_CALLING.md) for detailed documentation.

**Setup & Troubleshooting:**
- [POCKETBASE_ADMIN_SETUP.md](docs/POCKETBASE_ADMIN_SETUP.md) - **Required**: Admin setup for webhooks
- [WEBHOOK_TROUBLESHOOTING.md](docs/WEBHOOK_TROUBLESHOOTING.md) - Webhook not updating tool results
- [TOOL_CALLING_ISSUES.md](docs/TOOL_CALLING_ISSUES.md) - Empty tool names, streaming issues

### Utilities

- **`utils/compression.js`** - Context compression
- **`utils/summary.js`** - Conversation summarization
- **`utils/queryRouter.js`** - Query classification and model routing
- **`utils/extractFacts.js`** - Fact extraction from text
- **`utils/embeddingsClient.js`** - OpenRouter embeddings client

## Memory System

### How It Works

1. **Short-term Memory**: Keeps last 5 messages in context
2. **Long-term Summary**: Summarizes older messages when conversation grows
3. **Semantic Recall**: Retrieves relevant past context based on current query

### Example

```javascript
import { streamAIResponse } from './services/ai.service.js';

const generator = await streamAIResponse({
  pb,                    // PocketBase client
  conversationId,        // Existing conversation ID
  prompt: "User query",
  files: [],            // Optional file attachments
  userInstruction: null // Optional user preferences
});

for await (const chunk of generator) {
  console.log(chunk);
}

const usage = generator.getUsage();
console.log('Tokens used:', usage.totalTokens);
```

## RAG System

Automatically indexes:
- User messages
- Assistant responses
- Text file attachments

Retrieves relevant context based on semantic similarity to enhance responses.

## Cost Optimization

The system automatically manages token usage to keep costs low:

- **Smart Compression**: Older messages compressed to 30% of original size
- **Smart Truncation**: Long messages intelligently shortened
- **Deduplication**: Removes repetitive content
- **Priority System**: Keeps recent messages full, compresses older ones

**Result**: 60-90% reduction in input token costs!

```bash
# Configure in .env
MAX_HISTORY_TOKENS=2000  # Keep history under 2000 tokens (default)
```

Monitor token usage in logs:
```
[Token Budget] Before optimization: ~2847 tokens (10 messages)
[Token Budget] After optimization: ~1532 tokens (10 messages)
[AI] Tokens - prompt: 1532, completion: 245, total: 1777
```

See `COST_OPTIMIZATION.md` for detailed guide and savings calculations.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | Server port |
| `OPENROUTER_MODEL` | gpt-4o-mini | Main model |
| `OPENROUTER_EMBED_MODEL` | text-embedding-3-large | Embeddings model |
| `MAX_OUTPUT_TOKENS` | 2048 | Max response length |
| `MAX_HISTORY_TOKENS` | 2000 | Max history tokens (cost control) |
| `RECENT_MESSAGE_COUNT` | 5 | Short-term memory size |
| `RAG_TOP_K` | 4 | Number of RAG results |
| `CHUNK_SIZE` | 1000 | Text chunking size |
| `CHUNK_OVERLAP` | 150 | Chunk overlap size |

## Development

### Project Structure

```
app/src/
├── config/           # Configuration
├── controllers/      # API route handlers
├── memory/          # Memory system
├── middleware/      # Express middleware
├── routes/          # API routes
├── services/        # Business logic
└── utils/           # Utilities

app/public/          # Test UI (dev only)
```

### Adding Features

The codebase is designed to be simple and extensible:

1. **New AI capabilities**: Extend `ai.service.js`
2. **New memory layers**: Add to `memory/memoryLayers.js`
3. **New endpoints**: Add controller + route
4. **New utilities**: Add to `utils/`

## Testing

Manual test scripts in `app/src/dev/`:

```bash
node app/src/dev/testMemoryConfig.js
node app/src/dev/testPromptBudget.js
node app/src/dev/testUnifiedIntegration.js
```

## Deployment

1. Set `NODE_ENV=production`
2. Configure environment variables
3. Ensure PocketBase is accessible
4. Run `npm start`

For production, consider:
- Redis for caching
- PostgreSQL for PocketBase
- Load balancer for scaling
- CDN for static assets

## License

ISC

## Support

For issues or questions, see the GitHub repository.

---

**Built with**: Express, LangChain, OpenRouter, PocketBase
