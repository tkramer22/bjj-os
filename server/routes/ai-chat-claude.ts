import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db';
import { eq, desc, sql, exists, and } from 'drizzle-orm';
import { aiConversationLearning, bjjUsers, aiVideoKnowledge, professorOsDiagnostics, videoKnowledge, profQueries } from '../../shared/schema';
import { buildSystemPrompt } from '../utils/buildSystemPrompt';
import { loadImportantCombatNews, loadPopulationIntelligence } from '../utils/professorOSPrompt';
import { processConversation } from '../utils/learningLoop';
import type { ConversationMessage } from '../utils/learningAnalyzer';
import { RESPONSE_SCHEMA, ProfessorOSResponse } from '../types/professorOSResponse';
import { composeNaturalResponse } from '../utils/composeResponse';
import { validateResponse } from '../utils/validateResponse';
import { searchVideos, fallbackSearch, formatVideosForPrompt, extractSearchIntent, getSessionContext, updateSessionContext, extractTechniqueKeyword, searchGeminiFirst } from '../videoSearch';
import { processMessageForTechniqueExtraction } from '../technique-extraction';
import { extractTechniqueRequests } from '../technique-extractor';
import { professorOSCache } from '../services/professor-os-cache';
import { detectTopicsFromMessage, synthesizeKnowledgeByTopic, formatSynthesizedKnowledge } from '../utils/knowledge-synthesizer';

// ═══════════════════════════════════════════════════════════════
// DATABASE RETRY HELPER - Resilient query execution
// ═══════════════════════════════════════════════════════════════

/**
 * Execute a database query with retry logic for connection timeouts
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 500
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errorMsg = (error.message || '').toLowerCase();
      
      // Only retry on connection-related errors
      const isRetryable = errorMsg.includes('timeout') || 
                          errorMsg.includes('connect') ||
                          errorMsg.includes('pool') ||
                          errorMsg.includes('econnrefused') ||
                          errorMsg.includes('connection');
      
      if (!isRetryable || attempt > maxRetries) {
        throw error;
      }
      
      console.log(`⚠️ [RETRY] Attempt ${attempt} failed with ${error.code || 'error'}, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

// ═══════════════════════════════════════════════════════════════
// PROFESSOR OS DIAGNOSTICS - Intelligence System Logging
// ═══════════════════════════════════════════════════════════════

interface DiagnosticData {
  systemPromptLength: number;
  systemPromptSections: string[];
  videosSearched: number;
  videoSearchIntent: any;
  instructorDetected: string | null;
  searchResultsCount: number;
  totalVideosAvailable: number;
  claudeResponseJson: any;
  validationStatus: 'passed' | 'failed' | 'warnings';
  validationIssues: string[];
  validationWarnings: string[];
  responseTokens: number;
  videoTokensInResponse: number;
  videoTokensEnriched: number;
  offTopicDetected: boolean;
  timingBreakdown: {
    dataLoadMs: number;
    videoSearchMs: number;
    promptBuildMs: number;
    claudeApiMs: number;
    validationMs: number;
    streamingMs: number;
    totalMs: number;
  };
  userContext: {
    beltLevel: string | null;
    trainingStyle: string | null;
    bodyType: string | null;
    subscriptionStatus: string | null;
    conversationLength: number;
  };
}

async function saveDiagnostics(
  userId: string, 
  userMessage: string, 
  diagnostics: DiagnosticData
): Promise<void> {
  try {
    await db.insert(professorOsDiagnostics).values({
      userId,
      userMessage,
      modelUsed: 'claude-sonnet-4-5-20250929',
      responseTimeMs: diagnostics.timingBreakdown.totalMs,
      diagnostics: diagnostics
    });
    console.log('📊 [DIAGNOSTICS] Saved to database');
  } catch (error) {
    console.error('❌ [DIAGNOSTICS] Failed to save:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// COMBAT SPORTS INTELLIGENCE - ON-TOPIC DETECTION
// ═══════════════════════════════════════════════════════════════

// PRIORITY 1: Combat sports competitions (ALWAYS on-topic, check FIRST)
const COMBAT_SPORTS_KEYWORDS = [
  // Major Competitions
  'adcc', 'ibjjf', 'worlds', 'mundials', 'pans', 'euros', 'brasileiros',
  'world championship', 'european championship', 'pan american',
  'no-gi worlds', 'gi worlds', 'absolute', 'superfight',
  
  // Organizations & Events
  'ufc', 'mma', 'bellator', 'one championship', 'who\'s number one', 'wno',
  'eby', 'ebi', 'polaris', 'kasai', 'f2w', 'fight to win', 'third coast grappling',
  'combat jiu jitsu', 'cjj', 'quintet', 'grappling industries', 'naga', 'good fight',
  
  // Elite Competitors (detection triggers intelligence, not off-topic)
  'gordon ryan', 'andre galvao', 'marcus buchecha', 'buchecha',
  'mikey musumeci', 'craig jones', 'kade ruotolo', 'tye ruotolo', 'ruotolo',
  'john danaher', 'roger gracie', 'marcelo garcia', 'bernardo faria',
  'kaynan duarte', 'nicholas meregali', 'meregali', 'felipe pena', 'preguica',
  'ffion davies', 'gabi garcia', 'bia mesquita', 'bia basilio', 'mayssa basilio',
  'nicky ryan', 'nicky rod', 'nicholas rodriguez', 'lachlan giles',
  'giancarlo bodoni', 'bodoni', 'diogo reis', 'micael galvao', 'mica',
  'gordon', 'danaher', 'galvao', 'musumeci',
  
  // Competition Terms
  'tournament', 'competition', 'match', 'competitor', 'champion', 'medal',
  'gold', 'silver', 'bronze', 'division', 'weight class', 'superfight',
  'last match', 'recent match', 'who won', 'results', 'bracket'
];

// PRIORITY 2: Conversational acknowledgments (always valid, not off-topic)
const CONVERSATIONAL_PHRASES = [
  'thank you', 'thanks', 'thx', 'ty',
  'got it', 'ok', 'okay', 'k', 'alright', 'cool', 'nice', 'awesome', 'great', 'perfect',
  'will do', 'sounds good', 'makes sense', 'understood', 'roger', 'bet',
  'appreciate it', 'appreciate that', 'helpful', 'this helps', 'that helps',
  'good to know', 'noted', 'dope', 'sick', 'fire', 'lit', 'word',
  'lol', 'haha', 'lmao', 'hahaha',
  'yes', 'yeah', 'yep', 'yup', 'ya', 'yea',
  'no', 'nope', 'nah',
  'sure', 'absolutely', 'definitely', 'for sure',
  'hello', 'hi', 'hey', 'yo', 'sup', 'what\'s up', 'whats up',
  'bye', 'later', 'peace', 'see ya', 'talk later',
  'oss', 'osss', 'ossss', 'porra' // BJJ greetings
];

// PRIORITY 3: Core BJJ technique keywords
const BJJ_TECHNIQUE_KEYWORDS = [
  'guard', 'pass', 'sweep', 'submission', 'mount', 'side control', 'back',
  'choke', 'armbar', 'triangle', 'kimura', 'americana', 'omoplata',
  'half guard', 'closed guard', 'open guard', 'butterfly', 'x-guard',
  'leg lock', 'heel hook', 'kneebar', 'ankle lock', 'toe hold',
  'takedown', 'wrestling', 'roll', 'drilling', 'training', 'sparring',
  'belt', 'gi', 'nogi', 'bjj', 'jiu-jitsu', 'grappling', 'technique',
  'escape', 'position', 'control', 'grip', 'posture', 'base', 'hip',
  'frame', 'underhook', 'overhook', 'collar', 'sleeve', 'lapel',
  'berimbolo', 'de la riva', 'dlr', 'spider guard', 'lasso', 'worm guard',
  'ashi garami', 'saddle', 'inside sankaku', 'outside sankaku', '50/50',
  'knee slice', 'toreando', 'pressure pass', 'stack pass', 'leg drag',
  'arm drag', 'duck under', 'single leg', 'double leg', 'hip throw',
  'guillotine', 'darce', 'd\'arce', 'anaconda', 'arm triangle',
  'north south', 'crucifix', 'turtle', 'referee position', 'cross face'
];

interface TopicDetectionResult {
  isOffTopic: boolean;
  isCombatSports: boolean;
  detectedKeywords: string[];
}

function detectTopicType(message: string): TopicDetectionResult {
  const messageLower = message.toLowerCase().trim();
  const result: TopicDetectionResult = {
    isOffTopic: true,
    isCombatSports: false,
    detectedKeywords: []
  };
  
  // PRIORITY 1: Check combat sports keywords FIRST
  for (const keyword of COMBAT_SPORTS_KEYWORDS) {
    if (messageLower.includes(keyword)) {
      result.isOffTopic = false;
      result.isCombatSports = true;
      result.detectedKeywords.push(keyword);
    }
  }
  
  // If combat sports detected, return early (NOT off-topic)
  if (result.isCombatSports) {
    console.log('🏆 [TOPIC DETECTION] Combat sports detected:', result.detectedKeywords);
    return result;
  }
  
  // PRIORITY 2: Check conversational acknowledgments (short messages that are valid)
  // For very short messages, check if the entire message is an acknowledgment
  const cleanMessage = messageLower.replace(/[^\w\s]/g, '').trim();
  for (const phrase of CONVERSATIONAL_PHRASES) {
    if (cleanMessage === phrase || messageLower.includes(phrase)) {
      result.isOffTopic = false;
      result.detectedKeywords.push(phrase);
      console.log('💬 [TOPIC DETECTION] Conversational phrase detected:', phrase);
      return result;
    }
  }
  
  // Check for emoji-only messages (thumbs up, fist bump, etc.) - these are valid
  const emojiPattern = /^[\p{Emoji}\s]+$/u;
  if (emojiPattern.test(message.trim())) {
    result.isOffTopic = false;
    result.detectedKeywords.push('emoji');
    console.log('👍 [TOPIC DETECTION] Emoji message detected');
    return result;
  }
  
  // PRIORITY 3: Check BJJ technique keywords
  for (const keyword of BJJ_TECHNIQUE_KEYWORDS) {
    if (messageLower.includes(keyword)) {
      result.isOffTopic = false;
      result.detectedKeywords.push(keyword);
    }
  }
  
  if (!result.isOffTopic) {
    console.log('🥋 [TOPIC DETECTION] BJJ technique detected:', result.detectedKeywords);
  } else {
    console.log('❓ [TOPIC DETECTION] Off-topic message (no BJJ/combat keywords)');
  }
  
  return result;
}

// Legacy function for backwards compatibility
function detectOffTopic(message: string): boolean {
  return detectTopicType(message).isOffTopic;
}

// Extract technique keywords from message for population intelligence lookup
// Matches all 10 seeded techniques in population_intelligence table with variations
function extractTechniqueKeywords(message: string): string[] {
  const messageLower = message.toLowerCase();
  const found: string[] = [];
  
  // All 10 seeded techniques with pattern variations
  const techniquePatterns = [
    // Hip Bump Sweep (seeded as "Hip Bump Sweep")
    { pattern: /hip\s*bump|bump\s*sweep/i, name: 'hip bump' },
    
    // Triangle Choke (seeded as "Triangle Choke")
    { pattern: /triangle\s*(choke)?|triangle\s*from/i, name: 'triangle' },
    
    // Armbar from Guard (seeded as "Armbar from Guard")
    { pattern: /armbar|arm\s*bar|juji\s*gatame/i, name: 'armbar' },
    
    // Knee Slice Pass (seeded as "Knee Slice Pass")
    { pattern: /knee\s*(slice|cut|through)|knee\s*pass/i, name: 'knee slice' },
    
    // Rear Naked Choke (seeded as "Rear Naked Choke")
    { pattern: /rear\s*naked|rnc|mata\s*leao|back\s*choke/i, name: 'rear naked' },
    
    // Mount Escape Elbow-Knee (seeded as "Mount Escape Elbow-Knee")
    { pattern: /mount\s*escape|escape\s*(from\s*)?mount|elbow\s*knee|upa/i, name: 'mount escape' },
    
    // Double Leg Takedown (seeded as "Double Leg Takedown")
    { pattern: /double\s*leg|double\s*takedown/i, name: 'double leg' },
    
    // Guillotine Choke (seeded as "Guillotine Choke")
    { pattern: /guillotine|high\s*elbow\s*guillotine|arm.in\s*guillotine/i, name: 'guillotine' },
    
    // Scissor Sweep (seeded as "Scissor Sweep")
    { pattern: /scissor\s*sweep|scissor\s*from\s*guard/i, name: 'scissor sweep' },
    
    // Americana from Mount (seeded as "Americana from Mount")
    { pattern: /americana|key\s*lock|ude\s*garami/i, name: 'americana' },
    
    // Additional common techniques not in seeded data (for future expansion)
    { pattern: /kimura/i, name: 'kimura' },
    { pattern: /omoplata/i, name: 'omoplata' },
    { pattern: /half\s*guard/i, name: 'half guard' },
    { pattern: /closed\s*guard/i, name: 'closed guard' },
    { pattern: /butterfly\s*(sweep|guard)?/i, name: 'butterfly' },
    { pattern: /back\s*take|taking\s*(the\s*)?back/i, name: 'back take' },
    { pattern: /guard\s*pass(ing)?/i, name: 'guard passing' },
    { pattern: /side\s*control/i, name: 'side control' },
  ];
  
  for (const { pattern, name } of techniquePatterns) {
    if (pattern.test(message) && !found.includes(name)) {
      found.push(name);
    }
  }
  
  console.log(`🔍 [TECHNIQUE EXTRACTION] Found techniques: ${found.join(', ') || 'none'}`);
  return found.slice(0, 3); // Limit to top 3 techniques
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export async function handleClaudeStream(req: any, res: any) {
  const { message } = req.body;
  
  // 🔒 SECURITY: Get userId from authenticated user, not from request body
  const userId = req.user?.userId;
  
  // 🔍 DEBUG: Comprehensive request logging for troubleshooting
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('[CHAT API] 📥 REQUEST RECEIVED - ' + new Date().toISOString());
  console.log('[CHAT API] User ID from req.user:', userId);
  console.log('[CHAT API] req.user object:', JSON.stringify(req.user || 'undefined'));
  console.log('[CHAT API] Message (first 100 chars):', (message || '').substring(0, 100));
  console.log('[CHAT API] Message length:', message?.length || 0);
  console.log('[CHAT API] Has Authorization header:', !!req.headers.authorization);
  console.log('[CHAT API] Has sessionToken cookie:', !!req.cookies?.sessionToken);
  console.log('═══════════════════════════════════════════════════════════════');
  
  const startTime = Date.now();
  let t1, t2, t3, t4, t5, t6, t7;
  
  // 📊 DIAGNOSTICS: Initialize diagnostic data collection
  let diagnosticData: Partial<DiagnosticData> = {
    offTopicDetected: false,
    videoTokensInResponse: 0,
    videoTokensEnriched: 0,
    validationIssues: [],
    validationWarnings: [],
    systemPromptSections: [],
    timingBreakdown: {
      dataLoadMs: 0,
      videoSearchMs: 0,
      promptBuildMs: 0,
      claudeApiMs: 0,
      validationMs: 0,
      streamingMs: 0,
      totalMs: 0
    }
  };
  
  try {
    console.log('═══════════════════════════════════════');
    console.log('🚀 CLAUDE STREAM REQUEST');
    console.log('User ID:', userId);
    console.log('Message (full):', message);
    console.log('Message length:', message?.length || 0);
    
    // Detect topic type (combat sports vs technique vs off-topic)
    const topicDetection = detectTopicType(message || '');
    diagnosticData.offTopicDetected = topicDetection.isOffTopic;
    (diagnosticData as any).combatSportsDetected = topicDetection.isCombatSports;
    (diagnosticData as any).detectedKeywords = topicDetection.detectedKeywords;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized - authentication required' });
    }
    
    if (!message) {
      return res.status(400).json({ error: 'Missing message' });
    }
    
    // 📊 ACTIVITY TRACKING: Update lastActiveAt for user activity reporting
    try {
      await db.update(bjjUsers)
        .set({ lastActiveAt: new Date() })
        .where(eq(bjjUsers.id, userId));
    } catch (activityError) {
      console.error('[CHAT] Failed to update lastActiveAt:', activityError);
      // Don't block the chat for tracking errors
    }
    
    // 🚀 OPTIMIZATION: Load all data in parallel with caching
    t1 = Date.now();
    
    // Check cache first for user context
    let userProfile = professorOSCache.getUserContext(userId);
    let recentNews = professorOSCache.getNews();
    
    // Build parallel queries for uncached data
    const queries: Promise<any>[] = [];
    const queryTypes: string[] = [];
    
    if (!userProfile) {
      // Use explicit column selection to avoid missing column errors (lastActiveAt may not exist in production)
      queries.push(db.select({
        id: bjjUsers.id,
        email: bjjUsers.email,
        displayName: bjjUsers.displayName,
        username: bjjUsers.username,
        name: bjjUsers.name,
        beltLevel: bjjUsers.beltLevel,
        style: bjjUsers.style,
        contentPreference: bjjUsers.contentPreference,
        focusAreas: bjjUsers.focusAreas,
        injuries: bjjUsers.injuries,
        competeStatus: bjjUsers.competeStatus,
        trainingGoals: bjjUsers.trainingGoals,
        bodyType: bjjUsers.bodyType,
        ageRange: bjjUsers.ageRange,
        height: bjjUsers.height,
        weight: bjjUsers.weight,
        gym: bjjUsers.gym,
        yearsTrainingRange: bjjUsers.yearsTrainingRange,
        trainingFrequencyText: bjjUsers.trainingFrequencyText,
        preferredLanguage: bjjUsers.preferredLanguage,
        createdAt: bjjUsers.createdAt,
        struggles: bjjUsers.struggles,
        strengths: bjjUsers.strengths,
        struggleTechnique: bjjUsers.struggleTechnique,
        weakestArea: bjjUsers.weakestArea,
      }).from(bjjUsers).where(eq(bjjUsers.id, userId)).limit(1));
      queryTypes.push('user');
    }
    
    // Always load fresh conversation history (not cached - changes every message)
    queries.push(
      db.select({
        messageText: aiConversationLearning.messageText,
        messageType: aiConversationLearning.messageType,
        createdAt: aiConversationLearning.createdAt
      })
        .from(aiConversationLearning)
        .where(eq(aiConversationLearning.userId, userId))
        .orderBy(desc(aiConversationLearning.createdAt))
        .limit(20)
    );
    queryTypes.push('history');
    
    if (!recentNews) {
      queries.push(loadImportantCombatNews());
      queryTypes.push('news');
    }
    
    // Execute parallel queries with retry logic for connection resilience
    const results = await withRetry(
      () => Promise.all(queries),
      2,  // max 2 retries
      500 // 500ms delay between retries
    );
    
    // Assign results based on what was queried
    let history: any[] = [];
    let resultIdx = 0;
    
    for (const type of queryTypes) {
      if (type === 'user') {
        const [loadedProfile] = results[resultIdx];
        userProfile = loadedProfile;
        if (userProfile) {
          professorOSCache.setUserContext(userId, userProfile);
        }
      } else if (type === 'history') {
        history = results[resultIdx];
      } else if (type === 'news') {
        recentNews = results[resultIdx];
        if (recentNews && recentNews.length > 0) {
          professorOSCache.setNews(recentNews);
        }
      }
      resultIdx++;
    }
    
    // Fallback if news still null
    if (!recentNews) recentNews = [];
    
    if (!userProfile) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const dataLoadMs = Date.now() - t1;
    console.log(`⏱️  Parallel data load complete: ${dataLoadMs}ms`);
    console.log(`   ✅ User profile, ${history.length} messages, ${recentNews.length} news items`);
    
    // 📊 DIAGNOSTICS: Capture user context
    diagnosticData.timingBreakdown!.dataLoadMs = dataLoadMs;
    diagnosticData.userContext = {
      beltLevel: userProfile.beltLevel || null,
      trainingStyle: userProfile.style || null,
      bodyType: userProfile.bodyType || null,
      subscriptionStatus: userProfile.subscriptionStatus || null,
      conversationLength: history.length
    };
    
    // Prepare context for prompt builder (avoid duplicate queries)
    const struggleAreaBoost = userProfile.biggestStruggle || userProfile.struggleAreaCategory;
    
    // 🔍 GEMINI-FIRST VIDEO SEARCH: Query Gemini-analyzed data ONLY for technique matches
    t2 = Date.now();
    const sessionContext = getSessionContext(userId);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GEMINI-FIRST SEARCH (January 2026)
    // Video selection is DATABASE QUERY against Gemini fields, NOT AI judgment.
    // If user asks about guillotines, ONLY return videos where Gemini found guillotine content.
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Step 1: Extract technique keyword from user message
    const detectedTechnique = extractTechniqueKeyword(message);
    
    let videoSearchResult;
    
    if (detectedTechnique) {
      // TECHNIQUE DETECTED: Use Gemini-first search (ONLY returns videos where Gemini found this technique)
      console.log(`🎯 [GEMINI-FIRST] Detected technique: "${detectedTechnique}" - searching Gemini data ONLY`);
      
      const geminiResult = await searchGeminiFirst(detectedTechnique);
      
      // Convert Gemini result to standard format
      videoSearchResult = {
        videos: geminiResult.videos,
        totalMatches: geminiResult.videos.length,
        searchIntent: extractSearchIntent(message),
        noMatchFound: geminiResult.noMatchFound,
        searchTermsValidated: true
      };
      
      if (geminiResult.noMatchFound) {
        console.log(`❌ [GEMINI-FIRST] No videos found in Gemini data for "${detectedTechnique}"`);
        console.log(`   Will teach conceptually without showing wrong videos`);
      } else {
        console.log(`✅ [GEMINI-FIRST] Found ${geminiResult.videos.length} videos with Gemini-verified "${detectedTechnique}" content`);
      }
    } else {
      // NO TECHNIQUE DETECTED: Use standard search (instructor-only, position-only, general)
      console.log(`📌 [STANDARD SEARCH] No specific technique detected - using standard search`);
      
      videoSearchResult = await searchVideos({
        userMessage: message,
        userId: userId,
        conversationContext: {
          userGiNogi: userProfile.style || 'both',
          sessionFocus: sessionContext.sessionFocus,
          recommendedVideoIds: sessionContext.recommendedVideoIds,
          lastInstructor: sessionContext.lastInstructor
        }
      });
      
      // Only use fallback when search returned 0 results AND noMatchFound is NOT set
      if (videoSearchResult.videos.length === 0 && !videoSearchResult.noMatchFound) {
        console.log('🔄 No exact matches, trying fallback search...');
        videoSearchResult = await fallbackSearch(message);
      }
    }
    
    const videoSearchMs = Date.now() - t2;
    console.log(`⏱️  Dynamic video search complete: ${videoSearchMs}ms`);
    console.log(`   ✅ Found ${videoSearchResult.videos.length} relevant videos (${videoSearchResult.totalMatches} total matches)`);
    console.log(`   🎯 Search intent:`, videoSearchResult.searchIntent);
    
    // 📊 DIAGNOSTICS: Capture video search results
    diagnosticData.timingBreakdown!.videoSearchMs = videoSearchMs;
    diagnosticData.videosSearched = videoSearchResult.videos.length;
    diagnosticData.searchResultsCount = videoSearchResult.videos.length;
    diagnosticData.totalVideosAvailable = videoSearchResult.totalMatches;
    diagnosticData.videoSearchIntent = videoSearchResult.searchIntent;
    diagnosticData.instructorDetected = videoSearchResult.searchIntent?.instructor || null;
    
    // Update session context with search intent and recommended videos
    const recommendedVideoIds = videoSearchResult.videos.map(v => v.id.toString());
    updateSessionContext(userId, videoSearchResult.searchIntent, recommendedVideoIds);
    console.log(`   📊 Session focus:`, getSessionContext(userId).sessionFocus);
    
    // Format videos for prompt (include keyTimestamps to avoid duplicate DB query in buildSystemPrompt)
    const videoLibrary = videoSearchResult.videos.map(v => ({
      id: v.id,
      techniqueName: v.techniqueName || v.title,
      title: v.techniqueName || v.title,
      instructorName: v.instructorName,
      techniqueType: v.techniqueType,
      positionCategory: v.positionCategory,
      qualityScore: v.qualityScore,
      videoUrl: v.videoUrl,
      youtubeId: v.youtubeId,
      tags: v.tags || [],
      relevanceScore: Number(v.qualityScore) || 0,
      keyTimestamps: v.keyTimestamps || []
    }));
    
    // 🚀 CACHE: ALL videos for token enrichment (1 hour TTL)
    // No limit — Professor OS must match ANY video in the database with correct thumbnails
    // Only lightweight fields are selected (no gemini_analysis/fullSummary/keyConcepts)
    const VIDEO_CACHE_KEY = 'all_videos_for_enrichment';
    let allVideos = professorOSCache.getVideos(VIDEO_CACHE_KEY);
    
    if (!allVideos) {
      allVideos = await db.select({
        id: aiVideoKnowledge.id,
        techniqueName: aiVideoKnowledge.title,
        instructorName: aiVideoKnowledge.instructorName,
        techniqueType: aiVideoKnowledge.techniqueType,
        positionCategory: aiVideoKnowledge.positionCategory,
        qualityScore: aiVideoKnowledge.qualityScore,
        videoUrl: aiVideoKnowledge.videoUrl,
        youtubeId: aiVideoKnowledge.youtubeId,
        keyTimestamps: aiVideoKnowledge.keyTimestamps,
        tags: aiVideoKnowledge.tags
      })
        .from(aiVideoKnowledge)
        .where(and(
          eq(aiVideoKnowledge.status, 'active'),
          sql`${aiVideoKnowledge.youtubeId} IS NOT NULL AND ${aiVideoKnowledge.youtubeId} != ''`,
          sql`${aiVideoKnowledge.videoUrl} IS NOT NULL AND ${aiVideoKnowledge.videoUrl} != ''`,
          sql`${aiVideoKnowledge.title} IS NOT NULL AND ${aiVideoKnowledge.title} != ''`,
          sql`${aiVideoKnowledge.instructorName} IS NOT NULL AND ${aiVideoKnowledge.instructorName} != ''`
        ))
        .orderBy(desc(aiVideoKnowledge.qualityScore));
      
      console.log(`[VIDEO CACHE] 📊 Loaded ${allVideos.length} videos for token enrichment (ALL videos, no limit)`);
      professorOSCache.setVideos(VIDEO_CACHE_KEY, allVideos);
    }
    
    // Calculate user metrics
    const daysSinceJoined = userProfile.createdAt 
      ? Math.floor((Date.now() - new Date(userProfile.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const weeksSinceJoined = Math.floor(daysSinceJoined / 7);
    const heightDisplay = userProfile.height 
      ? `${Math.floor(Number(userProfile.height) / 12)}'${Number(userProfile.height) % 12}"`
      : null;
    
    // PHASE 3B: Load population intelligence for mentioned techniques
    const techniqueKeywords = extractTechniqueKeywords(message);
    const populationInsights = techniqueKeywords.length > 0 
      ? await loadPopulationIntelligence(techniqueKeywords)
      : [];
    if (populationInsights.length > 0) {
      console.log(`🧠 [POPULATION INTEL] Loaded insights for: ${populationInsights.map(p => p.techniqueName).join(', ')}`);
    }
    
    // 🧠 LAYER 2-3: KNOWLEDGE SYNTHESIS - Detect topics and synthesize expert knowledge
    const detectedTopics = detectTopicsFromMessage(message);
    let synthesizedKnowledgeSection = '';
    
    if (detectedTopics.length > 0) {
      console.log(`🔍 [KNOWLEDGE SYNTHESIZER] Detected topics: ${detectedTopics.join(', ')}`);
      
      try {
        // Synthesize knowledge for each detected topic (in parallel)
        const synthesizedResults = await Promise.all(
          detectedTopics.map(topic => synthesizeKnowledgeByTopic(topic, userId.toString()))
        );
        
        // Format synthesized knowledge for prompt injection
        const validResults = synthesizedResults.filter(r => r.approachCount > 0);
        if (validResults.length > 0) {
          synthesizedKnowledgeSection = validResults.map(formatSynthesizedKnowledge).join('\n\n');
          console.log(`✅ [KNOWLEDGE SYNTHESIZER] Synthesized ${validResults.length} topic(s) with ${validResults.reduce((acc, r) => acc + r.approachCount, 0)} approaches`);
        }
      } catch (err) {
        console.warn('[KNOWLEDGE SYNTHESIZER] Error synthesizing knowledge:', err);
      }
    }
    
    // CRITICAL FIX: Use buildSystemPrompt for consistent, diary-style coaching tone
    // This prompt builder includes user profile, video library, and correct personality
    // Pass preloaded data to avoid duplicate DB queries, plus dynamic context
    t5 = Date.now();
    
    // MULTI-INSTRUCTOR DIVERSITY: Select videos from different instructors for synthesis
    const ensureInstructorDiversity = (videos: any[], maxVideos: number = 10) => {
      const selected: any[] = [];
      const seenInstructors = new Set<string>();
      
      // First pass: get at least one video per unique instructor
      for (const v of videos) {
        const instructor = v.instructorName || 'Unknown';
        if (!seenInstructors.has(instructor) && selected.length < maxVideos) {
          selected.push(v);
          seenInstructors.add(instructor);
        }
      }
      
      // Second pass: fill remaining slots with highest quality videos
      for (const v of videos) {
        if (!selected.includes(v) && selected.length < maxVideos) {
          selected.push(v);
        }
      }
      
      console.log(`[MULTI-INSTRUCTOR] Selected ${selected.length} videos from ${seenInstructors.size} unique instructors: ${Array.from(seenInstructors).slice(0, 5).join(', ')}`);
      return selected;
    };
    
    const diverseVideos = ensureInstructorDiversity(videoSearchResult.videos, 10);
    
    const systemPrompt = await buildSystemPrompt(userId.toString(), struggleAreaBoost, {
      // Preloaded data to avoid duplicate queries
      preloadedUser: userProfile,
      preloadedVideos: videoLibrary,
      // Dynamic video search results (topic-specific) with INSTRUCTOR DIVERSITY
      dynamicVideos: diverseVideos.map(v => ({
        id: v.id,
        techniqueName: v.techniqueName || v.title || '',
        instructorName: v.instructorName || '',
        techniqueType: v.techniqueType || '',
        videoUrl: v.videoUrl || '',
        title: v.title || v.techniqueName || ''
      })),
      searchMeta: {
        totalMatches: videoSearchResult.totalMatches,
        searchIntent: videoSearchResult.searchIntent
      },
      // Population intelligence for common mistakes/patterns
      populationInsights: populationInsights.map(p => ({
        techniqueName: p.techniqueName,
        commonMistakes: p.commonMistakes || [],
        successPatterns: p.successPatterns || []
      })),
      // Recent combat sports news
      newsItems: recentNews.map(n => ({
        title: n.title || '',
        summary: n.summary || n.description || ''
      })),
      // CRITICAL: Pass search status flags to prevent wrong video recommendations
      noMatchFound: videoSearchResult.noMatchFound,
      // Include the detected technique in searchTermsUsed so the warning displays correctly
      searchTermsUsed: detectedTechnique 
        ? [detectedTechnique, ...(videoSearchResult.searchIntent.searchTerms || [])]
        : videoSearchResult.searchIntent.searchTerms || []
    });
    // Append synthesized knowledge section if available
    let finalSystemPrompt = systemPrompt;
    if (synthesizedKnowledgeSection) {
      finalSystemPrompt += '\n\n' + synthesizedKnowledgeSection;
      console.log(`🧠 [KNOWLEDGE SYNTHESIZER] Appended ${synthesizedKnowledgeSection.length} chars of synthesized knowledge`);
    }
    
    const promptBuildMs = Date.now() - t5;
    console.log(`⏱️  System prompt built (${finalSystemPrompt.length} chars): ${promptBuildMs}ms`);
    
    // 📊 DIAGNOSTICS: Capture system prompt details
    diagnosticData.timingBreakdown!.promptBuildMs = promptBuildMs;
    diagnosticData.systemPromptLength = finalSystemPrompt.length;
    
    // Extract section names from prompt for diagnostics
    const sectionMatches = finalSystemPrompt.match(/SECTION \d+[A-Z]?: [^\n]+/g) || [];
    diagnosticData.systemPromptSections = sectionMatches;
    
    // PHASE 3F: Optional legacy prompt comparison (disabled in production to save DB queries)
    // Set ENABLE_PROMPT_COMPARISON=true to enable comparison for debugging
    if (process.env.ENABLE_PROMPT_COMPARISON === 'true') {
      console.log('⚠️  Prompt comparison enabled (doubles DB load) - disable in production');
      const legacyPrompt = await buildSystemPrompt(userId.toString(), struggleAreaBoost);
      const identical = systemPrompt === legacyPrompt;
      console.log('📊 Prompt comparison:', {
        modular: systemPrompt.length,
        legacy: legacyPrompt.length,
        difference: systemPrompt.length - legacyPrompt.length,
        identical
      });
      
      // Debug: Show first difference if not identical
      if (!identical) {
        let firstDiff = -1;
        for (let i = 0; i < Math.min(systemPrompt.length, legacyPrompt.length); i++) {
          if (systemPrompt[i] !== legacyPrompt[i]) {
            firstDiff = i;
            break;
          }
        }
        if (firstDiff >= 0) {
          const start = Math.max(0, firstDiff - 50);
          const end = Math.min(systemPrompt.length, firstDiff + 50);
          console.log('🔍 First difference at position', firstDiff);
          console.log('Modular:', JSON.stringify(systemPrompt.substring(start, end)));
          console.log('Legacy: ', JSON.stringify(legacyPrompt.substring(start, end)));
        } else if (systemPrompt.length !== legacyPrompt.length) {
          console.log('🔍 Same content but different lengths - check endings');
          console.log('Modular ending:', JSON.stringify(systemPrompt.substring(systemPrompt.length - 100)));
          console.log('Legacy ending: ', JSON.stringify(legacyPrompt.substring(legacyPrompt.length - 100)));
        }
      }
    }
    
    // Format conversation history for Claude
    const conversationHistory = history.reverse().map(msg => ({
      role: msg.messageType === 'user_sent' ? 'user' as const : 'assistant' as const,
      content: msg.messageText
    }));
    
    // Add current message
    const messages = [
      ...conversationHistory,
      { role: 'user' as const, content: message }
    ];
    
    console.log('✅ Messages array prepared:', messages.length, 'total messages');
    
    // Set up streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // 🚀 IMMEDIATE SSE: Send start event so user sees connection is alive
    res.write(`data: ${JSON.stringify({ status: 'thinking' })}\n\n`);
    
    console.log('📡 Requesting structured output from Claude via tool calling...');
    console.log('🔧 STRUCTURED OUTPUT MODE: Using professor_os_response tool');
    
    // Define Professor OS response as a "tool" to force structured output
    const tools = [{
      name: "professor_os_response",
      description: "Generate a structured Professor OS coaching response with engagement hooks",
      input_schema: RESPONSE_SCHEMA
    }];
    
    // 🚀 TRUE STREAMING: Use Claude streaming API with robust incremental parsing
    t6 = Date.now();
    console.log('📡 Starting Claude streaming with robust incremental text extraction...');
    
    // Accumulate the tool_use JSON as it streams
    let accumulatedJson = '';
    let outputTokens = 0;
    let firstTokenTime: number | null = null;
    let firstTextSentTime: number | null = null;
    
    // 🎯 ROBUST STATE MACHINE for incremental mainResponse extraction
    // States: 'scanning' -> 'in_value' -> 'unicode' -> 'done'
    let parserState: 'scanning' | 'in_value' | 'unicode' | 'done' = 'scanning';
    let valueStartIdx = -1;  // Index where mainResponse value string starts (after opening quote)
    let lastStreamedIdx = 0;  // Last character index we've streamed
    let escapeNext = false;
    let unicodeBuffer = '';  // Accumulates hex digits for \uXXXX
    
    // Helper to find the start of mainResponse value in accumulated JSON
    const findMainResponseStart = (): number => {
      const keyPattern = '"mainResponse"';
      const keyIdx = accumulatedJson.indexOf(keyPattern);
      if (keyIdx === -1) return -1;
      
      // Find colon after key
      const colonIdx = accumulatedJson.indexOf(':', keyIdx + keyPattern.length);
      if (colonIdx === -1) return -1;
      
      // Find opening quote of value
      const afterColon = accumulatedJson.substring(colonIdx + 1);
      const quoteIdx = afterColon.search(/"/);
      if (quoteIdx === -1) return -1;
      
      return colonIdx + 1 + quoteIdx + 1; // Position after opening quote
    };
    
    // Split system prompt at cache breakpoint for Anthropic prompt caching
    // Static part (coaching personality, rules, sections 1-5) is IDENTICAL across ALL users → cached globally
    // Dynamic part (user profile, video library, search results, news) changes per user/message
    const CACHE_BREAK_MARKER = '<!-- PROMPT_CACHE_BREAK -->';
    const cacheBreakIndex = finalSystemPrompt.indexOf(CACHE_BREAK_MARKER);
    
    let systemContent: string | Array<{type: "text", text: string, cache_control?: {type: "ephemeral"}}>;
    
    if (cacheBreakIndex !== -1) {
      const staticPart = finalSystemPrompt.substring(0, cacheBreakIndex).trim();
      const dynamicPart = finalSystemPrompt.substring(cacheBreakIndex + CACHE_BREAK_MARKER.length).trim();
      
      systemContent = [
        { type: "text" as const, text: staticPart, cache_control: { type: "ephemeral" as const } },
        ...(dynamicPart.length > 0 ? [{ type: "text" as const, text: dynamicPart }] : [])
      ];
      
      console.log(`🔒 [PROMPT CACHE] Static: ${staticPart.length} chars (cached) | Dynamic: ${dynamicPart.length} chars`);
    } else {
      systemContent = finalSystemPrompt;
      console.log(`⚠️ [PROMPT CACHE] No cache breakpoint found, sending full prompt uncached`);
    }
    
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      temperature: 0.7,
      system: systemContent,
      messages: messages,
      tools: tools,
      tool_choice: { type: "tool", name: "professor_os_response" }
    });
    
    // Process the stream with robust incremental text extraction
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'input_json_delta') {
          if (!firstTokenTime) {
            firstTokenTime = Date.now();
            console.log(`⚡ First token received in ${firstTokenTime - t6}ms`);
          }
          
          const chunk = event.delta.partial_json;
          accumulatedJson += chunk;
          
          // 🎯 ROBUST INCREMENTAL PARSING: Check for mainResponse key after every chunk
          if (parserState === 'scanning') {
            const startIdx = findMainResponseStart();
            if (startIdx !== -1) {
              valueStartIdx = startIdx;
              lastStreamedIdx = startIdx;
              parserState = 'in_value';
              console.log(`🎯 Found mainResponse at index ${startIdx}`);
            }
          }
          
          // ⚠️ DISABLED: Real-time character streaming was causing DUPLICATE MESSAGES
          // The composed response is sent AFTER Claude finishes (with video token enrichment)
          // Keeping the parsing logic to track state, but NOT sending to client here
          if (parserState === 'in_value' || parserState === 'unicode') {
            for (let i = lastStreamedIdx; i < accumulatedJson.length; i++) {
              const char = accumulatedJson[i];
              
              if (parserState === 'unicode') {
                unicodeBuffer += char;
                if (unicodeBuffer.length === 4) {
                  unicodeBuffer = '';
                  parserState = 'in_value';
                  // DISABLED: res.write - caused duplicate messages
                }
                lastStreamedIdx = i + 1;
                continue;
              }
              
              if (escapeNext) {
                escapeNext = false;
                if (char === 'u') {
                  unicodeBuffer = '';
                  parserState = 'unicode';
                  lastStreamedIdx = i + 1;
                  continue;
                }
                // DISABLED: res.write - caused duplicate messages
              } else if (char === '\\') {
                escapeNext = true;
              } else if (char === '"') {
                parserState = 'done';
                lastStreamedIdx = i + 1;
                break;
              }
              // DISABLED: res.write for regular chars - caused duplicate messages
              
              lastStreamedIdx = i + 1;
            }
          }
        }
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage?.output_tokens || 0;
      } else if (event.type === 'message_start') {
        const usage = (event as any).message?.usage;
        if (usage) {
          const cacheRead = usage.cache_read_input_tokens || 0;
          const cacheCreation = usage.cache_creation_input_tokens || 0;
          const inputTokens = usage.input_tokens || 0;
          console.log('[CACHE]', JSON.stringify({
            input_tokens: inputTokens,
            cache_creation: cacheCreation,
            cache_read: cacheRead,
            output_tokens: usage.output_tokens || 0
          }));
          if (cacheRead > 0 || cacheCreation > 0) {
            console.log(`🔒 [PROMPT CACHE] Hit: ${cacheRead} tokens cached | Creation: ${cacheCreation} tokens | Uncached: ${inputTokens - cacheRead} tokens`);
            (diagnosticData as any).promptCacheReadTokens = cacheRead;
            (diagnosticData as any).promptCacheCreationTokens = cacheCreation;
          }
        }
      }
    }
    
    const claudeApiMs = Date.now() - t6;
    const timeToFirstToken = firstTokenTime ? firstTokenTime - t6 : claudeApiMs;
    console.log(`⏱️  Claude streaming completed: ${claudeApiMs}ms (first token: ${timeToFirstToken}ms)`);
    
    // 📊 DIAGNOSTICS: Capture Claude API timing
    diagnosticData.timingBreakdown!.claudeApiMs = claudeApiMs;
    (diagnosticData as any).timeToFirstToken = timeToFirstToken;
    
    // Parse accumulated JSON
    let structuredResponse: ProfessorOSResponse;
    try {
      structuredResponse = JSON.parse(accumulatedJson);
    } catch (parseError) {
      console.error('❌ Failed to parse streamed JSON:', accumulatedJson.substring(0, 200));
      throw new Error('Claude streaming response parsing failed');
    }
    
    // 📊 DIAGNOSTICS: Capture Claude response JSON
    diagnosticData.claudeResponseJson = structuredResponse;
    diagnosticData.responseTokens = outputTokens;
    
    console.log('✅ Extracted structured response from tool use');
    console.log('📊 Structure:', {
      hasAnticipatory: !!structuredResponse.anticipatoryDiagnosis,
      hasVideo: !!structuredResponse.videoRecommendation,
      hasReturnLoop: !!structuredResponse.returnLoop,
      hasTrialUrgency: !!structuredResponse.trialUrgency
    });
    
    // Calculate trial days remaining for validation
    let daysRemaining: number | undefined;
    if (userProfile.subscriptionStatus === 'trial' && userProfile.trialEndDate) {
      const now = new Date();
      const trialEnd = new Date(userProfile.trialEndDate);
      daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    // Validate structured response
    t7 = Date.now();
    const validation = validateResponse(structuredResponse, {
      userMessage: message,
      isTrialUser: userProfile.subscriptionStatus === 'trial',
      daysRemaining,
      hasConversationHistory: history.length > 0
    });
    const validationMs = Date.now() - t7;
    
    // 📊 DIAGNOSTICS: Capture validation results
    diagnosticData.timingBreakdown!.validationMs = validationMs;
    diagnosticData.validationStatus = validation.valid 
      ? (validation.warnings.length > 0 ? 'warnings' : 'passed') 
      : 'failed';
    diagnosticData.validationIssues = validation.issues || [];
    diagnosticData.validationWarnings = validation.warnings || [];
    
    if (!validation.valid) {
      console.error('❌ Response validation FAILED:', validation.issues);
      
      // 📊 DIAGNOSTICS: Save diagnostics even on validation failure
      diagnosticData.timingBreakdown!.totalMs = Date.now() - startTime;
      await saveDiagnostics(userId.toString(), message, diagnosticData as DiagnosticData);
      
      // Critical validation failure - cannot stream malformed response
      // Send error to client
      res.write(`data: ${JSON.stringify({ 
        error: 'Response validation failed. Please try again.' 
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    
    if (validation.warnings.length > 0) {
      console.warn('⚠️  Response warnings (non-critical):', validation.warnings);
    }
    
    // Compose natural language response
    let naturalResponse = composeNaturalResponse(structuredResponse, userProfile);
    
    console.log('✅ Composed natural response. Length:', naturalResponse.length);
    console.log('📝 Response preview:', naturalResponse.substring(0, 150));
    
    // POST-PROCESS VIDEO TOKENS: Replace simple AI tokens with full metadata
    // AI outputs various formats:
    // - [VIDEO: Title by Instructor]
    // - [VIDEO: Title by Instructor | START: MM:SS]
    // - [VIDEO: Title - Instructor | Instructor | START: MM:SS] (malformed)
    // - [VIDEO: Title | Instructor | START: MM:SS] (pipe-separated)
    // Frontend needs: [VIDEO: title | instructor | duration | videoId | id | startTime]
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX (Jan 2026): When noMatchFound=true, STRIP video tokens entirely
    // This prevents matching hallucinated videos (e.g., user asks about guillotines,
    // Claude mentions "Gordon Ryan guillotine", we match to ANY Gordon Ryan video)
    // ═══════════════════════════════════════════════════════════════════════════
    const skipVideoEnrichment = videoSearchResult.noMatchFound;
    
    if (skipVideoEnrichment) {
      console.log(`[VIDEO TOKEN] 🚫 noMatchFound=true - STRIPPING all video tokens to prevent wrong recommendations`);
      // More aggressive regex: Strip [VIDEO:...] tokens AND clean up surrounding punctuation
      // Pattern 1: Token followed by optional description
      naturalResponse = naturalResponse.replace(/\[VIDEO:[^\]]+\](?:\s*[-—]\s*[^\n.!?]*)?/gi, '');
      // Pattern 2: Clean up orphaned "Check out" or "Watch" sentences that now reference nothing
      naturalResponse = naturalResponse.replace(/(?:Check out|Watch|Here's|Here is)\s*[.!?]?\s*\n?/gi, '');
      // Pattern 3: Clean up empty lines left behind
      naturalResponse = naturalResponse.replace(/\n{3,}/g, '\n\n').trim();
      console.log(`[VIDEO TOKEN] ✅ Stripped video tokens. New length: ${naturalResponse.length}`);
    }
    
    const videoTokenRegex = /\[VIDEO:\s*([^\]]+)\]/g;
    let match;
    const replacements: { original: string; replacement: string }[] = [];
    
    console.log(`[VIDEO TOKEN] 🔍 Starting enrichment scan. Video library size: ${allVideos.length}`);
    
    while ((match = videoTokenRegex.exec(naturalResponse)) !== null) {
      const tokenContent = match[1];
      const originalToken = match[0];
      
      console.log(`[VIDEO TOKEN] 📝 Found token: "${originalToken}"`);
      
      // Parse the token content - split by pipes
      const parts = tokenContent.split('|').map(p => p.trim());
      
      console.log(`[VIDEO TOKEN] 🔍 Parsing: "${parts[0]}" (${parts.length} parts total)`);
      
      let titlePattern = '';
      let instructorPattern = '';
      let startTime = '00:00';
      
      // Extract start time from any part containing "START:"
      for (const part of parts) {
        if (part.toUpperCase().startsWith('START:')) {
          startTime = part.replace(/^START:\s*/i, '').trim() || '00:00';
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // EXTRACT TIMESTAMP FROM AI PROSE: Look for timestamps mentioned near the video token
      // Search BOTH before AND after the token, picking the closest match
      // Patterns: "at 2:15", "the 2:15 mark", "from 2:15", "@ 2:15", "around 2:15"
      // ═══════════════════════════════════════════════════════════════════════════
      if (startTime === '00:00') {
        // Get text context around this token (200 chars before AND 200 chars after)
        const tokenPosition = match.index;
        const tokenEnd = tokenPosition + originalToken.length;
        const contextStart = Math.max(0, tokenPosition - 200);
        const contextEnd = Math.min(naturalResponse.length, tokenEnd + 200);
        const contextBefore = naturalResponse.substring(contextStart, tokenPosition);
        const contextAfter = naturalResponse.substring(tokenEnd, contextEnd);
        
        // Timestamp extraction patterns
        const timestampPatterns = [
          /at\s+(\d{1,2}:\d{2})/i,
          /the\s+(\d{1,2}:\d{2})\s*mark/i,
          /from\s+(\d{1,2}:\d{2})/i,
          /@\s*(\d{1,2}:\d{2})/i,
          /around\s+(\d{1,2}:\d{2})/i,
          /(\d{1,2}:\d{2})\s+for\s+the/i,
          /watch\s+(?:from\s+)?(\d{1,2}:\d{2})/i,
          /starting\s+(?:at\s+)?(\d{1,2}:\d{2})/i,
          /rewatch\s+(?:the\s+)?(\d{1,2}:\d{2})/i,
          /finish\s+(?:is\s+)?(?:at\s+)?(\d{1,2}:\d{2})/i,
          /key\s+(?:part\s+)?(?:is\s+)?(?:at\s+)?(\d{1,2}:\d{2})/i
        ];
        
        // Find closest timestamp match (prefer after-context as that's where details often appear)
        let foundTimestamp: string | null = null;
        
        // Check context AFTER token first (more common: "Watch this [VIDEO]... The key part is at 2:15")
        for (const pattern of timestampPatterns) {
          const afterMatch = contextAfter.match(pattern);
          if (afterMatch) {
            foundTimestamp = afterMatch[1];
            console.log(`[VIDEO TOKEN] Extracted timestamp from post-token prose: ${foundTimestamp}`);
            break;
          }
        }
        
        // If not found after, check context BEFORE token
        if (!foundTimestamp) {
          for (const pattern of timestampPatterns) {
            const beforeMatch = contextBefore.match(pattern);
            if (beforeMatch) {
              foundTimestamp = beforeMatch[1];
              console.log(`[VIDEO TOKEN] Extracted timestamp from pre-token prose: ${foundTimestamp}`);
              break;
            }
          }
        }
        
        if (foundTimestamp) {
          startTime = foundTimestamp;
        }
      }
      
      // Try multiple parsing strategies
      const firstPart = parts[0].trim();
      
      // Strategy 1: "Title by Instructor" format
      const byMatch = firstPart.match(/^(.+?)\s+by\s+(.+)$/i);
      if (byMatch) {
        titlePattern = byMatch[1].trim().toLowerCase().replace(/[^\w\s]/g, '');
        instructorPattern = byMatch[2].trim().toLowerCase().replace(/[^\w\s]/g, '');
        console.log(`[VIDEO TOKEN] ✅ Parsed "by" format: title="${titlePattern}", instructor="${instructorPattern}"`);
      }
      // Strategy 2: "Title - Instructor" format (dash separator)
      else if (firstPart.includes(' - ')) {
        const dashParts = firstPart.split(' - ');
        titlePattern = dashParts[0].trim().toLowerCase().replace(/[^\w\s]/g, '');
        instructorPattern = dashParts.slice(1).join(' ').trim().toLowerCase().replace(/[^\w\s]/g, '');
        console.log(`[VIDEO TOKEN] ✅ Parsed dash format: title="${titlePattern}", instructor="${instructorPattern}"`);
      }
      // Strategy 3: Pipe-separated with instructor in second part
      else if (parts.length >= 2 && !parts[1].toUpperCase().startsWith('START:')) {
        titlePattern = firstPart.toLowerCase().replace(/[^\w\s]/g, '');
        instructorPattern = parts[1].toLowerCase().replace(/[^\w\s]/g, '');
        console.log(`[VIDEO TOKEN] ✅ Parsed pipe format: title="${titlePattern}", instructor="${instructorPattern}"`);
      }
      // Strategy 4: Just title, search broadly
      else {
        titlePattern = firstPart.toLowerCase().replace(/[^\w\s]/g, '');
        instructorPattern = '';
        console.log(`[VIDEO TOKEN] ⚠️  Title-only format: title="${titlePattern}"`);
      }
      
      if (!titlePattern) {
        console.warn('[VIDEO TOKEN] ❌ Could not extract title from:', tokenContent);
        continue;
      }
      
      console.log(`[VIDEO TOKEN] 🎯 Searching for: title="${titlePattern}", instructor="${instructorPattern}"`);
      
      // Find matching video using multi-attribute scoring
      // CRITICAL FIX: Search BOTH cached videos AND current search results
      // This ensures videos recommended to the AI can be matched even if not in top 100
      const combinedVideos = [
        ...allVideos,
        ...videoLibrary.map(v => ({
          id: v.id,
          techniqueName: v.techniqueName || v.title,
          instructorName: v.instructorName,
          techniqueType: v.techniqueType,
          positionCategory: v.positionCategory,
          qualityScore: v.qualityScore,
          videoUrl: v.videoUrl,
          youtubeId: v.youtubeId
        }))
      ];
      
      // Deduplicate by id
      const seenIds = new Set<number>();
      const uniqueVideos = combinedVideos.filter(v => {
        if (seenIds.has(v.id)) return false;
        seenIds.add(v.id);
        return true;
      });
      
      let bestMatch: typeof allVideos[0] | null = null;
      let bestScore = 0;
      const MIN_CONFIDENCE = 0.50; // Raised to 50% - require TITLE match, not just instructor
      
      // ═══════════════════════════════════════════════════════════════════════════
      // TECHNIQUE VALIDATION: When user searched for a specific technique,
      // only match videos that actually contain that technique in their title/content
      // ═══════════════════════════════════════════════════════════════════════════
      const searchedTechnique = detectedTechnique?.toLowerCase() || '';
      const requireTechniqueMatch = searchedTechnique.length > 0;
      
      console.log(`[VIDEO TOKEN] 📊 Searching ${uniqueVideos.length} videos (${allVideos.length} cached + ${videoLibrary.length} from search)`);
      if (requireTechniqueMatch) {
        console.log(`[VIDEO TOKEN] 🔒 Technique validation REQUIRED: "${searchedTechnique}"`);
      }
      
      for (const v of uniqueVideos) {
        const videoTitle = (v.techniqueName || '').toLowerCase().replace(/[^\w\s]/g, '');
        const videoInstructor = (v.instructorName || '').toLowerCase().replace(/[^\w\s]/g, '');
        const videoPosition = (v.positionCategory || '').toLowerCase();
        const videoType = (v.techniqueType || '').toLowerCase();
        const videoTags = Array.isArray((v as any).tags) ? (v as any).tags.join(' ').toLowerCase() : '';
        
        // CRITICAL: If technique was searched, video MUST contain that technique
        if (requireTechniqueMatch) {
          const videoSearchableText = `${videoTitle} ${videoTags} ${videoPosition} ${videoType}`;
          if (!videoSearchableText.includes(searchedTechnique)) {
            continue; // Skip videos that don't match the searched technique
          }
        }
        
        let score = 0;
        
        // Title match (60% weight - INCREASED to prioritize technique match)
        // GUARDRAIL: Multi-word patterns get full credit, single-word patterns get proportional
        if (titlePattern.length >= 3) {
          // Count words including short BJJ terms like "gi", "no", "de", "la"
          const allWords = titlePattern.split(/\s+/).filter(w => w.length >= 1);
          const patternWordCount = allWords.length;
          
          if (videoTitle.includes(titlePattern)) {
            // Pattern is a substring of video title
            if (patternWordCount >= 2) {
              // Multi-word match (e.g. "guillotine defense") = full credit
              score += 0.6;
            } else {
              // Single-word match (e.g. "guard") = proportional credit to avoid over-matching
              const coverage = titlePattern.length / videoTitle.length;
              score += Math.min(coverage * 1.5, 0.4) * 0.6;  // Cap at 40% of the 60% weight
            }
          } else if (titlePattern.includes(videoTitle) && videoTitle.length >= 5) {
            // Video title is a substring of pattern - proportional credit
            const ratio = videoTitle.length / titlePattern.length;
            score += ratio * 0.5;
          } else {
            // Word overlap check (e.g. "scissor sweep" matches "scissor sweep from guard")
            const patternWords = titlePattern.split(/\s+/).filter(w => w.length >= 3);
            const titleWords = videoTitle.split(/\s+/).filter(w => w.length >= 3);
            const matchingWords = patternWords.filter(w => titleWords.some(tw => tw === w));  // Exact word match
            if (matchingWords.length > 0 && patternWords.length > 0) {
              const matchRatio = matchingWords.length / patternWords.length;
              // Require at least 50% word overlap for significant credit
              if (matchRatio >= 0.5) {
                score += matchRatio * 0.5;
              } else {
                score += matchRatio * 0.25;
              }
            }
          }
        }
        
        // Instructor match (30% weight)
        // Give full credit when instructor names overlap substantially
        if (instructorPattern.length >= 3) {
          if (videoInstructor.includes(instructorPattern) || instructorPattern.includes(videoInstructor)) {
            // One name contains the other - good match
            const longer = Math.max(videoInstructor.length, instructorPattern.length);
            const shorter = Math.min(videoInstructor.length, instructorPattern.length);
            const ratio = shorter / longer;
            // Give proportional credit based on how much of the name matches
            score += ratio * 0.3;
          }
        }
        
        // Position/Type bonus (10% weight) - check if token contains position/type keywords
        const tokenFull = `${titlePattern} ${instructorPattern}`.toLowerCase();
        if (videoPosition && tokenFull.includes(videoPosition)) {
          score += 0.05;
        }
        if (videoType && tokenFull.includes(videoType)) {
          score += 0.05;
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = v;
        }
      }
      
      const matchingVideo = bestScore >= MIN_CONFIDENCE ? bestMatch : null;
      
      if (matchingVideo && (matchingVideo.youtubeId || matchingVideo.videoUrl)) {
        // Use youtubeId directly if available, otherwise extract from URL
        let videoId = matchingVideo.youtubeId || '';
        if (!videoId && matchingVideo.videoUrl) {
          const youtubeMatch = matchingVideo.videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
          videoId = youtubeMatch ? youtubeMatch[1] : '';
        }
        
        if (videoId) {
          // ═══════════════════════════════════════════════════════════════
          // USE GEMINI TIMESTAMP: Extract best timestamp from video's Gemini analysis
          // Priority: 1) AI-specified start time, 2) Gemini keyTimestamps, 3) Default 00:00
          // ═══════════════════════════════════════════════════════════════
          let bestTimestamp = startTime || '00:00';
          
          // If AI didn't specify a meaningful timestamp, use Gemini's key timestamp
          // Skip 0:00/00:00 and find the first MEANINGFUL timestamp
          if ((bestTimestamp === '00:00' || bestTimestamp === '0:00') && matchingVideo.keyTimestamps) {
            const keyTs = matchingVideo.keyTimestamps;
            // keyTimestamps can be a string like "0:45 - Grip setup, 2:15 - Sweep mechanics"
            // or an array of timestamp objects
            if (typeof keyTs === 'string' && keyTs.length > 0) {
              // Find ALL timestamps and pick first non-zero one
              const allTs = keyTs.match(/(\d{1,2}:\d{2})/g);
              if (allTs) {
                for (const ts of allTs) {
                  if (ts !== '0:00' && ts !== '00:00') {
                    bestTimestamp = ts;
                    break;
                  }
                }
              }
            } else if (Array.isArray(keyTs) && keyTs.length > 0) {
              // Iterate through array to find first non-zero timestamp
              for (const item of keyTs) {
                let extractedTs: string | null = null;
                if (typeof item === 'object' && (item.time || item.timestamp)) {
                  extractedTs = item.time || item.timestamp;
                } else if (typeof item === 'string') {
                  const match = item.match(/(\d{1,2}:\d{2})/);
                  if (match) extractedTs = match[1];
                }
                if (extractedTs && extractedTs !== '0:00' && extractedTs !== '00:00') {
                  bestTimestamp = extractedTs;
                  break;
                }
              }
            }
          }
          
          // Build the full token: [VIDEO: title | instructor | duration | videoId | id | startTime]
          // Duration: use "full" as placeholder (frontend can show "Watch Full Video")
          // CRITICAL: Include startTime (6th field) so frontend can display it and show action buttons
          const fullToken = `[VIDEO: ${matchingVideo.techniqueName || titlePattern} | ${matchingVideo.instructorName || instructorPattern} | full | ${videoId} | ${matchingVideo.id} | ${bestTimestamp}]`;
          
          replacements.push({ original: originalToken, replacement: fullToken });
          console.log(`[VIDEO TOKEN] ✅ Matched (confidence: ${(bestScore * 100).toFixed(0)}%): ${titlePattern} → ${matchingVideo.techniqueName} @${bestTimestamp}`);
        } else {
          console.warn('[VIDEO TOKEN] ⚠️  No YouTube ID found for:', matchingVideo.videoUrl);
        }
      } else {
        console.warn(`[VIDEO TOKEN] ❌ No match found (best: ${(bestScore * 100).toFixed(0)}%):`, titlePattern, 'by', instructorPattern);
      }
    }
    
    // Apply all replacements - use replaceAll to catch ALL occurrences of the same token
    for (const { original, replacement } of replacements) {
      // Replace ALL instances of this token (same video may be mentioned multiple times)
      naturalResponse = naturalResponse.split(original).join(replacement);
    }
    
    // Telemetry: Log enrichment stats for QA
    const totalTokens = (naturalResponse.match(/\[VIDEO:/g) || []).length;
    const enrichedTokens = replacements.length;
    const missedTokens = totalTokens - enrichedTokens;
    
    // 📊 DIAGNOSTICS: Capture video token stats
    diagnosticData.videoTokensInResponse = totalTokens;
    diagnosticData.videoTokensEnriched = enrichedTokens;
    
    if (totalTokens > 0) {
      console.log(`[VIDEO TOKEN TELEMETRY] Total: ${totalTokens} | Enriched: ${enrichedTokens} | Missed: ${missedTokens} (${((enrichedTokens / totalTokens) * 100).toFixed(0)}% success rate)`);
    }
    
    if (replacements.length > 0) {
      console.log(`[VIDEO TOKEN] ✅ Replaced ${replacements.length} video token(s) with full metadata`);
    }
    
    // 🚀 FAST STREAMING: Send composed response with video token enrichment
    // This is the ONLY streaming we should do - real-time streaming was disabled above
    const fullResponse = naturalResponse;
    const chunkSize = 50; // Larger chunks for faster delivery
    
    console.log('[STREAMING] Sending composed response with video tokens...');
    
    for (let i = 0; i < fullResponse.length; i += chunkSize) {
      const chunk = fullResponse.substring(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ chunk: chunk })}\n\n`);
    }
    
    console.log('✅ Stream complete. Response length:', fullResponse.length);
    
    // Save to database (transactional - both user and AI messages)
    try {
      await saveConversation(userId.toString(), message, fullResponse);
      console.log('✅ Saved to database');
    } catch (dbError: any) {
      console.error('❌ Database save error:', dbError);
      // Continue - don't fail the stream just because DB write failed
    }
    
    // PHASE 3: Process conversation for learning loop (async, non-blocking)
    console.log('🔄 Triggering learning loop for user:', userId);
    processLearningLoop(userId.toString(), messages, fullResponse).catch(err => {
      console.error('❌ Learning loop error (non-critical):', err);
    });
    
    // PHASE 3B: Extract technique signals for population learning (async, non-blocking)
    processMessageForTechniqueExtraction(userId.toString(), message).then(diagnostic => {
      if (diagnostic.techniqueExtracted) {
        console.log(`🧬 [TECHNIQUE EXTRACTION] ${JSON.stringify(diagnostic)}`);
      }
    }).catch(err => {
      console.error('❌ Technique extraction error (non-critical):', err);
    });
    
    // PHASE 3C: Track technique requests for Meta Analyzer (async, non-blocking)
    // This feeds the curation prioritization system
    // Pass video result data for content gap analysis
    const videoResultData = {
      hadVideoResult: enrichedTokens > 0,
      videoCount: enrichedTokens
    };
    extractTechniqueRequests(userId.toString(), message, userProfile?.beltLevel, userProfile?.style, videoResultData).catch(err => {
      console.error('❌ Meta tracker error (non-critical):', err);
    });
    
    // PHASE 3D: Extract structured data for Professor OS Data Infrastructure (async, non-blocking)
    // This tracks video recommendations, engagement patterns, breakthroughs, etc.
    import('../utils/data-extraction').then(({ extractAndSaveConversationData }) => {
      extractAndSaveConversationData(userId.toString(), message, fullResponse, null).catch(err => {
        console.error('❌ Data extraction error (non-critical):', err);
      });
    }).catch(err => {
      console.error('❌ Failed to load data extraction module:', err);
    });
    
    res.write('data: [DONE]\n\n');
    res.end();
    
    // Final timing summary
    const totalTime = Date.now() - startTime;
    console.log('═══════════════════════════════════════');
    console.log('⏱️  TOTAL REQUEST TIME:', totalTime + 'ms');
    console.log('═══════════════════════════════════════');
    
    // 📊 DIAGNOSTICS: Final save (success case)
    diagnosticData.timingBreakdown!.streamingMs = totalTime - (
      diagnosticData.timingBreakdown!.dataLoadMs + 
      diagnosticData.timingBreakdown!.videoSearchMs + 
      diagnosticData.timingBreakdown!.promptBuildMs + 
      diagnosticData.timingBreakdown!.claudeApiMs + 
      diagnosticData.timingBreakdown!.validationMs
    );
    diagnosticData.timingBreakdown!.totalMs = totalTime;
    
    // Save diagnostics asynchronously (don't block response)
    saveDiagnostics(userId.toString(), message, diagnosticData as DiagnosticData).catch(err => {
      console.error('❌ Failed to save diagnostics:', err);
    });
    
    // 📊 ACTIVITY TRACKING: Log to profQueries for dashboard metrics (async, non-blocking)
    try {
      // Extract recommended videos from the response for tracking
      const videoTokenMatches = fullResponse.match(/\[VIDEO:\s*([^\]]+)\]/g) || [];
      const recommendedVideosList = videoTokenMatches.map(token => {
        const content = token.replace(/\[VIDEO:\s*/, '').replace(/\]$/, '');
        const parts = content.split('|').map(p => p.trim());
        return {
          title: parts[0] || '',
          instructor: parts[1] || '',
          videoId: parts[3] || '',
          id: parts[4] ? parseInt(parts[4], 10) : null
        };
      }).filter(v => v.title);
      
      db.insert(profQueries).values({
        userId: userId.toString(),
        query: message,
        userQuestion: message, // Duplicate for dashboard display
        queryType: 'chat',
        responseTime: totalTime,
        useMultiAgent: false, // Claude route doesn't use multi-agent
        recommendedVideos: recommendedVideosList.length > 0 ? recommendedVideosList : null,
        error: null
      }).then(() => {
        console.log(`📊 [ACTIVITY] Logged query to profQueries (${totalTime}ms, ${recommendedVideosList.length} videos)`);
      }).catch((profError: any) => {
        console.error('❌ profQueries logging error (non-critical):', profError.message);
      });
    } catch (profError: any) {
      console.error('❌ profQueries extraction error (non-critical):', profError.message);
    }
    
  } catch (error: any) {
    console.error('❌ CLAUDE STREAM ERROR:', error);
    console.error('❌ Error type:', error.constructor?.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ User message was:', message);
    
    // 📊 DIAGNOSTICS: Save diagnostics on error
    if (userId && message) {
      diagnosticData.timingBreakdown!.totalMs = Date.now() - startTime;
      diagnosticData.validationStatus = 'failed';
      diagnosticData.validationIssues = [error.message || 'Unknown error'];
      
      saveDiagnostics(userId.toString(), message, diagnosticData as DiagnosticData).catch(err => {
        console.error('❌ Failed to save error diagnostics:', err);
      });
    }
    
    // Create user-friendly error message
    let userFriendlyError = error.message || 'Something went wrong';
    
    // Check for content policy / safety filter errors from Claude
    const errorMsg = (error.message || '').toLowerCase();
    if (errorMsg.includes('content') || errorMsg.includes('policy') || 
        errorMsg.includes('safety') || errorMsg.includes('refused') ||
        errorMsg.includes('harmful') || errorMsg.includes('inappropriate')) {
      userFriendlyError = "I had trouble with that message. This can happen when certain words trigger safety filters, even in normal BJJ context like 'I got murdered from mount.' Could you try rephrasing?";
    }
    
    // Check for database connection errors (timeouts, connection refused, etc.)
    if (errorMsg.includes('connect_timeout') || errorMsg.includes('connection') || 
        errorMsg.includes('timeout') || errorMsg.includes('econnrefused') ||
        errorMsg.includes('pool') || errorMsg.includes('database')) {
      console.error('❌ [CHAT] Database connection error detected');
      userFriendlyError = "Temporary connection issue. Please try again in a moment.";
    }
    
    // Check if headers were already sent (streaming started)
    if (res.headersSent) {
      // SSE error event for client-side handling
      res.write(`data: ${JSON.stringify({ error: userFriendlyError })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Headers not sent yet - safe to send JSON error
      res.status(500).json({ 
        error: userFriendlyError,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
}

async function saveConversation(userId: string, userMessage: string, aiResponse: string) {
  // Save user message
  await db.insert(aiConversationLearning).values({
    userId,
    messageText: userMessage,
    messageType: 'user_sent',
    conversationDate: new Date()
  });
  
  // Save AI response
  await db.insert(aiConversationLearning).values({
    userId,
    messageText: aiResponse,
    messageType: 'ai_response',
    conversationDate: new Date()
  });
}

// PHASE 3: Learning Loop Processing
async function processLearningLoop(
  userId: string,
  messages: { role: 'user' | 'assistant', content: string }[],
  latestResponse: string
) {
  console.log('[LEARNING LOOP] Starting conversation analysis...');
  
  // Convert message format for learning analyzer
  const conversationMessages: ConversationMessage[] = [
    ...messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: new Date()
    })),
    // Add the latest AI response
    {
      role: 'assistant' as const,
      content: latestResponse,
      timestamp: new Date()
    }
  ];
  
  // Process conversation and store insights
  await processConversation({
    userId,
    messages: conversationMessages
  });
  
  console.log('[LEARNING LOOP] ✅ Analysis complete');
}
