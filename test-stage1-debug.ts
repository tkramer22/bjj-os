// Test Stage 1 filter with debug logging
import { db } from './server/db';
import { searchYouTubeVideosExtended } from './server/intelligent-curator';

async function testStage1() {
  console.log('🧪 TESTING STAGE 1 FILTER WITH DEBUG LOGS\n');
  console.log('Searching for "triangle choke bjj" - limiting to 3 videos\n');
  console.log('═'.repeat(70));
  
  try {
    // Test with just 3 videos to see detailed output
    const videos = await searchYouTubeVideosExtended('triangle choke bjj', undefined, 3);
    
    console.log('\n' + '═'.repeat(70));
    console.log(`\n✅ TEST COMPLETE`);
    console.log(`Videos that PASSED all stages: ${videos.length}`);
    
    if (videos.length > 0) {
      console.log('\n🎉 SUCCESS! Videos are passing Stage 1:');
      videos.forEach((v, i) => {
        console.log(`  ${i+1}. ${v.title}`);
      });
    } else {
      console.log('\n❌ ALL VIDEOS REJECTED - Check debug logs above');
      console.log('Look for:');
      console.log('  📊 Transcript length');
      console.log('  📝 Transcript sample');
      console.log('  🤖 Claude verdict & reasoning');
    }
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
  }
  
  process.exit(0);
}

testStage1();
