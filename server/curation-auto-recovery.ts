/**
 * CURATION AUTO-RECOVERY SYSTEM
 * 
 * Automatically detects and recovers from stuck curation runs
 * - Monitors for runs stuck in "running" state for >2 hours
 * - Automatically clears them to "failed" status
 * - Sends email alerts to admin
 * - Runs every 30 minutes via scheduler
 */

import { db } from './db';
import { curationRuns } from '@shared/schema';
import { eq, and, sql, lte, gte, like } from 'drizzle-orm';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const STUCK_THRESHOLD_HOURS = 2; // Consider "running" for >2 hours as stuck
const ADMIN_EMAIL = 'todd@bjjos.app';

// ═══════════════════════════════════════════════════════════
// MAIN RECOVERY FUNCTION
// ═══════════════════════════════════════════════════════════

export async function checkAndRecoverStuckRuns() {
  console.log('\n🔍 [AUTO-RECOVERY] Checking for stuck curation runs...');
  
  try {
    // Calculate threshold date (JavaScript Date object for Drizzle compatibility)
    const thresholdDate = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 60 * 60 * 1000);
    console.log(`  Checking for runs started before: ${thresholdDate.toISOString()}`);
    
    // Find runs stuck in "running" state for >2 hours
    const stuckRuns = await db
      .select()
      .from(curationRuns)
      .where(
        and(
          eq(curationRuns.status, 'running'),
          lte(curationRuns.startedAt, thresholdDate)
        )
      );
    
    if (stuckRuns.length === 0) {
      console.log('✅ [AUTO-RECOVERY] No stuck runs detected');
      return {
        success: true,
        stuckRuns: 0,
        recovered: [],
        message: 'No stuck runs detected'
      };
    }
    
    console.log(`🚨 [AUTO-RECOVERY] Found ${stuckRuns.length} stuck run(s)!`);
    
    // Recover each stuck run
    const recovered = [];
    for (const run of stuckRuns) {
      const hoursStuck = Math.floor(
        (Date.now() - new Date(run.startedAt!).getTime()) / (1000 * 60 * 60)
      );
      
      console.log(`  🔧 Recovering run ${run.id} (stuck for ${hoursStuck}h)`);
      
      // Update status to "failed"
      await db
        .update(curationRuns)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorMessage: `Auto-recovery: Run stuck in "running" state for ${hoursStuck} hours. Automatically cleared to prevent blocking future runs.`
        })
        .where(eq(curationRuns.id, run.id));
      
      recovered.push({
        id: run.id,
        hoursStuck,
        startedAt: run.startedAt,
        videosProcessed: run.videosAnalyzed || 0,
        videosApproved: run.videosAdded || 0
      });
    }
    
    console.log(`✅ [AUTO-RECOVERY] Successfully recovered ${recovered.length} run(s)`);
    
    // Send email alert to admin
    await sendRecoveryAlert(recovered);
    
    return {
      success: true,
      stuckRuns: stuckRuns.length,
      recovered,
      message: `Recovered ${recovered.length} stuck run(s)`
    };
    
  } catch (error: any) {
    console.error('❌ [AUTO-RECOVERY] Error:', error);
    
    // Try to alert admin about the failure
    try {
      await sendRecoveryFailureAlert(error);
    } catch (emailError) {
      console.error('❌ [AUTO-RECOVERY] Failed to send failure alert:', emailError);
    }
    
    return {
      success: false,
      stuckRuns: 0,
      recovered: [],
      message: `Error: ${error.message}`,
      error: error.message
    };
  }
}

// ═══════════════════════════════════════════════════════════
// EMAIL ALERTS
// ═══════════════════════════════════════════════════════════

async function sendRecoveryAlert(recovered: Array<{
  id: string;
  hoursStuck: number;
  startedAt: Date | null;
  videosProcessed: number;
  videosApproved: number;
}>) {
  const runsSummary = recovered.map(r => `
    <li>
      <strong>Run ID:</strong> ${r.id}<br>
      <strong>Stuck Duration:</strong> ${r.hoursStuck} hours<br>
      <strong>Started At:</strong> ${r.startedAt?.toLocaleString('en-US', { timeZone: 'America/New_York' })} EST<br>
      <strong>Videos Processed:</strong> ${r.videosProcessed}<br>
      <strong>Videos Approved:</strong> ${r.videosApproved}
    </li>
  `).join('');
  
  const html = `
    <h2>🚨 Curation Auto-Recovery Alert</h2>
    <p>The auto-recovery system detected and cleared <strong>${recovered.length} stuck curation run(s)</strong>.</p>
    
    <h3>Recovery Details:</h3>
    <ul>
      ${runsSummary}
    </ul>
    
    <hr>
    <p style="color: #666; font-size: 14px;">
      <strong>What happened:</strong> These runs were stuck in "running" state for over ${STUCK_THRESHOLD_HOURS} hours and have been automatically cleared to "failed" status to prevent blocking future curation runs.
    </p>
    
    <p style="color: #666; font-size: 14px;">
      <strong>Next steps:</strong> The next scheduled curation run will proceed normally. If this happens frequently, investigate the curation pipeline for potential issues.
    </p>
  `;
  
  try {
    await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: ADMIN_EMAIL,
      subject: `🚨 Curation Auto-Recovery: ${recovered.length} Run(s) Cleared`,
      html
    });
    
    console.log('📧 [AUTO-RECOVERY] Alert email sent to', ADMIN_EMAIL);
  } catch (error: any) {
    console.error('❌ [AUTO-RECOVERY] Failed to send alert email:', error);
    // Don't throw - recovery already completed
  }
}

async function sendRecoveryFailureAlert(error: any) {
  const html = `
    <h2>⚠️ Curation Auto-Recovery System Error</h2>
    <p>The auto-recovery system encountered an error while checking for stuck runs.</p>
    
    <h3>Error Details:</h3>
    <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${error.message}</pre>
    
    <hr>
    <p style="color: #666; font-size: 14px;">
      <strong>Action required:</strong> Manually check the database for stuck curation runs and investigate the auto-recovery system.
    </p>
  `;
  
  await resend.emails.send({
    from: 'BJJ OS <noreply@bjjos.app>',
    to: ADMIN_EMAIL,
    subject: '⚠️ Curation Auto-Recovery System Error',
    html
  });
}

// ═══════════════════════════════════════════════════════════
// MANUAL RECOVERY (FOR API ENDPOINT)
// ═══════════════════════════════════════════════════════════

export async function manualRecovery(runId?: string) {
  console.log('\n🔧 [MANUAL RECOVERY] Triggered');
  
  if (runId) {
    // Recover specific run
    console.log(`  Recovering specific run: ${runId}`);
    
    const run = await db
      .select()
      .from(curationRuns)
      .where(eq(curationRuns.id, runId))
      .limit(1);
    
    if (run.length === 0) {
      return {
        success: false,
        message: `Run ${runId} not found`
      };
    }
    
    if (run[0].status !== 'running') {
      return {
        success: false,
        message: `Run ${runId} is not in "running" state (current: ${run[0].status})`
      };
    }
    
    await db
      .update(curationRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Manually cleared via auto-recovery system'
      })
      .where(eq(curationRuns.id, runId));
    
    console.log(`✅ [MANUAL RECOVERY] Run ${runId} cleared`);
    
    return {
      success: true,
      message: `Run ${runId} cleared successfully`,
      runId
    };
  } else {
    // Recover all stuck runs (same as automatic)
    return await checkAndRecoverStuckRuns();
  }
}

// ═══════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════

export async function getAutoRecoveryStatus() {
  try {
    // Calculate threshold dates (JavaScript Date objects for Drizzle compatibility)
    const stuckThreshold = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Count currently running runs
    const runningRuns = await db
      .select()
      .from(curationRuns)
      .where(eq(curationRuns.status, 'running'));
    
    // Count currently stuck runs (running for >2 hours)
    const stuckRuns = await db
      .select()
      .from(curationRuns)
      .where(
        and(
          eq(curationRuns.status, 'running'),
          lte(curationRuns.startedAt, stuckThreshold)
        )
      );
    
    // Get recent recoveries (failed runs with auto-recovery message in last 7 days)
    const recentRecoveries = await db
      .select()
      .from(curationRuns)
      .where(
        and(
          eq(curationRuns.status, 'failed'),
          like(curationRuns.errorMessage, '%Auto-recovery%'),
          gte(curationRuns.completedAt, sevenDaysAgo)
        )
      )
      .limit(10);
    
    return {
      enabled: true,
      stuckThresholdHours: STUCK_THRESHOLD_HOURS,
      currentRunning: runningRuns.length,
      currentStuck: stuckRuns.length,
      recentRecoveries: recentRecoveries.length,
      recentRecoveryDetails: recentRecoveries.map(r => ({
        id: r.id,
        clearedAt: r.completedAt,
        hoursStuck: r.errorMessage?.match(/stuck for (\d+) hours/)?.[1] || 'unknown'
      }))
    };
  } catch (error: any) {
    return {
      enabled: true,
      error: error.message
    };
  }
}
