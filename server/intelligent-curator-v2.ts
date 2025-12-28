/**
 * Intelligent Curator V2 - The Smartest Video Discovery System
 * 
 * Features:
 * - Dynamic instructor/technique pools (800+ query combinations)
 * - Query rotation with progress tracking (15 queries per run)
 * - Deep discovery (100 videos per query via pagination)
 * - Intent-based YouTube sorting (coverage-aware)
 * - Auto-expand for new high-credibility instructors
 * - New duplicate handling (allows multiple instructors, penalizes 3+ same instructor/technique)
 * - Transcript-optional analysis
 * 
 * Created: Nov 26, 2025
 */

import { db } from "./db";
import { 
  curationState, 
  queryProgress, 
  techniquePool, 
  instructorExpansionQueue,
  instructors,
  aiVideoKnowledge
} from "@shared/schema";
import { eq, sql, and, lt, desc, asc, isNull, gte, or, ilike } from "drizzle-orm";
import { trackSearchCall, trackVideoDetailCall, markQuotaExceeded, smartQuotaCheck } from "./youtube-quota-monitor";
import { runMultiStageAnalysis } from "./multi-stage-analyzer";
import { evaluate7Dimensions } from "./curation/final-evaluator";
import crypto from "crypto";

const QUERIES_PER_RUN = 15;
const VIDEOS_PER_QUERY = 50;  // YouTube max per request
const MAX_PAGES_PER_QUERY = 2;  // 2 pages = 100 videos per query
const AUTO_EXPAND_CREDIBILITY_THRESHOLD = 50;
const SAME_INSTRUCTOR_TECHNIQUE_PENALTY_THRESHOLD = 3;

// Taxonomy constants for video categorization
const TECHNIQUE_TYPES = ['attack', 'defense', 'concept'] as const;
const POSITION_CATEGORIES = [
  'closed_guard', 'open_guard', 'half_guard', 'mount', 'side_control', 
  'back', 'standing', 'turtle', 'leg_entanglement', 'north_south', 
  'knee_on_belly', 'guard_passing', 'universal'
] as const;
const GI_NOGI_OPTIONS = ['gi', 'nogi', 'both'] as const;

type TechniqueType = typeof TECHNIQUE_TYPES[number];
type PositionCategory = typeof POSITION_CATEGORIES[number];
type GiNogi = typeof GI_NOGI_OPTIONS[number];

interface TaxonomyResult {
  techniqueType: TechniqueType;
  positionCategory: PositionCategory;
  giOrNogi: GiNogi;
  tags: string[];
}

/**
 * Determine taxonomy fields from video title and analysis
 * Uses pattern matching instead of AI calls for speed
 */
function determineTaxonomy(
  title: string, 
  techniqueName: string, 
  category?: string
): TaxonomyResult {
  const lowerTitle = title.toLowerCase();
  const lowerTechnique = techniqueName.toLowerCase();
  
  // Determine technique type
  let techniqueType: TechniqueType = 'concept';
  
  const attackIndicators = ['sweep', 'submission', 'choke', 'armbar', 'triangle', 'kimura', 'omoplata', 
    'guillotine', 'finish', 'attack', 'leg lock', 'heel hook', 'kneebar', 'ankle', 'strangle',
    'back take', 'mount', 'pass', 'takedown', 'throw', 'arm lock', 'wristlock', 'neck crank',
    'darce', 'anaconda', 'ezekiel', 'bow and arrow', 'loop choke', 'baseball', 'clock choke'];
  
  const defenseIndicators = ['escape', 'defense', 'defend', 'counter', 'recover', 'retention',
    'prevention', 'block', 'stop', 'survival', 'protect'];
  
  if (attackIndicators.some(ind => lowerTitle.includes(ind) || lowerTechnique.includes(ind))) {
    techniqueType = 'attack';
  } else if (defenseIndicators.some(ind => lowerTitle.includes(ind) || lowerTechnique.includes(ind))) {
    techniqueType = 'defense';
  }
  
  // Determine position category
  let positionCategory: PositionCategory = 'universal';
  
  const positionMap: Record<string, PositionCategory> = {
    'closed guard': 'closed_guard',
    'full guard': 'closed_guard',
    'open guard': 'open_guard',
    'spider': 'open_guard',
    'lasso': 'open_guard',
    'de la riva': 'open_guard',
    'dlr': 'open_guard',
    'rdlr': 'open_guard',
    'x guard': 'open_guard',
    'butterfly': 'open_guard',
    'k guard': 'open_guard',
    'worm': 'open_guard',
    'lapel': 'open_guard',
    'half guard': 'half_guard',
    'z guard': 'half_guard',
    'knee shield': 'half_guard',
    'lockdown': 'half_guard',
    'deep half': 'half_guard',
    'mount': 'mount',
    'mounted': 'mount',
    's mount': 'mount',
    'side control': 'side_control',
    'side mount': 'side_control',
    'kesa gatame': 'side_control',
    'scarf hold': 'side_control',
    'back': 'back',
    'back control': 'back',
    'back mount': 'back',
    'rear mount': 'back',
    'rear naked': 'back',
    'turtle': 'turtle',
    'front headlock': 'turtle',
    'cradle': 'turtle',
    'leg lock': 'leg_entanglement',
    'ashi': 'leg_entanglement',
    'saddle': 'leg_entanglement',
    '50/50': 'leg_entanglement',
    'inside sankaku': 'leg_entanglement',
    'outside ashi': 'leg_entanglement',
    'straight ashi': 'leg_entanglement',
    'irimi ashi': 'leg_entanglement',
    'heel hook': 'leg_entanglement',
    'north south': 'north_south',
    'knee on belly': 'knee_on_belly',
    'knee ride': 'knee_on_belly',
    'guard pass': 'guard_passing',
    'passing': 'guard_passing',
    'pressure pass': 'guard_passing',
    'toreando': 'guard_passing',
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
  let giOrNogi: GiNogi = 'both';
  
  if (lowerTitle.includes('no-gi') || lowerTitle.includes('nogi') || lowerTitle.includes('no gi')) {
    giOrNogi = 'nogi';
  } else if (lowerTitle.includes('gi ') || lowerTitle.includes('lapel') || 
             lowerTitle.includes('collar') || lowerTitle.includes('grip')) {
    giOrNogi = 'gi';
  }
  
  // Extract tags
  const tagPatterns = [
    'armbar', 'triangle', 'kimura', 'omoplata', 'guillotine', 'choke', 'sweep',
    'escape', 'pass', 'takedown', 'throw', 'guard', 'mount', 'back', 'turtle',
    'leg lock', 'heel hook', 'kneebar', 'ankle lock', 'calf slicer',
    'darce', 'anaconda', 'ezekiel', 'bow and arrow', 'loop choke',
    'rnc', 'rear naked', 'arm triangle', 'clock choke', 'baseball bat',
    'underhook', 'overhook', 'whizzer', 'frame', 'hip escape', 'shrimp',
    'bridge', 'granby', 'inversion', 'berimbolo', 'kiss of the dragon',
    'x guard', 'single leg x', 'butterfly', 'spider', 'lasso', 'de la riva',
    'half guard', 'deep half', 'knee shield', 'z guard', 'lockdown',
    'mount', 's mount', 'side control', 'knee on belly', 'north south',
    'closed guard', 'open guard', 'rubber guard', 'worm guard',
    'crucifix', 'truck', 'crab ride', 'honey hole', 'saddle', '50/50',
    'wrestling', 'judo', 'gi', 'no-gi', 'submission', 'defense', 'attack',
    'beginner', 'advanced', 'competition', 'fundamental', 'detail',
    'drill', 'sparring', 'rolling', 'concept', 'principle', 'tips',
    'white belt', 'blue belt', 'purple belt', 'brown belt', 'black belt'
  ];
  
  const tags: string[] = [];
  for (const pattern of tagPatterns) {
    if (lowerTitle.includes(pattern) || lowerTechnique.includes(pattern)) {
      const tag = pattern.replace(/\s+/g, '_');
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }
  
  // Add category if available
  if (category && category !== 'uncategorized') {
    const categoryTag = category.toLowerCase().replace(/\s+/g, '_');
    if (!tags.includes(categoryTag)) {
      tags.push(categoryTag);
    }
  }
  
  return {
    techniqueType,
    positionCategory,
    giOrNogi,
    tags: tags.slice(0, 10) // Limit to 10 tags
  };
}

interface QueryItem {
  query: string;
  queryType: 'instructor_technique' | 'technique' | 'variation' | 'concept';
  instructor?: string;
  technique?: string;
  priority: number;
  sortOrder: 'relevance' | 'viewCount' | 'date';
}

interface YouTubeSearchResponse {
  nextPageToken?: string;
  items: Array<{
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      channelId: string;
      description: string;
      publishedAt: string;
      thumbnails: { high: { url: string } };
    };
  }>;
}

interface CurationV2Result {
  queriesExecuted: number;
  videosFound: number;
  videosAnalyzed: number;
  videosApproved: number;
  newInstructorsDiscovered: number;
  errors: string[];
}

/**
 * Generate query hash for tracking progress
 */
function generateQueryHash(query: string): string {
  return crypto.createHash('md5').update(query.toLowerCase().trim()).digest('hex');
}

/**
 * Get instructor pool from database
 * Includes: all instructors from library + expansion queue
 */
async function getInstructorPool(): Promise<string[]> {
  const knownInstructors = await db
    .select({ name: instructors.name })
    .from(instructors)
    .where(gte(instructors.credibilityScore, 40));
  
  const libraryInstructors = await db
    .selectDistinct({ instructor: aiVideoKnowledge.instructorName })
    .from(aiVideoKnowledge)
    .where(gte(aiVideoKnowledge.qualityScore, 7.5));
  
  const uniqueInstructors = new Set<string>();
  
  knownInstructors.forEach(i => {
    if (i.name) uniqueInstructors.add(i.name);
  });
  
  libraryInstructors.forEach(i => {
    if (i.instructor) uniqueInstructors.add(i.instructor);
  });
  
  console.log(`[V2] Instructor pool: ${uniqueInstructors.size} instructors`);
  return Array.from(uniqueInstructors);
}

/**
 * Get technique pool from database with video counts
 */
async function getTechniquePool(): Promise<Array<{ name: string; videoCount: number; priority: number }>> {
  const techniques = await db
    .select()
    .from(techniquePool)
    .orderBy(desc(techniquePool.priority), asc(techniquePool.videoCount));
  
  console.log(`[V2] Technique pool: ${techniques.length} techniques`);
  return techniques.map(t => ({
    name: t.name,
    videoCount: t.videoCount || 0,
    priority: t.priority || 5
  }));
}

/**
 * Generate all possible query combinations
 * Returns: instructor×technique, technique-only, variations, concepts
 */
async function generateAllQueries(): Promise<QueryItem[]> {
  console.log('[V2] generateAllQueries: Getting instructor pool...');
  const instructorPoolData = await getInstructorPool();
  console.log(`[V2] generateAllQueries: Got ${instructorPoolData.length} instructors`);
  
  console.log('[V2] generateAllQueries: Getting technique pool...');
  const techniquePoolData = await getTechniquePool();
  console.log(`[V2] generateAllQueries: Got ${techniquePoolData.length} techniques`);
  
  console.log(`[V2] generateAllQueries: Building ${instructorPoolData.length * techniquePoolData.length} query combinations...`);
  const queries: QueryItem[] = [];
  
  for (const instructor of instructorPoolData) {
    for (const technique of techniquePoolData) {
      const videoCount = technique.videoCount;
      
      let sortOrder: 'relevance' | 'viewCount' | 'date' = 'relevance';
      if (videoCount === 0) {
        sortOrder = 'viewCount';
      } else if (videoCount >= 10) {
        sortOrder = 'date';
      }
      
      queries.push({
        query: `${instructor} ${technique.name} BJJ`,
        queryType: 'instructor_technique',
        instructor,
        technique: technique.name,
        priority: technique.priority + (instructor.includes('Gordon') || instructor.includes('Danaher') ? 2 : 0),
        sortOrder
      });
    }
  }
  
  for (const technique of techniquePoolData) {
    queries.push({
      query: `${technique.name} BJJ tutorial`,
      queryType: 'technique',
      technique: technique.name,
      priority: technique.priority,
      sortOrder: technique.videoCount < 5 ? 'viewCount' : 'relevance'
    });
  }
  
  const variations = [
    'no gi', 'gi', 'from guard', 'from mount', 'from back', 'defense', 'counter', 'chain', 
    'transition', 'setup', 'finishing details', 'grips', 'beginner', 'advanced'
  ];
  
  for (const technique of techniquePoolData.filter(t => t.priority >= 3)) {
    for (const variation of variations) {
      queries.push({
        query: `${technique.name} ${variation} BJJ`,
        queryType: 'variation',
        technique: technique.name,
        priority: 2,
        sortOrder: 'relevance'
      });
    }
  }
  
  console.log(`[V2] Generated ${queries.length} total query combinations`);
  return queries;
}

/**
 * Ensure curation_state row exists (upsert pattern)
 */
async function ensureCurationStateExists(): Promise<void> {
  const [existing] = await db.select().from(curationState).where(eq(curationState.id, 1));
  
  if (!existing) {
    console.log('[V2] Initializing curation_state row...');
    await db.insert(curationState).values({
      id: 1,
      lastQueryIndex: 0,
      lastRunAt: new Date(),
      quotaUsed: 0,
      updatedAt: new Date()
    }).onConflictDoNothing();
  }
}

/**
 * Reset query_progress for priority queries to ensure fresh discovery
 */
async function resetPriorityQueryProgress(queries: QueryItem[]): Promise<void> {
  for (const q of queries) {
    if (q.priority >= 10) {
      const hash = generateQueryHash(q.query);
      await db
        .update(queryProgress)
        .set({ 
          pageOffset: 0, 
          lastPageToken: null,
          exhausted: false 
        })
        .where(eq(queryProgress.queryHash, hash));
    }
  }
}

/**
 * Get next batch of queries to execute based on rotation
 */
async function getNextQueries(batchSize: number = QUERIES_PER_RUN): Promise<QueryItem[]> {
  console.log('[V2] getNextQueries: Step A - Ensuring curation state exists...');
  await ensureCurationStateExists();
  console.log('[V2] getNextQueries: Step A complete');
  
  console.log('[V2] getNextQueries: Step B - Fetching state...');
  const [state] = await db.select().from(curationState).where(eq(curationState.id, 1));
  const lastIndex = state?.lastQueryIndex || 0;
  console.log(`[V2] getNextQueries: Step B complete - lastIndex=${lastIndex}`);
  
  console.log('[V2] getNextQueries: Step C - Generating all queries...');
  const queryGenStart = Date.now();
  const allQueries = await generateAllQueries();
  console.log(`[V2] getNextQueries: Step C complete - ${allQueries.length} queries in ${Date.now() - queryGenStart}ms`);
  
  const expansionQueue = await db
    .select()
    .from(instructorExpansionQueue)
    .where(eq(instructorExpansionQueue.processed, false))
    .limit(3);
  
  const priorityQueries: QueryItem[] = [];
  for (const newInstructor of expansionQueue) {
    const techniques = await db.select().from(techniquePool).where(eq(techniquePool.isCore, true)).limit(5);
    for (const technique of techniques) {
      priorityQueries.push({
        query: `${newInstructor.instructor} ${technique.name} BJJ`,
        queryType: 'instructor_technique',
        instructor: newInstructor.instructor,
        technique: technique.name,
        priority: 10,
        sortOrder: 'viewCount'
      });
    }
  }
  
  const remainingSlots = batchSize - priorityQueries.length;
  const startIdx = lastIndex % allQueries.length;
  const rotatedQueries = allQueries.slice(startIdx, startIdx + remainingSlots);
  
  if (rotatedQueries.length < remainingSlots) {
    rotatedQueries.push(...allQueries.slice(0, remainingSlots - rotatedQueries.length));
  }
  
  const batch = [...priorityQueries, ...rotatedQueries];
  
  await resetPriorityQueryProgress(priorityQueries);
  
  await db
    .update(curationState)
    .set({ 
      lastQueryIndex: (lastIndex + remainingSlots) % allQueries.length,
      updatedAt: new Date()
    })
    .where(eq(curationState.id, 1));
  
  console.log(`[V2] Selected ${batch.length} queries (${priorityQueries.length} priority, ${rotatedQueries.length} rotation)`);
  return batch;
}

/**
 * Execute YouTube search with pagination support
 */
async function executeYouTubeSearch(
  queryItem: QueryItem,
  pageToken?: string
): Promise<{ videos: YouTubeSearchResponse['items']; nextPageToken?: string }> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not found');
  
  const quotaStatus = await smartQuotaCheck();
  if (!quotaStatus.available) {
    throw new Error('QUOTA_EXCEEDED');
  }
  
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('q', queryItem.query);
  url.searchParams.append('type', 'video');
  url.searchParams.append('maxResults', VIDEOS_PER_QUERY.toString());
  url.searchParams.append('order', queryItem.sortOrder);
  url.searchParams.append('key', apiKey);
  
  if (pageToken) {
    url.searchParams.append('pageToken', pageToken);
  }
  
  trackSearchCall();
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const errorBody = await response.text();
    try {
      const errorJson = JSON.parse(errorBody);
      if (errorJson.error?.errors?.[0]?.reason === 'quotaExceeded') {
        markQuotaExceeded();
        throw new Error('QUOTA_EXCEEDED');
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'QUOTA_EXCEEDED') throw e;
    }
    throw new Error(`YouTube API error: ${response.status}`);
  }
  
  const data: YouTubeSearchResponse = await response.json();
  return { videos: data.items || [], nextPageToken: data.nextPageToken };
}

/**
 * Check if video is a duplicate with new logic:
 * - Different instructors teaching same technique: OK
 * - Same instructor with 3+ videos on same technique: PENALIZE
 */
async function checkDuplicateStatus(videoId: string, instructor: string, technique: string): Promise<{
  isDuplicate: boolean;
  sameInstructorTechniqueCount: number;
  shouldPenalize: boolean;
}> {
  const existing = await db
    .select({ id: aiVideoKnowledge.id })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.youtubeVideoId, videoId))
    .limit(1);
  
  if (existing.length > 0) {
    return { isDuplicate: true, sameInstructorTechniqueCount: 0, shouldPenalize: false };
  }
  
  if (!instructor || !technique) {
    return { isDuplicate: false, sameInstructorTechniqueCount: 0, shouldPenalize: false };
  }
  
  const sameInstructorTechnique = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(
      and(
        ilike(aiVideoKnowledge.instructorName, `%${instructor}%`),
        ilike(aiVideoKnowledge.techniqueName, `%${technique}%`)
      )
    );
  
  const count = Number(sameInstructorTechnique[0]?.count || 0);
  
  return {
    isDuplicate: false,
    sameInstructorTechniqueCount: count,
    shouldPenalize: count >= SAME_INSTRUCTOR_TECHNIQUE_PENALTY_THRESHOLD
  };
}

/**
 * Get video details from YouTube
 * Returns null if video not found, throws QUOTA_EXCEEDED if quota hit
 */
async function getVideoDetails(videoId: string): Promise<{
  duration: number;
  viewCount: number;
  likeCount: number;
} | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;
  
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.append('part', 'contentDetails,statistics');
  url.searchParams.append('id', videoId);
  url.searchParams.append('key', apiKey);
  
  trackVideoDetailCall();
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    // Check if it's a quota error
    try {
      const errorBody = await response.text();
      const errorJson = JSON.parse(errorBody);
      if (errorJson.error?.errors?.[0]?.reason === 'quotaExceeded') {
        console.log('   ❌ Video details API hit quota limit');
        markQuotaExceeded();
        throw new Error('QUOTA_EXCEEDED');
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'QUOTA_EXCEEDED') throw e;
    }
    return null;
  }
  
  const data = await response.json();
  const video = data.items?.[0];
  if (!video) return null;
  
  const duration = parseDurationToSeconds(video.contentDetails?.duration || 'PT0S');
  const viewCount = parseInt(video.statistics?.viewCount || '0');
  const likeCount = parseInt(video.statistics?.likeCount || '0');
  
  return { duration, viewCount, likeCount };
}

function parseDurationToSeconds(duration: string): number {
  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return 0;
  const hours = parseInt(matches[1] || '0');
  const minutes = parseInt(matches[2] || '0');
  const seconds = parseInt(matches[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Discover and queue new instructors for expansion
 */
async function checkForNewInstructor(instructorName: string, videoId: number, credibility: number): Promise<boolean> {
  if (credibility < AUTO_EXPAND_CREDIBILITY_THRESHOLD) {
    return false;
  }
  
  const existing = await db
    .select()
    .from(instructorExpansionQueue)
    .where(eq(instructorExpansionQueue.instructor, instructorName))
    .limit(1);
  
  if (existing.length > 0) {
    return false;
  }
  
  const knownInstructor = await db
    .select()
    .from(instructors)
    .where(ilike(instructors.name, `%${instructorName}%`))
    .limit(1);
  
  if (knownInstructor.length > 0) {
    return false;
  }
  
  await db.insert(instructorExpansionQueue).values({
    instructor: instructorName,
    credibility,
    discoveredFromVideoId: videoId
  });
  
  console.log(`[V2] 🆕 Queued new instructor for expansion: ${instructorName} (credibility: ${credibility})`);
  return true;
}

/**
 * Update query progress after execution
 */
async function updateQueryProgress(
  query: string, 
  queryType: string, 
  videosFound: number, 
  videosApproved: number, 
  nextPageToken?: string,
  exhausted: boolean = false
): Promise<void> {
  const hash = generateQueryHash(query);
  
  const existing = await db
    .select()
    .from(queryProgress)
    .where(eq(queryProgress.queryHash, hash))
    .limit(1);
  
  if (existing.length > 0) {
    await db
      .update(queryProgress)
      .set({
        pageOffset: (existing[0].pageOffset || 0) + 1,
        lastRun: new Date(),
        videosFound: (existing[0].videosFound || 0) + videosFound,
        videosApproved: (existing[0].videosApproved || 0) + videosApproved,
        timesSearched: (existing[0].timesSearched || 0) + 1,
        lastPageToken: nextPageToken || null,
        exhausted
      })
      .where(eq(queryProgress.queryHash, hash));
  } else {
    await db.insert(queryProgress).values({
      queryHash: hash,
      query,
      queryType,
      pageOffset: 1,
      lastRun: new Date(),
      videosFound,
      videosApproved,
      timesSearched: 1,
      lastPageToken: nextPageToken || null,
      exhausted
    });
  }
}

/**
 * Pre-flight database health check with retry
 * Ensures connection is alive before starting curation
 */
async function ensureDatabaseConnection(maxRetries = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[V2] Database health check (attempt ${attempt}/${maxRetries})...`);
      const result = await db.execute(sql`SELECT 1 as connected`);
      // Handle both Neon (result.rows) and postgres-js (result is array) formats
      const rows = Array.isArray(result) ? result : (result as any).rows || [];
      if (rows.length > 0) {
        console.log('[V2] ✅ Database connection verified');
        return true;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[V2] ❌ Database check failed (attempt ${attempt}): ${errorMsg}`);
      
      if (attempt < maxRetries) {
        const waitTime = attempt * 2000; // 2s, 4s, 6s
        console.log(`[V2] Waiting ${waitTime}ms before retry...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
  }
  return false;
}

/**
 * Main V2 curation function
 */
export async function runCurationV2(runId?: string): Promise<CurationV2Result> {
  const startTime = Date.now();
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 INTELLIGENT CURATOR V2 - Starting Curation Run');
  console.log(`⏱️  Start time: ${new Date().toISOString()}`);
  console.log(`   Run ID: ${runId || 'manual'}`);
  console.log('═'.repeat(60) + '\n');
  
  const result: CurationV2Result = {
    queriesExecuted: 0,
    videosFound: 0,
    videosAnalyzed: 0,
    videosApproved: 0,
    newInstructorsDiscovered: 0,
    errors: []
  };
  
  try {
    // Pre-flight database check with retry for scheduled runs
    if (runId === 'scheduled') {
      const dbHealthy = await ensureDatabaseConnection(3);
      if (!dbHealthy) {
        const errorMsg = 'Database connection failed after 3 retries';
        console.error(`[V2] ❌ ${errorMsg}`);
        result.errors.push(errorMsg);
        return result;
      }
    }
    
    console.log('[V2] Step 1: Getting next queries...');
    const queriesStartTime = Date.now();
    const queries = await getNextQueries(QUERIES_PER_RUN);
    console.log(`[V2] Step 1 complete: Got ${queries.length} queries in ${Date.now() - queriesStartTime}ms`);
    console.log(`[V2] Processing ${queries.length} queries\n`);
    
    for (const queryItem of queries) {
      try {
        const quotaCheck = await smartQuotaCheck();
        if (!quotaCheck.available) {
          console.log('\n[V2] ⚠️ Quota check: insufficient quota remaining - stopping gracefully');
          result.errors.push('YouTube quota insufficient for more queries');
          break;
        }
        
        console.log(`\n[V2] Query: "${queryItem.query}" (${queryItem.sortOrder})`);
        
        let allVideos: YouTubeSearchResponse['items'] = [];
        let pageToken: string | undefined;
        let pagesSearched = 0;
        
        while (pagesSearched < MAX_PAGES_PER_QUERY) {
          const searchResult = await executeYouTubeSearch(queryItem, pageToken);
          allVideos.push(...searchResult.videos);
          pagesSearched++;
          
          if (!searchResult.nextPageToken) break;
          pageToken = searchResult.nextPageToken;
        }
        
        result.queriesExecuted++;
        result.videosFound += allVideos.length;
        console.log(`   Found ${allVideos.length} videos (${pagesSearched} pages)`);
        
        let queryApproved = 0;
        
        let quotaHitDuringVideos = false;
        
        for (const video of allVideos) {
          if (quotaHitDuringVideos) break;
          
          try {
            const dupCheck = await checkDuplicateStatus(
              video.id.videoId,
              queryItem.instructor || video.snippet.channelTitle,
              queryItem.technique || ''
            );
            
            if (dupCheck.isDuplicate) {
              continue;
            }
            
            let details;
            try {
              details = await getVideoDetails(video.id.videoId);
            } catch (detailsError) {
              if (detailsError instanceof Error && detailsError.message === 'QUOTA_EXCEEDED') {
                console.log('   ⚠️ Quota hit during video details - stopping video analysis');
                quotaHitDuringVideos = true;
                result.errors.push('YouTube quota exhausted during video details');
                break;
              }
              throw detailsError;
            }
            if (!details) continue;
            
            if (details.duration < 60 || details.duration > 3600) {
              continue;
            }
            
            result.videosAnalyzed++;
            
            const videoForAnalysis = {
              id: video.id.videoId,
              title: video.snippet.title,
              channelTitle: video.snippet.channelTitle,
              channelId: video.snippet.channelId,
              description: video.snippet.description,
              publishedAt: video.snippet.publishedAt,
              thumbnailUrl: video.snippet.thumbnails.high.url,
              durationSeconds: details.duration,
              viewCount: details.viewCount,
              likeCount: details.likeCount
            };
            
            const analysisResult = await runMultiStageAnalysis(videoForAnalysis as any, runId);
            
            if (!analysisResult) continue;
            
            let qualityScore = analysisResult.qualityScore || 0;
            
            if (dupCheck.shouldPenalize) {
              qualityScore -= 1.0;
              console.log(`   📉 Penalty for ${dupCheck.sameInstructorTechniqueCount}+ videos from same instructor on technique`);
            }
            
            if (qualityScore >= 7.0) {
              const evaluation = await evaluate7Dimensions({
                youtubeId: videoForAnalysis.id,
                title: videoForAnalysis.title,
                techniqueName: analysisResult.techniqueName || queryItem.technique || 'general',
                instructorName: analysisResult.instructorName || queryItem.instructor || null,
                channelId: videoForAnalysis.channelId,
                difficultyScore: analysisResult.difficultyScore || null,
                beltLevels: analysisResult.beltLevels || null,
                keyDetails: analysisResult.keyDetails || {},
                uploadDate: videoForAnalysis.publishedAt ? new Date(videoForAnalysis.publishedAt) : null,
                giOrNogi: analysisResult.giOrNogi,
                category: analysisResult.category
              });
              
              if (evaluation.decision === 'ACCEPT' && evaluation.finalScore >= 70) {
                // Determine taxonomy for new video
                const taxonomy = determineTaxonomy(
                  video.snippet.title,
                  analysisResult.techniqueName || queryItem.technique || 'general',
                  analysisResult.category
                );
                
                await db.insert(aiVideoKnowledge).values({
                  youtubeVideoId: video.id.videoId,
                  videoTitle: video.snippet.title,
                  channelId: video.snippet.channelId,
                  channelName: video.snippet.channelTitle,
                  instructorName: analysisResult.instructorName || video.snippet.channelTitle,
                  techniqueName: analysisResult.techniqueName || queryItem.technique || 'general',
                  techniqueCategory: analysisResult.category || 'uncategorized',
                  beltLevel: analysisResult.beltLevel || 'all',
                  description: video.snippet.description?.substring(0, 1000) || '',
                  thumbnailUrl: video.snippet.thumbnails.high.url,
                  durationSeconds: details.duration,
                  publishedAt: new Date(video.snippet.publishedAt),
                  qualityScore: evaluation.finalScore,
                  addedAt: new Date(),
                  viewCount: details.viewCount,
                  likeCount: details.likeCount,
                  // Taxonomy fields for dynamic video search
                  techniqueType: taxonomy.techniqueType,
                  positionCategory: taxonomy.positionCategory,
                  giOrNogi: taxonomy.giOrNogi,
                  tags: taxonomy.tags
                });
                
                result.videosApproved++;
                queryApproved++;
                console.log(`   ✅ Approved: "${video.snippet.title.substring(0, 50)}..." (${evaluation.finalScore.toFixed(1)})`);
                
                const instructorCredibilityScore = analysisResult.instructorCredibility || 50;
                if (await checkForNewInstructor(
                  analysisResult.instructorName || video.snippet.channelTitle,
                  0,
                  instructorCredibilityScore
                )) {
                  result.newInstructorsDiscovered++;
                }
                
                await updateTechniqueCount(queryItem.technique || analysisResult.techniqueName);
              }
            }
            
          } catch (videoError) {
            if (videoError instanceof Error && videoError.message === 'QUOTA_EXCEEDED') {
              throw videoError;
            }
          }
        }
        
        await updateQueryProgress(
          queryItem.query,
          queryItem.queryType,
          allVideos.length,
          queryApproved,
          pageToken,
          !pageToken
        );
        
      } catch (queryError) {
        if (queryError instanceof Error && queryError.message === 'QUOTA_EXCEEDED') {
          console.log('\n[V2] ⚠️ YouTube quota exceeded - stopping curation');
          result.errors.push('YouTube API quota exceeded');
          break;
        }
        result.errors.push(`Query error: ${queryItem.query}`);
      }
    }
    
    await db
      .update(curationState)
      .set({ 
        lastRunAt: new Date(),
        quotaUsed: (await getQuotaUsed()) || 0
      })
      .where(eq(curationState.id, 1));
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errorMsg);
    console.error('[V2] Curation error:', errorMsg);
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 CURATION V2 RESULTS');
  console.log('═'.repeat(60));
  console.log(`   Queries executed: ${result.queriesExecuted}`);
  console.log(`   Videos found: ${result.videosFound}`);
  console.log(`   Videos analyzed: ${result.videosAnalyzed}`);
  console.log(`   Videos approved: ${result.videosApproved}`);
  console.log(`   New instructors: ${result.newInstructorsDiscovered}`);
  if (result.errors.length > 0) {
    console.log(`   Errors: ${result.errors.length}`);
  }
  console.log('═'.repeat(60) + '\n');
  
  return result;
}

async function getQuotaUsed(): Promise<number> {
  return 0;
}

async function updateTechniqueCount(techniqueName?: string): Promise<void> {
  if (!techniqueName) return;
  
  await db
    .update(techniquePool)
    .set({ 
      videoCount: sql`video_count + 1`,
      lastSearched: new Date()
    })
    .where(ilike(techniquePool.name, `%${techniqueName}%`));
}

/**
 * Get V2 curation statistics
 */
export async function getCurationV2Stats(): Promise<{
  instructorPoolSize: number;
  techniquePoolSize: number;
  totalQueries: number;
  queriesExhausted: number;
  pendingExpansions: number;
}> {
  const instructorPool = await getInstructorPool();
  const techniques = await db.select().from(techniquePool);
  const exhaustedQueries = await db
    .select({ count: sql<number>`count(*)` })
    .from(queryProgress)
    .where(eq(queryProgress.exhausted, true));
  const pendingExpansions = await db
    .select({ count: sql<number>`count(*)` })
    .from(instructorExpansionQueue)
    .where(eq(instructorExpansionQueue.processed, false));
  
  return {
    instructorPoolSize: instructorPool.length,
    techniquePoolSize: techniques.length,
    totalQueries: instructorPool.length * techniques.length + techniques.length * 14,
    queriesExhausted: Number(exhaustedQueries[0]?.count || 0),
    pendingExpansions: Number(pendingExpansions[0]?.count || 0)
  };
}
