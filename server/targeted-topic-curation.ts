/**
 * TARGETED TOPIC CURATION
 * 
 * Run focused curation for specific topics (gi, nogi, escapes, submissions, etc.)
 * Bypasses the video count target check for targeted content enrichment.
 * 
 * Features:
 * - Daily rotation by topic
 * - Trusted instructor filtering
 * - Quality thresholds by instructor credibility
 * - Email notifications with detailed results
 */

import { db } from './db';
import { aiVideoKnowledge, curationRuns } from '@shared/schema';
import { sql, eq, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const anthropic = new Anthropic();
const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = 'todd@bjjos.app';

// ========================================
// DYNAMIC INSTRUCTOR SELECTION SYSTEM
// Queries YOUR database for all instructors
// ========================================

interface DatabaseInstructor {
  instructorName: string;
  videoCount: number;
  avgQuality: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

// Track recently searched instructors (in-memory, resets on restart)
const recentlySearchedInstructors: Map<string, Date> = new Map();
const ROTATION_COOLDOWN_HOURS = 72; // 3 days before re-searching same instructor

async function getDatabaseInstructors(): Promise<DatabaseInstructor[]> {
  try {
    const result = await db.execute(sql`
      SELECT 
        instructor_name,
        COUNT(*) as video_count,
        AVG(CAST(quality_score AS DECIMAL)) as avg_quality
      FROM ai_video_knowledge 
      WHERE instructor_name IS NOT NULL 
        AND instructor_name != ''
        AND CAST(quality_score AS DECIMAL) >= 7
      GROUP BY instructor_name
      HAVING COUNT(*) >= 1
      ORDER BY AVG(CAST(quality_score AS DECIMAL)) DESC, COUNT(*) DESC
    `);
    
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    return rows.map((row: any) => {
      const videoCount = parseInt(row.video_count) || 0;
      let priority: 'HIGH' | 'MEDIUM' | 'LOW';
      
      if (videoCount < 20) {
        priority = 'HIGH'; // Need more videos from this instructor
      } else if (videoCount < 50) {
        priority = 'MEDIUM';
      } else {
        priority = 'LOW'; // Already well covered
      }
      
      return {
        instructorName: row.instructor_name,
        videoCount,
        avgQuality: parseFloat(row.avg_quality) || 0,
        priority
      };
    });
  } catch (error) {
    console.error('[DYNAMIC CURATION] Failed to get instructors from DB:', error);
    return [];
  }
}

function isRecentlySearched(instructor: string): boolean {
  const lastSearched = recentlySearchedInstructors.get(instructor.toLowerCase());
  if (!lastSearched) return false;
  
  const hoursSince = (Date.now() - lastSearched.getTime()) / (1000 * 60 * 60);
  return hoursSince < ROTATION_COOLDOWN_HOURS;
}

function markAsSearched(instructor: string): void {
  recentlySearchedInstructors.set(instructor.toLowerCase(), new Date());
}

function selectInstructorsForRun(instructors: DatabaseInstructor[], count: number = 15): DatabaseInstructor[] {
  // Filter out recently searched
  const available = instructors.filter(i => !isRecentlySearched(i.instructorName));
  
  if (available.length === 0) {
    // Reset cooldowns if all instructors have been searched
    console.log('[DYNAMIC CURATION] All instructors searched recently, resetting rotation');
    recentlySearchedInstructors.clear();
    return instructors.slice(0, count);
  }
  
  // Prioritize: HIGH > MEDIUM > LOW, then by avg quality
  const high = available.filter(i => i.priority === 'HIGH');
  const medium = available.filter(i => i.priority === 'MEDIUM');
  const low = available.filter(i => i.priority === 'LOW');
  
  const selected: DatabaseInstructor[] = [];
  
  // Take proportionally more from HIGH priority
  const highCount = Math.min(Math.ceil(count * 0.5), high.length); // 50% from HIGH
  const mediumCount = Math.min(Math.ceil(count * 0.3), medium.length); // 30% from MEDIUM
  const lowCount = Math.min(count - highCount - mediumCount, low.length); // Rest from LOW
  
  selected.push(...high.slice(0, highCount));
  selected.push(...medium.slice(0, mediumCount));
  selected.push(...low.slice(0, lowCount));
  
  // Fill remaining slots if needed
  const remaining = count - selected.length;
  if (remaining > 0) {
    const unused = available.filter(i => !selected.includes(i));
    selected.push(...unused.slice(0, remaining));
  }
  
  return selected.slice(0, count);
}

function generateSearchQueries(instructor: DatabaseInstructor): string[] {
  const name = instructor.instructorName.toLowerCase();
  const queries: string[] = [];
  
  // Core searches for each instructor
  queries.push(`${name} bjj technique`);
  queries.push(`${name} guard bjj`);
  queries.push(`${name} instruction`);
  
  // Add gi/nogi specific based on known preferences
  if (['roger gracie', 'xande ribeiro', 'fabio gurgel', 'lucas lepri', 'romulo barral'].some(g => name.includes(g))) {
    queries.push(`${name} gi jiu jitsu`);
    queries.push(`${name} collar choke`);
  } else if (['craig jones', 'gordon ryan', 'nicky ryan', 'garry tonon'].some(n => name.includes(n))) {
    queries.push(`${name} nogi`);
    queries.push(`${name} leg lock`);
  } else {
    // Generic additional queries
    queries.push(`${name} sweep tutorial`);
    queries.push(`${name} pass bjj`);
  }
  
  return queries;
}

export async function runDynamicCuration(): Promise<CurationResult> {
  console.log('\n' + '═'.repeat(60));
  console.log('🔄 DYNAMIC INSTRUCTOR CURATION');
  console.log('═'.repeat(60));
  
  // Step 1: Get all instructors from YOUR database
  const allInstructors = await getDatabaseInstructors();
  console.log(`📊 Found ${allInstructors.length} instructors in database`);
  
  if (allInstructors.length === 0) {
    console.log('❌ No instructors found in database');
    return {
      topic: 'dynamic',
      videosSearched: 0,
      videosAnalyzed: 0,
      videosAdded: 0,
      videosRejected: 0,
      qualityDistribution: {},
      topInstructors: [],
      errors: ['No instructors found in database'],
      databaseTotal: 0
    };
  }
  
  // Step 2: Show priority breakdown
  const highCount = allInstructors.filter(i => i.priority === 'HIGH').length;
  const mediumCount = allInstructors.filter(i => i.priority === 'MEDIUM').length;
  const lowCount = allInstructors.filter(i => i.priority === 'LOW').length;
  console.log(`   HIGH priority (<20 videos): ${highCount}`);
  console.log(`   MEDIUM priority (20-50): ${mediumCount}`);
  console.log(`   LOW priority (50+): ${lowCount}`);
  
  // Step 3: Select 15 instructors for this run
  const selected = selectInstructorsForRun(allInstructors, 15);
  console.log(`\n🎯 Selected ${selected.length} instructors for this run:`);
  selected.forEach(i => {
    console.log(`   ${i.priority}: ${i.instructorName} (${i.videoCount} videos, ${i.avgQuality.toFixed(1)} avg)`);
    markAsSearched(i.instructorName);
  });
  
  // Step 4: Generate search queries for selected instructors
  const allSearches: string[] = [];
  for (const instructor of selected) {
    allSearches.push(...generateSearchQueries(instructor));
  }
  console.log(`\n🔍 Running ${allSearches.length} search queries...`);
  
  // Step 5: Run the curation with generated searches
  return await runTargetedCuration('dynamic-instructors', allSearches);
}

const QUALITY_THRESHOLDS = {
  elite: 7.0,
  known: 7.5,
  unknown: 8.0  // Lowered from 8.5 to discover more quality content
};

const ELITE_INSTRUCTORS = [
  'roger gracie', 'xande ribeiro', 'bernardo faria', 'keenan cornelius',
  'marcelo garcia', 'john danaher', 'lachlan giles', 'gordon ryan',
  'rafael mendes', 'gui mendes', 'andre galvao', 'leandro lo',
  'craig jones', 'mikey musumeci', 'cobrinha', 'romulo barral'
];

const KNOWN_COMPETITORS = [
  'lucas lepri', 'marcus buchecha', 'felipe pena', 'kaynan duarte',
  'nicholas meregali', 'tainan dalpra', 'mica galvao', 'brianna ste-marie',
  'ffion davies', 'gabi garcia', 'jt torres', 'dean lister'
];

const DAILY_TOPICS: Record<number, { name: string; searches: string[] }> = {
  0: {
    name: 'escapes',
    searches: [
      'mount escape bjj', 'side control escape tutorial', 'back escape bjj',
      'guard recovery', 'knee on belly escape', 'headlock escape bjj',
      'guillotine escape technique', 'rear naked choke escape',
      'armbar escape bjj', 'triangle escape instruction'
    ]
  },
  1: {
    name: 'submissions',
    searches: [
      'armbar tutorial bjj', 'kimura technique instruction', 'triangle choke tutorial',
      'rear naked choke details', 'guillotine setup bjj', 'darce choke instruction',
      'ankle lock tutorial', 'bow and arrow choke', 'cross collar choke',
      'wristlock bjj technique'
    ]
  },
  2: {
    name: 'guard',
    searches: [
      'closed guard sweep', 'half guard technique', 'butterfly guard bjj',
      'spider guard tutorial', 'de la riva guard sweep', 'x guard instruction',
      'single leg x guard', 'collar sleeve guard', 'lasso guard',
      'reverse de la riva guard'
    ]
  },
  3: {
    name: 'passing',
    searches: [
      'guard pass bjj', 'knee slice pass tutorial', 'toreando pass instruction',
      'leg drag pass', 'smash pass bjj', 'pressure passing system',
      'over under pass', 'double under pass', 'stack pass technique',
      'headquarters position bjj'
    ]
  },
  4: {
    name: 'takedowns',
    searches: [
      'single leg takedown bjj', 'double leg takedown', 'wrestling for bjj',
      'snap down bjj', 'arm drag takedown', 'ankle pick technique',
      'foot sweep judo bjj', 'drop seoi nage bjj', 'body lock takedown',
      'collar drag bjj'
    ]
  },
  5: {
    name: 'gi',
    searches: [
      'roger gracie gi choke', 'xande ribeiro guard', 'cross collar choke',
      'bow and arrow choke bjj', 'loop choke tutorial', 'baseball bat choke',
      'spider guard sweep', 'lasso guard instruction', 'collar sleeve',
      'berimbolo tutorial', 'lapel guard', 'worm guard keenan',
      'toreando pass gi', 'grip fighting bjj'
    ]
  },
  6: {
    name: 'nogi',
    searches: [
      'nogi guard passing', 'leg lock instruction', 'heel hook entry',
      'wrestling nogi bjj', 'body lock pass nogi', 'arm drag nogi',
      'front headlock attacks', 'darce choke nogi', 'guillotine nogi',
      'anaconda choke', 'calf slicer tutorial', 'kneebar technique'
    ]
  }
};

const GI_FOCUSED_SEARCHES = [
  'roger gracie gi choke', 'xande ribeiro guard', 'rafael mendes berimbolo',
  'gui mendes spider guard', 'romulo barral spider guard', 'leandro lo guard pass gi',
  'keenan cornelius worm guard', 'keenan cornelius lapel guard', 'bernardo faria half guard gi',
  'marcelo garcia x guard gi', 'andre galvao gi', 'cobrinha de la riva',
  'john danaher gi', 'lachlan giles gi guard', 'collar choke bjj tutorial',
  'cross collar choke technique', 'bow and arrow choke bjj', 'loop choke tutorial',
  'baseball bat choke instruction', 'spider guard sweep tutorial', 'lasso guard bjj instruction',
  'collar sleeve guard system', 'scissor sweep bjj tutorial', 'flower sweep instruction',
  'toreando pass gi bjj', 'knee slice pass gi'
];

// ========================================
// EXPANDED CURATION SYSTEM
// Find NEW content beyond current instructors
// ========================================

const EXPANDED_GI_TECHNIQUE_SEARCHES = [
  'collar choke tutorial 2024', 'spider guard sweep instructional', 'lasso guard system bjj',
  'bow and arrow choke details', 'loop choke setup bjj', 'de la riva sweep tutorial',
  'berimbolo instructional 2024', 'toreando pass breakdown', 'knee slice pass details',
  'baseball bat choke bjj', 'ezekiel choke gi tutorial', 'omoplata setup details',
  'triangle from guard tutorial', 'armbar finish details bjj', 'closed guard sweep system',
  'half guard sweep instructional', 'deep half guard bjj 2024', 'reverse de la riva tutorial',
  'worm guard instructional', 'lapel guard system bjj', 'cross collar choke finish',
  'grip fighting bjj tutorial', 'collar drag technique', 'scissor sweep details bjj'
];

const EXPANDED_NOGI_TECHNIQUE_SEARCHES = [
  'heel hook tutorial 2024', 'leg lock instructional', 'guillotine choke details',
  'darce choke setup bjj', 'anaconda choke tutorial', 'arm triangle finish',
  'rear naked choke details', 'body lock pass nogi', 'wrestling for bjj tutorial',
  'single leg takedown bjj', 'front headlock system', 'back take nogi instructional',
  'mount escapes nogi', 'side control escape tutorial', 'butterfly guard sweep nogi',
  'kneebar setup bjj', 'inside heel hook entry', 'outside heel hook finish',
  'saddle position bjj', 'ashi garami entries', 'calf slicer technique', 
  'kimura trap system', 'north south choke details', 'arm drag nogi technique'
];

const NEW_RISING_INSTRUCTORS = [
  'Mica Galvao', 'Tainan Dalpra', 'Giancarlo Bodoni', 'Nicholas Meregali',
  'Dante Leon', 'Fabricio Andrey', 'Estevan Martinez', 'Brianna Ste-Marie',
  'Ffion Davies', 'Jasmine Rocha', 'Tommy Langaker', 'Pedro Marinho',
  'Kaynan Duarte', 'Victor Hugo', 'Felipe Pena', 'JT Torres',
  'Matheus Gabriel', 'Isaque Bahiense', 'Mauricio Oliveira', 'Diego Pato'
];

const QUALITY_CHANNELS = [
  'BJJ Fanatics', 'Bernardo Faria BJJ', 'Knight Jiu Jitsu', 'Chewjitsu',
  'Priit Mihkelson bjj', 'Jon Thomas BJJ', 'Jordan Teaches Jiujitsu',
  'The Grappling Academy', 'Stephan Kesting', 'Invisible Jiu Jitsu',
  'Rob Biernacki bjj', 'Karel Pravec BJJ', 'Keenan Online', 'Lachlan Giles'
];

interface VideoSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
  description: string;
}

interface CurationResult {
  topic: string;
  videosSearched: number;
  videosAnalyzed: number;
  videosAdded: number;
  videosRejected: number;
  qualityDistribution: Record<string, number>;
  topInstructors: string[];
  errors: string[];
  databaseTotal: number;
}

let quotaUsed = 0;
const QUOTA_LIMIT = 10000;

async function searchYouTube(query: string, maxResults: number = 25): Promise<VideoSearchResult[]> {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY not set');
  }
  
  if (quotaUsed >= QUOTA_LIMIT) {
    throw new Error('QUOTA_EXHAUSTED');
  }
  
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', YOUTUBE_API_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('videoDuration', 'medium');
  url.searchParams.set('order', 'relevance');
  
  try {
    const response = await fetch(url.toString());
    quotaUsed += 100;
    
    if (!response.ok) {
      const errorText = await response.text();
      if (errorText.includes('quotaExceeded')) {
        throw new Error('QUOTA_EXHAUSTED');
      }
      throw new Error(`YouTube API error: ${response.status}`);
    }
    
    const data = await response.json();
    return (data.items || []).map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl: item.snippet.thumbnails?.high?.url || '',
      publishedAt: item.snippet.publishedAt,
      description: item.snippet.description
    }));
  } catch (error) {
    throw error;
  }
}

async function searchYouTubeRecent(query: string, daysBack: number = 90, maxResults: number = 25): Promise<VideoSearchResult[]> {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY not set');
  }
  
  if (quotaUsed >= QUOTA_LIMIT) {
    throw new Error('QUOTA_EXHAUSTED');
  }
  
  const publishedAfter = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', YOUTUBE_API_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('videoDuration', 'medium');
  url.searchParams.set('order', 'date');
  url.searchParams.set('publishedAfter', publishedAfter);
  
  try {
    const response = await fetch(url.toString());
    quotaUsed += 100;
    
    if (!response.ok) {
      const errorText = await response.text();
      if (errorText.includes('quotaExceeded')) {
        throw new Error('QUOTA_EXHAUSTED');
      }
      throw new Error(`YouTube API error: ${response.status}`);
    }
    
    const data = await response.json();
    return (data.items || []).map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl: item.snippet.thumbnails?.high?.url || '',
      publishedAt: item.snippet.publishedAt,
      description: item.snippet.description
    }));
  } catch (error) {
    throw error;
  }
}

async function getVideoDuration(videoId: string): Promise<number> {
  if (!YOUTUBE_API_KEY) return 0;
  
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('key', YOUTUBE_API_KEY);
  url.searchParams.set('id', videoId);
  url.searchParams.set('part', 'contentDetails');
  
  try {
    const response = await fetch(url.toString());
    quotaUsed += 1;
    
    if (!response.ok) return 0;
    
    const data = await response.json();
    const duration = data.items?.[0]?.contentDetails?.duration;
    if (!duration) return 0;
    
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    return hours * 3600 + minutes * 60 + seconds;
  } catch {
    return 0;
  }
}

function getQualityThreshold(channelTitle: string): number {
  const normalized = channelTitle.toLowerCase();
  
  if (ELITE_INSTRUCTORS.some(i => normalized.includes(i))) {
    return QUALITY_THRESHOLDS.elite;
  }
  if (KNOWN_COMPETITORS.some(i => normalized.includes(i))) {
    return QUALITY_THRESHOLDS.known;
  }
  return QUALITY_THRESHOLDS.unknown;
}

function getInstructorTier(channelTitle: string): 'elite' | 'known' | 'unknown' {
  const normalized = channelTitle.toLowerCase();
  if (ELITE_INSTRUCTORS.some(i => normalized.includes(i))) return 'elite';
  if (KNOWN_COMPETITORS.some(i => normalized.includes(i))) return 'known';
  return 'unknown';
}

async function analyzeVideo(video: VideoSearchResult, topic: string): Promise<{
  approved: boolean;
  score: number;
  instructorName: string;
  techniqueName: string;
  giOrNogi: string;
  rejectionReason?: string;
}> {
  try {
    const threshold = getQualityThreshold(video.channelTitle);
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyze this BJJ video for quality and content:

Title: ${video.title}
Channel: ${video.channelTitle}
Description: ${video.description?.substring(0, 500) || 'N/A'}

Respond in JSON:
{
  "isInstructional": true/false,
  "qualityScore": 1-10,
  "instructorName": "name",
  "techniqueName": "technique",
  "giOrNogi": "gi" | "nogi" | "both",
  "reasoning": "brief explanation"
}

Quality criteria:
- 8-10: Clear instruction, good demo, trusted instructor
- 6-7: Good content but minor issues
- Below 6: Poor quality or non-instructional

REJECT if: competition footage only, under 3 min, no instruction, entertainment content.`
      }]
    });
    
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { approved: false, score: 0, instructorName: '', techniqueName: '', giOrNogi: 'both', rejectionReason: 'Parse error' };
    }
    
    const analysis = JSON.parse(jsonMatch[0]);
    
    if (!analysis.isInstructional) {
      return { 
        approved: false, 
        score: analysis.qualityScore || 0, 
        instructorName: analysis.instructorName || video.channelTitle,
        techniqueName: analysis.techniqueName || '',
        giOrNogi: analysis.giOrNogi || 'both',
        rejectionReason: 'Non-instructional content'
      };
    }
    
    const approved = analysis.qualityScore >= threshold;
    
    return {
      approved,
      score: analysis.qualityScore,
      instructorName: analysis.instructorName || video.channelTitle,
      techniqueName: analysis.techniqueName || topic,
      giOrNogi: analysis.giOrNogi || 'both',
      rejectionReason: approved ? undefined : `Score ${analysis.qualityScore} below threshold ${threshold}`
    };
  } catch (error) {
    return { 
      approved: false, 
      score: 0, 
      instructorName: video.channelTitle,
      techniqueName: '',
      giOrNogi: 'both',
      rejectionReason: error instanceof Error ? error.message : 'Analysis error'
    };
  }
}

async function addVideoToLibrary(video: VideoSearchResult, analysis: any, topic: string): Promise<boolean> {
  try {
    const existing = await db.select({ id: aiVideoKnowledge.id })
      .from(aiVideoKnowledge)
      .where(eq(aiVideoKnowledge.youtubeId, video.videoId))
      .limit(1);
    
    if (existing.length > 0) {
      return false;
    }
    
    await db.insert(aiVideoKnowledge).values({
      youtubeId: video.videoId,
      videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      title: video.title,
      techniqueName: analysis.techniqueName || topic,
      instructorName: analysis.instructorName,
      channelName: video.channelTitle,
      thumbnailUrl: video.thumbnailUrl,
      qualityScore: String(analysis.score),
      giOrNogi: analysis.giOrNogi,
      positionCategory: topic,
      instructorCredibility: getInstructorTier(video.channelTitle)
    });
    
    return true;
  } catch (error: any) {
    if (error?.code === '23505') {
      return false;
    }
    console.error(`[TARGETED CURATION] Failed to add video:`, error?.message || error);
    return false;
  }
}

export async function runTargetedCuration(
  topic: 'gi' | 'nogi' | 'daily' | string,
  customSearches?: string[]
): Promise<CurationResult> {
  const startTime = Date.now();
  quotaUsed = 0;
  
  let searches: string[];
  let topicName: string;
  
  if (topic === 'gi') {
    searches = GI_FOCUSED_SEARCHES;
    topicName = 'Gi-Focused';
  } else if (topic === 'daily') {
    const dayOfWeek = new Date().getDay();
    const dayTopic = DAILY_TOPICS[dayOfWeek];
    searches = dayTopic.searches;
    topicName = dayTopic.name;
  } else if (customSearches) {
    searches = customSearches;
    topicName = topic;
  } else if (DAILY_TOPICS[parseInt(topic)]) {
    const dayTopic = DAILY_TOPICS[parseInt(topic)];
    searches = dayTopic.searches;
    topicName = dayTopic.name;
  } else {
    searches = DAILY_TOPICS[5].searches;
    topicName = 'gi';
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎯 TARGETED CURATION: ${topicName.toUpperCase()}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Running ${searches.length} searches...`);
  
  const result: CurationResult = {
    topic: topicName,
    videosSearched: 0,
    videosAnalyzed: 0,
    videosAdded: 0,
    videosRejected: 0,
    qualityDistribution: {},
    topInstructors: [],
    errors: [],
    databaseTotal: 0
  };
  
  const instructorCounts: Record<string, number> = {};
  
  try {
    const runRecord = await db.insert(curationRuns).values({
      runType: 'manual',
      status: 'running',
      searchCategory: `Targeted: ${topicName}`,
      videosAnalyzed: 0,
      videosAdded: 0,
      videosRejected: 0,
      startedAt: new Date()
    }).returning();
    
    const runId = runRecord[0]?.id;
    
    for (const query of searches) {
      try {
        if (quotaUsed >= QUOTA_LIMIT * 0.9) {
          result.errors.push('Approaching quota limit, stopping early');
          break;
        }
        
        console.log(`\n🔍 Searching: "${query}"`);
        const videos = await searchYouTube(query);
        result.videosSearched += videos.length;
        
        for (const video of videos) {
          const duration = await getVideoDuration(video.videoId);
          if (duration < 180 || duration > 3600) {
            continue;
          }
          
          if (topic === 'gi' && (video.title.toLowerCase().includes('nogi') || 
              video.title.toLowerCase().includes('no gi') ||
              video.title.toLowerCase().includes('no-gi'))) {
            continue;
          }
          
          result.videosAnalyzed++;
          const analysis = await analyzeVideo(video, topicName);
          
          const scoreKey = String(Math.floor(analysis.score));
          result.qualityDistribution[scoreKey] = (result.qualityDistribution[scoreKey] || 0) + 1;
          
          if (analysis.approved) {
            const added = await addVideoToLibrary(video, analysis, topicName);
            if (added) {
              result.videosAdded++;
              instructorCounts[analysis.instructorName] = (instructorCounts[analysis.instructorName] || 0) + 1;
              console.log(`   ✅ Added: ${video.title.substring(0, 50)}... (${analysis.score}/10)`);
            }
          } else {
            result.videosRejected++;
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'QUOTA_EXHAUSTED') {
          result.errors.push('YouTube quota exhausted');
          break;
        }
        result.errors.push(`Search "${query}" failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    const totalCount = await db.select({ count: sql<number>`count(*)` }).from(aiVideoKnowledge);
    result.databaseTotal = Number(totalCount[0]?.count || 0);
    
    result.topInstructors = Object.entries(instructorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `${name} (${count})`);
    
    await db.update(curationRuns)
      .set({
        status: 'completed',
        videosAnalyzed: result.videosAnalyzed,
        videosAdded: result.videosAdded,
        videosRejected: result.videosRejected,
        completedAt: sql`NOW()`
      })
      .where(eq(curationRuns.id, runId));
    
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 CURATION COMPLETE: ${topicName.toUpperCase()}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   Videos searched: ${result.videosSearched}`);
  console.log(`   Videos analyzed: ${result.videosAnalyzed}`);
  console.log(`   Videos added: ${result.videosAdded}`);
  console.log(`   Videos rejected: ${result.videosRejected}`);
  console.log(`   Library total: ${result.databaseTotal}`);
  console.log(`   Duration: ${Math.round((Date.now() - startTime) / 1000)}s`);
  
  return result;
}

export async function sendCurationEmail(result: CurationResult): Promise<boolean> {
  try {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { 
      timeZone: 'America/New_York',
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    
    const subject = result.videosAdded > 0
      ? `🎯 BJJ OS Curation - ${dateStr} - ${result.videosAdded} Videos Added (${result.topic})`
      : `⚠️ BJJ OS Curation - ${dateStr} - 0 Videos Added (${result.topic})`;
    
    let htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; padding: 20px;">
        <h2 style="color: #8B5CF6;">🎯 Targeted Curation: ${result.topic.toUpperCase()}</h2>
        <p style="color: #666;">${dateStr}</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: ${result.videosAdded > 0 ? '#dcfce7' : '#fef9c3'};">
            <td style="padding: 12px; border: 1px solid #ddd;"><strong>Videos Added</strong></td>
            <td style="padding: 12px; border: 1px solid #ddd; font-size: 24px; font-weight: bold;">${result.videosAdded}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #ddd;">Videos Searched</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${result.videosSearched}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #ddd;">Videos Analyzed</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${result.videosAnalyzed}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #ddd;">Videos Rejected</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${result.videosRejected}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #ddd;">Database Total</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${result.databaseTotal}</td>
          </tr>
        </table>
        
        <h3 style="color: #8B5CF6;">Quality Distribution</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
          ${Object.entries(result.qualityDistribution)
            .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
            .map(([score, count]) => `
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">Score ${score}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${count} videos</td>
              </tr>
            `).join('')}
        </table>
        
        ${result.topInstructors.length > 0 ? `
          <h3 style="color: #8B5CF6;">Top Instructors Added</h3>
          <ul style="padding-left: 20px;">
            ${result.topInstructors.map(i => `<li>${i}</li>`).join('')}
          </ul>
        ` : ''}
        
        ${result.errors.length > 0 ? `
          <h3 style="color: #ef4444;">⚠️ Errors</h3>
          <ul style="padding-left: 20px; color: #ef4444;">
            ${result.errors.map(e => `<li>${e}</li>`).join('')}
          </ul>
        ` : ''}
        
        ${result.videosAdded === 0 ? `
          <div style="background: #fef9c3; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <strong>Why 0 videos added?</strong>
            <ul style="margin: 10px 0; padding-left: 20px;">
              ${result.videosAnalyzed === 0 ? '<li>No videos passed initial filters (duration, duplicates)</li>' : ''}
              ${result.videosRejected > 0 ? `<li>${result.videosRejected} videos rejected for quality/content</li>` : ''}
              ${result.errors.length > 0 ? '<li>Errors occurred during curation</li>' : ''}
            </ul>
          </div>
        ` : ''}
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <a href="https://bjjos.app/admin/videos" style="background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Video Library
          </a>
        </div>
      </div>
    `;
    
    await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: [ADMIN_EMAIL],
      subject,
      html: htmlContent
    });
    
    console.log(`[TARGETED CURATION] ✅ Email sent: ${subject}`);
    return true;
  } catch (error) {
    console.error('[TARGETED CURATION] ❌ Email failed:', error);
    return false;
  }
}

export async function runNightlyCuration(): Promise<CurationResult> {
  console.log('\n' + '═'.repeat(60));
  console.log('🌙 NIGHTLY CURATION STARTING...');
  console.log('═'.repeat(60));
  
  const result = await runTargetedCuration('daily');
  await sendCurationEmail(result);
  
  return result;
}

export async function runGiFocusedCuration(): Promise<CurationResult> {
  console.log('\n' + '═'.repeat(60));
  console.log('🥋 GI-FOCUSED CURATION STARTING...');
  console.log('═'.repeat(60));
  
  const result = await runTargetedCuration('gi');
  await sendCurationEmail(result);
  
  return result;
}

export function getTodaysTopic(): { name: string; dayOfWeek: number; searches: string[] } {
  const dayOfWeek = new Date().getDay();
  const topic = DAILY_TOPICS[dayOfWeek];
  return { name: topic.name, dayOfWeek, searches: topic.searches };
}

// ========================================
// EXPANDED CURATION - Find NEW Content
// ========================================

interface ExpandedCurationResult extends CurationResult {
  searchBreakdown: {
    techniqueSearches: { count: number; found: number };
    newInstructorSearches: { count: number; found: number };
    recentUploads: { count: number; found: number };
    channelSearches: { count: number; found: number };
  };
  newInstructorsDiscovered: string[];
}

export async function runExpandedCuration(): Promise<ExpandedCurationResult> {
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 EXPANDED CURATION - Finding NEW Content');
  console.log('═'.repeat(60));
  
  const startTime = Date.now();
  quotaUsed = 0;
  
  const result: ExpandedCurationResult = {
    topic: 'expanded',
    videosSearched: 0,
    videosAnalyzed: 0,
    videosAdded: 0,
    videosRejected: 0,
    qualityDistribution: {},
    topInstructors: [],
    errors: [],
    databaseTotal: 0,
    searchBreakdown: {
      techniqueSearches: { count: 0, found: 0 },
      newInstructorSearches: { count: 0, found: 0 },
      recentUploads: { count: 0, found: 0 },
      channelSearches: { count: 0, found: 0 }
    },
    newInstructorsDiscovered: []
  };
  
  const instructorCounts: Record<string, number> = {};
  const existingInstructors = new Set<string>();
  
  // Get existing instructors from database
  try {
    const existing = await db.execute(sql`
      SELECT DISTINCT LOWER(instructor_name) as name FROM ai_video_knowledge 
      WHERE instructor_name IS NOT NULL
    `);
    const rows = Array.isArray(existing) ? existing : (existing as any).rows || [];
    rows.forEach((row: any) => existingInstructors.add(row.name));
  } catch (err) {
    console.error('Failed to load existing instructors:', err);
  }
  
  // Create curation run record
  let runId: string | undefined;
  try {
    const runRecord = await db.insert(curationRuns).values({
      runType: 'manual',
      status: 'running',
      searchCategory: 'Expanded Curation',
      videosAnalyzed: 0,
      videosAdded: 0,
      videosRejected: 0,
      startedAt: new Date()
    }).returning();
    runId = runRecord[0]?.id;
  } catch (err) {
    console.error('Failed to create curation run:', err);
  }
  
  // Helper function to process videos
  async function processVideos(videos: VideoSearchResult[], searchType: string, stricterThreshold: boolean = false): Promise<number> {
    let added = 0;
    
    for (const video of videos) {
      try {
        // Check if already exists
        const existing = await db.select({ id: aiVideoKnowledge.id })
          .from(aiVideoKnowledge)
          .where(eq(aiVideoKnowledge.youtubeId, video.videoId))
          .limit(1);
        
        if (existing.length > 0) {
          result.videosRejected++;
          continue;
        }
        
        // Check duration
        const duration = await getVideoDuration(video.videoId);
        if (duration < 60 || duration > 3600) {
          result.videosRejected++;
          continue;
        }
        
        result.videosAnalyzed++;
        
        // Analyze with Claude using the existing analyzeVideo function
        const analysis = await analyzeVideo(video, searchType);
        if (!analysis) {
          result.videosRejected++;
          continue;
        }
        
        // Apply stricter threshold for new instructors
        const baseThreshold = getQualityThreshold(video.channelTitle);
        const threshold = stricterThreshold ? Math.max(baseThreshold, 8.0) : baseThreshold;
        
        if (analysis.approved && analysis.score >= threshold) {
          // Use existing addVideoToLibrary helper
          const wasAdded = await addVideoToLibrary(video, analysis, searchType);
          
          if (wasAdded) {
            result.videosAdded++;
            added++;
            
            // Track instructor
            const instructor = analysis.instructorName || video.channelTitle;
            instructorCounts[instructor] = (instructorCounts[instructor] || 0) + 1;
            
            // Check if new instructor
            if (!existingInstructors.has(instructor.toLowerCase())) {
              result.newInstructorsDiscovered.push(instructor);
              existingInstructors.add(instructor.toLowerCase());
            }
            
            console.log(`   ✅ Added: ${video.title.substring(0, 50)}... (${analysis.score}/10)`);
          } else {
            result.videosRejected++;
            console.log(`   ⏭️ Skip (duplicate): ${video.title.substring(0, 40)}...`);
          }
        } else {
          result.videosRejected++;
          const reason = analysis.rejectionReason || `Score ${analysis.score} below threshold ${threshold}`;
          console.log(`   ❌ Rejected: ${reason}`);
        }
      } catch (err: any) {
        if (err.message === 'QUOTA_EXHAUSTED') throw err;
        result.errors.push(`Error processing ${video.videoId}: ${err.message}`);
        result.videosRejected++;
      }
    }
    
    return added;
  }
  
  try {
    // ═══════════════════════════════════════════════════
    // STRATEGY 1: TECHNIQUE SEARCHES (40 searches)
    // ═══════════════════════════════════════════════════
    console.log('\n📚 STRATEGY 1: Technique Searches');
    console.log('─'.repeat(40));
    
    const giTechniques = EXPANDED_GI_TECHNIQUE_SEARCHES.slice(0, 12);
    const nogiTechniques = EXPANDED_NOGI_TECHNIQUE_SEARCHES.slice(0, 12);
    
    for (const query of [...giTechniques, ...nogiTechniques]) {
      if (quotaUsed >= QUOTA_LIMIT * 0.8) break;
      
      console.log(`🔍 ${query}`);
      result.searchBreakdown.techniqueSearches.count++;
      
      try {
        const videos = await searchYouTube(query, 25);  // Back to 25 per search
        result.videosSearched += videos.length;
        const found = await processVideos(videos, 'technique');
        result.searchBreakdown.techniqueSearches.found += found;
      } catch (err: any) {
        if (err.message === 'QUOTA_EXHAUSTED') break;
        result.errors.push(`Technique search error: ${err.message}`);
      }
    }
    
    // ═══════════════════════════════════════════════════
    // STRATEGY 2: NEW INSTRUCTOR SEARCHES (20 searches)
    // ═══════════════════════════════════════════════════
    console.log('\n👤 STRATEGY 2: New Instructor Searches');
    console.log('─'.repeat(40));
    
    for (const instructor of NEW_RISING_INSTRUCTORS.slice(0, 10)) {
      if (quotaUsed >= QUOTA_LIMIT * 0.8) break;
      
      const query = `${instructor} bjj technique tutorial`;
      console.log(`🔍 ${query}`);
      result.searchBreakdown.newInstructorSearches.count++;
      
      try {
        const videos = await searchYouTube(query, 25);  // Back to 25 per search
        result.videosSearched += videos.length;
        const found = await processVideos(videos, 'new-instructor', true); // Stricter threshold
        result.searchBreakdown.newInstructorSearches.found += found;
      } catch (err: any) {
        if (err.message === 'QUOTA_EXHAUSTED') break;
        result.errors.push(`New instructor search error: ${err.message}`);
      }
    }
    
    // ═══════════════════════════════════════════════════
    // STRATEGY 3: RECENT UPLOADS (15 searches)
    // ═══════════════════════════════════════════════════
    console.log('\n📅 STRATEGY 3: Recent Uploads (Last 90 Days)');
    console.log('─'.repeat(40));
    
    const recentQueries = [
      'bjj technique tutorial', 'jiu jitsu instructional', 'guard sweep bjj',
      'submission tutorial bjj', 'guard passing technique', 'takedown bjj',
      'escape bjj tutorial', 'mount technique bjj', 'back take bjj',
      'half guard sweep', 'triangle choke tutorial', 'armbar setup bjj'
    ];
    
    for (const query of recentQueries.slice(0, 8)) {
      if (quotaUsed >= QUOTA_LIMIT * 0.8) break;
      
      console.log(`🔍 ${query} (recent 90 days)`);
      result.searchBreakdown.recentUploads.count++;
      
      try {
        const videos = await searchYouTubeRecent(query, 90, 25);  // Back to 25 per search
        result.videosSearched += videos.length;
        const found = await processVideos(videos, 'recent');
        result.searchBreakdown.recentUploads.found += found;
      } catch (err: any) {
        if (err.message === 'QUOTA_EXHAUSTED') break;
        result.errors.push(`Recent search error: ${err.message}`);
      }
    }
    
    // ═══════════════════════════════════════════════════
    // STRATEGY 4: CHANNEL SEARCHES (10 searches)
    // ═══════════════════════════════════════════════════
    console.log('\n📺 STRATEGY 4: Quality Channel Searches');
    console.log('─'.repeat(40));
    
    for (const channel of QUALITY_CHANNELS.slice(0, 6)) {
      if (quotaUsed >= QUOTA_LIMIT * 0.8) break;
      
      const query = `${channel} technique tutorial`;
      console.log(`🔍 ${query}`);
      result.searchBreakdown.channelSearches.count++;
      
      try {
        const videos = await searchYouTubeRecent(query, 180, 25);  // Back to 25 per search
        result.videosSearched += videos.length;
        const found = await processVideos(videos, 'channel');
        result.searchBreakdown.channelSearches.found += found;
      } catch (err: any) {
        if (err.message === 'QUOTA_EXHAUSTED') break;
        result.errors.push(`Channel search error: ${err.message}`);
      }
    }
    
  } catch (error: any) {
    result.errors.push(error.message);
  }
  
  // Get final library count
  try {
    const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
    const rows = Array.isArray(countResult) ? countResult : (countResult as any).rows || [];
    result.databaseTotal = parseInt(rows[0]?.count || '0');
  } catch (err) {
    console.error('Failed to get library count:', err);
  }
  
  // Get top instructors
  result.topInstructors = Object.entries(instructorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => `${name} (${count})`);
  
  // Update curation run
  if (runId) {
    try {
      await db.update(curationRuns)
        .set({
          status: 'completed',
          videosAnalyzed: result.videosAnalyzed,
          videosAdded: result.videosAdded,
          videosRejected: result.videosRejected,
          completedAt: new Date()
        })
        .where(eq(curationRuns.id, runId));
    } catch (err) {
      console.error('Failed to update curation run:', err);
    }
  }
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 EXPANDED CURATION COMPLETE');
  console.log('═'.repeat(60));
  console.log(`   Duration: ${duration}s`);
  console.log(`   Videos searched: ${result.videosSearched}`);
  console.log(`   Videos analyzed: ${result.videosAnalyzed}`);
  console.log(`   Videos added: ${result.videosAdded}`);
  console.log(`   Videos rejected: ${result.videosRejected}`);
  console.log(`   Library total: ${result.databaseTotal}`);
  console.log('\n📊 SEARCH BREAKDOWN:');
  console.log(`   Technique searches: ${result.searchBreakdown.techniqueSearches.count} (found ${result.searchBreakdown.techniqueSearches.found} new)`);
  console.log(`   New instructor searches: ${result.searchBreakdown.newInstructorSearches.count} (found ${result.searchBreakdown.newInstructorSearches.found} new)`);
  console.log(`   Recent uploads: ${result.searchBreakdown.recentUploads.count} (found ${result.searchBreakdown.recentUploads.found} new)`);
  console.log(`   Channel searches: ${result.searchBreakdown.channelSearches.count} (found ${result.searchBreakdown.channelSearches.found} new)`);
  
  if (result.newInstructorsDiscovered.length > 0) {
    console.log('\n🆕 NEW INSTRUCTORS DISCOVERED:');
    result.newInstructorsDiscovered.forEach(i => console.log(`   • ${i}`));
  }
  
  return result;
}

export async function sendExpandedCurationEmail(result: ExpandedCurationResult): Promise<boolean> {
  try {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      timeZone: 'America/New_York'
    });
    
    const status = result.videosAdded > 0 ? '✅' : '⚠️';
    const subject = `${status} BJJ OS Expanded Curation - ${dateStr} - ${result.videosAdded} Videos Added`;
    
    const htmlContent = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #8B5CF6;">🚀 Expanded Curation Report</h1>
        <p style="color: #666;">${dateStr}</p>
        
        <h2>📊 Results Summary</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="background: #f3f4f6;">
            <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Videos Searched</strong></td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${result.videosSearched}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Videos Analyzed</strong></td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${result.videosAnalyzed}</td>
          </tr>
          <tr style="background: ${result.videosAdded > 0 ? '#dcfce7' : '#fef9c3'};">
            <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Videos Added</strong></td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${result.videosAdded}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Videos Rejected</strong></td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${result.videosRejected}</td>
          </tr>
          <tr style="background: #f3f4f6;">
            <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Library Total</strong></td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${result.databaseTotal}</td>
          </tr>
        </table>
        
        <h2 style="margin-top: 30px;">🔍 Search Breakdown</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="background: #8B5CF6; color: white;">
            <th style="padding: 10px; text-align: left;">Strategy</th>
            <th style="padding: 10px; text-align: center;">Searches</th>
            <th style="padding: 10px; text-align: center;">Found</th>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">📚 Technique Searches</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;">${result.searchBreakdown.techniqueSearches.count}</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: ${result.searchBreakdown.techniqueSearches.found > 0 ? '#22c55e' : '#666'};">${result.searchBreakdown.techniqueSearches.found}</td>
          </tr>
          <tr style="background: #f3f4f6;">
            <td style="padding: 10px; border: 1px solid #e5e7eb;">👤 New Instructor Searches</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;">${result.searchBreakdown.newInstructorSearches.count}</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: ${result.searchBreakdown.newInstructorSearches.found > 0 ? '#22c55e' : '#666'};">${result.searchBreakdown.newInstructorSearches.found}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">📅 Recent Uploads (90 days)</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;">${result.searchBreakdown.recentUploads.count}</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: ${result.searchBreakdown.recentUploads.found > 0 ? '#22c55e' : '#666'};">${result.searchBreakdown.recentUploads.found}</td>
          </tr>
          <tr style="background: #f3f4f6;">
            <td style="padding: 10px; border: 1px solid #e5e7eb;">📺 Channel Searches</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;">${result.searchBreakdown.channelSearches.count}</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: center; color: ${result.searchBreakdown.channelSearches.found > 0 ? '#22c55e' : '#666'};">${result.searchBreakdown.channelSearches.found}</td>
          </tr>
        </table>
        
        ${result.newInstructorsDiscovered.length > 0 ? `
          <h2 style="margin-top: 30px; color: #22c55e;">🆕 NEW Instructors Discovered!</h2>
          <ul style="padding-left: 20px;">
            ${result.newInstructorsDiscovered.map(i => `<li style="margin: 5px 0;">${i}</li>`).join('')}
          </ul>
        ` : ''}
        
        ${result.topInstructors.length > 0 ? `
          <h2 style="margin-top: 30px;">🏆 Top Instructors Added</h2>
          <ul style="padding-left: 20px;">
            ${result.topInstructors.map(i => `<li style="margin: 5px 0;">${i}</li>`).join('')}
          </ul>
        ` : ''}
        
        ${result.errors.length > 0 ? `
          <h2 style="margin-top: 30px; color: #ef4444;">⚠️ Errors</h2>
          <ul style="padding-left: 20px; color: #ef4444;">
            ${result.errors.slice(0, 5).map(e => `<li>${e}</li>`).join('')}
          </ul>
        ` : ''}
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <a href="https://bjjos.app/admin/videos" style="background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Video Library
          </a>
        </div>
      </div>
    `;
    
    await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: [ADMIN_EMAIL],
      subject,
      html: htmlContent
    });
    
    console.log(`[EXPANDED CURATION] ✅ Email sent: ${subject}`);
    return true;
  } catch (error) {
    console.error('[EXPANDED CURATION] ❌ Email failed:', error);
    return false;
  }
}
