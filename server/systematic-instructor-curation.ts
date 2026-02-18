import { db } from './db';
import { aiVideoKnowledge } from '@shared/schema';
import { sql, eq, ilike, or, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

interface InstructorStats {
  name: string;
  beforeCount: number;
  afterCount: number;
  videosAdded: number;
  fullyMined: boolean;
}

interface CurationResult {
  instructorStats: InstructorStats[];
  totalVideosAdded: number;
  libraryBefore: number;
  libraryAfter: number;
  fullyMinedInstructors: string[];
}

async function searchYouTube(query: string): Promise<any[]> {
  if (!YOUTUBE_API_KEY) {
    console.log('  ⚠️ No YouTube API key');
    return [];
  }
  
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=25&videoDuration=medium&key=${YOUTUBE_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.log(`  ⚠️ YouTube API error: ${data.error.message}`);
      return [];
    }
    
    return data.items || [];
  } catch (error) {
    console.log(`  ⚠️ Search error: ${error}`);
    return [];
  }
}

async function getVideoDuration(videoId: string): Promise<number> {
  if (!YOUTUBE_API_KEY) return 0;
  
  const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.items && data.items[0]) {
      const duration = data.items[0].contentDetails.duration;
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (match) {
        const hours = parseInt(match[1] || '0');
        const minutes = parseInt(match[2] || '0');
        const seconds = parseInt(match[3] || '0');
        return hours * 3600 + minutes * 60 + seconds;
      }
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

async function isVideoInDatabase(youtubeUrl: string): Promise<boolean> {
  try {
    const existing = await db.execute(
      sql`SELECT id FROM ai_video_knowledge WHERE video_url = ${youtubeUrl} LIMIT 1`
    );
    return existing.rows.length > 0;
  } catch (error) {
    console.log(`    ⚠️ DB check error: ${error}`);
    return false;
  }
}

async function analyzeVideoWithClaude(title: string, description: string, instructorName: string): Promise<{
  isInstructional: boolean;
  qualityScore: number;
  techniqueType: string;
  positionCategory: string;
  giOrNogi: string;
  reason: string;
}> {
  const prompt = `Analyze this BJJ video for instructional quality:

Title: ${title}
Description: ${description}
Expected Instructor: ${instructorName}

RULES:
- Return FALSE if this is competition footage without instruction
- Return FALSE if this is a podcast, interview, or vlog
- Return FALSE if this appears to be a highlight reel
- Return TRUE only if this teaches specific BJJ techniques

Respond in JSON format:
{
  "isInstructional": boolean,
  "qualityScore": number (1-10, where 7+ is high quality instructional),
  "techniqueType": "attack" | "defense" | "transition" | "fundamental" | "escape",
  "positionCategory": string (e.g., "half_guard", "mount", "side_control", "closed_guard", "back_control"),
  "giOrNogi": "gi" | "nogi" | "both",
  "reason": "brief explanation"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.log(`  ⚠️ Claude analysis error: ${error}`);
  }

  return {
    isInstructional: false,
    qualityScore: 0,
    techniqueType: 'fundamental',
    positionCategory: 'general',
    giOrNogi: 'both',
    reason: 'Analysis failed'
  };
}

async function curateInstructor(instructorName: string): Promise<{ added: number; searched: number }> {
  const queries = [
    `${instructorName} jiu jitsu technique`,
    `${instructorName} BJJ instructional`,
    `${instructorName} guard pass`,
    `${instructorName} submission`,
    `${instructorName} tutorial`
  ];

  let totalAdded = 0;
  let totalSearched = 0;

  for (const query of queries) {
    console.log(`  🔍 Searching: "${query}"`);
    const results = await searchYouTube(query);
    totalSearched += results.length;

    for (const item of results) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;

      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const title = item.snippet?.title || '';
      const description = item.snippet?.description || '';

      // Skip if already in database
      if (await isVideoInDatabase(youtubeUrl)) {
        console.log(`    ⏭️ Already in library: ${title.substring(0, 50)}...`);
        continue;
      }

      // Check duration (must be >= 2 minutes)
      const duration = await getVideoDuration(videoId);
      if (duration < 120) {
        console.log(`    ⏭️ Too short (${Math.floor(duration/60)}:${duration%60}): ${title.substring(0, 40)}...`);
        continue;
      }

      // Analyze with Claude
      const analysis = await analyzeVideoWithClaude(title, description, instructorName);
      
      if (!analysis.isInstructional) {
        console.log(`    ⏭️ Not instructional: ${title.substring(0, 40)}... (${analysis.reason})`);
        continue;
      }

      if (analysis.qualityScore < 7.0) {
        console.log(`    ⏭️ Low quality (${analysis.qualityScore}/10): ${title.substring(0, 40)}...`);
        continue;
      }

      // Add to database using raw SQL
      try {
        const qualityScoreDb = Math.round(analysis.qualityScore * 10);
        const tag1 = instructorName.toLowerCase().replace(/\s+/g, '_');
        const tag2 = analysis.positionCategory;
        
        await db.execute(sql`
          INSERT INTO ai_video_knowledge (
            video_url, title, instructor_name, technique_type, 
            position_category, gi_or_nogi, quality_score, belt_level, tags
          ) VALUES (
            ${youtubeUrl}, ${title}, ${instructorName}, ${analysis.techniqueType},
            ${analysis.positionCategory}, ${analysis.giOrNogi}, ${qualityScoreDb}, 'all', 
            ARRAY[${tag1}, ${tag2}]::text[]
          )
        `);
        
        totalAdded++;
        console.log(`    ✅ ADDED (${analysis.qualityScore}/10): ${title.substring(0, 50)}...`);
      } catch (error) {
        console.log(`    ⚠️ Insert error: ${error}`);
      }
    }

    // Small delay between queries to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return { added: totalAdded, searched: totalSearched };
}

export async function runSystematicInstructorCuration(): Promise<CurationResult> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🎯 SYSTEMATIC INSTRUCTOR CURATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get initial library count
  const libraryBefore = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'active'))
    .then(r => Number(r[0].count));

  console.log(`📚 Library before: ${libraryBefore} videos\n`);

  // Get 15 instructors with 2-15 videos (more likely to have discoverable content)
  const instructors = await db.execute(sql`
    SELECT instructor_name, COUNT(*) as video_count 
    FROM ai_video_knowledge 
    WHERE instructor_name IS NOT NULL 
      AND instructor_name != '' 
      AND instructor_name != 'Unknown'
      AND instructor_name NOT LIKE '%(%'
      AND instructor_name NOT LIKE '% and %'
      AND LENGTH(instructor_name) > 5
      AND status = 'active'
    GROUP BY instructor_name 
    HAVING COUNT(*) BETWEEN 2 AND 15
    ORDER BY COUNT(*) ASC
    LIMIT 15
  `);

  const instructorStats: InstructorStats[] = [];
  const fullyMinedInstructors: string[] = [];
  let totalVideosAdded = 0;

  for (const row of instructors.rows as any[]) {
    const name = row.instructor_name;
    const beforeCount = Number(row.video_count);

    console.log(`\n👨‍🏫 Processing: ${name} (${beforeCount} videos)`);
    console.log('─'.repeat(50));

    const result = await curateInstructor(name);
    totalVideosAdded += result.added;

    // Get updated count
    const afterCountResult = await db.select({ count: sql<number>`count(*)` })
      .from(aiVideoKnowledge)
      .where(and(eq(aiVideoKnowledge.instructorName, name), eq(aiVideoKnowledge.status, 'active')));
    const afterCount = Number(afterCountResult[0].count);

    const stat: InstructorStats = {
      name,
      beforeCount,
      afterCount,
      videosAdded: result.added,
      fullyMined: result.added === 0 && result.searched > 50
    };

    instructorStats.push(stat);

    if (stat.fullyMined) {
      fullyMinedInstructors.push(name);
    }

    console.log(`  📊 Result: ${beforeCount} → ${afterCount} (+${result.added})`);
  }

  // Get final library count
  const libraryAfter = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'active'))
    .then(r => Number(r[0].count));

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 CURATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Instructor Results:');
  for (const stat of instructorStats) {
    const status = stat.fullyMined ? '(fully mined)' : '';
    console.log(`  ${stat.name}: ${stat.beforeCount} → ${stat.afterCount} (+${stat.videosAdded}) ${status}`);
  }

  console.log(`\n📚 Library: ${libraryBefore} → ${libraryAfter} (+${totalVideosAdded} total)`);

  if (fullyMinedInstructors.length > 0) {
    console.log(`\n⛏️ Fully mined instructors (no new content found):`);
    for (const name of fullyMinedInstructors) {
      console.log(`  - ${name}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  return {
    instructorStats,
    totalVideosAdded,
    libraryBefore,
    libraryAfter,
    fullyMinedInstructors
  };
}

// CLI execution
if (process.argv[1]?.includes('systematic-instructor-curation')) {
  runSystematicInstructorCuration()
    .then(result => {
      console.log('✅ Curation complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Curation failed:', error);
      process.exit(1);
    });
}
