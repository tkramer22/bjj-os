# Vercel Deployment - Quick Reference

## 🚀 Fast Track (30 minutes)

### 1️⃣ Export to GitHub (5 min)
```bash
# In Replit Shell
git init
git add .
git commit -m "Deploy to Vercel"
git remote add origin https://github.com/YOUR_USERNAME/bjj-os.git
git push -u origin main
```

### 2️⃣ Deploy to Vercel (10 min)
1. Go to https://vercel.com → New Project
2. Import your GitHub repo
3. **Framework:** Other/Node.js
4. **Build Command:** `npm run build`
5. **Start Command:** `npm start`
6. **Node Version:** 20.x
7. Click Deploy

### 3️⃣ Add Environment Variables (5 min)
In Vercel Project Settings → Environment Variables, add:

```
ANTHROPIC_API_KEY=sk-ant-xxxxx
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
YOUTUBE_API_KEY=AIzaSyxxxxx
DATABASE_URL=postgresql://user:pass@host:5432/db
ADMIN_PASSWORD=your_secure_password
SESSION_SECRET=your_session_secret
```

### 4️⃣ Connect bjjos.app Domain (10 min)
1. **Vercel:** Settings → Domains → Add `bjjos.app`
2. **Your Domain Registrar** (Namecheap/GoDaddy/etc):
   ```
   A Record:
   Name: @
   Value: 76.76.21.21 (use IP from Vercel)
   
   CNAME Record:
   Name: www
   Value: cname.vercel-dns.com
   ```
3. Wait 15-30 minutes for DNS propagation

### 5️⃣ Update Twilio Webhook (2 min)
In Twilio Console → Your Phone Number → Messaging:
```
Webhook URL: https://bjjos.app/api/sms-reply
HTTP: POST
```

## ✅ Verification Checklist
- [ ] Visit https://bjjos.app (landing page loads)
- [ ] Test signup form
- [ ] Login to `/admin/add-free-user` with admin password
- [ ] Create free user → receives SMS
- [ ] Reply to SMS → onboarding works

## 🆘 Common Issues

**Build fails?**
- Check all env vars are set
- Verify Node version is 20.x

**Domain not working?**
- Wait 30 min for DNS
- Check at https://dnschecker.org

**SMS not sending?**
- Verify Twilio webhook URL
- Check env vars in Vercel

## 📁 Files Created for Deployment
- `vercel.json` - Vercel configuration
- `.vercelignore` - Files to exclude
- `DEPLOYMENT.md` - Full guide
- `VERCEL_QUICK_START.md` - This file

---
**Need detailed help?** See `DEPLOYMENT.md` for the complete guide.
