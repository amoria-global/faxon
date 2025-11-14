/**
 * Settings Cache Service
 * Provides in-memory caching for admin settings with TTL and invalidation
 */

import { EventEmitter } from 'events';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class SettingsCacheService extends EventEmitter {
  private cache: Map<string, CacheEntry<any>>;
  private defaultTTL: number;

  constructor(defaultTTL: number = 5 * 60 * 1000) {
    super();
    this.cache = new Map();
    this.defaultTTL = defaultTTL; // 5 minutes default

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Get cached value or fetch if expired
   */
  async get<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const entry = this.cache.get(key);
    const now = Date.now();

    // Check if cache entry exists and is still valid
    if (entry && now - entry.timestamp < entry.ttl) {
      return entry.data as T;
    }

    // Fetch fresh data
    const data = await fetchFn();

    // Store in cache
    this.set(key, data, ttl);

    return data;
  }

  /**
   * Set cache value
   */
  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });

    this.emit('set', key, data);
  }

  /**
   * Invalidate specific cache key
   */
  invalidate(key: string): void {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.emit('invalidate', key);
    }
  }

  /**
   * Invalidate cache keys matching pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    let count = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.emit('invalidatePattern', pattern, count);
    }

    return count;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.emit('clear');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    keys: string[];
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    const isValid = now - entry.timestamp < entry.ttl;

    if (!isValid) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get cached value without fetching
   */
  getSync<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    const isValid = now - entry.timestamp < entry.ttl;

    if (!isValid) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.emit('cleanup', cleaned);
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanup();
    }, 60 * 1000); // Every minute
  }

  /**
   * Refresh cache entry (extend TTL)
   */
  refresh(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    entry.timestamp = Date.now();
    this.emit('refresh', key);
    return true;
  }

  /**
   * Get remaining TTL for a key
   */
  getRemainingTTL(key: string): number {
    const entry = this.cache.get(key);
    if (!entry) return 0;

    const now = Date.now();
    const elapsed = now - entry.timestamp;
    const remaining = entry.ttl - elapsed;

    return Math.max(0, remaining);
  }
}

// Export singleton instance with default TTL
export const settingsCacheService = new SettingsCacheService(5 * 60 * 1000);

// Export for testing/custom instances
export default settingsCacheService;
