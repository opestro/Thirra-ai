# Thirra AI

A clean, production-ready AI chat API with advanced memory and RAG capabilities.

## Features

- **🧠 Smart Memory System**: Three-layer memory (short-term, long-term summaries, semantic recall)
- **📚 RAG (Retrieval-Augmented Generation)**: Semantic search with embeddings
- **💾 Facts Store**: Persistent conversation context
- **📎 File Attachments**: Support for text files in conversations
- **🔐 Authentication**: PocketBase integration with cookie/bearer auth
- **⚡ Streaming**: Real-time NDJSON streaming responses

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

# Optional
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_EMBED_MODEL=openai/text-embedding-3-large
MAX_OUTPUT_TOKENS=2048
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
{"type":"final","data":{...}}
```

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

### Utilities

- **`utils/compression.js`** - Context compression
- **`utils/summary.js`** - Conversation summarization
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

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | Server port |
| `OPENROUTER_MODEL` | gpt-4o-mini | Main model |
| `OPENROUTER_EMBED_MODEL` | text-embedding-3-large | Embeddings model |
| `MAX_OUTPUT_TOKENS` | 2048 | Max response length |
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
