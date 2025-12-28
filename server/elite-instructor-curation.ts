import { db } from './db';
import { aiVideoKnowledge } from '@shared/schema';
import { searchBJJVideos, getVideoDetails, type VideoSearchResult } from './youtube-service';
import { analyzeVideo, type VideoAnalysis } from './video-analysis-service';
import { decideShouldAdd, addVideoToLibrary } from './video-curation-service';
import { eq, sql } from 'drizzle-orm';

// ELITE INSTRUCTOR FOCUSED CURATION
const TARGET_VIDEO_COUNT = 1000;
const VIDEOS_PER_QUERY = 20; // More results per search
const MAX_YOUTUBE_CALLS = 1000;
const MAX_CLAUDE_CALLS = 1000;
const MIN_DURATION_SECONDS = 70;

// Top Tier BJJ Instructors
const ELITE_INSTRUCTORS = [
  'Lachlan Giles',
  'Bernardo Faria',
  'Jon Thomas',
  'Chewjitsu',
  'Keenan Cornelius',
  'Stephan Kesting',
  'Marcelo Garcia',
  'John Danaher',
  'Gordon Ryan',
  'Craig Jones',
  'Roger Gracie',
  'Mikey Musumeci',
  'Priit Mihkelson',
  'Kit Dale',
  'Renzo Gracie',
  'Rickson Gracie',
  'Ryan Hall',
  'Garry Tonon',
  'Eddie Bravo'
];

// High-value techniques
const CORE_TECHNIQUES = [
  'guard passing',
  'mount attacks',
  'back control',
  'triangle choke',
  'armbar',
  'guillotine',
  'guard retention',
  'sweeps',
  'escapes',
  'takedowns'
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
  quotaExceeded: boolean;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function curateVideo(videoData: VideoSearchResult, stats: CurationStats): Promise<boolean> {
  try {
    // Normalize video ID
    const videoId = videoData.youtube_id || (videoData as any).youtubeId;
    
    if (!videoId) {
      console.log(`   ⚠️  Skip: No video ID found`);
      stats.errors++;
      return true;
    }
    
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
      console.log(`   ⚠️  YouTube API limit reached`);
      throw new Error('QUOTA_EXCEEDED');
    }
    
    // Get detailed video info
    stats.youtubeApiCalls++;
    const details = await getVideoDetails(videoData.youtube_id);
    
    if (!details) {
      console.log(`   ⚠️  Skip: Could not fetch video details`);
      stats.errors++;
      return true;
    }
    
    // Check duration filter
    if (details.duration < MIN_DURATION_SECONDS) {
      console.log(`   ⏭️  Skip: Too short (${details.duration}s < ${MIN_DURATION_SECONDS}s)`);
      stats.skippedDuration++;
      return true;
    }
    
    // Merge details into video data
    videoData.duration = details.duration;
    videoData.view_count = details.view_count;
    videoData.like_count = details.like_count;
    
    stats.screened++;
    console.log(`   🔍 Analyzing: ${videoData.title.substring(0, 60)}...`);
    
    // Check Claude API budget
    if (stats.claudeApiCalls >= MAX_CLAUDE_CALLS) {
      console.log(`   ⚠️  Claude API limit reached`);
      throw new Error('QUOTA_EXCEEDED');
    }
    
    // Analyze with Claude
    stats.claudeApiCalls++;
    const analysis = await analyzeVideo(videoData);
    
    // Validate analysis
    if (analysis.quality_score == null || analysis.instructor_credibility == null) {
      console.log(`   ⚠️  SKIPPED: Malformed analysis`);
      stats.errors++;
      return true;
    }
    
    // Use existing quality gate
    const shouldAdd = decideShouldAdd(analysis);
    
    if (shouldAdd) {
      await addVideoToLibrary(videoData, analysis);
      console.log(`   ✅ ACCEPTED: ${analysis.quality_score.toFixed(1)}/10 - ${analysis.instructor} (${analysis.instructor_credibility})`);
      stats.accepted++;
    } else {
      console.log(`   ❌ REJECTED: ${analysis.quality_score.toFixed(1)}/10 - ${analysis.instructor} (${analysis.instructor_credibility})`);
      stats.rejected++;
    }
    
    return true;
    
  } catch (error: any) {
    if (error.message === 'QUOTA_EXCEEDED') {
      stats.quotaExceeded = true;
      return false;
    }
    
    console.error(`   ⚠️  Unexpected error:`, error.message);
    stats.errors++;
    return true;
  }
}

function printProgress(stats: CurationStats, startCount: number, startTime: number) {
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const rate = (stats.screened / parseFloat(elapsed)).toFixed(1);
  const totalApiCalls = stats.youtubeApiCalls + stats.claudeApiCalls;
  
  console.log('\n┌──────────────────────────────────────────────┐');
  console.log('│  📊 PROGRESS UPDATE                          │');
  console.log('├──────────────────────────────────────────────┤');
  console.log(`│  Screened:       ${stats.screened.toString().padEnd(25)}│`);
  console.log(`│  Accepted:       ${stats.accepted.toString().padEnd(25)}│`);
  console.log(`│  Rejected:       ${stats.rejected.toString().padEnd(25)}│`);
  console.log(`│  Duplicates:     ${stats.duplicates.toString().padEnd(25)}│`);
  console.log(`│  Skipped (dur):  ${stats.skippedDuration.toString().padEnd(25)}│`);
  console.log(`│  YouTube API:    ${stats.youtubeApiCalls.toString().padEnd(25)}│`);
  console.log(`│  Claude API:     ${stats.claudeApiCalls.toString().padEnd(25)}│`);
  console.log(`│  Total API:      ${totalApiCalls.toString().padEnd(25)}│`);
  console.log(`│  Total Now:      ${(startCount + stats.accepted).toString().padEnd(25)}│`);
  console.log(`│  Time:           ${elapsed} min (${rate}/min)${' '.repeat(10)}│`);
  console.log(`│  Accept Rate:    ${((stats.accepted / (stats.screened || 1)) * 100).toFixed(1)}%${' '.repeat(21)}│`);
  console.log('└──────────────────────────────────────────────┘\n');
}

async function runEliteInstructorCuration() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🎖️  ELITE INSTRUCTOR FOCUSED CURATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Target: ${TARGET_VIDEO_COUNT} videos`);
  console.log(`Elite instructors: ${ELITE_INSTRUCTORS.length}`);
  console.log(`Core techniques: ${CORE_TECHNIQUES.length}`);
  console.log(`Videos per query: ${VIDEOS_PER_QUERY}`);
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
    quotaExceeded: false
  };
  
  const startTime = Date.now();
  
  try {
    const currentResult = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM ai_video_knowledge 
      WHERE status = 'active'
    `);
    
    const currentCount = parseInt(currentResult.rows[0].count as string);
    const needed = TARGET_VIDEO_COUNT - currentCount;
    
    console.log('📊 CURRENT STATUS:');
    console.log(`   Total videos: ${currentCount}`);
    console.log(`   Target: ${TARGET_VIDEO_COUNT}`);
    console.log(`   Need to add: ${needed}`);
    console.log('\n');
    
    if (needed <= 0) {
      console.log('🎯 Target already reached!');
      return;
    }
    
    // Generate instructor-technique combinations
    const searchQueries: string[] = [];
    
    // Instructor + technique combinations
    for (const instructor of ELITE_INSTRUCTORS) {
      for (const technique of CORE_TECHNIQUES) {
        searchQueries.push(`${instructor} ${technique} bjj`);
      }
    }
    
    // Instructor general searches
    for (const instructor of ELITE_INSTRUCTORS) {
      searchQueries.push(`${instructor} bjj tutorial`);
      searchQueries.push(`${instructor} bjj technique`);
    }
    
    console.log(`🔍 Generated ${searchQueries.length} targeted search queries\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 STARTING ELITE INSTRUCTOR SEARCH');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n');
    
    for (const query of searchQueries) {
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
        stats.youtubeApiCalls++;
        const videos = await searchBJJVideos(query, VIDEOS_PER_QUERY);
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
          
          if (stats.screened % 25 === 0 && stats.screened > 0) {
            printProgress(stats, currentCount, startTime);
          }
          
          await sleep(500); // Small delay between videos
        }
        
      } catch (error: any) {
        if (error.message === 'QUOTA_EXCEEDED') {
          console.error('\n🚫 YouTube API quota exceeded - stopping\n');
          stats.quotaExceeded = true;
          break;
        }
        console.error(`   ❌ Error: ${error.message}`);
        stats.errors++;
      }
    }
    
    // Final report
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 FINAL CURATION REPORT');
    console.log('═══════════════════════════════════════════════════════════════');
    printProgress(stats, currentCount, startTime);
    
    const finalResult = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM ai_video_knowledge 
      WHERE status = 'active'
    `);
    
    const finalCount = parseInt(finalResult.rows[0].count as string);
    
    console.log('🎬 FINAL LIBRARY STATUS:');
    console.log(`   Started with: ${currentCount} videos`);
    console.log(`   Added: ${stats.accepted} videos`);
    console.log(`   Final total: ${finalCount} videos`);
    console.log(`   Target: ${TARGET_VIDEO_COUNT} videos`);
    console.log(`   Progress: ${((finalCount / TARGET_VIDEO_COUNT) * 100).toFixed(1)}%`);
    console.log('\n');
    
  } catch (error: any) {
    console.error('\n❌ Curation error:', error.message);
    console.error(error.stack);
  }
}

// Run the curation
runEliteInstructorCuration();
