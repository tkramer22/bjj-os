/**
 * SIMPLE Instructor Curation
 * 
 * This is the EXACT simple approach that added 197 videos:
 * 1. Search "[instructor] jiu jitsu technique", "[instructor] BJJ instructional", etc.
 * 2. Check if video already exists (by youtube_id)
 * 3. Analyze with Claude (title + description only - NO transcript)
 * 4. Add if quality 7.0+ and instructional
 * 5. Skip podcasts/interviews/competition-only
 * 
 * NO multi-stage analyzer. NO transcript requirements. NO channel matching.
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from './db';
import { aiVideoKnowledge } from '@shared/schema';
import { sql, eq, and } from 'drizzle-orm';
import { searchBJJVideos, getVideoDetails } from './youtube-service';

const anthropic = new Anthropic();

// Minimum video duration: 70 seconds
const MIN_DURATION_SECONDS = 70;

// Quality threshold for adding videos
const QUALITY_THRESHOLD = 7.0;

interface SimpleAnalysisResult {
  isInstructional: boolean;
  instructorName: string | null;
  technique: string | null;
  qualityScore: number;
  recommended: boolean;
  reasoning: string;
}

/**
 * Simple Claude analysis - just title and description, no transcript
 */
async function simpleAnalyzeVideo(
  title: string,
  description: string,
  channelName: string
): Promise<SimpleAnalysisResult> {
  try {
    const prompt = `Analyze this BJJ video to determine if it's high-quality instructional content:

**Video Details:**
Title: ${title}
Channel: ${channelName}
Description: ${description.slice(0, 800)}

**Quick Assessment:**

1. Is this INSTRUCTIONAL content? (Teaching a specific technique)
   - YES: Tutorial, technique breakdown, how-to
   - NO: Competition footage, highlight reel, podcast, interview, vlog, Q&A

2. Who is the instructor? (Look for name in title/description)

3. What technique is being taught?

4. Quality Score (1-10):
   - 9-10: Elite instructor (world champion, renowned teacher)
   - 7-8: High quality clear instruction
   - 5-6: Average
   - Below 5: Poor quality or not instructional

**REJECT if:**
- Competition footage only
- Podcast or interview
- Vlog or lifestyle content
- Highlight reel
- No clear technique being taught

Respond in JSON:
{
  "isInstructional": boolean,
  "instructorName": "Name" or null,
  "technique": "Technique name" or null,
  "qualityScore": 1-10,
  "recommended": boolean,
  "reasoning": "Brief reason"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error: any) {
    console.error(`   Analysis error: ${error.message}`);
    return {
      isInstructional: false,
      instructorName: null,
      technique: null,
      qualityScore: 0,
      recommended: false,
      reasoning: `Error: ${error.message}`
    };
  }
}

/**
 * Add video to library
 */
async function addVideoToLibrary(
  videoId: string,
  title: string,
  channelName: string,
  instructorName: string,
  technique: string,
  qualityScore: number,
  duration: number
): Promise<boolean> {
  try {
    // Ensure quality score is within valid range (0-10)
    // Some AI responses give 0-100, normalize to 0-10
    let normalizedScore = qualityScore;
    if (qualityScore > 10) {
      normalizedScore = qualityScore / 10;
    }
    const clampedScore = Math.min(10, Math.max(0, normalizedScore));
    
    // Clamp duration to prevent overflow (max ~24 hours in seconds)
    const clampedDuration = Math.min(86400, Math.max(0, duration));
    
    await db.insert(aiVideoKnowledge).values({
      youtubeId: videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: title,
      instructorName: instructorName,
      techniqueName: technique,
      qualityScore: clampedScore.toFixed(1),
      channelName: channelName,
      duration: clampedDuration,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return true;
  } catch (error: any) {
    if (error.message?.includes('duplicate')) {
      return false; // Silently skip duplicates
    }
    console.error(`   Failed to add: ${error.message}`);
    return false;
  }
}

/**
 * Run simple curation for a list of instructors
 */
export async function runSimpleInstructorCuration(
  instructors: string[]
): Promise<{
  totalSearched: number;
  totalAnalyzed: number;
  totalAdded: number;
  totalSkipped: number;
  instructorResults: Record<string, { before: number; after: number; added: number }>;
}> {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('SIMPLE INSTRUCTOR CURATION');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Targeting ${instructors.length} instructors`);
  console.log(`Quality threshold: ${QUALITY_THRESHOLD}/10`);
  console.log(`Min duration: ${MIN_DURATION_SECONDS}s`);
  console.log('Method: Search → Check exists → Analyze → Add if quality 7.0+');
  console.log('════════════════════════════════════════════════════════════\n');

  const results: Record<string, { before: number; after: number; added: number }> = {};
  let totalSearched = 0;
  let totalAnalyzed = 0;
  let totalAdded = 0;
  let totalSkipped = 0;

  // Search queries for each instructor
  const queryTemplates = [
    '{instructor} jiu jitsu technique',
    '{instructor} BJJ instructional',
    '{instructor} guard pass',
    '{instructor} submission',
    '{instructor} tutorial',
    '{instructor} sweep',
    '{instructor} escape',
    '{instructor} choke'
  ];

  for (const instructor of instructors) {
    // Get current count
    const beforeCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM ai_video_knowledge WHERE LOWER(instructor_name) LIKE LOWER(${'%' + instructor + '%'}) AND status = 'active'`
    );
    const before = parseInt((beforeCount.rows[0] as any)?.count || '0');
    
    console.log(`\n──────────────────────────────────────────────────`);
    console.log(`🎯 ${instructor} (${before} videos currently)`);
    console.log(`──────────────────────────────────────────────────`);
    
    let addedForInstructor = 0;

    for (const template of queryTemplates) {
      const query = template.replace('{instructor}', instructor);
      console.log(`   📹 Searching: "${query}"`);
      
      try {
        const searchResults = await searchBJJVideos(query, 10);
        totalSearched += searchResults.length;
        
        for (const video of searchResults) {
          const videoId = video.youtube_id;
          const title = video.title;
          
          // Skip if already exists
          const [existing] = await db
            .select()
            .from(aiVideoKnowledge)
            .where(eq(aiVideoKnowledge.youtubeId, videoId))
            .limit(1);
          
          if (existing) {
            continue; // Silently skip duplicates
          }
          
          // Quick title check - skip obvious non-instructional
          const titleLower = title.toLowerCase();
          if (
            titleLower.includes('podcast') ||
            titleLower.includes('interview') ||
            titleLower.includes('q&a') ||
            titleLower.includes('reaction') ||
            titleLower.includes('vlog') ||
            (titleLower.includes(' vs ') && !titleLower.includes('technique'))
          ) {
            console.log(`   ⏭️  Skip (non-instructional title): ${title.slice(0, 50)}...`);
            totalSkipped++;
            continue;
          }
          
          // Get video duration
          let details;
          try {
            details = await getVideoDetails(videoId);
          } catch (error: any) {
            if (error.message?.includes('QUOTA_EXCEEDED')) {
              console.log('\n🚫 YouTube API quota exceeded. Stopping curation.');
              // Return results so far
              for (const inst of instructors) {
                if (!results[inst]) {
                  const count = await db.execute(
                    sql`SELECT COUNT(*) as count FROM ai_video_knowledge WHERE LOWER(instructor_name) LIKE LOWER(${'%' + inst + '%'}) AND status = 'active'`
                  );
                  results[inst] = { 
                    before: parseInt((count.rows[0] as any)?.count || '0'), 
                    after: parseInt((count.rows[0] as any)?.count || '0'),
                    added: 0 
                  };
                }
              }
              return { totalSearched, totalAnalyzed, totalAdded, totalSkipped, instructorResults: results };
            }
            continue;
          }
          
          if (!details || details.duration < MIN_DURATION_SECONDS) {
            totalSkipped++;
            continue;
          }
          
          // Analyze with Claude (simple - no transcript)
          totalAnalyzed++;
          console.log(`   🔬 Analyzing: ${title.slice(0, 60)}...`);
          
          const analysis = await simpleAnalyzeVideo(
            title,
            '', // No description needed for simple analysis
            video.channel_name
          );
          
          // Check if instructional and meets quality threshold
          if (!analysis.isInstructional) {
            console.log(`      ❌ Not instructional: ${analysis.reasoning}`);
            totalSkipped++;
            continue;
          }
          
          if (analysis.qualityScore < QUALITY_THRESHOLD) {
            console.log(`      ❌ Below threshold: ${analysis.qualityScore}/10`);
            totalSkipped++;
            continue;
          }
          
          // Determine instructor name (prefer analysis result, fallback to search instructor)
          const finalInstructor = analysis.instructorName || instructor;
          const technique = analysis.technique || 'BJJ Technique';
          
          // Add to library
          const added = await addVideoToLibrary(
            videoId,
            title,
            video.channel_name,
            finalInstructor,
            technique,
            analysis.qualityScore,
            details.duration
          );
          
          if (added) {
            totalAdded++;
            addedForInstructor++;
            console.log(`      ✅ ADDED: ${title.slice(0, 50)}... (${analysis.qualityScore}/10)`);
          }
        }
      } catch (error: any) {
        if (error.message?.includes('QUOTA_EXCEEDED')) {
          console.log('\n🚫 YouTube API quota exceeded. Stopping curation.');
          break;
        }
        console.log(`   ⚠️  Search error: ${error.message}`);
      }
    }
    
    // Get final count for this instructor
    const afterCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM ai_video_knowledge WHERE LOWER(instructor_name) LIKE LOWER(${'%' + instructor + '%'}) AND status = 'active'`
    );
    const after = parseInt((afterCount.rows[0] as any)?.count || '0');
    
    results[instructor] = { before, after, added: addedForInstructor };
    console.log(`   📊 ${instructor}: ${before} → ${after} (+${addedForInstructor})`);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('CURATION COMPLETE');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Videos searched: ${totalSearched}`);
  console.log(`Videos analyzed: ${totalAnalyzed}`);
  console.log(`Videos added: ${totalAdded}`);
  console.log(`Videos skipped: ${totalSkipped}`);
  console.log('════════════════════════════════════════════════════════════\n');

  return { totalSearched, totalAnalyzed, totalAdded, totalSkipped, instructorResults: results };
}
