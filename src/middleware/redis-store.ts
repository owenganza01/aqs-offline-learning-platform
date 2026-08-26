// src/middleware/redis-store.ts
// Redis-backed rate limit store for multi-instance deployments.
// Only loaded when REDIS_URL is configured.

import Redis from 'ioredis';
import { RateLimitStore } from './rate-limit.js';

export class RedisStore implements RateLimitStore {
  private client: Redis;
  private prefix: string;

  constructor(redisUrl: string, prefix = 'rl:') {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    this.prefix = prefix;
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; ttl: number }> {
    const redisKey = `${this.prefix}${key}`;
    const count = await this.client.incr(redisKey);
    if (count === 1) {
      await this.client.pexpire(redisKey, windowMs);
    }
    const ttl = await this.client.pttl(redisKey);
    return { count, ttl: Math.max(ttl, 0) };
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}
