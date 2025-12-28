import { google } from 'googleapis';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

async function testChannelLookup() {
  try {
    console.log('Looking up Lachlan Giles channel...');
    
    // First verify the channel exists
    const channelResponse = await youtube.channels.list({
      part: ['snippet', 'statistics'],
      id: ['UCkDGEQdez8XbcHsytxYh-qA']
    });
    
    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      console.log('❌ Channel not found with that ID');
      return;
    }
    
    const channel = channelResponse.data.items[0];
    console.log('✅ Channel found:');
    console.log('   Name:', channel.snippet?.title);
    console.log('   Subs:', channel.statistics?.subscriberCount);
    console.log('   Videos:', channel.statistics?.videoCount);
    
    // Now try to get videos
    console.log('\nFetching videos from channel...');
    const searchResponse = await youtube.search.list({
      part: ['snippet'],
      channelId: 'UCkDGEQdez8XbcHsytxYh-qA',
      type: ['video'],
      order: 'date',
      maxResults: 5
    });
    
    console.log('Search API response:');
    console.log('   Items count:', searchResponse.data.items?.length || 0);
    
    if (searchResponse.data.items && searchResponse.data.items.length > 0) {
      console.log('   First video:', searchResponse.data.items[0].snippet?.title);
    }
    
  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
  }
}

testChannelLookup();
