import { google } from 'googleapis';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

const instructors = [
  'Lachlan Giles',
  'Bernardo Faria BJJ',
  'Knight Jiu Jitsu',
  'Chewjitsu',
  'BJJ Fanatics',
  'Keenan Online',
  'Grapplearts',
  'Marcelo Garcia',
  'Kit Dale'
];

async function findChannelIds() {
  for (const instructor of instructors) {
    try {
      const response = await youtube.search.list({
        part: ['snippet'],
        q: instructor,
        type: ['channel'],
        maxResults: 1
      });
      
      if (response.data.items && response.data.items.length > 0) {
        const channel = response.data.items[0];
        console.log(`${instructor}:`);
        console.log(`   ID: ${channel.id?.channelId}`);
        console.log(`   Title: ${channel.snippet?.title}`);
        console.log('');
      } else {
        console.log(`${instructor}: NOT FOUND`);
        console.log('');
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error: any) {
      console.error(`Error searching for ${instructor}:`, error.message);
    }
  }
}

findChannelIds();
