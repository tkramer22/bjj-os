# BJJ OS - Quick Test Script for Launch

**Purpose:** Verify all core features work before inviting beta testers  
**Time Required:** 15-20 minutes  
**When to Run:** 30 minutes before sending first invite

---

## 🧪 TEST 1: NEW USER SIGNUP (5 min)

### Steps
1. **Open app in incognito/private window**
   - URL: `https://[your-app-url]/app/chat`
   - Reason: Ensures fresh session (no cached data)

2. **Phone Authentication**
   - [ ] Enter your phone number (use real phone for testing)
   - [ ] Receive SMS with OTP code
   - [ ] Enter OTP code
   - [ ] Successfully authenticated ✅

3. **Onboarding Flow**
   - [ ] **Step 1:** Select your belt (e.g., Blue Belt)
   - [ ] **Step 2:** Select stripe count (0-4)
   - [ ] **Step 3:** Choose training style (FUNDAMENTALS/MIXED/ADVANCED)
   - [ ] **Step 4:** Set competition goals
   - [ ] Complete onboarding → Land on chat screen ✅

### Expected Result
✅ New user account created  
✅ Landed on chat interface  
✅ Ready to send first message

### If Failed
- Check Twilio credentials in environment variables
- Verify phone number format (E.164)
- Check admin dashboard for error logs

---

## 🎬 TEST 2: VIDEO RECOMMENDATIONS (5 min)

### Test 2A: Triangle Choke
**Send Message:** "triangle choke"

**Wait:** 5-10 seconds for AI response

**Verify:**
- [ ] AI response appears (coaching text) ✅
- [ ] **2 video cards** appear below response
- [ ] Each video card shows:
  - [ ] Thumbnail image
  - [ ] Technique title (e.g., "Triangle Choke Setup from Closed Guard")
  - [ ] Instructor name (e.g., "Marcelo Garcia")
  - [ ] Duration (e.g., "8:45")
  - [ ] Play button (▶)
  - [ ] Save button (bookmark icon)

**Expected Videos:**
- Gordon Ryan, Lachlan Giles, Marcelo Garcia, or similar

### Test 2B: Armbar
**Send Message:** "armbar"

**Verify:**
- [ ] AI response appears
- [ ] **2 video cards** appear
- [ ] Videos mention "armbar" or related techniques

**Expected Videos:**
- Roger Gracie (9.5 score), Craig Jones (9.0), or Renzo Gracie

### Test 2C: Guard Passing
**Send Message:** "guard passing"

**Verify:**
- [ ] AI response appears
- [ ] **2 video cards** appear
- [ ] Videos relevant to guard passing

### If Failed
- Check browser console for errors (F12 → Console)
- Verify database has 211 videos: `SELECT COUNT(*) FROM ai_video_knowledge;`
- Check server logs for "INJECTING TOP RANKED VIDEOS" messages
- Confirm video URLs are valid (click play button to test)

---

## 📱 TEST 3: VIDEO PLAYBACK (3 min)

### Steps
1. **Click/tap any video's play button (▶)**

2. **Verify Modal Opens:**
   - [ ] Video modal appears over chat
   - [ ] Video starts loading/playing
   - [ ] YouTube player embedded (NOT redirecting to YouTube app/site)
   - [ ] Video controls visible (play/pause, timeline, volume)

3. **Test Close Methods:**
   - [ ] Click X button (top-right) → Modal closes ✅
   - [ ] Reopen video, press Escape key → Modal closes ✅
   - [ ] Reopen video, click outside modal (on darkened backdrop) → Modal closes ✅

4. **Test on Mobile (if possible):**
   - [ ] Tap play button → Video plays
   - [ ] Tap backdrop → Modal closes
   - [ ] Video stays in portrait/landscape as appropriate

### Expected Result
✅ Videos play embedded in modal  
✅ No redirect to YouTube  
✅ Multiple close methods work  
✅ Mobile-friendly

### If Failed
- Check VideoPlayer.tsx for correct YouTube embed URL format
- Verify `playsinline` parameter is set
- Test different video to rule out single broken URL
- Check browser console for embedding errors

---

## 💾 TEST 4: SAVE/UNSAVE FUNCTIONALITY (2 min)

### Steps
1. **Save a Video**
   - [ ] Click/tap bookmark icon on any video card
   - [ ] Icon changes state (fills in or changes color)
   - [ ] Confirmation feedback (visual change)

2. **Check Saved Tab**
   - [ ] Navigate to "Saved" tab (bottom navigation)
   - [ ] Verify saved video appears in list
   - [ ] Video card shows same info (title, instructor, thumbnail)

3. **Unsave Video**
   - [ ] Click/tap bookmark icon again (either in chat or Saved tab)
   - [ ] Video removed from Saved tab
   - [ ] Icon returns to unsaved state

### Expected Result
✅ Videos save/unsave correctly  
✅ Saved tab reflects changes immediately  
✅ Video metadata preserved

### If Failed
- Check database `saved_videos` table for new entries
- Verify user authentication (must be logged in)
- Check TanStack Query cache invalidation logic

---

## 🎤 TEST 5: VOICE INPUT (2 min) - OPTIONAL

### Steps
1. **Click microphone icon** (if visible in chat input)
2. **Grant browser permission** to use microphone
3. **Speak test query:** "Show me triangle choke videos"
4. **Stop recording**

**Verify:**
- [ ] Speech-to-text conversion appears in input field
- [ ] Text is accurate
- [ ] Can send transcribed message
- [ ] Response works same as typed query

### Expected Result
✅ Voice converted to text via Whisper API  
✅ Works on mobile (if testing mobile)

### If Failed
- Check OPENAI_API_KEY is set
- Verify browser microphone permissions granted
- Try different browser (Chrome/Safari best for audio)

---

## 🔊 TEST 6: VOICE OUTPUT (2 min) - OPTIONAL

### Steps
1. **Send any message** to trigger AI response
2. **Look for speaker/audio icon** near AI response
3. **Click/tap to play audio version** of response

**Verify:**
- [ ] AI voice reads response aloud
- [ ] Voice sounds natural (ElevenLabs)
- [ ] Can pause/stop playback
- [ ] Works on mobile

### Expected Result
✅ Text-to-speech works  
✅ Natural-sounding voice

### If Failed
- Check ELEVENLABS_API_KEY is set
- Verify audio permissions in browser
- Test with shorter message (quota limits?)

---

## 🎯 TEST 7: COMPLETE USER JOURNEY (3 min)

### Scenario: New White Belt User
1. **Sign up** (phone auth + onboarding)
2. **Send:** "I'm new to BJJ, what should I learn first?"
3. **Verify:** AI gives beginner-appropriate advice
4. **Check:** Video recommendations match skill level
5. **Save:** One recommended video
6. **Navigate:** Settings → Check profile shows "White Belt"
7. **Navigate:** Saved tab → Verify saved video appears

### Expected Result
✅ Complete flow works seamlessly  
✅ Personalization matches belt level  
✅ Navigation smooth  
✅ Data persists across tabs

---

## ✅ QUICK CHECKLIST (Pre-Launch)

**Before inviting ANYONE, confirm:**

### Core Features
- [ ] ✅ Phone authentication works
- [ ] ✅ Onboarding completes successfully
- [ ] ✅ AI responds to messages (3-10 second response time)
- [ ] ✅ **2 videos appear per query** (guaranteed)
- [ ] ✅ Videos play embedded (not redirecting)
- [ ] ✅ Save/unsave works
- [ ] ✅ Saved tab shows saved videos

### Mobile Experience (Critical)
- [ ] ✅ Chat interface renders correctly on mobile (375px width)
- [ ] ✅ Video cards tap-friendly (not too small)
- [ ] ✅ Modal opens/closes smoothly on tap
- [ ] ✅ Video plays without redirect on mobile
- [ ] ✅ Bottom navigation works (Coach/Saved/Settings tabs)

### Data Quality
- [ ] ✅ 211 videos in database (`SELECT COUNT(*) FROM ai_video_knowledge;`)
- [ ] ✅ Videos are from elite instructors (Roger, Marcelo, Gordon, Danaher)
- [ ] ✅ AI coaching sounds knowledgeable and helpful
- [ ] ✅ Recommendations relevant to queries

### Admin & Monitoring
- [ ] ✅ Admin dashboard accessible (check URL)
- [ ] ✅ SMS notifications configured (check admin phone receives alerts)
- [ ] ✅ Can see new user signups in admin panel
- [ ] ✅ Error logs accessible if needed

---

## 🚨 FAIL CONDITIONS (DO NOT LAUNCH IF)

**STOP and fix if any of these occur:**

1. **No videos appear** after AI response
   - Critical: Core value prop broken
   - Fix: Check video injection logic, database connection

2. **Videos redirect to YouTube** instead of playing embedded
   - Critical: Breaks mobile experience
   - Fix: Check VideoPlayer modal, YouTube embed parameters

3. **Authentication fails** (no SMS received)
   - Critical: Users can't sign up
   - Fix: Verify Twilio credentials, check phone number format

4. **AI doesn't respond** or takes >30 seconds
   - Critical: Poor user experience
   - Fix: Check Claude API key, rate limits, network issues

5. **Mobile interface broken** (overlapping elements, can't tap buttons)
   - Critical: "Mobile is key"
   - Fix: Test on real device, adjust responsive CSS

---

## 📝 TEST RESULTS TEMPLATE

**Copy/paste this after testing:**

```
BJJ OS - Launch Test Results
Date: [Your Date]
Tester: [Your Name]
Time: [Start] - [End]

TEST 1: NEW USER SIGNUP
Status: ✅ PASS / ❌ FAIL
Notes: 

TEST 2: VIDEO RECOMMENDATIONS
Triangle Choke: ✅ PASS / ❌ FAIL (X videos shown)
Armbar: ✅ PASS / ❌ FAIL (X videos shown)
Guard Passing: ✅ PASS / ❌ FAIL (X videos shown)
Notes:

TEST 3: VIDEO PLAYBACK
Embedded Play: ✅ PASS / ❌ FAIL
Modal Close: ✅ PASS / ❌ FAIL
Mobile: ✅ PASS / ❌ FAIL / ⏭️ SKIPPED
Notes:

TEST 4: SAVE/UNSAVE
Status: ✅ PASS / ❌ FAIL
Notes:

TEST 5: VOICE INPUT
Status: ✅ PASS / ❌ FAIL / ⏭️ SKIPPED
Notes:

TEST 6: VOICE OUTPUT
Status: ✅ PASS / ❌ FAIL / ⏭️ SKIPPED
Notes:

TEST 7: COMPLETE JOURNEY
Status: ✅ PASS / ❌ FAIL
Notes:

OVERALL: ✅ READY TO LAUNCH / ❌ NEEDS FIXES
Critical Issues:
Next Steps:
```

---

## 🎯 POST-TEST ACTIONS

### If All Tests Pass ✅
1. **Document test completion** (save results above)
2. **Prepare invite message** (see LAUNCH_CHECKLIST.md)
3. **Set up monitoring** (admin dashboard + phone nearby for SMS alerts)
4. **Send first 5 invites**
5. **Watch for first signups** (next 30-60 minutes)

### If Tests Fail ❌
1. **Document specific failures** (screenshots helpful)
2. **Check server logs** for error details
3. **Fix critical issues first** (auth, videos, mobile)
4. **Re-run tests** after fixes
5. **Delay launch** until all critical tests pass

---

**Remember:** Better to delay 1 day and launch perfectly than rush and disappoint first users. Mobile experience is CRITICAL. 🚀
