import { startCurationRun } from './curation-controller';

async function triggerDoubleMaxCuration() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀🚀 DOUBLE MAXIMUM CURATION - TRIGGERED BY USER REQUEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Target: 1000 videos per run (2× aggressive mode)');
  console.log('Expected: 20 searches × 50 results = analyzing up to 1000 videos');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  try {
    console.log('[MANUAL] Initiating DOUBLE aggressive curation run...');
    
    // Run curation TWICE in sequence to achieve 2× capacity
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📋 RUN 1/2: Starting first maximum curation run (500 videos)...');
    console.log('═══════════════════════════════════════════════════════════════');
    const result1 = await startCurationRun('manual', 'user-double-max-curation-run-1');
    
    if (result1.success) {
      console.log(`✅ RUN 1/2 STARTED: ${result1.runId}`);
    } else {
      console.log(`⏸️  RUN 1/2 SKIPPED: ${result1.reason}`);
      return;
    }
    
    // Wait 2 seconds between runs
    console.log('');
    console.log('⏳ Waiting 2 seconds before starting run 2/2...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📋 RUN 2/2: Starting second maximum curation run (500 videos)...');
    console.log('═══════════════════════════════════════════════════════════════');
    const result2 = await startCurationRun('manual', 'user-double-max-curation-run-2');
    
    if (result2.success) {
      console.log(`✅ RUN 2/2 STARTED: ${result2.runId}`);
    } else {
      console.log(`⏸️  RUN 2/2 SKIPPED: ${result2.reason}`);
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ DOUBLE MAX CURATION INITIATED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Status: 2 runs processing in parallel');
    console.log('');
    console.log('📊 To monitor progress:');
    if (result1.success) {
      console.log(`   Run 1: SELECT * FROM curation_runs WHERE id = '${result1.runId}';`);
    }
    if (result2.success) {
      console.log(`   Run 2: SELECT * FROM curation_runs WHERE id = '${result2.runId}';`);
    }
    console.log('');
    console.log('⏱️  Expected duration: 10-30 minutes (both runs in parallel)');
    console.log('📈 Expected results: 10-100 videos added total');
    console.log('═══════════════════════════════════════════════════════════════');
    
    // Keep process alive for 10 seconds to see initial pipeline logs
    console.log('');
    console.log('Waiting 10 seconds to show initial pipeline activity...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('');
    console.log('✅ Double max curation trigger complete. Both runs continuing in background.');
    console.log('   Check the main server logs for full curation progress.');
    
  } catch (error: any) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ ERROR TRIGGERING DOUBLE MAX CURATION');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('═══════════════════════════════════════════════════════════════');
  }
}

triggerDoubleMaxCuration();
