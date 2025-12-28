# BJJ OS - ADMIN PAGES (VERIFIED FROM client/src/pages/admin/)

**Total Admin Pages:** 17 pages (verified by counting files)  
**Generated:** January 18, 2025  
**METHOD:** Direct file system analysis - NO FABRICATIONS

---

## COMPLETE ADMIN PAGE LIST (17 Pages)

### 1. Admin Dashboard (dashboard.tsx - 242 lines)
**Path:** `/admin`  
**Features:**
- Real-time user stats
- MRR tracking
- Referral metrics
- Lifetime member count

### 2. Admin Login (login.tsx - 109 lines)
**Path:** `/admin/login`  
**Features:**
- Email + password authentication (bcrypt)
- JWT token generation
- Session management

### 3. Prof. OS Chat (chat.tsx - 231 lines)
**Path:** `/admin/chat`  
**Features:**
- Test AI coaching interface
- Conversation history
- Admin-only chat testing

### 4. Video Library (videos.tsx - 618 lines)
**Path:** `/admin/videos`  
**Features:**
- Browse curated videos
- Video stats and analytics
- Manual content-first curator trigger
- Real-time progress tracking
- Delete/approve videos

### 5. Instructors (instructors.tsx - 619 lines)
**Path:** `/admin/instructors`  
**Features:**
- Manage instructor database
- Credibility scores (0-100)
- YouTube data scraping
- Batch YouTube scraping
- Add/edit/delete instructors

### 6. Instructor Priority (instructor-priority.tsx - 509 lines)
**Path:** `/admin/instructor-priority`  
**Features:**
- View auto-calculated priorities
- Manual override system
- Recalculate priorities
- Priority breakdown (subscribers, achievements, instructionals, feedback)

### 7. Partnerships (partnerships.tsx - 700 lines)
**Path:** `/admin/partnerships`  
**Features:**
- Featured instructor partnerships
- Promotion settings
- Partnership analytics
- Add/edit/delete partnerships

### 8. Technique Chains (chains.tsx - 381 lines)
**Path:** `/admin/chains`  
**Features:**
- Pre-built BJJ technique sequences
- Chain analytics
- User feedback on chains

### 9. Meta Analytics (meta.tsx - 363 lines)
**Path:** `/admin/meta`  
**Features:**
- Trending techniques
- Automated curation priorities
- User technique requests
- Meta analysis stats

### 10. Techniques (techniques.tsx - 397 lines)
**Path:** `/admin/techniques`  
**Features:**
- Browse analyzed videos
- Quality score filtering
- Instructor filtering
- Technique type filtering

### 11. User Management (users.tsx - 310 lines)
**Path:** `/admin/users`  
**Features:**
- List all users
- User search and filters
- Subscription status
- User activity tracking

### 12. Referral Codes (referrals.tsx - 233 lines)
**Path:** `/admin/referrals`  
**Features:**
- Create/manage referral codes
- Track signups and revenue
- Two-tier system (user + influencer)
- Bulk code creation

### 13. Lifetime Access (lifetime.tsx - 462 lines)
**Path:** `/admin/lifetime`  
**Features:**
- Grant lifetime memberships
- Bulk lifetime access
- Revoke access
- Lifetime member tracking

### 14. Feedback Analytics (feedback.tsx - 334 lines)
**Path:** `/admin/feedback`  
**Features:**
- Video feedback stats
- Flagged videos
- Top-tier videos (8.5+ rating)
- Remove/approve videos

### 15. AI Logs (logs.tsx - 309 lines)
**Path:** `/admin/logs`  
**Features:**
- AI conversation monitoring
- Dual-model tracking (GPT-4o, Claude Sonnet 4)
- Response time analytics
- Success rate tracking

### 16. Schedules (schedules.tsx - 343 lines)
**Path:** `/admin/schedules`  
**Features:**
- SMS/email delivery schedules
- Automated sending
- Schedule toggle
- Schedule stats

### 17. Flagged Accounts (flagged-accounts.tsx - 419 lines)
**Path:** `/admin/flagged-accounts`  
**Features:**
- Account sharing detection
- Device fingerprinting review
- Behavioral fraud analysis
- Account suspension/warning

---

## ADMIN PAGE SUMMARY BY SIZE

**Largest Admin Pages:**
1. partnerships.tsx: 700 lines
2. instructors.tsx: 619 lines
3. videos.tsx: 618 lines
4. instructor-priority.tsx: 509 lines
5. lifetime.tsx: 462 lines

**Smallest Admin Pages:**
1. login.tsx: 109 lines
2. chat.tsx: 231 lines
3. referrals.tsx: 233 lines
4. dashboard.tsx: 242 lines

---

## WHAT I CANNOT VERIFY

**Cannot verify without running the app:**
- Whether pages render correctly
- Whether API calls work
- Whether data displays properly
- Whether forms submit successfully
- Whether authentication works

**Cannot verify without database:**
- What data is displayed
- Number of users/videos/instructors
- Actual metrics and stats
- Whether queries return results

**To verify admin pages work:**
1. Start app: `npm run dev`
2. Login to admin at `/admin/login`
3. Navigate to each admin page
4. Test CRUD operations
5. Check data displays correctly
6. Verify real-time features work
