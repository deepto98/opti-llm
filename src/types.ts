export interface OptiLLMConfig {
  qdrantUrl: string;
  collectionName?: string;
  apiKey?: string; // Qdrant API key (optional for local)
  embedding?: {
    provider: 'openai' | 'local';
    apiKey?: string;
    model?: string;
  };
  defaultTTL?: number; // seconds
  similarityThreshold?: number; // 0-1, higher = more strict
}

export interface CaptureOptions {
  prompt: string;
  metadata: {
    provider: string;
    model: string;
    userId?: string;
    tenantId?: string;
  };
  policy?: {
    maxAge?: number; // seconds
    minSimilarity?: number; // override default
  };
}

export interface CachedResult {
  id: string;
  response: string;
  score: number;
  metadata: any;
  createdAt: number;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export interface SuggestOptions {
  text: string;
  tenantId?: string;
  limit?: number;
  minSimilarity?: number;
}

export interface SuggestItem {
  id: string;
  prompt?: string;
  response?: string;
  score: number;
  createdAt: number;
  metadata: any;
}
