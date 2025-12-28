# Connect bjjos.app to Your Published Replit App

## 🎉 Your App is Published!

Your BJJ OS app is now live on Replit. Follow these steps to connect your custom domain **bjjos.app**.

---

## 📋 Step 1: Get DNS Records from Replit

### In Your Replit Workspace:

1. Click the **"Deployments"** tab (top of screen)
2. Click the **"Settings"** tab within Deployments
3. Find the **"Domains"** section
4. Click **"Link a domain"** or **"Add custom domain"**
5. Enter: `bjjos.app`
6. Click **"Add"** or **"Continue"**

### Replit Will Show You DNS Records:

Copy these values (they'll look similar to this):

```
A Record:
Name/Host: @
Value: [IP address - something like 100.100.100.100]

TXT Record:
Name/Host: @
Value: [verification code - looks like "replit-verify=abc123..."]
```

**📝 IMPORTANT: Write down both the IP address and TXT verification code!**

---

## 📋 Step 2: Add DNS Records to Your Domain Registrar

Go to where you purchased **bjjos.app** (Namecheap, GoDaddy, Google Domains, etc.)

### Find DNS Settings:
- Usually called: "DNS Management", "DNS Settings", or "Advanced DNS"
- Look for options to add/edit DNS records

### Add These Records:

#### **A Record** (Points domain to your Replit app):
```
Type: A
Name/Host: @ (or leave blank, or "bjjos.app")
Value/Points to: [IP address from Replit]
TTL: 3600 (or Auto/Automatic)
```

#### **TXT Record** (Verifies domain ownership):
```
Type: TXT
Name/Host: @ (or leave blank)
Value: [verification code from Replit - starts with "replit-verify="]
TTL: 3600 (or Auto/Automatic)
```

#### **A Record for www** (Optional but recommended):
```
Type: A
Name/Host: www
Value/Points to: [same IP address from Replit]
TTL: 3600 (or Auto/Automatic)
```

### Save/Apply Changes

---

## 📋 Step 3: Wait for DNS Propagation

- **Time required:** Usually 15-30 minutes (can take up to 48 hours)
- **What happens:** DNS servers worldwide update with your new records
- **How to check:** Visit https://dnschecker.org and enter `bjjos.app`

### In Replit:
- Go back to Deployments → Settings → Domains
- Wait for **"Verified ✓"** status to appear
- Replit checks automatically every few minutes

---

## 📋 Step 4: Test Your Domain

Once verified (you see the green checkmark):

### Test these URLs:
- ✅ `https://bjjos.app` → Should load your landing page
- ✅ `https://www.bjjos.app` → Should also work (if you added www A record)
- ✅ `https://bjjos.app/admin/add-free-user` → Should load admin page

### What to check:
- Landing page loads correctly
- HTTPS/SSL works (padlock icon in browser)
- Signup form functions
- Admin dashboard accessible

---

## 🔧 Registrar-Specific Instructions

### Namecheap:
1. Login → Domain List → Manage
2. Advanced DNS tab
3. Add New Record → Select type (A or TXT)
4. Fill in Host, Value, TTL
5. Save All Changes

### GoDaddy:
1. Login → My Products → DNS
2. Click "Add" under Records
3. Select Type (A or TXT)
4. Enter Name, Value, TTL
5. Save

### Google Domains:
1. Login → My Domains → Manage
2. DNS → Custom Records
3. Create New Record
4. Select Type, enter Data
5. Add

### Cloudflare:
1. Login → Select bjjos.app
2. DNS → Add Record
3. ⚠️ **Important:** Turn OFF proxy (gray cloud, not orange)
4. Enter details and Save

---

## ✅ Success Checklist

- [ ] Got DNS records from Replit (A record IP + TXT verification code)
- [ ] Added A record for @ (root domain)
- [ ] Added TXT record for @ (verification)
- [ ] Added A record for www (optional)
- [ ] Saved/applied changes in domain registrar
- [ ] Waited 15-30 minutes for propagation
- [ ] Saw "Verified ✓" in Replit Domains tab
- [ ] Tested https://bjjos.app - loads correctly
- [ ] HTTPS/SSL working (padlock icon)
- [ ] Signup form works
- [ ] Admin dashboard accessible

---

## 🆘 Troubleshooting

### "Not Verified" after 1+ hour:
- **Check DNS records:** Use https://dnschecker.org
- **Verify values:** Make sure IP and TXT are exactly as Replit showed
- **Remove conflicts:** Delete any old A/AAAA records for bjjos.app
- **Check @ vs blank:** Some registrars need `@`, others need blank Host field

### Domain shows different content:
- **Clear browser cache:** Ctrl+Shift+R (or Cmd+Shift+R on Mac)
- **Try incognito mode:** Test in private browsing
- **Check DNS:** Make sure A record points to correct Replit IP

### Cloudflare users:
- **Turn OFF proxy:** Click orange cloud to make it gray
- Replit requires direct connection, not Cloudflare proxy

### Mixed content errors:
- Replit automatically provides HTTPS
- No action needed - SSL is automatic

---

## 📝 Current Setup Summary

**Published App:** ✅ Live on Replit  
**Custom Domain:** bjjos.app (pending DNS setup)  
**Environment Variables:** ✅ Already configured  
**HTTPS/SSL:** ✅ Automatic (once domain verified)  

**All Required Environment Variables (Already Set):**
- ✅ ANTHROPIC_API_KEY
- ✅ TWILIO_ACCOUNT_SID
- ✅ TWILIO_AUTH_TOKEN
- ✅ TWILIO_PHONE_NUMBER
- ✅ YOUTUBE_API_KEY
- ✅ DATABASE_URL
- ✅ ADMIN_PASSWORD
- ✅ SESSION_SECRET

---

## 🔄 After Domain is Connected

### Update Twilio Webhook:
1. Go to Twilio Console → Phone Numbers
2. Select your SMS number
3. Update webhook URL to: `https://bjjos.app/api/sms-reply`
4. Set HTTP method to: `POST`
5. Save

### Test Complete Flow:
1. Visit `https://bjjos.app`
2. Fill out signup form
3. Verify SMS is received
4. Reply to SMS to test onboarding
5. Check admin dashboard

---

## 📞 Support

If you encounter issues:
- **DNS Checker:** https://dnschecker.org
- **Replit Docs:** https://docs.replit.com
- **Your registrar's support:** Contact them for DNS help

---

**Next Step:** Go to Replit Deployments → Settings → Domains and get your DNS records, then add them to your domain registrar!
