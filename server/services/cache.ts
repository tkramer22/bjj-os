import { Redis } from '@upstash/redis';

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!.trim(),
  token: process.env.UPSTASH_REDIS_REST_TOKEN!.trim(),
});

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  prefix?: string; // Key prefix for organization
}

// Intelligent TTL configurations based on data volatility
export const CacheTTL = {
  // Professor OS responses (high value, medium volatility)
  PROFESSOR_RESPONSE: 60 * 60 * 24, // 24 hours - personalized coaching responses
  
  // Video search results (medium value, low volatility)
  VIDEO_SEARCH: 60 * 60 * 4, // 4 hours - search results change when new videos added
  
  // Video details (high value, very low volatility)
  VIDEO_DETAILS: 60 * 60 * 24 * 7, // 7 days - video metadata rarely changes
  
  // User profile data (high value, medium volatility)
  USER_PROFILE: 60 * 60 * 2, // 2 hours - updated when user modifies profile
  
  // AI analysis results (high value, very low volatility)
  AI_ANALYSIS: 60 * 60 * 24 * 30, // 30 days - video analysis is immutable
  
  // Instructor profiles (medium value, low volatility)
  INSTRUCTOR_PROFILE: 60 * 60 * 24, // 24 hours
  
  // Combat sports news (low value, high volatility)
  NEWS_FEED: 60 * 15, // 15 minutes - frequently updated
};

/**
 * Cache service with intelligent TTLs and key management
 */
export class CacheService {
  /**
   * Get cached value
   * Upstash Redis automatically handles JSON serialization/deserialization
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get<T>(key);
      if (value !== null) {
        console.log(`[CACHE HIT] ${key}`);
      }
      return value;
    } catch (error) {
      console.error('[CACHE ERROR] Get failed:', error);
      return null; // Fail gracefully - don't break the app
    }
  }

  /**
   * Set cached value with TTL
   * Upstash Redis automatically handles JSON serialization
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    try {
      // Upstash Redis handles JSON.stringify automatically
      await redis.setex(key, ttl, value);
      console.log(`[CACHE SET] ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      console.error('[CACHE ERROR] Set failed:', error);
      // Fail gracefully - don't break the app
    }
  }

  /**
   * Delete cached value(s)
   */
  async delete(key: string | string[]): Promise<void> {
    try {
      if (Array.isArray(key)) {
        await Promise.all(key.map(k => redis.del(k)));
        console.log(`[CACHE DELETE] ${key.length} keys`);
      } else {
        await redis.del(key);
        console.log(`[CACHE DELETE] ${key}`);
      }
    } catch (error) {
      console.error('[CACHE ERROR] Delete failed:', error);
    }
  }

  /**
   * Delete all keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      // Upstash Redis doesn't support SCAN, so we'll use a simple pattern match
      // For production, you'd want to track keys in a set
      console.log(`[CACHE DELETE PATTERN] ${pattern}`);
      // Note: This is a limitation - we'll need to track invalidation manually
    } catch (error) {
      console.error('[CACHE ERROR] Delete pattern failed:', error);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('[CACHE ERROR] Exists check failed:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ dbsize: number }> {
    try {
      const dbsize = await redis.dbsize();
      return { dbsize };
    } catch (error) {
      console.error('[CACHE ERROR] Stats failed:', error);
      return { dbsize: 0 };
    }
  }

  /**
   * Generate cache key with prefix
   */
  generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `bjjos:${prefix}:${parts.join(':')}`;
  }

  /**
   * Cached function wrapper - automatically caches function results
   */
  async cached<T>(
    key: string,
    ttl: number,
    fn: () => Promise<T>
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn();
    await this.set(key, result, ttl);
    return result;
  }
}

// Export singleton instance
export const cache = new CacheService();

/**
 * Cache invalidation helpers
 */
export const invalidateCache = {
  /**
   * Invalidate user-related caches when profile changes
   */
  async user(userId: number): Promise<void> {
    const keys = [
      cache.generateKey('user', userId),
      cache.generateKey('professor', userId),
    ];
    await cache.delete(keys);
  },

  /**
   * Invalidate video caches when new videos are added
   */
  async videos(): Promise<void> {
    // Note: In production, you'd want to track search query keys
    // For now, we'll just log and let them expire naturally
    console.log('[CACHE] Video cache invalidation triggered - will expire naturally');
  },

  /**
   * Invalidate all caches (use sparingly!)
   */
  async all(): Promise<void> {
    console.log('[CACHE] Full cache flush requested - not implemented for safety');
    // Don't implement this unless absolutely necessary
  },
};
