# Emergency Playbook - If Things Go Wrong

**Purpose:** Quick troubleshooting guide for common launch day failures  
**Use when:** Something breaks and users are affected  
**Philosophy:** Fix fast, communicate clearly, keep testing

---

## 🚨 Scenario 1: SMS Codes Not Sending

**Symptoms:**
- Users report "no verification code received"
- Waited >60 seconds, still nothing
- Multiple users experiencing same issue

### Quick Diagnosis:

**Check Twilio Dashboard (2 min):**
1. Log in to Twilio console
2. Monitor → Messaging → Logs
3. Look for recent message attempts
4. Status codes:
   - `delivered` ✅ = Working
   - `failed` ❌ = Problem
   - `queued` ⏳ = Delayed (might still arrive)

**Common Causes:**

| Cause | How to Check | Fix |
|-------|-------------|-----|
| **Trial account + unverified number** | Check if user's number in Twilio Verified Caller IDs | Add number to verified list in Twilio console |
| **Out of credits** | Dashboard → Billing → Balance | Add credits ($20 minimum) |
| **Invalid phone format** | Check error logs for format errors | Ensure E.164 format (+1XXXXXXXXXX) |
| **Twilio API key wrong** | Check environment variables | Verify TWILIO_* secrets are set correctly |
| **Rate limiting** | Twilio shows "rate limit exceeded" | Wait 1 minute, or upgrade account tier |

### Quick Fixes:

**Option 1: Manual Verification (Immediate)**
```
1. Get user's phone number
2. Open admin dashboard
3. Find user in user list
4. Click "Verify Manually" button
5. Text user: "You're verified! Refresh the page and try again."
```

**Option 2: Bypass SMS (Temporary)**
```
If multiple users affected:
1. Create temporary "magic link" signup
2. Send direct links that auto-verify
3. Fix Twilio issue in parallel
4. Migrate users back to SMS after fix
```

**Option 3: Pause Signups (Last Resort)**
```
1. Enable "Emergency Kill Switch" in admin
2. Show banner: "Temporarily pausing new signups, back soon!"
3. Fix Twilio issue
4. Re-enable signups
5. Contact users who tried to signup: "We're back! Try again."
```

### Communication Template:

**To affected users:**
```
Hey! Seeing an issue with verification codes. 
Working on it now.

In the meantime, I'll manually verify you. 
Refresh the page in 2 minutes and try again.

Sorry for the hassle! 🙏
```

---

## 🚨 Scenario 2: Prof. OS Not Responding

**Symptoms:**
- User sends message
- "Typing..." indicator appears
- Nothing comes back (or error message)
- Chat just hangs

### Quick Diagnosis:

**Check Error Logs (1 min):**
- Admin dashboard → Errors
- Look for API errors (Claude, OpenAI)
- Status codes:
  - `429` = Rate limit hit
  - `401` = Invalid API key
  - `500` = Server error

**Check Server Logs:**
```
Look for:
- "Claude API error"
- "OpenAI API error"  
- "Failed to generate response"
```

**Common Causes:**

| Cause | How to Check | Fix |
|-------|-------------|-----|
| **API key invalid/expired** | Try API call manually with key | Regenerate API key, update environment variable |
| **Rate limit hit** | Check Anthropic/OpenAI dashboard | Wait for reset (usually 1 min), or upgrade tier |
| **Out of credits** | Check API provider billing | Add credits |
| **Network timeout** | Check if Replit has network issues | Restart workflow, or wait for Replit to recover |
| **Database connection lost** | Check database health | Restart database connection, or restart app |

### Quick Fixes:

**Option 1: Restart Workflow (2 min)**
```
1. Replit dashboard → Workflows
2. Stop "Start application"
3. Wait 10 seconds
4. Start "Start application"
5. Wait 30 seconds for app to boot
6. Test with your account
```

**Option 2: Fallback Response (Immediate)**
```
If API is down:
1. Edit routes.ts
2. Add fallback response:
   "Prof. OS is taking a quick break. Try again in a few minutes!"
3. Deploy
4. Fix API issue in parallel
```

**Option 3: Switch AI Provider (Advanced)**
```
If Claude down:
1. Check if OpenAI working
2. Temporarily route all requests to OpenAI
3. Fix Claude issue
4. Switch back when ready
```

### Communication Template:

**To affected users:**
```
Prof. OS is having a moment (AI needs coffee too ☕).

Fixing now. Should be back in 5-10 minutes.

Sorry for the wait!
```

---

## 🚨 Scenario 3: Videos Not Loading/Playing

**Symptoms:**
- Video recommendations appear
- User taps play button
- Video doesn't load or shows error
- Or: Videos redirect to YouTube instead of playing embedded

### Quick Diagnosis:

**Test Yourself:**
1. Ask Prof. OS a question on your phone
2. Tap play on recommended video
3. What happens?
   - Nothing? → Player broken
   - YouTube redirect? → Embed code wrong
   - Error message? → URL invalid

**Check Browser Console:**
- F12 → Console
- Look for errors:
  - `iframe not allowed` → CORS issue
  - `Video unavailable` → URL broken
  - `Failed to load resource` → Network issue

**Common Causes:**

| Cause | How to Check | Fix |
|-------|-------------|-----|
| **YouTube URL broken** | Click URL directly → 404? | Update database with correct URL |
| **Embed permissions** | YouTube says "embed disabled" | Remove video from recommendations, or find alternate |
| **playsinline missing** | Check VideoPlayer.tsx code | Add `playsinline` parameter to iframe |
| **Modal not opening** | Click play → nothing happens | Check z-index, visibility, event handlers |

### Quick Fixes:

**Option 1: Fix Specific Video (2 min)**
```sql
-- Find broken video
SELECT id, technique_name, instructor_name, video_url 
FROM ai_video_knowledge 
WHERE id = [reported broken video ID];

-- Update with correct URL
UPDATE ai_video_knowledge 
SET video_url = '[correct URL]'
WHERE id = [video ID];
```

**Option 2: Temporary YouTube Redirect (5 min)**
```typescript
// In VideoPlayer.tsx or video card component
// Change from embedded iframe to:
<a href={youtubeUrl} target="_blank">
  Watch on YouTube →
</a>

// Add note: "Embedded playback coming soon"
```

**Option 3: Remove Broken Videos (Last Resort)**
```sql
-- If many videos broken, temporarily filter them out
UPDATE ai_video_knowledge 
SET quality_score = 0 
WHERE video_url IS NULL OR video_url = '';

-- Quality filter will exclude these
```

### Communication Template:

**To affected users:**
```
Seeing an issue with video playback. 

Temporary workaround: Videos will open in YouTube for now.

Fixing embedded playback. Back to normal soon! 📺
```

---

## 🚨 Scenario 4: Database Overload / Slow Performance

**Symptoms:**
- App loading slowly (>10 seconds)
- Timeouts on requests
- "Database connection failed" errors
- Multiple users reporting "not loading"

### Quick Diagnosis:

**Check Database Status:**
- Replit dashboard → Database
- Connection pool saturated?
- Query times >3 seconds?

**Check Server Logs:**
```
Look for:
- "Connection pool exhausted"
- "Timeout waiting for connection"
- "Database query timeout"
```

**Common Causes:**

| Cause | How to Check | Fix |
|-------|-------------|-----|
| **Too many concurrent users** | Count active sessions | Increase connection pool size, or optimize queries |
| **Slow query** | Check recent queries in logs | Add database index, or optimize query |
| **Database connection leak** | Connections not closing | Restart app, fix code to close connections |
| **Replit resource limits** | Check Replit resource usage | Upgrade Replit plan, or optimize app |

### Quick Fixes:

**Option 1: Restart App (2 min)**
```
Clears connection pool and resets connections:
1. Restart workflow
2. Wait 30 seconds
3. Test yourself
4. Monitor for 5 minutes
```

**Option 2: Emergency Kill Switch (Immediate)**
```
If too many users:
1. Enable "Pause new signups" in admin
2. Banner: "At capacity! Back soon."
3. Fix issue with current load
4. Re-enable when stable
```

**Option 3: Optimize Queries (10 min)**
```sql
-- Add indexes to frequently queried columns
CREATE INDEX idx_video_quality ON ai_video_knowledge(quality_score);
CREATE INDEX idx_user_phone ON users(phone_number);

-- Run db:push to apply
```

### Communication Template:

**To affected users:**
```
BJJ OS is getting hugged to death (good problem!).

Optimizing now. Might be slow for 5-10 minutes.

Hang tight! 💪
```

---

## 🚨 Scenario 5: User Reports Bug You Can't Reproduce

**Symptoms:**
- User: "X is broken!"
- You test X: Works fine
- Can't replicate the issue

### Investigation Process:

**Ask Questions (2 min):**
```
Hey! Trying to fix this. Can you help me with:

1. What device? (iPhone 12, Android Samsung, etc.)
2. What browser? (Safari, Chrome, etc.)
3. Exact steps you took?
4. Screenshot or screen recording?

Thanks! This helps me nail down the bug.
```

**Common Device-Specific Issues:**

| Device | Known Issues | Workaround |
|--------|-------------|------------|
| **Safari iOS** | Modal backdrop tap sometimes fails | Use X button or Escape key |
| **Android Chrome** | Video autoplay blocked | User must tap play button |
| **Old iPhone (<iOS 14)** | CSS grid layout breaks | Suggest updating iOS |
| **iPad** | Touch events different from phone | Test on iPad specifically |

### Quick Fixes:

**Option 1: Device-Specific CSS (15 min)**
```css
/* Add to index.css */
@supports (-webkit-touch-callout: none) {
  /* iOS-specific fixes */
}

@media (max-width: 768px) {
  /* Mobile-specific fixes */
}
```

**Option 2: Polyfill (10 min)**
```typescript
// Add browser compatibility checks
if (!window.IntersectionObserver) {
  // Load polyfill
}
```

**Option 3: Known Issue Note (Immediate)**
```
Add to BETA_TESTER_GUIDE.md:

**Known Issue:** [Brief description]
**Affects:** [Device/Browser]
**Workaround:** [Temporary fix]
**Status:** Fixing in next update
```

### Communication Template:

**To user:**
```
Thanks for the details! Found the issue.

Quick workaround: [explain workaround]

Permanent fix coming this weekend.

Appreciate you helping debug this! 🙏
```

---

## 🚨 Scenario 6: Twilio Trial Limitations Hit

**Symptoms:**
- First 5-10 users signup fine
- Then: "Failed to send verification code"
- Twilio says "Unverified number"

### Root Cause:

**Twilio Trial Account Limitations:**
- Can only send to **verified phone numbers**
- Limited to ~100 messages/day
- No bulk SMS

### Solutions:

**Option 1: Verify All Numbers (Bulk - 15 min)**
```
1. Export beta tester phone list
2. Twilio Console → Phone Numbers → Verified Caller IDs
3. Click "Verify a Number"
4. Enter each number (or use Twilio API to bulk verify)
5. Each receives verification code
6. They must respond to verify
```

**Option 2: Upgrade to Paid (Immediate)**
```
1. Twilio Console → Billing
2. Add payment method
3. Add $20+ credits
4. Account automatically upgraded
5. Can now send to unverified numbers
```

**Option 3: Email Verification (Alternative)**
```
Temporarily:
1. Add email signup option
2. Send magic link via email (no Twilio needed)
3. Users click link to verify
4. Migrate to SMS later
```

### Communication Template:

**To users hitting limit:**
```
Hit a Twilio trial limit (growing pains!).

Fixed. Try signup again now. Should work!

Sorry for the friction! 🙏
```

---

## 🚨 General Emergency Decision Tree

```
Something is broken
    ↓
Does it affect >50% of users?
    ↓
YES → PAUSE signups, fix immediately
    ↓
NO → Can users still use core features?
    ↓
YES → Fix after monitoring, document workaround
    ↓
NO → How long to fix?
    ↓
<30 min → Fix now, keep testing paused
    ↓
>30 min → Enable workaround, fix tonight
```

---

## 📋 Emergency Contact Info

**Have these ready:**

- **Replit Support:** Replit dashboard → Help
- **Twilio Support:** Twilio console → Help & Support
- **Claude API:** Anthropic dashboard → Support
- **Stripe Support:** Stripe dashboard → Help

**Your Info:**
- Admin dashboard URL: `[your-url]/admin`
- Database URL: `[check Replit secrets]`
- Error logs: `[your-url]/admin/errors`

---

## 🎯 Emergency Principles

1. **Communicate fast** - Tell users what's happening
2. **Fix ugly** - Workarounds > perfection
3. **Document everything** - Write down what broke + how you fixed it
4. **Don't panic** - Beta is for finding bugs
5. **Thank testers** - They're helping you improve

**Remember: Every bug found in beta is one less bug in production.** 🐛➡️✅

---

**Keep this document open on launch day. You've got this.** 🚀
