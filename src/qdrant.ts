import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';
import type { CachedResult } from './types.js';

export class QdrantCache {
  private client: QdrantClient;
  private collectionName: string;

  constructor(url: string, collectionName: string, apiKey?: string) {
    this.client = new QdrantClient({
      url,
      apiKey,
    });
    this.collectionName = collectionName;
  }

  async ensureCollection(vectorSize: number): Promise<void> {
    try {
      await this.client.getCollection(this.collectionName);
    } catch {
      // Collection doesn't exist, create it
      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine', // Better for semantic similarity
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      });
      console.log(`Created Qdrant collection: ${this.collectionName}`);
    }
  }

  async search(
    vector: number[],
    limit = 1,
    scoreThreshold = 0.8,
    filter?: any
  ): Promise<CachedResult[]> {
    const searchParams: any = {
      vector,
      limit,
      score_threshold: scoreThreshold,
      with_payload: true,
    };
    
    // Only add filter if it's defined and not empty
    if (filter) {
      searchParams.filter = filter;
    }
    
    try {
      const results = await this.client.search(this.collectionName, searchParams);
      return results.map(result => ({
        id: result.id as string,
        response: result.payload?.response as string,
        score: result.score || 0,
        metadata: result.payload?.metadata || {},
        createdAt: result.payload?.createdAt as number || Date.now(),
      }));
    } catch (error) {
      console.error('Qdrant search error:', error);
      console.error('Search params:', JSON.stringify(searchParams, null, 2));
      throw error;
    }
  }

  async store(
    vector: number[],
    response: string,
    metadata: any,
    ttl?: number
  ): Promise<string> {
    const id = uuidv4();
    const now = Date.now();
    
    const payload: any = {
      response,
      metadata,
      createdAt: now,
    };

    if (ttl) {
      payload.expiresAt = now + (ttl * 1000);
    }

    await this.client.upsert(this.collectionName, {
      points: [{
        id,
        vector,
        payload,
      }],
    });

    return id;
  }

  async cleanup(): Promise<void> {
    // Remove expired entries
    const now = Date.now();
    
    try {
      await this.client.delete(this.collectionName, {
        filter: {
          must: [{
            key: 'expiresAt',
            range: {
              lt: now,
            },
          }],
        },
      });
    } catch (error) {
      // Ignore cleanup errors
      console.warn('Cleanup failed:', error);
    }
  }
}
