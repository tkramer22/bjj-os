/**
 * AGGRESSIVE TARGETED VIDEO SEARCH
 * Uses specific instructor+technique combinations to find NEW videos
 * Bypasses the rotation system to maximize discovery
 */

import { db } from './db';
import { videos, aiVideoKnowledge } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { getVideoDetails } from './youtube-service';

const TARGETED_SEARCHES = [
  // Specific instructor + technique combinations
  "Mikey Musumeci leg lock instructional",
  "Craig Jones heel hook technique",
  "Keenan Cornelius worm guard tutorial",
  "Geo Martinez rubber guard bjj",
  "Nicky Ryan guillotine choke",
  "Gary Tonon leg entanglement system",
  "Gordon Ryan passing instructional",
  "Lachlan Giles half guard sweep",
  "Marcelo Garcia butterfly guard",
  "Danaher leg lock system",
  
  // Niche techniques we likely don't have
  "bodylock pass bjj technique",
  "hip clamp pass instructional",
  "floating pass bjj tutorial",
  "leg weave pass guard",
  "smash pass half guard",
  "coyote guard bjj technique",
  "williams guard tutorial",
  "meathook sweep bjj",
  "shaolin sweep technique",
  "waiter sweep instructional",
  "muscle sweep bjj",
  "sumi gaeshi jiu jitsu",
  "tani otoshi takedown bjj",
  
  // Competition breakdowns
  "ADCC technique breakdown",
  "Gordon Ryan match analysis",
  "Mikey Musumeci worlds breakdown",
  "IBJJF worlds technique analysis",
  
  // More specific instructor searches
  "Jon Thomas guard passing",
  "Jordan Teaches Jiujitsu sweep",
  "Priit Mihkelson defense",
  "Chewjitsu half guard",
  "Knight Jiu Jitsu technique",
  "Bernardo Faria over under",
  "Travis Stevens judo bjj",
  "Ffion Davies guard",
  "Beatriz Mesquita technique",
  "Kaynan Duarte passing",
];

async function searchYouTube(query: string, maxResults: number = 25): Promise<any[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not configured');

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('q', query);
  url.searchParams.append('type', 'video');
  url.searchParams.append('maxResults', maxResults.toString());
  url.searchParams.append('order', 'relevance');
  url.searchParams.append('videoDuration', 'medium');
  url.searchParams.append('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (err.error?.errors?.[0]?.reason === 'quotaExceeded') {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error(`YouTube API error: ${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
}

async function getVideoDuration(videoId: string): Promise<number> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return 0;

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.append('part', 'contentDetails,statistics');
  url.searchParams.append('id', videoId);
  url.searchParams.append('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) return 0;

  const data = await response.json();
  const item = data.items?.[0];
  if (!item) return 0;

  const duration = item.contentDetails?.duration || '';
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  return (parseInt(match[1] || '0') * 3600) + 
         (parseInt(match[2] || '0') * 60) + 
         parseInt(match[3] || '0');
}

async function videoExists(videoId: string): Promise<boolean> {
  const existing = await db.select({ id: videos.id })
    .from(videos)
    .where(eq(videos.videoId, videoId))
    .limit(1);
  return existing.length > 0;
}

export async function runAggressiveTargetedSearch(): Promise<{
  searches: number;
  found: number;
  added: number;
  skipped: { duplicate: number; tooShort: number };
}> {
  console.log('\n🚀 AGGRESSIVE TARGETED SEARCH');
  console.log('═'.repeat(70));
  console.log(`Searching ${TARGETED_SEARCHES.length} targeted queries for NEW videos...`);
  console.log('═'.repeat(70));

  let totalFound = 0;
  let totalAdded = 0;
  let duplicates = 0;
  let tooShort = 0;
  let searchesDone = 0;

  for (const query of TARGETED_SEARCHES) {
    searchesDone++;
    console.log(`\n[${searchesDone}/${TARGETED_SEARCHES.length}] "${query}"`);

    try {
      const results = await searchYouTube(query);
      totalFound += results.length;
      
      let addedThisQuery = 0;

      for (const item of results) {
        const videoId = item.id?.videoId;
        if (!videoId) continue;

        // Check if already exists
        if (await videoExists(videoId)) {
          duplicates++;
          continue;
        }

        // Get duration
        const duration = await getVideoDuration(videoId);
        if (duration < 70) {
          tooShort++;
          continue;
        }

        // Add to database
        const title = item.snippet?.title || '';
        const channelTitle = item.snippet?.channelTitle || '';
        const publishedAt = item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : new Date();

        await db.insert(videos).values({
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          videoId: videoId,
          title: title.substring(0, 500),
          channel: channelTitle,
          publishedAt,
          finalScore: 75,
          accepted: true,
        });

        totalAdded++;
        addedThisQuery++;
        console.log(`   ✅ Added: ${title.substring(0, 50)}...`);
      }

      console.log(`   Found: ${results.length} | Added: ${addedThisQuery} | Running total: ${totalAdded}`);

      // Progress report every 10 searches
      if (searchesDone % 10 === 0) {
        console.log('\n' + '═'.repeat(70));
        console.log(`📊 PROGRESS: ${searchesDone}/${TARGETED_SEARCHES.length} searches`);
        console.log(`   Videos found: ${totalFound}`);
        console.log(`   Videos added: ${totalAdded}`);
        console.log(`   Duplicates skipped: ${duplicates}`);
        console.log(`   Too short skipped: ${tooShort}`);
        console.log('═'.repeat(70));
      }

      // Small delay for API rate limiting
      await new Promise(r => setTimeout(r, 300));

    } catch (error: any) {
      if (error.message === 'QUOTA_EXCEEDED') {
        console.log('⚠️  YouTube API quota exceeded - stopping');
        break;
      }
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('🏁 FINAL RESULTS');
  console.log('═'.repeat(70));
  console.log(`   Total searches: ${searchesDone}`);
  console.log(`   Videos found: ${totalFound}`);
  console.log(`   Videos added: ${totalAdded}`);
  console.log(`   Duplicates skipped: ${duplicates}`);
  console.log(`   Too short skipped: ${tooShort}`);
  console.log('═'.repeat(70));

  return {
    searches: searchesDone,
    found: totalFound,
    added: totalAdded,
    skipped: { duplicate: duplicates, tooShort },
  };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAggressiveTargetedSearch()
    .then(result => {
      console.log('\n✅ Complete:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}
