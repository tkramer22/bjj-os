/**
 * TRUSTED INSTRUCTOR VIDEO CURATION + GEMINI ANALYSIS
 * 
 * Phase 1: Video Discovery from trusted instructors
 * Phase 2: Gemini deep analysis (33 fields)
 * Phase 3: Verification and reporting
 * 
 * IMPORTANT: Always uses SUPABASE_DATABASE_URL for production database
 * 
 * Usage: npx tsx server/scripts/trusted-instructor-curation.ts
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiVideoKnowledge } from '@shared/schema';
import { sql, eq, isNull, or, and } from 'drizzle-orm';
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

// FULL LIST: All trusted instructors for comprehensive curation
const TRUSTED_INSTRUCTORS = [
  // Tier 1 - Legends & High Volume
  'John Danaher',
  'Gordon Ryan',
  'Lachlan Giles',
  'Craig Jones',
  'Mikey Musumeci',
  'Bernardo Faria',
  'Andre Galvao',
  'Marcelo Garcia',
  'Roger Gracie',
  'Keenan Cornelius',
  // Tier 2 - Elite Competitors
  'Gui Mendes',
  'Rafa Mendes',
  'Ffion Davies',
  'Giancarlo Bodoni',
  'Dante Leon',
  'Nicholas Meregali',
  'Cobrinha',
  'Leandro Lo',
  'Bruno Malfacine',
  'Rodolfo Vieira',
  'Buchecha',
  'Demian Maia',
  'Garry Tonon',
  'Lucas Lepri',
  'Xande Ribeiro',
  'Saulo Ribeiro',
  'Felipe Pena',
  'Kaynan Duarte',
  'Victor Hugo',
  'Tainan Dalpra',
  'Mica Galvao',
  // Tier 3 - Educators & Content Creators
  'Eddie Bravo',
  'Robert Degle',
  'Jon Thomas',
  'Jordan Teaches Jiujitsu',
  'Priit Mihkelson',
  'Chris Paines',
  'Karel Pravec',
  'Alec Baulding',
  'Andrew Wiltse',
  'Nicholas Gregoriades',
  'Rob Biernacki',
  'Ryan Hall',
  'Tom DeBlass',
  'Travis Stevens',
  'JT Torres',
  'Aaron Benzrihem',
  'Tommy Langaker',
  'Estevan Martinez',
  'Chewjitsu',
  'Stephan Kesting',
  'Firas Zahabi',
  'Cyborg Abreu',
  'Paulo Miyao',
  'Joao Miyao',
  'Jean Jacques Machado',
  'Rigan Machado',
  'Adam Wardzinski',
  'Renato Canuto',
  'Vagner Rocha',
  'Rafael Lovato Jr',
  'Pablo Silva',
  'Rubens Charles Cobrinha',
  'Edwin Najmi',
  'Geo Martinez',
  'Nicky Ryan',
  'Nicky Rodriguez',
  'Robert Drysdale'
];

const TECHNIQUE_QUERIES = [
  'BJJ guard passing instructional',
  'BJJ submission tutorial',
  'BJJ escape technique',
  'no gi grappling instructional',
  'gi BJJ technique breakdown',
  'half guard BJJ tutorial',
  'mount escape BJJ',
  'back take BJJ instructional',
  'leg lock tutorial BJJ',
  'closed guard BJJ technique',
  'open guard passing',
  'spider guard tutorial',
  'lasso guard BJJ',
  'de la riva guard instructional',
  'x guard tutorial',
  'single leg x BJJ',
  'butterfly guard sweep',
  'wrestling for BJJ',
  'takedowns for jiu jitsu',
  'baratoplata tutorial',
  'baratoplata setup',
  'baratoplata BJJ technique'
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
}

let quotaUsed = 0;
const QUOTA_LIMIT = 10000;
const QUALITY_THRESHOLD_TRUSTED = 7.0;
const QUALITY_THRESHOLD_NEW = 7.5;
const MIN_DURATION_SECONDS = 180; // 3 minutes
const MAX_DURATION_SECONDS = 2700; // 45 minutes

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

function isTrustedInstructor(channelTitle: string, title: string): string | null {
  const combined = `${channelTitle} ${title}`.toLowerCase();
  for (const instructor of TRUSTED_INSTRUCTORS) {
    if (combined.includes(instructor.toLowerCase())) {
      return instructor;
    }
  }
  return null;
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
}> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Analyze this BJJ video for our instructional library:

Title: "${video.title}"
Channel: "${video.channelTitle}"
Description: "${video.description.substring(0, 300)}"

Respond in JSON ONLY:
{
  "isInstructional": true/false (is this a BJJ/grappling TECHNIQUE TUTORIAL - reject compilations, highlights, match footage, vlogs, podcasts, news, entertainment),
  "technique": "specific technique name (e.g. Armbar from Guard, Knee Cut Pass)",
  "techniqueType": "submission|sweep|pass|escape|takedown|guard|position|defense|drill|concept",
  "positionCategory": "guard|mount|side_control|back|half_guard|closed_guard|open_guard|standing|turtle|other",
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
      status: 'active',
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

async function runPhase1(): Promise<CurationStats> {
  console.log('\n' + '═'.repeat(80));
  console.log('PHASE 1: VIDEO DISCOVERY & CURATION');
  console.log('═'.repeat(80) + '\n');
  
  const stats: CurationStats = {
    videosScanned: 0,
    passedQualityFilter: 0,
    addedToDatabase: 0,
    duplicatesSkipped: 0,
    rejectedNonInstructional: 0,
    quotaUsed: 0
  };
  
  const processedVideoIds = new Set<string>();
  
  try {
    // Phase 1a: Search by trusted instructors
    console.log('📚 Searching by trusted instructors...\n');
    
    for (const instructor of TRUSTED_INSTRUCTORS) {
      if (quotaUsed >= QUOTA_LIMIT * 0.9) {
        console.log('⚠️  Approaching quota limit, stopping instructor search');
        break;
      }
      
      const queries = [
        `${instructor} BJJ instructional`,
        `${instructor} technique breakdown`,
        `${instructor} jiu jitsu tutorial`
      ];
      
      for (const query of queries) {
        if (quotaUsed >= QUOTA_LIMIT * 0.9) break;
        
        console.log(`🔍 Searching: "${query}"`);
        const videos = await searchYouTube(query, 25);
        
        for (const video of videos) {
          if (processedVideoIds.has(video.videoId)) continue;
          processedVideoIds.add(video.videoId);
          stats.videosScanned++;
          
          // Check duplicate
          if (await checkVideoExists(video.videoId)) {
            stats.duplicatesSkipped++;
            continue;
          }
          
          // Get video details
          const details = await getVideoDetails(video.videoId);
          if (!details) continue;
          
          // Duration filter
          if (details.duration < MIN_DURATION_SECONDS || details.duration > MAX_DURATION_SECONDS) {
            continue;
          }
          
          // AI analysis
          const analysis = await analyzeVideoWithAI(video);
          
          if (!analysis.isInstructional) {
            stats.rejectedNonInstructional++;
            continue;
          }
          
          // Quality threshold (lower for trusted instructors)
          const threshold = isTrustedInstructor(video.channelTitle, video.title) 
            ? QUALITY_THRESHOLD_TRUSTED 
            : QUALITY_THRESHOLD_NEW;
            
          if (analysis.qualityScore < threshold) {
            continue;
          }
          
          stats.passedQualityFilter++;
          
          // Add to database
          if (await addVideoToDatabase(video, analysis, details)) {
            stats.addedToDatabase++;
            console.log(`  ✅ Added: ${video.title.substring(0, 60)}... (${analysis.qualityScore}/10)`);
          }
          
          // Progress update every 50 videos
          if (stats.videosScanned % 50 === 0) {
            console.log(`\n📊 Progress: Scanned ${stats.videosScanned}, Added ${stats.addedToDatabase}, Quota: ${quotaUsed}/${QUOTA_LIMIT}\n`);
          }
        }
        
        // Rate limiting
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    // Phase 1b: Search by technique queries
    console.log('\n📚 Searching by technique queries...\n');
    
    for (const query of TECHNIQUE_QUERIES) {
      if (quotaUsed >= QUOTA_LIMIT * 0.95) {
        console.log('⚠️  Quota nearly exhausted, stopping');
        break;
      }
      
      console.log(`🔍 Searching: "${query}"`);
      const videos = await searchYouTube(query, 50);
      
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
        
        if (!analysis.isInstructional) {
          stats.rejectedNonInstructional++;
          continue;
        }
        
        const threshold = isTrustedInstructor(video.channelTitle, video.title) 
          ? QUALITY_THRESHOLD_TRUSTED 
          : QUALITY_THRESHOLD_NEW;
          
        if (analysis.qualityScore < threshold) {
          continue;
        }
        
        stats.passedQualityFilter++;
        
        if (await addVideoToDatabase(video, analysis, details)) {
          stats.addedToDatabase++;
          console.log(`  ✅ Added: ${video.title.substring(0, 60)}... (${analysis.qualityScore}/10)`);
        }
        
        if (stats.addedToDatabase >= 500) {
          console.log('🎉 Reached 500 new videos limit!');
          break;
        }
      }
      
      if (stats.addedToDatabase >= 500) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    
  } catch (error: any) {
    if (error.message === 'QUOTA_EXHAUSTED') {
      console.log('\n🚫 YouTube API quota exhausted');
    } else {
      console.error('Phase 1 error:', error);
    }
  }
  
  stats.quotaUsed = quotaUsed;
  
  console.log('\n' + '─'.repeat(40));
  console.log('PHASE 1 SUMMARY:');
  console.log('─'.repeat(40));
  console.log(`Videos scanned: ${stats.videosScanned}`);
  console.log(`Passed quality filter: ${stats.passedQualityFilter}`);
  console.log(`Added to database: ${stats.addedToDatabase}`);
  console.log(`Duplicates skipped: ${stats.duplicatesSkipped}`);
  console.log(`Rejected (non-instructional): ${stats.rejectedNonInstructional}`);
  console.log(`API quota used: ${stats.quotaUsed}/${QUOTA_LIMIT}`);
  
  return stats;
}

async function runPhase3(): Promise<void> {
  console.log('\n' + '═'.repeat(80));
  console.log('PHASE 3: VERIFICATION & REPORTING');
  console.log('═'.repeat(80) + '\n');
  
  // Total videos
  const totalResult = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'active'));
  const totalVideos = Number(totalResult[0].count);
  
  // Videos by position
  const positionResult = await db.execute(sql`
    SELECT position_category, COUNT(*) as count
    FROM ai_video_knowledge
    WHERE position_category IS NOT NULL AND status = 'active'
    GROUP BY position_category
    ORDER BY count DESC
  `);
  
  // Top instructors
  const instructorResult = await db.execute(sql`
    SELECT instructor_name, COUNT(*) as count
    FROM ai_video_knowledge
    WHERE instructor_name IS NOT NULL AND instructor_name != '' AND status = 'active'
    GROUP BY instructor_name
    ORDER BY count DESC
    LIMIT 10
  `);
  
  console.log('📊 LIBRARY STATUS:');
  console.log('─'.repeat(40));
  console.log(`Total videos in library: ${totalVideos}`);
  
  console.log('\n📍 Videos by Position:');
  const positions = Array.isArray(positionResult) ? positionResult : (positionResult.rows || []);
  for (const pos of positions) {
    console.log(`  ${(pos as any).position_category}: ${(pos as any).count}`);
  }
  
  console.log('\n👨‍🏫 Top 10 Instructors:');
  const instructors = Array.isArray(instructorResult) ? instructorResult : (instructorResult.rows || []);
  for (const inst of instructors) {
    console.log(`  ${(inst as any).instructor_name}: ${(inst as any).count} videos`);
  }
  
  // Test queries
  console.log('\n🧪 TEST QUERIES:');
  console.log('─'.repeat(40));
  
  const testQueries = [
    { query: 'half guard', description: 'How do I pass half guard?' },
    { query: 'mount escape', description: 'Escaping mount against a bigger opponent' },
    { query: 'baratoplata', description: 'Baratoplata setup from side control' }
  ];
  
  for (const test of testQueries) {
    console.log(`\n📌 "${test.description}"`);
    const results = await db.select({
      title: aiVideoKnowledge.title,
      instructor: aiVideoKnowledge.instructorName,
      position: aiVideoKnowledge.positionCategory
    })
      .from(aiVideoKnowledge)
      .where(and(sql`
        LOWER(title) LIKE LOWER(${`%${test.query}%`})
        OR LOWER(technique_name) LIKE LOWER(${`%${test.query}%`})
      `, eq(aiVideoKnowledge.status, 'active')))
      .limit(3);
    
    if (results.length === 0) {
      console.log('  No results found');
    } else {
      for (const r of results) {
        console.log(`  → ${r.title?.substring(0, 50)}... by ${r.instructor}`);
      }
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('CURATION COMPLETE');
  console.log('═'.repeat(80));
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     TRUSTED INSTRUCTOR VIDEO CURATION + GEMINI ANALYSIS                   ║');
  console.log('║     Phase 1: Video Discovery | Phase 2: Gemini Analysis | Phase 3: Report ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
  
  // Phase 1: Video Discovery
  const phase1Stats = await runPhase1();
  
  // Phase 2: Note about Gemini analysis
  console.log('\n' + '═'.repeat(80));
  console.log('PHASE 2: GEMINI ANALYSIS');
  console.log('═'.repeat(80));
  console.log('\nℹ️  Gemini analysis runs automatically when videos are requested by Professor OS.');
  console.log('   The Video Knowledge Service processes each video with Gemini 2.5 Flash to extract');
  console.log('   33 fields of structured knowledge including techniques, timestamps, instructor tips, etc.');
  
  // Phase 3: Verification
  await runPhase3();
  
  console.log('\n✅ All phases complete!');
  console.log(`\nFinal Stats:`);
  console.log(`  • Videos added: ${phase1Stats.addedToDatabase}`);
  console.log(`  • Quota used: ${phase1Stats.quotaUsed}/${QUOTA_LIMIT}`);
  console.log(`  • Quota remaining: ${QUOTA_LIMIT - phase1Stats.quotaUsed}`);
  
  // Close database connection
  await postgresClient.end();
  console.log('🔌 Database connection closed');
}

main().catch(console.error).finally(() => {
  setTimeout(() => process.exit(0), 1000);
});
