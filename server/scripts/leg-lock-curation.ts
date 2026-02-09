/**
 * LEG LOCK FOCUSED CURATION
 * 
 * Targets leg entanglement content from trusted instructors
 * 
 * IMPORTANT: Always uses SUPABASE_DATABASE_URL for production database
 * 
 * Usage: npx tsx server/scripts/leg-lock-curation.ts
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiVideoKnowledge } from '@shared/schema';
import { sql, eq, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import * as schema from '@shared/schema';

// ═══════════════════════════════════════════════════════════════
// ALWAYS USE SUPABASE (PRODUCTION) DATABASE
// ═══════════════════════════════════════════════════════════════
const databaseUrl = process.env.SUPABASE_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('SUPABASE_DATABASE_URL is required for curation scripts');
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

// Prioritized leg lock instructors
const LEG_LOCK_INSTRUCTORS = [
  'Craig Jones',
  'Lachlan Giles',
  'Dean Lister',
  'John Danaher',
  'Mikey Musumeci',
  'Gordon Ryan',
  'Eddie Cummings',
  'Garry Tonon',
  'Nicky Ryan',
  'Robert Degle',
  'Oliver Taza',
  'Ethan Crelinsten'
];

// Secondary instructors who also teach leg locks
const SECONDARY_INSTRUCTORS = [
  'Ryan Hall',
  'Geo Martinez',
  'Eddie Bravo',
  'Rousimar Palhares',
  'Masakazu Imanari',
  'Reilly Bodycomb',
  'Rob Biernacki'
];

// Leg lock specific techniques to search
const LEG_LOCK_TECHNIQUES = [
  'heel hook',
  'straight ankle lock',
  'ankle lock',
  'knee bar',
  'kneebar',
  'toe hold',
  'ashi garami',
  'inside sankaku',
  'outside ashi',
  '50/50 leg locks',
  'saddle position',
  'leg entanglement',
  'leg lock defense',
  'leg lock escape',
  'calf slicer',
  'honey hole',
  'inside heel hook',
  'outside heel hook',
  'estima lock',
  'back step leg lock',
  'reverse ashi',
  'leg pummeling'
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
const QUALITY_THRESHOLD = 6.5; // Lower threshold for leg locks since content is rarer
const MIN_DURATION_SECONDS = 120; // 2 minutes
const MAX_DURATION_SECONDS = 3600; // 60 minutes (longer for leg lock content)

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
  technique: string;
  techniqueType: string;
  positionCategory: string;
  giOrNogi: string;
  qualityScore: number;
  skillLevel: string;
  instructorName: string | null;
  isLegLock: boolean;
}> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Analyze this BJJ video for leg lock/entanglement content:

Title: "${video.title}"
Channel: "${video.channelTitle}"
Description: "${video.description.substring(0, 300)}"

Respond in JSON ONLY:
{
  "isInstructional": true/false (is this a BJJ/grappling TECHNIQUE TUTORIAL - reject compilations, highlights, match footage, vlogs, podcasts),
  "isLegLock": true/false (is this specifically about leg locks, leg entanglements, or ashi garami positions?),
  "technique": "specific technique name (e.g. Inside Heel Hook, Straight Ankle Lock, Saddle Entry)",
  "techniqueType": "submission|sweep|pass|escape|takedown|guard|position|defense|drill|concept",
  "positionCategory": "leg_entanglement|50_50|ashi_garami|saddle|single_leg_x|k_guard|butterfly|standing|other",
  "giOrNogi": "gi|nogi|both",
  "qualityScore": 1-10 (instructional value, clarity, teaching quality),
  "skillLevel": "beginner|intermediate|advanced",
  "instructorName": "name of instructor if identifiable, null otherwise"
}`
      }]
    });
    
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { 
      isInstructional: false, 
      isLegLock: false,
      technique: '', 
      techniqueType: 'concept', 
      positionCategory: 'other', 
      giOrNogi: 'both', 
      qualityScore: 0,
      skillLevel: 'intermediate',
      instructorName: null
    };
  } catch (error) {
    console.error('AI analysis error:', error);
    return { 
      isInstructional: false, 
      isLegLock: false,
      technique: '', 
      techniqueType: 'concept', 
      positionCategory: 'other', 
      giOrNogi: 'both', 
      qualityScore: 0,
      skillLevel: 'intermediate',
      instructorName: null
    };
  }
}

async function addVideoToDatabase(
  video: VideoSearchResult,
  analysis: Awaited<ReturnType<typeof analyzeVideoWithAI>>,
  details: { duration: number; viewCount: number; likeCount: number }
): Promise<boolean> {
  try {
    await db.insert(aiVideoKnowledge).values({
      youtubeId: video.videoId,
      videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      title: video.title,
      techniqueName: analysis.technique,
      instructorName: analysis.instructorName || video.channelTitle,
      channelName: video.channelTitle,
      duration: details.duration,
      uploadDate: new Date(video.publishedAt),
      viewCount: details.viewCount,
      likeCount: details.likeCount,
      thumbnailUrl: video.thumbnailUrl,
      positionCategory: analysis.positionCategory,
      techniqueType: analysis.techniqueType,
      giOrNogi: analysis.giOrNogi,
      qualityScore: analysis.qualityScore.toString(),
      beltLevel: [analysis.skillLevel],
      status: 'pending_gemini', // Queue for Gemini analysis
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return true;
  } catch (error: any) {
    if (error.message?.includes('duplicate')) {
      return false;
    }
    console.error('DB insert error:', error.message);
    return false;
  }
}

async function getCurrentLegLockCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(and(sql`
      LOWER(title) LIKE ANY(ARRAY[
        '%heel hook%', '%ankle lock%', '%knee bar%', '%kneebar%', 
        '%toe hold%', '%ashi garami%', '%leg lock%', '%leg entangle%', 
        '%saddle%', '%50/50%', '%inside sankaku%', '%outside ashi%',
        '%honey hole%', '%calf slicer%', '%estima lock%'
      ])
      OR position_category LIKE '%leg%'
      OR position_category = 'ashi_garami'
      OR position_category = '50_50'
    `, eq(aiVideoKnowledge.status, 'active')));
  return Number(result[0].count);
}

async function runLegLockCuration(): Promise<CurationStats> {
  console.log('\n' + '═'.repeat(80));
  console.log('🦵 LEG LOCK FOCUSED CURATION');
  console.log('═'.repeat(80) + '\n');
  
  const stats: CurationStats = {
    videosScanned: 0,
    passedQualityFilter: 0,
    addedToDatabase: 0,
    duplicatesSkipped: 0,
    rejectedNonInstructional: 0,
    quotaUsed: 0,
    byTechnique: {}
  };
  
  const processedVideoIds = new Set<string>();
  
  // Show current leg lock count
  const currentCount = await getCurrentLegLockCount();
  console.log(`📊 Current leg lock videos in library: ${currentCount}\n`);
  
  // List instructors being searched
  console.log('👨‍🏫 INSTRUCTORS BEING SEARCHED:');
  console.log('   Priority (leg lock specialists):');
  LEG_LOCK_INSTRUCTORS.forEach(i => console.log(`   • ${i}`));
  console.log('   Secondary:');
  SECONDARY_INSTRUCTORS.forEach(i => console.log(`   • ${i}`));
  console.log('\n');
  
  try {
    // Phase 1: Search priority instructors + each leg lock technique
    console.log('🔥 PHASE 1: Priority Instructors + Leg Lock Techniques\n');
    
    for (const instructor of LEG_LOCK_INSTRUCTORS) {
      if (quotaUsed >= QUOTA_LIMIT * 0.9) {
        console.log('⚠️  Approaching quota limit, stopping');
        break;
      }
      
      for (const technique of LEG_LOCK_TECHNIQUES.slice(0, 8)) { // Top techniques
        if (quotaUsed >= QUOTA_LIMIT * 0.9) break;
        
        const query = `${instructor} ${technique} BJJ`;
        console.log(`🔍 Searching: "${query}"`);
        const videos = await searchYouTube(query, 15);
        
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
          
          if (!analysis.isInstructional || !analysis.isLegLock) {
            stats.rejectedNonInstructional++;
            continue;
          }
          
          if (analysis.qualityScore < QUALITY_THRESHOLD) {
            continue;
          }
          
          stats.passedQualityFilter++;
          
          if (await addVideoToDatabase(video, analysis, details)) {
            stats.addedToDatabase++;
            const techniqueKey = analysis.technique || technique;
            stats.byTechnique[techniqueKey] = (stats.byTechnique[techniqueKey] || 0) + 1;
            console.log(`  ✅ Added: ${video.title.substring(0, 55)}... (${analysis.qualityScore}/10)`);
          }
          
          if (stats.videosScanned % 50 === 0) {
            console.log(`\n📊 Progress: Scanned ${stats.videosScanned}, Added ${stats.addedToDatabase}, Quota: ${quotaUsed}/${QUOTA_LIMIT}\n`);
          }
        }
        
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    // Phase 2: Search secondary instructors
    console.log('\n📚 PHASE 2: Secondary Instructors\n');
    
    for (const instructor of SECONDARY_INSTRUCTORS) {
      if (quotaUsed >= QUOTA_LIMIT * 0.95) break;
      
      const query = `${instructor} leg lock instructional`;
      console.log(`🔍 Searching: "${query}"`);
      const videos = await searchYouTube(query, 20);
      
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
        
        if (!analysis.isInstructional || !analysis.isLegLock) {
          stats.rejectedNonInstructional++;
          continue;
        }
        
        if (analysis.qualityScore < QUALITY_THRESHOLD) {
          continue;
        }
        
        stats.passedQualityFilter++;
        
        if (await addVideoToDatabase(video, analysis, details)) {
          stats.addedToDatabase++;
          stats.byTechnique[analysis.technique] = (stats.byTechnique[analysis.technique] || 0) + 1;
          console.log(`  ✅ Added: ${video.title.substring(0, 55)}... (${analysis.qualityScore}/10)`);
        }
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    // Phase 3: Generic leg lock searches
    console.log('\n📚 PHASE 3: Generic Leg Lock Searches\n');
    
    const genericQueries = [
      'leg lock instructional BJJ',
      'ashi garami system tutorial',
      'heel hook entries breakdown',
      'inside sankaku position BJJ',
      'saddle leg lock tutorial',
      'leg lock defense BJJ',
      'leg lock escape instructional'
    ];
    
    for (const query of genericQueries) {
      if (quotaUsed >= QUOTA_LIMIT * 0.98) break;
      
      console.log(`🔍 Searching: "${query}"`);
      const videos = await searchYouTube(query, 30);
      
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
        
        if (!analysis.isInstructional || !analysis.isLegLock) {
          stats.rejectedNonInstructional++;
          continue;
        }
        
        if (analysis.qualityScore < QUALITY_THRESHOLD) {
          continue;
        }
        
        stats.passedQualityFilter++;
        
        if (await addVideoToDatabase(video, analysis, details)) {
          stats.addedToDatabase++;
          stats.byTechnique[analysis.technique] = (stats.byTechnique[analysis.technique] || 0) + 1;
          console.log(`  ✅ Added: ${video.title.substring(0, 55)}... (${analysis.qualityScore}/10)`);
        }
      }
      
      await new Promise(r => setTimeout(r, 500));
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
  console.log('║           🦵 LEG LOCK FOCUSED VIDEO CURATION                               ║');
  console.log('║     Heel Hooks • Ankle Locks • Knee Bars • Ashi Garami                     ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
  
  const stats = await runLegLockCuration();
  
  // Final counts
  const finalCount = await getCurrentLegLockCount();
  const pendingGemini = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'pending_gemini'));
  
  console.log('\n' + '═'.repeat(80));
  console.log('📊 FINAL RESULTS');
  console.log('═'.repeat(80));
  console.log(`\nVideos scanned: ${stats.videosScanned}`);
  console.log(`Passed quality filter: ${stats.passedQualityFilter}`);
  console.log(`Added to database: ${stats.addedToDatabase}`);
  console.log(`Duplicates skipped: ${stats.duplicatesSkipped}`);
  console.log(`Rejected (non-instructional): ${stats.rejectedNonInstructional}`);
  console.log(`Quota used: ${stats.quotaUsed}/${QUOTA_LIMIT}`);
  
  console.log('\n📍 BREAKDOWN BY TECHNIQUE:');
  const sortedTechniques = Object.entries(stats.byTechnique)
    .sort((a, b) => b[1] - a[1]);
  for (const [technique, count] of sortedTechniques) {
    console.log(`  ${technique}: ${count} videos`);
  }
  
  console.log(`\n🦵 Total leg lock videos now: ${finalCount}`);
  console.log(`⏳ Queue for Gemini analysis: ${Number(pendingGemini[0].count)} videos`);
  
  console.log('\n' + '═'.repeat(80));
  console.log('✅ LEG LOCK CURATION COMPLETE');
  console.log('═'.repeat(80));
  
  // Close database connection
  await postgresClient.end();
  console.log('🔌 Database connection closed');
}

main().catch(console.error).finally(() => {
  setTimeout(() => process.exit(0), 1000);
});
