# BJJ OS - 7-DAY TESTING & LAUNCH PLAN

**Goal:** Get BJJ OS ready for friends & family soft launch (20-30 testers with free lifetime access)  
**Timeline:** 7 days  
**Strategy:** Fix critical blockers → Test core flows → Polish → Launch  
**Philosophy:** LAUNCHABLE STATE, not perfection

---

## DAY 1 (Saturday): CRITICAL BLOCKERS & INFRASTRUCTURE ⚠️

**Goal:** Fix showstoppers that prevent ANY user from using the app

### Morning (3 hours)

**[ ] P0: Fix Twilio SMS Verification (2 hours)**
- **What:** SMS verification currently broken (TWILIO_VERIFY_SERVICE_SID incorrect)
- **How:** 
  1. Check Twilio dashboard for correct Verify Service SID
  2. Update secret: TWILIO_VERIFY_SERVICE_SID
  3. Restart workflow
- **Test:**
  ```bash
  # Test SMS send
  curl -X POST http://localhost:5000/api/auth/send-code \
    -H "Content-Type: application/json" \
    -d '{"phoneNumber": "+1YOUR_PHONE"}'
  
  # Check if SMS received
  # Verify code
  curl -X POST http://localhost:5000/api/auth/verify-code \
    -H "Content-Type: application/json" \
    -d '{"phoneNumber": "+1YOUR_PHONE", "code": "123456"}'
  ```
- **Expected:** SMS received within 30 seconds, code verification succeeds
- **Priority:** P0 (BLOCKER - no one can sign up without this)

**[ ] P0: Verify Database Connection (30 min)**
- **What:** Confirm PostgreSQL database is accessible
- **How:**
  ```bash
  psql $DATABASE_URL
  \dt  # List all tables
  SELECT COUNT(*) FROM bjj_users;
  ```
- **Expected:** Connection succeeds, 78 tables exist
- **Priority:** P0 (BLOCKER)

**[ ] P0: Test Basic Server Startup (30 min)**
- **What:** Ensure server starts without errors
- **How:**
  1. Check workflow logs
  2. Visit http://localhost:5000
  3. Check console for errors
- **Expected:** Server running on port 5000, no fatal errors
- **Priority:** P0 (BLOCKER)

### Afternoon (2 hours)

**[ ] P1: Test Admin Login (30 min)**
- **What:** Verify admin dashboard is accessible
- **How:**
  1. Navigate to /admin/login
  2. Login with admin credentials
  3. Check admin dashboard loads
- **Test:** Email + password login should work
- **Expected:** Admin can access dashboard
- **Priority:** P1 (CRITICAL - need admin access for user management)

**[ ] P1: Create Test Admin User (30 min)**
- **What:** Ensure admin can create users manually
- **How:**
  1. Login to admin
  2. Navigate to "Add Free User"
  3. Create test user with your phone number
- **Expected:** User created successfully in database
- **Priority:** P1 (CRITICAL - needed for granting lifetime access)

**[ ] P1: Verify API Keys Present (1 hour)**
- **What:** Check all required API keys are configured
- **How:**
  ```bash
  # Check secrets exist (don't print values!)
  echo "Checking secrets..."
  [ -n "$OPENAI_API_KEY" ] && echo "✓ OpenAI" || echo "✗ OpenAI"
  [ -n "$ANTHROPIC_API_KEY" ] && echo "✓ Anthropic" || echo "✗ Anthropic"  
  [ -n "$ELEVENLABS_API_KEY" ] && echo "✓ ElevenLabs" || echo "✗ ElevenLabs"
  [ -n "$STRIPE_SECRET_KEY" ] && echo "✓ Stripe" || echo "✗ Stripe"
  [ -n "$YOUTUBE_API_KEY" ] && echo "✓ YouTube" || echo "✗ YouTube"
  ```
- **Expected:** All major keys present
- **Priority:** P1 (CRITICAL - features won't work without keys)

**DAY 1 TOTAL: 5 hours**

**DAY 1 SUCCESS CRITERIA:**
- ✅ SMS verification works end-to-end
- ✅ Database accessible
- ✅ Server running without errors
- ✅ Admin can login and create users
- ✅ All API keys present

---

## DAY 2 (Sunday): CORE USER FLOWS (AUTH & ONBOARDING)

**Goal:** Verify users can sign up, login, and complete onboarding

### Morning (3 hours)

**[ ] P0: Test Full Signup Flow (1 hour)**
- **What:** Complete user signup from landing page
- **How:**
  1. Visit landing page
  2. Click "START FREE PREVIEW"
  3. Enter phone number
  4. Receive SMS code
  5. Verify code
  6. Complete onboarding
- **Expected:** User account created, redirected to dashboard
- **Priority:** P0 (BLOCKER - core user journey)

**[ ] P0: Test Login Flow (30 min)**
- **What:** Existing user can login
- **How:**
  1. Logout
  2. Visit /login
  3. Enter phone number
  4. Verify code
  5. Login successful
- **Expected:** User session created, redirected to dashboard
- **Priority:** P0 (BLOCKER)

**[ ] P0: Test 4-Step Web Onboarding (1.5 hours)**
- **What:** New user completes all onboarding steps
- **How:**
  1. Belt selection (white/blue/purple/brown/black)
  2. Content preference (FUNDAMENTALS/MIXED/ADVANCED)
  3. Style preference (gi/nogi/both)
  4. Focus areas (guard, submissions, etc.)
- **Test:** Each step saves to database
- **Expected:** User preferences saved to bjjUsers table
- **Priority:** P0 (BLOCKER - personalization depends on this)

### Afternoon (2 hours)

**[ ] P1: Test Session Persistence (30 min)**
- **What:** User stays logged in after refresh
- **How:**
  1. Login
  2. Refresh page
  3. Check still logged in
- **Expected:** Session persists via JWT
- **Priority:** P1 (CRITICAL)

**[ ] P1: Test Device Fingerprinting (30 min)**
- **What:** Verify device tracking works
- **How:**
  1. Login from desktop
  2. Check authorizedDevices table
  3. Login from mobile
  4. Verify 2 devices tracked
- **Expected:** Device fingerprints saved, login count incremented
- **Priority:** P1 (CRITICAL - account sharing prevention)

**[ ] P1: Test 3-Device Limit (1 hour)**
- **What:** Verify device limit enforcement
- **How:**
  1. Login from 3 different browsers/devices
  2. Try 4th device
  3. Should be blocked or require removing old device
- **Expected:** User can manage devices, limit enforced
- **Priority:** P1 (CRITICAL - security feature)

**DAY 2 TOTAL: 5 hours**

**DAY 2 SUCCESS CRITERIA:**
- ✅ Users can sign up via SMS
- ✅ Users can login via SMS
- ✅ Onboarding flow works end-to-end
- ✅ Sessions persist correctly
- ✅ Device tracking works
- ✅ Device limits enforced

---

## DAY 3 (Monday): PROF. OS CHAT & VIDEO RECOMMENDATIONS

**Goal:** Verify AI coaching and video discovery work

### Morning (3 hours)

**[ ] P0: Test Prof. OS Chat (Text) (1.5 hours)**
- **What:** Chat with Prof. OS using text input
- **How:**
  1. Navigate to /chat
  2. Send message: "I'm a white belt struggling with closed guard. Help?"
  3. Verify AI responds
  4. Check dual-model routing works
- **Test:**
  ```
  Simple query: "What's an armbar?" → Should use GPT-4o
  Complex query: "How do I develop my guard game as a tall person?" → Should use Claude Sonnet 4
  ```
- **Expected:** 
  - AI responds within 5 seconds
  - Response includes video recommendations
  - Journey-focused personality ("YOUR game", "YOUR journey")
- **Priority:** P0 (BLOCKER - core feature)

**[ ] P0: Test Video Recommendations (1 hour)**
- **What:** Verify AI recommends relevant videos
- **How:**
  1. Ask Prof. OS: "Show me beginner guard retention videos"
  2. Check video recommendations appear
  3. Click video link
  4. Verify video loads (bjjos.app/t/CODE format)
- **Expected:** 
  - 1-3 videos recommended per response
  - Videos match belt level and request
  - Short URLs work (bjjos.app/t/CODE)
- **Priority:** P0 (BLOCKER - primary value prop)

**[ ] P1: Test Voice Input (Whisper) (30 min)**
- **What:** Voice-to-text transcription works
- **How:**
  1. Click microphone icon in chat
  2. Record voice message
  3. Verify transcription appears
- **Expected:** Audio transcribed within 3 seconds
- **Priority:** P1 (CRITICAL - mobile experience)

### Afternoon (2.5 hours)

**[ ] P1: Test Voice Output (ElevenLabs) (1 hour)**
- **What:** Text-to-speech for AI responses
- **How:**
  1. Enable voice output in chat header
  2. Send message to Prof. OS
  3. Verify AI response is spoken
- **Test:**
  - Voice plays automatically if autoplay enabled
  - Can select voice (Antoni/Adam)
  - Can adjust playback speed (0.5x-1.5x)
- **Expected:** Clear, natural speech output
- **Priority:** P1 (CRITICAL - differentiated feature)

**[ ] P1: Test Conversation History (30 min)**
- **What:** Chat history persists
- **How:**
  1. Send 5 messages to Prof. OS
  2. Refresh page
  3. Verify conversation history loads
- **Expected:** Full conversation visible
- **Priority:** P1 (CRITICAL - user experience)

**[ ] P1: Test Video Feedback (1 hour)**
- **What:** Users can rate videos helpful/not helpful
- **How:**
  1. Watch recommended video
  2. Click "Helpful" or "Not Helpful"
  3. Verify feedback saved to database
  4. Check userVideoFeedback table
- **Expected:** Feedback tracked, influences future recommendations
- **Priority:** P1 (CRITICAL - personalization engine)

**DAY 3 TOTAL: 5.5 hours**

**DAY 3 SUCCESS CRITERIA:**
- ✅ Prof. OS chat works (text input)
- ✅ Dual-model AI routing works
- ✅ Video recommendations appear
- ✅ Short URLs work (bjjos.app/t/CODE)
- ✅ Voice input works (Whisper)
- ✅ Voice output works (ElevenLabs)
- ✅ Conversation history persists
- ✅ Video feedback tracking works

---

## DAY 4 (Tuesday): PAYMENTS & ADMIN DASHBOARD

**Goal:** Verify subscription flow and admin controls work

### Morning (3 hours)

**[ ] P1: Test Stripe Checkout (Test Mode) (1.5 hours)**
- **What:** Complete subscription signup flow
- **How:**
  1. Click "Upgrade" button
  2. Select monthly ($19.99) or annual ($149)
  3. Use Stripe test card: 4242 4242 4242 4242
  4. Complete checkout
- **Expected:** 
  - Checkout session created
  - Stripe webhook fires
  - User subscription status updated
  - User redirected to success page
- **Priority:** P1 (CRITICAL - revenue model)
- **Note:** Keep in TEST MODE for now!

**[ ] P1: Test Referral Code Validation (1 hour)**
- **What:** Users can sign up with referral codes
- **How:**
  1. Create referral code in admin
  2. Sign up new user with code
  3. Verify referral tracked
- **Expected:** 
  - Referral code validated
  - Signup attributed to referrer
  - Free trial extended (if applicable)
- **Priority:** P1 (CRITICAL - growth mechanism)

**[ ] P2: Test Subscription Cancellation (30 min)**
- **What:** Users can cancel subscriptions
- **How:**
  1. Login with subscribed test user
  2. Navigate to settings
  3. Cancel subscription
  4. Verify Stripe webhook updates status
- **Expected:** Status changes to "cancelled"
- **Priority:** P2 (IMPORTANT - user control)

### Afternoon (2.5 hours)

**[ ] P1: Test Admin User Management (1 hour)**
- **What:** Admin can view and manage users
- **How:**
  1. Login to admin dashboard
  2. Navigate to Users page
  3. Search for user
  4. View user details
  5. Update user settings
- **Expected:** All user data visible and editable
- **Priority:** P1 (CRITICAL - user support)

**[ ] P0: Test Lifetime Access Grant (1 hour)**
- **What:** Admin can grant free lifetime access
- **How:**
  1. Navigate to admin → Lifetime Access
  2. Enter phone number of test user
  3. Grant lifetime access
  4. Verify user subscription type = "lifetime"
- **Expected:** User gets lifetime access, no billing
- **Priority:** P0 (BLOCKER - needed for friends & family launch!)

**[ ] P2: Test Admin Video Library (30 min)**
- **What:** Admin can view curated videos
- **How:**
  1. Navigate to admin → Videos
  2. Browse video library
  3. Check video stats (quality scores, feedback)
- **Expected:** All curated videos visible with metadata
- **Priority:** P2 (IMPORTANT - content management)

**DAY 4 TOTAL: 5.5 hours**

**DAY 4 SUCCESS CRITERIA:**
- ✅ Stripe checkout works (test mode)
- ✅ Referral codes validate correctly
- ✅ Subscription cancellation works
- ✅ Admin can view/manage users
- ✅ Admin can grant lifetime access (CRITICAL!)
- ✅ Admin can view video library

---

## DAY 5 (Wednesday): MOBILE PWA EXPERIENCE

**Goal:** Verify mobile app experience is solid

### Morning (3 hours)

**[ ] P0: Test Mobile Signup Flow (1 hour)**
- **What:** Complete signup on mobile device
- **How:**
  1. Open on iPhone/Android browser
  2. Complete full signup flow
  3. Test SMS code entry
  4. Complete onboarding
- **Expected:** 
  - Mobile-optimized UI
  - SMS code easy to enter
  - Touch targets large enough
- **Priority:** P0 (BLOCKER - mobile-first app)

**[ ] P0: Test Mobile Chat Interface (1 hour)**
- **What:** Chat with Prof. OS on mobile
- **How:**
  1. Navigate to mobile coach (/mobile-coach)
  2. Send text message
  3. Test voice input (critical on mobile!)
  4. Test voice output
- **Expected:** 
  - Clean mobile chat UI
  - Voice input works smoothly
  - Voice output plays clearly
- **Priority:** P0 (BLOCKER - primary mobile use case)

**[ ] P1: Test Mobile Video Playback (1 hour)**
- **What:** Watch videos on mobile
- **How:**
  1. Get video recommendation
  2. Click short URL
  3. Watch video
  4. Submit feedback
- **Expected:** 
  - Videos play inline (no redirect to YouTube app)
  - Feedback buttons easy to tap
- **Priority:** P1 (CRITICAL - mobile UX)

### Afternoon (2 hours)

**[ ] P1: Test PWA Install (1 hour)**
- **What:** Install as Progressive Web App
- **How:**
  1. On mobile browser, click "Add to Home Screen"
  2. Launch from home screen
  3. Verify full-screen mode
  4. Check offline fallback
- **Expected:** 
  - App installs to home screen
  - Runs in standalone mode
  - Basic offline support
- **Priority:** P1 (CRITICAL - app-like experience)

**[ ] P2: Test Push Notifications (Android) (1 hour)**
- **What:** Push notifications work on Android
- **How:**
  1. Grant notification permission
  2. Admin sends test push
  3. Verify notification received
- **Expected:** Notification appears on Android device
- **Priority:** P2 (IMPORTANT - engagement, Android only for now)
- **Note:** iOS push requires native app

**DAY 5 TOTAL: 5 hours**

**DAY 5 SUCCESS CRITERIA:**
- ✅ Mobile signup flow smooth
- ✅ Mobile chat works perfectly
- ✅ Voice input/output work on mobile
- ✅ Video playback works on mobile
- ✅ PWA installs to home screen
- ✅ Push notifications work (Android)

---

## DAY 6 (Thursday): END-TO-END TESTING & POLISH

**Goal:** Test complete user journeys and fix polish issues

### Morning (3 hours)

**[ ] P0: End-to-End Test: New User Journey (2 hours)**
- **What:** Complete full user experience from start to finish
- **How:**
  1. Visit landing page (new incognito session)
  2. Sign up with phone number
  3. Complete onboarding
  4. Chat with Prof. OS
  5. Watch recommended video
  6. Save video to library
  7. Provide feedback
  8. Return next day and continue conversation
- **Expected:** Smooth, bug-free experience
- **Priority:** P0 (BLOCKER - complete user journey)

**[ ] P1: Test Saved Videos (1 hour)**
- **What:** Users can save videos for later
- **How:**
  1. Get video recommendation
  2. Click "Save" button
  3. Navigate to "Saved Videos"
  4. Verify video appears
  5. Remove saved video
- **Expected:** Save/unsave works, library persists
- **Priority:** P1 (CRITICAL - user retention)

### Afternoon (3 hours)

**[ ] P1: Test Theme Selector (IBJJF Belt) (1 hour)**
- **What:** Users can customize belt theme
- **How:**
  1. Navigate to Theme Settings
  2. Select belt (white/blue/purple/brown/black)
  3. Select stripe count (0-4)
  4. Verify UI updates
- **Expected:** Belt theme persists, visual representation accurate
- **Priority:** P1 (CRITICAL - unique feature)

**[ ] P2: Test Language Detection (30 min)**
- **What:** System detects user language
- **How:**
  1. Send message in Portuguese: "Oi, como vai?"
  2. Verify AI responds in Portuguese
  3. Test Spanish: "Hola, ¿cómo estás?"
- **Expected:** AI responds in detected language
- **Priority:** P2 (IMPORTANT - multilingual support)

**[ ] P2: Cross-Browser Testing (1.5 hours)**
- **What:** Test on multiple browsers
- **How:**
  1. Test on Chrome (primary)
  2. Test on Safari (iOS)
  3. Test on Firefox
  4. Test on mobile Safari
  5. Test on mobile Chrome
- **Expected:** Works on all major browsers
- **Priority:** P2 (IMPORTANT - compatibility)

**DAY 6 TOTAL: 6 hours**

**DAY 6 SUCCESS CRITERIA:**
- ✅ Complete user journey works end-to-end
- ✅ Saved videos feature works
- ✅ Belt theme selector works
- ✅ Language detection works
- ✅ Cross-browser compatibility verified

---

## DAY 7 (Friday): BETA TESTER PREP & SOFT LAUNCH

**Goal:** Prepare for friends & family launch

### Morning (3 hours)

**[ ] P0: Create 20-30 Lifetime Access Accounts (1.5 hours)**
- **What:** Grant free lifetime access to beta testers
- **How:**
  1. Collect phone numbers from friends & family
  2. Use admin bulk lifetime grant
  3. Verify all accounts created
- **Expected:** 20-30 users with lifetime access
- **Priority:** P0 (BLOCKER - launch requirement)

**[ ] P0: Create Beta Tester Welcome Message (1 hour)**
- **What:** Prepare SMS/email for beta testers
- **Message Template:**
  ```
  🥋 Welcome to BJJ OS (Prof. OS)!
  
  You're one of 20-30 beta testers with FREE LIFETIME ACCESS! 🎉
  
  QUICK START:
  1. Visit: bjjos.app
  2. Sign up with THIS phone number
  3. Complete onboarding (2 min)
  4. Start chatting with Prof. OS!
  
  WHAT TO TEST:
  • Chat with Prof. OS (your AI BJJ coach)
  • Try voice input/output
  • Watch video recommendations
  • Save videos you like
  
  FEEDBACK:
  Reply to this number with bugs, issues, or feature ideas!
  
  Let's roll! 🤙
  ```
- **Expected:** Clear, exciting onboarding message
- **Priority:** P0 (BLOCKER - launch communication)

**[ ] P1: Create Beta Tester Feedback Form (30 min)**
- **What:** Simple way to collect feedback
- **How:**
  1. Create Google Form or Typeform
  2. Questions:
     - What belt are you?
     - How was signup/onboarding?
     - How helpful was Prof. OS?
     - What bugs did you find?
     - What features do you want?
     - Would you pay $19.99/month for this?
- **Expected:** Easy feedback collection
- **Priority:** P1 (CRITICAL - product insights)

### Afternoon (2 hours)

**[ ] P1: Final Smoke Test (1 hour)**
- **What:** Test EVERYTHING one more time
- **Checklist:**
  - [ ] SMS verification works
  - [ ] Signup flow works
  - [ ] Login works
  - [ ] Onboarding works
  - [ ] Prof. OS chat works
  - [ ] Video recommendations work
  - [ ] Voice input/output works
  - [ ] Mobile experience smooth
  - [ ] Admin can grant lifetime access
  - [ ] No critical errors in logs
- **Expected:** All systems go ✅
- **Priority:** P1 (CRITICAL - pre-flight check)

**[ ] P0: SOFT LAUNCH! 🚀 (1 hour)**
- **What:** Send invites to beta testers
- **How:**
  1. Send welcome SMS to all beta testers
  2. Monitor for immediate issues
  3. Be ready to provide support
  4. Watch logs for errors
- **Expected:** 
  - First users signing up within minutes
  - Some immediate feedback
  - Minor bugs discovered (expected!)
- **Priority:** P0 (LAUNCH!)

**DAY 7 TOTAL: 5 hours**

**DAY 7 SUCCESS CRITERIA:**
- ✅ 20-30 lifetime access accounts created
- ✅ Beta tester welcome message ready
- ✅ Feedback form created
- ✅ Final smoke test passed
- ✅ SOFT LAUNCH COMPLETE! 🎉

---

## TESTING CHECKLIST (Print This!)

### Critical Path (Must Work)
- [ ] SMS verification sends codes
- [ ] Users can sign up
- [ ] Users can login
- [ ] Onboarding saves preferences
- [ ] Prof. OS chat responds
- [ ] Video recommendations appear
- [ ] Videos play via short URLs
- [ ] Admin can grant lifetime access

### Important Features
- [ ] Voice input (Whisper)
- [ ] Voice output (ElevenLabs)
- [ ] Conversation history
- [ ] Video feedback (helpful/not helpful)
- [ ] Saved videos
- [ ] Device tracking
- [ ] Mobile PWA experience

### Polish Items
- [ ] Belt theme selector
- [ ] Language detection
- [ ] Push notifications (Android)
- [ ] Cross-browser compatibility

### Known Issues to Fix
- [ ] SMS verification (TWILIO_VERIFY_SERVICE_SID)
- [ ] Any LSP errors in routes.ts (40 diagnostics)
- [ ] Performance optimization

---

## LAUNCH DAY MONITORING

**Metrics to Watch:**
1. **Signup Rate:** How many beta testers actually sign up?
2. **Onboarding Completion:** Do users complete all 4 steps?
3. **First Message:** Do users send first message to Prof. OS?
4. **Video Clicks:** Do users watch recommended videos?
5. **Daily Active Users:** Do users come back day 2, 3, 4?

**Where to Monitor:**
- Admin Dashboard → Overview (user stats)
- Admin Dashboard → AI Logs (conversation quality)
- Admin Dashboard → Feedback (video ratings)
- Server logs (errors, crashes)

**Support Plan:**
- Respond to feedback within 1 hour
- Fix critical bugs same-day
- Collect feature requests for post-launch

---

## SUCCESS = LAUNCHABLE, NOT PERFECT

**Launch with:**
- ✅ Core features working (chat, videos, auth)
- ✅ Mobile experience solid
- ✅ No critical bugs
- ✅ 20-30 excited beta testers

**Fix later:**
- ⏳ Performance optimization
- ⏳ Advanced features
- ⏳ Edge case bugs
- ⏳ Additional integrations

**Remember:** Feedback from real users > weeks of internal testing!

---

## CONTINGENCY PLANS

**If SMS verification still broken by DAY 2:**
- Pivot to email verification temporarily
- Or use magic links instead of codes

**If AI APIs rate-limited:**
- Implement queuing system
- Add loading states
- Cache common responses

**If too many bugs on launch day:**
- Delay launch by 24-48 hours
- Focus on top 3 critical bugs only
- Launch with "beta" disclaimer

**If no one signs up:**
- Personal outreach (call/text friends directly)
- Simplify signup flow
- Offer 1-on-1 onboarding help

---

## POST-LAUNCH (Days 8-14)

**Week 2 Focus:**
1. **Collect & Analyze Feedback:** What do users love? What's broken?
2. **Fix Top 3 Bugs:** Focus on most-reported issues
3. **Monitor Retention:** Are users coming back?
4. **Iterate on UX:** Polish based on real usage
5. **Plan Public Launch:** When to open to public? Pricing strategy?

**Good Luck! Let's launch! 🚀**
