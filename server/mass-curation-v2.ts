import { db } from './db';
import { aiVideoKnowledge } from '@shared/schema';
import { getChannelVideos, searchBJJVideos, getVideoDetails, type VideoSearchResult } from './youtube-service';
import { analyzeVideo, type VideoAnalysis } from './video-analysis-service';
import { decideShouldAdd, addVideoToLibrary } from './video-curation-service';
import { eq, sql } from 'drizzle-orm';

// AGGRESSIVE CURATION CONFIG
const TARGET_VIDEO_COUNT = 1000;
const QUALITY_THRESHOLD = 7.0; // Base threshold, adjusted by instructor credibility (7.0/7.5/8.5)
const VIDEOS_PER_CHANNEL = 30;
const VIDEOS_PER_SEARCH = 15;
const MAX_YOUTUBE_CALLS = 1000; // YouTube API calls (search + details)
const MAX_CLAUDE_CALLS = 1000; // Claude analysis calls
const MIN_DURATION_SECONDS = 70;

// ELITE BJJ CHANNELS - EXPANDED LIST
const ELITE_CHANNELS = [
  { id: 'UCkDGEQdez8XbcHsytxYh-qA', name: 'Lachlan Giles' },
  { id: 'UCQJq9p0gfV6Oq7pLKuMd44A', name: 'Bernardo Faria' },
  { id: 'UCyMNqD7Lj8W4mjtQVq6xCvw', name: 'Knight Jiu Jitsu (Jon Thomas)' },
  { id: 'UCv2lXQkPgF4g50bq_AZqTRQ', name: 'Chewjitsu' },
  { id: 'UC3VK_v9iE1V3kULM3wvfFmQ', name: 'BJJ Fanatics' },
  { id: 'UCKWRlFr5Y6QO5cCJ6Pc_6Kw', name: 'Keenan Cornelius' },
  { id: 'UCG_OdI3CqbvMv0y6C_7wvzQ', name: 'Grapplearts (Stephan Kesting)' },
  { id: 'UCEPdKxA_wkxfW5CJ4S1qtvQ', name: 'Marcelo Garcia' },
  { id: 'UCsUlHPyBk2TQPLg8lxn5HtA', name: 'Kit Dale' },
  { id: 'UCYhJNgLxU8VlJ0QC_KkQpFQ', name: 'Roger Gracie' },
  { id: 'UCjoUE8y1hMp5e_-6eCq7KWA', name: 'John Danaher Instructionals' },
  { id: 'UCXjdMNPKYiEw98VHx6gIGLQ', name: 'Gordon Ryan' },
  { id: 'UC-qPAQnl6vDkKYZHuKW6GRQ', name: 'Mikey Musumeci' },
  { id: 'UC8VLYaFQfthZgB0mUrN1Xqg', name: 'Craig Jones' },
  { id: 'UCqXc8OJKFfVqNU8RH2bHp6A', name: 'Priit Mihkelson (Submissionarts)' },
  { id: 'UCGEsqhzhNVmBQ6ysXPPK3ew', name: 'Rob Biernacki' },
  { id: 'UC-8QhthAWJ7qU0fD5pu5nYw', name: 'Chewjitsu Podcast' },
];

// COMPREHENSIVE SEARCH QUERIES - INCLUDING OCTOPUS GUARD
const SEARCH_QUERIES = [
  'bjj octopus guard tutorial',
  'octopus guard sweeps',
  'octopus guard attacks',
  'octopus guard entries',
  'bjj closed guard tutorial',
  'bjj open guard system',
  'bjj half guard tutorial',
  'deep half guard sweeps',
  'bjj butterfly guard',
  'bjj x guard tutorial',
  'bjj single leg x guard',
  'bjj de la riva guard',
  'bjj reverse de la riva',
  'bjj spider guard',
  'bjj lasso guard',
  'bjj worm guard',
  'bjj k guard',
  'bjj 50/50 guard',
  'bjj guard passing tutorial',
  'bjj pressure passing',
  'bjj toreando pass',
  'bjj leg drag pass',
  'bjj stack pass',
  'bjj knee slice pass',
  'bjj mount control',
  'bjj mount attacks',
  'bjj side control tutorial',
  'bjj north south position',
  'bjj knee on belly',
  'bjj back control tutorial',
  'bjj back take techniques',
  'bjj mount escapes',
  'bjj side control escapes',
  'bjj back escape',
  'bjj turtle position escapes',
  'bjj triangle choke tutorial',
  'bjj rear naked choke',
  'bjj guillotine choke',
  'bjj darce choke',
  'bjj anaconda choke',
  'bjj loop choke',
  'bjj bow and arrow choke',
  'bjj baseball choke',
  'bjj ezekiel choke',
  'bjj paper cutter choke',
  'bjj armbar tutorial',
  'bjj kimura tutorial',
  'bjj americana tutorial',
  'bjj omoplata tutorial',
  'bjj straight ankle lock',
  'bjj heel hook defense',
  'bjj kneebar tutorial',
  'bjj toe hold tutorial',
  'bjj wrist locks',
  'bjj takedowns for guard pullers',
  'bjj single leg takedown',
  'bjj double leg takedown',
  'bjj wrestling for bjj',
  'bjj foot sweeps',
  'bjj basic techniques',
  'bjj white belt essentials',
  'bjj blue belt techniques',
  'bjj purple belt techniques',
  'bjj grip fighting',
  'bjj posture fundamentals',
  'bjj base fundamentals',
  'no gi jiu jitsu',
  'no gi guard passing',
  'no gi submissions',
  'gi specific techniques',
  'bjj competition strategy',
  'bjj point fighting',
  'bjj submission only strategy',
];

interface CurationStats {
  screened: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  skippedDuration: number;
  errors: number;
  youtubeApiCalls: number;
  claudeApiCalls: number;
  octopusGuardFound: number;
  quotaExceeded: boolean;
}

async function runMassCuration() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🎬 STARTING AGGRESSIVE MASS VIDEO CURATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Target: ${TARGET_VIDEO_COUNT} videos`);
  console.log(`Quality threshold: ${QUALITY_THRESHOLD}/10`);
  console.log(`Minimum duration: ${MIN_DURATION_SECONDS} seconds`);
  console.log(`Channels to scrape: ${ELITE_CHANNELS.length}`);
  console.log(`Search queries: ${SEARCH_QUERIES.length}`);
  console.log('\n');
  
  const stats: CurationStats = {
    screened: 0,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    skippedDuration: 0,
    errors: 0,
    youtubeApiCalls: 0,
    claudeApiCalls: 0,
    octopusGuardFound: 0,
    quotaExceeded: false
  };
  
  const startTime = Date.now();
  
  try {
    const currentResult = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM ai_video_knowledge 
      WHERE quality_score >= ${QUALITY_THRESHOLD}
    `);
    
    const currentCount = parseInt(currentResult.rows[0].count as string);
    const needed = TARGET_VIDEO_COUNT - currentCount;
    
    console.log('📊 CURRENT STATUS:');
    console.log(`   High-quality videos: ${currentCount}`);
    console.log(`   Target: ${TARGET_VIDEO_COUNT}`);
    console.log(`   Need to add: ${needed}`);
    console.log('\n');
    
    if (needed <= 0) {
      console.log('🎯 Target already reached!');
      return;
    }
    
    // PHASE 1: Elite Channels (SKIPPED - quota-intensive)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📺 PHASE 1: Elite Channel Scraping');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n');
    console.log('⏭️  SKIPPING channel scraping (quota already exhausted)');
    console.log('   Focusing on 73 targeted search queries for better coverage\n');
    
    // PHASE 2: Targeted Searches
    if (currentCount + stats.accepted < TARGET_VIDEO_COUNT && 
        stats.youtubeApiCalls < MAX_YOUTUBE_CALLS && 
        stats.claudeApiCalls < MAX_CLAUDE_CALLS &&
        !stats.quotaExceeded) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 PHASE 2: Targeted Search Queries');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n');
      
      for (const query of SEARCH_QUERIES) {
        if (stats.youtubeApiCalls >= MAX_YOUTUBE_CALLS || stats.claudeApiCalls >= MAX_CLAUDE_CALLS) {
          console.log('\n⚠️  API call limit reached\n');
          break;
        }
        
        if (stats.quotaExceeded) {
          console.log('\n🚫 Quota exceeded - stopping\n');
          break;
        }
        
        if (currentCount + stats.accepted >= TARGET_VIDEO_COUNT) {
          console.log('\n🎯 Target reached!\n');
          break;
        }
        
        console.log(`\n🔍 Searching: "${query}"`);
        
        try {
          stats.youtubeApiCalls++; // Track BEFORE the call
          const videos = await searchBJJVideos(query, VIDEOS_PER_SEARCH);
          console.log(`   Found ${videos.length} videos\n`);
          
          for (const video of videos) {
            if (stats.youtubeApiCalls >= MAX_YOUTUBE_CALLS || stats.claudeApiCalls >= MAX_CLAUDE_CALLS) {
              console.log('\n⚠️  API limit reached\n');
              break;
            }
            if (stats.quotaExceeded) break;
            if (currentCount + stats.accepted >= TARGET_VIDEO_COUNT) break;
            
            const success = await curateVideo(video, stats);
            if (!success && stats.quotaExceeded) break;
            
            if (stats.screened % 25 === 0) {
              printProgress(stats, currentCount, startTime);
            }
            
            await sleep(1000);
          }
          
        } catch (error: any) {
          if (error.message === 'QUOTA_EXCEEDED') {
            console.error('\n🚫 YouTube API quota exceeded - stopping curation\n');
            stats.quotaExceeded = true;
            break;
          }
          console.error(`   ❌ Error: ${error.message}`);
          stats.errors++;
        }
      }
    }
    
    // FINAL SUMMARY
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ MASS CURATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Duration:           ${duration} minutes`);
    console.log(`Screened:           ${stats.screened}`);
    console.log(`Accepted:           ${stats.accepted} ✅`);
    console.log(`Rejected:           ${stats.rejected} ❌`);
    console.log(`Duplicates:         ${stats.duplicates} ⏭️`);
    console.log(`Skipped (duration): ${stats.skippedDuration} ⏱️`);
    console.log(`Errors:             ${stats.errors} ⚠️`);
    console.log(`YouTube API Calls:  ${stats.youtubeApiCalls}`);
    console.log(`Claude API Calls:   ${stats.claudeApiCalls}`);
    console.log(`Acceptance Rate:    ${((stats.accepted / Math.max(stats.screened, 1)) * 100).toFixed(1)}%`);
    console.log(`Final Count:        ${currentCount + stats.accepted}`);
    console.log(`Octopus Guard:      ${stats.octopusGuardFound} videos 🐙`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n');
    
    // Verify octopus guard
    const octopusCheck = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM ai_video_knowledge
      WHERE (LOWER(title) LIKE '%octopus%' OR LOWER(technique_name) LIKE '%octopus%')
        AND quality_score >= ${QUALITY_THRESHOLD}
    `);
    
    console.log(`\n🐙 OCTOPUS GUARD VERIFICATION: ${octopusCheck.rows[0].count} videos found\n`);
    
  } catch (error: any) {
    console.error('\n❌ FATAL ERROR:', error);
    console.error(error.stack);
  }
}

async function curateVideo(videoData: VideoSearchResult, stats: CurationStats): Promise<boolean> {
  try {
    // Normalize video ID - defensive check handles both youtube_id and youtubeId
    const videoId = videoData.youtube_id || (videoData as any).youtubeId;
    
    // Bail out early if no ID available
    if (!videoId) {
      console.log(`   ⚠️  Skip: No video ID found`);
      stats.errors++;
      return true;
    }
    
    // Ensure videoData has youtube_id for downstream use
    videoData.youtube_id = videoId;
    
    // Check for duplicates
    const existing = await db
      .select()
      .from(aiVideoKnowledge)
      .where(eq(aiVideoKnowledge.youtubeId, videoId))
      .limit(1);
    
    if (existing.length > 0) {
      console.log(`   ⏭️  Skip: ${videoData.title.substring(0, 50)}... (duplicate)`);
      stats.duplicates++;
      return true;
    }
    
    // Check if we have budget for getVideoDetails
    if (stats.youtubeApiCalls >= MAX_YOUTUBE_CALLS) {
      console.log(`   ⚠️  YouTube API limit reached, skipping details`);
      return false;
    }
    
    // Get video details for duration check
    stats.youtubeApiCalls++; // Track BEFORE the call
    try {
      const details = await getVideoDetails(videoData.youtube_id);
      
      if (details) {
        videoData.duration = details.duration;
        videoData.view_count = details.view_count;
        videoData.like_count = details.like_count;
      }
    } catch (error: any) {
      if (error.message === 'QUOTA_EXCEEDED') {
        stats.quotaExceeded = true;
        return false;
      }
      throw error;
    }
    
    // Duration filter
    if (videoData.duration && videoData.duration < MIN_DURATION_SECONDS) {
      console.log(`   ⏱️  Skip: ${videoData.title.substring(0, 50)}... (too short: ${videoData.duration}s)`);
      stats.skippedDuration++;
      return true;
    }
    
    // Check if we have budget for Claude analysis
    if (stats.claudeApiCalls >= MAX_CLAUDE_CALLS) {
      console.log(`   ⚠️  Claude API limit reached, stopping`);
      return false;
    }
    
    stats.screened++;
    console.log(`   🔍 Analyzing: ${videoData.title.substring(0, 60)}...`);
    
    // Analyze with Claude
    stats.claudeApiCalls++; // Track BEFORE the call
    const analysis = await analyzeVideo(videoData);
    
    // Validate analysis before proceeding
    if (analysis.quality_score == null || analysis.instructor_credibility == null) {
      console.log(`   ⚠️  SKIPPED: Malformed analysis (missing quality_score or credibility)`);
      stats.errors++;
      return true; // Continue processing other videos
    }
    
    // Check for octopus guard
    const isOctopus = videoData.title.toLowerCase().includes('octopus') ||
                      analysis.specific_technique?.toLowerCase().includes('octopus');
    if (isOctopus) {
      stats.octopusGuardFound++;
      console.log(`   🐙 OCTOPUS GUARD FOUND!`);
    }
    
    // Use existing quality gate logic (checks should_add + instructor credibility tiers)
    const shouldAdd = decideShouldAdd(analysis);
    
    if (shouldAdd) {
      // Use existing helper to add to library (handles all fields correctly)
      await addVideoToLibrary(videoData, analysis);
      
      console.log(`   ✅ ACCEPTED: ${analysis.quality_score.toFixed(1)}/10`);
      stats.accepted++;
    } else {
      console.log(`   ❌ REJECTED: ${analysis.quality_score.toFixed(1)}/10 - ${analysis.rejection_reason || 'Did not meet quality gate'}`);
      stats.rejected++;
    }
    
    return true;
    
  } catch (error: any) {
    // Quota exceeded - signal hard stop
    if (error.message === 'QUOTA_EXCEEDED') {
      stats.quotaExceeded = true;
      return false; // Signal caller to stop
    }
    
    // Other errors - log but continue processing other videos
    console.error(`   ⚠️  Unexpected error:`, error.message);
    stats.errors++;
    return true; // Continue with other videos
  }
}

// Return value semantics:
// - true: video processed (accepted/rejected/duplicate/skipped), continue to next video
// - false: fatal error (quota exceeded), stop processing immediately

// Import decideShouldAdd and addVideoToLibrary from video-curation-service.ts
// This eliminates code duplication and prevents schema drift

function printProgress(stats: CurationStats, startCount: number, startTime: number) {
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const rate = (stats.screened / parseFloat(elapsed)).toFixed(1);
  const totalApiCalls = stats.youtubeApiCalls + stats.claudeApiCalls;
  
  console.log('\n┌──────────────────────────────────────────────┐');
  console.log('│  📊 PROGRESS UPDATE                          │');
  console.log('├──────────────────────────────────────────────┤');
  console.log(`│  Screened:       ${stats.screened.toString().padEnd(24)} │`);
  console.log(`│  Accepted:       ${stats.accepted.toString().padEnd(24)} │`);
  console.log(`│  Rejected:       ${stats.rejected.toString().padEnd(24)} │`);
  console.log(`│  Duplicates:     ${stats.duplicates.toString().padEnd(24)} │`);
  console.log(`│  Skipped (dur):  ${stats.skippedDuration.toString().padEnd(24)} │`);
  console.log(`│  YouTube API:    ${stats.youtubeApiCalls.toString().padEnd(24)} │`);
  console.log(`│  Claude API:     ${stats.claudeApiCalls.toString().padEnd(24)} │`);
  console.log(`│  Total API:      ${totalApiCalls.toString().padEnd(24)} │`);
  console.log(`│  Total Now:      ${(startCount + stats.accepted).toString().padEnd(24)} │`);
  console.log(`│  Time:           ${elapsed} min (${rate}/min)${' '.repeat(9)} │`);
  console.log(`│  Octopus 🐙:     ${stats.octopusGuardFound.toString().padEnd(24)} │`);
  console.log('└──────────────────────────────────────────────┘\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run it
runMassCuration()
  .then(() => {
    console.log('✅ Curation completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Curation failed:', error);
    process.exit(1);
  });
