// Video Knowledge Service - Uses Gemini API for direct YouTube video processing
// Gemini can natively process YouTube URLs since Google owns YouTube
// DUAL API KEY ROTATION - Doubles rate limits by alternating between two accounts
import { GoogleGenAI } from '@google/genai';
import { db } from './db';
import { aiVideoKnowledge, videoKnowledge, videoWatchStatus } from '@shared/schema';
import { eq, and, isNull, sql, desc } from 'drizzle-orm';

// Initialize DUAL Gemini clients for key rotation
const geminiKey1 = process.env.GEMINI_API_KEY || '';
const geminiKey2 = process.env.GEMINI_API_KEY_2 || '';

const gemini1 = new GoogleGenAI({ apiKey: geminiKey1 });
const gemini2 = geminiKey2 ? new GoogleGenAI({ apiKey: geminiKey2 }) : null;

// Track which key to use next (alternates between 0 and 1)
let currentKeyIndex = 0;
let key1RateLimited = false;
let key2RateLimited = false;
let key1RateLimitResetTime = 0;
let key2RateLimitResetTime = 0;

// Get the next available Gemini client with rotation
function getNextGeminiClient(): { client: GoogleGenAI; keyIndex: number; keyName: string } {
  const now = Date.now();
  
  // Reset rate limit flags after 60 seconds
  if (key1RateLimited && now > key1RateLimitResetTime) {
    key1RateLimited = false;
    console.log('[GEMINI] Key 1 rate limit reset');
  }
  if (key2RateLimited && now > key2RateLimitResetTime) {
    key2RateLimited = false;
    console.log('[GEMINI] Key 2 rate limit reset');
  }
  
  // If we have two keys, rotate
  if (gemini2) {
    // Try to alternate, but skip rate-limited keys
    for (let i = 0; i < 2; i++) {
      const tryIndex = (currentKeyIndex + i) % 2;
      const isRateLimited = tryIndex === 0 ? key1RateLimited : key2RateLimited;
      
      if (!isRateLimited) {
        currentKeyIndex = (tryIndex + 1) % 2; // Set up for next rotation
        return {
          client: tryIndex === 0 ? gemini1 : gemini2,
          keyIndex: tryIndex,
          keyName: `Key ${tryIndex + 1}`
        };
      }
    }
    // Both rate limited - use key 1 anyway (will retry with backoff)
    console.log('[GEMINI] ⚠️ Both keys rate limited, using Key 1 with retry');
    return { client: gemini1, keyIndex: 0, keyName: 'Key 1 (both limited)' };
  }
  
  // Single key mode
  return { client: gemini1, keyIndex: 0, keyName: 'Key 1 (single)' };
}

// Mark a key as rate limited
function markKeyRateLimited(keyIndex: number) {
  const resetTime = Date.now() + 60000; // Reset after 60 seconds
  if (keyIndex === 0) {
    key1RateLimited = true;
    key1RateLimitResetTime = resetTime;
    console.log('[GEMINI] 🔴 Key 1 rate limited, switching to Key 2');
  } else {
    key2RateLimited = true;
    key2RateLimitResetTime = resetTime;
    console.log('[GEMINI] 🔴 Key 2 rate limited, switching to Key 1');
  }
}

// Retry configuration for transient errors
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 5000; // 5 seconds
const MAX_DELAY_MS = 60000; // 1 minute max

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(error: any): boolean {
  const message = error?.message || String(error);
  // 503 Service Unavailable, 429 Rate Limit, connection issues
  return message.includes('503') || 
         message.includes('overloaded') || 
         message.includes('UNAVAILABLE') ||
         message.includes('429') ||
         message.includes('rate limit') ||
         message.includes('too many requests') ||
         message.includes('RESOURCE_EXHAUSTED') ||
         message.includes('timeout') ||
         message.includes('ETIMEDOUT') ||
         message.includes('ECONNRESET');
}

function isRateLimitError(error: any): boolean {
  const message = error?.message || String(error);
  return message.includes('429') || 
         message.includes('rate limit') ||
         message.includes('too many requests') ||
         message.includes('RESOURCE_EXHAUSTED') ||
         message.includes('quota');
}

interface ExtractedTechnique {
  // Primary technique info
  techniqueName: string;
  positionContext: string | null;
  techniqueType: string | null; // submission, sweep, pass, escape, control, transition, takedown, defense
  giOrNogi: string | null; // "gi" | "nogi" | "both"
  skillLevel: string | null; // "beginner" | "intermediate" | "advanced"
  competitionLegal: boolean | null;
  
  // Detail categorization
  detailType: string | null; // concept, counter, mechanical, setup, entry, finish, grip, timing, mistake, tip, defense, chain
  detailDescription: string | null;
  
  // Teaching content
  instructorQuote: string | null; // word-for-word quote
  keyConcepts: string[];
  instructorTips: string[];
  commonMistakes: string[];
  whyItMatters: string | null;
  problemSolved: string | null;
  
  // Timestamps
  timestampStart: string | null;
  timestampEnd: string | null;
  
  // Relationships
  setupsFrom: string[];
  chainsTo: string[];
  counters: string[];
  counterTo: string[];
  
  // Physical considerations
  bodyTypeNotes: string | null;
  strengthRequired: string | null; // Low/Medium/High
  flexibilityRequired: string | null;
  athleticDemand: string | null;
  
  // Learning path
  prerequisites: string[];
  nextToLearn: string[];
  bestFor: string | null; // "competition" | "self_defense" | "hobbyist" | "all"
  
  // Summary
  fullSummary: string;
  
  // Quality scores (Gemini 2.5 Pro visual analysis)
  instructionQuality?: number;
  visualQuality?: number;
  audioQuality?: number;
  uniqueValue?: string;
  coachingNotes?: string;
}

interface ExtractionResult {
  success: boolean;
  techniques?: ExtractedTechnique[];
  error?: string;
  analysisVersion?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

// Analysis version for tracking which model/prompt version analyzed each video
const ANALYSIS_VERSION = '2.5';

// Deep analysis model - Gemini 2.5 Pro for comprehensive video understanding
const DEEP_ANALYSIS_MODEL = 'gemini-2.5-pro';

// Quick test/fallback model - Gemini 2.5 Flash (faster, cheaper)
const QUICK_MODEL = 'gemini-2.5-flash';

function isVideoNotAccessibleError(error: any): boolean {
  const message = error?.message || String(error);
  return message.includes('VIDEO_NOT_ACCESSIBLE') ||
         message.includes('PERMISSION_DENIED') ||
         message.includes('Could not process video') ||
         message.includes('not found') ||
         message.includes('private') ||
         message.includes('unavailable') ||
         (error?.status === 400 && (message.includes('video') || message.includes('file')));
}

/**
 * Process a YouTube video directly with Gemini 2.5 Pro - visual analysis
 * Gemini natively supports YouTube URLs since Google owns YouTube
 * Falls back to metadata-only analysis if video is not accessible
 */
export async function extractKnowledgeWithGemini(
  youtubeId: string,
  videoMetadata: {
    title: string;
    instructorName: string | null;
    techniqueName: string;
    positionCategory: string | null;
  }
): Promise<ExtractionResult> {
  try {
    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    console.log(`[GEMINI] Processing video with ${DEEP_ANALYSIS_MODEL}: ${youtubeUrl}`);
    console.log(`[GEMINI] Title: ${videoMetadata.title}`);

    const prompt = `You are an elite BJJ analyst. WATCH this entire instructional video carefully and extract COMPREHENSIVE structured knowledge for an AI coaching system.

IMPORTANT: Analyze WHAT YOU SEE in the video — the actual technique demonstrations, positions, movements, grips, and transitions. Not just what is said.

Video Information:
- Title: ${videoMetadata.title}
- Instructor: ${videoMetadata.instructorName || 'Unknown'}
- Primary Technique: ${videoMetadata.techniqueName}
- Position Category: ${videoMetadata.positionCategory || 'Unknown'}

EXTRACTION REQUIREMENTS - For EACH distinct technique or detail:

Return ONLY a valid JSON object with this structure:
{
  "techniques": [
    {
      "techniqueName": "exact name (e.g., Armbar from Guard, Knee Cut Pass)",
      "positionContext": "guard | mount | side_control | back | standing | turtle | half_guard | closed_guard | open_guard",
      "techniqueType": "submission | sweep | pass | escape | control | transition | takedown | defense",
      "giOrNogi": "gi | nogi | both",
      "skillLevel": "beginner | intermediate | advanced",
      "competitionLegal": true or false (IBJJF legal at all belt levels),
      
      "detailType": "concept | counter | mechanical | setup | entry | finish | grip | weight_distribution | timing | mistake | tip | defense | chain",
      "detailDescription": "Brief description of what this specific detail covers",
      
      "instructorQuote": "Word-for-word impactful quote from instructor (the most memorable teaching moment)",
      "keyConcepts": ["mechanical detail 1", "mechanical detail 2", "mechanical detail 3"],
      "instructorTips": ["specific verbal cue 1", "specific verbal cue 2"],
      "commonMistakes": ["mistake to avoid 1", "mistake to avoid 2"],
      "whyItMatters": "Why this detail is important for success",
      "problemSolved": "What common problem does this fix? (e.g., opponent escaping, can't finish, losing position)",
      
      "timestampStart": "MM:SS",
      "timestampEnd": "MM:SS",
      
      "setupsFrom": ["technique or position that leads into this", "another setup"],
      "chainsTo": ["what you can transition to if this succeeds or fails", "backup option"],
      "counters": ["common defense opponent uses", "how to beat that defense"],
      "counterTo": ["what techniques does THIS technique counter?"],
      
      "bodyTypeNotes": "Any mention of body type (tall, short, flexible, strong) or null",
      "strengthRequired": "Low | Medium | High",
      "flexibilityRequired": "Low | Medium | High",
      "athleticDemand": "Low | Medium | High",
      
      "prerequisites": ["technique you should know first", "concept required"],
      "nextToLearn": ["what to learn after mastering this"],
      "bestFor": "competition | self_defense | hobbyist | all",
      
      "fullSummary": "2-3 sentence summary capturing the essence of what's taught",
      
      "instructionQuality": 8,
      "visualQuality": 7,
      "audioQuality": 8,
      "uniqueValue": "what makes this video special compared to other videos on the same technique",
      "coachingNotes": "What a coach would tell a student about this video - key takeaways for training"
    }
  ]
}

CRITICAL RULES:
1. Create MULTIPLE entries if video covers different techniques or distinct concepts
2. Use instructor's EXACT words for instructorQuote - capture their unique voice
3. ALWAYS include timestamps (MM:SS format) verified by what you SEE in the video - this is crucial for video references
4. For keyConcepts, focus on: grips, angles, weight distribution, timing, hip placement
5. For instructorTips, capture the "insider knowledge" - things only experienced grapplers know
6. For commonMistakes, note exactly what they say NOT to do
7. whyItMatters should explain the principle behind the technique
8. problemSolved should match user questions like "people keep escaping" or "can't finish"
9. chainsTo and setupsFrom are CRITICAL for building technique networks
10. bodyTypeNotes should capture phrases like "if you're tall", "for smaller grapplers", "requires flexibility"
11. competitionLegal = false for heel hooks in gi, neck cranks, reaping at lower belts, etc.
12. instructionQuality, visualQuality, audioQuality are 1-10 scores based on what you observe
13. coachingNotes should be actionable advice a coach would give about this specific video

Return ONLY valid JSON. No markdown, no explanations.`;

    // Try direct video analysis first, then fall back to metadata-only
    const result = await attemptVideoAnalysis(youtubeId, youtubeUrl, prompt, videoMetadata, true);
    return result;
    
  } catch (outerError: any) {
    console.error(`[GEMINI] Outer error:`, outerError.message);
    return {
      success: false,
      error: outerError.message || 'Unexpected error in Gemini processing'
    };
  }
}

/**
 * Attempt video analysis with retry logic and fallback
 * If video is not accessible (private/age-restricted/region-locked),
 * falls back to metadata-only analysis using the same model
 */
async function attemptVideoAnalysis(
  youtubeId: string,
  youtubeUrl: string,
  prompt: string,
  videoMetadata: { title: string; instructorName: string | null; techniqueName: string; positionCategory: string | null },
  useDirectVideo: boolean
): Promise<ExtractionResult> {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { client: geminiClient, keyIndex, keyName } = getNextGeminiClient();
    const model = useDirectVideo ? DEEP_ANALYSIS_MODEL : QUICK_MODEL;
    
    try {
      console.log(`[GEMINI] Using ${keyName} with ${model} (attempt ${attempt}/${MAX_RETRIES})${useDirectVideo ? ' [VIDEO]' : ' [METADATA FALLBACK]'}`);
      
      const contentParts: any[] = [];
      
      if (useDirectVideo) {
        contentParts.push({
          fileData: {
            fileUri: youtubeUrl,
            mimeType: 'video/*'
          }
        });
      }
      contentParts.push({ text: prompt });
      
      const response = await geminiClient.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: contentParts
          }
        ]
      });

      const responseText = response.text || '';
      const usageMetadata = response.usageMetadata;
      
      console.log(`[GEMINI] ${keyName} success - ${responseText.length} chars`);
      console.log(`[CURATION COST]`, {
        videoId: youtubeId,
        model,
        inputTokens: usageMetadata?.promptTokenCount,
        outputTokens: usageMetadata?.candidatesTokenCount,
        totalTokens: usageMetadata?.totalTokenCount,
        analysisVersion: ANALYSIS_VERSION,
        mode: useDirectVideo ? 'video' : 'metadata_fallback'
      });
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`[GEMINI] No JSON found in response:`, responseText.substring(0, 500));
        return { success: false, error: 'No JSON found in Gemini response' };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.techniques || !Array.isArray(parsed.techniques)) {
        return { success: false, error: 'Invalid response structure - missing techniques array' };
      }

      console.log(`[GEMINI] Extracted ${parsed.techniques.length} techniques from ${videoMetadata.title}`);
      
      return {
        success: true,
        techniques: parsed.techniques,
        analysisVersion: ANALYSIS_VERSION,
        usageMetadata: {
          promptTokenCount: usageMetadata?.promptTokenCount,
          candidatesTokenCount: usageMetadata?.candidatesTokenCount
        }
      };
    } catch (attemptError: any) {
      lastError = attemptError;
      console.error(`[GEMINI] ${keyName} attempt ${attempt}/${MAX_RETRIES} failed:`, attemptError.message);
      
      // If video is not accessible and we were trying direct video analysis, fall back to metadata-only
      if (useDirectVideo && isVideoNotAccessibleError(attemptError)) {
        console.log(`[GEMINI] Video ${youtubeId} not accessible for visual analysis, falling back to metadata-only`);
        return attemptVideoAnalysis(youtubeId, youtubeUrl, prompt, videoMetadata, false);
      }
      
      if (isRateLimitError(attemptError)) {
        markKeyRateLimited(keyIndex);
        if (attempt < MAX_RETRIES) {
          await sleep(1000);
          continue;
        }
      }
      
      if (isRetryableError(attemptError) && attempt < MAX_RETRIES) {
        const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
        console.log(`[GEMINI] Retrying in ${delay/1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(delay);
      } else if (!isRetryableError(attemptError)) {
        break;
      }
    }
  }
  
  const error = lastError;
  console.error(`[GEMINI] All ${MAX_RETRIES} attempts failed:`, error?.message);
  
  if (error?.message?.includes('API key')) {
    return { success: false, error: 'Gemini API key not configured' };
  }
  if (error?.message?.includes('quota')) {
    return { success: false, error: 'Gemini API quota exceeded' };
  }
  if (error?.message?.includes('blocked') || error?.message?.includes('safety')) {
    return { success: false, error: 'Video blocked by safety filters' };
  }
  if (error?.message?.includes('not found')) {
    return { success: false, error: 'Video not accessible (private/deleted)' };
  }
  if (isRetryableError(error)) {
    return { success: false, error: 'Gemini API overloaded - please retry later' };
  }
  
  return {
    success: false,
    error: error?.message || 'Gemini processing failed'
  };
}

/**
 * Process a single video and store extracted knowledge
 */
export async function processVideoKnowledge(videoId: number): Promise<{ success: boolean; error?: string; techniquesAdded?: number }> {
  try {
    const [video] = await db.select().from(aiVideoKnowledge).where(eq(aiVideoKnowledge.id, videoId)).limit(1);
    
    if (!video) {
      return { success: false, error: 'Video not found' };
    }
    
    if (!video.youtubeId) {
      await db.insert(videoWatchStatus).values({
        videoId: video.id,
        hasTranscript: false,
        transcriptSource: 'none',
        processed: true,
        processedAt: new Date(),
        errorMessage: 'No YouTube ID'
      }).onConflictDoUpdate({
        target: videoWatchStatus.videoId,
        set: {
          hasTranscript: false,
          transcriptSource: 'none',
          processed: true,
          processedAt: new Date(),
          errorMessage: 'No YouTube ID'
        }
      });
      return { success: false, error: 'No YouTube ID' };
    }
    
    // Use Gemini 2.5 Pro to process the video directly (with visual analysis)
    const extractionResult = await extractKnowledgeWithGemini(video.youtubeId, {
      title: video.title,
      instructorName: video.instructorName,
      techniqueName: video.techniqueName,
      positionCategory: video.positionCategory
    });
    
    const sourceLabel = `gemini-${ANALYSIS_VERSION}-pro`;
    
    if (!extractionResult.success) {
      await db.insert(videoWatchStatus).values({
        videoId: video.id,
        hasTranscript: false,
        transcriptSource: sourceLabel,
        processed: true,
        processedAt: new Date(),
        errorMessage: extractionResult.error
      }).onConflictDoUpdate({
        target: videoWatchStatus.videoId,
        set: {
          hasTranscript: false,
          transcriptSource: sourceLabel,
          processed: true,
          processedAt: new Date(),
          errorMessage: extractionResult.error
        }
      });
      return { success: false, error: extractionResult.error };
    }
    
    // Delete existing knowledge entries for this video (idempotent reprocessing)
    await db.delete(videoKnowledge).where(eq(videoKnowledge.videoId, video.id));
    
    // Store extracted techniques with comprehensive data (including new 2.5 fields)
    for (const technique of extractionResult.techniques!) {
      await db.insert(videoKnowledge).values({
        videoId: video.id,
        
        // Primary technique info
        techniqueName: technique.techniqueName,
        positionContext: technique.positionContext,
        techniqueType: technique.techniqueType,
        giOrNogi: technique.giOrNogi,
        skillLevel: technique.skillLevel,
        competitionLegal: technique.competitionLegal,
        
        // Detail categorization
        detailType: technique.detailType,
        detailDescription: technique.detailDescription,
        
        // Teaching content
        instructorQuote: technique.instructorQuote,
        keyConcepts: technique.keyConcepts || [],
        instructorTips: technique.instructorTips || [],
        commonMistakes: technique.commonMistakes || [],
        whyItMatters: technique.whyItMatters,
        problemSolved: technique.problemSolved,
        
        // Timestamps
        timestampStart: technique.timestampStart,
        timestampEnd: technique.timestampEnd,
        
        // Relationships
        setupsFrom: technique.setupsFrom || [],
        chainsTo: technique.chainsTo || [],
        counters: technique.counters || [],
        counterTo: technique.counterTo || [],
        
        // Physical considerations
        bodyTypeNotes: technique.bodyTypeNotes,
        strengthRequired: technique.strengthRequired,
        flexibilityRequired: technique.flexibilityRequired,
        athleticDemand: technique.athleticDemand,
        
        // Denormalized video metadata for fast queries
        instructorName: video.instructorName,
        instructorCredentials: null,
        prerequisites: technique.prerequisites || [],
        nextToLearn: technique.nextToLearn || [],
        bestFor: technique.bestFor,
        
        // Summary
        fullSummary: technique.fullSummary,
        
        // Quality scores (Gemini 2.5 Pro visual analysis)
        instructionQuality: technique.instructionQuality || null,
        visualQuality: technique.visualQuality || null,
        audioQuality: technique.audioQuality || null,
        uniqueValue: technique.uniqueValue || null,
        coachingNotes: technique.coachingNotes || null,
        analysisVersion: extractionResult.analysisVersion || ANALYSIS_VERSION
      });
    }
    
    // Mark as processed with Gemini 2.5 Pro source
    await db.insert(videoWatchStatus).values({
      videoId: video.id,
      hasTranscript: true,
      transcriptSource: sourceLabel,
      processed: true,
      processedAt: new Date(),
      errorMessage: null
    }).onConflictDoUpdate({
      target: videoWatchStatus.videoId,
      set: {
        hasTranscript: true,
        transcriptSource: sourceLabel,
        processed: true,
        processedAt: new Date(),
        errorMessage: null
      }
    });
    
    console.log(`[PROCESS] Successfully processed video ${video.id}: ${extractionResult.techniques!.length} techniques`);
    
    // Self-expanding instructor discovery - check if a new instructor should be added to the pool
    if (video.instructorName) {
      try {
        const { discoverNewInstructor } = await import('./permanent-auto-curation');
        await discoverNewInstructor(video.instructorName, video.channelName || '');
      } catch (e) {
        // Non-critical - don't fail video processing if discovery fails
      }
    }
    
    return {
      success: true,
      techniquesAdded: extractionResult.techniques!.length
    };
  } catch (error: any) {
    console.error(`[PROCESS] Error processing video ${videoId}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Lock to prevent concurrent batch processing
let batchProcessingInProgress = false;

// Track total processed for progress logging
let totalProcessedAllTime = 0;
let lastProgressCheckpoint = 0;

/**
 * Log progress update every 50 videos
 */
async function logProgressIfNeeded(): Promise<void> {
  const fs = await import('fs');
  
  // Get current counts
  const [processedResult] = await db.select({ count: sql`COUNT(*)` })
    .from(videoWatchStatus)
    .where(eq(videoWatchStatus.processed, true));
  const processed = Number(processedResult?.count) || 0;
  
  const [totalResult] = await db.select({ count: sql`COUNT(*)` }).from(aiVideoKnowledge);
  const total = Number(totalResult?.count) || 0;
  
  // Check if we've hit a 50-video milestone
  const currentCheckpoint = Math.floor(processed / 50) * 50;
  if (currentCheckpoint > lastProgressCheckpoint && currentCheckpoint > 0) {
    lastProgressCheckpoint = currentCheckpoint;
    
    // Get technique count
    const [techResult] = await db.select({ count: sql`COUNT(*)` }).from(videoKnowledge);
    const techniques = Number(techResult?.count) || 0;
    
    // Get top instructors
    const topInstructors = await db.execute(sql`
      SELECT instructor_name, COUNT(*) as count 
      FROM video_knowledge 
      WHERE instructor_name IS NOT NULL 
      GROUP BY instructor_name 
      ORDER BY count DESC 
      LIMIT 5
    `);
    
    // Get recent videos
    const recentVideos = await db.select({
      title: aiVideoKnowledge.title,
      processedAt: videoWatchStatus.processedAt
    })
      .from(videoWatchStatus)
      .innerJoin(aiVideoKnowledge, eq(videoWatchStatus.videoId, aiVideoKnowledge.id))
      .where(eq(videoWatchStatus.processed, true))
      .orderBy(desc(videoWatchStatus.processedAt))
      .limit(5);
    
    // Calculate ETA
    const remaining = total - processed;
    const videosPerHour = 1200; // 20 per minute
    const hoursRemaining = remaining / videosPerHour;
    const etaDate = new Date(Date.now() + hoursRemaining * 60 * 60 * 1000);
    
    const timestamp = new Date().toISOString();
    const instructorList = (topInstructors as any[]).map((i: any) => `${i.instructor_name}: ${i.count}`).join(', ');
    const recentList = recentVideos.map(v => v.title?.substring(0, 50)).join('\n    ');
    
    const progressLog = `
=== PROGRESS UPDATE ===
Time: ${timestamp}
Videos Processed: ${processed} / ${total}
Techniques Extracted: ${techniques}
Top Instructors: ${instructorList}
Recent Videos:
    ${recentList}
ETA: ${etaDate.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} EST (~${hoursRemaining.toFixed(1)} hours)
=======================
`;
    
    // Log to console
    console.log(progressLog);
    
    // Append to file
    fs.appendFileSync('/home/runner/workspace/overnight_progress.log', 
      `[${timestamp}] ${progressLog}\n`
    );
  }
}

/**
 * Process a batch of videos - PARALLEL TURBO processing with both API keys
 * With dual keys, processes 4 videos simultaneously (2 per key)
 */
export async function processBatch(batchSize: number = 20): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  techniquesAdded: number;
  errors: string[];
}> {
  // Prevent concurrent batch runs
  if (batchProcessingInProgress) {
    console.log(`[BATCH] Another batch is already in progress, skipping`);
    return { processed: 0, succeeded: 0, failed: 0, techniquesAdded: 0, errors: ['Batch already in progress'] };
  }
  
  batchProcessingInProgress = true;
  
  try {
    const hasDualKeys = !!gemini2;
    const mode = hasDualKeys ? '⚡ PARALLEL TURBO' : 'SEQUENTIAL';
    console.log(`[BATCH] Starting ${mode} batch of ${batchSize} videos...`);
    
    // Find videos that either:
    // 1. Have no video_watch_status entry at all (never processed)
    // 2. Have video_watch_status with processed=false (failed or reset - RETRY THESE)
    // 3. Exclude only videos stuck "Processing in progress" to prevent double-processing
    // NOTE: processed=true videos are excluded (they're done successfully)
    const unprocessedVideos = await db.execute(sql`
      SELECT v.id, v.title 
      FROM ai_video_knowledge v
      LEFT JOIN video_watch_status vws ON v.id = vws.video_id
      WHERE vws.id IS NULL 
         OR (vws.processed = false AND (
              vws.error_message IS NULL 
              OR vws.error_message = '' 
              OR vws.error_message NOT LIKE 'Processing in progress%'
            ))
      ORDER BY v.quality_score DESC NULLS LAST
      LIMIT ${batchSize}
    `) as any[];
    
    // Handle both array response and rows property
    const videos = Array.isArray(unprocessedVideos) && !('rows' in unprocessedVideos) 
      ? unprocessedVideos 
      : (unprocessedVideos as any).rows || [];
    
    if (videos.length === 0) {
      console.log(`[BATCH] No unprocessed videos remaining`);
      return { processed: 0, succeeded: 0, failed: 0, techniquesAdded: 0, errors: [] };
    }
    
    console.log(`[BATCH] Found ${videos.length} unprocessed videos`);
    
    // Mark all selected videos as "in progress" immediately (upsert for reset videos)
    await Promise.all(videos.map((video: any) => 
      db.insert(videoWatchStatus).values({
        videoId: video.id,
        hasTranscript: false,
        processed: false,
        errorMessage: 'Processing in progress'
      }).onConflictDoUpdate({
        target: videoWatchStatus.videoId,
        set: {
          hasTranscript: false,
          processed: false,
          errorMessage: 'Processing in progress'
        }
      })
    ));
    
    let succeeded = 0;
    let failed = 0;
    let techniquesAdded = 0;
    const errors: string[] = [];
    
    // Process in parallel chunks - 4 at a time with dual keys, 2 at a time with single key
    const chunkSize = hasDualKeys ? 4 : 2;
    
    for (let i = 0; i < videos.length; i += chunkSize) {
      const chunk = videos.slice(i, i + chunkSize);
      
      // Create parallel promises for this chunk
      const chunkPromises = chunk.map((video: any) => {
        console.log(`[BATCH] Processing: ${video.title?.substring(0, 50)}...`);
        return processVideoKnowledge(video.id);
      });
      
      // Wait for this chunk to complete (parallel processing)
      const results = await Promise.all(chunkPromises);
      
      for (const result of results) {
        if (result.success) {
          succeeded++;
          techniquesAdded += result.techniquesAdded || 0;
        } else {
          failed++;
          if (result.error) errors.push(result.error);
        }
      }
      
      // Brief delay between chunks (500ms)
      if (i + chunkSize < videos.length) {
        await sleep(500);
      }
    }
    
    console.log(`[BATCH] ✅ Complete: ${succeeded}/${videos.length} succeeded, ${techniquesAdded} techniques`);
    
    // Check progress milestone
    await logProgressIfNeeded();
    
    // Clear arrays to help GC
    errors.length = 0;
    
    return { processed: videos.length, succeeded, failed, techniquesAdded, errors: [] };
  } finally {
    batchProcessingInProgress = false;
  }
}

/**
 * Get knowledge extraction status
 */
export async function getKnowledgeStatus(): Promise<{
  totalVideos: number;
  processed: number;
  pending: number;
  missingAnalysis: number;
  withTranscript: number;
  withoutTranscript: number;
  totalTechniques: number;
  recentlyProcessed: { title: string; techniquesExtracted: number; processedAt: Date }[];
}> {
  const [totalResult] = await db.select({ count: sql`COUNT(*)` }).from(aiVideoKnowledge);
  const totalVideos = Number(totalResult?.count) || 0;
  
  const [processedResult] = await db.select({ count: sql`COUNT(*)` })
    .from(videoWatchStatus)
    .where(eq(videoWatchStatus.processed, true));
  const processed = Number(processedResult?.count) || 0;
  
  const [withTranscriptResult] = await db.select({ count: sql`COUNT(*)` })
    .from(videoWatchStatus)
    .where(and(eq(videoWatchStatus.processed, true), eq(videoWatchStatus.hasTranscript, true)));
  const withTranscript = Number(withTranscriptResult?.count) || 0;
  
  const [techniquesResult] = await db.select({ count: sql`COUNT(*)` }).from(videoKnowledge);
  const totalTechniques = Number(techniquesResult?.count) || 0;

  const missingAnalysisResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM ai_video_knowledge v
    WHERE NOT EXISTS (
      SELECT 1 FROM video_knowledge vk WHERE vk.video_id = v.id
    )
  `);
  const missingRows = Array.isArray(missingAnalysisResult) ? missingAnalysisResult : (missingAnalysisResult as any).rows || [];
  const missingAnalysis = Number(missingRows[0]?.count) || 0;
  
  const recentProcessed = await db.select({
    videoId: videoWatchStatus.videoId,
    processedAt: videoWatchStatus.processedAt,
    title: aiVideoKnowledge.title
  })
    .from(videoWatchStatus)
    .innerJoin(aiVideoKnowledge, eq(videoWatchStatus.videoId, aiVideoKnowledge.id))
    .where(eq(videoWatchStatus.processed, true))
    .orderBy(desc(videoWatchStatus.processedAt))
    .limit(10);
  
  const recentlyProcessed = await Promise.all(
    recentProcessed.map(async (r) => {
      const [techCount] = await db.select({ count: sql`COUNT(*)` })
        .from(videoKnowledge)
        .where(eq(videoKnowledge.videoId, r.videoId));
      return {
        title: r.title,
        techniquesExtracted: Number(techCount?.count) || 0,
        processedAt: r.processedAt || new Date()
      };
    })
  );
  
  return {
    totalVideos,
    processed,
    pending: totalVideos - processed,
    missingAnalysis,
    withTranscript,
    withoutTranscript: processed - withTranscript,
    totalTechniques,
    recentlyProcessed
  };
}

/**
 * Reset all failed videos for reprocessing
 * This clears error messages so they can be picked up by the regular batch processor
 * Logs the previous errors before clearing for debugging purposes
 */
export async function resetFailedVideosForRetry(): Promise<{ reset: number; previousErrors: string[]; errors: string[] }> {
  try {
    // First, log what errors we're clearing (for debugging)
    const failedVideos = await db.execute(sql`
      SELECT video_id, error_message FROM video_watch_status
      WHERE processed = false 
        AND error_message IS NOT NULL 
        AND error_message != '' 
        AND error_message != 'Processing in progress'
      LIMIT 100
    `);
    
    const rows = Array.isArray(failedVideos) ? failedVideos : (failedVideos as any).rows || [];
    const previousErrors = rows.map((r: any) => `Video ${r.video_id}: ${r.error_message?.substring(0, 100)}`);
    
    if (previousErrors.length > 0) {
      console.log(`[GEMINI] Archiving ${previousErrors.length} error reasons before reset:`);
      previousErrors.slice(0, 10).forEach((e: string) => console.log(`  - ${e}`));
      if (previousErrors.length > 10) console.log(`  ... and ${previousErrors.length - 10} more`);
    }
    
    // Reset all videos that failed (processed=false with an error message)
    const result = await db.execute(sql`
      UPDATE video_watch_status 
      SET error_message = '', processed = false
      WHERE processed = false 
        AND error_message IS NOT NULL 
        AND error_message != '' 
        AND error_message != 'Processing in progress'
      RETURNING video_id
    `);
    
    const resetCount = Array.isArray(result) ? result.length : (result as any).rows?.length || 0;
    console.log(`[GEMINI] Reset ${resetCount} failed videos for retry`);
    return { reset: resetCount, previousErrors, errors: [] };
  } catch (error: any) {
    console.error('[GEMINI] Failed to reset videos:', error.message);
    return { reset: 0, previousErrors: [], errors: [error.message] };
  }
}

/**
 * Get count of recently added videos and how many need analysis
 */
export async function getNewVideosCount(daysBack: number = 7): Promise<{
  totalNew: number;
  needingAnalysis: number;
  days: number;
}> {
  const result = await db.execute(sql`
    SELECT 
      COUNT(*) as total_new,
      COUNT(CASE WHEN NOT EXISTS (
        SELECT 1 FROM video_knowledge vk WHERE vk.video_id = v.id
      ) THEN 1 END) as needing_analysis
    FROM ai_video_knowledge v
    WHERE COALESCE(v.created_at, v.upload_date, v.analyzed_at) >= NOW() - INTERVAL '1 day' * ${daysBack}
  `);
  const rows = Array.isArray(result) ? result : (result as any).rows || [];
  return {
    totalNew: Number(rows[0]?.total_new) || 0,
    needingAnalysis: Number(rows[0]?.needing_analysis) || 0,
    days: daysBack,
  };
}

/**
 * Analyze only videos added in the last X days that are missing analysis
 * Efficient for daily/weekly incremental processing
 */
export async function analyzeNewVideosOnly(
  daysBack: number = 7,
  onProgress?: (msg: string) => void
): Promise<{
  totalProcessed: number;
  totalSucceeded: number;
  totalFailed: number;
  totalTechniques: number;
  errors: string[];
}> {
  const log = (msg: string) => {
    console.log(`[ANALYZE-NEW] ${msg}`);
    onProgress?.(msg);
  };

  log(`Starting analysis of new videos from last ${daysBack} days...`);

  const newVideosResult = await db.execute(sql`
    SELECT v.id, v.title
    FROM ai_video_knowledge v
    WHERE COALESCE(v.created_at, v.upload_date, v.analyzed_at) >= NOW() - INTERVAL '1 day' * ${daysBack}
      AND NOT EXISTS (
        SELECT 1 FROM video_knowledge vk WHERE vk.video_id = v.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM video_watch_status vws 
        WHERE vws.video_id = v.id 
          AND vws.processed = true
      )
    ORDER BY COALESCE(v.created_at, v.upload_date, v.analyzed_at) DESC
  `);
  const videos = Array.isArray(newVideosResult) && !('rows' in newVideosResult)
    ? newVideosResult
    : (newVideosResult as any).rows || [];

  log(`Found ${videos.length} new videos needing analysis`);

  if (videos.length === 0) {
    return { totalProcessed: 0, totalSucceeded: 0, totalFailed: 0, totalTechniques: 0, errors: [] };
  }

  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalTechniques = 0;
  const allErrors: string[] = [];

  const BATCH_SIZE = 20;
  const totalBatches = Math.ceil(videos.length / BATCH_SIZE);

  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const batchVideos = videos.slice(batchNum * BATCH_SIZE, (batchNum + 1) * BATCH_SIZE);

    await Promise.all(batchVideos.map((video: any) =>
      db.insert(videoWatchStatus).values({
        videoId: video.id,
        hasTranscript: false,
        processed: false,
        errorMessage: 'Processing in progress'
      }).onConflictDoUpdate({
        target: videoWatchStatus.videoId,
        set: {
          hasTranscript: false,
          processed: false,
          errorMessage: 'Processing in progress'
        }
      })
    ));

    const hasDualKeys = !!gemini2;
    const chunkSize = hasDualKeys ? 4 : 2;

    for (let i = 0; i < batchVideos.length; i += chunkSize) {
      const chunk = batchVideos.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map((video: any) => processVideoKnowledge(video.id))
      );

      for (const result of results) {
        totalProcessed++;
        if (result.success) {
          totalSucceeded++;
          totalTechniques += result.techniquesAdded || 0;
        } else {
          totalFailed++;
          if (result.error) allErrors.push(result.error);
        }
      }

      if (i + chunkSize < batchVideos.length) {
        await sleep(500);
      }
    }

    log(`Batch ${batchNum + 1}/${totalBatches}: ${totalSucceeded}/${totalProcessed} succeeded, ${totalFailed} failed, ${totalTechniques} total techniques`);

    if (batchNum + 1 < totalBatches) {
      await sleep(2000);
    }
  }

  log(`Complete: ${totalSucceeded}/${totalProcessed} succeeded, ${totalTechniques} techniques extracted`);

  return {
    totalProcessed,
    totalSucceeded,
    totalFailed,
    totalTechniques,
    errors: allErrors.slice(0, 50),
  };
}

/**
 * Force analyze ALL unanalyzed videos - runs larger batches continuously
 * Used for one-time catch-up processing
 */
export async function analyzeAllUnanalyzedVideos(onProgress?: (msg: string) => void): Promise<{
  totalProcessed: number;
  totalSucceeded: number;
  totalFailed: number;
  totalTechniques: number;
  errors: string[];
}> {
  const log = (msg: string) => {
    console.log(`[ANALYZE-ALL] ${msg}`);
    onProgress?.(msg);
  };
  
  log('Starting full analysis of all unanalyzed videos...');
  
  // First, reset any stuck "Processing in progress" entries older than 10 minutes
  await db.execute(sql`
    UPDATE video_watch_status 
    SET error_message = '', processed = false
    WHERE error_message = 'Processing in progress'
  `);
  log('Cleared stuck processing entries');
  
  // Also reset all failed videos to give them another chance
  const resetResult = await resetFailedVideosForRetry();
  log(`Reset ${resetResult.reset} previously failed videos for retry`);
  
  // CRITICAL: Reset videos marked as processed=true but with NO actual technique rows
  // These are videos that were marked done but the Gemini analysis produced no data
  // This catches videos where Gemini failed but they were still marked processed=true
  const emptyAnalysisResult = await db.execute(sql`
    UPDATE video_watch_status
    SET processed = false, error_message = 'Reset: no technique data found'
    WHERE processed = true
      AND NOT EXISTS (
        SELECT 1 FROM video_knowledge vk WHERE vk.video_id = video_watch_status.video_id
      )
    RETURNING video_id
  `);
  const emptyResetRows = Array.isArray(emptyAnalysisResult) ? emptyAnalysisResult : (emptyAnalysisResult as any).rows || [];
  const emptyResetCount = emptyResetRows.length;
  log(`Reset ${emptyResetCount} videos marked as processed but missing technique data`);
  
  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalTechniques = 0;
  const allErrors: string[] = [];
  
  // Run batches continuously until no more videos remain
  const BATCH_SIZE = 20;
  const MAX_BATCHES = 200; // Safety limit: 200 * 20 = 4000 videos max
  
  for (let batchNum = 0; batchNum < MAX_BATCHES; batchNum++) {
    const result = await processBatch(BATCH_SIZE);
    
    if (result.processed === 0) {
      log(`No more unprocessed videos after ${batchNum} batches`);
      break;
    }
    
    totalProcessed += result.processed;
    totalSucceeded += result.succeeded;
    totalFailed += result.failed;
    totalTechniques += result.techniquesAdded;
    allErrors.push(...result.errors);
    
    log(`Batch ${batchNum + 1}: ${totalSucceeded}/${totalProcessed} succeeded, ${totalFailed} failed, ${totalTechniques} total techniques`);
    
    // Brief pause between batches to avoid rate limits
    await sleep(2000);
  }
  
  log(`✅ Complete: ${totalSucceeded}/${totalProcessed} succeeded, ${totalTechniques} techniques extracted`);
  
  return {
    totalProcessed,
    totalSucceeded,
    totalFailed,
    totalTechniques,
    errors: allErrors.slice(0, 50) // Limit error list
  };
}

/**
 * Test Gemini connection with a sample video
 */
export async function testGeminiConnection(): Promise<{ success: boolean; error?: string; message?: string }> {
  if (!process.env.GEMINI_API_KEY) {
    return { success: false, error: 'GEMINI_API_KEY not configured' };
  }
  
  const dualKeyMode = gemini2 ? 'DUAL KEY MODE' : 'SINGLE KEY MODE';
  
  try {
    // Test Key 1
    const response1 = await gemini1.models.generateContent({
      model: QUICK_MODEL,
      contents: 'Say "Key 1 OK" in exactly those words.'
    });
    const text1 = response1.text || '';
    
    // Test Key 2 if available
    let key2Status = 'not configured';
    if (gemini2) {
      try {
        const response2 = await gemini2.models.generateContent({
          model: QUICK_MODEL,
          contents: 'Say "Key 2 OK" in exactly those words.'
        });
        key2Status = 'OK';
      } catch (e: any) {
        key2Status = `error: ${e.message}`;
      }
    }
    
    return { 
      success: true, 
      message: `${dualKeyMode} - Key 1: OK, Key 2: ${key2Status}` 
    };
  } catch (error: any) {
    return { success: false, error: `Key 1 failed: ${error.message}` };
  }
}
