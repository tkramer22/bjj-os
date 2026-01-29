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
    // DISABLED: Platform columns don't exist in production yet
    // Return placeholder stats until migration runs
    const overallStats = { rows: [{
      total_ios_users: 0,
      total_web_users: 0,
      both_platforms: 0,
      active_ios: 0,
      active_web: 0,
      iphone_users: 0,
      ipad_users: 0,
    }] };
    
    const subscriberStats = { rows: [{
      ios_subscribers: 0,
      web_subscribers: 0,
      ios_active: 0,
      web_active: 0,
    }] };
    
    // Login activity by platform (last 30 days) - may fail if table doesn't exist
    let recentActivity: any = { rows: [] };
    let dailyActive: any = { rows: [] };
    let recentLogins: any = { rows: [] };
    
    try {
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
          COUNT(DISTINCT CASE WHEN platform LIKE '%web' THEN user_id END) as web_dau
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
