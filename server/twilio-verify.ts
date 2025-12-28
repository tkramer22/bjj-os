import twilio from 'twilio';
import { db } from './db';
import { bjjUsers } from '@shared/schema';
import { eq } from 'drizzle-orm';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
let verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

if (!accountSid || !authToken) {
  throw new Error('Twilio credentials not found in environment variables');
}

const client = twilio(accountSid, authToken);

// Create Verify Service if it doesn't exist
async function ensureVerifyService() {
  if (!verifyServiceSid) {
    try {
      const service = await client.verify.v2.services.create({
        friendlyName: 'BJJ OS Authentication',
      });
      verifyServiceSid = service.sid;
      console.log('✅ Created Twilio Verify Service:', verifyServiceSid);
      console.log('📝 Add this to your .env: TWILIO_VERIFY_SERVICE_SID=' + verifyServiceSid);
    } catch (error) {
      console.error('Failed to create Verify service:', error);
      throw error;
    }
  }
  return verifyServiceSid;
}

/**
 * Send SMS verification code to phone number
 * @param phoneNumber - Phone number in E.164 format (+15551234567)
 * @returns Promise with verification SID
 */
export async function sendVerificationCode(phoneNumber: string): Promise<{ 
  success: boolean; 
  verificationSid?: string; 
  error?: string 
}> {
  try {
    console.log('[VERIFY] Sending code to:', phoneNumber, 'NODE_ENV:', process.env.NODE_ENV);
    
    // Development bypass for testing - accepts test phone numbers
    if (process.env.NODE_ENV === 'development' && (phoneNumber.startsWith('+1555') || phoneNumber === '+19148373750')) {
      console.log('📱 [DEV MODE] Bypassing Twilio - test verification sent to:', phoneNumber);
      return {
        success: true,
        verificationSid: 'TEST_' + Date.now(),
      };
    }

    console.log('[VERIFY] Not bypassing - calling Twilio for:', phoneNumber);
    console.log('[VERIFY] Twilio Account SID:', accountSid?.substring(0, 10) + '...');
    console.log('[VERIFY] Twilio Auth Token:', authToken ? '***SET***' : 'MISSING');
    console.log('[VERIFY] Verify Service SID:', verifyServiceSid?.substring(0, 10) + '...' || 'MISSING');
    
    await ensureVerifyService();
    
    console.log('[VERIFY] Creating verification request for:', phoneNumber);
    const verification = await client.verify.v2
      .services(verifyServiceSid!)
      .verifications.create({
        to: phoneNumber,
        channel: 'sms',
      });

    console.log('✅ [VERIFY] SMS verification sent successfully! SID:', verification.sid);
    
    return {
      success: true,
      verificationSid: verification.sid,
    };
  } catch (error: any) {
    console.error('❌ [VERIFY] Failed to send verification code');
    console.error('❌ [VERIFY] Error message:', error.message);
    console.error('❌ [VERIFY] Error code:', error.code);
    console.error('❌ [VERIFY] Error status:', error.status);
    console.error('❌ [VERIFY] More info:', error.moreInfo);
    console.error('❌ [VERIFY] Full error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send verification code',
    };
  }
}

/**
 * Verify SMS code entered by user
 * @param phoneNumber - Phone number in E.164 format
 * @param code - 6-digit verification code
 * @returns Promise with verification status
 */
export async function verifyCode(phoneNumber: string, code: string): Promise<{
  success: boolean;
  status?: string;
  error?: string;
}> {
  try {
    // LIFETIME magic code - bypass for instant testing
    if (code.toUpperCase() === 'LIFETIME') {
      // Check if user is marked as lifetime user in database
      const user = await db.select().from(bjjUsers).where(eq(bjjUsers.phoneNumber, phoneNumber)).limit(1);
      const isLifetimeUser = user.length > 0 && user[0].isLifetimeUser;
      
      // Allow in development OR if user is marked as lifetime user
      if (process.env.NODE_ENV === 'development' || isLifetimeUser) {
        console.log('🔑 [LIFETIME BYPASS] Testing shortcut used for:', phoneNumber);
        console.log('✅ [LIFETIME BYPASS] Instant login granted - no SMS verification required');
        console.log('   - Environment:', process.env.NODE_ENV);
        console.log('   - Lifetime User Flag:', isLifetimeUser);
        return {
          success: true,
          status: 'approved',
        };
      }
      
      // Block in production for non-lifetime users
      console.log('❌ [LIFETIME BYPASS] Blocked - user not marked as lifetime user:', phoneNumber);
      return {
        success: false,
        error: 'Invalid verification code',
      };
    }

    // Development bypass for testing - any 6-digit code works for test numbers
    if (process.env.NODE_ENV === 'development' && (phoneNumber.startsWith('+1555') || phoneNumber === '+19148373750')) {
      const isValidCode = /^\d{6}$/.test(code);
      console.log('✅ [DEV MODE] Bypassing Twilio - verification status:', isValidCode ? 'approved' : 'denied');
      return {
        success: isValidCode,
        status: isValidCode ? 'approved' : 'denied',
      };
    }

    await ensureVerifyService();
    
    const verificationCheck = await client.verify.v2
      .services(verifyServiceSid!)
      .verificationChecks.create({
        to: phoneNumber,
        code: code,
      });

    console.log('✅ Verification status:', verificationCheck.status);
    
    return {
      success: verificationCheck.status === 'approved',
      status: verificationCheck.status,
    };
  } catch (error: any) {
    console.error('Verification failed:', error);
    return {
      success: false,
      error: error.message || 'Verification failed',
    };
  }
}

/**
 * Cancel pending verification (Note: Twilio Verify automatically expires codes after 10 minutes)
 * @param phoneNumber - Phone number in E.164 format
 */
export async function cancelVerification(phoneNumber: string): Promise<void> {
  // Twilio Verify automatically expires codes after 10 minutes
  // No need to manually cancel - just let it expire
  console.log('Verification will auto-expire for:', phoneNumber);
}

// Initialize Verify Service on module load
ensureVerifyService().catch(console.error);
