/**
 * EXHAUSTIVE CURATION RUNNER
 * Runs unified curation on 20 lowest-count instructors until quota exhausted
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from './db';
import { aiVideoKnowledge, instructorCredibility, curationRotation } from '@shared/schema';
import { eq, sql, asc, and, isNotNull } from 'drizzle-orm';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const QUALITY_THRESHOLD = 7.0;
const MIN_DURATION_SECONDS = 120;
const MAX_INSTRUCTORS = 20;
const SEARCHES_PER_INSTRUCTOR = 5;
const RESULTS_PER_SEARCH = 25;

interface InstructorStats {
  name: string;
  beforeCount: number;
  afterCount: number;
  videosAdded: number;
  searchesRun: number;
  videosAnalyzed: number;
  skippedDuplicate: number;
  skippedShort: number;
  skippedNonInstructional: number;
  skippedLowQuality: number;
}

interface CurationReport {
  startTime: Date;
  endTime?: Date;
  instructors: InstructorStats[];
  totalVideosAdded: number;
  newLibraryTotal: number;
  quotaExhausted: boolean;
  error?: string;
}

function generateSearchQueries(instructorName: string): string[] {
  return [
    `${instructorName} jiu jitsu technique`,
    `${instructorName} BJJ instructional`,
    `${instructorName} guard pass`,
    `${instructorName} submission`,
    `${instructorName} tutorial`,
  ];
}

async function searchYouTube(query: string): Promise<any[]> {
  if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY not configured');

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('q', query);
  url.searchParams.append('type', 'video');
  url.searchParams.append('maxResults', RESULTS_PER_SEARCH.toString());
  url.searchParams.append('order', 'relevance');
  url.searchParams.append('key', YOUTUBE_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error?.error?.errors?.[0]?.reason === 'quotaExceeded') {
      throw new Error('QUOTA_EXHAUSTED');
    }
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

async function getVideoDetails(videoId: string): Promise<{ duration: number } | null> {
  if (!YOUTUBE_API_KEY) return null;

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.append('part', 'contentDetails');
  url.searchParams.append('id', videoId);
  url.searchParams.append('key', YOUTUBE_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error?.error?.errors?.[0]?.reason === 'quotaExceeded') {
      throw new Error('QUOTA_EXHAUSTED');
    }
    return null;
  }

  const data = await response.json();
  if (!data.items?.[0]?.contentDetails?.duration) return null;

  const duration = parseDuration(data.items[0].contentDetails.duration);
  return { duration };
}

function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

async function analyzeVideo(video: any, targetInstructor: string, duration: number): Promise<{
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

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyze this BJJ video for our instructional library.

VIDEO:
Title: ${video.title}
Channel: ${video.channelTitle}
Duration: ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}
Description: ${video.description?.slice(0, 500) || 'No description'}

TARGET INSTRUCTOR: ${targetInstructor}

REJECT if:
- Podcast, interview, or talk show
- Competition footage only (no instruction)
- Vlog, behind-the-scenes, or documentary
- Product review or advertisement
- Under 2 minutes
- Not actually featuring ${targetInstructor} teaching

ACCEPT if:
- Clear BJJ technique instruction
- Tutorial with step-by-step breakdown
- Drilling or technique demonstration
- Features ${targetInstructor} as the instructor

Respond in JSON:
{
  "isInstructional": boolean,
  "isTargetInstructor": boolean,
  "technique": "specific technique name or null",
  "techniqueType": "sweep|pass|submission|escape|takedown|guard|control|other|null",
  "positionCategory": "guard|mount|side_control|back|standing|half_guard|turtle|other|null",
  "giOrNogi": "gi|nogi|both|null",
  "qualityScore": 0-10,
  "reasoning": "brief explanation"
}`
      }]
    });

    const content = response.content[0];
    if (content.type !== 'text') return defaultResult;

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaultResult;

    return JSON.parse(jsonMatch[0]);
  } catch (error: any) {
    console.error(`[ANALYZE] Error:`, error.message);
    return defaultResult;
  }
}

async function isDuplicate(videoId: string): Promise<boolean> {
  const existing = await db.select({ id: aiVideoKnowledge.id })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.videoUrl, `https://www.youtube.com/watch?v=${videoId}`))
    .limit(1);
  return existing.length > 0;
}

async function addVideoToLibrary(video: any, analysis: any, duration: number): Promise<boolean> {
  try {
    await db.insert(aiVideoKnowledge).values({
      videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      youtubeId: video.videoId,
      title: video.title,
      channelName: video.channelTitle,
      instructorName: analysis.technique ? video.channelTitle : null,
      thumbnailUrl: video.thumbnailUrl,
      uploadDate: new Date(video.publishedAt),
      duration: duration,
      techniqueName: analysis.technique || 'BJJ Technique',
      techniqueType: analysis.techniqueType,
      positionCategory: analysis.positionCategory,
      giOrNogi: analysis.giOrNogi,
      qualityScore: analysis.qualityScore.toString(),
      curationRunId: 'unified_curation',
    });
    return true;
  } catch (error: any) {
    console.error(`[ADD VIDEO] Error:`, error.message);
    return false;
  }
}

async function getLowestCountInstructors(limit: number): Promise<{ name: string; count: number }[]> {
  const instructors = await db.select({
    name: instructorCredibility.name,
  })
  .from(instructorCredibility)
  .where(isNotNull(instructorCredibility.name));

  const counts: { name: string; count: number }[] = [];
  
  for (const instructor of instructors) {
    if (!instructor.name) continue;
    
    const searchPattern = `%${instructor.name}%`;
    const countResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(aiVideoKnowledge)
      .where(sql`LOWER(${aiVideoKnowledge.instructorName}) LIKE LOWER(${searchPattern}) 
             OR LOWER(${aiVideoKnowledge.channelName}) LIKE LOWER(${searchPattern})`);
    
    counts.push({
      name: instructor.name,
      count: Number(countResult[0]?.count || 0)
    });
  }

  counts.sort((a, b) => a.count - b.count);
  return counts.slice(0, limit);
}

async function runExhaustiveCuration(): Promise<CurationReport> {
  const report: CurationReport = {
    startTime: new Date(),
    instructors: [],
    totalVideosAdded: 0,
    newLibraryTotal: 0,
    quotaExhausted: false,
  };

  console.log('\n' + '='.repeat(60));
  console.log('🚀 EXHAUSTIVE CURATION STARTING');
  console.log('='.repeat(60));
  console.log(`Time: ${report.startTime.toISOString()}`);
  console.log(`Target: ${MAX_INSTRUCTORS} instructors, ${SEARCHES_PER_INSTRUCTOR} searches each`);
  console.log(`Quality threshold: ${QUALITY_THRESHOLD}+`);
  console.log('='.repeat(60) + '\n');

  try {
    const instructors = await getLowestCountInstructors(MAX_INSTRUCTORS);
    console.log(`📋 Found ${instructors.length} instructors to process:\n`);
    instructors.forEach((i, idx) => console.log(`   ${idx + 1}. ${i.name} (${i.count} videos)`));
    console.log('');

    for (const instructor of instructors) {
      const stats: InstructorStats = {
        name: instructor.name,
        beforeCount: instructor.count,
        afterCount: instructor.count,
        videosAdded: 0,
        searchesRun: 0,
        videosAnalyzed: 0,
        skippedDuplicate: 0,
        skippedShort: 0,
        skippedNonInstructional: 0,
        skippedLowQuality: 0,
      };

      console.log(`\n${'─'.repeat(50)}`);
      console.log(`🎯 Processing: ${instructor.name}`);
      console.log(`   Starting count: ${instructor.count} videos`);
      console.log('─'.repeat(50));

      const queries = generateSearchQueries(instructor.name);

      for (const query of queries) {
        try {
          console.log(`   🔍 Search: "${query}"`);
          stats.searchesRun++;

          const results = await searchYouTube(query);
          console.log(`      Found ${results.length} results`);

          for (const video of results) {
            if (await isDuplicate(video.videoId)) {
              stats.skippedDuplicate++;
              continue;
            }

            const details = await getVideoDetails(video.videoId);
            if (!details) continue;

            if (details.duration < MIN_DURATION_SECONDS) {
              stats.skippedShort++;
              continue;
            }

            stats.videosAnalyzed++;
            const analysis = await analyzeVideo(video, instructor.name, details.duration);

            if (!analysis.isInstructional || !analysis.isTargetInstructor) {
              stats.skippedNonInstructional++;
              continue;
            }

            if (analysis.qualityScore < QUALITY_THRESHOLD) {
              stats.skippedLowQuality++;
              continue;
            }

            const added = await addVideoToLibrary(video, analysis, details.duration);
            if (added) {
              stats.videosAdded++;
              stats.afterCount++;
              report.totalVideosAdded++;
              console.log(`      ✅ Added: "${video.title.slice(0, 50)}..." (${analysis.qualityScore}/10)`);
            }
          }
        } catch (error: any) {
          if (error.message === 'QUOTA_EXHAUSTED') {
            console.log('\n⚠️ YouTube API quota exhausted!');
            report.quotaExhausted = true;
            break;
          }
          console.error(`      ❌ Search error: ${error.message}`);
        }
      }

      console.log(`\n   📊 ${instructor.name} Summary:`);
      console.log(`      Searches: ${stats.searchesRun}/${SEARCHES_PER_INSTRUCTOR}`);
      console.log(`      Analyzed: ${stats.videosAnalyzed}`);
      console.log(`      Added: ${stats.videosAdded}`);
      console.log(`      Before: ${stats.beforeCount} → After: ${stats.afterCount}`);
      console.log(`      Skipped: ${stats.skippedDuplicate} duplicate, ${stats.skippedShort} short, ${stats.skippedNonInstructional} non-instructional, ${stats.skippedLowQuality} low quality`);

      report.instructors.push(stats);

      // Record rotation
      await db.insert(curationRotation).values({
        instructorName: instructor.name,
        lastCuratedAt: new Date(),
        videosBefore: stats.beforeCount,
        videosAfter: stats.afterCount,
        videosAdded: stats.videosAdded,
        rotationCycle: 1,
      }).onConflictDoUpdate({
        target: curationRotation.instructorName,
        set: {
          lastCuratedAt: new Date(),
          videosBefore: stats.beforeCount,
          videosAfter: stats.afterCount,
          videosAdded: stats.videosAdded,
        }
      });

      if (report.quotaExhausted) break;
    }

    const totalResult = await db.select({ count: sql<number>`COUNT(*)` }).from(aiVideoKnowledge);
    report.newLibraryTotal = Number(totalResult[0]?.count || 0);

  } catch (error: any) {
    report.error = error.message;
    console.error('\n❌ Fatal error:', error.message);
  }

  report.endTime = new Date();
  const durationMs = report.endTime.getTime() - report.startTime.getTime();
  const durationMin = Math.round(durationMs / 60000);

  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL CURATION REPORT');
  console.log('='.repeat(60));
  console.log(`Duration: ${durationMin} minutes`);
  console.log(`Instructors processed: ${report.instructors.length}/${MAX_INSTRUCTORS}`);
  console.log(`Total videos added: ${report.totalVideosAdded}`);
  console.log(`New library total: ${report.newLibraryTotal}`);
  console.log(`Quota exhausted: ${report.quotaExhausted ? 'YES' : 'NO'}`);
  console.log('');
  console.log('Per-instructor breakdown:');
  report.instructors.forEach(i => {
    console.log(`   ${i.name}: ${i.beforeCount} → ${i.afterCount} (+${i.videosAdded})`);
  });
  console.log('='.repeat(60) + '\n');

  return report;
}

runExhaustiveCuration()
  .then(report => {
    console.log('\n✅ Curation complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Curation failed:', error);
    process.exit(1);
  });
