# Admin Quick Actions Guide

**For Launch Day:** Fast access to critical admin functions

---

## 🚀 Quick Access URLs

**Main Admin Dashboard:**
```
/admin
```

**Specific Pages:**
- `/admin/users` - User management & bulk actions
- `/admin/errors` - Error monitoring (NEW)
- `/admin/stats` - Database statistics dashboard (NEW)
- `/admin/videos` - Video library management
- `/admin/referrals` - Referral code management

**Login:** Use ADMIN_PASSWORD environment variable

---

## 👥 BULK GRANT LIFETIME ACCESS

### Method 1: Bulk Upload (Fastest)

**Location:** `/admin/users` → "Bulk Grant Access" tab

**Steps:**
1. Prepare list of phone numbers (one per line):
   ```
   +15551234567
   +15559876543
   +15555555555
   ```

2. Paste into textarea
3. Click "Grant All Lifetime Access"
4. Confirm action
5. **Result:** All numbers instantly granted lifetime access

**Use Case:** Grant access to all 20-30 beta testers at once

---

### Method 2: Individual Grant (Quick)

**Location:** `/admin/users` → User list

**Steps:**
1. Find user in list (search by phone/email)
2. Click "Grant Lifetime" button next to their name
3. Status updates to "Lifetime"

**Use Case:** Grant access to single users as they sign up

---

## 📊 VIEW RECENT SIGNUPS

**Location:** `/admin/users` → "Recent Signups" tab

**Shows:**
- Last 50 signups (sorted newest first)
- Phone number
- Signup timestamp
- Verification status (✅ Verified / ⏳ Pending)
- Current subscription status
- Quick actions:
  - Grant lifetime access
  - View chat history
  - Delete user (if needed)

**Refresh:** Auto-refreshes every 30 seconds during launch day

**Use Case:** Monitor who's signing up in real-time

---

## 🐛 VIEW RECENT ERRORS

**Location:** `/admin/errors`

**Shows:**
- Last 100 errors (newest first)
- Timestamp
- Error type (SMS, AI, Video, Database, Auth)
- Error message
- User affected (if applicable)
- Stack trace (click to expand)
- Status: Resolved / Unresolved

**Filters:**
- By error type
- By date range
- By user
- Unresolved only

**Actions:**
- Mark as resolved
- View user details
- Copy error details (for debugging)

**Use Case:** Quickly spot patterns on launch day

**Example:**
```
Type: SMS
Time: 10:15 AM
User: +15551234567
Error: Failed to send verification code - Twilio rate limit
Status: Unresolved
```

---

## 📈 DATABASE STATS DASHBOARD

**Location:** `/admin/stats`

**Real-Time Metrics:**

### User Stats
- **Total Users:** XXX
- **Signups Today:** XXX
- **Verified Users:** XXX (XX%)
- **Active Users (sent >1 message):** XXX

### Content Stats
- **Total Videos:** 211
- **Videos Watched Today:** XXX
- **Videos Saved Today:** XXX
- **Most Popular Video:** [Title by Instructor]

### AI Coach Stats
- **Prof. OS Queries Today:** XXX
- **Average Response Time:** X.X seconds
- **Success Rate:** XX%
- **Failed Queries:** XXX

### Engagement
- **Total Messages Sent:** XXX
- **Messages Today:** XXX
- **Average Messages per User:** X.X

**Refresh:** Auto-updates every 60 seconds

**Use Case:** Monitor system health and engagement during launch

---

## 🚨 EMERGENCY KILL SWITCH

**Location:** `/admin` → Top banner (red button)

**What it does:**
- Disables new user signups
- Shows maintenance banner to visitors
- Existing users can still use app
- Errors logged but signups blocked

**When to use:**
- Critical bug affecting all signups
- SMS system down
- Database overload
- Need time to fix before more users hit issue

**To re-enable:**
- Same button toggles back to "Signups Enabled"

**Use Case:** Stop bleeding while you fix critical issues

---

## 📞 COMMON LAUNCH DAY WORKFLOWS

### Workflow 1: User Reports "No SMS Code"

**Steps:**
1. Go to `/admin/users`
2. Search for their phone number
3. Check verification status
4. Options:
   - **If pending:** Click "Resend Code" button
   - **If failed:** Check `/admin/errors` for Twilio errors
   - **If Twilio trial issue:** Add to Twilio verified numbers, then "Manually Verify"
5. Text user: "Fixed! Try again now."

**Time:** 2 minutes

---

### Workflow 2: Grant All Beta Testers Lifetime Access

**Steps:**
1. Go to `/admin/users` → "Bulk Grant Access"
2. Paste all beta tester phone numbers
3. Click "Grant All Lifetime Access"
4. Verify count: "Successfully granted X users"
5. Done!

**Time:** 1 minute

---

### Workflow 3: Monitor Launch Day Health

**Every 15 minutes:**
1. Check `/admin/stats`:
   - Signup count increasing? ✅
   - Error rate <10%? ✅
   - Prof. OS success rate >90%? ✅

2. Check `/admin/errors`:
   - Any new errors? 
   - Same error repeating?
   - If yes → investigate

3. Check `/admin/users` → Recent Signups:
   - Are people completing signup?
   - Stuck at verification?

**Time:** 3 minutes per check

---

### Workflow 4: Fix Recurring Error

**Example:** 5 users hit same error

**Steps:**
1. `/admin/errors` → Filter by error type
2. Identify pattern (e.g., "All on Android Chrome")
3. Go to EMERGENCY_PLAYBOOK.md → Find scenario
4. Apply fix
5. Mark all related errors as "Resolved"
6. Test yourself
7. Text affected users: "Fixed!"

**Time:** 10-30 minutes depending on issue

---

## 🔑 ADMIN PASSWORD

**Set via environment variable:**
```
ADMIN_PASSWORD=your_secure_password_here
```

**To log in:**
1. Go to `/admin`
2. Enter password
3. Session lasts 24 hours

**Security:** Change password after beta if shared

---

## 📱 MOBILE ADMIN ACCESS

**Admin dashboard is mobile-responsive:**
- Works on phone if needed
- Core functions accessible
- Bulk actions work on mobile
- Stats dashboard readable

**Best practice:**
- Use laptop/desktop for launch day monitoring
- Mobile for quick checks on the go

---

## 🎯 LAUNCH DAY CHECKLIST

**Before sending first invite:**
- [ ] Can log in to `/admin`
- [ ] Can see user list
- [ ] Can grant lifetime access (test with your account)
- [ ] Can view errors page (should be empty)
- [ ] Stats dashboard showing correct video count (211)
- [ ] Bulk grant form accessible

**During launch:**
- [ ] Check stats every 15 minutes
- [ ] Monitor errors page
- [ ] Respond to user issues within 5 minutes
- [ ] Grant lifetime access to all beta testers

**End of day:**
- [ ] Export user list
- [ ] Review all errors
- [ ] Note any recurring issues
- [ ] Thank testers

---

## 💡 TIPS

**Keyboard Shortcuts (if implemented):**
- `Ctrl/Cmd + K` - Quick search users
- `Ctrl/Cmd + R` - Refresh stats
- `Ctrl/Cmd + E` - Jump to errors

**Browser Setup:**
- Open admin in separate window
- Keep errors page in one tab
- Keep stats dashboard in another
- Refresh both every 15 min

**Phone Nearby:**
- Testers will text questions
- Quick responses = better experience
- Reference EMERGENCY_PLAYBOOK.md for common issues

---

**You've got all the tools. Now go launch!** 🚀
