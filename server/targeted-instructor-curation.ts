/**
 * TARGETED INSTRUCTOR CURATION
 * Search for videos from a specific instructor and curate them
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from './db';
import { aiVideoKnowledge, instructorCredibility } from '@shared/schema';
import { eq, sql, or, ilike, and } from 'drizzle-orm';
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

interface CurationResult {
  searchQuery: string;
  videosFound: number;
  videosAnalyzed: number;
  videosAdded: number;
  skippedDuplicate: number;
  skippedLowQuality: number;
  skippedNonInstructional: number;
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

async function analyzeVideoForInstructor(
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
  const prompt = `Analyze this BJJ video for instructional quality. Target instructor: ${targetInstructor}

VIDEO INFO:
Title: ${video.title}
Channel: ${video.channelTitle}
Description: ${video.description.substring(0, 500)}
Duration: ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}

ANALYZE:
1. Is this an INSTRUCTIONAL video teaching technique (not competition footage, podcast, interview)?
2. Is ${targetInstructor} the instructor in this video (teaching, not just mentioned)?
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
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    return JSON.parse(jsonMatch[0]);
  } catch (error: any) {
    console.error(`[ANALYZE] Error:`, error.message);
    return {
      isInstructional: false,
      isTargetInstructor: false,
      technique: null,
      techniqueType: null,
      positionCategory: null,
      giOrNogi: null,
      qualityScore: 0,
      reasoning: `Error: ${error.message}`
    };
  }
}

export async function runTargetedInstructorCuration(
  instructorName: string,
  searchQueries: string[],
  minQuality: number = 7.0,
  minDuration: number = 120
): Promise<{
  totalBefore: number;
  totalAfter: number;
  videosAdded: number;
  techniquesCovered: string[];
  results: CurationResult[];
}> {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎯 TARGETED CURATION: ${instructorName}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Searches: ${searchQueries.length}`);
  console.log(`Min Quality: ${minQuality}`);
  console.log(`Min Duration: ${minDuration}s`);

  // Get current count
  const beforeCount = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(and(
      or(
        ilike(aiVideoKnowledge.instructorName, `%${instructorName}%`),
        ilike(aiVideoKnowledge.instructorName, instructorName)
      ),
      eq(aiVideoKnowledge.status, 'active')
    ));
  const totalBefore = Number(beforeCount[0]?.count || 0);
  console.log(`\n📊 Current ${instructorName} videos: ${totalBefore}`);

  // Get existing video IDs to skip
  const existingVideos = await db.select({ youtubeId: aiVideoKnowledge.youtubeId })
    .from(aiVideoKnowledge);
  const existingIds = new Set(existingVideos.map(v => v.youtubeId).filter(Boolean));
  console.log(`📦 Total videos in library: ${existingIds.size}`);

  const results: CurationResult[] = [];
  const allTechniques = new Set<string>();
  let totalAdded = 0;

  for (const query of searchQueries) {
    console.log(`\n🔍 Searching: "${query}"`);
    
    const result: CurationResult = {
      searchQuery: query,
      videosFound: 0,
      videosAnalyzed: 0,
      videosAdded: 0,
      skippedDuplicate: 0,
      skippedLowQuality: 0,
      skippedNonInstructional: 0
    };

    try {
      const videos = await searchYouTube(query, 25);
      result.videosFound = videos.length;
      console.log(`   Found ${videos.length} videos`);

      for (const video of videos) {
        // Skip if already in library
        if (existingIds.has(video.videoId)) {
          result.skippedDuplicate++;
          continue;
        }

        // Get video details for duration
        let duration = 0;
        try {
          const details = await getVideoDetails(video.videoId);
          duration = details?.duration || 0;
        } catch (e) {
          console.log(`   ⚠️ Could not get duration for ${video.videoId}`);
          continue;
        }

        // Skip if too short
        if (duration < minDuration) {
          console.log(`   ⏭️ Too short: ${video.title.substring(0, 40)}... (${Math.floor(duration/60)}:${(duration%60).toString().padStart(2,'0')})`);
          result.skippedNonInstructional++;
          continue;
        }

        result.videosAnalyzed++;

        // Analyze with AI
        const analysis = await analyzeVideoForInstructor(video, instructorName, duration);

        if (!analysis.isInstructional) {
          console.log(`   ❌ Not instructional: ${video.title.substring(0, 40)}...`);
          result.skippedNonInstructional++;
          continue;
        }

        if (!analysis.isTargetInstructor) {
          console.log(`   ❌ Not ${instructorName}: ${video.title.substring(0, 40)}...`);
          result.skippedNonInstructional++;
          continue;
        }

        if (analysis.qualityScore < minQuality) {
          console.log(`   ⚠️ Low quality (${analysis.qualityScore}): ${video.title.substring(0, 40)}...`);
          result.skippedLowQuality++;
          continue;
        }

        // Add to database
        try {
          await db.insert(aiVideoKnowledge).values({
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
            sourceType: 'targeted_curation',
            tags: [instructorName.toLowerCase(), analysis.techniqueType, analysis.positionCategory].filter(Boolean) as string[],
          });

          existingIds.add(video.videoId);
          result.videosAdded++;
          totalAdded++;
          
          if (analysis.technique) {
            allTechniques.add(analysis.technique);
          }

          console.log(`   ✅ ADDED: ${video.title.substring(0, 50)}... (Q:${analysis.qualityScore})`);
        } catch (insertError: any) {
          if (insertError.message?.includes('duplicate')) {
            result.skippedDuplicate++;
          } else {
            console.error(`   ❌ Insert error:`, insertError.message);
          }
        }
      }
    } catch (searchError: any) {
      console.error(`   ❌ Search error: ${searchError.message}`);
    }

    results.push(result);
    console.log(`   📈 Query result: +${result.videosAdded} videos`);
  }

  // Get final count
  const afterCount = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(and(
      or(
        ilike(aiVideoKnowledge.instructorName, `%${instructorName}%`),
        ilike(aiVideoKnowledge.instructorName, instructorName)
      ),
      eq(aiVideoKnowledge.status, 'active')
    ));
  const totalAfter = Number(afterCount[0]?.count || 0);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 CURATION COMPLETE: ${instructorName}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Before: ${totalBefore} videos`);
  console.log(`After: ${totalAfter} videos`);
  console.log(`Added: ${totalAdded} new videos`);
  console.log(`Techniques: ${Array.from(allTechniques).join(', ')}`);
  console.log(`${'═'.repeat(60)}\n`);

  return {
    totalBefore,
    totalAfter,
    videosAdded: totalAdded,
    techniquesCovered: Array.from(allTechniques),
    results
  };
}

// JT Torres specific curation
export async function curateJTTorres() {
  const searches = [
    "JT Torres jiu jitsu",
    "JT Torres technique",
    "JT Torres BJJ",
    "JT Torres guard pass",
    "JT Torres submission",
    "JT Torres instructional",
    "JT Torres grappling",
    "JT Torres no gi",
    "JT Torres gi",
    "JT Torres drill"
  ];

  return runTargetedInstructorCuration("JT Torres", searches, 7.0, 120);
}
