/**
 * LEG LOCK DEFENSE & ESCAPE FOCUSED CURATION
 * 
 * Specifically targets:
 * - Heel hook defense/escape
 * - Ankle lock defense/escape
 * - Toe hold defense/escape
 * - Knee bar defense/escape
 * - Escaping ashi garami, saddle, 50/50
 * - Boot/knee line defense
 * 
 * IMPORTANT: Uses SUPABASE_DATABASE_URL for production database
 * 
 * Usage: npx tsx server/scripts/leg-lock-defense-curation.ts
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiVideoKnowledge } from '@shared/schema';
import { sql, eq, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import * as schema from '@shared/schema';

const databaseUrl = process.env.SUPABASE_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('SUPABASE_DATABASE_URL is required');
}

const postgresClient = postgres(databaseUrl, {
  max: 5,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
});

const db = drizzle(postgresClient, { schema });
console.log('🔗 Connected to Supabase production database');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const anthropic = new Anthropic();

const LEG_LOCK_SPECIALISTS = [
  'Craig Jones',
  'Lachlan Giles',
  'Dean Lister',
  'John Danaher',
  'Mikey Musumeci',
  'Gordon Ryan',
  'Robert Degle',
  'Oliver Taza',
  'Garry Tonon',
  'Eddie Cummings',
  'Nicky Ryan',
  'Ethan Crelinsten',
  'Ryan Hall',
  'Rob Biernacki'
];

const DEFENSE_ESCAPE_SEARCHES = [
  'heel hook defense',
  'heel hook escape',
  'ankle lock defense',
  'ankle lock escape',
  'toe hold defense',
  'toe hold escape',
  'knee bar defense',
  'knee bar escape',
  'kneebar defense',
  'kneebar escape',
  'leg lock prevention',
  'leg lock defense',
  'leg lock escape',
  'foot lock defense',
  'boot defense BJJ',
  'clearing the knee line',
  'escaping ashi garami',
  'escaping saddle',
  'escaping 50/50',
  'escape inside sankaku',
  'leg entanglement escape',
  'defending leg locks',
  'leg lock counters'
];

interface VideoSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
  description: string;
}

interface CurationStats {
  videosScanned: number;
  passedQualityFilter: number;
  addedToDatabase: number;
  duplicatesSkipped: number;
  rejectedNonInstructional: number;
  quotaUsed: number;
  byTechnique: Record<string, number>;
}

let quotaUsed = 0;
const QUOTA_LIMIT = 10000;
const QUALITY_THRESHOLD = 6.0;
const MIN_DURATION_SECONDS = 90;
const MAX_DURATION_SECONDS = 3600;

async function searchYouTube(query: string, maxResults: number = 25): Promise<VideoSearchResult[]> {
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
  url.searchParams.set('order', 'relevance');
  url.searchParams.set('key', YOUTUBE_API_KEY);
  
  try {
    const response = await fetch(url.toString());
    quotaUsed += 100;
    
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
      publishedAt: item.snippet.publishedAt,
      description: item.snippet.description || ''
    }));
  } catch (error: any) {
    if (error.message === 'QUOTA_EXHAUSTED') throw error;
    console.error(`Search error for "${query}":`, error.message);
    return [];
  }
}

async function getVideoDetails(videoId: string): Promise<{ duration: number; viewCount: number; likeCount: number } | null> {
  if (!YOUTUBE_API_KEY) return null;
  if (quotaUsed >= QUOTA_LIMIT) throw new Error('QUOTA_EXHAUSTED');
  
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'contentDetails,statistics');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', YOUTUBE_API_KEY);
  
  try {
    const response = await fetch(url.toString());
    quotaUsed += 1;
    
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
    
    return {
      duration: hours * 3600 + minutes * 60 + seconds,
      viewCount: parseInt(item.statistics?.viewCount || '0'),
      likeCount: parseInt(item.statistics?.likeCount || '0')
    };
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

async function analyzeVideoWithAI(video: VideoSearchResult): Promise<{
  isInstructional: boolean;
  isDefenseOrEscape: boolean;
  technique: string;
  techniqueType: string;
  positionCategory: string;
  giOrNogi: string;
  qualityScore: number;
  skillLevel: string;
  instructorName: string | null;
}> {
  const prompt = `Analyze this BJJ video for leg lock DEFENSE/ESCAPE content:

Title: ${video.title}
Channel: ${video.channelTitle}
Description: ${video.description.slice(0, 600)}

CRITICAL: We are looking for DEFENSE and ESCAPE content specifically.
This includes:
- How to defend/escape heel hooks, ankle locks, toe holds, knee bars
- How to escape ashi garami, saddle, 50/50 positions
- Boot/knee line defense
- Leg lock prevention strategies
- Counters to leg attacks

Respond with JSON only:
{
  "isInstructional": boolean,
  "isDefenseOrEscape": boolean - TRUE if teaches defense/escape from leg locks or leg entanglements,
  "technique": "specific technique name (e.g., 'heel hook defense', 'saddle escape')",
  "techniqueType": "defense|escape|counter|prevention",
  "positionCategory": "ashi_garami|saddle|50_50|inside_sankaku|other_leg_entanglement|standing",
  "giOrNogi": "gi|nogi|both",
  "qualityScore": 1-10,
  "skillLevel": "beginner|intermediate|advanced",
  "instructorName": "instructor name or null"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
  } catch (error) {
    console.error('AI analysis error:', error);
  }

  return {
    isInstructional: false,
    isDefenseOrEscape: false,
    technique: '',
    techniqueType: '',
    positionCategory: '',
    giOrNogi: 'nogi',
    qualityScore: 0,
    skillLevel: 'intermediate',
    instructorName: null
  };
}

async function addVideoToDatabase(
  video: VideoSearchResult,
  analysis: any,
  details: { duration: number; viewCount: number; likeCount: number }
): Promise<{ success: boolean; videoId?: number }> {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
    
    const result = await db.insert(aiVideoKnowledge).values({
      youtubeId: video.videoId,
      videoUrl,
      title: video.title,
      techniqueName: analysis.technique,
      instructorName: analysis.instructorName || video.channelTitle,
      techniqueType: analysis.techniqueType,
      positionCategory: analysis.positionCategory,
      giOrNogi: analysis.giOrNogi,
      qualityScore: analysis.qualityScore.toString(),
      channelName: video.channelTitle,
      thumbnailUrl: video.thumbnailUrl,
      durationSeconds: details.duration,
      viewCount: details.viewCount,
      likeCount: details.likeCount,
      skillLevel: analysis.skillLevel,
      status: 'active',
      keyTimestamps: [],
      tags: ['leg_lock', 'defense', 'escape']
    }).returning({ id: aiVideoKnowledge.id });
    
    return { success: true, videoId: result[0]?.id };
  } catch (error: any) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return { success: false };
    }
    console.error('DB insert error:', error.message);
    return { success: false };
  }
}


async function getCurrentDefenseCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(and(sql`
      (LOWER(title) LIKE '%heel hook%' OR LOWER(title) LIKE '%ankle lock%' 
       OR LOWER(title) LIKE '%toe hold%' OR LOWER(title) LIKE '%knee bar%'
       OR LOWER(title) LIKE '%leg lock%' OR LOWER(title) LIKE '%ashi%'
       OR LOWER(title) LIKE '%saddle%' OR LOWER(title) LIKE '%50/50%')
      AND (LOWER(title) LIKE '%defense%' OR LOWER(title) LIKE '%escape%' 
           OR LOWER(title) LIKE '%counter%' OR LOWER(title) LIKE '%prevent%')
    `, eq(aiVideoKnowledge.status, 'active')));
  return Number(result[0].count);
}

async function getPendingGeminiCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'pending_knowledge'));
  return Number(result[0].count);
}

async function runDefenseCuration(): Promise<CurationStats> {
  console.log('\n' + '═'.repeat(80));
  console.log('🛡️  LEG LOCK DEFENSE & ESCAPE FOCUSED CURATION');
  console.log('═'.repeat(80) + '\n');
  
  const stats: CurationStats = {
    videosScanned: 0,
    passedQualityFilter: 0,
    addedToDatabase: 0,
    duplicatesSkipped: 0,
    rejectedNonInstructional: 0,
    quotaUsed: 0,
    byTechnique: {},
  };
  
  const processedVideoIds = new Set<string>();
  
  const startCount = await getCurrentDefenseCount();
  console.log(`📊 Starting defense/escape video count: ${startCount}\n`);
  
  console.log('👨‍🏫 INSTRUCTORS BEING SEARCHED:');
  LEG_LOCK_SPECIALISTS.forEach(i => console.log(`   • ${i}`));
  console.log('\n');
  
  console.log('🔍 SEARCH QUERIES:');
  DEFENSE_ESCAPE_SEARCHES.forEach(s => console.log(`   • ${s}`));
  console.log('\n');
  
  try {
    for (const instructor of LEG_LOCK_SPECIALISTS) {
      if (quotaUsed >= QUOTA_LIMIT * 0.9) {
        console.log('⚠️  Approaching quota limit, stopping');
        break;
      }
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📹 Processing: ${instructor}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      for (const searchTerm of DEFENSE_ESCAPE_SEARCHES.slice(0, 10)) {
        if (quotaUsed >= QUOTA_LIMIT * 0.9) break;
        
        const query = `${instructor} ${searchTerm}`;
        console.log(`  🔍 "${query}"`);
        
        const videos = await searchYouTube(query, 10);
        console.log(`     Found ${videos.length} results`);
        
        for (const video of videos) {
          if (processedVideoIds.has(video.videoId)) continue;
          processedVideoIds.add(video.videoId);
          stats.videosScanned++;
          
          if (await checkVideoExists(video.videoId)) {
            stats.duplicatesSkipped++;
            continue;
          }
          
          const details = await getVideoDetails(video.videoId);
          if (!details) continue;
          
          if (details.duration < MIN_DURATION_SECONDS || details.duration > MAX_DURATION_SECONDS) {
            continue;
          }
          
          const analysis = await analyzeVideoWithAI(video);
          
          if (!analysis.isInstructional || !analysis.isDefenseOrEscape) {
            stats.rejectedNonInstructional++;
            continue;
          }
          
          if (analysis.qualityScore < QUALITY_THRESHOLD) {
            continue;
          }
          
          stats.passedQualityFilter++;
          
          const result = await addVideoToDatabase(video, analysis, details);
          if (result.success) {
            stats.addedToDatabase++;
            const techniqueKey = analysis.technique || searchTerm;
            stats.byTechnique[techniqueKey] = (stats.byTechnique[techniqueKey] || 0) + 1;
            console.log(`     ✅ Added: ${video.title.substring(0, 50)}... (${analysis.qualityScore}/10)`);
            
          }
        }
        
        await new Promise(r => setTimeout(r, 300));
      }
    }
    
    console.log('\n📚 PHASE 2: Generic Defense Searches\n');
    
    for (const query of DEFENSE_ESCAPE_SEARCHES) {
      if (quotaUsed >= QUOTA_LIMIT * 0.95) break;
      
      const fullQuery = `${query} BJJ instructional`;
      console.log(`🔍 "${fullQuery}"`);
      
      const videos = await searchYouTube(fullQuery, 20);
      console.log(`   Found ${videos.length} results`);
      
      for (const video of videos) {
        if (processedVideoIds.has(video.videoId)) continue;
        processedVideoIds.add(video.videoId);
        stats.videosScanned++;
        
        if (await checkVideoExists(video.videoId)) {
          stats.duplicatesSkipped++;
          continue;
        }
        
        const details = await getVideoDetails(video.videoId);
        if (!details) continue;
        
        if (details.duration < MIN_DURATION_SECONDS || details.duration > MAX_DURATION_SECONDS) {
          continue;
        }
        
        const analysis = await analyzeVideoWithAI(video);
        
        if (!analysis.isInstructional || !analysis.isDefenseOrEscape) {
          stats.rejectedNonInstructional++;
          continue;
        }
        
        if (analysis.qualityScore < QUALITY_THRESHOLD) {
          continue;
        }
        
        stats.passedQualityFilter++;
        
        const result = await addVideoToDatabase(video, analysis, details);
        if (result.success) {
          stats.addedToDatabase++;
          stats.byTechnique[analysis.technique] = (stats.byTechnique[analysis.technique] || 0) + 1;
          console.log(`   ✅ Added: ${video.title.substring(0, 50)}... (${analysis.qualityScore}/10)`);
          
        }
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
  } catch (error: any) {
    if (error.message === 'QUOTA_EXHAUSTED') {
      console.log('\n🚫 YouTube API quota exhausted');
    } else {
      console.error('Curation error:', error);
    }
  }
  
  stats.quotaUsed = quotaUsed;
  return stats;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║      🛡️  LEG LOCK DEFENSE & ESCAPE CURATION                                 ║');
  console.log('║  Heel Hook Defense • Ankle Lock Escape • Saddle Escape • Boot Defense     ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
  
  const stats = await runDefenseCuration();
  
  const finalCount = await getCurrentDefenseCount();
  const pendingKnowledge = await getPendingGeminiCount();
  
  console.log('\n' + '═'.repeat(80));
  console.log('📊 FINAL RESULTS');
  console.log('═'.repeat(80));
  console.log(`\n✅ Videos Added: ${stats.addedToDatabase}`);
  console.log(`📹 Videos Scanned: ${stats.videosScanned}`);
  console.log(`🔍 Passed Quality Filter: ${stats.passedQualityFilter}`);
  console.log(`⏭️  Duplicates Skipped: ${stats.duplicatesSkipped}`);
  console.log(`❌ Rejected (non-instructional): ${stats.rejectedNonInstructional}`);
  console.log(`📊 Quota Used: ${stats.quotaUsed}/${QUOTA_LIMIT}`);
  console.log(`\n📈 Defense/Escape Videos: ${finalCount} (started at 15)`);
  
  console.log('\n📋 BREAKDOWN BY TECHNIQUE:');
  Object.entries(stats.byTechnique)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tech, count]) => {
      console.log(`   • ${tech}: ${count}`);
    });
  
  console.log('\n🤖 GEMINI QUEUE STATUS:');
  console.log(`   • Videos pending knowledge extraction: ${pendingKnowledge}`);
  
  console.log('\n' + '═'.repeat(80) + '\n');
  
  await postgresClient.end();
}

main().catch(console.error);
