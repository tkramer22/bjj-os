import { startCurationRun } from './server/curation-controller';

async function triggerMaxCuration() {
  console.log('🚀 Triggering max curation run...');
  
  try {
    const result = await startCurationRun('manual', 'replit-agent-trigger');
    console.log('✅ Curation started:', result);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to start curation:', error);
    process.exit(1);
  }
}

triggerMaxCuration();
