import express from 'express';
import OpenAI from 'openai';
import { createOptiLLM } from 'opti-llm';

const app = express();
app.use(express.json());

// Initialize OptiLLM
const optiLLM = createOptiLLM({
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
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
});
