import OpenAI from 'openai';
import type { EmbeddingProvider } from './types.js';

export class OpenAIEmbedding implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = 'text-embedding-3-small') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text.replace(/\n/g, ' ').trim(),
    });
    return response.data[0].embedding;
  }
}

// Simple local embedding for testing (TF-IDF-like)
export class LocalEmbedding implements EmbeddingProvider {
  private vocab: Map<string, number> = new Map();
  private dim: number;

  constructor(dim = 384) {
    this.dim = dim;
  }

  async embed(text: string): Promise<number[]> {
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    const vector = new Array(this.dim).fill(0);
    
    for (const token of tokens) {
      const hash = this.simpleHash(token) % this.dim;
      vector[hash] += 1;
    }
    
    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return norm > 0 ? vector.map(v => v / norm) : vector;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
