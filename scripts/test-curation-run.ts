#!/usr/bin/env tsx
/**
 * Test curation run to verify the system is working
 */

import { startCurationRun } from '../server/curation-controller';
import { db } from '../server/db';
import { curationRuns } from '../shared/schema';
import { desc } from 'drizzle-orm';

async function main() {
  console.log('🧪 Testing curation system...');
  console.log('');
  
  try {
    // Start a manual curation run
    console.log('🚀 Starting test curation run...');
    const result = await startCurationRun('manual', 'test-script');
    
    if (!result.success) {
      console.log('❌ Curation run failed to start:', result.reason);
      process.exit(1);
    }
    
    console.log('✅ Curation run started successfully!');
    console.log('   Run ID:', result.runId);
    console.log('');
    console.log('⏳ Waiting 30 seconds for curation to process...');
    
    // Wait for curation to process
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Check the results
    console.log('📊 Checking results...');
    const runs = await db.select()
      .from(curationRuns)
      .where()
      .orderBy(desc(curationRuns.startedAt))
      .limit(1);
    
    if (runs.length > 0) {
      const run = runs[0];
      console.log('');
      console.log('═══════════════════════════════════════');
      console.log('CURATION RUN RESULTS');
      console.log('═══════════════════════════════════════');
      console.log('Status:', run.status);
      console.log('Videos Screened:', run.videosScreened || 0);
      console.log('Videos Analyzed:', run.videosAnalyzed || 0);
      console.log('Videos Added:', run.videosAdded || 0);
      console.log('Videos Rejected:', run.videosRejected || 0);
      console.log('Acceptance Rate:', run.acceptanceRate || 0, '%');
      console.log('YouTube API Calls:', run.youtubeApiCalls || 0);
      console.log('Quota Used:', run.apiUnitsUsed || 0);
      console.log('Error:', run.errorMessage || 'None');
      console.log('═══════════════════════════════════════');
      console.log('');
      
      if ((run.videosScreened || 0) > 0) {
        console.log('✅ SUCCESS! Curation system is working!');
        console.log('   YouTube searches executed and videos were screened.');
      } else {
        console.log('⚠️  Warning: No videos were screened.');
        console.log('   Check if there are techniques with suggested searches.');
      }
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
