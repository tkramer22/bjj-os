import { Resend } from 'resend';
import { db } from './db';
import { sql } from 'drizzle-orm';

const resend = new Resend(process.env.RESEND_API_KEY);

interface DailyStats {
  newSignupsToday: number;
  totalUsers: number;
  activeTrials: number;
  activePaidUsers: number;
  mrr: number;
  
  // Video stats
  totalVideos: number;
  videosAddedToday: number;
  videoBatchesToday: number;
  
  // Combat sports
  combatSportsToday: number;
  last7Days: number;
  
  // Website
  pageViewsToday: number;
  uniqueVisitorsToday: number;
  topState: string | null;
  topStateCount: number;
  
  activeUsersNow: number;
  systemIssues: string[];
}

async function getDailyStats(): Promise<DailyStats> {
  const systemIssues: string[] = [];
  
  console.log('[ADMIN EMAIL] 📊 Gathering daily stats...');
  
  try {
    // User metrics - Using America/New_York timezone
    const userStatsResult = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE DATE(created_at AT TIME ZONE 'America/New_York') = CURRENT_DATE AT TIME ZONE 'America/New_York') as new_signups,
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE subscription_status = 'trialing') as active_trials,
        COUNT(*) FILTER (WHERE subscription_status = 'active' AND subscription_type = 'paid') as active_paid
      FROM bjj_users
    `);
    
    const userRow = userStatsResult.rows[0] as any || { new_signups: 0, total_users: 0, active_trials: 0, active_paid: 0 };
    const activePaid = parseInt(userRow.active_paid) || 0;
    const mrr = activePaid * 14.99;
    
    // Video stats - query videos table
    let videoStats = { total: 0, today: 0, batches: 0 };
    
    try {
      const videosTotal = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
      const videosToday = await db.execute(sql`
        SELECT COUNT(*) as count FROM ai_video_knowledge 
        WHERE DATE(upload_date AT TIME ZONE 'America/New_York') = CURRENT_DATE AT TIME ZONE 'America/New_York'
      `);
      
      videoStats.total = parseInt((videosTotal.rows[0] as any)?.count) || 0;
      videoStats.today = parseInt((videosToday.rows[0] as any)?.count) || 0;
      
      console.log('[ADMIN EMAIL] ✅ Video stats (videos):', videoStats);
    } catch (e1) {
      console.error('[ADMIN EMAIL] ❌ Error querying videos:', (e1 as Error).message);
      systemIssues.push('Video library table query failed');
    }
    
    // Get curation batches from curation_runs table
    try {
      const batches = await db.execute(sql`
        SELECT COUNT(*) as count FROM curation_runs 
        WHERE DATE(started_at AT TIME ZONE 'America/New_York') = CURRENT_DATE AT TIME ZONE 'America/New_York'
      `);
      videoStats.batches = parseInt((batches.rows[0] as any)?.count) || 0;
      console.log('[ADMIN EMAIL] ✅ Curation batches today:', videoStats.batches);
    } catch (e) {
      console.log('[ADMIN EMAIL] ⚠️ Error querying curation_runs:', (e as Error).message);
    }
    
    if (videoStats.total === 0 && videoStats.batches === 0) {
      systemIssues.push('Video counts are 0 - check if videos are being saved to database');
    }
    
    // Combat sports scraping
    let combatStats = { today: 0, last7: 0 };
    try {
      const scraping = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE DATE(scraped_at AT TIME ZONE 'America/New_York') = CURRENT_DATE AT TIME ZONE 'America/New_York') as today,
          COUNT(*) FILTER (WHERE (scraped_at AT TIME ZONE 'America/New_York') >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York') - INTERVAL '7 days') as last7
        FROM combat_sports_news
      `);
      
      const scrapingRow = scraping.rows[0] as any;
      combatStats.today = parseInt(scrapingRow?.today) || 0;
      combatStats.last7 = parseInt(scrapingRow?.last7) || 0;
      
      console.log('[ADMIN EMAIL] ✅ Combat stats:', combatStats);
    } catch (e) {
      console.log('[ADMIN EMAIL] ⚠️ No combat_sports_news table');
    }
    
    // Website analytics
    let webStats = { views: 0, visitors: 0, topState: null as string | null, topStateCount: 0 };
    try {
      const web = await db.execute(sql`
        SELECT 
          COUNT(*) as views,
          COUNT(DISTINCT visitor_id) as visitors
        FROM page_views
        WHERE DATE(created_at AT TIME ZONE 'America/New_York') = CURRENT_DATE AT TIME ZONE 'America/New_York'
      `);
      
      const webRow = web.rows[0] as any;
      webStats.views = parseInt(webRow?.views) || 0;
      webStats.visitors = parseInt(webRow?.visitors) || 0;
      
      // Top state
      const topState = await db.execute(sql`
        SELECT state_name, state_code, COUNT(*) as count
        FROM page_views
        WHERE DATE(created_at AT TIME ZONE 'America/New_York') = CURRENT_DATE AT TIME ZONE 'America/New_York' AND state_code IS NOT NULL
        GROUP BY state_name, state_code
        ORDER BY count DESC
        LIMIT 1
      `);
      
      if (topState.rows.length > 0) {
        const topStateRow = topState.rows[0] as any;
        webStats.topState = `${topStateRow.state_name} (${topStateRow.state_code})`;
        webStats.topStateCount = parseInt(topStateRow.count);
      }
      
      console.log('[ADMIN EMAIL] ✅ Web stats:', webStats);
    } catch (e) {
      console.log('[ADMIN EMAIL] ⚠️ No page_views table');
    }
    
    // Active users
    let activeNow = 0;
    try {
      const active = await db.execute(sql`
        SELECT COUNT(DISTINCT user_id) as count
        FROM activity_log
        WHERE (created_at AT TIME ZONE 'America/New_York') >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York') - INTERVAL '30 minutes'
      `);
      activeNow = parseInt((active.rows[0] as any)?.count) || 0;
    } catch (e) {
      console.log('[ADMIN EMAIL] ⚠️ No activity_log table');
    }
    
    const stats = {
      newSignupsToday: parseInt(userRow.new_signups) || 0,
      totalUsers: parseInt(userRow.total_users) || 0,
      activeTrials: parseInt(userRow.active_trials) || 0,
      activePaidUsers: activePaid,
      mrr,
      totalVideos: videoStats.total,
      videosAddedToday: videoStats.today,
      videoBatchesToday: videoStats.batches,
      combatSportsToday: combatStats.today,
      last7Days: combatStats.last7,
      pageViewsToday: webStats.views,
      uniqueVisitorsToday: webStats.visitors,
      topState: webStats.topState,
      topStateCount: webStats.topStateCount,
      activeUsersNow: activeNow,
      systemIssues
    };
    
    console.log('[ADMIN EMAIL] 📊 Final stats:', JSON.stringify(stats, null, 2));
    
    return stats;
    
  } catch (error) {
    console.error('[ADMIN EMAIL] ❌ Error getting stats:', error);
    throw error;
  }
}

function buildCleanEmail(stats: DailyStats, reportType?: string): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  });
  
  // Determine report label and subtitle
  let reportLabel = 'Report';
  let reportSubtitle = '';
  if (reportType === 'morning') {
    reportLabel = 'Morning Report';
    reportSubtitle = 'Overnight Activity (since yesterday evening)';
  } else if (reportType === 'midday') {
    reportLabel = 'Midday Update';
    reportSubtitle = 'Real-time status as of now';
  } else if (reportType === 'afternoon') {
    reportLabel = 'Afternoon Report';
    reportSubtitle = 'Today\'s activity so far';
  } else if (reportType === 'evening') {
    reportLabel = 'Evening Update';
    reportSubtitle = 'Complete summary for today';
  } else if (reportType === 'night') {
    reportLabel = 'Night Report';
    reportSubtitle = 'End of day summary';
  } else if (reportType === 'summary') {
    reportLabel = 'Daily Summary';
    reportSubtitle = 'Complete 24-hour report';
  }
  
  const hasIssues = stats.systemIssues.length > 0;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #ffffff; color: #000000;">
  
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    
    <!-- Header -->
    <div style="margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #000000;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #000000;">BJJ OS ${reportLabel}</h1>
      <p style="margin: 4px 0 0 0; font-size: 14px; color: #666666;">${date} • ${time} EST</p>
      ${reportSubtitle ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #999999; font-style: italic;">${reportSubtitle}</p>` : ''}
    </div>
    
    <!-- Alerts -->
    ${hasIssues ? `
      <div style="background: #000000; color: #ffffff; padding: 16px 20px; border-radius: 8px; margin-bottom: 32px;">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">⚠️ ATTENTION REQUIRED</div>
        ${stats.systemIssues.map(issue => `<div style="font-size: 13px; margin-bottom: 4px;">• ${issue}</div>`).join('')}
      </div>
    ` : `
      <div style="background: #f0fdf4; color: #166534; padding: 16px 20px; border-radius: 8px; margin-bottom: 32px; border: 1px solid #bbf7d0;">
        <div style="font-size: 14px; font-weight: 600;">✅ All systems operational</div>
      </div>
    `}
    
    <!-- Quick Stats -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 40px;">
      <div style="padding: 20px; background: #f8f8f8; border-radius: 8px;">
        <div style="font-size: 32px; font-weight: 700; color: #000000;">${stats.newSignupsToday}</div>
        <div style="font-size: 12px; color: #666666; font-weight: 500; text-transform: uppercase;">New Signups</div>
      </div>
      <div style="padding: 20px; background: #f8f8f8; border-radius: 8px;">
        <div style="font-size: 32px; font-weight: 700; color: #000000;">$${stats.mrr.toFixed(0)}</div>
        <div style="font-size: 12px; color: #666666; font-weight: 500; text-transform: uppercase;">MRR</div>
      </div>
      <div style="padding: 20px; background: #f8f8f8; border-radius: 8px;">
        <div style="font-size: 32px; font-weight: 700; color: #000000;">${stats.totalUsers}</div>
        <div style="font-size: 12px; color: #666666; font-weight: 500; text-transform: uppercase;">Total Users</div>
      </div>
      <div style="padding: 20px; background: #f8f8f8; border-radius: 8px;">
        <div style="font-size: 32px; font-weight: 700; color: #000000;">${stats.activeUsersNow}</div>
        <div style="font-size: 12px; color: #666666; font-weight: 500; text-transform: uppercase;">Active Now</div>
      </div>
    </div>
    
    <!-- Content Curation -->
    <div style="margin-bottom: 40px; padding: 24px; background: #f8f8f8; border-radius: 8px;">
      <h2 style="margin: 0 0 20px 0; font-size: 16px; font-weight: 700; color: #000000; text-transform: uppercase; letter-spacing: 0.5px;">Content Curation</h2>
      <div style="display: grid; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
          <span style="font-size: 14px; color: #666666;">Curation Batches Today</span>
          <span style="font-size: 18px; font-weight: 600; color: #000000;">${stats.videoBatchesToday}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
          <span style="font-size: 14px; color: #666666;">Videos Added Today</span>
          <span style="font-size: 18px; font-weight: 600; color: #000000;">${stats.videosAddedToday}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0;">
          <span style="font-size: 14px; color: #666666;">Total Videos</span>
          <span style="font-size: 18px; font-weight: 600; color: #000000;">${stats.totalVideos}</span>
        </div>
      </div>
    </div>
    
    <!-- Combat Sports Intelligence -->
    <div style="margin-bottom: 40px; padding: 24px; background: #f8f8f8; border-radius: 8px;">
      <h2 style="margin: 0 0 20px 0; font-size: 16px; font-weight: 700; color: #000000; text-transform: uppercase; letter-spacing: 0.5px;">Combat Sports Intelligence</h2>
      <div style="display: grid; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
          <span style="font-size: 14px; color: #666666;">Articles Scraped Today</span>
          <span style="font-size: 18px; font-weight: 600; color: #000000;">${stats.combatSportsToday}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0;">
          <span style="font-size: 14px; color: #666666;">Last 7 Days</span>
          <span style="font-size: 18px; font-weight: 600; color: #000000;">${stats.last7Days}</span>
        </div>
      </div>
    </div>
    
    <!-- Website Analytics -->
    <div style="margin-bottom: 40px; padding: 24px; background: #f8f8f8; border-radius: 8px;">
      <h2 style="margin: 0 0 20px 0; font-size: 16px; font-weight: 700; color: #000000; text-transform: uppercase; letter-spacing: 0.5px;">Website Analytics</h2>
      <div style="display: grid; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
          <span style="font-size: 14px; color: #666666;">Page Views Today</span>
          <span style="font-size: 18px; font-weight: 600; color: #000000;">${stats.pageViewsToday}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
          <span style="font-size: 14px; color: #666666;">Unique Visitors</span>
          <span style="font-size: 18px; font-weight: 600; color: #000000;">${stats.uniqueVisitorsToday}</span>
        </div>
        ${stats.topState ? `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0;">
          <span style="font-size: 14px; color: #666666;">Top State</span>
          <span style="font-size: 18px; font-weight: 600; color: #000000;">${stats.topState} (${stats.topStateCount})</span>
        </div>
        ` : ''}
      </div>
    </div>
    
    <!-- Footer -->
    <div style="margin-top: 48px; padding-top: 24px; border-top: 2px solid #e0e0e0; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #999999;">BJJ OS Admin Reports • Auto-generated at ${time} EST</p>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #999999;">This email was sent to ${process.env.ADMIN_EMAIL || 'todd@bjjos.app'}</p>
    </div>
    
  </div>
  
</body>
</html>
  `;
}

export async function sendDailyAdminEmail(reportType?: string) {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'todd@bjjos.app';
    
    console.log('[ADMIN EMAIL] 📊 Gathering stats...');
    const stats = await getDailyStats();
    
    console.log('[ADMIN EMAIL] 📧 Building email...');
    const html = buildCleanEmail(stats, reportType);
    
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    
    // Determine subject based on report type
    let subjectPrefix = 'Report';
    
    if (reportType === 'morning') {
      subjectPrefix = 'Morning Report';
    } else if (reportType === 'midday') {
      subjectPrefix = 'Midday Update';
    } else if (reportType === 'afternoon') {
      subjectPrefix = 'Afternoon Report';
    } else if (reportType === 'evening') {
      subjectPrefix = 'Evening Update';
    } else if (reportType === 'night') {
      subjectPrefix = 'Night Report';
    } else if (reportType === 'summary') {
      subjectPrefix = 'Daily Summary';
    }
    
    const subject = `BJJ OS ${subjectPrefix} - ${date}`;
    
    console.log('[ADMIN EMAIL] 📤 Sending email to:', adminEmail);
    console.log('[ADMIN EMAIL] 📋 Subject:', subject);
    
    const result = await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: adminEmail,
      subject: subject,
      html: html
    });
    
    console.log('[ADMIN EMAIL] ✅ Daily email sent successfully:', result.id);
    
    if (stats.systemIssues.length > 0) {
      console.log('[ADMIN EMAIL] ⚠️ System issues detected:', stats.systemIssues);
    }
    
    return { success: true, id: result.id, stats };
    
  } catch (error) {
    console.error('[ADMIN EMAIL] ❌ Email send error:', error);
    return { success: false, error: String(error) };
  }
}

// Export for manual testing
export async function sendAdminReport(reportType?: string) {
  return await sendDailyAdminEmail(reportType);
}
