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
import { searchVideos, fallbackSearch, formatVideosForPrompt, extractSearchIntent, getSessionContext, updateSessionContext } from '../videoSearch';
import { processMessageForTechniqueExtraction } from '../technique-extraction';
import { extractTechniqueRequests } from '../technique-extractor';
import { professorOSCache } from '../services/professor-os-cache';
import { detectTopicsFromMessage, synthesizeKnowledgeByTopic, formatSynthesizedKnowledge } from '../utils/knowledge-synthesizer';

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
      modelUsed: 'claude-sonnet-4-5',
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
      queries.push(db.select().from(bjjUsers).where(eq(bjjUsers.id, userId)).limit(1));
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
    
    // Execute parallel queries
    const results = await Promise.all(queries);
    
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
    
    // 🔍 DYNAMIC VIDEO SEARCH: Search videos based on user message intent + session context
    t2 = Date.now();
    const sessionContext = getSessionContext(userId);
    let videoSearchResult = await searchVideos({
      userMessage: message,
      userId: userId, // For follow-up reference resolution (e.g., "his videos")
      conversationContext: {
        userGiNogi: userProfile.style || 'both',
        sessionFocus: sessionContext.sessionFocus,
        recommendedVideoIds: sessionContext.recommendedVideoIds,
        lastInstructor: sessionContext.lastInstructor // Track last mentioned instructor
      }
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL: Only use fallback when search returned 0 results AND noMatchFound is NOT set
    // If noMatchFound is true, user searched for something we don't have - DON'T return random videos
    // ═══════════════════════════════════════════════════════════════════════════
    if (videoSearchResult.videos.length === 0 && !videoSearchResult.noMatchFound) {
      console.log('🔄 No exact matches (position/instructor only), trying fallback search...');
      videoSearchResult = await fallbackSearch(message);
    } else if (videoSearchResult.noMatchFound) {
      console.log('❌ No videos found for requested technique - NOT using fallback (would return wrong videos)');
      console.log(`   Search terms: [${videoSearchResult.searchIntent.searchTerms.join(', ')}]`);
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
      tags: v.tags || [],
      relevanceScore: Number(v.qualityScore) || 0,
      keyTimestamps: v.keyTimestamps || []
    }));
    
    // 🚀 CACHE: Top quality videos for token enrichment (1 hour TTL)
    const VIDEO_CACHE_KEY = 'top_quality_videos_100';
    let allVideos = professorOSCache.getVideos(VIDEO_CACHE_KEY);
    
    if (!allVideos) {
      allVideos = await db.select({
        id: aiVideoKnowledge.id,
        techniqueName: aiVideoKnowledge.title,
        instructorName: aiVideoKnowledge.instructorName,
        techniqueType: aiVideoKnowledge.techniqueType,
        positionCategory: aiVideoKnowledge.positionCategory,
        qualityScore: aiVideoKnowledge.qualityScore,
        videoUrl: aiVideoKnowledge.videoUrl
      })
        .from(aiVideoKnowledge)
        .where(and(
          sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 6.5`,
          sql`${aiVideoKnowledge.youtubeId} IS NOT NULL AND ${aiVideoKnowledge.youtubeId} != ''`,
          sql`${aiVideoKnowledge.thumbnailUrl} IS NOT NULL AND ${aiVideoKnowledge.thumbnailUrl} != ''`,
          sql`${aiVideoKnowledge.videoUrl} IS NOT NULL AND ${aiVideoKnowledge.videoUrl} != ''`,
          sql`${aiVideoKnowledge.title} IS NOT NULL AND ${aiVideoKnowledge.title} != ''`,
          sql`${aiVideoKnowledge.instructorName} IS NOT NULL AND ${aiVideoKnowledge.instructorName} != ''`,
          sql`${aiVideoKnowledge.techniqueType} IS NOT NULL AND ${aiVideoKnowledge.techniqueType} != ''`,
          exists(
            db.select({ one: sql`1` })
              .from(videoKnowledge)
              .where(eq(videoKnowledge.videoId, aiVideoKnowledge.id))
          )
        ))
        .orderBy(desc(aiVideoKnowledge.qualityScore))
        .limit(100);
      
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
    const systemPrompt = await buildSystemPrompt(userId.toString(), struggleAreaBoost, {
      // Preloaded data to avoid duplicate queries
      preloadedUser: userProfile,
      preloadedVideos: videoLibrary,
      // Dynamic video search results (topic-specific)
      dynamicVideos: videoSearchResult.videos.slice(0, 10).map(v => ({
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
      searchTermsUsed: videoSearchResult.searchIntent.searchTerms || []
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
    
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      temperature: 0.7, // Conversational but focused
      system: finalSystemPrompt,
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
          videoUrl: v.videoUrl
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
      const MIN_CONFIDENCE = 0.40; // Require 40% confidence minimum (lowered for better matching)
      
      console.log(`[VIDEO TOKEN] 📊 Searching ${uniqueVideos.length} videos (${allVideos.length} cached + ${videoLibrary.length} from search)`);
      
      for (const v of uniqueVideos) {
        const videoTitle = (v.techniqueName || '').toLowerCase().replace(/[^\w\s]/g, '');
        const videoInstructor = (v.instructorName || '').toLowerCase().replace(/[^\w\s]/g, '');
        const videoPosition = (v.positionCategory || '').toLowerCase();
        const videoType = (v.techniqueType || '').toLowerCase();
        
        let score = 0;
        
        // Title match (50% weight)
        if (videoTitle.includes(titlePattern) || titlePattern.includes(videoTitle)) {
          const longer = Math.max(videoTitle.length, titlePattern.length);
          const shorter = Math.min(videoTitle.length, titlePattern.length);
          score += (shorter / longer) * 0.5;
        }
        
        // Instructor match (40% weight)
        if (videoInstructor.includes(instructorPattern) || instructorPattern.includes(videoInstructor)) {
          const longer = Math.max(videoInstructor.length, instructorPattern.length);
          const shorter = Math.min(videoInstructor.length, instructorPattern.length);
          score += (shorter / longer) * 0.4;
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
      
      if (matchingVideo && matchingVideo.videoUrl) {
        // Extract YouTube video ID from URL
        const youtubeMatch = matchingVideo.videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        const videoId = youtubeMatch ? youtubeMatch[1] : '';
        
        if (videoId) {
          // Build the full token: [VIDEO: title | instructor | duration | videoId | id | startTime]
          // Duration: use "full" as placeholder (frontend can show "Watch Full Video")
          // CRITICAL: Include startTime (6th field) so frontend can display it and show action buttons
          const fullToken = `[VIDEO: ${matchingVideo.techniqueName || titlePattern} | ${matchingVideo.instructorName || instructorPattern} | full | ${videoId} | ${matchingVideo.id} | ${startTime}]`;
          
          replacements.push({ original: originalToken, replacement: fullToken });
          console.log(`[VIDEO TOKEN] ✅ Matched (confidence: ${(bestScore * 100).toFixed(0)}%): ${titlePattern} → ${matchingVideo.techniqueName} @${startTime}`);
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
    extractTechniqueRequests(userId.toString(), message, userProfile?.beltLevel, userProfile?.style).catch(err => {
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
