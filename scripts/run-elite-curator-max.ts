#!/usr/bin/env tsx
/**
 * STANDALONE MAX AGGRESSIVE CURATION RUNNER
 * 
 * This script runs in a completely separate process from the Express server.
 * Use nohup to run in background: 
 *   nohup npx tsx scripts/run-elite-curator-max.ts > logs/manual-curation.log 2>&1 &
 */

import { startCurationRun } from '../server/curation-controller';

async function runMaxCuration() {
  const startTime = Date.now();
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🚀 ELITE CURATOR - MAX AGGRESSIVE MODE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Started: ${new Date().toLocaleString()}`);
  console.log('Target: 500 videos (10 searches × 50 results)');
  console.log('Process: Standalone (won\'t be killed by server restarts)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const result = await startCurationRun('manual', 'elite-curator-max-standalone');
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    if (result.success) {
      console.log('✅ CURATION COMPLETED SUCCESSFULLY');
      console.log(`   Run ID: ${result.runId}`);
      console.log(`   Duration: ${duration} minutes`);
      console.log('   Type: Manual Max Aggressive');
      console.log('\n📊 Check results:');
      console.log(`   SELECT * FROM curation_runs WHERE id = '${result.runId}';`);
    } else {
      console.log('⏸️  CURATION SKIPPED');
      console.log(`   Reason: ${result.reason}`);
      console.log(`   Duration: ${duration} minutes`);
    }
    console.log('═══════════════════════════════════════════════════════════════\n');
    
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.error('\n═══════════════════════════════════════════════════════════════');
    console.error('❌ CURATION FAILED');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error(`Duration: ${duration} minutes`);
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    console.error('═══════════════════════════════════════════════════════════════\n');
    process.exit(1);
  }
  
  process.exit(0);
}

// Handle signals gracefully
process.on('SIGTERM', () => {
  console.log('\n⚠️  Received SIGTERM, shutting down gracefully...\n');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  Received SIGINT, shutting down gracefully...\n');
  process.exit(0);
});

runMaxCuration();
