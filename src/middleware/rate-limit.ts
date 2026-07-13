// Configurable in-memory rate limiter
// Abstraction designed for future Redis migration — swap the store implementation

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Abstract store interface — implement RedisStore for multi-instance deployment
interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; ttl: number }>;
}

// In-memory implementation (single-instance, production-safe for beta)
class MemoryStore implements RateLimitStore {
  private entries = new Map<string, RateLimitEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
    this.cleanupTimer.unref();
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; ttl: number }> {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + windowMs });
      return { count: 1, ttl: windowMs };
    }

    entry.count++;
    return { count: entry.count, ttl: entry.resetAt - now };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupTimer);
    this.entries.clear();
  }
}

let store: RateLimitStore = new MemoryStore();

// Allow injecting a Redis store for multi-instance production
export function setRateLimitStore(customStore: RateLimitStore) {
  store = customStore;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  skip?: (req: Request) => boolean;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, message = 'Too many requests, please try again later', skip } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (skip?.(req)) {
      return next();
    }

    const key = `rl:${req.ip}:${req.path}`;
    const result = await store.increment(key, windowMs);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - result.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.ttl / 1000));

    if (result.count > max) {
      res.setHeader('Retry-After', Math.ceil(result.ttl / 1000));
      return res.status(429).json({ error: message });
    }

    next();
  };
}
