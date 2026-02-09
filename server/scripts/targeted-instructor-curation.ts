import { db } from '../db';
import { aiVideoKnowledge } from '../../shared/schema';
import { sql, ilike, eq, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

const TARGET_INSTRUCTORS = [
  'JT Torres', 'Cobrinha', 'Leandro Lo', 'Gui Mendes', 'Eduardo Telles',
  'Ethan Crelinsten', 'Draculino', 'Kaynan Duarte', 'Lucas Leite', 'Josh Barnett',
  'Josh Rich', 'Roger Gracie', 'Romulo Barral', 'Rafael Mendes', 'Rubens Charles', 'Marcelo Garcia'
];

const SEARCH_SUFFIXES = [
  'jiu jitsu technique',
  'BJJ instructional', 
  'guard pass',
  'submission',
  'tutorial'
];

interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
}

interface AnalysisResult {
  isInstructional: boolean;
  instructorName: string;
  techniqueName: string;
  qualityScore: number;
  techniqueType: string;
  positionCategory: string;
  giOrNogi: string;
  reject: boolean;
  rejectReason?: string;
}

async function searchYouTube(query: string, maxResults = 10): Promise<SearchResult[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', maxResults.toString());
  url.searchParams.set('videoDuration', 'medium');
  url.searchParams.set('key', YOUTUBE_API_KEY || '');

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.log(`  ⚠️ YouTube API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return (data.items || []).map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    description: item.snippet.description || ''
  }));
}

async function getVideoDuration(videoId: string): Promise<number> {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', YOUTUBE_API_KEY || '');

  try {
    const response = await fetch(url.toString());
    const data = await response.json();
    
    if (data.items?.[0]?.contentDetails?.duration) {
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
  } catch {
    return 0;
  }
}

async function isVideoInDatabase(youtubeId: string): Promise<boolean> {
  const existing = await db.select({ id: aiVideoKnowledge.id })
    .from(aiVideoKnowledge)
    .where(sql`${aiVideoKnowledge.videoUrl} LIKE ${'%' + youtubeId + '%'}`)
    .limit(1);
  return existing.length > 0;
}

async function analyzeVideo(video: SearchResult, targetInstructor: string): Promise<AnalysisResult> {
  const prompt = `Analyze this BJJ video for quality and content:

**Target Instructor:** ${targetInstructor}
**Title:** ${video.title}
**Channel:** ${video.channelTitle}
**Description:** ${video.description.slice(0, 500)}

Answer these questions in JSON format:
{
  "isInstructional": boolean - Is this an instructional video with explicit teaching? (NOT competition footage, NOT podcast, NOT interview),
  "instructorName": string - The instructor's full name (must match or be similar to "${targetInstructor}"),
  "techniqueName": string - Specific technique being taught,
  "qualityScore": number 1-10 - Overall instructional quality,
  "techniqueType": string - One of: submission, pass, sweep, escape, takedown, position, defense, transition, concept,
  "positionCategory": string - One of: guard, mount, side_control, back, half_guard, standing, other,
  "giOrNogi": string - One of: gi, nogi, both,
  "reject": boolean - True if NOT instructional OR instructor doesn't match OR is competition/podcast/interview,
  "rejectReason": string - Reason for rejection if applicable
}

Only respond with valid JSON.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
  } catch (error) {
    console.log(`  ⚠️ Analysis error: ${error}`);
  }

  return {
    isInstructional: false,
    instructorName: '',
    techniqueName: '',
    qualityScore: 0,
    techniqueType: '',
    positionCategory: '',
    giOrNogi: 'both',
    reject: true,
    rejectReason: 'Analysis failed'
  };
}

async function addVideoToDatabase(video: SearchResult, analysis: AnalysisResult): Promise<boolean> {
  try {
    await db.insert(aiVideoKnowledge).values({
      videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      title: video.title,
      techniqueName: analysis.techniqueName,
      instructorName: analysis.instructorName,
      techniqueType: analysis.techniqueType,
      positionCategory: analysis.positionCategory,
      giOrNogi: analysis.giOrNogi,
      qualityScore: analysis.qualityScore.toString(),
      channelName: video.channelTitle,
      keyTimestamps: [],
      tags: []
    });
    return true;
  } catch (error: any) {
    if (error.message?.includes('duplicate')) {
      return false;
    }
    console.log(`  ⚠️ DB error: ${error.message}`);
    return false;
  }
}

async function getInstructorCount(instructor: string): Promise<number> {
  const result = await db.select({ count: sql`COUNT(*)` })
    .from(aiVideoKnowledge)
    .where(and(ilike(aiVideoKnowledge.instructorName, `%${instructor}%`), eq(aiVideoKnowledge.status, 'active')));
  return Number(result[0].count);
}

async function runTargetedCuration() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🎯 TARGETED INSTRUCTOR CURATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Targeting ${TARGET_INSTRUCTORS.length} instructors with ${SEARCH_SUFFIXES.length} queries each\n`);

  const beforeCounts: Record<string, number> = {};
  const afterCounts: Record<string, number> = {};
  let totalAdded = 0;
  let totalAnalyzed = 0;
  let totalSkipped = 0;
  let totalRejected = 0;

  for (const instructor of TARGET_INSTRUCTORS) {
    beforeCounts[instructor] = await getInstructorCount(instructor);
  }

  for (const instructor of TARGET_INSTRUCTORS) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📹 Processing: ${instructor} (currently ${beforeCounts[instructor]} videos)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    let instructorAdded = 0;

    for (const suffix of SEARCH_SUFFIXES) {
      const query = `${instructor} ${suffix}`;
      console.log(`  🔍 Searching: "${query}"`);
      
      const results = await searchYouTube(query, 8);
      console.log(`     Found ${results.length} results`);

      for (const video of results) {
        const isDuplicate = await isVideoInDatabase(video.videoId);
        if (isDuplicate) {
          totalSkipped++;
          continue;
        }

        const duration = await getVideoDuration(video.videoId);
        if (duration < 120) {
          console.log(`     ⏭️ Skip (${duration}s < 2min): ${video.title.slice(0, 50)}`);
          totalSkipped++;
          continue;
        }

        totalAnalyzed++;
        console.log(`     📊 Analyzing: ${video.title.slice(0, 50)}...`);
        
        const analysis = await analyzeVideo(video, instructor);

        if (analysis.reject) {
          console.log(`     ❌ Rejected: ${analysis.rejectReason || 'Not instructional'}`);
          totalRejected++;
          continue;
        }

        if (analysis.qualityScore < 7.0) {
          console.log(`     ❌ Low quality (${analysis.qualityScore}/10)`);
          totalRejected++;
          continue;
        }

        const instructorMatch = analysis.instructorName.toLowerCase().includes(instructor.toLowerCase().split(' ')[0]) ||
                               instructor.toLowerCase().includes(analysis.instructorName.toLowerCase().split(' ')[0]);
        
        if (!instructorMatch) {
          console.log(`     ❌ Wrong instructor: ${analysis.instructorName}`);
          totalRejected++;
          continue;
        }

        const added = await addVideoToDatabase(video, analysis);
        if (added) {
          console.log(`     ✅ ADDED: ${analysis.techniqueName} (${analysis.qualityScore}/10)`);
          instructorAdded++;
          totalAdded++;
        }
      }

      await new Promise(r => setTimeout(r, 500));
    }

    afterCounts[instructor] = await getInstructorCount(instructor);
    console.log(`  📈 ${instructor}: ${beforeCounts[instructor]} → ${afterCounts[instructor]} (+${afterCounts[instructor] - beforeCounts[instructor]})`);
  }

  const [totalVideos] = await db.select({ count: sql`COUNT(*)` }).from(aiVideoKnowledge).where(eq(aiVideoKnowledge.status, 'active'));

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 CURATION COMPLETE - FINAL REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nINSTRUCTOR BREAKDOWN:');
  console.log('─────────────────────────────────────────────────────────────────');
  for (const instructor of TARGET_INSTRUCTORS) {
    const change = afterCounts[instructor] - beforeCounts[instructor];
    const changeStr = change > 0 ? `+${change}` : change.toString();
    console.log(`  ${instructor.padEnd(20)} ${beforeCounts[instructor].toString().padStart(3)} → ${afterCounts[instructor].toString().padStart(3)} (${changeStr})`);
  }
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(`\n📈 SUMMARY:`);
  console.log(`  Videos analyzed: ${totalAnalyzed}`);
  console.log(`  Videos skipped (duplicate/short): ${totalSkipped}`);
  console.log(`  Videos rejected (quality/content): ${totalRejected}`);
  console.log(`  NEW VIDEOS ADDED: ${totalAdded}`);
  console.log(`\n📚 TOTAL LIBRARY SIZE: ${totalVideos.count} videos`);
  console.log('═══════════════════════════════════════════════════════════════');
}

runTargetedCuration().catch(console.error);
