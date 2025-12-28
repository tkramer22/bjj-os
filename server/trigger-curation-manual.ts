import { startCurationRun, canRunCuration } from './curation-controller';

async function triggerManualCuration() {
  console.log('═'.repeat(80));
  console.log('🎬 MANUALLY TRIGGERING CURATION RUN');
  console.log('═'.repeat(80));
  console.log();
  
  // Check if curation can run
  console.log('Step 1: Checking if curation can run...\n');
  const check = await canRunCuration();
  
  console.log('Can Run:', check.canRun);
  console.log('Reason:', check.reason || 'None');
  console.log('Quota Remaining:', check.quotaRemaining || 'N/A');
  console.log('Batch Size:', check.batchSize || 'N/A');
  console.log();
  
  if (!check.canRun) {
    console.log('❌ BLOCKER FOUND:', check.reason);
    console.log('\n🔧 DIAGNOSIS:');
    console.log('   The canRunCuration() check is preventing curation');
    console.log('   This is why 0 videos are being screened');
    console.log();
    process.exit(1);
  }
  
  console.log('✅ All checks passed! Starting curation...\n');
  
  // Start curation
  console.log('Step 2: Starting curation run...\n');
  const result = await startCurationRun('manual', 'manual-test-script');
  
  console.log('═'.repeat(80));
  console.log('RESULT');
  console.log('═'.repeat(80));
  console.log('Success:', result.success);
  console.log('Run ID:', result.runId || 'N/A');
  console.log('Reason:', result.reason || 'None');
  console.log('Message:', result.message || 'None');
  console.log();
  
  if (result.success) {
    console.log('✅ Curation started successfully!');
    console.log('   Run ID:', result.runId);
    console.log('\n💡 Check the curation_runs table for progress');
  } else {
    console.log('❌ Curation failed to start');
    console.log('   Reason:', result.reason);
  }
  console.log();
}

triggerManualCuration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Exception:', err);
    console.error(err.stack);
    process.exit(1);
  });
