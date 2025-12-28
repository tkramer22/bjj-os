/**
 * YouTube API Diagnostic Test
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests YouTube API connection and identifies 403 error causes
 */

async function testYouTubeAPI() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  console.log('═'.repeat(80));
  console.log('YOUTUBE API DIAGNOSTIC TEST');
  console.log('═'.repeat(80));
  
  // Test 1: Check API key exists
  if (!apiKey) {
    console.error('❌ YOUTUBE_API_KEY not found in environment');
    console.error('   Set it in Secrets: YOUTUBE_API_KEY=your_key_here');
    return { success: false, error: 'API key not configured' };
  }

  console.log('✅ API Key found');
  console.log('   First 10 chars:', apiKey.substring(0, 10) + '...');
  console.log('   Length:', apiKey.length, 'characters');
  console.log('   Expected length: 39 characters');
  
  if (apiKey.length !== 39) {
    console.warn('⚠️  WARNING: API key length is unusual (expected 39)');
  }

  // Test 2: Simple video search
  console.log('\n' + '─'.repeat(80));
  console.log('TEST 1: Simple Video Search');
  console.log('─'.repeat(80));
  
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=brazilian+jiu+jitsu+guard+pass&type=video&maxResults=2&key=${apiKey}`;
  
  console.log('Endpoint: https://www.googleapis.com/youtube/v3/search');
  console.log('Query: brazilian jiu jitsu guard pass');
  console.log('Making request...\n');

  try {
    const response = await fetch(searchUrl);
    const status = response.status;
    const statusText = response.statusText;
    
    console.log(`Response Status: ${status} ${statusText}`);
    
    if (status === 200) {
      const data = await response.json();
      console.log('✅ SUCCESS! Search API is working');
      console.log('   Results:', data.items?.length || 0, 'videos found');
      if (data.items?.[0]) {
        console.log('   Sample video:', data.items[0].snippet.title);
        console.log('   Channel:', data.items[0].snippet.channelTitle);
      }
    } else {
      const errorBody = await response.text();
      console.error('❌ FAILED! Error details:');
      console.error('   Status:', status);
      console.error('   Status Text:', statusText);
      
      // Parse error if JSON
      try {
        const errorJson = JSON.parse(errorBody);
        console.error('\n📋 Parsed Error:');
        console.error('   Message:', errorJson.error?.message);
        console.error('   Reason:', errorJson.error?.errors?.[0]?.reason);
        console.error('   Domain:', errorJson.error?.errors?.[0]?.domain);
        
        // Provide specific guidance based on error
        const reason = errorJson.error?.errors?.[0]?.reason;
        console.log('\n🔧 DIAGNOSIS:');
        
        if (reason === 'quotaExceeded') {
          console.log('   ❌ YouTube API quota exceeded (10,000 units/day)');
          console.log('   ⏰ Quota resets at midnight Pacific Time');
          console.log('   💡 Solution: Wait for quota reset OR request quota increase');
        } else if (reason === 'keyInvalid' || errorJson.error?.message?.includes('API key not valid')) {
          console.log('   ❌ API key is invalid or has restrictions');
          console.log('   💡 Solution: Check Google Cloud Console:');
          console.log('      1. Verify API key is active (not deleted/disabled)');
          console.log('      2. Check Application restrictions: Set to "None"');
          console.log('      3. Check API restrictions: Include "YouTube Data API v3"');
          console.log('      4. Check IP restrictions: Set to "None" (Replit IPs change)');
        } else if (reason === 'accessNotConfigured') {
          console.log('   ❌ YouTube Data API v3 is not enabled');
          console.log('   💡 Solution: Go to Google Cloud Console > APIs & Services > Library');
          console.log('      Search "YouTube Data API v3" and click Enable');
        } else if (reason === 'forbidden') {
          console.log('   ❌ Access forbidden - possible billing or quota issue');
          console.log('   💡 Solution: Check Google Cloud Console billing is enabled');
        } else {
          console.log('   ❌ Unknown error reason:', reason);
        }
      } catch (e) {
        console.error('   Raw response:', errorBody);
      }
      
      return { success: false, status, error: errorBody };
    }
  } catch (error: any) {
    console.error('❌ EXCEPTION:', error.message);
    return { success: false, error: error.message };
  }

  // Test 3: Video details fetch
  console.log('\n' + '─'.repeat(80));
  console.log('TEST 2: Video Details API');
  console.log('─'.repeat(80));
  
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=dQw4w9WgXcQ&key=${apiKey}`;
  console.log('Testing video details endpoint...\n');

  try {
    const response = await fetch(detailsUrl);
    const status = response.status;
    
    console.log(`Response Status: ${status} ${response.statusText}`);
    
    if (status === 200) {
      const data = await response.json();
      console.log('✅ SUCCESS! Video details API is working');
      if (data.items?.[0]) {
        const video = data.items[0];
        console.log('   Duration:', video.contentDetails?.duration);
        console.log('   Views:', video.statistics?.viewCount);
      }
    } else {
      console.error('❌ Video details API failed');
    }
  } catch (error: any) {
    console.error('❌ EXCEPTION:', error.message);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('✅ YOUTUBE API TEST COMPLETE');
  console.log('═'.repeat(80));
  console.log('\n💡 NEXT STEPS:');
  console.log('   1. If tests passed: YouTube API is working correctly');
  console.log('   2. If tests failed: Follow the diagnosis above');
  console.log('   3. After fixing: Re-run this test to verify');
  console.log('   4. Then enable curation: UPDATE system_settings SET setting_value=\'true\'');
  console.log('      WHERE setting_key=\'emergency_curation_override\'');
  
  return { success: true };
}

// Run test
testYouTubeAPI()
  .then(() => {
    console.log('\n✅ Test script completed\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test script failed:', error);
    process.exit(1);
  });
