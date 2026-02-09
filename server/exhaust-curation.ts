#!/usr/bin/env npx tsx

/**
 * EXHAUST CURATION SCRIPT
 * 
 * Runs curation continuously until:
 * - YouTube API quota is exhausted
 * - Max runs limit is reached
 * - Manual stop signal received
 * - Too many consecutive failures
 * 
 * Usage: npx tsx server/exhaust-curation.ts [options]
 * 
 * Options:
 *   --max-runs=N       Maximum curation runs (default: 50)
 *   --delay=N          Seconds between runs (default: 60)
 *   --stop-on-empty=N  Stop after N runs with 0 new videos (default: 3)
 *   --techniques=N     Techniques per run (default: 30)
 *   --videos=N         Videos per technique (default: 10)
 */

import { runContentFirstCuration } from './content-first-curator';
import { db, pool } from './db';
import { curationRuns, aiVideoKnowledge } from '@shared/schema';
import { randomUUID } from 'crypto';
import { eq, sql, gt, and } from 'drizzle-orm';
import { sendCurationReportEmail } from './curation-report.js';

// Parse command line arguments
function getArg(name: string, defaultValue: number): number {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  return arg ? parseInt(arg.split('=')[1]) : defaultValue;
}

// Configuration
const CONFIG = {
  maxRuns: getArg('max-runs', 50),
  delayBetweenRuns: getArg('delay', 60),
  stopOnEmptyRuns: getArg('stop-on-empty', 3),
  techniquesPerRun: getArg('techniques', 30),
  videosPerTechnique: getArg('videos', 10),
  notifyEmail: process.env.ADMIN_EMAIL || 'todd@bjjos.app'
};

// Stats tracking
const stats = {
  startTime: new Date(),
  totalRuns: 0,
  successfulRuns: 0,
  failedRuns: 0,
  totalVideosAdded: 0,
  totalVideosAnalyzed: 0,
  consecutiveEmptyRuns: 0,
  errors: [] as string[],
  runHistory: [] as Array<{
    run: number;
    videosAdded: number;
    videosAnalyzed: number;
    duration: number;
    newVideos: Array<{ title: string; instructor: string; score: number }>;
  }>
};

// Logging helper
function log(message: string, level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'START' | 'STOP' = 'INFO') {
  const timestamp = new Date().toISOString();
  const prefix: Record<string, string> = {
    'INFO': '📊',
    'SUCCESS': '✅',
    'WARNING': '⚠️',
    'ERROR': '❌',
    'START': '🚀',
    'STOP': '🛑'
  };
  
  console.log(`[${timestamp}] ${prefix[level] || '•'} ${message}`);
}

// Sleep helper
function sleep(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

// Get video count
async function getVideoCount(): Promise<number> {
  const result = await db.select({ count: sql`count(*)` }).from(aiVideoKnowledge).where(eq(aiVideoKnowledge.status, 'active'));
  return Number(result[0].count);
}

// Get newly added videos
async function getNewVideos(since: Date) {
  const result = await db.select({
    title: aiVideoKnowledge.title,
    instructor_name: aiVideoKnowledge.instructorName,
    quality_score: aiVideoKnowledge.qualityScore
  })
  .from(aiVideoKnowledge)
  .where(and(gt(aiVideoKnowledge.createdAt!, since), eq(aiVideoKnowledge.status, 'active')))
  .orderBy(sql`${aiVideoKnowledge.createdAt} DESC`);
  
  return result;
}

// Run single curation
async function runCuration(): Promise<{
  success: boolean;
  videosAnalyzed: number;
  videosAdded: number;
  duration: number;
  newVideos: Array<{ title: string; instructor: string; score: number }>;
  error?: string;
}> {
  const runId = randomUUID();
  const startTime = Date.now();
  const videosBefore = await getVideoCount();
  const runStartTime = new Date();
  
  log(`Starting run ${runId.substring(0, 8)}...`);
  
  // Create run record
  await db.insert(curationRuns).values({
    id: runId,
    status: 'running',
    runType: 'manual',
    startedAt: new Date(),
    videosAnalyzed: 0,
    videosAdded: 0,
    videosRejected: 0
  });
  
  try {
    const result = await runContentFirstCuration(
      CONFIG.techniquesPerRun,
      CONFIG.videosPerTechnique,
      (update) => {
        // Progress callback - could log here if needed
      }
    );
    
    const videosAfter = await getVideoCount();
    const duration = Math.round((Date.now() - startTime) / 1000);
    const videosAdded = videosAfter - videosBefore;
    
    // Get the newly added videos
    const newVideosRaw = await getNewVideos(runStartTime);
    const newVideos = newVideosRaw.map(v => ({
      title: v.title,
      instructor: v.instructor_name || 'Unknown',
      score: Number(v.quality_score) || 0
    }));
    
    // Update run record
    await db.update(curationRuns)
      .set({
        status: 'completed',
        completedAt: new Date(),
        videosAnalyzed: result.videosAnalyzed,
        videosAdded: videosAdded,
        videosRejected: result.videosAnalyzed - videosAdded
      })
      .where(eq(curationRuns.id, runId));
    
    return {
      success: true,
      videosAnalyzed: result.videosAnalyzed,
      videosAdded,
      duration,
      newVideos
    };
    
  } catch (error: any) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    await db.update(curationRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error.message
      })
      .where(eq(curationRuns.id, runId));
    
    return {
      success: false,
      videosAnalyzed: 0,
      videosAdded: 0,
      duration,
      newVideos: [],
      error: error.message
    };
  }
}

// Check if we should stop
function shouldStop(result: { error?: string }): { stop: boolean; reason: string } | null {
  // Check for quota exhaustion
  if (result.error && (result.error.includes('quota') || result.error.includes('403'))) {
    log('YouTube API quota exhausted!', 'STOP');
    return { stop: true, reason: 'QUOTA_EXHAUSTED' };
  }
  
  // Check for rate limiting
  if (result.error && result.error.includes('rate limit')) {
    log('Rate limited by API', 'STOP');
    return { stop: true, reason: 'RATE_LIMITED' };
  }
  
  // Check for too many consecutive empty runs
  if (stats.consecutiveEmptyRuns >= CONFIG.stopOnEmptyRuns) {
    log(`${CONFIG.stopOnEmptyRuns} consecutive runs with 0 new videos`, 'STOP');
    return { stop: true, reason: 'NO_NEW_CONTENT' };
  }
  
  // Check for max runs
  if (stats.totalRuns >= CONFIG.maxRuns) {
    log(`Reached max runs limit (${CONFIG.maxRuns})`, 'STOP');
    return { stop: true, reason: 'MAX_RUNS_REACHED' };
  }
  
  // Check for too many failures
  if (stats.failedRuns >= 5) {
    log('Too many failed runs', 'STOP');
    return { stop: true, reason: 'TOO_MANY_FAILURES' };
  }
  
  return null;
}

// Generate summary report
function generateSummary(reason: string): string {
  const durationMinutes = Math.round((Date.now() - stats.startTime.getTime()) / 1000 / 60);
  const avgPerRun = stats.successfulRuns > 0 
    ? (stats.totalVideosAdded / stats.successfulRuns).toFixed(1) 
    : '0';
  
  const runHistory = stats.runHistory
    .map((r, i) => `  Run ${i + 1}: +${r.videosAdded} videos (${r.duration}s)`)
    .join('\n');
  
  const errors = stats.errors.length > 0 
    ? `\nERRORS:\n${stats.errors.join('\n')}` 
    : '';
  
  return `
════════════════════════════════════════════════════════════════
🛑 EXHAUST CURATION COMPLETE
════════════════════════════════════════════════════════════════

Stop Reason: ${reason}
Duration: ${durationMinutes} minutes
Total Runs: ${stats.totalRuns}
Successful: ${stats.successfulRuns}
Failed: ${stats.failedRuns}

RESULTS:
────────────────────────────────────────────────────────────────
Videos Analyzed: ${stats.totalVideosAnalyzed}
Videos Added: ${stats.totalVideosAdded}
Avg per Run: ${avgPerRun}
────────────────────────────────────────────────────────────────

RUN HISTORY:
${runHistory}
${errors}
════════════════════════════════════════════════════════════════
  `.trim();
}

// Main execution loop
async function main() {
  console.log('');
  log('═'.repeat(60), 'START');
  log('EXHAUST CURATION STARTED', 'START');
  log(`Max runs: ${CONFIG.maxRuns}`, 'INFO');
  log(`Delay between runs: ${CONFIG.delayBetweenRuns}s`, 'INFO');
  log(`Stop after empty runs: ${CONFIG.stopOnEmptyRuns}`, 'INFO');
  log(`Techniques per run: ${CONFIG.techniquesPerRun}`, 'INFO');
  log(`Videos per technique: ${CONFIG.videosPerTechnique}`, 'INFO');
  log('═'.repeat(60), 'START');
  console.log('');
  
  const libraryBefore = await getVideoCount();
  log(`Library starting count: ${libraryBefore} videos`, 'INFO');
  console.log('');
  
  let stopReason: string | null = null;
  
  while (!stopReason) {
    stats.totalRuns++;
    log(`\n--- RUN ${stats.totalRuns}/${CONFIG.maxRuns} ---`, 'INFO');
    
    try {
      const result = await runCuration();
      
      if (result.success) {
        stats.successfulRuns++;
        stats.totalVideosAnalyzed += result.videosAnalyzed;
        stats.totalVideosAdded += result.videosAdded;
        
        stats.runHistory.push({
          run: stats.totalRuns,
          videosAdded: result.videosAdded,
          videosAnalyzed: result.videosAnalyzed,
          duration: result.duration,
          newVideos: result.newVideos
        });
        
        if (result.videosAdded === 0) {
          stats.consecutiveEmptyRuns++;
          log(`No new videos found (${stats.consecutiveEmptyRuns} consecutive)`, 'WARNING');
        } else {
          stats.consecutiveEmptyRuns = 0;
          log(`Added ${result.videosAdded} videos in ${result.duration}s!`, 'SUCCESS');
          
          // Show top videos added
          result.newVideos.slice(0, 3).forEach(v => {
            log(`  • ${v.title.substring(0, 50)}... (${v.instructor}, ${v.score.toFixed(1)})`, 'INFO');
          });
        }
        
        // Send email report for this run
        try {
          await sendCurationReportEmail({
            videosBefore: libraryBefore + stats.totalVideosAdded - result.videosAdded,
            videosAfter: libraryBefore + stats.totalVideosAdded,
            videosAnalyzed: result.videosAnalyzed,
            videosAdded: result.videosAdded,
            duration: result.duration,
            newVideos: result.newVideos,
            runNumber: stats.totalRuns,
            isExhaustMode: true
          });
        } catch (emailError) {
          log(`Failed to send email: ${emailError}`, 'WARNING');
        }
        
      } else {
        stats.failedRuns++;
        stats.errors.push(`Run ${stats.totalRuns}: ${result.error}`);
        log(`Run failed: ${result.error}`, 'ERROR');
      }
      
      // Check if we should stop
      const stopCheck = shouldStop(result);
      if (stopCheck) {
        stopReason = stopCheck.reason;
        break;
      }
      
      // Wait before next run
      log(`Waiting ${CONFIG.delayBetweenRuns}s before next run...`, 'INFO');
      await sleep(CONFIG.delayBetweenRuns);
      
    } catch (error: any) {
      stats.failedRuns++;
      stats.errors.push(`Run ${stats.totalRuns}: ${error.message}`);
      log(`Run error: ${error.message}`, 'ERROR');
      
      // Check if quota error
      if (error.message.includes('quota') || error.message.includes('403')) {
        stopReason = 'QUOTA_EXHAUSTED';
        break;
      }
      
      // Wait longer after error
      await sleep(CONFIG.delayBetweenRuns * 2);
    }
  }
  
  // Generate and display summary
  const summary = generateSummary(stopReason || 'UNKNOWN');
  console.log('\n' + summary);
  
  // Final library count
  const libraryAfter = await getVideoCount();
  console.log(`\n📚 Final library count: ${libraryAfter} videos (+${libraryAfter - libraryBefore} total)`);
  
  // Close database pool
  await pool.end();
  
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  log('\nReceived SIGINT, finishing up...', 'STOP');
  const summary = generateSummary('MANUAL_STOP');
  console.log('\n' + summary);
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('\nReceived SIGTERM, finishing up...', 'STOP');
  const summary = generateSummary('MANUAL_STOP');
  console.log('\n' + summary);
  await pool.end();
  process.exit(0);
});

// Run
main().catch(async error => {
  log(`Fatal error: ${error.message}`, 'ERROR');
  await pool.end();
  process.exit(1);
});
