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
 * 
 * NOTE: Platform columns (last_platform, ios_user, web_user) disabled until migration runs
 * TODO: Re-enable after running /api/admin/migrate-platform-columns in production
 */
export async function trackPlatformLogin(
  userId: string,
  userAgent: string | undefined,
  ipAddress: string | undefined
): Promise<void> {
  try {
    const platform = detectPlatform(userAgent);
    
    // DISABLED: Platform columns don't exist in production yet
    // await db.update(bjjUsers)
    //   .set({
    //     lastPlatform: platform,
    //     iosUser: isIOS ? true : sql`${bjjUsers.iosUser}`,
    //     webUser: !isIOS ? true : sql`${bjjUsers.webUser}`,
    //     lastLogin: new Date(),
    //     updatedAt: new Date(),
    //   })
    //   .where(eq(bjjUsers.id, userId));
    
    // Only update lastLogin (column exists)
    await db.update(bjjUsers)
      .set({
        lastLogin: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bjjUsers.id, userId));
    
    // Log the login event (loginHistory table should exist)
    try {
      await db.insert(loginHistory).values({
        userId,
        platform,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
      });
    } catch (err) {
      // loginHistory table may not exist yet
      console.log(`[PLATFORM] loginHistory insert skipped (table may not exist)`);
    }
    
    console.log(`✅ [PLATFORM] Login tracked: User ${userId.slice(0, 8)}... on ${platform}`);
  } catch (error) {
    console.error('[PLATFORM] Error tracking login:', error);
    // Don't throw - tracking should never break login
  }
}

/**
 * Track platform on any authenticated request (for continuous tracking)
 * Fire-and-forget - doesn't block the request
 * 
 * NOTE: Platform columns disabled until migration runs
 */
export function trackPlatformActivity(
  userId: string,
  userAgent: string | undefined
): void {
  // DISABLED: Platform columns don't exist in production yet
  // Fire and forget - don't await
  // const platform = detectPlatform(userAgent);
  // const isIOS = isIOSPlatform(platform);
  
  // db.update(bjjUsers)
  //   .set({
  //     lastPlatform: platform,
  //     iosUser: isIOS ? true : sql`${bjjUsers.iosUser}`,
  //     webUser: !isIOS ? true : sql`${bjjUsers.webUser}`,
  //     lastActiveAt: new Date(),
  //   })
  //   .where(eq(bjjUsers.id, userId))
  //   .catch(err => {
  //     console.error('[PLATFORM] Error tracking activity:', err);
  //   });
  
  // NO-OP until migration runs
}

/**
 * Get platform statistics for admin dashboard
 * 
 * NOTE: Platform columns disabled until migration runs - returns placeholder data
 */
export async function getPlatformStats() {
  try {
    // Get stats from login_history table
    let overallStats: any = { rows: [] };
    let recentActivity: any = { rows: [] };
    let dailyActive: any = { rows: [] };
    let recentLogins: any = { rows: [] };
    
    try {
      // Calculate overall platform stats from login_history
      overallStats = await db.execute(sql`
        SELECT 
          COUNT(DISTINCT CASE WHEN platform LIKE 'ios%' THEN user_id END) as total_ios_users,
          COUNT(DISTINCT CASE WHEN platform NOT LIKE 'ios%' THEN user_id END) as total_web_users,
          COUNT(DISTINCT CASE 
            WHEN user_id IN (
              SELECT DISTINCT user_id FROM login_history WHERE platform LIKE 'ios%'
              INTERSECT
              SELECT DISTINCT user_id FROM login_history WHERE platform NOT LIKE 'ios%'
            ) THEN user_id 
          END) as both_platforms,
          COUNT(DISTINCT CASE WHEN platform LIKE 'ios%' AND created_at >= NOW() - INTERVAL '7 days' THEN user_id END) as active_ios,
          COUNT(DISTINCT CASE WHEN platform NOT LIKE 'ios%' AND created_at >= NOW() - INTERVAL '7 days' THEN user_id END) as active_web,
          COUNT(DISTINCT CASE WHEN platform = 'ios_iphone' THEN user_id END) as iphone_users,
          COUNT(DISTINCT CASE WHEN platform = 'ios_ipad' THEN user_id END) as ipad_users
        FROM login_history
      `);
      
      // Login activity by platform (last 30 days)
      recentActivity = await db.execute(sql`
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
      dailyActive = await db.execute(sql`
        SELECT 
          DATE(created_at) as date,
          COUNT(DISTINCT CASE WHEN platform LIKE 'ios%' THEN user_id END) as ios_dau,
          COUNT(DISTINCT CASE WHEN platform NOT LIKE 'ios%' THEN user_id END) as web_dau
        FROM login_history
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);
      
      // Recent logins for admin view (last 50)
      recentLogins = await db.execute(sql`
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
    } catch (err) {
      // login_history table may not exist yet
      console.log('[PLATFORM] login_history queries skipped (table may not exist)');
    }
    
    // Get subscriber stats (using bjj_users with lastLogin as activity indicator)
    let subscriberStats: any = { rows: [] };
    try {
      subscriberStats = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (
            WHERE (subscription_status = 'active' OR subscription_status = 'trialing')
          ) as total_subscribers,
          COUNT(*) FILTER (
            WHERE (subscription_status = 'active' OR subscription_status = 'trialing')
              AND last_login >= NOW() - INTERVAL '7 days'
          ) as active_subscribers
        FROM bjj_users
      `);
    } catch (err) {
      console.log('[PLATFORM] subscriber query skipped');
    }
    
    // Handle different result formats from db.execute
    const getRows = (result: any): any[] => Array.isArray(result) ? result : (result?.rows || []);
    
    const overallRow = getRows(overallStats)[0] || {};
    const subscriberRow = getRows(subscriberStats)[0] || {};
    const activityRows = getRows(recentActivity);
    const dailyRows = getRows(dailyActive);
    const loginRows = getRows(recentLogins);
    
    return {
      overall: {
        total_ios_users: Number(overallRow.total_ios_users || 0),
        total_web_users: Number(overallRow.total_web_users || 0),
        both_platforms: Number(overallRow.both_platforms || 0),
        active_ios: Number(overallRow.active_ios || 0),
        active_web: Number(overallRow.active_web || 0),
        iphone_users: Number(overallRow.iphone_users || 0),
        ipad_users: Number(overallRow.ipad_users || 0),
      },
      subscribers: {
        ios_subscribers: 0, // Need login_history joined with subscriptions
        web_subscribers: 0,
        ios_active: Number(overallRow.active_ios || 0),
        web_active: Number(overallRow.active_web || 0),
        total_subscribers: Number(subscriberRow.total_subscribers || 0),
        active_subscribers: Number(subscriberRow.active_subscribers || 0),
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
