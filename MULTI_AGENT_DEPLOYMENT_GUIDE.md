# Multi-Agent Intelligence System - Saturday Launch Deployment Guide

## 🚀 Current Status

**BUILT & READY (Code Complete)**:
- ✅ All 5 AI agents implemented (Interpreter, Matcher, Synthesizer, Evaluator, Model Orchestrator)
- ✅ Engagement tracking system complete
- ✅ Web search handler built
- ✅ Prof. OS chat integration complete (non-breaking, fallback-safe)
- ✅ 3 engagement tracking API endpoints added
- ✅ Multi-agent integration wrapper with feature flags
- ✅ Defensive safeguards added (system disabled until schema deployed)

**BLOCKED**:
- ❌ Database schema NOT deployed (Supabase SSL certificate issue with Drizzle)
- ❌ Multi-agent system DISABLED by default (safety measure)
- ❌ Engagement tracking DISABLED (requires tables)

## 📋 Pre-Launch Checklist

### Step 1: Deploy Database Schema (CRITICAL - 15 min)

**Option A: Supabase SQL Editor (RECOMMENDED)**
1. Open Supabase dashboard → SQL Editor
2. Copy entire contents of `deployment-sql/multi-agent-schema.sql`
3. Paste and run in SQL editor
4. Verify deployment with query at end of script (should show 8 tables)

**Option B: Manual SQL via psql**
```bash
# If you have direct database access
psql $SUPABASE_DATABASE_URL < deployment-sql/multi-agent-schema.sql
```

**Verification**:
```sql
-- Run this to confirm all 8 tables exist:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'prof_queries', 'video_interactions', 'recommendation_outcomes',
    'model_performance', 'query_analysis', 'learning_path_recommendations',
    'ab_test_experiments', 'web_search_log'
  );
```

### Step 2: Enable Multi-Agent System (5 min)

After schema deployment succeeds, edit `server/multi-agent-integration.ts`:

```typescript
// CHANGE THIS (line 31-37):
const DEFAULT_CONFIG: MultiAgentConfig = {
  enabled: true,  // ← CHANGE false to true
  enableInterpreter: true,  // ← CHANGE false to true
  enableMatcher: true,  // ← CHANGE false to true
  enableSynthesizer: false,  // Keep disabled for beta (can enable later)
  enableWebSearch: true,  // Already enabled
  enableEngagementTracking: true  // ← CHANGE false to true
};
```

### Step 3: Restart Application (1 min)

The application will auto-restart when you save the file. Verify in logs:
```
[MULTI-AGENT] System enabled
[ENGAGEMENT] Database tables verified
```

### Step 4: Test End-to-End (10 min)

**Test 1: Prof. OS Query with Multi-Agent Enhancement**
```bash
# Mobile PWA or web interface
1. Login as test user
2. Send query: "I keep getting swept from closed guard, what am I doing wrong?"
3. Check server logs for:
   - "🤖 [MULTI-AGENT] Processing query with intelligence system"
   - "✅ [MULTI-AGENT] Enhancement complete"
4. Verify video recommendations appear
```

**Test 2: Engagement Tracking**
```bash
# After receiving recommendations
1. Click on a video
2. Watch for 30+ seconds
3. Give thumbs up
4. Check database:
   SELECT * FROM video_interactions WHERE user_id = 'YOUR_TEST_USER_ID' ORDER BY created_at DESC LIMIT 1;
   # Should show: clicked=true, watch_duration=30+, thumbs_up=true
```

**Test 3: Multi-Agent Metadata Logging**
```bash
# Check query analysis
SELECT * FROM query_analysis ORDER BY created_at DESC LIMIT 5;
# Should show: emotional_state, inferred_skill_level, root_problem
```

### Step 5: Monitor for 24 Hours (Ongoing)

**Key Metrics to Watch**:
- Multi-agent system call success rate
- Engagement tracking insert success rate  
- Recommendation quality scores (after 24 hrs)
- Error logs for any crashes

**Dashboard Queries**:
```sql
-- Multi-agent usage today
SELECT COUNT(*) as queries, 
       AVG(complexity_score) as avg_complexity
FROM query_analysis 
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Engagement tracking today
SELECT 
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) as total_interactions,
  AVG(watch_duration) as avg_watch_duration_sec,
  SUM(CASE WHEN thumbs_up THEN 1 ELSE 0 END)::float / COUNT(*) as thumbs_up_rate
FROM video_interactions
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Top performing videos (by engagement)
SELECT 
  vi.video_id,
  COUNT(DISTINCT vi.user_id) as unique_viewers,
  AVG(vi.watch_duration) as avg_watch_sec,
  SUM(CASE WHEN vi.completed THEN 1 ELSE 0 END)::float / COUNT(*) as completion_rate,
  SUM(CASE WHEN vi.thumbs_up THEN 1 ELSE 0 END)::float / COUNT(*) as thumbs_up_rate
FROM video_interactions vi
WHERE vi.created_at > NOW() - INTERVAL '24 hours'
GROUP BY vi.video_id
ORDER BY completion_rate DESC
LIMIT 10;
```

## 🧠 System Architecture

### Agent Pipeline Flow

```
User Query
    ↓
[Interpreter Agent] → Understands intent, emotional state, skill level
    ↓
[Matcher Agent] → Multi-objective optimization (relevance, pedagogy, engagement)
    ↓
[Prof. OS AI] → Generates response with ranked videos
    ↓
User Interaction
    ↓
[Engagement Tracker] → Logs clicks, watch time, feedback
    ↓
[Evaluator Agent] → Measures quality (runs nightly)
    ↓
Continuous Learning Loop
```

### Feature Flags (Default Config)

| Feature | Enabled | Table Dependencies |
|---------|---------|-------------------|
| Interpreter | ✅ Yes | prof_queries, query_analysis |
| Matcher | ✅ Yes | prof_queries, video_interactions |
| Synthesizer | ❌ No | learning_path_recommendations |
| Web Search | ✅ Yes | web_search_log |
| Engagement Tracking | ✅ Yes | video_interactions, recommendation_outcomes |

### Fallback Behavior

If multi-agent system fails:
- ✅ Chat continues with existing ranking algorithm
- ✅ User sees no errors
- ⚠️ Logs will show multi-agent failure (expected during schema deployment)
- ✅ System auto-recovers when tables exist

## 🔧 Troubleshooting

### Issue: Multi-agent not activating
**Symptoms**: Logs show "MULTI-AGENT System disabled"
**Solution**: Check `DEFAULT_CONFIG.enabled` in `multi-agent-integration.ts`

### Issue: Engagement tracking not working
**Symptoms**: API calls return 500, logs show table errors
**Solution**: 
1. Verify tables exist: `SELECT * FROM video_interactions LIMIT 1;`
2. Check `DEFAULT_CONFIG.enableEngagementTracking` is true

### Issue: Evaluator crashes
**Symptoms**: Cron job errors in logs
**Solution**: Evaluator requires 24 hours of data. Disable in `intelligence-scheduler.ts` for first day if needed.

### Issue: Query analysis empty
**Symptoms**: `query_analysis` table has no rows
**Solution**: Interpreter agent requires OpenAI API key. Check `OPENAI_API_KEY` env var.

## 📊 Success Criteria

**Launch is successful when**:
1. ✅ All 8 database tables created
2. ✅ Multi-agent system processes ≥50% of queries without errors
3. ✅ Engagement tracking captures ≥80% of video clicks
4. ✅ No user-facing errors in chat interface
5. ✅ Recommendation quality baseline established (after 24 hrs)

## 🎯 Post-Launch Optimization

**Week 1**:
- Monitor engagement patterns
- Identify low-quality recommendations
- Tune matcher weights if needed

**Week 2**:
- Enable Synthesizer agent (learning paths)
- Run first A/B test (existing vs multi-agent ranking)

**Month 1**:
- Analyze continuous learning effectiveness
- Build admin dashboard for multi-agent metrics
- Optimize model selection (GPT-4o vs Claude)

## 📞 Support

If issues arise during deployment:
1. Check logs: `refresh_all_logs` tool or console
2. Review architect feedback in this session
3. SQL deployment script has inline comments for troubleshooting

---

**Built by**: BJJ OS AI Team
**Date**: October 21, 2025  
**Version**: 1.0 (Saturday Beta Launch)
