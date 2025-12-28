# 📊 Server Log Monitoring Guide

## What to Look For During Manual Testing

When you send messages to Professor OS, the server logs will show detailed timing telemetry. Here's how to interpret them:

---

## 🔍 Expected Log Output for Each Message

### Normal Request Flow

```
======================================================================
🧪 TEST 1: "I keep getting passed when I play closed guard"
======================================================================
⏱️  Parallel data load complete: 245ms
   ✅ User profile, 100 videos, 12 messages, 5 news items

[PROFESSOR OS PROMPT] Using preloaded context (fast path) ⚡

⏱️  System prompt built (8543 chars): 127ms

⏱️  Claude API call completed: 1234ms

✅ Response validated: All required fields present
   - anticipatoryDiagnosis: 89 chars
   - mainCoaching: 456 chars
   - returnLoop: 67 chars

📝 TOTAL REQUEST TIME: 1847ms ✅
```

---

## 📊 Timing Breakdown Analysis

### Phase 1: Parallel Data Load
```
⏱️  Parallel data load complete: XXXms
```

**Target:** 200-500ms  
**Optimized:** ✅ Uses Promise.all() for concurrent queries

**What's happening:**
- Loading user profile from bjj_users
- Loading top 100 videos from ai_video_knowledge
- Loading last 20 messages from ai_conversation_learning
- Loading last 5 combat news articles

**If you see > 500ms:**
- Database might be slow
- Network latency to Neon
- Too many concurrent requests

---

### Phase 2: System Prompt Build
```
[PROFESSOR OS PROMPT] Using preloaded context (fast path) ⚡
⏱️  System prompt built (XXXX chars): XXms
```

**Target:** 50-200ms  
**Optimized:** ✅ Uses preloaded context (no duplicate queries)

**What's happening:**
- Building comprehensive system prompt
- Loading learning insights (if enabled)
- Integrating combat news
- Applying personalization from user profile

**If you see "slow path" message:**
- ⚠️ Preloaded context not being passed
- This adds 500-1000ms of duplicate queries
- Check ai-chat-claude.ts route

**If you see > 200ms:**
- Learning insights query might be slow
- Large prompt being constructed

---

### Phase 3: Claude API Call
```
⏱️  Claude API call completed: XXXms
```

**Target:** 800-1500ms (unchanged - this is Claude's processing time)  
**Cannot optimize:** This is Claude thinking + generating structured output

**What's happening:**
- Sending system prompt + conversation history to Claude
- Forcing tool use (structured output)
- Claude analyzing context and generating response

**If you see > 2000ms:**
- Claude might be under load
- Complex query requiring more thinking time
- Network latency to Anthropic API

---

### Phase 4: Response Validation
```
✅ Response validated: All required fields present
```

**What's happening:**
- Checking anticipatoryDiagnosis exists and is substantial
- Checking returnLoop exists
- Validating no banned phrases

**If validation fails:**
- ❌ Claude didn't follow tool schema
- Missing required fields
- Empty or malformed response

---

### Total Request Time
```
📝 TOTAL REQUEST TIME: XXXms
```

**Target:** 1500-2500ms  
**Pass Criteria:**
- ✅ < 2000ms (ideal)
- ✅ < 3000ms (acceptable)
- ❌ > 3000ms (too slow - investigate)

**Calculation:**
```
Total = Data Load + Prompt Build + Claude API + Overhead
```

**Optimization Impact:**
- Before: 7000-10000ms
- After: 1500-2500ms
- Improvement: ~75% faster ⚡

---

## 🎯 What Good Looks Like

### ✅ Perfect Request
```
⏱️  Parallel data load complete: 287ms
[PROFESSOR OS PROMPT] Using preloaded context (fast path) ⚡
⏱️  System prompt built (8234 chars): 134ms
⏱️  Claude API call completed: 1187ms
✅ Response validated: All required fields present
📝 TOTAL REQUEST TIME: 1678ms ✅
```

**Analysis:**
- Data load: 287ms ✅ (well under 500ms target)
- Prompt build: 134ms ✅ (used fast path, under 200ms)
- Claude API: 1187ms ✅ (normal Claude thinking time)
- **Total: 1678ms ✅ (PERFECT - under 2s target)**

---

### ⚠️ Slow Request
```
⏱️  Parallel data load complete: 742ms
[PROFESSOR OS PROMPT] Loading context (slow path - consider preloading)
⏱️  System prompt built (8456 chars): 623ms
⏱️  Claude API call completed: 1891ms
✅ Response validated: All required fields present
📝 TOTAL REQUEST TIME: 3298ms ⚠️
```

**Analysis:**
- Data load: 742ms ⚠️ (over target, possible DB lag)
- Prompt build: 623ms ❌ (slow path! duplicate queries)
- Claude API: 1891ms ✅ (normal)
- **Total: 3298ms ❌ (OVER 3s - NEEDS INVESTIGATION)**

**Issues:**
1. "slow path" message = preloaded context not being used
2. Data load slow (might be normal if DB is remote)
3. Overall time > 3000ms fails criteria

---

## 🚨 Warning Signs

### 🔴 Critical Issues

**"slow path" Message:**
```
[PROFESSOR OS PROMPT] Loading context (slow path - consider preloading)
```
**Problem:** Preloaded context not being passed, causing duplicate queries  
**Fix:** Check ai-chat-claude.ts route passes `preloadedContext` parameter

**Very Slow Data Load (> 1000ms):**
```
⏱️  Parallel data load complete: 1847ms
```
**Problem:** Database queries taking too long  
**Possible causes:**
- Network latency to Neon
- Database under heavy load
- Too many concurrent users
- Video table scan (not using index)

**Claude API Timeout (> 3000ms):**
```
⏱️  Claude API call completed: 3421ms
```
**Problem:** Claude taking too long to respond  
**Possible causes:**
- Claude API under load
- Complex query requiring more processing
- Network timeout

**Validation Failures:**
```
❌ Response validation failed: Missing anticipatoryDiagnosis
```
**Problem:** Claude not following structured output schema  
**Possible causes:**
- Tool schema misconfigured
- Claude version changed
- Prompt not forcing tool use

---

## 📈 How to Monitor Live

### Option 1: Watch Server Logs
```bash
# In Replit, view the workflow logs
# Look for "TOTAL REQUEST TIME" lines
```

### Option 2: Browser DevTools
1. Open DevTools → Network tab
2. Send chat message
3. Find `/api/ai/chat/claude/stream` request
4. Check "Time" column
5. Should show 1500-2500ms

### Option 3: Add Temporary Logging
If you want more detailed client-side timing:

```typescript
// In chat.tsx, before sending message
const startTime = Date.now();
console.log('🕐 Sending message...');

// After receiving full response
const totalTime = Date.now() - startTime;
console.log(`⏱️  Client-side total time: ${totalTime}ms`);
```

---

## 📋 Testing Checklist

For each test message, verify logs show:

- [ ] "Parallel data load complete" < 500ms
- [ ] "Using preloaded context (fast path)" message
- [ ] "System prompt built" < 200ms
- [ ] "Claude API call completed" < 2000ms
- [ ] "Response validated: All required fields present"
- [ ] "TOTAL REQUEST TIME" < 2500ms

**If all ✅:** Performance optimization working perfectly!  
**If any ❌:** Investigation needed - check specific phase timing

---

## 🎯 Performance Targets Summary

| Phase | Target | Warning | Critical |
|-------|--------|---------|----------|
| Data Load | < 500ms | 500-1000ms | > 1000ms |
| Prompt Build | < 200ms | 200-500ms | > 500ms |
| Claude API | < 1500ms | 1500-2000ms | > 2000ms |
| **Total** | **< 2000ms** | **2000-3000ms** | **> 3000ms** |

**Overall Success:**
- 90% of requests < 2000ms ✅
- 100% of requests < 3000ms ✅
- Average < 2000ms ✅

---

**Last Updated:** November 13, 2025  
**Optimization:** Parallelized queries + preloaded context  
**Expected Result:** 75% performance improvement (7-10s → 1.5-2.5s)
