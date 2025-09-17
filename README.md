# OptiLLM - Semantic Caching SDK

[![Based on Qdrant semantic caching patterns](https://img.shields.io/badge/Based%20on-Qdrant%20Semantic%20Caching-blue)](https://www.shuttle.dev/blog/2024/05/30/semantic-caching-qdrant-rust)

A lightweight TypeScript SDK for semantic caching of LLM responses using Qdrant vector database. Reduce costs and improve response times by caching semantically similar queries.

[![Watch the demo](https://img.youtube.com/vi/FxUOhAjJoEA/0.jpg)](https://www.youtube.com/embed/FxUOhAjJoEA?si=21bRbGr0mGVgMo95)
 
## Features

- 🚀 **Semantic Caching**: Cache LLM responses based on semantic similarity, not exact matches
- 💰 **Cost Reduction**: Avoid redundant API calls for similar queries
- ⚡ **Fast Retrieval**: Vector-based similarity search with Qdrant
- 🔧 **Flexible**: Support for OpenAI embeddings or local TF-IDF fallback
- 🏢 **Multi-tenant**: Built-in tenant and user scoping
- ⏰ **TTL Support**: Automatic expiration of cached entries
 - 🧠 **Typeahead Suggestions**: HTTP and WebSocket APIs for live suggestions as users type

## Quick Start

### 1. Install

```bash
npm install opti-llm
```

### 2. Setup Qdrant

```bash
# Local Qdrant with Docker
docker run -p 6333:6333 qdrant/qdrant

# Or use Qdrant Cloud (free tier available)
```

### 3. Basic Usage (SDK)

```typescript
import { createOptiLLM } from 'opti-llm';
import OpenAI from 'openai';

// Initialize
const optiLLM = createOptiLLM({
  qdrantUrl: 'http://localhost:6333',
  embedding: {
    provider: 'openai', // or 'local' for testing
    apiKey: process.env.OPENAI_API_KEY,
  },
  similarityThreshold: 0.85
});

await optiLLM.init();

// Your LLM client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cached LLM calls
const result = await optiLLM.capture(
  {
    prompt: "What is Redis vector search?",
    metadata: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      tenantId: 'org1',
      userId: 'user123'
    },
    policy: {
      maxAge: 3600, // 1 hour TTL
      minSimilarity: 0.8
    }
  },
  async () => {
    // This expensive call only happens on cache miss
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: "What is Redis vector search?" }]
    });
    return completion.choices[0].message.content;
  }
);

console.log(result.response); // LLM response
console.log(result.cached);   // true if from cache
console.log(result.cost_saved); // true if cache hit

// Optional: Suggestions (backend SDK)
const suggestions = await optiLLM.suggest({
  text: 'What is Redis vec',
  tenantId: 'org1',
  limit: 5,
  minSimilarity: 0.7,
});
console.log(suggestions);
```

## Configuration

```typescript
interface OptiLLMConfig {
  qdrantUrl: string;              // Qdrant instance URL
  collectionName?: string;        // Collection name (default: 'llm_cache')
  apiKey?: string;                // Qdrant API key (for cloud)
  embedding?: {
    provider: 'openai' | 'local'; // Embedding provider
    apiKey?: string;              // OpenAI API key
    model?: string;               // Embedding model
  };
  defaultTTL?: number;            // Default TTL in seconds
  similarityThreshold?: number;   // Similarity threshold (0-1)
}
```

## Test App (Demo UI + APIs)

Run the included Express test app:

```bash
cd test-app
npm install

# Setup environment variables
cp env.example .env
# Edit .env with your actual API keys

# Start the server
npm run dev
```

Your `.env` file should contain:
```bash
OPENAI_API_KEY=your_openai_api_key
QDRANT_URL=https://your-cluster.region.aws.cloud.qdrant.io
QDRANT_API_KEY=your_qdrant_api_key
```

Test endpoints:
```bash
# Chat with caching
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is semantic caching?"}'

# Test similar query (should hit cache)
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain semantic caching"}'
```

### Endpoints

- `POST /chat` — Cached LLM call (uses SDK `capture()`)
  - Body: `{ "prompt": string, "tenantId"?: string, "userId"?: string }`
  - Returns: `{ response, cached, cost_saved, duration_ms }`

- `GET /suggest?q=...&tenantId=...&limit=...` — HTTP suggestions
  - Returns: `{ items: [{ id, prompt, response, score, createdAt, metadata }] }`

- `WS /ws/suggest?tenantId=...` — WebSocket suggestions
  - Send: `{ text: string, limit?: number, minSimilarity?: number }`
  - Receive: `{ items: [...] }`

### How It Works

1. **Embedding Generation**: Convert prompts to vectors using OpenAI or local embeddings
2. **Similarity Search**: Query Qdrant for semantically similar cached prompts
3. **Cache Hit/Miss**: Return cached response if similarity > threshold, otherwise call LLM
4. **Storage**: Store new LLM responses with metadata and TTL
5. **Cleanup**: Automatic removal of expired entries

## Architecture

Based on proven semantic caching patterns from [Shuttle.dev's Qdrant guide](https://www.shuttle.dev/blog/2024/05/30/semantic-caching-qdrant-rust), adapted for Node.js/TypeScript.

```
┌─────────────────┐
│   Your App      │
│                 │
│  ┌───────────┐  │
│  │ OptiLLM   │  │ ──── Semantic similarity search
│  │    SDK    │  │
│  └─────┬─────┘  │
│        │        │
└────────┼────────┘
         │
    ┌────▼────┐
    │ Qdrant  │ ──── Vector storage & search
    │         │
    └─────────┘
```

## License

MIT


