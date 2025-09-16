import { QdrantCache } from './qdrant.js';
import { OpenAIEmbedding, LocalEmbedding } from './embedding.js';
import type { OptiLLMConfig, CaptureOptions, EmbeddingProvider } from './types.js';

export class OptiLLM {
  private cache: QdrantCache;
  private embedder: EmbeddingProvider;
  private config: OptiLLMConfig & {
    collectionName: string;
    defaultTTL: number;
    similarityThreshold: number;
    embedding: { provider: 'openai' | 'local'; apiKey?: string; model?: string; };
  };

  constructor(config: OptiLLMConfig) {
    this.config = {
      collectionName: 'llm_cache',
      embedding: { provider: 'local' },
      defaultTTL: 3600, // 1 hour
      similarityThreshold: 0.85,
      ...config,
    };

    this.cache = new QdrantCache(
      this.config.qdrantUrl,
      this.config.collectionName,
      this.config.apiKey
    );

    // Initialize embedding provider
    if (this.config.embedding.provider === 'openai') {
      if (!this.config.embedding.apiKey) {
        throw new Error('OpenAI API key required for OpenAI embedding provider');
      }
      this.embedder = new OpenAIEmbedding(
        this.config.embedding.apiKey,
        this.config.embedding.model
      );
    } else {
      this.embedder = new LocalEmbedding();
    }
  }

  async init(): Promise<void> {
    // Test embedding to get vector size
    const testVector = await this.embedder.embed('test');
    await this.cache.ensureCollection(testVector.length);
  }

  async capture<T>(
    options: CaptureOptions,
    llmCall: () => Promise<T>
  ): Promise<{ response: T; cached: boolean; cost_saved?: boolean }> {
    const { prompt, metadata, policy } = options;
    
    // Generate embedding
    const vector = await this.embedder.embed(prompt);
    
    // Build filter for tenant/user scoping
    const filter: any = {};
    if (metadata.tenantId) {
      filter.must = filter.must || [];
      filter.must.push({
        match: { 'metadata.tenantId': metadata.tenantId }
      });
    }

    // Search for similar cached results
    const threshold = policy?.minSimilarity ?? this.config.similarityThreshold;
    const results = await this.cache.search(vector, 1, threshold, filter);

    // Check for valid cached result
    if (results.length > 0) {
      const cached = results[0];
      
      // Check TTL if specified
      const maxAge = policy?.maxAge ?? this.config.defaultTTL;
      const age = (Date.now() - cached.createdAt) / 1000;
      
      if (!maxAge || age < maxAge) {
        console.log(`Cache HIT: score=${cached.score.toFixed(3)}, age=${age.toFixed(1)}s`);
        return { 
          response: cached.response as T, 
          cached: true, 
          cost_saved: true 
        };
      }
    }

    // Cache miss - call LLM
    console.log('Cache MISS: calling LLM');
    const response = await llmCall();
    
    // Store in cache
    const ttl = policy?.maxAge ?? this.config.defaultTTL;
    await this.cache.store(
      vector,
      JSON.stringify(response),
      { ...metadata, prompt },
      ttl
    );

    return { response, cached: false };
  }

  async getStats(): Promise<any> {
    // Simple stats - could be enhanced
    return {
      collection: this.config.collectionName,
      embedding_provider: this.config.embedding.provider,
      threshold: this.config.similarityThreshold,
    };
  }

  async cleanup(): Promise<void> {
    await this.cache.cleanup();
  }
}

// Convenience exports
export { OpenAIEmbedding, LocalEmbedding } from './embedding.js';
export type { OptiLLMConfig, CaptureOptions, EmbeddingProvider } from './types.js';

// Factory function for easy setup
export function createOptiLLM(config: OptiLLMConfig): OptiLLM {
  return new OptiLLM(config);
}
