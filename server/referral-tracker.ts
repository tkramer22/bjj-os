import { eq } from "drizzle-orm";
import { db } from "./db";
import { bjjUsers, referralCodes } from "@shared/schema";

/**
 * Internal-only referral tracking function
 * SECURITY: This is not exposed via any public API endpoint
 * Called only from sms-reply-handler.ts after user completes onboarding
 */
export async function trackReferralSignup(userId: string, referralCode: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!userId || !referralCode) {
      return { success: false, message: "Missing userId or referralCode" };
    }

    // SECURITY: Verify user exists and hasn't already been attributed to a referral
    // Note: This fetches fresh data from database, not stale cached data
    const [user] = await db.select().from(bjjUsers).where(eq(bjjUsers.id, userId));

    if (!user) {
      return { success: false, message: "User not found" };
    }

    // DEDUPLICATION: Check if user already has a referral code attributed
    if (user.referralCode && user.referralCode !== '') {
      return { 
        success: false, 
        message: "User already attributed to a referral code" 
      };
    }

    // Ensure uppercase (caller may have already uppercased, but we ensure it here)
    const upperCode = referralCode.toUpperCase();

    // Find the referral code
    const [refCode] = await db.select().from(referralCodes)
      .where(eq(referralCodes.code, upperCode));

    if (!refCode || !refCode.isActive) {
      return { success: false, message: "Invalid or inactive referral code" };
    }

    // Prevent self-referral for user codes
    if (refCode.codeType === 'user' && refCode.userId === userId) {
      return { success: false, message: "Cannot use your own referral code" };
    }

    // Update referral code stats based on type (idempotent - only runs once per user)
    if (refCode.codeType === 'influencer') {
      // Increment total signups and active subscribers
      await db.update(referralCodes)
        .set({
          totalSignups: (refCode.totalSignups || 0) + 1,
          activeSubscribers: (refCode.activeSubscribers || 0) + 1
        })
        .where(eq(referralCodes.id, refCode.id));

      // Store the referral relationship on the user (permanent link)
      await db.update(bjjUsers)
        .set({ referralCode: upperCode })
        .where(eq(bjjUsers.id, userId));

    } else if (refCode.codeType === 'user' && refCode.userId) {
      // Regular user referral - give referrer 1 free month
      await db.update(referralCodes)
        .set({
          uses: String(parseInt(refCode.uses || "0") + 1),
          freeMonthsEarned: String(parseInt(refCode.freeMonthsEarned || "0") + 1)
        })
        .where(eq(referralCodes.id, refCode.id));

      // Store the referral relationship on the user
      await db.update(bjjUsers)
        .set({ referralCode: upperCode })
        .where(eq(bjjUsers.id, userId));
    }

    return { success: true, message: "Referral tracked successfully" };
  } catch (error: any) {
    console.error('Referral tracking error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Decrement active subscriber count when a user cancels
 * Called when subscription is cancelled
 */
export async function handleSubscriptionCancellation(userId: string): Promise<void> {
  try {
    const [user] = await db.select().from(bjjUsers).where(eq(bjjUsers.id, userId));
    
    if (!user || !user.referralCode) {
      return; // No referral code to update
    }

    const [refCode] = await db.select().from(referralCodes)
      .where(eq(referralCodes.code, user.referralCode));

    if (refCode && refCode.codeType === 'influencer') {
      // Decrement active subscribers (but keep total signups)
      await db.update(referralCodes)
        .set({
          activeSubscribers: Math.max(0, (refCode.activeSubscribers || 0) - 1)
        })
        .where(eq(referralCodes.id, refCode.id));
      
      console.log(`Decremented active subscribers for code ${user.referralCode}`);
    }
  } catch (error) {
    console.error('Error handling subscription cancellation:', error);
  }
}
