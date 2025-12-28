# Launch Day Checklist - Saturday Morning

**Target Date:** Saturday (Your Launch Day)  
**Goal:** 20-30 beta testers signed up and testing  
**Status:** Ready to execute

---

## ☀️ PRE-LAUNCH (8:00 AM - 9:30 AM)

### 📱 My Phone Test (30 minutes)

**Test the complete user journey on YOUR phone:**

- [ ] Open app URL on iPhone/Android
- [ ] Enter your phone number
- [ ] **CRITICAL:** Receive SMS code within 30 seconds
  - If not: Check Twilio dashboard immediately
  - Verify phone number is in Twilio verified list
- [ ] Enter verification code
- [ ] Complete onboarding (belt, stripe, preferences, goals)
- [ ] Verify chat interface loads

**Ask 3 test questions:**
- [ ] "triangle choke" → Verify 2+ videos appear
- [ ] "armbar" → Verify 2+ videos appear  
- [ ] "guard passing" → Verify 2+ videos appear

**Test video playback:**
- [ ] Tap play button on first video
- [ ] **CRITICAL:** Verify video plays EMBEDDED (not redirecting to YouTube)
- [ ] Close modal (X button, backdrop tap, Escape)
- [ ] Tap play on different video
- [ ] Verify different video plays

**Test save functionality:**
- [ ] Save a video (tap bookmark icon)
- [ ] Navigate to "Saved" tab
- [ ] Verify saved video appears with metadata
- [ ] Unsave video
- [ ] Verify removed from Saved tab

**Test persistence:**
- [ ] Close app completely
- [ ] Reopen app
- [ ] Verify still logged in (no re-auth required)
- [ ] Verify chat history persists

**If ANY of these fail, DO NOT LAUNCH. Fix first.**

---

### 🛠️ Database Access Test (5 minutes)

- [ ] Open Replit Database tool (Tools → Database → Query)
- [ ] Test query to view your account:
  ```sql
  SELECT phone_number, subscription_tier, subscription_status 
  FROM bjj_users 
  WHERE phone_number = 'YOUR_PHONE';
  ```
- [ ] Grant yourself lifetime access:
  ```sql
  UPDATE bjj_users 
  SET subscription_tier = 'lifetime', subscription_status = 'active'
  WHERE phone_number = 'YOUR_PHONE';
  ```
- [ ] Verify it worked (re-run first query)
- [ ] Keep LAUNCH_DAY_SQL_QUERIES.md open in a tab

---

### 📞 Twilio Verification (15 minutes)

- [ ] **Verify 20-30 beta tester phone numbers in Twilio**
  - Critical: Trial accounts require verified numbers
  - Format: E.164 (+1XXXXXXXXXX)
- [ ] **Test SMS sending:**
  - [ ] Send test to 3 different verified numbers
  - [ ] Confirm codes arrive within 30 seconds
  - [ ] Verify codes are readable and correct
- [ ] **Check Twilio balance:**
  - [ ] Sufficient credits for 30+ users × 2 codes each
  - [ ] ~60 SMS minimum

---

### 📋 Beta Tester List Ready (10 minutes)

**Organize your 20-30 testers into tiers:**

**Tier 1 - Close Friends (5-10 people):**
- Tech-savvy
- Will give honest feedback immediately
- Can troubleshoot minor issues
- Launch: 10:00 AM

**Tier 2 - Training Partners (10-15 people):**
- BJJ-focused
- Less tech-savvy (good for UX testing)
- Will use it genuinely
- Launch: 12:00 PM (if Tier 1 successful)

**Tier 3 - Influencers/Instructors (5-10 people):**
- Higher profile
- Potential testimonials
- Word-of-mouth value
- Launch: 6:00 PM (if day goes well)

**For each person, have:**
- [ ] Name
- [ ] Phone number (E.164 format)
- [ ] Belt level (helpful for context)
- [ ] Notes (why they're valuable testers)

---

### 📄 Documentation Ready (5 minutes)

- [ ] BETA_TESTER_GUIDE.md ready to send
- [ ] Copy invite message template (see below)
- [ ] EMERGENCY_PLAYBOOK.md accessible
- [ ] Admin dashboard URL saved
- [ ] Error monitoring page accessible

---

## 🚀 WAVE 1 LAUNCH (10:00 AM)

### Send Invites to Tier 1 (5-10 people)

**Invite Message Template:**
```
Hey [Name]! 

BJJ OS is live for beta testing and you're one of the first! 🥋

Your AI BJJ coach is ready:
🎥 211 curated technique videos
🤖 Personalized coaching from Prof. OS
📱 Mobile-first experience

Link: [Your App URL]

Quick guide: [Link to BETA_TESTER_GUIDE.md]

Let me know what you think! Text me bugs, feedback, or questions. 

Would love a testimonial if you dig it. 💪

— [Your Name]
```

**After sending:**
- [ ] Start timer (monitor next 30 minutes closely)
- [ ] Watch admin dashboard for signups
- [ ] Keep phone nearby for questions

---

## 👀 MONITORING (10:00 AM - 12:00 PM)

### Every 15 Minutes Run These SQL Queries:

**1. Check signups today:**
```sql
SELECT COUNT(*) as signups_today FROM bjj_users WHERE created_at >= CURRENT_DATE;
```

**2. Check active users (sent messages):**
```sql
SELECT COUNT(DISTINCT user_id) as active_users 
FROM conversations 
WHERE created_at >= CURRENT_DATE;
```

**3. Check for stuck verifications:**
```sql
SELECT COUNT(*) as stuck_users
FROM bjj_users 
WHERE created_at >= CURRENT_DATE
  AND verification_code IS NOT NULL
  AND verification_code_expires_at < NOW();
```

**Also Monitor:**
- [ ] Texts from users (respond within 5 minutes)
- [ ] Workflow logs in Replit (check for errors)
- [ ] Twilio dashboard (SMS delivery status)

### Success Criteria for Wave 1:

**GO for Wave 2 if:**
- ✅ 80%+ of Tier 1 signed up successfully
- ✅ No critical bugs (videos playing, SMS working)
- ✅ Mostly positive feedback
- ✅ Error rate <10%

**PAUSE if:**
- ❌ <50% signup success rate
- ❌ Multiple people reporting same bug
- ❌ SMS codes not sending
- ❌ Videos not playing for anyone
- ❌ Prof. OS not responding

**If paused:** Go to EMERGENCY_PLAYBOOK.md

---

## 🚀 WAVE 2 LAUNCH (12:00 PM)

**Only proceed if Wave 1 went well.**

- [ ] Send invites to Tier 2 (10-15 people)
- [ ] Same monitoring schedule (every 15 minutes)
- [ ] Respond to Wave 1 feedback
- [ ] Fix non-critical issues if time allows

---

## 🌆 AFTERNOON (2:00 PM - 6:00 PM)

### Collect Feedback:

- [ ] Read all texts/messages from testers
- [ ] Note common themes:
  - What do people love?
  - What's confusing?
  - What's broken?
- [ ] Prioritize fixes:
  - Critical (fix today): _______________
  - Important (fix this weekend): _______________
  - Nice-to-have (fix next week): _______________

### Grant Lifetime Access (End of Day):

**Bulk grant to all beta testers:**
```sql
UPDATE bjj_users 
SET subscription_tier = 'lifetime', subscription_status = 'active'
WHERE phone_number IN (
  -- Paste all beta tester phone numbers here
  '+15551234567',
  '+15559876543'
  -- ... add all numbers
);
```

**Verify:**
```sql
SELECT COUNT(*) FROM bjj_users WHERE subscription_tier = 'lifetime';
```

### Fix Issues:

**Quick wins (30 min or less):**
- [ ] Typos in copy
- [ ] Confusing wording
- [ ] UI tweaks

**Save for tomorrow:**
- Bugs requiring >1 hour
- Feature requests
- Performance optimizations

### Thank Early Testers:

Send quick thank-you texts:
```
Thanks for testing! Saw your feedback on [specific thing]. That's super helpful. Keep it coming! 🙏
```

---

## 🌟 WAVE 3 LAUNCH (6:00 PM)

**Only if day went well and no major issues.**

- [ ] Send invites to Tier 3 (5-10 influencers/instructors)
- [ ] **Different message for influencers:**

```
Hey [Name],

I built something I think you'll dig - Prof. OS, an AI BJJ coach.

211 curated videos from Roger Gracie, Marcelo Garcia, Gordon Ryan, etc.
Ask questions, get personalized recommendations.

You're one of 30 beta testers. Would love your feedback.

Link: [URL]

If you love it, a testimonial would be amazing for launch.

— [Your Name]
```

### Ask for Testimonials:

**From happy testers, request:**
```
Hey! Glad you're loving it! 

Would you mind giving me a quick testimonial? Just 1-2 sentences:

"[Your Name], [Belt Level]: [Why BJJ OS is helpful]"

I'll use it for the public launch. Thanks! 🙏
```

---

## 🌙 END OF DAY (9:00 PM)

### Count & Celebrate:

**Metrics:**
- [ ] Total signups: _____ (Goal: 20+)
- [ ] Completion rate: _____ % (Goal: 80%+)
- [ ] Active users (sent >1 message): _____ (Goal: 15+)
- [ ] Videos watched: _____ (Goal: 50+)
- [ ] Testimonials collected: _____ (Goal: 3-5)

**Bugs Found:**
- [ ] Critical: _______________
- [ ] Important: _______________
- [ ] Minor: _______________

**User Feedback Summary:**
- **What they loved:** _______________
- **What was confusing:** _______________
- **Feature requests:** _______________

### Plan Tomorrow:

**Sunday priorities:**
1. Fix critical bugs
2. Respond to all feedback
3. Add requested features (if quick)
4. Prepare for Monday wider launch (if ready)

### Thank Everyone:

**Send group text or individual thanks:**
```
Thanks for beta testing BJJ OS today! 

[X] of you signed up and the feedback was incredible.

Fixing bugs tonight/tomorrow. 

If you haven't given feedback yet, still want to hear it!

You're shaping something that'll help thousands of grapplers. 🙏🥋

— [Your Name]
```

---

## 📊 SUCCESS CRITERIA

**Minimum Viable Launch:**
- ✅ 15+ signups
- ✅ <20% error rate
- ✅ Video playback working for 80%+
- ✅ No critical bugs preventing usage
- ✅ At least 5 positive feedback messages

**Amazing Launch:**
- 🎉 25+ signups
- 🎉 <10% error rate  
- 🎉 90%+ signup completion rate
- 🎉 5+ testimonials collected
- 🎉 Feature requests (shows engagement!)
- 🎉 Someone says "I'd pay for this"

**Red Flags (Pause & Fix):**
- 🚨 <10 signups
- 🚨 >50% error rate
- 🚨 Multiple users report same bug
- 🚨 Videos not working
- 🚨 SMS codes not sending
- 🚨 Negative feedback outweighs positive

---

## 🎯 FINAL CHECKLIST

**Right before sending first invite:**

- [ ] App tested on YOUR phone (complete flow)
- [ ] Videos confirmed playing embedded
- [ ] Save/unsave working
- [ ] Database queries tested (can grant lifetime access)
- [ ] LAUNCH_DAY_SQL_QUERIES.md open in a tab
- [ ] Phone numbers verified in Twilio
- [ ] Invite messages drafted
- [ ] Beta tester guide ready to send
- [ ] Emergency playbook accessible
- [ ] Deep breath taken 😌

---

**You've got this. Launch day is about learning, not perfection.**

**Ship it. Get feedback. Iterate. 🚀**
