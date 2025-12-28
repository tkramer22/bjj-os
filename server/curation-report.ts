/**
 * CURATION REPORT SERVICE
 * 
 * Generates and sends beautifully formatted curation reports
 * via email after each curation run.
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'todd@bjjos.app';

interface CurationReportData {
  videosBefore: number;
  videosAfter: number;
  videosAnalyzed: number;
  videosAdded: number;
  duration: number;
  newVideos: Array<{ title: string; instructor: string; score: number }>;
  runNumber?: number;
  isExhaustMode?: boolean;
}

export async function sendCurationReportEmail(data: CurationReportData): Promise<void> {
  const {
    videosBefore,
    videosAfter,
    videosAnalyzed,
    videosAdded,
    duration,
    newVideos,
    runNumber,
    isExhaustMode
  } = data;

  const approvalRate = videosAnalyzed > 0 
    ? ((videosAdded / videosAnalyzed) * 100).toFixed(1) 
    : '0';
  
  const durationStr = duration < 60 
    ? `${duration} seconds` 
    : `${(duration / 60).toFixed(1)} minutes`;

  const subject = isExhaustMode && runNumber
    ? `BJJ OS Exhaust Run #${runNumber} - +${videosAdded} Videos Added`
    : `BJJ OS Curation Complete - +${videosAdded} Videos Added`;

  // Generate plain text version
  const textBody = generateTextReport(data, approvalRate, durationStr);
  
  // Generate HTML version
  const htmlBody = generateHtmlReport(data, approvalRate, durationStr);

  try {
    await resend.emails.send({
      from: 'BJJ OS <notifications@bjjos.app>',
      to: ADMIN_EMAIL,
      subject,
      text: textBody,
      html: htmlBody
    });
    
    console.log(`[CURATION REPORT] Email sent: ${subject}`);
  } catch (error) {
    console.error('[CURATION REPORT] Failed to send email:', error);
    throw error;
  }
}

function generateTextReport(data: CurationReportData, approvalRate: string, durationStr: string): string {
  const { videosBefore, videosAfter, videosAnalyzed, videosAdded, newVideos, runNumber, isExhaustMode } = data;
  
  const header = isExhaustMode && runNumber 
    ? `🔥 EXHAUST CURATION RUN #${runNumber} COMPLETE!`
    : `🎉 CURATION COMPLETE!`;

  const videosTable = newVideos.length > 0
    ? newVideos.slice(0, 15).map(v => 
        `  • ${v.title.substring(0, 45)}${v.title.length > 45 ? '...' : ''} - ${v.instructor} (${v.score.toFixed(1)})`
      ).join('\n')
    : '  • No new videos added (all duplicates or below threshold)';

  return `
${header}
Results in ${durationStr}

════════════════════════════════════════════════════════════════
SUMMARY
════════════════════════════════════════════════════════════════
┌─────────────────┬──────────┬──────────┐
│ Metric          │ Before   │ After    │
├─────────────────┼──────────┼──────────┤
│ Total Videos    │ ${String(videosBefore).padEnd(8)} │ ${String(videosAfter).padEnd(8)} │
│ Videos Added    │ 0        │ ${String(videosAdded).padEnd(8)} │
└─────────────────┴──────────┴──────────┘

════════════════════════════════════════════════════════════════
📹 NEW ELITE VIDEOS ADDED
════════════════════════════════════════════════════════════════
${videosTable}

════════════════════════════════════════════════════════════════
📊 RUN STATISTICS
════════════════════════════════════════════════════════════════
• Videos Analyzed: ${videosAnalyzed}
• Videos Approved: ${videosAdded}
• Approval Rate: ${approvalRate}%
• Run Duration: ${durationStr}

✅ Library now has ${videosAfter} elite videos!

View Library: https://bjjos.app/admin/videos
Run Another: https://bjjos.app/admin/command-center
  `.trim();
}

function generateHtmlReport(data: CurationReportData, approvalRate: string, durationStr: string): string {
  const { videosBefore, videosAfter, videosAnalyzed, videosAdded, newVideos, runNumber, isExhaustMode } = data;
  
  const header = isExhaustMode && runNumber 
    ? `🔥 Exhaust Run #${runNumber} Complete!`
    : `🎉 Curation Complete!`;

  const videosRows = newVideos.length > 0
    ? newVideos.slice(0, 20).map(v => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #333; color: #fff;">${escapeHtml(v.title.substring(0, 50))}${v.title.length > 50 ? '...' : ''}</td>
          <td style="padding: 12px; border-bottom: 1px solid #333; color: #a29bfe;">${escapeHtml(v.instructor)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #333; color: #55efc4; font-weight: bold; text-align: center;">${v.score.toFixed(1)}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="3" style="padding: 12px; color: #888; text-align: center;">No new videos added</td></tr>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #fff; padding: 0; margin: 0;">
  <div style="max-width: 650px; margin: 0 auto; padding: 30px 20px;">
    
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #8B5CF6; margin: 0 0 8px 0; font-size: 28px;">${header}</h1>
      <p style="color: #a29bfe; margin: 0; font-size: 16px;">Results in ${durationStr}</p>
    </div>

    <!-- Summary Table -->
    <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #333; color: #a29bfe; font-weight: 600;">Metric</th>
            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #333; color: #a29bfe; font-weight: 600;">Before</th>
            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #333; color: #a29bfe; font-weight: 600;">After</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #333; color: #fff;">Total Videos</td>
            <td style="padding: 12px; border-bottom: 1px solid #333; color: #fff; text-align: center;">${videosBefore}</td>
            <td style="padding: 12px; border-bottom: 1px solid #333; color: #55efc4; font-weight: bold; text-align: center;">${videosAfter}</td>
          </tr>
          <tr>
            <td style="padding: 12px; color: #fff;">Videos Added</td>
            <td style="padding: 12px; color: #888; text-align: center;">0</td>
            <td style="padding: 12px; color: #55efc4; font-weight: bold; font-size: 18px; text-align: center;">+${videosAdded}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- New Videos -->
    <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h2 style="color: #8B5CF6; margin: 0 0 16px 0; font-size: 18px;">📹 New Elite Videos Added</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #333; color: #a29bfe; font-weight: 600;">Video</th>
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #333; color: #a29bfe; font-weight: 600;">Instructor</th>
            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #333; color: #a29bfe; font-weight: 600;">Score</th>
          </tr>
        </thead>
        <tbody>
          ${videosRows}
        </tbody>
      </table>
    </div>

    <!-- Statistics -->
    <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h2 style="color: #8B5CF6; margin: 0 0 16px 0; font-size: 18px;">📊 Run Statistics</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div style="background: #2d2d44; padding: 12px; border-radius: 8px;">
          <div style="color: #888; font-size: 12px; margin-bottom: 4px;">Videos Analyzed</div>
          <div style="color: #fff; font-size: 20px; font-weight: bold;">${videosAnalyzed}</div>
        </div>
        <div style="background: #2d2d44; padding: 12px; border-radius: 8px;">
          <div style="color: #888; font-size: 12px; margin-bottom: 4px;">Videos Approved</div>
          <div style="color: #55efc4; font-size: 20px; font-weight: bold;">${videosAdded}</div>
        </div>
        <div style="background: #2d2d44; padding: 12px; border-radius: 8px;">
          <div style="color: #888; font-size: 12px; margin-bottom: 4px;">Approval Rate</div>
          <div style="color: #fff; font-size: 20px; font-weight: bold;">${approvalRate}%</div>
        </div>
        <div style="background: #2d2d44; padding: 12px; border-radius: 8px;">
          <div style="color: #888; font-size: 12px; margin-bottom: 4px;">Duration</div>
          <div style="color: #fff; font-size: 20px; font-weight: bold;">${durationStr}</div>
        </div>
      </div>
    </div>

    <!-- Library Total -->
    <div style="text-align: center; padding: 24px; background: linear-gradient(135deg, #8B5CF6 0%, #6c5ce7 100%); border-radius: 12px; margin-bottom: 24px;">
      <div style="font-size: 14px; color: rgba(255,255,255,0.8); margin-bottom: 4px;">Library Total</div>
      <div style="font-size: 36px; font-weight: bold; color: #fff;">${videosAfter}</div>
      <div style="font-size: 14px; color: rgba(255,255,255,0.8);">Elite BJJ Videos</div>
    </div>

    <!-- Action Buttons -->
    <div style="text-align: center;">
      <a href="https://bjjos.app/admin/videos" style="display: inline-block; background: #8B5CF6; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 0 8px 12px; font-weight: 600;">View Library</a>
      <a href="https://bjjos.app/admin/command-center" style="display: inline-block; background: #2d2d44; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 0 8px 12px; font-weight: 600; border: 1px solid #444;">Run Another</a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #333;">
      <p style="color: #666; font-size: 12px; margin: 0;">BJJ OS - AI-Powered Training Platform</p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Export for use in content-first-curator
export async function generateCurationReport(runResult: {
  runId: string;
  startTime: Date;
  endTime: Date;
  videosBefore: number;
  videosAfter: number;
  videosAnalyzed: number;
  videosAdded: number;
  newVideos: Array<{ title: string; instructor: string; qualityScore: number }>;
}) {
  const duration = Math.round((runResult.endTime.getTime() - runResult.startTime.getTime()) / 1000);
  
  return {
    summary: {
      before: runResult.videosBefore,
      after: runResult.videosAfter,
      added: runResult.videosAdded,
      duration: `${(duration / 60).toFixed(1)} minutes`
    },
    newVideos: runResult.newVideos.map(v => ({
      title: v.title.substring(0, 50),
      instructor: v.instructor,
      score: v.qualityScore.toFixed(1)
    })),
    statistics: {
      analyzed: runResult.videosAnalyzed,
      approved: runResult.videosAdded,
      rate: runResult.videosAnalyzed > 0 
        ? `${((runResult.videosAdded / runResult.videosAnalyzed) * 100).toFixed(1)}%`
        : 'N/A',
      duration: `${(duration / 60).toFixed(1)} minutes`
    },
    libraryTotal: runResult.videosAfter
  };
}
