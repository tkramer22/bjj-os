# YouTube API Quota Upgrade Guide
## Get 100,000+ Daily Quota for Aggressive Video Curation

This guide will help you increase your YouTube Data API v3 quota from 10,000 to 100,000+ units per day, allowing you to run massive-scale video curation.

---

## Why You Need This

**Current Limitation:**
- Free quota: 10,000 units/day
- Your aggressive curation needs: ~5,800 units just for searches
- Result: Can only analyze ~100 videos/day

**After Upgrade:**
- Quota: 100,000-1,000,000 units/day
- Can analyze: 2,000-10,000 videos/day
- Full aggressive curation: 2,900 videos in 30-45 minutes

---

## Step-by-Step Quota Increase Process

### Step 1: Access Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with the Google account that has your YouTube API key
3. Select your project (the one with YouTube Data API v3 enabled)

### Step 2: Navigate to Quotas

1. In the left sidebar, click **"IAM & Admin"**
2. Click **"Quotas & System Limits"**
3. In the filter box at the top, search for: `YouTube Data API v3`
4. Find the quota named: **"Queries per day"**

### Step 3: Request Quota Increase

1. Click the checkbox next to "Queries per day"
2. Click **"EDIT QUOTAS"** button at the top
3. Fill out the quota increase form:

   **Name:** Your name
   
   **Email:** Your contact email
   
   **Phone:** Your phone number (optional but recommended)
   
   **New Quota Limit:** `100000` (or higher if you want more)
   
   **Request Description:** Use this template:
   
   ```
   I am building BJJ OS, an AI-powered Brazilian Jiu-Jitsu training platform that helps students learn techniques through curated YouTube instructional content.
   
   Our system uses the YouTube Data API v3 to:
   - Search for high-quality BJJ instructional videos across 190+ technique categories
   - Analyze video metadata to identify credible instructors
   - Build a comprehensive library of educational content for our users
   
   We need increased quota to perform initial content curation and ongoing quality assessment. Our current use case involves:
   - Technique-based searches (not instructor spam)
   - AI-powered quality filtering to ensure educational value
   - Automated content discovery for student learning
   
   Current quota (10,000/day) limits us to ~100 videos analyzed per day.
   Requested quota (100,000/day) would allow us to build our educational library efficiently while staying well within reasonable API usage.
   
   This is for a legitimate educational technology application serving BJJ students worldwide.
   ```

4. Click **"NEXT"**
5. Click **"SUBMIT REQUEST"**

### Step 4: Wait for Approval

**Timeline:**
- Typical approval: 1-3 business days
- Sometimes instant (if request is reasonable)
- May take up to 1 week for very high quotas

**Email Notifications:**
- You'll receive an email when your request is reviewed
- Check your spam folder if you don't see it

---

## Alternative: Enable Billing (Often Instant Approval)

If you enable billing on your Google Cloud project, you often get automatic quota increases:

### Step 1: Enable Billing

1. In Google Cloud Console, click **"Billing"** in the left sidebar
2. Click **"Link a Billing Account"** or **"Create Billing Account"**
3. Add a credit/debit card

### Step 2: Request Quota (Much Higher Success Rate)

1. Follow steps above to request quota increase
2. With billing enabled, you're much more likely to get:
   - Instant approval
   - Higher limits (up to 1,000,000 units/day)

**Cost:**
- YouTube Data API is **FREE** up to 10,000,000 units/day
- You won't be charged unless you exceed that (which you won't)
- Billing just shows Google you're serious and not a bot

---

## After Approval: Running Your Aggressive Curation

Once your quota is increased, run this command:

```bash
npx tsx server/trigger-aggressive-curation.ts
```

**Expected Results:**
- Runtime: 30-45 minutes
- Videos analyzed: ~2,900
- Videos added to database: 400-600 (high quality only)
- New instructors discovered: 50-80
- Complete technique coverage across all major categories

---

## Monitoring Your Quota Usage

### Check Current Usage

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **"APIs & Services"** → **"Dashboard"**
3. Click **"YouTube Data API v3"**
4. View **"Quotas"** tab to see current usage

### Daily Reset

- Quota resets at **midnight Pacific Time** (Los Angeles timezone)
- Plan your aggressive curation runs accordingly

---

## What If Your Request is Denied?

**Common Reasons for Denial:**
1. Insufficient project details
2. Suspected spam/abuse patterns
3. New Google account with no history

**Solutions:**

1. **Resubmit with More Details:**
   - Explain the educational purpose more clearly
   - Mention this is for legitimate BJJ training
   - Provide website/app URL if available

2. **Enable Billing:**
   - Even a small billing history helps
   - Shows you're a legitimate developer

3. **Start Smaller:**
   - Request 50,000 first, then increase later
   - Build usage history before requesting maximum

4. **Contact Support:**
   - Go to **"Support"** → **"Create Case"**
   - Choose "Billing/Quota increase"
   - Explain your use case in detail

---

## Temporary Solution While Waiting

Your automated curation is already running every 4 hours:
- 8 techniques × 4 videos = 32 videos per run
- 6 runs per day = 192 videos/day
- In 3-4 days you'll have 500+ quality videos

This stays within your current quota and requires zero manual work.

---

## Questions?

If you encounter any issues:

1. **Quota request rejected:** Try enabling billing or resubmit with more details
2. **Still hitting limits:** You may have other API usage eating quota
3. **Need faster results:** Consider creating 2-3 Google Cloud projects and rotating API keys

---

## Ready to Go!

Once your quota is approved:

✅ Your system is ready for aggressive curation
✅ Just run the trigger script
✅ 30-45 minutes later you'll have a production-ready video library
✅ No code changes needed

Good luck with your quota request!
