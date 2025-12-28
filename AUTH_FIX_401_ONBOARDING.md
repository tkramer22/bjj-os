# 401 Authentication Issue - Diagnosis Guide

## Problem
Users are getting `401 Authentication required` errors when clicking "Complete Setup" after going through the onboarding flow.

## Current Status
**Debug logging added** to diagnose the root cause. The issue is NOT caused by `sameSite: 'strict'` (that policy allows same-site fetch/XHR requests).

## Diagnostic Logging Added

### 1. Enhanced Authentication Middleware (checkUserAuth)
**Location:** `server/routes.ts` ~line 1151

Logs every authenticated request:
```typescript
console.log(`[AUTH] Request to ${req.method} ${req.path}`);
console.log(`[AUTH] Cookies available:`, Object.keys(req.cookies || {}).join(', ') || 'NONE');
console.log(`[AUTH] sessionToken cookie:`, req.cookies?.sessionToken ? 'EXISTS' : 'MISSING');
```

If authentication fails:
```typescript
console.log(`[AUTH] ❌ No sessionToken cookie - sending 401`);
```

### 2. Cookie Set Confirmation
**Locations:** Login flow (~line 1020), Signup flow (~line 1116)

Confirms when session token is set:
```typescript
console.log(`[AUTH] ✅ sessionToken cookie set (maxAge: 30 days, httpOnly: true)`);
```

### 3. Existing Auth Debug Logs
Already in place:
- Token verification: `[AUTH DEBUG] Token verified for userId: X, fingerprint: Y`
- Device lookup: `[AUTH DEBUG] Device lookup result: FOUND/NOT FOUND, isActive: true/false`
- Authentication errors: `[AUTH ERROR] Token verification failed`

## How to Diagnose

### Step 1: User Tests the Flow
1. **Clear all cookies and cache** (or use Incognito/Private window)
2. **Go to** `/signup`
3. **Complete signup flow:**
   - Select plan
   - Enter phone number
   - Enter SMS verification code
   - Choose username
4. **Complete onboarding:**
   - Go through all 5 steps
   - Click "Complete Setup"
5. **Check for 401 error**

### Step 2: Analyze Server Logs

#### ✅ SUCCESSFUL Flow:
```
[AUTH] ✅ Signup successful: +15551234567
[AUTH] ✅ sessionToken cookie set (maxAge: 30 days, httpOnly: true)
...
[AUTH] Request to PATCH /api/auth/profile
[AUTH] Cookies available: sessionToken
[AUTH] sessionToken cookie: EXISTS
[AUTH DEBUG] Token verified for userId: 123, fingerprint: abc...
[AUTH DEBUG] Device lookup result: FOUND, isActive: true
[ONBOARDING] Profile updated successfully
```

#### ❌ FAILURE Scenarios:

**Scenario A: Cookie Never Set**
```
[AUTH] ✅ Signup successful: +15551234567
❌ MISSING: sessionToken cookie set confirmation
...
[AUTH] Request to PATCH /api/auth/profile
[AUTH] Cookies available: NONE
[AUTH] ❌ No sessionToken cookie - sending 401
```
**Cause:** Cookie not being set during signup
**Fix:** Check cookie-parser middleware, check response headers

**Scenario B: Cookie Not Sent**
```
[AUTH] ✅ sessionToken cookie set (maxAge: 30 days, httpOnly: true)
...
[AUTH] Request to PATCH /api/auth/profile
[AUTH] Cookies available: NONE or OTHER_COOKIES (but not sessionToken)
[AUTH] ❌ No sessionToken cookie - sending 401
```
**Cause:** Cookie blocked by browser, CORS issue, or credentials not included
**Fix:** Check browser console, check CORS settings, verify `credentials: "include"`

**Scenario C: Token Verification Fails**
```
[AUTH] sessionToken cookie: EXISTS
[AUTH ERROR] Token verification failed: [error details]
```
**Cause:** JWT invalid, expired, or wrong secret
**Fix:** Check JWT_SECRET environment variable, check token expiration

**Scenario D: Device Fingerprint Missing**
```
[AUTH DEBUG] Token verified for userId: 123, fingerprint: undefined
[AUTH] ⚠️  Blocked legacy token without fingerprint: 123
```
**Cause:** Token created before device fingerprinting was implemented
**Fix:** User needs to log in again to get new token with fingerprint

**Scenario E: Device Deactivated**
```
[AUTH DEBUG] Device lookup result: FOUND, isActive: false
[AUTH] ⚠️  Blocked revoked device: 123 / abc...
```
**Cause:** Device was deactivated in admin panel
**Fix:** User needs to log in again to reactivate device

**Scenario F: Device Not Found**
```
[AUTH DEBUG] Device lookup result: NOT FOUND
[AUTH] ⚠️  Blocked revoked device: 123 / abc...
```
**Cause:** Device record deleted from database
**Fix:** User needs to log in again to create new device record

## Possible Root Causes

Based on the logs, we can identify:

### 1. Cookie Configuration Issue
- Cookie-parser not configured correctly
- Cookie domain/path mismatch
- Browser blocking httpOnly cookies

### 2. CORS/Credentials Issue
- Frontend not sending `credentials: "include"`
- CORS not allowing credentials
- Cross-origin request blocking cookies

### 3. Token/Session Issue
- JWT_SECRET environment variable wrong
- Token expired (but 30 days should be plenty)
- Token malformed during creation

### 4. Device Fingerprinting Issue
- Device fingerprint not in token payload
- Device record missing from database
- Device deactivated

### 5. Browser/Client Issue
- Cookies disabled
- Private/Incognito mode clearing cookies
- Browser extension blocking cookies

## Next Steps

### Immediate Actions
1. **User runs the test flow** (signup → onboarding → complete)
2. **User provides complete server logs** from signup to 401 error
3. **Analyze logs** using scenarios above
4. **Identify root cause**
5. **Implement specific fix**

### Common Fixes

**If cookie not set:**
- Check cookie-parser is before other middleware
- Verify res.cookie() is called
- Check response headers in browser DevTools

**If cookie not sent:**
- Verify `credentials: "include"` in fetch (✅ already verified)
- Check browser console for CORS errors
- Check Application → Cookies in DevTools

**If token invalid:**
- Verify SESSION_SECRET environment variable
- Check JWT token structure
- Regenerate token during signup

**If device issue:**
- Check device fingerprint in token payload
- Verify device record in authorized_devices table
- Check device isActive flag

## Testing Checklist

### Before Testing
- [ ] Clear all cookies and cache
- [ ] Use Incognito/Private window
- [ ] Server logs visible and capturing output
- [ ] Browser DevTools open (Network + Application tabs)

### During Test
- [ ] Monitor server logs in real-time
- [ ] Check Network tab for requests
- [ ] Check Application → Cookies after each step
- [ ] Note exact step where error occurs

### After Test
- [ ] Copy complete server logs (signup → error)
- [ ] Screenshot browser Network tab
- [ ] Screenshot Application → Cookies
- [ ] Note error message shown to user

## Current Code State

### ✅ Already Implemented
- `credentials: "include"` in all fetch requests ✅
- cookie-parser middleware configured ✅
- httpOnly cookies enabled ✅
- JWT token generation ✅
- Device fingerprinting ✅
- Comprehensive debug logging ✅

### ⏳ Needs Investigation
- Why is cookie missing during PATCH request?
- Is cookie being set correctly during signup?
- Is cookie being sent by browser?
- Is token/device validation passing?

## Support Information

### How to Share Logs
Please share:
1. Complete server logs from signup to 401 error
2. Browser DevTools → Network tab screenshot
3. Browser DevTools → Application → Cookies screenshot
4. Exact error message shown to user

### What NOT to Share
- ❌ Don't share JWT tokens (contains user ID)
- ❌ Don't share phone numbers (use +1555XXXXXXX format)
- ❌ Don't share device fingerprints
- ❌ Don't share SESSION_SECRET

## Summary

**Problem:** 401 error during onboarding completion
**Hypothesis:** Cookie/authentication issue (exact cause unknown)
**Status:** Debug logging added, waiting for test results
**Next Step:** User tests flow and provides server logs for analysis
