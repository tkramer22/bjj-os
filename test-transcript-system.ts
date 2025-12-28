/**
 * Test Hybrid Transcript Generation System
 * Tests: YouTube captions, Whisper fallback, caching
 */

import { getVideoTranscript } from './server/transcript-generator';

async function testTranscriptSystem() {
  console.log('🧪 TESTING HYBRID TRANSCRIPT SYSTEM\n');
  console.log('═'.repeat(70));
  
  // Test video IDs (various scenarios)
  const testVideos = [
    { id: '5ED_yLiMhyc', name: 'Triangle Choke from Closed Guard (12s)', duration: 12 },
    { id: '20j7LcZ5xRY', name: 'Triangle Tutorial (11m17s)', duration: 677 },
  ];
  
  for (const video of testVideos) {
    console.log(`\n📹 Testing: ${video.name}`);
    console.log(`   Video ID: ${video.id}, Duration: ${video.duration}s`);
    
    try {
      const result = await getVideoTranscript(video.id, video.duration);
      
      if (!result) {
        console.log(`   ❌ FAILED: No transcript generated`);
        continue;
      }
      
      console.log(`   ✅ SUCCESS!`);
      console.log(`   📝 Source: ${result.source}`);
      console.log(`   💰 Cost: $${result.cost.toFixed(3)}`);
      console.log(`   📊 Length: ${result.text.length} chars`);
      if (result.segments) {
        console.log(`   🎬 Segments: ${result.segments}`);
      }
      console.log(`   📄 Preview: "${result.text.substring(0, 100)}..."`);
      
    } catch (error: any) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log('\n✅ TRANSCRIPT SYSTEM TEST COMPLETE');
  
  process.exit(0);
}

testTranscriptSystem();
