import express from 'express';
import OpenAI from 'openai';
import { createOptiLLM } from 'opti-llm';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(express.json());

// Initialize OptiLLM
const optiLLM = createOptiLLM({
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY, // For Qdrant Cloud
  embedding: {
    provider: process.env.OPENAI_API_KEY ? 'openai' : 'local',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'text-embedding-3-small'
  },
  similarityThreshold: 0.8,
  defaultTTL: 1800 // 30 minutes
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key'
});

// Initialize OptiLLM on startup
await optiLLM.init();
console.log('✅ OptiLLM initialized');

// Chat endpoint with semantic caching
app.post('/chat', async (req, res) => {
  try {
    const { prompt, userId = 'anonymous', tenantId = 'default' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const startTime = Date.now();

    const result = await optiLLM.capture(
      {
        prompt,
        metadata: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          userId,
          tenantId
        },
        policy: {
          maxAge: 1800, // 30 minutes
          minSimilarity: 0.8
        }
      },
      async () => {
        // This is the expensive LLM call
        if (!process.env.OPENAI_API_KEY) {
          // Mock response for testing without API key
          return `Mock response for: "${prompt}"`;
        }

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 500
        });

        return completion.choices[0].message.content || 'No response';
      }
    );

    const duration = Date.now() - startTime;

    res.json({
      response: result.response,
      cached: result.cached,
      cost_saved: result.cost_saved || false,
      duration_ms: duration,
      metadata: {
        userId,
        tenantId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Suggest endpoint (HTTP) for typeahead suggestions
app.get('/suggest', async (req, res) => {
  try {
    const text = String(req.query.q || '');
    const tenantId = String(req.query.tenantId || 'default');
    const limit = Number(req.query.limit || 5);
    const minSimilarity = Number(req.query.minSimilarity || 0.7);
    if (!text) return res.json({ items: [] });
    const items = await optiLLM.suggest({ text, tenantId, limit, minSimilarity });
    res.json({ items });
  } catch (err) {
    console.error('Suggest error:', err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Test endpoint
app.get('/test', async (req, res) => {
  try {
    const stats = await optiLLM.getStats();
    res.json({
      message: 'OptiLLM is working!',
      stats,
      endpoints: {
        chat: 'POST /chat - Send a prompt to get cached LLM response',
        cleanup: 'POST /cleanup - Clean expired cache entries'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cleanup endpoint
app.post('/cleanup', async (req, res) => {
  try {
    await optiLLM.cleanup();
    res.json({ message: 'Cache cleanup completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Test app running on http://localhost:${PORT}`);
  console.log(`📝 Try: curl -X POST http://localhost:${PORT}/chat -H "Content-Type: application/json" -d '{"prompt":"What is Redis?"}'`);
  console.log(`🔧 Environment: ${process.env.OPENAI_API_KEY ? 'OpenAI' : 'Local'} embeddings`);
  console.log(`🗄️  Qdrant: ${process.env.QDRANT_URL || 'http://localhost:6333'}`);
  console.log(`🔑 Qdrant API Key: ${process.env.QDRANT_API_KEY ? 'Configured' : 'Not set (using local)'}`);
});

// WebSocket for live suggestions: ws://host/ws/suggest?tenantId=default
const wss = new WebSocketServer({ noServer: true });

// Upgrade HTTP server to handle WS route
const httpServer = app.listen(Number(process.env.WS_PORT || PORT) + 1);
httpServer.on('upgrade', (req, socket, head) => {
  const { url } = req;
  if (url && url.startsWith('/ws/suggest')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  const searchParams = new URL(req.url, 'http://localhost').searchParams;
  const tenantId = searchParams.get('tenantId') || 'default';
  let lastText = '';
  let closed = false;

  ws.on('message', async (msg) => {
    if (closed) return;
    try {
      const { text, limit = 5, minSimilarity = 0.7 } = JSON.parse(String(msg));
      if (typeof text !== 'string') return;
      if (text === lastText) return; // throttle duplicates
      lastText = text;
      const items = await optiLLM.suggest({ text, tenantId, limit, minSimilarity });
      ws.send(JSON.stringify({ items }));
    } catch (err) {
      // ignore malformed input
    }
  });

  ws.on('close', () => {
    closed = true;
  });
});
