/**
 * GI-SPECIFIC TECHNIQUE CURATION
 * 
 * Targets gi attacks and defenses from trusted instructors:
 * - Collar chokes, lapel guards, grip fighting
 * - Spider/lasso/worm guard techniques
 * - Berimbolo, bow and arrow, DLR sweeps
 * 
 * IMPORTANT: Uses SUPABASE_DATABASE_URL for production database
 * 
 * Usage: npx tsx server/scripts/gi-technique-curation.ts
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

const GI_SPECIALISTS = [
  'Roger Gracie',
  'Xande Ribeiro',
  'Bernardo Faria',
  'Keenan Cornelius',
  'Romulo Barral',
  'Leandro Lo',
  'Meregali',
  'Cobrinha',
  'Rafael Mendes',
  'Gui Mendes',
  'Marcelo Garcia',
  'Andre Galvao',
  'Lucas Lepri',
  'Marcus Buchecha',
  'Cyborg Abreu'
];

const GI_ATTACK_SEARCHES = [
  'cross collar choke',
  'baseball bat choke',
  'bow and arrow choke',
  'loop choke',
  'ezekiel choke gi',
  'collar drag',
  'lapel guard',
  'worm guard',
  'lasso guard',
  'spider guard',
  'collar sleeve guard',
  'de la riva sweep',
  'berimbolo',
  'lapel choke',
  'paper cutter choke',
  'clock choke',
  'brabo choke gi'
];

const GI_DEFENSE_SEARCHES = [
  'grip fighting',
  'grip breaks',
  'collar grip defense',
  'lapel guard passing',
  'spider guard pass',
  'lasso guard pass',
  'worm guard defense',
  'de la riva guard pass',
  'strip grips',
  'defending collar chokes',
  'posture closed guard gi'
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

async function searchYouTube(query: string, maxResults: number = 20): Promise<VideoSearchResult[]> {
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
  isGiTechnique: boolean;
  technique: string;
  techniqueType: string;
  positionCategory: string;
  qualityScore: number;
  skillLevel: string;
  instructorName: string | null;
}> {
  const prompt = `Analyze this BJJ video for GI-SPECIFIC content:

Title: ${video.title}
Channel: ${video.channelTitle}
Description: ${video.description.slice(0, 600)}

CRITICAL: We are looking for GI-SPECIFIC techniques.
This includes:
- Collar chokes (cross collar, baseball bat, bow and arrow, loop, paper cutter, clock)
- Lapel-based guards and attacks (worm guard, lapel guard, squid guard)
- Gi grips and grip fighting
- Spider guard, lasso guard, collar sleeve guard
- De la Riva sweeps and berimbolo
- Gi-specific defenses and guard passes

NOT gi-specific: leg locks (unless gi-specific setup), no-gi techniques, MMA

Respond with JSON only:
{
  "isInstructional": boolean,
  "isGiTechnique": boolean - TRUE if uses gi grips/collar/lapel as core mechanic,
  "technique": "specific technique name",
  "techniqueType": "submission|pass|sweep|escape|takedown|guard|defense|grip_fighting|transition",
  "positionCategory": "closed_guard|open_guard|half_guard|mount|side_control|back|standing|spider|lasso|dlr|worm",
  "qualityScore": 1-10,
  "skillLevel": "beginner|intermediate|advanced",
  "instructorName": "instructor name or null"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
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
    isGiTechnique: false,
    technique: '',
    techniqueType: '',
    positionCategory: '',
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
      giOrNogi: 'gi',
      qualityScore: analysis.qualityScore.toString(),
      channelName: video.channelTitle,
      thumbnailUrl: video.thumbnailUrl,
      durationSeconds: details.duration,
      viewCount: details.viewCount,
      likeCount: details.likeCount,
      skillLevel: analysis.skillLevel,
      status: 'active',
      keyTimestamps: [],
      tags: ['gi', 'gi_technique']
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

async function getCurrentGiCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(and(sql`
      LOWER(gi_or_nogi) = 'gi'
      OR LOWER(title) LIKE '%collar choke%'
      OR LOWER(title) LIKE '%lapel%'
      OR LOWER(title) LIKE '%spider guard%'
      OR LOWER(title) LIKE '%lasso guard%'
      OR LOWER(title) LIKE '%worm guard%'
      OR LOWER(title) LIKE '%bow and arrow%'
      OR LOWER(title) LIKE '%berimbolo%'
    `, eq(aiVideoKnowledge.status, 'active')));
  return Number(result[0].count);
}

async function getPendingKnowledgeCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'pending_knowledge'));
  return Number(result[0].count);
}

async function runGiCuration(): Promise<CurationStats> {
  console.log('\n' + '═'.repeat(80));
  console.log('🥋 GI-SPECIFIC TECHNIQUE CURATION');
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
  
  const startCount = await getCurrentGiCount();
  console.log(`📊 Starting gi-specific video count: ${startCount}\n`);
  
  console.log('👨‍🏫 INSTRUCTORS BEING SEARCHED:');
  GI_SPECIALISTS.forEach(i => console.log(`   • ${i}`));
  console.log('\n');
  
  console.log('🔍 GI ATTACK SEARCHES:');
  GI_ATTACK_SEARCHES.forEach(s => console.log(`   • ${s}`));
  console.log('\n🛡️ GI DEFENSE SEARCHES:');
  GI_DEFENSE_SEARCHES.forEach(s => console.log(`   • ${s}`));
  console.log('\n');
  
  const allSearches = [...GI_ATTACK_SEARCHES, ...GI_DEFENSE_SEARCHES];
  
  try {
    for (const instructor of GI_SPECIALISTS) {
      if (quotaUsed >= QUOTA_LIMIT * 0.9) {
        console.log('⚠️  Approaching quota limit, stopping');
        break;
      }
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📹 Processing: ${instructor}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      for (const searchTerm of allSearches.slice(0, 12)) {
        if (quotaUsed >= QUOTA_LIMIT * 0.9) break;
        
        const query = `${instructor} ${searchTerm}`;
        console.log(`  🔍 "${query}"`);
        
        const videos = await searchYouTube(query, 8);
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
          
          if (!analysis.isInstructional || !analysis.isGiTechnique) {
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
        
        await new Promise(r => setTimeout(r, 250));
      }
    }
    
    console.log('\n📚 PHASE 2: Generic Gi Technique Searches\n');
    
    const genericQueries = [
      'BJJ gi choke instructional',
      'lapel guard tutorial',
      'spider guard sweep',
      'berimbolo technique',
      'grip fighting BJJ',
      'collar choke details',
      'bow and arrow choke tutorial',
      'worm guard system',
      'de la riva guard sweep',
      'lasso guard attack'
    ];
    
    for (const query of genericQueries) {
      if (quotaUsed >= QUOTA_LIMIT * 0.95) break;
      
      console.log(`🔍 "${query}"`);
      
      const videos = await searchYouTube(query, 15);
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
        
        if (!analysis.isInstructional || !analysis.isGiTechnique) {
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
      
      await new Promise(r => setTimeout(r, 250));
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
  console.log('║      🥋 GI-SPECIFIC TECHNIQUE CURATION                                      ║');
  console.log('║  Collar Chokes • Lapel Guards • Spider • Berimbolo • Grip Fighting         ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
  
  const stats = await runGiCuration();
  
  const finalCount = await getCurrentGiCount();
  const pendingKnowledge = await getPendingKnowledgeCount();
  
  console.log('\n' + '═'.repeat(80));
  console.log('📊 FINAL RESULTS');
  console.log('═'.repeat(80));
  console.log(`\n✅ Videos Added: ${stats.addedToDatabase}`);
  console.log(`📹 Videos Scanned: ${stats.videosScanned}`);
  console.log(`🔍 Passed Quality Filter: ${stats.passedQualityFilter}`);
  console.log(`⏭️  Duplicates Skipped: ${stats.duplicatesSkipped}`);
  console.log(`❌ Rejected (non-gi/non-instructional): ${stats.rejectedNonInstructional}`);
  console.log(`📊 Quota Used: ${stats.quotaUsed}/${QUOTA_LIMIT}`);
  console.log(`\n📈 Gi-Specific Videos: ${finalCount} (started at 639)`);
  
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
