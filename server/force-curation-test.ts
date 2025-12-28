import axios from 'axios';

async function forceCuration() {
  console.log('═'.repeat(80));
  console.log('🚀 FORCING CURATION - BYPASSING ALL CHECKS');
  console.log('═'.repeat(80));
  console.log();
  
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    console.error('❌ YOUTUBE_API_KEY not set');
    process.exit(1);
  }
  
  const queries = ['bjj guard passing', 'bjj submissions', 'bjj escapes'];
  
  let totalFound = 0;
  
  for (const query of queries) {
    console.log(`\n🔍 Searching: "${query}"`);
    
    try {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults: 10,
          key: apiKey
        }
      });
      
      console.log(`✅ Found ${response.data.items.length} videos`);
      totalFound += response.data.items.length;
      
      // Show first 3 titles
      response.data.items.slice(0, 3).forEach((v: any, i: number) => {
        console.log(`  ${i+1}. "${v.snippet.title}"`);
      });
      
    } catch (error: any) {
      console.log(`❌ Failed: ${error.response?.status}`);
      console.log(`Error: ${error.response?.data?.error?.message}`);
      
      if (error.response?.status === 403) {
        const reason = error.response?.data?.error?.errors?.[0]?.reason;
        console.log(`Reason: ${reason}`);
        
        if (reason === 'quotaExceeded') {
          console.log('🚨 QUOTA ACTUALLY EXHAUSTED (not cached data)');
        } else {
          console.log('🚨 403 Error but NOT quota - check API configuration');
        }
      }
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log(`📊 RESULTS`);
  console.log('═'.repeat(80));
  console.log(`Total videos found: ${totalFound}`);
  console.log();
  
  if (totalFound > 0) {
    console.log('✅ YouTube API working - curation CAN find videos');
    console.log('❌ Problem is NOT with YouTube API');
    console.log('🔍 Check curation controller logic for blocking code');
  } else {
    console.log('❌ Problem with YouTube API or quota');
    console.log('🔍 Check Google Cloud Console configuration');
  }
  console.log();
}

forceCuration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Exception:', err.message);
    process.exit(1);
  });
