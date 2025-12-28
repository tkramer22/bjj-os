/**
 * 🚀 PROFESSOR OS SPEED CACHE
 * 
 * In-memory caching for Professor OS with smart invalidation.
 * Caches user context (5 min TTL) and video library (1 hour TTL).
 * 
 * Zero impact on response quality - same data, just faster.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class ProfessorOSCache {
  private userCache = new Map<string, CacheEntry<any>>();
  private videoCache = new Map<string, CacheEntry<any[]>>();
  private newsCache: CacheEntry<any[]> | null = null;
  
  private readonly USER_TTL = 5 * 60 * 1000;  // 5 minutes
  private readonly VIDEO_TTL = 60 * 60 * 1000; // 1 hour
  private readonly NEWS_TTL = 15 * 60 * 1000;  // 15 minutes
  
  // ═══════════════════════════════════════════════════════════════
  // USER CONTEXT CACHE (5 minute TTL)
  // ═══════════════════════════════════════════════════════════════
  
  getUserContext(userId: string): any | null {
    const entry = this.userCache.get(userId);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.userCache.delete(userId);
      return null;
    }
    
    console.log(`[CACHE] ✅ User context HIT for ${userId}`);
    return entry.data;
  }
  
  setUserContext(userId: string, data: any): void {
    this.userCache.set(userId, {
      data,
      timestamp: Date.now(),
      ttl: this.USER_TTL
    });
    console.log(`[CACHE] 💾 User context SET for ${userId}`);
  }
  
  invalidateUser(userId: string): void {
    this.userCache.delete(userId);
    console.log(`[CACHE] 🗑️ User context INVALIDATED for ${userId}`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // VIDEO LIBRARY CACHE (1 hour TTL)
  // ═══════════════════════════════════════════════════════════════
  
  getVideos(cacheKey: string): any[] | null {
    const entry = this.videoCache.get(cacheKey);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.videoCache.delete(cacheKey);
      return null;
    }
    
    console.log(`[CACHE] ✅ Video library HIT for key: ${cacheKey.substring(0, 30)}...`);
    return entry.data;
  }
  
  setVideos(cacheKey: string, videos: any[]): void {
    this.videoCache.set(cacheKey, {
      data: videos,
      timestamp: Date.now(),
      ttl: this.VIDEO_TTL
    });
    console.log(`[CACHE] 💾 Video library SET (${videos.length} videos)`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // COMBAT NEWS CACHE (15 minute TTL)
  // ═══════════════════════════════════════════════════════════════
  
  getNews(): any[] | null {
    if (!this.newsCache) return null;
    
    if (Date.now() - this.newsCache.timestamp > this.newsCache.ttl) {
      this.newsCache = null;
      return null;
    }
    
    console.log(`[CACHE] ✅ News HIT (${this.newsCache.data.length} articles)`);
    return this.newsCache.data;
  }
  
  setNews(news: any[]): void {
    this.newsCache = {
      data: news,
      timestamp: Date.now(),
      ttl: this.NEWS_TTL
    };
    console.log(`[CACHE] 💾 News SET (${news.length} articles)`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CACHE STATS
  // ═══════════════════════════════════════════════════════════════
  
  getStats(): { users: number; videoKeys: number; hasNews: boolean } {
    return {
      users: this.userCache.size,
      videoKeys: this.videoCache.size,
      hasNews: this.newsCache !== null
    };
  }
  
  clearAll(): void {
    this.userCache.clear();
    this.videoCache.clear();
    this.newsCache = null;
    console.log('[CACHE] 🧹 All caches cleared');
  }
}

export const professorOSCache = new ProfessorOSCache();

/**
 * 🚀 CENTRALIZED CACHE INVALIDATION HELPER
 * Call this after any user context mutation to ensure fresh personalization.
 * Safe to call even if userId is undefined (no-op in that case).
 */
export async function invalidateUserCache(userId: string | undefined | null): Promise<void> {
  if (!userId) return;
  try {
    professorOSCache.invalidateUser(userId);
  } catch (e) {
    console.log('[CACHE] Failed to invalidate user cache (non-critical):', e);
  }
}
