# bjjos.app Domain Setup - Quick Reference Card

## 🎯 What You Need to Do (5-10 minutes)

### 1. Get DNS Records from Replit
**Location:** Deployments → Settings → Domains → Add "bjjos.app"

You'll get two records:
```
A Record IP: [Write this down]
TXT Code: [Write this down]
```

---

### 2. Add to Your Domain Registrar
**Go to:** Your domain registrar's DNS settings

**Add these 3 records:**

| Type | Name/Host | Value |
|------|-----------|-------|
| A | @ | [IP from Replit] |
| TXT | @ | [Code from Replit] |
| A | www | [Same IP] |

**Save changes**

---

### 3. Wait & Verify
- ⏱️ Wait 15-30 minutes
- ✅ Check Replit for "Verified" status
- 🌐 Test: https://bjjos.app

---

## 📋 Registrar Quick Links

**Namecheap:** Domain List → Manage → Advanced DNS  
**GoDaddy:** My Products → DNS → Manage Zones  
**Google Domains:** DNS → Custom Records  
**Cloudflare:** DNS → Add Record (⚠️ turn OFF proxy!)  

---

## 🆘 Common Issues

**Problem:** Not verifying after 1 hour  
**Fix:** Check https://dnschecker.org - ensure DNS is propagated

**Problem:** Wrong content showing  
**Fix:** Clear browser cache (Ctrl+Shift+R)

**Problem:** Using Cloudflare  
**Fix:** Turn proxy OFF (gray cloud, not orange)

---

## ✅ Success = Green Checkmark in Replit

Once you see "Verified ✓" in Replit:
- Your app is live at https://bjjos.app
- HTTPS is automatic
- You're done! 🎉

---

**Full guide:** See `CONNECT_DOMAIN.md` for detailed instructions
