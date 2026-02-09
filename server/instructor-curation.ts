/**
 * INSTRUCTOR-FOCUSED CURATION SYSTEM
 * 
 * NEW DEFAULT: Only curates videos from instructors ALREADY in the database.
 * Rejects any video from instructors not already in the system.
 * 
 * Method:
 * 1. Query existing instructors with < 30 videos
 * 2. For each instructor, run 5 targeted searches
 * 3. ONLY add videos if instructor matches an existing instructor
 * 4. Quality score 7.0+ required, no duplicates, no podcasts/interviews
 */

import { db } from './db';
import { aiVideoKnowledge, curationRuns } from '@shared/schema';
import { sql, eq, ilike, and } from 'drizzle-orm';
import { runMultiStageAnalysis } from './multi-stage-analyzer';
import { google } from 'googleapis';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

// Search patterns for each instructor
const SEARCH_PATTERNS = [
  '{instructor} jiu jitsu technique',
  '{instructor} BJJ instructional',
  '{instructor} guard pass',
  '{instructor} submission',
  '{instructor} tutorial'
];

// Get instructors with lowest video counts (below threshold)
export async function getInstructorsNeedingContent(limit: number = 15, maxVideos: number = 30): Promise<{
  instructorName: string;
  videoCount: number;
}[]> {
  const result = await db.execute(sql`
    SELECT instructor_name, COUNT(*) as video_count
    FROM ai_video_knowledge
    WHERE instructor_name IS NOT NULL 
      AND instructor_name != ''
      AND instructor_name NOT LIKE '%Unknown%'
      AND instructor_name NOT LIKE '%Not Identified%'
      AND status = 'active'
    GROUP BY instructor_name
    HAVING COUNT(*) < ${maxVideos}
    ORDER BY COUNT(*) ASC
    LIMIT ${limit}
  `);
  
  return (result.rows as any[]).map(row => ({
    instructorName: row.instructor_name,
    videoCount: parseInt(row.video_count)
  }));
}

// Get ALL instructor names in the database for validation
export async function getAllExistingInstructors(): Promise<Set<string>> {
  const result = await db.execute(sql`
    SELECT DISTINCT LOWER(TRIM(instructor_name)) as instructor
    FROM ai_video_knowledge
    WHERE instructor_name IS NOT NULL 
      AND instructor_name != ''
      AND instructor_name NOT LIKE '%Unknown%'
      AND instructor_name NOT LIKE '%Not Identified%'
      AND status = 'active'
  `);
  
  return new Set((result.rows as any[]).map(row => row.instructor));
}

// Check if instructor name matches any existing instructor
function instructorMatchesExisting(detectedInstructor: string, existingInstructors: Set<string>): boolean {
  if (!detectedInstructor) return false;
  
  const normalized = detectedInstructor.toLowerCase().trim();
  
  // Direct match
  if (existingInstructors.has(normalized)) return true;
  
  // Partial match (instructor name contains or is contained by existing)
  for (const existing of existingInstructors) {
    // Check both directions for partial matches
    if (existing.includes(normalized) || normalized.includes(existing)) {
      // Require at least 5 chars to match to avoid false positives
      const overlap = Math.min(existing.length, normalized.length);
      if (overlap >= 5) return true;
    }
  }
  
  return false;
}

// Check if video title/description mentions the target instructor
// Uses stricter matching to avoid false positives (e.g., "Austen" vs "Austin")
function titleMentionsInstructor(title: string, description: string, targetInstructor: string): boolean {
  const titleLower = title.toLowerCase();
  const descLower = (description || '').toLowerCase();
  const instructorLower = targetInstructor.toLowerCase();
  
  // Split instructor name into parts - require longer parts for matching
  const nameParts = instructorLower.split(/[\s,()]+/).filter(p => p.length >= 4);
  
  if (nameParts.length === 0) return false;
  
  // Require EXACT word match (with word boundaries) for at least one significant part
  for (const part of nameParts) {
    // Create word boundary regex for exact match
    const wordRegex = new RegExp(`\\b${escapeRegex(part)}\\b`, 'i');
    if (wordRegex.test(title) || wordRegex.test(description)) {
      return true;
    }
  }
  
  return false;
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Early exit threshold - stop searching after N successful approvals per instructor
const EARLY_EXIT_THRESHOLD = 2;

// Check if video already exists in database
async function videoExistsInDatabase(videoId: string): Promise<boolean> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  const result = await db.select({ id: aiVideoKnowledge.id })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.videoUrl, videoUrl))
    .limit(1);
  
  return result.length > 0;
}

// Parse ISO 8601 duration to seconds
function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  return hours * 3600 + minutes * 60 + seconds;
}

// Search YouTube for instructor videos
async function searchInstructorVideos(
  instructor: string,
  searchPattern: string,
  maxResults: number = 10
): Promise<any[]> {
  try {
    const query = searchPattern.replace('{instructor}', instructor);
    
    const searchResponse = await youtube.search.list({
      part: ['id'],
      q: query,
      type: ['video'],
      maxResults,
      videoDuration: 'medium', // 4-20 minutes
      order: 'relevance'
    });
    
    if (!searchResponse.data.items?.length) return [];
    
    const videoIds = searchResponse.data.items
      .filter(item => item.id?.videoId)
      .map(item => item.id!.videoId!);
    
    if (!videoIds.length) return [];
    
    // Get video details
    const detailsResponse = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: videoIds
    });
    
    return detailsResponse.data.items || [];
  } catch (error: any) {
    console.error(`[INSTRUCTOR CURATION] Search error for "${instructor}":`, error.message);
    return [];
  }
}

// Main instructor-focused curation function
export async function runInstructorCuration(
  instructorLimit: number = 15,
  runId?: string
): Promise<{
  videosAnalyzed: number;
  videosAdded: number;
  videosRejected: number;
  instructorsProcessed: number;
  quotaUsed: number;
}> {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎯 INSTRUCTOR-FOCUSED CURATION`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Only targeting existing instructors - NO NEW INSTRUCTORS\n`);
  
  let videosAnalyzed = 0;
  let videosAdded = 0;
  let videosRejected = 0;
  let quotaUsed = 0;
  
  // Get instructors needing content
  const instructors = await getInstructorsNeedingContent(instructorLimit);
  console.log(`📋 Found ${instructors.length} instructors with < 30 videos:`);
  instructors.forEach(i => console.log(`   - ${i.instructorName}: ${i.videoCount} videos`));
  
  // Get ALL existing instructors for validation
  const existingInstructors = await getAllExistingInstructors();
  console.log(`\n✅ Total instructors in database: ${existingInstructors.size}`);
  
  for (const instructor of instructors) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🔍 Processing: ${instructor.instructorName} (${instructor.videoCount} videos)`);
    
    let instructorApprovals = 0; // Track approvals per instructor for early exit
    
    for (const pattern of SEARCH_PATTERNS) {
      // Early exit: Stop searching this instructor after EARLY_EXIT_THRESHOLD approvals
      if (instructorApprovals >= EARLY_EXIT_THRESHOLD) {
        console.log(`   ✅ Early exit: ${instructorApprovals} videos approved, moving to next instructor`);
        break;
      }
      
      const query = pattern.replace('{instructor}', instructor.instructorName);
      console.log(`   📹 Searching: "${query}"`);
      
      const videos = await searchInstructorVideos(instructor.instructorName, pattern, 10);
      quotaUsed += 100; // YouTube API cost per search
      
      for (const video of videos) {
        const videoId = video.id;
        const title = video.snippet?.title || '';
        const duration = parseDuration(video.contentDetails?.duration || 'PT0S');
        
        // Skip if too short
        if (duration < 70) {
          console.log(`   ⏭️  Skip (${duration}s < 70s): ${title.slice(0, 40)}...`);
          continue;
        }
        
        // Skip if already in database
        if (await videoExistsInDatabase(videoId)) {
          console.log(`   ⏭️  Skip (duplicate): ${title.slice(0, 40)}...`);
          continue;
        }
        
        // Pre-filter: Check if title/description actually mentions the instructor
        const description = video.snippet?.description || '';
        if (!titleMentionsInstructor(title, description, instructor.instructorName)) {
          console.log(`   ⏭️  Skip (not about instructor): ${title.slice(0, 40)}...`);
          continue;
        }
        
        videosAnalyzed++;
        
        // Run multi-stage analysis
        console.log(`   🔬 Analyzing: ${title.slice(0, 50)}...`);
        
        try {
          const analysis = await runMultiStageAnalysis(
            videoId,
            title,
            video.snippet?.channelTitle || '',
            description,
            duration,
            runId
          );
          
          if (!analysis) {
            console.log(`   ❌ Analysis failed`);
            videosRejected++;
            continue;
          }
          
          // Use detected instructor OR fall back to target instructor (since we verified title)
          let finalInstructor = analysis.instructorName || '';
          
          // If analysis didn't detect instructor, use target since title mentions them
          if (!finalInstructor || finalInstructor.toLowerCase().includes('unknown')) {
            finalInstructor = instructor.instructorName;
            console.log(`   📝 Using target instructor: ${finalInstructor}`);
          }
          
          // Verify instructor matches existing (should always pass since we use target as fallback)
          if (!instructorMatchesExisting(finalInstructor, existingInstructors)) {
            console.log(`   ❌ REJECTED: Instructor "${finalInstructor}" not in database`);
            videosRejected++;
            continue;
          }
          
          // Check quality score (7.0+ required)
          const score = analysis.finalScore || 0;
          if (score < 70) {
            console.log(`   ❌ REJECTED: Quality score ${score}/100 < 70 required`);
            videosRejected++;
            continue;
          }
          
          // Check if video was approved by Stage 4 QC
          if (!analysis.approved) {
            console.log(`   ❌ REJECTED: Failed Stage 4 QC (${analysis.stage4Grade || 'no grade'})`);
            videosRejected++;
            continue;
          }
          
          // Save to database
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          
          await db.insert(aiVideoKnowledge).values({
            videoUrl,
            title,
            instructorName: finalInstructor,
            techniqueType: analysis.techniqueType || null,
            positionCategory: analysis.positionCategory || null,
            giOrNogi: analysis.giOrNogi || 'both',
            tags: analysis.tags || [],
            qualityScore: score,
            primaryTimestamp: analysis.primaryTimestamp || '0:00',
            timestamps: analysis.timestamps || [],
            summary: analysis.summary || '',
            keyDetails: analysis.keyDetails || [],
            beltLevel: analysis.beltLevel || null,
            transcriptSource: analysis.transcriptSource || 'none'
          });
          
          console.log(`   ✅ ADDED: ${title.slice(0, 40)}... (${score}/100) [${finalInstructor}]`);
          videosAdded++;
          instructorApprovals++;
          
          // Check early exit after adding
          if (instructorApprovals >= EARLY_EXIT_THRESHOLD) {
            console.log(`   ✅ Reached ${EARLY_EXIT_THRESHOLD} approvals, skipping remaining videos`);
            break;
          }
          
        } catch (error: any) {
          console.error(`   ❌ Error analyzing video:`, error.message);
          videosRejected++;
        }
      }
    }
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎯 INSTRUCTOR CURATION COMPLETE`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   Instructors processed: ${instructors.length}`);
  console.log(`   Videos analyzed: ${videosAnalyzed}`);
  console.log(`   Videos added: ${videosAdded}`);
  console.log(`   Videos rejected: ${videosRejected}`);
  console.log(`   YouTube quota used: ~${quotaUsed} units`);
  console.log(`${'═'.repeat(60)}\n`);
  
  return {
    videosAnalyzed,
    videosAdded,
    videosRejected,
    instructorsProcessed: instructors.length,
    quotaUsed
  };
}

// Execute instructor curation with run tracking
export async function executeInstructorCurationWithTracking(
  instructorLimit: number = 15,
  triggeredBy: string = 'manual'
): Promise<{
  success: boolean;
  runId?: string;
  results?: any;
  error?: string;
}> {
  try {
    // Create run record
    const runResult = await db.insert(curationRuns)
      .values({
        runType: 'manual',
        status: 'running',
        searchCategory: 'Instructor-Focused Curation',
        videosAnalyzed: 0,
        videosAdded: 0,
        videosRejected: 0,
        searchesCompleted: 0,
        searchesFailed: 0,
        startedAt: sql`NOW()`
      })
      .returning({ id: curationRuns.id });
    
    const runId = runResult[0].id;
    console.log(`\n🚀 Started instructor curation run: ${runId}`);
    
    // Execute curation
    const results = await runInstructorCuration(instructorLimit, runId);
    
    // Update run record
    const acceptanceRate = results.videosAnalyzed > 0 
      ? (results.videosAdded / results.videosAnalyzed * 100) 
      : 0;
    
    await db.update(curationRuns)
      .set({
        status: 'completed',
        completedAt: sql`NOW()`,
        videosAnalyzed: results.videosAnalyzed,
        videosAdded: results.videosAdded,
        videosRejected: results.videosRejected,
        searchesCompleted: results.instructorsProcessed * 5,
        youtubeApiCalls: results.quotaUsed,
        acceptanceRate: acceptanceRate.toString(),
        guardrailStatus: acceptanceRate >= 5 && acceptanceRate <= 25 ? 'ok' : 
                         acceptanceRate < 5 ? 'low' : 'high'
      })
      .where(eq(curationRuns.id, runId));
    
    return { success: true, runId, results };
    
  } catch (error: any) {
    console.error('[INSTRUCTOR CURATION] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * TARGETED INSTRUCTOR CURATION
 * Curate videos for specific named instructors only
 */
export async function runTargetedInstructorCuration(
  targetInstructors: string[],
  runId?: string
): Promise<{
  videosAnalyzed: number;
  videosAdded: number;
  videosRejected: number;
  instructorsProcessed: number;
  quotaUsed: number;
  instructorResults: Record<string, { before: number; after: number; added: number }>;
}> {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎯 TARGETED INSTRUCTOR CURATION`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Targeting ${targetInstructors.length} specific instructors\n`);
  
  let videosAnalyzed = 0;
  let videosAdded = 0;
  let videosRejected = 0;
  let quotaUsed = 0;
  const instructorResults: Record<string, { before: number; after: number; added: number }> = {};
  
  // Get existing instructors for validation
  const existingInstructors = await getAllExistingInstructors();
  
  // Get before counts for each target instructor
  for (const instructor of targetInstructors) {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM ai_video_knowledge 
      WHERE LOWER(instructor_name) LIKE LOWER(${`%${instructor}%`})
      AND status = 'active'
    `);
    const beforeCount = parseInt((result.rows[0] as any)?.count || '0');
    instructorResults[instructor] = { before: beforeCount, after: beforeCount, added: 0 };
    console.log(`   ${instructor}: ${beforeCount} videos (before)`);
  }
  
  for (const instructor of targetInstructors) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🔍 Processing: ${instructor} (${instructorResults[instructor].before} videos)`);
    
    let instructorApprovals = 0;
    
    for (const pattern of SEARCH_PATTERNS) {
      // Early exit after finding 3 videos per instructor
      if (instructorApprovals >= 3) {
        console.log(`   ✅ Found ${instructorApprovals} videos, moving to next instructor`);
        break;
      }
      
      const query = pattern.replace('{instructor}', instructor);
      console.log(`   📹 Searching: "${query}"`);
      
      const videos = await searchInstructorVideos(instructor, pattern, 15);
      quotaUsed += 100;
      
      for (const video of videos) {
        const videoId = video.id;
        const title = video.snippet?.title || '';
        const description = video.snippet?.description || '';
        const duration = parseDuration(video.contentDetails?.duration || 'PT0S');
        
        // Skip if too short (< 2 minutes)
        if (duration < 120) {
          continue;
        }
        
        // Skip if already in database
        if (await videoExistsInDatabase(videoId)) {
          continue;
        }
        
        // Skip non-instructional content
        const titleLower = title.toLowerCase();
        if (titleLower.includes('podcast') || titleLower.includes('interview') || 
            titleLower.includes('vlog') || titleLower.includes('q&a') ||
            titleLower.includes('competition') || titleLower.includes('match footage') ||
            titleLower.includes('full match') || titleLower.includes('fight')) {
          console.log(`   ⏭️  Skip (non-instructional): ${title.slice(0, 40)}...`);
          videosRejected++;
          continue;
        }
        
        // Verify title mentions the target instructor
        if (!titleMentionsInstructor(title, description, instructor)) {
          continue;
        }
        
        videosAnalyzed++;
        console.log(`   🔬 Analyzing: ${title.slice(0, 50)}...`);
        
        try {
          // Run multi-stage analysis
          const channelTitle = video.snippet?.channelTitle || '';
          const analysis = await runMultiStageAnalysis({
            youtube_id: videoId,
            youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
            title,
            channel_name: channelTitle,
            channelTitle: channelTitle,
            channel_id: video.snippet?.channelId || '',
            thumbnail_url: video.snippet?.thumbnails?.high?.url || '',
            upload_date: video.snippet?.publishedAt || '',
            duration,
            view_count: parseInt(video.statistics?.viewCount || '0'),
            like_count: parseInt(video.statistics?.likeCount || '0')
          }, false);
          
          if (!analysis.approved) {
            console.log(`   ❌ Rejected: ${analysis.rejectionReason || 'failed quality check'}`);
            videosRejected++;
            continue;
          }
          
          // Verify quality score >= 7.0
          const qualityScore = parseFloat(analysis.qualityScore || '0');
          if (qualityScore < 7.0) {
            console.log(`   ❌ Rejected (score ${qualityScore.toFixed(1)} < 7.0)`);
            videosRejected++;
            continue;
          }
          
          // Add to database
          await db.insert(aiVideoKnowledge).values({
            title,
            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
            instructorName: instructor,
            techniqueName: analysis.technique || title,
            techniqueType: analysis.category || 'technique',
            positionCategory: analysis.positionCategory || 'universal',
            giOrNogi: analysis.giNogi || 'both',
            qualityScore: qualityScore.toString(),
            keyTimestamps: [],
            tags: analysis.tags || [],
            uploadDate: video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : new Date(),
            viewCount: parseInt(video.statistics?.viewCount || '0'),
            likeCount: parseInt(video.statistics?.likeCount || '0'),
            duration,
            channelName: video.snippet?.channelTitle || '',
            thumbnailUrl: video.snippet?.thumbnails?.high?.url || '',
            analysisResult: analysis,
            source: 'targeted_instructor_curation',
            curatedAt: new Date()
          });
          
          videosAdded++;
          instructorApprovals++;
          instructorResults[instructor].added++;
          console.log(`   ✅ ADDED (score ${qualityScore.toFixed(1)}): ${title.slice(0, 50)}...`);
          
        } catch (analysisError: any) {
          console.log(`   ❌ Analysis error: ${analysisError.message}`);
          videosRejected++;
        }
      }
    }
  }
  
  // Get final counts
  for (const instructor of targetInstructors) {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM ai_video_knowledge 
      WHERE LOWER(instructor_name) LIKE LOWER(${`%${instructor}%`})
      AND status = 'active'
    `);
    instructorResults[instructor].after = parseInt((result.rows[0] as any)?.count || '0');
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 TARGETED CURATION COMPLETE`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`\nRESULTS BY INSTRUCTOR:`);
  for (const [instructor, counts] of Object.entries(instructorResults)) {
    const change = counts.after - counts.before;
    console.log(`   ${instructor}: ${counts.before} -> ${counts.after} (+${change})`);
  }
  console.log(`\nTOTALS:`);
  console.log(`   Analyzed: ${videosAnalyzed}`);
  console.log(`   Added: ${videosAdded}`);
  console.log(`   Rejected: ${videosRejected}`);
  console.log(`${'═'.repeat(60)}\n`);
  
  return {
    videosAnalyzed,
    videosAdded,
    videosRejected,
    instructorsProcessed: targetInstructors.length,
    quotaUsed,
    instructorResults
  };
}
