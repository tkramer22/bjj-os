# End-to-End System Test Guide

## 🎯 Complete Testing Walkthrough for BJJ OS

### Your Test Phone Number: +19148373750

---

## 📋 Step 1: Access Admin Dashboard

### Option A: Direct URL (Fastest)
1. **Open browser** and go to:
   ```
   https://bjjos.app/admin/add-free-user
   ```
   (Or use your current Replit URL if domain isn't verified yet)

### Option B: Via Landing Page
1. Go to: `https://bjjos.app`
2. Manually type in URL bar: `/admin/add-free-user`

---

## 🔐 Step 2: Admin Password

Your admin password is stored in your **ADMIN_PASSWORD** environment variable.

**To find it:**
1. In Replit, click **"Secrets"** in Tools menu (left sidebar)
2. Look for `ADMIN_PASSWORD`
3. Copy the value

**You'll need this password to:**
- Access `/admin/add-free-user` page
- Add yourself as a free user

---

## 👤 Step 3: Add Yourself as Free User

### Fill Out the Form:

**Admin Password:** [Your ADMIN_PASSWORD from Secrets]

**Phone Number:** `+19148373750`

**Name (optional):** `Tyler` or your name

**Notes (optional):** `Founder - testing system`

**Click:** "Add Free User"

---

## 📱 Step 4: Welcome SMS (What You'll Receive)

Within seconds, you'll receive this SMS:

```
🥋 You've been given free access to BJJ OS!

Every morning at 8 AM, you'll get ONE curated BJJ technique 
from elite instructors - timestamped and ready to drill.

Quick setup (30 seconds):

What belt are you?
Reply: WHITE, BLUE, PURPLE, BROWN, or BLACK

(You can opt out anytime by replying STOP)
```

---

## 🥋 Step 5: Complete Onboarding (Reply to SMS)

### Reply 1: Belt Level
**Text back:** `PURPLE` (or your actual belt level)

**You'll receive:**
```
Nice! Now let's dial in your preferences.

What's your primary training style?
Reply: GI, NOGI, or BOTH
```

### Reply 2: Training Style
**Text back:** `BOTH` (or GI/NOGI)

**You'll receive:**
```
Perfect! One more thing...

Which areas do you want to focus on?
Reply with numbers (e.g., "1,3,5"):

1. Guard work
2. Passing
3. Submissions
4. Escapes
5. Sweeps
6. Takedowns
```

### Reply 3: Focus Areas
**Text back:** `1,3,5` (or your preferred numbers)

**You'll receive:**
```
All set! 🥋

Starting tomorrow at 8:00 AM, you'll get your daily technique.

Your referral code: USER######

Commands you can use:
• MORE - Get extra technique today
• SKIP - Skip today's technique
• TIME - Change your daily send time
• PAUSE - Pause daily techniques
```

### Reply 4 (Optional): Referral Code
**If you have a referral code, text it now**
**Otherwise, text:** `NONE`

---

## 🎬 Step 6: Get Your First Technique Now (Don't Wait!)

### Test the "MORE" Command:
**Text:** `MORE`

**You'll receive something like:**
```
🥋 Here's your technique for today:

Video: [YouTube URL]
Instructor: John Danaher
Topic: Closed Guard - Cross Collar Choke
Start at: 3:45

Why this technique:
This is a fundamental choke that works at all levels. 
Danaher breaks down the grip fighting and finishing 
mechanics perfectly.

Reply MORE for another, SKIP to pass, or STOP to pause.
```

---

## 🧪 Step 7: Test All Commands

### Available SMS Commands:

| Command | What It Does | Example Response |
|---------|--------------|------------------|
| `MORE` | Get another technique today | Sends new curated technique |
| `SKIP` | Skip today's technique | "Got it! Skipped today's technique." |
| `TIME` | Change daily send time | "What time? Reply in HH:MM format (e.g., 07:30)" |
| `PAUSE` | Pause daily techniques | "Paused! Reply RESUME when ready." |
| `RESUME` | Resume after pause | "Welcome back! Daily techniques resumed." |

### Test Each One:
1. Text `MORE` - Get technique ✓
2. Text `SKIP` - Confirm skip works ✓
3. Text `TIME` then `07:30` - Change to 7:30 AM ✓
4. Text `PAUSE` - Pause delivery ✓
5. Text `RESUME` - Resume delivery ✓

---

## 📊 Step 8: Check Admin Dashboard

### Verify Your Data:
1. Go to `/admin/schedules` (if implemented)
2. Go to `/admin/recipients` (if implemented)
3. Check analytics dashboard

**You should see:**
- Your phone number in the system
- Belt level: Purple
- Style: Both
- Focus areas: Guard work, Submissions, Sweeps
- Subscription type: free_admin_grant
- Your referral code

---

## ✅ Success Checklist

- [ ] Accessed `/admin/add-free-user` with admin password
- [ ] Added yourself: +19148373750
- [ ] Received welcome SMS within 30 seconds
- [ ] Replied with belt level (WHITE/BLUE/PURPLE/BROWN/BLACK)
- [ ] Replied with training style (GI/NOGI/BOTH)
- [ ] Replied with focus areas (numbers like 1,3,5)
- [ ] Replied with referral code or NONE
- [ ] Got confirmation with your referral code
- [ ] Texted `MORE` and received first technique
- [ ] Technique includes: Video URL, instructor, topic, timestamp, description
- [ ] Tested `SKIP` command - works
- [ ] Tested `TIME` command - works
- [ ] Tested `PAUSE` and `RESUME` - works
- [ ] Checked admin dashboard - data appears correctly

---

## 🔍 What to Verify in Each Technique SMS

Every technique should include:
- ✅ **YouTube URL** - Clickable link
- ✅ **Instructor name** - Recognizable BJJ instructor
- ✅ **Technique topic** - Clear description
- ✅ **Timestamp** - Exact start time (e.g., "Start at: 3:45")
- ✅ **Why this technique** - AI-generated explanation
- ✅ **Action prompts** - "Reply MORE for another..."

---

## 🚨 Troubleshooting

### Not Receiving SMS?
1. **Check Twilio credentials** in Secrets
2. **Verify phone number format**: Must include country code (+1...)
3. **Check Twilio logs** in Twilio Console
4. **Verify webhook URL**: Should be `https://bjjos.app/api/sms-reply`

### SMS Received but No Response to Replies?
1. **Check Twilio webhook** is set to POST method
2. **Verify webhook URL** points to your domain
3. **Check app logs** for errors

### Technique Not Curated Well?
1. **Verify ANTHROPIC_API_KEY** is set
2. **Verify YOUTUBE_API_KEY** is set
3. **Check API quotas** (YouTube/Anthropic)

### Admin Password Not Working?
1. Check **Secrets** for `ADMIN_PASSWORD`
2. Make sure no extra spaces in password
3. Try password reset if needed

---

## 📱 Your Test Data

**Phone:** +19148373750  
**Name:** Tyler (or as entered)  
**Belt:** [You'll set this in onboarding]  
**Style:** [You'll set this in onboarding]  
**Focus Areas:** [You'll set this in onboarding]  
**Subscription:** Free (admin grant)  
**Send Time:** 8:00 AM ET (can change with TIME command)  
**Referral Code:** Will be shown after onboarding (format: USER######)  

---

## 🎉 Next Steps After Testing

Once everything works:
1. ✅ System is production-ready
2. ✅ Share your referral code with friends
3. ✅ Monitor analytics dashboard
4. ✅ Add more free users or set up paid subscriptions
5. ✅ Update Twilio webhook to use bjjos.app domain

---

**Start testing now!** Go to your admin dashboard and add yourself as the first user. 🚀
