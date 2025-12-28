/**
 * CONTENT-FIRST VIDEO CURATION STRATEGY
 * 
 * Philosophy: Search for TECHNIQUES, not instructors.
 * AI identifies who's teaching by analyzing content.
 * Accept videos from ANY source if instructor is credible and quality is high.
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from './db';
import { instructorCredibility, aiVideoKnowledge, videoAnalysisLog, videoCurationConfig, videoReviewQueue, videoWatchStatus } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { getVideoDetails } from './youtube-service'; // Import at top level for quota tracking
import { detectVideoLanguage } from './utils/languageDetection';

/**
 * Direct YouTube search without multi-stage filtering
 * Returns raw YouTube results for AI analysis
 * UPDATED: 10 videos per query (up from 5) for better diversity
 */
async function directYouTubeSearch(query: string, maxResults: number = 10): Promise<Array<{
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
}>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY not configured');
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('q', query);
  url.searchParams.append('type', 'video');
  url.searchParams.append('maxResults', maxResults.toString());
  url.searchParams.append('order', 'relevance');
  url.searchParams.append('key', apiKey);

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`YouTube API error: ${response.status}`);
  }

  const data = await response.json();
  
  return data.items.map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description || '',
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
  }));
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

/**
 * EXPANDED Comprehensive technique search queries - 230+ diverse queries
 * Updated to prevent query saturation and ensure consistent video discovery
 * Covers: submissions, guards, passes, escapes, positions, leg locks, takedowns, instructor-specific
 */
export const TECHNIQUE_SEARCHES = [
  // ═══════════════════════════════════════════════════════════════
  // SUBMISSIONS (55 queries)
  // ═══════════════════════════════════════════════════════════════
  "triangle choke technique", "triangle from closed guard", "triangle finish details",
  "armbar from mount", "armbar from guard", "armbar mechanics", "armbar from back",
  "kimura from side control", "kimura grip details", "kimura finish", "rolling kimura",
  "rear naked choke", "RNC hand position", "RNC finish", "short choke back control",
  "guillotine choke", "guillotine from guard", "high elbow guillotine", "arm in guillotine",
  "darce choke", "d'arce setup", "marce choke details", "darce from scrambles",
  "anaconda choke", "anaconda from front headlock", "gator roll anaconda",
  "arm triangle", "arm triangle from mount", "kata gatame", "arm triangle side control",
  "omoplata technique", "omoplata from guard", "omoplata sweep", "monoplata",
  "heel hook tutorial", "inside heel hook", "outside heel hook", "heel hook defense",
  "straight ankle lock", "ankle lock finish", "achilles lock", "estima lock",
  "kneebar technique", "kneebar from top", "kneebar details", "kneebar from guard",
  "toe hold", "toe hold mechanics", "toe hold finish", "calf slicer",
  "americana lock", "americana from mount", "key lock", "double wrist lock",
  "cross collar choke", "cross choke from mount", "cross choke guard",
  "bow and arrow choke", "bow and arrow from back", "bow and arrow variations",
  "loop choke", "loop choke from guard", "paper cutter choke",
  "ezekiel choke", "ezekiel from mount", "no gi ezekiel",
  "baseball choke", "baseball bat choke", "baseball choke from knee on belly",
  "clock choke", "clock choke from turtle", "short choke gi",
  "peruvian necktie", "japanese necktie", "north south choke",
  "inverted triangle", "reverse triangle", "mounted triangle",
  "bicep slicer", "wrist lock bjj", "gift wrap submission",
  
  // ═══════════════════════════════════════════════════════════════
  // GUARD SYSTEMS (45 queries)
  // ═══════════════════════════════════════════════════════════════
  "closed guard attacks", "closed guard basics", "closed guard sweeps", "closed guard control",
  "open guard fundamentals", "open guard concepts", "open guard retention",
  "spider guard technique", "spider guard sweeps", "spider guard details", "spider lasso hybrid",
  "de la riva guard", "de la riva sweeps", "DLR basics", "DLR to back take",
  "butterfly guard", "butterfly sweep", "butterfly hooks", "seated butterfly guard",
  "x guard technique", "x guard sweeps", "x guard entries", "x guard to leg lock",
  "single leg x guard", "SLX sweeps", "ashi garami entries", "outside ashi",
  "half guard bottom", "half guard sweeps", "deep half guard", "deep half entries",
  "half guard underhook", "half guard lockdown", "half butterfly guard",
  "50/50 guard", "fifty fifty position", "50/50 sweeps", "50/50 heel hook",
  "lasso guard", "lasso guard sweeps", "lasso spider", "lasso to omoplata",
  "reverse de la riva", "RDLR sweeps", "RDLR to berimbolo", "kiss of the dragon",
  "worm guard", "lapel guards", "squid guard", "gubber guard",
  "rubber guard", "rubber guard techniques", "mission control", "zombie guard",
  "z guard", "93 guard", "z guard sweeps", "knee shield half guard",
  "shin to shin guard", "shin on shin", "shin to shin sweep",
  "collar sleeve guard", "cross grip guard", "same side sleeve guard",
  "k guard bjj", "matrix guard", "octopus guard",
  
  // ═══════════════════════════════════════════════════════════════
  // GUARD PASSING (40 queries)
  // ═══════════════════════════════════════════════════════════════
  "guard passing basics", "pressure passing", "speed passing",
  "knee slice pass", "knee cut pass", "knee through", "knee slice to mount",
  "toreando pass", "bullfighter pass", "matador pass", "double toreando",
  "leg drag pass", "leg drag details", "leg drag position control",
  "stack pass", "stacking guard pass", "sao paulo pass",
  "over under pass", "over under pressure", "over under to mount",
  "x pass", "cross face pass", "float pass",
  "smash pass", "headquarters position", "hip switch pass",
  "long step pass", "long step details", "backstep pass",
  "knee on belly pass", "knee mount pass", "leg weave pass",
  "standing guard pass", "standing to pass", "standing guard break",
  "double under pass", "double under details", "double under stack",
  "folding pass", "body lock pass", "power half pass",
  "leg pummeling pass", "split squat pass", "combat base passing",
  "movement passing", "dynamic passing", "passing seated guard",
  
  // ═══════════════════════════════════════════════════════════════
  // LEG LOCKS & ASHI GARAMI (35 queries)
  // ═══════════════════════════════════════════════════════════════
  "leg lock system", "leg lock entries", "leg lock defense",
  "ashi garami variations", "inside ashi garami", "outside ashi garami",
  "saddle position", "411 position", "honey hole position",
  "heel hook mechanics", "heel hook finish", "heel hook grip",
  "inside heel hook entries", "outside heel hook entries",
  "toe hold from ashi", "toe hold from 50/50",
  "knee bar from top", "knee bar from guard", "kneebar entries",
  "calf slicer bjj", "calf crush", "bicep slicer from guard",
  "leg entanglement", "leg knot", "leg lock transitions",
  "50/50 leg attacks", "50/50 sweeps", "50/50 back take",
  "backside 50/50", "cross ashi", "game over position",
  "imanari roll", "rolling leg lock entry", "inversion leg lock",
  "leg lock escapes", "heel hook defense", "boot defense",
  "reaping the leg", "leg pummeling", "leg positioning ashi",
  
  // ═══════════════════════════════════════════════════════════════
  // ESCAPES & DEFENSE (30 queries)
  // ═══════════════════════════════════════════════════════════════
  "mount escape", "elbow escape mount", "upa from mount", "trap and roll",
  "side control escape", "frame and shrimp", "ghost escape", "granby roll escape",
  "back control escape", "back escape details", "RNC defense", "hand fighting back",
  "triangle defense", "triangle escape technique", "posture in triangle",
  "armbar defense", "armbar escape", "hitchhiker escape", "stack armbar defense",
  "kimura defense", "kimura escape", "rolling kimura defense",
  "guillotine defense", "guillotine escape", "von flue choke counter",
  "turtle position defense", "turtle guard", "turtle escapes",
  "knee on belly escape", "knee mount escape", "frame knee on belly",
  "north south escape", "north south defense", "north south turn",
  "kesa gatame escape", "scarf hold escape", "side headlock escape",
  "leg lock defense", "heel hook defense", "boot escape",
  
  // ═══════════════════════════════════════════════════════════════
  // POSITIONS & TRANSITIONS (30 queries)
  // ═══════════════════════════════════════════════════════════════
  "back control techniques", "back take", "back attack", "back mount retention",
  "mount attacks", "mount control", "high mount", "s mount", "technical mount",
  "side control attacks", "side control transitions", "100 kilos side control",
  "knee on belly", "knee mount control", "knee on belly attacks",
  "north south position", "north south attacks", "north south choke",
  "turtle attacks", "attacking turtle", "turtle offense", "clock choke turtle",
  "front headlock", "front headlock position", "front headlock attacks",
  "crucifix position", "crucifix control", "crucifix attacks",
  "leg drag position", "bodylock passing", "bodylock back take",
  "guard retention", "preventing guard pass", "guard recovery",
  "scrambles in BJJ", "scrambling technique", "winning scrambles",
  "berimbolo", "crab ride", "baby bolo", "kiss of dragon back take",
  
  // ═══════════════════════════════════════════════════════════════
  // WRESTLING & TAKEDOWNS FOR BJJ (25 queries)
  // ═══════════════════════════════════════════════════════════════
  "wrestling for BJJ", "takedowns for BJJ", "judo for BJJ",
  "single leg takedown bjj", "single leg finish", "running the pipe",
  "double leg bjj", "double leg setup", "blast double",
  "arm drag takedown", "arm drag to back", "two on one arm drag",
  "ankle pick", "snap down", "snap down front headlock",
  "collar drag", "collar tie clinch", "underhook clinch",
  "hip throw bjj", "o goshi", "harai goshi",
  "foot sweep bjj", "ouchi gari", "kouchi gari",
  "guard pull technique", "strategic guard pull", "guard pull to sweep",
  "standing guard breaks", "standing guard pass", "stand up in guard",
  
  // ═══════════════════════════════════════════════════════════════
  // CONCEPTS & FUNDAMENTALS (25 queries)
  // ═══════════════════════════════════════════════════════════════
  "BJJ fundamentals", "basic BJJ techniques", "beginner jiu jitsu",
  "posture in guard", "breaking posture", "posture control",
  "hip escape", "shrimping technique", "hip movement bjj",
  "bridging in BJJ", "upa technique", "bridge and roll",
  "grips in BJJ", "grip fighting", "breaking grips",
  "base and posture", "maintaining base", "recovery position",
  "weight distribution", "pressure in BJJ", "floating pressure",
  "leverage in BJJ", "mechanical advantage", "using leverage",
  "timing in BJJ", "timing sweeps", "timing submissions",
  "frame and create space", "frames in BJJ", "defensive frames",
  "connection points BJJ", "control principles", "movement concepts",
  
  // ═══════════════════════════════════════════════════════════════
  // INSTRUCTOR-SPECIFIC SEARCHES (45 queries) - ELITE INSTRUCTORS
  // ═══════════════════════════════════════════════════════════════
  "john danaher technique", "john danaher guard passing", "danaher back attack",
  "gordon ryan technique", "gordon ryan instructional", "gordon ryan mount",
  "gordon ryan back attacks", "gordon ryan passing", "gordon ryan pins",
  "lachlan giles leg locks", "lachlan giles technique", "lachlan giles half guard",
  "craig jones darce", "craig jones technique", "craig jones leg lock",
  "roger gracie technique", "roger gracie mount", "roger gracie pressure passing",
  "marcelo garcia butterfly", "marcelo garcia x guard", "marcelo garcia guillotine",
  "bernardo faria technique", "bernardo faria half guard", "bernardo faria pressure",
  "keenan cornelius lapel", "keenan cornelius worm guard", "keenan cornelius technique",
  "andre galvao technique", "andre galvao back take", "andre galvao passing",
  "marcus buchecha almeida", "buchecha passing", "buchecha guard",
  "mikey musumeci technique", "mikey musumeci guard", "mikey berimbolo",
  "ffion davies technique", "ffion davies guard", "ffion davies leg lock",
  "garry tonon leg lock", "garry tonon technique", "garry tonon guillotine",
  "ryan hall technique", "ryan hall triangle", "ryan hall 50/50",
  "neil melanson technique", "neil melanson guillotine", "neil melanson catch wrestling",
  "eddie bravo rubber guard", "10th planet technique", "eddie bravo twister",
  
  // ═══════════════════════════════════════════════════════════════
  // RISING STARS & RECENT CHAMPIONS (30 queries)
  // ═══════════════════════════════════════════════════════════════
  "mica galvao technique", "mica galvao guard", "mica galvao no gi",
  "nicholas meregali technique", "meregali passing", "meregali mount",
  "kaynan duarte technique", "kaynan duarte passing", "kaynan duarte guard",
  "tainan dalpra technique", "tainan dalpra guard", "tainan dalpra passing",
  "ruotolo brothers technique", "kade ruotolo", "tye ruotolo technique",
  "giancarlo bodoni technique", "bodoni leg lock", "bodoni passing",
  "nicky ryan technique", "nicky ryan heel hook", "nicky ryan leg lock",
  "dante leon technique", "dante leon wrestling", "dante leon guillotine",
  "william tackett technique", "tackett leg lock", "tackett guard",
  "tommy langaker technique", "langaker guard", "langaker passing",
  
  // ═══════════════════════════════════════════════════════════════
  // NEWER TECHNIQUES & MODERN POSITIONS (20 queries)
  // ═══════════════════════════════════════════════════════════════
  "k guard bjj 2024", "k guard sweeps", "k guard to leg locks",
  "matrix position bjj", "matrix guard entry", "matrix to back take",
  "bodylock passing system", "bodylock to mount", "bodylock control",
  "buggy choke", "buggy choke technique", "buggy choke setup",
  "loop choke modern", "loop choke nogi", "loop choke standing",
  "truck position bjj", "calf slicer truck", "twister from truck",
  "floating passing", "movement based passing", "reaction based passing",
  "wrestling in modern bjj", "folkstyle for bjj", "mat wrestling bjj",
  
  // ═══════════════════════════════════════════════════════════════
  // PORTUGUESE QUERIES - DISABLED (English-only curation)
  // Re-enable when targeting Brazilian market
  // ═══════════════════════════════════════════════════════════════
  // "jiu jitsu brasileiro tecnica", "passagem de guarda", "raspagem bjj",
  // "guarda fechada ataque", "finalização bjj", "kimura aula",
  // "triângulo jiu jitsu", "armlock bjj", "chave de perna",
  // "guarda de la riva", "guarda aranha", "passagem de guarda pressao",
  // "berimbolo tutorial", "guarda meia", "controle lateral bjj",
];

/**
 * AI Video Content Analyzer
 * Identifies instructor and assesses quality without knowing who uploaded it
 */
export async function analyzeVideoContent(video: {
  title: string;
  description: string;
  channelName: string;
  videoId: string;
}): Promise<{
  isInstructional: boolean;
  instructorName: string | null;
  instructorCredibility: string | null;
  technique: string | null;
  qualityScore: number;
  teachingQuality: string;
  recommended: boolean;
  reasoning: string;
}> {
  try {
    const prompt = `Analyze this BJJ video to determine if it's high-quality instructional content:

**Video Details:**
Title: ${video.title}
Channel: ${video.channelName}
Description: ${video.description.slice(0, 500)}

**Your Analysis Tasks:**

1. **Is this INSTRUCTIONAL content?**
   - Must be teaching a specific technique (not just rolling/sparring footage)
   - Not a competition highlight
   - Not a vlog or lifestyle content
   - Not a product review

2. **Who is the PRIMARY instructor?**
   - Look for names in title, description, channel name
   - Identify black belt instructors
   - Note: They might be teaching on someone else's channel (gym, seminar, guest appearance)
   
3. **What credibility evidence exists?**
   - Competition achievements mentioned?
   - Rank/belt mentioned?
   - Academy affiliation?
   - Known in BJJ community?

4. **What technique is being taught?**
   - Specific technique name (e.g., "Triangle from closed guard")
   - Position/category

5. **Quality Assessment (1-10):**
   - Is instruction clear and step-by-step?
   - Does it show key details?
   - Is production quality decent?
   - Does it address common mistakes?
   - Rate 1-10 where:
     * 9-10 = Elite instruction (Roger Gracie, Marcelo Garcia level)
     * 7-8 = High quality (clear, detailed, helpful)
     * 5-6 = Average (basic instruction)
     * 3-4 = Poor (unclear, missing details)
     * 1-2 = Very poor (confusing, incorrect)

**IMPORTANT:** Be strict. Most BJJ videos are NOT high quality. Only recommend videos with:
- Clear instructor identification
- Evidence of credibility
- Quality score 6.5 or higher
- Actual instructional value

Respond in JSON format:
{
  "isInstructional": boolean,
  "instructorName": "Full Name" or null,
  "instructorCredibility": "Brief evidence" or null,
  "technique": "Specific technique name" or null,
  "qualityScore": 0-10,
  "teachingQuality": "Brief assessment",
  "recommended": boolean,
  "reasoning": "Why you made this decision"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    return analysis;
  } catch (error: any) {
    console.error('[CONTENT ANALYZER] Error analyzing video:', error.message);
    return {
      isInstructional: false,
      instructorName: null,
      instructorCredibility: null,
      technique: null,
      qualityScore: 0,
      teachingQuality: 'Analysis failed',
      recommended: false,
      reasoning: `Error: ${error.message}`
    };
  }
}

import type { CuratorProgressUpdate } from '@shared/curator-types';

/**
 * Content-First Curation Pipeline
 * Search techniques → Analyze content → Match instructors → Save quality videos
 */
export async function runContentFirstCuration(
  maxTechniques: number = 10,
  videosPerTechnique: number = 5,
  onProgress?: (update: CuratorProgressUpdate) => void
): Promise<{
  techniquesSearched: number;
  videosAnalyzed: number;
  videosSaved: number;
  newInstructorsDiscovered: number;
}> {
  console.log(`[CONTENT-FIRST] Starting curation: ${maxTechniques} techniques, ${videosPerTechnique} videos each`);
  
  // Check curation settings
  const [curationConfig] = await db.select()
    .from(videoCurationConfig)
    .limit(1);
  
  // Use default settings if none exist
  const settings = curationConfig || {
    automaticCurationEnabled: true,
    manualReviewEnabled: false,
    qualityThreshold: 7.5,
  };
  
  // If automatic curation is disabled, exit early
  if (!settings.automaticCurationEnabled) {
    console.log('[CONTENT-FIRST] Automatic curation is disabled. Skipping run.');
    return {
      techniquesSearched: 0,
      videosAnalyzed: 0,
      videosSaved: 0,
      newInstructorsDiscovered: 0,
    };
  }
  
  const qualityThreshold = typeof settings.qualityThreshold === 'string' 
    ? parseFloat(settings.qualityThreshold) 
    : settings.qualityThreshold;
  const manualReview = settings.manualReviewEnabled;
  
  console.log(`[CONTENT-FIRST] Settings - Quality Threshold: ${qualityThreshold}/10, Manual Review: ${manualReview ? 'ON' : 'OFF'}`);
  
  // Select random techniques to search
  const selectedTechniques = TECHNIQUE_SEARCHES
    .sort(() => Math.random() - 0.5)
    .slice(0, maxTechniques);
  
  let videosAnalyzed = 0;
  let videosSaved = 0;
  let newInstructorsDiscovered = 0;
  let techniquesProcessed = 0;
  let videosRejectedTooShort = 0; // Track videos rejected for being under 70 seconds
  let videosRejectedAPIError = 0; // Track videos skipped due to YouTube API errors
  
  // ⚠️ MINIMUM VIDEO LENGTH: 70 SECONDS
  const MINIMUM_DURATION_SECONDS = 70;
  
  for (const techniqueQuery of selectedTechniques) {
    try {
      console.log(`[CONTENT-FIRST] Searching: "${techniqueQuery}"`);
      
      // Report progress
      if (onProgress) {
        onProgress({
          techniquesProcessed,
          videosAnalyzed,
          videosSaved,
          newInstructorsDiscovered,
          currentTechnique: techniqueQuery,
        });
      }
      
      // Direct YouTube search (bypass multi-stage analyzer)
      const searchResults = await directYouTubeSearch(techniqueQuery, videosPerTechnique);
      
      for (const result of searchResults) {
        videosAnalyzed++;
        
        // CRITICAL: Check video duration FIRST (reject videos under 70 seconds immediately)
        let videoDetails;
        try {
          videoDetails = await getVideoDetails(result.videoId);
        } catch (error: any) {
          // Distinguish API errors from short videos
          console.log(`⚠️  [API ERROR] Failed to get details for ${result.title.slice(0, 50)}... - ${error.message}`);
          videosRejectedAPIError++;
          continue; // Skip but don't count as "too short"
        }
        
        if (!videoDetails) {
          console.log(`⚠️  [API ERROR] No details returned for ${result.title.slice(0, 50)}...`);
          videosRejectedAPIError++;
          continue;
        }
        
        if (videoDetails.duration < MINIMUM_DURATION_SECONDS) {
          console.log(`❌ [LENGTH FILTER] Rejected: ${result.title.slice(0, 50)}... - Too short (${videoDetails.duration}s < ${MINIMUM_DURATION_SECONDS}s)`);
          videosRejectedTooShort++;
          continue; // Skip this video entirely - don't waste API credits on analysis
        }
        
        console.log(`✅ [LENGTH FILTER] ${result.title.slice(0, 50)}... - ${videoDetails.duration}s (>= ${MINIMUM_DURATION_SECONDS}s)`);
        
        // Analyze video content with AI
        const analysis = await analyzeVideoContent({
          title: result.title,
          description: result.description || '',
          channelName: result.channelTitle,
          videoId: result.videoId
        });
        
        console.log(`[CONTENT-FIRST] ${result.title.slice(0, 50)}... | Quality: ${analysis.qualityScore}/10 | Recommended: ${analysis.recommended}`);
        
        // STAGE 4 QC: Mandatory quality control validation
        let stage4Approved = false;
        let stage4Grade = 'F';
        let stage4Reasoning = '';
        
        if (analysis.recommended && analysis.isInstructional) {
          // Run Stage 4 QC on videos that passed initial screening
          const { runStage4QC } = await import('./multi-stage-analyzer');
          const stage4Result = await runStage4QC(
            analysis.technique || techniqueQuery,
            {
              title: result.title,
              description: result.description || '',
              videoId: result.videoId,
              channelTitle: result.channelTitle
            }
          );
          
          stage4Approved = stage4Result.approved;
          stage4Grade = stage4Result.qualityGrade;
          stage4Reasoning = stage4Result.reasoning;
          
          console.log(`[STAGE 4 QC] ${result.title.slice(0, 40)}... | Grade: ${stage4Grade} | Approved: ${stage4Approved}`);
        }
        
        // Log video analysis (whether approved or rejected)
        // Ensure approved is always boolean (never null) to satisfy DB constraint
        const approved = !!(analysis.recommended && analysis.isInstructional && stage4Approved);
        await db.insert(videoAnalysisLog).values({
          youtubeId: result.videoId,
          youtubeUrl: `https://youtube.com/watch?v=${result.videoId}`,
          videoTitle: result.title,
          searchQuery: techniqueQuery,
          approved,
          techniqueName: analysis.technique || 'Unknown',
          instructorName: analysis.instructorName,
          rejectionReason: approved ? null : (stage4Reasoning || analysis.reasoning),
          finalScore: analysis.qualityScore != null ? analysis.qualityScore.toString() : '0'
        }).catch(err => console.error('[ACTIVITY] Failed to log video analysis:', err));
        
        if (!approved) {
          continue;
        }
        
        // Try to match instructor in database
        let instructor = null;
        if (analysis.instructorName) {
          const [matchedInstructor] = await db
            .select()
            .from(instructorCredibility)
            .where(sql`LOWER(name) = LOWER(${analysis.instructorName})`)
            .limit(1);
          
          instructor = matchedInstructor;
          
          // If unknown instructor but high quality, consider adding them
          if (!instructor && analysis.qualityScore >= 7.5 && analysis.instructorCredibility) {
            console.log(`[CONTENT-FIRST] New instructor discovered: ${analysis.instructorName}`);
            
            const [newInstructor] = await db
              .insert(instructorCredibility)
              .values({
                name: analysis.instructorName,
                tier: 2, // Start at Tier 2
                qualityThreshold: "7.5",
                achievements: analysis.instructorCredibility ? [analysis.instructorCredibility] : [],
                priorityMode: 'auto',
                recommendationPriority: 0,
                isActive: true,
              })
              .returning();
            
            instructor = newInstructor;
            newInstructorsDiscovered++;
          }
        }
        
        // Apply quality threshold from curation settings
        if (qualityThreshold && analysis.qualityScore < qualityThreshold) {
          console.log(`[CONTENT-FIRST] Below threshold (${qualityThreshold}): ${result.title.slice(0, 40)}`);
          continue;
        }
        
        // ═══════════════════════════════════════════════════════════════
        // LANGUAGE FILTER: English-only curation (Option A)
        // Reject non-English videos to maintain library consistency
        // ═══════════════════════════════════════════════════════════════
        const videoText = `${result.title} ${result.description || ''} ${result.channelTitle}`;
        const detectedLanguages = detectVideoLanguage(videoText);
        const isEnglish = detectedLanguages.includes('en');
        
        if (!isEnglish) {
          console.log(`❌ [LANGUAGE FILTER] Rejected: ${result.title.slice(0, 40)}... - Language: ${detectedLanguages.join(', ')} (non-English)`);
          continue;
        }
        
        // Check if video already exists in either library or review queue
        const [existing] = await db
          .select()
          .from(aiVideoKnowledge)
          .where(eq(aiVideoKnowledge.youtubeId, result.videoId))
          .limit(1);
        
        const [inQueue] = await db
          .select()
          .from(videoReviewQueue)
          .where(eq(videoReviewQueue.videoUrl, `https://www.youtube.com/watch?v=${result.videoId}`))
          .limit(1);
        
        if (existing || inQueue) {
          console.log(`[CONTENT-FIRST] Already in ${existing ? 'library' : 'review queue'}: ${result.title.slice(0, 40)}`);
          continue;
        }
        
        try {
          if (manualReview) {
            // Add to review queue for manual approval
            await db.insert(videoReviewQueue).values({
              videoUrl: `https://www.youtube.com/watch?v=${result.videoId}`,
              title: result.title,
              instructor: analysis.instructorName,
              qualityScore: analysis.qualityScore != null ? analysis.qualityScore.toString() : '0',
              analysisData: {
                technique: analysis.technique || 'Unknown technique',
                reasoning: analysis.reasoning,
                teachingQuality: analysis.teachingQuality,
                instructorCredibility: analysis.instructorCredibility,
                channelName: result.channelTitle,
              },
              status: 'pending',
            });
            console.log(`[CONTENT-FIRST] 📋 Added to review queue: ${result.title.slice(0, 50)}...`);
          } else {
            // Auto-approve and add directly to library
            const [insertedVideo] = await db.insert(aiVideoKnowledge).values({
              youtubeId: result.videoId,
              videoUrl: `https://www.youtube.com/watch?v=${result.videoId}`,
              title: result.title,
              techniqueName: analysis.technique || 'Unknown technique',
              instructorName: analysis.instructorName,
              channelName: result.channelTitle,
              uploadDate: new Date(result.publishedAt),
              thumbnailUrl: result.thumbnailUrl,
              beltLevel: ['all'], // Array format
              qualityScore: analysis.qualityScore != null ? analysis.qualityScore.toString() : '0',
              viewCount: 0,
              duration: videoDetails ? videoDetails.duration : null, // Store duration in seconds
              keyDetails: {
                reasoning: analysis.reasoning,
                teachingQuality: analysis.teachingQuality,
                instructorCredibility: analysis.instructorCredibility,
              },
              status: 'active',
              autoPublished: true,
              tier: 'tier_2',
            }).returning();
            
            // AUTO-QUEUE FOR GEMINI PROCESSING
            if (insertedVideo?.id) {
              await db.insert(videoWatchStatus).values({
                videoId: insertedVideo.id,
                hasTranscript: false,
                processed: false,
                errorMessage: null
              }).onConflictDoNothing();
              console.log(`[CONTENT-FIRST] 🤖 Auto-queued for Gemini: ID ${insertedVideo.id}`);
            }
            console.log(`[CONTENT-FIRST] ✅ Auto-saved: ${result.title.slice(0, 50)}...`);
          }
          
          videosSaved++;
        } catch (saveError: any) {
          console.error(`[CONTENT-FIRST] Error saving video:`, saveError.message);
        }
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Increment techniques processed
      techniquesProcessed++;
      
      // Report progress after technique completion
      if (onProgress) {
        onProgress({
          techniquesProcessed,
          videosAnalyzed,
          videosSaved,
          newInstructorsDiscovered,
          currentTechnique: null,
        });
      }
      
    } catch (error: any) {
      console.error(`[CONTENT-FIRST] Error processing "${techniqueQuery}":`, error.message);
      techniquesProcessed++;
      
      // Report progress even on error
      if (onProgress) {
        onProgress({
          techniquesProcessed,
          videosAnalyzed,
          videosSaved,
          newInstructorsDiscovered,
          currentTechnique: null,
        });
      }
    }
  }
  
  // Calculate rejection breakdown
  const videosActuallyAnalyzedByAI = videosAnalyzed - videosRejectedTooShort - videosRejectedAPIError;
  const videosRejectedLowQuality = videosActuallyAnalyzedByAI - videosSaved;
  
  const result = {
    techniquesSearched: selectedTechniques.length,
    videosAnalyzed,
    videosSaved,
    newInstructorsDiscovered,
    videosRejectedTooShort,
    videosRejectedAPIError
  };
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('[CONTENT-FIRST] CURATION RUN COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Techniques searched: ${result.techniquesSearched}`);
  console.log(`Videos found: ${result.videosAnalyzed}`);
  console.log(`  ⚠️  Rejected (API error): ${videosRejectedAPIError}`);
  console.log(`  ❌ Rejected (too short <70s): ${videosRejectedTooShort}`);
  console.log(`  ❌ Rejected (low quality): ${videosRejectedLowQuality}`);
  console.log(`  ✅ Accepted: ${result.videosSaved}`);
  console.log(`Acceptance rate: ${videosActuallyAnalyzedByAI > 0 ? ((videosSaved / videosActuallyAnalyzedByAI) * 100).toFixed(1) : '0.0'}%`);
  console.log(`New instructors: ${result.newInstructorsDiscovered}`);
  console.log('═══════════════════════════════════════════════════════════════');
  return result;
}
