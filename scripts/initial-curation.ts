import { runAutonomousCuration } from '../server/video-curation-service';

async function main() {
  console.log('🎬 Starting initial video curation...');
  console.log('This will search and analyze ~200-400 videos');
  console.log('Should take 10-15 minutes\n');
  
  try {
    // Run all foundation searches
    await runAutonomousCuration(20);
    
    console.log('\n✅ Initial curation complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
