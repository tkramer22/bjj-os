# Launch Day SQL Queries - BJJ OS

**Quick Reference:** Copy/paste these queries into Replit's database tool on launch day.

---

## 🔧 WHERE TO RUN THESE QUERIES

**Method 1: Replit Database Tool (Easiest)**
1. Click "Tools" in left sidebar
2. Click "Database"
3. Click "Query" tab
4. Paste query, click "Run"

**Method 2: Your Agent's Database Tool**
- Just ask: "Run this SQL query: [paste query]"
- I'll execute it for you

**Method 3: External Tool (psql, TablePlus, etc.)**
- Connection string is in environment variable: `DATABASE_URL`
- Find it in Secrets panel

---

## 📋 ESSENTIAL QUERIES FOR LAUNCH DAY

### 1️⃣ Grant Lifetime Access to a Beta Tester

**Single user:**
```sql
UPDATE bjj_users 
SET subscription_tier = 'lifetime', 
    subscription_status = 'active'
WHERE phone_number = '+15551234567';
```

**Multiple users at once:**
```sql
UPDATE bjj_users 
SET subscription_tier = 'lifetime', 
    subscription_status = 'active'
WHERE phone_number IN (
  '+15551234567',
  '+15559876543',
  '+15555555555'
);
```

**Verify it worked:**
```sql
SELECT phone_number, subscription_tier, subscription_status 
FROM bjj_users 
WHERE phone_number IN ('+15551234567', '+15559876543');
```

---

### 2️⃣ View Recent Signups

**Last 20 signups:**
```sql
SELECT 
  phone_number,
  created_at,
  onboarding_completed,
  subscription_status,
  last_login
FROM bjj_users 
ORDER BY created_at DESC 
LIMIT 20;
```

**Today's signups only:**
```sql
SELECT 
  phone_number,
  created_at,
  onboarding_completed,
  subscription_status
FROM bjj_users 
WHERE created_at >= CURRENT_DATE
ORDER BY created_at DESC;
```

**With verification status:**
```sql
SELECT 
  phone_number,
  created_at,
  onboarding_completed,
  CASE 
    WHEN verification_code IS NULL THEN 'Verified ✅'
    ELSE 'Pending ⏳'
  END as status
FROM bjj_users 
WHERE created_at >= CURRENT_DATE
ORDER BY created_at DESC;
```

---

### 3️⃣ Count Signups

**Total signups today:**
```sql
SELECT COUNT(*) as signups_today
FROM bjj_users 
WHERE created_at >= CURRENT_DATE;
```

**Total signups all time:**
```sql
SELECT COUNT(*) as total_users FROM bjj_users;
```

**Breakdown by status:**
```sql
SELECT 
  subscription_status,
  COUNT(*) as count
FROM bjj_users 
GROUP BY subscription_status
ORDER BY count DESC;
```

**Signups per hour today:**
```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as signups
FROM bjj_users 
WHERE created_at >= CURRENT_DATE
GROUP BY hour
ORDER BY hour;
```

---

### 4️⃣ View All Users with Lifetime Access

```sql
SELECT 
  phone_number,
  created_at,
  last_login,
  onboarding_completed
FROM bjj_users 
WHERE subscription_tier = 'lifetime'
ORDER BY created_at DESC;
```

**Count lifetime users:**
```sql
SELECT COUNT(*) as lifetime_users
FROM bjj_users 
WHERE subscription_tier = 'lifetime';
```

---

### 5️⃣ Check User Engagement

**Active users (sent at least 1 message):**
```sql
SELECT 
  u.phone_number,
  COUNT(c.id) as message_count,
  MAX(c.created_at) as last_message
FROM bjj_users u
LEFT JOIN conversations c ON u.id = c.user_id
WHERE c.created_at >= CURRENT_DATE
GROUP BY u.id, u.phone_number
HAVING COUNT(c.id) > 0
ORDER BY message_count DESC;
```

**Total messages sent today:**
```sql
SELECT COUNT(*) as messages_today
FROM conversations
WHERE created_at >= CURRENT_DATE;
```

**Users who completed onboarding but haven't sent a message:**
```sql
SELECT 
  u.phone_number,
  u.created_at,
  u.onboarding_completed
FROM bjj_users u
LEFT JOIN conversations c ON u.id = c.user_id
WHERE u.onboarding_completed = true
  AND c.id IS NULL
ORDER BY u.created_at DESC;
```

---

### 6️⃣ Video Analytics

**Most watched videos today:**
```sql
SELECT 
  v.technique_name,
  v.instructor_name,
  COUNT(sv.id) as times_saved
FROM ai_video_knowledge v
LEFT JOIN saved_videos sv ON v.id = sv.video_id
WHERE sv.saved_at >= CURRENT_DATE
GROUP BY v.id, v.technique_name, v.instructor_name
ORDER BY times_saved DESC
LIMIT 10;
```

**Total videos saved today:**
```sql
SELECT COUNT(*) as videos_saved_today
FROM saved_videos
WHERE saved_at >= CURRENT_DATE;
```

---

### 7️⃣ Troubleshooting Queries

**Find user by phone number:**
```sql
SELECT 
  id,
  phone_number,
  created_at,
  onboarding_completed,
  subscription_status,
  subscription_tier,
  belt_level,
  last_login
FROM bjj_users 
WHERE phone_number = '+15551234567';
```

**Check if user has pending verification:**
```sql
SELECT 
  phone_number,
  verification_code IS NOT NULL as has_pending_code,
  verification_code_expires_at,
  created_at
FROM bjj_users 
WHERE phone_number = '+15551234567';
```

**Manually verify a user (if SMS failed):**
```sql
UPDATE bjj_users 
SET verification_code = NULL,
    verification_code_expires_at = NULL
WHERE phone_number = '+15551234567';
```

**Delete a test user (if needed):**
```sql
-- WARNING: This deletes all user data
DELETE FROM bjj_users WHERE phone_number = '+15551234567';
```

---

### 8️⃣ System Health Checks

**Database stats:**
```sql
SELECT 
  (SELECT COUNT(*) FROM bjj_users) as total_users,
  (SELECT COUNT(*) FROM ai_video_knowledge) as total_videos,
  (SELECT COUNT(*) FROM conversations) as total_messages,
  (SELECT COUNT(*) FROM saved_videos) as total_saves;
```

**Recent errors (login failures):**
```sql
SELECT 
  user_id,
  failure_reason,
  login_time,
  ip_address
FROM login_events 
WHERE success = false
  AND login_time >= CURRENT_DATE
ORDER BY login_time DESC
LIMIT 20;
```

---

## 🚀 LAUNCH DAY WORKFLOW

### Every 15 Minutes (10:00 AM - 12:00 PM)

**Run these 3 queries:**

1. **Check signups today:**
```sql
SELECT COUNT(*) as signups_today FROM bjj_users WHERE created_at >= CURRENT_DATE;
```

2. **Check active users:**
```sql
SELECT COUNT(DISTINCT user_id) as active_users 
FROM conversations 
WHERE created_at >= CURRENT_DATE;
```

3. **Check for verification issues:**
```sql
SELECT COUNT(*) as stuck_users
FROM bjj_users 
WHERE created_at >= CURRENT_DATE
  AND verification_code IS NOT NULL
  AND verification_code_expires_at < NOW();
```

If `stuck_users` > 0, investigate with:
```sql
SELECT phone_number, created_at, verification_code_expires_at
FROM bjj_users 
WHERE verification_code IS NOT NULL
  AND verification_code_expires_at < NOW()
ORDER BY created_at DESC;
```

---

## 💡 QUICK TIPS

**Copy Template:**
Keep this template ready for granting access:
```sql
UPDATE bjj_users 
SET subscription_tier = 'lifetime', subscription_status = 'active'
WHERE phone_number = '+1__________';
```

**Bulk Grant (End of Day):**
After collecting all beta tester phone numbers:
```sql
UPDATE bjj_users 
SET subscription_tier = 'lifetime', subscription_status = 'active'
WHERE phone_number IN (
  -- Paste all tester numbers here, one per line
  '+15551234567',
  '+15559876543'
  -- ... etc
);
```

**Verify Results:**
Always run a SELECT after UPDATE to confirm:
```sql
SELECT phone_number, subscription_tier, subscription_status 
FROM bjj_users 
WHERE subscription_tier = 'lifetime';
```

---

## 🆘 EMERGENCY QUERIES

**Pause new signups (manual method):**
```sql
-- No automated kill switch, so just monitor and respond to issues
-- If you need to stop signups, shut down the workflow temporarily
```

**Reset a user's verification code:**
```sql
UPDATE bjj_users 
SET verification_code = NULL,
    verification_code_expires_at = NULL,
    verification_attempts = 0
WHERE phone_number = '+15551234567';
```

**Find users stuck at verification:**
```sql
SELECT 
  phone_number,
  created_at,
  verification_attempts,
  verification_code_expires_at
FROM bjj_users 
WHERE verification_code IS NOT NULL
  AND created_at >= CURRENT_DATE
ORDER BY verification_attempts DESC;
```

---

**Keep this doc open on launch day. You've got this!** 🚀
