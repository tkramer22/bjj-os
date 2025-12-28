import webpush from 'web-push';
import { db } from './db';
import { pushSubscriptions } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// Configure web-push with VAPID keys
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_EMAIL) {
  console.warn('⚠️  VAPID keys not configured - push notifications disabled');
} else {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: any;
  url?: string;
}

/**
 * Send push notification to a specific user
 */
export async function sendPushToUser(userId: string, payload: PushNotificationPayload) {
  try {
    // Get all active subscriptions for this user
    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.isActive, true)
      ));

    if (subscriptions.length === 0) {
      console.log(`📵 No active push subscriptions for user ${userId}`);
      return { success: false, reason: 'no_subscriptions' };
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/icon-192.png',
      data: {
        ...payload.data,
        url: payload.url || '/',
        timestamp: Date.now()
      }
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            },
            notificationPayload
          );
          console.log(`✅ Push sent to endpoint: ${sub.endpoint.substring(0, 50)}...`);
          return { success: true, endpoint: sub.endpoint };
        } catch (error: any) {
          console.error(`❌ Failed to send push to ${sub.endpoint.substring(0, 50)}:`, error.message);
          
          // If subscription is invalid/expired, deactivate it
          if (error.statusCode === 410 || error.statusCode === 404) {
            console.log(`🗑️  Deactivating invalid subscription: ${sub.endpoint.substring(0, 50)}...`);
            await db
              .update(pushSubscriptions)
              .set({ isActive: false, updatedAt: new Date() })
              .where(eq(pushSubscriptions.endpoint, sub.endpoint));
          }
          
          throw error;
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`📊 Push notification results: ${successful} sent, ${failed} failed`);

    return {
      success: successful > 0,
      sent: successful,
      failed: failed,
      total: subscriptions.length
    };
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification to multiple users
 */
export async function sendPushToUsers(userIds: string[], payload: PushNotificationPayload) {
  const results = await Promise.allSettled(
    userIds.map(userId => sendPushToUser(userId, payload))
  );

  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;

  return {
    success: successful > 0,
    sent: successful,
    failed: failed,
    total: userIds.length
  };
}

/**
 * Test push notification
 */
export async function testPushNotification(userId: string) {
  return sendPushToUser(userId, {
    title: '🥋 BJJ OS Notifications Active!',
    body: 'You\'ll now receive daily technique updates and personalized recommendations from Prof. OS.',
    icon: '/icon-192.png',
    url: '/chat'
  });
}
