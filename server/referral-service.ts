import { db } from "./db";
import { 
  referralCodes, 
  referralCommissions, 
  referralPayouts,
  referralMilestones,
  bjjUsers
} from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

export interface ReferralValidationResult {
  valid: boolean;
  code?: any;
  freeMonths?: number;
  message?: string;
}

export async function validateReferralCode(code: string): Promise<ReferralValidationResult> {
  if (!code || code.trim() === "") {
    return { valid: false, message: "Code is required" };
  }

  const referralCode = await db
    .select()
    .from(referralCodes)
    .where(and(
      eq(referralCodes.code, code.trim().toUpperCase()),
      eq(referralCodes.isActive, true)
    ))
    .limit(1);

  if (referralCode.length === 0) {
    return { valid: false, message: "Invalid or inactive referral code" };
  }

  const codeData = referralCode[0];

  return {
    valid: true,
    code: codeData,
    freeMonths: 1,
    message: "Valid referral code - you'll get 1 month free!"
  };
}

export interface CommissionData {
  referralCodeId: string;
  codeOwnerUserId: string;
  referredUserId: string;
  paymentAmount: number;
  commissionPercent: number;
  stripePaymentId: string;
  stripeChargeId?: string;
  subscriptionId?: string;
}

export async function recordCommission(data: CommissionData) {
  const commissionAmount = (data.paymentAmount * data.commissionPercent) / 100;
  const paymentDate = new Date();
  const payoutEligibleDate = new Date();
  payoutEligibleDate.setDate(payoutEligibleDate.getDate() + 60);

  const commission = await db.insert(referralCommissions).values({
    referralCodeId: data.referralCodeId,
    codeOwnerUserId: data.codeOwnerUserId,
    referredUserId: data.referredUserId,
    paymentAmount: data.paymentAmount.toFixed(2),
    commissionAmount: commissionAmount.toFixed(2),
    commissionPercent: data.commissionPercent,
    paymentDate,
    payoutEligibleDate,
    stripePaymentId: data.stripePaymentId,
    stripeChargeId: data.stripeChargeId,
    subscriptionId: data.subscriptionId,
    status: "pending",
  }).returning();

  await db
    .update(referralCodes)
    .set({
      totalRevenueGenerated: sql`COALESCE(${referralCodes.totalRevenueGenerated}, 0) + ${data.paymentAmount}`,
      commissionOwed: sql`COALESCE(${referralCodes.commissionOwed}, 0) + ${commissionAmount}`,
    })
    .where(eq(referralCodes.id, data.referralCodeId));

  await checkAndRecordMilestones(data.codeOwnerUserId, data.referralCodeId);

  return commission[0];
}

async function checkAndRecordMilestones(userId: string, referralCodeId: string) {
  const stats = await getReferralStats(userId);
  
  const milestones = [
    { type: "signups", values: [5, 10, 25, 50, 100, 250, 500, 1000] },
    { type: "paid_subscribers", values: [1, 5, 10, 25, 50, 100] },
    { type: "earnings", values: [100, 500, 1000, 5000, 10000] },
  ];

  for (const milestone of milestones) {
    for (const value of milestone.values) {
      let currentValue = 0;
      if (milestone.type === "signups") currentValue = stats.totalSignups;
      if (milestone.type === "paid_subscribers") currentValue = stats.activeSubscribers;
      if (milestone.type === "earnings") currentValue = parseFloat(stats.totalEarnings);

      if (currentValue >= value) {
        const existing = await db
          .select()
          .from(referralMilestones)
          .where(and(
            eq(referralMilestones.userId, userId),
            eq(referralMilestones.milestoneType, milestone.type),
            eq(referralMilestones.milestoneValue, value)
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(referralMilestones).values({
            userId,
            referralCodeId,
            milestoneType: milestone.type,
            milestoneValue: value,
          });
        }
      }
    }
  }
}

export async function getReferralStats(userId: string) {
  const codes = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.assignedToUserId, userId));

  if (codes.length === 0) {
    return {
      totalSignups: 0,
      activeSubscribers: 0,
      totalEarnings: "0.00",
      pendingPayout: "0.00",
      eligibleForPayout: "0.00",
    };
  }

  const codeIds = codes.map(c => c.id);
  
  const commissions = await db
    .select()
    .from(referralCommissions)
    .where(eq(referralCommissions.codeOwnerUserId, userId));

  const totalEarnings = commissions.reduce((sum, c) => sum + parseFloat(c.commissionAmount || "0"), 0);
  const pending = commissions
    .filter(c => c.status === "pending")
    .reduce((sum, c) => sum + parseFloat(c.commissionAmount || "0"), 0);
  const eligible = commissions
    .filter(c => c.status === "eligible")
    .reduce((sum, c) => sum + parseFloat(c.commissionAmount || "0"), 0);

  const totalSignups = codes.reduce((sum, c) => sum + (c.totalSignups || 0), 0);
  const activeSubscribers = codes.reduce((sum, c) => sum + (c.activeSubscribers || 0), 0);

  return {
    totalSignups,
    activeSubscribers,
    totalEarnings: totalEarnings.toFixed(2),
    pendingPayout: pending.toFixed(2),
    eligibleForPayout: eligible.toFixed(2),
  };
}

export async function processEligiblePayouts() {
  const today = new Date();
  
  await db
    .update(referralCommissions)
    .set({ status: "eligible" })
    .where(and(
      eq(referralCommissions.status, "pending"),
      lte(referralCommissions.payoutEligibleDate, today)
    ));

  const eligibleCommissions = await db
    .select()
    .from(referralCommissions)
    .where(eq(referralCommissions.status, "eligible"));

  const userCommissions: Record<string, any[]> = {};
  eligibleCommissions.forEach(comm => {
    if (!userCommissions[comm.codeOwnerUserId]) {
      userCommissions[comm.codeOwnerUserId] = [];
    }
    userCommissions[comm.codeOwnerUserId].push(comm);
  });

  const results = [];

  for (const [userId, commissions] of Object.entries(userCommissions)) {
    const totalAmount = commissions.reduce((sum, c) => sum + parseFloat(c.commissionAmount || "0"), 0);

    const user = await db.select().from(bjjUsers).where(eq(bjjUsers.id, userId)).limit(1);
    if (user.length === 0) continue;

    const userCodes = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.assignedToUserId, userId))
      .limit(1);

    if (userCodes.length === 0) continue;
    const codeData = userCodes[0];

    const minimumPayout = parseFloat(codeData.minimumPayout || "10");
    if (totalAmount < minimumPayout) {
      continue;
    }

    if (!codeData.stripeAccountId) {
      console.log(`⚠️ User ${userId} has no Stripe account configured - skipping payout`);
      continue;
    }

    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(totalAmount * 100),
        currency: "usd",
        destination: codeData.stripeAccountId,
        description: `Referral commission payout for ${commissions.length} payments`,
      });

      const payout = await db.insert(referralPayouts).values({
        userId,
        referralCodeId: codeData.id,
        amount: totalAmount.toFixed(2),
        commissionIds: commissions.map(c => c.id),
        paymentMethod: codeData.payoutMethod || "stripe",
        stripeTransferId: transfer.id,
        paidAt: new Date(),
        status: "paid",
      }).returning();

      await db
        .update(referralCommissions)
        .set({ status: "paid" })
        .where(
          sql`${referralCommissions.id} = ANY(${commissions.map(c => c.id)})`
        );

      results.push({ userId, amount: totalAmount, payoutId: payout[0].id, success: true });
    } catch (error: any) {
      console.error(`❌ Failed to process payout for user ${userId}:`, error.message);
      
      const payout = await db.insert(referralPayouts).values({
        userId,
        referralCodeId: codeData.id,
        amount: totalAmount.toFixed(2),
        commissionIds: commissions.map(c => c.id),
        paymentMethod: codeData.payoutMethod || "stripe",
        status: "failed",
        adminNotes: error.message,
      }).returning();

      results.push({ userId, amount: totalAmount, payoutId: payout[0].id, success: false, error: error.message });
    }
  }

  return results;
}

// ============================================================================
// STRIPE COUPON INTEGRATION
// ============================================================================

export type DiscountType = 'none' | 'percentage' | 'fixed' | 'trial_extension' | 'free_month' | 'free_months';

export interface CreateCouponParams {
  discountType: DiscountType;
  discountValue: number; // Percentage (0-100), fixed amount in cents, trial days, or months count
  referralCode: string; // Used for coupon naming
}

export interface CouponResult {
  success: boolean;
  couponId?: string;
  message?: string;
  discountDescription?: string;
}

/**
 * Creates a Stripe coupon based on the discount type
 * 
 * Discount type mappings:
 * - percentage: percent_off coupon, duration: once
 * - fixed: amount_off coupon, duration: once
 * - free_month: 100% off coupon, duration: once (1 month)
 * - free_months: 100% off coupon, duration: repeating for X months
 * - trial_extension: No coupon (handled via subscription trial_period_days)
 * - none: No coupon created
 */
export async function createStripeCoupon(params: CreateCouponParams): Promise<CouponResult> {
  const { discountType, discountValue, referralCode } = params;

  // No coupon needed for these types
  if (discountType === 'none') {
    return { success: true, message: 'No coupon needed', discountDescription: 'No discount' };
  }

  if (discountType === 'trial_extension') {
    return { 
      success: true, 
      message: 'Trial extension handled via subscription settings', 
      discountDescription: `${discountValue} extra trial days`
    };
  }

  try {
    let couponParams: Stripe.CouponCreateParams;
    let discountDescription: string;

    switch (discountType) {
      case 'percentage':
        couponParams = {
          percent_off: discountValue,
          duration: 'once',
          name: `${referralCode} - ${discountValue}% Off First Month`,
          metadata: {
            referral_code: referralCode,
            discount_type: discountType,
          }
        };
        discountDescription = `${discountValue}% off first month`;
        break;

      case 'fixed':
        couponParams = {
          amount_off: Math.round(discountValue * 100), // Convert dollars to cents
          currency: 'usd',
          duration: 'once',
          name: `${referralCode} - $${discountValue} Off First Month`,
          metadata: {
            referral_code: referralCode,
            discount_type: discountType,
          }
        };
        discountDescription = `$${discountValue} off first month`;
        break;

      case 'free_month':
        couponParams = {
          percent_off: 100,
          duration: 'once',
          name: `${referralCode} - Free First Month`,
          metadata: {
            referral_code: referralCode,
            discount_type: discountType,
          }
        };
        discountDescription = 'Free first month';
        break;

      case 'free_months':
        couponParams = {
          percent_off: 100,
          duration: 'repeating',
          duration_in_months: Math.round(discountValue),
          name: `${referralCode} - ${discountValue} Free Months`,
          metadata: {
            referral_code: referralCode,
            discount_type: discountType,
            free_months: String(discountValue),
          }
        };
        discountDescription = `${discountValue} free months`;
        break;

      default:
        return { success: false, message: `Unknown discount type: ${discountType}` };
    }

    const coupon = await stripe.coupons.create(couponParams);
    console.log(`✅ Created Stripe coupon ${coupon.id} for referral code ${referralCode}`);

    return {
      success: true,
      couponId: coupon.id,
      discountDescription,
    };
  } catch (error: any) {
    console.error(`❌ Failed to create Stripe coupon for ${referralCode}:`, error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Deletes a Stripe coupon (for cleanup when deleting referral codes)
 */
export async function deleteStripeCoupon(couponId: string): Promise<boolean> {
  try {
    await stripe.coupons.del(couponId);
    console.log(`✅ Deleted Stripe coupon ${couponId}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to delete Stripe coupon ${couponId}:`, error.message);
    return false;
  }
}

/**
 * Gets the discount description for a referral code
 */
export function getDiscountDescription(discountType: DiscountType, discountValue: number): string {
  switch (discountType) {
    case 'none':
      return 'No discount';
    case 'percentage':
      return `${discountValue}% off first month`;
    case 'fixed':
      return `$${discountValue} off first month`;
    case 'free_month':
      return 'Free first month';
    case 'free_months':
      return `${discountValue} free months`;
    case 'trial_extension':
      return `${discountValue} extra trial days`;
    default:
      return 'Unknown discount';
  }
}

/**
 * Validates referral code and returns discount info
 */
export async function validateReferralCodeWithDiscount(code: string): Promise<{
  valid: boolean;
  code?: any;
  discountType?: DiscountType;
  discountValue?: number;
  discountDescription?: string;
  stripeCouponId?: string;
  message?: string;
}> {
  if (!code || code.trim() === "") {
    return { valid: false, message: "Code is required" };
  }

  const referralCode = await db
    .select()
    .from(referralCodes)
    .where(and(
      eq(referralCodes.code, code.trim().toUpperCase()),
      eq(referralCodes.isActive, true)
    ))
    .limit(1);

  if (referralCode.length === 0) {
    return { valid: false, message: "Invalid or inactive referral code" };
  }

  const codeData = referralCode[0];
  const discountType = (codeData.discountType || 'none') as DiscountType;
  const discountValue = parseFloat(codeData.discountValue || '0');
  const discountDescription = getDiscountDescription(discountType, discountValue);

  return {
    valid: true,
    code: codeData,
    discountType,
    discountValue,
    discountDescription,
    stripeCouponId: codeData.stripeCouponId || undefined,
    message: discountType !== 'none' 
      ? `Valid referral code - ${discountDescription}!` 
      : 'Valid referral code!'
  };
}

/**
 * Records referral usage when user signs up
 */
export async function recordReferralUsage(userId: string, referralCodeData: any, userEmail?: string, username?: string): Promise<void> {
  const discountType = (referralCodeData.discountType || 'none') as DiscountType;
  const discountValue = parseFloat(referralCodeData.discountValue || '0');
  const discountDescription = getDiscountDescription(discountType, discountValue);

  // Update user with referral info
  await db.update(bjjUsers)
    .set({
      referralCodeUsed: referralCodeData.code,
      referredByInfluencer: referralCodeData.influencerName || null,
      referralSignupDate: new Date(),
      discountTypeReceived: discountType,
      discountValueReceived: discountValue.toFixed(2),
      stripeCouponApplied: referralCodeData.stripeCouponId || null,
    })
    .where(eq(bjjUsers.id, userId));

  // Increment total signups on the referral code
  const updatedCode = await db.update(referralCodes)
    .set({
      totalSignups: sql`COALESCE(${referralCodes.totalSignups}, 0) + 1`,
    })
    .where(eq(referralCodes.id, referralCodeData.id))
    .returning();

  console.log(`✅ Recorded referral usage for user ${userId} with code ${referralCodeData.code}`);

  // Send notification email to the code owner (influencer)
  if (referralCodeData.assignedToUserId) {
    try {
      const codeOwner = await db.select({ email: bjjUsers.email })
        .from(bjjUsers)
        .where(eq(bjjUsers.id, referralCodeData.assignedToUserId))
        .limit(1);

      if (codeOwner.length > 0 && codeOwner[0].email) {
        const { sendNewReferralSignupEmail } = await import('./referral-email');
        await sendNewReferralSignupEmail(codeOwner[0].email, {
          newUserEmail: userEmail || 'Unknown',
          newUserUsername: username,
          referralCode: referralCodeData.code,
          influencerName: referralCodeData.influencerName,
          discountGiven: discountType !== 'none' ? discountDescription : undefined,
          totalSignups: updatedCode[0]?.totalSignups || referralCodeData.totalSignups + 1,
        });
      }
    } catch (emailError: any) {
      console.error(`⚠️ Failed to send new signup notification:`, emailError.message);
    }
  }
}

/**
 * Creates a referral code with optional Stripe coupon
 */
export async function createReferralCodeWithCoupon(params: {
  code: string;
  codeType: 'user' | 'influencer';
  influencerName?: string;
  commissionRate?: number;
  discountType: DiscountType;
  discountValue: number;
  assignedToUserId?: string;
  createdByAdmin?: string;
}): Promise<{ success: boolean; referralCode?: any; message?: string }> {
  const { code, codeType, influencerName, commissionRate, discountType, discountValue, assignedToUserId, createdByAdmin } = params;

  // Check if code already exists
  const existing = await db.select()
    .from(referralCodes)
    .where(eq(referralCodes.code, code.toUpperCase()))
    .limit(1);

  if (existing.length > 0) {
    return { success: false, message: 'Referral code already exists' };
  }

  // Create Stripe coupon if needed
  let stripeCouponId: string | null = null;
  if (discountType !== 'none' && discountType !== 'trial_extension') {
    const couponResult = await createStripeCoupon({
      discountType,
      discountValue,
      referralCode: code.toUpperCase(),
    });

    if (!couponResult.success) {
      return { success: false, message: `Failed to create Stripe coupon: ${couponResult.message}` };
    }
    stripeCouponId = couponResult.couponId || null;
  }

  // Create the referral code
  try {
    const newCode = await db.insert(referralCodes)
      .values({
        code: code.toUpperCase(),
        codeType,
        influencerName: influencerName || null,
        commissionRate: commissionRate ? commissionRate.toFixed(2) : null,
        discountType,
        discountValue: discountValue.toFixed(2),
        stripeCouponId,
        assignedToUserId,
        createdByAdmin,
        isActive: true,
      })
      .returning();

    console.log(`✅ Created referral code ${code.toUpperCase()} with ${discountType} discount`);

    return { success: true, referralCode: newCode[0] };
  } catch (error: any) {
    // Cleanup coupon if code creation failed
    if (stripeCouponId) {
      await deleteStripeCoupon(stripeCouponId);
    }
    return { success: false, message: error.message };
  }
}

export async function getWeeklyEmailData(userId: string) {
  const stats = await getReferralStats(userId);

  const newMilestones = await db
    .select()
    .from(referralMilestones)
    .where(and(
      eq(referralMilestones.userId, userId),
      eq(referralMilestones.notified, false)
    ));

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentCommissions = await db
    .select()
    .from(referralCommissions)
    .where(and(
      eq(referralCommissions.codeOwnerUserId, userId),
      gte(referralCommissions.createdAt, sevenDaysAgo)
    ));

  const weeklyEarnings = recentCommissions.reduce(
    (sum, c) => sum + parseFloat(c.commissionAmount || "0"),
    0
  );

  const userCodes = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.assignedToUserId, userId));

  const codeData = userCodes.length > 0 ? userCodes[0] : null;

  const activeSubsList = await db
    .select({
      username: bjjUsers.username,
      email: bjjUsers.email,
      beltLevel: bjjUsers.beltLevel,
    })
    .from(bjjUsers)
    .where(
      sql`${bjjUsers.referralCode} = ${codeData?.code} AND ${bjjUsers.subscriptionStatus} = 'active'`
    );

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const expiringTrials = await db
    .select({
      username: bjjUsers.username,
      email: bjjUsers.email,
      subscriptionEndDate: bjjUsers.subscriptionEndDate,
    })
    .from(bjjUsers)
    .where(
      sql`${bjjUsers.referralCode} = ${codeData?.code} 
          AND ${bjjUsers.subscriptionStatus} = 'trialing'
          AND ${bjjUsers.subscriptionEndDate} <= ${thirtyDaysFromNow}`
    );

  return {
    stats,
    newMilestones,
    weeklyEarnings: weeklyEarnings.toFixed(2),
    weeklySignups: recentCommissions.length,
    code: codeData?.code || "",
    activeSubscribers: activeSubsList,
    expiringTrials,
  };
}
