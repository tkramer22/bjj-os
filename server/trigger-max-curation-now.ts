import { startCurationRun } from './curation-controller';

async function triggerMaxCuration() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 MANUAL MAX CURATION - TRIGGERED BY USER REQUEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Target: 500 videos per run (aggressive mode)');
  console.log('Expected: 10 searches × 50 results = analyzing up to 500 videos');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  try {
    console.log('[MANUAL] Initiating aggressive curation run...');
    const result = await startCurationRun('manual', 'user-manual-max-curation');
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    if (result.success) {
      console.log(`✅ CURATION STARTED SUCCESSFULLY`);
      console.log(`   Run ID: ${result.runId}`);
      console.log(`   Type: Manual (max aggressive mode)`);
      console.log(`   Status: Processing in background`);
      console.log('');
      console.log('📊 To monitor progress:');
      console.log(`   SELECT * FROM curation_runs WHERE id = '${result.runId}';`);
      console.log('');
      console.log('⏱️  Expected duration: 5-15 minutes');
      console.log('📈 Expected results: 5-50 videos added (27% approval rate)');
    } else {
      console.log(`⏸️  CURATION SKIPPED`);
      console.log(`   Reason: ${result.reason}`);
    }
    console.log('═══════════════════════════════════════════════════════════════');
    
    // Keep process alive for 10 seconds to see initial pipeline logs
    console.log('');
    console.log('Waiting 10 seconds to show initial pipeline activity...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('');
    console.log('✅ Manual trigger complete. Curation continuing in background.');
    console.log('   Check the main server logs for full curation progress.');
    
  } catch (error: any) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ ERROR TRIGGERING CURATION');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('═══════════════════════════════════════════════════════════════');
  }
}

triggerMaxCuration();
