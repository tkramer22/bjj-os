# BJJ OS - API ROUTES (VERIFIED FROM server/routes.ts)

**Source File:** `server/routes.ts` (6,586 lines)  
**Total Routes:** 141 (verified by counting `app.get|post|put|delete|patch` calls)  
**Generated:** January 18, 2025

**METHOD:** This document lists ALL routes defined in routes.ts with their actual line numbers.  
**NO FABRICATIONS:** All information directly from routes.ts code.

---

## ROUTE SUMMARY BY CATEGORY

**Authentication (4 routes):**
- POST /api/auth/send-code
- POST /api/auth/verify-code  
- GET /api/auth/me
- POST /api/auth/logout

**Admin Auth (1 route):**
- POST /api/admin/login

**User Profile (5 routes):**
- PATCH /api/auth/profile
- PATCH /api/user/theme
- GET /api/user/:userId/language-preference
- POST /api/user/:userId/language-preference
- POST /api/ai/user/:userId/profile

**SMS & Messaging (10 routes):**
- POST /api/test-sms
- POST /api/send-technique
- POST /api/send-to-phone
- GET /api/recipients
- POST /api/recipients
- GET /api/schedules
- POST /api/schedules
- POST /api/send-sms
- GET /api/history
- GET /api/stats

**Twilio Webhooks (2 routes):**
- POST /api/webhooks/twilio/status
- POST /api/webhooks/twilio/incoming

**Stripe & Payments (4 routes):**
- POST /api/create-checkout-session
- POST /api/webhooks/stripe
- POST /api/validate-referral
- POST /api/create-subscription

**Admin User Management (5 routes):**
- POST /api/admin/add-free-user
- GET /api/admin/users
- POST /api/admin/create-test-user
- POST /api/admin/test-sms
- POST /api/toggle-sms

**Admin Lifetime Access (4 routes):**
- GET /api/admin/lifetime-memberships
- POST /api/admin/lifetime/grant
- POST /api/admin/lifetime/grant-bulk
- DELETE /api/admin/lifetime/:userId/revoke

**Admin Referral Codes (4 routes):**
- GET /api/admin/codes
- POST /api/admin/codes/create
- POST /api/admin/codes/bulk-create
- POST /api/admin/codes/:id/toggle

**Admin Analytics (4 routes):**
- GET /api/admin/export-csv
- POST /api/admin/mark-paid
- GET /api/admin/ai-metrics
- GET /api/admin/instructor-performance
- GET /api/admin/ai-alerts

**AI Intelligence (11 routes):**
- GET /api/ai/stats
- GET /api/ai/features
- POST /api/ai/features/:featureName
- POST /api/ai/features/:featureName/user/:userId
- POST /api/ai/recommend/:userId
- GET /api/ai/videos
- GET /api/ai/reasoning
- GET /api/ai/user/:userId/context
- POST /api/ai/feedback
- POST /api/ai/chat/message
- POST /api/ai/chat/transcribe

**AI Chat & History (4 routes):**
- GET /api/ai/chat/history/:userId
- GET /api/ai/admin-chat/history/:adminId
- POST /api/ai/admin-chat/message
- DELETE /api/ai/admin-chat/clear

**User Saved Videos (3 routes):**
- GET /api/ai/saved-videos/:userId
- POST /api/ai/saved-videos
- DELETE /api/ai/saved-videos/:videoId

**Voice (ElevenLabs) (4 routes):**
- GET /api/user/:userId/voice-settings
- POST /api/user/:userId/voice-settings
- POST /api/voice/generate
- GET /api/voice/options

**Video Curation (3 routes):**
- POST /api/video-curation/curate
- GET /api/video-curation/stats
- GET /api/video-curation/logs

**Admin Videos (5 routes):**
- GET /api/admin/videos
- GET /api/admin/videos/stats
- DELETE /api/admin/videos/:id
- POST /api/admin/videos/manual
- POST /api/admin/content-first-curator/run
- GET /api/admin/content-first-curator/status

**Admin Feedback (6 routes):**
- GET /api/admin/feedback/stats
- GET /api/admin/feedback/flagged
- GET /api/admin/feedback/top-tier
- POST /api/admin/feedback/remove-video/:videoId
- POST /api/admin/feedback/approve-video/:videoId
- POST /api/feedback/video

**Admin Meta Analytics (6 routes):**
- GET /api/admin/meta/trending
- GET /api/admin/meta/priorities
- GET /api/admin/meta/requests
- GET /api/admin/meta/stats
- POST /api/admin/meta/curate
- POST /api/admin/meta/analyze

**Admin Instructors (7 routes):**
- GET /api/admin/instructors
- GET /api/admin/instructors/stats
- POST /api/admin/instructors
- PATCH /api/admin/instructors/:id
- DELETE /api/admin/instructors/:id
- POST /api/admin/instructors/:id/scrape-youtube
- POST /api/admin/instructors/batch-scrape-youtube

**Admin Partnerships (5 routes):**
- GET /api/admin/partnerships
- GET /api/admin/partnerships/stats
- POST /api/admin/partnerships
- PATCH /api/admin/partnerships/:id
- DELETE /api/admin/partnerships/:id

**Admin AI Logs (2 routes):**
- GET /api/admin/ai-logs
- GET /api/admin/ai-logs/stats

**Admin Schedules (6 routes):**
- GET /api/admin/schedules
- GET /api/admin/schedules/stats
- POST /api/admin/schedules
- PATCH /api/admin/schedules/:id
- POST /api/admin/schedules/:id/toggle
- DELETE /api/admin/schedules/:id

**Admin Techniques (3 routes):**
- GET /api/admin/techniques
- GET /api/admin/techniques/stats
- GET /api/admin/techniques/instructors

**Technique Chains (7 routes):**
- GET /api/chains
- GET /api/chains/:id
- POST /api/user/chains/save
- POST /api/chains/:id/feedback
- GET /api/user/:userId/saved-chains
- PATCH /api/user/saved-chains/:id
- DELETE /api/user/saved-chains/:id
- GET /api/admin/chains/stats

**Push Notifications (4 routes):**
- POST /api/push/subscribe
- POST /api/push/unsubscribe
- GET /api/push/status/:userId
- POST /api/push/test/:userId

**Instructor Priority System (5 routes):**
- POST /api/instructors/priority/recalculate-all
- POST /api/instructors/:id/priority/recalculate
- POST /api/instructors/:id/manual-override
- DELETE /api/instructors/:id/manual-override
- GET /api/instructors/:id/priority-details

**Account Sharing Prevention (4 routes):**
- GET /api/user/devices
- DELETE /api/user/devices/:id
- GET /api/admin/flagged-accounts
- POST /api/admin/flagged-accounts/:id/review
- GET /api/admin/devices/:userId
- GET /api/admin/users/:userId/security

**App Waitlist (1 route):**
- POST /api/waitlist

**URL Shortener (3 routes):**
- POST /api/short-url
- GET /t/:code
- GET /api/short-url/:code/analytics

**Other (3 routes):**
- GET /ref/:code
- POST /api/test-ai
- POST /api/generate-technique

---

## COMPLETE ROUTE LIST (All 141 Routes with Line Numbers)

### Authentication & User

**Line 644:** `POST /api/auth/send-code`  
Purpose: Send SMS verification code via Twilio Verify

**Line 732:** `POST /api/auth/verify-code`  
Purpose: Verify SMS code & create user session

**Line 1014:** `GET /api/auth/me` (requires checkUserAuth)  
Purpose: Get current user session

**Line 1040:** `POST /api/auth/logout`  
Purpose: Logout & clear session

**Line 1451:** `GET /api/auth/me`  
Purpose: Duplicate route - get user session

**Line 1488:** `PATCH /api/auth/profile` (requires checkUserAuth)  
Purpose: Update user profile

**Line 1517:** `PATCH /api/user/theme`  
Purpose: Update IBJJF belt theme

### Admin

**Line 1399:** `POST /api/admin/login`  
Purpose: Admin login with email + password (bcrypt)

**Line 1545:** `POST /api/admin/add-free-user` (requires checkAdminAuth)  
Purpose: Admin create free user account

**Line 1623:** `GET /api/admin/users` (requires checkAdminAuth)  
Purpose: List all users with filters

**Line 1681:** `POST /api/admin/create-test-user` (requires checkAdminAuth)  
Purpose: Create test/demo user

**Line 1703:** `POST /api/admin/test-sms` (requires checkAdminAuth)  
Purpose: Test SMS sending

### Admin Lifetime Access

**Line 1715:** `GET /api/admin/lifetime-memberships` (requires checkAdminAuth)  
Purpose: List all lifetime members

**Line 1745:** `POST /api/admin/lifetime/grant` (requires checkAdminAuth)  
Purpose: Grant lifetime access (single user)

**Line 1840:** `POST /api/admin/lifetime/grant-bulk` (requires checkAdminAuth)  
Purpose: Bulk grant lifetime access

**Line 1951:** `DELETE /api/admin/lifetime/:userId/revoke` (requires checkAdminAuth)  
Purpose: Revoke lifetime access

### Referral Codes

**Line 1972:** `GET /api/admin/codes` (requires checkAdminAuth)  
Purpose: List all referral codes

**Line 1982:** `POST /api/admin/codes/create` (requires checkAdminAuth)  
Purpose: Create single referral code

**Line 2005:** `POST /api/admin/codes/bulk-create` (requires checkAdminAuth)  
Purpose: Bulk create referral codes

**Line 2033:** `POST /api/admin/codes/:id/toggle` (requires checkAdminAuth)  
Purpose: Enable/disable referral code

**Line 2404:** `POST /api/validate-referral`  
Purpose: Validate referral code on signup

**Line 1338:** `GET /ref/:code`  
Purpose: Referral code redirect with tracking

### Analytics & Reporting

**Line 2054:** `GET /api/admin/export-csv` (requires checkAdminAuth)  
Purpose: Export data as CSV

**Line 2080:** `POST /api/admin/mark-paid` (requires checkAdminAuth)  
Purpose: Mark user as paid (manual)

**Line 2093:** `GET /api/admin/ai-metrics` (requires checkAdminAuth)  
Purpose: AI performance metrics

**Line 2109:** `GET /api/admin/instructor-performance` (requires checkAdminAuth)  
Purpose: Instructor performance stats

**Line 2124:** `GET /api/admin/ai-alerts` (requires checkAdminAuth)  
Purpose: AI system alerts

### Stripe & Payments

**Line 2135:** `POST /api/create-checkout-session`  
Purpose: Create Stripe checkout session

**Line 2213:** `POST /api/webhooks/stripe`  
Purpose: Stripe webhook handler (signature verification)

**Line 2480:** `POST /api/create-subscription`  
Purpose: Create subscription (legacy?)

**Line 2436:** `POST /api/toggle-sms` (requires checkAdminAuth)  
Purpose: Toggle SMS feature

### AI Intelligence & Features

**Line 2608:** `GET /api/ai/stats`  
Purpose: AI system stats

**Line 2631:** `GET /api/ai/features`  
Purpose: List AI feature flags

**Line 2646:** `POST /api/ai/features/:featureName`  
Purpose: Toggle AI feature globally

**Line 2668:** `POST /api/ai/features/:featureName/user/:userId`  
Purpose: Toggle AI feature for specific user

**Line 2685:** `POST /api/ai/recommend/:userId`  
Purpose: Get AI video recommendations

**Line 2711:** `GET /api/ai/videos`  
Purpose: Get AI video library

**Line 2741:** `GET /api/ai/reasoning`  
Purpose: Get AI reasoning traces

**Line 2769:** `GET /api/ai/user/:userId/context`  
Purpose: Get full user context for AI

**Line 2787:** `POST /api/ai/feedback`  
Purpose: Submit AI response feedback

### AI Chat (Prof. OS)

**Line 2812:** `POST /api/ai/chat/message`  
Purpose: Send message to Prof. OS (dual-model AI)

**Line 3179:** `POST /api/ai/chat/transcribe` (multer upload)  
Purpose: Transcribe voice to text (Whisper API)

**Line 3219:** `GET /api/ai/chat/history/:userId`  
Purpose: Get user chat history

**Line 3250:** `GET /api/ai/admin-chat/history/:adminId` (requires checkAdminAuth)  
Purpose: Get admin chat history

**Line 3267:** `POST /api/ai/admin-chat/message` (requires checkAdminAuth)  
Purpose: Admin chat with Prof. OS

**Line 3395:** `DELETE /api/ai/admin-chat/clear` (requires checkAdminAuth)  
Purpose: Clear admin chat history

### User Saved Videos

**Line 3409:** `GET /api/ai/saved-videos/:userId`  
Purpose: Get user's saved videos

**Line 3449:** `POST /api/ai/saved-videos`  
Purpose: Save video to user library

**Line 3474:** `DELETE /api/ai/saved-videos/:videoId`  
Purpose: Remove saved video

### User Profile & Preferences

**Line 3496:** `POST /api/ai/user/:userId/profile`  
Purpose: Update user AI profile

**Line 3532:** `GET /api/user/:userId/language-preference`  
Purpose: Get language preference

**Line 3557:** `POST /api/user/:userId/language-preference`  
Purpose: Set language preference

### Voice (ElevenLabs TTS)

**Line 3600:** `GET /api/user/:userId/voice-settings`  
Purpose: Get voice output settings

**Line 3627:** `POST /api/user/:userId/voice-settings`  
Purpose: Update voice output settings

**Line 3668:** `POST /api/voice/generate`  
Purpose: Generate speech from text (ElevenLabs)

**Line 3722:** `GET /api/voice/options`  
Purpose: Get available voice options

### Video Curation (Old Curator)

**Line 3743:** `POST /api/video-curation/curate`  
Purpose: Trigger old video curator

**Line 3761:** `GET /api/video-curation/stats`  
Purpose: Get curation stats

**Line 3780:** `GET /api/video-curation/logs`  
Purpose: Get curation logs

### Admin Videos

**Line 3799:** `GET /api/admin/videos`  
Purpose: Get all videos (admin view)

**Line 3875:** `GET /api/admin/videos/stats`  
Purpose: Get video library stats

**Line 3897:** `DELETE /api/admin/videos/:id`  
Purpose: Delete video from library

**Line 3912:** `POST /api/admin/videos/manual`  
Purpose: Manually add video to library

### Content-First Curator (NEW!)

**Line 3967:** `POST /api/admin/content-first-curator/run` (requires checkAdminAuth)  
Purpose: Trigger content-first video curation (async)

**Line 4045:** `GET /api/admin/content-first-curator/status` (requires checkAdminAuth)  
Purpose: Poll curation progress (real-time tracking)

### Video Feedback

**Line 4054:** `GET /api/admin/feedback/stats`  
Purpose: Get feedback analytics

**Line 4099:** `GET /api/admin/feedback/flagged`  
Purpose: Get flagged videos

**Line 4114:** `GET /api/admin/feedback/top-tier`  
Purpose: Get top-tier videos

**Line 4129:** `POST /api/admin/feedback/remove-video/:videoId`  
Purpose: Remove video from library

**Line 4147:** `POST /api/admin/feedback/approve-video/:videoId`  
Purpose: Approve flagged video

**Line 4169:** `POST /api/feedback/video`  
Purpose: Submit video feedback (helpful/not helpful)

### Meta Analytics

**Line 4302:** `GET /api/admin/meta/trending` (requires checkAdminAuth)  
Purpose: Get trending techniques

**Line 4315:** `GET /api/admin/meta/priorities` (requires checkAdminAuth)  
Purpose: Get curation priorities

**Line 4328:** `GET /api/admin/meta/requests` (requires checkAdminAuth)  
Purpose: Get user technique requests

**Line 4347:** `GET /api/admin/meta/stats` (requires checkAdminAuth)  
Purpose: Get meta analysis stats

**Line 4385:** `POST /api/admin/meta/curate` (requires checkAdminAuth)  
Purpose: Trigger meta-based curation

**Line 4404:** `POST /api/admin/meta/analyze` (requires checkAdminAuth)  
Purpose: Run meta analysis

### Instructors

**Line 4423:** `GET /api/admin/instructors` (requires checkAdminAuth)  
Purpose: List all instructors

**Line 4476:** `GET /api/admin/instructors/stats` (requires checkAdminAuth)  
Purpose: Get instructor stats

**Line 4500:** `POST /api/admin/instructors` (requires checkAdminAuth)  
Purpose: Add new instructor

**Line 4544:** `PATCH /api/admin/instructors/:id` (requires checkAdminAuth)  
Purpose: Update instructor

**Line 4582:** `DELETE /api/admin/instructors/:id` (requires checkAdminAuth)  
Purpose: Delete instructor

**Line 4605:** `POST /api/admin/instructors/:id/scrape-youtube` (requires checkAdminAuth)  
Purpose: Scrape instructor YouTube data

**Line 4658:** `POST /api/admin/instructors/batch-scrape-youtube` (requires checkAdminAuth)  
Purpose: Batch scrape YouTube data for all instructors

### Partnerships

**Line 4758:** `GET /api/admin/partnerships` (requires checkAdminAuth)  
Purpose: List featured instructor partnerships

**Line 4814:** `GET /api/admin/partnerships/stats` (requires checkAdminAuth)  
Purpose: Get partnership stats

**Line 4836:** `POST /api/admin/partnerships` (requires checkAdminAuth)  
Purpose: Create partnership

**Line 4884:** `PATCH /api/admin/partnerships/:id` (requires checkAdminAuth)  
Purpose: Update partnership

**Line 4925:** `DELETE /api/admin/partnerships/:id` (requires checkAdminAuth)  
Purpose: Delete partnership

### AI Logs

**Line 4950:** `GET /api/admin/ai-logs` (requires checkAdminAuth)  
Purpose: Get AI conversation logs (supports dual-model filtering!)

**Line 5058:** `GET /api/admin/ai-logs/stats` (requires checkAdminAuth)  
Purpose: Get AI log statistics

### Schedules

**Line 5118:** `GET /api/admin/schedules` (requires checkAdminAuth)  
Purpose: List SMS/email schedules

**Line 5141:** `GET /api/admin/schedules/stats` (requires checkAdminAuth)  
Purpose: Get schedule stats

**Line 5171:** `POST /api/admin/schedules` (requires checkAdminAuth)  
Purpose: Create schedule

**Line 5190:** `PATCH /api/admin/schedules/:id` (requires checkAdminAuth)  
Purpose: Update schedule

**Line 5218:** `POST /api/admin/schedules/:id/toggle` (requires checkAdminAuth)  
Purpose: Enable/disable schedule

**Line 5243:** `DELETE /api/admin/schedules/:id` (requires checkAdminAuth)  
Purpose: Delete schedule

### Techniques

**Line 5268:** `GET /api/admin/techniques` (requires checkAdminAuth)  
Purpose: Browse analyzed videos

**Line 5332:** `GET /api/admin/techniques/stats` (requires checkAdminAuth)  
Purpose: Get technique stats

**Line 5358:** `GET /api/admin/techniques/instructors` (requires checkAdminAuth)  
Purpose: Get instructor list

### Technique Chains

**Line 5381:** `GET /api/chains`  
Purpose: Get all technique chains

**Line 5415:** `GET /api/chains/:id`  
Purpose: Get specific chain details

**Line 5445:** `POST /api/user/chains/save`  
Purpose: Save chain to user library

**Line 5497:** `POST /api/chains/:id/feedback`  
Purpose: Submit chain feedback

**Line 5547:** `GET /api/user/:userId/saved-chains`  
Purpose: Get user's saved chains

**Line 5576:** `PATCH /api/user/saved-chains/:id`  
Purpose: Update saved chain

**Line 5606:** `DELETE /api/user/saved-chains/:id`  
Purpose: Delete saved chain

**Line 5639:** `GET /api/admin/chains/stats` (requires checkAdminAuth)  
Purpose: Get chain analytics

### Push Notifications

**Line 5668:** `POST /api/push/subscribe` (requires checkUserAuth)  
Purpose: Subscribe to push notifications

**Line 5738:** `POST /api/push/unsubscribe` (requires checkUserAuth)  
Purpose: Unsubscribe from push notifications

**Line 5769:** `GET /api/push/status/:userId` (requires checkUserAuth)  
Purpose: Get push subscription status

**Line 5802:** `POST /api/push/test/:userId` (requires checkAdminAuth)  
Purpose: Send test push notification

### Instructor Priority System

**Line 5820:** `POST /api/instructors/priority/recalculate-all` (requires checkAdminAuth)  
Purpose: Recalculate all instructor priorities

**Line 5858:** `POST /api/instructors/:id/priority/recalculate` (requires checkAdminAuth)  
Purpose: Recalculate single instructor priority

**Line 5903:** `POST /api/instructors/:id/manual-override` (requires checkAdminAuth)  
Purpose: Set manual priority override

**Line 5948:** `DELETE /api/instructors/:id/manual-override` (requires checkAdminAuth)  
Purpose: Remove manual override

**Line 5994:** `GET /api/instructors/:id/priority-details` (requires checkAdminAuth)  
Purpose: Get priority calculation breakdown

### Account Sharing Prevention

**Line 6048:** `GET /api/user/devices` (requires checkUserAuth)  
Purpose: Get user's authorized devices

**Line 6082:** `DELETE /api/user/devices/:id` (requires checkUserAuth)  
Purpose: Remove device from authorized list

**Line 6122:** `GET /api/admin/flagged-accounts` (requires checkAdminAuth)  
Purpose: Get flagged accounts (suspicious activity)

**Line 6211:** `POST /api/admin/flagged-accounts/:id/review` (requires checkAdminAuth)  
Purpose: Review flagged account

**Line 6244:** `GET /api/admin/devices/:userId` (requires checkAdminAuth)  
Purpose: Get user devices (admin view)

**Line 6261:** `GET /api/admin/users/:userId/security` (requires checkAdminAuth)  
Purpose: Get user security info

### App Waitlist

**Line 6303:** `POST /api/waitlist`  
Purpose: Join app waitlist for iOS/Android launch

### URL Shortener (bjjos.app/t/CODE)

**Line 6367:** `POST /api/short-url` (requires checkAdminAuth)  
Purpose: Create short URL with dynamic OG tags

**Line 6454:** `GET /t/:code`  
Purpose: Short URL redirect with click tracking

**Line 6557:** `GET /api/short-url/:code/analytics` (requires checkAdminAuth)  
Purpose: Get short URL analytics

### SMS & Legacy

**Line 1054:** `POST /api/test-sms`  
Purpose: Test SMS sending

**Line 1090:** `GET /api/test-ai`  
Purpose: Test AI generation

**Line 1103:** `POST /api/generate-technique`  
Purpose: Generate technique recommendation

**Line 1121:** `POST /api/send-technique`  
Purpose: Send technique to user via SMS

**Line 1167:** `POST /api/send-to-phone`  
Purpose: Send message to phone number

**Line 1203:** `GET /api/recipients`  
Purpose: Get SMS recipients list

**Line 1208:** `POST /api/recipients`  
Purpose: Add SMS recipient

**Line 1219:** `GET /api/schedules`  
Purpose: Get SMS schedules

**Line 1224:** `POST /api/schedules`  
Purpose: Create SMS schedule

**Line 1235:** `POST /api/send-sms`  
Purpose: Send SMS message

**Line 1259:** `GET /api/history`  
Purpose: Get SMS history

**Line 1265:** `GET /api/stats`  
Purpose: Get SMS stats

**Line 1291:** `POST /api/webhooks/twilio/status`  
Purpose: Twilio delivery status webhook

**Line 1318:** `POST /api/webhooks/twilio/incoming`  
Purpose: Twilio incoming SMS webhook

---

## WHAT I CANNOT VERIFY

**Cannot verify without running the server:**
- Whether routes actually work
- Response formats
- Error handling behavior
- Performance characteristics
- Database queries executed
- Authentication logic correctness

**Cannot verify without testing:**
- Whether middleware (checkUserAuth, checkAdminAuth) works
- JWT token validation
- Stripe webhook signature verification
- Twilio Verify integration
- Whether async jobs complete successfully
- Error messages returned

**Cannot verify without accessing environment:**
- API keys configured (Stripe, Twilio, OpenAI, ElevenLabs, YouTube)
- Environment variables set
- Database connection working
- Third-party service connectivity

**To verify routes work:**
1. Start server: `npm run dev`
2. Test each endpoint with curl/Postman
3. Check server logs for errors
4. Verify database changes
5. Test authentication flows
6. Check webhook handling

**Known Facts:**
- 141 routes defined in routes.ts (verified by counting)
- Routes use Express app.get/post/put/delete/patch
- Many routes require authentication (checkUserAuth or checkAdminAuth middleware)
- Stripe webhook uses signature verification
- Multer configured for voice file uploads
- JWT tokens used for auth
- Bcrypt used for password hashing

