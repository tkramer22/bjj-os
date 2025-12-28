import { getChannelVideos } from './youtube-service';

async function test() {
  console.log('Testing getChannelVideos with Lachlan Giles channel...');
  
  try {
    const videos = await getChannelVideos('UCkDGEQdez8XbcHsytxYh-qA', 5);
    console.log(`Found ${videos.length} videos`);
    
    if (videos.length > 0) {
      console.log('First video:', {
        title: videos[0].title,
        youtube_id: videos[0].youtube_id,
        channel: videos[0].channel_name
      });
    } else {
      console.log('No videos returned from API');
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

test();
