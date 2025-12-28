/**
 * OPTIMIZED CURATION + AUTO-KNOWLEDGE EXTRACTION
 * 
 * THREE PILLARS:
 * 1. Elite Instructor Mining - Search for underrepresented elite instructors
 * 2. Technique Gap Filling - Search for techniques we may be missing
 * 3. Channel Deep Dives - Mine trusted channels thoroughly
 * 
 * AUTO-QUEUE: All new videos automatically queued for Gemini processing
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db';
import { aiVideoKnowledge, instructorCredibility, videoWatchStatus } from '@shared/schema';
import { eq, sql, desc, and, lt, isNull } from 'drizzle-orm';
import { getVideoDetails } from '../youtube-service';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// PILLAR 1: ELITE INSTRUCTORS (focus on those with fewer videos in our library)
const ELITE_INSTRUCTORS = [
  'JT Torres', 'Lachlan Giles', 'Craig Jones', 'Mikey Musumeci',
  'Gordon Ryan', 'John Danaher', 'Marcelo Garcia', 'Roger Gracie',
  'Bernardo Faria', 'Andre Galvao', 'Rafael Lovato Jr', 'Lucas Lepri',
  'Keenan Cornelius', 'Garry Tonon', 'Giancarlo Bodoni', 'Rafael Mendes',
  'Gui Mendes', 'Marcus Buchecha', 'Leandro Lo', 'Xande Ribeiro'
];

// PILLAR 2: TECHNIQUE GAPS - Modern and underrepresented techniques
const TECHNIQUE_QUERIES = [
  // Modern leg locks
  'heel hook defense', 'inside heel hook tutorial', 'k guard entries',
  'saddle leg lock', 'ashi garami entries', 'leg lock escape bjj',
  
  // Wrestling for BJJ
  'wrestling takedowns for bjj', 'single leg takedown bjj',
  'double leg bjj', 'arm drag takedown', 'snap down wrestling',
  
  // Competition techniques
  'adcc techniques', 'ibjjf sweep techniques', 'competition guard pull',
  
  // Escapes
  'mount escape bjj', 'back escape bjj', 'side control escape',
  'knee on belly escape', 'leg lock escape techniques',
  
  // Modern guards
  'k guard bjj', 'williams guard', 'worm guard', 'lapel guard',
  'reverse de la riva', 'matrix guard bjj'
];

// PILLAR 3: TRUSTED CHANNELS
const TRUSTED_CHANNELS = [
  'Bernardo Faria BJJ', 'Jon Thomas BJJ', 'BJJ Fanatics',
  'Keenan Online', 'Lachlan Giles', 'Daisy Fresh BJJ'
];

interface YouTubeSearchResult {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
}

async function searchYouTube(query: string, maxResults: number = 10): Promise<YouTubeSearchResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not configured');

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('q', query);
  url.searchParams.append('type', 'video');
  url.searchParams.append('maxResults', maxResults.toString());
  url.searchParams.append('order', 'relevance');
  url.searchParams.append('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error?.error?.errors?.[0]?.reason === 'quotaExceeded') {
      throw new Error('QUOTA_EXHAUSTED');
    }
    throw new Error(`YouTube API error: ${response.status}`);
  }

  const data = await response.json();
  return data.items.map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description || '',
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url || '',
  }));
}

async function analyzeVideo(video: YouTubeSearchResult, targetInstructor?: string): Promise<{
  isInstructional: boolean;
  instructorName: string;
  technique: string;
  qualityScore: number;
  techniqueType: string;
  giOrNogi: string;
  shouldAdd: boolean;
  reasoning: string;
}> {
  const prompt = `Analyze this BJJ video for curation:

Title: ${video.title}
Channel: ${video.channelTitle}
${targetInstructor ? `Target Instructor: ${targetInstructor}` : ''}

RULES:
1. NO transcript requirement - never reject for missing transcript
2. Elite instructors (listed below) bypass quality checks - always add their instructional content
3. Quality threshold: 6.5+ overall

ELITE INSTRUCTORS (auto-approve instructional content):
Gordon Ryan, John Danaher, Marcelo Garcia, Roger Gracie, Bernardo Faria, 
Andre Galvao, Lachlan Giles, Craig Jones, Mikey Musumeci, JT Torres,
Keenan Cornelius, Rafael Mendes, Gui Mendes, Lucas Lepri, Garry Tonon

Respond in JSON:
{
  "isInstructional": boolean (true if this is a technique tutorial/breakdown),
  "instructorName": "name of instructor teaching",
  "technique": "specific technique being taught",
  "qualityScore": 1-10,
  "techniqueType": "guard_pass|submission|sweep|escape|takedown|position|defense|other",
  "giOrNogi": "gi|nogi|both",
  "shouldAdd": boolean,
  "reasoning": "brief explanation"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON in response');
  } catch (e: any) {
    console.error(`   ❌ Analysis error: ${e.message}`);
    return {
      isInstructional: false,
      instructorName: '',
      technique: '',
      qualityScore: 0,
      techniqueType: 'other',
      giOrNogi: 'both',
      shouldAdd: false,
      reasoning: `Error: ${e.message}`,
    };
  }
}

async function checkVideoExists(youtubeId: string): Promise<boolean> {
  const [existing] = await db.select({ id: aiVideoKnowledge.id })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.youtubeId, youtubeId))
    .limit(1);
  return !!existing;
}

async function addVideoWithAutoQueue(video: YouTubeSearchResult, analysis: any, duration: number): Promise<boolean> {
  try {
    const [insertedVideo] = await db.insert(aiVideoKnowledge).values({
      youtubeId: video.videoId,
      videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      title: video.title,
      techniqueName: analysis.technique || 'General Instruction',
      instructorName: analysis.instructorName,
      techniqueType: analysis.techniqueType,
      giOrNogi: analysis.giOrNogi,
      qualityScore: analysis.qualityScore.toString(),
      duration: duration,
      thumbnailUrl: video.thumbnailUrl,
      channelName: video.channelTitle,
      createdAt: new Date(),
      sourceType: 'optimized_curation',
      tags: [analysis.instructorName?.toLowerCase(), analysis.techniqueType].filter(Boolean) as string[],
    }).returning();

    // AUTO-QUEUE FOR GEMINI PROCESSING
    if (insertedVideo?.id) {
      await db.insert(videoWatchStatus).values({
        videoId: insertedVideo.id,
        hasTranscript: false,
        processed: false,
        errorMessage: null
      }).onConflictDoNothing();
      console.log(`   🤖 Auto-queued for Gemini: ID ${insertedVideo.id}`);
    }

    return true;
  } catch (e: any) {
    if (e.message?.includes('duplicate')) return false;
    throw e;
  }
}

async function runOptimizedCuration() {
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 OPTIMIZED CURATION + AUTO-KNOWLEDGE EXTRACTION');
  console.log('═'.repeat(60));
  const startTime = new Date();
  
  // Get counts before
  const [beforeCount] = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
  const [beforeUnprocessed] = await db.execute(sql`SELECT COUNT(*) as count FROM video_watch_status WHERE processed = false`);
  
  console.log(`\n📊 BEFORE:`);
  console.log(`   Videos in library: ${beforeCount[0]?.count || beforeCount}`);
  console.log(`   Unprocessed in queue: ${beforeUnprocessed[0]?.count || beforeUnprocessed}`);

  let totalFound = 0;
  let totalAnalyzed = 0;
  let totalAdded = 0;
  let totalDuplicates = 0;

  try {
    // PILLAR 1: Elite Instructor Mining
    console.log('\n' + '─'.repeat(40));
    console.log('📌 PILLAR 1: ELITE INSTRUCTOR MINING');
    console.log('─'.repeat(40));
    
    // Get underrepresented elite instructors
    const instructorCounts = await db.execute(sql`
      SELECT instructor_name, COUNT(*) as count 
      FROM ai_video_knowledge 
      WHERE instructor_name IS NOT NULL 
      GROUP BY instructor_name
    `) as any[];

    const countMap = new Map<string, number>();
    for (const row of instructorCounts) {
      countMap.set(row.instructor_name?.toLowerCase(), Number(row.count));
    }

    const underrepresented = ELITE_INSTRUCTORS
      .map(name => ({ name, count: countMap.get(name.toLowerCase()) || 0 }))
      .sort((a, b) => a.count - b.count)
      .slice(0, 5);

    console.log('Targeting underrepresented elite instructors:');
    for (const inst of underrepresented) {
      console.log(`   ${inst.name}: ${inst.count} videos`);
      
      const queries = [
        `${inst.name} BJJ technique`,
        `${inst.name} instructional`,
        `${inst.name} jiu jitsu tutorial`
      ];

      for (const query of queries) {
        try {
          const videos = await searchYouTube(query, 5);
          totalFound += videos.length;

          for (const video of videos) {
            if (await checkVideoExists(video.videoId)) {
              totalDuplicates++;
              continue;
            }

            let duration = 0;
            try {
              const details = await getVideoDetails(video.videoId);
              duration = details?.duration || 0;
            } catch (e) { continue; }

            if (duration < 120) continue;

            totalAnalyzed++;
            const analysis = await analyzeVideo(video, inst.name);

            if (analysis.shouldAdd && analysis.isInstructional && analysis.qualityScore >= 6.5) {
              const added = await addVideoWithAutoQueue(video, analysis, duration);
              if (added) {
                totalAdded++;
                console.log(`   ✅ Added: ${video.title.substring(0, 50)}...`);
              }
            }

            await new Promise(r => setTimeout(r, 500));
          }
        } catch (e: any) {
          if (e.message === 'QUOTA_EXHAUSTED') throw e;
        }
      }
    }

    // PILLAR 2: Technique Gap Filling
    console.log('\n' + '─'.repeat(40));
    console.log('📌 PILLAR 2: TECHNIQUE GAP FILLING');
    console.log('─'.repeat(40));

    const selectedTechniques = TECHNIQUE_QUERIES
      .sort(() => Math.random() - 0.5)
      .slice(0, 8);

    for (const technique of selectedTechniques) {
      console.log(`\nSearching: ${technique}`);
      try {
        const videos = await searchYouTube(technique, 5);
        totalFound += videos.length;

        for (const video of videos) {
          if (await checkVideoExists(video.videoId)) {
            totalDuplicates++;
            continue;
          }

          let duration = 0;
          try {
            const details = await getVideoDetails(video.videoId);
            duration = details?.duration || 0;
          } catch (e) { continue; }

          if (duration < 120) continue;

          totalAnalyzed++;
          const analysis = await analyzeVideo(video);

          if (analysis.shouldAdd && analysis.isInstructional && analysis.qualityScore >= 6.5) {
            const added = await addVideoWithAutoQueue(video, analysis, duration);
            if (added) {
              totalAdded++;
              console.log(`   ✅ Added: ${video.title.substring(0, 50)}...`);
            }
          }

          await new Promise(r => setTimeout(r, 500));
        }
      } catch (e: any) {
        if (e.message === 'QUOTA_EXHAUSTED') throw e;
      }
    }

    // PILLAR 3: Channel Deep Dives
    console.log('\n' + '─'.repeat(40));
    console.log('📌 PILLAR 3: CHANNEL DEEP DIVES');
    console.log('─'.repeat(40));

    const selectedChannels = TRUSTED_CHANNELS
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    for (const channel of selectedChannels) {
      console.log(`\nMining channel: ${channel}`);
      try {
        const videos = await searchYouTube(`${channel} technique tutorial`, 8);
        totalFound += videos.length;

        for (const video of videos) {
          if (await checkVideoExists(video.videoId)) {
            totalDuplicates++;
            continue;
          }

          let duration = 0;
          try {
            const details = await getVideoDetails(video.videoId);
            duration = details?.duration || 0;
          } catch (e) { continue; }

          if (duration < 120) continue;

          totalAnalyzed++;
          const analysis = await analyzeVideo(video);

          if (analysis.shouldAdd && analysis.isInstructional && analysis.qualityScore >= 6.5) {
            const added = await addVideoWithAutoQueue(video, analysis, duration);
            if (added) {
              totalAdded++;
              console.log(`   ✅ Added: ${video.title.substring(0, 50)}...`);
            }
          }

          await new Promise(r => setTimeout(r, 500));
        }
      } catch (e: any) {
        if (e.message === 'QUOTA_EXHAUSTED') throw e;
      }
    }

  } catch (e: any) {
    if (e.message === 'QUOTA_EXHAUSTED') {
      console.log('\n⚠️ YouTube quota exhausted');
    } else {
      console.error('Error:', e.message);
    }
  }

  // Get counts after
  const [afterCount] = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
  const [afterUnprocessed] = await db.execute(sql`SELECT COUNT(*) as count FROM video_watch_status WHERE processed = false`);
  
  const endTime = new Date();
  const duration = (endTime.getTime() - startTime.getTime()) / 1000 / 60;

  console.log('\n' + '═'.repeat(60));
  console.log('📊 CURATION RESULTS');
  console.log('═'.repeat(60));
  console.log(`Duration: ${duration.toFixed(1)} minutes`);
  console.log(`Videos found: ${totalFound}`);
  console.log(`Videos analyzed: ${totalAnalyzed}`);
  console.log(`Videos added: ${totalAdded}`);
  console.log(`Duplicates skipped: ${totalDuplicates}`);
  console.log('');
  console.log('📊 LIBRARY STATUS:');
  console.log(`   Before: ${beforeCount[0]?.count || beforeCount} videos`);
  console.log(`   After: ${afterCount[0]?.count || afterCount} videos`);
  console.log(`   Net added: ${Number(afterCount[0]?.count || afterCount) - Number(beforeCount[0]?.count || beforeCount)}`);
  console.log('');
  console.log('🤖 GEMINI QUEUE:');
  console.log(`   Before: ${beforeUnprocessed[0]?.count || beforeUnprocessed} unprocessed`);
  console.log(`   After: ${afterUnprocessed[0]?.count || afterUnprocessed} unprocessed`);
  console.log(`   New videos queued: ${Number(afterUnprocessed[0]?.count || afterUnprocessed) - Number(beforeUnprocessed[0]?.count || beforeUnprocessed)}`);
  console.log('═'.repeat(60));

  return {
    totalFound,
    totalAnalyzed,
    totalAdded,
    totalDuplicates,
    beforeCount: Number(beforeCount[0]?.count || beforeCount),
    afterCount: Number(afterCount[0]?.count || afterCount),
    durationMinutes: duration
  };
}

// Run if executed directly
runOptimizedCuration()
  .then(result => {
    console.log('\n✅ Curation complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Curation failed:', err);
    process.exit(1);
  });
