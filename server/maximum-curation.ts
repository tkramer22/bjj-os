/**
 * MAXIMUM VIDEO CURATION SCRIPT
 * 
 * Targets specific high-volume instructors and grabs as many videos as possible
 * until YouTube API quota is exhausted.
 * 
 * Usage: npx tsx server/maximum-curation.ts
 */

import { db } from './db';
import { aiVideoKnowledge } from '@shared/schema';
import { sql, eq, count as drizzleCount } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

// YouTube API Setup
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const anthropic = new Anthropic();

// TIER 1 - Massive Libraries (100+ videos each)
const TIER_1_INSTRUCTORS = [
  'Bernardo Faria',
  'John Danaher',
  'Lachlan Giles',
  'Keenan Cornelius',
  'Chewjitsu',
  'Jon Thomas',
  'Stephan Kesting',
  'Firas Zahabi',
  'Priit Mihkelson',
  'Rob Biernacki'
];

// TIER 2 - Strong Libraries (50+ videos each)
const TIER_2_INSTRUCTORS = [
  'Craig Jones',
  'Gordon Ryan',
  'Mikey Musumeci',
  'Andre Galvao',
  'Cobrinha',
  'Gui Mendes',
  'Rafael Mendes',
  'Marcelo Garcia',
  'Roger Gracie',
  'Giancarlo Bodoni'
];

const ALL_INSTRUCTORS = [...TIER_1_INSTRUCTORS, ...TIER_2_INSTRUCTORS];

interface VideoSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
}

interface CurationStats {
  instructor: string;
  videosFound: number;
  videosAdded: number;
  skippedDuplicate: number;
  skippedShort: number;
  skippedNonInstructional: number;
  beforeCount: number;
  afterCount: number;
}

let quotaUsed = 0;
const QUOTA_LIMIT = 10000; // Daily quota

async function searchYouTube(query: string, maxResults: number = 50): Promise<VideoSearchResult[]> {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY not set');
  }
  
  if (quotaUsed >= QUOTA_LIMIT) {
    throw new Error('QUOTA_EXHAUSTED');
  }
  
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', maxResults.toString());
  url.searchParams.set('videoDuration', 'medium'); // 4-20 minutes
  url.searchParams.set('order', 'relevance');
  url.searchParams.set('key', YOUTUBE_API_KEY);
  
  try {
    const response = await fetch(url.toString());
    quotaUsed += 100; // Search costs 100 quota units
    
    if (!response.ok) {
      const error = await response.json();
      if (error.error?.errors?.[0]?.reason === 'quotaExceeded') {
        throw new Error('QUOTA_EXHAUSTED');
      }
      throw new Error(`YouTube API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return (data.items || []).map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
      publishedAt: item.snippet.publishedAt
    }));
  } catch (error: any) {
    if (error.message === 'QUOTA_EXHAUSTED') throw error;
    console.error(`Search error for "${query}":`, error.message);
    return [];
  }
}

async function getVideoDetails(videoId: string): Promise<{ duration: number } | null> {
  if (!YOUTUBE_API_KEY) return null;
  if (quotaUsed >= QUOTA_LIMIT) throw new Error('QUOTA_EXHAUSTED');
  
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', YOUTUBE_API_KEY);
  
  try {
    const response = await fetch(url.toString());
    quotaUsed += 1; // Video details costs 1 quota unit
    
    if (!response.ok) {
      const error = await response.json();
      if (error.error?.errors?.[0]?.reason === 'quotaExceeded') {
        throw new Error('QUOTA_EXHAUSTED');
      }
      return null;
    }
    
    const data = await response.json();
    const item = data.items?.[0];
    if (!item) return null;
    
    const durationStr = item.contentDetails?.duration || '';
    const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;
    
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    
    return { duration: hours * 3600 + minutes * 60 + seconds };
  } catch (error: any) {
    if (error.message === 'QUOTA_EXHAUSTED') throw error;
    return null;
  }
}

async function checkVideoExists(youtubeId: string): Promise<boolean> {
  const existing = await db.select({ id: aiVideoKnowledge.id })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.youtubeId, youtubeId))
    .limit(1);
  return existing.length > 0;
}

async function getInstructorVideoCount(instructorName: string): Promise<number> {
  const result = await db.select({ count: drizzleCount() })
    .from(aiVideoKnowledge)
    .where(sql`LOWER(${aiVideoKnowledge.instructorName}) LIKE LOWER(${'%' + instructorName + '%'})`);
  return result[0]?.count || 0;
}

async function analyzeVideoWithAI(video: VideoSearchResult, instructorName: string): Promise<{
  isInstructional: boolean;
  technique: string;
  techniqueType: string;
  positionCategory: string;
  giOrNogi: string;
  qualityScore: number;
}> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyze this BJJ video for our instructional library:

Title: "${video.title}"
Channel: "${video.channelTitle}"
Target Instructor: ${instructorName}

Respond in JSON ONLY:
{
  "isInstructional": true/false (is this a BJJ technique tutorial, not entertainment/vlog/interview),
  "technique": "specific technique name",
  "techniqueType": "submission|sweep|pass|escape|takedown|guard|position|defense|drill|concept",
  "positionCategory": "guard|mount|side_control|back|half_guard|standing|other",
  "giOrNogi": "gi|nogi|both",
  "qualityScore": 1-10 (based on title clarity and instructional value)
}`
      }]
    });
    
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { isInstructional: false, technique: '', techniqueType: 'concept', positionCategory: 'other', giOrNogi: 'both', qualityScore: 0 };
  } catch (error) {
    console.error('AI analysis error:', error);
    return { isInstructional: false, technique: '', techniqueType: 'concept', positionCategory: 'other', giOrNogi: 'both', qualityScore: 0 };
  }
}

function generateSearchQueries(instructorName: string): string[] {
  return [
    `${instructorName} BJJ technique`,
    `${instructorName} jiu jitsu instructional`,
    `${instructorName} submission tutorial`,
    `${instructorName} guard technique`,
    `${instructorName} grappling drill`,
    `${instructorName} BJJ breakdown`,
    `${instructorName} passing technique`,
    `${instructorName} sweep tutorial`,
    `${instructorName} escape tutorial`,
    `${instructorName} BJJ concept`
  ];
}

async function curateInstructor(instructorName: string): Promise<CurationStats> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🎯 CURATING: ${instructorName}`);
  console.log(`${'─'.repeat(60)}`);
  
  const stats: CurationStats = {
    instructor: instructorName,
    videosFound: 0,
    videosAdded: 0,
    skippedDuplicate: 0,
    skippedShort: 0,
    skippedNonInstructional: 0,
    beforeCount: await getInstructorVideoCount(instructorName),
    afterCount: 0
  };
  
  const queries = generateSearchQueries(instructorName);
  
  for (const query of queries) {
    console.log(`   🔍 Searching: "${query}"`);
    
    try {
      const videos = await searchYouTube(query, 50);
      stats.videosFound += videos.length;
      console.log(`      Found ${videos.length} results`);
      
      for (const video of videos) {
        // Check duplicate
        if (await checkVideoExists(video.videoId)) {
          stats.skippedDuplicate++;
          continue;
        }
        
        // Get duration
        const details = await getVideoDetails(video.videoId);
        if (!details || details.duration < 120) {
          stats.skippedShort++;
          continue;
        }
        
        // AI Analysis
        const analysis = await analyzeVideoWithAI(video, instructorName);
        
        if (!analysis.isInstructional || analysis.qualityScore < 5) {
          stats.skippedNonInstructional++;
          continue;
        }
        
        // Add to database with gemini_status = 'pending'
        try {
          await db.insert(aiVideoKnowledge).values({
            youtubeId: video.videoId,
            videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
            title: video.title,
            techniqueName: analysis.technique || 'General Instruction',
            instructorName: instructorName,
            techniqueType: analysis.techniqueType,
            positionCategory: analysis.positionCategory,
            giOrNogi: analysis.giOrNogi,
            qualityScore: analysis.qualityScore.toString(),
            duration: details.duration,
            thumbnailUrl: video.thumbnailUrl,
            channelName: video.channelTitle,
            createdAt: new Date(),
            geminiStatus: 'pending'
          });
          
          stats.videosAdded++;
          console.log(`      ✅ Added: "${video.title.substring(0, 50)}..."`);
        } catch (insertError: any) {
          if (insertError.message?.includes('duplicate')) {
            stats.skippedDuplicate++;
          } else {
            console.error(`      ❌ Insert error:`, insertError.message);
          }
        }
      }
    } catch (error: any) {
      if (error.message === 'QUOTA_EXHAUSTED') {
        throw error;
      }
      console.error(`   ❌ Search error: ${error.message}`);
    }
  }
  
  stats.afterCount = await getInstructorVideoCount(instructorName);
  console.log(`   📊 Result: ${stats.beforeCount} → ${stats.afterCount} (+${stats.videosAdded})`);
  
  return stats;
}

async function runMaximumCuration() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🚀 MAXIMUM VIDEO CURATION - ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`Targeting ${ALL_INSTRUCTORS.length} instructors`);
  console.log(`TIER 1 (10): ${TIER_1_INSTRUCTORS.join(', ')}`);
  console.log(`TIER 2 (10): ${TIER_2_INSTRUCTORS.join(', ')}`);
  
  // Get starting count
  const startCount = await db.select({ count: drizzleCount() })
    .from(aiVideoKnowledge);
  const startingTotal = startCount[0]?.count || 0;
  console.log(`\n📊 Starting video library: ${startingTotal} videos`);
  
  const allStats: CurationStats[] = [];
  let quotaExhausted = false;
  
  // Process all instructors
  for (const instructor of ALL_INSTRUCTORS) {
    try {
      const stats = await curateInstructor(instructor);
      allStats.push(stats);
    } catch (error: any) {
      if (error.message === 'QUOTA_EXHAUSTED') {
        console.log(`\n⚠️ QUOTA EXHAUSTED after ${allStats.length} instructors`);
        quotaExhausted = true;
        break;
      }
      console.error(`Error curating ${instructor}:`, error.message);
    }
  }
  
  // Final report
  const endCount = await db.select({ count: drizzleCount() })
    .from(aiVideoKnowledge);
  const endingTotal = endCount[0]?.count || 0;
  
  const pendingCount = await db.select({ count: drizzleCount() })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.geminiStatus, 'pending'));
  const pendingTotal = pendingCount[0]?.count || 0;
  
  const totalAdded = allStats.reduce((sum, s) => sum + s.videosAdded, 0);
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📊 FINAL CURATION REPORT`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`\n📈 SUMMARY:`);
  console.log(`   Total NEW videos added: ${totalAdded}`);
  console.log(`   Instructors processed: ${allStats.length}/${ALL_INSTRUCTORS.length}`);
  console.log(`   Quota exhausted: ${quotaExhausted ? 'YES' : 'NO'}`);
  console.log(`   API quota used: ~${quotaUsed} units`);
  
  console.log(`\n📋 BREAKDOWN BY INSTRUCTOR:`);
  allStats.sort((a, b) => b.videosAdded - a.videosAdded);
  for (const stat of allStats) {
    console.log(`   ${stat.instructor}: ${stat.beforeCount} → ${stat.afterCount} (+${stat.videosAdded})`);
  }
  
  console.log(`\n📊 LIBRARY TOTALS:`);
  console.log(`   Before: ${startingTotal} videos`);
  console.log(`   After: ${endingTotal} videos`);
  console.log(`   Net added: ${endingTotal - startingTotal}`);
  
  console.log(`\n⏳ PENDING GEMINI PROCESSING:`);
  console.log(`   Videos awaiting knowledge extraction: ${pendingTotal}`);
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`✅ CURATION COMPLETE`);
  console.log(`${'═'.repeat(70)}\n`);
  
  return {
    totalAdded,
    instructorsProcessed: allStats.length,
    quotaExhausted,
    stats: allStats,
    libraryBefore: startingTotal,
    libraryAfter: endingTotal,
    pendingGemini: pendingTotal
  };
}

// Run if executed directly
runMaximumCuration()
  .then(result => {
    console.log('\nExiting with result:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
