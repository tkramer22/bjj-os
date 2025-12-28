# 401 Debug Testing - CRITICAL Instructions

## STOP - Read This First! 🚨

**This app uses httpOnly cookies for authentication, NOT localStorage tokens.**

The debug approach you suggested (checking localStorage) won't work because this app doesn't store tokens in localStorage. The server sets an httpOnly cookie that your browser automatically sends with each request.

## What I've Added

### ✅ Frontend Debug Logging
Added comprehensive console logging in 3 places:

1. **Phone Verification Success** (`signup.tsx`)
   - Shows when cookie should be set
   - Shows document.cookie after verification

2. **Username Submission** (`signup.tsx`)
   - Shows cookies before submitting username
   - Shows PATCH request details

3. **Onboarding Completion** (`onboarding.tsx`)
   - Shows all available cookies
   - Shows PATCH request details
   - Shows detailed error info on 401

### ✅ Backend Debug Logging (Already In Place)
The backend already logs:
- Every authenticated request
- Cookie availability
- Token verification status
- Device fingerprint validation
- Profile update success/failure

## How to Test - Step by Step

### 1. Open Browser Console FIRST
**Before starting signup:**
- Press `F12` or Right-click → Inspect
- Go to **Console** tab
- Keep it open throughout the entire flow

### 2. Complete the Signup Flow

**Step 1: Go to `/signup`**
- Select a plan
- Enter phone number
- Click "Send Code"

**Step 2: Enter SMS Code**
- Check console for: `=== PHONE VERIFICATION DEBUG ===`
- You should see: `[SIGNUP] ✅ Verification successful!`
- **IMPORTANT:** Look for `[DEBUG] document.cookie:` - does it show sessionToken?

**Step 3: Choose Username**
- Enter a username
- Check console for: `=== USERNAME SUBMISSION DEBUG ===`
- Look for `[DEBUG] Cookies before username submit:` - does it show sessionToken?
- Click submit
- You should see: `[SIGNUP] ✅ Username saved successfully`

**Step 4: Complete Onboarding**
- Go through all 5 onboarding steps
- On Step 5, **BEFORE clicking "Complete Setup"**, check console
- Click "Complete Setup"
- Check console for: `=== ONBOARDING SUBMISSION DEBUG ===`

### 3. If You Get 401 Error

**In the browser console, you'll see:**
```
=== ONBOARDING ERROR ===
[DEBUG] 401 ERROR - Authentication failed
[DEBUG] This means the sessionToken cookie was not sent or is invalid
```

**Look at the earlier logs to find:**
- Was sessionToken in document.cookie after phone verification?
- Was sessionToken in document.cookie before username submit?
- Was sessionToken in document.cookie before onboarding submit?

### 4. Check Browser DevTools

**Application Tab → Cookies:**
- Go to Application tab
- Look at Cookies → your domain
- Do you see a `sessionToken` cookie?
- If yes:
  - What's the value? (don't share it, just check it exists)
  - Is HttpOnly = ✓ ?
  - Is Secure = ✓ (if production)?
  - Is SameSite = Strict?

**Network Tab:**
- Go to Network tab
- Filter for "profile"
- Look at the PATCH request to `/api/auth/profile`
- Click on it
- Go to **Headers** section
- Look at **Request Headers**
- Do you see `Cookie: sessionToken=...` ?

### 5. Share These Logs

**From Browser Console:**
```
Copy everything from:
"=== PHONE VERIFICATION DEBUG ===" 
to 
"=== ONBOARDING ERROR ==="
```

**From Server Logs:**
Look for these sections:
```
[AUTH] ✅ Signup successful
[AUTH] ✅ sessionToken cookie set
...
[AUTH] Request to PATCH /api/auth/profile
[AUTH] Cookies available: ...
[AUTH] sessionToken cookie: EXISTS or MISSING
```

## What I'm Looking For

### Scenario A: Cookie Never Visible to JavaScript
**Browser console shows:**
```
[DEBUG] document.cookie: ""
```

**This is EXPECTED** because httpOnly cookies are invisible to JavaScript for security.

**But the cookie still exists** and is sent with requests automatically.

### Scenario B: 401 Error But Cookie Exists
If you get 401 but the Network tab shows the cookie was sent, then:
- Token might be invalid
- Device fingerprint might be missing
- Device might be deactivated

Server logs will show the exact issue.

### Scenario C: Cookie Not Sent
If Network tab shows NO cookie in request, then:
- Browser is blocking the cookie
- Cookie domain/path mismatch
- CORS issue

## Quick Diagnostic

Run this in the browser console AFTER phone verification:
```javascript
// This will show NOTHING because sessionToken is httpOnly
console.log('Visible cookies:', document.cookie);

// Instead, check DevTools → Application → Cookies
// Look for sessionToken there
```

Then make a test request:
```javascript
fetch('/api/auth/me', { credentials: 'include' })
  .then(r => r.json())
  .then(data => console.log('Auth check:', data))
  .catch(err => console.error('Auth error:', err));
```

If this returns your user data, the cookie is working.
If this returns 401, the cookie is NOT being sent.

## Expected vs Actual

### ✅ Expected (Working Flow)

**Browser Console:**
```
=== PHONE VERIFICATION DEBUG ===
[SIGNUP] ✅ Verification successful!
[DEBUG] document.cookie: (empty - httpOnly cookie not visible)

=== USERNAME SUBMISSION DEBUG ===
[DEBUG] Cookies before username submit: (empty - httpOnly)
[DEBUG] Making PATCH request to /api/auth/profile
[SIGNUP] ✅ Username saved successfully

=== ONBOARDING SUBMISSION DEBUG ===
[DEBUG] document.cookie: (empty - httpOnly)
[DEBUG] Making PATCH request to /api/auth/profile
[ONBOARDING] ✅ Profile updated successfully
```

**Server Logs:**
```
[AUTH] ✅ Signup successful: +1555XXXXXXX
[AUTH] ✅ sessionToken cookie set
[AUTH] Request to PATCH /api/auth/profile
[AUTH] Cookies available: sessionToken
[AUTH] sessionToken cookie: EXISTS
[AUTH DEBUG] Token verified for userId: 123
[AUTH DEBUG] Device lookup result: FOUND, isActive: true
[ONBOARDING] Profile updated successfully
```

### ❌ Actual (If 401 Error)

**Browser Console:**
```
=== ONBOARDING SUBMISSION DEBUG ===
[DEBUG] Making PATCH request to /api/auth/profile
=== ONBOARDING ERROR ===
[ONBOARDING] Error message: 401: {"error":"Authentication required"}
[DEBUG] 401 ERROR - Authentication failed
```

**Server Logs:**
```
[AUTH] Request to PATCH /api/auth/profile
[AUTH] Cookies available: NONE or OTHER_COOKIES
[AUTH] sessionToken cookie: MISSING
[AUTH] ❌ No sessionToken cookie - sending 401
```

## Next Steps

1. **Run the test** with console open
2. **Copy all console logs** from start to finish
3. **Check Network tab** for cookie presence
4. **Check Application → Cookies** for sessionToken
5. **Share findings** so I can diagnose the exact issue

The logs will tell us:
- Is cookie being set? (server logs)
- Is cookie being sent? (network tab)
- Is cookie visible? (application tab)
- What's the failure point? (console + server logs)

Then I can implement the actual fix instead of guessing!
