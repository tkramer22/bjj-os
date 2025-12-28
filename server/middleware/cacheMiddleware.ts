import { Request, Response, NextFunction } from 'express';
import { cache, CacheTTL } from '../services/cache';
import crypto from 'crypto';

/**
 * Generate cache key from request
 * Includes method, path, query params, and body to prevent cross-contamination
 */
function generateCacheKey(req: Request, prefix: string): string {
  // Extract all relevant request data
  const { userId, message, ...bodyParams } = req.body || {};
  
  // Create a normalized representation including ALL request data
  const keyData = {
    method: req.method,
    path: req.path,
    userId: userId || req.user?.userId || 'anon',
    message: message?.toLowerCase().trim(),
    queryParams: req.query, // Include GET query params
    bodyParams: bodyParams,
  };
  
  // Hash the data for consistent key generation
  const hash = crypto
    .createHash('md5')
    .update(JSON.stringify(keyData))
    .digest('hex')
    .substring(0, 12); // Use first 12 chars for readability
  
  return cache.generateKey(prefix, keyData.userId, hash);
}

/**
 * Cache middleware - caches successful responses
 * @param prefix - Cache key prefix (e.g., 'professor', 'video_search')
 * @param ttl - Time to live in seconds
 * @param shouldCache - Function to determine if response should be cached
 */
export function cacheMiddleware(
  prefix: string,
  ttl: number,
  shouldCache?: (req: Request, res: Response, data: any) => boolean
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Generate cache key
    const cacheKey = generateCacheKey(req, prefix);
    
    try {
      // Try to get from cache
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        console.log(`[CACHE MIDDLEWARE] 🎯 HIT: ${prefix} - Saved AI call!`);
        
        // Add cache header for monitoring
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        
        return res.json(cached);
      }
      
      console.log(`[CACHE MIDDLEWARE] ❌ MISS: ${prefix} - Will cache response`);
      res.setHeader('X-Cache', 'MISS');
      
    } catch (error) {
      console.error('[CACHE MIDDLEWARE] Error reading cache:', error);
      // Continue without cache on error
    }
    
    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    
    res.json = function(data: any) {
      // Only cache successful responses (status 200)
      if (res.statusCode === 200) {
        // Check if we should cache this response
        if (!shouldCache || shouldCache(req, res, data)) {
          // Cache asynchronously (don't wait)
          cache.set(cacheKey, data, ttl).catch(err => {
            console.error('[CACHE MIDDLEWARE] Error writing cache:', err);
          });
          
          console.log(`[CACHE MIDDLEWARE] ✅ CACHED: ${prefix} (TTL: ${ttl}s)`);
        }
      }
      
      return originalJson(data);
    };
    
    next();
  };
}

/**
 * Conditional cache - only cache for specific conditions
 */
export function conditionalCache(
  prefix: string,
  ttl: number,
  condition: (req: Request) => boolean
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (condition(req)) {
      return cacheMiddleware(prefix, ttl)(req, res, next);
    }
    next();
  };
}

/**
 * Professor OS cache config
 * Caches responses but not for admin users or queries with high personalization
 */
export const professorOSCache = cacheMiddleware(
  'professor',
  CacheTTL.PROFESSOR_RESPONSE,
  (req, res, data) => {
    // Don't cache if error response
    if (data.error) return false;
    
    // Don't cache for admin users (they might be testing)
    if (req.user?.isAdmin) {
      console.log('[CACHE] Skipping cache for admin user');
      return false;
    }
    
    // Cache successful AI responses
    return data.message || data.response;
  }
);

/**
 * Video search cache config
 */
export const videoSearchCache = cacheMiddleware(
  'video_search',
  CacheTTL.VIDEO_SEARCH,
  (req, res, data) => {
    // Don't cache empty results
    if (!data.videos || data.videos.length === 0) return false;
    
    return true;
  }
);

/**
 * User context cache config
 */
export const userContextCache = cacheMiddleware(
  'user_context',
  CacheTTL.USER_PROFILE,
  (req, res, data) => {
    // Only cache if we have user data
    return data.user || data.context;
  }
);
