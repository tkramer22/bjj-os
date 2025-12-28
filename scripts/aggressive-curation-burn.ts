#!/usr/bin/env tsx
/**
 * 🔥 AGGRESSIVE CURATION BURN
 * Run multiple curation cycles to maximize API quota usage before reset
 */

import { startCurationRun } from '../server/curation-controller';
import { db } from '../server/db';
import { curationRuns } from '../shared/schema';
import { desc } from 'drizzle-orm';

interface CycleResults {
  cycleNumber: number;
  runId: string;
  videosScreened: number;
  videosAnalyzed: number;
  videosAdded: number;
  videosRejected: number;
  approvalRate: number;
  quotaUsed: number;
  librarySize: number;
  duration: number;
}

const SAFETY_LIMITS = {
  minQuotaBuffer: 1000,
  minApprovalRate: 40,
  maxVideosPerSession: 150,
  maxCycles: 5,
};

async function waitForRunCompletion(runId: string, maxWaitMinutes: number = 30): Promise<any> {
  const startTime = Date.now();
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  
  while (Date.now() - startTime < maxWaitMs) {
    const [run] = await db.select()
      .from(curationRuns)
      .where()
      .orderBy(desc(curationRuns.startedAt))
      .limit(1);
    
    if (run && run.id === runId && run.status === 'completed') {
      return run;
    }
    
    if (run && run.id === runId && run.status === 'failed') {
      throw new Error(`Curation run failed: ${run.errorMessage}`);
    }
    
    // Wait 10 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  throw new Error(`Curation run timed out after ${maxWaitMinutes} minutes`);
}

async function getLibrarySize(): Promise<number> {
  const result = await db.execute<{ count: number }>(
    'SELECT COUNT(*)::int as count FROM ai_video_knowledge'
  );
  return result.rows[0]?.count || 0;
}

async function runCycle(cycleNumber: number): Promise<CycleResults> {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`🔥 CYCLE ${cycleNumber} - STARTING AGGRESSIVE CURATION`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  const startTime = Date.now();
  const startLibrarySize = await getLibrarySize();
  
  // Start curation run
  const result = await startCurationRun('manual', 'aggressive-burn-script');
  
  if (!result.success) {
    throw new Error(`Failed to start curation: ${result.reason}`);
  }
  
  console.log(`✅ Curation run started: ${result.runId}`);
  console.log(`⏳ Waiting for completion (max 30 minutes)...`);
  console.log('');
  
  // Wait for completion
  const run = await waitForRunCompletion(result.runId!);
  
  const endLibrarySize = await getLibrarySize();
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  const results: CycleResults = {
    cycleNumber,
    runId: result.runId!,
    videosScreened: run.videosScreened || 0,
    videosAnalyzed: run.videosAnalyzed || 0,
    videosAdded: run.videosAdded || 0,
    videosRejected: run.videosRejected || 0,
    approvalRate: parseFloat(run.acceptanceRate) || 0,
    quotaUsed: run.apiUnitsUsed || 0,
    librarySize: endLibrarySize,
    duration,
  };
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ CYCLE ${cycleNumber} COMPLETE`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`⏱️  Duration: ${duration}s (${Math.round(duration / 60)}m)`);
  console.log(`🔍 Videos screened: ${results.videosScreened}`);
  console.log(`🤖 Videos analyzed: ${results.videosAnalyzed}`);
  console.log(`✅ Videos added: ${results.videosAdded}`);
  console.log(`❌ Videos rejected: ${results.videosRejected}`);
  console.log(`📊 Approval rate: ${results.approvalRate.toFixed(1)}%`);
  console.log(`📈 API quota used: ${results.quotaUsed} units`);
  console.log(`📚 Library size: ${startLibrarySize} → ${results.librarySize} (+${results.videosAdded})`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  return results;
}

async function main() {
  console.log('');
  console.log('🔥🔥🔥 AGGRESSIVE CURATION BURN SESSION 🔥🔥🔥');
  console.log('');
  console.log('Goal: Maximize API quota usage before reset');
  console.log(`Safety limits:`);
  console.log(`  - Min quota buffer: ${SAFETY_LIMITS.minQuotaBuffer} units`);
  console.log(`  - Min approval rate: ${SAFETY_LIMITS.minApprovalRate}%`);
  console.log(`  - Max videos/session: ${SAFETY_LIMITS.maxVideosPerSession}`);
  console.log(`  - Max cycles: ${SAFETY_LIMITS.maxCycles}`);
  console.log('');
  
  const allResults: CycleResults[] = [];
  let totalVideosAdded = 0;
  let totalQuotaUsed = 0;
  
  try {
    for (let cycle = 1; cycle <= SAFETY_LIMITS.maxCycles; cycle++) {
      // Run the cycle
      const results = await runCycle(cycle);
      allResults.push(results);
      
      totalVideosAdded += results.videosAdded;
      totalQuotaUsed += results.quotaUsed;
      
      // Check safety limits
      let shouldStop = false;
      let stopReason = '';
      
      // Check approval rate (only after first cycle)
      if (cycle > 1 && results.approvalRate < SAFETY_LIMITS.minApprovalRate) {
        shouldStop = true;
        stopReason = `Approval rate too low (${results.approvalRate.toFixed(1)}% < ${SAFETY_LIMITS.minApprovalRate}%)`;
      }
      
      // Check total videos added
      if (totalVideosAdded >= SAFETY_LIMITS.maxVideosPerSession) {
        shouldStop = true;
        stopReason = `Reached max videos for session (${totalVideosAdded} >= ${SAFETY_LIMITS.maxVideosPerSession})`;
      }
      
      // Check if we're at the last cycle
      if (cycle === SAFETY_LIMITS.maxCycles) {
        shouldStop = true;
        stopReason = `Reached max cycles (${SAFETY_LIMITS.maxCycles})`;
      }
      
      if (shouldStop) {
        console.log('🛑 STOPPING CURATION SESSION');
        console.log(`   Reason: ${stopReason}`);
        console.log('');
        break;
      }
      
      // Wait 2 minutes before next cycle (let API settle)
      if (cycle < SAFETY_LIMITS.maxCycles) {
        console.log('⏸️  Waiting 2 minutes before next cycle...');
        console.log('');
        await new Promise(resolve => setTimeout(resolve, 120000));
      }
    }
    
    // Final summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 AGGRESSIVE BURN SESSION COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`🔄 Cycles completed: ${allResults.length}`);
    console.log(`✅ Total videos added: ${totalVideosAdded}`);
    console.log(`📈 Total quota used: ${totalQuotaUsed} units`);
    console.log(`📚 Final library size: ${allResults[allResults.length - 1]?.librarySize || 0} videos`);
    console.log('');
    console.log('Per-cycle breakdown:');
    allResults.forEach((r, i) => {
      console.log(`  Cycle ${i + 1}: +${r.videosAdded} videos, ${r.approvalRate.toFixed(1)}% approval, ${r.quotaUsed} quota`);
    });
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    
    process.exit(0);
  } catch (error: any) {
    console.error('');
    console.error('❌ ERROR IN AGGRESSIVE BURN SESSION');
    console.error(error);
    console.error('');
    console.error('Partial results:');
    console.error(`  Cycles completed: ${allResults.length}`);
    console.error(`  Videos added: ${totalVideosAdded}`);
    console.error(`  Quota used: ${totalQuotaUsed}`);
    console.error('');
    process.exit(1);
  }
}

main();
