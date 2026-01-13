/**
 * PERMANENT AUTO-CURATION SYSTEM
 * 
 * Set-and-forget video curation that runs automatically forever.
 * Targets underrepresented instructors and self-expands instructor pool.
 * 
 * Algorithm:
 * 1. Query instructors with < 50 videos (auto-evolving targets)
 * 2. Run 5 search patterns per instructor
 * 3. Duplicate check before any API call
 * 4. Quality filter: 7.0+, skip podcasts/interviews/matches
 * 5. Save and queue for Gemini processing
 * 
 * Safeguards:
 * - Mark instructors as "fully_mined" after 0-video runs (30-day cooldown)
 * - Fall back to technique-based search after 3 consecutive empty instructors
 * - Stop immediately on quota exhaustion (403)
 * - Low yield email alert if < 5 videos per cycle
 */

import { db } from './db';
import { aiVideoKnowledge, fullyMinedInstructors, curationRuns, videoWatchStatus, systemSettings } from '@shared/schema';
import { sql, eq, lt, and, isNull, or, gte, desc, ne } from 'drizzle-orm';
import { google } from 'googleapis';
import { Resend } from 'resend';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = 'todd@bjjos.app';

// Auto-curation enable/disable state - persists to database
const AUTO_CURATION_SETTING_KEY = 'auto_curation_enabled';
let autoCurationEnabled = true; // In-memory cache

// Initialize from database on server startup
export async function initializeAutoCurationState(): Promise<void> {
  try {
    const result = await db.select()
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, AUTO_CURATION_SETTING_KEY))
      .limit(1);
    
    if (result.length > 0) {
      autoCurationEnabled = result[0].settingValue !== 'false';
      console.log(`[AUTO-CURATION] Loaded state from database: ${autoCurationEnabled ? 'ENABLED' : 'DISABLED'}`);
    } else {
      // First time - create the setting with default value
      await db.insert(systemSettings).values({
        settingKey: AUTO_CURATION_SETTING_KEY,
        settingValue: 'true',
        updatedBy: 'system'
      });
      console.log(`[AUTO-CURATION] Initialized database setting: ENABLED (default)`);
    }
  } catch (error) {
    console.error('[AUTO-CURATION] Error loading state from database:', error);
    // Fall back to enabled if database read fails
    autoCurationEnabled = true;
  }
}

export function isAutoCurationEnabled(): boolean {
  return autoCurationEnabled;
}

export async function setAutoCurationEnabled(enabled: boolean): Promise<{ success: boolean; error?: string }> {
  // Persist to database FIRST, then update memory
  try {
    const existing = await db.select()
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, AUTO_CURATION_SETTING_KEY))
      .limit(1);
    
    if (existing.length > 0) {
      await db.update(systemSettings)
        .set({
          settingValue: String(enabled),
          updatedAt: new Date(),
          updatedBy: 'admin'
        })
        .where(eq(systemSettings.settingKey, AUTO_CURATION_SETTING_KEY));
    } else {
      await db.insert(systemSettings).values({
        settingKey: AUTO_CURATION_SETTING_KEY,
        settingValue: String(enabled),
        updatedBy: 'admin'
      });
    }
    
    // Only update memory after successful database persistence
    autoCurationEnabled = enabled;
    console.log(`[AUTO-CURATION] ${enabled ? '✅ ENABLED' : '🚫 DISABLED'} by admin (persisted to database)`);
    return { success: true };
  } catch (error: any) {
    console.error('[AUTO-CURATION] Error persisting state to database:', error);
    return { success: false, error: error.message || 'Database persistence failed' };
  }
}

export interface AutoCurationStatus {
  enabled: boolean;
  lastRunAt: Date | null;
  lastRunResult: string | null;
  videosAddedLastRun: number;
  runsToday: number;
}

let lastRunStatus: { at: Date; result: string; videosAdded: number } | null = null;

export function getAutoCurationStatus(): AutoCurationStatus {
  return {
    enabled: autoCurationEnabled,
    lastRunAt: lastRunStatus?.at || null,
    lastRunResult: lastRunStatus?.result || null,
    videosAddedLastRun: lastRunStatus?.videosAdded || 0,
    runsToday: 0 // Will be filled from db query
  };
}

export function updateLastRunStatus(result: string, videosAdded: number): void {
  lastRunStatus = {
    at: new Date(),
    result,
    videosAdded
  };
}

const SEARCH_PATTERNS = [
  '{instructor} jiu jitsu technique',
  '{instructor} BJJ instructional',
  '{instructor} guard pass',
  '{instructor} submission',
  '{instructor} tutorial'
];

const TECHNIQUE_FALLBACK_SEARCHES = [
  'BJJ armbar tutorial',
  'triangle choke technique',
  'kimura jiu jitsu',
  'rear naked choke tutorial',
  'guard passing BJJ',
  'half guard sweep',
  'mount escape BJJ',
  'back take jiu jitsu',
  'single leg takedown',
  'double leg defense'
];

const VIDEO_THRESHOLD_PRIORITY_1 = 50;   // Priority 1: instructors with <50 videos (curate first)
const VIDEO_THRESHOLD_PRIORITY_2 = 100;  // Priority 2: instructors with 50-100 videos 
const INSTRUCTOR_LIMIT = 10;
const COOLDOWN_DAYS = 30;
const MIN_DURATION_SECONDS = 120;
const MAX_DURATION_SECONDS = 3600;
const QUALITY_THRESHOLD_KNOWN = 6.5;
const QUALITY_THRESHOLD_UNKNOWN = 7.0;
const LOW_YIELD_THRESHOLD = 5;

function calculateQualityScore(video: any): number {
  const viewCount = parseInt(video.statistics?.viewCount || '0');
  const likeCount = parseInt(video.statistics?.likeCount || '0');
  const duration = parseDuration(video.contentDetails?.duration || 'PT0S');
  
  let score = 5.0;
  
  if (viewCount > 100000) score += 2.0;
  else if (viewCount > 50000) score += 1.5;
  else if (viewCount > 10000) score += 1.0;
  else if (viewCount > 5000) score += 0.5;
  
  if (likeCount > 0 && viewCount > 0) {
    const likeRatio = likeCount / viewCount;
    if (likeRatio > 0.05) score += 1.0;
    else if (likeRatio > 0.03) score += 0.5;
  }
  
  if (duration >= 300 && duration <= 1800) score += 1.0;
  else if (duration >= 180 && duration <= 2400) score += 0.5;
  
  return Math.min(10, Math.max(0, score));
}

interface CurationResult {
  success: boolean;
  runId?: string;
  videosAnalyzed: number;
  videosAdded: number;
  videosSkipped: number;
  instructorsProcessed: string[];
  instructorResults: Record<string, { before: number; after: number; added: number }>;
  skippedReasons: Record<string, number>;
  errors: string[];
  quotaExhausted: boolean;
  nextScheduledRun?: string;
}

async function getUnderrepresentedInstructors(): Promise<{name: string; count: number; priority: number}[]> {
  // SMART ROTATION: Get instructors across all priority levels
  // Priority 1: <50 videos (fill first)
  // Priority 2: 50-100 videos (fill second)  
  // Priority 3: 100+ videos (always include 1-2 for fresh content)
  
  const result = await db.execute(sql`
    WITH instructor_counts AS (
      SELECT 
        avk.instructor_name, 
        COUNT(*)::int as video_count,
        CASE 
          WHEN COUNT(*) < ${VIDEO_THRESHOLD_PRIORITY_1} THEN 1
          WHEN COUNT(*) < ${VIDEO_THRESHOLD_PRIORITY_2} THEN 2
          ELSE 3
        END as priority
      FROM ai_video_knowledge avk
      LEFT JOIN fully_mined_instructors fmi ON LOWER(avk.instructor_name) = LOWER(fmi.instructor_name)
      WHERE avk.instructor_name IS NOT NULL 
        AND avk.instructor_name != ''
        AND avk.instructor_name NOT LIKE '%Unknown%'
        AND avk.instructor_name NOT LIKE '%Not Identified%'
        AND (fmi.cooldown_until IS NULL OR fmi.cooldown_until < NOW())
      GROUP BY avk.instructor_name
    )
    (
      SELECT instructor_name, video_count, priority FROM instructor_counts 
      WHERE priority = 1 ORDER BY video_count ASC LIMIT 6
    )
    UNION ALL
    (
      SELECT instructor_name, video_count, priority FROM instructor_counts 
      WHERE priority = 2 ORDER BY video_count ASC LIMIT 3
    )
    UNION ALL
    (
      SELECT instructor_name, video_count, priority FROM instructor_counts 
      WHERE priority = 3 ORDER BY RANDOM() LIMIT 2
    )
    ORDER BY priority ASC, video_count ASC
    LIMIT ${INSTRUCTOR_LIMIT}
  `);
  
  const rows = Array.isArray(result) ? result : (result.rows || []);
  console.log(`[AUTO-CURATION] Smart Rotation: Found ${rows.length} instructors across priority levels`);
  
  return rows.map((r: any) => ({
    name: r.instructor_name,
    count: parseInt(r.video_count || '0'),
    priority: parseInt(r.priority || '3')
  }));
}

async function videoExists(videoId: string): Promise<boolean> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const result = await db.select({ id: aiVideoKnowledge.id })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.videoUrl, videoUrl))
    .limit(1);
  return result.length > 0;
}

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

function isNonInstructionalContent(title: string): boolean {
  const titleLower = title.toLowerCase();
  const skipPatterns = [
    'podcast', 'interview', 'q&a', 'vlog', 'competition', 
    'match footage', 'full match', 'fight', 'highlights only',
    'compilation', 'promo', 'trailer', 'announcement'
  ];
  return skipPatterns.some(p => titleLower.includes(p));
}

async function markInstructorFullyMined(instructorName: string, videoCount: number): Promise<void> {
  const cooldownUntil = new Date();
  cooldownUntil.setDate(cooldownUntil.getDate() + COOLDOWN_DAYS);
  
  try {
    const existing = await db.select()
      .from(fullyMinedInstructors)
      .where(sql`LOWER(instructor_name) = LOWER(${instructorName})`)
      .limit(1);
    
    if (existing.length > 0) {
      await db.update(fullyMinedInstructors)
        .set({
          minedAt: new Date(),
          cooldownUntil,
          consecutiveEmptyRuns: (existing[0].consecutiveEmptyRuns || 0) + 1,
          lastVideoCount: videoCount
        })
        .where(eq(fullyMinedInstructors.id, existing[0].id));
    } else {
      await db.insert(fullyMinedInstructors).values({
        instructorName,
        cooldownUntil,
        consecutiveEmptyRuns: 1,
        lastVideoCount: videoCount
      });
    }
    
    console.log(`[AUTO-CURATION] Marked ${instructorName} as fully mined until ${cooldownUntil.toISOString()}`);
  } catch (error) {
    console.error(`[AUTO-CURATION] Error marking instructor fully mined:`, error);
  }
}

async function searchYouTube(query: string, maxResults: number = 15): Promise<any[]> {
  try {
    const searchResponse = await youtube.search.list({
      part: ['id'],
      q: query,
      type: ['video'],
      maxResults,
      videoDuration: 'medium',
      order: 'relevance'
    });
    
    if (!searchResponse.data.items?.length) return [];
    
    const videoIds = searchResponse.data.items
      .filter(item => item.id?.videoId)
      .map(item => item.id!.videoId!);
    
    if (!videoIds.length) return [];
    
    const detailsResponse = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: videoIds
    });
    
    return detailsResponse.data.items || [];
  } catch (error: any) {
    if (error.code === 403 || error.message?.includes('quota')) {
      throw new Error('QUOTA_EXHAUSTED');
    }
    console.error(`[AUTO-CURATION] Search error:`, error.message);
    return [];
  }
}

/**
 * QUOTA-EFFICIENT: Get channel's upload playlist ID
 * Convert channel ID "UC..." to uploads playlist ID "UU..."
 * This is a free transformation - no API call needed!
 */
function getUploadsPlaylistId(channelId: string): string {
  if (channelId.startsWith('UC')) {
    return 'UU' + channelId.slice(2);
  }
  return channelId;
}

/**
 * QUOTA-EFFICIENT: Find channel ID for an instructor (100 units, but cached)
 * Uses search.list ONCE to find channel, then caches it forever
 */
async function findInstructorChannelId(instructorName: string): Promise<string | null> {
  try {
    // First check if we already have it cached in the database
    // db.execute returns { rows: [...] } not an array directly
    const cachedResult = await db.execute(
      sql`SELECT channel_id FROM instructors WHERE LOWER(name) = LOWER(${instructorName}) AND channel_id IS NOT NULL LIMIT 1`
    );
    
    // Handle both Drizzle result formats (rows property or direct array)
    const rows = Array.isArray(cachedResult) ? cachedResult : (cachedResult?.rows || []);
    
    if (rows.length > 0 && rows[0].channel_id) {
      console.log(`   📦 Using cached channel ID for ${instructorName}`);
      return rows[0].channel_id as string;
    }
    
    // Search for the channel (costs 100 units - but only once per instructor!)
    console.log(`   🔍 Looking up channel ID for ${instructorName} (one-time 100 unit cost)`);
    const searchResponse = await youtube.search.list({
      part: ['snippet'],
      q: `${instructorName} BJJ`,
      type: ['channel'],
      maxResults: 1
    });
    
    if (!searchResponse.data.items?.length) {
      console.log(`   ⚠️ No channel found for ${instructorName}`);
      return null;
    }
    
    const channelId = searchResponse.data.items[0].id?.channelId;
    if (!channelId) return null;
    
    // Cache it in the database for future use
    try {
      await db.execute(
        sql`INSERT INTO instructors (name, channel_id) VALUES (${instructorName}, ${channelId})
            ON CONFLICT (name) DO UPDATE SET channel_id = ${channelId}`
      );
      console.log(`   💾 Cached channel ID: ${channelId}`);
    } catch (cacheError) {
      console.log(`   ⚠️ Could not cache channel ID (non-critical)`);
    }
    
    return channelId;
  } catch (error: any) {
    if (error.code === 403 || error.message?.includes('quota')) {
      throw new Error('QUOTA_EXHAUSTED');
    }
    console.error(`[AUTO-CURATION] Channel lookup error:`, error.message);
    return null;
  }
}

/**
 * QUOTA-EFFICIENT: Get videos from channel's uploads playlist
 * Uses playlistItems.list = 1 unit per 50 videos (vs search.list = 100 units per 15 videos!)
 * 
 * QUOTA COMPARISON:
 * - OLD: 5 search.list calls × 100 units = 500 units per instructor
 * - NEW: 1 playlistItems.list × 1 unit + 1 videos.list × 1 unit = 2 units per instructor!
 */
async function getChannelVideosEfficient(channelId: string, maxResults: number = 50): Promise<any[]> {
  try {
    const uploadsPlaylistId = getUploadsPlaylistId(channelId);
    
    // Get playlist items (1 unit per call - 50x cheaper than search!)
    const playlistResponse = await youtube.playlistItems.list({
      part: ['contentDetails'],
      playlistId: uploadsPlaylistId,
      maxResults: Math.min(maxResults, 50) // API max is 50 per call
    });
    
    if (!playlistResponse.data.items?.length) {
      console.log(`   📭 No videos in uploads playlist`);
      return [];
    }
    
    const videoIds = playlistResponse.data.items
      .map(item => item.contentDetails?.videoId)
      .filter(Boolean) as string[];
    
    if (!videoIds.length) return [];
    
    // Get video details (1 unit for up to 50 videos - batch call!)
    const detailsResponse = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: videoIds
    });
    
    console.log(`   📹 Retrieved ${detailsResponse.data.items?.length || 0} videos (2 API units total)`);
    return detailsResponse.data.items || [];
  } catch (error: any) {
    if (error.code === 403 || error.message?.includes('quota')) {
      throw new Error('QUOTA_EXHAUSTED');
    }
    // Playlist not found is common for some channels
    if (error.message?.includes('playlistNotFound')) {
      console.log(`   ⚠️ Uploads playlist not found - channel may have different structure`);
      return [];
    }
    console.error(`[AUTO-CURATION] Playlist fetch error:`, error.message);
    return [];
  }
}

async function queueForGeminiProcessing(videoId: number, youtubeUrl: string, youtubeId: string): Promise<void> {
  try {
    await db.insert(videoWatchStatus).values({
      videoId,
      youtubeUrl,
      youtubeId,
      hasTranscript: false,
      processingStatus: 'pending',
      processingAttempts: 0
    }).onConflictDoNothing();
  } catch (error) {
    console.error(`[AUTO-CURATION] Error queuing for Gemini:`, error);
  }
}

async function runTechniqueFallbackSearch(result: CurationResult): Promise<void> {
  console.log(`[AUTO-CURATION] Running technique fallback search...`);
  
  const randomTechnique = TECHNIQUE_FALLBACK_SEARCHES[
    Math.floor(Math.random() * TECHNIQUE_FALLBACK_SEARCHES.length)
  ];
  
  const query = `${randomTechnique} ${new Date().getFullYear()}`;
  console.log(`[AUTO-CURATION] Fallback query: "${query}"`);
  
  try {
    const videos = await searchYouTube(query, 20);
    
    for (const video of videos) {
      const videoId = video.id;
      const title = video.snippet?.title || '';
      const duration = parseDuration(video.contentDetails?.duration || 'PT0S');
      
      if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
        result.skippedReasons['duration'] = (result.skippedReasons['duration'] || 0) + 1;
        continue;
      }
      
      if (await videoExists(videoId)) {
        result.skippedReasons['duplicate'] = (result.skippedReasons['duplicate'] || 0) + 1;
        continue;
      }
      
      if (isNonInstructionalContent(title)) {
        result.skippedReasons['non-instructional'] = (result.skippedReasons['non-instructional'] || 0) + 1;
        continue;
      }
      
      const qualityScore = calculateQualityScore(video);
      
      if (qualityScore < QUALITY_THRESHOLD_KNOWN) {
        result.skippedReasons['low_quality'] = (result.skippedReasons['low_quality'] || 0) + 1;
        continue;
      }
      
      result.videosAnalyzed++;
      
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const insertResult = await db.insert(aiVideoKnowledge).values({
        videoUrl,
        youtubeId: videoId,
        title,
        techniqueName: title,
        instructorName: video.snippet?.channelTitle || 'Unknown',
        techniqueType: 'technique',
        positionCategory: 'universal',
        giOrNogi: 'both',
        qualityScore: qualityScore.toFixed(1),
        duration,
        channelName: video.snippet?.channelTitle || '',
        thumbnailUrl: video.snippet?.thumbnails?.high?.url || '',
        uploadDate: video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : new Date(),
        viewCount: parseInt(video.statistics?.viewCount || '0'),
        likeCount: parseInt(video.statistics?.likeCount || '0'),
        source: 'auto_curation_fallback',
        curatedAt: new Date()
      }).returning({ id: aiVideoKnowledge.id });
      
      if (insertResult[0]?.id) {
        await queueForGeminiProcessing(insertResult[0].id, videoUrl, videoId);
        result.videosAdded++;
        console.log(`[AUTO-CURATION] Added (fallback): ${title.slice(0, 50)}...`);
      }
    }
  } catch (error: any) {
    if (error.message === 'QUOTA_EXHAUSTED') {
      result.quotaExhausted = true;
    } else {
      result.errors.push(`Fallback search error: ${error.message}`);
    }
  }
}

export async function runPermanentAutoCuration(): Promise<CurationResult> {
  // Check if auto-curation is enabled
  if (!autoCurationEnabled) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🚫 PERMANENT AUTO-CURATION SKIPPED (Disabled by Admin)`);
    console.log(`${'═'.repeat(70)}`);
    return {
      success: false,
      videosAnalyzed: 0,
      videosAdded: 0,
      videosSkipped: 0,
      instructorsProcessed: [],
      instructorResults: {},
      skippedReasons: { 'disabled_by_admin': 1 },
      errors: ['Auto-curation is disabled'],
      quotaExhausted: false
    };
  }
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🤖 PERMANENT AUTO-CURATION SYSTEM`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`Started: ${new Date().toISOString()}`);
  
  const result: CurationResult = {
    success: false,
    videosAnalyzed: 0,
    videosAdded: 0,
    videosSkipped: 0,
    instructorsProcessed: [],
    instructorResults: {},
    skippedReasons: {},
    errors: [],
    quotaExhausted: false
  };
  
  try {
    const runInsert = await db.insert(curationRuns).values({
      runType: 'auto_permanent',
      status: 'running',
      searchCategory: 'Permanent Auto-Curation'
    }).returning({ id: curationRuns.id });
    
    result.runId = runInsert[0].id;
    console.log(`Run ID: ${result.runId}`);
    
    const instructors = await getUnderrepresentedInstructors();
    
    if (instructors.length === 0) {
      console.log(`[AUTO-CURATION] No eligible instructors found (database may be empty or all on cooldown)`);
      
      await db.update(curationRuns)
        .set({
          status: 'completed',
          completedAt: new Date(),
          videosAnalyzed: 0,
          videosAdded: 0,
          videosRejected: 0,
          errorMessage: 'No eligible instructors - all may be on cooldown'
        })
        .where(eq(curationRuns.id, result.runId!));
      
      result.success = true;
      await sendCurationEmail(result);
      return result;
    }
    
    console.log(`\n📋 Target Instructors (Smart Rotation):`);
    const p1 = instructors.filter(i => i.priority === 1);
    const p2 = instructors.filter(i => i.priority === 2);
    const p3 = instructors.filter(i => i.priority === 3);
    if (p1.length > 0) {
      console.log(`   Priority 1 (<50 videos): ${p1.map(i => `${i.name} (${i.count})`).join(', ')}`);
    }
    if (p2.length > 0) {
      console.log(`   Priority 2 (50-100 videos): ${p2.map(i => `${i.name} (${i.count})`).join(', ')}`);
    }
    if (p3.length > 0) {
      console.log(`   Priority 3 (100+ videos): ${p3.map(i => `${i.name} (${i.count})`).join(', ')}`);
    }
    
    let consecutiveEmptyInstructors = 0;
    
    for (const instructor of instructors) {
      if (result.quotaExhausted) {
        console.log(`[AUTO-CURATION] Quota exhausted, stopping...`);
        break;
      }
      
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`🔍 Processing: ${instructor.name} (${instructor.count} videos)`);
      
      result.instructorsProcessed.push(instructor.name);
      result.instructorResults[instructor.name] = {
        before: instructor.count,
        after: instructor.count,
        added: 0
      };
      
      let instructorVideosAdded = 0;
      
      // QUOTA-EFFICIENT: Try channel playlist first (2 units vs 500+ units!)
      try {
        const channelId = await findInstructorChannelId(instructor.name);
        
        if (channelId) {
          console.log(`   📺 Using QUOTA-EFFICIENT playlist method (2 units vs 500+ old method)`);
          const videos = await getChannelVideosEfficient(channelId, 50);
          
          for (const video of videos) {
            if (result.quotaExhausted) break;
            
            const videoId = video.id;
            const title = video.snippet?.title || '';
            const duration = parseDuration(video.contentDetails?.duration || 'PT0S');
            
            // Since we're fetching from known BJJ instructor channels, trust the content
            // Only filter out obvious non-instructional content (podcasts, vlogs, etc.)
            // The isNonInstructionalContent check below handles this
            
            if (duration < MIN_DURATION_SECONDS) {
              result.skippedReasons['too_short'] = (result.skippedReasons['too_short'] || 0) + 1;
              result.videosSkipped++;
              continue;
            }
            
            if (duration > MAX_DURATION_SECONDS) {
              result.skippedReasons['too_long'] = (result.skippedReasons['too_long'] || 0) + 1;
              result.videosSkipped++;
              continue;
            }
            
            if (await videoExists(videoId)) {
              result.skippedReasons['duplicate'] = (result.skippedReasons['duplicate'] || 0) + 1;
              result.videosSkipped++;
              continue;
            }
            
            if (isNonInstructionalContent(title)) {
              result.skippedReasons['non_instructional'] = (result.skippedReasons['non_instructional'] || 0) + 1;
              result.videosSkipped++;
              continue;
            }
            
            const qualityScore = calculateQualityScore(video);
            
            if (qualityScore < QUALITY_THRESHOLD_UNKNOWN) {
              result.skippedReasons['low_quality'] = (result.skippedReasons['low_quality'] || 0) + 1;
              result.videosSkipped++;
              continue;
            }
            
            result.videosAnalyzed++;
            
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            
            try {
              const insertResult = await db.insert(aiVideoKnowledge).values({
                videoUrl,
                youtubeId: videoId,
                title,
                techniqueName: title,
                instructorName: instructor.name,
                techniqueType: 'technique',
                positionCategory: 'universal',
                giOrNogi: 'both',
                qualityScore: qualityScore.toFixed(1),
                duration,
                channelName: video.snippet?.channelTitle || '',
                thumbnailUrl: video.snippet?.thumbnails?.high?.url || '',
                uploadDate: video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : new Date(),
                viewCount: parseInt(video.statistics?.viewCount || '0'),
                likeCount: parseInt(video.statistics?.likeCount || '0'),
                source: 'auto_curation_efficient',
                curatedAt: new Date()
              }).returning({ id: aiVideoKnowledge.id });
              
              if (insertResult[0]?.id) {
                await queueForGeminiProcessing(insertResult[0].id, videoUrl, videoId);
                result.videosAdded++;
                instructorVideosAdded++;
                result.instructorResults[instructor.name].added++;
                result.instructorResults[instructor.name].after++;
                console.log(`   ✅ Added: ${title.slice(0, 50)}...`);
              }
            } catch (insertError: any) {
              if (insertError.code === '23505') {
                result.skippedReasons['duplicate'] = (result.skippedReasons['duplicate'] || 0) + 1;
              } else {
                result.errors.push(`Insert error: ${insertError.message}`);
              }
            }
          }
        } else {
          // Fallback to ONE search if no channel found (rare case)
          console.log(`   ⚠️ No channel ID - falling back to single search (100 units)`);
          const query = `${instructor.name} BJJ technique`;
          
          try {
            const videos = await searchYouTube(query, 15);
            
            for (const video of videos) {
              const videoId = video.id;
              const title = video.snippet?.title || '';
              const duration = parseDuration(video.contentDetails?.duration || 'PT0S');
              
              if (duration < MIN_DURATION_SECONDS) {
                result.skippedReasons['too_short'] = (result.skippedReasons['too_short'] || 0) + 1;
                result.videosSkipped++;
                continue;
              }
              
              if (duration > MAX_DURATION_SECONDS) {
                result.skippedReasons['too_long'] = (result.skippedReasons['too_long'] || 0) + 1;
                result.videosSkipped++;
                continue;
              }
              
              if (await videoExists(videoId)) {
                result.skippedReasons['duplicate'] = (result.skippedReasons['duplicate'] || 0) + 1;
                result.videosSkipped++;
                continue;
              }
              
              if (isNonInstructionalContent(title)) {
                result.skippedReasons['non_instructional'] = (result.skippedReasons['non_instructional'] || 0) + 1;
                result.videosSkipped++;
                continue;
              }
              
              const qualityScore = calculateQualityScore(video);
              if (qualityScore < QUALITY_THRESHOLD_UNKNOWN) {
                result.skippedReasons['low_quality'] = (result.skippedReasons['low_quality'] || 0) + 1;
                result.videosSkipped++;
                continue;
              }
            
            result.videosAnalyzed++;
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            
            try {
              const insertResult = await db.insert(aiVideoKnowledge).values({
                videoUrl,
                youtubeId: videoId,
                title,
                techniqueName: title,
                instructorName: instructor.name,
                techniqueType: 'technique',
                positionCategory: 'universal',
                giOrNogi: 'both',
                qualityScore: qualityScore.toFixed(1),
                duration,
                channelName: video.snippet?.channelTitle || '',
                thumbnailUrl: video.snippet?.thumbnails?.high?.url || '',
                uploadDate: video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : new Date(),
                viewCount: parseInt(video.statistics?.viewCount || '0'),
                likeCount: parseInt(video.statistics?.likeCount || '0'),
                source: 'auto_curation_fallback',
                curatedAt: new Date()
              }).returning({ id: aiVideoKnowledge.id });
              
              if (insertResult[0]?.id) {
                await queueForGeminiProcessing(insertResult[0].id, videoUrl, videoId);
                result.videosAdded++;
                instructorVideosAdded++;
                result.instructorResults[instructor.name].added++;
                result.instructorResults[instructor.name].after++;
                console.log(`   ✅ Added: ${title.slice(0, 50)}...`);
              }
            } catch (insertError: any) {
              if (insertError.code === '23505') {
                result.skippedReasons['duplicate'] = (result.skippedReasons['duplicate'] || 0) + 1;
              } else {
                result.errors.push(`Insert error: ${insertError.message}`);
              }
            }
            }
          } catch (searchError: any) {
            if (searchError.message === 'QUOTA_EXHAUSTED') {
              result.quotaExhausted = true;
            } else {
              result.errors.push(`Fallback search error for ${instructor.name}: ${searchError.message}`);
            }
          }
        }
      } catch (channelError: any) {
        if (channelError.message === 'QUOTA_EXHAUSTED') {
          result.quotaExhausted = true;
          break;
        }
        result.errors.push(`Channel error for ${instructor.name}: ${channelError.message}`);
      }
      
      if (instructorVideosAdded === 0) {
        consecutiveEmptyInstructors++;
        await markInstructorFullyMined(instructor.name, instructor.count);
        
        if (consecutiveEmptyInstructors >= 3) {
          console.log(`[AUTO-CURATION] 3 consecutive empty instructors, running fallback...`);
          await runTechniqueFallbackSearch(result);
          consecutiveEmptyInstructors = 0;
        }
      } else {
        consecutiveEmptyInstructors = 0;
      }
    }
    
    await db.update(curationRuns)
      .set({
        status: result.quotaExhausted ? 'quota_exhausted' : 'completed',
        completedAt: new Date(),
        videosAnalyzed: result.videosAnalyzed,
        videosAdded: result.videosAdded,
        videosRejected: result.videosSkipped,
        errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null
      })
      .where(eq(curationRuns.id, result.runId!));
    
    result.success = true;
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📊 AUTO-CURATION COMPLETE`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`   Instructors processed: ${result.instructorsProcessed.length}`);
    console.log(`   Videos analyzed: ${result.videosAnalyzed}`);
    console.log(`   Videos added: ${result.videosAdded}`);
    console.log(`   Videos skipped: ${result.videosSkipped}`);
    console.log(`   Quota exhausted: ${result.quotaExhausted}`);
    console.log(`${'═'.repeat(70)}\n`);
    
    await sendCurationEmail(result);
    
    if (result.videosAdded < LOW_YIELD_THRESHOLD && !result.quotaExhausted && result.instructorsProcessed.length > 0) {
      await sendLowYieldAlert(result);
    }
    
  } catch (error: any) {
    result.errors.push(`Fatal error: ${error.message}`);
    console.error(`[AUTO-CURATION] Fatal error:`, error);
  }
  
  return result;
}

async function sendLowYieldAlert(result: CurationResult): Promise<void> {
  try {
    console.log(`[AUTO-CURATION] ⚠️ LOW YIELD ALERT: Only ${result.videosAdded} videos added (threshold: ${LOW_YIELD_THRESHOLD})`);
    
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'short',
      day: 'numeric'
    });
    
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px;">
        <div style="background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #dc2626; margin: 0 0 15px 0;">⚠️ Low Yield Curation Alert</h2>
          <p style="margin: 0; font-size: 16px;">Only <strong>${result.videosAdded}</strong> videos were added in the latest curation run (threshold: ${LOW_YIELD_THRESHOLD})</p>
        </div>
        
        <h3 style="color: #666;">Possible Causes:</h3>
        <ul>
          <li>Instructors may be fully mined (all available content already curated)</li>
          <li>Quality threshold (7.0+) filtering out videos</li>
          <li>YouTube search results not matching instructor content</li>
          <li>Need to add new instructor seeds to the database</li>
        </ul>
        
        <h3 style="color: #666;">Recommended Actions:</h3>
        <ul>
          <li>Check the fully_mined_instructors table for cooldown status</li>
          <li>Consider adding new instructors to the video library manually</li>
          <li>Review technique fallback searches for opportunities</li>
        </ul>
        
        <h3 style="color: #666;">Run Details:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 12px; border-bottom: 1px solid #eee;"><strong>Time</strong></td>
            <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${timeStr} EST</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px; border-bottom: 1px solid #eee;"><strong>Instructors Processed</strong></td>
            <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${result.instructorsProcessed.length}</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px; border-bottom: 1px solid #eee;"><strong>Videos Analyzed</strong></td>
            <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${result.videosAnalyzed}</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px; border-bottom: 1px solid #eee;"><strong>Videos Added</strong></td>
            <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${result.videosAdded}</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px; border-bottom: 1px solid #eee;"><strong>Videos Skipped</strong></td>
            <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${result.videosSkipped}</td>
          </tr>
        </table>
        
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>Run ID: ${result.runId || 'N/A'}</p>
        </div>
      </div>
    `;
    
    await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: [ADMIN_EMAIL],
      subject: `⚠️ Low Yield Alert: Only ${result.videosAdded} videos added - May need new instructor seeds`,
      html: htmlContent
    });
    
    console.log(`[AUTO-CURATION] ✅ Low yield alert email sent`);
  } catch (error) {
    console.error(`[AUTO-CURATION] Failed to send low yield alert:`, error);
  }
}

async function sendCurationEmail(result: CurationResult): Promise<void> {
  try {
    const totalVideosResult = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM ai_video_knowledge`);
    const totalRows = Array.isArray(totalVideosResult) ? totalVideosResult : (totalVideosResult.rows || []);
    const libraryTotal = totalRows[0]?.cnt || 0;
    
    const pendingGeminiResult = await db.execute(sql`
      SELECT COUNT(*)::int as cnt FROM video_watch_status 
      WHERE processed = false OR processed IS NULL
    `);
    const pendingRows = Array.isArray(pendingGeminiResult) ? pendingGeminiResult : (pendingGeminiResult.rows || []);
    const geminiQueueSize = pendingRows[0]?.cnt || 0;
    
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'short',
      day: 'numeric'
    });
    
    const subject = result.videosAdded > 0
      ? `🎬 Curation Complete: +${result.videosAdded} videos`
      : result.quotaExhausted
        ? `⚠️ Curation Paused: Quota Exhausted`
        : `📊 Curation Complete: 0 videos added`;
    
    let instructorTable = '';
    for (const [name, counts] of Object.entries(result.instructorResults)) {
      instructorTable += `
        <tr>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${name}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eee; text-align: center;">${counts.before}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eee; text-align: center;">${counts.after}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eee; text-align: center; color: ${counts.added > 0 ? '#22c55e' : '#666'};">+${counts.added}</td>
        </tr>
      `;
    }
    
    let skippedBreakdown = '';
    if (Object.keys(result.skippedReasons).length > 0) {
      skippedBreakdown = '<p><strong>Skipped breakdown:</strong></p><ul>';
      for (const [reason, count] of Object.entries(result.skippedReasons)) {
        skippedBreakdown += `<li>${reason}: ${count}</li>`;
      }
      skippedBreakdown += '</ul>';
    }
    
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px;">
        <h2 style="color: #8B5CF6; margin-bottom: 20px;">
          ${result.videosAdded > 0 ? '✅' : result.quotaExhausted ? '⚠️' : '📊'} Auto-Curation Report
        </h2>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Timestamp</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${timeStr} EST</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Videos Analyzed</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${result.videosAnalyzed}</td>
          </tr>
          <tr style="background: ${result.videosAdded > 0 ? '#dcfce7' : '#fef9c3'};">
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Videos Added</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">+${result.videosAdded}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Videos Skipped</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${result.videosSkipped}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Library Total</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${libraryTotal} videos</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Gemini Queue</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${geminiQueueSize} pending</td>
          </tr>
          ${result.quotaExhausted ? `
          <tr style="background: #fee2e2;">
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Status</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">⚠️ Quota Exhausted - Will retry after midnight PT</td>
          </tr>
          ` : ''}
        </table>
        
        <h3 style="color: #8B5CF6;">Instructors Targeted</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 8px 12px; text-align: left;">Instructor</th>
              <th style="padding: 8px 12px; text-align: center;">Before</th>
              <th style="padding: 8px 12px; text-align: center;">After</th>
              <th style="padding: 8px 12px; text-align: center;">Added</th>
            </tr>
          </thead>
          <tbody>
            ${instructorTable}
          </tbody>
        </table>
        
        ${skippedBreakdown}
        
        ${result.errors.length > 0 ? `
        <h3 style="color: #ef4444;">⚠️ Errors/Warnings</h3>
        <ul style="color: #ef4444;">
          ${result.errors.slice(0, 5).map(e => `<li>${e}</li>`).join('')}
          ${result.errors.length > 5 ? `<li>...and ${result.errors.length - 5} more</li>` : ''}
        </ul>
        ` : ''}
        
        ${result.videosAdded < LOW_YIELD_THRESHOLD && !result.quotaExhausted ? `
        <div style="background: #fef9c3; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>⚠️ Low Yield Warning</strong><br>
          Only ${result.videosAdded} videos added. May need new instructor seeds or technique searches.
        </div>
        ` : ''}
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>Next scheduled runs: 3:15am, 9am, 3pm, 9pm EST</p>
          <p>Run ID: ${result.runId || 'N/A'}</p>
        </div>
      </div>
    `;
    
    await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: [ADMIN_EMAIL],
      subject,
      html: htmlContent
    });
    
    console.log(`[AUTO-CURATION] ✅ Email sent: ${subject}`);
  } catch (error) {
    console.error(`[AUTO-CURATION] Failed to send email:`, error);
  }
}

export async function dryRunAutoCuration(): Promise<{
  wouldProcess: string[];
  instructorCounts: Record<string, number>;
  estimatedSearches: number;
}> {
  const instructors = await getUnderrepresentedInstructors();
  
  const instructorCounts: Record<string, number> = {};
  for (const i of instructors) {
    instructorCounts[i.name] = i.count;
  }
  
  return {
    wouldProcess: instructors.map(i => i.name),
    instructorCounts,
    estimatedSearches: instructors.length * SEARCH_PATTERNS.length
  };
}

export function getAutoCurationSchedule(): string[] {
  return [
    '3:15 AM EST - Primary run (after quota reset)',
    '9:00 AM EST - Morning run',
    '3:00 PM EST - Afternoon run',
    '9:00 PM EST - Evening run'
  ];
}

/**
 * SELF-EXPANDING INSTRUCTOR DISCOVERY
 * When Gemini processes a video and finds a NEW instructor:
 * 1. Check if instructor appears in 3+ videos from search results
 * 2. If yes, auto-add to instructor pool
 * 3. They become eligible for future instructor-focused searches
 */
export async function discoverNewInstructor(
  instructorName: string,
  channelName: string
): Promise<boolean> {
  if (!instructorName || instructorName.toLowerCase().includes('unknown')) {
    return false;
  }
  
  const normalizedName = instructorName.trim();
  
  const existingResult = await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM ai_video_knowledge
    WHERE LOWER(instructor_name) LIKE LOWER(${`%${normalizedName}%`})
  `);
  const existingRows = Array.isArray(existingResult) ? existingResult : (existingResult.rows || []);
  const existingCount = existingRows[0]?.cnt || 0;
  
  if (existingCount >= 3) {
    console.log(`[AUTO-CURATION] Discovered new instructor: ${normalizedName} (${existingCount} videos)`);
    return true;
  }
  
  return false;
}

/**
 * Get detailed curation system status for admin dashboard
 */
export async function getAutoCurationFullStatus(): Promise<{
  isEnabled: boolean;
  lastRun?: Date;
  lastRunResult?: string;
  nextScheduledRun: string;
  instructorsPending: number;
  fullyMinedCount: number;
  librarySize: number;
}> {
  const lastRunResult = await db.select()
    .from(curationRuns)
    .where(eq(curationRuns.runType, 'auto_permanent'))
    .orderBy(desc(curationRuns.startedAt))
    .limit(1);
  
  const fullyMinedResult = await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM fully_mined_instructors 
    WHERE cooldown_until > NOW()
  `);
  const fullyMinedRows = Array.isArray(fullyMinedResult) ? fullyMinedResult : (fullyMinedResult.rows || []);
  
  const instructors = await getUnderrepresentedInstructors();
  
  const librarySizeResult = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM ai_video_knowledge`);
  const libraryRows = Array.isArray(librarySizeResult) ? librarySizeResult : (librarySizeResult.rows || []);
  
  const now = new Date();
  const estHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
  
  let nextRun = '3:15 AM EST';
  if (estHour < 3 || (estHour === 3 && now.getMinutes() < 15)) {
    nextRun = '3:15 AM EST';
  } else if (estHour < 9) {
    nextRun = '9:00 AM EST';
  } else if (estHour < 15) {
    nextRun = '3:00 PM EST';
  } else if (estHour < 21) {
    nextRun = '9:00 PM EST';
  } else {
    nextRun = '3:15 AM EST (tomorrow)';
  }
  
  return {
    isEnabled: autoCurationEnabled,
    lastRun: lastRunResult[0]?.startedAt || undefined,
    lastRunResult: lastRunResult[0]?.status || undefined,
    nextScheduledRun: nextRun,
    instructorsPending: instructors.length,
    fullyMinedCount: fullyMinedRows[0]?.cnt || 0,
    librarySize: libraryRows[0]?.cnt || 0
  };
}
