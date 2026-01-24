/**
 * Platform Tracking Service
 * Tracks iOS app vs Web browser usage for admin analytics
 */

import { db } from './db';
import { bjjUsers, loginHistory } from '@shared/schema';
import { eq, sql, and, gte, desc } from 'drizzle-orm';
import { detectPlatform, isIOSApp, Platform, isIOSPlatform } from './utils/platformDetection';

/**
 * Track a login event and update user platform flags
 * Call this after successful authentication
 */
export async function trackPlatformLogin(
  userId: string,
  userAgent: string | undefined,
  ipAddress: string | undefined
): Promise<void> {
  try {
    const platform = detectPlatform(userAgent);
    const isIOS = isIOSPlatform(platform);
    
    // Update user's platform info (non-blocking)
    await db.update(bjjUsers)
      .set({
        lastPlatform: platform,
        iosUser: isIOS ? true : sql`${bjjUsers.iosUser}`,
        webUser: !isIOS ? true : sql`${bjjUsers.webUser}`,
        lastLogin: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bjjUsers.id, userId));
    
    // Log the login event
    await db.insert(loginHistory).values({
      userId,
      platform,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
    });
    
    console.log(`✅ [PLATFORM] Login tracked: User ${userId.slice(0, 8)}... on ${platform}`);
  } catch (error) {
    console.error('[PLATFORM] Error tracking login:', error);
    // Don't throw - tracking should never break login
  }
}

/**
 * Track platform on any authenticated request (for continuous tracking)
 * Fire-and-forget - doesn't block the request
 */
export function trackPlatformActivity(
  userId: string,
  userAgent: string | undefined
): void {
  // Fire and forget - don't await
  const platform = detectPlatform(userAgent);
  const isIOS = isIOSPlatform(platform);
  
  db.update(bjjUsers)
    .set({
      lastPlatform: platform,
      iosUser: isIOS ? true : sql`${bjjUsers.iosUser}`,
      webUser: !isIOS ? true : sql`${bjjUsers.webUser}`,
      lastActiveAt: new Date(),
    })
    .where(eq(bjjUsers.id, userId))
    .catch(err => {
      console.error('[PLATFORM] Error tracking activity:', err);
    });
}

/**
 * Get platform statistics for admin dashboard
 */
export async function getPlatformStats() {
  try {
    // Overall platform breakdown
    const overallStats = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE ios_user = true) as total_ios_users,
        COUNT(*) FILTER (WHERE web_user = true) as total_web_users,
        COUNT(*) FILTER (WHERE ios_user = true AND web_user = true) as both_platforms,
        COUNT(*) FILTER (WHERE last_platform LIKE 'ios%') as active_ios,
        COUNT(*) FILTER (WHERE last_platform LIKE '%web') as active_web,
        COUNT(*) FILTER (WHERE last_platform = 'ios_iphone') as iphone_users,
        COUNT(*) FILTER (WHERE last_platform = 'ios_ipad') as ipad_users
      FROM bjj_users
      WHERE active = true
    `);
    
    // Active subscriber platform stats
    const subscriberStats = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE ios_user = true) as ios_subscribers,
        COUNT(*) FILTER (WHERE web_user = true) as web_subscribers,
        COUNT(*) FILTER (WHERE last_platform LIKE 'ios%') as ios_active,
        COUNT(*) FILTER (WHERE last_platform LIKE '%web') as web_active
      FROM bjj_users
      WHERE 
        active = true
        AND subscription_status = 'active'
    `);
    
    // Login activity by platform (last 30 days)
    const recentActivity = await db.execute(sql`
      SELECT 
        platform,
        COUNT(*) as login_count,
        COUNT(DISTINCT user_id) as unique_users
      FROM login_history
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY platform
      ORDER BY login_count DESC
    `);
    
    // Daily active users by platform (last 7 days)
    const dailyActive = await db.execute(sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(DISTINCT CASE WHEN platform LIKE 'ios%' THEN user_id END) as ios_dau,
        COUNT(DISTINCT CASE WHEN platform LIKE '%web' THEN user_id END) as web_dau
      FROM login_history
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    // Recent logins for admin view (last 50)
    const recentLogins = await db.execute(sql`
      SELECT 
        lh.id,
        lh.user_id,
        lh.platform,
        lh.created_at,
        u.email,
        u.display_name
      FROM login_history lh
      LEFT JOIN bjj_users u ON lh.user_id = u.id
      ORDER BY lh.created_at DESC
      LIMIT 50
    `);
    
    // Handle different result formats from db.execute
    const overallRows = Array.isArray(overallStats) ? overallStats : ((overallStats as any).rows || []);
    const subscriberRows = Array.isArray(subscriberStats) ? subscriberStats : ((subscriberStats as any).rows || []);
    const activityRows = Array.isArray(recentActivity) ? recentActivity : ((recentActivity as any).rows || []);
    const dailyRows = Array.isArray(dailyActive) ? dailyActive : ((dailyActive as any).rows || []);
    const loginRows = Array.isArray(recentLogins) ? recentLogins : ((recentLogins as any).rows || []);
    
    return {
      overall: overallRows[0] || {
        total_ios_users: 0,
        total_web_users: 0,
        both_platforms: 0,
        active_ios: 0,
        active_web: 0,
        iphone_users: 0,
        ipad_users: 0,
      },
      subscribers: subscriberRows[0] || {
        ios_subscribers: 0,
        web_subscribers: 0,
        ios_active: 0,
        web_active: 0,
      },
      recentActivity: activityRows || [],
      dailyActive: dailyRows || [],
      recentLogins: loginRows || [],
    };
  } catch (error) {
    console.error('[PLATFORM] Error getting stats:', error);
    throw error;
  }
}
