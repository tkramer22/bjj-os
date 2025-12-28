import { startCurationRun } from './server/curation-controller';

async function test() {
  console.log('🧪 Triggering test curation run...\n');
  
  const result = await startCurationRun('manual', 'agent-test-run');
  
  if (result.success) {
    console.log('✅ Curation run started successfully!');
    console.log('📝 Run ID:', result.runId);
    console.log('\n⏳ Pipeline is running - check logs in 30-60 seconds');
  } else {
    console.log('❌ Failed to start curation');
    console.log('Reason:', result.reason);
  }
  
  // Wait a bit to see initial logs
  await new Promise(resolve => setTimeout(resolve, 5000));
  process.exit(0);
}

test();
