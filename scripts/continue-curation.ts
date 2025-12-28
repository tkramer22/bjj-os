import { runAutonomousCuration } from '../server/video-curation-service';

async function main() {
  console.log('🎬 Continuing video curation from search query 9...');
  console.log('Remaining 16 searches to process\n');
  
  try {
    // Start from search 9 (we already did 0-8)
    // This will run searches 9-20 (12 more searches)
    await runAutonomousCuration(12);
    
    console.log('\n✅ Curation continuation complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
