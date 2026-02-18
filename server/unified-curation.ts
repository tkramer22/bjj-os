/**
 * UNIFIED INSTRUCTOR CURATION SYSTEM
 * 
 * Single method for all curation:
 * 1. Get instructors from database
 * 2. Pick 10-15 with lowest video counts
 * 3. Run 5 searches per instructor
 * 4. Add videos with quality >= 7.0
 * 5. Skip duplicates, podcasts, interviews, competition footage, < 2min
 * 6. Track rotation to never repeat until full cycle
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from './db';
import { aiVideoKnowledge, curationRotation, instructorCredibility, videoWatchStatus } from '@shared/schema';
import { eq, sql, desc, and, gte } from 'drizzle-orm';
import { getVideoDetails } from './youtube-service';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

interface YouTubeSearchResult {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
}

interface CurationStats {
  instructor: string;
  searchesRun: number;
  videosFound: number;
  videosAnalyzed: number;
  videosAdded: number;
  skippedDuplicate: number;
  skippedShort: number;
  skippedNonInstructional: number;
  skippedLowQuality: number;
  beforeCount: number;
  afterCount: number;
}

interface UnifiedCurationResult {
  success: boolean;
  instructorsCurated: number;
  totalVideosAdded: number;
  instructorStats: CurationStats[];
  rotationCycle: number;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  quotaExhausted: boolean;
  error?: string;
}

function generateSearchQueries(instructorName: string): string[] {
  return [
    `${instructorName} BJJ technique`,
    `${instructorName} jiu jitsu instructional`,
    `${instructorName} submission tutorial`,
    `${instructorName} guard technique`,
    `${instructorName} grappling drill`,
  ];
}

async function searchYouTube(query: string, maxResults: number = 25): Promise<YouTubeSearchResult[]> {
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
    console.error(`[YT SEARCH] Error for "${query}":`, error);
    throw new Error(`YouTube API error: ${response.status}`);
  }

  const data = await response.json();
  return data.items?.map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description || '',
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
  })) || [];
}

async function analyzeVideo(
  video: YouTubeSearchResult,
  targetInstructor: string,
  duration: number
): Promise<{
  isInstructional: boolean;
  isTargetInstructor: boolean;
  technique: string | null;
  techniqueType: string | null;
  positionCategory: string | null;
  giOrNogi: string | null;
  qualityScore: number;
  reasoning: string;
}> {
  const defaultResult = {
    isInstructional: false,
    isTargetInstructor: false,
    technique: null,
    techniqueType: null,
    positionCategory: null,
    giOrNogi: null,
    qualityScore: 0,
    reasoning: 'Analysis failed'
  };

  const prompt = `Analyze this BJJ video for instructional quality. Target instructor: ${targetInstructor}

VIDEO INFO:
Title: ${video.title}
Channel: ${video.channelTitle}
Description: ${video.description.substring(0, 500)}
Duration: ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}

ANALYZE:
1. Is this an INSTRUCTIONAL video teaching technique?
   - REJECT: competition footage, podcasts, interviews, vlogs, highlight reels, reactions
   - ACCEPT: technique breakdowns, tutorials, drilling demonstrations
2. Is ${targetInstructor} the instructor teaching (not just mentioned)?
3. What specific technique is being taught?
4. What type? (submission, sweep, pass, escape, guard, takedown, position, defense, transition, drill)
5. What position category? (guard, mount, side control, back, standing, half guard, turtle, etc.)
6. Gi, No-Gi, or Both?
7. Quality score 0-10 based on: clear instruction, technique depth, production quality, educational value

RESPOND IN JSON:
{
  "isInstructional": boolean,
  "isTargetInstructor": boolean,
  "technique": "specific technique name" or null,
  "techniqueType": "type" or null,
  "positionCategory": "position" or null,
  "giOrNogi": "gi" | "nogi" | "both" or null,
  "qualityScore": 0-10,
  "reasoning": "brief explanation"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    if (!response.content || response.content.length === 0) {
      return defaultResult;
    }

    const content = response.content[0];
    if (content.type !== 'text' || !content.text) {
      return defaultResult;
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return defaultResult;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      isInstructional: Boolean(parsed.isInstructional),
      isTargetInstructor: Boolean(parsed.isTargetInstructor),
      technique: parsed.technique || null,
      techniqueType: parsed.techniqueType || null,
      positionCategory: parsed.positionCategory || null,
      giOrNogi: parsed.giOrNogi || null,
      qualityScore: Number(parsed.qualityScore) || 0,
      reasoning: parsed.reasoning || 'Parsed successfully'
    };
  } catch (error: any) {
    console.error(`[ANALYZE] Error:`, error.message);
    return { ...defaultResult, reasoning: `Error: ${error.message}` };
  }
}

async function checkVideoExists(youtubeId: string): Promise<boolean> {
  const result = await db.select({ id: aiVideoKnowledge.id })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.youtubeId, youtubeId))
    .limit(1);
  return result.length > 0;
}

async function getInstructorVideoCount(instructorName: string): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.instructorName, instructorName));
  return Number(result[0]?.count || 0);
}

async function getNextInstructorsToCurate(count: number = 12): Promise<{ name: string; videoCount: number }[]> {
  // Helper to extract rows from drizzle result (handles both array and .rows formats)
  const getRows = (result: any): any[] => {
    if (Array.isArray(result)) return result;
    if (result?.rows && Array.isArray(result.rows)) return result.rows;
    return [];
  };

  // First check if instructor_credibility has any entries
  const credibilityResult = await db.execute(sql`SELECT COUNT(*) as count FROM instructor_credibility`);
  const credibilityRows = getRows(credibilityResult);
  const hasCredibilityData = Number(credibilityRows[0]?.count || 0) > 0;

  if (hasCredibilityData) {
    // Use instructor_credibility table (original logic)
    const instructorResult = await db.execute(sql`
      SELECT 
        ic.name,
        COALESCE(vc.video_count, 0)::int as video_count,
        cr.last_curated_at
      FROM instructor_credibility ic
      LEFT JOIN (
        SELECT instructor_name, COUNT(*) as video_count
        FROM ai_video_knowledge
        WHERE instructor_name IS NOT NULL
        GROUP BY instructor_name
      ) vc ON ic.name = vc.instructor_name
      LEFT JOIN curation_rotation cr ON ic.name = cr.instructor_name
      ORDER BY 
        cr.last_curated_at NULLS FIRST,
        COALESCE(vc.video_count, 0) ASC
      LIMIT ${count}
    `);

    return getRows(instructorResult).map((row: any) => ({
      name: row.name,
      videoCount: parseInt(row.video_count) || 0,
    }));
  }

  // FALLBACK: Use ai_video_knowledge directly when instructor_credibility is empty
  console.log(`[UNIFIED] instructor_credibility is empty, falling back to ai_video_knowledge`);
  
  const instructorsFromVideos = await db.execute(sql`
    SELECT 
      avk.instructor_name as name,
      COUNT(*)::int as video_count,
      cr.last_curated_at
    FROM ai_video_knowledge avk
    LEFT JOIN curation_rotation cr ON avk.instructor_name = cr.instructor_name
    WHERE avk.instructor_name IS NOT NULL 
      AND avk.instructor_name != ''
      AND avk.instructor_name NOT LIKE '%Unknown%'
      AND avk.instructor_name NOT LIKE '%Not Identified%'
    GROUP BY avk.instructor_name, cr.last_curated_at
    ORDER BY 
      cr.last_curated_at NULLS FIRST,
      COUNT(*) ASC
    LIMIT ${count}
  `);

  const rows = getRows(instructorsFromVideos);
  console.log(`[UNIFIED] Found ${rows.length} instructors from ai_video_knowledge`);
  
  return rows.map((row: any) => ({
    name: row.name,
    videoCount: parseInt(row.video_count) || 0,
  }));
}

async function getCurrentRotationCycle(): Promise<number> {
  const result = await db.select({ cycle: sql<number>`COALESCE(MAX(rotation_cycle), 1)` })
    .from(curationRotation);
  return result[0]?.cycle || 1;
}

async function checkAndIncrementRotationCycle(): Promise<number> {
  const currentCycle = await getCurrentRotationCycle();
  
  // Helper to extract rows from drizzle result
  const getRows = (result: any): any[] => {
    if (Array.isArray(result)) return result;
    if (result?.rows && Array.isArray(result.rows)) return result.rows;
    return [];
  };
  
  // Count ALL instructors eligible for curation (check instructor_credibility first, fallback to ai_video_knowledge)
  let eligibleCount = 0;
  const credibilityCheck = await db.execute(sql`SELECT COUNT(*) as count FROM instructor_credibility`);
  const credibilityRows = getRows(credibilityCheck);
  const credibilityCount = Number(credibilityRows[0]?.count || 0);
  
  if (credibilityCount > 0) {
    eligibleCount = credibilityCount;
  } else {
    // Fallback: count distinct instructors from ai_video_knowledge
    const videoInstructorCheck = await db.execute(sql`
      SELECT COUNT(DISTINCT instructor_name) as count 
      FROM ai_video_knowledge 
      WHERE instructor_name IS NOT NULL 
        AND instructor_name != '' 
        AND instructor_name NOT LIKE '%Unknown%'
        AND instructor_name NOT LIKE '%Not Identified%'
    `);
    const videoRows = getRows(videoInstructorCheck);
    eligibleCount = Number(videoRows[0]?.count || 0);
  }
  
  // Count how many have been curated in the current cycle
  const curatedThisCycle = await db.select({ count: sql<number>`count(*)` })
    .from(curationRotation)
    .where(eq(curationRotation.rotationCycle, currentCycle));
  const curatedCount = Number(curatedThisCycle[0]?.count || 0);

  // If all eligible instructors have been curated in this cycle, advance
  if (curatedCount >= eligibleCount && eligibleCount > 0) {
    const newCycle = currentCycle + 1;
    console.log(`🔄 Rotation cycle ${currentCycle} complete (${curatedCount}/${eligibleCount})! Starting cycle ${newCycle}`);
    return newCycle;
  }

  console.log(`📊 Rotation cycle ${currentCycle}: ${curatedCount}/${eligibleCount} instructors curated`);
  return currentCycle;
}

async function updateRotationTracking(
  instructorName: string,
  videosBefore: number,
  videosAfter: number,
  videosAdded: number,
  rotationCycle: number
): Promise<void> {
  await db.insert(curationRotation)
    .values({
      instructorName,
      lastCuratedAt: new Date(),
      videosBefore,
      videosAfter,
      videosAdded,
      rotationCycle,
    })
    .onConflictDoUpdate({
      target: curationRotation.instructorName,
      set: {
        lastCuratedAt: new Date(),
        videosBefore,
        videosAfter,
        videosAdded,
        rotationCycle,
      }
    });
}

async function curateInstructor(
  instructorName: string,
  minQuality: number = 7.0,
  minDuration: number = 120
): Promise<CurationStats> {
  console.log(`\n🎯 Curating: ${instructorName}`);
  
  const stats: CurationStats = {
    instructor: instructorName,
    searchesRun: 0,
    videosFound: 0,
    videosAnalyzed: 0,
    videosAdded: 0,
    skippedDuplicate: 0,
    skippedShort: 0,
    skippedNonInstructional: 0,
    skippedLowQuality: 0,
    beforeCount: 0,
    afterCount: 0,
  };

  stats.beforeCount = await getInstructorVideoCount(instructorName);
  const queries = generateSearchQueries(instructorName);

  for (const query of queries) {
    stats.searchesRun++;
    console.log(`   🔍 Search ${stats.searchesRun}/5: "${query}"`);

    try {
      const videos = await searchYouTube(query, 20);
      stats.videosFound += videos.length;

      for (const video of videos) {
        if (await checkVideoExists(video.videoId)) {
          stats.skippedDuplicate++;
          continue;
        }

        let duration = 0;
        try {
          const details = await getVideoDetails(video.videoId);
          duration = details?.duration || 0;
        } catch (e) {
          continue;
        }

        if (duration < minDuration) {
          stats.skippedShort++;
          continue;
        }

        stats.videosAnalyzed++;

        const analysis = await analyzeVideo(video, instructorName, duration);

        if (!analysis.isInstructional || !analysis.isTargetInstructor) {
          stats.skippedNonInstructional++;
          continue;
        }

        if (analysis.qualityScore < minQuality) {
          stats.skippedLowQuality++;
          continue;
        }

        try {
          const [insertedVideo] = await db.insert(aiVideoKnowledge).values({
            youtubeId: video.videoId,
            videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
            title: video.title,
            techniqueName: analysis.technique || 'General Instruction',
            instructorName: instructorName,
            techniqueType: analysis.techniqueType,
            positionCategory: analysis.positionCategory,
            giOrNogi: analysis.giOrNogi,
            qualityScore: analysis.qualityScore.toString(),
            duration: duration,
            thumbnailUrl: video.thumbnailUrl,
            channelName: video.channelTitle,
            createdAt: new Date(),
            sourceType: 'unified_curation',
            tags: [instructorName.toLowerCase(), analysis.techniqueType, analysis.positionCategory].filter(Boolean) as string[],
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

          stats.videosAdded++;
          console.log(`   ✅ Added: ${video.title.substring(0, 45)}... (Q:${analysis.qualityScore})`);
        } catch (insertError: any) {
          if (insertError.message?.includes('duplicate')) {
            stats.skippedDuplicate++;
          }
        }
      }
    } catch (searchError: any) {
      if (searchError.message === 'QUOTA_EXHAUSTED') {
        throw searchError;
      }
      console.error(`   ❌ Search error: ${searchError.message}`);
    }
  }

  stats.afterCount = await getInstructorVideoCount(instructorName);
  console.log(`   📊 Result: ${stats.beforeCount} → ${stats.afterCount} (+${stats.videosAdded})`);

  return stats;
}

export async function runUnifiedCuration(
  instructorCount: number = 12,
  minQuality: number = 7.0
): Promise<UnifiedCurationResult> {
  const startTime = new Date();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🚀 UNIFIED CURATION STARTED`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Time: ${startTime.toISOString()}`);
  console.log(`Target instructors: ${instructorCount}`);
  console.log(`Min quality: ${minQuality}`);

  const result: UnifiedCurationResult = {
    success: true,
    instructorsCurated: 0,
    totalVideosAdded: 0,
    instructorStats: [],
    rotationCycle: await getCurrentRotationCycle(),
    startTime,
    endTime: new Date(),
    durationMinutes: 0,
    quotaExhausted: false,
  };

  try {
    const instructors = await getNextInstructorsToCurate(instructorCount);
    console.log(`\n📋 Selected ${instructors.length} instructors:`);
    instructors.forEach((i, idx) => {
      console.log(`   ${idx + 1}. ${i.name} (${i.videoCount} videos)`);
    });

    for (const instructor of instructors) {
      try {
        const stats = await curateInstructor(instructor.name, minQuality);
        result.instructorStats.push(stats);
        result.instructorsCurated++;
        result.totalVideosAdded += stats.videosAdded;

        await updateRotationTracking(
          instructor.name,
          stats.beforeCount,
          stats.afterCount,
          stats.videosAdded,
          result.rotationCycle
        );

      } catch (error: any) {
        if (error.message === 'QUOTA_EXHAUSTED') {
          console.log(`\n⚠️ YouTube quota exhausted after ${result.instructorsCurated} instructors`);
          result.quotaExhausted = true;
          break;
        }
        console.error(`Error curating ${instructor.name}:`, error.message);
      }
    }

    result.rotationCycle = await checkAndIncrementRotationCycle();

  } catch (error: any) {
    console.error(`Curation failed:`, error);
    result.success = false;
    result.error = error.message;
  }

  result.endTime = new Date();
  result.durationMinutes = Math.round((result.endTime.getTime() - startTime.getTime()) / 60000);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 CURATION COMPLETE`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Instructors curated: ${result.instructorsCurated}`);
  console.log(`Videos added: ${result.totalVideosAdded}`);
  console.log(`Duration: ${result.durationMinutes} minutes`);
  console.log(`Quota exhausted: ${result.quotaExhausted}`);
  console.log(`${'═'.repeat(60)}\n`);

  return result;
}

export async function getCurationStatus(): Promise<{
  totalVideos: number;
  instructorsWithVideos: number;
  lastCuration: Date | null;
  rotationCycle: number;
  recentlyAdded: number;
}> {
  const [videoCount, instructorCount, lastRun, recentVideos] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(aiVideoKnowledge),
    db.execute(sql`SELECT COUNT(DISTINCT instructor_name) as count FROM ai_video_knowledge`),
    db.select({ lastCurated: curationRotation.lastCuratedAt })
      .from(curationRotation)
      .orderBy(desc(curationRotation.lastCuratedAt))
      .limit(1),
    db.select({ count: sql<number>`count(*)` })
      .from(aiVideoKnowledge)
      .where(sql`created_at > NOW() - INTERVAL '24 hours'`),
  ]);

  return {
    totalVideos: Number(videoCount[0]?.count || 0),
    instructorsWithVideos: Number((instructorCount.rows?.[0] as any)?.count || 0),
    lastCuration: lastRun[0]?.lastCurated || null,
    rotationCycle: await getCurrentRotationCycle(),
    recentlyAdded: Number(recentVideos[0]?.count || 0),
  };
}
