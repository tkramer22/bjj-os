# 🧪 QUICK TEST: Verify Cookie Fix Works

## ✅ What Was Fixed

**THE BUG:** Cookie was never set after phone verification → All requests got 401 errors

**THE FIX:**
1. ✅ Added `trust proxy` so Express detects HTTPS on Replit
2. ✅ Changed `secure: NODE_ENV` → `secure: isHttps` (dynamic detection)
3. ✅ Changed `sameSite: 'strict'` → `'lax'` (more compatible)
4. ✅ Added `domain: '.bjjos.app'` for production

## 🎯 Quick Test (5 minutes)

### Step 1: Clear Cookies
1. Open Chrome
2. Press `F12` (DevTools)
3. Go to: **Application** tab → **Cookies** → `https://bjjos.app`
4. Right-click → **Clear all cookies**

### Step 2: Start Fresh Signup
1. Go to https://bjjos.app/signup
2. Select a plan (monthly or annual)
3. Enter your phone number
4. Get verification code (SMS or auto-verify if whitelisted)
5. **Verify the code**

### Step 3: CHECK COOKIE (Critical!)
**Immediately after phone verification:**
1. Stay in DevTools → **Application** tab → **Cookies**
2. Look for `sessionToken` cookie

**✅ SUCCESS = Cookie exists with:**
- Domain: `.bjjos.app`
- Path: `/`
- HttpOnly: ✓
- Secure: ✓
- SameSite: `Lax`
- Value: Long string starting with `eyJ...`

**❌ FAILURE = No sessionToken cookie**

### Step 4: Continue Onboarding
1. Choose a username
2. Complete all 5 onboarding questions:
   - Belt level
   - Training frequency
   - Goals
   - Learning style
   - Position preference
3. Click **"Complete Setup"**

### Step 5: Verify Success
**✅ If cookie fix works:**
- No 401 error
- Redirect to `/chat` (chat interface)
- Can see Prof. OS AI coach

**❌ If still broken:**
- 401 error appears
- Check server logs
- Check browser console
- Share logs with me

## 📊 Expected Server Logs

When you verify your phone, the server logs should show:

```
[AUTH] ✅ Signup successful: +1XXXXXXXXXX (Device: Chrome on macOS)
[AUTH] ✅ Cookie settings - secure: true, sameSite: lax, domain: .bjjos.app
[AUTH] ✅ sessionToken cookie set (maxAge: 30 days, httpOnly: true)
```

**Key indicators:**
- ✅ `secure: true` (HTTPS detected correctly)
- ✅ `domain: .bjjos.app` (production detected)

## 🐛 If It Still Doesn't Work

**Browser Console (F12 → Console):**
```
[DEBUG] All cookies available: NONE  ← Cookie still not set
```

**What to check:**
1. Is bjjos.app served over HTTPS? (Should be ✅)
2. Check Network tab → Response headers for `Set-Cookie`
3. Look for any browser errors about cookies
4. Verify no browser extensions blocking cookies

**Send me:**
1. Screenshot of DevTools → Application → Cookies
2. Screenshot of browser console logs
3. Copy server logs from the time you verified

## ⚡ Debug Commands

**Check current cookies in browser console:**
```javascript
document.cookie
```

**Check if cookie is sent on requests:**
1. DevTools → Network tab
2. Complete onboarding → Click "Complete Setup"
3. Find the PATCH request to `/api/auth/profile`
4. Click it → Headers → Request Headers
5. Look for `Cookie: sessionToken=eyJ...`

If cookie is there but still 401 → different problem
If cookie is missing → cookie not being set correctly

---

**Expected Test Duration:** 3-5 minutes
**Status:** Ready to test immediately
**Priority:** CRITICAL - This unblocks all user signups
