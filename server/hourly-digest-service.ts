import { db } from './db';
import { curationRuns } from '@shared/schema';
import { sql } from 'drizzle-orm';

/**
 * HOURLY DIGEST SERVICE
 * Sends comprehensive hourly stats at :00 of every hour
 */

// Helper to extract rows from both Neon and postgres-js result formats
function getRows(result: any): any[] {
  return Array.isArray(result) ? result : result?.rows || [];
}

export async function sendHourlyDigest() {
  console.log('📊 [HOURLY DIGEST] Generating report...');
  
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    // ═══════════════════════════════════════════════════════════════
    // CURATION METRICS
    // ═══════════════════════════════════════════════════════════════
    const hourlyStats = await db.execute(sql`
      SELECT 
        COALESCE(SUM(videos_screened), 0) as screened,
        COALESCE(SUM(videos_added), 0) as accepted,
        COALESCE(SUM(videos_rejected), 0) as rejected,
        COALESCE(SUM(api_units_used), 0) as api_units,
        COUNT(*) as runs
      FROM curation_runs
      WHERE created_at >= ${oneHourAgo.toISOString()}
        AND status = 'completed'
    `);
    
    const todayStats = await db.execute(sql`
      SELECT 
        COALESCE(SUM(videos_screened), 0) as screened,
        COALESCE(SUM(videos_added), 0) as accepted,
        COALESCE(SUM(videos_rejected), 0) as rejected,
        COALESCE(SUM(api_units_used), 0) as api_units
      FROM curation_runs
      WHERE created_at >= ${today.toISOString()}
        AND status = 'completed'
    `);
    
    const hourly = getRows(hourlyStats)[0] || {};
    const todayCuration = getRows(todayStats)[0] || {};
    
    const hourlyAcceptanceRate = Number(hourly.screened) > 0
      ? ((Number(hourly.accepted) / Number(hourly.screened)) * 100).toFixed(1)
      : '0.0';
    
    const todayAcceptanceRate = Number(todayCuration.screened) > 0
      ? ((Number(todayCuration.accepted) / Number(todayCuration.screened)) * 100).toFixed(1)
      : '0.0';
    
    // ═══════════════════════════════════════════════════════════════
    // VIDEO LIBRARY METRICS
    // ═══════════════════════════════════════════════════════════════
    const totalVideos = await db.execute(sql`
      SELECT COUNT(*) as count FROM ai_video_knowledge
    `);
    
    const videosAddedToday = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM ai_video_knowledge 
      WHERE DATE(created_at) = ${today.toISOString().split('T')[0]}
    `);
    
    // ═══════════════════════════════════════════════════════════════
    // API QUOTA
    // ═══════════════════════════════════════════════════════════════
    const { getQuotaUsage } = await import('./youtube-quota-monitor');
    const quotaInfo = await getQuotaUsage();
    const quotaPercent = ((quotaInfo.estimatedUnits / 10000) * 100).toFixed(1);
    
    // ═══════════════════════════════════════════════════════════════
    // FORMAT DIGEST
    // ═══════════════════════════════════════════════════════════════
    const digest = {
      timestamp: now.toISOString(),
      hour: now.getHours(),
      
      lastHour: {
        screened: Number(hourly.screened),
        accepted: Number(hourly.accepted),
        rejected: Number(hourly.rejected),
        acceptanceRate: Number(hourlyAcceptanceRate),
        apiUnits: Number(hourly.api_units),
        runs: Number(hourly.runs)
      },
      
      today: {
        screened: Number(todayCuration.screened),
        accepted: Number(todayCuration.accepted),
        rejected: Number(todayCuration.rejected),
        acceptanceRate: Number(todayAcceptanceRate),
        apiUnits: Number(todayCuration.api_units),
        totalVideos: Number(getRows(totalVideos)[0]?.count || 0),
        videosAddedToday: Number(getRows(videosAddedToday)[0]?.count || 0)
      },
      
      quota: {
        used: quotaInfo.estimatedUnits,
        limit: 10000,
        percentUsed: Number(quotaPercent)
      }
    };
    
    // ═══════════════════════════════════════════════════════════════
    // CONSOLE LOG SUMMARY
    // ═══════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📊 HOURLY DIGEST - ${now.toLocaleTimeString()}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n🔄 LAST HOUR:');
    console.log(`   Screened: ${digest.lastHour.screened}`);
    console.log(`   Accepted: ${digest.lastHour.accepted} (${digest.lastHour.acceptanceRate}%)`);
    console.log(`   Rejected: ${digest.lastHour.rejected}`);
    console.log(`   API Units: ${digest.lastHour.apiUnits}`);
    console.log(`   Runs: ${digest.lastHour.runs}`);
    
    console.log('\n📅 TODAY:');
    console.log(`   Total Videos: ${digest.today.totalVideos} (+${digest.today.videosAddedToday})`);
    console.log(`   Screened: ${digest.today.screened}`);
    console.log(`   Accepted: ${digest.today.accepted} (${digest.today.acceptanceRate}%)`);
    console.log(`   API Quota: ${digest.quota.percentUsed}% (${digest.quota.used}/${digest.quota.limit})`);
    
    // Status indicators
    const acceptanceStatus = 
      digest.lastHour.acceptanceRate >= 2 && digest.lastHour.acceptanceRate <= 5 ? '✅ GOOD' :
      digest.lastHour.acceptanceRate >= 1 && digest.lastHour.acceptanceRate <= 15 ? '⚠️  WARNING' :
      '🔴 CRITICAL';
    
    const quotaStatus = 
      digest.quota.percentUsed < 70 ? '✅ GOOD' :
      digest.quota.percentUsed < 90 ? '⚠️  WARNING' :
      '🔴 CRITICAL';
    
    console.log('\n📊 STATUS:');
    console.log(`   Acceptance Rate: ${acceptanceStatus}`);
    console.log(`   API Quota: ${quotaStatus}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    return { success: true, digest };
    
  } catch (error: any) {
    console.error('❌ [HOURLY DIGEST] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get digest for specific time period
 */
export async function getDigest(period: 'hour' | 'day' | 'week') {
  try {
    const now = new Date();
    let startTime: Date;
    
    switch (period) {
      case 'hour':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'day':
        startTime = new Date(now);
        startTime.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
    }
    
    const stats = await db.execute(sql`
      SELECT 
        COALESCE(SUM(videos_screened), 0) as screened,
        COALESCE(SUM(videos_added), 0) as accepted,
        COALESCE(SUM(videos_rejected), 0) as rejected,
        COALESCE(SUM(api_units_used), 0) as api_units,
        COUNT(*) as runs
      FROM curation_runs
      WHERE created_at >= ${startTime.toISOString()}
        AND status = 'completed'
    `);
    
    const row = getRows(stats)[0] || {};
    const acceptanceRate = Number(row.screened) > 0
      ? ((Number(row.accepted) / Number(row.screened)) * 100).toFixed(1)
      : '0.0';
    
    return {
      period,
      screened: Number(row.screened),
      accepted: Number(row.accepted),
      rejected: Number(row.rejected),
      acceptanceRate: Number(acceptanceRate),
      apiUnits: Number(row.api_units),
      runs: Number(row.runs)
    };
    
  } catch (error: any) {
    console.error(`Error getting ${period} digest:`, error);
    return null;
  }
}
