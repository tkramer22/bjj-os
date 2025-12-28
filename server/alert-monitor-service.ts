import { db } from './db';
import { systemAlerts, curationRuns } from '@shared/schema';
import { desc, sql } from 'drizzle-orm';

/**
 * ALERT MONITOR SERVICE
 * Runs every 2 minutes to detect system issues and create proactive alerts
 */

export async function runAlertMonitor() {
  console.log('🔍 [ALERT MONITOR] Running system health check...');
  
  try {
    const now = new Date();
    const alerts: Array<{
      severity: 'critical' | 'warning' | 'info';
      title: string;
      message: string;
    }> = [];
    
    // ═══════════════════════════════════════════════════════════════
    // CHECK 1: Curation Pipeline Status
    // ═══════════════════════════════════════════════════════════════
    const lastRun = await db.query.curationRuns.findFirst({
      orderBy: [desc(curationRuns.createdAt)],
      limit: 1
    });
    
    if (lastRun) {
      const minutesSinceLastRun = Math.floor((now.getTime() - new Date(lastRun.createdAt).getTime()) / 60000);
      
      if (minutesSinceLastRun > 60) {
        alerts.push({
          severity: 'critical',
          title: '🔴 Curation Pipeline Offline',
          message: `Last curation run was ${minutesSinceLastRun} minutes ago. Expected run interval is 20 minutes.`
        });
      } else if (minutesSinceLastRun > 30) {
        alerts.push({
          severity: 'warning',
          title: '⚠️ Curation Pipeline Delayed',
          message: `Last curation run was ${minutesSinceLastRun} minutes ago. Normal interval is 20 minutes.`
        });
      }
      
      // Check last run status
      if (lastRun.status === 'failed') {
        alerts.push({
          severity: 'critical',
          title: '🔴 Last Curation Run Failed',
          message: `Error: ${lastRun.errorMessage || 'Unknown error'}`
        });
      }
    } else {
      alerts.push({
        severity: 'critical',
        title: '🔴 No Curation Runs Found',
        message: 'Curation pipeline has never run. System may not be initialized.'
      });
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CHECK 2: Acceptance Rate Quality
    // ═══════════════════════════════════════════════════════════════
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const hourlyStats = await db.execute(sql`
      SELECT 
        COALESCE(SUM(videos_screened), 0) as screened,
        COALESCE(SUM(videos_added), 0) as accepted
      FROM curation_runs
      WHERE created_at >= ${oneHourAgo.toISOString()}
        AND status = 'completed'
    `);
    
    const statsRow = Array.isArray(hourlyStats) ? hourlyStats[0] : (hourlyStats.rows?.[0] || {});
    const screened = Number(statsRow?.screened || 0);
    const accepted = Number(statsRow?.accepted || 0);
    
    if (screened > 0) {
      const acceptanceRate = (accepted / screened) * 100;
      
      if (acceptanceRate > 15) {
        alerts.push({
          severity: 'critical',
          title: '🔴 Acceptance Rate Too High',
          message: `Last hour: ${acceptanceRate.toFixed(1)}% (target: 2-5%). Quality thresholds may be too loose.`
        });
      } else if (acceptanceRate < 1 && screened > 20) {
        alerts.push({
          severity: 'warning',
          title: '⚠️ Acceptance Rate Too Low',
          message: `Last hour: ${acceptanceRate.toFixed(1)}% (target: 2-5%). Quality thresholds may be too strict.`
        });
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CHECK 3: YouTube API Quota
    // ═══════════════════════════════════════════════════════════════
    const { getQuotaUsage } = await import('./youtube-quota-monitor');
    const quotaInfo = await getQuotaUsage();
    const quotaPercent = (quotaInfo.estimatedUnits / 10000) * 100;
    
    if (quotaPercent > 95) {
      alerts.push({
        severity: 'critical',
        title: '🔴 YouTube API Quota Critical',
        message: `${quotaPercent.toFixed(1)}% used (${quotaInfo.estimatedUnits}/10,000). Curation will stop when quota exhausted.`
      });
    } else if (quotaPercent > 80) {
      alerts.push({
        severity: 'warning',
        title: '⚠️ YouTube API Quota High',
        message: `${quotaPercent.toFixed(1)}% used (${quotaInfo.estimatedUnits}/10,000). Monitor closely.`
      });
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CHECK 4: Video Growth Rate
    // ═══════════════════════════════════════════════════════════════
    const today = now.toISOString().split('T')[0];
    const videosAddedToday = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM ai_video_knowledge 
      WHERE DATE(created_at) = ${today}
    `);
    
    const addedRow = Array.isArray(videosAddedToday) ? videosAddedToday[0] : ((videosAddedToday as any).rows?.[0] || {});
    const addedCount = Number(addedRow?.count || 0);
    const currentHour = now.getHours();
    
    // Expected: ~10-50 videos per day, so 0 videos after 12pm is a warning
    if (addedCount === 0 && currentHour >= 12) {
      alerts.push({
        severity: 'warning',
        title: '⚠️ No Videos Added Today',
        message: `Zero videos curated today. Check if curation is finding quality content.`
      });
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Save Alerts to Database
    // ═══════════════════════════════════════════════════════════════
    if (alerts.length > 0) {
      console.log(`🚨 [ALERT MONITOR] Found ${alerts.length} alerts`);
      
      for (const alert of alerts) {
        // Check if similar alert exists in last 30 minutes (avoid spam)
        const existingAlert = await db.execute(sql`
          SELECT id FROM system_alerts
          WHERE title = ${alert.title}
            AND created_at >= ${new Date(now.getTime() - 30 * 60 * 1000).toISOString()}
            AND dismissed = false
          LIMIT 1
        `);
        
        const existingRows = Array.isArray(existingAlert) ? existingAlert : ((existingAlert as any).rows || []);
        if (existingRows.length === 0) {
          await db.insert(systemAlerts).values({
            severity: alert.severity,
            title: alert.title,
            message: alert.message
          });
          console.log(`  ✅ Created: ${alert.title}`);
        } else {
          console.log(`  ⏭️  Skipped (duplicate): ${alert.title}`);
        }
      }
    } else {
      console.log('✅ [ALERT MONITOR] All systems healthy');
    }
    
    return { success: true, alertsCreated: alerts.length };
    
  } catch (error: any) {
    console.error('❌ [ALERT MONITOR] Error:', error);
    
    // Create critical alert about monitor failure
    try {
      await db.insert(systemAlerts).values({
        severity: 'critical',
        title: '🔴 Alert Monitor Failed',
        message: `Error: ${error.message}`
      });
    } catch (dbError) {
      console.error('Failed to save alert monitor error:', dbError);
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Get all active (non-dismissed) alerts
 */
export async function getActiveAlerts() {
  try {
    const alerts = await db.query.systemAlerts.findMany({
      where: sql`dismissed = false`,
      orderBy: [desc(systemAlerts.createdAt)],
      limit: 20
    });
    
    return alerts;
  } catch (error: any) {
    console.error('Error fetching active alerts:', error);
    return [];
  }
}

/**
 * Dismiss an alert
 */
export async function dismissAlert(alertId: string, adminUserId?: string) {
  try {
    await db.execute(sql`
      UPDATE system_alerts
      SET dismissed = true,
          dismissed_at = NOW(),
          dismissed_by = ${adminUserId || 'system'}
      WHERE id = ${alertId}
    `);
    
    return { success: true };
  } catch (error: any) {
    console.error('Error dismissing alert:', error);
    return { success: false, error: error.message };
  }
}
