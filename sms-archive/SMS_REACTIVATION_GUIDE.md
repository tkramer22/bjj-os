# SMS FEATURE - REACTIVATION GUIDE

**ARCHIVED:** October 2025  
**REASON:** Focus on web/mobile app first, activate SMS when we have scale

---

## WHEN TO REACTIVATE:

Reactivate SMS when you hit these milestones:
- ✅ 1,000+ active users
- ✅ $10K+ MRR (can afford Twilio costs)
- ✅ Users requesting SMS feature
- ✅ Core retention proven

---

## COST ANALYSIS:

Twilio SMS costs: $0.0079 per message

**Monthly Cost Projections:**
- 1,000 users × 30 msgs = $237/month
- 5,000 users × 30 msgs = $1,185/month
- 10,000 users × 30 msgs = $2,370/month

Only activate when revenue supports these costs.

---

## TWILIO CREDENTIALS:

Account SID: [STORE IN ENV]
Auth Token: [STORE IN ENV]
Phone Number: [YOUR TWILIO NUMBER]

**Webhooks to configure:**
- Incoming SMS: https://bjjos.app/api/sms/incoming
- Status callbacks: https://bjjos.app/api/sms/status

---

## CODE LOCATIONS:

All SMS functionality preserved in `/sms-archive/`:

**API Routes:**
- `sms-incoming.js` - Receives user texts
- `sms-outgoing.js` - Sends Prof. OS responses
- `twilio-webhooks.js` - Twilio event handlers

**Components:**
- `PhoneInput.jsx` - Phone number entry
- `SMSVerification.jsx` - Code verification
- `DailyReminderSettings.jsx` - SMS scheduling

**Database Tables (still exist, just unused):**
- `sms_messages` - All SMS history
- `daily_reminders` - Scheduled check-ins
- `phone_verifications` - Signup codes

---

## REACTIVATION STEPS:

1. **Environment Setup:**
   ```bash
   SMS_ENABLED=true
   TWILIO_ACCOUNT_SID=[your_sid]
   TWILIO_AUTH_TOKEN=[your_token]
   TWILIO_PHONE_NUMBER=[your_number]
   ```

2. **Code Integration:**
   - Copy files from `/sms-archive/api/` to `/server/routes/` (Express routes)
   - Copy components from archive to `/client/src/components/`
   - Import Twilio utilities back into main codebase

3. **Database Activation:**
   - Phone field already exists in users table (nullable)
   - SMS tables already exist, just start using them
   - No migrations needed

4. **Twilio Configuration:**
   - Configure incoming SMS webhook
   - Set up status callbacks
   - Test with personal number first

5. **Landing Page Updates:**
   - Add SMS messaging back to hero section
   - Update features to mention "Text your coach"
   - Add phone number signup flow

6. **Testing Protocol:**
   - Test with 5-10 users first
   - Monitor costs daily
   - Check message delivery rates
   - Ensure two-way sync with web chat

7. **Gradual Rollout:**
   - Week 1: Offer to 10% of users
   - Week 2: 25% of users
   - Week 3: 50% of users
   - Week 4: All users (if metrics good)

---

## FEATURES TO ADD WHEN REACTIVATING:

**Enhanced SMS Experience:**
- Deep links from SMS to app (open specific conversations)
- MMS support (send video thumbnails)
- Two-way sync (SMS ↔ Web chat unified)
- SMS-only mode (users who prefer text-only)
- Smart batching (avoid spam perception)
- Rich formatting (bold, bullets in SMS)

**Marketing Angle:**
"NEW FEATURE: Check in via text"
- No app needed at the gym
- Quick session logs via SMS
- Prof. OS texts you tips
- Works without WiFi

**This becomes a differentiator vs competitors.**

---

## METRICS TO TRACK WHEN ACTIVE:

- SMS delivery rate (target: >98%)
- SMS→Web conversion (do they use both?)
- Cost per user per month
- User preference (SMS vs web)
- Retention lift from SMS
- Response time (how fast they reply)

---

## IMPORTANT NOTES:

- Keep phone field in users table (nullable) even while SMS inactive
- Don't delete SMS database tables
- Twilio account can stay active (no monthly fee if no usage)
- This code is proven and works - just paused, not abandoned

---

**SMS will be powerful growth tool when timing is right. For now, focus on core web experience.**

---

END OF REACTIVATION GUIDE
