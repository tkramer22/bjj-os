import { startCurationRun } from './curation-controller';

async function testCurationDirect() {
  console.log('════════════════════════════════════════════════════════');
  console.log('🧪 DIRECT CURATION TEST - Bypassing cron scheduler');
  console.log('════════════════════════════════════════════════════════');
  
  try {
    console.log('[TEST] Calling startCurationRun directly...');
    const result = await startCurationRun('auto', 'cron-aggressive-test');
    
    console.log('[TEST] Result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log(`[TEST] ✅ Curation started successfully - Run ID: ${result.runId}`);
      console.log(`[TEST] Check the curation_runs table for run ID: ${result.runId}`);
    } else {
      console.log(`[TEST] ⏸️  Curation was skipped. Reason: ${result.reason}`);
    }
  } catch (error: any) {
    console.error('[TEST] ❌ Error during test:', error);
    console.error('[TEST] Stack:', error.stack);
  }
  
  console.log('════════════════════════════════════════════════════════');
  console.log('🧪 TEST COMPLETE');
  console.log('════════════════════════════════════════════════════════');
  
  // Keep process alive for a few seconds to see async logs
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log('[TEST] Exiting...');
}

testCurationDirect();
