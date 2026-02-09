import { db } from './db';
import { systemSettings, curationRuns, apiQuotaUsage } from '@shared/schema';
import { eq, sql, desc } from 'drizzle-orm';
import { logSystemError } from './activity-logger';

// Get system setting
export async function getSetting(key: string, defaultValue: any = null): Promise<any> {
  try {
    const result = await db.select({
      settingValue: systemSettings.settingValue
    })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, key))
      .limit(1);
    
    if (result.length === 0) {
      return defaultValue;
    }
    
    const value = result[0].settingValue;
    
    if (!value) return defaultValue;
    
    // Parse booleans
    if (value === 'true') return true;
    if (value === 'false') return false;
    
    // Parse numbers
    if (!isNaN(Number(value)) && value !== '') return Number(value);
    
    return value;
  } catch (error) {
    console.error('Error getting setting:', error);
    return defaultValue;
  }
}

// Update system setting
export async function updateSetting(key: string, value: any, updatedBy = 'system'): Promise<boolean> {
  try {
    await db.insert(systemSettings)
      .values({
        settingKey: key,
        settingValue: String(value),
        updatedBy
      })
      .onConflictDoUpdate({
        target: systemSettings.settingKey,
        set: {
          settingValue: String(value),
          updatedBy,
          updatedAt: sql`NOW()`
        }
      });
    
    console.log(`Setting updated: ${key} = ${value}`);
    return true;
  } catch (error) {
    console.error('Error updating setting:', error);
    return false;
  }
}

// Increment skip-reason counter for a curation run
export async function incrementSkipCounter(
  runId: string,
  skipReason: 'duration' | 'duplicates' | 'quota' | 'other'
): Promise<void> {
  try {
    // Use switch to set the correct Drizzle column property (camelCase)
    switch (skipReason) {
      case 'duration':
        await db.update(curationRuns)
          .set({ videosSkippedDuration: sql`${curationRuns.videosSkippedDuration} + 1` })
          .where(eq(curationRuns.id, runId));
        break;
      case 'duplicates':
        await db.update(curationRuns)
          .set({ videosSkippedDuplicates: sql`${curationRuns.videosSkippedDuplicates} + 1` })
          .where(eq(curationRuns.id, runId));
        break;
      case 'quota':
        await db.update(curationRuns)
          .set({ videosSkippedQuota: sql`${curationRuns.videosSkippedQuota} + 1` })
          .where(eq(curationRuns.id, runId));
        break;
      case 'other':
        await db.update(curationRuns)
          .set({ videosSkippedOther: sql`${curationRuns.videosSkippedOther} + 1` })
          .where(eq(curationRuns.id, runId));
        break;
    }
  } catch (error) {
    console.error(`Error incrementing skip counter (${skipReason}):`, error);
  }
}

// Get today's quota usage
export async function getQuotaUsage() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await db.select()
      .from(apiQuotaUsage)
      .where(eq(apiQuotaUsage.date, today))
      .limit(1);
    
    if (result.length === 0) {
      // Initialize today's tracking
      const quotaLimit = await getSetting('youtube_api_quota_limit', 10000);
      
      await db.insert(apiQuotaUsage)
        .values({
          date: today,
          youtubeQuotaLimit: quotaLimit,
          youtubeQuotaUsed: 0,
          openaiRequests: 0,
          openaiCostUsd: '0'
        })
        .onConflictDoNothing();
      
      return {
        youtubeQuotaUsed: 0,
        youtubeQuotaLimit: quotaLimit,
        openaiRequests: 0,
        openaiCostUsd: 0
      };
    }
    
    return {
      youtubeQuotaUsed: result[0].youtubeQuotaUsed || 0,
      youtubeQuotaLimit: result[0].youtubeQuotaLimit || 10000,
      openaiRequests: result[0].openaiRequests || 0,
      openaiCostUsd: Number(result[0].openaiCostUsd) || 0
    };
  } catch (error) {
    console.error('Error getting quota usage:', error);
    return {
      youtubeQuotaUsed: 0,
      youtubeQuotaLimit: 10000,
      openaiRequests: 0,
      openaiCostUsd: 0
    };
  }
}

// Update quota usage
export async function updateQuotaUsage(
  youtubeQuotaUsed = 0,
  openaiRequests = 0,
  openaiCost = 0
): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const quotaLimit = await getSetting('youtube_api_quota_limit', 10000);
    
    await db.insert(apiQuotaUsage)
      .values({
        date: today,
        youtubeQuotaUsed,
        youtubeQuotaLimit: quotaLimit,
        openaiRequests,
        openaiCostUsd: openaiCost.toFixed(2)
      })
      .onConflictDoUpdate({
        target: apiQuotaUsage.date,
        set: {
          youtubeQuotaUsed: sql`${apiQuotaUsage.youtubeQuotaUsed} + ${youtubeQuotaUsed}`,
          openaiRequests: sql`${apiQuotaUsage.openaiRequests} + ${openaiRequests}`,
          openaiCostUsd: sql`${apiQuotaUsage.openaiCostUsd} + ${openaiCost}`,
          updatedAt: sql`NOW()`
        }
      });
  } catch (error) {
    console.error('Error updating quota usage:', error);
  }
}

// Check if we can run curation (within quota limits)
export async function canRunCuration(): Promise<{
  canRun: boolean;
  reason?: string;
  quotaRemaining?: number;
  batchSize?: number;
}> {
  try {
    const enabled = await getSetting('auto_curation_enabled', false);
    
    if (!enabled) {
      return { canRun: false, reason: 'Auto-curation is disabled' };
    }
    
    // Check if we've reached the target video count (2,000 videos)
    const { aiVideoKnowledge } = await import('@shared/schema');
    const videoCountResult = await db.select({ count: sql<number>`count(*)` })
      .from(aiVideoKnowledge)
      .where(eq(aiVideoKnowledge.status, 'active'));
    const currentVideoCount = Number(videoCountResult[0].count);
    const targetVideoCount = await getSetting('target_video_count', 10000);
    
    if (currentVideoCount >= targetVideoCount) {
      console.log(`🎉 Target reached! ${currentVideoCount} videos (target: ${targetVideoCount})`);
      console.log('⏸️  Skipping curation - target met (will auto-resume if videos deleted)');
      
      // Don't disable auto_curation_enabled - just skip this run
      // This allows automatic resumption if video count drops below target
      return { 
        canRun: false, 
        reason: `Target of ${targetVideoCount} videos reached (current: ${currentVideoCount})` 
      };
    }
    
    const quota = await getQuotaUsage();
    const quotaLimit = quota.youtubeQuotaLimit;
    const quotaUsed = quota.youtubeQuotaUsed;
    const batchSize = await getSetting('curation_batch_size', 100);
    
    // AGGRESSIVE MODE: Keep only 5% buffer to max out quota (~9,500 units/day)
    const safeLimit = quotaLimit * 0.95;
    const quotaRemaining = safeLimit - quotaUsed;
    
    if (quotaRemaining < batchSize) {
      console.log(`⚠️ Daily quota limit reached: ${quotaUsed}/${quotaLimit} units used (${Math.round(quotaUsed/quotaLimit*100)}%)`);
      console.log('⏰ Quota resets at midnight PT - will resume automatically');
      return { 
        canRun: false, 
        reason: `Quota limit reached (${quotaUsed}/${quotaLimit} used - ${Math.round(quotaUsed/quotaLimit*100)}%)` 
      };
    }
    
    // Check if another curation is already running
    const runningRuns = await db.select()
      .from(curationRuns)
      .where(eq(curationRuns.status, 'running'))
      .limit(1);
    
    if (runningRuns.length > 0) {
      // FAILSAFE: Check if run has been stuck for more than 20 minutes
      // 20 minutes allows reasonable processing time while catching stuck runs
      const runStartTime = new Date(runningRuns[0].startedAt!);
      const minutesSinceStart = (Date.now() - runStartTime.getTime()) / (1000 * 60);
      
      if (minutesSinceStart > 20) {
        console.log(`🚨 DEADLOCK DETECTED: Run ${runningRuns[0].id} stuck for ${minutesSinceStart.toFixed(1)} minutes`);
        console.log('🔧 Auto-clearing stuck run to prevent deadlock...');
        
        // Auto-clear the stuck run
        await db.update(curationRuns)
          .set({
            status: 'failed',
            completedAt: sql`NOW()`,
            errorMessage: `Auto-cleared: stuck in running state for ${minutesSinceStart.toFixed(1)} minutes`
          })
          .where(eq(curationRuns.id, runningRuns[0].id));
        
        console.log('✅ Stuck run cleared - proceeding with new curation run');
      } else {
        return { 
          canRun: false, 
          reason: 'Another curation run is already in progress' 
        };
      }
    }
    
    console.log(`📊 Curation progress: ${currentVideoCount} / ${targetVideoCount} videos`);
    
    return { 
      canRun: true, 
      quotaRemaining: Math.floor(quotaRemaining),
      batchSize 
    };
    
  } catch (error) {
    console.error('Error checking curation status:', error);
    return { canRun: false, reason: 'Error checking status' };
  }
}

// Start a curation run
export async function startCurationRun(runType: 'auto' | 'manual' = 'auto', triggeredBy = 'system'): Promise<{
  success: boolean;
  runId?: string;
  reason?: string;
  message?: string;
}> {
  try {
    const check = await canRunCuration();
    
    if (!check.canRun) {
      console.log('Cannot run curation:', check.reason);
      return { success: false, reason: check.reason };
    }
    
    // Create run record using the existing curationRuns table schema
    const runResult = await db.insert(curationRuns)
      .values({
        runType: runType === 'manual' ? 'manual' : 'scheduled',
        status: 'running',
        searchCategory: triggeredBy.includes('cron') ? 'Auto-Curation' : 'Manual Run',
        videosAnalyzed: 0,
        videosAdded: 0,
        videosRejected: 0,
        searchesCompleted: 0,
        searchesFailed: 0,
        startedAt: sql`NOW()` // CRITICAL: Set started_at for missed run detection
      })
      .returning({ id: curationRuns.id });
    
    const runId = runResult[0].id;
    
    console.log(`✅ Curation run started: ID ${runId}, type: ${runType}, triggered by: ${triggeredBy}`);
    
    // Run the actual curation pipeline asynchronously
    // Note: The 15-minute failsafe in canRunCuration() will auto-clear stuck runs
    // The pipeline's try/catch/finally ensures completeCurationRun is always called
    executeCurationPipeline(runId, check.batchSize || 500, triggeredBy).catch(error => {
      // Error is logged inside executeCurationPipeline and handled by finally block
      console.error(`[CURATION] Pipeline error for run ${runId}:`, error.message);
    });
    
    return { 
      success: true, 
      runId,
      message: 'Curation run started'
    };
    
  } catch (error: any) {
    console.error('Error starting curation run:', error);
    await logSystemError('curation_start_failed', error.message, { runType }, 'medium');
    return { success: false, reason: 'Failed to start curation' };
  }
}

// Execute the actual curation pipeline
export async function executeCurationPipeline(runId: string, batchSize: number, triggeredBy: string): Promise<void> {
  const startTime = Date.now();
  let videosAnalyzed = 0;
  let videosAdded = 0;
  let quotaUsedEstimate = 0;
  let errorMessage: string | null = null;
  
  const { logProgress, completeProgress, failProgress } = await import('./curation-progress');
  
  try {
    console.log(`[CURATION PIPELINE] ✅ STEP 1/6: Starting pipeline for run ${runId}, batch size: ${batchSize}`);
    logProgress(runId, 'Starting curation pipeline...', '🚀', `Batch size: ${batchSize}`);
    
    // Import curation modules
    console.log(`[CURATION PIPELINE] ⏳ STEP 2/6: Importing meta-analyzer module...`);
    const { metaAnalyzer } = await import('./meta-analyzer');
    console.log(`[CURATION PIPELINE] ✅ STEP 2/6: metaAnalyzer imported successfully`);
    
    console.log(`[CURATION PIPELINE] ⏳ STEP 3/6: Importing auto-curator module...`);
    const { curateVideosFromPriorities } = await import('./auto-curator');
    console.log(`[CURATION PIPELINE] ✅ STEP 3/6: curateVideosFromPriorities imported successfully`);
    
    // Get top priority techniques needing curation
    // Limit based on batch size - roughly 10 videos per technique
    const techniqueLimit = Math.ceil(batchSize / 10);
    console.log(`[CURATION PIPELINE] ⏳ STEP 4/6: Fetching top ${techniqueLimit} curation priorities from metaAnalyzer...`);
    logProgress(runId, 'Finding techniques that need curation...', '🔍', `Checking ${techniqueLimit} priorities`);
    const priorities = await metaAnalyzer.getTopCurationPriorities(techniqueLimit);
    console.log(`[CURATION PIPELINE] ✅ STEP 4/6: Received ${priorities.length} priorities from metaAnalyzer`);
    
    if (priorities.length === 0) {
      console.log(`[CURATION PIPELINE] ⚠️  No techniques need curation - completing run`);
      completeProgress(runId, { analyzed: 0, approved: 0, rejected: 0, quotaUsed: 0 });
      await completeCurationRun(runId, 0, 0, 0, null);
      return;
    }
    
    const priorityNames = priorities.slice(0, 5).map(p => p.techniqueName).join(', ');
    logProgress(runId, `Found ${priorities.length} techniques to curate`, '📋', priorityNames + (priorities.length > 5 ? '...' : ''));
    console.log(`[CURATION PIPELINE] 📋 Priorities: ${priorities.map(p => `${p.techniqueName} (priority: ${p.curationPriority})`).join(', ')}`);
    
    // Execute curation - PERMANENT AGGRESSIVE MODE (500 videos per run)
    // curateVideosFromPriorities now returns REAL metrics (10 searches × 100 units = 1,000 units)
    console.log(`[CURATION PIPELINE] ⏳ STEP 5/6: Calling curateVideosFromPriorities with ${priorities.length} techniques...`);
    logProgress(runId, 'Starting video search and analysis...', '🎬', `Processing ${priorities.length} techniques`);
    const curationResult = await curateVideosFromPriorities(priorities, runId);
    console.log(`[CURATION PIPELINE] ✅ STEP 5/6: curateVideosFromPriorities completed successfully`);
    
    // Use REAL metrics instead of estimates
    videosAnalyzed = curationResult.videosScreened;
    videosAdded = curationResult.videosAdded;
    quotaUsedEstimate = curationResult.quotaUsed; // This is ACTUAL quota, not estimate
    
    console.log(`[CURATION PIPELINE] ✅ STEP 6/6: Processing results and completing run`);
    console.log(`[CURATION PIPELINE] 🎉 COMPLETED SUCCESSFULLY:`);
    console.log(`  • Searches: ${curationResult.searchesPerformed}/10 (permanent aggressive mode)`);
    console.log(`  • Videos screened: ${videosAnalyzed}`);
    console.log(`  • Videos added: ${videosAdded}`);
    console.log(`  • Quota used: ${quotaUsedEstimate} units (ACTUAL, not estimated)`);
    
    // Mark progress as complete
    completeProgress(runId, {
      analyzed: videosAnalyzed,
      approved: videosAdded,
      rejected: videosAnalyzed - videosAdded,
      quotaUsed: quotaUsedEstimate
    });
    
  } catch (error: any) {
    errorMessage = error.message || 'Unknown error during curation';
    console.error(`[CURATION PIPELINE] ❌ ERROR CAUGHT:`, errorMessage);
    console.error(`[CURATION PIPELINE] ❌ Error stack:`, error.stack);
    console.error(`[CURATION PIPELINE] ❌ Full error object:`, JSON.stringify(error, null, 2));
    await logSystemError('curation_pipeline_failed', errorMessage, { runId, triggeredBy }, 'high');
    failProgress(runId, errorMessage);
  } finally {
    // Complete the run with results
    await completeCurationRun(runId, videosAnalyzed, videosAdded, quotaUsedEstimate, errorMessage);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`[CURATION PIPELINE] Run ${runId} finished in ${duration}s`);
  }
}

// Calculate guardrail status based on acceptance rate
function calculateGuardrailStatus(acceptanceRate: number, videosAnalyzed: number): string {
  // Handle runs with no videos analyzed (early exit, no priorities, quota disabled)
  if (videosAnalyzed === 0) return 'no-data'; // Neutral status - no evaluation occurred
  
  if (acceptanceRate === 0) return 'critical'; // Videos analyzed but none accepted
  if (acceptanceRate < 3) return 'critical'; // Extremely low
  if (acceptanceRate < 5) return 'low'; // Below target band
  if (acceptanceRate <= 15) return 'ok'; // Within target band (5-15%)
  if (acceptanceRate <= 25) return 'high'; // Above target but acceptable
  return 'critical'; // Dangerously high (likely accepting low quality)
}

// Complete a curation run
export async function completeCurationRun(
  runId: string,
  videosDiscovered: number,
  videosApproved: number,
  quotaUsed: number,
  errorMessage: string | null = null
): Promise<void> {
  try {
    const status = errorMessage ? 'failed' : 'completed';
    const acceptanceRate = videosDiscovered > 0 
      ? (videosApproved / videosDiscovered * 100) 
      : 0;
    
    // Calculate guardrail status
    const guardrailStatus = calculateGuardrailStatus(acceptanceRate, videosDiscovered);
    
    await db.update(curationRuns)
      .set({
        status,
        completedAt: sql`NOW()`,
        videosAnalyzed: videosDiscovered,
        videosAdded: videosApproved,
        videosRejected: videosDiscovered - videosApproved,
        acceptanceRate: acceptanceRate.toString(),
        guardrailStatus,
        youtubeApiCalls: quotaUsed,
        errorMessage: errorMessage || undefined
      })
      .where(eq(curationRuns.id, runId));
    
    // Update quota usage
    await updateQuotaUsage(quotaUsed, videosDiscovered, videosApproved * 0.02);
    
    // Log guardrail alerts (skip no-data runs)
    if (guardrailStatus !== 'ok' && guardrailStatus !== 'no-data') {
      const emoji = guardrailStatus === 'critical' ? '🚨' : '⚠️';
      console.log(`${emoji} GUARDRAIL ALERT: Acceptance rate ${acceptanceRate.toFixed(1)}% is ${guardrailStatus.toUpperCase()} (target: 5-15%)`);
      
      // Log to system errors for high-severity issues (not no-data)
      if (guardrailStatus === 'critical') {
        await logSystemError(
          'curation_acceptance_critical',
          `Acceptance rate critically ${acceptanceRate < 5 ? 'low' : 'high'}: ${acceptanceRate.toFixed(1)}% (target: 5-15%)`,
          { runId, acceptanceRate, videosApproved, videosDiscovered },
          'high'
        );
      }
    }
    
    // Check for rolling trend: 3 consecutive out-of-band runs
    const recentRuns = await db.select({
      id: curationRuns.id,
      guardrailStatus: curationRuns.guardrailStatus,
      acceptanceRate: curationRuns.acceptanceRate,
      completedAt: curationRuns.completedAt
    })
      .from(curationRuns)
      .where(eq(curationRuns.status, 'completed'))
      .orderBy(desc(curationRuns.completedAt))
      .limit(3);
    
    // Check if we have 3 runs and all are out of band (not 'ok' or 'no-data')
    if (recentRuns.length >= 3) {
      const allOutOfBand = recentRuns.every(run => 
        run.guardrailStatus !== 'ok' && run.guardrailStatus !== 'no-data'
      );
      
      if (allOutOfBand) {
        const trendStatuses = recentRuns.map(r => r.guardrailStatus).join(', ');
        const trendRates = recentRuns.map(r => `${Number(r.acceptanceRate).toFixed(1)}%`).join(', ');
        
        console.log(`🚨🚨🚨 TREND ALERT: 3 consecutive out-of-band runs detected!`);
        console.log(`   Statuses: ${trendStatuses}`);
        console.log(`   Rates: ${trendRates}`);
        
        // Escalate with critical severity
        await logSystemError(
          'curation_acceptance_trend',
          `Sustained acceptance rate issue: 3 consecutive out-of-band runs (${trendStatuses}). Rates: ${trendRates}. Target: 5-15%`,
          { 
            runIds: recentRuns.map(r => r.id),
            statuses: trendStatuses,
            rates: trendRates
          },
          'critical' // Escalate to critical for trends
        );
      }
    }
    
    console.log(`✅ Curation run completed: ID ${runId}, discovered: ${videosDiscovered}, approved: ${videosApproved}, quota: ${quotaUsed} units, acceptance: ${acceptanceRate.toFixed(1)}% (${guardrailStatus})`);
    
  } catch (error) {
    console.error('Error completing curation run:', error);
  }
}

// Get curation statistics
export async function getCurationStats() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Today's runs (using existing curationRuns schema fields)
    const todayRunsResult = await db.execute(sql`
      SELECT 
        COUNT(*) as total_runs,
        COALESCE(SUM(videos_analyzed), 0) as videos_discovered,
        COALESCE(SUM(videos_added), 0) as videos_approved
      FROM curation_runs
      WHERE DATE(run_date) = ${today}
    `);
    
    // postgres-js returns rows directly as array, not { rows: [...] }
    const todayRunsRows = Array.isArray(todayRunsResult) ? todayRunsResult : (todayRunsResult.rows || []);
    const todayRuns = todayRunsRows[0] as any;
    
    // Last run
    const lastRunResult = await db.select()
      .from(curationRuns)
      .orderBy(desc(curationRuns.runDate))
      .limit(1);
    
    // Current quota
    const quota = await getQuotaUsage();
    
    // Settings
    const enabled = await getSetting('auto_curation_enabled', false);
    const batchSize = await getSetting('curation_batch_size', 100);
    const runsPerDay = await getSetting('runs_per_day', 3);
    const quotaLimit = quota.youtubeQuotaLimit;
    
    // Calculate capacity
    const quotaRemaining = quotaLimit - quota.youtubeQuotaUsed;
    const estimatedCapacity = Math.floor((quotaLimit * 0.9) / 100) * 10; // Rough estimate
    
    return {
      enabled,
      today: {
        runs: parseInt(String(todayRuns.total_runs)) || 0,
        videosDiscovered: parseInt(String(todayRuns.videos_discovered)) || 0,
        videosApproved: parseInt(String(todayRuns.videos_approved)) || 0,
        quotaUsed: quota.youtubeQuotaUsed // Use today's total quota usage
      },
      quota: {
        used: quota.youtubeQuotaUsed,
        limit: quotaLimit,
        remaining: quotaRemaining,
        percentUsed: ((quota.youtubeQuotaUsed / quotaLimit) * 100).toFixed(1)
      },
      capacity: {
        estimatedDaily: estimatedCapacity,
        batchSize,
        runsPerDay
      },
      lastRun: lastRunResult.length > 0 ? lastRunResult[0] : null
    };
    
  } catch (error) {
    console.error('Error getting curation stats:', error);
    return null;
  }
}

// Check for missed runs and trigger them if necessary
// NOTE: In PERMANENT AGGRESSIVE MODE (9x daily, 500 videos/run), missed run detection
// monitors whether curation is staying on schedule for 2,000 video target
export async function checkForMissedRuns(): Promise<void> {
  try {
    console.log('[MISSED RUN CHECK] Permanent Aggressive Mode: 9 runs daily (500 videos/run)');
    
    const enabled = await getSetting('auto_curation_enabled', false);
    if (!enabled) {
      console.log('[MISSED RUN CHECK] Auto-curation disabled, skipping check');
      return;
    }
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Count today's runs (should be up to 9 in permanent aggressive mode)
    const todayRunsResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM curation_runs
      WHERE DATE(run_date) = ${today}
    `);
    
    // postgres-js returns rows directly as array, not { rows: [...] }
    const runCountRows = Array.isArray(todayRunsResult) ? todayRunsResult : (todayRunsResult.rows || []);
    const todayRunCount = parseInt(String((runCountRows[0] as any)?.count || '0'));
    console.log(`[MISSED RUN CHECK] ✅ ${todayRunCount} curation runs completed today (max 9 in permanent aggressive mode)`);
    
    // In aggressive mode, if no runs today and server just started, trigger one immediately
    if (todayRunCount === 0) {
      console.log('⚠️  NO RUNS TODAY! Triggering immediate curation run...');
      const result = await startCurationRun('auto', 'missed_run_recovery_aggressive');
      if (result.success) {
        console.log(`✅ Recovery run started: ${result.runId}`);
      } else {
        console.log(`⏸️  Recovery run skipped: ${result.reason}`);
      }
    }
    
    console.log('[MISSED RUN CHECK] Check complete');
    
  } catch (error: any) {
    console.error('[MISSED RUN CHECK] Error:', error.message || error);
  }
}

export async function resumeStuckRuns(): Promise<void> {
  try {
    console.log('[STARTUP RECOVERY] Checking for stuck curation runs...');
    
    const stuckRuns = await db.select()
      .from(curationRuns)
      .where(eq(curationRuns.status, 'running'));
    
    if (stuckRuns.length === 0) {
      console.log('[STARTUP RECOVERY] No stuck runs found ✓');
      return;
    }
    
    console.log(`[STARTUP RECOVERY] Found ${stuckRuns.length} stuck run(s), resuming...`);
    
    for (const run of stuckRuns) {
      const runAge = Date.now() - new Date(run.startedAt).getTime();
      const ageMinutes = Math.floor(runAge / 1000 / 60);
      
      console.log(`[STARTUP RECOVERY] Resuming run ${run.id} (stuck for ${ageMinutes} minutes)`);
      
      const check = await canRunCuration();
      if (!check.canRun && !check.reason?.includes('already in progress')) {
        console.log(`[STARTUP RECOVERY] Cannot resume ${run.id}: ${check.reason}`);
        await db.update(curationRuns)
          .set({
            status: 'failed',
            errorMessage: `Stuck run cancelled on startup: ${check.reason}`,
            completedAt: new Date()
          })
          .where(eq(curationRuns.id, run.id));
        continue;
      }
      
      const batchSize = check.canRun ? (check.batchSize || 500) : 500;
      const triggeredBy = 'startup-recovery';
      
      console.log(`[STARTUP RECOVERY] Starting pipeline for run ${run.id}...`);
      
      executeCurationPipeline(run.id, batchSize, triggeredBy).catch(error => {
        console.error(`[STARTUP RECOVERY] Pipeline error for run ${run.id}:`, error.message);
      });
      
      console.log(`[STARTUP RECOVERY] ✅ Run ${run.id} resumed successfully`);
    }
    
  } catch (error: any) {
    console.error('[STARTUP RECOVERY] Error:', error.message || error);
  }
}
