/**
 * CURATION EMAIL NOTIFICATIONS
 * 
 * Two email types:
 * 1. Curation Results - Immediate after every run
 * 2. Daily Summary - 9pm EST with platform stats
 */

import { Resend } from 'resend';
import { db } from './db';
import { aiVideoKnowledge, bjjUsers, aiConversationLearning, curationRuns } from '@shared/schema';
import { sql, gte, eq, and, desc } from 'drizzle-orm';

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = 'todd@bjjos.app';

interface CurationResults {
  runType: 'manual' | 'scheduled' | 'gap-filling';
  videosAnalyzed: number;
  videosAdded: number;
  videosSkipped: number;
  addedTitles?: string[];
  errors?: string[];
  duration?: number;
}

/**
 * EMAIL TYPE 1: Curation Results (Immediate)
 * Send after every curation run
 */
export async function sendCurationResultsEmail(results: CurationResults): Promise<boolean> {
  try {
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    const totalVideos = await db.select({ count: sql<number>`count(*)` }).from(aiVideoKnowledge);
    const librarySize = Number(totalVideos[0]?.count || 0);
    
    const subject = results.videosAdded > 0
      ? `🤖 Curation Complete: +${results.videosAdded} videos`
      : `⚠️ Curation Complete: 0 videos added`;
    
    let htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px;">
        <h2 style="color: #8B5CF6; margin-bottom: 20px;">
          ${results.videosAdded > 0 ? '✅' : '⚠️'} Curation Run Complete
        </h2>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Type</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${results.runType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Time</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${timeStr} EST</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Videos Analyzed</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${results.videosAnalyzed}</td>
          </tr>
          <tr style="background: ${results.videosAdded > 0 ? '#dcfce7' : '#fef9c3'};">
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Videos Added</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">${results.videosAdded}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Videos Skipped</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${results.videosSkipped}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Library Size</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${librarySize} videos</td>
          </tr>
          ${results.duration ? `
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Duration</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${Math.round(results.duration / 1000)}s</td>
          </tr>
          ` : ''}
        </table>
    `;
    
    if (results.addedTitles && results.addedTitles.length > 0) {
      htmlContent += `
        <h3 style="color: #22c55e; margin-top: 20px;">Videos Added:</h3>
        <ul style="padding-left: 20px; margin: 10px 0;">
          ${results.addedTitles.slice(0, 20).map(t => `<li style="margin: 5px 0;">${t.substring(0, 70)}${t.length > 70 ? '...' : ''}</li>`).join('')}
          ${results.addedTitles.length > 20 ? `<li style="color: #666;">...and ${results.addedTitles.length - 20} more</li>` : ''}
        </ul>
      `;
    }
    
    if (results.errors && results.errors.length > 0) {
      htmlContent += `
        <h3 style="color: #ef4444; margin-top: 20px;">⚠️ Errors:</h3>
        <ul style="padding-left: 20px; margin: 10px 0; color: #ef4444;">
          ${results.errors.slice(0, 5).map(e => `<li style="margin: 5px 0;">${e}</li>`).join('')}
          ${results.errors.length > 5 ? `<li>...and ${results.errors.length - 5} more errors</li>` : ''}
        </ul>
      `;
    }
    
    htmlContent += `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <a href="https://bjjos.app/admin/videos" style="background: #8B5CF6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            View Video Library
          </a>
        </div>
      </div>
    `;
    
    await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: [ADMIN_EMAIL],
      subject,
      html: htmlContent
    });
    
    console.log(`[EMAIL] ✅ Curation results email sent: ${subject}`);
    return true;
    
  } catch (error) {
    console.error('[EMAIL] ❌ Failed to send curation results email:', error);
    return false;
  }
}

/**
 * EMAIL TYPE 2: Daily Summary (9pm EST)
 * Comprehensive platform stats
 */
export async function sendDailySummaryEmail(): Promise<boolean> {
  try {
    const now = new Date();
    const today = now.toLocaleDateString('en-US', { 
      timeZone: 'America/New_York',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    
    const totalVideosResult = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
    const totalVideos = Number((totalVideosResult.rows[0] as any)?.count || 0);
    
    const videosTodayResult = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge WHERE analyzed_at >= CURRENT_DATE`);
    const videosToday = Number((videosTodayResult.rows[0] as any)?.count || 0);
    
    const totalUsersResult = await db.execute(sql`SELECT COUNT(*) as count FROM bjj_users`);
    const totalUsers = Number((totalUsersResult.rows[0] as any)?.count || 0);
    
    const newUsersTodayResult = await db.execute(sql`SELECT COUNT(*) as count FROM bjj_users WHERE created_at >= CURRENT_DATE`);
    const newUsersToday = Number((newUsersTodayResult.rows[0] as any)?.count || 0);
    
    const activeUsersResult = await db.execute(sql`SELECT COUNT(*) as count FROM bjj_users WHERE subscription_status = 'active'`);
    const activeUsers = Number((activeUsersResult.rows[0] as any)?.count || 0);
    
    const conversationsTodayResult = await db.execute(sql`SELECT COUNT(*) as count FROM ai_conversation_learning WHERE created_at >= CURRENT_DATE`);
    const conversationsToday = Number((conversationsTodayResult.rows[0] as any)?.count || 0);
    
    const curationRunsResult = await db.execute(sql`SELECT * FROM curation_runs WHERE started_at >= CURRENT_DATE ORDER BY started_at DESC`);
    const todayCurationRuns = curationRunsResult.rows as any[];
    
    const completedRuns = todayCurationRuns.filter(r => r.status === 'completed');
    const failedRuns = todayCurationRuns.filter(r => r.status === 'failed');
    
    const topInstructors = await db.execute(sql`
      SELECT instructor_name, COUNT(*) as video_count
      FROM ai_video_knowledge
      GROUP BY instructor_name
      ORDER BY video_count DESC
      LIMIT 10
    `);
    
    const recentTechniques = await db.execute(sql`
      SELECT technique_name, COUNT(*) as count
      FROM ai_video_knowledge
      WHERE analyzed_at >= CURRENT_DATE
      GROUP BY technique_name
      ORDER BY count DESC
      LIMIT 5
    `);
    
    let healthStatus = '✅ Healthy';
    let healthColor = '#22c55e';
    const issues: string[] = [];
    
    if (failedRuns.length > 0) {
      issues.push(`${failedRuns.length} curation run(s) failed`);
    }
    if (videosToday === 0) {
      issues.push('No videos added today');
    }
    if (conversationsToday === 0) {
      issues.push('No Professor OS conversations today');
    }
    
    if (issues.length > 0) {
      healthStatus = '⚠️ Warning';
      healthColor = '#f59e0b';
    }
    if (issues.length >= 2) {
      healthStatus = '🔴 Issues Detected';
      healthColor = '#ef4444';
    }
    
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px;">
        <h2 style="color: #8B5CF6; margin-bottom: 5px;">📊 BJJ OS Daily Summary</h2>
        <p style="color: #666; margin-top: 0;">${today}</p>
        
        <div style="background: ${healthColor}20; border-left: 4px solid ${healthColor}; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <strong style="color: ${healthColor};">System Status: ${healthStatus}</strong>
          ${issues.length > 0 ? `<ul style="margin: 10px 0 0; padding-left: 20px;">${issues.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}
        </div>
        
        <h3 style="color: #374151; border-bottom: 2px solid #8B5CF6; padding-bottom: 5px;">📚 Video Library</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0;"><strong>Total Videos</strong></td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #8B5CF6;">${totalVideos.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Added Today</strong></td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #22c55e;">+${videosToday}</td>
          </tr>
        </table>
        
        <h3 style="color: #374151; border-bottom: 2px solid #8B5CF6; padding-bottom: 5px;">👥 Users</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0;"><strong>Total Users</strong></td>
            <td style="padding: 8px 0; text-align: right;">${totalUsers}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Active Subscribers</strong></td>
            <td style="padding: 8px 0; text-align: right;">${activeUsers}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>New Today</strong></td>
            <td style="padding: 8px 0; text-align: right; color: #22c55e;">+${newUsersToday}</td>
          </tr>
        </table>
        
        <h3 style="color: #374151; border-bottom: 2px solid #8B5CF6; padding-bottom: 5px;">🤖 Professor OS</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0;"><strong>Conversations Today</strong></td>
            <td style="padding: 8px 0; text-align: right;">${conversationsToday}</td>
          </tr>
        </table>
        
        <h3 style="color: #374151; border-bottom: 2px solid #8B5CF6; padding-bottom: 5px;">🎯 Curation Runs Today</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0;"><strong>Total Runs</strong></td>
            <td style="padding: 8px 0; text-align: right;">${todayCurationRuns.length}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Completed</strong></td>
            <td style="padding: 8px 0; text-align: right; color: #22c55e;">${completedRuns.length}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Failed</strong></td>
            <td style="padding: 8px 0; text-align: right; color: ${failedRuns.length > 0 ? '#ef4444' : '#666'};">${failedRuns.length}</td>
          </tr>
        </table>
        
        <h3 style="color: #374151; border-bottom: 2px solid #8B5CF6; padding-bottom: 5px;">🏆 Top Instructors</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          ${(topInstructors.rows as any[]).slice(0, 5).map((i, idx) => `
            <tr>
              <td style="padding: 5px 0;">${idx + 1}. ${i.instructor_name}</td>
              <td style="padding: 5px 0; text-align: right; color: #666;">${i.video_count} videos</td>
            </tr>
          `).join('')}
        </table>
        
        ${(recentTechniques.rows as any[]).length > 0 ? `
          <h3 style="color: #374151; border-bottom: 2px solid #8B5CF6; padding-bottom: 5px;">📝 Techniques Added Today</h3>
          <ul style="padding-left: 20px; margin: 10px 0;">
            ${(recentTechniques.rows as any[]).map(t => `<li>${t.technique_name} (${t.count})</li>`).join('')}
          </ul>
        ` : ''}
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; display: flex; gap: 10px;">
          <a href="https://bjjos.app/admin" style="background: #8B5CF6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Admin Dashboard
          </a>
          <a href="https://bjjos.app/admin/videos" style="background: #374151; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Video Library
          </a>
        </div>
      </div>
    `;
    
    await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: [ADMIN_EMAIL],
      subject: `📊 BJJ OS Daily Summary - ${today}`,
      html: htmlContent
    });
    
    console.log(`[EMAIL] ✅ Daily summary email sent`);
    return true;
    
  } catch (error) {
    console.error('[EMAIL] ❌ Failed to send daily summary email:', error);
    return false;
  }
}
