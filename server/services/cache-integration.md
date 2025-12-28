# Redis Cache Integration Strategy

## Overview
Caching system using Upstash Redis to reduce AI costs by 40-60% and improve response times from 2-5s to <500ms for cached responses.

## Cache Hierarchy (by ROI)

### 1. Professor OS Responses (HIGHEST ROI - 40% hit rate expected)
**Problem**: $0.02-0.10 per Claude/GPT call, 100-1000 calls/day = $2-100/day
**Solution**: Cache AI responses by normalized query + user belt level
**TTL**: 24 hours
**Key Format**: `bjjos:professor:{userId}:{hash(message)}`
**Invalidation**: On user profile update (belt change, style change)
**Expected savings**: $20-40/day at scale

### 2. Video Search Results (MEDIUM ROI - 30% hit rate expected)
**Problem**: Complex DB queries with ranking (50-100ms), frequent duplicate searches
**Solution**: Cache search results by query + filters
**TTL**: 4 hours
**Key Format**: `bjjos:video_search:{hash(query+filters)}`
**Invalidation**: When new videos are curated (2x daily)
**Expected savings**: Reduce DB load by 30%, improve UX

### 3. User Context Loading (MEDIUM ROI - 20% hit rate expected)
**Problem**: Multi-table joins (10-20ms) called on every chat
**Solution**: Cache full user context
**TTL**: 2 hours
**Key Format**: `bjjos:user_context:{userId}`
**Invalidation**: On any user profile change
**Expected savings**: Reduce DB queries by 60%

### 4. Video Analysis Results (LOW ROI - very rare access)
**Problem**: Expensive AI analysis but only accessed once
**Solution**: Cache permanently (30 days)
**TTL**: 30 days
**Key Format**: `bjjos:video_analysis:{videoId}`
**Invalidation**: Never (immutable)

## Implementation Priority

### Phase 1: Core Caching (TODAY)
- [x] Install @upstash/redis
- [x] Create cache service with intelligent TTLs
- [ ] Add cache middleware wrapper
- [ ] Apply to Professor OS endpoint
- [ ] Test cache hit rates

### Phase 2: Extended Caching (NEXT)
- [ ] Cache video searches
- [ ] Cache user context
- [ ] Add cache monitoring dashboard
- [ ] Track hit/miss ratios

### Phase 3: Optimization (LATER)
- [ ] Implement cache warming (pre-populate common queries)
- [ ] Add Redis cluster for scale
- [ ] Implement advanced invalidation patterns

## Code Integration Points

### Professor OS Chat (`/api/ai/chat/message`)
```typescript
// Before AI call:
const cacheKey = cache.generateKey('professor', userId, hashMessage(message));
const cached = await cache.get(cacheKey);
if (cached) return cached;

// After AI call:
await cache.set(cacheKey, response, CacheTTL.PROFESSOR_RESPONSE);
```

### Video Search
```typescript
const cacheKey = cache.generateKey('video_search', hashQuery(query));
const cached = await cache.get(cacheKey);
if (cached) return cached;
```

### User Context
```typescript
const cacheKey = cache.generateKey('user_context', userId);
return await cache.cached(cacheKey, CacheTTL.USER_PROFILE, async () => {
  return await loadFullUserContext(userId);
});
```

## Monitoring

### Key Metrics
- Cache hit rate: Target 40%+
- AI cost savings: Target $20-40/day
- Response time improvement: Target 2s → 500ms for hits
- Redis memory usage: Monitor with dbsize()

### Admin Dashboard Integration
Add to Dev OS:
- Cache hit/miss ratios
- Cost savings estimate
- Most cached queries
- Cache size trending
