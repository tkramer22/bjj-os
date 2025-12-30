import { sendSMS } from './twilio';
import { db } from './db';
import { bjjUsers, aiVideoKnowledge, userVideoFeedback } from '@shared/schema';
import { eq, gte, sql, and } from 'drizzle-orm';

const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER;

// Rate limiting: Max 10 SMS per hour, 50 per day
const SMS_RATE_LIMITS = {
  hourly: 10,
  daily: 50,
};

let smsHistory: { timestamp: number }[] = [];

// Check rate limits before sending SMS
function checkRateLimit(): boolean {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  const oneDayAgo = now - (24 * 60 * 60 * 1000);

  // Clean old entries
  smsHistory = smsHistory.filter(entry => entry.timestamp > oneDayAgo);

  // Count recent messages
  const hourlyCount = smsHistory.filter(entry => entry.timestamp > oneHourAgo).length;
  const dailyCount = smsHistory.length;

  if (hourlyCount >= SMS_RATE_LIMITS.hourly) {
    console.error(`[ADMIN SMS] Rate limit exceeded: ${hourlyCount} SMS in last hour (max ${SMS_RATE_LIMITS.hourly})`);
    return false;
  }

  if (dailyCount >= SMS_RATE_LIMITS.daily) {
    console.error(`[ADMIN SMS] Rate limit exceeded: ${dailyCount} SMS today (max ${SMS_RATE_LIMITS.daily})`);
    return false;
  }

  return true;
}

// Helper to send SMS to admin
async function sendAdminSMS(message: string) {
  if (!ADMIN_PHONE) {
    console.warn('[ADMIN SMS] ADMIN_PHONE_NUMBER not configured, skipping notification');
    return;
  }

  // Check rate limits
  if (!checkRateLimit()) {
    console.error('[ADMIN SMS] Rate limit exceeded, SMS not sent');
    return;
  }

  try {
    const result = await sendSMS(ADMIN_PHONE, message);
    if (result.success) {
      // Track successful send
      smsHistory.push({ timestamp: Date.now() });
      console.log(`[ADMIN SMS] Sent: ${message.substring(0, 50)}...`);
    } else {
      console.error(`[ADMIN SMS] Failed:`, result.error);
      
      // Retry once after 5 minutes
      setTimeout(async () => {
        console.log('[ADMIN SMS] Retrying failed message...');
        const retryResult = await sendSMS(ADMIN_PHONE, message);
        if (retryResult.success) {
          smsHistory.push({ timestamp: Date.now() });
          console.log(`[ADMIN SMS] Retry successful: ${message.substring(0, 50)}...`);
        } else {
          console.error('[ADMIN SMS] Retry failed, giving up');
        }
      }, 5 * 60 * 1000);
    }
  } catch (error) {
    console.error('[ADMIN SMS] Error sending admin notification:', error);
  }
}

// Get stats for a time period
async function getStats(hoursAgo: number) {
  const timeThreshold = new Date();
  timeThreshold.setHours(timeThreshold.getHours() - hoursAgo);

  // New signups
  const newSignups = await db.select({ count: sql<number>`count(*)` })
    .from(bjjUsers)
    .where(gte(bjjUsers.createdAt, timeThreshold));

  // Active users (completed onboarding)
  const activeUsers = await db.select({ count: sql<number>`count(*)` })
    .from(bjjUsers)
    .where(
      and(
        eq(bjjUsers.onboardingStep, 'complete'),
        eq(bjjUsers.subscriptionStatus, 'active')
      )
    );

  // Trial users
  const trialUsers = await db.select({ count: sql<number>`count(*)` })
    .from(bjjUsers)
    .where(eq(bjjUsers.subscriptionStatus, 'trial'));

  // Total videos in library
  const totalVideos = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'active'));

  // Recent feedback
  const recentFeedback = await db.select({ count: sql<number>`count(*)` })
    .from(userVideoFeedback)
    .where(gte(userVideoFeedback.createdAt, timeThreshold));

  // Recent Stripe subscriptions - count users who started subscriptions recently
  const recentSubscriptions = await db.select({ count: sql<number>`count(*)` })
    .from(bjjUsers)
    .where(
      and(
        gte(bjjUsers.createdAt, timeThreshold),
        sql`${bjjUsers.subscriptionType} IN ('monthly', 'annual')`
      )
    );

  // Calculate revenue from recent subscriptions
  const recentRevenue = await db.select({ 
    total: sql<number>`COALESCE(SUM(CASE 
      WHEN ${bjjUsers.subscriptionType} = 'monthly' THEN 19.99
      WHEN ${bjjUsers.subscriptionType} = 'annual' THEN 149.00
      ELSE 0 
    END), 0)` 
  })
    .from(bjjUsers)
    .where(
      and(
        gte(bjjUsers.createdAt, timeThreshold),
        eq(bjjUsers.subscriptionStatus, 'active'),
        sql`${bjjUsers.subscriptionType} IN ('monthly', 'annual')`
      )
    );

  return {
    newSignups: Number(newSignups[0]?.count || 0),
    activeUsers: Number(activeUsers[0]?.count || 0),
    trialUsers: Number(trialUsers[0]?.count || 0),
    totalVideos: Number(totalVideos[0]?.count || 0),
    recentFeedback: Number(recentFeedback[0]?.count || 0),
    recentSubscriptions: Number(recentSubscriptions[0]?.count || 0),
    recentRevenue: Number(recentRevenue[0]?.total || 0),
  };
}

// Calculate MRR from active subscribers
async function calculateMRR() {
  const activeSubscribers = await db.select({
    subscriptionType: bjjUsers.subscriptionType
  })
    .from(bjjUsers)
    .where(
      and(
        eq(bjjUsers.subscriptionStatus, 'active'),
        sql`${bjjUsers.subscriptionType} IN ('monthly', 'annual')`
      )
    );

  let mrr = 0;
  activeSubscribers.forEach(sub => {
    if (sub.subscriptionType === 'monthly') {
      mrr += 19.99;
    } else if (sub.subscriptionType === 'annual') {
      mrr += 149.00 / 12; // Convert annual to monthly
    }
  });

  return mrr;
}

// Daily summary (called 5x per day)
export async function sendDailySummary(summaryTime: string) {
  const hours = summaryTime === '7am' ? 24 : // Full day for morning
                summaryTime === '11am' ? 4 :
                summaryTime === '2pm' ? 3 :
                summaryTime === '6pm' ? 4 :
                summaryTime === '10pm' ? 4 : 24; // Since last 6pm update

  const stats = await getStats(hours);
  const mrr = await calculateMRR();

  let message = '';

  if (summaryTime === '7am') {
    // Morning Briefing format
    message = `☀️ BJJ OS Morning Report

Yesterday:
• Revenue: +$${stats.recentRevenue.toFixed(2)} (${stats.recentSubscriptions} new Pro)
• Users: +${stats.newSignups} signups
• MRR: $${mrr.toFixed(2)}

Today's Focus:
• ${stats.trialUsers} trials active
• ${stats.activeUsers} Pro users

bjjos.app/admin`;
  } else if (summaryTime === '10pm') {
    // Daily Summary format
    message = `📊 BJJ OS Daily Summary

TODAY:
• MRR: $${mrr.toFixed(2)} (+$${stats.recentRevenue.toFixed(2)})
• Users: ${stats.activeUsers + stats.trialUsers} (+${stats.newSignups})
• Pro: ${stats.activeUsers} (+${stats.recentSubscriptions})
• Videos: ${stats.totalVideos}

Tomorrow:
• ${stats.trialUsers} trials active

bjjos.app/admin`;
  } else {
    // Status Update format (11am, 2pm, 6pm)
    const timeLabel = summaryTime === '11am' ? '11 AM' : summaryTime === '2pm' ? '2 PM' : '6 PM';
    message = `📊 BJJ OS Update (${timeLabel})

Since last update:
• ${stats.newSignups} new signups
• ${stats.recentSubscriptions} Pro conversions (+$${stats.recentRevenue.toFixed(2)})
• ${stats.recentFeedback} video interactions

Issues: None ✅

bjjos.app/admin`;
  }

  await sendAdminSMS(message);
}

// Instant alerts for critical events
export async function alertNewSignup(phone: string, referralCode?: string) {
  const message = `📱 New Signup

${phone}
${referralCode ? `Referral: ${referralCode}` : 'Direct signup'}

bjjos.app/admin/users`;

  await sendAdminSMS(message);
}

export async function alertNewSubscription(phone: string, customerNumber: number) {
  const mrr = await calculateMRR();
  
  const message = `🎉 Customer #${customerNumber}!

${phone} just converted
MRR: $${mrr.toFixed(2)}

bjjos.app/admin`;

  await sendAdminSMS(message);
}

export async function alertSubscriptionCancellation(phone: string) {
  const message = `❌ Subscription Cancelled

User: ${phone}

Action: Reach out for feedback

bjjos.app/admin/users`;

  await sendAdminSMS(message);
}

export async function alertPaymentFailed(phone: string, amount: number, reason: string) {
  const message = `💳 Payment Failed

User: ${phone}
Amount: $${(amount / 100).toFixed(2)}
Reason: ${reason}
Retry: auto

bjjos.app/admin/users`;

  await sendAdminSMS(message);
}

export async function alertCriticalError(errorType: string, details: string) {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  
  const message = `🚨 CRITICAL: System Error

${errorType}
Time: ${timestamp}

Check logs: bjjos.app/admin`;

  await sendAdminSMS(message);
}

export async function alertChargeback(phone: string, amount: number, reason: string) {
  const message = `⚠️ Chargeback Alert

User: ${phone}
Amount: $${(amount / 100).toFixed(2)}
Reason: "${reason}"

Respond: bjjos.app/admin`;

  await sendAdminSMS(message);
}

export async function alertMilestone(mrrThousands: number) {
  const mrr = await calculateMRR();
  const proCount = await db.select({ count: sql<number>`count(*)` })
    .from(bjjUsers)
    .where(
      and(
        eq(bjjUsers.subscriptionStatus, 'active'),
        sql`${bjjUsers.subscriptionType} IN ('monthly', 'annual')`
      )
    );
  
  const message = `🎉 MILESTONE: $${mrrThousands}K MRR

Current: $${mrr.toFixed(2)}
Users: ${proCount[0]?.count || 0} Pro subscribers

bjjos.app/admin`;

  await sendAdminSMS(message);
}

// Send test SMS
export async function sendTestSMS() {
  const message = `🧪 BJJ OS Test

Admin SMS system active.
This is a test message.

Setup complete ✅`;

  await sendAdminSMS(message);
}
