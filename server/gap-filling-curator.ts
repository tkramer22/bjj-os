/**
 * Gap-Filling Curator
 * 
 * Runs targeted curation with SPECIFIC queries to fill gaps in the library.
 * 
 * THREE PILLARS:
 * 1. Elite Instructor Mining - Underrepresented elite instructors
 * 2. Technique Gap Filling - Underrepresented technique types  
 * 3. Position Coverage - Underrepresented positions
 * 
 * Quality Threshold: 6.5+ overall, no dimension below 4.0
 * 
 * Created: Nov 29, 2025
 * Updated: Nov 29, 2025 - Lowered threshold to 6.5, added pillar rotation
 */

import { db } from "./db";
import { aiVideoKnowledge, instructors } from "@shared/schema";
import { eq, sql, gte, asc } from "drizzle-orm";
import { trackSearchCall, trackVideoDetailCall, smartQuotaCheck } from "./youtube-quota-monitor";
import { runMultiStageAnalysis } from "./multi-stage-analyzer";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const QUALITY_THRESHOLD = 6.5;
const MIN_DIMENSION_SCORE = 4.0;

interface GapFillingResult {
  queriesRun: number;
  videosFound: number;
  videosAnalyzed: number;
  videosApproved: number;
  queryResults: Array<{
    query: string;
    found: number;
    analyzed: number;
    approved: number;
  }>;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// THREE PILLARS SEARCH STRATEGY
// ═══════════════════════════════════════════════════════════════════════════════

// PILLAR 1: Elite Instructor Mining
export const PILLAR_1_INSTRUCTOR_QUERIES = [
  // Underrepresented elite instructors with < 10 videos
  "Rickson Gracie invisible jiu jitsu technique",
  "Roger Gracie cross collar choke details",
  "Marcelo Garcia butterfly guard tutorial",
  "JT Torres half guard passing",
  "Caio Terra bottom game BJJ",
  "Mikey Musumeci leg pummeling details",
  "Rafael Mendes berimbolo system",
  "Gui Mendes arm drag BJJ",
  "Xande Ribeiro defensive guard",
  "Saulo Ribeiro guard retention BJJ"
];

// PILLAR 2: Technique Gap Filling
export const PILLAR_2_TECHNIQUE_QUERIES = [
  // Escapes and defense (underrepresented)
  "mount escape tutorial BJJ fundamentals",
  "side control escape details technique",
  "back escape defense BJJ instruction",
  "submission defense BJJ choke armbar",
  "turtle recovery BJJ escape",
  // Guard retention and defense
  "guard retention concepts BJJ",
  "defensive frames BJJ tutorial",
  // Takedowns and wrestling
  "wrestling takedowns for BJJ tutorial",
  "stand-up grip fighting BJJ",
  "guard pull technique details"
];

// PILLAR 3: Position Coverage
export const PILLAR_3_POSITION_QUERIES = [
  // Underrepresented positions
  "turtle attacks BJJ technique",
  "north south attacks escapes BJJ",
  "crucifix position BJJ tutorial",
  "standing wrestling BJJ techniques",
  "deep half guard sweeps BJJ",
  "reverse de la riva guard BJJ",
  "K-guard entries BJJ modern",
  "leg entanglement 50/50 BJJ",
  "inside sankaku heel hook details",
  "saddle position leg lock BJJ"
];

// PILLAR 4: New/Trending Content (recent uploads from elite channels)
export const PILLAR_4_NEW_CONTENT_QUERIES = [
  "Gordon Ryan 2024 technique",
  "John Danaher 2024 instructional",
  "Lachlan Giles 2024 BJJ",
  "Craig Jones 2024 technique",
  "Mikey Musumeci 2024 guard",
  "Keenan Cornelius 2024 BJJ",
  "Nicholas Meregali 2024 passing",
  "Tainan Dalpra 2024 technique",
  "Mica Galvao 2024 BJJ",
  "Ffion Davies 2024 technique"
];

// Combined legacy queries for backwards compatibility
export const GAP_FILLING_QUERIES = [
  ...PILLAR_1_INSTRUCTOR_QUERIES,
  ...PILLAR_2_TECHNIQUE_QUERIES,
  ...PILLAR_3_POSITION_QUERIES
];

// Get day of year to determine which pillar to run
function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

// Get queries for today's rotation (4-day cycle)
// For Pillar 1, uses dynamic instructor discovery to find underrepresented elites
export async function getTodaysQueriesAsync(): Promise<string[]> {
  const dayOfYear = getDayOfYear();
  const pillarIndex = dayOfYear % 4;
  
  switch (pillarIndex) {
    case 0:
      console.log('[GAP-FILLING] Day 1: Elite Instructor Mining (Dynamic)');
      // Use dynamic instructor discovery for Pillar 1
      return await generateDynamicInstructorQueries();
    case 1:
      console.log('[GAP-FILLING] Day 2: Technique Gap Filling');
      return PILLAR_2_TECHNIQUE_QUERIES;
    case 2:
      console.log('[GAP-FILLING] Day 3: Position Coverage');
      return PILLAR_3_POSITION_QUERIES;
    case 3:
      console.log('[GAP-FILLING] Day 4: New/Trending Content');
      return PILLAR_4_NEW_CONTENT_QUERIES;
    default:
      return PILLAR_1_INSTRUCTOR_QUERIES;
  }
}

// Sync version for backwards compatibility
export function getTodaysQueries(): string[] {
  const dayOfYear = getDayOfYear();
  const pillarIndex = dayOfYear % 4;
  
  switch (pillarIndex) {
    case 0:
      console.log('[GAP-FILLING] Day 1: Elite Instructor Mining');
      return PILLAR_1_INSTRUCTOR_QUERIES;
    case 1:
      console.log('[GAP-FILLING] Day 2: Technique Gap Filling');
      return PILLAR_2_TECHNIQUE_QUERIES;
    case 2:
      console.log('[GAP-FILLING] Day 3: Position Coverage');
      return PILLAR_3_POSITION_QUERIES;
    case 3:
      console.log('[GAP-FILLING] Day 4: New/Trending Content');
      return PILLAR_4_NEW_CONTENT_QUERIES;
    default:
      return PILLAR_1_INSTRUCTOR_QUERIES;
  }
}

/**
 * Get underrepresented elite instructors dynamically
 * Returns instructors with 80+ credibility but < 10 videos in library
 */
async function getUnderrepresentedEliteInstructors(): Promise<string[]> {
  try {
    const result = await db.execute(sql`
      SELECT i.name, COUNT(v.id) as video_count 
      FROM instructors i 
      LEFT JOIN ai_video_knowledge v ON LOWER(v.instructor_name) = LOWER(i.name) AND v.status = 'active'
      WHERE i.credibility_score >= 80
      GROUP BY i.name 
      HAVING COUNT(v.id) < 10
      ORDER BY i.credibility_score DESC, COUNT(v.id) ASC
      LIMIT 20
    `);
    
    return (result.rows as any[]).map(r => r.name);
  } catch (error) {
    console.error('[GAP-FILLING] Error getting underrepresented instructors:', error);
    return [];
  }
}

/**
 * Generate dynamic instructor queries based on current library gaps
 */
export async function generateDynamicInstructorQueries(): Promise<string[]> {
  const underrepresented = await getUnderrepresentedEliteInstructors();
  
  if (underrepresented.length === 0) {
    console.log('[GAP-FILLING] No underrepresented elite instructors found, using default queries');
    return PILLAR_1_INSTRUCTOR_QUERIES;
  }
  
  const techniques = ['technique breakdown', 'BJJ tutorial', 'guard details', 'passing system', 'submission details'];
  const queries: string[] = [];
  
  for (const instructor of underrepresented.slice(0, 10)) {
    const technique = techniques[Math.floor(Math.random() * techniques.length)];
    queries.push(`${instructor} ${technique}`);
  }
  
  console.log(`[GAP-FILLING] Generated ${queries.length} dynamic instructor queries`);
  return queries;
}

interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  channelId: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
}

async function searchYouTube(query: string): Promise<YouTubeVideo[]> {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY not configured');
  }
  
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', YOUTUBE_API_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoDuration', 'medium');
  url.searchParams.set('maxResults', '25');
  url.searchParams.set('order', 'relevance');
  
  await trackSearchCall();
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error(`YouTube API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  return data.items?.map((item: any) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    description: item.snippet.description || '',
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url
  })) || [];
}

async function getVideoDetails(videoId: string): Promise<{ duration: number; viewCount: number; likeCount: number } | null> {
  if (!YOUTUBE_API_KEY) return null;
  
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('key', YOUTUBE_API_KEY);
  url.searchParams.set('id', videoId);
  url.searchParams.set('part', 'contentDetails,statistics');
  
  await trackVideoDetailCall();
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('QUOTA_EXCEEDED');
    }
    return null;
  }
  
  const data = await response.json();
  const item = data.items?.[0];
  
  if (!item) return null;
  
  const duration = parseDuration(item.contentDetails?.duration || 'PT0S');
  
  return {
    duration,
    viewCount: parseInt(item.statistics?.viewCount || '0', 10),
    likeCount: parseInt(item.statistics?.likeCount || '0', 10)
  };
}

function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  return hours * 3600 + minutes * 60 + seconds;
}

async function isVideoDuplicate(videoId: string): Promise<boolean> {
  const existing = await db
    .select({ id: aiVideoKnowledge.id })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.youtubeId, videoId))
    .limit(1);
  
  return existing.length > 0;
}

function determineTaxonomy(title: string, techniqueName: string) {
  const lowerTitle = title.toLowerCase();
  const lowerTechnique = techniqueName.toLowerCase();
  
  // Determine technique type
  let techniqueType: 'attack' | 'defense' | 'concept' = 'concept';
  
  const attackIndicators = ['sweep', 'submission', 'choke', 'armbar', 'triangle', 'kimura', 'omoplata', 
    'guillotine', 'finish', 'attack', 'leg lock', 'heel hook', 'pass', 'takedown', 'throw'];
  
  const defenseIndicators = ['escape', 'defense', 'defend', 'counter', 'recover', 'retention',
    'prevention', 'survival', 'protect'];
  
  if (defenseIndicators.some(ind => lowerTitle.includes(ind) || lowerTechnique.includes(ind))) {
    techniqueType = 'defense';
  } else if (attackIndicators.some(ind => lowerTitle.includes(ind) || lowerTechnique.includes(ind))) {
    techniqueType = 'attack';
  }
  
  // Determine position category
  let positionCategory = 'universal';
  
  const positionMap: Record<string, string> = {
    'closed guard': 'closed_guard',
    'full guard': 'closed_guard',
    'open guard': 'open_guard',
    'spider': 'open_guard',
    'de la riva': 'open_guard',
    'butterfly': 'open_guard',
    'half guard': 'half_guard',
    'deep half': 'half_guard',
    'z guard': 'half_guard',
    'mount': 'mount',
    'mounted': 'mount',
    'side control': 'side_control',
    'back': 'back',
    'back control': 'back',
    'turtle': 'turtle',
    'leg lock': 'leg_entanglement',
    'ashi': 'leg_entanglement',
    '50/50': 'leg_entanglement',
    'heel hook': 'leg_entanglement',
    'north south': 'north_south',
    'knee on belly': 'knee_on_belly',
    'standing': 'standing',
    'takedown': 'standing',
    'wrestling': 'standing',
    'judo': 'standing'
  };
  
  for (const [pattern, position] of Object.entries(positionMap)) {
    if (lowerTitle.includes(pattern) || lowerTechnique.includes(pattern)) {
      positionCategory = position;
      break;
    }
  }
  
  // Determine gi/nogi
  let giOrNogi: 'gi' | 'nogi' | 'both' = 'both';
  
  if (lowerTitle.includes('no-gi') || lowerTitle.includes('nogi') || lowerTitle.includes('no gi')) {
    giOrNogi = 'nogi';
  } else if (lowerTitle.includes('gi ') || lowerTitle.includes('lapel') || lowerTitle.includes('collar')) {
    giOrNogi = 'gi';
  }
  
  // Extract tags
  const tagPatterns = [
    'armbar', 'triangle', 'kimura', 'omoplata', 'guillotine', 'choke', 'sweep',
    'escape', 'pass', 'takedown', 'guard', 'mount', 'back', 'turtle',
    'leg lock', 'heel hook', 'defense', 'attack', 'fundamental', 'beginner'
  ];
  
  const tags: string[] = [];
  for (const pattern of tagPatterns) {
    if (lowerTitle.includes(pattern) || lowerTechnique.includes(pattern)) {
      if (!tags.includes(pattern)) {
        tags.push(pattern);
      }
    }
  }
  
  return { techniqueType, positionCategory, giOrNogi, tags: tags.slice(0, 10) };
}

export async function runGapFillingCuration(queries?: string[]): Promise<GapFillingResult> {
  const queriesToRun = queries || GAP_FILLING_QUERIES;
  
  console.log('\n' + '═'.repeat(60));
  console.log('🎯 GAP-FILLING CURATOR - Targeted Curation');
  console.log(`⏱️  Start time: ${new Date().toISOString()}`);
  console.log(`📋 Queries to run: ${queriesToRun.length}`);
  console.log(`🎚️  Quality threshold: ${QUALITY_THRESHOLD}+`);
  console.log('═'.repeat(60) + '\n');
  
  const result: GapFillingResult = {
    queriesRun: 0,
    videosFound: 0,
    videosAnalyzed: 0,
    videosApproved: 0,
    queryResults: [],
    errors: []
  };
  
  for (const query of queriesToRun) {
    try {
      // Check quota before each query
      const quotaCheck = await smartQuotaCheck();
      if (!quotaCheck.available) {
        console.log('\n⚠️ YouTube quota exhausted - stopping curation');
        result.errors.push('YouTube quota exhausted');
        break;
      }
      
      console.log(`\n🔍 Query: "${query}"`);
      
      const videos = await searchYouTube(query);
      console.log(`   Found ${videos.length} videos`);
      
      const queryResult = {
        query,
        found: videos.length,
        analyzed: 0,
        approved: 0
      };
      
      result.queriesRun++;
      result.videosFound += videos.length;
      
      for (const video of videos) {
        try {
          // Skip duplicates
          if (await isVideoDuplicate(video.id)) {
            continue;
          }
          
          // Get video details
          const details = await getVideoDetails(video.id);
          if (!details) continue;
          
          // Skip videos too short or too long
          if (details.duration < 60 || details.duration > 3600) {
            continue;
          }
          
          queryResult.analyzed++;
          result.videosAnalyzed++;
          
          // Run multi-stage analysis
          const videoForAnalysis = {
            id: video.id,
            title: video.title,
            channelTitle: video.channelTitle,
            channelId: video.channelId,
            description: video.description,
            publishedAt: video.publishedAt,
            thumbnailUrl: video.thumbnailUrl,
            durationSeconds: details.duration,
            viewCount: details.viewCount,
            likeCount: details.likeCount
          };
          
          const analysisResult = await runMultiStageAnalysis(videoForAnalysis as any);
          
          if (!analysisResult) continue;
          
          // FIX: Use passed and finalScore from MultiStageResult
          // The multi-stage analysis already includes 7D evaluation internally
          const passed = analysisResult.passed;
          const finalScore = analysisResult.finalScore || 0;
          
          // Check if any dimension is below minimum threshold (4.0)
          const dimensionScores = analysisResult.stage7D?.dimensionScores;
          let hasLowDimension = false;
          if (dimensionScores) {
            for (const [dim, score] of Object.entries(dimensionScores)) {
              if (typeof score === 'number' && score < MIN_DIMENSION_SCORE * 10) {
                console.log(`   ❌ Low dimension score: ${dim} = ${score}/100 (min: ${MIN_DIMENSION_SCORE * 10})`);
                hasLowDimension = true;
                break;
              }
            }
          }
          
          // Videos must pass all stages AND meet quality threshold (6.5+ = 65/100) AND no dimension below 4.0
          if (passed && finalScore >= QUALITY_THRESHOLD * 10 && !hasLowDimension) {
            // Extract instructor name from stage3 if available
            const instructorName = analysisResult.stage3?.instructorName || video.channelTitle;
            const techniqueName = analysisResult.stage2?.techniqueName || 'general';
            
            // Use taxonomy from analysis if available, otherwise determine from title
            const taxonomy = analysisResult.taxonomy || determineTaxonomy(video.title, techniqueName);
            
            // Insert into database - match ai_video_knowledge schema
            await db.insert(aiVideoKnowledge).values({
              youtubeId: video.id,
              videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
              title: video.title,
              techniqueName: techniqueName,
              instructorName: instructorName,
              channelId: video.channelId,
              channelName: video.channelTitle,
              duration: details.duration,
              uploadDate: new Date(video.publishedAt),
              viewCount: details.viewCount,
              likeCount: details.likeCount,
              thumbnailUrl: video.thumbnailUrl,
              positionCategory: taxonomy?.positionCategory || null,
              techniqueType: taxonomy?.techniqueType || null,
              beltLevel: ['all'],
              giOrNogi: taxonomy?.giOrNogi || 'both',
              qualityScore: Math.min(9.99, finalScore / 10).toFixed(2), // Convert 100 scale to 10 scale (max 9.99)
              keyDetails: {
                reasoning: analysisResult.stage2?.reasoning || '',
                category: taxonomy?.techniqueType || 'uncategorized'
              },
              tags: taxonomy?.tags || [],
              status: 'active',
              autoPublished: true,
              tier: 'tier_2'
            });
            
            queryResult.approved++;
            result.videosApproved++;
            
            console.log(`   ✅ APPROVED: "${video.title.substring(0, 50)}..." (${finalScore.toFixed(1)})`);
            console.log(`      Instructor: ${instructorName}`);
            console.log(`      Position: ${taxonomy?.positionCategory || 'unknown'} | Type: ${taxonomy?.techniqueType || 'unknown'}`);
          }
        } catch (videoError) {
          if (videoError instanceof Error && videoError.message === 'QUOTA_EXCEEDED') {
            console.log('   ⚠️ Quota exhausted during video processing');
            result.errors.push('Quota exhausted during video processing');
            break;
          }
          // Log individual video errors for debugging
          console.error(`   ❌ Video error (${video.title?.substring(0, 30)}...):`, videoError);
        }
      }
      
      result.queryResults.push(queryResult);
      console.log(`   📊 Query result: ${queryResult.analyzed} analyzed, ${queryResult.approved} approved`);
      
    } catch (queryError) {
      if (queryError instanceof Error && queryError.message === 'QUOTA_EXCEEDED') {
        console.log('\n⚠️ YouTube quota exhausted');
        result.errors.push('YouTube quota exhausted');
        break;
      }
      
      console.error(`   ❌ Query error: ${queryError}`);
      result.errors.push(`Query "${query}": ${queryError}`);
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 GAP-FILLING CURATION COMPLETE');
  console.log('═'.repeat(60));
  console.log(`Queries run: ${result.queriesRun}/${queriesToRun.length}`);
  console.log(`Videos found: ${result.videosFound}`);
  console.log(`Videos analyzed: ${result.videosAnalyzed}`);
  console.log(`Videos approved: ${result.videosApproved}`);
  console.log(`Approval rate: ${result.videosAnalyzed > 0 ? ((result.videosApproved / result.videosAnalyzed) * 100).toFixed(1) : 0}%`);
  
  if (result.errors.length > 0) {
    console.log(`\n⚠️ Errors: ${result.errors.length}`);
    result.errors.forEach(e => console.log(`   - ${e}`));
  }
  
  console.log('═'.repeat(60) + '\n');
  
  return result;
}

// Export for API use
export { QUALITY_THRESHOLD };
