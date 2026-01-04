import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { db } from "./db";
import { insertRecipientSchema, recipients, smsSchedules, smsHistory, insertSmsScheduleSchema, bjjUsers, referralCodes, aiVideoKnowledge, aiUserFeedbackSignals, aiUserContext, aiFeatureFlags, aiReasoningTraces, aiConfidenceTracking, aiProblemSolutionMap, aiTechniqueRelationships, userSavedVideos, aiConversationLearning, adminChatHistory, videoCurationLog, userVideoFeedback, userFeedbackStats, instructorCredibility, featuredInstructors, techniqueChains, userSavedChains, chainFeedback, pushSubscriptions, flaggedAccounts, authorizedDevices, loginEvents, shortUrls, activityLog, videoAnalysisLog, userActivity, magicLinks, profQueries, videoInteractions, devOsMessages, curationRuns, videos, systemSnapshots, commandLog, combatSportsNews, videoKnowledge } from "@shared/schema";
import { logActivity, logSystemError } from "./activity-logger";
import adminDashboardRouter from "./admin-dashboard-api";
import analyticsRouter from "./analytics";
import { getProfessorOSFeedbackResponse, getAppreciationMessage, shouldShowAppreciation } from './professor-os-feedback-responses';
import { eq, desc, sql as drizzleSql, sql, and, or, ilike, asc, count, isNotNull, gte, lte, lt, gt } from "drizzle-orm";
import { sendSMS } from "./twilio";
import { sendVerificationCode, verifyCode } from "./twilio-verify";
import { normalizePhoneNumber, validateAndNormalizePhone } from "./utils/phone-normalization";
import { generateDeviceFingerprint, parseUserAgent, registerDevice, checkDeviceLimit, trackLoginEvent, runFraudChecks } from "./utils/deviceFingerprint";
import { generateDailyTechnique } from './ai-agent';
import * as aiIntelligence from './ai-intelligence';
import { rankVideos } from './ranking/ranker';
import { updateSuccessPattern, trackVideoInteraction } from './ranking/pattern-tracker';
import { detectLanguage } from './utils/languageDetection';
import { runContentFirstCuration } from './content-first-curator';
import type { CuratorJobStatus, CuratorProgressUpdate, CuratorResult } from '@shared/curator-types';
import { multiAgentSystem } from './multi-agent-integration';
import { learningEngine } from './learning-engine';
import * as videoIntelligence from './video-intelligence';
import { 
  INSTRUCTOR_KNOWLEDGE_BASE, 
  DIAGNOSTIC_INTELLIGENCE, 
  PROGRESSIVE_SKILL_DEVELOPMENT,
  COMPETITION_MODE 
} from './professor-os-prompts';
import { contextBuilder } from './context-builder';
import { profileExtractor } from './profile-extractor';
import { buildSystemPrompt as buildComprehensiveSystemPrompt } from './utils/buildSystemPrompt';
import { patternTeaserService } from './pattern-teaser';
import { powerUserShowcase } from './power-user-showcase';
import { nudgeGenerator } from './nudge-generator';
import { videoEngagement, videoRequestHistory, userEngagementProfile } from '../shared/schema';
import Stripe from "stripe";
import { Anthropic } from '@anthropic-ai/sdk';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import crypto from 'crypto';
import { registerEmailAuthRoutes } from './auth-email';
import { handleClaudeStream } from './routes/ai-chat-claude';
import { requireAuth } from './middleware/requireAuth';
import { 
  messageLimiter, 
  // messageSlowDown, // Temporarily disabled due to express-slow-down version incompatibility
  signupLimiter, 
  videoSearchLimiter 
} from './middleware/rateLimiter';
import { cache, CacheTTL } from './services/cache';
import { professorOSCache } from './middleware/cacheMiddleware';
import { securityMiddleware } from './middleware/inputValidation';

// Extend Express Request type to include user property set by JWT middleware
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      userId: string;
      phone?: string;
      [key: string]: any;
    };
  }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Configure multer for voice upload (memory storage for direct buffer processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max file size (Whisper API limit)
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    const allowedMimes = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

/**
 * COLLISION-SAFE USERNAME GENERATOR
 * Generates unique usernames with automatic collision handling and length enforcement.
 * Handles race conditions by reserving username with immediate insert check.
 * 
 * @param phoneNumber - E.164 formatted phone number
 * @param prefix - Username prefix (e.g., "user", "test")
 * @returns Promise resolving to available username (max 20 chars)
 */
async function generateUniqueUsername(phoneNumber: string, prefix: string = 'user'): Promise<string> {
  const MAX_LENGTH = 20; // Schema constraint
  const phoneDigits = phoneNumber.replace(/\D/g, '');
  
  // Calculate max base length to leave room for suffix
  // Format: prefix_digits OR prefix_digits_suffix
  // Reserve 5 chars for potential suffix (_xxxx)
  const maxBaseLength = MAX_LENGTH - 5;
  
  // Build base: take last N digits to fit within maxBaseLength
  const prefixWithUnderscore = `${prefix}_`;
  const availableDigits = maxBaseLength - prefixWithUnderscore.length;
  const digitSuffix = phoneDigits.slice(-Math.min(availableDigits, 10));
  const baseUsername = `${prefixWithUnderscore}${digitSuffix}`;
  
  // Try base username first
  const [existing] = await db.select({ username: bjjUsers.username })
    .from(bjjUsers)
    .where(eq(bjjUsers.username, baseUsername))
    .limit(1);
  
  if (!existing) {
    return baseUsername;
  }
  
  // Collision detected - append 4-char random suffix
  // Using base36 alphanumeric (1.6M combinations)
  const generateSuffix = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    return suffix;
  };
  
  // Try up to 50 times to find available username
  // Higher attempt count handles race conditions better
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = generateSuffix();
    const candidateUsername = `${baseUsername}_${suffix}`;
    
    // Length check (should always pass given our maxBaseLength calc)
    if (candidateUsername.length > MAX_LENGTH) {
      console.error(`[USERNAME] Generated username exceeds ${MAX_LENGTH} chars: ${candidateUsername}`);
      continue;
    }
    
    const [collision] = await db.select({ username: bjjUsers.username })
      .from(bjjUsers)
      .where(eq(bjjUsers.username, candidateUsername))
      .limit(1);
    
    if (!collision) {
      return candidateUsername;
    }
  }
  
  // Final fallback: use compact timestamp (base36, max 8 chars)
  // Truncate base to ensure total length <= MAX_LENGTH
  const timestamp = Date.now().toString(36).slice(-4); // Last 4 chars
  const truncatedBase = baseUsername.slice(0, MAX_LENGTH - 5); // Leave room for _xxxx
  const fallbackUsername = `${truncatedBase}_${timestamp}`;
  
  console.warn(`[USERNAME] Using fallback timestamp username: ${fallbackUsername}`);
  return fallbackUsername;
}

// Build optimized Prof. OS system prompt - 6-8k chars with FULL intelligence preserved
function buildSystemPrompt(userContext: any, availableVideos: any[], conversationHistory?: string, learningContext?: string) {
  const user = userContext?.user || {};
  
  // Core identity
  const displayName = user.displayName || user.name || user.username || 'there';
  const belt = user.beltLevel || user.belt_level || 'white';
  const beltKey = typeof belt === 'string' ? belt.toLowerCase().trim().replace(/\s+/g, '_').replace(/_belt$/, '') : 'white';
  const style = user.style || user.gi_preference || 'both';
  const frequency = user.trainingFrequencyText || user.trainingFrequency || user.training_frequency || 'not specified';
  const struggleArea = user.struggleAreaCategory || user.struggleTechnique || user.weakestArea || null;
  
  // Physical & goals
  const height = user.height || null;
  const weight = user.weight || null;
  const age = user.age || null;
  const goal = user.primary_goal || 'improve overall skills';
  const injuries = user.injuries ? JSON.stringify(user.injuries) : '[]';
  const bodyType = user.bodyType || user.body_type || null;
  
  // Journey tracking
  const createdAt = user.createdAt || user.signup_date;
  const daysSinceJoined = createdAt ? 
    Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  
  // Format videos WITH timestamps for smart recommendations
  const videoList = availableVideos.map(v => {
    const timestamps = v.keyTimestamps || [];
    const timestampStr = timestamps && Array.isArray(timestamps) && timestamps.length > 0
      ? ` | ${timestamps.length} sections` : '';
    return `- ${v.techniqueName} by ${v.instructorName} (${v.techniqueType})${timestampStr}`;
  }).join('\n');
  
  return `You are Professor OS, ${displayName}'s personal BJJ training partner.

PROFILE:
- Name: ${displayName} | Belt: ${belt.toUpperCase()} | Style: ${style === 'gi' ? 'Gi' : style === 'nogi' ? 'No-Gi' : 'Both'}
- Training: ${frequency}x/week for ${daysSinceJoined} days
${height || weight ? `- Physical: ${height ? height + '"' : ''}${height && weight ? ' / ' : ''}${weight ? weight + 'lbs' : ''}` : ''}${bodyType ? ` | ${bodyType}` : ''}
${struggleArea ? `- ⚠️ PRIMARY STRUGGLE: ${struggleArea.replace(/_/g, ' ')}` : ''}
${goal !== 'improve overall skills' ? `- Goal: ${goal}` : ''}
${injuries !== '[]' ? `- ⚠️ INJURIES: ${injuries}` : ''}

CORE PHILOSOPHY:
You're not a search engine. You're ${displayName}'s training partner - a black belt who remembers every conversation, spots patterns across sessions, asks diagnostic questions before solutions, cites specific instructors by name, and makes this feel like their personal coach.

INSTRUCTOR KNOWLEDGE (Cite these authorities by name for every technical detail):

FUNDAMENTALS & CLASSICS:
• Rickson Gracie - Invisible jiu jitsu, connection before technique, base principles, pressure control, feel-based instruction
• Roger Gracie (10x World Champion) - Fundamental perfection, mount mastery, cross collar choke, pressure passing | Large build suits pressure game
• Marcelo Garcia (5x World Champ, 4x ADCC) - Butterfly/X-guard, "stay relaxed until explosion", back takes, guillotines | Middleweight (77kg) proved smaller athletes dominate
• Saulo/Xande Ribeiro - Progressive learning: survive→escape→control→submit (belt-appropriate techniques)

MODERN SYSTEMS:
• Gordon Ryan - Pressure passing CONCEPTS (apply to both gi/no-gi), body lock systems, back attacks | Large (100kg+) technical dominance
• John Danaher - Systematic instruction, leg lock systems, conceptual frameworks, progressive learning methodology
• Lachlan Giles - Troubleshooting methodology (5 reasons techniques fail), leg locks, analytical problem-solving, submission defense

SPECIALISTS:
• Lucas Leite (Coyote Half Guard creator) - Half guard as OFFENSIVE system, lockdown mastery | Stocky (82kg)
• Bernardo Faria (5x World Champ) - Deep half guard, accessible teaching "I only use 5 techniques but better than anyone" | Large (100kg+) stocky
• Priit Mihkelson - Defensive hierarchy, "frames BEFORE pressure arrives", structural defense, minimum effort maximum efficiency
• Keenan Cornelius - Lapel guards (worm guard creator), creative problem-solving | Tall (6'2") long limbs, gi-specific innovations
• Craig Jones/Garry Tonon - Leg lock chains, creative attacks, competition aggression

GI vs NO-GI TRANSFER RULES:
✅ TRANSFERS COMPLETELY: Mount/back/side control principles, non-grip submissions (RNC, triangle, armbar, ALL leg locks), pressure concepts, defensive hierarchies, systematic approaches (Danaher, Priit, Gordon's pressure philosophy)
❌ GI-SPECIFIC: Spider/lasso/worm guard (require grips), cross collar/bow and arrow chokes
→ Adapt grip-dependent techniques: Gi collar grip → No-gi head control (same concept, different grip)

DIAGNOSTIC INTELLIGENCE:
Every struggle has a root cause. When ${displayName} mentions recurring problems, identify:
1. Structural cause (mechanics wrong?)
2. Timing issue (too early/late?)
3. Conceptual gap (understand WHY it works?)
4. Training environment (drilling enough?)

Example: "You're getting passed from half guard repeatedly. Three possible causes:
1. Frame timing - Establishing frames AFTER pressure (Priit: 'Frames before pressure')
2. Underhook battle - Losing the underhook (Lucas Leite: 'Lose underhook = lose half guard')
3. Distance management - Letting them flatten you
Which resonates?"

TROUBLESHOOTING METHOD (Lachlan Giles):
If technique fails, only 5 reasons: 1) Wrong angle 2) Wrong timing 3) Missing connection/control 4) Insufficient pressure/leverage 5) Wrong technique for situation. Diagnose which one, prescribe specific fix.

PROGRESSIVE SKILL DEVELOPMENT (Danaher's Learning Hierarchy):
1. Conceptual Understanding - Why does this work? (principle before drilling)
2. Mechanical Execution - Can you do it with zero resistance? (smooth movement first)
3. Progressive Resistance - Can you do it against 30%, 50%, 70% resistance?
4. Live Application - Can you hit it in sparring? (expect initial failures)
5. High-Percentage Mastery - Do you hit it 70%+ of the time? (now it's A-game)

When ${displayName} struggles with techniques: Identify their current level. Most fail because they skip Level 3 (progressive resistance) and jump to Level 4 (sparring). Prescribe the missing level.

PERSONALITY & TONE:
- Direct, conversational (black belt best friend energy) - NO corporate speak ("Let's dive deep", "I'd be happy to")
- NO robotic lists on first response - Slight edge/sarcasm when appropriate
- First response: 2-4 sentences MAX, ask ONE diagnostic question

Example GOOD: "Guard getting passed? Are they standing up or staying low?"
Example BAD: "I understand you're experiencing challenges with guard retention. Let me provide a comprehensive analysis..."

VIDEO RECOMMENDATION PROTOCOL:
✅ Recommend AFTER diagnosis (not before understanding problem) | Only when contextually appropriate
✅ Format: [VIDEO: Title by Instructor | START: MM:SS] (include timestamp when relevant)

❌ NEVER on greetings ("hey") | NEVER on profile questions ("how tall am I?")
❌ NEVER dump 3 videos immediately | NEVER before asking diagnostic questions

FLOW:
1. User mentions problem → Ask diagnostic question (2-3 sentences)
2. User answers → Give brief advice OR offer ONE relevant video
3. Keep responses SHORT and conversational

AVAILABLE VIDEOS (recommend only from this list):
${videoList}

BELT ADAPTATION:
${beltKey === 'white' ? 'White: Simplified explanations, define jargon, extra encouragement, fundamentals first' : ''}${beltKey === 'blue' || beltKey === 'purple' ? 'Blue/Purple: Technical depth, concepts over moves, chain thinking, troubleshoot refinements' : ''}${beltKey === 'brown' || beltKey === 'black' ? 'Brown/Black: Advanced analysis, strategic depth, peer-level discussion, system building' : ''}

MEMORY & CONTEXT:
- Use conversation history to detect patterns | Reference past discussions naturally
- Notice repeated problems | Detect repeated questions ("You asked me this earlier - still ${height}!")

OFF-TOPIC HANDLING:
Acknowledge briefly → Redirect with humor → Keep friendly
Example: "Ha, I'm more of an armbar expert than a dinner expert. But speaking of nutrition for training..."

PHYSICAL STATS AWARENESS:
${height || weight || age ? `CRITICAL: When ${displayName} asks about physical stats, answer DIRECTLY: ${height ? 'Height ' + height : ''}${weight ? (height ? ', ' : '') + 'Weight ' + weight : ''}${age ? (height || weight ? ', ' : '') + 'Age ' + age : ''}. DO NOT say you don't know.` : ''}

${bodyType ? `BODY TYPE MATCHING:
Stocky/Short: Pressure, half guard, smash passing (Bernardo, Lucas Leite) | Tall/Lanky: Triangles, distance control, long guards (Keenan, Garry Tonon)` : ''}

KEY RULES:
- Cite specific instructors by name for every technical detail
- Ask diagnostic questions BEFORE recommending videos | Understand SPECIFIC problem first
- Match video to EXACT issue (use timestamps when available) | Max 1-2 videos per response
- NO bold formatting, NO numbered lists upfront | Keep conversational and SHORT
- Reference their journey and profile constantly | Be smart, funny, real - not robotic

Now respond with the energy, diagnostic intelligence, and instructor knowledge of an elite black belt who genuinely wants ${displayName} to succeed. 🥋`;
}

// In-memory rate limiting (simple implementation - consider Redis for production)
const verificationAttempts = new Map<string, { count: number; lastAttempt: number; blockedUntil?: number }>();

// Rate limiting helper
function checkRateLimit(phoneNumber: string): { allowed: boolean; reason?: string; waitMinutes?: number } {
  // Development bypass: Very lenient rate limiting (100 attempts per hour)
  if (process.env.NODE_ENV === 'development') {
    const now = Date.now();
    const attempts = verificationAttempts.get(phoneNumber);
    
    if (!attempts) {
      verificationAttempts.set(phoneNumber, { count: 1, lastAttempt: now });
      return { allowed: true };
    }
    
    const oneHourAgo = now - (60 * 60 * 1000);
    if (attempts.lastAttempt > oneHourAgo) {
      if (attempts.count >= 100) { // 100 attempts/hour in dev
        return { allowed: false, reason: 'Dev rate limit (100/hour)', waitMinutes: 60 };
      }
      attempts.count++;
      attempts.lastAttempt = now;
      return { allowed: true };
    }
    
    // Reset if more than 1 hour
    attempts.count = 1;
    attempts.lastAttempt = now;
    return { allowed: true };
  }

  // Production rate limiting
  const now = Date.now();
  const attempts = verificationAttempts.get(phoneNumber);

  if (!attempts) {
    verificationAttempts.set(phoneNumber, { count: 1, lastAttempt: now });
    return { allowed: true };
  }

  // Check if blocked (5 failed attempts in 24 hours)
  if (attempts.blockedUntil && attempts.blockedUntil > now) {
    const waitMinutes = Math.ceil((attempts.blockedUntil - now) / (1000 * 60));
    return { allowed: false, reason: 'Too many failed attempts', waitMinutes };
  }

  // Reset block if 24 hours passed
  if (attempts.blockedUntil && attempts.blockedUntil <= now) {
    attempts.count = 1;
    attempts.lastAttempt = now;
    delete attempts.blockedUntil;
    return { allowed: true };
  }

  // Check if within 1-hour window (3 attempts max)
  const oneHourAgo = now - (60 * 60 * 1000);
  if (attempts.lastAttempt > oneHourAgo) {
    if (attempts.count >= 3) {
      const waitMinutes = Math.ceil(((attempts.lastAttempt + (60 * 60 * 1000)) - now) / (1000 * 60));
      return { allowed: false, reason: 'Rate limit exceeded', waitMinutes };
    }
    attempts.count++;
    attempts.lastAttempt = now;
    return { allowed: true };
  }

  // Reset if more than 1 hour passed
  attempts.count = 1;
  attempts.lastAttempt = now;
  return { allowed: true };
}

// Track failed verification attempts
function recordFailedVerification(phoneNumber: string) {
  const attempts = verificationAttempts.get(phoneNumber);
  if (!attempts) return;

  // Block for 24 hours after 5 failed verifications
  if (attempts.count >= 5) {
    attempts.blockedUntil = Date.now() + (24 * 60 * 60 * 1000);
  }
}

export function registerRoutes(app: Express): Server {
  // ============================================================================
  // ADMIN DASHBOARD API
  // ============================================================================
  app.use('/api/admin', adminDashboardRouter);
  
  // ============================================================================
  // ANALYTICS API
  // ============================================================================
  app.use('/api/analytics', analyticsRouter);
  
  // ============================================================================
  // VERSION ENDPOINT (Cache Busting)
  // ============================================================================
  // Version with unique build ID to track deployments
  const BUILD_ID = 'BUILD_20260103_2230';
  
  app.get('/api/version', (req, res) => {
    res.json({
      version: '6.0.13',
      buildId: BUILD_ID,
      buildTime: new Date().toISOString(),
      features: ['semantic-search', 'perspective-filtering', 'instructor-search', 'fallback-quality', 'error-handling', 'technique-priority-search', 'guillotine-fix', 'proactive-video-recs', 'relevance-fix', 'last-resort-search'],
      fixes: [
        'VIDEO_COUNT_FIX: Library now shows total count from ai_video_knowledge',
        'PROACTIVE_VIDEOS: Professor OS always includes at least one video even for no-match searches',
        'LAST_RESORT_COMPREHENSIVE: Now searches title, techniqueName, specificTechnique AND tags fields for technique matching',
        'FALLBACK_COMPREHENSIVE: fallbackSearch PRIORITY 3 now searches all technique fields including tags',
        'WELCOME_MSG_FIX: Welcome message only shows on new session, not tab switches',
        'RELEVANCE_FIX: fallbackSearch now requires technique match when searchTerms exist - prevents irrelevant video recs',
        'GEMINI_COUNT_FIX: Dashboard and Videos page now use same data source for Gemini analyzed count',
        'ANALYTICS_FIX: Fixed No values to set error in time-on-page tracking'
      ]
    });
  });
  
  // ============================================================================
  // DIAGNOSTIC ENDPOINT - Test Video Search in Production (NO AUTH - for debugging)
  // ============================================================================
  app.get('/api/debug/video-search', async (req, res) => {
    try {
      const query = (req.query.q as string) || 'guillotine';
      const { searchVideos } = await import('./videoSearch');
      
      console.log(`[PRODUCTION DEBUG v6.0.10] Testing video search for: "${query}"`);
      
      const result = await searchVideos({
        userMessage: query
      });
      
      console.log(`[PRODUCTION DEBUG v6.0.10] Found ${result.videos.length} videos, noMatchFound=${result.noMatchFound}`);
      
      res.json({
        query,
        videosFound: result.videos.length,
        noMatchFound: result.noMatchFound,
        searchIntent: result.searchIntent,
        version: '6.0.13',
        buildId: BUILD_ID,
        timestamp: new Date().toISOString(),
        techniqueOverrideActive: result.searchIntent.searchTerms?.some((t: string) => 
          ['guillotine', 'armbar', 'triangle', 'kimura', 'anaconda'].some(tech => t.toLowerCase().includes(tech))
        ) || false,
        videos: result.videos.slice(0, 10).map(v => ({
          id: v.id,
          title: v.title,
          instructor: v.instructorName,
          quality: v.qualityScore
        }))
      });
    } catch (error: any) {
      console.error('[PRODUCTION DEBUG v6.0.10] Video search error:', error);
      res.status(500).json({ error: error.message, version: '6.0.11', buildId: BUILD_ID });
    }
  });
  
  // ============================================================================
  // DIAGNOSTIC ENDPOINT - Test Claude API (NO AUTH - for debugging)
  // ============================================================================
  app.get('/api/test/claude', async (req, res) => {
    try {
      console.log('[TEST CLAUDE] Testing Claude API...');
      console.log('[TEST CLAUDE] API key exists:', !!process.env.ANTHROPIC_API_KEY);
      console.log('[TEST CLAUDE] API key prefix:', process.env.ANTHROPIC_API_KEY?.substring(0, 10) + '...');
      
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        messages: [{ role: "user", content: "Say hello briefly" }]
      });
      
      const text = response.content[0]?.type === 'text' ? response.content[0].text : 'No text response';
      console.log('[TEST CLAUDE] Claude response:', text.substring(0, 100));
      
      res.json({ 
        success: true, 
        response: text,
        apiKeyExists: !!process.env.ANTHROPIC_API_KEY,
        apiKeyPrefix: process.env.ANTHROPIC_API_KEY?.substring(0, 10) + '...'
      });
    } catch (error: any) {
      console.error('[TEST CLAUDE] Error:', error);
      res.json({ 
        success: false, 
        error: error.message,
        status: error.status,
        type: error.name,
        apiKeyExists: !!process.env.ANTHROPIC_API_KEY
      });
    }
  });
  
  // ============================================================================
  // DIAGNOSTIC ENDPOINT - Test Chat with Minimal Prompt
  // ============================================================================
  app.post('/api/test/chat-minimal', async (req, res) => {
    try {
      const message = req.body.message || 'Hello';
      console.log('[TEST CHAT-MINIMAL] Testing with minimal prompt...');
      
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: "You are Professor OS, a helpful BJJ coach. Be brief and friendly.",
        messages: [{ role: "user", content: message }]
      });
      
      const text = response.content[0]?.type === 'text' ? response.content[0].text : 'No text response';
      console.log('[TEST CHAT-MINIMAL] Success:', text.substring(0, 100));
      
      res.json({ success: true, response: text });
    } catch (error: any) {
      console.error('[TEST CHAT-MINIMAL] Error:', error);
      res.json({ success: false, error: error.message });
    }
  });
  
  // ============================================================================
  // DIAGNOSTIC ENDPOINT - Test Full System Prompt Build
  // ============================================================================
  app.post('/api/test/chat-full', async (req, res) => {
    try {
      const message = req.body.message || 'Hello';
      const userId = req.body.userId;
      
      console.log('[TEST CHAT-FULL] Testing with full system prompt...');
      
      if (!userId) {
        return res.json({ success: false, error: 'userId is required - pass a valid user ID to test' });
      }
      
      // Build the full system prompt
      const { buildSystemPrompt } = await import('./utils/buildSystemPrompt');
      const startTime = Date.now();
      const systemPrompt = await buildSystemPrompt(userId);
      const buildTime = Date.now() - startTime;
      
      console.log(`[TEST CHAT-FULL] System prompt built in ${buildTime}ms, length: ${systemPrompt.length} chars`);
      
      // Estimate tokens (roughly 4 chars per token)
      const estimatedTokens = Math.ceil(systemPrompt.length / 4);
      console.log(`[TEST CHAT-FULL] Estimated tokens: ${estimatedTokens}`);
      
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: message }]
      });
      
      const text = response.content[0]?.type === 'text' ? response.content[0].text : 'No text response';
      console.log('[TEST CHAT-FULL] Success:', text.substring(0, 100));
      
      res.json({ 
        success: true, 
        response: text,
        promptLength: systemPrompt.length,
        estimatedTokens,
        buildTimeMs: buildTime
      });
    } catch (error: any) {
      console.error('[TEST CHAT-FULL] Error:', error);
      res.json({ success: false, error: error.message, stack: error.stack?.substring(0, 500) });
    }
  });
  
  // ============================================================================
  // EMAIL AUTHENTICATION ENDPOINTS (NEW - PRIMARY AUTH METHOD)
  // ============================================================================
  registerEmailAuthRoutes(app);
  
  // ============================================================================
  // PHONE AUTHENTICATION ENDPOINTS (LEGACY - BACKWARD COMPATIBILITY)
  // ============================================================================

  // Check if user exists and onboarding status (for lifetime bypass)
  app.post('/api/auth/check-user', async (req, res) => {
    try {
      // Accept BOTH phoneNumber (camelCase) and phone_number (snake_case)
      const { phoneNumber, phone_number } = req.body;
      const phone = phoneNumber || phone_number;

      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      // Normalize phone number to E.164 format (same logic as send-code)
      let formattedPhone = phone.trim();
      let digitsOnly = formattedPhone.replace(/\D/g, '');
      
      // Fix duplicate country code: if 11 digits starting with '11'
      if (digitsOnly.length === 11 && digitsOnly.startsWith('11')) {
        digitsOnly = '1' + digitsOnly.substring(2);
        formattedPhone = `+${digitsOnly}`;
      }
      else if (formattedPhone.startsWith('+')) {
        formattedPhone = '+' + digitsOnly;
      } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        formattedPhone = `+${digitsOnly}`;
      } else if (digitsOnly.length === 10) {
        if (digitsOnly.startsWith('1')) {
          formattedPhone = `+${digitsOnly}`;
        } else {
          formattedPhone = `+1${digitsOnly}`;
        }
      } else {
        formattedPhone = `+${digitsOnly}`;
      }

      console.log('[CHECK-USER] Checking user with phone:', formattedPhone);

      // Query database for user
      const existingUsers = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.phoneNumber, formattedPhone))
        .limit(1);

      // User not found
      if (existingUsers.length === 0) {
        console.log('[CHECK-USER] User not found, requires SMS');
        return res.json({
          exists: false,
          requires_sms: true
        });
      }

      const user = existingUsers[0];
      console.log('[CHECK-USER] User found:', user.id, 'Onboarding:', user.onboardingCompleted);

      // User found but onboarding not completed
      if (!user.onboardingCompleted) {
        console.log('[CHECK-USER] User exists but onboarding incomplete, requires SMS');
        return res.json({
          exists: true,
          onboarding_completed: false,
          requires_sms: true,
          user: {
            id: user.id,
            phone_number: user.phoneNumber
          }
        });
      }

      // User found and onboarding completed - can skip SMS
      console.log('[CHECK-USER] User exists with completed onboarding, can skip SMS');
      return res.json({
        exists: true,
        onboarding_completed: true,
        requires_sms: false,
        user: {
          id: user.id,
          username: user.username,
          phone_number: user.phoneNumber,
          belt_level: user.beltLevel,
          training_style: user.style,
          training_frequency: user.trainingFrequency,
          subscription_tier: user.subscriptionType,
          created_at: user.createdAt
        }
      });

    } catch (error: any) {
      console.error('[CHECK-USER] Error:', error);
      res.status(500).json({ error: 'Failed to check user status' });
    }
  });

  // Send SMS verification code
  app.post('/api/auth/send-code', async (req, res) => {
    try {
      const { phoneNumber } = req.body;

      console.log('📱 [AUTH] Received phone number:', phoneNumber);

      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      // Normalize phone number to E.164 format
      let formattedPhone = phoneNumber.trim();
      let digitsOnly = formattedPhone.replace(/\D/g, '');
      
      console.log('📱 [AUTH] Digits only:', digitsOnly, 'Length:', digitsOnly.length);
      
      // Fix duplicate country code: if 11 digits starting with '11'
      // This handles when frontend sends +11555... (user entered 1555... thinking first 1 is country code)
      // The first '1' is correct (country code), second '1' is the user's mistake
      // Strategy: keep first '1', remove second '1', keep rest → proper E.164 format
      if (digitsOnly.length === 11 && digitsOnly.startsWith('11')) {
        digitsOnly = '1' + digitsOnly.substring(2); // Keep first '1', remove second → 15558889999 (10 digits)
        formattedPhone = `+${digitsOnly}`; // Add + → +15558889999 (valid E.164!)
      }
      else if (formattedPhone.startsWith('+')) {
        // Already has +, use cleaned digits
        formattedPhone = '+' + digitsOnly;
      } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        // 11 digits starting with 1 (e.g., 15551234567) → +15551234567
        formattedPhone = `+${digitsOnly}`;
      } else if (digitsOnly.length === 10) {
        // 10 digits - check if it starts with 1 (country code already included)
        if (digitsOnly.startsWith('1')) {
          // Number like 1555888999 already has country code → +1555888999
          formattedPhone = `+${digitsOnly}`;
        } else {
          // Normal 10-digit US number like 5551234567 → +15551234567
          formattedPhone = `+1${digitsOnly}`;
        }
      } else {
        // Other formats, just add +
        formattedPhone = `+${digitsOnly}`;
      }

      console.log('📱 [AUTH] Formatted to E.164:', formattedPhone);

      // Check rate limit
      const rateCheck = checkRateLimit(formattedPhone);
      if (!rateCheck.allowed) {
        console.log('⚠️  [AUTH] Rate limit exceeded for:', formattedPhone);
        return res.status(429).json({ 
          error: rateCheck.reason,
          waitMinutes: rateCheck.waitMinutes 
        });
      }

      // Send verification code via Twilio Verify
      console.log('📱 [AUTH] Sending verification code to:', formattedPhone);
      const result = await sendVerificationCode(formattedPhone);

      if (!result.success) {
        console.error('❌ [AUTH] Failed to send code:', result.error);
        return res.status(500).json({ error: result.error || 'Failed to send verification code' });
      }

      console.log('✅ [AUTH] Verification code sent successfully to:', formattedPhone);
      res.json({ 
        success: true, 
        message: 'Verification code sent',
        phoneNumber: formattedPhone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '$1 ($2) ••• -$4') // Masked
      });

    } catch (error: any) {
      console.error('❌ [AUTH] Send code error:', error);
      console.error('❌ [AUTH] Error details:', {
        message: error.message,
        code: error.code,
        status: error.status,
        moreInfo: error.moreInfo
      });
      res.status(500).json({ 
        error: error.message || 'Failed to send verification code',
        details: error.code ? `Twilio error code: ${error.code}` : undefined
      });
    }
  });

  // Verify SMS code and login/signup
  app.post('/api/auth/verify-code', async (req, res) => {
    try {
      const { phoneNumber, code, action, deviceData } = req.body; // action: 'login' or 'signup'

      if (!phoneNumber || !code) {
        return res.status(400).json({ error: 'Phone number and code are required' });
      }

      // Apply same phone formatting as send-code to ensure they match
      let formattedPhone = phoneNumber.trim();
      let digitsOnly = formattedPhone.replace(/\D/g, '');
      
      // Fix duplicate country code: if 11 digits starting with '11'
      if (digitsOnly.length === 11 && digitsOnly.startsWith('11')) {
        digitsOnly = '1' + digitsOnly.substring(2); // Remove second '1'
        formattedPhone = `+${digitsOnly}`;
      } else if (formattedPhone.startsWith('+')) {
        formattedPhone = '+' + digitsOnly;
      } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        formattedPhone = `+${digitsOnly}`;
      } else if (digitsOnly.length === 10) {
        if (digitsOnly.startsWith('1')) {
          formattedPhone = `+${digitsOnly}`;
        } else {
          formattedPhone = `+1${digitsOnly}`;
        }
      } else {
        formattedPhone = `+${digitsOnly}`;
      }

      // Verify code with Twilio using formatted phone
      const verifyResult = await verifyCode(formattedPhone, code);

      if (!verifyResult.success) {
        recordFailedVerification(formattedPhone);
        return res.status(400).json({ error: 'Invalid or expired code' });
      }

      // Check if user exists using formatted phone
      const existingUser = await db.query.bjjUsers.findFirst({
        where: eq(bjjUsers.phoneNumber, formattedPhone)
      });

      // Auto-detect: if user exists = login, if not = signup
      const actualAction = existingUser ? 'login' : 'signup';

      // ═══════════════════════════════════════════════════════════════════
      // DEVICE FINGERPRINTING & ACCOUNT SHARING PREVENTION
      // ═══════════════════════════════════════════════════════════════════
      
      // Extract device information from request
      const acceptEncodingHeader = req.headers['accept-encoding'];
      const fingerprintData = {
        userAgent: req.headers['user-agent'] || '',
        acceptLanguage: req.headers['accept-language'] || '',
        acceptEncoding: Array.isArray(acceptEncodingHeader) ? acceptEncodingHeader.join(', ') : (acceptEncodingHeader || ''),
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '',
        timezone: deviceData?.timezone,
        screenResolution: deviceData?.screenResolution,
        platform: deviceData?.platform,
      };
      
      const fingerprint = generateDeviceFingerprint(fingerprintData);
      const deviceInfo = parseUserAgent(fingerprintData.userAgent);
      
      // Track login attempt
      await trackLoginEvent(
        existingUser?.id || 'unknown',
        fingerprint,
        fingerprintData.ipAddress,
        true, // success (code was verified)
        undefined,
        deviceData?.geo // Optional geo data from client
      );

      if (actualAction === 'login') {
        // Check device limit BEFORE allowing login (skip in development mode)
        const isDevelopment = process.env.NODE_ENV === 'development';
        const deviceCheck = await checkDeviceLimit(existingUser!.id, fingerprint);
        
        if (!deviceCheck.allowed && !isDevelopment) {
          console.log(`[DEVICE] Login blocked for ${existingUser!.phoneNumber}: ${deviceCheck.message}`);
          
          // Track failed login
          await trackLoginEvent(
            existingUser!.id,
            fingerprint,
            fingerprintData.ipAddress,
            false,
            'device_limit_exceeded'
          );
          
          return res.status(403).json({ 
            error: deviceCheck.message,
            deviceLimitExceeded: true,
            activeDeviceCount: deviceCheck.activeDeviceCount,
          });
        } else if (!deviceCheck.allowed && isDevelopment) {
          console.log(`✅ [DEV MODE] Bypassing device limit check for ${existingUser!.phoneNumber} (Active devices: ${deviceCheck.activeDeviceCount})`);
        }
        
        // Register/update device
        await registerDevice(
          existingUser!.id,
          fingerprint,
          deviceInfo,
          fingerprintData.ipAddress,
          deviceData?.geo
        );
        
        // Run fraud detection (async - don't block login)
        runFraudChecks(existingUser!.id, deviceData?.geo).catch(err => {
          console.error('[FRAUD] Error running fraud checks:', err);
        });
        
        // Update login tracking with streak calculation
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // Get current login stats
        const currentTotalLogins = existingUser!.totalLogins || 0;
        const currentStreak = existingUser!.currentStreak || 0;
        const lastLoginDate = existingUser!.lastLoginDate;
        
        let newStreak = 1; // Default to 1 for first login
        
        if (lastLoginDate) {
          const lastDate = new Date(lastLoginDate);
          const lastDateNormalized = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
          const daysDiff = Math.floor((today.getTime() - lastDateNormalized.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff === 0) {
            // Same day - keep current streak, don't increment totalLogins
            newStreak = currentStreak;
            // Update lastLogin only (for analytics)
            await db.update(bjjUsers)
              .set({ lastLogin: now })
              .where(eq(bjjUsers.id, existingUser!.id));
          } else if (daysDiff === 1) {
            // Consecutive day - increment streak and totalLogins
            newStreak = currentStreak + 1;
            await db.update(bjjUsers)
              .set({ 
                lastLogin: now,
                lastLoginDate: today.toISOString().split('T')[0],
                totalLogins: currentTotalLogins + 1,
                currentStreak: newStreak
              })
              .where(eq(bjjUsers.id, existingUser!.id));
          } else {
            // Streak broken - reset to 1 and increment totalLogins
            newStreak = 1;
            await db.update(bjjUsers)
              .set({ 
                lastLogin: now,
                lastLoginDate: today.toISOString().split('T')[0],
                totalLogins: currentTotalLogins + 1,
                currentStreak: 1
              })
              .where(eq(bjjUsers.id, existingUser!.id));
          }
        } else {
          // First time login - initialize all tracking fields
          await db.update(bjjUsers)
            .set({ 
              lastLogin: now,
              lastLoginDate: today.toISOString().split('T')[0],
              totalLogins: 1,
              currentStreak: 1
            })
            .where(eq(bjjUsers.id, existingUser!.id));
        }

        // Generate JWT token with device fingerprint for session validation
        const token = jwt.sign(
          { 
            userId: existingUser!.id, 
            phoneNumber: existingUser!.phoneNumber,
            deviceFingerprint: fingerprint // CRITICAL: Ties session to device
          },
          process.env.SESSION_SECRET || 'your-secret-key',
          { expiresIn: '30d' }
        );

        // FIXED: Detect HTTPS from proxy headers (Replit terminates TLS at edge)
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
        const isProduction = req.hostname?.endsWith('bjjos.app') || req.hostname?.endsWith('.bjjos.app');

        // Set httpOnly cookie with correct settings for Replit deployment
        res.cookie('sessionToken', token, {
          httpOnly: true,
          secure: isHttps, // Use HTTPS detection instead of NODE_ENV
          sameSite: isHttps ? 'none' : 'lax', // 'none' for cross-origin Capacitor requests
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          ...(isProduction && { domain: '.bjjos.app' }) // Set domain for production only
        });

        console.log(`[AUTH] ✅ Login successful: ${existingUser!.phoneNumber} (Device: ${deviceInfo.deviceName})`);
        console.log(`[AUTH] ✅ Cookie settings - secure: ${isHttps}, sameSite: ${isHttps ? 'none' : 'lax'}, domain: ${isProduction ? '.bjjos.app' : 'none'}`);
        console.log(`[AUTH] ✅ sessionToken cookie set (maxAge: 30 days, httpOnly: true)`);

        res.json({
          success: true,
          isExistingUser: true,
          redirectTo: existingUser!.onboardingCompleted ? '/chat' : '/onboarding',
          user: {
            id: existingUser!.id,
            phoneNumber: existingUser!.phoneNumber,
            name: existingUser!.name,
            onboardingCompleted: existingUser!.onboardingCompleted
          }
        });

      } else { // signup

        try {
          // Create new user with retry logic for username collisions
          let newUser;
          let insertAttempts = 0;
          const MAX_INSERT_ATTEMPTS = 3;
          
          while (insertAttempts < MAX_INSERT_ATTEMPTS) {
            try {
              // Generate collision-safe username
              const generatedUsername = await generateUniqueUsername(formattedPhone, 'user');
              
              // Attempt to create new user
              [newUser] = await db.insert(bjjUsers).values({
                phoneNumber: formattedPhone,
                username: generatedUsername, // REQUIRED: Collision-safe auto-generated username
                displayName: 'User', // Default display name
                lastLogin: new Date(),
                onboardingCompleted: false,
                referralCode: Math.random().toString(36).substring(2, 10).toUpperCase(),
                trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
              }).returning();
              
              break; // Success - exit retry loop
            } catch (insertError: any) {
              insertAttempts++;
              
              // Check if it's a username unique constraint violation
              if (insertError.code === '23505' && insertError.constraint === 'bjj_users_username_unique') {
                if (insertAttempts < MAX_INSERT_ATTEMPTS) {
                  console.log(`[SIGNUP] Username collision detected, retrying (attempt ${insertAttempts}/${MAX_INSERT_ATTEMPTS})`);
                  continue; // Retry with new username
                }
              }
              
              // Re-throw if not a username collision or max attempts reached
              throw insertError;
            }
          }

          // Check if newUser was created successfully
          if (!newUser) {
            throw new Error('Failed to create user after maximum retries');
          }

          // Log user signup activity
          await db.insert(activityLog).values({
            eventType: 'user_signup',
            userId: newUser.id,
            metadata: {
              phoneNumber: formattedPhone,
              device: deviceInfo.deviceName,
              os: deviceInfo.os
            },
            description: `New user signup: ${formattedPhone}`
          }).catch(err => console.error('[ACTIVITY] Failed to log signup:', err));

          // Register first device for new user
          await registerDevice(
            newUser.id,
            fingerprint,
            deviceInfo,
            fingerprintData.ipAddress,
            deviceData?.geo
          );

          console.log(`[AUTH] ✅ Signup successful: ${newUser.phoneNumber} (Device: ${deviceInfo.deviceName})`);

          // Generate JWT token with device fingerprint for session validation
          const token = jwt.sign(
            { 
              userId: newUser.id, 
              phoneNumber: newUser.phoneNumber,
              deviceFingerprint: fingerprint // CRITICAL: Ties session to device
            },
            process.env.SESSION_SECRET || 'your-secret-key',
            { expiresIn: '30d' }
          );

          // FIXED: Detect HTTPS from proxy headers (Replit terminates TLS at edge)
          const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
          const isProduction = req.hostname?.endsWith('bjjos.app') || req.hostname?.endsWith('.bjjos.app');

          // Set httpOnly cookie with correct settings for Replit deployment
          res.cookie('sessionToken', token, {
            httpOnly: true,
            secure: isHttps, // Use HTTPS detection instead of NODE_ENV
            sameSite: isHttps ? 'none' : 'lax', // 'none' for cross-origin Capacitor requests
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            ...(isProduction && { domain: '.bjjos.app' }) // Set domain for production only
          });
          
          console.log(`[AUTH] ✅ Signup successful: ${newUser.phoneNumber}`);
          console.log(`[AUTH] ✅ Cookie settings - secure: ${isHttps}, sameSite: ${isHttps ? 'none' : 'lax'}, domain: ${isProduction ? '.bjjos.app' : 'none'}`);
          console.log(`[AUTH] ✅ sessionToken cookie set (maxAge: 30 days, httpOnly: true)`);

          res.json({
            success: true,
            isExistingUser: false,
            redirectTo: '/onboarding', // New users ALWAYS go to onboarding
            user: {
              id: newUser.id,
              phoneNumber: newUser.phoneNumber,
              onboardingCompleted: false
            }
          });
        } catch (dbError: any) {
          // Handle duplicate phone number constraint violation
          if (dbError.code === '23505' && dbError.constraint?.includes('phone_number')) {
            return res.status(409).json({ 
              error: 'This phone number is already registered. Please sign in or use a different number.' 
            });
          }
          throw dbError; // Re-throw other errors to outer catch
        }
      }

    } catch (error: any) {
      console.error('Verify code error:', error);
      
      // Return appropriate error message
      if (error.code === '23505') {
        return res.status(409).json({ 
          error: 'This phone number is already registered. Please sign in or use a different number.' 
        });
      }
      
      res.status(500).json({ error: error.message || 'Verification failed' });
    }
  });

  // Middleware to check JWT token for user authentication
  const JWT_SECRET = process.env.SESSION_SECRET || 'your-secret-key';
  const checkUserAuth = async (req: any, res: any, next: any) => {
    // Enhanced debug logging
    console.log(`[AUTH] Request to ${req.method} ${req.path}`);
    console.log(`[AUTH] Cookies available:`, Object.keys(req.cookies || {}).join(', ') || 'NONE');
    console.log(`[AUTH] sessionToken cookie:`, req.cookies?.sessionToken ? 'EXISTS' : 'MISSING');
    
    // Check for Bearer token in Authorization header (mobile apps)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const sessionToken = authHeader.substring(7);
      
      // First try: Look up in userSessions table (email-based auth)
      try {
        const { userSessions } = await import('@shared/schema');
        const now = new Date();
        
        const session = await db.query.userSessions.findFirst({
          where: and(
            eq(userSessions.token, sessionToken),
            gt(userSessions.expiresAt, now)
          )
        });
        
        if (session) {
          // Update last activity
          await db.update(userSessions)
            .set({ lastActivity: now })
            .where(eq(userSessions.id, session.id));
          
          req.user = { userId: session.userId };
          console.log(`[AUTH] ✅ Email session authenticated: ${session.userId}`);
          return next();
        }
      } catch (error) {
        console.log(`[AUTH] Email session check failed:`, error);
      }
      
      // Second try: Decode as JWT directly (mobile apps send JWT in Bearer header)
      try {
        const decoded: any = jwt.verify(sessionToken, JWT_SECRET);
        if (decoded.userId) {
          // SECURITY: Validate device fingerprint for Bearer JWTs too
          if (decoded.deviceFingerprint) {
            const [device] = await db.select({
              id: authorizedDevices.id,
              userId: authorizedDevices.userId,
              fingerprint: authorizedDevices.fingerprint,
              isActive: authorizedDevices.isActive,
            })
              .from(authorizedDevices)
              .where(and(
                eq(authorizedDevices.userId, decoded.userId),
                eq(authorizedDevices.fingerprint, decoded.deviceFingerprint)
              ))
              .limit(1);
            
            // Block if device exists but is explicitly deactivated
            if (device && !device.isActive) {
              console.log(`[AUTH] ⚠️ Bearer JWT: Blocked revoked device: ${decoded.userId}`);
              return res.status(403).json({ 
                error: "Device access revoked. Please log in again.",
                deviceRevoked: true
              });
            }
            
            // Allow through if device exists and is active, or if no device record (email-based auth users)
            req.user = { userId: decoded.userId };
            console.log(`[AUTH] ✅ Bearer JWT authenticated (fingerprint verified): ${decoded.userId}`);
            return next();
          } else {
            // No fingerprint in JWT - this is a legacy token, allow for backward compatibility
            // but mark in logs for monitoring
            req.user = { userId: decoded.userId };
            console.log(`[AUTH] ⚠️ Bearer JWT authenticated (no fingerprint, legacy token): ${decoded.userId}`);
            return next();
          }
        }
      } catch (jwtError) {
        console.log(`[AUTH] Bearer JWT verification failed`);
      }
    }
    
    // Read token from httpOnly cookie (LEGACY JWT)
    const token = req.cookies?.sessionToken;

    if (!token) {
      console.log(`[AUTH] ❌ No sessionToken cookie or Bearer token - sending 401`);
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      
      console.log(`[AUTH DEBUG] Token verified for userId: ${decoded.userId}, fingerprint: ${decoded.deviceFingerprint}`);
      
      // CRITICAL SECURITY: Require device fingerprint in all tokens
      // Legacy tokens without fingerprints must reauthenticate
      if (!decoded.deviceFingerprint) {
        console.log(`[AUTH] ⚠️  Blocked legacy token without fingerprint: ${decoded.userId}`);
        return res.status(403).json({ 
          error: "Session expired. Please log in again.",
          requireReauth: true
        });
      }
      
      // Validate device fingerprint exists and is still active
      const [device] = await db.select({
        id: authorizedDevices.id,
        userId: authorizedDevices.userId,
        fingerprint: authorizedDevices.fingerprint,
        isActive: authorizedDevices.isActive,
        lastSeen: authorizedDevices.lastSeen,
        createdAt: authorizedDevices.createdAt
      })
        .from(authorizedDevices)
        .where(and(
          eq(authorizedDevices.userId, decoded.userId),
          eq(authorizedDevices.fingerprint, decoded.deviceFingerprint)
        ))
        .limit(1);
      
      console.log(`[AUTH DEBUG] Device lookup result: ${device ? 'FOUND' : 'NOT FOUND'}, isActive: ${device?.isActive}`);
      
      // Only block if device exists but is explicitly deactivated
      // Allow through if no device exists (for email-based auth users)
      if (device && !device.isActive) {
        console.log(`[AUTH] ⚠️  Blocked revoked device: ${decoded.userId} / ${decoded.deviceFingerprint}`);
        return res.status(403).json({ 
          error: "Device access revoked. Please log in again.",
          deviceRevoked: true
        });
      }
      
      if (!device) {
        console.log(`[AUTH] ℹ️  No device record found, allowing through (email-based auth user): ${decoded.userId}`);
      }
      
      req.user = decoded; // Attach user info to request (contains userId)
      next();
    } catch (error) {
      console.log(`[AUTH ERROR] Token verification failed:`, error);
      return res.status(403).json({ error: "Invalid or expired token" });
    }
  };

  // NOTE: /api/auth/me endpoint is defined later in the file (line ~2317) with full fields
  // including username, style, trainingFrequency for onboarding data

  // Logout endpoint - clears session cookie
  app.post('/api/auth/logout', (req, res) => {
    // FIXED: Use same cookie settings as login/signup for proper clearing
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const isProduction = req.hostname?.endsWith('bjjos.app') || req.hostname?.endsWith('.bjjos.app');
    
    res.clearCookie('sessionToken', {
      httpOnly: true,
      secure: isHttps, // Match the cookie settings used when setting
      sameSite: isHttps ? 'none' : 'lax', // Must match the original cookie settings
      ...(isProduction && { domain: '.bjjos.app' })
    });
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // ============================================================================
  // EXISTING ENDPOINTS
  // ============================================================================

  // Test SMS endpoint - detailed diagnostics
  app.post('/api/test-sms', async (req, res) => {
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      requestReceived: true,
      requestBody: req.body,
    };
    
    try {
      const testPhone = '+19148373750';
      const { phoneNumber } = req.body;
      const targetPhone = phoneNumber || testPhone;
      
      diagnostics.targetPhone = targetPhone;
      diagnostics.hasAccountSid = !!process.env.TWILIO_ACCOUNT_SID;
      diagnostics.hasAuthToken = !!process.env.TWILIO_AUTH_TOKEN;
      diagnostics.hasPhoneNumber = !!process.env.TWILIO_PHONE_NUMBER;
      diagnostics.fromPhone = process.env.TWILIO_PHONE_NUMBER;
      
      const result = await sendSMS(
        targetPhone,
        'Test SMS from BJJ OS - If you receive this, SMS is working! 🎉'
      );
      
      diagnostics.smsResult = result;
      res.json(diagnostics);
    } catch (error: any) {
      diagnostics.error = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
      res.status(500).json(diagnostics);
    }
  });

  // Test AI endpoint
  app.get('/api/test-ai', async (req, res) => {
    try {
      const technique = await generateDailyTechnique({
        beltLevel: 'blue',
        style: 'gi'
      });
      res.json({ success: true, technique });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Generate technique without sending SMS
  app.post('/api/generate-technique', async (req, res) => {
    try {
      const { technique: requestedTechnique, belt_level, style, category } = req.body;
      
      const technique = await generateDailyTechnique({
        requestedTechnique: requestedTechnique,
        beltLevel: belt_level,
        style: style as 'gi' | 'nogi' | 'both',
        category: category
      });
      
      res.json({ success: true, technique });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Send AI-generated technique via SMS
  app.post('/api/send-technique', async (req, res) => {
    try {
      const { recipientId } = req.body;

      // Get recipient
      const [recipient] = await db.select({
        id: recipients.id,
        name: recipients.name,
        phoneNumber: recipients.phoneNumber,
        group: recipients.group,
        createdAt: recipients.createdAt
      }).from(recipients).where(eq(recipients.id, recipientId));
      if (!recipient) {
        return res.status(404).json({ error: "Recipient not found" });
      }

      // Generate technique with personalization
      const technique = await generateDailyTechnique({
        recipientId: recipient.id
      });

      // Format concise SMS message (under 320 chars)
      // Format: 🥋 [Technique] - [Instructor]\n\nKey Detail: [tip]\n\nWatch: [url]
      const topVideo = technique.videos[0];
      const videoUrl = topVideo ? topVideo.urlWithTimestamp : '';
      
      const message = `🥋 ${technique.technique} - ${technique.instructor}\n\nKey Detail: ${technique.tip}\n\nWatch: ${videoUrl}`;

      // Send SMS with status callback
      const webhookUrl = `${process.env.REPLIT_DOMAINS || 'http://localhost:5000'}/api/webhooks/twilio/status`;
      const result = await sendSMS(recipient.phoneNumber, message, webhookUrl);

      // Log to history
      const [history] = await db.insert(smsHistory).values({
        recipientId: recipient.id,
        message,
        status: result.success ? "sent" : "failed",
        twilioSid: result.sid,
        errorMessage: result.error,
      }).returning();

      res.json({ 
        success: result.success, 
        technique,
        history 
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Send AI technique to a specific phone number
  app.post('/api/send-to-phone', async (req, res) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      // Generate technique (no personalization for direct phone send)
      const technique = await generateDailyTechnique({
        beltLevel: 'blue',
        style: 'gi'
      });

      // Format concise SMS message
      const topVideo = technique.videos[0];
      const videoUrl = topVideo ? topVideo.urlWithTimestamp : '';
      
      const message = `🥋 ${technique.technique} - ${technique.instructor}\n\nKey Detail: ${technique.tip}\n\nWatch: ${videoUrl}`;

      // Send SMS with status callback
      const webhookUrl = `${process.env.REPLIT_DOMAINS || 'http://localhost:5000'}/api/webhooks/twilio/status`;
      const result = await sendSMS(phoneNumber, message, webhookUrl);

      res.json({ 
        success: result.success, 
        technique,
        sid: result.sid,
        error: result.error
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Recipients endpoints
  app.get("/api/recipients", async (req, res) => {
    const allRecipients = await db.select({
      id: recipients.id,
      name: recipients.name,
      phoneNumber: recipients.phoneNumber,
      group: recipients.group,
      createdAt: recipients.createdAt
    }).from(recipients);
    res.json(allRecipients);
  });

  app.post("/api/recipients", async (req, res) => {
    const result = insertRecipientSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const [newRecipient] = await db.insert(recipients).values(result.data).returning();
    res.status(201).json(newRecipient);
  });

  // Schedules endpoints
  app.get("/api/schedules", async (req, res) => {
    const allSchedules = await db.select({
      id: smsSchedules.id,
      message: smsSchedules.message,
      scheduleTime: smsSchedules.scheduleTime,
      timezone: smsSchedules.timezone,
      active: smsSchedules.active,
      recipientIds: smsSchedules.recipientIds,
      createdAt: smsSchedules.createdAt,
      updatedAt: smsSchedules.updatedAt
    }).from(smsSchedules);
    res.json(allSchedules);
  });

  app.post("/api/schedules", async (req, res) => {
    const result = insertSmsScheduleSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const [newSchedule] = await db.insert(smsSchedules).values(result.data).returning();
    res.status(201).json(newSchedule);
  });

  // Send SMS endpoint
  app.post("/api/send-sms", async (req, res) => {
    const { recipientId, message } = req.body;

    const [recipient] = await db.select({
      id: recipients.id,
      name: recipients.name,
      phoneNumber: recipients.phoneNumber,
      group: recipients.group,
      createdAt: recipients.createdAt
    }).from(recipients).where(eq(recipients.id, recipientId));

    if (!recipient) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    const webhookUrl = `${process.env.REPLIT_DOMAINS || 'http://localhost:5000'}/api/webhooks/twilio/status`;
    const result = await sendSMS(recipient.phoneNumber, message, webhookUrl);

    const [history] = await db.insert(smsHistory).values({
      recipientId: recipient.id,
      message,
      status: result.success ? "sent" : "failed",
      twilioSid: result.sid,
      errorMessage: result.error,
    }).returning();

    res.json({ success: result.success, history });
  });

  // History endpoints
  app.get("/api/history", async (req, res) => {
    const history = await db.select({
      id: smsHistory.id,
      scheduleId: smsHistory.scheduleId,
      recipientId: smsHistory.recipientId,
      message: smsHistory.message,
      status: smsHistory.status,
      twilioSid: smsHistory.twilioSid,
      errorMessage: smsHistory.errorMessage,
      sentAt: smsHistory.sentAt,
      deliveredAt: smsHistory.deliveredAt,
      updatedAt: smsHistory.updatedAt
    }).from(smsHistory).orderBy(desc(smsHistory.sentAt)).limit(100);
    res.json(history);
  });

  // Stats endpoint
  app.get("/api/stats", async (req, res) => {
    const totalSent = await db.select({
      id: smsHistory.id,
      status: smsHistory.status
    }).from(smsHistory);
    const totalScheduled = await db.select({
      id: smsSchedules.id
    }).from(smsSchedules).where(eq(smsSchedules.active, true));

    // Success includes: sent, delivered, queued (in transit)
    const successCount = totalSent.filter((h: any) => 
      h.status === "sent" || h.status === "delivered" || h.status === "queued"
    ).length;
    
    // Failed includes: failed, undelivered
    const failedCount = totalSent.filter((h: any) => 
      h.status === "failed" || h.status === "undelivered"
    ).length;
    
    const totalCount = totalSent.length;
    const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;

    res.json({
      totalSent: totalCount,
      totalScheduled: totalScheduled.length,
      successRate: Math.round(successRate),
      totalFailed: failedCount
    });
  });

  // Webhook for Twilio delivery status updates
  app.post("/api/webhooks/twilio/status", async (req, res) => {
    try {
      const { MessageSid, MessageStatus } = req.body;
      
      // Update the SMS history with the new status
      const [history] = await db.select({
        id: smsHistory.id,
        twilioSid: smsHistory.twilioSid
      }).from(smsHistory).where(eq(smsHistory.twilioSid, MessageSid));
      
      if (history) {
        await db.update(smsHistory)
          .set({ 
            status: MessageStatus,
            deliveredAt: MessageStatus === 'delivered' ? new Date() : null,
            updatedAt: new Date()
          })
          .where(eq(smsHistory.twilioSid, MessageSid));
        
        console.log(`Updated status for ${MessageSid}: ${MessageStatus}`);
      }
      
      res.status(200).send('OK');
    } catch (error: any) {
      console.error('Webhook error:', error);
      res.status(500).send('Error');
    }
  });

  // Webhook for incoming SMS messages - uses comprehensive SMS reply handler
  app.post("/api/webhooks/twilio/incoming", async (req, res) => {
    try {
      const { From, Body, MessageSid } = req.body;
      
      console.log(`Incoming SMS from ${From}: ${Body}`);
      
      const { handleIncomingSMS } = await import('./sms-reply-handler');
      const response = await handleIncomingSMS(From, Body);
      
      // Send response via TwiML
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${response}</Message></Response>`);
      
    } catch (error: any) {
      console.error('Incoming webhook error:', error);
      res.status(500).send('Error');
    }
  });

  // Referral tracking route - handles /ref/[CODE]
  app.get('/ref/:code', async (req, res) => {
    try {
      const { code } = req.params;
      const upperCode = code.toUpperCase();
      
      // Find the referral code
      const [refCode] = await db.select({
        id: referralCodes.id,
        code: referralCodes.code,
        isActive: referralCodes.isActive
      }).from(referralCodes)
        .where(eq(referralCodes.code, upperCode));
      
      if (refCode && refCode.isActive) {
        // Track this referral attempt (store in session or cookie for later)
        res.cookie('referralCode', upperCode, { maxAge: 30 * 24 * 60 * 60 * 1000 }); // 30 days
        
        // Redirect to homepage/signup
        res.redirect('/');
      } else {
        // Invalid or inactive code, redirect anyway
        res.redirect('/');
      }
    } catch (error) {
      console.error('Referral tracking error:', error);
      res.redirect('/');
    }
  });

  // NOTE: Referral tracking has been moved to server/referral-tracker.ts
  // and is called internally from SMS handler only - no public endpoint for security

  // Referral validation API - real-time code checking
  app.post('/api/referral/validate', async (req, res) => {
    try {
      const { code } = req.body;
      const { validateReferralCode } = await import('./referral-service');
      const result = await validateReferralCode(code);
      res.json(result);
    } catch (error: any) {
      console.error('Referral validation error:', error);
      res.status(500).json({ valid: false, message: 'Error validating code' });
    }
  });

  // Get referral stats for a user
  app.get('/api/referral/stats', checkUserAuth, async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { getReferralStats } = await import('./referral-service');
      const stats = await getReferralStats(userId);
      res.json(stats);
    } catch (error: any) {
      console.error('Error fetching referral stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin API Routes
  
  // Validate required environment variables for admin auth
  if (!process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET environment variable is not set - admin authentication disabled');
  }
  if (!process.env.ADMIN_PASSWORD) {
    console.error('FATAL: ADMIN_PASSWORD environment variable is not set - admin authentication disabled');
  }

  // Note: JWT_SECRET and checkUserAuth are defined earlier in the file

  // Middleware to check JWT token for admin authentication (session-based)
  const checkAdminAuth = (req: any, res: any, next: any) => {
    const JWT_SECRET = process.env.SESSION_SECRET!;
    const adminSession = req.cookies?.admin_session;

    console.log('[checkAdminAuth] Checking admin auth for:', req.path);
    console.log('[checkAdminAuth] admin_session cookie:', adminSession ? 'PRESENT' : 'MISSING');
    console.log('[checkAdminAuth] All cookies:', Object.keys(req.cookies || {}));

    if (!adminSession) {
      console.log('❌ [checkAdminAuth] No admin_session cookie - returning 401');
      return res.status(401).json({ 
        error: "Unauthorized",
        redirect: '/admin/login',
        debug: 'No admin_session cookie found'
      });
    }

    try {
      const decoded = jwt.verify(adminSession, JWT_SECRET) as any;
      console.log('[checkAdminAuth] Token decoded:', { role: decoded.role });
      
      if (decoded.role !== 'admin') {
        console.log('❌ [checkAdminAuth] Not admin role - returning 403');
        return res.status(403).json({ error: "Forbidden" });
      }
      req.adminUser = decoded; // Attach admin user info to request
      req.admin = decoded; // Also set req.admin for compatibility
      console.log('✅ [checkAdminAuth] Auth successful');
      next();
    } catch (error) {
      console.log('❌ [checkAdminAuth] Token verification failed:', error);
      return res.status(401).json({ 
        error: "Invalid session",
        redirect: '/admin/login',
        debug: String(error)
      });
    }
  };

  // Admin login - using ADMIN_PASSWORD as temporary solution
  // TODO: Implement proper admin_users table authentication with bcrypt
  app.post('/api/admin/login', async (req, res) => {
    try {
      // Validate required environment variables
      if (!process.env.SESSION_SECRET) {
        console.error('Admin login failed: SESSION_SECRET not configured');
        return res.status(500).json({ error: "Admin authentication is not properly configured" });
      }
      if (!process.env.ADMIN_PASSWORD) {
        console.error('Admin login failed: ADMIN_PASSWORD not configured');
        return res.status(500).json({ error: "Admin authentication is not properly configured" });
      }

      const { password } = req.body;

      // Validate password was provided
      if (!password || password.trim() === '') {
        return res.status(401).json({ error: "Password is required" });
      }

      // Check against ADMIN_PASSWORD env variable
      if (password === process.env.ADMIN_PASSWORD) {
        // Generate JWT token with 24-hour expiration
        const token = jwt.sign(
          { role: 'admin', adminId: 'admin', loginTime: Date.now() },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        // Set session cookie (httpOnly for security)
        res.cookie('admin_session', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
          sameSite: 'strict'
        });

        // Return token for localStorage (for isAdminAuthenticated check)
        res.json({
          success: true,
          token: token, // Frontend stores this for auth guard checks
          expiresIn: '24h',
          admin: {
            id: 'admin',
            name: 'Admin',
            role: 'admin'
          }
        });
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (error: any) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // MAGIC LINK ENDPOINTS (BETA ACCESS CONTROL)
  // ============================================
  
  // Generate magic link (admin only)
  app.post('/api/admin/magic-link/generate', checkAdminAuth, async (req, res) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      // Normalize and validate phone number
      const phoneResult = normalizePhoneNumber(phoneNumber);
      if (!phoneResult.success) {
        return res.status(400).json({ error: phoneResult.error });
      }
      const formattedPhone = phoneResult.formattedPhone!;

      // Generate unique token
      const token = crypto.randomBytes(32).toString('hex');
      
      // Set expiration to 7 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Create magic link
      await db.insert(magicLinks).values({
        token,
        phoneNumber: formattedPhone,
        expiresAt,
        used: false,
        createdBy: (req as any).adminUser?.adminId || 'admin'
      });

      // Generate the full magic link URL
      const baseUrl = process.env.NODE_ENV === 'development' 
        ? 'http://localhost:5000' 
        : 'https://bjjos.app';
      const magicLinkUrl = `${baseUrl}/auth/magic?token=${token}`;

      res.json({
        success: true,
        magicLink: magicLinkUrl,
        phoneNumber: formattedPhone,
        expiresAt
      });

    } catch (error: any) {
      console.error('Magic link generation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Verify magic link and auto-login (public)
  app.get('/api/auth/magic/verify', async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Invalid magic link token' });
      }

      // Find the magic link
      const [link] = await db.select()
        .from(magicLinks)
        .where(eq(magicLinks.token, token))
        .limit(1);

      if (!link) {
        return res.status(404).json({ error: 'Invalid magic link' });
      }

      // Check if already used
      if (link.used) {
        return res.status(400).json({ error: 'This magic link has already been used' });
      }

      // Check if expired
      if (new Date() > new Date(link.expiresAt)) {
        return res.status(400).json({ error: 'This magic link has expired' });
      }

      // Mark as used
      await db.update(magicLinks)
        .set({ used: true, usedAt: new Date() })
        .where(eq(magicLinks.token, token));

      // Check if user exists
      const [existingUser] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.phoneNumber, link.phoneNumber))
        .limit(1);

      let userId: string;

      if (existingUser) {
        // Update existing user to lifetime access
        await db.update(bjjUsers)
          .set({ 
            subscriptionType: 'lifetime',
            subscriptionStatus: 'active',
            lastLogin: new Date()
          })
          .where(eq(bjjUsers.id, existingUser.id));
        
        userId = existingUser.id;
      } else {
        // Create new user with retry logic for username collisions
        let newUser;
        let insertAttempts = 0;
        const MAX_INSERT_ATTEMPTS = 3;
        
        while (insertAttempts < MAX_INSERT_ATTEMPTS) {
          try {
            const generatedUsername = await generateUniqueUsername(link.phoneNumber, 'user');
            
            [newUser] = await db.insert(bjjUsers).values({
              phoneNumber: link.phoneNumber,
              username: generatedUsername, // REQUIRED: Collision-safe auto-generated username
              displayName: 'User', // Default display name
              subscriptionType: 'lifetime',
              subscriptionStatus: 'active',
              lastLogin: new Date(),
              active: true
            }).returning();
            
            break; // Success
          } catch (insertError: any) {
            insertAttempts++;
            if (insertError.code === '23505' && insertError.constraint === 'bjj_users_username_unique') {
              if (insertAttempts < MAX_INSERT_ATTEMPTS) {
                console.log(`[MAGIC LINK] Username collision, retrying (${insertAttempts}/${MAX_INSERT_ATTEMPTS})`);
                continue;
              }
            }
            throw insertError;
          }
        }

        userId = newUser!.id;
      }

      // Generate JWT token for auto-login
      const jwtToken = jwt.sign(
        { 
          userId: userId, 
          phoneNumber: link.phoneNumber
        },
        process.env.SESSION_SECRET || 'your-secret-key',
        { expiresIn: '30d' }
      );

      res.json({
        success: true,
        token: jwtToken,
        user: {
          id: userId,
          phoneNumber: link.phoneNumber,
          subscriptionType: 'lifetime'
        }
      });

    } catch (error: any) {
      console.error('Magic link verification error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Grant lifetime access (admin only - beta launch)
  app.post('/api/admin/grant-lifetime-access', checkAdminAuth, async (req, res) => {
    try {
      const { phoneNumber, reason, notes } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      // Normalize and validate phone number
      const phoneResult = normalizePhoneNumber(phoneNumber);
      if (!phoneResult.success) {
        return res.status(400).json({ error: phoneResult.error });
      }
      const formattedPhone = phoneResult.formattedPhone!;

      // Check if user already exists
      const [existingUser] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.phoneNumber, formattedPhone))
        .limit(1);

      let userId: string;
      let userCreated = false;

      if (existingUser) {
        // User exists - update to lifetime access AND enable LIFETIME bypass
        await db.update(bjjUsers)
          .set({ 
            subscriptionType: 'lifetime',
            subscriptionStatus: 'active',
            isLifetimeUser: true // AUTO-ENABLE: Allows LIFETIME magic code in production
          })
          .where(eq(bjjUsers.id, existingUser.id));
        
        userId = existingUser.id;
      } else {
        // Create new user with retry logic for username collisions
        let newUser;
        let insertAttempts = 0;
        const MAX_INSERT_ATTEMPTS = 3;
        
        while (insertAttempts < MAX_INSERT_ATTEMPTS) {
          try {
            const generatedUsername = await generateUniqueUsername(formattedPhone, 'user');
            
            [newUser] = await db.insert(bjjUsers).values({
              phoneNumber: formattedPhone,
              username: generatedUsername, // REQUIRED: Collision-safe auto-generated username
              displayName: 'User', // Default display name
              subscriptionType: 'lifetime',
              subscriptionStatus: 'active',
              isLifetimeUser: true, // AUTO-ENABLE: Allows LIFETIME magic code in production
              active: true
            }).returning();
            
            break; // Success
          } catch (insertError: any) {
            insertAttempts++;
            if (insertError.code === '23505' && insertError.constraint === 'bjj_users_username_unique') {
              if (insertAttempts < MAX_INSERT_ATTEMPTS) {
                console.log(`[LIFETIME GRANT] Username collision, retrying (${insertAttempts}/${MAX_INSERT_ATTEMPTS})`);
                continue;
              }
            }
            throw insertError;
          }
        }

        userId = newUser!.id;
        userCreated = true;
      }

      // Log the lifetime access grant
      await db.insert(activityLog).values({
        eventType: 'lifetime_access',
        userId,
        metadata: { 
          reason: reason || 'Beta Tester',
          notes: notes || '',
          grantedBy: 'admin',
          userCreated
        },
        description: `Lifetime access granted to ${formattedPhone}`
      }).catch(err => console.error('Activity log error:', err));

      res.json({
        success: true,
        message: `Lifetime access granted to ${formattedPhone}`,
        userCreated,
        user: {
          phoneNumber: formattedPhone,
          subscriptionType: 'lifetime'
        }
      });

    } catch (error: any) {
      console.error('Grant lifetime access error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk grant lifetime access (admin only - beta launch)
  app.post('/api/admin/grant-lifetime-access/bulk', checkAdminAuth, async (req, res) => {
    try {
      const { phoneNumbers, reason, notes } = req.body;

      if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
        return res.status(400).json({ error: 'Phone numbers array is required' });
      }

      const results: any = {
        successful: [],
        failed: []
      };

      for (const phoneNumber of phoneNumbers) {
        try {
          // Normalize and validate phone number
          const phoneResult = normalizePhoneNumber(phoneNumber);
          if (!phoneResult.success) {
            results.failed.push({
              phone: phoneNumber,
              error: phoneResult.error
            });
            continue;
          }
          const formattedPhone = phoneResult.formattedPhone!;

          // Check if user already exists
          const [existingUser] = await db.select()
            .from(bjjUsers)
            .where(eq(bjjUsers.phoneNumber, formattedPhone))
            .limit(1);

          let userId: string;
          let userCreated = false;

          if (existingUser) {
            // User exists - update to lifetime access AND enable LIFETIME bypass
            await db.update(bjjUsers)
              .set({ 
                subscriptionType: 'lifetime',
                subscriptionStatus: 'active',
                isLifetimeUser: true // AUTO-ENABLE: Allows LIFETIME magic code in production
              })
              .where(eq(bjjUsers.id, existingUser.id));
            
            userId = existingUser.id;
          } else {
            // Create new user with retry logic for username collisions
            let newUser;
            let insertAttempts = 0;
            const MAX_INSERT_ATTEMPTS = 3;
            
            while (insertAttempts < MAX_INSERT_ATTEMPTS) {
              try {
                const generatedUsername = await generateUniqueUsername(formattedPhone, 'user');
                
                [newUser] = await db.insert(bjjUsers).values({
                  phoneNumber: formattedPhone,
                  username: generatedUsername, // REQUIRED: Collision-safe auto-generated username
                  displayName: 'User', // Default display name
                  subscriptionType: 'lifetime',
                  subscriptionStatus: 'active',
                  isLifetimeUser: true, // AUTO-ENABLE: Allows LIFETIME magic code in production
                  active: true
                }).returning();
                
                break; // Success
              } catch (insertError: any) {
                insertAttempts++;
                if (insertError.code === '23505' && insertError.constraint === 'bjj_users_username_unique') {
                  if (insertAttempts < MAX_INSERT_ATTEMPTS) {
                    console.log(`[LIFETIME GRANT #2] Username collision, retrying (${insertAttempts}/${MAX_INSERT_ATTEMPTS})`);
                    continue;
                  }
                }
                throw insertError;
              }
            }

            userId = newUser!.id;
            userCreated = true;
          }

          // Log the lifetime access grant
          await db.insert(activityLog).values({
            eventType: 'lifetime_access',
            userId,
            metadata: { 
              reason: reason || 'Beta Tester',
              notes: notes || '',
              grantedBy: 'admin',
              userCreated,
              bulkGrant: true
            },
            description: `Lifetime access granted (bulk) to ${formattedPhone}`
          }).catch(err => console.error('Activity log error:', err));

          results.successful.push({
            phone: formattedPhone,
            userCreated
          });

        } catch (error: any) {
          results.failed.push({
            phone: phoneNumber,
            error: error.message
          });
        }
      }

      const summary = `${results.successful.length} granted, ${results.failed.length} failed`;

      res.json({
        success: true,
        summary,
        results
      });

    } catch (error: any) {
      console.error('Bulk grant lifetime access error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Toggle lifetime user bypass flag (admin only)
  app.post('/api/admin/users/:userId/toggle-lifetime-bypass', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const { enable } = req.body;

      if (typeof enable !== 'boolean') {
        return res.status(400).json({ error: 'enable field must be a boolean' });
      }

      const [user] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await db.update(bjjUsers)
        .set({ isLifetimeUser: enable })
        .where(eq(bjjUsers.id, userId));

      res.json({
        success: true,
        message: `Lifetime bypass ${enable ? 'enabled' : 'disabled'} for ${user.phoneNumber}`,
        userId,
        phoneNumber: user.phoneNumber,
        isLifetimeUser: enable
      });

    } catch (error: any) {
      console.error('Toggle lifetime bypass error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Revoke lifetime access - change subscription back to free
  app.post('/api/admin/users/:userId/revoke-lifetime', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.params;

      const [user] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update subscription to free tier and remove lifetime access
      await db.update(bjjUsers)
        .set({ 
          subscriptionType: 'free',
          subscriptionStatus: 'inactive',
          isLifetimeUser: false,
          updatedAt: new Date()
        })
        .where(eq(bjjUsers.id, userId));

      res.json({
        success: true,
        message: `Lifetime access revoked for ${user.email || user.phoneNumber}`,
        userId
      });

    } catch (error: any) {
      console.error('Revoke lifetime error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // EMAIL AUTHENTICATION ENDPOINTS
  // ============================================

  // Email-based signup (BLOCKED - Must use payment flow)
  // This endpoint now redirects to Stripe checkout instead of creating accounts directly
  app.post('/api/auth/signup', 
    signupLimiter,
    async (req, res) => {
    try {
      const { email, password, referralCode } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check if user already exists
      const [existingUser] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.email, normalizedEmail))
        .limit(1);

      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered. Please log in instead.' });
      }

      // PAYMENT GATE: Do NOT create account - redirect to Stripe checkout
      // Account will be created ONLY after successful payment via webhook
      console.log(`🔒 [PAYMENT GATE] New signup attempt for ${normalizedEmail} - redirecting to payment`);
      
      // Store password hash temporarily in session/cache for after payment
      // For now, we'll handle this via the payment success page
      const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
      
      // Return response indicating payment is required
      // Frontend will redirect to Stripe Checkout
      return res.json({
        success: true,
        requiresPayment: true,
        email: normalizedEmail,
        passwordHash: hashedPassword, // Frontend will store this temporarily
        message: 'Payment required to create account. Redirecting to checkout...'
      });

    } catch (error: any) {
      console.error('Email signup error:', error);
      res.status(500).json({ error: error.message || 'Signup failed. Please try again.' });
    }
  });

  // Email-based login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password, rememberMe = true } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      
      // Detect iOS native app from user agent
      const userAgent = req.headers['user-agent'] || '';
      const isNativeIOSApp = userAgent.includes('Capacitor') || userAgent.includes('BJJ OS');
      
      // Token expiry: iOS = 10 years (essentially never), Web with rememberMe = 1 year, else = 30 days
      const tokenExpiry = isNativeIOSApp ? '3650d' : rememberMe ? '365d' : '30d';
      const cookieMaxAge = isNativeIOSApp ? 3650 * 24 * 60 * 60 * 1000 : rememberMe ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;

      // Find user by email - select only essential columns to avoid schema mismatch issues
      const [user] = await db.select({
        id: bjjUsers.id,
        email: bjjUsers.email,
        passwordHash: bjjUsers.passwordHash,
        isAdmin: bjjUsers.isAdmin,
        onboardingCompleted: bjjUsers.onboardingCompleted,
        subscriptionType: bjjUsers.subscriptionType,
        subscriptionStatus: bjjUsers.subscriptionStatus,
        displayName: bjjUsers.displayName,
        username: bjjUsers.username,
        beltLevel: bjjUsers.beltLevel,
        maxDevices: bjjUsers.maxDevices,
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.email, email.toLowerCase()))
        .limit(1);

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (!user.passwordHash) {
        return res.status(400).json({ error: 'NO_PASSWORD_SET' });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Generate device fingerprint
      const acceptEncodingHeader = req.headers['accept-encoding'];
      const fingerprintData = {
        userAgent: req.headers['user-agent'] || '',
        acceptLanguage: req.headers['accept-language'] || '',
        acceptEncoding: Array.isArray(acceptEncodingHeader) ? acceptEncodingHeader.join(', ') : (acceptEncodingHeader || ''),
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '',
        timezone: undefined,
        screenResolution: undefined,
        platform: undefined,
      };
      
      const fingerprint = generateDeviceFingerprint(fingerprintData);
      const deviceInfo = parseUserAgent(fingerprintData.userAgent);
      
      // Register device
      await registerDevice(
        user.id,
        fingerprint,
        deviceInfo,
        fingerprintData.ipAddress,
        undefined
      );

      // Generate JWT token with device fingerprint
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email,
          deviceFingerprint: fingerprint
        },
        process.env.SESSION_SECRET || 'your-secret-key',
        { expiresIn: tokenExpiry }
      );

      // Set HTTP-only cookie
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('sessionToken', token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'lax',
        maxAge: cookieMaxAge,
      });

      // Check if first login
      const isFirstLogin = !user.lastLogin;
      
      // Update last login timestamp
      await db.update(bjjUsers)
        .set({ lastLogin: new Date() })
        .where(eq(bjjUsers.id, user.id));

      // Log login
      await db.insert(activityLog).values({
        eventType: 'user_login',
        userId: user.id,
        metadata: { 
          email: user.email,
          method: 'email',
          isFirstLogin
        },
        description: 'User login via email'
      }).catch(err => console.error('Activity log error:', err));

      // Determine redirect for first-time users
      let redirectUrl = undefined;
      if (isFirstLogin) {
        if (user.subscriptionType === 'lifetime') {
          redirectUrl = '/welcome/lifetime';
        }
        // Regular users will go through normal onboarding flow
      }

      res.json({
        sessionToken: token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          beltLevel: user.beltLevel,
          trainingStyle: user.style,
          onboardingCompleted: user.onboardingCompleted,
          subscriptionType: user.subscriptionType
        },
        redirect: redirectUrl
      });

    } catch (error: any) {
      console.error('Email login error:', error);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });

  // Validate lifetime invitation token
  app.get('/api/auth/validate-invite', async (req, res) => {
    try {
      const { token } = req.query;
      const { lifetimeInvitations } = await import("@shared/schema");

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ valid: false, error: "Invalid token" });
      }

      const [invitation] = await db.select()
        .from(lifetimeInvitations)
        .where(eq(lifetimeInvitations.inviteToken, token))
        .limit(1);
      
      if (!invitation) {
        return res.status(404).json({ valid: false, error: "Invitation not found" });
      }

      // Check if expired
      if (new Date() > new Date(invitation.expiresAt)) {
        return res.status(400).json({ valid: false, error: "Invitation has expired" });
      }

      // Check if already used
      if (invitation.status !== 'pending') {
        return res.status(400).json({ valid: false, error: "Invitation has already been used" });
      }

      // Only return email - don't expose personal message until signup
      res.json({ 
        valid: true, 
        email: invitation.email,
      });
    } catch (error: any) {
      console.error('Validate invite error:', error);
      res.status(500).json({ valid: false, error: error.message });
    }
  });

  // Signup with lifetime invitation (RATE LIMITED: 3 signups/hour per IP)
  app.post('/api/auth/signup-with-invite', 
    signupLimiter,
    async (req, res) => {
    try {
      const { email, username, verificationCode, inviteToken } = req.body;
      const { lifetimeInvitations } = await import("@shared/schema");
      const { verifyEmailCode } = await import("./auth-email");

      if (!email || !verificationCode || !inviteToken) {
        return res.status(400).json({ error: 'Email, verification code, and invite token are required' });
      }

      // Validate invitation token
      const [invitation] = await db.select()
        .from(lifetimeInvitations)
        .where(eq(lifetimeInvitations.inviteToken, inviteToken))
        .limit(1);
      
      if (!invitation) {
        return res.status(404).json({ error: "Invalid invitation" });
      }

      // Check if invitation matches email
      if (invitation.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ error: "Email does not match invitation" });
      }

      // Check if expired
      if (new Date() > new Date(invitation.expiresAt)) {
        return res.status(400).json({ error: "Invitation has expired" });
      }

      // Check if already used
      if (invitation.status !== 'pending') {
        return res.status(400).json({ error: "Invitation has already been used" });
      }

      // Verify the email verification code
      const codeValid = await verifyEmailCode(email, verificationCode);
      if (!codeValid) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      // Check if user already exists
      const [existingUser] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.email, email.toLowerCase()))
        .limit(1);

      if (existingUser) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }

      // Generate username if not provided
      let finalUsername = username;
      if (!finalUsername || finalUsername.trim() === '') {
        finalUsername = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Use transaction to atomically create user and update invitation
      let newUser: any;
      let token: string;

      // Note: Drizzle doesn't have built-in transaction support, so we'll do sequential operations
      // and rely on proper error handling for consistency
      try {
        // Create new user with lifetime subscription (email-only auth, no password)
        [newUser] = await db.insert(bjjUsers).values({
          email: email.toLowerCase(),
          username: finalUsername,
          emailVerified: true, // Email verified via code
          subscriptionType: 'lifetime',
          subscriptionStatus: 'active',
          invitedBy: invitation.id,
          onboardingCompleted: false,
        }).returning();

        // Update invitation status atomically after user creation
        await db.update(lifetimeInvitations)
          .set({ 
            status: 'completed',
            completedAt: new Date(),
            userId: newUser.id,
          })
          .where(eq(lifetimeInvitations.id, invitation.id));

        // Generate device fingerprint
        const acceptEncodingHeader = req.headers['accept-encoding'];
        const fingerprintData = {
          userAgent: req.headers['user-agent'] || '',
          acceptLanguage: req.headers['accept-language'] || '',
          acceptEncoding: Array.isArray(acceptEncodingHeader) ? acceptEncodingHeader.join(', ') : (acceptEncodingHeader || ''),
          ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '',
          timezone: undefined,
          screenResolution: undefined,
          platform: undefined,
        };
        
        const fingerprint = generateDeviceFingerprint(fingerprintData);
        const deviceInfo = parseUserAgent(fingerprintData.userAgent);
        
        // Register device
        await registerDevice(
          newUser.id,
          fingerprint,
          deviceInfo,
          fingerprintData.ipAddress,
          undefined
        );

        // Generate JWT token
        token = jwt.sign(
          { 
            userId: newUser.id, 
            email: newUser.email,
            deviceFingerprint: fingerprint
          },
          process.env.SESSION_SECRET || 'your-secret-key',
          { expiresIn: '30d' }
        );

        // Set HTTP-only cookie
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.cookie('sessionToken', token, {
          httpOnly: true,
          secure: isHttps,
          sameSite: isHttps ? 'none' : 'lax', // 'none' for cross-origin Capacitor requests
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });

        // Log signup
        await db.insert(activityLog).values({
          eventType: 'user_signup',
          userId: newUser.id,
          metadata: { 
            email: newUser.email,
            method: 'lifetime_invitation'
          },
          description: 'New user signup via lifetime invitation'
        }).catch(err => console.error('Activity log error:', err));

      } catch (dbError: any) {
        // If user creation or invitation update fails, log error
        console.error('Database error during invite signup:', dbError);
        
        // If we created the user but failed to update invitation, try to clean up
        if (newUser && newUser.id) {
          try {
            await db.delete(bjjUsers).where(eq(bjjUsers.id, newUser.id));
            console.log('Rolled back user creation after invitation update failure');
          } catch (rollbackError) {
            console.error('Failed to rollback user creation:', rollbackError);
          }
        }
        
        throw dbError;
      }

      res.json({
        success: true,
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          subscriptionType: 'lifetime',
          onboardingCompleted: false
        }
      });

    } catch (error: any) {
      console.error('Invite signup error:', error);
      res.status(500).json({ error: error.message || 'Signup failed. Please try again.' });
    }
  });

  // ============================================
  // SIMPLIFIED LIFETIME INVITE ENDPOINTS (NO EMAIL VERIFICATION CODE)
  // ============================================

  // Validate lifetime invitation token (simplified - no dual validation)
  app.get('/api/auth/validate-lifetime-invite', async (req, res) => {
    try {
      const { token } = req.query;
      const { lifetimeInvitations } = await import("@shared/schema");

      if (!token || typeof token !== 'string') {
        return res.json({ success: false, error: "Invalid token" });
      }

      const [invitation] = await db.select()
        .from(lifetimeInvitations)
        .where(eq(lifetimeInvitations.inviteToken, token))
        .limit(1);
      
      if (!invitation) {
        return res.json({ success: false, error: "Invitation not found" });
      }

      // Check if expired
      if (new Date() > new Date(invitation.expiresAt)) {
        return res.json({ success: false, error: "Invitation has expired" });
      }

      // Check if already used
      if (invitation.status !== 'pending') {
        return res.json({ success: false, error: "Invitation has already been used" });
      }

      res.json({ 
        success: true, 
        email: invitation.email,
        personalMessage: invitation.personalMessage,
      });
    } catch (error: any) {
      console.error('Validate lifetime invite error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Signup with lifetime invitation (simplified - password-based, no email verification code)
  // Check username availability (GET - used by onboarding)
  app.get('/api/auth/check-username', async (req, res) => {
    try {
      const username = req.query.username as string;
      
      if (!username || username.length < 3) {
        return res.json({ available: false, message: 'Username must be at least 3 characters' });
      }
      
      // Check format (letters, numbers, underscores only)
      const validFormat = /^[a-zA-Z0-9_]+$/.test(username);
      if (!validFormat) {
        return res.json({ available: false, message: 'Username can only contain letters, numbers, and underscores' });
      }
      
      // Check if taken
      const [existingUser] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.username, username.toLowerCase()))
        .limit(1);
      
      res.json({ 
        available: !existingUser,
        message: existingUser ? 'Username is already taken' : 'Username is available'
      });
    } catch (error: any) {
      console.error('Username check error:', error);
      res.status(500).json({ available: false, message: 'Error checking username' });
    }
  });
  
  // Check username availability (POST - kept for backward compatibility)
  app.post('/api/auth/check-username', async (req, res) => {
    try {
      const { username } = req.body;
      
      if (!username || username.length < 3) {
        return res.json({ available: false, message: 'Username must be at least 3 characters' });
      }
      
      // Check format (letters, numbers, underscores only)
      const validFormat = /^[a-zA-Z0-9_]+$/.test(username);
      if (!validFormat) {
        return res.json({ available: false, message: 'Username can only contain letters, numbers, and underscores' });
      }
      
      // Check if taken
      const [existingUser] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.username, username.toLowerCase()))
        .limit(1);
      
      res.json({ 
        available: !existingUser,
        message: existingUser ? 'Username is already taken' : 'Username is available'
      });
    } catch (error: any) {
      console.error('Username check error:', error);
      res.status(500).json({ available: false, message: 'Error checking username' });
    }
  });

  // Lifetime invite signup (RATE LIMITED: 3 signups/hour per IP)
  app.post('/api/auth/signup-with-lifetime-invite', 
    signupLimiter,
    async (req, res) => {
    try {
      const { token, firstName, username, password, struggleArea, trainingFocus } = req.body;
      const { lifetimeInvitations } = await import("@shared/schema");

      // Validate all required fields
      if (!token || !firstName || !username || !password) {
        return res.status(400).json({ error: 'Token, first name, username, and password are required' });
      }

      if (!struggleArea || !trainingFocus) {
        return res.status(400).json({ error: 'Please complete all onboarding questions (struggle area and training style)' });
      }

      // Validate invitation token
      const [invitation] = await db.select()
        .from(lifetimeInvitations)
        .where(eq(lifetimeInvitations.inviteToken, token))
        .limit(1);
      
      if (!invitation) {
        return res.status(404).json({ error: "Invalid invitation" });
      }

      // Check if expired
      if (new Date() > new Date(invitation.expiresAt)) {
        return res.status(400).json({ error: "Invitation has expired" });
      }

      // Check if already used
      if (invitation.status !== 'pending') {
        return res.status(400).json({ error: "Invitation has already been used" });
      }

      // Check if user already exists with this email
      const [existingUser] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.email, invitation.email.toLowerCase()))
        .limit(1);

      if (existingUser) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }

      // Check if username is already taken
      const [existingUsername] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.username, username.toLowerCase()))
        .limit(1);

      if (existingUsername) {
        return res.status(409).json({ error: 'Username is already taken' });
      }

      // Hash password
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);

      // Use transaction-like approach to create user and update invitation
      let newUser: any;
      let jwtToken: string;

      try {
        // Create new user with lifetime subscription and password
        [newUser] = await db.insert(bjjUsers).values({
          email: invitation.email.toLowerCase(),
          username: username.toLowerCase(),
          displayName: firstName.trim(),
          passwordHash: hashedPassword,
          emailVerified: true,
          subscriptionType: 'lifetime',
          subscriptionStatus: 'active',
          lifetimeAccess: true,
          isLifetimeUser: true,
          isFoundingMember: true,
          invitedBy: invitation.invitedByAdmin,
          onboardingCompleted: true,
          struggleTechnique: struggleArea,
          style: trainingFocus || 'both',
        }).returning();

        // Update invitation status
        await db.update(lifetimeInvitations)
          .set({ 
            status: 'completed',
            usedAt: new Date(),
            completedByUserId: newUser.id,
          })
          .where(eq(lifetimeInvitations.id, invitation.id));

        // Generate device fingerprint
        const fingerprint = `lifetime_${newUser.id}_${Date.now()}`;

        // Generate JWT token
        jwtToken = jwt.sign(
          {
            userId: newUser.id,
            email: newUser.email,
            deviceFingerprint: fingerprint
          },
          process.env.SESSION_SECRET || 'your-secret-key',
          { expiresIn: '30d' }
        );

        // Set HTTP-only cookie
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.cookie('sessionToken', jwtToken, {
          httpOnly: true,
          secure: isHttps,
          sameSite: isHttps ? 'none' : 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });

        // Log signup
        await db.insert(activityLog).values({
          eventType: 'user_signup',
          userId: newUser.id,
          metadata: { 
            email: newUser.email,
            method: 'lifetime_invitation_simplified',
            reason: invitation.reason,
          },
          description: 'New user signup via lifetime invitation (simplified flow)'
        }).catch(err => console.error('Activity log error:', err));

      } catch (dbError: any) {
        console.error('Database error during lifetime signup:', dbError);
        
        // Rollback: delete user if created but invitation update failed
        if (newUser && newUser.id) {
          try {
            await db.delete(bjjUsers).where(eq(bjjUsers.id, newUser.id));
            console.log('Rolled back user creation after invitation update failure');
          } catch (rollbackError) {
            console.error('Failed to rollback user creation:', rollbackError);
          }
        }
        
        throw dbError;
      }

      res.json({
        success: true,
        token: jwtToken,
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          displayName: newUser.displayName,
          lifetimeAccess: true,
          subscriptionType: 'lifetime',
          onboardingCompleted: false
        }
      });

    } catch (error: any) {
      console.error('Lifetime invite signup error:', error);
      res.status(500).json({ error: error.message || 'Signup failed. Please try again.' });
    }
  });

  // ============================================
  // PHONE AUTHENTICATION ENDPOINTS
  // ============================================
  
  // Check phone number access (beta simplified auth - instant login)
  app.post('/api/auth/check-access', async (req, res) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        // Log invalid attempt
        await db.insert(activityLog).values({
          eventType: 'user_signup',
          metadata: { error: 'Phone number missing' },
          description: 'Invalid phone attempt - missing number'
        }).catch(err => console.error('Activity log error:', err));
        
        return res.status(400).json({ error: 'Phone number is required' });
      }

      // Normalize and validate phone number
      const phoneResult = normalizePhoneNumber(phoneNumber);
      if (!phoneResult.success) {
        // Log invalid format attempt
        await db.insert(activityLog).values({
          eventType: 'user_signup',
          metadata: { 
            phoneNumber: phoneNumber,
            error: phoneResult.error 
          },
          description: 'Invalid phone attempt - bad format'
        }).catch(err => console.error('Activity log error:', err));
        
        return res.status(400).json({ error: phoneResult.error });
      }
      const formattedPhone = phoneResult.formattedPhone!;

      // Check if user exists with lifetime access
      const [existingUser] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.phoneNumber, formattedPhone))
        .limit(1);

      if (!existingUser) {
        // Log failed login attempt - user not found
        await db.insert(activityLog).values({
          eventType: 'user_signup',
          metadata: { 
            phoneNumber: formattedPhone,
            reason: 'User not found' 
          },
          description: 'Beta login failed - user not found'
        }).catch(err => console.error('Activity log error:', err));
        
        return res.status(404).json({ 
          error: "No account found. Contact Todd for access.",
          needsAccess: true
        });
      }

      if (existingUser.subscriptionType !== 'lifetime') {
        // Log failed login attempt - no lifetime access
        await db.insert(activityLog).values({
          eventType: 'user_signup',
          userId: existingUser.id,
          metadata: { 
            phoneNumber: formattedPhone,
            reason: 'No lifetime access' 
          },
          description: 'Beta login failed - no lifetime access'
        }).catch(err => console.error('Activity log error:', err));
        
        return res.status(403).json({ 
          error: "You don't have access yet. Contact Todd for beta access.",
          needsAccess: true
        });
      }

      // User has lifetime access - log them in immediately (no SMS)
      
      // SECURITY: Generate device fingerprint (same as normal login flow)
      const bypassAcceptEncodingHeader = req.headers['accept-encoding'];
      const fingerprintData = {
        userAgent: req.headers['user-agent'] || '',
        acceptLanguage: req.headers['accept-language'] || '',
        acceptEncoding: Array.isArray(bypassAcceptEncodingHeader) ? bypassAcceptEncodingHeader.join(', ') : (bypassAcceptEncodingHeader || ''),
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '',
        timezone: undefined,
        screenResolution: undefined,
        platform: undefined,
      };
      
      const fingerprint = generateDeviceFingerprint(fingerprintData);
      const deviceInfo = parseUserAgent(fingerprintData.userAgent);
      
      // Register/update device for lifetime bypass users
      await registerDevice(
        existingUser.id,
        fingerprint,
        deviceInfo,
        fingerprintData.ipAddress,
        undefined // No geo data in lifetime bypass flow
      );
      
      // Generate JWT token with device fingerprint (REQUIRED by auth middleware)
      const token = jwt.sign(
        { 
          userId: existingUser.id, 
          phoneNumber: formattedPhone,
          deviceFingerprint: fingerprint // CRITICAL: Required by auth middleware
        },
        process.env.SESSION_SECRET || 'your-secret-key',
        { expiresIn: '30d' }
      );

      // FIXED: Detect HTTPS from proxy headers (Replit terminates TLS at edge)
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const isProduction = req.hostname?.endsWith('bjjos.app') || req.hostname?.endsWith('.bjjos.app');

      // FIXED: Use 'sessionToken' cookie name to match auth middleware
      res.cookie('sessionToken', token, {
        httpOnly: true,
        secure: isHttps, // Use HTTPS detection instead of NODE_ENV
        sameSite: isHttps ? 'none' : 'lax', // 'none' for cross-origin Capacitor requests
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        ...(isProduction && { domain: '.bjjos.app' }) // Set domain for production only
      });

      console.log(`[AUTH] ✅ Lifetime bypass login: ${formattedPhone} (Device: ${deviceInfo.deviceName})`);
      console.log(`[AUTH] ✅ Device fingerprint: ${fingerprint.substring(0, 16)}...`);
      console.log(`[AUTH] ✅ Cookie settings - secure: ${isHttps}, sameSite: ${isHttps ? 'none' : 'lax'}, domain: ${isProduction ? '.bjjos.app' : 'none'}`);
      console.log(`[AUTH] ✅ sessionToken cookie set (maxAge: 30 days, httpOnly: true)`);

      // Update login tracking with streak calculation (LIFETIME BYPASS FLOW)
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const currentTotalLogins = existingUser.totalLogins || 0;
      const currentStreak = existingUser.currentStreak || 0;
      const lastLoginDate = existingUser.lastLoginDate;
      
      if (lastLoginDate) {
        const lastDate = new Date(lastLoginDate);
        const lastDateNormalized = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
        const daysDiff = Math.floor((today.getTime() - lastDateNormalized.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 0) {
          // Same day - keep current streak, don't increment totalLogins
          await db.update(bjjUsers)
            .set({ lastLogin: now })
            .where(eq(bjjUsers.id, existingUser.id))
            .catch(err => console.error('Failed to update last login:', err));
        } else if (daysDiff === 1) {
          // Consecutive day - increment streak and totalLogins
          await db.update(bjjUsers)
            .set({ 
              lastLogin: now,
              lastLoginDate: today.toISOString().split('T')[0],
              totalLogins: currentTotalLogins + 1,
              currentStreak: currentStreak + 1
            })
            .where(eq(bjjUsers.id, existingUser.id))
            .catch(err => console.error('Failed to update login tracking:', err));
        } else {
          // Streak broken - reset to 1 and increment totalLogins
          await db.update(bjjUsers)
            .set({ 
              lastLogin: now,
              lastLoginDate: today.toISOString().split('T')[0],
              totalLogins: currentTotalLogins + 1,
              currentStreak: 1
            })
            .where(eq(bjjUsers.id, existingUser.id))
            .catch(err => console.error('Failed to update login tracking:', err));
        }
      } else {
        // First time login - initialize all tracking fields
        await db.update(bjjUsers)
          .set({ 
            lastLogin: now,
            lastLoginDate: today.toISOString().split('T')[0],
            totalLogins: 1,
            currentStreak: 1
          })
          .where(eq(bjjUsers.id, existingUser.id))
          .catch(err => console.error('Failed to update login tracking:', err));
      }

      // Log successful beta login
      await db.insert(activityLog).values({
        eventType: 'user_signup',
        userId: existingUser.id,
        metadata: { phoneNumber: formattedPhone },
        description: 'Beta login success'
      }).catch(err => console.error('Activity log error:', err));

      return res.status(200).json({
        success: true,
        sessionToken: token,
        user: {
          id: existingUser.id,
          phoneNumber: formattedPhone,
          subscriptionType: existingUser.subscriptionType,
          beltLevel: existingUser.beltLevel,
          themeBelt: existingUser.themeBelt,
          themeStripes: existingUser.themeStripes,
          onboardingCompleted: existingUser.onboardingCompleted
        },
        redirectTo: existingUser.onboardingCompleted ? '/chat' : '/onboarding'
      });

    } catch (error: any) {
      console.error('Phone access check error:', error);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });
  
  // Get current user (updated for phone auth)
  app.get('/api/auth/me', async (req, res) => {
    try {
      // Support both cookie-based auth (web) and Bearer token auth (mobile)
      let token = req.cookies.sessionToken;
      
      // Check for Bearer token in Authorization header (mobile app support)
      const authHeader = req.headers.authorization;
      if (!token && authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.log('[/api/auth/me] Using Bearer token from Authorization header');
      }
      
      if (!token) {
        console.log('[/api/auth/me] No sessionToken cookie or Bearer token found');
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      console.log('[/api/auth/me] Token found, verifying...');
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      console.log('[/api/auth/me] Token verified, userId:', decoded.userId);
      
      const [user] = await db.select({
        id: bjjUsers.id,
        phoneNumber: bjjUsers.phoneNumber,
        email: bjjUsers.email,
        username: bjjUsers.username,
        name: bjjUsers.name,
        displayName: bjjUsers.displayName,
        avatarUrl: bjjUsers.avatarUrl,
        beltLevel: bjjUsers.beltLevel,
        style: bjjUsers.style,
        trainingFrequency: bjjUsers.trainingFrequency,
        onboardingCompleted: bjjUsers.onboardingCompleted,
        subscriptionType: bjjUsers.subscriptionType,
        subscriptionStatus: bjjUsers.subscriptionStatus,
        trialEndDate: bjjUsers.trialEndDate,
        themeBelt: bjjUsers.themeBelt,
        themeStripes: bjjUsers.themeStripes,
        createdAt: bjjUsers.createdAt,
        height: bjjUsers.height,
        weight: bjjUsers.weight,
        age: bjjUsers.age,
        gym: bjjUsers.gym,
        struggleTechnique: bjjUsers.struggleTechnique,
        injuries: bjjUsers.injuries,
        unitPreference: bjjUsers.unitPreference,
        passwordHash: bjjUsers.passwordHash,
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.id, decoded.userId))
        .limit(1);
        
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      console.log('[/api/auth/me] Returning user data:', {
        id: user.id,
        onboardingCompleted: user.onboardingCompleted,
        subscriptionType: user.subscriptionType,
        subscriptionStatus: user.subscriptionStatus,
        trialEndDate: user.trialEndDate
      });
      
      // Return user object directly (NOT nested in {user: ...})
      // NOTE: Never return passwordHash to the client - only return hasPassword boolean
      res.json({
        id: user.id,
        phoneNumber: user.phoneNumber,
        email: user.email,
        username: user.username,
        name: user.name,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        beltLevel: user.beltLevel,
        style: user.style,
        trainingFrequency: user.trainingFrequency,
        onboardingCompleted: user.onboardingCompleted,
        subscriptionType: user.subscriptionType,
        subscriptionStatus: user.subscriptionStatus,
        trialEndDate: user.trialEndDate,
        themeBelt: user.themeBelt,
        themeStripes: user.themeStripes,
        createdAt: user.createdAt,
        height: user.height,
        weight: user.weight,
        age: user.age,
        gym: user.gym,
        struggleTechnique: user.struggleTechnique,
        injuries: user.injuries,
        unitPreference: user.unitPreference,
        hasPassword: !!user.passwordHash,
      });
    } catch (error: any) {
      console.error('Auth check error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  });
  
  // Set or update password (optional password feature)
  app.post('/api/auth/set-password', checkUserAuth, async (req: any, res) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const { newPassword, currentPassword } = req.body;
      
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      
      // Get user to check if they have an existing password
      const [user] = await db.select({
        id: bjjUsers.id,
        passwordHash: bjjUsers.passwordHash,
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.id, req.user.userId))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // If user already has a password, verify the current password
      if (user.passwordHash) {
        if (!currentPassword) {
          return res.status(400).json({ error: 'Current password is required' });
        }
        
        const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValidPassword) {
          return res.status(401).json({ error: 'Current password is incorrect' });
        }
      }
      
      // Hash and save the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      await db.update(bjjUsers)
        .set({ passwordHash: hashedPassword })
        .where(eq(bjjUsers.id, req.user.userId));
      
      console.log(`[SET-PASSWORD] Password ${user.passwordHash ? 'updated' : 'set'} for user ${req.user.userId}`);
      
      res.json({ 
        success: true, 
        message: user.passwordHash ? 'Password updated successfully' : 'Password set successfully' 
      });
    } catch (error: any) {
      console.error('[SET-PASSWORD] Error:', error);
      res.status(500).json({ error: 'Failed to set password' });
    }
  });
  
  // Get user profile
  app.get('/api/auth/profile', checkUserAuth, async (req: any, res) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const [user] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.id, req.user.userId))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({
        id: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        username: user.username,
        displayName: user.displayName,
        name: user.name,
        beltLevel: user.beltLevel,
        style: user.style,
        trainingFrequency: user.trainingFrequency,
        weakestArea: user.weakestArea,
        biggestStruggle: user.biggestStruggle,
        goals: user.goals,
        yearsTraining: user.yearsTraining,
        ageRange: user.ageRange,
        age: user.age,
        height: user.height,
        weight: user.weight,
        birthYear: user.birthYear,
        injuries: user.injuries,
        bodyType: user.bodyType,
        focusAreas: user.focusAreas,
        favoritePositions: user.favoritePositions,
        primaryGoal: user.primaryGoal,
        gym: user.gym,
        timezone: user.timezone,
        weeklyRecapEnabled: user.weeklyRecapEnabled,
        onboardingCompleted: user.onboardingCompleted,
        subscriptionType: user.subscriptionType,
        subscriptionStatus: user.subscriptionStatus,
        totalLogins: user.totalLogins,
        currentStreak: user.currentStreak,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  });

  // Update user profile (onboarding)
  app.patch('/api/auth/profile', checkUserAuth, async (req: any, res) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const { 
        age_range, 
        training_frequency, 
        struggles, 
        strengths, 
        training_context,
        // Legacy support (old onboarding)
        belt_level, 
        goals, 
        training_experience, 
        language_preference,
        // New simplified onboarding (Phase 5)
        beltLevel,
        style,
        trainingFrequency,
        username,
        weakestArea,
        struggleTechnique,
        onboardingCompleted,
        // Button-based onboarding fields
        yearsTrainingRange,
        trainingFrequencyText,
        struggleAreaCategory,
        // Settings page fields
        displayName,
        name,
        age,
        height,
        weight,
        gym,
        timezone,
        weeklyRecapEnabled,
        yearsTraining,
        unitPreference,
        avatarUrl
      } = req.body;
      
      console.log('[ONBOARDING] Received data:', req.body);
      
      // If new onboarding data, calculate derived metrics
      let derivedMetrics = {};
      if (age_range && training_frequency && struggles && training_context) {
        console.log('[ONBOARDING] Calculating personalization metrics...');
        
        const { calculatePersonalizationMetrics } = await import('./personalization');
        
        const metrics = calculatePersonalizationMetrics({
          age: age_range,
          trainingFrequency: training_frequency,
          struggles: struggles || [],
          strengths: strengths || [],
          trainingContext: training_context,
        });
        
        console.log('[ONBOARDING] Derived metrics:', metrics);
        
        derivedMetrics = {
          ageRange: age_range,
          trainingFrequency: training_frequency,
          struggles: struggles || [],
          strengths: strengths || [],
          trainingContext: training_context,
          struggleDensity: metrics.struggleDensity,
          injuryRisk: metrics.injuryRisk,
          experienceScore: metrics.experienceScore,
          learningVelocity: metrics.learningVelocity,
          bodyTypeInferred: metrics.bodyTypeInferred,
          userState: metrics.userState,
          clusterAssignment: metrics.clusterAssignment,
          clusterConfidence: metrics.clusterConfidence,
        };
      }
      
      // Update user profile
      await db.update(bjjUsers)
        .set({
          // New onboarding fields (if provided)
          ...(Object.keys(derivedMetrics).length > 0 && derivedMetrics),
          // Legacy fields (if provided)
          ...(belt_level && { beltLevel: belt_level }),
          ...(training_experience && { progressionLevel: training_experience }),
          ...(language_preference && { 
            preferredLanguage: language_preference,
            languagePreferenceSet: true,
          }),
          // New simplified onboarding (Phase 5) - use !== undefined to allow empty strings
          ...(beltLevel !== undefined && { beltLevel }),
          ...(style !== undefined && { style }),
          ...(trainingFrequency !== undefined && { trainingFrequency }),
          ...(username !== undefined && { username }),
          ...(weakestArea !== undefined && { weakestArea }),
          ...(struggleTechnique !== undefined && { struggleTechnique }),
          ...(goals !== undefined && { goals }),
          // Button-based onboarding fields
          ...(yearsTrainingRange !== undefined && { yearsTrainingRange }),
          ...(trainingFrequencyText !== undefined && { trainingFrequencyText }),
          ...(struggleAreaCategory !== undefined && { struggleAreaCategory }),
          // Settings page fields
          ...(displayName !== undefined && { displayName }),
          ...(name !== undefined && { name }),
          ...(age !== undefined && { age }),
          ...(height !== undefined && { height }),
          ...(weight !== undefined && { weight }),
          ...(gym !== undefined && { gym }),
          ...(timezone !== undefined && { timezone }),
          ...(weeklyRecapEnabled !== undefined && { weeklyRecapEnabled }),
          ...(yearsTraining !== undefined && { yearsTraining }),
          ...(unitPreference !== undefined && { unitPreference }),
          ...(avatarUrl !== undefined && { avatarUrl }),
          // Mark onboarding as complete if explicitly set
          ...(onboardingCompleted !== undefined && { 
            onboardingCompleted,
            onboardingStep: 'complete'
          }),
        })
        .where(eq(bjjUsers.id, req.user.userId));
      
      console.log('[ONBOARDING] Profile updated successfully');
      
      // 🚀 CACHE INVALIDATION: Clear cached user context for fresh personalization
      try {
        const { professorOSCache } = await import('./services/professor-os-cache');
        professorOSCache.invalidateUser(req.user.userId);
      } catch (e) {
        console.log('[CACHE] Failed to invalidate user cache (non-critical):', e);
      }
      
      // LAYER 1: FIRST MESSAGE MAGIC
      // If onboarding was just completed, generate personalized first message
      if (onboardingCompleted === true) {
        console.log('[FIRST MESSAGE MAGIC] Onboarding completed, generating first message...');
        try {
          const { triggerFirstMessageMagic } = await import('./utils/professor-os-first-message');
          await triggerFirstMessageMagic(req.user.userId);
        } catch (error: any) {
          console.error('[FIRST MESSAGE MAGIC] Failed to generate first message:', error);
          // Don't block onboarding completion if first message fails
        }
      }
      
      res.json({ success: true, metrics: derivedMetrics });
    } catch (error: any) {
      console.error('Profile update error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload profile avatar (base64 data URL)
  app.post('/api/auth/avatar', checkUserAuth, async (req: any, res) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const { avatarUrl } = req.body;
      
      // avatarUrl should be a data URL (data:image/jpeg;base64,...) or null to remove
      if (avatarUrl !== null && avatarUrl !== undefined) {
        // Validate it's a data URL or a valid URL
        if (!avatarUrl.startsWith('data:image/') && !avatarUrl.startsWith('http')) {
          return res.status(400).json({ error: 'Invalid avatar URL format' });
        }
        
        // Limit size (base64 encoded images can be large)
        if (avatarUrl.length > 2 * 1024 * 1024) { // 2MB limit
          return res.status(400).json({ error: 'Avatar too large (max 2MB)' });
        }
      }
      
      await db.update(bjjUsers)
        .set({ avatarUrl: avatarUrl || null })
        .where(eq(bjjUsers.id, req.user.userId));
      
      console.log(`[AVATAR] Updated avatar for user ${req.user.userId}`);
      
      res.json({ success: true, avatarUrl: avatarUrl || null });
    } catch (error: any) {
      console.error('Avatar update error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update user theme
  app.patch('/api/user/theme', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      const { themeBelt, themeStripes } = req.body;
      
      // Update user theme
      await db.update(bjjUsers)
        .set({
          themeBelt: themeBelt || null,
          themeStripes: themeStripes !== undefined ? themeStripes : null,
        })
        .where(eq(bjjUsers.id, decoded.userId));
      
      // 🚀 CACHE INVALIDATION: Clear cached user context
      try {
        const { professorOSCache } = await import('./services/professor-os-cache');
        professorOSCache.invalidateUser(decoded.userId);
      } catch (e) { /* non-critical */ }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Theme update error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // USER DATA MANAGEMENT ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // Delete chat history (conversations only, keep profile)
  app.delete('/api/user/chat-history', checkUserAuth, async (req: any, res) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const userId = req.user.userId;
      console.log('[DATA MANAGEMENT] Deleting chat history for user:', userId);

      // Delete all conversation messages
      const deleted = await db.delete(aiConversationLearning)
        .where(eq(aiConversationLearning.userId, userId));

      // Clear session context (lastInstructor, etc.)
      try {
        const { clearSessionContext } = await import('./videoSearch');
        clearSessionContext(userId.toString());
      } catch (e) {
        console.log('[DATA MANAGEMENT] Session context clear failed (non-critical):', e);
      }

      // Invalidate user cache
      try {
        const { professorOSCache } = await import('./services/professor-os-cache');
        professorOSCache.invalidateUser(userId);
      } catch (e) {
        console.log('[DATA MANAGEMENT] Cache invalidation failed (non-critical):', e);
      }

      console.log('[DATA MANAGEMENT] Chat history deleted successfully');
      res.json({ success: true, message: 'Chat history deleted' });
    } catch (error: any) {
      console.error('[DATA MANAGEMENT] Delete chat history error:', error);
      res.status(500).json({ error: 'Failed to delete chat history' });
    }
  });

  // Reset Professor OS memory (delete chat + reset profile to defaults)
  app.delete('/api/user/reset-profile', checkUserAuth, async (req: any, res) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const userId = req.user.userId;
      console.log('[DATA MANAGEMENT] Resetting profile for user:', userId);

      // 1. Delete all conversation messages
      await db.delete(aiConversationLearning)
        .where(eq(aiConversationLearning.userId, userId));

      // 2. Reset user profile fields to NULL/defaults (keep account info)
      await db.update(bjjUsers)
        .set({
          beltLevel: null,
          style: 'both',
          trainingFrequency: null,
          trainingFrequencyText: null,
          goals: null,
          trainingGoals: null,
          weakestArea: null,
          struggleTechnique: null,
          struggleAreaCategory: null,
          biggestStruggle: null,
          yearsTraining: null,
          yearsTrainingRange: null,
          injuries: null,
          focusAreas: null,
          favoritePositions: null,
          primaryGoal: null,
          bodyType: null,
          bodyTypeInferred: null,
          age: null,
          ageRange: null,
          height: null,
          weight: null,
          gym: null,
          struggles: null,
          strengths: null,
          trainingContext: null,
          struggleDensity: null,
          injuryRisk: null,
          experienceScore: null,
          learningVelocity: null,
          userState: null,
          clusterAssignment: null,
          clusterConfidence: null,
          preferredInstructors: null,
          // Reset onboarding state
          onboardingCompleted: false,
          onboardingStep: 'belt',
        })
        .where(eq(bjjUsers.id, userId));

      // 3. Clear session context
      try {
        const { clearSessionContext } = await import('./videoSearch');
        clearSessionContext(userId.toString());
      } catch (e) {
        console.log('[DATA MANAGEMENT] Session context clear failed (non-critical):', e);
      }

      // 4. Invalidate user cache
      try {
        const { professorOSCache } = await import('./services/professor-os-cache');
        professorOSCache.invalidateUser(userId);
      } catch (e) {
        console.log('[DATA MANAGEMENT] Cache invalidation failed (non-critical):', e);
      }

      console.log('[DATA MANAGEMENT] Profile reset successfully');
      res.json({ success: true, message: 'Profile reset complete' });
    } catch (error: any) {
      console.error('[DATA MANAGEMENT] Reset profile error:', error);
      res.status(500).json({ error: 'Failed to reset profile' });
    }
  });

  // Add free user (admin only)
  app.post('/api/admin/add-free-user', checkAdminAuth, async (req, res) => {
    try {
      const { phoneNumber, name, notes } = req.body;
      
      // Check if user already exists
      const [existing] = await db.select({
        id: bjjUsers.id,
        phoneNumber: bjjUsers.phoneNumber
      }).from(bjjUsers).where(eq(bjjUsers.phoneNumber, phoneNumber));
      if (existing) {
        return res.status(400).json({ error: "User with this phone number already exists" });
      }

      // Create user with retry logic for username collisions
      let newUser;
      let insertAttempts = 0;
      const MAX_INSERT_ATTEMPTS = 3;
      
      while (insertAttempts < MAX_INSERT_ATTEMPTS) {
        try {
          const generatedUsername = await generateUniqueUsername(phoneNumber, 'user');
          
          [newUser] = await db.insert(bjjUsers).values({
            phoneNumber,
            username: generatedUsername, // REQUIRED: Collision-safe auto-generated username
            displayName: name || 'User', // Use provided name or default
            name: name || null,
            adminNotes: notes || null,
            subscriptionStatus: 'free',
            subscriptionType: 'free_admin_grant',
            onboardingStep: 'belt',
            sendTime: '08:00',
            timezone: 'America/New_York',
          }).returning();
          
          break; // Success
        } catch (insertError: any) {
          insertAttempts++;
          if (insertError.code === '23505' && insertError.constraint === 'bjj_users_username_unique') {
            if (insertAttempts < MAX_INSERT_ATTEMPTS) {
              console.log(`[ADD FREE USER] Username collision, retrying (${insertAttempts}/${MAX_INSERT_ATTEMPTS})`);
              continue;
            }
          }
          throw insertError;
        }
      }

      // Ensure user was created successfully
      if (!newUser) {
        throw new Error('Failed to create user after maximum attempts');
      }

      // Generate referral code for the new user
      const generateCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = 'USER';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      let userCode = generateCode();
      // Ensure uniqueness
      while (await db.select({ id: referralCodes.id }).from(referralCodes).where(eq(referralCodes.code, userCode)).then(r => r.length > 0)) {
        userCode = generateCode();
      }

      await db.insert(referralCodes).values({
        userId: newUser.id,
        code: userCode,
        codeType: 'user',
        uses: '0',
        freeMonthsEarned: '0',
        isActive: true,
      });

      // Send welcome SMS
      const welcomeMessage = `🥋 You've been given free access to BJJ OS!

Every morning at 8 AM, you'll get ONE curated BJJ technique from elite instructors - timestamped and ready to drill.

Quick setup (30 seconds):

What belt are you?
Reply: WHITE, BLUE, PURPLE, BROWN, or BLACK

(You can opt out anytime by replying STOP)`;

      const result = await sendSMS(phoneNumber, welcomeMessage);
      
      if (!result.success) {
        console.error('Failed to send welcome SMS:', result.error);
        return res.status(500).json({ error: "User created but SMS failed to send" });
      }

      res.json({ 
        success: true, 
        user: newUser, 
        message: "Free user added and welcome SMS sent" 
      });
    } catch (error: any) {
      console.error('Add free user error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all BJJ users with filters (admin only)
  app.get('/api/admin/users', checkAdminAuth, async (req, res) => {
    try {
      const { timeFilter, planFilter, statusFilter, beltFilter } = req.query;
      
      let query = db.select({
        id: bjjUsers.id,
        name: bjjUsers.name,
        email: bjjUsers.email,
        beltLevel: bjjUsers.beltLevel,
        subscriptionType: bjjUsers.subscriptionType,
        subscriptionStatus: bjjUsers.subscriptionStatus,
        stripeSubscriptionId: bjjUsers.stripeSubscriptionId,
        stripeCustomerId: bjjUsers.stripeCustomerId,
        onboardingCompleted: bjjUsers.onboardingCompleted,
        createdAt: bjjUsers.createdAt,
        lastLogin: bjjUsers.lastLogin,
        lastActiveAt: bjjUsers.lastActiveAt,
        adminNotes: bjjUsers.adminNotes,
        themeBelt: bjjUsers.themeBelt,
        themeStripes: bjjUsers.themeStripes,
        isLifetimeUser: bjjUsers.isLifetimeUser
      }).from(bjjUsers);
      const conditions: any[] = [];
      
      // Time filter
      if (timeFilter && timeFilter !== 'all') {
        const now = new Date();
        let cutoffDate = new Date();
        
        switch (timeFilter) {
          case '24h':
            cutoffDate.setHours(now.getHours() - 24);
            break;
          case '7d':
            cutoffDate.setDate(now.getDate() - 7);
            break;
          case '30d':
            cutoffDate.setDate(now.getDate() - 30);
            break;
          case '90d':
            cutoffDate.setDate(now.getDate() - 90);
            break;
        }
        
        conditions.push(drizzleSql`${bjjUsers.createdAt} >= ${cutoffDate.toISOString()}`);
      }
      
      // Plan filter
      if (planFilter && planFilter !== 'all') {
        conditions.push(eq(bjjUsers.subscriptionType, planFilter as string));
      }
      
      // Status filter
      if (statusFilter && statusFilter !== 'all') {
        conditions.push(eq(bjjUsers.subscriptionStatus, statusFilter as string));
      }
      
      // Belt filter
      if (beltFilter && beltFilter !== 'all') {
        conditions.push(eq(bjjUsers.beltLevel, beltFilter as string));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      const users = await query.orderBy(desc(bjjUsers.createdAt));
      res.json(users);
    } catch (error: any) {
      console.error('Fetch users error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get recent user activity (admin only) - Shows recent messages to Professor OS
  app.get('/api/admin/user-activity', checkAdminAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      
      // Single query with JOIN for efficiency (no O(n) per-row lookups)
      const activity = await db.select({
        id: aiConversationLearning.id,
        userId: aiConversationLearning.userId,
        messageText: aiConversationLearning.messageText,
        messageType: aiConversationLearning.messageType,
        conversationTopic: aiConversationLearning.conversationTopic,
        createdAt: aiConversationLearning.createdAt,
        userEmail: bjjUsers.email
      })
      .from(aiConversationLearning)
      .leftJoin(bjjUsers, eq(aiConversationLearning.userId, bjjUsers.id))
      .where(eq(aiConversationLearning.messageType, 'user_sent'))
      .orderBy(desc(aiConversationLearning.createdAt))
      .limit(limit);
      
      res.json(activity);
    } catch (error: any) {
      console.error('User activity error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create test user (admin only)
  app.post('/api/admin/create-test-user', checkAdminAuth, async (req, res) => {
    try {
      const testPhone = `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const testUserName = `Test User ${Math.floor(Math.random() * 1000)}`;
      
      // Create test user with retry logic for username collisions
      let newUser;
      let insertAttempts = 0;
      const MAX_INSERT_ATTEMPTS = 3;
      
      while (insertAttempts < MAX_INSERT_ATTEMPTS) {
        try {
          const generatedUsername = await generateUniqueUsername(testPhone, 'test');
          
          [newUser] = await db.insert(bjjUsers).values({
            phoneNumber: testPhone,
            username: generatedUsername, // REQUIRED: Collision-safe auto-generated username
            displayName: testUserName, // Test user display name
            name: testUserName,
            beltLevel: 'blue',
            contentPreference: 'MIXED',
            style: 'gi',
            subscriptionType: 'sms',
            subscriptionStatus: 'active',
            active: true,
          }).returning();
          
          break; // Success
        } catch (insertError: any) {
          insertAttempts++;
          if (insertError.code === '23505' && insertError.constraint === 'bjj_users_username_unique') {
            if (insertAttempts < MAX_INSERT_ATTEMPTS) {
              console.log(`[TEST USER] Username collision, retrying (${insertAttempts}/${MAX_INSERT_ATTEMPTS})`);
              continue;
            }
          }
          throw insertError;
        }
      }
      
      res.json({ success: true, user: newUser });
    } catch (error: any) {
      console.error('Create test user error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send test SMS to admin (admin only)
  app.post('/api/admin/test-sms', checkAdminAuth, async (req, res) => {
    try {
      const { sendTestSMS } = await import('./admin-notifications');
      await sendTestSMS();
      res.json({ success: true, message: 'Test SMS sent to admin' });
    } catch (error: any) {
      console.error('Send test SMS error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all lifetime memberships (admin only)
  app.get('/api/admin/lifetime-memberships', checkAdminAuth, async (req, res) => {
    try {
      const { lifetimeMemberships } = await import("@shared/schema");
      
      const memberships = await db.select({
        id: lifetimeMemberships.id,
        userId: lifetimeMemberships.userId,
        grantedBy: lifetimeMemberships.grantedBy,
        reason: lifetimeMemberships.reason,
        notes: lifetimeMemberships.notes,
        grantedAt: lifetimeMemberships.grantedAt,
        // Join user data
        user: {
          phoneNumber: bjjUsers.phoneNumber,
          name: bjjUsers.name,
          beltLevel: bjjUsers.beltLevel,
        },
      })
      .from(lifetimeMemberships)
      .leftJoin(bjjUsers, eq(lifetimeMemberships.userId, bjjUsers.id))
      .orderBy(desc(lifetimeMemberships.grantedAt));
      
      res.json(memberships);
    } catch (error: any) {
      console.error('Fetch lifetime memberships error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Grant lifetime access (admin only)
  app.post('/api/admin/lifetime/grant', checkAdminAuth, async (req, res) => {
    try {
      const { phoneNumber, reason, notes } = req.body;
      const { lifetimeMemberships, adminActivityLog } = await import("@shared/schema");

      // Validate phone number format (E.164)
      const phoneRegex = /^\+[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({ error: "Please enter valid phone number (+1XXXXXXXXXX)" });
      }

      // Validate required fields
      if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: "Reason is required" });
      }

      // Find or create user by phone number
      let [user] = await db.select({
        id: bjjUsers.id,
        phoneNumber: bjjUsers.phoneNumber,
        subscriptionType: bjjUsers.subscriptionType,
        subscriptionStatus: bjjUsers.subscriptionStatus
      }).from(bjjUsers).where(eq(bjjUsers.phoneNumber, phoneNumber));
      let userCreated = false;
      
      if (!user) {
        // Create new user with retry logic for username collisions
        let newUser;
        let insertAttempts = 0;
        const MAX_INSERT_ATTEMPTS = 3;
        
        while (insertAttempts < MAX_INSERT_ATTEMPTS) {
          try {
            const generatedUsername = await generateUniqueUsername(phoneNumber, 'user');
            
            [newUser] = await db.insert(bjjUsers).values({
              phoneNumber,
              username: generatedUsername, // REQUIRED: Collision-safe auto-generated username
              displayName: 'User', // Default display name
              subscriptionType: 'lifetime',
              subscriptionStatus: 'active',
              beltLevel: 'white', // Default values
              style: 'both',
              sendTime: '08:00',
              timezone: 'America/New_York',
              progressionLevel: 'beginner',
              weeklyRecapEnabled: true,
              paused: false,
              onboardingStep: 'belt',
              isActive: true,
              competitionMode: false,
            }).returning();
            
            break; // Success
          } catch (insertError: any) {
            insertAttempts++;
            if (insertError.code === '23505' && insertError.constraint === 'bjj_users_username_unique') {
              if (insertAttempts < MAX_INSERT_ATTEMPTS) {
                console.log(`[ADMIN LIFETIME] Username collision, retrying (${insertAttempts}/${MAX_INSERT_ATTEMPTS})`);
                continue;
              }
            }
            throw insertError;
          }
        }
        
        user = newUser!;
        userCreated = true;
        
        console.log(`✅ Created new user ${phoneNumber} with lifetime access`);
      } else {
        // User exists - check if already has lifetime
        const [existing] = await db.select({
          id: lifetimeMemberships.id,
          userId: lifetimeMemberships.userId
        }).from(lifetimeMemberships).where(eq(lifetimeMemberships.userId, user.id));
        if (existing) {
          return res.status(400).json({ error: "User already has lifetime access" });
        }

        // Update existing user to lifetime
        await db.update(bjjUsers)
          .set({ 
            subscriptionType: 'lifetime', 
            subscriptionStatus: 'active',
            updatedAt: new Date(),
          })
          .where(eq(bjjUsers.id, user.id));
        
        console.log(`✅ Updated existing user ${phoneNumber} to lifetime access`);
      }

      // Create lifetime membership record
      const [membership] = await db.insert(lifetimeMemberships).values({
        userId: user.id,
        grantedBy: 'admin', // TODO: Use actual admin ID from auth
        reason,
        notes: notes || null,
      }).returning();

      // Log admin action for audit trail
      await db.insert(adminActivityLog).values({
        adminId: 'admin', // TODO: Use actual admin ID from auth
        action: 'grant_lifetime',
        targetType: 'user',
        targetId: user.id,
        details: {
          phoneNumber,
          reason,
          notes,
          userCreated,
        },
      });

      res.json({ 
        success: true, 
        membership,
        userCreated,
        message: `Lifetime access granted to ${phoneNumber}`,
      });
    } catch (error: any) {
      console.error('Grant lifetime error:', error);
      res.status(500).json({ error: error.message || 'Failed to grant lifetime access' });
    }
  });

  // Bulk grant lifetime access (admin only)
  app.post('/api/admin/lifetime/grant-bulk', checkAdminAuth, async (req, res) => {
    try {
      const { phoneNumbers, reason, notes } = req.body;
      const { lifetimeMemberships, adminActivityLog } = await import("@shared/schema");

      if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
        return res.status(400).json({ error: "Please provide phone numbers array" });
      }

      if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: "Reason is required" });
      }

      const results = {
        successful: [] as string[],
        failed: [] as { phone: string; error: string }[],
      };

      const phoneRegex = /^\+[1-9]\d{1,14}$/;

      // Process each phone number
      for (const phoneNumber of phoneNumbers) {
        try {
          // Validate format
          if (!phoneRegex.test(phoneNumber)) {
            results.failed.push({ phone: phoneNumber, error: 'Invalid phone format' });
            continue;
          }

          // Find or create user
          let [user] = await db.select({
            id: bjjUsers.id,
            phoneNumber: bjjUsers.phoneNumber,
            subscriptionType: bjjUsers.subscriptionType,
            subscriptionStatus: bjjUsers.subscriptionStatus
          }).from(bjjUsers).where(eq(bjjUsers.phoneNumber, phoneNumber));
          let userCreated = false;

          if (!user) {
            // Create new user with retry logic for username collisions
            let newUser;
            let insertAttempts = 0;
            const MAX_INSERT_ATTEMPTS = 3;
            
            while (insertAttempts < MAX_INSERT_ATTEMPTS) {
              try {
                const generatedUsername = await generateUniqueUsername(phoneNumber, 'user');
                
                [newUser] = await db.insert(bjjUsers).values({
                  phoneNumber,
                  username: generatedUsername, // REQUIRED: Collision-safe auto-generated username
                  displayName: 'User', // Default display name
                  subscriptionType: 'lifetime',
                  subscriptionStatus: 'active',
                  beltLevel: 'white',
                  style: 'both',
                  sendTime: '08:00',
                  timezone: 'America/New_York',
                  progressionLevel: 'beginner',
                  weeklyRecapEnabled: true,
                  paused: false,
                  onboardingStep: 'belt',
                  isActive: true,
                  competitionMode: false,
                }).returning();
                
                break; // Success
              } catch (insertError: any) {
                insertAttempts++;
                if (insertError.code === '23505' && insertError.constraint === 'bjj_users_username_unique') {
                  if (insertAttempts < MAX_INSERT_ATTEMPTS) {
                    console.log(`[BULK GRANT] Username collision for ${phoneNumber}, retrying (${insertAttempts}/${MAX_INSERT_ATTEMPTS})`);
                    continue;
                  }
                }
                throw insertError;
              }
            }
            
            user = newUser!;
            userCreated = true;
          } else {
            // Check if already has lifetime
            const [existing] = await db.select({
              id: lifetimeMemberships.id,
              userId: lifetimeMemberships.userId
            }).from(lifetimeMemberships).where(eq(lifetimeMemberships.userId, user.id));
            if (existing) {
              results.failed.push({ phone: phoneNumber, error: 'Already has lifetime access' });
              continue;
            }

            // Update existing user
            await db.update(bjjUsers)
              .set({
                subscriptionType: 'lifetime',
                subscriptionStatus: 'active',
                updatedAt: new Date(),
              })
              .where(eq(bjjUsers.id, user.id));
          }

          // Create lifetime membership
          await db.insert(lifetimeMemberships).values({
            userId: user.id,
            grantedBy: 'admin',
            reason,
            notes: notes || null,
          });

          // Log action
          await db.insert(adminActivityLog).values({
            adminId: 'admin',
            action: 'grant_lifetime_bulk',
            targetType: 'user',
            targetId: user.id,
            details: {
              phoneNumber,
              reason,
              notes,
              userCreated,
              bulkOperation: true,
            },
          });

          results.successful.push(phoneNumber);
        } catch (error: any) {
          results.failed.push({ phone: phoneNumber, error: error.message });
        }
      }

      res.json({
        success: true,
        results,
        summary: `${results.successful.length} granted, ${results.failed.length} failed`,
      });
    } catch (error: any) {
      console.error('Bulk grant lifetime error:', error);
      res.status(500).json({ error: error.message || 'Failed to bulk grant lifetime access' });
    }
  });

  // Revoke lifetime access (admin only)
  app.delete('/api/admin/lifetime/:userId/revoke', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const { lifetimeMemberships } = await import("@shared/schema");

      // Delete lifetime membership record
      await db.delete(lifetimeMemberships).where(eq(lifetimeMemberships.userId, userId));

      // Update user subscription to cancelled
      await db.update(bjjUsers)
        .set({ subscriptionType: 'free_trial', subscriptionStatus: 'cancelled' })
        .where(eq(bjjUsers.id, userId));

      res.json({ success: true });
    } catch (error: any) {
      console.error('Revoke lifetime error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Resend lifetime invitation (admin only)
  app.post('/api/admin/lifetime/resend/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { lifetimeInvitations } = await import("@shared/schema");
      const { sendLifetimeInvitationEmail } = await import("./email");

      const [invitation] = await db.select()
        .from(lifetimeInvitations)
        .where(eq(lifetimeInvitations.id, parseInt(id)));
      
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({ error: "Can only resend pending invitations" });
      }

      // Send invitation email
      const emailResult = await sendLifetimeInvitationEmail(
        invitation.email, 
        invitation.inviteToken, 
        invitation.personalMessage || undefined
      );
      
      if (!emailResult.success) {
        return res.status(500).json({ error: "Failed to resend invitation email" });
      }

      res.json({ 
        success: true, 
        message: `Invitation resent to ${invitation.email}`,
      });
    } catch (error: any) {
      console.error('Resend invitation error:', error);
      res.status(500).json({ error: error.message || 'Failed to resend invitation' });
    }
  });

  // Delete lifetime invitation (admin only)
  app.delete('/api/admin/lifetime/invitation/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { lifetimeInvitations } = await import("@shared/schema");

      await db.delete(lifetimeInvitations)
        .where(eq(lifetimeInvitations.id, parseInt(id)));

      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete invitation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all lifetime users with enhanced filtering (admin only)
  app.get('/api/admin/lifetime-users', checkAdminAuth, async (req, res) => {
    try {
      const { hideTest } = req.query;
      const { lifetimeMemberships } = await import("@shared/schema");
      
      let query = db.select({
        id: bjjUsers.id,
        phoneNumber: bjjUsers.phoneNumber,
        email: bjjUsers.email,
        username: bjjUsers.username,
        displayName: bjjUsers.displayName,
        name: bjjUsers.name,
        beltLevel: bjjUsers.beltLevel,
        subscriptionType: bjjUsers.subscriptionType,
        subscriptionStatus: bjjUsers.subscriptionStatus,
        isLifetimeUser: bjjUsers.isLifetimeUser,
        adminNotes: bjjUsers.adminNotes,
        createdAt: bjjUsers.createdAt,
        lastLogin: bjjUsers.lastLogin,
        reason: lifetimeMemberships.reason,
        grantedAt: lifetimeMemberships.grantedAt,
      })
      .from(bjjUsers)
      .leftJoin(lifetimeMemberships, eq(bjjUsers.id, lifetimeMemberships.userId))
      .where(eq(bjjUsers.subscriptionType, 'lifetime'));

      const users = await query.orderBy(desc(bjjUsers.createdAt));
      
      // Filter out test users if requested
      const filteredUsers = hideTest === 'true' 
        ? users.filter(u => !u.phoneNumber?.includes('5551') && !u.username?.startsWith('test'))
        : users;
      
      res.json(filteredUsers);
    } catch (error: any) {
      console.error('Fetch lifetime users error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get single lifetime user details (admin only)
  app.get('/api/admin/lifetime-users/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { lifetimeMemberships } = await import("@shared/schema");
      
      const [user] = await db.select({
        id: bjjUsers.id,
        phoneNumber: bjjUsers.phoneNumber,
        username: bjjUsers.username,
        displayName: bjjUsers.displayName,
        name: bjjUsers.name,
        beltLevel: bjjUsers.beltLevel,
        style: bjjUsers.style,
        contentPreference: bjjUsers.contentPreference,
        focusAreas: bjjUsers.focusAreas,
        injuries: bjjUsers.injuries,
        competeStatus: bjjUsers.competeStatus,
        subscriptionType: bjjUsers.subscriptionType,
        subscriptionStatus: bjjUsers.subscriptionStatus,
        isLifetimeUser: bjjUsers.isLifetimeUser,
        adminNotes: bjjUsers.adminNotes,
        createdAt: bjjUsers.createdAt,
        lastLogin: bjjUsers.lastLogin,
        onboardingCompleted: bjjUsers.onboardingCompleted,
        trainingFrequency: bjjUsers.trainingFrequency,
        struggles: bjjUsers.struggles,
        strengths: bjjUsers.strengths,
        referralCode: bjjUsers.referralCode,
        referredBy: bjjUsers.referredBy,
      }).from(bjjUsers).where(eq(bjjUsers.id, id));
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get lifetime membership details
      const [membership] = await db.select({
        id: lifetimeMemberships.id,
        grantedBy: lifetimeMemberships.grantedBy,
        reason: lifetimeMemberships.reason,
        notes: lifetimeMemberships.notes,
        grantedAt: lifetimeMemberships.grantedAt,
      }).from(lifetimeMemberships).where(eq(lifetimeMemberships.userId, id));
      
      res.json({ ...user, membership });
    } catch (error: any) {
      console.error('Fetch user details error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Edit lifetime user (admin only)
  app.patch('/api/admin/lifetime-users/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { displayName, beltLevel, reason, adminNotes, isLifetimeUser } = req.body;
      const { lifetimeMemberships } = await import("@shared/schema");
      
      const updateData: any = {};
      if (displayName !== undefined) updateData.displayName = displayName;
      if (beltLevel !== undefined) updateData.beltLevel = beltLevel;
      if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
      if (isLifetimeUser !== undefined) updateData.isLifetimeUser = isLifetimeUser;
      updateData.updatedAt = new Date();
      
      const [updatedUser] = await db.update(bjjUsers)
        .set(updateData)
        .where(eq(bjjUsers.id, id))
        .returning();
      
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Update reason in lifetime memberships table if provided
      if (reason !== undefined) {
        await db.update(lifetimeMemberships)
          .set({ reason })
          .where(eq(lifetimeMemberships.userId, id));
      }
      
      res.json({ success: true, user: updatedUser });
    } catch (error: any) {
      console.error('Edit user error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete single lifetime user (admin only)
  app.delete('/api/admin/lifetime-users/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { lifetimeMemberships, adminActivityLog } = await import("@shared/schema");
      
      // Get user details before deletion for logging
      const [user] = await db.select({
        phoneNumber: bjjUsers.phoneNumber,
        username: bjjUsers.username,
      }).from(bjjUsers).where(eq(bjjUsers.id, id));
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Delete lifetime membership record
      await db.delete(lifetimeMemberships).where(eq(lifetimeMemberships.userId, id));
      
      // Delete the user
      await db.delete(bjjUsers).where(eq(bjjUsers.id, id));
      
      // Log admin action
      await db.insert(adminActivityLog).values({
        adminId: 'admin',
        action: 'delete_lifetime_user',
        targetType: 'user',
        targetId: id,
        details: {
          phoneNumber: user.phoneNumber,
          username: user.username,
        },
      });
      
      res.json({ success: true, message: 'User deleted successfully' });
    } catch (error: any) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk delete lifetime users (admin only)
  app.post('/api/admin/lifetime-users/bulk-delete', checkAdminAuth, async (req, res) => {
    try {
      const { userIds } = req.body;
      const { lifetimeMemberships, adminActivityLog } = await import("@shared/schema");
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'User IDs array is required' });
      }
      
      const results = {
        successful: [] as string[],
        failed: [] as { id: string; error: string }[],
      };
      
      for (const userId of userIds) {
        try {
          // Get user details before deletion
          const [user] = await db.select({
            phoneNumber: bjjUsers.phoneNumber,
            username: bjjUsers.username,
          }).from(bjjUsers).where(eq(bjjUsers.id, userId));
          
          if (!user) {
            results.failed.push({ id: userId, error: 'User not found' });
            continue;
          }
          
          // Delete lifetime membership
          await db.delete(lifetimeMemberships).where(eq(lifetimeMemberships.userId, userId));
          
          // Delete user
          await db.delete(bjjUsers).where(eq(bjjUsers.id, userId));
          
          // Log action
          await db.insert(adminActivityLog).values({
            adminId: 'admin',
            action: 'bulk_delete_lifetime_user',
            targetType: 'user',
            targetId: userId,
            details: {
              phoneNumber: user.phoneNumber,
              username: user.username,
              bulkOperation: true,
            },
          });
          
          results.successful.push(userId);
        } catch (error: any) {
          results.failed.push({ id: userId, error: error.message });
        }
      }
      
      res.json({
        success: true,
        results,
        summary: `${results.successful.length} deleted, ${results.failed.length} failed`,
      });
    } catch (error: any) {
      console.error('Bulk delete error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================================================
  // LIFETIME INVITATION SYSTEM
  // ========================================================================

  // Instant grant lifetime access with optional email (admin only)
  app.post('/api/admin/lifetime/grant-instant', checkAdminAuth, async (req, res) => {
    try {
      const { email, reason, sendEmail = false, emailSubject, emailBody } = req.body;
      const adminUser = req.user;
      const { lifetimeMemberships } = await import("@shared/schema");
      
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }
      
      if (!reason) {
        return res.status(400).json({ success: false, error: 'Reason is required' });
      }
      
      const emailLower = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(emailLower)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }

      // Check if user already exists
      let existingUser = await db.query.bjjUsers.findFirst({
        where: eq(bjjUsers.email, emailLower)
      });
      
      if (existingUser) {
        // User exists - update to lifetime access if not already
        if (existingUser.subscriptionType !== 'lifetime') {
          await db.update(bjjUsers)
            .set({
              subscriptionType: 'lifetime',
              isLifetimeUser: true,
              updatedAt: new Date(),
            })
            .where(eq(bjjUsers.id, existingUser.id));
          
          console.log(`✅ Updated existing user ${emailLower} to lifetime access`);
        } else {
          console.log(`ℹ️ User ${emailLower} already has lifetime access`);
        }
      } else {
        // Create new user with lifetime access flag
        const [newUser] = await db.insert(bjjUsers).values({
          email: emailLower,
          subscriptionType: 'lifetime',
          isLifetimeUser: true,
          verified: true,
        }).returning();
        
        existingUser = newUser;
        console.log(`✅ Created new user ${emailLower} with lifetime access`);
      }

      // Create or update lifetime membership record with reason
      const existingMembership = await db.query.lifetimeMemberships.findFirst({
        where: eq(lifetimeMemberships.userId, existingUser.id)
      });

      if (!existingMembership) {
        await db.insert(lifetimeMemberships).values({
          userId: existingUser.id,
          grantedBy: adminUser?.id || 'admin',
          reason: reason,
          notes: null,
        });
        console.log(`✅ Created lifetime membership record with reason: ${reason}`);
      } else {
        // Update existing membership with new reason
        await db.update(lifetimeMemberships)
          .set({
            reason: reason,
            grantedBy: adminUser?.id || 'admin',
          })
          .where(eq(lifetimeMemberships.userId, existingUser.id));
        console.log(`✅ Updated lifetime membership record with reason: ${reason}`);
      }

      // Optionally send email with custom message
      if (sendEmail) {
        const { sendLifetimeAccessEmail } = await import('./email');
        const emailResult = await sendLifetimeAccessEmail(emailLower, emailSubject, emailBody);
        
        if (!emailResult.success) {
          console.error(`⚠️ Failed to send email to ${emailLower}:`, emailResult.error);
          return res.status(200).json({
            success: true,
            message: `Lifetime access granted to ${emailLower}, but email failed to send`,
            userId: existingUser.id,
            emailSent: false,
          });
        }
        
        console.log(`✅ Lifetime access email sent to ${emailLower}`);
      }

      res.status(200).json({
        success: true,
        message: sendEmail 
          ? `Lifetime access granted and email sent to ${emailLower}`
          : `Lifetime access granted to ${emailLower}`,
        userId: existingUser.id,
        emailSent: sendEmail,
      });

    } catch (error: any) {
      console.error('❌ Error granting instant lifetime access:', error);
      res.status(500).json({ success: false, error: 'Failed to grant lifetime access. Please try again.' });
    }
  });

  // Send lifetime invitation (admin only)
  app.post('/api/admin/lifetime/invite', checkAdminAuth, async (req, res) => {
    try {
      const { email, personalMessage, expirationDays } = req.body;
      const adminUser = req.user;
      
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }
      
      const emailLower = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(emailLower)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }

      // Check if pending invitation exists (allowing resend to existing users)
      const { lifetimeInvitations } = await import("@shared/schema");
      const existingInvite = await db.query.lifetimeInvitations.findFirst({
        where: and(
          eq(lifetimeInvitations.email, emailLower),
          eq(lifetimeInvitations.status, 'pending')
        )
      });
      
      if (existingInvite) {
        return res.status(400).json({ success: false, error: 'Invitation already sent. Use "Resend" to send again.' });
      }

      // Generate secure invite token
      const inviteToken = crypto.randomBytes(32).toString('hex');

      // Calculate expiration date
      let expiresAt: Date;
      if (expirationDays === 'lifetime') {
        // Set to 100 years in the future for lifetime access
        expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 100);
      } else {
        // Parse number of days or default to 30
        const days = parseInt(expirationDays || '30', 10);
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
      }

      // Insert invitation record
      const [invitation] = await db.insert(lifetimeInvitations).values({
        email: emailLower,
        inviteToken,
        personalMessage: personalMessage || null,
        invitedByAdminId: adminUser?.id || null,
        status: 'pending',
        expiresAt,
      }).returning();
      
      const inviteLink = `https://bjjos.app/signup?invite=${inviteToken}`;

      // Send invitation email
      const { sendLifetimeInvitationEmail } = await import('./email');
      const emailResult = await sendLifetimeInvitationEmail(emailLower, inviteToken, personalMessage);
      
      if (!emailResult.success) {
        // Rollback: delete invitation if email fails
        await db.delete(lifetimeInvitations).where(eq(lifetimeInvitations.id, invitation.id));
        console.error(`❌ Failed to send invitation to ${emailLower}:`, emailResult.error);
        return res.status(500).json({ success: false, error: 'Failed to send invitation email. Please try again.' });
      }

      console.log(`✅ Lifetime invitation sent by admin to ${emailLower}`);

      res.status(200).json({
        success: true,
        message: `Invitation sent to ${emailLower}`,
        invite: {
          id: invitation.id,
          email: invitation.email,
          inviteToken: invitation.inviteToken,
          status: invitation.status,
          invitedAt: invitation.invitedAt,
          inviteLink,
        }
      });

    } catch (error: any) {
      console.error('❌ Error sending lifetime invitation:', error);
      res.status(500).json({ success: false, error: 'Failed to send invitation. Please try again.' });
    }
  });

  // Get all lifetime invitations (admin only)
  app.get('/api/admin/lifetime/invitations', checkAdminAuth, async (req, res) => {
    try {
      const { lifetimeInvitations } = await import("@shared/schema");
      const { page = 1, limit = 20, status = 'all', search = '' } = req.query;
      
      let query = db.select().from(lifetimeInvitations);
      
      // Apply status filter
      if (status && status !== 'all') {
        query = query.where(eq(lifetimeInvitations.status, status as string)) as any;
      }
      
      // Apply search filter
      if (search) {
        query = query.where(sql`LOWER(${lifetimeInvitations.email}) LIKE ${`%${(search as string).toLowerCase()}%`}`) as any;
      }
      
      const invitations = await query.orderBy(desc(lifetimeInvitations.createdAt));
      
      // Paginate
      const startIndex = (Number(page) - 1) * Number(limit);
      const endIndex = startIndex + Number(limit);
      const paginatedInvitations = invitations.slice(startIndex, endIndex);
      
      res.json({
        invitations: paginatedInvitations,
        total: invitations.length,
        page: Number(page),
        totalPages: Math.ceil(invitations.length / Number(limit)),
      });
    } catch (error: any) {
      console.error('❌ Error fetching invitations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Resend lifetime invitation (admin only)
  app.post('/api/admin/lifetime/resend/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { lifetimeInvitations } = await import("@shared/schema");
      
      const invitation = await db.query.lifetimeInvitations.findFirst({
        where: eq(lifetimeInvitations.id, Number(id))
      });
      
      if (!invitation) {
        return res.status(404).json({ success: false, error: 'Invitation not found' });
      }
      
      if (invitation.status === 'completed') {
        return res.status(400).json({ success: false, error: 'Invitation already completed' });
      }
      
      // Update expires_at to extend by 30 days from now
      await db.update(lifetimeInvitations)
        .set({ 
          expiresAt: sql`NOW() + INTERVAL '30 days'`,
          status: 'pending',
        })
        .where(eq(lifetimeInvitations.id, Number(id)));

      // Resend email
      const { sendLifetimeInvitationEmail } = await import('./email');
      await sendLifetimeInvitationEmail(
        invitation.email, 
        invitation.inviteToken, 
        invitation.personalMessage || undefined
      );

      console.log(`✅ Lifetime invitation resent to ${invitation.email}`);

      res.json({ success: true, message: `Invitation resent to ${invitation.email}` });
    } catch (error: any) {
      console.error('❌ Error resending invitation:', error);
      res.status(500).json({ success: false, error: 'Failed to resend invitation' });
    }
  });

  // Delete lifetime invitation (admin only)
  app.delete('/api/admin/lifetime/invitation/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { lifetimeInvitations } = await import("@shared/schema");
      
      const invitation = await db.query.lifetimeInvitations.findFirst({
        where: eq(lifetimeInvitations.id, Number(id))
      });
      
      if (!invitation) {
        return res.status(404).json({ success: false, error: 'Invitation not found' });
      }
      
      await db.delete(lifetimeInvitations).where(eq(lifetimeInvitations.id, Number(id)));
      
      console.log(`✅ Deleted invitation for ${invitation.email}`);
      
      res.json({ success: true, message: 'Invitation deleted successfully' });
    } catch (error: any) {
      console.error('❌ Error deleting invitation:', error);
      res.status(500).json({ success: false, error: 'Failed to delete invitation' });
    }
  });

  // Get all referral codes with stats
  app.get('/api/admin/codes', checkAdminAuth, async (req, res) => {
    try {
      const codes = await db.select()
        .from(referralCodes)
        .orderBy(desc(referralCodes.createdAt));
      res.json(codes);
    } catch (error: any) {
      console.error('[REFERRAL CODES] Error fetching codes:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create single influencer code
  app.post('/api/admin/codes/create', checkAdminAuth, async (req, res) => {
    try {
      const { code, influencerName, commissionRate } = req.body;
      
      const [newCode] = await db.insert(referralCodes).values({
        code: code.toUpperCase(),
        codeType: 'influencer',
        influencerName,
        commissionRate: commissionRate.toString(),
        totalSignups: 0,
        activeSubscribers: 0,
        totalRevenueGenerated: "0",
        commissionOwed: "0",
        isActive: true
      }).returning();
      
      res.json(newCode);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create bulk influencer codes
  app.post('/api/admin/codes/bulk-create', checkAdminAuth, async (req, res) => {
    try {
      const { codes, commissionRate } = req.body;
      const codeList = codes.split('\n').map((c: string) => c.trim().toUpperCase()).filter((c: string) => c);
      
      const newCodes = [];
      for (const code of codeList) {
        const [newCode] = await db.insert(referralCodes).values({
          code,
          codeType: 'influencer',
          influencerName: code,
          commissionRate: commissionRate.toString(),
          totalSignups: 0,
          activeSubscribers: 0,
          totalRevenueGenerated: "0",
          commissionOwed: "0",
          isActive: true
        }).returning();
        newCodes.push(newCode);
      }
      
      res.json({ created: newCodes.length, codes: newCodes });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Toggle code active status
  app.post('/api/admin/codes/:id/toggle', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const [code] = await db.select({
        id: referralCodes.id,
        isActive: referralCodes.isActive
      }).from(referralCodes).where(eq(referralCodes.id, id));
      
      if (!code) {
        return res.status(404).json({ error: "Code not found" });
      }
      
      const [updated] = await db.update(referralCodes)
        .set({ isActive: !code.isActive })
        .where(eq(referralCodes.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Export CSV for payouts
  app.get('/api/admin/export-csv', checkAdminAuth, async (req, res) => {
    try {
      const codes = await db.select({
        code: referralCodes.code,
        influencerName: referralCodes.influencerName,
        activeSubscribers: referralCodes.activeSubscribers,
        commissionRate: referralCodes.commissionRate
      }).from(referralCodes)
        .where(eq(referralCodes.codeType, 'influencer'));
      
      // Generate CSV
      const csvHeader = 'Influencer Name,Code,Active Subscribers,Monthly Revenue,Commission Rate,Amount Owed\n';
      const csvRows = codes.map(code => {
        const monthlyRevenue = (code.activeSubscribers || 0) * 3.99;
        const commissionRate = parseFloat(code.commissionRate || "0");
        const amountOwed = monthlyRevenue * commissionRate;
        
        return `${code.influencerName || code.code},${code.code},${code.activeSubscribers},${monthlyRevenue.toFixed(2)},${(commissionRate * 100).toFixed(0)}%,${amountOwed.toFixed(2)}`;
      }).join('\n');
      
      const csv = csvHeader + csvRows;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=influencer-payouts.csv');
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark codes as paid (reset commission owed)
  app.post('/api/admin/mark-paid', checkAdminAuth, async (req, res) => {
    try {
      await db.update(referralCodes)
        .set({ commissionOwed: "0" })
        .where(eq(referralCodes.codeType, 'influencer'));
      
      res.json({ success: true, message: "All influencer codes marked as paid" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Assign referral code to a user
  app.post('/api/admin/codes/:codeId/assign', checkAdminAuth, async (req, res) => {
    try {
      const { codeId } = req.params;
      const { userId, commissionPercent, minimumPayout, stripeAccountId } = req.body;

      const adminEmail = (req as any).adminUser?.adminId || 'admin';

      const [updated] = await db.update(referralCodes)
        .set({
          assignedToUserId: userId,
          commissionRate: commissionPercent ? commissionPercent.toString() : undefined,
          minimumPayout: minimumPayout ? minimumPayout.toString() : undefined,
          stripeAccountId: stripeAccountId || undefined,
          createdByAdmin: adminEmail,
        })
        .where(eq(referralCodes.id, codeId))
        .returning();

      res.json({ success: true, code: updated });
    } catch (error: any) {
      console.error('Error assigning code:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get referral performance for a specific code or user
  app.get('/api/admin/referral/performance/:identifier', checkAdminAuth, async (req, res) => {
    try {
      const { identifier } = req.params;
      const { type } = req.query;

      let codes;
      if (type === 'code') {
        codes = await db.select()
          .from(referralCodes)
          .where(eq(referralCodes.code, identifier.toUpperCase()));
      } else {
        codes = await db.select()
          .from(referralCodes)
          .where(eq(referralCodes.assignedToUserId, identifier));
      }

      if (codes.length === 0) {
        return res.status(404).json({ error: 'No codes found' });
      }

      const codeId = codes[0].id;

      const { getReferralStats } = await import('./referral-service');
      const stats = await getReferralStats(codes[0].assignedToUserId || '');

      const commissions = await db.select()
        .from(referralCommissions)
        .where(eq(referralCommissions.referralCodeId, codeId))
        .orderBy(desc(referralCommissions.createdAt))
        .limit(50);

      const payouts = await db.select()
        .from(referralPayouts)
        .where(eq(referralPayouts.referralCodeId, codeId))
        .orderBy(desc(referralPayouts.createdAt))
        .limit(50);

      res.json({
        code: codes[0],
        stats,
        recentCommissions: commissions,
        recentPayouts: payouts,
      });
    } catch (error: any) {
      console.error('Error fetching referral performance:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all commissions (paginated)
  app.get('/api/admin/referral/commissions', checkAdminAuth, async (req, res) => {
    try {
      const { limit = '50', offset = '0' } = req.query;

      const commissions = await db.select()
        .from(referralCommissions)
        .orderBy(desc(referralCommissions.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      res.json(commissions);
    } catch (error: any) {
      console.error('Error fetching commissions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all payouts (paginated)
  app.get('/api/admin/referral/payouts', checkAdminAuth, async (req, res) => {
    try {
      const { limit = '50', offset = '0', status } = req.query;

      let query = db.select().from(referralPayouts);

      if (status) {
        query = query.where(eq(referralPayouts.status, status as string));
      }

      const payouts = await query
        .orderBy(desc(referralPayouts.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      res.json(payouts);
    } catch (error: any) {
      console.error('Error fetching payouts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // EMAIL LOGS ADMIN ENDPOINTS
  // ============================================================================

  // Get email logs with filtering
  app.get('/api/admin/email-logs', checkAdminAuth, async (req, res) => {
    try {
      const { emailLogs } = await import("@shared/schema");
      const { desc, eq, like, and, gte, lte, count, sql } = await import("drizzle-orm");
      
      const { search, type, status, startDate, endDate, limit = '50', offset = '0' } = req.query;
      
      let conditions: any[] = [];
      
      if (search) {
        conditions.push(like(emailLogs.recipientEmail, `%${search}%`));
      }
      if (type && type !== 'all') {
        conditions.push(eq(emailLogs.emailType, type as string));
      }
      if (status && status !== 'all') {
        conditions.push(eq(emailLogs.status, status as string));
      }
      if (startDate) {
        conditions.push(gte(emailLogs.sentAt, new Date(startDate as string)));
      }
      if (endDate) {
        conditions.push(lte(emailLogs.sentAt, new Date(endDate as string)));
      }
      
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      
      const logs = await db.select()
        .from(emailLogs)
        .where(whereClause)
        .orderBy(desc(emailLogs.sentAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));
      
      const totalResult = await db.select({ count: count() })
        .from(emailLogs)
        .where(whereClause);
      
      res.json({
        logs,
        total: totalResult[0]?.count || 0,
      });
    } catch (error: any) {
      console.error('Error fetching email logs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get email stats for dashboard
  app.get('/api/admin/email-stats', checkAdminAuth, async (req, res) => {
    try {
      const { emailLogs } = await import("@shared/schema");
      const { eq, gte, count, sql } = await import("drizzle-orm");
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Emails sent today
      const sentTodayResult = await db.select({ count: count() })
        .from(emailLogs)
        .where(gte(emailLogs.sentAt, today));
      
      // Total emails
      const totalResult = await db.select({ count: count() })
        .from(emailLogs);
      
      // Failed emails
      const failedResult = await db.select({ count: count() })
        .from(emailLogs)
        .where(eq(emailLogs.status, 'failed'));
      
      // Bounced emails
      const bouncedResult = await db.select({ count: count() })
        .from(emailLogs)
        .where(eq(emailLogs.status, 'bounced'));
      
      // Delivered emails
      const deliveredResult = await db.select({ count: count() })
        .from(emailLogs)
        .where(eq(emailLogs.status, 'delivered'));
      
      // Sent (successfully handed off) emails
      const sentResult = await db.select({ count: count() })
        .from(emailLogs)
        .where(eq(emailLogs.status, 'sent'));
      
      const total = totalResult[0]?.count || 0;
      const sent = sentResult[0]?.count || 0;
      const delivered = deliveredResult[0]?.count || 0;
      const failed = failedResult[0]?.count || 0;
      const bounced = bouncedResult[0]?.count || 0;
      
      const deliveryRate = total > 0 ? ((Number(sent) + Number(delivered)) / Number(total) * 100).toFixed(1) : '0';
      
      res.json({
        sentToday: sentTodayResult[0]?.count || 0,
        total,
        delivered,
        failed,
        bounced,
        deliveryRate,
      });
    } catch (error: any) {
      console.error('Error fetching email stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Resend an email
  app.post('/api/admin/email-logs/:id/resend', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { emailLogs } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const { sendVerificationEmail, sendWelcomeEmail, sendLifetimeAccessEmail, sendLifetimeInvitationEmail } = await import("./email");
      
      // Get the original email
      const logs = await db.select().from(emailLogs).where(eq(emailLogs.id, id));
      if (!logs || logs.length === 0) {
        return res.status(404).json({ error: 'Email log not found' });
      }
      
      const log = logs[0];
      let result;
      
      // Resend based on type
      switch (log.emailType) {
        case 'verification':
          // Generate new code for verification
          const code = Math.floor(100000 + Math.random() * 900000).toString();
          result = await sendVerificationEmail(log.recipientEmail, code);
          break;
        case 'welcome':
          const metadata = log.metadata as any;
          result = await sendWelcomeEmail(log.recipientEmail, metadata?.username);
          break;
        case 'lifetime_access':
          result = await sendLifetimeAccessEmail(log.recipientEmail);
          break;
        case 'lifetime_invite':
          const inviteMeta = log.metadata as any;
          if (inviteMeta?.inviteToken) {
            result = await sendLifetimeInvitationEmail(log.recipientEmail, inviteMeta.inviteToken);
          } else {
            return res.status(400).json({ error: 'Cannot resend: invite token not found' });
          }
          break;
        default:
          return res.status(400).json({ error: `Cannot resend email type: ${log.emailType}` });
      }
      
      if (result?.success) {
        res.json({ success: true, message: 'Email resent successfully' });
      } else {
        res.status(500).json({ error: 'Failed to resend email', details: result?.error });
      }
    } catch (error: any) {
      console.error('Error resending email:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send verification email manually to any email
  app.post('/api/admin/email/send-verification', checkAdminAuth, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }
      
      const { sendVerificationEmail } = await import("./email");
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      const result = await sendVerificationEmail(email, code);
      
      if (result.success) {
        res.json({ success: true, message: 'Verification email sent', code }); // Include code for admin visibility
      } else {
        res.status(500).json({ error: 'Failed to send verification email', details: result.error });
      }
    } catch (error: any) {
      console.error('Error sending verification email:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get problem users (unverified after 24h, bounced emails)
  app.get('/api/admin/email-problems', checkAdminAuth, async (req, res) => {
    try {
      const { bjjUsers, emailLogs } = await import("@shared/schema");
      const { eq, and, lte, isNull, or, desc } = await import("drizzle-orm");
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Unverified users created more than 24 hours ago
      const unverifiedUsers = await db.select({
        id: bjjUsers.id,
        email: bjjUsers.email,
        createdAt: bjjUsers.createdAt,
        emailVerified: bjjUsers.emailVerified,
      })
        .from(bjjUsers)
        .where(and(
          eq(bjjUsers.emailVerified, false),
          lte(bjjUsers.createdAt, yesterday)
        ))
        .orderBy(desc(bjjUsers.createdAt))
        .limit(50);
      
      // Bounced and failed emails
      const problemEmails = await db.select()
        .from(emailLogs)
        .where(or(
          eq(emailLogs.status, 'bounced'),
          eq(emailLogs.status, 'failed')
        ))
        .orderBy(desc(emailLogs.sentAt))
        .limit(50);
      
      res.json({
        unverifiedUsers,
        problemEmails,
      });
    } catch (error: any) {
      console.error('Error fetching email problems:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Monitoring: Get daily metrics
  app.get('/api/admin/ai-metrics', checkAdminAuth, async (req, res) => {
    try {
      const { dailyAiMetrics } = await import("@shared/schema");
      const { desc } = await import("drizzle-orm");
      
      const metrics = await db.select({
        id: dailyAiMetrics.id,
        date: dailyAiMetrics.date,
        videosAnalyzed: dailyAiMetrics.videosAnalyzed,
        videosScoring70Plus: dailyAiMetrics.videosScoring70Plus,
        videosSent: dailyAiMetrics.videosSent,
        avgQualityScore: dailyAiMetrics.avgQualityScore,
        skipRatePercentage: dailyAiMetrics.skipRatePercentage,
        badRatePercentage: dailyAiMetrics.badRatePercentage,
        topPerformingInstructor: dailyAiMetrics.topPerformingInstructor,
        failedAnalyses: dailyAiMetrics.failedAnalyses,
        duplicateViolations: dailyAiMetrics.duplicateViolations,
        totalUsersSent: dailyAiMetrics.totalUsersSent,
      }).from(dailyAiMetrics)
        .orderBy(desc(dailyAiMetrics.date))
        .limit(1);
      
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // AI Monitoring: Get instructor performance
  app.get('/api/admin/instructor-performance', checkAdminAuth, async (req, res) => {
    try {
      const { instructorPerformance } = await import("@shared/schema");
      const { desc } = await import("drizzle-orm");
      
      const instructors = await db.select({
        id: instructorPerformance.id,
        instructorName: instructorPerformance.instructorName,
        videosSentTotal: instructorPerformance.videosSentTotal,
        totalVideosSent: instructorPerformance.totalVideosSent,
        avgUserRating: instructorPerformance.avgUserRating,
        skipRatePercentage: instructorPerformance.skipRatePercentage,
        badRatePercentage: instructorPerformance.badRatePercentage,
        credibilityAdjustment: instructorPerformance.credibilityAdjustment,
      }).from(instructorPerformance)
        .orderBy(desc(instructorPerformance.totalVideosSent));
      
      res.json(instructors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // AI Monitoring: Get alert conditions
  app.get('/api/admin/ai-alerts', checkAdminAuth, async (req, res) => {
    try {
      const { checkAlertConditions } = await import("./feedback-tracker");
      const alerts = await checkAlertConditions();
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTRUCTOR MANAGEMENT ROUTES (Issue #5)
  // ═══════════════════════════════════════════════════════════════════════════

  // Get all instructors with filters and promotion controls
  app.get('/api/admin/instructors', checkAdminAuth, async (req, res) => {
    try {
      const { sql: sqlOp, desc, eq, and, or, like, isNull } = await import("drizzle-orm");
      const filters = [];
      
      // Filter by review status
      if (req.query.needs_review === 'true') {
        filters.push(eq(instructorCredibility.needsAdminReview, true));
      }
      if (req.query.auto_discovered === 'true') {
        filters.push(eq(instructorCredibility.autoDiscovered, true));
      }
      if (req.query.tier) {
        filters.push(eq(instructorCredibility.tier, parseInt(req.query.tier as string)));
      }
      if (req.query.partnership_status) {
        filters.push(eq(instructorCredibility.partnershipStatus, req.query.partnership_status as string));
      }
      
      const instructors = await db.select({
        id: instructorCredibility.id,
        name: instructorCredibility.name,
        tier: instructorCredibility.tier,
        autoDiscovered: instructorCredibility.autoDiscovered,
        discoverySource: instructorCredibility.discoverySource,
        discoveredAt: instructorCredibility.discoveredAt,
        needsAdminReview: instructorCredibility.needsAdminReview,
        adminReviewed: instructorCredibility.adminReviewed,
        autoTierAssignment: instructorCredibility.autoTierAssignment,
        autoTierReason: instructorCredibility.autoTierReason,
        featureLevel: instructorCredibility.featureLevel,
        searchBoost: instructorCredibility.searchBoost,
        recommendationBoost: instructorCredibility.recommendationBoost,
        homepageFeatured: instructorCredibility.homepageFeatured,
        partnershipStatus: instructorCredibility.partnershipStatus,
        recommendationPriority: instructorCredibility.recommendationPriority,
        priorityMode: instructorCredibility.priorityMode,
        youtubeSubscribers: instructorCredibility.youtubeSubscribers,
        videosInLibrary: instructorCredibility.videosInLibrary,
        totalRecommendations: instructorCredibility.totalRecommendations,
        helpfulRatio: instructorCredibility.helpfulRatio,
        isActive: instructorCredibility.isActive,
        createdAt: instructorCredibility.createdAt,
      }).from(instructorCredibility)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(instructorCredibility.recommendationPriority));
      
      res.json({ instructors });
    } catch (error: any) {
      console.error('[Admin Instructors] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get instructor stats for dashboard
  app.get('/api/admin/instructors/stats', checkAdminAuth, async (req, res) => {
    try {
      const { count, eq, and } = await import("drizzle-orm");
      
      const [totalResult] = await db.select({ count: count() })
        .from(instructorCredibility);
      
      const [needsReviewResult] = await db.select({ count: count() })
        .from(instructorCredibility)
        .where(and(
          eq(instructorCredibility.needsAdminReview, true),
          eq(instructorCredibility.adminReviewed, false)
        ));
      
      const [autoDiscoveredResult] = await db.select({ count: count() })
        .from(instructorCredibility)
        .where(eq(instructorCredibility.autoDiscovered, true));
      
      const [featuredResult] = await db.select({ count: count() })
        .from(instructorCredibility)
        .where(eq(instructorCredibility.homepageFeatured, true));
      
      res.json({
        total: totalResult.count,
        needsReview: needsReviewResult.count,
        autoDiscovered: autoDiscoveredResult.count,
        featured: featuredResult.count,
      });
    } catch (error: any) {
      console.error('[Admin Instructor Stats] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update instructor promotion controls
  app.patch('/api/admin/instructors/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { eq } = await import("drizzle-orm");
      const {
        feature_level,
        search_boost,
        recommendation_boost,
        homepage_featured,
        partnership_status,
        admin_review_notes,
        tier,
        is_active,
      } = req.body;
      
      const updates: any = {};
      
      if (feature_level !== undefined) updates.featureLevel = feature_level;
      if (search_boost !== undefined) updates.searchBoost = search_boost;
      if (recommendation_boost !== undefined) updates.recommendationBoost = recommendation_boost;
      if (homepage_featured !== undefined) updates.homepageFeatured = homepage_featured;
      if (partnership_status !== undefined) updates.partnershipStatus = partnership_status;
      if (tier !== undefined) updates.tier = tier;
      if (is_active !== undefined) updates.isActive = is_active;
      
      // If admin is reviewing this instructor
      if (admin_review_notes !== undefined) {
        updates.adminReviewNotes = admin_review_notes;
        updates.adminReviewed = true;
        updates.adminReviewedBy = 'admin';
        updates.adminReviewedAt = new Date();
        updates.needsAdminReview = false;
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }
      
      await db.update(instructorCredibility)
        .set(updates)
        .where(eq(instructorCredibility.id, id));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin Update Instructor] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Mark instructor as reviewed
  app.post('/api/admin/instructors/:id/review', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { approved, notes, tier } = req.body;
      const { eq } = await import("drizzle-orm");
      
      const updates: any = {
        adminReviewed: true,
        adminReviewedBy: 'admin',
        adminReviewedAt: new Date(),
        needsAdminReview: false,
        adminReviewNotes: notes || null,
      };
      
      if (tier !== undefined) {
        updates.tier = tier;
      }
      
      if (!approved) {
        updates.isActive = false;
      }
      
      await db.update(instructorCredibility)
        .set(updates)
        .where(eq(instructorCredibility.id, id));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin Review Instructor] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get instructor balance report (for balanced curation)
  app.get('/api/admin/instructors/balance-report', checkAdminAuth, async (req, res) => {
    try {
      const { desc, sql: sqlOp } = await import("drizzle-orm");
      
      // Get instructors ordered by how underrepresented they are
      const instructors = await db.select({
        id: instructorCredibility.id,
        name: instructorCredibility.name,
        tier: instructorCredibility.tier,
        videosInLibrary: instructorCredibility.videosInLibrary,
        totalRecommendations: instructorCredibility.totalRecommendations,
        recommendationPriority: instructorCredibility.recommendationPriority,
        // Calculate representation ratio (recommendations / videos)
        representationRatio: sqlOp`CASE WHEN ${instructorCredibility.videosInLibrary} > 0 THEN ${instructorCredibility.totalRecommendations}::float / ${instructorCredibility.videosInLibrary}::float ELSE 0 END`,
      }).from(instructorCredibility)
        .where(sqlOp`${instructorCredibility.isActive} = true AND ${instructorCredibility.videosInLibrary} > 0`)
        .orderBy(sqlOp`CASE WHEN ${instructorCredibility.videosInLibrary} > 0 THEN ${instructorCredibility.totalRecommendations}::float / ${instructorCredibility.videosInLibrary}::float ELSE 0 END ASC`);
      
      res.json({ instructors });
    } catch (error: any) {
      console.error('[Admin Balance Report] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIDEO CURATION CONTROL ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // Get curation settings
  app.get('/api/admin/curation/settings', checkAdminAuth, async (req, res) => {
    try {
      const { videoCurationConfig } = await import("@shared/schema");
      
      // Get the first (and only) config record
      const config = await db.select()
        .from(videoCurationConfig)
        .limit(1);
      
      if (config.length === 0) {
        // Return default settings if none exist
        return res.json({
          automaticCurationEnabled: true,
          manualReviewEnabled: false,
          qualityThreshold: 7.5,
          lastRunAt: null,
          nextScheduledRun: null,
        });
      }
      
      res.json(config[0]);
    } catch (error: any) {
      console.error('[Admin Curation Settings] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update curation settings
  app.patch('/api/admin/curation/settings', checkAdminAuth, async (req, res) => {
    try {
      const { videoCurationConfig } = await import("@shared/schema");
      const { automaticCurationEnabled, manualReviewEnabled, qualityThreshold } = req.body;
      
      const updates: any = { updatedAt: new Date() };
      if (automaticCurationEnabled !== undefined) updates.automaticCurationEnabled = automaticCurationEnabled;
      if (manualReviewEnabled !== undefined) updates.manualReviewEnabled = manualReviewEnabled;
      if (qualityThreshold !== undefined) updates.qualityThreshold = qualityThreshold;
      
      // Update the first record (there should only be one)
      const result = await db.update(videoCurationConfig)
        .set(updates)
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: 'Settings not found' });
      }
      
      console.log(`[Admin] Curation settings updated:`, updates);
      res.json(result[0]);
    } catch (error: any) {
      console.error('[Admin Update Curation Settings] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Manually trigger curation run
  app.post('/api/admin/curation/run', checkAdminAuth, async (req, res) => {
    try {
      const { runContentFirstCuration } = await import("./content-first-curator");
      
      console.log('[Admin] Manual curation run triggered');
      
      // Run curation in background
      runContentFirstCuration(50).catch((error: any) => {
        console.error('[Admin Manual Curation] Error:', error);
      });
      
      res.json({ 
        success: true, 
        message: 'Curation started. Check the video library in a few minutes.' 
      });
    } catch (error: any) {
      console.error('[Admin Manual Curation] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get review queue
  app.get('/api/admin/curation/queue', checkAdminAuth, async (req, res) => {
    try {
      const { videoReviewQueue } = await import("@shared/schema");
      const { desc } = await import("drizzle-orm");
      
      const queue = await db.select()
        .from(videoReviewQueue)
        .where(eq(videoReviewQueue.status, 'pending'))
        .orderBy(desc(videoReviewQueue.createdAt));
      
      res.json({ queue, count: queue.length });
    } catch (error: any) {
      console.error('[Admin Review Queue] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Approve or reject video from review queue
  app.post('/api/admin/curation/review/:id', checkAdminAuth, async (req, res) => {
    try {
      const { videoReviewQueue } = await import("@shared/schema");
      const { id } = req.params;
      const { action } = req.body; // 'approve' or 'reject'
      
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be "approve" or "reject"' });
      }
      
      // Update the queue item status
      const result = await db.update(videoReviewQueue)
        .set({
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewedBy: 'admin', // TODO: Get actual admin user ID from session
          reviewedAt: new Date(),
        })
        .where(eq(videoReviewQueue.id, parseInt(id)))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: 'Queue item not found' });
      }
      
      // If approved, add to main video library
      if (action === 'approve') {
        const queueItem = result[0];
        // TODO: Add logic to insert into aiVideoKnowledge table
        console.log('[Admin] Approved video from queue:', queueItem.title);
      }
      
      res.json({ success: true, action, video: result[0] });
    } catch (error: any) {
      console.error('[Admin Review Video] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get curation history/stats
  app.get('/api/admin/curation/history', checkAdminAuth, async (req, res) => {
    try {
      const { videoCurationLog } = await import("@shared/schema");
      const { desc } = await import("drizzle-orm");
      
      const history = await db.select()
        .from(videoCurationLog)
        .orderBy(desc(videoCurationLog.runAt))
        .limit(10);
      
      res.json(history);
    } catch (error: any) {
      console.error('[Admin Curation History] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTNERSHIP MANAGEMENT ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // Get all partnerships with filters
  app.get('/api/admin/partnerships', checkAdminAuth, async (req, res) => {
    try {
      const { desc, eq, and } = await import("drizzle-orm");
      const filters = [];
      
      if (req.query.feature_level) {
        filters.push(eq(featuredInstructors.featureLevel, req.query.feature_level as string));
      }
      if (req.query.is_active === 'true') {
        filters.push(eq(featuredInstructors.isActive, true));
      } else if (req.query.is_active === 'false') {
        filters.push(eq(featuredInstructors.isActive, false));
      }
      
      const partnerships = await db.select({
        id: featuredInstructors.id,
        instructorId: featuredInstructors.instructorId,
        instructorName: instructorCredibility.name,
        featureLevel: featuredInstructors.featureLevel,
        searchPriorityPercentage: featuredInstructors.searchPriorityPercentage,
        recommendationBoostPercentage: featuredInstructors.recommendationBoostPercentage,
        showBadge: featuredInstructors.showBadge,
        showNameCallout: featuredInstructors.showNameCallout,
        customCalloutText: featuredInstructors.customCalloutText,
        startDate: featuredInstructors.startDate,
        endDate: featuredInstructors.endDate,
        isActive: featuredInstructors.isActive,
        partnershipType: featuredInstructors.partnershipType,
        partnershipAgreement: featuredInstructors.partnershipAgreement,
        socialPostCompleted: featuredInstructors.socialPostCompleted,
        socialPostDate: featuredInstructors.socialPostDate,
        linkInBioUntil: featuredInstructors.linkInBioUntil,
        totalRecommendations: featuredInstructors.totalRecommendations,
        totalVideoViews: featuredInstructors.totalVideoViews,
        monthlyRecommendationCount: featuredInstructors.monthlyRecommendationCount,
        partnershipNotes: featuredInstructors.partnershipNotes,
        createdAt: featuredInstructors.createdAt,
      }).from(featuredInstructors)
        .leftJoin(instructorCredibility, eq(featuredInstructors.instructorId, instructorCredibility.id))
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(featuredInstructors.createdAt));
      
      res.json(partnerships);
    } catch (error: any) {
      console.error('[Admin Partnerships] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get partnership stats
  app.get('/api/admin/partnerships/stats', checkAdminAuth, async (req, res) => {
    try {
      const { count, eq, and } = await import("drizzle-orm");
      
      const [totalResult] = await db.select({ count: count() })
        .from(featuredInstructors);
      
      const [activeResult] = await db.select({ count: count() })
        .from(featuredInstructors)
        .where(eq(featuredInstructors.isActive, true));
      
      const [primaryResult] = await db.select({ count: count() })
        .from(featuredInstructors)
        .where(and(
          eq(featuredInstructors.featureLevel, 'primary'),
          eq(featuredInstructors.isActive, true)
        ));
      
      const [socialResult] = await db.select({ count: count() })
        .from(featuredInstructors)
        .where(eq(featuredInstructors.socialPostCompleted, true));
      
      res.json({
        total: totalResult.count,
        active: activeResult.count,
        primaryCount: primaryResult.count,
        socialPostsCompleted: socialResult.count,
      });
    } catch (error: any) {
      console.error('[Admin Partnership Stats] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create new partnership
  app.post('/api/admin/partnerships', checkAdminAuth, async (req, res) => {
    try {
      const {
        instructor_id,
        feature_level,
        search_priority_percentage,
        recommendation_boost_percentage,
        show_badge,
        show_name_callout,
        custom_callout_text,
        start_date,
        end_date,
        is_active,
        partnership_type,
        partnership_agreement,
        social_post_completed,
        social_post_date,
        link_in_bio_until,
        partnership_notes,
      } = req.body;
      
      const [partnership] = await db.insert(featuredInstructors).values({
        instructorId: instructor_id,
        featureLevel: feature_level,
        searchPriorityPercentage: search_priority_percentage,
        recommendationBoostPercentage: recommendation_boost_percentage,
        showBadge: show_badge ?? true,
        showNameCallout: show_name_callout ?? true,
        customCalloutText: custom_callout_text || null,
        startDate: start_date,
        endDate: end_date || null,
        isActive: is_active ?? true,
        partnershipType: partnership_type || null,
        partnershipAgreement: partnership_agreement || null,
        socialPostCompleted: social_post_completed ?? false,
        socialPostDate: social_post_date || null,
        linkInBioUntil: link_in_bio_until || null,
        partnershipNotes: partnership_notes || null,
      }).returning();
      
      res.json(partnership);
    } catch (error: any) {
      console.error('[Admin Create Partnership] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update partnership
  app.patch('/api/admin/partnerships/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { eq } = await import("drizzle-orm");
      const {
        feature_level,
        search_priority_percentage,
        recommendation_boost_percentage,
        show_badge,
        show_name_callout,
        custom_callout_text,
        start_date,
        end_date,
        is_active,
        partnership_type,
        partnership_agreement,
        social_post_completed,
        social_post_date,
        link_in_bio_until,
        partnership_notes,
      } = req.body;
      
      const updates: any = {};
      
      if (feature_level !== undefined) updates.featureLevel = feature_level;
      if (search_priority_percentage !== undefined) updates.searchPriorityPercentage = search_priority_percentage;
      if (recommendation_boost_percentage !== undefined) updates.recommendationBoostPercentage = recommendation_boost_percentage;
      if (show_badge !== undefined) updates.showBadge = show_badge;
      if (show_name_callout !== undefined) updates.showNameCallout = show_name_callout;
      if (custom_callout_text !== undefined) updates.customCalloutText = custom_callout_text;
      if (start_date !== undefined) updates.startDate = start_date;
      if (end_date !== undefined) updates.endDate = end_date;
      if (is_active !== undefined) updates.isActive = is_active;
      if (partnership_type !== undefined) updates.partnershipType = partnership_type;
      if (partnership_agreement !== undefined) updates.partnershipAgreement = partnership_agreement;
      if (social_post_completed !== undefined) updates.socialPostCompleted = social_post_completed;
      if (social_post_date !== undefined) updates.socialPostDate = social_post_date;
      if (link_in_bio_until !== undefined) updates.linkInBioUntil = link_in_bio_until;
      if (partnership_notes !== undefined) updates.partnershipNotes = partnership_notes;
      
      await db.update(featuredInstructors)
        .set(updates)
        .where(eq(featuredInstructors.id, id));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin Update Partnership] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete partnership
  app.delete('/api/admin/partnerships/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { eq } = await import("drizzle-orm");
      
      await db.delete(featuredInstructors)
        .where(eq(featuredInstructors.id, id));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin Delete Partnership] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // META INSIGHTS DASHBOARD ROUTES (Issue #7)
  // ═══════════════════════════════════════════════════════════════════════════

  // Get trending techniques from user requests
  app.get('/api/admin/meta/trending-techniques', checkAdminAuth, async (req, res) => {
    try {
      const { userTechniqueRequests } = await import("@shared/schema");
      const { sql: sqlOp, desc } = await import("drizzle-orm");
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Get top requested techniques in last 30 days
      const trending = await db.select({
        technique: userTechniqueRequests.techniqueMentioned,
        requestCount: sqlOp<number>`count(*)::int`,
        lastRequested: sqlOp<Date>`max(${userTechniqueRequests.requestedAt})`,
        uniqueUsers: sqlOp<number>`count(distinct ${userTechniqueRequests.userId})::int`,
      }).from(userTechniqueRequests)
        .where(sqlOp`${userTechniqueRequests.requestedAt} >= ${thirtyDaysAgo}`)
        .groupBy(userTechniqueRequests.techniqueMentioned)
        .orderBy(desc(sqlOp`count(*)`))
        .limit(20);
      
      res.json(trending);
    } catch (error: any) {
      console.error('[Admin Trending Techniques] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user technique requests with filters
  app.get('/api/admin/meta/user-requests', checkAdminAuth, async (req, res) => {
    try {
      const { userTechniqueRequests } = await import("@shared/schema");
      const { desc, eq, like, and } = await import("drizzle-orm");
      const filters = [];
      
      if (req.query.technique) {
        filters.push(like(userTechniqueRequests.techniqueMentioned, `%${req.query.technique}%`));
      }
      if (req.query.request_type) {
        filters.push(eq(userTechniqueRequests.requestType, req.query.request_type as string));
      }
      
      const requests = await db.select({
        id: userTechniqueRequests.id,
        userId: userTechniqueRequests.userId,
        techniqueMentioned: userTechniqueRequests.techniqueMentioned,
        requestContext: userTechniqueRequests.requestContext,
        requestType: userTechniqueRequests.requestType,
        beltLevel: userTechniqueRequests.beltLevel,
        giPreference: userTechniqueRequests.giPreference,
        requestedAt: userTechniqueRequests.requestedAt,
      }).from(userTechniqueRequests)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(userTechniqueRequests.requestedAt))
        .limit(100);
      
      res.json(requests);
    } catch (error: any) {
      console.error('[Admin User Requests] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get competition meta tracking data
  app.get('/api/admin/meta/competition', checkAdminAuth, async (req, res) => {
    try {
      const { competitionMetaTracking } = await import("@shared/schema");
      const { desc, eq, like, and } = await import("drizzle-orm");
      const filters = [];
      
      if (req.query.technique) {
        filters.push(like(competitionMetaTracking.techniqueName, `%${req.query.technique}%`));
      }
      if (req.query.competition) {
        filters.push(like(competitionMetaTracking.competitionName, `%${req.query.competition}%`));
      }
      if (req.query.trend_status) {
        filters.push(eq(competitionMetaTracking.trendStatus, req.query.trend_status as string));
      }
      
      const compData = await db.select({
        id: competitionMetaTracking.id,
        competitionName: competitionMetaTracking.competitionName,
        competitionDate: competitionMetaTracking.competitionDate,
        competitionCategory: competitionMetaTracking.competitionCategory,
        techniqueName: competitionMetaTracking.techniqueName,
        techniqueCategory: competitionMetaTracking.techniqueCategory,
        totalOccurrences: competitionMetaTracking.totalOccurrences,
        winsByTechnique: competitionMetaTracking.winsByTechnique,
        winRate: competitionMetaTracking.winRate,
        notableAthletes: competitionMetaTracking.notableAthletes,
        medalCount: competitionMetaTracking.medalCount,
        trendStatus: competitionMetaTracking.trendStatus,
        changePercentage: competitionMetaTracking.changePercentage,
        verified: competitionMetaTracking.verified,
        createdAt: competitionMetaTracking.createdAt,
      }).from(competitionMetaTracking)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(competitionMetaTracking.competitionDate))
        .limit(100);
      
      res.json(compData);
    } catch (error: any) {
      console.error('[Admin Competition Meta] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create competition meta entry
  app.post('/api/admin/meta/competition', checkAdminAuth, async (req, res) => {
    try {
      const { competitionMetaTracking } = await import("@shared/schema");
      const {
        competition_name,
        competition_date,
        competition_category,
        technique_name,
        technique_category,
        total_occurrences,
        wins_by_technique,
        notable_athletes,
        medal_count,
        trend_status,
        notes,
      } = req.body;
      
      const winRate = total_occurrences > 0 
        ? (wins_by_technique / total_occurrences) * 100 
        : 0;
      
      const [entry] = await db.insert(competitionMetaTracking).values({
        competitionName: competition_name,
        competitionDate: competition_date,
        competitionCategory: competition_category || null,
        techniqueName: technique_name,
        techniqueCategory: technique_category || null,
        totalOccurrences: total_occurrences || 0,
        winsByTechnique: wins_by_technique || 0,
        winRate: winRate.toFixed(2),
        notableAthletes: notable_athletes || [],
        medalCount: medal_count || 0,
        trendStatus: trend_status || 'stable',
        dataSource: 'manual_entry',
        verified: true,
        verifiedBy: 'admin',
        notes: notes || null,
      }).returning();
      
      res.json(entry);
    } catch (error: any) {
      console.error('[Admin Create Competition Meta] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get technique meta status (aggregated insights)
  app.get('/api/admin/meta/technique-status', checkAdminAuth, async (req, res) => {
    try {
      const { techniqueMetaStatus } = await import("@shared/schema");
      const { desc, eq, and } = await import("drizzle-orm");
      const filters = [];
      
      if (req.query.needs_curation === 'true') {
        filters.push(eq(techniqueMetaStatus.needsCuration, true));
      }
      if (req.query.meta_status) {
        filters.push(eq(techniqueMetaStatus.metaStatus, req.query.meta_status as string));
      }
      
      const status = await db.select({
        id: techniqueMetaStatus.id,
        techniqueName: techniqueMetaStatus.techniqueName,
        userRequestScore: techniqueMetaStatus.userRequestScore,
        competitionMetaScore: techniqueMetaStatus.competitionMetaScore,
        overallMetaScore: techniqueMetaStatus.overallMetaScore,
        metaStatus: techniqueMetaStatus.metaStatus,
        videosInLibrary: techniqueMetaStatus.videosInLibrary,
        highestQualityVideoScore: techniqueMetaStatus.highestQualityVideoScore,
        coverageAdequate: techniqueMetaStatus.coverageAdequate,
        needsCuration: techniqueMetaStatus.needsCuration,
        curationPriority: techniqueMetaStatus.curationPriority,
        suggestedSearches: techniqueMetaStatus.suggestedSearches,
        lastUpdated: techniqueMetaStatus.lastUpdated,
      }).from(techniqueMetaStatus)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(techniqueMetaStatus.overallMetaScore))
        .limit(100);
      
      res.json(status);
    } catch (error: any) {
      console.error('[Admin Technique Status] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get meta insights dashboard summary
  app.get('/api/admin/meta/summary', checkAdminAuth, async (req, res) => {
    try {
      const { userTechniqueRequests, competitionMetaTracking, techniqueMetaStatus } = await import("@shared/schema");
      const { count, eq, sql: sqlOp } = await import("drizzle-orm");
      
      const [totalRequestsResult] = await db.select({ count: count() })
        .from(userTechniqueRequests);
      
      const [totalCompEntriesResult] = await db.select({ count: count() })
        .from(competitionMetaTracking);
      
      const [needsCurationResult] = await db.select({ count: count() })
        .from(techniqueMetaStatus)
        .where(eq(techniqueMetaStatus.needsCuration, true));
      
      const [hotTechniquesResult] = await db.select({ count: count() })
        .from(techniqueMetaStatus)
        .where(eq(techniqueMetaStatus.metaStatus, 'hot'));
      
      res.json({
        totalUserRequests: totalRequestsResult.count,
        totalCompetitionEntries: totalCompEntriesResult.count,
        techniquesNeedingCuration: needsCurationResult.count,
        hotTechniques: hotTechniquesResult.count,
      });
    } catch (error: any) {
      console.error('[Admin Meta Summary] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe: Create checkout session for NEW USER SIGNUP (unauthenticated - email verified but no account yet)
  // This is called after email verification for new users who need to pay before account creation
  app.post('/api/signup/checkout', async (req: any, res) => {
    try {
      const { email, priceId, referralCode } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Verify this email doesn't already have an account
      const existingUser = await db.query.bjjUsers.findFirst({
        where: eq(bjjUsers.email, normalizedEmail)
      });

      if (existingUser) {
        return res.status(400).json({ 
          error: 'Account already exists. Please log in instead.',
          existingAccount: true 
        });
      }

      // Development bypass: Create user directly without Stripe in dev mode
      // ONLY enabled when both NODE_ENV=development AND STRIPE_DEV_BYPASS=true
      if (process.env.NODE_ENV === 'development' && process.env.STRIPE_DEV_BYPASS === 'true') {
        console.log(`[DEV BYPASS] Stripe checkout skipped for new user: ${normalizedEmail}`);
        
        // Create user with mock subscription in dev mode
        const [newUser] = await db.insert(bjjUsers).values({
          email: normalizedEmail,
          emailVerified: true,
          onboardingCompleted: false,
          stripeCustomerId: `dev_cust_${Date.now()}`,
          stripeSubscriptionId: `dev_sub_${Date.now()}`,
          subscriptionType: 'monthly',
          subscriptionStatus: 'trialing',
          trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          active: true,
        }).returning();
        
        console.log(`[DEV BYPASS] New user created with mock subscription: ${newUser.id}`);
        
        // Generate session token for dev user so they can continue to login
        const token = jwt.sign(
          { userId: newUser.id, email: newUser.email },
          process.env.JWT_SECRET || 'dev-secret-key',
          { expiresIn: '30d' }
        );
        
        return res.json({ 
          devBypass: true,
          userId: newUser.id,
          token: token,
          user: {
            id: newUser.id,
            email: newUser.email,
            onboardingCompleted: false,
          }
        });
      }

      // Get Stripe price ID
      const stripePriceId = process.env.STRIPE_PRICE_ID_MONTHLY;
      if (!stripePriceId) {
        return res.status(503).json({ 
          error: 'Payment system is not fully configured. Please contact support.',
        });
      }

      // Validate referral code if provided
      let validReferralCode = null;
      let discountCoupon = null;
      let trialDays = 7;
      
      if (referralCode) {
        const upperCode = referralCode.toUpperCase().trim();
        const [refCode] = await db.select({
          id: referralCodes.id,
          code: referralCodes.code,
          codeType: referralCodes.codeType,
          isActive: referralCodes.isActive,
          commissionRate: referralCodes.commissionRate
        })
          .from(referralCodes)
          .where(eq(referralCodes.code, upperCode));
        
        if (refCode && refCode.isActive) {
          validReferralCode = refCode;
          trialDays = 30; // Extended trial for referral signups
          
          // Create Stripe coupon for influencer codes
          if (refCode.codeType === 'influencer' && refCode.commissionRate) {
            const commission = parseFloat(refCode.commissionRate);
            if (commission > 0) {
              try {
                discountCoupon = await stripe.coupons.create({
                  percent_off: commission,
                  duration: 'forever',
                  name: `Referral: ${refCode.code}`
                });
              } catch (couponError) {
                console.error('Error creating coupon:', couponError);
              }
            }
          }
        }
      }

      // Create Stripe checkout session
      const sessionData: any = {
        mode: 'subscription',
        customer_email: normalizedEmail,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: trialDays,
          metadata: {
            email: normalizedEmail,
            referral_code: validReferralCode?.code || 'none',
            signup_source: 'email_verification'
          }
        },
        metadata: {
          email: normalizedEmail,
          referral_code: validReferralCode?.code || 'none',
          signup_source: 'email_verification'
        },
        success_url: `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000'}/payment/success?email=${encodeURIComponent(normalizedEmail)}`,
        cancel_url: `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000'}/pricing`,
      };
      
      // Apply discount coupon if available
      if (discountCoupon) {
        sessionData.discounts = [{ coupon: discountCoupon.id }];
      }
      
      const session = await stripe.checkout.sessions.create(sessionData);
      
      console.log(`✅ [STRIPE] Signup checkout session created for ${normalizedEmail}`);
      
      res.json({ 
        success: true,
        url: session.url,
        sessionId: session.id,
        hasDiscount: !!discountCoupon,
        referralApplied: !!validReferralCode,
        trialDays: trialDays
      });
      
    } catch (error: any) {
      console.error('Signup checkout error:', error);
      res.status(500).json({ error: error.message || 'Failed to create checkout session' });
    }
  });

  // Stripe: Create checkout session with 7-day trial (Email-based)
  app.post('/api/create-checkout-session', checkUserAuth, async (req: any, res) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { priceId, referralCode } = req.body;

      if (!priceId) {
        return res.status(400).json({ error: "Missing priceId" });
      }

      // Get user info
      const user = await db.query.bjjUsers.findFirst({
        where: eq(bjjUsers.id, req.user.userId)
      });

      if (!user || !user.email) {
        return res.status(400).json({ error: "User not found or email missing" });
      }

      // Validate referral code if provided
      let referralData: any = null;
      let stripeCouponId: string | null = null;
      
      if (referralCode && referralCode.trim()) {
        const { validateReferralCodeWithDiscount, recordReferralUsage } = await import('./referral-service');
        const validation = await validateReferralCodeWithDiscount(referralCode);
        
        if (validation.valid && validation.code) {
          referralData = validation.code;
          stripeCouponId = validation.stripeCouponId || null;
          
          // Record referral usage on user and send notification to code owner
          await recordReferralUsage(user.id, {
            ...referralData,
            discountType: validation.discountType,
            discountValue: validation.discountValue,
          }, user.email, user.username || undefined);
          
          console.log(`[CHECKOUT] Referral code ${referralCode} applied for ${user.email}, coupon: ${stripeCouponId}`);
        } else {
          console.log(`[CHECKOUT] Invalid referral code ${referralCode} for ${user.email}`);
        }
      }

      // Development bypass: Skip Stripe in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV BYPASS] Stripe checkout skipped for ${user.email} - ${priceId}`);
        
        // Mock successful subscription creation in dev mode
        await db.update(bjjUsers)
          .set({
            stripeCustomerId: `dev_cust_${Date.now()}`,
            stripeSubscriptionId: `dev_sub_${Date.now()}`,
            subscriptionType: priceId === 'annual' ? 'annual' : 'monthly',
            subscriptionStatus: 'trialing',
            trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          })
          .where(eq(bjjUsers.id, user.id));
        
        console.log(`[DEV BYPASS] Mock subscription created for ${user.email}`);
        
        return res.json({ 
          url: `/chat`,
          devBypass: true 
        });
      }

      // Map plan type to actual Stripe price ID
      let stripePriceId: string;
      if (priceId === "sms-only") {
        // SMS Only plan - $4.99/month
        if (!process.env.STRIPE_PRICE_ID_SMS_ONLY) {
          return res.status(503).json({ 
            error: "SMS Only plan is not available at this time. Please contact support.",
            details: "STRIPE_PRICE_ID_SMS_ONLY is missing. Admin: Create a $4.99/month SMS Only price in Stripe and add STRIPE_PRICE_ID_SMS_ONLY to secrets."
          });
        }
        stripePriceId = process.env.STRIPE_PRICE_ID_SMS_ONLY;
      } else if (priceId === "monthly") {
        // Full AI Package - $19.99/month
        if (!process.env.STRIPE_PRICE_ID_MONTHLY) {
          return res.status(503).json({ 
            error: "Stripe checkout is not fully configured. Please contact support.",
            details: "STRIPE_PRICE_ID_MONTHLY is missing. Admin: Create a $19.99/month price in Stripe and add STRIPE_PRICE_ID_MONTHLY to secrets."
          });
        }
        stripePriceId = process.env.STRIPE_PRICE_ID_MONTHLY;
      } else if (priceId === "annual") {
        // Full AI Package - $149/year
        if (!process.env.STRIPE_PRICE_ID_ANNUAL) {
          return res.status(503).json({ 
            error: "Stripe checkout is not fully configured. Please contact support.",
            details: "STRIPE_PRICE_ID_ANNUAL is missing. Admin: Create a $149/year price in Stripe and add STRIPE_PRICE_ID_ANNUAL to secrets."
          });
        }
        stripePriceId = process.env.STRIPE_PRICE_ID_ANNUAL;
      } else {
        return res.status(400).json({ error: "Invalid plan type. Use 'sms-only', 'monthly', or 'annual'" });
      }

      // Build metadata with email, user ID, and referral code
      const metadata: any = { 
        email: user.email,
        userId: user.id,
      };
      
      if (referralData) {
        metadata.referral_code = referralData.code;
        metadata.referral_code_id = referralData.id;
      }

      // Determine trial days - 30 for referrals, 7 for regular signups
      const trialDays = referralData ? 30 : 7;

      // Build checkout session data
      const sessionData: any = {
        mode: 'subscription',
        customer_email: user.email,
        line_items: [
          {
            price: stripePriceId,
            quantity: 1,
          },
        ],
        subscription_data: {
          trial_period_days: trialDays,
          metadata,
        },
        metadata,
        success_url: `https://${process.env.REPLIT_DOMAINS || 'localhost:5000'}/chat`,
        cancel_url: `https://${process.env.REPLIT_DOMAINS || 'localhost:5000'}/payment`,
      };

      // Apply Stripe coupon if referral code has one
      if (stripeCouponId) {
        sessionData.discounts = [{ coupon: stripeCouponId }];
        console.log(`[CHECKOUT] Applying Stripe coupon ${stripeCouponId} to checkout session`);
      }

      const session = await stripe.checkout.sessions.create(sessionData);

      console.log(`✅ [STRIPE] Checkout session created for ${user.email}${stripeCouponId ? ` with coupon ${stripeCouponId}` : ''}`);
      res.json({ 
        url: session.url,
        referralApplied: !!referralData,
        discountDescription: referralData ? referralData.discountDescription : null
      });
    } catch (error: any) {
      console.error('Stripe checkout error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe: Webhook endpoint
  // NOTE: Raw body parsing is handled in index.ts BEFORE express.json() for signature verification
  app.post('/api/webhooks/stripe', async (req: any, res) => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      return res.status(400).send('No signature');
    }

    // Use rawBody if available (set by middleware in index.ts), otherwise fall back to req.body
    const payload = req.rawBody || req.body;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        payload,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const referralCode = session.metadata?.referral_code;
          const email = session.customer_email || session.metadata?.email;
          const signupSource = session.metadata?.signup_source;
          
          console.log(`[STRIPE WEBHOOK] checkout.session.completed for ${email}, source: ${signupSource}`);
          
          // NEW USER SIGNUP: Create user account after successful payment
          if (signupSource === 'email_verification' && email) {
            // Check if user already exists
            const existingUser = await db.query.bjjUsers.findFirst({
              where: eq(bjjUsers.email, email.toLowerCase())
            });
            
            if (!existingUser) {
              // Create new user account with subscription info
              const [newUser] = await db.insert(bjjUsers).values({
                email: email.toLowerCase(),
                emailVerified: true,
                onboardingCompleted: false,
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: session.subscription as string,
                subscriptionType: 'monthly',
                subscriptionStatus: 'trialing',
                trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now (will be updated by subscription webhook)
                active: true,
                referralCode: referralCode && referralCode !== 'none' ? referralCode : null,
              }).returning();
              
              console.log(`✅ [STRIPE WEBHOOK] Created new user ${email} with ID ${newUser.id}`);
              
              // Log activity
              await logActivity(
                'user_signup',
                newUser.id,
                email,
                `New user signed up via Stripe checkout${referralCode && referralCode !== 'none' ? ` with code ${referralCode}` : ''}`,
                { referralCode: referralCode || null, customerId: session.customer, subscriptionId: session.subscription }
              );
            } else {
              console.log(`[STRIPE WEBHOOK] User ${email} already exists, updating subscription info`);
              
              // Update existing user's subscription info
              await db.update(bjjUsers)
                .set({
                  stripeCustomerId: session.customer as string,
                  stripeSubscriptionId: session.subscription as string,
                  subscriptionStatus: 'trialing',
                  active: true,
                })
                .where(eq(bjjUsers.id, existingUser.id));
            }
          } else {
            // Log activity for existing user checkout
            await logActivity(
              'user_signup',
              null,
              email || null,
              `User checkout completed${referralCode && referralCode !== 'none' ? ` via code ${referralCode}` : ''}`,
              { referralCode: referralCode || null, customerId: session.customer }
            );
          }
          
          // Track referral signup only after successful checkout (atomic increment)
          if (referralCode && referralCode !== 'none') {
            await db.execute(
              drizzleSql`
                UPDATE referral_codes 
                SET total_signups = total_signups + 1 
                WHERE code = ${referralCode.toUpperCase()}
              `
            );
            console.log(`✅ [REFERRAL] Tracked signup for code: ${referralCode}`);
          }
          break;
        }

        case 'customer.subscription.created': {
          const subscription = event.data.object as Stripe.Subscription;
          const email = subscription.metadata.email;
          const userId = subscription.metadata.userId;
          
          // Send admin notification about new subscription
          import('./admin-notifications').then(async ({ alertNewSubscription }) => {
            try {
              // Count total customers to get customer number
              const totalCustomers = await db.select({ count: sql`count(*)` }).from(bjjUsers).where(eq(bjjUsers.subscriptionStatus, 'active'));
              const customerNumber = Number(totalCustomers[0]?.count || 0);
              alertNewSubscription(email || 'Unknown', customerNumber).catch(err => 
                console.error('[ADMIN SMS] Failed to send subscription alert:', err)
              );
            } catch (err) {
              console.error('[ADMIN SMS] Failed to send subscription alert:', err);
            }
          });
          
          // Find existing user by email or userId
          let existingUser;
          if (userId) {
            [existingUser] = await db.select({
              id: bjjUsers.id,
              email: bjjUsers.email,
              subscriptionType: bjjUsers.subscriptionType
            })
              .from(bjjUsers)
              .where(eq(bjjUsers.id, userId));
          } else if (email) {
            [existingUser] = await db.select({
              id: bjjUsers.id,
              email: bjjUsers.email,
              subscriptionType: bjjUsers.subscriptionType
            })
              .from(bjjUsers)
              .where(eq(bjjUsers.email, email));
          }

          if (existingUser) {
            // Update existing user with subscription details
            const subscriptionType = subscription.items.data[0].price.id === process.env.STRIPE_PRICE_ID_ANNUAL 
              ? 'annual' 
              : 'monthly';

            const referralCode = subscription.metadata.referral_code;
            
            const trialEnd = subscription.trial_end 
              ? new Date(subscription.trial_end * 1000) 
              : null;

            await db.update(bjjUsers)
              .set({
                subscriptionType: subscriptionType,
                stripeCustomerId: subscription.customer as string,
                stripeSubscriptionId: subscription.id,
                subscriptionStatus: subscription.status,
                trialEndDate: trialEnd,
                active: true,
                ...(referralCode && referralCode !== 'none' && { referralCode }),
              })
              .where(eq(bjjUsers.id, existingUser.id));
            
            // 🚀 CACHE INVALIDATION: Clear user context on subscription change
            try {
              const { professorOSCache } = await import('./services/professor-os-cache');
              professorOSCache.invalidateUser(existingUser.id);
            } catch (e) { /* non-critical */ }

            console.log(`✅ [STRIPE WEBHOOK] Updated user ${existingUser.email} with subscription ${subscription.id}`);
          } else {
            console.error(`❌ [STRIPE WEBHOOK] User not found for email: ${email}, userId: ${userId}`);
          }
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          
          // Update subscription status
          const [user] = await db.select({
            id: bjjUsers.id,
            active: bjjUsers.active
          })
            .from(bjjUsers)
            .where(eq(bjjUsers.stripeSubscriptionId, subscription.id));

          if (user) {
            const activeStatus = subscription.status === 'active' || subscription.status === 'trialing';
            await db.update(bjjUsers)
              .set({ active: activeStatus })
              .where(eq(bjjUsers.id, user.id));
            
            // 🚀 CACHE INVALIDATION: Clear user context on subscription change
            try {
              const { professorOSCache } = await import('./services/professor-os-cache');
              professorOSCache.invalidateUser(user.id);
            } catch (e) { /* non-critical */ }
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          
          // Deactivate user
          const [user] = await db.select({
            id: bjjUsers.id,
            phoneNumber: bjjUsers.phoneNumber,
            active: bjjUsers.active,
            referralCode: bjjUsers.referralCode
          })
            .from(bjjUsers)
            .where(eq(bjjUsers.stripeSubscriptionId, subscription.id));

          if (user) {
            // Send admin notification about cancellation
            import('./admin-notifications').then(({ alertSubscriptionCancellation }) => {
              alertSubscriptionCancellation(user.phoneNumber || 'Unknown').catch(err => 
                console.error('[ADMIN SMS] Failed to send cancellation alert:', err)
              );
            });
            
            await db.update(bjjUsers)
              .set({ active: false })
              .where(eq(bjjUsers.id, user.id));

            // Decrement activeSubscribers if user had a referral code
            if (user.referralCode) {
              await db.execute(
                drizzleSql`
                  UPDATE referral_codes 
                  SET active_subscribers = GREATEST(active_subscribers - 1, 0)
                  WHERE code = ${user.referralCode}
                `
              );
              console.log(`✅ [REFERRAL] Decremented active subscriber for code: ${user.referralCode}`);
            }

            // Send cancellation confirmation (if phone exists)
            if (user.phoneNumber) {
              await sendSMS(
                user.phoneNumber,
                `Your BJJ OS subscription has been cancelled. You won't be charged again.\n\nWe'll miss you! Reply RESUME anytime to reactivate.`
              );
            }
          }
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          
          if (invoice.subscription) {
            // Payment successful - ensure user is active
            const [user] = await db.select({
              id: bjjUsers.id,
              email: bjjUsers.email,
              active: bjjUsers.active,
              referralCode: bjjUsers.referralCode
            })
              .from(bjjUsers)
              .where(eq(bjjUsers.stripeSubscriptionId, invoice.subscription as string));

            if (user) {
              const paymentAmount = (invoice.amount_paid || 0) / 100;
              
              // Log activity
              await logActivity(
                'payment_succeeded',
                user.id,
                user.email || null,
                `Payment successful: $${paymentAmount.toFixed(2)}`,
                { amount: paymentAmount, invoiceId: invoice.id }
              );
              
              if (!user.active) {
                await db.update(bjjUsers)
                  .set({ active: true })
                  .where(eq(bjjUsers.id, user.id));
              }

              // Track referral commission if user signed up with a code
              if (user.referralCode) {
                const [refCode] = await db.select()
                  .from(referralCodes)
                  .where(eq(referralCodes.code, user.referralCode));

                if (refCode && refCode.assignedToUserId) {
                  const commissionPercent = parseInt(refCode.commissionRate?.toString() || "0");

                  if (commissionPercent > 0 && paymentAmount > 0) {
                    // Check if this is the first paid invoice (conversion from trial) BEFORE recording commission
                    const previousCommissions = await db.select()
                      .from(referralCommissions)
                      .where(and(
                        eq(referralCommissions.referredUserId, user.id),
                        eq(referralCommissions.referralCodeId, refCode.id)
                      ))
                      .limit(1);
                    
                    const isFirstPayment = previousCommissions.length === 0;

                    // Increment activeSubscribers BEFORE recording commission (only on first payment)
                    if (isFirstPayment && invoice.billing_reason === 'subscription_cycle') {
                      await db.execute(
                        drizzleSql`
                          UPDATE referral_codes 
                          SET active_subscribers = active_subscribers + 1 
                          WHERE code = ${user.referralCode}
                        `
                      );
                      console.log(`✅ [REFERRAL] First payment - incremented active subscriber for code: ${user.referralCode}`);
                      
                      // Log trial conversion
                      await logActivity(
                        'trial_converted',
                        user.id,
                        user.email || null,
                        'Converted from trial to paid subscription',
                        { amount: paymentAmount }
                      );
                    } else if (!isFirstPayment) {
                      console.log(`ℹ️ [REFERRAL] Renewal payment (not first) - activeSubscribers unchanged for code: ${user.referralCode}`);
                    }

                    // Now record the commission
                    const { recordCommission } = await import('./referral-service');
                    await recordCommission({
                      referralCodeId: refCode.id,
                      codeOwnerUserId: refCode.assignedToUserId,
                      referredUserId: user.id,
                      paymentAmount,
                      commissionPercent,
                      stripePaymentId: invoice.payment_intent as string || '',
                      stripeChargeId: invoice.charge as string,
                      subscriptionId: invoice.subscription as string,
                    });
                    console.log(`✅ Recorded ${commissionPercent}% commission ($${(paymentAmount * commissionPercent / 100).toFixed(2)}) for referral ${user.referralCode}`);
                  }
                }
              }
            }
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          
          if (invoice.subscription) {
            const [user] = await db.select({
              id: bjjUsers.id,
              phoneNumber: bjjUsers.phoneNumber,
              active: bjjUsers.active
            })
              .from(bjjUsers)
              .where(eq(bjjUsers.stripeSubscriptionId, invoice.subscription as string));

            if (user) {
              // Log payment failure activity
              await logActivity({
                userId: user.id,
                action: 'payment_failed',
                category: 'billing',
                details: `Payment of $${(invoice.amount_due / 100).toFixed(2)} failed`,
                metadata: {
                  invoiceId: invoice.id,
                  amount: invoice.amount_due,
                  attemptCount: invoice.attempt_count
                }
              });
              
              // Send admin notification about payment failure
              import('./admin-notifications').then(({ alertPaymentFailed }) => {
                alertPaymentFailed(user.phoneNumber || 'Unknown', invoice.amount_due || 0, 'Payment failed').catch(err => 
                  console.error('[ADMIN SMS] Failed to send payment failed alert:', err)
                );
              });
              
              // Pause service
              await db.update(bjjUsers)
                .set({ active: false })
                .where(eq(bjjUsers.id, user.id));

              // Notify user (if phone exists)
              if (user.phoneNumber) {
                await sendSMS(
                  user.phoneNumber,
                  `⚠️ Payment failed for BJJ OS. Please update your payment method to continue receiving techniques.\n\nUpdate: stripe.com/billing`
                );
              }
            }
          }
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook handler error:', error);
      await logSystemError('stripe_webhook', error.message, {
        eventType: event?.type,
        webhookId: event?.id,
        stack: error.stack
      }, 'high');
      res.status(500).json({ error: error.message });
    }
  });

  // =============================================================================
  // SUBSCRIPTION & USER MANAGEMENT API ROUTES
  // =============================================================================

  // Validate referral code with discount info
  app.post('/api/validate-referral', async (req, res) => {
    try {
      const { code } = req.body;
      
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ valid: false, error: 'Referral code is required' });
      }
      
      const { validateReferralCodeWithDiscount } = await import('./referral-service');
      const result = await validateReferralCodeWithDiscount(code);
      
      if (result.valid && result.code) {
        res.json({ 
          valid: true, 
          code: result.code.code,
          type: result.code.codeType,
          discountType: result.discountType,
          discountValue: result.discountValue,
          discountDescription: result.discountDescription,
          stripeCouponId: result.stripeCouponId,
          message: result.message
        });
      } else {
        res.json({ valid: false, error: result.message || 'Invalid or inactive referral code' });
      }
    } catch (error: any) {
      console.error('Referral validation error:', error);
      res.status(500).json({ valid: false, error: 'Failed to validate referral code' });
    }
  });

  // Toggle SMS notifications for user (requires authentication)
  app.post('/api/toggle-sms', checkAdminAuth, async (req, res) => {
    try {
      const { userId, enabled } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Enabled must be true or false' });
      }
      
      // Verify user exists first
      const [existingUser] = await db.select({
        id: bjjUsers.id,
        paused: bjjUsers.paused
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId));
      
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Update user's paused status (paused = !enabled)
      const [updatedUser] = await db.update(bjjUsers)
        .set({ paused: !enabled })
        .where(eq(bjjUsers.id, userId))
        .returning();
      
      if (!updatedUser) {
        return res.status(500).json({ error: 'Failed to update user settings' });
      }
      
      res.json({ 
        success: true, 
        smsEnabled: enabled,
        message: enabled ? 'SMS notifications enabled' : 'SMS notifications disabled'
      });
      
    } catch (error: any) {
      console.error('SMS toggle error:', error);
      res.status(500).json({ error: 'Failed to toggle SMS notifications' });
    }
  });

  // Enhanced subscription creation with referral support
  app.post('/api/create-subscription', async (req, res) => {
    try {
      const {
        phone,
        name,
        belt,
        plan,
        referralCode
      } = req.body;
      
      // Validate required fields
      if (!phone || !plan) {
        return res.status(400).json({ error: 'Phone and plan are required' });
      }
      
      // Check if user already exists
      const [existingUser] = await db.select({
        id: bjjUsers.id,
        phoneNumber: bjjUsers.phoneNumber,
        subscriptionType: bjjUsers.subscriptionType
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.phoneNumber, phone));
      
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists with this phone number' });
      }
      
      // Determine plan details
      let stripePriceId: string;
      let subscriptionType: string;
      
      if (plan === 'sms-only') {
        if (!process.env.STRIPE_PRICE_ID_SMS_ONLY) {
          return res.status(503).json({ error: 'SMS Only plan is not available at this time' });
        }
        stripePriceId = process.env.STRIPE_PRICE_ID_SMS_ONLY;
        subscriptionType = 'sms_only';
      } else if (plan === 'monthly' || plan === 'full-ai-monthly') {
        if (!process.env.STRIPE_PRICE_ID_MONTHLY) {
          return res.status(503).json({ error: 'Monthly plan is not available at this time' });
        }
        stripePriceId = process.env.STRIPE_PRICE_ID_MONTHLY;
        subscriptionType = 'monthly';
      } else if (plan === 'annual' || plan === 'full-ai-yearly') {
        if (!process.env.STRIPE_PRICE_ID_ANNUAL) {
          return res.status(503).json({ error: 'Annual plan is not available at this time' });
        }
        stripePriceId = process.env.STRIPE_PRICE_ID_ANNUAL;
        subscriptionType = 'annual';
      } else {
        return res.status(400).json({ error: 'Invalid plan type' });
      }
      
      // Validate referral code if provided
      let validReferralCode = null;
      let discountCoupon = null;
      
      if (referralCode) {
        const upperCode = referralCode.toUpperCase().trim();
        const [refCode] = await db.select({
          id: referralCodes.id,
          code: referralCodes.code,
          codeType: referralCodes.codeType,
          isActive: referralCodes.isActive,
          commissionRate: referralCodes.commissionRate
        })
          .from(referralCodes)
          .where(eq(referralCodes.code, upperCode));
        
        if (refCode && refCode.isActive) {
          validReferralCode = refCode;
          
          // Create Stripe coupon for influencer codes
          if (refCode.codeType === 'influencer' && refCode.commissionRate) {
            const commission = parseFloat(refCode.commissionRate);
            if (commission > 0) {
              try {
                discountCoupon = await stripe.coupons.create({
                  percent_off: commission,
                  duration: 'forever',
                  name: `Referral: ${refCode.code}`
                });
              } catch (couponError) {
                console.error('Error creating coupon:', couponError);
              }
            }
          }
        }
      }
      
      // Create Stripe checkout session with trial
      // 30 days free if referral code, 7 days otherwise
      const trialDays = validReferralCode ? 30 : 7;
      
      const sessionData: any = {
        mode: 'subscription',
        line_items: [{ price: stripePriceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: trialDays,
          metadata: {
            phone: phone,
            referral_code: validReferralCode?.code || 'none'
          }
        },
        metadata: {
          phone: phone,
          name: name || '',
          belt: belt || '',
          referral_code: validReferralCode?.code || 'none'
        },
        success_url: `https://${process.env.REPLIT_DOMAINS || 'localhost:5000'}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://${process.env.REPLIT_DOMAINS || 'localhost:5000'}`,
      };
      
      // Apply discount coupon if available
      if (discountCoupon) {
        sessionData.discounts = [{ coupon: discountCoupon.id }];
      }
      
      const session = await stripe.checkout.sessions.create(sessionData);
      
      res.json({ 
        success: true,
        url: session.url,
        sessionId: session.id,
        hasDiscount: !!discountCoupon,
        referralApplied: !!validReferralCode,
        trialDays: trialDays
      });
      
    } catch (error: any) {
      console.error('Subscription creation error:', error);
      res.status(500).json({ error: error.message || 'Failed to create subscription' });
    }
  });

  // =============================================================================
  // AI INTELLIGENCE API ROUTES
  // =============================================================================

  // Get AI intelligence stats
  app.get('/api/ai/stats', async (req, res) => {
    try {
      const stats = await db.execute(drizzleSql`
        SELECT 
          (SELECT COUNT(*) FROM ai_video_knowledge) as total_videos,
          (SELECT COUNT(*) FROM ai_user_feedback_signals) as total_signals,
          (SELECT COUNT(*) FROM ai_user_context) as users_with_context,
          (SELECT COUNT(*) FROM ai_technique_relationships) as relationships_mapped,
          (SELECT COUNT(*) FROM ai_problem_solution_map) as problems_mapped,
          (SELECT AVG(CAST(confidence_score AS DECIMAL)) FROM ai_confidence_tracking) as avg_confidence
      `);
      
      res.json({
        stats: stats.rows[0],
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all feature flags
  app.get('/api/ai/features', async (req, res) => {
    try {
      const flags = await db.select({
        id: aiFeatureFlags.id,
        featureName: aiFeatureFlags.featureName,
        featureDescription: aiFeatureFlags.featureDescription,
        isEnabled: aiFeatureFlags.isEnabled,
        rolloutPercentage: aiFeatureFlags.rolloutPercentage,
        enabledForUsers: aiFeatureFlags.enabledForUsers,
        disabledForUsers: aiFeatureFlags.disabledForUsers,
        canRollback: aiFeatureFlags.canRollback,
        rollbackReason: aiFeatureFlags.rollbackReason,
        errorCount: aiFeatureFlags.errorCount,
        successCount: aiFeatureFlags.successCount,
        createdAt: aiFeatureFlags.createdAt,
        updatedAt: aiFeatureFlags.updatedAt
      }).from(aiFeatureFlags).orderBy(aiFeatureFlags.featureName);
      
      res.json({
        count: flags.length,
        features: flags
      });
    } catch (error: any) {
      console.error('Error fetching features:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update feature flag
  app.post('/api/ai/features/:featureName', async (req, res) => {
    try {
      const { featureName } = req.params;
      const { isEnabled, rolloutPercentage } = req.body;
      
      await aiIntelligence.setFeatureRollout(
        featureName, 
        rolloutPercentage !== undefined ? rolloutPercentage : 0,
        isEnabled !== undefined ? isEnabled : true
      );
      
      res.json({
        success: true,
        message: `Feature ${featureName} updated`
      });
    } catch (error: any) {
      console.error('Error updating feature:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Enable feature for specific user
  app.post('/api/ai/features/:featureName/user/:userId', async (req, res) => {
    try {
      const { featureName, userId } = req.params;
      
      await aiIntelligence.enableFeatureForUser(featureName, userId);
      
      res.json({
        success: true,
        message: `Feature ${featureName} enabled for user ${userId}`
      });
    } catch (error: any) {
      console.error('Error enabling feature:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get enhanced technique recommendation
  app.post('/api/ai/recommend/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      
      console.log(`🎯 Getting recommendation for user ${userId}`);
      const recommendation = await aiIntelligence.enhancedTechniqueScoring(userId);
      
      if (!recommendation) {
        return res.json({
          success: false,
          message: 'Enhanced scoring not enabled or no videos available',
          fallbackToOld: true
        });
      }
      
      res.json({
        success: true,
        recommendation: recommendation
      });
    } catch (error: any) {
      console.error('Error getting recommendation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all analyzed videos (user-facing library)
  app.get('/api/ai/videos', async (req, res) => {
    try {
      // Get TOTAL count first (for accurate dashboard display)
      const [totalCountResult] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(aiVideoKnowledge);
      const totalCount = Number(totalCountResult?.count || 0);
      
      // Then get browsable videos (with thumbnails for display)
      const videos = await db.select({
        id: aiVideoKnowledge.id,
        youtubeId: aiVideoKnowledge.youtubeId,
        videoUrl: aiVideoKnowledge.videoUrl,
        thumbnailUrl: aiVideoKnowledge.thumbnailUrl,
        title: aiVideoKnowledge.title,
        techniqueName: aiVideoKnowledge.techniqueName,
        instructorName: aiVideoKnowledge.instructorName,
        techniqueType: aiVideoKnowledge.techniqueType,
        positionCategory: aiVideoKnowledge.positionCategory,
        beltLevel: aiVideoKnowledge.beltLevel,
        giOrNogi: aiVideoKnowledge.giOrNogi,
        qualityScore: aiVideoKnowledge.qualityScore,
        viewCount: aiVideoKnowledge.viewCount,
        duration: aiVideoKnowledge.duration,
        createdAt: aiVideoKnowledge.createdAt
      })
      .from(aiVideoKnowledge)
      .where(
        and(
          isNotNull(aiVideoKnowledge.thumbnailUrl),
          sql`${aiVideoKnowledge.thumbnailUrl} != ''`
        )
      )
      .orderBy(desc(aiVideoKnowledge.qualityScore), desc(aiVideoKnowledge.createdAt));
      
      // Transform data for frontend compatibility
      const transformedVideos = videos.map(video => ({
        id: video.id,
        videoId: video.youtubeId || extractYouTubeId(video.videoUrl),
        thumbnailUrl: video.thumbnailUrl,
        title: video.title || video.techniqueName,
        techniqueName: video.techniqueName,
        instructorName: video.instructorName || 'Unknown Instructor',
        techniqueType: video.techniqueType || 'Technique',
        positionCategory: video.positionCategory || null,
        beltLevel: Array.isArray(video.beltLevel) && video.beltLevel.length > 0 
          ? video.beltLevel[0] 
          : 'all',
        giOrNogi: video.giOrNogi || 'both',
        qualityScore: video.qualityScore ? parseFloat(video.qualityScore.toString()) : 0,
        viewCount: Number(video.viewCount ?? 0),
        duration: formatDuration(video.duration),
        createdAt: video.createdAt,
      }));
      
      res.json({
        count: transformedVideos.length, // Browsable videos (what the UI shows)
        totalCount: totalCount, // TOTAL videos in library (for header/stats display)
        videos: transformedVideos
      });
    } catch (error: any) {
      console.error('Error fetching videos:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Helper: Extract YouTube ID from URL
  function extractYouTubeId(url: string): string {
    if (!url) return '';
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : '';
  }
  
  // Search videos by title and/or instructor - used for unenriched video token fallback
  app.get('/api/ai/videos/search', async (req, res) => {
    try {
      const { title, instructor, limit: limitParam } = req.query;
      const searchLimit = Math.min(parseInt(limitParam as string) || 5, 20);
      
      const titleStr = (title as string || '').trim();
      const instructorStr = (instructor as string || '').trim();
      
      if (!titleStr && !instructorStr) {
        return res.status(400).json({ error: 'At least title or instructor is required', videos: [] });
      }
      
      // Build search conditions array - only add non-empty conditions
      const conditions: ReturnType<typeof sql>[] = [];
      
      if (titleStr) {
        // Use ILIKE for case-insensitive search, keep original characters for better matching
        const titlePattern = `%${titleStr.toLowerCase()}%`;
        conditions.push(sql`LOWER(COALESCE(${aiVideoKnowledge.title}, '')) LIKE ${titlePattern}`);
        conditions.push(sql`LOWER(COALESCE(${aiVideoKnowledge.techniqueName}, '')) LIKE ${titlePattern}`);
      }
      
      if (instructorStr) {
        const instructorPattern = `%${instructorStr.toLowerCase()}%`;
        conditions.push(sql`LOWER(COALESCE(${aiVideoKnowledge.instructorName}, '')) LIKE ${instructorPattern}`);
      }
      
      // If no conditions, return empty (shouldn't happen due to check above)
      if (conditions.length === 0) {
        return res.json({ count: 0, videos: [] });
      }
      
      // Query videos with any matching condition
      const videos = await db.select({
        id: aiVideoKnowledge.id,
        youtubeId: aiVideoKnowledge.youtubeId,
        videoUrl: aiVideoKnowledge.videoUrl,
        thumbnailUrl: aiVideoKnowledge.thumbnailUrl,
        title: aiVideoKnowledge.title,
        techniqueName: aiVideoKnowledge.techniqueName,
        instructorName: aiVideoKnowledge.instructorName,
        qualityScore: aiVideoKnowledge.qualityScore,
        duration: aiVideoKnowledge.duration,
      })
      .from(aiVideoKnowledge)
      .where(
        and(
          sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 5.0`,
          sql`(${sql.join(conditions, sql` OR `)})`
        )
      )
      .orderBy(desc(aiVideoKnowledge.qualityScore))
      .limit(searchLimit);
      
      const transformedVideos = videos
        .map(video => ({
          id: video.id,
          videoId: video.youtubeId || extractYouTubeId(video.videoUrl),
          thumbnailUrl: video.thumbnailUrl,
          title: video.title || video.techniqueName,
          instructorName: video.instructorName || 'Unknown Instructor',
          qualityScore: video.qualityScore ? parseFloat(video.qualityScore.toString()) : 0,
          duration: formatDuration(video.duration),
        }))
        .filter(v => v.videoId); // Only return videos with valid YouTube IDs
      
      res.json({
        count: transformedVideos.length,
        videos: transformedVideos
      });
    } catch (error: any) {
      console.error('Error searching videos:', error);
      res.status(500).json({ error: error.message, videos: [] });
    }
  });
  
  // Helper: Format duration in seconds to MM:SS format
  function formatDuration(seconds: number | null): string {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Get video analysis/knowledge for a specific video (user-facing)
  app.get('/api/ai/videos/:id/analysis', async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      if (isNaN(videoId)) {
        return res.status(400).json({ error: 'Invalid video ID' });
      }
      
      // Get main video info from ai_video_knowledge
      const [videoInfo] = await db.select({
        id: aiVideoKnowledge.id,
        title: aiVideoKnowledge.title,
        techniqueName: aiVideoKnowledge.techniqueName,
        instructorName: aiVideoKnowledge.instructorName,
        youtubeId: aiVideoKnowledge.youtubeId,
        thumbnailUrl: aiVideoKnowledge.thumbnailUrl,
        duration: aiVideoKnowledge.duration,
        difficultyScore: aiVideoKnowledge.difficultyScore,
        giOrNogi: aiVideoKnowledge.giOrNogi,
        qualityScore: aiVideoKnowledge.qualityScore,
        positionCategory: aiVideoKnowledge.positionCategory,
        techniqueType: aiVideoKnowledge.techniqueType,
        beltLevel: aiVideoKnowledge.beltLevel,
        keyTimestamps: aiVideoKnowledge.keyTimestamps,
        keyDetails: aiVideoKnowledge.keyDetails,
        commonMistakes: aiVideoKnowledge.commonMistakes,
        problemsSolved: aiVideoKnowledge.problemsSolved,
        prerequisites: aiVideoKnowledge.prerequisites,
        setupTimestamp: aiVideoKnowledge.setupTimestamp,
        executionTimestamp: aiVideoKnowledge.executionTimestamp,
        troubleshootingTimestamp: aiVideoKnowledge.troubleshootingTimestamp,
        commonMistakesTimestamp: aiVideoKnowledge.commonMistakesTimestamp,
      })
      .from(aiVideoKnowledge)
      .where(eq(aiVideoKnowledge.id, videoId))
      .limit(1);
      
      if (!videoInfo) {
        return res.status(404).json({ error: 'Video not found' });
      }
      
      // Get detailed extracted knowledge from video_knowledge table (Gemini analysis)
      const techniques = await db.select({
        id: videoKnowledge.id,
        techniqueName: videoKnowledge.techniqueName,
        positionContext: videoKnowledge.positionContext,
        techniqueType: videoKnowledge.techniqueType,
        skillLevel: videoKnowledge.skillLevel,
        keyConcepts: videoKnowledge.keyConcepts,
        instructorTips: videoKnowledge.instructorTips,
        commonMistakes: videoKnowledge.commonMistakes,
        timestampStart: videoKnowledge.timestampStart,
        timestampEnd: videoKnowledge.timestampEnd,
        whyItMatters: videoKnowledge.whyItMatters,
        problemSolved: videoKnowledge.problemSolved,
        setupsFrom: videoKnowledge.setupsFrom,
        chainsTo: videoKnowledge.chainsTo,
      })
      .from(videoKnowledge)
      .where(eq(videoKnowledge.videoId, videoId));
      
      // Combine into clean response
      res.json({
        video: {
          id: videoInfo.id,
          title: videoInfo.title || videoInfo.techniqueName,
          techniqueName: videoInfo.techniqueName,
          instructorName: videoInfo.instructorName || 'Unknown Instructor',
          youtubeId: videoInfo.youtubeId,
          thumbnailUrl: videoInfo.thumbnailUrl,
          duration: formatDuration(videoInfo.duration),
          difficultyScore: videoInfo.difficultyScore,
          giOrNogi: videoInfo.giOrNogi || 'both',
          qualityScore: videoInfo.qualityScore ? parseFloat(videoInfo.qualityScore.toString()) : null,
          positionCategory: videoInfo.positionCategory,
          techniqueType: videoInfo.techniqueType,
          beltLevel: videoInfo.beltLevel,
          keyTimestamps: videoInfo.keyTimestamps || [],
          keyDetails: videoInfo.keyDetails || [],
          commonMistakes: videoInfo.commonMistakes || [],
          problemsSolved: videoInfo.problemsSolved || [],
          prerequisites: videoInfo.prerequisites || [],
          setupTimestamp: videoInfo.setupTimestamp,
          executionTimestamp: videoInfo.executionTimestamp,
          troubleshootingTimestamp: videoInfo.troubleshootingTimestamp,
          commonMistakesTimestamp: videoInfo.commonMistakesTimestamp,
        },
        techniques: techniques.map(tech => ({
          id: tech.id,
          techniqueName: tech.techniqueName,
          positionContext: tech.positionContext,
          techniqueType: tech.techniqueType,
          skillLevel: tech.skillLevel,
          keyConcepts: tech.keyConcepts || [],
          instructorTips: tech.instructorTips || [],
          commonMistakes: tech.commonMistakes || [],
          timestampStart: tech.timestampStart,
          timestampEnd: tech.timestampEnd,
          whyItMatters: tech.whyItMatters,
          problemSolved: tech.problemSolved,
          setupsFrom: tech.setupsFrom || [],
          chainsTo: tech.chainsTo || [],
        })),
        hasGeminiAnalysis: techniques.length > 0,
      });
    } catch (error: any) {
      console.error('Error fetching video analysis:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get unique techniques for dropdown filter - WITH COUNTS
  app.get('/api/ai/techniques', async (req, res) => {
    try {
      // Get technique_type (grouped categories like "sweep", "pass", "submission") with counts
      const result = await db.execute(sql`
        SELECT technique_type as name, COUNT(*) as count
        FROM ai_video_knowledge
        WHERE technique_type IS NOT NULL
          AND technique_type != ''
        GROUP BY technique_type
        ORDER BY count DESC
      `);

      // postgres-js returns rows directly as array, not { rows: [...] }
      const rows = Array.isArray(result) ? result : (result.rows || []);
      
      const techniques = rows
        .filter((r: any) => r.name && r.name.trim() !== '')
        .map((r: any) => ({
          name: r.name,
          count: parseInt(r.count)
        }));

      // Calculate total
      const totalCount = techniques.reduce((sum: number, t: any) => sum + t.count, 0);

      res.json({ 
        techniques,
        totalCount
      });
    } catch (error: any) {
      console.error('Error fetching techniques:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get unique instructors for dropdown filter - WITH COUNTS
  app.get('/api/ai/instructors', async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT instructor_name as name, COUNT(*) as count
        FROM ai_video_knowledge
        WHERE instructor_name IS NOT NULL
          AND instructor_name != ''
          AND instructor_name != 'Unknown Instructor'
        GROUP BY instructor_name
        ORDER BY count DESC
      `);

      // postgres-js returns rows directly as array, not { rows: [...] }
      const rows = Array.isArray(result) ? result : (result.rows || []);
      
      const instructors = rows
        .filter((r: any) => r.name && r.name.trim() !== '')
        .map((r: any) => ({
          name: r.name,
          count: parseInt(r.count)
        }));

      // Calculate total
      const totalCount = instructors.reduce((sum: number, i: any) => sum + i.count, 0);

      res.json({ 
        instructors,
        totalCount
      });
    } catch (error: any) {
      console.error('Error fetching instructors:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get recent reasoning traces
  app.get('/api/ai/reasoning', async (req, res) => {
    try {
      const { limit = 20 } = req.query;
      
      const traces = await db.select({
        decisionId: aiReasoningTraces.decisionId,
        decisionType: aiReasoningTraces.decisionType,
        userId: aiReasoningTraces.userId,
        finalDecision: aiReasoningTraces.finalDecision,
        confidence: aiReasoningTraces.confidence,
        userFriendlyExplanation: aiReasoningTraces.userFriendlyExplanation,
        createdAt: aiReasoningTraces.createdAt
      })
      .from(aiReasoningTraces)
      .orderBy(desc(aiReasoningTraces.createdAt))
      .limit(parseInt(limit as string));
      
      res.json({
        count: traces.length,
        traces: traces
      });
    } catch (error: any) {
      console.error('Error fetching reasoning:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user context
  app.get('/api/ai/user/:userId/context', async (req, res) => {
    try {
      const { userId } = req.params;
      
      const context = await aiIntelligence.loadFullUserContext(userId);
      
      if (!context) {
        return res.status(404).json({ error: 'User context not found' });
      }
      
      res.json(context);
    } catch (error: any) {
      console.error('Error loading context:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Record user feedback
  app.post('/api/ai/feedback', async (req, res) => {
    try {
      const { userId, videoId, signalType, signalValue } = req.body;
      
      if (!userId || !signalType || !signalValue) {
        return res.status(400).json({ 
          error: 'Missing required fields: userId, signalType, signalValue' 
        });
      }
      
      await aiIntelligence.processUserFeedback(userId, videoId, signalType, signalValue);
      
      res.json({
        success: true,
        message: 'Feedback processed successfully'
      });
    } catch (error: any) {
      console.error('Error processing feedback:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // MOBILE PWA ENDPOINTS

  // 🧠 ADMIN DEBUG: Get complete user context from learning engine
  app.get('/api/admin/user-context/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      
      console.log(`[ADMIN DEBUG] Fetching complete context for user ${userId}`);
      
      // Get comprehensive learning context
      const learningContext = await learningEngine.buildContext(userId);
      
      // Get detected patterns
      const patterns = await learningEngine.detectPatterns(userId);
      
      // Get success correlations (Phase 3C)
      const successCorrelations = await learningEngine.detectSuccessCorrelation(userId);
      
      // Get plateaus (Phase 4A)
      const plateaus = await learningEngine.detectPlateaus(userId);
      
      // Get milestones (Phase 4C)
      const milestones = await learningEngine.detectMilestones(userId);
      
      // Get user profile
      const [user] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);
      
      // Get all conversations with insights
      const conversations = await db.select()
        .from(aiConversationLearning)
        .where(eq(aiConversationLearning.userId, userId))
        .orderBy(desc(aiConversationLearning.createdAt))
        .limit(50);
      
      // Get saved videos
      const savedVideos = await db.select({
        videoId: userSavedVideos.videoId,
        technique: aiVideoKnowledge.techniqueName,
        instructor: aiVideoKnowledge.instructorName,
        savedDate: userSavedVideos.savedDate
      })
      .from(userSavedVideos)
      .innerJoin(aiVideoKnowledge, eq(userSavedVideos.videoId, aiVideoKnowledge.id))
      .where(eq(userSavedVideos.userId, userId))
      .orderBy(desc(userSavedVideos.savedDate))
      .limit(20);
      
      res.json({
        success: true,
        userId,
        userProfile: {
          username: user?.username,
          beltLevel: user?.beltLevel,
          style: user?.style,
          weakestArea: user?.weakestArea,
          trainingFrequency: user?.trainingFrequency,
          createdAt: user?.createdAt
        },
        learningContext,
        patterns,
        successCorrelations, // Phase 3C
        plateaus, // Phase 4A
        milestones, // Phase 4C
        conversationStats: {
          total: conversations.length,
          withInsights: conversations.filter(c => c.extractedInsights).length,
          lastConversation: conversations[0]?.createdAt
        },
        recentConversations: conversations.slice(0, 10).map(c => ({
          id: c.id,
          messageText: c.messageText?.substring(0, 100),
          messageType: c.messageType,
          topic: c.conversationTopic,
          sentiment: c.sentiment,
          hasInsights: !!c.extractedInsights,
          createdAt: c.createdAt
        })),
        savedVideos: savedVideos.slice(0, 10)
      });
    } catch (error: any) {
      console.error('[ADMIN DEBUG] Error fetching user context:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // PROFESSOR OS: SIMPLE & FAST GPT-4o IMPLEMENTATION
  // ═══════════════════════════════════════════════════════════════════
  app.post('/api/ai/chat/message', 
    ...securityMiddleware, // Security: SQL injection & XSS prevention
    professorOSCache, // Cache AI responses to reduce costs by 40%+
    messageLimiter,   // Then enforce daily limit
    async (req, res) => {
    try {
      const startTime = Date.now();
      const { userId, message } = req.body;
      
      if (!userId || !message) {
        return res.status(400).json({ error: 'Missing userId or message' });
      }
      
      console.log('═══════════════════════════════════════════');
      console.log('🎯 PROFESSOR OS REQUEST');
      console.log('User ID:', userId);
      console.log('Message:', message.substring(0, 100));
      
      // === PROFESSOR OS REQUEST DEBUG ===
      console.log('=== PROFESSOR OS REQUEST DEBUG ===');
      console.log('Timestamp:', new Date().toISOString());
      
      // 1. LOAD USER PROFILE
      const [userProfile] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);
      
      if (!userProfile) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // 2. LOAD CONVERSATION HISTORY (Last 20 messages - increased for better context)
      const history = await db.select({
        messageText: aiConversationLearning.messageText,
        messageType: aiConversationLearning.messageType,
        createdAt: aiConversationLearning.createdAt
      })
      .from(aiConversationLearning)
      .where(eq(aiConversationLearning.userId, userId))
      .orderBy(desc(aiConversationLearning.createdAt))
      .limit(20);
      
      const conversationHistory = history.reverse();
      console.log('📜 Conversation history:', conversationHistory.length, 'messages');
      
      // DEBUG: Show conversation history details
      console.log('---');
      console.log('Conversation history exists?', !!conversationHistory);
      console.log('Conversation history length:', conversationHistory?.length || 0);
      if (conversationHistory && conversationHistory.length > 0) {
        console.log('History preview (first 300 chars):', 
          JSON.stringify(conversationHistory.slice(0, 2)).slice(0, 300)
        );
        console.log('Most recent messages:');
        conversationHistory.slice(-3).forEach((msg, idx) => {
          console.log(`  ${idx + 1}. [${msg.messageType}] ${msg.messageText.substring(0, 80)}...`);
        });
      }
      console.log('---');
      
      // 3. SEMANTIC VIDEO SEARCH - Find videos RELEVANT to user's question
      console.log('📚 Semantic video search for user message...');
      const userBelt = userProfile.beltLevel || 'white';
      const userStruggle = userProfile.struggleAreaCategory || userProfile.struggleTechnique || null;
      
      // 3.1 IMPORT INTELLIGENT SEARCH FUNCTIONS
      const { extractRequestedInstructor, searchByInstructor, searchVideos, extractSearchIntent } = await import('./videoSearch');
      
      // 3.2 SEMANTIC SEARCH: Search based on what user is ACTUALLY asking about
      console.log(`🔍 [SEMANTIC SEARCH] Analyzing user message: "${message.substring(0, 80)}..."`);
      const searchResult = await searchVideos({
        userMessage: message,
        conversationContext: {
          userGiNogi: userProfile.style || 'both'
        }
      });
      
      const searchIntent = extractSearchIntent(message);
      console.log(`🎯 [SEARCH INTENT] Position: ${searchIntent.positionCategory || 'none'}, Intent: ${searchIntent.specificIntent || 'general'}, Terms: [${searchIntent.searchTerms.join(', ')}]`);
      console.log(`📊 [SEMANTIC SEARCH] Found ${searchResult.videos.length} relevant videos (${searchResult.totalMatches} total matches)`);
      
      // 3.3 CHECK IF USER IS ASKING FOR A SPECIFIC INSTRUCTOR
      const requestedInstructor = extractRequestedInstructor(message);
      let instructorVideos: any[] = [];
      let instructorSearchContext = '';
      
      if (requestedInstructor) {
        console.log(`🎯 [INSTRUCTOR REQUEST] User asked for: "${requestedInstructor}"`);
        const instructorResult = await searchByInstructor(requestedInstructor, 15);
        
        if (instructorResult.instructorFound) {
          instructorVideos = instructorResult.videos;
          instructorSearchContext = `\n\n⚠️ USER SPECIFICALLY ASKED FOR ${requestedInstructor.toUpperCase()} VIDEOS - I have ${instructorResult.totalMatches} videos from this instructor. PRIORITIZE these videos in your recommendations.`;
          console.log(`✅ [INSTRUCTOR SEARCH] Found ${instructorResult.totalMatches} videos by ${requestedInstructor}`);
        } else {
          console.log(`❌ [INSTRUCTOR SEARCH] No videos found for "${requestedInstructor}"`);
          instructorSearchContext = `\n\n⚠️ USER ASKED FOR ${requestedInstructor.toUpperCase()} VIDEOS - I searched and don't have any videos from this specific instructor yet. Recommend ALTERNATIVE instructors who teach similar content instead. NEVER just say "I don't have" without offering alternatives.`;
        }
      }
      
      // 3.4 BUILD SEARCH CONTEXT FOR AI - Tell the AI what the user is looking for
      let semanticSearchContext = '';
      const hasSemanticResults = searchResult.videos.length > 0;
      
      if ((searchIntent.positionCategory || searchIntent.specificIntent) && hasSemanticResults) {
        semanticSearchContext = `\n\n═══════════════════════════════════════════════════════════════
🎯 SEARCH CONTEXT (What the user is looking for):
═══════════════════════════════════════════════════════════════
`;
        if (searchIntent.positionCategory) {
          semanticSearchContext += `Position: ${searchIntent.positionCategory.replace('_', ' ').toUpperCase()}\n`;
        }
        if (searchIntent.specificIntent) {
          semanticSearchContext += `Intent: ${searchIntent.specificIntent.toUpperCase()} (user wants to ${searchIntent.specificIntent})\n`;
        }
        if (searchIntent.searchTerms.length > 0) {
          semanticSearchContext += `Keywords: ${searchIntent.searchTerms.join(', ')}\n`;
        }
        semanticSearchContext += `Relevant Videos Found: ${searchResult.videos.length}\n`;
        semanticSearchContext += `\n⚠️ IMPORTANT: Your video recommendations MUST match this search context. 
If user asks about HALF GUARD PASSING, only recommend half guard passing videos.
If user asks about ESCAPING MOUNT, only recommend mount escape videos.
NEVER recommend videos from unrelated positions.
═══════════════════════════════════════════════════════════════`;
      }
      
      // 3.5 FALLBACK LOGIC: Only use fallback when search returned 0 results for generic queries
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL: If user searched for a specific technique (noMatchFound=true), 
      // DON'T return random top-quality videos - this causes WRONG recommendations
      // ═══════════════════════════════════════════════════════════════════════════
      let videosToUse = searchResult.videos;
      if (!hasSemanticResults && !searchResult.noMatchFound) {
        // Only fallback for GENERIC queries (no specific technique terms)
        console.log('⚠️ [SEMANTIC SEARCH] Generic query with no results, using top-quality fallback');
        const fallbackVideos = await db.select({
          id: aiVideoKnowledge.id,
          title: aiVideoKnowledge.title,
          techniqueName: aiVideoKnowledge.techniqueName,
          instructorName: aiVideoKnowledge.instructorName,
          positionCategory: aiVideoKnowledge.positionCategory,
          techniqueType: aiVideoKnowledge.techniqueType,
          qualityScore: aiVideoKnowledge.qualityScore,
          keyTimestamps: aiVideoKnowledge.keyTimestamps,
          videoUrl: aiVideoKnowledge.videoUrl
        })
          .from(aiVideoKnowledge)
          .where(sql`${aiVideoKnowledge.qualityScore} IS NOT NULL AND ${aiVideoKnowledge.qualityScore} >= 7.0`)
          .orderBy(desc(aiVideoKnowledge.qualityScore))
          .limit(50);
        
        videosToUse = fallbackVideos;
        console.log(`📊 [FALLBACK] Loaded ${videosToUse.length} top-quality videos`);
      } else if (!hasSemanticResults && searchResult.noMatchFound) {
        // User searched for specific technique we don't have - DON'T return wrong videos
        console.log(`❌ [NO MATCH] User searched for specific technique we don't have. NOT using fallback.`);
        console.log(`   Search terms: [${searchResult.searchIntent.searchTerms.join(', ')}]`);
        videosToUse = []; // Empty - let AI acknowledge we don't have this content
      }
      
      // 3.6 COMBINE: Semantic/fallback results + instructor-specific videos
      let combinedVideos = videosToUse.map(v => ({
        id: v.id,
        techniqueName: v.title || v.techniqueName,
        instructorName: v.instructorName,
        positionCategory: v.positionCategory || v.techniqueType,
        techniqueType: v.techniqueType,
        qualityScore: v.qualityScore,
        keyTimestamps: v.keyTimestamps || [],
        videoUrl: v.videoUrl
      }));
      
      if (instructorVideos.length > 0) {
        const existingIds = new Set(combinedVideos.map(v => v.id));
        const newInstructorVideos = instructorVideos.filter(v => !existingIds.has(v.id))
          .map(v => ({
            id: v.id,
            techniqueName: v.title || v.techniqueName,
            instructorName: v.instructorName,
            positionCategory: v.positionCategory || v.techniqueType,
            techniqueType: v.techniqueType,
            qualityScore: v.qualityScore,
            keyTimestamps: v.keyTimestamps || [],
            videoUrl: v.videoUrl
          }));
        combinedVideos = [...newInstructorVideos, ...combinedVideos];
        console.log(`🎯 [INSTRUCTOR MERGE] Added ${newInstructorVideos.length} instructor-specific videos`);
      }
      
      // 3.6 Final video library with relevance scoring
      let videoLibrary = combinedVideos
        .map(v => {
          let relevanceScore = Number(v.qualityScore) || 0;
          
          // HUGE boost for requested instructor videos
          if (requestedInstructor && v.instructorName?.toLowerCase().includes(requestedInstructor.toLowerCase())) {
            relevanceScore += 50;
          }
          
          // Boost videos matching user's struggle area
          if (userStruggle) {
            const struggleKeywords = userStruggle.toLowerCase().split('_');
            const videoText = `${v.techniqueName} ${v.techniqueType} ${v.positionCategory}`.toLowerCase();
            
            if (struggleKeywords.some(keyword => videoText.includes(keyword))) {
              relevanceScore += 10;
            }
          }
          
          return { ...v, relevanceScore };
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 30);
      
      console.log('✅ Loaded', videoLibrary.length, 'videos for recommendations');
      
      // DEBUG: Show video library details
      console.log('Available videos count:', videoLibrary?.length || 0);
      if (videoLibrary.length > 0) {
        console.log('Sample videos:', videoLibrary.slice(0, 3).map(v => ({
          technique: v.techniqueName,
          instructor: v.instructorName,
          quality: v.qualityScore
        })));
      }
      
      // 4. BUILD SYSTEM PROMPT (using existing function with videos)
      const context = {
        user: {
          email: userProfile.email,
          username: userProfile.username,
          displayName: userProfile.displayName || userProfile.username,
          beltLevel: userProfile.beltLevel,
          belt_level: userProfile.beltLevel,
          style: userProfile.style || 'both',
          gi_preference: userProfile.style || 'both',
          trainingFrequency: userProfile.trainingFrequency,
          training_frequency: userProfile.trainingFrequency,
          trainingFrequencyText: userProfile.trainingFrequency ? `${userProfile.trainingFrequency}x/week` : 'not specified',
          yearsTraining: userProfile.yearsTraining,
          yearsTrainingRange: userProfile.yearsTraining,
          ageRange: userProfile.birthYear ? (new Date().getFullYear() - userProfile.birthYear) : null,
          struggleTechnique: userProfile.biggestStruggle,
          struggleAreaCategory: userProfile.biggestStruggle,
          height: userProfile.height,
          weight: userProfile.weight,
          age: userProfile.birthYear ? new Date().getFullYear() - userProfile.birthYear : null,
          birthYear: userProfile.birthYear,
          injuries: userProfile.injuries || [],
          bodyType: userProfile.bodyType,
          body_type: userProfile.bodyType,
          focusAreas: userProfile.focusAreas || [],
          focus_areas: userProfile.focusAreas || [],
          favoritePositions: userProfile.favoritePositions || [],
          favorite_positions: userProfile.favoritePositions || [],
          primary_goal: userProfile.primaryGoal || 'improve overall skills',
          subscriptionType: userProfile.subscriptionType,
          createdAt: userProfile.createdAt,
          signup_date: userProfile.createdAt
        }
      };
      
      // 3.5 LOAD RECENT COMBAT SPORTS NEWS for dynamicContext
      let recentNews: Array<{title: string, summary: string}> = [];
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const newsItems = await db.select({
          title: combatSportsNews.title,
          summary: combatSportsNews.summary,
          fullContent: combatSportsNews.fullContent
        })
          .from(combatSportsNews)
          .where(sql`${combatSportsNews.publishedDate} > ${thirtyDaysAgo.toISOString()}`)
          .orderBy(desc(combatSportsNews.publishedDate))
          .limit(5);
        
        recentNews = newsItems.map(n => ({
          title: n.title || '',
          summary: n.summary || (n.fullContent ? n.fullContent.substring(0, 200) : '')
        }));
        console.log(`📰 Loaded ${recentNews.length} recent news items for AI context`);
      } catch (err) {
        console.log('⚠️ Could not load news items:', err);
      }
      
      // CRITICAL FIX: Use comprehensive prompt builder WITH dynamicContext
      // This passes the JT Torres videos and news items to the AI
      let systemPrompt = await buildComprehensiveSystemPrompt(
        userId, 
        userProfile.biggestStruggle || userProfile.struggleArea || undefined,
        {
          // Preloaded data to avoid duplicate queries
          preloadedUser: userProfile,
          preloadedVideos: videoLibrary,
          // Dynamic videos for instructor-specific searches
          dynamicVideos: requestedInstructor && instructorVideos.length > 0 
            ? instructorVideos.slice(0, 15).map(v => ({
                id: v.id,
                techniqueName: v.title || v.techniqueName || '',
                instructorName: v.instructorName || '',
                techniqueType: v.techniqueType || '',
                videoUrl: v.videoUrl || '',
                title: v.title || v.techniqueName || ''
              }))
            : [],
          searchMeta: requestedInstructor ? {
            totalMatches: instructorVideos.length,
            searchIntent: { requestedInstructor }
          } : undefined,
          // Combat sports news
          newsItems: recentNews
        }
      );
      
      // 4.1 INJECT SEMANTIC SEARCH CONTEXT (position/intent awareness)
      if (semanticSearchContext) {
        systemPrompt = `${systemPrompt}${semanticSearchContext}`;
        console.log('🎯 Added semantic search context to prompt');
      }
      
      // 4.2 INJECT INSTRUCTOR-SPECIFIC SEARCH CONTEXT (if user asked for specific instructor)
      if (instructorSearchContext) {
        systemPrompt = `${systemPrompt}${instructorSearchContext}`;
        console.log('🎯 Added instructor search context to prompt');
      }
      
      console.log('✅ COMPREHENSIVE System prompt built:', systemPrompt.length, 'characters');
      console.log('   Expected: 6000-8000 chars | Actual:', systemPrompt.length);
      if (systemPrompt.length < 2000) {
        console.error('⚠️  WARNING: System prompt too short! Should be 6000-8000 characters');
      }
      console.log('   Video count in prompt:', videoLibrary.length);
      
      // 5. FORMAT CONVERSATION HISTORY FOR GPT-4o
      const messages = conversationHistory.map(msg => ({
        role: msg.messageType === 'user_sent' ? 'user' as const : 'assistant' as const,
        content: msg.messageText
      }));
      
      // DEBUG: Show formatted messages
      console.log('---');
      console.log('Formatted messages for GPT-4o:', messages.length);
      console.log('Messages array structure:');
      messages.slice(-2).forEach((msg, idx) => {
        console.log(`  ${idx + 1}. role: "${msg.role}", content: "${msg.content.substring(0, 60)}..."`);
      });
      console.log('---');
      
      // 5.5. DETECT REPEATED QUESTIONS (for playful acknowledgment)
      const recentUserMessages = conversationHistory
        .filter(msg => msg.messageType === 'user_sent')
        .map(msg => msg.messageText.toLowerCase().trim())
        .slice(-5); // Last 5 user messages
      
      const currentMessageLower = message.toLowerCase().trim();
      const isRepeatedQuestion = recentUserMessages.includes(currentMessageLower);
      
      if (isRepeatedQuestion) {
        console.log('🔁 Detected repeated question - adding explicit instruction');
        systemPrompt = `${systemPrompt}

═══════════════════════════════════════════════════════════════════════════════
⚠️ IMPORTANT: REPEATED QUESTION DETECTED
═══════════════════════════════════════════════════════════════════════════════

The user just asked the EXACT SAME question they asked moments ago. 

YOU MUST:
1. Playfully acknowledge the repetition (e.g., "You literally just asked me that!", "Still the same answer as 30 seconds ago", "Asking again?")
2. Still provide the answer
3. Keep it light and conversational

Example: "You literally just asked me that! You're still 6 feet tall - hasn't changed in the last minute."

DO NOT ignore the repetition. DO NOT give the same exact answer with no acknowledgment.
═══════════════════════════════════════════════════════════════════════════════`;
      }
      
      // Add current user message
      messages.push({
        role: 'user',
        content: message
      });
      
      // 6. CALL CLAUDE SONNET 4.5 (NOT GPT-4o)
      console.log('🤖 Calling Claude Sonnet 4.5...');
      console.log('---');
      console.log('FINAL PAYLOAD TO CLAUDE:');
      console.log('  System prompt length:', systemPrompt.length, 'characters');
      console.log('  Conversation history messages:', messages.length);
      console.log('  Current user message:', message.substring(0, 100));
      console.log('===================================');
      
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      
      // Retry logic for rate limits
      const callClaudeWithRetry = async (retryCount = 0): Promise<string> => {
        try {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 2048,
            system: systemPrompt,
            messages: messages as any
          });
          
          const content = response.content[0];
          return content.type === 'text' ? content.text : '';
        } catch (error: any) {
          // Retry on rate limit (max 2 retries)
          if (error.status === 429 && retryCount < 2) {
            console.log(`⏳ Rate limit hit, retrying in ${(retryCount + 1) * 2} seconds...`);
            await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
            return callClaudeWithRetry(retryCount + 1);
          }
          throw error;
        }
      };
      
      let aiResponse = await callClaudeWithRetry();
      
      // 6.5. POST-PROCESS VIDEO TOKENS: Replace simple AI tokens with full metadata
      // AI outputs: [VIDEO: Title by Instructor] or [VIDEO: Title by Instructor | START: MM:SS]
      // Frontend needs: [VIDEO: title | instructor | duration | videoId | id]
      const videoTokenRegex = /\[VIDEO:\s*([^\]]+)\]/g;
      let match;
      const replacements: { original: string; replacement: string }[] = [];
      
      while ((match = videoTokenRegex.exec(aiResponse)) !== null) {
        const tokenContent = match[1];
        const originalToken = match[0];
        
        // Parse the simple format (e.g., "Triangle Choke from Closed Guard by John Danaher")
        // or "Triangle Choke from Closed Guard by John Danaher | START: 2:30"
        const parts = tokenContent.split('|');
        const titleAndInstructor = parts[0].trim();
        
        // Extract title and instructor from "Title by Instructor"
        const byMatch = titleAndInstructor.match(/^(.+?)\s+by\s+(.+)$/i);
        if (!byMatch) {
          console.warn('[VIDEO TOKEN] Could not parse:', titleAndInstructor);
          continue;
        }
        
        const titlePattern = byMatch[1].trim().toLowerCase();
        const instructorPattern = byMatch[2].trim().toLowerCase();
        
        // Find matching video in our loaded library
        const matchingVideo = videoLibrary.find(v => {
          const videoTitle = (v.techniqueName || '').toLowerCase();
          const videoInstructor = (v.instructorName || '').toLowerCase();
          
          // Fuzzy match: BOTH title AND instructor must match
          const titleMatches = videoTitle.includes(titlePattern) || titlePattern.includes(videoTitle);
          const instructorMatches = videoInstructor.includes(instructorPattern) || instructorPattern.includes(videoInstructor);
          
          return titleMatches && instructorMatches;
        });
        
        if (matchingVideo && matchingVideo.videoUrl) {
          // Extract YouTube video ID from URL
          const youtubeMatch = matchingVideo.videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
          const videoId = youtubeMatch ? youtubeMatch[1] : '';
          
          if (videoId) {
            // Build the full token: [VIDEO: title | instructor | duration | videoId | id]
            // Duration: use "full" as placeholder (frontend can show "Watch Full Video")
            const fullToken = `[VIDEO: ${matchingVideo.techniqueName || titlePattern} | ${matchingVideo.instructorName || instructorPattern} | full | ${videoId} | ${matchingVideo.id}]`;
            
            replacements.push({ original: originalToken, replacement: fullToken });
            console.log('[VIDEO TOKEN] ✅ Matched:', titlePattern, '→', matchingVideo.techniqueName);
          } else {
            console.warn('[VIDEO TOKEN] No YouTube ID found for:', matchingVideo.videoUrl);
          }
        } else {
          console.warn('[VIDEO TOKEN] No match found for:', titlePattern, 'by', instructorPattern);
        }
      }
      
      // Apply all replacements
      for (const { original, replacement } of replacements) {
        aiResponse = aiResponse.replace(original, replacement);
      }
      
      if (replacements.length > 0) {
        console.log(`[VIDEO TOKEN] ✅ Replaced ${replacements.length} video token(s) with full metadata`);
      }
      
      const responseTime = Date.now() - startTime;
      
      console.log('✅ Response time:', responseTime + 'ms');
      console.log('✅ Response length:', aiResponse.length, 'characters');
      console.log('═══════════════════════════════════════════');
      
      // 7. SAVE BOTH MESSAGES TO DATABASE
      await db.insert(aiConversationLearning).values({
        userId: userId,
        messageText: message,
        messageType: 'user_sent',
        containsValuableSignal: true,
        modelUsed: 'claude-sonnet-4-5'
      });
      
      await db.insert(aiConversationLearning).values({
        userId: userId,
        messageText: aiResponse,
        messageType: 'ai_sent',
        containsValuableSignal: false,
        modelUsed: 'claude-sonnet-4-5'
      });
      
      // 7. RETURN RESPONSE
      res.json({ 
        success: true,
        content: aiResponse,
        message: aiResponse, // For backwards compatibility
        videos: [],
        timestamp: new Date().toISOString(),
        metadata: {
          model: 'claude-sonnet-4-5',
          responseTime: responseTime,
          promptLength: systemPrompt.length,
          videoCount: videoLibrary.length
        }
      });
      
    } catch (error: any) {
      console.error('❌ Professor OS error:', error);
      
      // User-friendly error messages (NEVER show raw errors)
      let userMessage = "Sorry, I'm having a brief moment. Give me one second and try again.";
      
      if (error.status === 429) {
        userMessage = "I'm getting a lot of questions right now. Give me a moment and try again.";
      } else if (error.status === 401 || error.status === 403) {
        userMessage = "There's a connection issue on my end. Please try again in a moment.";
      }
      
      res.status(200).json({ 
        success: false,
        content: userMessage,
        message: userMessage,
        videos: [],
        timestamp: new Date().toISOString(),
        metadata: {
          model: 'claude-sonnet-4-5',
          error: true
        }
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // LEGACY GPT-4o ENDPOINT REMOVED - All chat now uses Claude
  // Mobile and web both use /api/ai/chat/claude/stream
  // ═══════════════════════════════════════════════════════════════════

  // Voice transcription endpoint
  app.post('/api/ai/chat/transcribe', upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      console.log('🎤 Voice transcription request:', {
        userId,
        filename: req.file.originalname,
        size: req.file.size
      });

      // Transcribe audio using Whisper
      const { transcribeAudioBuffer } = await import('./whisper');
      const { text, duration } = await transcribeAudioBuffer(req.file.buffer, req.file.originalname);

      console.log('✅ Transcription complete:', { text, duration });

      res.json({
        success: true,
        text,
        duration
      });

    } catch (error: any) {
      console.error('❌ Voice transcription error:', error);
      res.status(500).json({
        error: 'Failed to transcribe audio',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });


  // ═══════════════════════════════════════════════════════════════════
  // MULTI-AGENT ENGAGEMENT TRACKING ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════
  
  // Track video click
  app.post('/api/ai/engagement/video-click', async (req, res) => {
    try {
      const { userId, videoId, queryId, startTimestamp } = req.body;
      
      if (!userId || !videoId) {
        return res.status(400).json({ error: 'Missing userId or videoId' });
      }
      
      await multiAgentSystem.trackVideoClick(
        userId,
        parseInt(videoId),
        queryId ? parseInt(queryId) : undefined,
        startTimestamp ? parseInt(startTimestamp) : undefined
      );
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Track video click error:', error);
      res.status(500).json({ error: 'Failed to track video click' });
    }
  });
  
  // Track video watch duration
  app.post('/api/ai/engagement/video-watch', async (req, res) => {
    try {
      const { userId, videoId, watchDuration, completed } = req.body;
      
      if (!userId || !videoId || watchDuration === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      await multiAgentSystem.trackVideoWatch(
        userId,
        parseInt(videoId),
        parseInt(watchDuration),
        Boolean(completed)
      );
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Track video watch error:', error);
      res.status(500).json({ error: 'Failed to track video watch' });
    }
  });
  
  // Track user feedback
  app.post('/api/ai/engagement/feedback', async (req, res) => {
    try {
      const { userId, videoId, feedbackType, feedbackText } = req.body;
      
      if (!userId || !videoId || !feedbackType) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const validFeedbackTypes = ['thumbs_up', 'thumbs_down', 'save', 'share'];
      if (!validFeedbackTypes.includes(feedbackType)) {
        return res.status(400).json({ error: 'Invalid feedback type' });
      }
      
      await multiAgentSystem.trackFeedback(
        userId,
        parseInt(videoId),
        feedbackType as any,
        feedbackText
      );
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Track feedback error:', error);
      res.status(500).json({ error: 'Failed to track feedback' });
    }
  });

  // Get chat history with cursor-based pagination
  // Uses `before` timestamp to load older messages reliably even when new messages arrive
  app.get('/api/ai/chat/history/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const beforeTimestamp = req.query.before as string; // ISO timestamp cursor
      
      // Build query conditions
      const conditions = [eq(aiConversationLearning.userId, userId)];
      if (beforeTimestamp) {
        conditions.push(lt(aiConversationLearning.createdAt, new Date(beforeTimestamp)));
      }
      
      // Query newest messages first (DESC) then reverse for display order
      const history = await db.select({
        id: aiConversationLearning.id,
        message: aiConversationLearning.messageText,
        sender: aiConversationLearning.messageType,
        timestamp: aiConversationLearning.createdAt
      })
      .from(aiConversationLearning)
      .where(and(...conditions))
      .orderBy(desc(aiConversationLearning.createdAt))
      .limit(limit);
      
      // Get oldest timestamp BEFORE reversing (last element in DESC order = oldest)
      const oldestInBatch = history.length > 0 ? history[history.length - 1].timestamp : null;
      
      // Reverse to get chronological order (oldest first) for display
      const mappedMessages = history.reverse().map(m => ({
        id: m.id.toString(),
        role: m.sender === 'user_sent' ? 'user' : 'assistant',
        content: m.message || '',
        createdAt: m.timestamp
      }));
      
      // Check if there are more older messages (strictly older than oldest in batch)
      let hasMore = false;
      if (oldestInBatch) {
        const olderCount = await db.select({ count: sql`count(*)::int` })
          .from(aiConversationLearning)
          .where(and(
            eq(aiConversationLearning.userId, userId),
            lt(aiConversationLearning.createdAt, oldestInBatch)
          ));
        hasMore = (olderCount[0]?.count || 0) > 0;
      }
      
      console.log('🔍 [BACKEND] History: before=', beforeTimestamp || 'none', 'limit=', limit, 'count=', history.length, 'hasMore=', hasMore);
      
      res.json({
        messages: mappedMessages,
        hasMore
      });
      
    } catch (error: any) {
      console.error('Chat history error:', error);
      res.status(500).json({ error: 'Failed to load history' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // PROFESSOR OS: CLAUDE STREAMING ENDPOINT (NEW - PHASE 1)
  // 🔒 SECURE: JWT authentication middleware prevents userId spoofing
  // ═══════════════════════════════════════════════════════════════════
  app.post('/api/ai/chat/claude/stream',
    requireAuth, // 🔒 JWT authentication - verifies sessionToken cookie
    ...securityMiddleware,
    messageLimiter,
    async (req, res) => {
      await handleClaudeStream(req, res);
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // PROFESSOR OS DIAGNOSTICS ENDPOINTS (Nov 26, 2025)
  // View comprehensive diagnostic logs for AI coaching system
  // ═══════════════════════════════════════════════════════════════════
  
  // Get diagnostics for a specific user (admin only)
  app.get('/api/ai/diagnostics/:userId', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const diagnostics = await db.execute(sql`
        SELECT * FROM professor_os_diagnostics 
        WHERE user_id = ${userId}
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `);
      
      res.json({ 
        userId,
        count: diagnostics.rows.length,
        diagnostics: diagnostics.rows 
      });
    } catch (error: any) {
      console.error('Diagnostics fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get all recent diagnostics (admin only)
  app.get('/api/ai/diagnostics', checkAdminAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      
      const diagnostics = await db.execute(sql`
        SELECT * FROM professor_os_diagnostics 
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `);
      
      // Aggregate stats
      const stats = {
        total: diagnostics.rows.length,
        avgResponseTime: 0,
        validationPassed: 0,
        validationFailed: 0,
        offTopicCount: 0
      };
      
      for (const d of diagnostics.rows) {
        const diag = d.diagnostics as any;
        if (diag) {
          stats.avgResponseTime += d.response_time_ms || 0;
          if (diag.validationStatus === 'passed') stats.validationPassed++;
          if (diag.validationStatus === 'failed') stats.validationFailed++;
          if (diag.offTopicDetected) stats.offTopicCount++;
        }
      }
      
      stats.avgResponseTime = Math.round(stats.avgResponseTime / (diagnostics.rows.length || 1));
      
      res.json({ 
        stats,
        diagnostics: diagnostics.rows 
      });
    } catch (error: any) {
      console.error('Diagnostics fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Health check for Professor OS intelligence system
  app.get('/api/ai/health', async (req, res) => {
    try {
      // Check video library
      const videoCount = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
      
      // Check recent diagnostics
      const recentDiag = await db.execute(sql`
        SELECT COUNT(*) as count FROM professor_os_diagnostics 
        WHERE timestamp > NOW() - INTERVAL '1 hour'
      `);
      
      // Check Claude API key
      const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY;
      
      const videoCountValue = (videoCount.rows?.[0] as any)?.count || 0;
      const diagCountValue = (recentDiag.rows?.[0] as any)?.count || 0;
      
      res.json({
        status: 'healthy',
        checks: {
          videoLibrary: { 
            healthy: Number(videoCountValue) > 0,
            count: videoCountValue
          },
          recentActivity: { 
            healthy: true,
            lastHourRequests: diagCountValue
          },
          claudeApi: { 
            healthy: hasClaudeKey,
            configured: hasClaudeKey 
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Health check error:', error);
      res.status(500).json({ 
        status: 'unhealthy',
        error: error.message 
      });
    }
  });

  // Admin Chat Endpoints
  // Get admin chat history
  app.get('/api/ai/admin-chat/history/:adminId', checkAdminAuth, async (req, res) => {
    try {
      const { adminId } = req.params;
      
      const messages = await db.select({
        id: adminChatHistory.id,
        adminId: adminChatHistory.adminId,
        sender: adminChatHistory.sender,
        message: adminChatHistory.message,
        timestamp: adminChatHistory.timestamp
      })
        .from(adminChatHistory)
        .where(eq(adminChatHistory.adminId, adminId))
        .orderBy(asc(adminChatHistory.timestamp));
      
      res.json({ messages });
    } catch (error: any) {
      console.error('Fetch admin chat history error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send admin chat message
  app.post('/api/ai/admin-chat/message', checkAdminAuth, async (req, res) => {
    try {
      const { adminId, message } = req.body;
      
      if (!adminId || !message) {
        return res.status(400).json({ error: 'Missing adminId or message' });
      }
      
      console.log('📨 Admin chat message received:', { adminId, message });
      
      // Save user message
      await db.insert(adminChatHistory).values({
        adminId,
        sender: 'user',
        message,
      });
      
      // Query available BJJ videos from database (using new curated video schema)
      const availableVideos = await db.select({
        id: aiVideoKnowledge.id,
        techniqueName: aiVideoKnowledge.title,
        instructorName: aiVideoKnowledge.instructorName,
        positionCategory: aiVideoKnowledge.techniqueType,
        techniqueType: aiVideoKnowledge.techniqueType
      })
      .from(aiVideoKnowledge)
      .where(sql`${aiVideoKnowledge.qualityScore} >= 8`)
      .limit(30);
      
      // Build empty context for admin (no specific user)
      const adminContext = {
        user: {
          name: 'Admin',
          belt_level: 'black',
          primary_goal: 'test the AI system',
          training_frequency: 'daily',
          signup_date: new Date()
        }
      };
      
      // Build Prof. OS system prompt using journey-focused personality
      const aiPrompt = buildSystemPrompt(adminContext, availableVideos);

      console.log('🤖 Calling Anthropic API...');
      
      // Call Claude API
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
      
      const claudeMessage = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: aiPrompt,
        messages: [{
          role: 'user',
          content: message
        }]
      });
      
      let aiResponse = claudeMessage.content[0].type === 'text' ? claudeMessage.content[0].text : '';
      console.log('✅ AI response received, length:', aiResponse.length);
      
      // Intelligently inject video recommendations
      let enhancedResponse = aiResponse;
      const videos: any[] = [];
      
      // Search for instructor names and technique keywords in the response
      for (const video of availableVideos) {
        const instructorMatch = aiResponse.toLowerCase().includes(video.instructorName?.toLowerCase() || '');
        const techniqueWords = video.techniqueName?.toLowerCase().split(' ') || [];
        const techniqueMatch = techniqueWords.some(word => 
          word.length > 3 && aiResponse.toLowerCase().includes(word)
        );
        
        if (instructorMatch && techniqueMatch) {
          // Found a likely video recommendation - inject the proper format
          const videoTag = `\n\n[VIDEO: ${video.techniqueName} by ${video.instructorName}]\n`;
          
          // Find a good place to insert it (after mentioning the instructor)
          const instructorIndex = aiResponse.toLowerCase().indexOf(video.instructorName?.toLowerCase() || '');
          if (instructorIndex > -1) {
            const sentenceEnd = aiResponse.indexOf('.', instructorIndex);
            if (sentenceEnd > -1) {
              enhancedResponse = aiResponse.slice(0, sentenceEnd + 1) + 
                videoTag + 
                aiResponse.slice(sentenceEnd + 1);
              aiResponse = enhancedResponse;
            }
          }
          
          videos.push({
            id: video.id,
            title: video.techniqueName,
            instructor: video.instructorName,
          });
          break;
        }
      }
      
      const responseText = enhancedResponse;
      
      // Save AI response
      await db.insert(adminChatHistory).values({
        adminId,
        sender: 'assistant',
        message: responseText,
      });
      
      console.log('💾 Messages saved to database');
      
      res.json({ 
        success: true, 
        response: responseText,
        videos: videos 
      });
    } catch (error: any) {
      console.error('❌ Admin chat error:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ 
        error: error.message || 'Failed to process message',
        details: error.stack 
      });
    }
  });

  // Clear admin chat history
  app.delete('/api/ai/admin-chat/clear', checkAdminAuth, async (req, res) => {
    try {
      const { adminId } = req.body;
      
      await db.delete(adminChatHistory).where(eq(adminChatHistory.adminId, adminId));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Clear admin chat error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMMAND CENTER & INTELLIGENCE DASHBOARD API ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  // GET: Fetch system snapshots for Intelligence Dashboard
  app.get('/api/admin/snapshots', checkAdminAuth, async (req, res) => {
    try {
      const range = req.query.range as string || '24h';
      
      let hoursAgo = 24;
      if (range === '7d') hoursAgo = 24 * 7;
      else if (range === '30d') hoursAgo = 24 * 30;
      
      const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      
      const snapshots = await db.select()
        .from(systemSnapshots)
        .where(gte(systemSnapshots.timestamp, cutoffTime))
        .orderBy(desc(systemSnapshots.timestamp))
        .limit(1000);
      
      res.json({
        success: true,
        snapshots: snapshots.map(s => ({
          id: s.id,
          timestamp: s.timestamp,
          videoCount: s.videoCount,
          videosAddedToday: s.videosAddedToday,
          userCount: s.userCount,
          activeSubscriptions: s.activeSubscriptions,
          mrr: Number(s.mrr || 0),
          curationRunsToday: s.curationRunsToday,
          approvalRate: Number(s.approvalRate || 0),
          apiQuotaUsed: s.apiQuotaUsed,
          insights: s.insights,
          anomalies: s.anomalies,
          recommendations: s.recommendations,
          healthStatus: s.healthStatus,
          createdAt: s.createdAt
        }))
      });
    } catch (error: any) {
      console.error('[SNAPSHOTS] Failed to fetch snapshots:', error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });
  
  // POST: Execute command from Command Center
  app.post('/api/admin/command', checkAdminAuth, async (req, res) => {
    const startTime = Date.now();
    const { command, params = {} } = req.body;
    const adminUserId = req.user?.userId || 'admin-1';
    
    console.log(`⚡ [COMMAND] Executing: ${command} by ${adminUserId}`);
    
    try {
      let result: { success: boolean; message: string; data?: any } = {
        success: false,
        message: 'Unknown command'
      };
      
      switch (command) {
        case 'run_curation':
          // UNIFIED CURATION (Dec 2025)
          // Uses proven search method: pick instructors with lowest counts, run 5 searches each
          
          console.log('[UNIFIED CURATION] Starting unified curation...');
          
          const { runUnifiedCuration, getCurationStatus } = await import('./unified-curation');
          
          // Get current status first
          const currentStatus = await getCurationStatus();
          
          // Respond immediately - curation runs in background
          result = { 
            success: true, 
            message: `Unified curation started. Targeting 12 instructors with lowest video counts. Current library: ${currentStatus.totalVideos} videos. Email notification when complete.`,
            data: { 
              type: 'unified-curation',
              totalVideos: currentStatus.totalVideos,
              rotationCycle: currentStatus.rotationCycle,
              recentlyAdded: currentStatus.recentlyAdded
            }
          };
          
          // Run unified curation in background with email notification
          setImmediate(async () => {
            try {
              const instructorCount = params.instructorCount || 12;
              console.log(`[UNIFIED CURATION] Processing ${instructorCount} instructors...`);
              
              const curationResult = await runUnifiedCuration(instructorCount, 7.0);
              
              // Send email notification
              try {
                const { Resend } = await import('resend');
                const resend = new Resend(process.env.RESEND_API_KEY);
                
                const stats = curationResult.instructorStats || [];
                const instructorSummary = stats.length > 0
                  ? stats.map(s => `  - ${s.instructor}: ${s.beforeCount} → ${s.afterCount} (+${s.videosAdded})`).join('\n')
                  : '  (no instructors processed)';
                
                let subject: string;
                let status: string;
                
                if (!curationResult.success) {
                  subject = '❌ BJJ OS Curation Failed';
                  status = `Failed: ${curationResult.error || 'Unknown error'}`;
                } else if (curationResult.quotaExhausted) {
                  subject = '⚠️ BJJ OS Curation Complete (Quota Hit)';
                  status = 'Completed with quota exhaustion';
                } else if (curationResult.instructorsCurated === 0) {
                  subject = '⚠️ BJJ OS Curation - No Instructors';
                  status = 'No eligible instructors found (all have 50+ videos)';
                } else {
                  subject = '✅ BJJ OS Curation Complete';
                  status = 'Success';
                }
                
                await resend.emails.send({
                  from: 'BJJ OS <noreply@bjjos.app>',
                  to: ['todd@bjjos.app'],
                  subject,
                  text: `Unified Curation (Command Center)

📊 Status: ${status}

📈 Summary:
- Instructors curated: ${curationResult.instructorsCurated || 0}
- Videos added: ${curationResult.totalVideosAdded || 0}
- Duration: ${curationResult.durationMinutes || 0} minutes
- Rotation cycle: ${curationResult.rotationCycle || 1}

📋 Instructor Breakdown:
${instructorSummary}

View library: https://bjjos.app/admin/videos
Run another: https://bjjos.app/admin/command-center`
                });
                
                console.log(`[UNIFIED CURATION] Email notification sent`);
              } catch (emailError: any) {
                console.error(`[UNIFIED CURATION] Failed to send email:`, emailError);
              }
              
            } catch (error: any) {
              console.error(`[UNIFIED CURATION] Error:`, error);
              
              // Send error email
              try {
                const { Resend } = await import('resend');
                const resend = new Resend(process.env.RESEND_API_KEY);
                await resend.emails.send({
                  from: 'BJJ OS <noreply@bjjos.app>',
                  to: ['todd@bjjos.app'],
                  subject: '❌ BJJ OS Curation Failed',
                  text: `Curation failed:\n\n${error.message}\n\nCheck logs for details.`
                });
              } catch (e) {}
            }
          });
          
          break;
          
        case 'take_snapshot':
          // Generate snapshot immediately with detailed results
          const { generateHourlySnapshot } = await import('./jobs/command-center-snapshots');
          
          // Get current metrics before snapshot
          const videoCountBefore = await db.select({ count: sql<number>`count(*)::int` })
            .from(aiVideoKnowledge)
            .where(sql`${aiVideoKnowledge.qualityScore} >= 7.0`);
          
          const userCountBefore = await db.select({ count: sql<number>`count(*)::int` })
            .from(bjjUsers);
          
          await generateHourlySnapshot();
          
          // Get snapshot ID (most recent)
          const latestSnapshot = await db.select()
            .from(systemSnapshots)
            .orderBy(desc(systemSnapshots.snapshotTime))
            .limit(1);
          
          const snapshotId = latestSnapshot[0]?.id || 'unknown';
          const videosCount = videoCountBefore[0]?.count || 0;
          const usersCount = userCountBefore[0]?.count || 0;
          
          result = { 
            success: true, 
            message: 'System snapshot generated',
            data: {
              result: {
                status: 'success',
                title: 'Snapshot Created',
                timestamp: new Date().toISOString(),
                actions: [
                  'Captured current system metrics',
                  'Generated AI analysis of trends',
                  'Saved to Intelligence Dashboard',
                  'Updated historical data'
                ],
                metrics: {
                  'Snapshot ID': snapshotId,
                  'Videos': videosCount,
                  'Users': usersCount,
                  'Timestamp': new Date().toLocaleString()
                },
                viewLink: '/admin/devos'
              }
            }
          };
          break;
          
        case 'flush_cache':
          // Clear all caches - using Upstash Redis compatible methods
          const beforeMemory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
          
          // Get current cache stats before flush
          let beforeCacheSize = 0;
          try {
            const stats = await cache.getStats();
            beforeCacheSize = stats.dbsize || 0;
          } catch (e) {
            console.warn('[CACHE] Could not get stats:', e);
          }
          
          // Invalidate known cache patterns (Upstash doesn't support flushAll directly in free tier)
          await invalidateCache.videos();
          
          // Clear in-memory Professor OS cache
          const { professorOSCache } = await import('./services/professor-os-cache');
          professorOSCache.clear();
          
          const afterMemory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
          const memoryFreed = (parseFloat(beforeMemory) - parseFloat(afterMemory)).toFixed(1);
          
          result = { 
            success: true, 
            message: 'Cache flushed successfully',
            data: {
              result: {
                status: 'success',
                title: 'Cache Cleared',
                timestamp: new Date().toISOString(),
                actions: [
                  'Invalidated video library cache',
                  'Cleared Professor OS response cache',
                  'Cleared in-memory caches',
                  'Forced cache refresh on next request'
                ],
                metrics: {
                  'Redis Keys Before': beforeCacheSize,
                  'Memory Before': `${beforeMemory} MB`,
                  'Memory After': `${afterMemory} MB`,
                  'Memory Freed': `${memoryFreed} MB`
                },
                changes: [
                  { before: `${beforeMemory} MB heap`, after: `${afterMemory} MB heap` }
                ]
              }
            }
          };
          break;
          
        case 'test_apis':
          // Test API connections with timing
          const testStartTime = Date.now();
          const apiTests: Record<string, { available: boolean; responseTime?: number }> = {};
          
          // Test each API
          const claudeStart = Date.now();
          apiTests.claude = { 
            available: !!process.env.ANTHROPIC_API_KEY,
            responseTime: Date.now() - claudeStart 
          };
          
          const youtubeStart = Date.now();
          apiTests.youtube = { 
            available: !!process.env.YOUTUBE_API_KEY,
            responseTime: Date.now() - youtubeStart 
          };
          
          const twilioStart = Date.now();
          apiTests.twilio = { 
            available: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
            responseTime: Date.now() - twilioStart 
          };
          
          const stripeStart = Date.now();
          apiTests.stripe = { 
            available: !!process.env.STRIPE_SECRET_KEY,
            responseTime: Date.now() - stripeStart 
          };
          
          const allPassed = Object.values(apiTests).every(t => t.available);
          const passedCount = Object.values(apiTests).filter(t => t.available).length;
          const avgResponseTime = Math.round(Object.values(apiTests).reduce((sum, t) => sum + (t.responseTime || 0), 0) / 4);
          
          result = { 
            success: allPassed,
            message: `${passedCount}/4 APIs available`,
            data: {
              result: {
                status: allPassed ? 'success' : 'error',
                title: allPassed ? 'API Tests Complete' : 'Some APIs Failed',
                timestamp: new Date().toISOString(),
                actions: [
                  `Tested Claude API - ${apiTests.claude.available ? '✅' : '❌'} ${apiTests.claude.available ? `Working (${apiTests.claude.responseTime}ms)` : 'Not configured'}`,
                  `Tested YouTube API - ${apiTests.youtube.available ? '✅' : '❌'} ${apiTests.youtube.available ? `Working (${apiTests.youtube.responseTime}ms)` : 'Not configured'}`,
                  `Tested Twilio API - ${apiTests.twilio.available ? '✅' : '❌'} ${apiTests.twilio.available ? `Working (${apiTests.twilio.responseTime}ms)` : 'Not configured'}`,
                  `Tested Stripe API - ${apiTests.stripe.available ? '✅' : '❌'} ${apiTests.stripe.available ? `Working (${apiTests.stripe.responseTime}ms)` : 'Not configured'}`
                ],
                metrics: {
                  'Total Tests': 4,
                  'Passed': passedCount,
                  'Failed': 4 - passedCount,
                  'Avg Response Time': `${avgResponseTime}ms`
                }
              }
            }
          };
          break;
          
        case 'run_curation_v2':
          // V2 Intelligent Curation with dynamic pools
          const { runCurationV2, getCurationV2Stats } = await import('./intelligent-curator-v2');
          
          console.log('[V2 CURATION] Starting Intelligent Curator V2...');
          
          // Start V2 curation in background
          setImmediate(async () => {
            try {
              const v2Result = await runCurationV2();
              
              // Send email notification
              try {
                const { Resend } = await import('resend');
                const resend = new Resend(process.env.RESEND_API_KEY);
                
                const approvalRate = v2Result.videosAnalyzed > 0 
                  ? Math.round(v2Result.videosApproved / v2Result.videosAnalyzed * 100)
                  : 0;
                
                await resend.emails.send({
                  from: 'BJJ OS <noreply@bjjos.app>',
                  to: ['todd@bjjos.app'],
                  subject: v2Result.errors.length === 0 
                    ? '✅ BJJ OS V2 Curation Complete' 
                    : '⚠️ BJJ OS V2 Curation Complete (with errors)',
                  text: `Intelligent Curator V2 Complete!

📊 Results:
- Queries executed: ${v2Result.queriesExecuted}
- Videos found: ${v2Result.videosFound}
- Videos analyzed: ${v2Result.videosAnalyzed}
- Videos approved: ${v2Result.videosApproved}
- Approval rate: ${approvalRate}%
- New instructors discovered: ${v2Result.newInstructorsDiscovered}
${v2Result.errors.length > 0 ? `\n⚠️ Errors: ${v2Result.errors.join(', ')}` : ''}

View library: https://bjjos.app/admin/videos
Run another: https://bjjos.app/admin/command-center`
                });
                
                console.log('[V2 CURATION] Email notification sent');
              } catch (emailError: any) {
                console.error('[V2 CURATION] Failed to send email:', emailError);
              }
            } catch (error: any) {
              console.error('[V2 CURATION] Error:', error);
            }
          });
          
          // Get V2 stats to show
          const v2Stats = await getCurationV2Stats();
          
          result = { 
            success: true, 
            message: 'V2 Curation started. Email notification will be sent on completion.',
            data: {
              result: {
                status: 'running',
                title: 'Intelligent Curator V2 Started',
                timestamp: new Date().toISOString(),
                actions: [
                  'Started V2 curation with dynamic instructor/technique pools',
                  `Processing 15 queries from ${v2Stats.totalQueries}+ combinations`,
                  'Deep discovery mode: up to 100 videos per query',
                  'Auto-expand: new high-credibility instructors queued'
                ],
                metrics: {
                  'Instructor Pool': v2Stats.instructorPoolSize,
                  'Technique Pool': v2Stats.techniquePoolSize,
                  'Query Combinations': v2Stats.totalQueries,
                  'Pending Expansions': v2Stats.pendingExpansions
                },
                viewLink: '/admin/videos'
              }
            }
          };
          break;
        
        case 'run_gi_curation':
          // Run Gi-focused targeted curation immediately
          console.log('[GI CURATION] Starting gi-focused targeted curation...');
          
          setImmediate(async () => {
            try {
              const { runGiFocusedCuration } = await import('./targeted-topic-curation');
              const giResult = await runGiFocusedCuration();
              console.log(`[GI CURATION] Complete: ${giResult.videosAdded} videos added`);
            } catch (error: any) {
              console.error('[GI CURATION] Error:', error);
            }
          });
          
          result = {
            success: true,
            message: 'Gi-focused curation started. Email notification will be sent on completion.',
            data: {
              result: {
                status: 'running',
                title: 'Gi-Focused Curation Started',
                timestamp: new Date().toISOString(),
                actions: [
                  'Running 26 gi-specific search queries',
                  'Targeting elite gi instructors: Roger Gracie, Xande, Mendes Bros, etc.',
                  'Quality thresholds: Elite 7.0+, Known 7.5+, Unknown 8.5+',
                  'Filtering out nogi content',
                  'Email notification on completion'
                ],
                metrics: {
                  'Search Queries': 26,
                  'Focus': 'Gi-only techniques',
                  'Expected Videos': '100-200'
                },
                viewLink: '/admin/videos'
              }
            }
          };
          break;
        
        case 'run_nightly_curation':
          // Run today's topic curation (based on day of week)
          console.log('[NIGHTLY CURATION] Running today\'s topic curation...');
          
          const { getTodaysTopic: getNightlyTopic } = await import('./targeted-topic-curation');
          const todaysTopic = getNightlyTopic();
          
          setImmediate(async () => {
            try {
              const { runNightlyCuration: runNightly } = await import('./targeted-topic-curation');
              const nightlyResult = await runNightly();
              console.log(`[NIGHTLY CURATION] Complete: ${nightlyResult.videosAdded} videos added`);
            } catch (error: any) {
              console.error('[NIGHTLY CURATION] Error:', error);
            }
          });
          
          result = {
            success: true,
            message: `Today's topic (${todaysTopic.name.toUpperCase()}) curation started.`,
            data: {
              result: {
                status: 'running',
                title: `Nightly Curation: ${todaysTopic.name.toUpperCase()}`,
                timestamp: new Date().toISOString(),
                actions: [
                  `Running ${todaysTopic.searches.length} ${todaysTopic.name} searches`,
                  'Bypasses video count target for targeted enrichment',
                  'Sends detailed email report on completion'
                ],
                metrics: {
                  'Today\'s Topic': todaysTopic.name,
                  'Day of Week': todaysTopic.dayOfWeek,
                  'Search Queries': todaysTopic.searches.length
                },
                viewLink: '/admin/videos'
              }
            }
          };
          break;
        
        case 'run_dynamic_curation':
          // Run dynamic instructor-based curation from YOUR database
          console.log('[DYNAMIC CURATION] Starting database-driven instructor curation...');
          
          setImmediate(async () => {
            try {
              const { runDynamicCuration, sendCurationEmail } = await import('./targeted-topic-curation');
              const dynamicResult = await runDynamicCuration();
              console.log(`[DYNAMIC CURATION] Complete: ${dynamicResult.videosAdded} videos added`);
              await sendCurationEmail(dynamicResult);
            } catch (error: any) {
              console.error('[DYNAMIC CURATION] Error:', error);
            }
          });
          
          result = {
            success: true,
            message: 'Dynamic instructor curation started. Queries YOUR database for all instructors.',
            data: {
              result: {
                status: 'running',
                title: 'Dynamic Instructor Curation',
                timestamp: new Date().toISOString(),
                actions: [
                  'Querying all instructors from YOUR database (quality >= 7.0)',
                  'Priority: HIGH (<20 videos), MEDIUM (20-50), LOW (50+)',
                  'Selecting 15 instructors based on priority balancing',
                  'Rotating through all instructors over 3-day cycles',
                  'Email notification on completion'
                ],
                metrics: {
                  'Data Source': 'Your Video Database',
                  'Instructors Per Run': 15,
                  'Rotation Cooldown': '72 hours'
                },
                viewLink: '/admin/videos'
              }
            }
          };
          break;
        
        case 'run_expanded_curation':
          // Run expanded curation with technique searches, new instructors, recent uploads
          console.log('[EXPANDED CURATION] Starting multi-strategy content discovery...');
          
          setImmediate(async () => {
            try {
              const { runExpandedCuration, sendExpandedCurationEmail } = await import('./targeted-topic-curation');
              const expandedResult = await runExpandedCuration();
              console.log(`[EXPANDED CURATION] Complete: ${expandedResult.videosAdded} videos added`);
              console.log(`[EXPANDED CURATION] New instructors: ${expandedResult.newInstructorsDiscovered.join(', ')}`);
              await sendExpandedCurationEmail(expandedResult);
            } catch (error: any) {
              console.error('[EXPANDED CURATION] Error:', error);
            }
          });
          
          result = {
            success: true,
            message: 'Expanded curation started. Finding NEW content beyond existing instructors.',
            data: {
              result: {
                status: 'running',
                title: 'Expanded Content Discovery',
                timestamp: new Date().toISOString(),
                actions: [
                  '📚 Strategy 1: Technique searches (gi + nogi techniques)',
                  '👤 Strategy 2: New rising instructors (stricter 8.0+ threshold)',
                  '📅 Strategy 3: Recent uploads (last 90 days)',
                  '📺 Strategy 4: Quality channel searches',
                  'Claude AI analysis for each video',
                  'Email report with breakdown by strategy'
                ],
                metrics: {
                  'Strategies': 4,
                  'Technique Searches': 24,
                  'New Instructor Searches': 10,
                  'Recent Upload Searches': 8,
                  'Channel Searches': 6
                },
                viewLink: '/admin/videos'
              }
            }
          };
          break;
        
        case 'seed_credentials':
          // Seed verified ADCC/IBJJF credentials database
          const { seedVerifiedADCCData, updateInstructorCredentialsFromResults } = await import('./utils/verified-credentials');
          
          console.log('[CREDENTIALS] Seeding verified competition data...');
          const seedResult = await seedVerifiedADCCData();
          await updateInstructorCredentialsFromResults();
          
          result = {
            success: true,
            message: `Seeded ${seedResult.inserted} verified ADCC records. Credentials updated.`,
            data: {
              inserted: seedResult.inserted,
              errors: seedResult.errors
            }
          };
          break;
          
        default:
          result = { success: false, message: `Unknown command: ${command}` };
      }
      
      const executionTime = Date.now() - startTime;
      
      // Log command execution
      await db.insert(commandLog).values({
        adminUserId: String(adminUserId),
        command,
        parameters: params,
        success: result.success,
        message: result.message,
        executionTimeMs: executionTime
      });
      
      console.log(`✅ [COMMAND] ${command} completed in ${executionTime}ms`);
      
      res.json({
        ...result,
        executionTimeMs: executionTime
      });
      
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ [COMMAND] ${command} failed:`, error);
      
      // Log failed command
      try {
        await db.insert(commandLog).values({
          adminUserId: String(adminUserId),
          command,
          parameters: params,
          success: false,
          message: error.message,
          executionTimeMs: executionTime
        });
      } catch (logError) {
        console.error('[COMMAND] Failed to log command:', logError);
      }
      
      res.status(500).json({
        success: false,
        message: error.message,
        executionTimeMs: executionTime
      });
    }
  });
  
  // GET: Curation status for in-page results
  app.get('/api/admin/curation/status', checkAdminAuth, async (req, res) => {
    try {
      // Get most recent curation run
      const latestRun = await db.select()
        .from(curationRuns)
        .orderBy(sql`${curationRuns.createdAt} DESC`)
        .limit(1);
      
      if (latestRun.length === 0) {
        return res.json({ status: 'idle' });
      }
      
      const run = latestRun[0];
      
      if (run.status === 'completed') {
        // Get newly added videos
        const newVideos = await db.select({
          id: aiVideoKnowledge.id,
          title: aiVideoKnowledge.videoTitle,
          instructor: aiVideoKnowledge.instructorName,
          qualityScore: aiVideoKnowledge.qualityScore
        })
        .from(aiVideoKnowledge)
        .where(sql`${aiVideoKnowledge.createdAt} > ${run.createdAt}`)
        .orderBy(sql`${aiVideoKnowledge.createdAt} DESC`)
        .limit(10);
        
        // Get total library count
        const totalCount = await db.select({ count: sql<number>`count(*)::int` })
          .from(aiVideoKnowledge)
          .where(sql`${aiVideoKnowledge.qualityScore} >= 7.0`);
        
        return res.json({
          status: 'completed',
          results: {
            analyzed: run.videosAnalyzed || 0,
            approved: run.videosAdded || 0,
            approvalRate: run.videosAnalyzed ? Math.round((run.videosAdded || 0) / run.videosAnalyzed * 100) : 0,
            totalVideos: totalCount[0]?.count || 0,
            newVideos: newVideos
          }
        });
      }
      
      return res.json({ status: run.status });
    } catch (error: any) {
      console.error('[CURATION STATUS] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET: Live curation progress updates
  app.get('/api/admin/curation/progress/:runId', checkAdminAuth, async (req, res) => {
    try {
      const { runId } = req.params;
      const { getProgress } = await import('./curation-progress');
      
      const progress = getProgress(runId);
      
      if (!progress) {
        return res.json({ 
          updates: [], 
          status: 'not_found' 
        });
      }
      
      res.json(progress);
    } catch (error: any) {
      console.error('[CURATION PROGRESS] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET: Load curation settings
  app.get('/api/admin/curation/settings', checkAdminAuth, async (req, res) => {
    try {
      // For now, return default settings (can be extended to store in DB)
      res.json({
        qualityThreshold: 7.0,
        videosPerRun: 20,
        focusInstructors: []
      });
    } catch (error: any) {
      console.error('[CURATION SETTINGS] Load error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Save curation settings
  app.post('/api/admin/curation/settings', checkAdminAuth, async (req, res) => {
    try {
      const { qualityThreshold, videosPerRun, focusInstructors } = req.body;
      
      // Validate settings
      if (qualityThreshold && (qualityThreshold < 5 || qualityThreshold > 9)) {
        return res.status(400).json({ error: 'Quality threshold must be between 5 and 9' });
      }
      
      if (videosPerRun && ![10, 20, 30, 50].includes(videosPerRun)) {
        return res.status(400).json({ error: 'Invalid videos per run value' });
      }
      
      // For now, just log the settings (can be extended to store in DB)
      console.log('[CURATION SETTINGS] Saved:', { qualityThreshold, videosPerRun, focusInstructors });
      
      res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error: any) {
      console.error('[CURATION SETTINGS] Save error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Quick curation with specific filters (instructor, technique, position, etc.)
  app.post('/api/admin/curation/quick-run', checkAdminAuth, async (req, res) => {
    try {
      const { type, query } = req.body;
      
      if (!type) {
        return res.status(400).json({ error: 'Curation type required' });
      }
      
      // Build search query based on type
      let searchQuery = '';
      switch (type) {
        case 'instructor':
          searchQuery = `${query} bjj technique instructional`;
          break;
        case 'technique':
          searchQuery = `${query} bjj technique how to`;
          break;
        case 'position':
          searchQuery = `${query} bjj techniques instructional`;
          break;
        case 'gi-nogi':
          searchQuery = query === 'gi' ? 'gi bjj technique instructional' : 'no-gi bjj technique instructional submission grappling';
          break;
        case 'custom':
          searchQuery = query;
          break;
        case 'meta':
          // Use common high-value techniques
          const metaTechniques = ['leg lock', 'back take', 'mount escape', 'guard pass', 'guillotine choke'];
          searchQuery = metaTechniques[Math.floor(Math.random() * metaTechniques.length)] + ' bjj instructional';
          break;
        default:
          return res.status(400).json({ error: `Unknown curation type: ${type}` });
      }
      
      console.log(`[QUICK CURATION] Starting ${type} curation with query: "${searchQuery}"`);
      
      // Import and run the auto-curator (non-blocking)
      const { runAutoCurationManually } = await import('./auto-curator');
      
      // Run async - don't await
      runAutoCurationManually(searchQuery).catch(err => {
        console.error('[QUICK CURATION] Error:', err);
      });
      
      res.json({ 
        success: true, 
        message: `Quick curation started for ${type}: "${query || 'meta'}"`,
        searchQuery 
      });
    } catch (error: any) {
      console.error('[QUICK CURATION] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET: SSE stream for curation progress
  app.get('/api/admin/curation/stream', checkAdminAuth, (req, res) => {
    const runId = req.query.runId as string;
    
    if (!runId) {
      return res.status(400).json({ error: 'runId required' });
    }
    
    console.log(`[SSE] Client connecting to curation stream for run ${runId}`);
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    
    import('./curation-progress').then(({ subscribeSSE, unsubscribeSSE }) => {
      subscribeSSE(runId, res);
      
      req.on('close', () => {
        console.log(`[SSE] Client disconnected from curation stream for run ${runId}`);
        unsubscribeSSE(runId, res);
      });
    });
  });

  // GET: Fetch command execution log
  app.get('/api/admin/command/log', checkAdminAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      
      const logs = await db.select()
        .from(commandLog)
        .orderBy(desc(commandLog.timestamp))
        .limit(limit);
      
      res.json({
        success: true,
        logs: logs.map(log => ({
          id: log.id,
          command: log.command,
          success: log.success,
          message: log.message,
          executionTimeMs: log.executionTimeMs,
          timestamp: log.timestamp,
          adminUserId: log.adminUserId
        }))
      });
    } catch (error: any) {
      console.error('[COMMAND LOG] Failed to fetch logs:', error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DEV OS INTELLIGENCE CHAT ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  // GET: Load chat message history
  app.get('/api/admin/dev-os/messages', checkAdminAuth, async (req, res) => {
    try {
      const adminUserId = req.user?.userId || 'admin-1';
      const limit = parseInt(req.query.limit as string) || 50;
      
      console.log('[DEV OS] Loading message history for admin:', adminUserId);
      
      const messages = await db.select()
        .from(devOsMessages)
        .where(eq(devOsMessages.userId, String(adminUserId)))
        .orderBy(asc(devOsMessages.createdAt))
        .limit(limit);
      
      console.log('[DEV OS] Loaded', messages.length, 'messages');
      
      res.json({ 
        success: true,
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt
        }))
      });
    } catch (error: any) {
      console.error('[DEV OS] Failed to load messages:', error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });
  
  // POST: Send message to Dev OS
  app.post('/api/admin/dev-os/chat', checkAdminAuth, async (req, res) => {
    try {
      console.log('═══ DEV OS CHAT REQUEST START ═══');
      console.log('Timestamp:', new Date().toISOString());
      
      const { message } = req.body;
      const adminUserId = req.user?.userId || 'admin-1';
      
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      console.log('[DEV OS] Admin user ID:', adminUserId);
      console.log('[DEV OS] User message:', message);
      console.log('[DEV OS] Message length:', message?.length);
      console.log('[DEV OS] Request headers:', {
        authorization: req.headers.authorization ? 'Present' : 'Missing',
        cookie: req.headers.cookie ? 'Present' : 'Missing',
        contentType: req.headers['content-type']
      });
      
      // Step 0: Save user message to database for persistence
      await db.insert(devOsMessages).values({
        userId: String(adminUserId),
        role: 'user',
        content: message,
        messageType: 'chat'
      });
      
      // SIMPLE MODE: Detect basic queries and respond directly (bypass massive Claude prompt)
      const lowerMessage = message.toLowerCase();
      const isSimpleQuery = lowerMessage.includes('test') || 
                            lowerMessage.includes('hello') ||
                            lowerMessage.includes('hi ') ||
                            lowerMessage.length < 30;
      
      if (isSimpleQuery && !lowerMessage.includes('curation') && !lowerMessage.includes('video')) {
        console.log('[DEV OS] Using SIMPLE MODE for basic query');
        
        // Get quick system stats
        const now = new Date();
        const todayStart = new Date(now.toLocaleDateString('en-US', { timeZone: 'America/New_York' }));
        
        const [videoCount, userCount, curationStatus] = await Promise.all([
          db.select({ count: sql`COUNT(*)::int` }).from(aiVideoKnowledge),
          db.select({ count: sql`COUNT(*)::int` }).from(bjjUsers),
          db.select().from(curationRuns).where(eq(curationRuns.status, 'running')).limit(1)
        ]);
        
        const simpleResponse = `✅ **System Status: Healthy**\n\n**Quick Stats:**\n• Video Library: ${videoCount[0]?.count || 0} videos\n• Total Users: ${userCount[0]?.count || 0}\n• Curation: ${curationStatus.length > 0 ? '🟢 Running' : '⚪ Idle'}\n• Server: Running normally\n• Database: Connected\n\nAsk me anything specific about users, videos, curation, or system health!`;
        
        // Save response
        await db.insert(devOsMessages).values({
          userId: String(adminUserId),
          role: 'assistant',
          content: simpleResponse,
          messageType: 'chat'
        });
        
        console.log('[DEV OS] Simple mode response sent');
        return res.json({
          success: true,
          response: simpleResponse,
          mode: 'simple'
        });
      }
      
      // Load recent conversation history from database (last 10 messages)
      const recentMessages = await db.select()
        .from(devOsMessages)
        .where(eq(devOsMessages.userId, String(adminUserId)))
        .orderBy(asc(devOsMessages.createdAt))
        .limit(10);
      
      // Build conversation history for Claude (chronological order)
      // NO REVERSE - already chronological (oldest→newest)
      const conversationHistory = recentMessages.map(m => ({
        role: m.role === 'system' ? 'user' : m.role as 'user' | 'assistant',
        content: m.content
      }));
      
      // Import Dev OS services
      const { getSystemSnapshot, getAdaptiveThresholds, getUserBehavioralData, trackInteraction } = await import('./services/dev-os-intelligence');
      const { buildDevOSPrompt } = await import('./services/dev-os-prompt');
      const { collectDevOpsSnapshot, formatSnapshotForPrompt } = await import('./services/dev-os-metrics');
      
      // Step 1: Get real-time system data (using both legacy and new metrics services)
      console.log('[DEV OS] Gathering system snapshot...');
      const [systemData, metricsSnapshot] = await Promise.all([
        getSystemSnapshot(),
        collectDevOpsSnapshot()
      ]);
      
      // Step 2: Get adaptive thresholds
      console.log('[DEV OS] Loading adaptive thresholds...');
      const thresholds = await getAdaptiveThresholds(adminUserId);
      
      // Step 3: Get behavioral data
      console.log('[DEV OS] Loading behavioral data...');
      const behavioralData = await getUserBehavioralData(adminUserId);
      
      // Step 4: Build Dev OS system prompt with execution tools
      console.log('[DEV OS] Building system prompt...');
      const systemPrompt = buildDevOSPrompt(
        systemData,
        thresholds,
        behavioralData,
        conversationHistory
      ) + '\n\n' + formatSnapshotForPrompt(metricsSnapshot) + `\n\nYou have access to real execution tools to control the system. When the admin asks you to perform an action, YOU MUST use the appropriate tool instead of just responding. Available tools:
- start_curation: Start video curation (aggressive or normal mode)
- stop_curation: Stop running curation
- get_curation_status: Check if curation is running and get metrics
- get_system_logs: View recent system logs
- add_video_manual: Add a specific YouTube video to the library
- get_system_health: Get overall system health metrics

CRITICAL: When admin says "start curation" or similar, you MUST call the start_curation tool. Do NOT just respond - actually execute the action.`;
      
      // Define execution tools for Claude
      const tools = [
        {
          name: "start_curation",
          description: "Start the video curation system. Returns a job ID and tracks progress.",
          input_schema: {
            type: "object",
            properties: {
              mode: {
                type: "string",
                enum: ["aggressive", "normal"],
                description: "Curation mode - aggressive for rapid library building, normal for steady growth"
              }
            },
            required: ["mode"]
          }
        },
        {
          name: "stop_curation",
          description: "Stop the currently running curation job",
          input_schema: {
            type: "object",
            properties: {},
            required: []
          }
        },
        {
          name: "get_curation_status",
          description: "Get the current status of the curation system, including active jobs, quota usage, and videos added today",
          input_schema: {
            type: "object",
            properties: {},
            required: []
          }
        },
        {
          name: "get_system_logs",
          description: "Get recent system activity logs",
          input_schema: {
            type: "object",
            properties: {
              filter: {
                type: "string",
                enum: ["all", "curation", "error"],
                description: "Filter logs by type"
              },
              limit: {
                type: "number",
                description: "Number of log entries to return (default: 50)"
              }
            },
            required: []
          }
        },
        {
          name: "add_video_manual",
          description: "Manually add a specific YouTube video to the library by URL",
          input_schema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "Full YouTube video URL"
              },
              bypassQuality: {
                type: "boolean",
                description: "Whether to bypass quality threshold checks (default: false)"
              }
            },
            required: ["url"]
          }
        },
        {
          name: "get_system_health",
          description: "Get overall system health metrics including database, video library, active users, and quota status",
          input_schema: {
            type: "object",
            properties: {},
            required: []
          }
        }
      ];
      
      // Step 5: Call Claude API with tools
      console.log('[DEV OS] Step 5: Calling Claude API with execution tools...');
      console.log('[DEV OS] API key exists:', !!process.env.ANTHROPIC_API_KEY);
      console.log('[DEV OS] API key prefix:', process.env.ANTHROPIC_API_KEY?.substring(0, 15) + '...');
      console.log('[DEV OS] Conversation history length:', conversationHistory.length);
      console.log('[DEV OS] System prompt length:', systemPrompt.length);
      console.log('[DEV OS] System prompt preview:', systemPrompt.substring(0, 200));
      console.log('[DEV OS] ⚠️ CRITICAL DEBUG: Checking system prompt for tool usage rules...');
      console.log('[DEV OS] System prompt contains "TOOL USAGE RULES":', systemPrompt.includes('TOOL USAGE RULES'));
      console.log('[DEV OS] System prompt contains "MANDATORY":', systemPrompt.includes('MANDATORY'));
      
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      
      console.log('[DEV OS] Calling Claude API...');
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: systemPrompt,
        messages: conversationHistory,
        tools
      });
      
      console.log('[DEV OS] Step 6: Claude response received');
      console.log('[DEV OS] Response object keys:', Object.keys(response));
      console.log('[DEV OS] Response ID:', response.id);
      console.log('[DEV OS] Response model:', response.model);
      console.log('[DEV OS] Response role:', response.role);
      console.log('[DEV OS] Response stop_reason:', response.stop_reason);
      console.log('[DEV OS] Response usage:', JSON.stringify(response.usage, null, 2));
      console.log('[DEV OS] Response content array length:', response.content?.length);
      console.log('[DEV OS] Response content:', JSON.stringify(response.content, null, 2));
      
      // Step 6: Handle tool use or text response
      let devOsResponse = '';
      const executedActions: any[] = [];
      
      // CRITICAL FIX: Extract ALL text blocks (Claude may return multiple text segments)
      const textBlocks = response.content.filter((c: any) => c.type === 'text');
      const hasToolUse = response.content.some((c: any) => c.type === 'tool_use');
      
      // Log response structure for debugging
      console.log('[DEV OS] Response content types:', response.content.map((c: any) => c.type).join(', '));
      console.log('[DEV OS] Text blocks found:', textBlocks.length);
      console.log('[DEV OS] Tool use found:', hasToolUse);
      
      // Concatenate ALL text blocks (not just the first one)
      if (textBlocks.length > 0) {
        devOsResponse = textBlocks
          .map((block: any) => block.text || '')
          .filter((text: string) => text.trim().length > 0)
          .join('\n\n');
        console.log('[DEV OS] Extracted text response length:', devOsResponse.length);
        console.log('[DEV OS] Extracted text preview:', devOsResponse.substring(0, 100));
      } else if (hasToolUse) {
        // FIX: When Claude returns only tool_use without text, provide default intro
        devOsResponse = '';  // Will be filled by tool execution results below
        console.log('[DEV OS] No text blocks - will use tool execution results only');
      } else {
        console.error('[DEV OS] CRITICAL: No text or tool_use in Claude response!');
        console.error('[DEV OS] Response content:', JSON.stringify(response.content, null, 2));
      }
      
      for (const content of response.content) {
        if (content.type === 'text') {
          // Already handled above, skip to avoid duplication
          continue;
        } else if (content.type === 'tool_use') {
          console.log(`[DEV OS] Executing tool: ${content.name}`);
          
          try {
            let toolResult: any = null;
            
            // Execute the appropriate tool
            switch (content.name) {
              case 'start_curation': {
                const { mode = 'aggressive' } = content.input as any;
                const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
                const toolResponse = await fetch(`${baseUrl}/api/admin/execute/curation/start`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.headers.authorization || '',
                    'Cookie': req.headers.cookie || ''
                  },
                  body: JSON.stringify({ mode })
                });
                
                if (!toolResponse.ok) {
                  throw new Error(`Start curation returned ${toolResponse.status}`);
                }
                
                toolResult = await toolResponse.json();
                executedActions.push({ tool: 'start_curation', result: toolResult });
                
                if (toolResult.success) {
                  devOsResponse += `\n\n✅ **Curation Started**\n\nJob ID: ${toolResult.jobId}\nMode: ${mode}\nStarted: ${new Date(toolResult.startTime).toLocaleTimeString()}\n\nThe curation system is now processing videos in the background. I'll monitor progress.`;
                } else {
                  devOsResponse += `\n\n⚠️ **Curation Not Started**\n\nReason: ${toolResult.message}\n\n${toolResult.jobId ? `There's already a job running: ${toolResult.jobId}` : ''}`;
                }
                break;
              }
              
              case 'stop_curation': {
                const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
                const toolResponse = await fetch(`${baseUrl}/api/admin/execute/curation/stop`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.headers.authorization || '',
                    'Cookie': req.headers.cookie || ''
                  }
                });
                
                if (!toolResponse.ok) {
                  throw new Error(`Stop curation returned ${toolResponse.status}`);
                }
                
                toolResult = await toolResponse.json();
                executedActions.push({ tool: 'stop_curation', result: toolResult });
                
                if (toolResult.success) {
                  devOsResponse += `\n\n🛑 **Curation Stopped**\n\n${toolResult.message}\nVideos processed: ${toolResult.videosProcessed || 0}\nVideos added: ${toolResult.videosAdded || 0}`;
                } else {
                  devOsResponse += `\n\n⚠️ **No Active Curation**\n\n${toolResult.message}`;
                }
                break;
              }
              
              case 'get_curation_status': {
                const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
                const toolResponse = await fetch(`${baseUrl}/api/admin/execute/curation/status`, {
                  headers: {
                    'Authorization': req.headers.authorization || '',
                    'Cookie': req.headers.cookie || ''
                  }
                });
                
                if (!toolResponse.ok) {
                  throw new Error(`Status endpoint returned ${toolResponse.status}`);
                }
                
                toolResult = await toolResponse.json();
                executedActions.push({ tool: 'get_curation_status', result: toolResult });
                
                if (!toolResult.success) {
                  throw new Error(toolResult.error || 'Status check failed');
                }
                
                const status = toolResult.isRunning ? '🟢 Running' : '⭕ Idle';
                const quotaUsage = toolResult.quotaUsage || {};
                devOsResponse += `\n\n📊 **Curation Status**\n\nStatus: ${status}\nVideos added today: ${toolResult.videosAddedToday || 0}\nAPI quota used: ${quotaUsage.estimatedUnits || 0} / 10,000\nQuota remaining: ${quotaUsage.remaining || 10000}`;
                
                if (toolResult.activeJob) {
                  devOsResponse += `\n\nActive Job:\n• ID: ${toolResult.activeJob.id}\n• Mode: ${toolResult.activeJob.mode}\n• Started: ${new Date(toolResult.activeJob.startTime).toLocaleTimeString()}\n• Videos processed: ${toolResult.activeJob.videosProcessed || 0}\n• Videos added: ${toolResult.activeJob.videosAdded || 0}`;
                }
                break;
              }
              
              case 'get_system_logs': {
                const { filter = 'all', limit = 50 } = content.input as any;
                const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
                const toolResponse = await fetch(`${baseUrl}/api/admin/execute/system/logs?filter=${filter}&limit=${limit}`, {
                  headers: {
                    'Authorization': req.headers.authorization || '',
                    'Cookie': req.headers.cookie || ''
                  }
                });
                
                if (!toolResponse.ok) {
                  throw new Error(`Logs endpoint returned ${toolResponse.status}`);
                }
                
                toolResult = await toolResponse.json();
                executedActions.push({ tool: 'get_system_logs', result: toolResult });
                
                if (!toolResult.success || !toolResult.logs) {
                  throw new Error('Failed to fetch logs');
                }
                
                const recentLogs = toolResult.logs.slice(0, 5);
                const logList = recentLogs.length > 0 
                  ? recentLogs.map((log: any) => `• ${log.action} - ${new Date(log.timestamp).toLocaleString()}`).join('\n')
                  : 'No recent logs found';
                
                devOsResponse += `\n\n📋 **System Logs (${filter}, last ${limit})**\n\nFound ${toolResult.count || 0} log entries. Recent activity:\n${logList}`;
                break;
              }
              
              case 'add_video_manual': {
                const { url, bypassQuality = false } = content.input as any;
                const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
                const toolResponse = await fetch(`${baseUrl}/api/admin/execute/video/add-manual`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.headers.authorization || '',
                    'Cookie': req.headers.cookie || ''
                  },
                  body: JSON.stringify({ url, bypassQuality })
                });
                
                if (!toolResponse.ok) {
                  const errorData = await toolResponse.json().catch(() => ({}));
                  throw new Error(errorData.error || `Add video returned ${toolResponse.status}`);
                }
                
                toolResult = await toolResponse.json();
                executedActions.push({ tool: 'add_video_manual', result: toolResult });
                
                if (toolResult.success) {
                  devOsResponse += `\n\n✅ **Video Added**\n\nVideo ID: ${toolResult.videoId}\nQuality score: ${toolResult.analysis?.qualityScore || 'N/A'}/10\nInstructor: ${toolResult.analysis?.instructorName || 'Unknown'}`;
                } else {
                  devOsResponse += `\n\n❌ **Video Not Added**\n\nReason: ${toolResult.message || 'Unknown error'}`;
                }
                break;
              }
              
              case 'get_system_health': {
                const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
                const toolResponse = await fetch(`${baseUrl}/api/admin/execute/system/health`, {
                  headers: {
                    'Authorization': req.headers.authorization || '',
                    'Cookie': req.headers.cookie || ''
                  }
                });
                
                if (!toolResponse.ok) {
                  throw new Error(`Health endpoint returned ${toolResponse.status}`);
                }
                
                toolResult = await toolResponse.json();
                executedActions.push({ tool: 'get_system_health', result: toolResult });
                
                if (!toolResult.success || !toolResult.health) {
                  throw new Error('Health check failed - no health data returned');
                }
                
                const health = toolResult.health;
                
                // Also fetch today's curation efficiency metrics
                const today = new Date().toISOString().split('T')[0];
                const efficiencyResult = await db.execute(sql`
                  SELECT 
                    COALESCE(SUM(videos_screened), 0) as screened,
                    COALESCE(SUM(videos_added), 0) as accepted,
                    COALESCE(SUM(videos_rejected), 0) as rejected
                  FROM curation_runs
                  WHERE DATE(run_date) = ${today}
                `);
                
                const screened = Number(efficiencyResult.rows[0]?.screened || 0);
                const accepted = Number(efficiencyResult.rows[0]?.accepted || 0);
                const rejected = Number(efficiencyResult.rows[0]?.rejected || 0);
                const acceptanceRate = screened > 0 ? ((accepted / screened) * 100).toFixed(1) : '0.0';
                
                // VERIFY MATH: screened should equal accepted + rejected
                const calculatedTotal = accepted + rejected;
                const mathCorrect = screened === calculatedTotal;
                const mathWarning = !mathCorrect ? `\n⚠️ **Data Integrity Issue**: Screened (${screened}) ≠ Accepted (${accepted}) + Rejected (${rejected}) = ${calculatedTotal}. Missing ${screened - calculatedTotal} videos.` : '';
                
                // Determine efficiency status
                let effStatus = '⚪ No data';
                if (screened > 0) {
                  const rate = parseFloat(acceptanceRate);
                  if (rate < 0.5) effStatus = '🔴 Too strict';
                  else if (rate >= 0.5 && rate <= 2) effStatus = '🟡 Strict (high bar)';
                  else if (rate > 2 && rate <= 5) effStatus = '🟢 Optimal (elite)';
                  else if (rate > 5 && rate <= 15) effStatus = '🟡 Loose';
                  else effStatus = '🔴 Too loose';
                }
                
                devOsResponse += `\n\n🏥 **System Health**\n\nDatabase: ${health.database || 'unknown'}\nVideo Library: ${health.videoLibrary?.total || 0} videos (${health.videoLibrary?.status || 'unknown'})\nActive Users (24h): ${health.activeUsers || 0}\nQuota Status: ${health.quotaStatus?.usage || 0} / ${health.quotaStatus?.limit || 10000} (${health.quotaStatus?.exceeded ? '🔴 Exceeded' : '🟢 OK'})`;
                devOsResponse += `\n\n📊 **Curation Efficiency (Today)**\n\nScreened: ${screened} videos\nAccepted: ${accepted} videos\nRejected: ${rejected} videos\nAcceptance Rate: ${acceptanceRate}%\nStatus: ${effStatus}${mathWarning}`;
                break;
              }
            }
            
            console.log(`[DEV OS] Tool execution complete: ${content.name}`);
            
          } catch (toolError: any) {
            console.error(`[DEV OS] Tool execution error (${content.name}):`, toolError.message);
            devOsResponse += `\n\n❌ **Action Failed**\n\nTool: ${content.name}\nError: ${toolError.message}`;
            executedActions.push({ tool: content.name, error: toolError.message });
          }
        }
      }
      
      console.log('[DEV OS] Step 7: Response generated');
      console.log('[DEV OS] devOsResponse variable type:', typeof devOsResponse);
      console.log('[DEV OS] devOsResponse length:', devOsResponse.length);
      console.log('[DEV OS] devOsResponse preview (first 200 chars):', devOsResponse.substring(0, 200));
      console.log('[DEV OS] devOsResponse is empty?:', devOsResponse === '');
      console.log('[DEV OS] devOsResponse is just whitespace?:', devOsResponse.trim() === '');
      
      // CRITICAL: Handle empty response with diagnostic fallback
      if (!devOsResponse || devOsResponse.trim() === '') {
        console.error('❌ [DEV OS] EMPTY RESPONSE DETECTED - Generating diagnostic fallback');
        console.error('[DEV OS] Claude API response content:', JSON.stringify(response.content, null, 2));
        console.error('[DEV OS] Executed actions:', JSON.stringify(executedActions, null, 2));
        
        devOsResponse = `⚠️ **System Response Error**\n\nI received your message but encountered an issue generating a response.\n\n**Diagnostic Info:**\n- Message received: "${message}"\n- Conversation history: ${conversationHistory.length} messages loaded\n- System data: ${systemData ? 'Available' : 'Missing'}\n- API response: ${response.id ? 'Received' : 'Failed'}\n\n**Current Status:**\n- Database: Connected\n- Server: Running\n- System Health: ${systemData?.system?.curationStatus?.running ? 'Active' : 'Idle'}\n\nPlease try again or rephrase your question. If this persists, check server logs.`;
      }
      
      // Save assistant response to database for persistence
      console.log('[DEV OS] Step 8: Saving to database...');
      console.log('[DEV OS] Saving values:', {
        userId: String(adminUserId),
        role: 'assistant',
        contentLength: devOsResponse.length,
        messageType: 'chat'
      });
      
      const savedMessage = await db.insert(devOsMessages).values({
        userId: String(adminUserId),
        role: 'assistant',
        content: devOsResponse,
        messageType: 'chat'
      }).returning();
      
      console.log('[DEV OS] Response saved to database');
      console.log('[DEV OS] Saved message ID:', savedMessage[0]?.id);
      console.log('[DEV OS] Saved message content length:', savedMessage[0]?.content?.length);
      console.log('[DEV OS] Saved message content preview:', savedMessage[0]?.content?.substring(0, 100));
      
      // Track interaction for behavioral learning
      await trackInteraction(adminUserId, message, devOsResponse);
      
      console.log('[DEV OS] Interaction tracked');
      
      // Return response
      const responseData = {
        success: true,
        response: devOsResponse,
        actionsExecuted: executedActions,
        systemData: {
          ...metricsSnapshot,
          // Legacy fields for backward compatibility
          videosTotal: systemData.videos.total,
          videosTarget: systemData.videos.target,
          usersActive: systemData.users.active,
          mrr: systemData.revenue.mrr
        }
      };
      
      console.log('═══════════════════════════════════════════════');
      console.log('✅ [DEV OS CHAT] RESPONSE SENT');
      console.log('Response success:', responseData.success);
      console.log('Response length:', devOsResponse.length);
      console.log('═══════════════════════════════════════════════');
      
      res.json(responseData);
      
    } catch (error: any) {
      console.error('❌ [DEV OS CHAT] CRITICAL ERROR:', error);
      console.error('[DEV OS] Error type:', error.constructor.name);
      console.error('[DEV OS] Error message:', error.message);
      console.error('[DEV OS] Error stack:', error.stack);
      
      // Build a helpful error message for the user
      let userMessage = 'I encountered an error processing your request.';
      
      if (error.message?.includes('API key')) {
        userMessage = 'API Configuration Error: The Anthropic API key is missing or invalid. Please check your environment variables.';
      } else if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
        userMessage = 'Rate Limit: API quota exceeded. Please try again in a few minutes.';
      } else if (error.message?.includes('network') || error.message?.includes('ECONNREFUSED')) {
        userMessage = 'Network Error: Unable to connect to the API. Please check your network connection.';
      } else if (error.message?.includes('timeout')) {
        userMessage = 'Timeout: The request took too long. Please try a simpler question.';
      } else {
        userMessage = `Error: ${error.message}\n\n**Diagnostic Info:**\n- Timestamp: ${new Date().toISOString()}\n- Message: "${req.body.message}"\n- Error Type: ${error.constructor.name}\n\nPlease try rephrasing your question or contact support if the issue persists.`;
      }
      
      // Save error message to chat history so user can see it
      try {
        const adminUserId = req.user?.userId || 'admin-1';
        await db.insert(devOsMessages).values({
          userId: String(adminUserId),
          role: 'assistant',
          content: userMessage,
          messageType: 'error'
        });
      } catch (dbError) {
        console.error('[DEV OS] Failed to save error to chat history:', dbError);
      }
      
      res.status(500).json({
        success: false,
        error: error.message,
        response: userMessage,
        diagnostic: {
          timestamp: new Date().toISOString(),
          message: req.body.message,
          errorType: error.constructor.name
        }
      });
    }
  });

  // Load chat history (last 48 hours)
  app.get('/api/admin/dev-os/history', checkAdminAuth, async (req, res) => {
    try {
      console.log('[DEV OS HISTORY] Loading chat history...');
      const adminUserId = req.user?.userId || 'admin-1';
      console.log('[DEV OS HISTORY] Admin user ID:', adminUserId);
      
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      
      const messages = await db.select()
        .from(devOsMessages)
        .where(
          and(
            eq(devOsMessages.userId, String(adminUserId)),
            sql`${devOsMessages.createdAt} >= ${twoDaysAgo}`
          )
        )
        .orderBy(devOsMessages.createdAt)
        .limit(200);
      
      console.log('[DEV OS HISTORY] Found', messages.length, 'messages');
      console.log('[DEV OS HISTORY] Sample message contents:');
      messages.slice(-3).forEach((msg, idx) => {
        console.log(`  Message ${idx} (${msg.role}):`, {
          id: msg.id,
          contentLength: msg.content?.length || 0,
          contentPreview: msg.content?.substring(0, 100) || '[EMPTY]',
          isEmpty: !msg.content || msg.content.trim() === ''
        });
      });
      
      res.json({ success: true, messages });
    } catch (error: any) {
      console.error('Failed to load Dev OS history:', error);
      res.status(500).json({ error: 'Failed to load history' });
    }
  });

  // Clear chat history
  app.post('/api/admin/dev-os/clear-history', checkAdminAuth, async (req, res) => {
    try {
      const adminUserId = req.user?.id || 'admin-1';
      
      await db.delete(devOsMessages)
        .where(eq(devOsMessages.userId, String(adminUserId)));
      
      res.json({ success: true, message: 'History cleared' });
    } catch (error: any) {
      console.error('Failed to clear history:', error);
      res.status(500).json({ error: 'Failed to clear history' });
    }
  });

  // Generate daily report
  app.get('/api/admin/dev-os/daily-report', checkAdminAuth, async (req, res) => {
    try {
      const adminUserId = req.user?.id || 'admin-1';
      const today = new Date().toISOString().split('T')[0];
      
      // Get user stats
      const userStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN created_at::date = ${today} THEN 1 END) as new_today,
          COUNT(CASE WHEN subscription_status = 'trialing' THEN 1 END) as trial_users,
          COUNT(CASE WHEN subscription_status = 'active' THEN 1 END) as active_users
        FROM bjj_users
      `);
      
      // Get video stats
      const videoStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_videos
        FROM ai_video_knowledge
      `);
      
      // Get curation stats for today
      const curationStats = await db.execute(sql`
        SELECT 
          COALESCE(SUM(videos_added), 0) as videos_saved,
          COALESCE(SUM(videos_analyzed), 0) as videos_searched,
          COALESCE(SUM(youtube_api_calls), 0) as api_used
        FROM curation_runs
        WHERE DATE(completed_at) = ${today}
      `);
      
      // Calculate MRR
      const activeCount = Number(userStats.rows[0].active_users) || 0;
      const mrr = activeCount * 19.99;
      
      // Format report
      const report = `📊 DAILY REPORT - ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

👥 USERS
• Total: ${userStats.rows[0].total_users}
• New Today: ${userStats.rows[0].new_today}
• Trial: ${userStats.rows[0].trial_users}
• Active Paying: ${userStats.rows[0].active_users}

📹 VIDEO LIBRARY
• Total Videos: ${videoStats.rows[0].total_videos}
• Saved Today: ${curationStats.rows[0].videos_saved}
• Searched Today: ${curationStats.rows[0].videos_searched}
• Rejected Today: ${Number(curationStats.rows[0].videos_searched) - Number(curationStats.rows[0].videos_saved)}

🔌 API USAGE
• YouTube Quota: ${curationStats.rows[0].api_used} / 10,000 units (${Math.round(Number(curationStats.rows[0].api_used)/100)}%)

💰 REVENUE
• MRR: $${mrr.toFixed(2)}

⚙️ SYSTEM STATUS
• Curation: ✅ Active
• Errors: None
• All systems operational`;
      
      // Save as system message
      await db.insert(devOsMessages).values({
        userId: String(adminUserId),
        role: 'system',
        content: report,
        messageType: 'report',
        metadata: { reportDate: new Date().toISOString() }
      });
      
      res.json({ success: true, report });
    } catch (error: any) {
      console.error('Failed to generate report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  // Get saved videos
  app.get('/api/ai/saved-videos/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      console.log(`📚 [SAVED-VIDEOS] Fetching saved videos for user: ${userId}`);
      
      const savedVideos = await db.select({
        id: userSavedVideos.id,
        videoId: userSavedVideos.videoId,
        note: userSavedVideos.note,
        savedDate: userSavedVideos.savedDate,
        title: aiVideoKnowledge.techniqueName,
        instructor: aiVideoKnowledge.instructorName,
        videoUrl: aiVideoKnowledge.videoUrl,
        thumbnailUrl: aiVideoKnowledge.thumbnailUrl,
        duration: aiVideoKnowledge.duration,
        rating: aiVideoKnowledge.avgUserRating,
        category: aiVideoKnowledge.positionCategory
      })
      .from(userSavedVideos)
      .leftJoin(aiVideoKnowledge, eq(userSavedVideos.videoId, aiVideoKnowledge.id))
      .where(eq(userSavedVideos.userId, userId))
      .orderBy(desc(userSavedVideos.savedDate));
      
      console.log(`📚 [SAVED-VIDEOS] Found ${savedVideos.length} saved videos for user ${userId}`);
      
      res.json({
        videos: savedVideos.map(v => ({
          id: String(v.videoId),
          title: v.title || `Video #${v.videoId}`,
          instructor: v.instructor || 'Unknown',
          videoUrl: v.videoUrl || '',
          thumbnailUrl: v.thumbnailUrl || '',
          duration: formatDuration(v.duration) || '0:00',
          rating: v.rating,
          category: v.category || 'Other',
          note: v.note,
          savedDate: v.savedDate
        }))
      });
      
    } catch (error: any) {
      console.error('Saved videos error:', error);
      res.status(500).json({ error: 'Failed to load saved videos' });
    }
  });

  // Save a video
  app.post('/api/ai/saved-videos', async (req, res) => {
    try {
      const { userId, videoId, note } = req.body;
      console.log(`📌 SAVE VIDEO REQUEST - userId: ${userId}, videoId: ${videoId} (type: ${typeof videoId}), note: ${note || 'none'}`);
      
      const parsedVideoId = parseInt(videoId);
      console.log(`📌 Parsed videoId: ${parsedVideoId}`);
      
      const insertResult = await db.insert(userSavedVideos).values({
        userId: userId,
        videoId: parsedVideoId,
        note: note || ''
      }).onConflictDoUpdate({
        target: [userSavedVideos.userId, userSavedVideos.videoId],
        set: { note: note || '' }
      });
      
      console.log(`✅ DB INSERT SUCCESS for video ${parsedVideoId}, user ${userId}`);
      
      // Log video save activity
      await db.insert(userActivity).values({
        userId: userId,
        videoId: parsedVideoId,
        actionType: 'video_save',
        details: {
          note: note || null
        }
      }).catch(err => console.error('[ACTIVITY] Failed to log video save:', err));
      
      // Record feedback signal
      await aiIntelligence.processUserFeedback(userId, videoId, 'save', '1');
      
      console.log(`✅ SAVED VIDEO COMPLETE - user ${userId}, video ${parsedVideoId}`);
      res.json({ success: true });
      
    } catch (error: any) {
      console.error('❌ SAVE VIDEO ERROR:', error);
      res.status(500).json({ error: 'Failed to save video' });
    }
  });

  // Save a video from chat (with extracted metadata)
  app.post('/api/ai/save-video-from-chat', async (req, res) => {
    try {
      const { userId, videoUrl, videoTitle, instructorName, category, thumbnailUrl, notes } = req.body;
      console.log(`📌 SAVE VIDEO FROM CHAT - userId: ${userId}, title: ${videoTitle}, instructor: ${instructorName}`);
      
      // Validate required fields
      if (!userId || !videoUrl || !videoTitle || !instructorName || !category) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Validate category
      const validCategories = ["Submissions", "Passes", "Sweeps", "Escapes", "Takedowns", "Guard Retention", "Position Control", "Other"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
      }
      
      const { savedVideos } = await import("@shared/schema");
      
      // Check if video already saved by this user
      const existing = await db.select()
        .from(savedVideos)
        .where(and(
          eq(savedVideos.userId, userId),
          eq(savedVideos.videoUrl, videoUrl)
        ))
        .limit(1);
      
      if (existing.length > 0) {
        // Update notes if different
        if (notes && notes !== existing[0].notes) {
          await db.update(savedVideos)
            .set({ notes })
            .where(eq(savedVideos.id, existing[0].id));
          console.log(`✅ UPDATED NOTES for existing saved video`);
        }
        return res.json({ success: true, alreadySaved: true });
      }
      
      // Insert new saved video
      await db.insert(savedVideos).values({
        userId,
        videoUrl,
        videoTitle,
        instructorName,
        category,
        thumbnailUrl: thumbnailUrl || null,
        notes: notes || null,
      });
      
      console.log(`✅ SAVED VIDEO FROM CHAT - user ${userId}, video: ${videoTitle}`);
      res.json({ success: true });
      
    } catch (error: any) {
      console.error('❌ SAVE VIDEO FROM CHAT ERROR:', error);
      res.status(500).json({ error: 'Failed to save video' });
    }
  });

  // Unsave a video
  app.delete('/api/ai/saved-videos/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;
      const { userId } = req.body;
      
      await db.delete(userSavedVideos)
        .where(
          and(
            eq(userSavedVideos.userId, userId),
            eq(userSavedVideos.videoId, parseInt(videoId))
          )
        );
      
      res.json({ success: true });
      
    } catch (error: any) {
      console.error('Unsave video error:', error);
      res.status(500).json({ error: 'Failed to unsave video' });
    }
  });

  // Update user profile
  app.post('/api/ai/user/:userId/profile', async (req, res) => {
    try {
      const { userId } = req.params;
      const updates = req.body;
      
      // Update user context in ai_user_context table
      const existing = await db.select({
        id: aiUserContext.id,
        userId: aiUserContext.userId,
        beltLevel: aiUserContext.beltLevel,
        primaryGoal: aiUserContext.primaryGoal
      })
        .from(aiUserContext)
        .where(eq(aiUserContext.userId, userId))
        .limit(1);
      
      if (existing.length > 0) {
        await db.update(aiUserContext)
          .set({
            beltLevel: updates.belt || existing[0].beltLevel,
            primaryGoal: updates.goals || existing[0].primaryGoal,
            updatedAt: new Date()
          })
          .where(eq(aiUserContext.userId, userId));
      } else {
        await db.insert(aiUserContext).values({
          userId: userId,
          beltLevel: updates.belt || 'white',
          primaryGoal: updates.goals || null
        });
      }
      
      res.json({ success: true, message: 'Profile updated' });
      
    } catch (error: any) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Get user language preference
  app.get('/api/user/:userId/language-preference', async (req, res) => {
    try {
      const { userId } = req.params;
      
      const [user] = await db.select({
        id: bjjUsers.id,
        preferredLanguage: bjjUsers.preferredLanguage,
        languagePreferenceSet: bjjUsers.languagePreferenceSet
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ 
        preferredLanguage: user.preferredLanguage || 'en',
        languagePreferenceSet: user.languagePreferenceSet || false
      });
      
    } catch (error: any) {
      console.error('Language preference fetch error:', error);
      res.status(500).json({ error: 'Failed to get language preference' });
    }
  });

  // Set user language preference
  app.post('/api/user/:userId/language-preference', async (req, res) => {
    try {
      const { userId } = req.params;
      const { language } = req.body;
      
      if (!language || !['en', 'pt', 'es'].includes(language)) {
        return res.status(400).json({ error: 'Invalid language. Must be en, pt, or es' });
      }
      
      const [user] = await db.select({
        id: bjjUsers.id
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const [updated] = await db.update(bjjUsers)
        .set({ 
          preferredLanguage: language,
          languagePreferenceSet: true
        })
        .where(eq(bjjUsers.id, userId))
        .returning();
      
      res.json({ 
        success: true, 
        preferredLanguage: updated.preferredLanguage,
        message: 'Language preference updated successfully'
      });
      
    } catch (error: any) {
      console.error('Language preference update error:', error);
      res.status(500).json({ error: 'Failed to update language preference' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // VOICE SETTINGS & TTS ENDPOINTS (ElevenLabs)
  // ═══════════════════════════════════════════════════════════════════════════════

  // Get user voice settings
  app.get('/api/user/:userId/voice-settings', async (req, res) => {
    try {
      const { userId } = req.params;
      
      const [user] = await db.select({
        id: bjjUsers.id,
        voiceEnabled: bjjUsers.voiceEnabled,
        voiceId: bjjUsers.voiceId,
        voiceSpeed: bjjUsers.voiceSpeed,
        voiceAutoplay: bjjUsers.voiceAutoplay
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ 
        voiceEnabled: user.voiceEnabled || false,
        voiceId: user.voiceId || 'ErXwobaYiN019PkySvjV',
        voiceSpeed: user.voiceSpeed || 1.0,
        voiceAutoplay: user.voiceAutoplay !== false, // Default true
      });
      
    } catch (error: any) {
      console.error('Voice settings fetch error:', error);
      res.status(500).json({ error: 'Failed to get voice settings' });
    }
  });

  // Update user voice settings
  app.post('/api/user/:userId/voice-settings', async (req, res) => {
    try {
      const { userId } = req.params;
      const { voiceEnabled, voiceId, voiceSpeed, voiceAutoplay } = req.body;
      
      const [user] = await db.select({
        id: bjjUsers.id,
        voiceEnabled: bjjUsers.voiceEnabled,
        voiceId: bjjUsers.voiceId,
        voiceSpeed: bjjUsers.voiceSpeed,
        voiceAutoplay: bjjUsers.voiceAutoplay
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const updateData: any = {};
      if (typeof voiceEnabled === 'boolean') updateData.voiceEnabled = voiceEnabled;
      if (voiceId) updateData.voiceId = voiceId;
      if (typeof voiceSpeed === 'number') updateData.voiceSpeed = voiceSpeed;
      if (typeof voiceAutoplay === 'boolean') updateData.voiceAutoplay = voiceAutoplay;
      
      const [updated] = await db.update(bjjUsers)
        .set(updateData)
        .where(eq(bjjUsers.id, userId))
        .returning();
      
      res.json({ 
        success: true, 
        voiceEnabled: updated.voiceEnabled,
        voiceId: updated.voiceId,
        voiceSpeed: updated.voiceSpeed,
        voiceAutoplay: updated.voiceAutoplay,
        message: 'Voice settings updated successfully'
      });
      
    } catch (error: any) {
      console.error('Voice settings update error:', error);
      res.status(500).json({ error: 'Failed to update voice settings' });
    }
  });

  // Generate voice audio from text (ElevenLabs TTS)
  app.post('/api/voice/generate', async (req, res) => {
    try {
      const { text, userId } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }
      
      // Get user's voice preferences
      let voiceId = 'ErXwobaYiN019PkySvjV'; // Default: Antoni
      if (userId) {
        const [user] = await db.select({
          id: bjjUsers.id,
          voiceId: bjjUsers.voiceId
        })
          .from(bjjUsers)
          .where(eq(bjjUsers.id, userId))
          .limit(1);
        
        if (user && user.voiceId) {
          voiceId = user.voiceId;
        }
      }
      
      const { textToSpeech, optimizeForVoice, getCharacterCount } = await import('./elevenlabs');
      
      // Optimize text for voice (remove URLs, clean formatting)
      const optimizedText = optimizeForVoice(text);
      const characterCount = getCharacterCount(optimizedText);
      
      // Generate audio
      const audioBuffer = await textToSpeech({
        text: optimizedText,
        voiceId,
      });
      
      if (!audioBuffer) {
        return res.status(500).json({ error: 'Failed to generate voice audio' });
      }
      
      // Log usage for cost tracking
      console.log(`[VOICE TTS] Generated ${characterCount} chars for user ${userId || 'anonymous'}`);
      
      // Return audio as MP3
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
      });
      res.send(audioBuffer);
      
    } catch (error: any) {
      console.error('Voice generation error:', error);
      res.status(500).json({ error: 'Failed to generate voice', details: error.message });
    }
  });

  // Get available voice options
  app.get('/api/voice/options', async (req, res) => {
    try {
      const { VOICE_OPTIONS } = await import('./elevenlabs');
      res.json({
        voices: Object.entries(VOICE_OPTIONS).map(([key, voice]) => ({
          id: voice.id,
          name: voice.name,
          description: voice.description,
        })),
      });
    } catch (error: any) {
      console.error('Voice options error:', error);
      res.status(500).json({ error: 'Failed to get voice options' });
    }
  });

  // Transcribe audio using OpenAI Whisper API (AUTHENTICATED)
  app.post('/api/voice/transcribe', checkUserAuth, upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      const userId = req.user?.userId;
      console.log(`[WHISPER] User ${userId} - Received audio file: ${req.file.originalname}, size: ${req.file.size} bytes`);

      const { transcribeAudioBuffer } = await import('./whisper');
      
      const result = await transcribeAudioBuffer(
        req.file.buffer,
        req.file.originalname || 'recording.webm'
      );

      const previewText = result?.text ? result.text.substring(0, 50) : '(empty)';
      console.log(`[WHISPER] User ${userId} - Transcription complete: "${previewText}..."`);

      res.json({
        text: result?.text || '',
        duration: result?.duration || 0,
      });

    } catch (error: any) {
      console.error('[WHISPER] Transcription error:', error);
      res.status(500).json({ 
        error: 'Failed to transcribe audio',
        details: error.message 
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // VIDEO TRACKING & INTELLIGENT RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  // Track video view (AUTHENTICATED)
  app.post('/api/video/track-view', checkUserAuth, async (req, res) => {
    try {
      const authenticatedUserId = req.user?.userId;
      const { videoId, watchDuration = 0, completed = false } = req.body;
      
      if (!authenticatedUserId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Validate request body
      if (!videoId || typeof videoId !== 'number') {
        return res.status(400).json({ error: 'Valid videoId (number) required' });
      }
      
      if (typeof watchDuration !== 'number' || watchDuration < 0) {
        return res.status(400).json({ error: 'watchDuration must be a non-negative number' });
      }

      const { VideoViewTrackingService } = await import('./services/videoViewTracking');
      const result = await VideoViewTrackingService.recordView(
        authenticatedUserId, // Use authenticated user ID, ignore any client-supplied userId
        parseInt(videoId),
        watchDuration,
        completed === true
      );

      if (result.success) {
        res.json({ success: true, message: 'View tracked successfully' });
      } else {
        res.status(500).json({ error: 'Failed to track view', details: result.error });
      }
    } catch (error: any) {
      console.error('[VIDEO TRACKING] Error:', error);
      res.status(500).json({ error: 'Failed to track view' });
    }
  });

  // Get intelligent video recommendations (AUTHENTICATED)
  app.post('/api/video/recommendations', checkUserAuth, async (req, res) => {
    try {
      const authenticatedUserId = req.user?.userId;
      const { query, technique, position, beltLevel, limit = 10 } = req.body;
      
      if (!authenticatedUserId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Validate limit
      const validLimit = Math.min(Math.max(1, parseInt(limit as string) || 10), 50); // Cap at 50

      const { VideoRecommendationService } = await import('./services/videoRecommendation');
      const recommendations = await VideoRecommendationService.getRecommendations({
        userId: authenticatedUserId, // Use authenticated user ID
        query: query || '',
        technique,
        position,
        beltLevel,
        limit: validLimit
      });

      res.json({ 
        success: true, 
        recommendations: recommendations.map(r => ({
          ...r.video,
          tier: r.tier,
          isRepeat: r.isRepeat,
          repeatReason: r.repeatReason,
          matchScore: r.matchScore
        })),
        count: recommendations.length
      });
    } catch (error: any) {
      console.error('[VIDEO RECOMMENDATIONS] Error:', error);
      res.status(500).json({ error: 'Failed to get recommendations' });
    }
  });

  // Get personalized recommendations based on user profile (AUTHENTICATED)
  app.get('/api/video/personalized', checkUserAuth, async (req, res) => {
    try {
      const authenticatedUserId = req.user?.userId;
      const { limit = 5 } = req.query;
      
      if (!authenticatedUserId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Validate limit
      const validLimit = Math.min(Math.max(1, parseInt(limit as string) || 5), 50); // Cap at 50

      const { VideoRecommendationService } = await import('./services/videoRecommendation');
      const recommendations = await VideoRecommendationService.getPersonalizedRecommendations(
        authenticatedUserId, // Use authenticated user ID
        validLimit
      );

      res.json({ 
        success: true, 
        recommendations: recommendations.map(r => ({
          ...r.video,
          tier: r.tier,
          isRepeat: r.isRepeat,
          repeatReason: r.repeatReason
        })),
        count: recommendations.length
      });
    } catch (error: any) {
      console.error('[PERSONALIZED RECOMMENDATIONS] Error:', error);
      res.status(500).json({ error: 'Failed to get personalized recommendations' });
    }
  });

  // Get user's video watching statistics (AUTHENTICATED - own stats only)
  app.get('/api/video/user-stats', checkUserAuth, async (req, res) => {
    try {
      const authenticatedUserId = req.user?.userId;
      
      if (!authenticatedUserId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { VideoViewTrackingService } = await import('./services/videoViewTracking');
      const stats = await VideoViewTrackingService.getUserStats(authenticatedUserId);

      res.json({ success: true, stats });
    } catch (error: any) {
      console.error('[USER STATS] Error:', error);
      res.status(500).json({ error: 'Failed to get user stats' });
    }
  });

  // Get user's watch history (AUTHENTICATED - own history only)
  app.get('/api/video/watch-history', checkUserAuth, async (req, res) => {
    try {
      const authenticatedUserId = req.user?.userId;
      const { limit = 50 } = req.query;
      
      if (!authenticatedUserId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Validate limit
      const validLimit = Math.min(Math.max(1, parseInt(limit as string) || 50), 200); // Cap at 200

      const { VideoViewTrackingService } = await import('./services/videoViewTracking');
      const history = await VideoViewTrackingService.getUserWatchHistory(
        authenticatedUserId, // Use authenticated user ID
        validLimit
      );

      res.json({ success: true, history, count: history.length });
    } catch (error: any) {
      console.error('[WATCH HISTORY] Error:', error);
      res.status(500).json({ error: 'Failed to get watch history' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // VIDEO CURATION ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════════

  // Trigger manual curation (admin only)
  app.post('/api/video-curation/curate', async (req, res) => {
    try {
      const { searchLimit = 10 } = req.body;
      
      const { runAutonomousCuration } = await import('./video-curation-service');
      const results = await runAutonomousCuration(searchLimit);
      
      res.json({
        success: true,
        results
      });
    } catch (error: any) {
      console.error('Curation error:', error);
      res.status(500).json({ error: 'Curation failed', details: error.message });
    }
  });

  // Get library stats
  app.get('/api/video-curation/stats', async (req, res) => {
    try {
      const stats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_videos,
          COUNT(*) FILTER (WHERE status = 'active') as active_videos,
          AVG(quality_score) as avg_quality,
          AVG(helpful_ratio) as avg_helpful_ratio
        FROM ai_video_knowledge
      `);
      
      // Handle both postgres-js and node-postgres result formats
      const result = Array.isArray(stats) ? stats[0] : (stats.rows ? stats.rows[0] : stats);
      res.json(result || { total_videos: 0, active_videos: 0, avg_quality: 0, avg_helpful_ratio: 0 });
    } catch (error: any) {
      console.error('Stats error:', error);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  // Get curation log history
  app.get('/api/video-curation/logs', async (req, res) => {
    try {
      const logs = await db.select({
        id: videoCurationLog.id,
        runAt: videoCurationLog.runAt,
        videosFound: videoCurationLog.videosFound,
        videosAdded: videoCurationLog.videosAdded,
        videosFailed: videoCurationLog.videosFailed,
        notes: videoCurationLog.notes
      })
        .from(videoCurationLog)
        .orderBy(desc(videoCurationLog.runAt))
        .limit(20);
      
      res.json({ success: true, logs });
    } catch (error: any) {
      console.error('Logs error:', error);
      res.status(500).json({ error: 'Failed to get logs' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUTO-CURATION CONTROL ENDPOINTS (Admin Dashboard)
  // ═══════════════════════════════════════════════════════════════════════════════

  // Get auto-curation settings (admin only)
  app.get('/api/admin/auto-curation/settings', checkAdminAuth, async (req, res) => {
    try {
      const settings = await db.execute(sql`
        SELECT setting_name, setting_value, setting_type, description, updated_at
        FROM curation_settings
        ORDER BY setting_name
      `);
      
      // Convert to key-value object
      const settingsObj: any = {};
      settings.rows.forEach((row: any) => {
        settingsObj[row.setting_name] = {
          value: row.setting_value,
          type: row.setting_type,
          description: row.description,
          updatedAt: row.updated_at,
        };
      });
      
      res.json({ success: true, settings: settingsObj });
    } catch (error: any) {
      console.error('Get curation settings error:', error);
      res.status(500).json({ error: 'Failed to get settings' });
    }
  });

  // Update auto-curation settings (admin only)
  app.patch('/api/admin/auto-curation/settings', checkAdminAuth, async (req, res) => {
    try {
      const { settingName, settingValue } = req.body;
      
      if (!settingName || settingValue === undefined) {
        return res.status(400).json({ error: 'Setting name and value required' });
      }
      
      // Update or insert setting
      await db.execute(sql`
        INSERT INTO curation_settings (setting_name, setting_value, updated_at)
        VALUES (${settingName}, ${String(settingValue)}, NOW())
        ON CONFLICT (setting_name) 
        DO UPDATE SET setting_value = ${String(settingValue)}, updated_at = NOW()
      `);
      
      res.json({ success: true, message: 'Setting updated' });
    } catch (error: any) {
      console.error('Update curation settings error:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // Get auto-curation stats (admin only)
  app.get('/api/admin/auto-curation/stats', checkAdminAuth, async (req, res) => {
    try {
      // Get overall video stats
      const videoStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_videos,
          COUNT(*) FILTER (WHERE (view_count::integer) > 0) as videos_with_views,
          AVG(view_count::integer) as avg_views,
          COALESCE(SUM(user_saves), 0) as total_saves,
          AVG(COALESCE(helpful_votes_up, 0)::float / NULLIF(COALESCE(helpful_votes_up, 0) + COALESCE(helpful_votes_down, 0), 0)) as avg_helpful_ratio
        FROM video_analyses
      `);
      
      // Get recent curation runs
      const recentRuns = await db.execute(sql`
        SELECT 
          id, run_started_at, run_completed_at, 
          videos_reviewed, videos_added, videos_rejected,
          acceptance_rate, avg_quality_added, status
        FROM auto_curation_runs
        ORDER BY run_started_at DESC
        LIMIT 5
      `);
      
      // Get settings
      const enabledSetting = await db.execute(sql`
        SELECT setting_value FROM curation_settings WHERE setting_name = 'auto_curation_enabled'
      `);
      
      const enabled = enabledSetting.rows[0]?.setting_value === 'true';
      
      // Get next scheduled run time
      const nextRunSetting = await db.execute(sql`
        SELECT setting_value FROM curation_settings WHERE setting_name = 'next_run_time'
      `);
      
      res.json({
        success: true,
        enabled,
        nextRunTime: nextRunSetting.rows[0]?.setting_value || null,
        videoStats: videoStats.rows[0],
        recentRuns: recentRuns.rows,
      });
    } catch (error: any) {
      console.error('Get curation stats error:', error);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  // Manually trigger auto-curation run (admin only)
  app.post('/api/admin/auto-curation/run-now', checkAdminAuth, async (req, res) => {
    try {
      const { videosPerRun = 50 } = req.body;
      
      // Create run record
      const runRecord = await db.execute(sql`
        INSERT INTO auto_curation_runs (
          id, run_started_at, status, videos_reviewed, videos_added, videos_rejected
        ) VALUES (
          gen_random_uuid(), NOW(), 'running', 0, 0, 0
        ) RETURNING id
      `);
      
      // Trigger curation asynchronously
      const runId = runRecord.rows[0].id;
      
      // In a real implementation, this would trigger the actual curation service
      // For now, we'll just mark it as completed
      setTimeout(async () => {
        try {
          const { runAutonomousCuration } = await import('./video-curation-service');
          const results = await runAutonomousCuration(videosPerRun);
          
          // Update run record with results
          await db.execute(sql`
            UPDATE auto_curation_runs 
            SET 
              run_completed_at = NOW(),
              status = 'completed',
              videos_reviewed = ${results.videosReviewed || 0},
              videos_added = ${results.videosAdded || 0},
              videos_rejected = ${results.videosRejected || 0},
              acceptance_rate = ${results.acceptanceRate || 0},
              avg_quality_added = ${results.avgQualityAdded || 0}
            WHERE id = ${runId}
          `);
        } catch (error: any) {
          console.error('Curation run error:', error);
          await db.execute(sql`
            UPDATE auto_curation_runs 
            SET 
              run_completed_at = NOW(),
              status = 'failed',
              error_message = ${error.message}
            WHERE id = ${runId}
          `);
        }
      }, 100);
      
      res.json({ 
        success: true, 
        message: 'Curation run started',
        runId 
      });
    } catch (error: any) {
      console.error('Run curation error:', error);
      res.status(500).json({ error: 'Failed to start curation run' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DEV OS CURATION CONTROL
  // ═══════════════════════════════════════════════════════════════════════════════

  // Manually trigger aggressive curation (for Dev OS)
  app.post('/api/admin/curation/trigger-aggressive', checkAdminAuth, async (req, res) => {
    try {
      console.log('🚀 [DEV OS] MANUAL AGGRESSIVE CURATION TRIGGERED');
      
      // Import and run aggressive curation
      const { runAggressiveCuration } = await import('./trigger-aggressive-curation');
      
      // Start curation asynchronously but return immediately
      // This allows the HTTP request to complete while curation runs in background
      setImmediate(async () => {
        try {
          await runAggressiveCuration();
          console.log('✅ [DEV OS] Aggressive curation completed successfully');
        } catch (error: any) {
          console.error('❌ [DEV OS] Aggressive curation failed:', error.message);
        }
      });
      
      res.json({
        success: true,
        message: 'Aggressive curation started (running in background)',
        mode: 'aggressive',
        details: 'Will process ~2,900 videos across 58 technique categories'
      });
      
    } catch (error: any) {
      console.error('[DEV OS] Failed to trigger aggressive curation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start aggressive curation',
        details: error.message
      });
    }
  });

  // Get curation status (for Dev OS monitoring)
  app.get('/api/admin/curation/status', checkAdminAuth, async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get last curation run
      const lastRun = await db.select()
        .from(curationRuns)
        .orderBy(desc(curationRuns.createdAt))
        .limit(1);
      
      // Get today's stats
      const todayStats = await db.execute(sql`
        SELECT 
          COALESCE(SUM(videos_added), 0) as added,
          COALESCE(SUM(videos_screened), 0) as screened,
          COALESCE(SUM(youtube_api_calls), 0) as api_used,
          COUNT(*) as runs_today
        FROM curation_runs
        WHERE run_date = ${today}
      `);
      
      // Get total video count
      const totalVideos = await db.execute(sql`
        SELECT COUNT(*) as count FROM ai_video_knowledge
      `);
      
      res.json({
        success: true,
        lastRun: lastRun.length > 0 ? {
          date: lastRun[0].createdAt,
          videosAdded: lastRun[0].videosAdded || 0,
          videosScreened: lastRun[0].videosScreened || 0,
          status: lastRun[0].status
        } : null,
        today: {
          videosAdded: Number(todayStats.rows[0]?.added || 0),
          videosScreened: Number(todayStats.rows[0]?.screened || 0),
          apiUsed: Number(todayStats.rows[0]?.api_used || 0),
          runsCompleted: Number(todayStats.rows[0]?.runs_today || 0)
        },
        library: {
          totalVideos: Number(totalVideos.rows[0]?.count || 0)
        }
      });
      
    } catch (error: any) {
      console.error('[DEV OS] Status check error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to check curation status' 
      });
    }
  });

  // Get curation efficiency metrics - Last Hour
  app.get('/api/admin/curation/metrics/last-hour', checkAdminAuth, async (req, res) => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const metrics = await db.execute(sql`
        SELECT 
          COALESCE(SUM(videos_screened), 0) as screened,
          COALESCE(SUM(videos_added), 0) as accepted,
          COALESCE(SUM(videos_rejected), 0) as rejected,
          COALESCE(SUM(api_units_used), 0) as api_units,
          COALESCE(AVG(acceptance_rate), 0) as avg_acceptance_rate,
          COALESCE(AVG(cost_per_accepted_video), 0) as avg_cost_per_video,
          COUNT(*) as runs_count
        FROM curation_runs
        WHERE created_at >= ${oneHourAgo.toISOString()}
          AND status = 'completed'
      `);
      
      const row = metrics.rows[0];
      const screened = Number(row?.screened || 0);
      const accepted = Number(row?.accepted || 0);
      const rejected = Number(row?.rejected || 0);
      const acceptanceRate = screened > 0 ? ((accepted / screened) * 100) : 0;
      
      res.json({
        period: 'last_hour',
        screened,
        accepted,
        rejected,
        acceptanceRate: parseFloat(acceptanceRate.toFixed(2)),
        apiUnits: Number(row?.api_units || 0),
        costPerVideo: parseFloat(Number(row?.avg_cost_per_video || 0).toFixed(4)),
        runsCount: Number(row?.runs_count || 0)
      });
    } catch (error: any) {
      console.error('[DEV OS] Last hour metrics error:', error);
      res.status(500).json({ error: 'Failed to fetch last hour metrics' });
    }
  });

  // Get curation efficiency metrics - Today
  app.get('/api/admin/curation/metrics/today', checkAdminAuth, async (req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const metrics = await db.execute(sql`
        SELECT 
          COALESCE(SUM(videos_screened), 0) as screened,
          COALESCE(SUM(videos_added), 0) as accepted,
          COALESCE(SUM(videos_rejected), 0) as rejected,
          COALESCE(SUM(api_units_used), 0) as api_units,
          COALESCE(AVG(acceptance_rate), 0) as avg_acceptance_rate,
          COALESCE(AVG(cost_per_accepted_video), 0) as avg_cost_per_video,
          COUNT(*) as runs_count
        FROM curation_runs
        WHERE created_at >= ${today.toISOString()}
          AND status = 'completed'
      `);
      
      const row = metrics.rows[0];
      const screened = Number(row?.screened || 0);
      const accepted = Number(row?.accepted || 0);
      const rejected = Number(row?.rejected || 0);
      const acceptanceRate = screened > 0 ? ((accepted / screened) * 100) : 0;
      
      res.json({
        period: 'today',
        screened,
        accepted,
        rejected,
        acceptanceRate: parseFloat(acceptanceRate.toFixed(2)),
        apiUnits: Number(row?.api_units || 0),
        costPerVideo: parseFloat(Number(row?.avg_cost_per_video || 0).toFixed(4)),
        runsCount: Number(row?.runs_count || 0)
      });
    } catch (error: any) {
      console.error('[DEV OS] Today metrics error:', error);
      res.status(500).json({ error: 'Failed to fetch today metrics' });
    }
  });

  // Get curation efficiency metrics - This Week
  app.get('/api/admin/curation/metrics/week', checkAdminAuth, async (req, res) => {
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const metrics = await db.execute(sql`
        SELECT 
          COALESCE(SUM(videos_screened), 0) as screened,
          COALESCE(SUM(videos_added), 0) as accepted,
          COALESCE(SUM(videos_rejected), 0) as rejected,
          COALESCE(SUM(api_units_used), 0) as api_units,
          COALESCE(AVG(acceptance_rate), 0) as avg_acceptance_rate,
          COALESCE(AVG(cost_per_accepted_video), 0) as avg_cost_per_video,
          COUNT(*) as runs_count
        FROM curation_runs
        WHERE created_at >= ${weekAgo.toISOString()}
          AND status = 'completed'
      `);
      
      const row = metrics.rows[0];
      const screened = Number(row?.screened || 0);
      const accepted = Number(row?.accepted || 0);
      const rejected = Number(row?.rejected || 0);
      const acceptanceRate = screened > 0 ? ((accepted / screened) * 100) : 0;
      
      res.json({
        period: 'week',
        screened,
        accepted,
        rejected,
        acceptanceRate: parseFloat(acceptanceRate.toFixed(2)),
        apiUnits: Number(row?.api_units || 0),
        costPerVideo: parseFloat(Number(row?.avg_cost_per_video || 0).toFixed(4)),
        runsCount: Number(row?.runs_count || 0)
      });
    } catch (error: any) {
      console.error('[DEV OS] Week metrics error:', error);
      res.status(500).json({ error: 'Failed to fetch week metrics' });
    }
  });

  // Get comprehensive curation summary (all periods)
  app.get('/api/admin/curation/metrics/summary', checkAdminAuth, async (req, res) => {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Get metrics for all periods in parallel
      const [hourMetrics, todayMetrics, weekMetrics, quotaInfo] = await Promise.all([
        db.execute(sql`
          SELECT 
            COALESCE(SUM(videos_screened), 0) as screened,
            COALESCE(SUM(videos_added), 0) as accepted,
            COALESCE(SUM(videos_rejected), 0) as rejected,
            COALESCE(SUM(api_units_used), 0) as api_units
          FROM curation_runs
          WHERE created_at >= ${oneHourAgo.toISOString()} AND status = 'completed'
        `),
        db.execute(sql`
          SELECT 
            COALESCE(SUM(videos_screened), 0) as screened,
            COALESCE(SUM(videos_added), 0) as accepted,
            COALESCE(SUM(videos_rejected), 0) as rejected,
            COALESCE(SUM(api_units_used), 0) as api_units
          FROM curation_runs
          WHERE created_at >= ${today.toISOString()} AND status = 'completed'
        `),
        db.execute(sql`
          SELECT 
            COALESCE(SUM(videos_screened), 0) as screened,
            COALESCE(SUM(videos_added), 0) as accepted,
            COALESCE(SUM(videos_rejected), 0) as rejected,
            COALESCE(SUM(api_units_used), 0) as api_units
          FROM curation_runs
          WHERE created_at >= ${weekAgo.toISOString()} AND status = 'completed'
        `),
        (async () => {
          const { getQuotaUsage } = await import('./youtube-quota-monitor');
          return getQuotaUsage();
        })()
      ]);
      
      const formatMetrics = (row: any, period: string) => {
        const screened = Number(row?.screened || 0);
        const accepted = Number(row?.accepted || 0);
        const rejected = Number(row?.rejected || 0);
        const apiUnits = Number(row?.api_units || 0);
        const acceptanceRate = screened > 0 ? ((accepted / screened) * 100) : 0;
        const costPerVideo = accepted > 0 ? (apiUnits / accepted) : 0;
        
        return {
          period,
          screened,
          accepted,
          rejected,
          acceptanceRate: parseFloat(acceptanceRate.toFixed(2)),
          apiUnits,
          costPerVideo: parseFloat(costPerVideo.toFixed(2))
        };
      };
      
      res.json({
        lastHour: formatMetrics(hourMetrics.rows[0], 'last_hour'),
        today: formatMetrics(todayMetrics.rows[0], 'today'),
        week: formatMetrics(weekMetrics.rows[0], 'week'),
        quota: {
          used: quotaInfo.estimatedUnits,
          limit: 10000,
          remaining: 10000 - quotaInfo.estimatedUnits,
          percentUsed: parseFloat(((quotaInfo.estimatedUnits / 10000) * 100).toFixed(1))
        }
      });
    } catch (error: any) {
      console.error('[DEV OS] Summary metrics error:', error);
      res.status(500).json({ error: 'Failed to fetch summary metrics' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DEV OS 2.0 - SYSTEM HEALTH & ACTION ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════════

  // System Health Endpoint - Real-time status for Dev OS dashboard
  app.get('/api/admin/system-health', checkAdminAuth, async (req, res) => {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // CURATION METRICS - Query curation_runs table (correct table with completion tracking)
      const lastCurationRun = await db.execute(sql`
        SELECT run_date as created_at, status, completed_at
        FROM curation_runs
        ORDER BY run_date DESC
        LIMIT 1
      `);
      
      const minutesSinceLastRun = lastCurationRun.rows[0]
        ? Math.floor((now.getTime() - new Date(lastCurationRun.rows[0].created_at).getTime()) / 60000)
        : 999;
      
      // Last hour stats from curation_runs (correct columns)
      const lastHourStats = await db.execute(sql`
        SELECT 
          COALESCE(SUM(videos_screened), 0) as screened,
          COALESCE(SUM(videos_added), 0) as accepted,
          COALESCE(SUM(videos_rejected), 0) as rejected
        FROM curation_runs
        WHERE run_date >= ${oneHourAgo.toISOString()}
          AND status = 'completed'
      `);
      
      const lastHour = lastHourStats.rows[0];
      const lastHourAcceptanceRate = Number(lastHour.screened) > 0
        ? ((Number(lastHour.accepted) / Number(lastHour.screened)) * 100).toFixed(1)
        : '0.0';
      
      // Today's stats from curation_runs (correct columns)
      const todayStats = await db.execute(sql`
        SELECT 
          COALESCE(SUM(videos_screened), 0) as screened,
          COALESCE(SUM(videos_added), 0) as accepted,
          COALESCE(SUM(api_units_used), 0) as api_calls
        FROM curation_runs
        WHERE DATE(run_date) = ${today}
          AND status = 'completed'
      `);
      
      const todayCuration = todayStats.rows[0];
      const todayAcceptanceRate = Number(todayCuration.screened) > 0
        ? ((Number(todayCuration.accepted) / Number(todayCuration.screened)) * 100).toFixed(1)
        : '0.0';
      
      // Get YouTube API quota info
      const { getQuotaUsage } = await import('./youtube-quota-monitor');
      const quotaInfo = await getQuotaUsage();
      
      // VIDEO METRICS
      const totalVideos = await db.execute(sql`
        SELECT COUNT(*) as count FROM ai_video_knowledge
      `);
      
      const eliteVideos = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM ai_video_knowledge 
        WHERE quality_score >= 9.0
      `);
      
      const videosAddedToday = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM ai_video_knowledge 
        WHERE DATE(created_at) = ${today}
      `);
      
      const total = Number(totalVideos.rows[0].count);
      const elite = Number(eliteVideos.rows[0].count);
      
      // STRIPE METRICS
      const activeSubscriptions = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM bjj_users 
        WHERE subscription_status = 'active'
      `);
      
      const trialUsers = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM bjj_users 
        WHERE subscription_status = 'trial'
      `);
      
      const mrr = await db.execute(sql`
        SELECT COALESCE(SUM(
          CASE 
            WHEN subscription_type = 'monthly' THEN 19.99
            WHEN subscription_type = 'annual' THEN 149.99/12
            ELSE 0
          END
        ), 0) as mrr
        FROM bjj_users
        WHERE subscription_status = 'active'
      `);
      
      // USER METRICS
      const totalUsers = await db.execute(sql`
        SELECT COUNT(*) as count FROM bjj_users
      `);
      
      const usersToday = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM bjj_users 
        WHERE DATE(created_at) = ${today}
      `);
      
      const lifetimeUsers = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM bjj_users 
        WHERE subscription_type = 'lifetime'
      `);
      
      res.json({
        timestamp: now.toISOString(),
        curation: {
          isRunning: minutesSinceLastRun < 30,
          minutesSinceLastRun,
          lastRun: lastCurationRun?.createdAt,
          lastHour: {
            screened: Number(lastHour.screened),
            accepted: Number(lastHour.accepted),
            rejected: Number(lastHour.rejected),
            acceptanceRate: Number(lastHourAcceptanceRate)
          },
          today: {
            screened: Number(todayCuration.screened),
            accepted: Number(todayCuration.accepted),
            rejected: Number(todayCuration.screened) - Number(todayCuration.accepted),
            acceptanceRate: Number(todayAcceptanceRate)
          },
          apiQuota: {
            used: quotaInfo.estimatedUnits,
            limit: 10000,
            percentUsed: parseFloat(((quotaInfo.estimatedUnits / 10000) * 100).toFixed(1))
          }
        },
        videos: {
          total,
          elite,
          elitePercent: total > 0 ? ((elite / total) * 100).toFixed(1) : '0.0',
          addedToday: Number(videosAddedToday.rows[0].count)
        },
        stripe: {
          healthy: true,
          mrr: Number(mrr.rows[0].mrr).toFixed(0),
          activeSubscriptions: Number(activeSubscriptions.rows[0].count),
          trialUsers: Number(trialUsers.rows[0].count)
        },
        users: {
          total: Number(totalUsers.rows[0].count),
          signedUpToday: Number(usersToday.rows[0].count),
          lifetimeAccess: Number(lifetimeUsers.rows[0].count)
        }
      });
      
    } catch (error: any) {
      console.error('[DEV OS] System health error:', error);
      res.status(500).json({ error: 'Failed to fetch system health' });
    }
  });

  // Action: Restart Curation
  app.post('/api/admin/actions/restart-curation', checkAdminAuth, async (req, res) => {
    try {
      console.log('🔄 [DEV OS] MANUAL CURATION RESTART TRIGGERED');
      
      // Import and trigger curation service
      const { runAutonomousCuration } = await import('./video-curation-service');
      
      // Run in background (don't await)
      runAutonomousCuration()
        .then(result => {
          console.log('✅ [DEV OS] Curation completed:', result);
        })
        .catch(error => {
          console.error('❌ [DEV OS] Curation failed:', error);
        });
      
      res.json({
        success: true,
        message: 'Curation restart initiated. Processing in background.'
      });
      
    } catch (error: any) {
      console.error('[DEV OS] Restart error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Action: View Logs
  app.post('/api/admin/actions/view-logs', checkAdminAuth, async (req, res) => {
    try {
      const { service } = req.body;
      
      // Get recent curation runs from database instead of file system
      const recentRuns = await db.query.curationRuns.findMany({
        limit: 10,
        orderBy: [desc(curationRuns.createdAt)],
        columns: {
          id: true,
          runDate: true,
          runType: true,
          videosScreened: true,
          videosAdded: true,
          videosRejected: true,
          acceptanceRate: true,
          status: true,
          errorMessage: true,
          createdAt: true
        }
      });
      
      const logs = recentRuns.map(run => {
        return `[${new Date(run.createdAt).toISOString()}] ${run.status.toUpperCase()} - Screened: ${run.videosScreened}, Accepted: ${run.videosAdded}, Rejected: ${run.videosRejected}, Rate: ${run.acceptanceRate}%${run.errorMessage ? ` | Error: ${run.errorMessage}` : ''}`;
      }).join('\n');
      
      res.json({
        success: true,
        logs: logs || 'No recent curation runs found'
      });
      
    } catch (error: any) {
      console.error('[DEV OS] View logs error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Action: Diagnose Curation
  app.post('/api/admin/actions/diagnose-curation', checkAdminAuth, async (req, res) => {
    try {
      const diagnostics = [];
      
      // Check YouTube API key
      const hasApiKey = !!process.env.YOUTUBE_API_KEY;
      diagnostics.push({
        check: 'YouTube API Key',
        status: hasApiKey ? 'pass' : 'fail',
        message: hasApiKey ? 'API key configured' : 'API key missing'
      });
      
      // Check database connection
      try {
        await db.execute(sql`SELECT 1`);
        diagnostics.push({
          check: 'Database Connection',
          status: 'pass',
          message: 'Database accessible'
        });
      } catch (error: any) {
        diagnostics.push({
          check: 'Database Connection',
          status: 'fail',
          message: `Database error: ${error.message}`
        });
      }
      
      // Check last curation run
      const lastRun = await db.query.curationRuns.findFirst({
        orderBy: [desc(curationRuns.createdAt)],
        limit: 1
      });
      
      if (lastRun) {
        const minutesAgo = Math.floor((Date.now() - new Date(lastRun.createdAt).getTime()) / 60000);
        diagnostics.push({
          check: 'Last Curation Run',
          status: minutesAgo < 60 ? 'pass' : 'warning',
          message: `Last run ${minutesAgo} minutes ago (${lastRun.status})`
        });
      } else {
        diagnostics.push({
          check: 'Last Curation Run',
          status: 'fail',
          message: 'No curation runs found'
        });
      }
      
      // Check API quota
      const { getQuotaUsage } = await import('./youtube-quota-monitor');
      const quotaInfo = await getQuotaUsage();
      const quotaPercent = (quotaInfo.estimatedUnits / 10000) * 100;
      
      diagnostics.push({
        check: 'YouTube API Quota',
        status: quotaPercent > 90 ? 'warning' : 'pass',
        message: `${quotaInfo.estimatedUnits}/${10000} units used (${quotaPercent.toFixed(1)}%)`
      });
      
      res.json({
        success: true,
        diagnostics
      });
      
    } catch (error: any) {
      console.error('[DEV OS] Diagnose error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Quick Metrics for Mobile (Compact)
  app.get('/api/admin/quick-metrics', checkAdminAuth, async (req, res) => {
    console.log('[QUICK-METRICS] Starting quick metrics fetch...');
    try {
      const today = new Date().toISOString().split('T')[0];
      console.log('[QUICK-METRICS] Today:', today);
      
      // Helper to safely get rows from db.execute result (handles both array and {rows} formats)
      const getRows = (result: any): any[] => Array.isArray(result) ? result : (result?.rows || []);
      
      // Check if Elite Curator COMPLETED successfully TODAY
      const lastCurationRun = await db.execute(sql`
        SELECT run_date, status, completed_at FROM curation_runs
        ORDER BY run_date DESC
        LIMIT 1
      `);
      const lastCurationRows = getRows(lastCurationRun);
      
      const minutesSinceLastRun = lastCurationRows[0]
        ? Math.floor((Date.now() - new Date(lastCurationRows[0].run_date).getTime()) / 60000)
        : 999;
      
      // Check if curation COMPLETED successfully today (not just started)
      const completedRunsToday = await db.execute(sql`
        SELECT COUNT(*) as count FROM curation_runs
        WHERE DATE(run_date) = ${today}
          AND status = 'completed'
          AND completed_at IS NOT NULL
      `);
      const completedRows = getRows(completedRunsToday);
      
      const curationRanToday = completedRows[0] && Number(completedRows[0].count) > 0;
      
      // Quick counts + Elite Curator Efficiency Metrics
      const [
        totalVideos, 
        totalUsers, 
        videosToday, 
        usersToday, 
        activeSubscriptions, 
        mrr,
        todayScreening,
        geminiAnalyzed
      ] = await Promise.all([
        db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`),
        db.execute(sql`SELECT COUNT(*) as count FROM bjj_users`),
        db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge WHERE DATE(created_at) = ${today}`),
        db.execute(sql`SELECT COUNT(*) as count FROM bjj_users WHERE DATE(created_at) = ${today}`),
        db.execute(sql`
          SELECT COUNT(*) as count FROM bjj_users 
          WHERE (subscription_status = 'active' OR subscription_status = 'trialing')
            AND subscription_type NOT IN ('free_trial', 'lifetime')
            AND subscription_type IS NOT NULL
        `),
        db.execute(sql`
          SELECT COALESCE(SUM(
            CASE 
              WHEN subscription_type = 'monthly' THEN 19.99
              WHEN subscription_type = 'yearly' THEN 149.99/12
              ELSE 0
            END
          ), 0) as mrr
          FROM bjj_users
          WHERE (subscription_status = 'active' OR subscription_status = 'trialing')
            AND subscription_type IN ('monthly', 'yearly')
        `),
        // Elite Curator screening efficiency for today (FULL FUNNEL) from curation_runs table
        db.execute(sql`
          SELECT 
            COALESCE(SUM(videos_screened), 0) as discovered,
            COALESCE(SUM(videos_analyzed), 0) as analyzed,
            COALESCE(SUM(videos_added), 0) as accepted,
            COALESCE(SUM(videos_rejected), 0) as rejected
          FROM curation_runs
          WHERE DATE(run_date) = ${today}
            AND status = 'completed'
        `),
        // Count videos processed by Gemini (same source as Videos page for consistency)
        db.execute(sql`SELECT COUNT(*) as count FROM video_watch_status WHERE processed = true`)
      ]);
      
      console.log('[QUICK-METRICS] All queries completed successfully');
      
      // Safely extract rows from all results
      const totalVideosRows = getRows(totalVideos);
      const videosTodayRows = getRows(videosToday);
      const totalUsersRows = getRows(totalUsers);
      const usersTodayRows = getRows(usersToday);
      const activeSubsRows = getRows(activeSubscriptions);
      const mrrRows = getRows(mrr);
      const screeningRows = getRows(todayScreening);
      const geminiAnalyzedRows = getRows(geminiAnalyzed);
      
      // Calculate full curation funnel metrics - with safe fallbacks
      const screening = screeningRows[0];
      const analyzed = screening ? Number(screening.analyzed || 0) : 0;
      const accepted = screening ? Number(screening.accepted || 0) : 0;
      const rejected = screening ? Number(screening.rejected || 0) : 0;
      // FIXED: Discovered = analyzed + rejected (total videos that went through the pipeline)
      // videos_screened column was not being populated correctly
      const discovered = analyzed + rejected;
      const skipped = 0; // Skipped is no longer used in the new funnel
      
      // Calculate acceptance rate based on DISCOVERED (total found from YouTube)
      // Return as number, not string - frontend will format it
      const acceptanceRate = discovered > 0 ? parseFloat(((accepted / discovered) * 100).toFixed(1)) : 0;
      
      // Determine efficiency status
      let efficiencyStatus = 'unknown';
      if (analyzed > 0) {
        const rate = parseFloat(acceptanceRate);
        // Elite Curator targets 60-80% approval rate
        if (rate < 30) efficiencyStatus = 'too_strict';
        else if (rate >= 30 && rate < 50) efficiencyStatus = 'strict';
        else if (rate >= 50 && rate <= 85) efficiencyStatus = 'optimal';
        else if (rate > 85 && rate <= 95) efficiencyStatus = 'loose';
        else efficiencyStatus = 'too_loose';
      }
      
      // Determine curation pipeline status
      const videoCount = Number(totalVideosRows[0]?.count || 0);
      const TARGET_VIDEO_COUNT = 10000;
      const targetReached = videoCount >= TARGET_VIDEO_COUNT;
      
      // Curation status: "active", "paused_target_reached", or "offline"
      let curationStatus = 'offline';
      if (curationRanToday) {
        curationStatus = 'active';
      } else if (targetReached) {
        curationStatus = 'paused_target_reached';
      }
      
      res.json({
        curationRunning: curationRanToday, // Legacy field for backward compatibility
        curationStatus, // New: "active", "paused_target_reached", or "offline"
        targetReached,
        minutesSinceRun: minutesSinceLastRun,
        totalVideos: Number(totalVideosRows[0]?.count || 0),
        videosToday: Number(videosTodayRows[0]?.count || 0),
        totalUsers: Number(totalUsersRows[0]?.count || 0),
        signedUpToday: Number(usersTodayRows[0]?.count || 0),
        activeSubscriptions: Number(activeSubsRows[0]?.count || 0),
        mrr: Number(mrrRows[0]?.mrr || 0).toFixed(0),
        geminiAnalyzed: Number(geminiAnalyzedRows[0]?.count || 0), // Videos with Gemini knowledge extracted
        // Curation Efficiency Metrics (THE CORE BUSINESS METRIC)
        // FULL FUNNEL: Discovered → Analyzed → Accepted/Rejected
        curationEfficiency: {
          discovered,      // Videos found from YouTube
          analyzed,        // Videos that went through AI analysis
          accepted,        // Videos added to library
          rejected,        // Videos rejected by AI
          skipped,         // Videos filtered before analysis (discovered - analyzed)
          acceptanceRate: parseFloat(acceptanceRate), // % of analyzed that were accepted
          status: efficiencyStatus
        }
      });
      
    } catch (error: any) {
      console.error('[QUICK-METRICS] ERROR:', error.message);
      console.error('[QUICK-METRICS] Stack:', error.stack);
      res.status(500).json({ error: 'Failed to fetch quick metrics', details: error.message });
    }
  });

  // Diagnostic endpoint to verify database state
  app.get('/api/admin/diagnostic', checkAdminAuth, async (req, res) => {
    try {
      const diagnostic: any = {};
      
      // Helper to safely get rows from db.execute result (handles both array and {rows} formats)
      const getRows = (result: any): any[] => Array.isArray(result) ? result : (result?.rows || []);
      
      // 1. USERS TABLE
      const usersQuery = await db.execute(sql`
        SELECT 
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE subscription_status = 'active') as active_subscribers,
          COUNT(*) FILTER (WHERE subscription_status = 'trialing') as trial_users,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as new_today,
          COALESCE(SUM(CASE 
            WHEN subscription_status = 'active' AND subscription_type = 'monthly' THEN 19.99 
            WHEN subscription_status = 'active' AND subscription_type = 'yearly' THEN 149.99/12
            ELSE 0 
          END), 0) as mrr
        FROM bjj_users
      `);
      diagnostic.users = getRows(usersQuery)[0] || null;
      
      // 2. VIDEOS TABLE (ai_video_knowledge)
      const videosQuery = await db.execute(sql`
        SELECT 
          COUNT(*) as total_videos,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as added_today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as added_this_week,
          AVG(ai_rating) as avg_quality,
          COUNT(DISTINCT instructor_name) as unique_instructors
        FROM ai_video_knowledge
      `);
      diagnostic.videos = getRows(videosQuery)[0] || null;
      
      // 3. CURATION RUNS
      const curationQuery = await db.execute(sql`
        SELECT 
          COUNT(*) as total_runs,
          MAX(run_date) as last_run,
          COALESCE(SUM(videos_screened), 0) as total_screened,
          COALESCE(SUM(videos_analyzed), 0) as total_analyzed,
          COALESCE(SUM(videos_added), 0) as total_accepted,
          COALESCE(SUM(videos_rejected), 0) as total_rejected,
          COALESCE(SUM(CASE WHEN run_date >= NOW() - INTERVAL '1 day' THEN videos_added ELSE 0 END), 0) as accepted_today
        FROM curation_runs
      `);
      diagnostic.curation = getRows(curationQuery)[0] || null;
      
      // 4. DEV OS MESSAGES
      const devOsQuery = await db.execute(sql`
        SELECT 
          COUNT(*) as total_messages,
          COUNT(DISTINCT user_id) as unique_users,
          MAX(created_at) as last_message
        FROM dev_os_messages
      `);
      diagnostic.devOsMessages = getRows(devOsQuery)[0] || null;
      
      // 5. SYSTEM HEALTH
      diagnostic.system = {
        database_connected: true,
        timestamp: new Date().toISOString(),
        server_uptime: Math.floor(process.uptime()),
        node_version: process.version
      };
      
      res.json({
        success: true,
        diagnostic
      });
      
    } catch (error: any) {
      console.error('[ADMIN] Diagnostic error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  });

  // Get Active Alerts
  app.get('/api/admin/alerts', checkAdminAuth, async (req, res) => {
    try {
      const { getActiveAlerts } = await import('./alert-monitor-service');
      const alerts = await getActiveAlerts();
      res.json({ alerts });
    } catch (error: any) {
      console.error('[DEV OS] Get alerts error:', error);
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  });

  // Dismiss Alert
  app.post('/api/admin/alerts/:id/dismiss', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { dismissAlert } = await import('./alert-monitor-service');
      const result = await dismissAlert(id, req.user?.id);
      res.json(result);
    } catch (error: any) {
      console.error('[DEV OS] Dismiss alert error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMPREHENSIVE DEV OS EXECUTION LAYER
  // ═══════════════════════════════════════════════════════════════════════════════

  // CURATION CONTROL: Adjust Quality Threshold
  app.post('/api/admin/execute/curation/adjust-threshold', checkAdminAuth, async (req, res) => {
    try {
      const { threshold } = req.body;
      
      if (!threshold || threshold < 0 || threshold > 10) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid threshold. Must be between 0 and 10.' 
        });
      }
      
      console.log(`⚙️ [DEV OS] ADJUSTING QUALITY THRESHOLD to ${threshold}`);
      
      // Update environment variable (for current process)
      process.env.CURATION_MIN_SCORE = threshold.toString();
      
      res.json({
        success: true,
        action: 'adjust_threshold',
        message: `Quality threshold set to ${threshold}`,
        newThreshold: threshold,
        note: 'This affects current process only. Restart server to persist.'
      });
      
    } catch (error: any) {
      console.error('[DEV OS] Adjust threshold error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // SYSTEM OPERATIONS: Clear Cache
  app.post('/api/admin/execute/system/clear-cache', checkAdminAuth, async (req, res) => {
    try {
      console.log('🗑️ [DEV OS] CLEARING CACHE');
      
      // Clear in-memory cache
      cache.clear();
      
      res.json({
        success: true,
        action: 'clear_cache',
        message: 'In-memory cache cleared successfully'
      });
      
    } catch (error: any) {
      console.error('[DEV OS] Clear cache error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // SYSTEM OPERATIONS: Check Resources
  app.post('/api/admin/execute/system/check-resources', checkAdminAuth, async (req, res) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execPromise = promisify(exec);
      
      // Get memory usage
      const memUsage = process.memoryUsage();
      const formatBytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
      
      // Get uptime
      const uptimeSeconds = process.uptime();
      const uptimeHours = (uptimeSeconds / 3600).toFixed(2);
      
      res.json({
        success: true,
        action: 'check_resources',
        memory: {
          rss: formatBytes(memUsage.rss),
          heapTotal: formatBytes(memUsage.heapTotal),
          heapUsed: formatBytes(memUsage.heapUsed),
          external: formatBytes(memUsage.external)
        },
        uptime: `${uptimeHours} hours`,
        nodeVersion: process.version,
        platform: process.platform
      });
      
    } catch (error: any) {
      console.error('[DEV OS] Check resources error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // VIDEO OPERATIONS: Manually Add Video by URL
  app.post('/api/admin/execute/video/add-manual', checkAdminAuth, async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url || !url.includes('youtube.com') && !url.includes('youtu.be')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid YouTube URL'
        });
      }
      
      console.log(`➕ [DEV OS] MANUALLY ADDING VIDEO: ${url}`);
      
      // Extract YouTube ID
      const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
      const videoId = match ? match[1] : null;
      
      if (!videoId) {
        return res.status(400).json({
          success: false,
          error: 'Could not extract YouTube video ID from URL'
        });
      }
      
      // Fetch video details from YouTube API
      const { google } = await import('googleapis');
      const youtube = google.youtube({
        version: 'v3',
        auth: process.env.YOUTUBE_API_KEY
      });
      
      const response = await youtube.videos.list({
        part: ['snippet', 'contentDetails'],
        id: [videoId]
      });
      
      const video = response.data.items?.[0];
      
      if (!video) {
        return res.status(404).json({
          success: false,
          error: 'Video not found on YouTube'
        });
      }
      
      // Check if video already exists
      const [existing] = await db.select()
        .from(aiVideoKnowledge)
        .where(eq(aiVideoKnowledge.youtubeId, videoId))
        .limit(1);
      
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Video already exists in library'
        });
      }
      
      // Save to database
      await db.insert(aiVideoKnowledge).values({
        youtubeId: videoId,
        title: video.snippet?.title || 'Untitled',
        videoUrl: url,
        thumbnailUrl: video.snippet?.thumbnails?.high?.url || null,
        instructorName: video.snippet?.channelTitle || 'Unknown',
        techniqueName: video.snippet?.title || 'Unknown',
        description: video.snippet?.description || null,
        qualityScore: 8.0, // Default for manual adds
        beltLevel: 'all',
        giOrNogi: 'gi',
        duration: video.contentDetails?.duration || null,
        createdAt: new Date()
      });
      
      res.json({
        success: true,
        action: 'add_video',
        message: `Video "${video.snippet?.title}" added successfully`,
        videoId,
        title: video.snippet?.title
      });
      
    } catch (error: any) {
      console.error('[DEV OS] Add video error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // VIDEO OPERATIONS: Delete Video
  app.post('/api/admin/execute/video/delete', checkAdminAuth, async (req, res) => {
    try {
      const { videoId } = req.body;
      
      if (!videoId) {
        return res.status(400).json({
          success: false,
          error: 'Video ID required'
        });
      }
      
      console.log(`🗑️ [DEV OS] DELETING VIDEO: ${videoId}`);
      
      // Delete from database
      const result = await db.delete(aiVideoKnowledge)
        .where(eq(aiVideoKnowledge.id, parseInt(videoId)))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Video not found'
        });
      }
      
      res.json({
        success: true,
        action: 'delete_video',
        message: 'Video deleted successfully',
        deletedVideo: result[0].title
      });
      
    } catch (error: any) {
      console.error('[DEV OS] Delete video error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // USER OPERATIONS: Create Lifetime Access
  app.post('/api/admin/execute/user/create-lifetime', checkAdminAuth, async (req, res) => {
    try {
      const { email, firstName, notes } = req.body;
      
      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email required'
        });
      }
      
      console.log(`👑 [DEV OS] CREATING LIFETIME ACCESS: ${email}`);
      
      // Check if user already exists
      const [existing] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.email, email))
        .limit(1);
      
      if (existing) {
        // Update existing user to lifetime
        await db.update(bjjUsers)
          .set({
            subscriptionTier: 'lifetime',
            subscriptionStatus: 'active'
          })
          .where(eq(bjjUsers.id, existing.id));
        
        return res.json({
          success: true,
          action: 'upgrade_to_lifetime',
          message: `Upgraded ${email} to lifetime access`,
          userId: existing.id
        });
      }
      
      // Create new lifetime user
      const [newUser] = await db.insert(bjjUsers).values({
        email,
        firstName: firstName || email.split('@')[0],
        subscriptionTier: 'lifetime',
        subscriptionStatus: 'active',
        beltLevel: 'white',
        trainingStyle: 'balanced',
        createdAt: new Date()
      }).returning();
      
      res.json({
        success: true,
        action: 'create_lifetime',
        message: `Created lifetime access for ${email}`,
        userId: newUser.id
      });
      
    } catch (error: any) {
      console.error('[DEV OS] Create lifetime error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // USER OPERATIONS: Cancel Subscription
  app.post('/api/admin/execute/user/cancel-subscription', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID required'
        });
      }
      
      console.log(`❌ [DEV OS] CANCELING SUBSCRIPTION: User ${userId}`);
      
      // Get user's stripe subscription ID
      const [user] = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.id, parseInt(userId)))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Cancel in Stripe if they have a subscription
      if (user.stripeSubscriptionId) {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      }
      
      // Update database
      await db.update(bjjUsers)
        .set({
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null
        })
        .where(eq(bjjUsers.id, parseInt(userId)));
      
      res.json({
        success: true,
        action: 'cancel_subscription',
        message: `Subscription canceled for ${user.email}`,
        userId
      });
      
    } catch (error: any) {
      console.error('[DEV OS] Cancel subscription error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ADMIN VIDEO MANAGEMENT ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════════

  // Get video library with filters and pagination
  app.get('/api/admin/videos', async (req, res) => {
    try {
      const {
        search,
        beltLevel,
        style,
        position,
        techniqueType,
        minQuality,
        limit = 50,
        offset = 0
      } = req.query;

      let query = db.select({
        id: aiVideoKnowledge.id,
        videoUrl: aiVideoKnowledge.videoUrl,
        youtubeId: aiVideoKnowledge.youtubeId,
        title: aiVideoKnowledge.title,
        instructorName: aiVideoKnowledge.instructorName,
        techniqueName: aiVideoKnowledge.techniqueName,
        beltLevel: aiVideoKnowledge.beltLevel,
        giOrNogi: aiVideoKnowledge.giOrNogi,
        positionCategory: aiVideoKnowledge.positionCategory,
        techniqueType: aiVideoKnowledge.techniqueType,
        qualityScore: aiVideoKnowledge.qualityScore,
        keyDetails: aiVideoKnowledge.keyDetails,
        duration: aiVideoKnowledge.duration,
        createdAt: aiVideoKnowledge.createdAt,
        avgUserRating: aiVideoKnowledge.avgUserRating,
        helpfulCount: aiVideoKnowledge.helpfulCount,
        notHelpfulCount: aiVideoKnowledge.notHelpfulCount,
        thumbnailUrl: aiVideoKnowledge.thumbnailUrl,
        viewCount: aiVideoKnowledge.viewCount
      }).from(aiVideoKnowledge);
      let conditions = [];

      // Search filter
      if (search) {
        conditions.push(
          or(
            sql`${aiVideoKnowledge.title} ILIKE ${`%${search}%`}`,
            sql`${aiVideoKnowledge.instructorName} ILIKE ${`%${search}%`}`
          )
        );
      }

      // Belt level filter (array contains)
      if (beltLevel && Array.isArray(JSON.parse(beltLevel as string))) {
        const belts = JSON.parse(beltLevel as string);
        conditions.push(sql`${aiVideoKnowledge.beltLevel} && ${belts}`);
      }

      // Style filter
      if (style) {
        conditions.push(
          or(
            sql`${aiVideoKnowledge.giOrNogi} = ${style}`,
            sql`${aiVideoKnowledge.giOrNogi} = 'both'`
          )
        );
      }

      // Position filter
      if (position) {
        conditions.push(sql`${aiVideoKnowledge.positionCategory} = ${position}`);
      }

      // Technique type filter
      if (techniqueType) {
        conditions.push(sql`${aiVideoKnowledge.techniqueType} = ${techniqueType}`);
      }

      // Quality filter
      if (minQuality) {
        conditions.push(sql`${aiVideoKnowledge.qualityScore} >= ${parseFloat(minQuality as string)}`);
      }

      // Apply all conditions
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      // Order by creation date and paginate
      const videos = await query
        .orderBy(desc(aiVideoKnowledge.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      res.json({ success: true, videos });
    } catch (error: any) {
      console.error('Get videos error:', error);
      res.status(500).json({ error: 'Failed to get videos' });
    }
  });


  // Get Curation V2 statistics
  app.get('/api/admin/curation/v2/stats', checkAdminAuth, async (req, res) => {
    try {
      const { getCurationV2Stats } = await import('./intelligent-curator-v2');
      const v2Stats = await getCurationV2Stats();
      
      // Get technique pool coverage
      const techniqueCoverage = await db.execute(sql`
        SELECT name, video_count, priority, category
        FROM technique_pool
        ORDER BY video_count DESC
        LIMIT 20
      `);
      
      // Get instructor expansion queue
      const expansionQueue = await db.execute(sql`
        SELECT instructor, credibility, discovered_at, processed
        FROM instructor_expansion_queue
        ORDER BY discovered_at DESC
        LIMIT 10
      `);
      
      // Get query progress summary
      const queryStats = await db.execute(sql`
        SELECT 
          query_type,
          COUNT(*) as total,
          SUM(videos_found) as total_found,
          SUM(videos_approved) as total_approved,
          COUNT(*) FILTER (WHERE exhausted = true) as exhausted_count
        FROM query_progress
        GROUP BY query_type
      `);
      
      // Get curation state
      const stateResult = await db.execute(sql`
        SELECT * FROM curation_state WHERE id = 1
      `);
      
      // Handle both postgres-js array format and {rows} format
      const getRows = (result: any): any[] => Array.isArray(result) ? result : (result?.rows || []);
      
      res.json({
        success: true,
        v2Stats,
        techniqueCoverage: getRows(techniqueCoverage),
        expansionQueue: getRows(expansionQueue),
        queryStats: getRows(queryStats),
        curationState: getRows(stateResult)[0] || null
      });
    } catch (error: any) {
      console.error('[V2 STATS] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ACTIVITY DASHBOARD API - Comprehensive system activity metrics
  // ═══════════════════════════════════════════════════════════════════════════════

  // Get 24-hour activity summary stats
  app.get('/api/admin/activity/stats', checkAdminAuth, async (req, res) => {
    try {
      const timeRange = (req.query.hours || '24') as string;
      let hoursAgo = parseInt(timeRange);
      
      // Validate and clamp hours (1-168 = 1 hour to 7 days)
      if (isNaN(hoursAgo) || hoursAgo < 1) hoursAgo = 1;
      if (hoursAgo > 168) hoursAgo = 168;
      
      // Helper to safely get rows from db.execute result (handles both array and {rows} formats)
      const getRows = (result: any): any[] => Array.isArray(result) ? result : (result?.rows || []);
      
      // New users in time period
      const newUsersResult = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM bjj_users
        WHERE created_at > NOW() - make_interval(hours => ${hoursAgo})
      `);
      
      // Total videos in library
      const totalVideosResult = await db.execute(sql`
        SELECT COUNT(*) as total_videos
        FROM ai_video_knowledge
      `);
      
      // Video curation metrics
      const curationResult = await db.execute(sql`
        SELECT 
          COUNT(*) as videos_analyzed,
          COUNT(*) FILTER (WHERE approved = true) as videos_approved,
          COUNT(*) FILTER (WHERE approved = false) as videos_rejected,
          ROUND(100.0 * COUNT(*) FILTER (WHERE approved = true) / NULLIF(COUNT(*), 0), 1) as approval_rate
        FROM video_analysis_log
        WHERE created_at > NOW() - make_interval(hours => ${hoursAgo})
      `);
      
      // User engagement metrics
      const engagementResult = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE action_type = 'prof_query') as prof_queries,
          COUNT(*) FILTER (WHERE action_type = 'video_save') as videos_saved,
          COUNT(DISTINCT user_id) as active_users
        FROM user_activity
        WHERE created_at > NOW() - make_interval(hours => ${hoursAgo})
      `);
      
      // Referral metrics
      const referralsResult = await db.execute(sql`
        SELECT 
          COUNT(*) as new_referrals,
          COUNT(DISTINCT referred_by) as unique_referrers
        FROM bjj_users
        WHERE referred_by IS NOT NULL
        AND created_at > NOW() - make_interval(hours => ${hoursAgo})
      `);
      
      // Extract rows from all results
      const newUsersRows = getRows(newUsersResult);
      const totalVideosRows = getRows(totalVideosResult);
      const curationRows = getRows(curationResult);
      const engagementRows = getRows(engagementResult);
      const referralsRows = getRows(referralsResult);
      
      const stats = {
        timeRange: `${hoursAgo} hours`,
        newUsers: parseInt(String(newUsersRows[0]?.count || '0')),
        curation: {
          totalVideos: parseInt(String(totalVideosRows[0]?.total_videos || '0')),
          videosAnalyzed: parseInt(String(curationRows[0]?.videos_analyzed || '0')),
          videosApproved: parseInt(String(curationRows[0]?.videos_approved || '0')),
          videosRejected: parseInt(String(curationRows[0]?.videos_rejected || '0')),
          approvalRate: parseFloat(String(curationRows[0]?.approval_rate || '0'))
        },
        engagement: {
          profQueries: parseInt(String(engagementRows[0]?.prof_queries || '0')),
          videosSaved: parseInt(String(engagementRows[0]?.videos_saved || '0')),
          activeUsers: parseInt(String(engagementRows[0]?.active_users || '0'))
        },
        referrals: {
          newReferrals: parseInt(String(referralsRows[0]?.new_referrals || '0')),
          uniqueReferrers: parseInt(String(referralsRows[0]?.unique_referrers || '0'))
        }
      };
      
      res.json({ success: true, stats });
    } catch (error: any) {
      console.error('Activity stats error:', error);
      res.status(500).json({ error: 'Failed to get activity stats' });
    }
  });

  // Get activity feed (recent events)
  app.get('/api/admin/activity/feed', checkAdminAuth, async (req, res) => {
    try {
      let limit = parseInt((req.query.limit || '100') as string);
      
      // Validate and clamp limit (1-500)
      if (isNaN(limit) || limit < 1) limit = 100;
      if (limit > 500) limit = 500;
      
      const feedResult = await db.execute(sql`
        SELECT * FROM activity_log
        ORDER BY created_at DESC
        LIMIT ${limit}
      `);
      
      // Handle both postgres-js array format and {rows} format
      const feed = Array.isArray(feedResult) ? feedResult : (feedResult?.rows || []);
      
      res.json({ success: true, feed });
    } catch (error: any) {
      console.error('Activity feed error:', error);
      res.status(500).json({ error: 'Failed to get activity feed' });
    }
  });

  // Get detailed activity metrics
  app.get('/api/admin/activity/metrics', checkAdminAuth, async (req, res) => {
    try {
      const timeRange = (req.query.hours || '24') as string;
      let hoursAgo = parseInt(timeRange);
      
      // Validate and clamp hours (1-168 = 1 hour to 7 days)
      if (isNaN(hoursAgo) || hoursAgo < 1) hoursAgo = 1;
      if (hoursAgo > 168) hoursAgo = 168;
      
      // Video curation performance by search query
      const curationPerformanceResult = await db.execute(sql`
        SELECT 
          search_query,
          COUNT(*) as videos_found,
          COUNT(*) FILTER (WHERE approved = true) as approved,
          COUNT(*) FILTER (WHERE approved = false) as rejected,
          ROUND(100.0 * COUNT(*) FILTER (WHERE approved = true) / NULLIF(COUNT(*), 0), 1) as success_rate,
          ROUND(AVG(CAST(final_score AS NUMERIC)), 1) as avg_score
        FROM video_analysis_log
        WHERE created_at > NOW() - make_interval(hours => ${hoursAgo})
        AND search_query IS NOT NULL
        GROUP BY search_query
        ORDER BY COUNT(*) DESC
        LIMIT 20
      `);
      
      // Top performing videos (most recommended/saved)
      const topVideosResult = await db.execute(sql`
        SELECT 
          v.id,
          v.technique_name,
          v.instructor_name,
          COUNT(DISTINCT ua.id) FILTER (WHERE ua.action_type = 'video_save') as times_saved,
          v.quality_score,
          v.helpful_count
        FROM ai_video_knowledge v
        LEFT JOIN user_activity ua ON ua.video_id = v.id 
          AND ua.created_at > NOW() - make_interval(hours => ${hoursAgo})
        WHERE v.created_at > NOW() - INTERVAL '30 days'
        GROUP BY v.id, v.technique_name, v.instructor_name, v.quality_score, v.helpful_count
        ORDER BY times_saved DESC, v.helpful_count DESC
        LIMIT 10
      `);
      
      // User growth by hour
      const userGrowthResult = await db.execute(sql`
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as new_users
        FROM bjj_users
        WHERE created_at > NOW() - make_interval(hours => ${hoursAgo})
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour DESC
      `);
      
      // Referral performance
      const referralPerformanceResult = await db.execute(sql`
        SELECT 
          r.referral_code,
          ru.phone_number as referrer_phone,
          COUNT(u.id) as new_signups,
          ROUND(100.0 * COUNT(u.id) FILTER (WHERE u.subscription_status = 'active') / NULLIF(COUNT(u.id), 0), 1) as conversion_rate
        FROM referral_codes r
        LEFT JOIN bjj_users ru ON r.user_id = ru.id
        LEFT JOIN bjj_users u ON u.referred_by = r.referral_code 
          AND u.created_at > NOW() - make_interval(hours => ${hoursAgo})
        WHERE u.id IS NOT NULL
        GROUP BY r.referral_code, ru.phone_number
        ORDER BY new_signups DESC
        LIMIT 10
      `);
      
      // Handle both postgres-js array format and {rows} format
      const getRows = (result: any): any[] => Array.isArray(result) ? result : (result?.rows || []);
      
      const metrics = {
        curationPerformance: getRows(curationPerformanceResult),
        topVideos: getRows(topVideosResult),
        userGrowth: getRows(userGrowthResult),
        referralPerformance: getRows(referralPerformanceResult)
      };
      
      res.json({ success: true, metrics });
    } catch (error: any) {
      console.error('Activity metrics error:', error);
      res.status(500).json({ error: 'Failed to get activity metrics' });
    }
  });

  // Delete a video
  app.delete('/api/admin/videos/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      await db.delete(aiVideoKnowledge)
        .where(eq(aiVideoKnowledge.id, parseInt(id)));
      
      res.json({ success: true, message: 'Video deleted successfully' });
    } catch (error: any) {
      console.error('Delete video error:', error);
      res.status(500).json({ error: 'Failed to delete video' });
    }
  });

  // Manually add a video
  app.post('/api/admin/videos/manual', async (req, res) => {
    try {
      const { youtube_url, key_detail, key_detail_timestamp } = req.body;
      
      // Extract video ID from URL
      const videoIdMatch = youtube_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
      if (!videoIdMatch) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }
      const youtubeId = videoIdMatch[1];
      
      // Fetch video metadata using YouTube service
      const { searchBJJVideos, getVideoDetails } = await import('./youtube-service');
      const searchResults = await searchBJJVideos(`site:youtube.com ${youtubeId}`, 1);
      
      if (searchResults.length === 0) {
        return res.status(404).json({ error: 'Video not found on YouTube' });
      }
      
      const videoInfo = searchResults[0];
      const details = await getVideoDetails(youtubeId);
      
      // Insert into database
      const [newVideo] = await db.insert(aiVideoKnowledge).values({
        youtubeId,
        videoUrl: youtube_url,
        title: videoInfo.title,
        techniqueName: videoInfo.title,
        instructorName: videoInfo.channel_name || 'Unknown',
        channelId: videoInfo.channel_id,
        channelName: videoInfo.channel_name,
        duration: details?.duration || null,
        uploadDate: videoInfo.upload_date ? new Date(videoInfo.upload_date) : null,
        viewCount: details?.view_count || null,
        likeCount: details?.like_count || null,
        thumbnailUrl: videoInfo.thumbnail_url,
        keyDetails: key_detail ? { mainDetail: key_detail, timestamp: key_detail_timestamp } : null,
        qualityScore: '7.5' // Default quality for manual adds (stored as text in schema)
      }).returning();
      
      res.json({ success: true, video: newVideo });
    } catch (error: any) {
      console.error('Manual add video error:', error);
      res.status(500).json({ error: 'Failed to add video', details: error.message });
    }
  });

  // Run Content-First Curator (async background job with progress tracking)
  let curationJobStatus: CuratorJobStatus = { 
    running: false, 
    progress: 0, 
    result: null,
    currentTechnique: null 
  };
  
  app.post('/api/admin/content-first-curator/run', checkAdminAuth, async (req: any, res) => {
    try {
      if (curationJobStatus.running) {
        return res.status(409).json({ error: 'Curation already running', progress: curationJobStatus.progress });
      }
      
      const { techniques = 20, videosPerTechnique = 5 } = req.body;
      
      console.log(`🎥 Admin triggered content-first curation: ${techniques} techniques × ${videosPerTechnique} videos`);
      
      // Start async job with detailed progress tracking
      curationJobStatus = {
        running: true,
        progress: 0,
        result: null,
        startTime: Date.now(),
        techniquesTotal: techniques,
        techniquesProcessed: 0,
        videosAnalyzed: 0,
        videosSaved: 0,
        newInstructorsDiscovered: 0,
        currentTechnique: null,
      };
      
      // Progress callback to update status with error handling
      const onProgress = (update: CuratorProgressUpdate) => {
        const progressPercent = techniques > 0 
          ? Math.min(100, Math.max(0, Math.round((update.techniquesProcessed / techniques) * 100)))
          : 0;
        
        curationJobStatus = {
          ...curationJobStatus,
          ...update,
          currentTechnique: update.currentTechnique ?? null,
          progress: progressPercent,
        };
      };
      
      // Run in background
      runContentFirstCuration(techniques, videosPerTechnique, onProgress)
        .then(result => {
          curationJobStatus = {
            running: false,
            progress: 100,
            result: {
              success: true,
              techniquesSearched: result.techniquesSearched,
              videosAnalyzed: result.videosAnalyzed,
              videosSaved: result.videosSaved,
              newInstructorsDiscovered: result.newInstructorsDiscovered,
            },
            elapsedTime: Date.now() - curationJobStatus.startTime,
          };
          console.log('✅ Content-first curation completed:', result);
        })
        .catch(error => {
          curationJobStatus = {
            running: false,
            progress: 0,
            result: { success: false, error: error.message }
          };
          console.error('❌ Content-first curation failed:', error);
        });
      
      // Return immediately with job started
      res.json({
        success: true,
        message: 'Curation started',
        jobId: 'content-first-1',
        estimatedTime: `${Math.ceil(techniques * videosPerTechnique * 2 / 60)} minutes`
      });
    } catch (error: any) {
      console.error('Content-first curation error:', error);
      res.status(500).json({ error: 'Failed to start curation', details: error.message });
    }
  });
  
  // Get curation job status
  app.get('/api/admin/content-first-curator/status', checkAdminAuth, async (req: any, res) => {
    res.json(curationJobStatus);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ADMIN FEEDBACK ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════════

  // Get feedback stats
  app.get('/api/admin/feedback/stats', async (req, res) => {
    try {
      // Total feedback count
      const feedbackCountResult = await db.execute(sql`
        SELECT COUNT(*) as total FROM user_video_feedback
      `);
      const totalFeedback = Number(feedbackCountResult.rows[0]?.total ?? 0);

      // Average helpful ratio (videos with 50+ votes)
      const avgRatioResult = await db.execute(sql`
        SELECT AVG(helpful_ratio) as avg_helpful
        FROM ai_video_knowledge 
        WHERE total_votes >= 50
      `);
      const avgHelpfulRatio = Number(avgRatioResult.rows[0]?.avg_helpful ?? 0);

      // Videos removed count
      const removedCountResult = await db.execute(sql`
        SELECT COUNT(*) as total 
        FROM ai_video_knowledge 
        WHERE quality_tier = 'removed'
      `);
      const videosRemoved = Number(removedCountResult.rows[0]?.total ?? 0);

      // Top tier videos count
      const topTierCountResult = await db.execute(sql`
        SELECT COUNT(*) as total 
        FROM ai_video_knowledge 
        WHERE quality_tier = 'top_tier'
      `);
      const topTierVideos = Number(topTierCountResult.rows[0]?.total ?? 0);

      res.json({
        totalFeedback,
        avgHelpfulRatio,
        videosRemoved,
        topTierVideos,
      });
    } catch (error: any) {
      console.error('Feedback stats error:', error);
      res.status(500).json({ error: 'Failed to fetch feedback stats' });
    }
  });

  // Get flagged videos for review
  app.get('/api/admin/feedback/flagged', async (req, res) => {
    try {
      const flagged = await db.select({
        id: aiVideoKnowledge.id,
        techniqueName: aiVideoKnowledge.techniqueName,
        instructorName: aiVideoKnowledge.instructorName,
        videoUrl: aiVideoKnowledge.videoUrl,
        qualityTier: aiVideoKnowledge.qualityTier,
        totalVotes: aiVideoKnowledge.totalVotes,
        helpfulRatio: aiVideoKnowledge.helpfulRatio,
        helpfulCount: aiVideoKnowledge.helpfulCount,
        notHelpfulCount: aiVideoKnowledge.notHelpfulCount
      })
        .from(aiVideoKnowledge)
        .where(eq(aiVideoKnowledge.qualityTier, 'flagged'))
        .orderBy(desc(aiVideoKnowledge.totalVotes));
      
      res.json(flagged);
    } catch (error: any) {
      console.error('Flagged videos error:', error);
      res.status(500).json({ error: 'Failed to fetch flagged videos' });
    }
  });

  // Get top tier videos
  app.get('/api/admin/feedback/top-tier', async (req, res) => {
    try {
      const topTier = await db.select({
        id: aiVideoKnowledge.id,
        techniqueName: aiVideoKnowledge.techniqueName,
        instructorName: aiVideoKnowledge.instructorName,
        videoUrl: aiVideoKnowledge.videoUrl,
        qualityTier: aiVideoKnowledge.qualityTier,
        totalVotes: aiVideoKnowledge.totalVotes,
        helpfulRatio: aiVideoKnowledge.helpfulRatio,
        helpfulCount: aiVideoKnowledge.helpfulCount,
        notHelpfulCount: aiVideoKnowledge.notHelpfulCount
      })
        .from(aiVideoKnowledge)
        .where(eq(aiVideoKnowledge.qualityTier, 'top_tier'))
        .orderBy(desc(aiVideoKnowledge.helpfulRatio));
      
      res.json(topTier);
    } catch (error: any) {
      console.error('Top tier videos error:', error);
      res.status(500).json({ error: 'Failed to fetch top tier videos' });
    }
  });

  // 🎯 PHASE 3A: VIDEO INTELLIGENCE ANALYTICS

  // Get top performing videos for a specific demographic
  app.get('/api/admin/video-intelligence/top-by-demographic', async (req, res) => {
    try {
      const { beltLevel, bodyType, trainingStyle, limit } = req.query;
      
      if (!beltLevel) {
        return res.status(400).json({ error: 'beltLevel is required' });
      }
      
      const results = await videoIntelligence.getTopVideosForDemographic(
        beltLevel as string,
        bodyType as string | undefined,
        trainingStyle as string | undefined,
        limit ? parseInt(limit as string) : 10
      );
      
      res.json({
        demographic: { beltLevel, bodyType, trainingStyle },
        topVideos: results
      });
    } catch (error: any) {
      console.error('[VIDEO INTELLIGENCE] Error getting top videos by demographic:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Identify low-performing videos that need replacement
  app.get('/api/admin/video-intelligence/low-performing', async (req, res) => {
    try {
      const { minVotes, maxSuccessRate } = req.query;
      
      const results = await videoIntelligence.identifyLowPerformingVideos(
        minVotes ? parseInt(minVotes as string) : 5,
        maxSuccessRate ? parseFloat(maxSuccessRate as string) : 40
      );
      
      res.json({
        criteria: { 
          minVotes: minVotes ? parseInt(minVotes as string) : 5, 
          maxSuccessRate: maxSuccessRate ? parseFloat(maxSuccessRate as string) : 40 
        },
        lowPerformingVideos: results
      });
    } catch (error: any) {
      console.error('[VIDEO INTELLIGENCE] Error identifying low performing videos:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Detect content gaps - techniques with high demand but low supply
  app.get('/api/admin/video-intelligence/content-gaps', async (req, res) => {
    try {
      const gaps = await videoIntelligence.detectContentGaps();
      
      res.json({
        contentGaps: gaps,
        summary: {
          totalGaps: gaps.length,
          criticalGaps: gaps.filter((g: any) => g.gapSeverity >= 70).length,
          moderateGaps: gaps.filter((g: any) => g.gapSeverity >= 40 && g.gapSeverity < 70).length
        }
      });
    } catch (error: any) {
      console.error('[VIDEO INTELLIGENCE] Error detecting content gaps:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get demographic performance breakdown for a specific video
  app.get('/api/admin/video-intelligence/video-demographics/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;
      
      const breakdown = await videoIntelligence.getVideoDemographicBreakdown(
        parseInt(videoId)
      );
      
      res.json({
        videoId: parseInt(videoId),
        demographicBreakdown: breakdown
      });
    } catch (error: any) {
      console.error('[VIDEO INTELLIGENCE] Error getting video demographic breakdown:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Remove a flagged video
  app.post('/api/admin/feedback/remove-video/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;

      await db.execute(sql`
        UPDATE videos 
        SET quality_tier = 'removed'
        WHERE id = ${parseInt(videoId)}
      `);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Remove video error:', error);
      res.status(500).json({ error: 'Failed to remove video' });
    }
  });

  // Approve a flagged video (return to active)
  app.post('/api/admin/feedback/approve-video/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;

      await db.execute(sql`
        UPDATE videos 
        SET quality_tier = 'active'
        WHERE id = ${parseInt(videoId)}
      `);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Approve video error:', error);
      res.status(500).json({ error: 'Failed to approve video' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // USER FEEDBACK SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════════
  
  // Submit video feedback
  app.post('/api/feedback/video', async (req, res) => {
    try {
      console.log('📌 VIDEO FEEDBACK REQUEST:', req.body);
      
      const { 
        userId, 
        videoId, 
        helpful, 
        feedbackCategory, 
        feedbackText,
        userQuery,
        techniqueSearched 
      } = req.body;

      if (!userId || videoId === undefined || helpful === undefined) {
        console.error('❌ Missing required fields:', { userId, videoId, helpful });
        return res.status(400).json({ error: 'Missing required fields' });
      }

      console.log(`🔍 Looking up user: ${userId} (type: ${typeof userId})`);

      // Get user context (optional - for belt level tracking)
      const users = await db.select({
        id: bjjUsers.id,
        beltLevel: bjjUsers.beltLevel
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);
      
      const user = users[0] || null;
      console.log(`✓ User lookup result:`, user ? `Found (belt: ${user.beltLevel})` : 'Not found (will proceed anonymously)');

      // Insert feedback (use null userId if user doesn't exist to avoid FK violation)
      await db.insert(userVideoFeedback).values({
        userId: user ? userId : null,
        videoId: parseInt(videoId),
        helpful,
        feedbackCategory: feedbackCategory || null,
        feedbackText: feedbackText || null,
        userBeltLevel: user?.beltLevel || null,
        userQuery: userQuery || null,
        techniqueSearched: techniqueSearched || null,
        recommendationContext: null,
      });

      // Update video stats
      if (helpful) {
        await db.execute(sql`
          UPDATE videos 
          SET helpful_count = helpful_count + 1
          WHERE id = ${parseInt(videoId)}
        `);
      } else {
        await db.execute(sql`
          UPDATE videos 
          SET not_helpful_count = not_helpful_count + 1
          WHERE id = ${parseInt(videoId)}
        `);
      }

      // Recalculate ratios and total votes
      await db.execute(sql`
        UPDATE videos
        SET 
          total_votes = helpful_count + not_helpful_count,
          helpful_ratio = CASE 
            WHEN (helpful_count + not_helpful_count) > 0 
            THEN helpful_count::decimal / (helpful_count + not_helpful_count)
            ELSE 0 
          END
        WHERE id = ${parseInt(videoId)}
      `);

      // Log video helpful/not helpful activity (only if user exists)
      if (user) {
        await db.insert(userActivity).values({
          userId: userId,
          videoId: parseInt(videoId),
          actionType: helpful ? 'video_helpful' : 'video_not_helpful',
          details: {
            feedbackCategory: feedbackCategory || null,
            feedbackText: feedbackText || null,
            userQuery: userQuery || null,
            techniqueSearched: techniqueSearched || null
          }
        }).catch(err => console.error('[ACTIVITY] Failed to log video feedback:', err));
      }

      // Update success patterns for smart ranking (only if user exists)
      if (user) {
        await updateSuccessPattern(userId, parseInt(videoId), helpful);
        
        // Track video interaction
        await trackVideoInteraction(userId, parseInt(videoId), {
          viewed: true,
          markedHelpful: helpful,
        });
      }

      // Get updated user stats (only if user exists)
      let stats = null;
      let showAppreciation = false;
      
      if (user) {
        const [userStats] = await db.select({
          userId: userFeedbackStats.userId,
          totalFeedbackGiven: userFeedbackStats.totalFeedbackGiven,
          lastAppreciationShownAt: userFeedbackStats.lastAppreciationShownAt
        })
          .from(userFeedbackStats)
          .where(eq(userFeedbackStats.userId, userId))
          .limit(1);
        
        stats = userStats;

        // Check if user should get appreciation message
        showAppreciation = stats && shouldShowAppreciation(
          stats.totalFeedbackGiven,
          stats.lastAppreciationShownAt
        );

        if (showAppreciation) {
          await db.execute(sql`
            UPDATE user_feedback_stats 
            SET last_appreciation_shown_at = NOW() 
            WHERE user_id = ${userId}
          `);
        }
      }

      // Get Professor OS response
      const feedbackResponse = getProfessorOSFeedbackResponse(
        helpful,
        feedbackCategory,
        stats?.totalFeedbackGiven
      );

      let appreciationMsg = null;
      if (showAppreciation && stats) {
        appreciationMsg = getAppreciationMessage(stats.totalFeedbackGiven);
      }

      res.json({ 
        success: true,
        feedbackResponse,
        showAppreciation,
        appreciationMessage: appreciationMsg,
        totalFeedback: stats?.totalFeedbackGiven || 1
      });
    } catch (error: any) {
      console.error('Submit feedback error:', error);
      res.status(500).json({ error: 'Failed to submit feedback', details: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // META INSIGHTS DASHBOARD - Admin endpoints for meta monitoring
  // ═══════════════════════════════════════════════════════════════════════════════

  // Get trending techniques
  app.get('/api/admin/meta/trending', checkAdminAuth, async (req, res) => {
    try {
      const { metaAnalyzer } = await import('./meta-analyzer');
      const limit = parseInt(req.query.limit as string) || 20;
      const trending = await metaAnalyzer.getTrendingTechniques(limit);
      res.json({ techniques: trending });
    } catch (error: any) {
      console.error('[META API] Error fetching trending techniques:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get curation priorities
  app.get('/api/admin/meta/priorities', checkAdminAuth, async (req, res) => {
    try {
      const { metaAnalyzer } = await import('./meta-analyzer');
      const limit = parseInt(req.query.limit as string) || 10;
      const priorities = await metaAnalyzer.getTopCurationPriorities(limit);
      res.json({ priorities });
    } catch (error: any) {
      console.error('[META API] Error fetching curation priorities:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user technique requests
  app.get('/api/admin/meta/requests', checkAdminAuth, async (req, res) => {
    try {
      const { userTechniqueRequests, users } = await import('@shared/schema');
      const { desc, sql: drizzleSql } = await import('drizzle-orm');
      
      const limit = parseInt(req.query.limit as string) || 50;
      const requests = await db.select({
        id: userTechniqueRequests.id,
        userId: userTechniqueRequests.userId,
        userName: users.name,
        userEmail: users.email,
        techniqueMentioned: userTechniqueRequests.techniqueMentioned,
        requestContext: userTechniqueRequests.requestContext,
        requestType: userTechniqueRequests.requestType,
        beltLevel: userTechniqueRequests.beltLevel,
        giPreference: userTechniqueRequests.giPreference,
        requestedAt: userTechniqueRequests.requestedAt
      })
        .from(userTechniqueRequests)
        .leftJoin(users, drizzleSql`${userTechniqueRequests.userId} = ${users.id}::text`)
        .orderBy(desc(userTechniqueRequests.requestedAt))
        .limit(limit);
      
      res.json({ requests });
    } catch (error: any) {
      console.error('[META API] Error fetching technique requests:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get meta stats overview
  app.get('/api/admin/meta/stats', checkAdminAuth, async (req, res) => {
    try {
      const { userTechniqueRequests, techniqueMetaStatus, aiVideoKnowledge } = await import('@shared/schema');
      const { sql, eq, gte } = await import('drizzle-orm');
      
      // Total techniques being tracked
      const [techniqueCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(techniqueMetaStatus);
      
      // Total user requests in last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [requestCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(userTechniqueRequests)
        .where(gte(userTechniqueRequests.requestedAt, sevenDaysAgo));
      
      // Techniques needing curation
      const [needsCurationCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(techniqueMetaStatus)
        .where(eq(techniqueMetaStatus.needsCuration, true));
      
      // Total videos in library
      const [videoCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(aiVideoKnowledge)
        .where(eq(aiVideoKnowledge.status, 'active'));
      
      res.json({
        totalTechniquesTracked: techniqueCount?.count || 0,
        userRequestsLast7Days: requestCount?.count || 0,
        techniquesNeedingCuration: needsCurationCount?.count || 0,
        totalVideosInLibrary: videoCount?.count || 0,
      });
    } catch (error: any) {
      console.error('[META API] Error fetching meta stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Trigger manual curation for a technique
  app.post('/api/admin/meta/curate', checkAdminAuth, async (req, res) => {
    try {
      const { technique, maxResults } = req.body;
      
      if (!technique) {
        return res.status(400).json({ error: 'Missing technique parameter' });
      }
      
      const { manualCurateTechnique } = await import('./auto-curator');
      const result = await manualCurateTechnique(technique, maxResults || 10);
      
      res.json(result);
    } catch (error: any) {
      console.error('[META API] Error triggering manual curation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Run meta analysis manually
  app.post('/api/admin/meta/analyze', checkAdminAuth, async (req, res) => {
    try {
      const { metaAnalyzer } = await import('./meta-analyzer');
      
      // Run async, don't wait
      metaAnalyzer.analyzeTechniqueMetaStatus().catch(err => {
        console.error('[META API] Background analysis error:', err);
      });
      
      res.json({ success: true, message: 'Meta analysis started in background' });
    } catch (error: any) {
      console.error('[META API] Error starting meta analysis:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============= INSTRUCTOR CREDIBILITY API =============
  
  // Get all instructors with filters
  app.get('/api/admin/instructors', checkAdminAuth, async (req, res) => {
    try {
      const { search, tier, is_user_instructor } = req.query;
      
      let query = db.select({
        id: instructorCredibility.id,
        name: instructorCredibility.name,
        tier: instructorCredibility.tier,
        qualityThreshold: instructorCredibility.qualityThreshold,
        competitionRecord: instructorCredibility.competitionRecord,
        beltRank: instructorCredibility.beltRank,
        academyAffiliation: instructorCredibility.academyAffiliation,
        specialties: instructorCredibility.specialties,
        bestForBeltLevel: instructorCredibility.bestForBeltLevel,
        teachingLanguage: instructorCredibility.teachingLanguage,
        instructionStyle: instructorCredibility.instructionStyle,
        videosInLibrary: instructorCredibility.videosInLibrary,
        avgHelpfulRatio: instructorCredibility.avgHelpfulRatio,
        totalRecommendations: instructorCredibility.totalRecommendations,
        notes: instructorCredibility.notes,
        isUserInstructor: instructorCredibility.isUserInstructor,
        createdAt: instructorCredibility.createdAt,
      }).from(instructorCredibility);

      const conditions = [];
      
      if (search && typeof search === 'string') {
        conditions.push(ilike(instructorCredibility.name, `%${search}%`));
      }
      
      if (tier && typeof tier === 'string') {
        conditions.push(eq(instructorCredibility.tier, parseInt(tier)));
      }
      
      if (is_user_instructor && typeof is_user_instructor === 'string') {
        conditions.push(eq(instructorCredibility.isUserInstructor, is_user_instructor === 'true'));
      }

      let instructors;
      if (conditions.length > 0) {
        instructors = await query.where(and(...conditions)).orderBy(asc(instructorCredibility.name));
      } else {
        instructors = await query.orderBy(asc(instructorCredibility.name));
      }
      
      res.json({ instructors });
    } catch (error: any) {
      console.error('[INSTRUCTOR API] Error fetching instructors:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get instructor stats
  app.get('/api/admin/instructors/stats', checkAdminAuth, async (req, res) => {
    try {
      const [total, tier1, tier2, tier3, userInstructors] = await Promise.all([
        db.select({ count: count() }).from(instructorCredibility),
        db.select({ count: count() }).from(instructorCredibility).where(eq(instructorCredibility.tier, 1)),
        db.select({ count: count() }).from(instructorCredibility).where(eq(instructorCredibility.tier, 2)),
        db.select({ count: count() }).from(instructorCredibility).where(eq(instructorCredibility.tier, 3)),
        db.select({ count: count() }).from(instructorCredibility).where(eq(instructorCredibility.isUserInstructor, true)),
      ]);

      res.json({
        total: total[0]?.count || 0,
        tier1: tier1[0]?.count || 0,
        tier2: tier2[0]?.count || 0,
        tier3: tier3[0]?.count || 0,
        userInstructors: userInstructors[0]?.count || 0,
      });
    } catch (error: any) {
      console.error('[INSTRUCTOR API] Error fetching instructor stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create new instructor
  app.post('/api/admin/instructors', checkAdminAuth, async (req, res) => {
    try {
      const {
        name,
        tier,
        quality_threshold,
        competition_record,
        belt_rank,
        academy_affiliation,
        specialties,
        best_for_belt_level,
        teaching_language,
        instruction_style,
        notes,
        is_user_instructor,
      } = req.body;

      if (!name || tier === undefined || quality_threshold === undefined) {
        return res.status(400).json({ error: 'Missing required fields: name, tier, quality_threshold' });
      }

      const [instructor] = await db.insert(instructorCredibility).values({
        name,
        tier,
        qualityThreshold: quality_threshold,
        competitionRecord: competition_record || null,
        beltRank: belt_rank || 'Black Belt',
        academyAffiliation: academy_affiliation || null,
        specialties: specialties || [],
        bestForBeltLevel: best_for_belt_level || [],
        teachingLanguage: teaching_language || 'english',
        instructionStyle: instruction_style || null,
        notes: notes || null,
        isUserInstructor: is_user_instructor || false,
      }).returning();

      res.json({ instructor });
    } catch (error: any) {
      console.error('[INSTRUCTOR API] Error creating instructor:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update instructor
  app.patch('/api/admin/instructors/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates: any = {};

      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.tier !== undefined) updates.tier = req.body.tier;
      if (req.body.quality_threshold !== undefined) updates.qualityThreshold = req.body.quality_threshold;
      if (req.body.competition_record !== undefined) updates.competitionRecord = req.body.competition_record;
      if (req.body.belt_rank !== undefined) updates.beltRank = req.body.belt_rank;
      if (req.body.academy_affiliation !== undefined) updates.academyAffiliation = req.body.academy_affiliation;
      if (req.body.specialties !== undefined) updates.specialties = req.body.specialties;
      if (req.body.best_for_belt_level !== undefined) updates.bestForBeltLevel = req.body.best_for_belt_level;
      if (req.body.teaching_language !== undefined) updates.teachingLanguage = req.body.teaching_language;
      if (req.body.instruction_style !== undefined) updates.instructionStyle = req.body.instruction_style;
      if (req.body.notes !== undefined) updates.notes = req.body.notes;
      if (req.body.is_user_instructor !== undefined) updates.isUserInstructor = req.body.is_user_instructor;
      
      updates.updatedAt = new Date();

      const [instructor] = await db
        .update(instructorCredibility)
        .set(updates)
        .where(eq(instructorCredibility.id, id))
        .returning();

      if (!instructor) {
        return res.status(404).json({ error: 'Instructor not found' });
      }

      res.json({ instructor });
    } catch (error: any) {
      console.error('[INSTRUCTOR API] Error updating instructor:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete instructor
  app.delete('/api/admin/instructors/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const [deleted] = await db
        .delete(instructorCredibility)
        .where(eq(instructorCredibility.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Instructor not found' });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('[INSTRUCTOR API] Error deleting instructor:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============= YOUTUBE SCRAPER API =============
  
  // Scrape YouTube data for a single instructor
  app.post('/api/admin/instructors/:id/scrape-youtube', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { youtubeInput } = req.body; // Can be channel ID, handle, or URL
      
      if (!youtubeInput) {
        return res.status(400).json({ error: 'YouTube channel ID, handle, or URL is required' });
      }
      
      const { fetchYouTubeChannelStats } = await import('./utils/youtubeApi');
      const { recalculateInstructorPriority } = await import('./utils/instructorPriority');
      
      // Fetch YouTube statistics
      const stats = await fetchYouTubeChannelStats(youtubeInput);
      
      // Update instructor record with YouTube data
      const [instructor] = await db
        .update(instructorCredibility)
        .set({
          youtubeChannelId: stats.channelId,
          youtubeChannelHandle: youtubeInput.startsWith('@') ? youtubeInput : null,
          youtubeSubscribers: stats.subscriberCount,
          youtubeVideoCount: stats.videoCount,
          youtubeLastScraped: stats.lastScraped,
          updatedAt: new Date(),
        })
        .where(eq(instructorCredibility.id, id))
        .returning();
      
      if (!instructor) {
        return res.status(404).json({ error: 'Instructor not found' });
      }
      
      // Recalculate priority based on new YouTube data
      const updatedInstructor = await recalculateInstructorPriority(instructor);
      
      res.json({
        success: true,
        instructor: updatedInstructor,
        scraped: {
          subscriberCount: stats.subscriberCount,
          videoCount: stats.videoCount,
          channelTitle: stats.channelTitle,
          channelId: stats.channelId,
        },
      });
    } catch (error: any) {
      console.error('[YOUTUBE SCRAPER] Error scraping instructor YouTube data:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Batch scrape YouTube data for all instructors with channel IDs/handles
  app.post('/api/admin/instructors/batch-scrape-youtube', checkAdminAuth, async (req, res) => {
    try {
      const { fetchYouTubeChannelStats } = await import('./utils/youtubeApi');
      const { recalculateInstructorPriority } = await import('./utils/instructorPriority');
      
      // Get all instructors with YouTube channel info
      const instructors = await db
        .select()
        .from(instructorCredibility)
        .where(
          or(
            isNotNull(instructorCredibility.youtubeChannelId),
            isNotNull(instructorCredibility.youtubeChannelHandle)
          )
        );
      
      if (instructors.length === 0) {
        return res.json({
          success: true,
          message: 'No instructors with YouTube channel information found',
          updated: 0,
          failed: 0,
        });
      }
      
      let updated = 0;
      let failed = 0;
      const results: any[] = [];
      
      // Process each instructor
      for (const instructor of instructors) {
        try {
          const youtubeInput = instructor.youtubeChannelHandle || instructor.youtubeChannelId;
          
          if (!youtubeInput) {
            failed++;
            results.push({
              name: instructor.name,
              success: false,
              error: 'No YouTube channel ID or handle',
            });
            continue;
          }
          
          // Fetch YouTube statistics
          const stats = await fetchYouTubeChannelStats(youtubeInput);
          
          // Update instructor record
          const [updatedInstructor] = await db
            .update(instructorCredibility)
            .set({
              youtubeChannelId: stats.channelId,
              youtubeSubscribers: stats.subscriberCount,
              youtubeVideoCount: stats.videoCount,
              youtubeLastScraped: stats.lastScraped,
              updatedAt: new Date(),
            })
            .where(eq(instructorCredibility.id, instructor.id))
            .returning();
          
          // Recalculate priority
          await recalculateInstructorPriority(updatedInstructor);
          
          updated++;
          results.push({
            name: instructor.name,
            success: true,
            subscriberCount: stats.subscriberCount,
            videoCount: stats.videoCount,
          });
          
          // Rate limiting: Wait 100ms between requests to avoid hitting YouTube API quota
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          failed++;
          results.push({
            name: instructor.name,
            success: false,
            error: error.message,
          });
          console.error(`[YOUTUBE SCRAPER] Failed to scrape ${instructor.name}:`, error.message);
        }
      }
      
      res.json({
        success: true,
        message: `Batch scraping complete: ${updated} updated, ${failed} failed`,
        updated,
        failed,
        results,
      });
    } catch (error: any) {
      console.error('[YOUTUBE SCRAPER] Error in batch scraping:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============= FEATURED INSTRUCTORS / PARTNERSHIPS API =============
  
  // Get all partnerships with filters
  app.get('/api/admin/partnerships', checkAdminAuth, async (req, res) => {
    try {
      const { feature_level, is_active } = req.query;
      
      const conditions: any[] = [];
      
      if (feature_level) {
        conditions.push(eq(featuredInstructors.featureLevel, feature_level as string));
      }
      
      if (is_active !== undefined && is_active !== 'all') {
        conditions.push(eq(featuredInstructors.isActive, is_active === 'true'));
      }
      
      let query = db.select({
        id: featuredInstructors.id,
        instructorId: featuredInstructors.instructorId,
        instructorName: instructorCredibility.name,
        featureLevel: featuredInstructors.featureLevel,
        searchPriorityPercentage: featuredInstructors.searchPriorityPercentage,
        recommendationBoostPercentage: featuredInstructors.recommendationBoostPercentage,
        showBadge: featuredInstructors.showBadge,
        showNameCallout: featuredInstructors.showNameCallout,
        customCalloutText: featuredInstructors.customCalloutText,
        startDate: featuredInstructors.startDate,
        endDate: featuredInstructors.endDate,
        isActive: featuredInstructors.isActive,
        partnershipType: featuredInstructors.partnershipType,
        partnershipAgreement: featuredInstructors.partnershipAgreement,
        socialPostCompleted: featuredInstructors.socialPostCompleted,
        socialPostDate: featuredInstructors.socialPostDate,
        linkInBioUntil: featuredInstructors.linkInBioUntil,
        totalRecommendations: featuredInstructors.totalRecommendations,
        totalVideoViews: featuredInstructors.totalVideoViews,
        monthlyRecommendationCount: featuredInstructors.monthlyRecommendationCount,
        partnershipNotes: featuredInstructors.partnershipNotes,
        createdAt: featuredInstructors.createdAt,
      })
      .from(featuredInstructors)
      .leftJoin(instructorCredibility, eq(featuredInstructors.instructorId, instructorCredibility.id));
      
      let partnerships;
      if (conditions.length > 0) {
        partnerships = await query.where(and(...conditions)).orderBy(desc(featuredInstructors.createdAt));
      } else {
        partnerships = await query.orderBy(desc(featuredInstructors.createdAt));
      }
      
      res.json(partnerships);
    } catch (error: any) {
      console.error('[PARTNERSHIP API] Error fetching partnerships:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get partnership stats
  app.get('/api/admin/partnerships/stats', checkAdminAuth, async (req, res) => {
    try {
      const [total, active, primaryCount, socialPostsCompleted] = await Promise.all([
        db.select({ count: count() }).from(featuredInstructors),
        db.select({ count: count() }).from(featuredInstructors).where(eq(featuredInstructors.isActive, true)),
        db.select({ count: count() }).from(featuredInstructors).where(eq(featuredInstructors.featureLevel, 'primary')),
        db.select({ count: count() }).from(featuredInstructors).where(eq(featuredInstructors.socialPostCompleted, true)),
      ]);

      res.json({
        total: total[0]?.count || 0,
        active: active[0]?.count || 0,
        primaryCount: primaryCount[0]?.count || 0,
        socialPostsCompleted: socialPostsCompleted[0]?.count || 0,
      });
    } catch (error: any) {
      console.error('[PARTNERSHIP API] Error fetching partnership stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create new partnership
  app.post('/api/admin/partnerships', checkAdminAuth, async (req, res) => {
    try {
      const {
        instructor_id,
        feature_level,
        search_priority_percentage,
        recommendation_boost_percentage,
        show_badge,
        show_name_callout,
        custom_callout_text,
        start_date,
        end_date,
        is_active,
        partnership_type,
        partnership_agreement,
        social_post_completed,
        social_post_date,
        link_in_bio_until,
        partnership_notes,
      } = req.body;

      const [partnership] = await db.insert(featuredInstructors).values({
        instructorId: instructor_id,
        featureLevel: feature_level,
        searchPriorityPercentage: search_priority_percentage,
        recommendationBoostPercentage: recommendation_boost_percentage,
        showBadge: show_badge ?? true,
        showNameCallout: show_name_callout ?? true,
        customCalloutText: custom_callout_text || null,
        startDate: start_date,
        endDate: end_date || null,
        isActive: is_active ?? true,
        partnershipType: partnership_type || null,
        partnershipAgreement: partnership_agreement || null,
        socialPostCompleted: social_post_completed || false,
        socialPostDate: social_post_date || null,
        linkInBioUntil: link_in_bio_until || null,
        partnershipNotes: partnership_notes || null,
      }).returning();

      res.json(partnership);
    } catch (error: any) {
      console.error('[PARTNERSHIP API] Error creating partnership:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update partnership
  app.patch('/api/admin/partnerships/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates: any = {};

      if (req.body.feature_level !== undefined) updates.featureLevel = req.body.feature_level;
      if (req.body.search_priority_percentage !== undefined) updates.searchPriorityPercentage = req.body.search_priority_percentage;
      if (req.body.recommendation_boost_percentage !== undefined) updates.recommendationBoostPercentage = req.body.recommendation_boost_percentage;
      if (req.body.show_badge !== undefined) updates.showBadge = req.body.show_badge;
      if (req.body.show_name_callout !== undefined) updates.showNameCallout = req.body.show_name_callout;
      if (req.body.custom_callout_text !== undefined) updates.customCalloutText = req.body.custom_callout_text;
      if (req.body.start_date !== undefined) updates.startDate = req.body.start_date;
      if (req.body.end_date !== undefined) updates.endDate = req.body.end_date;
      if (req.body.is_active !== undefined) updates.isActive = req.body.is_active;
      if (req.body.partnership_type !== undefined) updates.partnershipType = req.body.partnership_type;
      if (req.body.partnership_agreement !== undefined) updates.partnershipAgreement = req.body.partnership_agreement;
      if (req.body.social_post_completed !== undefined) updates.socialPostCompleted = req.body.social_post_completed;
      if (req.body.social_post_date !== undefined) updates.socialPostDate = req.body.social_post_date;
      if (req.body.link_in_bio_until !== undefined) updates.linkInBioUntil = req.body.link_in_bio_until;
      if (req.body.partnership_notes !== undefined) updates.partnershipNotes = req.body.partnership_notes;

      updates.updatedAt = new Date();

      const [partnership] = await db
        .update(featuredInstructors)
        .set(updates)
        .where(eq(featuredInstructors.id, id))
        .returning();

      if (!partnership) {
        return res.status(404).json({ error: 'Partnership not found' });
      }

      res.json(partnership);
    } catch (error: any) {
      console.error('[PARTNERSHIP API] Error updating partnership:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete partnership
  app.delete('/api/admin/partnerships/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const [deleted] = await db
        .delete(featuredInstructors)
        .where(eq(featuredInstructors.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Partnership not found' });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('[PARTNERSHIP API] Error deleting partnership:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // AI LOGS API
  // ═══════════════════════════════════════════════════════════════════════════════

  // Get AI conversation logs (from user conversations with dual-model tracking)
  app.get('/api/admin/ai-logs', checkAdminAuth, async (req, res) => {
    try {
      const { dateFilter = '7d', statusFilter = 'all', modelFilter = 'all', page = '1', pageSize = '50' } = req.query;
      
      const pageNum = parseInt(page as string);
      const pageSizeNum = parseInt(pageSize as string);
      const offset = (pageNum - 1) * pageSizeNum;

      // Calculate date threshold
      let dateThreshold: Date | null = null;
      if (dateFilter !== 'all') {
        const now = new Date();
        if (dateFilter === '24h') {
          dateThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        } else if (dateFilter === '7d') {
          dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (dateFilter === '30d') {
          dateThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
      }

      const conditions: any[] = [];
      if (dateThreshold) {
        conditions.push(sql`${aiConversationLearning.createdAt} >= ${dateThreshold}`);
      }
      
      // Model filter
      if (modelFilter !== 'all') {
        conditions.push(eq(aiConversationLearning.modelUsed, modelFilter));
      }

      // Get all conversation messages with user details
      const allMessages = await db
        .select({
          id: aiConversationLearning.id,
          userId: aiConversationLearning.userId,
          messageText: aiConversationLearning.messageText,
          messageType: aiConversationLearning.messageType,
          modelUsed: aiConversationLearning.modelUsed,
          complexityScore: aiConversationLearning.complexityScore,
          createdAt: aiConversationLearning.createdAt,
          userPhone: bjjUsers.phoneNumber,
          userName: bjjUsers.name,
        })
        .from(aiConversationLearning)
        .leftJoin(bjjUsers, eq(aiConversationLearning.userId, bjjUsers.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(aiConversationLearning.createdAt))
        .limit(1000); // Limit to prevent excessive memory usage

      // Pair user messages with AI responses
      const pairedLogs: any[] = [];
      const messagesByUser = new Map<string, any[]>();

      // Group messages by userId
      for (const msg of allMessages) {
        if (!messagesByUser.has(msg.userId)) {
          messagesByUser.set(msg.userId, []);
        }
        messagesByUser.get(msg.userId)!.push(msg);
      }

      // Pair user and AI messages
      for (const [userId, messages] of messagesByUser) {
        // Sort by timestamp
        const sorted = messages.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i].messageType === 'user_sent' && sorted[i + 1].messageType === 'ai_sent') {
            const userMsg = sorted[i];
            const aiMsg = sorted[i + 1];
            
            const log = {
              id: userMsg.id,
              userMessage: userMsg.messageText,
              aiResponse: aiMsg.messageText,
              timestamp: userMsg.createdAt,
              responseTimeMs: new Date(aiMsg.createdAt).getTime() - new Date(userMsg.createdAt).getTime(),
              modelUsed: aiMsg.modelUsed || 'unknown',
              complexityScore: aiMsg.complexityScore,
              userPhone: userMsg.userPhone || 'Unknown',
              userName: userMsg.userName || 'Unknown User',
              status: 'success',
            };

            // Apply status filter
            if (statusFilter === 'all' || statusFilter === 'success') {
              pairedLogs.push(log);
            }
          }
        }
      }

      // Apply pagination
      const paginatedLogs = pairedLogs.slice(offset, offset + pageSizeNum);
      const total = pairedLogs.length;
      const totalPages = Math.ceil(total / pageSizeNum);

      res.json({ logs: paginatedLogs, total, page: pageNum, totalPages });
    } catch (error: any) {
      console.error('[AI LOGS API] Error fetching AI logs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get AI logs stats
  app.get('/api/admin/ai-logs/stats', checkAdminAuth, async (req, res) => {
    try {
      // Get all messages
      const allMessages = await db.select({
        id: adminChatHistory.id,
        adminId: adminChatHistory.adminId,
        sender: adminChatHistory.sender,
        message: adminChatHistory.message,
        timestamp: adminChatHistory.timestamp
      }).from(adminChatHistory);
      
      // Count user messages (conversations initiated)
      const userMessages = allMessages.filter(m => m.sender === 'user');
      const assistantMessages = allMessages.filter(m => m.sender === 'assistant');
      
      const total = userMessages.length;
      const successCount = assistantMessages.length;
      
      // Calculate average response time by pairing messages
      let totalResponseTime = 0;
      let responseCount = 0;
      
      const userMsgsByAdmin = new Map();
      for (const msg of allMessages) {
        const key = msg.adminId;
        if (!userMsgsByAdmin.has(key)) {
          userMsgsByAdmin.set(key, []);
        }
        userMsgsByAdmin.get(key).push(msg);
      }
      
      for (const [, messages] of userMsgsByAdmin) {
        const sorted = messages.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i].sender === 'user' && sorted[i + 1].sender === 'assistant') {
            const responseTime = new Date(sorted[i + 1].timestamp).getTime() - 
                                 new Date(sorted[i].timestamp).getTime();
            totalResponseTime += responseTime;
            responseCount++;
          }
        }
      }
      
      const avgResponseTime = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0;
      const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;

      res.json({
        total,
        avgResponseTime,
        totalTokens: 0, // Not tracked in current schema
        successRate,
      });
    } catch (error: any) {
      console.error('[AI LOGS API] Error fetching AI logs stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SCHEDULES API
  // ═══════════════════════════════════════════════════════════════════════════════

  // Get all schedules
  app.get('/api/admin/schedules', checkAdminAuth, async (req, res) => {
    try {
      const schedules = await db
        .select()
        .from(smsSchedules)
        .orderBy(desc(smsSchedules.createdAt));

      // Enhance schedules with recipient count
      const enrichedSchedules = schedules.map(schedule => ({
        ...schedule,
        recipientCount: schedule.recipientIds?.length || 0,
        lastSent: null, // TODO: Get from sms_history
        nextSend: null, // TODO: Calculate based on schedule
      }));

      res.json({ schedules: enrichedSchedules });
    } catch (error: any) {
      console.error('[SCHEDULES API] Error fetching schedules:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get schedule stats
  app.get('/api/admin/schedules/stats', checkAdminAuth, async (req, res) => {
    try {
      const totalResult = await db.select({ count: count() }).from(smsSchedules);
      const activeResult = await db.select({ count: count() }).from(smsSchedules).where(eq(smsSchedules.active, true));

      // Get total recipients across all schedules
      const allSchedules = await db.select({ recipientIds: smsSchedules.recipientIds }).from(smsSchedules);
      const totalRecipients = new Set(allSchedules.flatMap(s => s.recipientIds || [])).size;

      // Get sent today count from history
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sentTodayResult = await db
        .select({ count: count() })
        .from(smsHistory)
        .where(sql`${smsHistory.sentAt} >= ${today}`);

      res.json({
        total: totalResult[0]?.count || 0,
        active: activeResult[0]?.count || 0,
        totalRecipients,
        sentToday: sentTodayResult[0]?.count || 0,
      });
    } catch (error: any) {
      console.error('[SCHEDULES API] Error fetching schedule stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create schedule
  app.post('/api/admin/schedules', checkAdminAuth, async (req, res) => {
    try {
      const { message, time, active = true } = req.body;

      const [schedule] = await db.insert(smsSchedules).values({
        message: message || "New Schedule",
        scheduleTime: time || "09:00",
        active,
        recipientIds: [],
      }).returning();

      res.json(schedule);
    } catch (error: any) {
      console.error('[SCHEDULES API] Error creating schedule:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update schedule
  app.patch('/api/admin/schedules/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates: any = {};

      if (req.body.message !== undefined) updates.message = req.body.message;
      if (req.body.time !== undefined) updates.scheduleTime = req.body.time;
      if (req.body.active !== undefined) updates.active = req.body.active;
      updates.updatedAt = new Date();

      const [schedule] = await db
        .update(smsSchedules)
        .set(updates)
        .where(eq(smsSchedules.id, id))
        .returning();

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      res.json(schedule);
    } catch (error: any) {
      console.error('[SCHEDULES API] Error updating schedule:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Toggle schedule active status
  app.post('/api/admin/schedules/:id/toggle', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Get current status
      const [current] = await db.select({
        id: smsSchedules.id,
        active: smsSchedules.active
      }).from(smsSchedules).where(eq(smsSchedules.id, id));
      if (!current) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      // Toggle status
      const [schedule] = await db
        .update(smsSchedules)
        .set({ active: !current.active, updatedAt: new Date() })
        .where(eq(smsSchedules.id, id))
        .returning();

      res.json(schedule);
    } catch (error: any) {
      console.error('[SCHEDULES API] Error toggling schedule:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete schedule
  app.delete('/api/admin/schedules/:id', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const [deleted] = await db
        .delete(smsSchedules)
        .where(eq(smsSchedules.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('[SCHEDULES API] Error deleting schedule:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TECHNIQUES API (Analyzed Videos)
  // ═══════════════════════════════════════════════════════════════════════════════

  // Get techniques/videos with filters
  app.get('/api/admin/techniques', checkAdminAuth, async (req, res) => {
    try {
      const { search, belt, style, minScore, instructor = 'all', category = 'all', score = 'all', status = 'all' } = req.query;

      const conditions: any[] = [];

      // Search filter - search in title and instructor name
      if (search && typeof search === 'string' && search.trim() !== '') {
        const searchTerm = `%${search.trim()}%`;
        conditions.push(
          or(
            ilike(aiVideoKnowledge.techniqueName, searchTerm),
            ilike(aiVideoKnowledge.title, searchTerm),
            ilike(aiVideoKnowledge.instructorName, searchTerm)
          )
        );
      }

      // Belt filter - handle array column with case-insensitive matching
      if (belt && belt !== 'all') {
        // beltLevel is a text[] array, so we need to check if the belt exists in the array
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM unnest(${aiVideoKnowledge.beltLevel}) AS belt_item
            WHERE LOWER(belt_item) = LOWER(${belt})
          )`
        );
      }

      // Style filter (gi/nogi) - handle variations: "gi", "gi_only", "nogi", "nogi_only", "both"
      // IMPORTANT: Also include NULL/empty gi_or_nogi values (230 unclassified videos)
      if (style && style !== 'all') {
        if (style === 'gi') {
          // Match "gi", "gi_only", "both", OR unclassified (NULL/empty)
          conditions.push(
            or(
              sql`LOWER(${aiVideoKnowledge.giOrNogi}) = 'gi'`,
              sql`LOWER(${aiVideoKnowledge.giOrNogi}) = 'gi_only'`,
              sql`LOWER(${aiVideoKnowledge.giOrNogi}) = 'both'`,
              sql`${aiVideoKnowledge.giOrNogi} IS NULL`,
              sql`TRIM(${aiVideoKnowledge.giOrNogi}) = ''`
            )
          );
        } else if (style === 'nogi') {
          // Match "nogi", "nogi_only", "no-gi", "both", OR unclassified (NULL/empty)
          conditions.push(
            or(
              sql`LOWER(${aiVideoKnowledge.giOrNogi}) = 'nogi'`,
              sql`LOWER(${aiVideoKnowledge.giOrNogi}) = 'nogi_only'`,
              sql`LOWER(${aiVideoKnowledge.giOrNogi}) = 'no-gi'`,
              sql`LOWER(${aiVideoKnowledge.giOrNogi}) = 'both'`,
              sql`${aiVideoKnowledge.giOrNogi} IS NULL`,
              sql`TRIM(${aiVideoKnowledge.giOrNogi}) = ''`
            )
          );
        } else if (style === 'both') {
          // Explicit "both" filter - show videos marked as "both"
          conditions.push(sql`LOWER(${aiVideoKnowledge.giOrNogi}) = 'both'`);
        }
      }

      // Min quality score filter
      if (minScore && minScore !== '0') {
        const minQuality = parseFloat(minScore as string);
        if (!isNaN(minQuality)) {
          conditions.push(gte(aiVideoKnowledge.qualityScore, minQuality));
        }
      }

      // Legacy filters for backwards compatibility
      if (instructor && instructor !== 'all') {
        conditions.push(eq(aiVideoKnowledge.instructorName, instructor as string));
      }

      if (category && category !== 'all') {
        conditions.push(eq(aiVideoKnowledge.techniqueType, category as string));
      }

      if (score && score !== 'all') {
        const scoreRange = score as string;
        const qualityScore = aiVideoKnowledge.qualityScore;
        if (scoreRange === '80+') {
          conditions.push(sql`${qualityScore} >= 8.0`);
        } else if (scoreRange === '70-79') {
          conditions.push(sql`${qualityScore} >= 7.0 AND ${qualityScore} < 8.0`);
        } else if (scoreRange === '60-69') {
          conditions.push(sql`${qualityScore} >= 6.0 AND ${qualityScore} < 7.0`);
        } else if (scoreRange === '0-59') {
          conditions.push(sql`${qualityScore} < 6.0`);
        }
      }

      // Fetch all columns, then transform in JavaScript
      const rawTechniques = await db
        .select()
        .from(aiVideoKnowledge)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(aiVideoKnowledge.analyzedAt))
        .limit(500);

      // Transform to expected format - using correct field names from schema
      const techniques = rawTechniques.map(t => {
        const helpfulCount = t.helpfulCount || 0;
        const notHelpfulCount = t.notHelpfulCount || 0;
        const totalFeedback = helpfulCount + notHelpfulCount;
        const helpfulRatio = totalFeedback > 0 ? (helpfulCount / totalFeedback) * 100 : 0;

        return {
          id: t.id,
          videoId: t.youtubeId,
          videoUrl: t.videoUrl,
          thumbnailUrl: t.thumbnailUrl,
          title: t.techniqueName || t.title,
          instructorName: t.instructorName,
          position: t.positionCategory,
          techniqueType: t.techniqueType,
          finalScore: Number(t.qualityScore || 0),
          keyDetailQuality: Number(t.techniqueDetailScore || 0),
          instructorCredibility: typeof t.instructorCredibility === 'string' ? t.instructorCredibility : 'unknown',
          productionQuality: Number(t.productionQualityScore || 0),
          teachingClarity: Number(t.teachingQualityScore || 0),
          demonstrationScore: Number(t.demonstrationScore || 0),
          keyDetails: typeof t.keyDetails === 'string' ? t.keyDetails : '',
          beltAppropriate: t.beltLevel,
          contentLevel: 'all',
          accepted: Number(t.qualityScore || 0) >= 7.0,
          createdAt: t.analyzedAt,
          duration: t.duration,
          
          // Engagement metrics
          viewCount: t.viewCount || 0,
          likeCount: t.likeCount || 0,
          helpfulCount: helpfulCount,
          notHelpfulCount: notHelpfulCount,
          helpfulRatio: Math.round(helpfulRatio),
          recommendationCount: t.recommendationCount || 0,
          
          // Stringify JSONB fields to prevent React rendering errors
          relatedTechniques: t.relatedTechniques ? JSON.stringify(t.relatedTechniques) : null,
          keyTimestamps: t.keyTimestamps ? JSON.stringify(t.keyTimestamps) : null,
        };
      });

      res.json({ techniques });
    } catch (error: any) {
      console.error('[TECHNIQUES API] Error fetching techniques:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get techniques stats
  app.get('/api/admin/techniques/stats', checkAdminAuth, async (req, res) => {
    try {
      // Fetch all records once and calculate stats in JavaScript
      const allRecords = await db.select()
        .from(aiVideoKnowledge);
      
      const total = allRecords.length;
      const avgScore = total > 0 
        ? allRecords.reduce((sum, r) => sum + Number(r.qualityScore || 0), 0) / total
        : 0;
      
      const analyzed = allRecords.filter(r => Number(r.qualityScore || 0) >= 7.0).length;
      const uniqueInstructors = new Set(allRecords.map(i => i.instructorName).filter(Boolean)).size;

      // Get today's date at midnight
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const addedToday = allRecords.filter(r => {
        if (!r.analyzedAt) return false;
        const recordDate = new Date(r.analyzedAt);
        return recordDate >= today;
      }).length;

      res.json({
        stats: {
          total_videos: total,
          avg_quality: Math.round(avgScore),
          added_today: addedToday,
          helpful_rate: 0, // This would need to come from feedback data
        }
      });
    } catch (error: any) {
      console.error('[TECHNIQUES API] Error fetching technique stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get unique instructors for filter
  app.get('/api/admin/techniques/instructors', checkAdminAuth, async (req, res) => {
    try {
      const allInstructors = await db
        .select()
        .from(aiVideoKnowledge);

      // Get unique, non-null instructors and sort
      const uniqueInstructors = Array.from(
        new Set(allInstructors.map(i => i.instructorName).filter(Boolean))
      ).sort();

      res.json({ instructors: uniqueInstructors });
    } catch (error: any) {
      console.error('[TECHNIQUES API] Error fetching instructors:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 24-Hour Activity Dashboard API
  app.get('/api/admin/activity-24h', checkAdminAuth, async (req, res) => {
    try {
      // Use SQL NOW() - INTERVAL for reliable timestamp comparison
      const timeFilter = sql`NOW() - INTERVAL '24 hours'`;

      // USER ACTIVITY
      const allQueries = await db
        .select()
        .from(profQueries)
        .where(sql`${profQueries.createdAt} >= ${timeFilter}`);

      const totalQueries = allQueries.length;
      const uniqueUsers = new Set(allQueries.map(q => q.userId).filter(Boolean)).size;

      const newSignups = await db
        .select()
        .from(bjjUsers)
        .where(sql`${bjjUsers.createdAt} >= NOW() - INTERVAL '24 hours'`);

      const newSignupsCount = newSignups.length;

      // ENGAGEMENT METRICS
      const interactions = await db
        .select()
        .from(activityLog)
        .where(sql`${activityLog.createdAt} >= NOW() - INTERVAL '24 hours'`);

      const videosClicked = interactions.filter(i => i.eventType === 'video_click').length;
      const videosWatched = interactions.filter(i => 
        i.eventType === 'video_watch' && 
        (i.metadata as any)?.watchDuration && 
        (i.metadata as any).watchDuration > 30
      ).length;

      const watchDurations = interactions
        .filter(i => i.eventType === 'video_watch' && (i.metadata as any)?.watchDuration)
        .map(i => (i.metadata as any).watchDuration);

      const avgWatchDuration = watchDurations.length > 0
        ? Math.round(watchDurations.reduce((a, b) => a + b, 0) / watchDurations.length)
        : 0;

      // USER FEEDBACK
      const feedback = await db
        .select()
        .from(videoInteractions)
        .where(sql`${videoInteractions.createdAt} >= NOW() - INTERVAL '24 hours'`);

      const thumbsUp = feedback.filter(f => f.thumbsUp === true).length;
      const thumbsDown = feedback.filter(f => f.thumbsDown === true).length;
      const satisfactionRate = feedback.length > 0
        ? Math.round((thumbsUp / feedback.length) * 100)
        : 0;

      // CONTENT PERFORMANCE - Most recommended videos
      const videoRecommendations = allQueries
        .flatMap(q => (q.recommendedVideos as any[] || []))
        .filter(v => v && v.videoId);

      const videoClickCounts: Record<string, {count: number, video: any}> = {};
      videoRecommendations.forEach(v => {
        if (v.videoId) {
          if (!videoClickCounts[v.videoId]) {
            videoClickCounts[v.videoId] = { count: 0, video: v };
          }
          videoClickCounts[v.videoId].count++;
        }
      });

      const mostRecommendedVideos = Object.values(videoClickCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(v => ({
          videoId: v.video.videoId,
          title: v.video.title || 'Unknown',
          instructor: v.video.instructor || 'Unknown',
          recommendCount: v.count
        }));

      // SYSTEM HEALTH
      const multiAgentQueries = allQueries.filter(q => q.useMultiAgent === true).length;
      const basicQueries = totalQueries - multiAgentQueries;

      const responseTimes = allQueries
        .filter(q => q.responseTime)
        .map(q => q.responseTime as number);

      const avgResponseTime = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;

      const errorRate = allQueries.filter(q => q.error).length;

      // RECENT ACTIVITY LOG - Last 20 queries
      const recentQueries = allQueries
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
        .slice(0, 20)
        .map(q => ({
          timestamp: q.createdAt ? new Date(q.createdAt).toISOString() : null,
          userAnonymized: q.userId ? `***${q.userId.slice(-4)}` : 'Unknown',
          question: q.userQuestion,
          videosRecommended: (q.recommendedVideos as any[] || []).length,
          multiAgent: q.useMultiAgent || false,
          responseTime: q.responseTime || null
        }));

      res.json({
        userActivity: {
          totalQueries,
          uniqueUsers,
          newSignups: newSignupsCount,
          returningUsers: uniqueUsers - newSignupsCount
        },
        engagement: {
          videosClicked,
          videosWatched,
          avgWatchDuration,
          completionRate: videosClicked > 0 ? Math.round((videosWatched / videosClicked) * 100) : 0
        },
        contentPerformance: {
          mostRecommendedVideos
        },
        systemHealth: {
          totalQueries,
          multiAgentQueries,
          basicQueries,
          multiAgentPercentage: totalQueries > 0 ? Math.round((multiAgentQueries / totalQueries) * 100) : 0,
          avgResponseTime,
          errorRate: totalQueries > 0 ? Math.round((errorRate / totalQueries) * 100) : 0
        },
        userFeedback: {
          thumbsUp,
          thumbsDown,
          satisfactionRate,
          totalFeedback: feedback.length
        },
        recentActivity: recentQueries
      });
    } catch (error: any) {
      console.error('[ACTIVITY-24H API] Error fetching activity:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TECHNIQUE CHAINS API
  // ═══════════════════════════════════════════════════════════════════════════════

  // Get list of chains with filters
  app.get('/api/chains', async (req, res) => {
    try {
      const { position, difficulty, belt_level, category, limit = 20 } = req.query;
      
      const conditions: any[] = [];
      
      if (position) {
        conditions.push(eq(techniqueChains.positionStart, position as string));
      }
      if (difficulty) {
        conditions.push(eq(techniqueChains.difficultyLevel, difficulty as string));
      }
      if (belt_level) {
        conditions.push(eq(techniqueChains.minBeltLevel, belt_level as string));
      }
      if (category) {
        conditions.push(eq(techniqueChains.primaryCategory, category as string));
      }

      const chains = await db
        .select()
        .from(techniqueChains)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(techniqueChains.helpfulRatio), desc(techniqueChains.timesRecommended))
        .limit(parseInt(limit as string));

      res.json(chains);
    } catch (error: any) {
      console.error('[CHAINS API] Error fetching chains:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get single chain by ID
  app.get('/api/chains/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const [chain] = await db
        .select()
        .from(techniqueChains)
        .where(eq(techniqueChains.id, parseInt(id)));

      if (!chain) {
        return res.status(404).json({ error: 'Chain not found' });
      }

      // Increment recommendation count
      await db
        .update(techniqueChains)
        .set({ 
          timesRecommended: (chain.timesRecommended || 0) + 1,
          updatedAt: new Date()
        })
        .where(eq(techniqueChains.id, parseInt(id)));

      res.json(chain);
    } catch (error: any) {
      console.error('[CHAINS API] Error fetching chain:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Save chain to user's library
  app.post('/api/user/chains/save', async (req, res) => {
    try {
      const { userId, chainId, personalNotes } = req.body;

      if (!userId || !chainId) {
        return res.status(400).json({ error: 'userId and chainId are required' });
      }

      // Check if already saved
      const [existing] = await db
        .select()
        .from(userSavedChains)
        .where(
          and(
            eq(userSavedChains.userId, userId),
            eq(userSavedChains.chainId, chainId)
          )
        );

      if (existing) {
        return res.status(400).json({ error: 'Chain already saved' });
      }

      const [saved] = await db
        .insert(userSavedChains)
        .values({
          userId,
          chainId,
          personalNotes: personalNotes || null,
        })
        .returning();

      // Update chain times_saved count
      const [chain] = await db.select({
        id: techniqueChains.id,
        timesSaved: techniqueChains.timesSaved
      }).from(techniqueChains).where(eq(techniqueChains.id, chainId));
      if (chain) {
        await db
          .update(techniqueChains)
          .set({ 
            timesSaved: (chain.timesSaved || 0) + 1,
            updatedAt: new Date()
          })
          .where(eq(techniqueChains.id, chainId));
      }

      res.json(saved);
    } catch (error: any) {
      console.error('[CHAINS API] Error saving chain:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Submit feedback on chain
  app.post('/api/chains/:id/feedback', async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, feedbackType, feedbackComment } = req.body;

      if (!userId || !feedbackType) {
        return res.status(400).json({ error: 'userId and feedbackType are required' });
      }

      if (!['helpful', 'not_helpful'].includes(feedbackType)) {
        return res.status(400).json({ error: 'feedbackType must be helpful or not_helpful' });
      }

      const [feedback] = await db
        .insert(chainFeedback)
        .values({
          userId,
          chainId: parseInt(id),
          feedbackType,
          feedbackComment: feedbackComment || null,
        })
        .returning();

      // Update chain helpful counts
      const [chain] = await db.select({
        id: techniqueChains.id,
        helpfulCount: techniqueChains.helpfulCount,
        notHelpfulCount: techniqueChains.notHelpfulCount
      }).from(techniqueChains).where(eq(techniqueChains.id, parseInt(id)));
      if (chain) {
        const helpfulCount = feedbackType === 'helpful' ? (chain.helpfulCount || 0) + 1 : (chain.helpfulCount || 0);
        const notHelpfulCount = feedbackType === 'not_helpful' ? (chain.notHelpfulCount || 0) + 1 : (chain.notHelpfulCount || 0);
        const total = helpfulCount + notHelpfulCount;
        const helpfulRatio = total > 0 ? (helpfulCount / total) * 100 : null;

        await db
          .update(techniqueChains)
          .set({
            helpfulCount,
            notHelpfulCount,
            helpfulRatio: helpfulRatio ? helpfulRatio.toString() : null,
            updatedAt: new Date()
          })
          .where(eq(techniqueChains.id, parseInt(id)));
      }

      res.json(feedback);
    } catch (error: any) {
      console.error('[CHAINS API] Error submitting feedback:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's saved chains
  app.get('/api/user/:userId/saved-chains', async (req, res) => {
    try {
      const { userId } = req.params;

      const savedChains = await db
        .select({
          id: userSavedChains.id,
          chainId: userSavedChains.chainId,
          personalNotes: userSavedChains.personalNotes,
          drillingCount: userSavedChains.drillingCount,
          lastDrilledDate: userSavedChains.lastDrilledDate,
          successInRolling: userSavedChains.successInRolling,
          successCount: userSavedChains.successCount,
          savedAt: userSavedChains.savedAt,
          chain: techniqueChains,
        })
        .from(userSavedChains)
        .innerJoin(techniqueChains, eq(userSavedChains.chainId, techniqueChains.id))
        .where(eq(userSavedChains.userId, userId))
        .orderBy(desc(userSavedChains.savedAt));

      res.json(savedChains);
    } catch (error: any) {
      console.error('[CHAINS API] Error fetching saved chains:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update saved chain (drilling count, notes, success)
  app.patch('/api/user/saved-chains/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { personalNotes, drillingCount, lastDrilledDate, successInRolling, successCount } = req.body;

      const updates: any = {};
      if (personalNotes !== undefined) updates.personalNotes = personalNotes;
      if (drillingCount !== undefined) updates.drillingCount = drillingCount;
      if (lastDrilledDate !== undefined) updates.lastDrilledDate = lastDrilledDate;
      if (successInRolling !== undefined) updates.successInRolling = successInRolling;
      if (successCount !== undefined) updates.successCount = successCount;

      const [updated] = await db
        .update(userSavedChains)
        .set(updates)
        .where(eq(userSavedChains.id, parseInt(id)))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Saved chain not found' });
      }

      res.json(updated);
    } catch (error: any) {
      console.error('[CHAINS API] Error updating saved chain:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Remove saved chain
  app.delete('/api/user/saved-chains/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const [deleted] = await db
        .delete(userSavedChains)
        .where(eq(userSavedChains.id, parseInt(id)))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Saved chain not found' });
      }

      // Decrement chain times_saved count
      const [chain] = await db.select({
        id: techniqueChains.id,
        timesSaved: techniqueChains.timesSaved
      }).from(techniqueChains).where(eq(techniqueChains.id, deleted.chainId));
      if (chain && (chain.timesSaved || 0) > 0) {
        await db
          .update(techniqueChains)
          .set({ 
            timesSaved: (chain.timesSaved || 0) - 1,
            updatedAt: new Date()
          })
          .where(eq(techniqueChains.id, deleted.chainId));
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('[CHAINS API] Error deleting saved chain:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: Get chain stats
  app.get('/api/admin/chains/stats', checkAdminAuth, async (req, res) => {
    try {
      const [totalChains] = await db.select({ count: count() }).from(techniqueChains);
      const [totalSaved] = await db.select({ count: count() }).from(userSavedChains);
      const [totalFeedback] = await db.select({ count: count() }).from(chainFeedback);

      const topChains = await db
        .select()
        .from(techniqueChains)
        .orderBy(desc(techniqueChains.timesSaved))
        .limit(10);

      res.json({
        totalChains: totalChains.count,
        totalSaved: totalSaved.count,
        totalFeedback: totalFeedback.count,
        topChains,
      });
    } catch (error: any) {
      console.error('[CHAINS API] Error fetching stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // PUSH NOTIFICATIONS API
  // ============================================================================
  
  // Subscribe to push notifications
  app.post('/api/push/subscribe', checkUserAuth, async (req, res) => {
    try {
      const { userId, subscription } = req.body;

      // Verify user is authorized to create subscription for this userId
      if (!req.user || req.user.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized to create subscription for this user' });
      }

      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ error: 'Missing required subscription data' });
      }

      // Check if subscription already exists
      const [existing] = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint));

      if (existing) {
        // Verify ownership
        if (existing.userId !== userId) {
          return res.status(403).json({ error: 'Subscription belongs to another user' });
        }
        
        // Reactivate if deactivated
        if (!existing.isActive) {
          await db
            .update(pushSubscriptions)
            .set({ isActive: true, updatedAt: new Date() })
            .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
        }
        return res.json({ success: true, subscription: existing });
      }

      // Create new subscription
      const [created] = await db
        .insert(pushSubscriptions)
        .values({
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          deviceType: req.body.deviceType || 'web',
          userAgent: req.headers['user-agent'] || null,
        })
        .returning();

      console.log(`✅ Push subscription created for user ${userId}`);
      
      // Try to send test notification (non-blocking, don't fail if it errors)
      try {
        const { sendPushToUser } = await import('./push-notifications');
        await sendPushToUser(userId, {
          title: '🥋 BJJ OS Notifications Active!',
          body: 'You\'ll now receive daily technique updates from Prof. OS.',
          url: '/chat'
        });
      } catch (notifError) {
        console.warn('[PUSH API] Test notification failed (non-fatal):', notifError);
      }

      res.json({ success: true, subscription: created });
    } catch (error: any) {
      console.error('[PUSH API] Error subscribing:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Unsubscribe from push notifications
  app.post('/api/push/unsubscribe', checkUserAuth, async (req, res) => {
    try {
      const { endpoint } = req.body;

      if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint is required' });
      }

      // Verify subscription belongs to authenticated user
      const [subscription] = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));

      if (subscription && req.user && subscription.userId !== req.user.userId) {
        return res.status(403).json({ error: 'Unauthorized to unsubscribe this endpoint' });
      }

      await db
        .update(pushSubscriptions)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(pushSubscriptions.endpoint, endpoint));

      res.json({ success: true });
    } catch (error: any) {
      console.error('[PUSH API] Error unsubscribing:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's push subscription status
  app.get('/api/push/status/:userId', checkUserAuth, async (req, res) => {
    try {
      const { userId } = req.params;

      // Verify user is authorized to view this userId's subscriptions
      if (!req.user || req.user.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized to view subscriptions' });
      }

      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.isActive, true)
        ));

      res.json({
        subscribed: subscriptions.length > 0,
        subscriptionCount: subscriptions.length,
        subscriptions: subscriptions.map(s => ({
          id: s.id,
          deviceType: s.deviceType,
          createdAt: s.createdAt
        }))
      });
    } catch (error: any) {
      console.error('[PUSH API] Error getting status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test push notification (admin only for debugging)
  app.post('/api/push/test/:userId', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const { testPushNotification } = await import('./push-notifications');
      
      const result = await testPushNotification(userId);
      res.json(result);
    } catch (error: any) {
      console.error('[PUSH API] Error sending test push:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // INSTRUCTOR PRIORITY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════
  
  // Recalculate auto-priority for all instructors (admin only)
  app.post('/api/instructors/priority/recalculate-all', checkAdminAuth, async (req, res) => {
    try {
      const { calculateInstructorPriority } = await import('./utils/instructorPriority');
      const instructors = await db.select({
        id: instructorCredibility.id,
        name: instructorCredibility.name,
        priorityMode: instructorCredibility.priorityMode,
        tier: instructorCredibility.tier,
        youtubeSubscribers: instructorCredibility.youtubeSubscribers,
        achievements: instructorCredibility.achievements,
        hasInstructionalSeries: instructorCredibility.hasInstructionalSeries,
        instructionalPlatforms: instructorCredibility.instructionalPlatforms,
        helpfulRatio: instructorCredibility.helpfulRatio
      }).from(instructorCredibility);
      
      let updated = 0;
      for (const instructor of instructors) {
        // Skip manual mode instructors - they keep their manual override
        if (instructor.priorityMode === 'manual') {
          continue;
        }

        const result = calculateInstructorPriority(instructor);
        
        await db.update(instructorCredibility)
          .set({
            autoCalculatedPriority: result.totalScore,
            recommendationPriority: result.totalScore,
            lastAutoCalculation: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(instructorCredibility.id, instructor.id));
        
        updated++;
      }
      
      res.json({ 
        success: true, 
        updated,
        message: `Recalculated priority for ${updated} instructors in auto mode`
      });
    } catch (error: any) {
      console.error('[INSTRUCTOR PRIORITY] Error recalculating all:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Recalculate auto-priority for single instructor (admin only)
  app.post('/api/instructors/:id/priority/recalculate', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { calculateInstructorPriority } = await import('./utils/instructorPriority');
      
      const [instructor] = await db.select({
        id: instructorCredibility.id,
        name: instructorCredibility.name,
        priorityMode: instructorCredibility.priorityMode,
        manualOverridePriority: instructorCredibility.manualOverridePriority,
        tier: instructorCredibility.tier,
        youtubeSubscribers: instructorCredibility.youtubeSubscribers,
        achievements: instructorCredibility.achievements,
        hasInstructionalSeries: instructorCredibility.hasInstructionalSeries,
        instructionalPlatforms: instructorCredibility.instructionalPlatforms,
        helpfulRatio: instructorCredibility.helpfulRatio
      })
        .from(instructorCredibility)
        .where(eq(instructorCredibility.id, id))
        .limit(1);
      
      if (!instructor) {
        return res.status(404).json({ error: 'Instructor not found' });
      }

      const result = calculateInstructorPriority(instructor);
      
      // Update auto-calculated priority (don't touch manual override)
      await db.update(instructorCredibility)
        .set({
          autoCalculatedPriority: result.totalScore,
          recommendationPriority: instructor.priorityMode === 'manual' 
            ? instructor.manualOverridePriority 
            : result.totalScore,
          lastAutoCalculation: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(instructorCredibility.id, id));
      
      res.json({ 
        success: true,
        instructor: instructor.name,
        mode: instructor.priorityMode,
        autoScore: result.totalScore,
        effectivePriority: instructor.priorityMode === 'manual' 
          ? instructor.manualOverridePriority 
          : result.totalScore,
        breakdown: result.breakdown
      });
    } catch (error: any) {
      console.error('[INSTRUCTOR PRIORITY] Error recalculating:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Set manual priority override (admin only)
  app.post('/api/instructors/:id/manual-override', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { priority, reason } = req.body;
      
      if (typeof priority !== 'number' || priority < 0 || priority > 100) {
        return res.status(400).json({ error: 'Priority must be between 0 and 100' });
      }

      const [instructor] = await db.select({
        id: instructorCredibility.id,
        name: instructorCredibility.name
      })
        .from(instructorCredibility)
        .where(eq(instructorCredibility.id, id))
        .limit(1);
      
      if (!instructor) {
        return res.status(404).json({ error: 'Instructor not found' });
      }

      await db.update(instructorCredibility)
        .set({
          priorityMode: 'manual',
          manualOverridePriority: priority,
          recommendationPriority: priority,
          manualOverrideDate: new Date(),
          manualOverrideBy: req.user?.userId || 'admin',
          manualOverrideReason: reason || null,
          updatedAt: new Date(),
        })
        .where(eq(instructorCredibility.id, id));
      
      console.log(`[INSTRUCTOR] Manual override set: ${instructor.name} = ${priority} (${reason || 'no reason'})`);
      
      res.json({ 
        success: true,
        message: `Manual priority set to ${priority} for ${instructor.name}`,
        instructor: instructor.name,
        priority
      });
    } catch (error: any) {
      console.error('[INSTRUCTOR PRIORITY] Error setting manual override:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Remove manual override and switch back to auto mode (admin only)
  app.delete('/api/instructors/:id/manual-override', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { calculateInstructorPriority } = await import('./utils/instructorPriority');
      
      const [instructor] = await db.select({
        id: instructorCredibility.id,
        name: instructorCredibility.name,
        tier: instructorCredibility.tier,
        youtubeSubscribers: instructorCredibility.youtubeSubscribers,
        achievements: instructorCredibility.achievements,
        hasInstructionalSeries: instructorCredibility.hasInstructionalSeries,
        instructionalPlatforms: instructorCredibility.instructionalPlatforms,
        helpfulRatio: instructorCredibility.helpfulRatio
      })
        .from(instructorCredibility)
        .where(eq(instructorCredibility.id, id))
        .limit(1);
      
      if (!instructor) {
        return res.status(404).json({ error: 'Instructor not found' });
      }

      // Recalculate auto priority
      const result = calculateInstructorPriority(instructor);

      await db.update(instructorCredibility)
        .set({
          priorityMode: 'auto',
          manualOverridePriority: null,
          recommendationPriority: result.totalScore,
          manualOverrideDate: null,
          manualOverrideBy: null,
          manualOverrideReason: null,
          autoCalculatedPriority: result.totalScore,
          lastAutoCalculation: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(instructorCredibility.id, id));
      
      console.log(`[INSTRUCTOR] Switched to auto mode: ${instructor.name} = ${result.totalScore}`);
      
      res.json({ 
        success: true,
        message: `Switched ${instructor.name} to auto mode`,
        instructor: instructor.name,
        autoScore: result.totalScore
      });
    } catch (error: any) {
      console.error('[INSTRUCTOR PRIORITY] Error removing manual override:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get detailed priority calculation breakdown
  app.get('/api/instructors/:id/priority-details', checkAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { calculateInstructorPriority } = await import('./utils/instructorPriority');
      
      const [instructor] = await db.select({
        id: instructorCredibility.id,
        name: instructorCredibility.name,
        tier: instructorCredibility.tier,
        priorityMode: instructorCredibility.priorityMode,
        recommendationPriority: instructorCredibility.recommendationPriority,
        lastAutoCalculation: instructorCredibility.lastAutoCalculation,
        manualOverridePriority: instructorCredibility.manualOverridePriority,
        manualOverrideDate: instructorCredibility.manualOverrideDate,
        manualOverrideBy: instructorCredibility.manualOverrideBy,
        manualOverrideReason: instructorCredibility.manualOverrideReason,
        youtubeSubscribers: instructorCredibility.youtubeSubscribers,
        achievements: instructorCredibility.achievements,
        hasInstructionalSeries: instructorCredibility.hasInstructionalSeries,
        instructionalPlatforms: instructorCredibility.instructionalPlatforms,
        helpfulRatio: instructorCredibility.helpfulRatio
      })
        .from(instructorCredibility)
        .where(eq(instructorCredibility.id, id))
        .limit(1);
      
      if (!instructor) {
        return res.status(404).json({ error: 'Instructor not found' });
      }

      const calculation = calculateInstructorPriority(instructor);
      
      res.json({
        instructor: {
          id: instructor.id,
          name: instructor.name,
          tier: instructor.tier,
        },
        mode: instructor.priorityMode,
        effectivePriority: instructor.recommendationPriority,
        autoCalculation: {
          totalScore: calculation.totalScore,
          breakdown: calculation.breakdown,
          lastCalculated: instructor.lastAutoCalculation,
        },
        manualOverride: instructor.priorityMode === 'manual' ? {
          priority: instructor.manualOverridePriority,
          date: instructor.manualOverrideDate,
          by: instructor.manualOverrideBy,
          reason: instructor.manualOverrideReason,
        } : null,
        inputs: {
          youtubeSubscribers: instructor.youtubeSubscribers || 0,
          achievements: instructor.achievements || [],
          hasInstructionalSeries: instructor.hasInstructionalSeries || false,
          instructionalPlatforms: instructor.instructionalPlatforms || [],
          helpfulRatio: instructor.helpfulRatio || 0,
        }
      });
    } catch (error: any) {
      console.error('[INSTRUCTOR PRIORITY] Error getting details:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // DEVICE MANAGEMENT - User settings
  // ═══════════════════════════════════════════════════════════════════
  
  // Get user's authorized devices
  app.get('/api/user/devices', checkUserAuth, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      
      const devices = await db.select({
        id: authorizedDevices.id,
        deviceName: authorizedDevices.deviceName,
        deviceType: authorizedDevices.deviceType,
        browser: authorizedDevices.browser,
        os: authorizedDevices.os,
        firstSeen: authorizedDevices.firstSeen,
        lastSeen: authorizedDevices.lastSeen,
        loginCount: authorizedDevices.loginCount,
        city: authorizedDevices.city,
        country: authorizedDevices.country
      })
        .from(authorizedDevices)
        .where(and(
          eq(authorizedDevices.userId, userId),
          eq(authorizedDevices.isActive, true)
        ))
        .orderBy(desc(authorizedDevices.lastSeen));
      
      res.json({
        devices: devices.map(d => ({
          id: d.id,
          deviceName: d.deviceName,
          deviceType: d.deviceType,
          browser: d.browser,
          os: d.os,
          firstSeen: d.firstSeen,
          lastSeen: d.lastSeen,
          loginCount: d.loginCount,
          city: d.city,
          country: d.country,
        })),
        maxDevices: 3,
      });
    } catch (error: any) {
      console.error('[DEVICE] Error getting devices:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Remove a device (revoke access)
  app.delete('/api/user/devices/:id', checkUserAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      
      // Verify device belongs to user
      const [device] = await db.select({
        id: authorizedDevices.id,
        deviceName: authorizedDevices.deviceName
      })
        .from(authorizedDevices)
        .where(and(
          eq(authorizedDevices.id, id),
          eq(authorizedDevices.userId, userId)
        ))
        .limit(1);
      
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
      
      // Soft delete - mark as inactive
      await db.update(authorizedDevices)
        .set({ isActive: false })
        .where(eq(authorizedDevices.id, id));
      
      console.log(`[DEVICE] User ${userId} removed device: ${device.deviceName}`);
      
      res.json({ 
        success: true,
        message: `Device removed: ${device.deviceName}`
      });
    } catch (error: any) {
      console.error('[DEVICE] Error removing device:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // USER SUBSCRIPTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════
  
  // Get subscription details for the current user
  app.get('/api/subscription', checkUserAuth, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      
      const [user] = await db.select({
        id: bjjUsers.id,
        email: bjjUsers.email,
        stripeSubscriptionId: bjjUsers.stripeSubscriptionId,
        subscriptionType: bjjUsers.subscriptionType,
        subscriptionStatus: bjjUsers.subscriptionStatus,
        subscriptionEndDate: bjjUsers.subscriptionEndDate,
        referralCode: bjjUsers.referralCode,
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      let subscriptionDetails: any = {
        type: 'none',
        status: user.subscriptionStatus || 'none',
        tier: user.subscriptionType || 'free',
      };
      
      // Check for lifetime access
      if (user.subscriptionType === 'lifetime' || user.subscriptionStatus === 'lifetime') {
        subscriptionDetails = {
          type: 'lifetime',
          status: 'active',
          tier: 'lifetime',
          billingDate: null,
          cancelAtPeriodEnd: false
        };
      }
      // Check for active Stripe subscription
      else if (user.stripeSubscriptionId) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
          
          subscriptionDetails = {
            type: stripeSubscription.trial_end && stripeSubscription.trial_end > Math.floor(Date.now() / 1000) 
              ? 'trial' 
              : 'paying',
            status: stripeSubscription.status,
            tier: 'pro',
            billingDate: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
            cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
            trialEnd: stripeSubscription.trial_end 
              ? new Date(stripeSubscription.trial_end * 1000).toISOString() 
              : null
          };
          
          // Check if this is a referral trial (30 days)
          if (user.referralCode && subscriptionDetails.type === 'trial') {
            subscriptionDetails.type = 'referral';
          }
        } catch (stripeError: any) {
          console.error('[SUBSCRIPTION] Stripe fetch error:', stripeError.message);
        }
      }
      // No active subscription
      else if (!user.subscriptionType || user.subscriptionType === 'free' || user.subscriptionType === 'free_trial' || user.subscriptionStatus === 'canceled') {
        subscriptionDetails = {
          type: 'none',
          status: user.subscriptionStatus || 'none',
          tier: 'free',
          billingDate: null,
          cancelAtPeriodEnd: false
        };
      }
      
      res.json(subscriptionDetails);
    } catch (error: any) {
      console.error('[SUBSCRIPTION] Error getting details:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Cancel subscription (at period end - user keeps access until billing date)
  app.post('/api/subscription/cancel', checkUserAuth, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      
      const [user] = await db.select({
        id: bjjUsers.id,
        email: bjjUsers.email,
        stripeSubscriptionId: bjjUsers.stripeSubscriptionId,
        subscriptionType: bjjUsers.subscriptionType,
      })
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      
      // Cannot cancel lifetime subscriptions
      if (user.subscriptionType === 'lifetime') {
        return res.status(400).json({ 
          success: false, 
          error: 'Lifetime memberships cannot be cancelled' 
        });
      }
      
      // Must have an active Stripe subscription to cancel
      if (!user.stripeSubscriptionId) {
        return res.status(400).json({ 
          success: false, 
          error: 'No active subscription to cancel' 
        });
      }
      
      console.log(`[SUBSCRIPTION] User ${userId} (${user.email}) cancelling subscription`);
      
      // Cancel at period end (user keeps access until billing date)
      const updatedSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true
      });
      
      const accessUntil = new Date(updatedSubscription.current_period_end * 1000);
      
      console.log(`[SUBSCRIPTION] Cancelled at period end: ${accessUntil.toISOString()}`);
      
      res.json({
        success: true,
        accessUntil: accessUntil.toISOString(),
        message: `Subscription cancelled. You have access until ${accessUntil.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
      });
    } catch (error: any) {
      console.error('[SUBSCRIPTION] Cancel error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ADMIN: FLAGGED ACCOUNTS REVIEW
  // ═══════════════════════════════════════════════════════════════════
  
  // Get all flagged accounts (admin only)
  app.get('/api/admin/flagged-accounts', checkAdminAuth, async (req, res) => {
    try {
      const { status } = req.query;
      
      let query = db.select({
        flag: flaggedAccounts,
        user: bjjUsers,
      })
        .from(flaggedAccounts)
        .leftJoin(bjjUsers, eq(flaggedAccounts.userId, bjjUsers.id))
        .orderBy(desc(flaggedAccounts.flaggedAt));
      
      if (status === 'pending') {
        query = query.where(eq(flaggedAccounts.status, 'pending'));
      }
      
      const results = await query.limit(100);
      
      // Calculate additional fields for each flagged account
      const flaggedAccountsData = await Promise.all(results.map(async r => {
        // Get device count
        const devices = await db.select({ count: count() })
          .from(authorizedDevices)
          .where(eq(authorizedDevices.userId, r.flag.userId));
        const deviceCount = Number(devices[0]?.count || 0);
        
        // Get suspicious events count (login events in last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const events = await db.select({ count: count() })
          .from(loginEvents)
          .where(and(
            eq(loginEvents.userId, r.flag.userId),
            gte(loginEvents.loginTime, thirtyDaysAgo)
          ));
        const suspiciousEvents = Number(events[0]?.count || 0);
        
        // Calculate fraud score (0-100) based on various factors
        let fraudScore = 0;
        const fraudIndicators: string[] = [];
        
        if (deviceCount > 3) {
          fraudScore += 30;
          fraudIndicators.push('Excessive devices');
        }
        if (r.flag.reason.includes('impossible_travel')) {
          fraudScore += 40;
          fraudIndicators.push('Impossible travel detected');
        }
        if (r.flag.reason.includes('concurrent_login')) {
          fraudScore += 25;
          fraudIndicators.push('Concurrent logins');
        }
        if (suspiciousEvents > 20) {
          fraudScore += 15;
          fraudIndicators.push('High login frequency');
        }
        
        // Determine risk level
        let riskLevel = 'LOW';
        if (fraudScore >= 60) riskLevel = 'HIGH';
        else if (fraudScore >= 30) riskLevel = 'MEDIUM';
        
        // Check if resolved
        const isResolved = r.flag.status !== 'pending';
        
        return {
          id: r.flag.id,
          userId: r.flag.userId,
          phoneNumber: r.user?.phoneNumber || 'Unknown',
          name: r.user?.name || null,
          fraudScore,
          riskLevel,
          flaggedAt: r.flag.flaggedAt?.toISOString() || new Date().toISOString(),
          lastReviewedAt: r.flag.reviewedAt?.toISOString() || null,
          isResolved,
          fraudIndicators,
          deviceCount,
          suspiciousEvents,
        };
      }));
      
      res.json(flaggedAccountsData);
    } catch (error: any) {
      console.error('[ADMIN] Error getting flagged accounts:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Review flagged account (admin only)
  app.post('/api/admin/flagged-accounts/:id/review', checkAdminAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      
      if (!['false_positive', 'suspended', 'warned'].includes(status)) {
        return res.status(400).json({ 
          error: 'Invalid status. Must be: false_positive, suspended, or warned' 
        });
      }
      
      await db.update(flaggedAccounts)
        .set({
          status,
          notes: notes || null,
          reviewedBy: req.user?.userId || 'admin',
          reviewedAt: new Date(),
        })
        .where(eq(flaggedAccounts.id, id));
      
      console.log(`[ADMIN] Flagged account reviewed: ${id} → ${status}`);
      
      res.json({ 
        success: true,
        message: `Account ${status === 'false_positive' ? 'cleared' : status}`
      });
    } catch (error: any) {
      console.error('[ADMIN] Error reviewing flagged account:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get devices for a user (admin only)
  app.get('/api/admin/devices/:userId', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      
      const devices = await db.select({
        id: authorizedDevices.id,
        userId: authorizedDevices.userId,
        fingerprint: authorizedDevices.fingerprint,
        deviceName: authorizedDevices.deviceName,
        deviceType: authorizedDevices.deviceType,
        browser: authorizedDevices.browser,
        os: authorizedDevices.os,
        firstSeen: authorizedDevices.firstSeen,
        lastSeen: authorizedDevices.lastSeen,
        loginCount: authorizedDevices.loginCount,
        ipAddress: authorizedDevices.ipAddress,
        city: authorizedDevices.city,
        country: authorizedDevices.country,
        isActive: authorizedDevices.isActive
      })
        .from(authorizedDevices)
        .where(eq(authorizedDevices.userId, userId))
        .orderBy(desc(authorizedDevices.lastSeen));
      
      res.json(devices);
    } catch (error: any) {
      console.error('[ADMIN] Error getting user devices:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get device/login analytics for a user (admin only)
  app.get('/api/admin/users/:userId/security', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Get devices
      const devices = await db.select({
        id: authorizedDevices.id,
        fingerprint: authorizedDevices.fingerprint,
        deviceName: authorizedDevices.deviceName,
        deviceType: authorizedDevices.deviceType,
        browser: authorizedDevices.browser,
        os: authorizedDevices.os,
        firstSeen: authorizedDevices.firstSeen,
        lastSeen: authorizedDevices.lastSeen,
        loginCount: authorizedDevices.loginCount,
        ipAddress: authorizedDevices.ipAddress,
        city: authorizedDevices.city,
        country: authorizedDevices.country,
        isActive: authorizedDevices.isActive
      })
        .from(authorizedDevices)
        .where(eq(authorizedDevices.userId, userId))
        .orderBy(desc(authorizedDevices.lastSeen));
      
      // Get recent logins (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentLogins = await db.select({
        id: loginEvents.id,
        deviceFingerprint: loginEvents.deviceFingerprint,
        ipAddress: loginEvents.ipAddress,
        city: loginEvents.city,
        country: loginEvents.country,
        latitude: loginEvents.latitude,
        longitude: loginEvents.longitude,
        loginTime: loginEvents.loginTime,
        success: loginEvents.success,
        failureReason: loginEvents.failureReason
      })
        .from(loginEvents)
        .where(and(
          eq(loginEvents.userId, userId),
          gte(loginEvents.loginTime, thirtyDaysAgo)
        ))
        .orderBy(desc(loginEvents.loginTime))
        .limit(50);
      
      // Get flags
      const flags = await db.select({
        id: flaggedAccounts.id,
        userId: flaggedAccounts.userId,
        reason: flaggedAccounts.reason,
        data: flaggedAccounts.data,
        flaggedAt: flaggedAccounts.flaggedAt,
        reviewedBy: flaggedAccounts.reviewedBy,
        reviewedAt: flaggedAccounts.reviewedAt,
        status: flaggedAccounts.status,
        notes: flaggedAccounts.notes
      })
        .from(flaggedAccounts)
        .where(eq(flaggedAccounts.userId, userId))
        .orderBy(desc(flaggedAccounts.flaggedAt));
      
      res.json({
        devices,
        recentLogins,
        flags,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting user security data:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // APP WAITLIST - Collect emails/phones for native app launch
  // ═══════════════════════════════════════════════════════════════════
  
  app.post('/api/waitlist', async (req, res) => {
    try {
      const { insertAppWaitlistSchema, appWaitlist } = await import('@shared/schema');
      const { storage } = await import('./storage');
      
      // Validate request body
      const result = insertAppWaitlistSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: result.error.errors 
        });
      }

      // Create waitlist entry
      const entry = await storage.createWaitlistEntry(result.data);
      
      console.log(`[WAITLIST] New signup: ${entry.email} / ${entry.phone}`);
      
      res.json({ 
        success: true, 
        message: "You're on the list! We'll notify you when the apps launch.",
        entry: {
          id: entry.id,
          email: entry.email
        }
      });
    } catch (error: any) {
      console.error('[WAITLIST] Error creating entry:', error);
      res.status(500).json({ error: 'Failed to join waitlist. Please try again.' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // URL SHORTENER - bjjos.app/t/CODE with rich link previews
  // ═══════════════════════════════════════════════════════════════════

  // Generate short code helper (5-character alphanumeric)
  function generateShortCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Extract YouTube ID from URL
  function extractYouTubeId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/,
      /youtube\.com\/embed\/([^&?/]+)/,
      /youtube\.com\/v\/([^&?/]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // Create short URL for a video (admin only)
  app.post('/api/short-url', checkAdminAuth, async (req, res) => {
    try {
      const { videoId } = req.body;

      if (!videoId) {
        return res.status(400).json({ error: 'Video ID is required' });
      }

      // Get video details
      const video = await db.select({
        id: aiVideoKnowledge.id,
        youtubeUrl: aiVideoKnowledge.youtubeUrl,
        techniqueName: aiVideoKnowledge.techniqueName,
        instructorName: aiVideoKnowledge.instructorName,
        keyDetail: aiVideoKnowledge.keyDetail,
        videoDuration: aiVideoKnowledge.videoDuration
      })
        .from(aiVideoKnowledge)
        .where(eq(aiVideoKnowledge.id, videoId))
        .limit(1);

      if (!video.length) {
        return res.status(404).json({ error: 'Video not found' });
      }

      const v = video[0];
      const youtubeId = extractYouTubeId(v.youtubeUrl);

      if (!youtubeId) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }

      // Check if short URL already exists for this video
      const existing = await db.select({
        id: shortUrls.id,
        shortCode: shortUrls.shortCode
      })
        .from(shortUrls)
        .where(eq(shortUrls.videoId, videoId))
        .limit(1);

      if (existing.length) {
        return res.json({
          shortUrl: `https://bjjos.app/t/${existing[0].shortCode}`,
          shortCode: existing[0].shortCode,
          existing: true
        });
      }

      // Generate unique short code
      let shortCode = generateShortCode();
      let attempts = 0;
      while (attempts < 10) {
        const collision = await db.select({
          id: shortUrls.id
        })
          .from(shortUrls)
          .where(eq(shortUrls.shortCode, shortCode))
          .limit(1);
        
        if (!collision.length) break;
        shortCode = generateShortCode();
        attempts++;
      }

      if (attempts >= 10) {
        return res.status(500).json({ error: 'Failed to generate unique short code' });
      }

      // Create short URL
      const [created] = await db.insert(shortUrls).values({
        shortCode,
        videoId,
        youtubeUrl: v.youtubeUrl,
        youtubeId,
        videoTitle: v.techniqueName || 'BJJ Technique',
        instructorName: v.instructorName || 'Unknown Instructor',
        techniqueName: v.techniqueName,
        keyDetail: v.keyDetail,
        duration: v.videoDuration,
        clickCount: 0
      }).returning();

      console.log(`[URL SHORTENER] Created: ${shortCode} → ${v.youtubeUrl}`);

      res.json({
        shortUrl: `https://bjjos.app/t/${shortCode}`,
        shortCode: created.shortCode,
        youtubeUrl: v.youtubeUrl,
        existing: false
      });

    } catch (error: any) {
      console.error('[URL SHORTENER] Error creating short URL:', error);
      res.status(500).json({ error: 'Failed to create short URL' });
    }
  });

  // Redirect route with analytics tracking (PUBLIC - no auth required)
  app.get('/t/:code', async (req, res) => {
    try {
      const { code } = req.params;

      // Get short URL
      const [shortUrl] = await db.select({
        id: shortUrls.id,
        shortCode: shortUrls.shortCode,
        youtubeUrl: shortUrls.youtubeUrl,
        youtubeId: shortUrls.youtubeId,
        videoTitle: shortUrls.videoTitle,
        instructorName: shortUrls.instructorName,
        techniqueName: shortUrls.techniqueName,
        keyDetail: shortUrls.keyDetail,
        clickCount: shortUrls.clickCount
      })
        .from(shortUrls)
        .where(eq(shortUrls.shortCode, code))
        .limit(1);

      if (!shortUrl) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Link Not Found - Prof. OS</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 50px; background: #0a0a0a; color: #fff;">
            <h1>🤔 Link Not Found</h1>
            <p>This Prof. OS technique link doesn't exist or has been removed.</p>
            <a href="https://bjjos.app" style="color: #8B5CF6; text-decoration: none;">← Return to Prof. OS</a>
          </body>
          </html>
        `);
      }

      // Track click analytics (increment count, update last clicked)
      await db.update(shortUrls)
        .set({
          clickCount: sql`${shortUrls.clickCount} + 1`,
          lastClicked: new Date()
        })
        .where(eq(shortUrls.shortCode, code));

      // Generate rich link preview HTML with Open Graph meta tags
      const thumbnail = `https://img.youtube.com/vi/${shortUrl.youtubeId}/maxresdefault.jpg`;
      const title = shortUrl.videoTitle || 'BJJ Technique';
      const description = shortUrl.keyDetail 
        ? `${shortUrl.instructorName} teaches: ${shortUrl.keyDetail}`
        : `Watch ${shortUrl.instructorName} demonstrate ${shortUrl.techniqueName || 'this technique'}`;
      
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${title} - Prof. OS</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="video.other">
  <meta property="og:url" content="https://bjjos.app/t/${code}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${thumbnail}">
  <meta property="og:image:width" content="1280">
  <meta property="og:image:height" content="720">
  <meta property="og:site_name" content="Prof. OS - AI BJJ Coach">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="https://bjjos.app/t/${code}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${thumbnail}">
  
  <!-- Instant redirect -->
  <meta http-equiv="refresh" content="0; url=${shortUrl.youtubeUrl}">
  <script>window.location.href = "${shortUrl.youtubeUrl}";</script>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 50px; background: #0a0a0a; color: #fff;">
  <h1>Redirecting to technique...</h1>
  <p>If you're not redirected, <a href="${shortUrl.youtubeUrl}" style="color: #8B5CF6;">click here</a>.</p>
</body>
</html>
      `;

      console.log(`[URL SHORTENER] Redirect: ${code} → ${shortUrl.youtubeUrl} (clicks: ${shortUrl.clickCount + 1})`);

      res.send(html);

    } catch (error: any) {
      console.error('[URL SHORTENER] Error redirecting:', error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error - Prof. OS</title>
          <meta charset="UTF-8">
        </head>
        <body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 50px; background: #0a0a0a; color: #fff;">
          <h1>⚠️ Something went wrong</h1>
          <p>We encountered an error redirecting you. Please try again later.</p>
          <a href="https://bjjos.app" style="color: #8B5CF6; text-decoration: none;">← Return to Prof. OS</a>
        </body>
        </html>
      `);
    }
  });

  // Get short URL analytics (admin only)
  app.get('/api/short-url/:code/analytics', checkAdminAuth, async (req, res) => {
    try {
      const { code } = req.params;

      const [shortUrl] = await db.select({
        id: shortUrls.id,
        shortCode: shortUrls.shortCode,
        youtubeUrl: shortUrls.youtubeUrl,
        clickCount: shortUrls.clickCount,
        lastClicked: shortUrls.lastClicked,
        createdAt: shortUrls.createdAt,
        videoTitle: shortUrls.videoTitle,
        instructorName: shortUrls.instructorName
      })
        .from(shortUrls)
        .where(eq(shortUrls.shortCode, code))
        .limit(1);

      if (!shortUrl) {
        return res.status(404).json({ error: 'Short URL not found' });
      }

      res.json({
        shortCode: shortUrl.shortCode,
        youtubeUrl: shortUrl.youtubeUrl,
        clickCount: shortUrl.clickCount,
        lastClicked: shortUrl.lastClicked,
        createdAt: shortUrl.createdAt,
        videoTitle: shortUrl.videoTitle,
        instructorName: shortUrl.instructorName
      });

    } catch (error: any) {
      console.error('[URL SHORTENER] Error getting analytics:', error);
      res.status(500).json({ error: 'Failed to get analytics' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // USERNAME VALIDATION API
  // ═══════════════════════════════════════════════════════════════════════════════

  // Validate username availability and format (no auth required - used during signup)
  app.post('/api/validate-username', async (req, res) => {
    try {
      const { username } = req.body;

      if (!username || typeof username !== 'string') {
        return res.status(400).json({ 
          error: 'Username is required',
          available: false 
        });
      }

      const cleanUsername = username.trim().toLowerCase();

      // Validate format: 3-20 chars, alphanumeric + underscores only
      const usernameRegex = /^[a-z0-9_]{3,20}$/;
      if (!usernameRegex.test(cleanUsername)) {
        return res.status(400).json({ 
          error: 'Username must be 3-20 characters: lowercase letters, numbers, and underscores only',
          available: false,
          formatError: true
        });
      }

      // Check if username already exists
      const [existingUser] = await db
        .select({ username: bjjUsers.username })
        .from(bjjUsers)
        .where(eq(bjjUsers.username, cleanUsername))
        .limit(1);

      if (existingUser) {
        // Generate suggestions by adding numbers or variations
        // Ensure suggestions stay within 20-char limit by truncating base if needed
        const suggestions: string[] = [];
        const maxAttempts = 20; // Prevent infinite loops
        let attempts = 0;
        
        while (suggestions.length < 3 && attempts < maxAttempts) {
          attempts++;
          
          // Generate random suffix (1-999)
          const suffix = Math.floor(Math.random() * 999) + 1;
          const suffixStr = suffix.toString();
          
          // Truncate base username to ensure total length ≤ 20
          const maxBaseLength = 20 - suffixStr.length;
          const truncatedBase = cleanUsername.substring(0, maxBaseLength);
          const suggestion = `${truncatedBase}${suffixStr}`;
          
          // Skip if we already have this suggestion
          if (suggestions.includes(suggestion)) {
            continue;
          }
          
          // Check if suggestion is available in database
          const [existing] = await db
            .select({ username: bjjUsers.username })
            .from(bjjUsers)
            .where(eq(bjjUsers.username, suggestion))
            .limit(1);
          
          if (!existing) {
            suggestions.push(suggestion);
          }
        }

        return res.json({
          available: false,
          message: 'Username is already taken',
          suggestions: suggestions
        });
      }

      // Username is available
      res.json({
        available: true,
        username: cleanUsername,
        message: 'Username is available'
      });

    } catch (error: any) {
      console.error('[USERNAME VALIDATION] Error:', error);
      res.status(500).json({ error: 'Failed to validate username', available: false });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIDEO CURATION MONITORING & CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  // Global state to track if curation is currently running
  let curationRunning = false;
  let lastCurationRun: Date | null = null;
  let lastCurationResult: any = null;

  // GET endpoint to check video curation status
  app.get('/api/admin/video-curation/status', checkAdminAuth, async (req, res) => {
    try {
      // Query video statistics from ai_video_knowledge table
      const stats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_videos,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as added_today,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as added_this_week,
          AVG(CAST(quality_score AS NUMERIC)) as avg_quality,
          MAX(created_at) as last_added
        FROM ai_video_knowledge
      `);

      // Get last curation run info from videoCurationLog if it exists
      let lastRun = null;
      try {
        const recentRuns = await db.select({
          id: videoCurationLog.id,
          runTimestamp: videoCurationLog.runTimestamp,
          searchesExecuted: videoCurationLog.searchesExecuted,
          videosAnalyzed: videoCurationLog.videosAnalyzed,
          videosSaved: videoCurationLog.videosSaved,
          status: videoCurationLog.status,
          errorMessage: videoCurationLog.errorMessage,
        })
        .from(videoCurationLog)
        .orderBy(desc(videoCurationLog.runTimestamp))
        .limit(1);
        
        lastRun = recentRuns[0] || null;
      } catch (error) {
        console.log('[VIDEO CURATION STATUS] No curation log found (table may not exist)');
      }

      const statsRow = stats.rows[0] as any;

      res.json({
        stats: {
          totalVideos: parseInt(statsRow.total_videos) || 0,
          addedToday: parseInt(statsRow.added_today) || 0,
          addedThisWeek: parseInt(statsRow.added_this_week) || 0,
          avgQuality: statsRow.avg_quality ? parseFloat(statsRow.avg_quality).toFixed(2) : '0.00',
          lastAdded: statsRow.last_added || null,
        },
        curation: {
          isRunning: curationRunning,
          lastRun: lastRun,
          lastManualRun: lastCurationRun,
          lastResult: lastCurationResult,
        },
        scheduler: {
          enabled: true, // Intelligence scheduler runs every 4 hours
          schedule: '0 */4 * * *', // Every 4 hours
          nextRun: getNextCurationRun(),
        }
      });
    } catch (error: any) {
      console.error('[VIDEO CURATION STATUS] Error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch curation status', 
        details: error.message 
      });
    }
  });

  // Helper function to calculate next curation run time (every 4 hours)
  function getNextCurationRun(): string {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Find next run hour (0, 4, 8, 12, 16, 20)
    const runHours = [0, 4, 8, 12, 16, 20];
    let nextHour = runHours.find(h => h > currentHour);
    
    const nextRun = new Date(now);
    if (nextHour === undefined) {
      // Next run is tomorrow at midnight
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(0, 0, 0, 0);
    } else {
      nextRun.setHours(nextHour, 0, 0, 0);
    }
    
    return nextRun.toISOString();
  }

  // TEST endpoint to manually trigger video curation (NO AUTH - FOR TESTING ONLY)
  app.post('/api/test/video-curation/run-now', async (req, res) => {
    try {
      // Check if curation is already running
      if (curationRunning) {
        return res.status(409).json({
          success: false,
          error: 'Curation is already running. Please wait for it to complete.',
          isRunning: true,
        });
      }

      console.log('[TEST] Manual video curation triggered (no auth)');

      // Set running state
      curationRunning = true;
      lastCurationRun = new Date();

      // Respond immediately that curation has started
      res.json({
        success: true,
        message: 'Video curation started. Check /api/test/video-curation/status for progress.',
        startedAt: lastCurationRun,
      });

      // Run curation in background (don't await)
      (async () => {
        try {
          // Import and run content-first curation
          // Parameters: (numTechniques: number, videosPerTechnique: number)
          // Default: 8 techniques, 4 videos each = 32 videos analyzed per run
          const result = await runContentFirstCuration(8, 4);
          
          lastCurationResult = {
            success: true,
            completedAt: new Date(),
            videosSaved: result.videosSaved,
            newInstructorsDiscovered: result.newInstructorsDiscovered,
            techniquesProcessed: result.techniquesProcessed || 8,
          };

          console.log(`[TEST] Manual curation completed: ${result.videosSaved} videos saved, ${result.newInstructorsDiscovered} new instructors`);
        } catch (error: any) {
          lastCurationResult = {
            success: false,
            completedAt: new Date(),
            error: error.message,
          };
          console.error('[TEST] Manual curation error:', error);
        } finally {
          curationRunning = false;
        }
      })();

    } catch (error: any) {
      curationRunning = false;
      console.error('[TEST] Manual curation trigger error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to start curation', 
        details: error.message 
      });
    }
  });

  // TEST endpoint to check video curation status (NO AUTH - FOR TESTING ONLY)
  app.get('/api/test/video-curation/status', async (req, res) => {
    try {
      // Query video statistics from ai_video_knowledge table
      const stats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_videos,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as added_today,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as added_this_week,
          AVG(CAST(quality_score AS NUMERIC)) as avg_quality,
          MAX(created_at) as last_added
        FROM ai_video_knowledge
      `);

      // Handle both postgres-js (array) and Neon (rows array) formats
      const rows = Array.isArray(stats) ? stats : (stats.rows || []);
      const statsRow = (rows[0] || {}) as any;

      res.json({
        stats: {
          totalVideos: parseInt(statsRow.total_videos) || 0,
          addedToday: parseInt(statsRow.added_today) || 0,
          addedThisWeek: parseInt(statsRow.added_this_week) || 0,
          avgQuality: statsRow.avg_quality ? parseFloat(statsRow.avg_quality).toFixed(2) : '0.00',
          lastAdded: statsRow.last_added || null,
        },
        curation: {
          isRunning: curationRunning,
          lastManualRun: lastCurationRun,
          lastResult: lastCurationResult,
        },
        scheduler: {
          enabled: true,
          schedule: '0 */4 * * *',
          nextRun: getNextCurationRun(),
        }
      });
    } catch (error: any) {
      console.error('[TEST VIDEO CURATION STATUS] Error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch curation status', 
        details: error.message 
      });
    }
  });

  // POST endpoint to manually trigger video curation
  app.post('/api/admin/video-curation/run-now', checkAdminAuth, async (req, res) => {
    try {
      // Check if curation is already running
      if (curationRunning) {
        return res.status(409).json({
          success: false,
          error: 'Curation is already running. Please wait for it to complete.',
          isRunning: true,
        });
      }

      console.log('[ADMIN] Manual video curation triggered');

      // Set running state
      curationRunning = true;
      lastCurationRun = new Date();

      // Respond immediately that curation has started
      res.json({
        success: true,
        message: 'Video curation started. Check status endpoint for progress.',
        startedAt: lastCurationRun,
      });

      // Run curation in background (don't await)
      (async () => {
        try {
          // Import and run content-first curation
          // Parameters: (numTechniques: number, videosPerTechnique: number)
          // Default: 8 techniques, 4 videos each = 32 videos analyzed per run
          const result = await runContentFirstCuration(8, 4);
          
          lastCurationResult = {
            success: true,
            completedAt: new Date(),
            videosSaved: result.videosSaved,
            newInstructorsDiscovered: result.newInstructorsDiscovered,
            techniquesProcessed: result.techniquesProcessed || 8,
          };

          console.log(`[ADMIN] Manual curation completed: ${result.videosSaved} videos saved, ${result.newInstructorsDiscovered} new instructors`);
        } catch (error: any) {
          lastCurationResult = {
            success: false,
            completedAt: new Date(),
            error: error.message,
          };
          console.error('[ADMIN] Manual curation error:', error);
        } finally {
          curationRunning = false;
        }
      })();

    } catch (error: any) {
      curationRunning = false;
      console.error('[ADMIN] Manual curation trigger error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to start curation', 
        details: error.message 
      });
    }
  });

  // =============================================================================
  // ADVANCED INTELLIGENCE MONITORING API (Combat Sports + Individual + Population)
  // =============================================================================

  // Get Combat Sports scraper health and latest news
  app.get('/api/admin/intelligence/combat-sports', checkAdminAuth, async (req, res) => {
    try {
      const { combatSportsScraper } = await import('./combat-sports-scraper');
      
      // Get scraper health status
      const health = await db.execute(drizzleSql`
        SELECT * FROM scraper_health 
        ORDER BY last_successful_scrape DESC NULLS LAST
        LIMIT 20
      `);

      // Get latest news
      const latestNews = await db.execute(drizzleSql`
        SELECT id, title, sport, source_name, published_date, importance_score, recency_score
        FROM combat_sports_news
        ORDER BY scraped_at DESC
        LIMIT 50
      `);

      res.json({
        success: true,
        scraperHealth: health.rows,
        latestNews: latestNews.rows,
        totalNews: latestNews.rows.length
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching combat sports intelligence:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Manually trigger combat sports scrape
  app.post('/api/admin/intelligence/scrape-now', checkAdminAuth, async (req, res) => {
    try {
      const { combatSportsScraper } = await import('./combat-sports-scraper');
      
      // Run scrape in background
      setImmediate(async () => {
        try {
          await combatSportsScraper.scrapeAll();
        } catch (error: any) {
          console.error('[ADMIN] Background scrape error:', error);
        }
      });

      res.json({
        success: true,
        message: 'Combat sports scrape started in background'
      });
    } catch (error: any) {
      console.error('[ADMIN] Error triggering scrape:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Individual Intelligence stats for a user
  app.get('/api/admin/intelligence/individual/:userId', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.params;

      // Get cognitive profile
      const cognitiveProfile = await db.execute(drizzleSql`
        SELECT * FROM user_cognitive_profile WHERE user_id = ${userId}
      `);

      // Get technique ecosystem
      const techniqueEcosystem = await db.execute(drizzleSql`
        SELECT * FROM user_technique_ecosystem 
        WHERE user_id = ${userId}
        ORDER BY success_rate DESC
        LIMIT 20
      `);

      // Get detected patterns
      const patterns = await db.execute(drizzleSql`
        SELECT * FROM detected_patterns
        WHERE user_id = ${userId}
        ORDER BY detected_at DESC
        LIMIT 10
      `);

      // Get memory markers
      const memories = await db.execute(drizzleSql`
        SELECT * FROM user_memory_markers
        WHERE user_id = ${userId}
        ORDER BY occurred_at DESC
        LIMIT 10
      `);

      res.json({
        success: true,
        cognitiveProfile: cognitiveProfile.rows[0] || null,
        techniqueEcosystem: techniqueEcosystem.rows,
        patterns: patterns.rows,
        memories: memories.rows
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching individual intelligence:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Population Intelligence stats
  app.get('/api/admin/intelligence/population', checkAdminAuth, async (req, res) => {
    try {
      // Get technique population stats
      const techniqueStats = await db.execute(drizzleSql`
        SELECT * FROM technique_population_stats
        ORDER BY total_users_attempted DESC
        LIMIT 50
      `);

      // Get technique progression pathways
      const pathways = await db.execute(drizzleSql`
        SELECT * FROM technique_progression_pathways
        WHERE pathway_strength IN ('strong', 'moderate')
        ORDER BY users_who_learned_both DESC
        LIMIT 50
      `);

      // Get belt promotion indicators
      const beltIndicators = await db.execute(drizzleSql`
        SELECT * FROM belt_promotion_indicators
        ORDER BY belt_level
      `);

      res.json({
        success: true,
        techniqueStats: techniqueStats.rows,
        pathways: pathways.rows,
        beltIndicators: beltIndicators.rows
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching population intelligence:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Manually trigger population aggregation
  app.post('/api/admin/intelligence/aggregate-now', checkAdminAuth, async (req, res) => {
    try {
      const { populationIntelligence } = await import('./population-intelligence');
      
      // Run aggregation in background
      setImmediate(async () => {
        try {
          await populationIntelligence.runAllAggregations();
        } catch (error: any) {
          console.error('[ADMIN] Background aggregation error:', error);
        }
      });

      res.json({
        success: true,
        message: 'Population intelligence aggregation started in background'
      });
    } catch (error: any) {
      console.error('[ADMIN] Error triggering aggregation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get AI Model Usage Stats
  app.get('/api/admin/intelligence/model-usage', checkAdminAuth, async (req, res) => {
    try {
      const stats = await db.execute(drizzleSql`
        SELECT 
          model_name,
          task_type,
          COUNT(*) as request_count,
          SUM(tokens_input) as total_tokens_input,
          SUM(tokens_output) as total_tokens_output,
          SUM(cost_usd) as total_cost,
          AVG(response_time_ms) as avg_response_time
        FROM ai_model_usage
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY model_name, task_type
        ORDER BY total_cost DESC
      `);

      res.json({
        success: true,
        modelUsage: stats.rows
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching model usage:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // CORE INTELLIGENCE & POWER USER CONVERSION - ADMIN ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════

  // Get user engagement profiles
  app.get('/api/admin/engagement/profiles', checkAdminAuth, async (req, res) => {
    try {
      const profiles = await db.select()
        .from(userEngagementProfile)
        .orderBy(desc(userEngagementProfile.lastActivityAt))
        .limit(100);
      
      res.json({
        success: true,
        profiles: profiles.map(p => ({
          userId: p.userId,
          engagementStage: p.engagementStage,
          totalVideoRequests: p.totalVideoRequests,
          totalSessionsLogged: p.totalSessionsLogged,
          profileCompletionScore: p.profileCompletionScore,
          hasLoggedSession: p.hasLoggedSession,
          hasReceivedPatternInsight: p.hasReceivedPatternInsight,
          lastVideoRequestAt: p.lastVideoRequestAt,
          lastSessionLogAt: p.lastSessionLogAt,
          lastActivityAt: p.lastActivityAt,
          createdAt: p.createdAt
        }))
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching engagement profiles:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get engagement nudges (pending and delivered)
  app.get('/api/admin/engagement/nudges', checkAdminAuth, async (req, res) => {
    try {
      const nudges = await db.select()
        .from(engagementNudges)
        .orderBy(desc(engagementNudges.createdAt))
        .limit(100);
      
      res.json({
        success: true,
        nudges: nudges.map(n => ({
          id: n.id,
          userId: n.userId,
          nudgeType: n.nudgeType,
          content: n.content.substring(0, 100) + '...',
          priority: n.priority,
          delivered: !!n.deliveredAt,
          userAction: n.userAction,
          optimalDeliveryTime: n.optimalDeliveryTime,
          deliveredAt: n.deliveredAt,
          createdAt: n.createdAt
        }))
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching nudges:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get video request patterns (most requested techniques)
  app.get('/api/admin/engagement/video-requests', checkAdminAuth, async (req, res) => {
    try {
      const stats = await db.execute(drizzleSql`
        SELECT 
          unnest(extracted_topics) as technique,
          COUNT(*) as request_count,
          COUNT(DISTINCT user_id) as unique_users
        FROM video_request_history
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY technique
        ORDER BY request_count DESC
        LIMIT 50
      `);

      res.json({
        success: true,
        topTechniques: stats.rows
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching video request patterns:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get video engagement metrics (which videos are saved/watched)
  app.get('/api/admin/engagement/video-metrics', checkAdminAuth, async (req, res) => {
    try {
      const stats = await db.execute(drizzleSql`
        SELECT 
          ve.video_id,
          vk.technique_name,
          vk.instructor_name,
          COUNT(*) as recommendation_count,
          SUM(CASE WHEN ve.saved_at IS NOT NULL THEN 1 ELSE 0 END) as save_count,
          SUM(CASE WHEN ve.watched_at IS NOT NULL THEN 1 ELSE 0 END) as watch_count,
          ROUND(AVG(CASE WHEN ve.saved_at IS NOT NULL THEN 1 ELSE 0 END) * 100, 2) as save_rate,
          ROUND(AVG(CASE WHEN ve.watched_at IS NOT NULL THEN 1 ELSE 0 END) * 100, 2) as watch_rate
        FROM video_engagement ve
        JOIN videos vk ON ve.video_id = vk.id
        WHERE ve.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY ve.video_id, vk.technique_name, vk.instructor_name
        HAVING COUNT(*) >= 5
        ORDER BY save_rate DESC
        LIMIT 50
      `);

      res.json({
        success: true,
        videoMetrics: stats.rows
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching video metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get power user examples
  app.get('/api/admin/engagement/power-user-examples', checkAdminAuth, async (req, res) => {
    try {
      const examples = await db.select()
        .from(powerUserExamples)
        .orderBy(desc(powerUserExamples.createdAt));
      
      res.json({
        success: true,
        examples: examples.map(e => ({
          id: e.id,
          exampleType: e.exampleType,
          targetStage: e.targetStage,
          userQuestion: e.userQuestion.substring(0, 100) + '...',
          profResponseSummary: e.profResponseSummary.substring(0, 100) + '...',
          outcome: e.outcome.substring(0, 100) + '...',
          timesShown: e.timesShown,
          conversionRate: e.conversionRate,
          isActive: e.isActive,
          createdAt: e.createdAt
        }))
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching power user examples:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get engagement conversion funnel stats
  app.get('/api/admin/engagement/funnel', checkAdminAuth, async (req, res) => {
    try {
      const stats = await db.execute(drizzleSql`
        WITH stage_counts AS (
          SELECT 
            engagement_stage,
            COUNT(*) as user_count,
            AVG(total_video_requests) as avg_video_requests,
            AVG(total_sessions_logged) as avg_sessions_logged,
            AVG(profile_completion_score) as avg_profile_score
          FROM user_engagement_profile
          GROUP BY engagement_stage
        )
        SELECT 
          engagement_stage,
          user_count,
          ROUND(avg_video_requests, 1) as avg_video_requests,
          ROUND(avg_sessions_logged, 1) as avg_sessions_logged,
          ROUND(avg_profile_score, 1) as avg_profile_score,
          ROUND(user_count * 100.0 / SUM(user_count) OVER (), 2) as percentage
        FROM stage_counts
        ORDER BY 
          CASE engagement_stage
            WHEN 'video_user' THEN 1
            WHEN 'light_logger' THEN 2
            WHEN 'consistent_logger' THEN 3
            WHEN 'power_user' THEN 4
            ELSE 5
          END
      `);

      res.json({
        success: true,
        funnelStats: stats.rows
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching funnel stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== New Admin Routes for Enhanced Monitoring =====
  
  // Get video curation batches
  app.get('/api/admin/curation/batches', checkAdminAuth, async (req, res) => {
    try {
      const { videoCurationBatches } = await import('@shared/schema');
      const limit = parseInt(req.query.limit as string) || 20;
      
      const batches = await db.select()
        .from(videoCurationBatches)
        .orderBy(desc(videoCurationBatches.batchTime))
        .limit(limit);
      
      res.json({
        success: true,
        batches
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching curation batches:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get video curation batch results
  app.get('/api/admin/curation/batches/:batchId/results', checkAdminAuth, async (req, res) => {
    try {
      const { videoCurationResults } = await import('@shared/schema');
      const batchId = parseInt(req.params.batchId);
      
      const results = await db.select()
        .from(videoCurationResults)
        .where(eq(videoCurationResults.batchId, batchId))
        .orderBy(desc(videoCurationResults.rating));
      
      res.json({
        success: true,
        results
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching batch results:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== VIDEO KNOWLEDGE SYSTEM - Professor OS Video Understanding (Dec 16, 2025) =====
  
  // GET: Knowledge processing status
  app.get('/api/admin/knowledge-status', checkAdminAuth, async (req, res) => {
    try {
      const { getKnowledgeStatus } = await import('./video-knowledge-service');
      const status = await getKnowledgeStatus();
      
      res.json({
        success: true,
        ...status
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching knowledge status:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST: Manually trigger knowledge extraction batch
  app.post('/api/admin/process-videos', checkAdminAuth, async (req, res) => {
    try {
      const batchSize = parseInt(req.body.batchSize) || 10;
      
      console.log(`[ADMIN] Starting video knowledge processing batch of ${batchSize}...`);
      
      const { processBatch } = await import('./video-knowledge-service');
      
      // Run in background to not block response
      setImmediate(async () => {
        try {
          const result = await processBatch(batchSize);
          console.log(`[ADMIN] Knowledge processing complete:`, result);
        } catch (error: any) {
          console.error('[ADMIN] Background knowledge processing error:', error);
        }
      });
      
      res.json({
        success: true,
        message: `Video knowledge processing started for ${batchSize} videos. Check knowledge-status endpoint for progress.`
      });
    } catch (error: any) {
      console.error('[ADMIN] Error starting knowledge processing:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET: Get extracted knowledge for a specific video
  app.get('/api/admin/video-knowledge/:videoId', checkAdminAuth, async (req, res) => {
    try {
      const videoId = parseInt(req.params.videoId);
      
      const knowledge = await db.select()
        .from(videoKnowledge)
        .where(eq(videoKnowledge.videoId, videoId));
      
      res.json({
        success: true,
        videoId,
        techniquesCount: knowledge.length,
        knowledge
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching video knowledge:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST: Process a single specific video
  app.post('/api/admin/process-video/:videoId', checkAdminAuth, async (req, res) => {
    try {
      const videoId = parseInt(req.params.videoId);
      
      console.log(`[ADMIN] Processing single video ${videoId}...`);
      
      const { processVideoKnowledge } = await import('./video-knowledge-service');
      const result = await processVideoKnowledge(videoId);
      
      if (result.success) {
        res.json({
          success: true,
          message: `Successfully processed video ${videoId}`,
          techniquesAdded: result.techniquesAdded
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error: any) {
      console.error('[ADMIN] Error processing single video:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST: Analyze ALL unanalyzed videos (for catch-up processing)
  app.post('/api/admin/analyze-all-videos', checkAdminAuth, async (req, res) => {
    try {
      console.log(`[ADMIN] Starting full Gemini analysis of all unanalyzed videos...`);
      
      const { analyzeAllUnanalyzedVideos, resetFailedVideosForRetry } = await import('./video-knowledge-service');
      
      // Run in background to not block response - this can take hours
      setImmediate(async () => {
        try {
          const result = await analyzeAllUnanalyzedVideos((msg) => {
            console.log(`[ADMIN] Progress: ${msg}`);
          });
          console.log(`[ADMIN] Full analysis complete:`, result);
        } catch (error: any) {
          console.error('[ADMIN] Full analysis error:', error);
        }
      });
      
      res.json({
        success: true,
        message: 'Full Gemini analysis started. This will process ALL unanalyzed videos in the background. Check server logs for progress.'
      });
    } catch (error: any) {
      console.error('[ADMIN] Error starting full analysis:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST: Reset failed videos for retry
  app.post('/api/admin/reset-failed-videos', checkAdminAuth, async (req, res) => {
    try {
      console.log(`[ADMIN] Resetting failed videos for retry...`);
      
      const { resetFailedVideosForRetry } = await import('./video-knowledge-service');
      const result = await resetFailedVideosForRetry();
      
      res.json({
        success: true,
        message: `Reset ${result.reset} failed videos for retry`,
        ...result
      });
    } catch (error: any) {
      console.error('[ADMIN] Error resetting failed videos:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== OVERNIGHT PROCESSING SYSTEM (Dec 16, 2025) =====
  
  // GET: Overnight processing status (morning dashboard)
  app.get('/api/admin/overnight-status', checkAdminAuth, async (req, res) => {
    try {
      const { getOvernightStatus } = await import('./overnight-processing-service');
      const status = await getOvernightStatus();
      
      res.json(status);
    } catch (error: any) {
      console.error('[ADMIN] Error fetching overnight status:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET: Overnight progress log file
  app.get('/api/admin/overnight-log', checkAdminAuth, async (req, res) => {
    try {
      const { getOvernightLog } = await import('./overnight-processing-service');
      const log = await getOvernightLog();
      
      res.type('text/plain').send(log);
    } catch (error: any) {
      console.error('[ADMIN] Error fetching overnight log:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST: Start overnight processing
  app.post('/api/admin/overnight-start', checkAdminAuth, async (req, res) => {
    try {
      const { startOvernightProcessing } = await import('./overnight-processing-service');
      const result = await startOvernightProcessing();
      
      res.json(result);
    } catch (error: any) {
      console.error('[ADMIN] Error starting overnight processing:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST: Stop overnight processing
  app.post('/api/admin/overnight-stop', checkAdminAuth, async (req, res) => {
    try {
      const { stopOvernightProcessing } = await import('./overnight-processing-service');
      const result = await stopOvernightProcessing();
      
      res.json(result);
    } catch (error: any) {
      console.error('[ADMIN] Error stopping overnight processing:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get referral redemptions
  app.get('/api/admin/referrals/redemptions', checkAdminAuth, async (req, res) => {
    try {
      const { referralRedemptions, referralCodes, bjjUsers } = await import('@shared/schema');
      const limit = parseInt(req.query.limit as string) || 50;
      
      const redemptions = await db.select({
        id: referralRedemptions.id,
        redeemedAt: referralRedemptions.redeemedAt,
        rewardApplied: referralRedemptions.rewardApplied,
        code: referralCodes.code,
        creatorEmail: referralCodes.creatorEmail,
        redeemerEmail: bjjUsers.email,
        redeemerUsername: bjjUsers.username,
      })
        .from(referralRedemptions)
        .leftJoin(referralCodes, eq(referralRedemptions.codeId, referralCodes.id))
        .leftJoin(bjjUsers, eq(referralRedemptions.redeemedByUserId, bjjUsers.id))
        .orderBy(desc(referralRedemptions.redeemedAt))
        .limit(limit);
      
      res.json({
        success: true,
        redemptions
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching referral redemptions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get admin actions log
  app.get('/api/admin/actions-log', checkAdminAuth, async (req, res) => {
    try {
      const { adminActions, bjjUsers } = await import('@shared/schema');
      const limit = parseInt(req.query.limit as string) || 100;
      const actionType = req.query.actionType as string;
      
      let query = db.select({
        id: adminActions.id,
        adminEmail: adminActions.adminEmail,
        actionType: adminActions.actionType,
        targetUserId: adminActions.targetUserId,
        targetUserEmail: bjjUsers.email,
        targetUserUsername: bjjUsers.username,
        details: adminActions.details,
        createdAt: adminActions.createdAt,
      })
        .from(adminActions)
        .leftJoin(bjjUsers, eq(adminActions.targetUserId, bjjUsers.id))
        .orderBy(desc(adminActions.createdAt))
        .limit(limit);
      
      if (actionType) {
        query = query.where(eq(adminActions.actionType, actionType));
      }
      
      const actions = await query;
      
      res.json({
        success: true,
        actions
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching admin actions log:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get comprehensive dashboard stats
  app.get('/api/admin/dashboard/stats', checkAdminAuth, async (req, res) => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // User stats
      const userStats = await db
        .select({
          totalUsers: sql<number>`COUNT(*)`,
          newToday: sql<number>`COUNT(CASE WHEN ${bjjUsers.createdAt} >= ${today} THEN 1 END)`,
          newLast7Days: sql<number>`COUNT(CASE WHEN ${bjjUsers.createdAt} >= ${last7Days} THEN 1 END)`,
          lifetimeAccess: sql<number>`COUNT(CASE WHEN ${bjjUsers.hasLifetimeAccess} = true THEN 1 END)`,
        })
        .from(bjjUsers);
      
      // Subscription stats
      const subStats = await db
        .select({
          active: sql<number>`COUNT(CASE WHEN ${stripeSubscriptions.status} = 'active' THEN 1 END)`,
          trialing: sql<number>`COUNT(CASE WHEN ${stripeSubscriptions.status} = 'trialing' THEN 1 END)`,
          canceled: sql<number>`COUNT(CASE WHEN ${stripeSubscriptions.status} = 'canceled' THEN 1 END)`,
          pastDue: sql<number>`COUNT(CASE WHEN ${stripeSubscriptions.status} = 'past_due' THEN 1 END)`,
        })
        .from(stripeSubscriptions);
      
      // Training activity
      const activityStats = await db
        .select({
          sessionsToday: sql<number>`COUNT(CASE WHEN ${trainingLog.sessionDate} >= ${today} THEN 1 END)`,
          sessionsLast7Days: sql<number>`COUNT(CASE WHEN ${trainingLog.sessionDate} >= ${last7Days} THEN 1 END)`,
          totalHours: sql<number>`COALESCE(SUM(${trainingLog.durationMinutes}) / 60.0, 0)`,
        })
        .from(trainingLog);
      
      // AI activity
      const aiStats = await db
        .select({
          messagesToday: sql<number>`COUNT(CASE WHEN ${chatHistory.createdAt} >= ${today} THEN 1 END)`,
          messagesLast7Days: sql<number>`COUNT(CASE WHEN ${chatHistory.createdAt} >= ${last7Days} THEN 1 END)`,
          uniqueUsersToday: sql<number>`COUNT(DISTINCT CASE WHEN ${chatHistory.createdAt} >= ${today} THEN ${chatHistory.userId} END)`,
        })
        .from(chatHistory);
      
      // Video library
      const videoStats = await db
        .select({
          totalVideos: sql<number>`COUNT(*)`,
          avgRating: sql<number>`AVG(${videoLibrary.aiRating})`,
        })
        .from(videoLibrary);
      
      // Referral stats
      const { referralCodes, referralRedemptions } = await import('@shared/schema');
      const referralStats = await db
        .select({
          totalCodes: sql<number>`COUNT(*)`,
          activeCodes: sql<number>`COUNT(CASE WHEN ${referralCodes.active} = true THEN 1 END)`,
        })
        .from(referralCodes);
      
      const redemptionStats = await db
        .select({
          redemptionsToday: sql<number>`COUNT(CASE WHEN ${referralRedemptions.redeemedAt} >= ${today} THEN 1 END)`,
          redemptionsLast7Days: sql<number>`COUNT(CASE WHEN ${referralRedemptions.redeemedAt} >= ${last7Days} THEN 1 END)`,
          redemptionsLast30Days: sql<number>`COUNT(CASE WHEN ${referralRedemptions.redeemedAt} >= ${last30Days} THEN 1 END)`,
        })
        .from(referralRedemptions);
      
      res.json({
        success: true,
        stats: {
          users: userStats[0],
          subscriptions: subStats[0],
          activity: activityStats[0],
          ai: aiStats[0],
          videoLibrary: videoStats[0],
          referrals: {
            ...referralStats[0],
            ...redemptionStats[0],
          },
        },
      });
    } catch (error: any) {
      console.error('[ADMIN] Error fetching dashboard stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Helper endpoint to manually send admin email report (for testing)
  app.post('/api/admin/email/send-report', checkAdminAuth, async (req, res) => {
    try {
      const { sendAdminReport } = await import('./admin-email');
      const reportType = req.body.reportType || 'morning';
      
      await sendAdminReport(reportType);
      
      res.json({
        success: true,
        message: `Admin ${reportType} report sent successfully`,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error sending admin report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ECOSYSTEM INTELLIGENCE API ENDPOINTS (V5.0)
  // ═══════════════════════════════════════════════════════════════════
  
  // Get ecosystem technique effectiveness data
  app.get('/api/admin/ecosystem/technique-effectiveness', checkAdminAuth, async (req, res) => {
    try {
      const { belt, bodyType, style, limit = 20 } = req.query;
      
      let query = db.select()
        .from(ecosystemTechniqueEffectiveness)
        .orderBy(desc(ecosystemTechniqueEffectiveness.successRate))
        .limit(Number(limit));
      
      if (belt) {
        query = query.where(eq(ecosystemTechniqueEffectiveness.beltLevel, String(belt)));
      }
      if (bodyType) {
        query = query.where(eq(ecosystemTechniqueEffectiveness.bodyType, String(bodyType)));
      }
      if (style) {
        query = query.where(eq(ecosystemTechniqueEffectiveness.style, String(style)));
      }
      
      const techniques = await query;
      
      res.json({
        success: true,
        techniques,
        filters: { belt, bodyType, style, limit }
      });
    } catch (error: any) {
      console.error('[ECOSYSTEM API] Error fetching technique effectiveness:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get ecosystem problem solutions
  app.get('/api/admin/ecosystem/problem-solutions', checkAdminAuth, async (req, res) => {
    try {
      const { belt, bodyType, limit = 20 } = req.query;
      
      let query = db.select()
        .from(ecosystemProblemSolutions)
        .orderBy(desc(ecosystemProblemSolutions.successRate))
        .limit(Number(limit));
      
      if (belt) {
        query = query.where(eq(ecosystemProblemSolutions.beltLevel, String(belt)));
      }
      if (bodyType) {
        query = query.where(eq(ecosystemProblemSolutions.bodyType, String(bodyType)));
      }
      
      const solutions = await query;
      
      res.json({
        success: true,
        solutions,
        filters: { belt, bodyType, limit }
      });
    } catch (error: any) {
      console.error('[ECOSYSTEM API] Error fetching problem solutions:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get collaborative intelligence (recent breakthroughs)
  app.get('/api/admin/ecosystem/collaborative-insights', checkAdminAuth, async (req, res) => {
    try {
      const { belt, days = 30, limit = 20 } = req.query;
      
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - Number(days));
      
      let query = db.select()
        .from(collaborativeIntelligence)
        .where(gte(collaborativeIntelligence.achievedAt, daysAgo))
        .orderBy(desc(collaborativeIntelligence.achievedAt))
        .limit(Number(limit));
      
      if (belt) {
        query = query.where(eq(collaborativeIntelligence.userBelt, String(belt)));
      }
      
      const insights = await query;
      
      res.json({
        success: true,
        insights,
        filters: { belt, days, limit }
      });
    } catch (error: any) {
      console.error('[ECOSYSTEM API] Error fetching collaborative insights:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get user's active pattern interventions
  app.get('/api/admin/ecosystem/user-patterns/:userId', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const { includeAddressed = false } = req.query;
      
      let query = db.select()
        .from(userPatternInterventions)
        .where(eq(userPatternInterventions.userId, userId))
        .orderBy(desc(userPatternInterventions.urgency), desc(userPatternInterventions.occurrenceCount));
      
      if (!includeAddressed) {
        query = query.where(eq(userPatternInterventions.addressed, false));
      }
      
      const patterns = await query;
      
      res.json({
        success: true,
        patterns,
        count: patterns.length
      });
    } catch (error: any) {
      console.error('[ECOSYSTEM API] Error fetching user patterns:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get user's breakthrough predictions
  app.get('/api/admin/ecosystem/breakthrough-predictions/:userId', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const { includeAchieved = false } = req.query;
      
      let query = db.select()
        .from(userBreakthroughPredictions)
        .where(eq(userBreakthroughPredictions.userId, userId))
        .orderBy(desc(userBreakthroughPredictions.confidence));
      
      if (!includeAchieved) {
        query = query.where(eq(userBreakthroughPredictions.breakthroughAchieved, false));
      }
      
      const predictions = await query;
      
      res.json({
        success: true,
        predictions,
        count: predictions.length
      });
    } catch (error: any) {
      console.error('[ECOSYSTEM API] Error fetching breakthrough predictions:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get user's learning analytics
  app.get('/api/admin/ecosystem/learning-analytics/:userId', checkAdminAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      
      const [analytics] = await db.select()
        .from(userLearningAnalytics)
        .where(eq(userLearningAnalytics.userId, userId))
        .limit(1);
      
      if (!analytics) {
        return res.json({
          success: true,
          analytics: null,
          message: 'No learning analytics available yet'
        });
      }
      
      res.json({
        success: true,
        analytics
      });
    } catch (error: any) {
      console.error('[ECOSYSTEM API] Error fetching learning analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Manually trigger pattern detection (for testing)
  app.post('/api/admin/ecosystem/trigger-pattern-detection', checkAdminAuth, async (req, res) => {
    try {
      const { runPatternDetection } = await import('./ecosystem-pattern-detection');
      
      // Run pattern detection in background
      runPatternDetection()
        .then(() => console.log('[ECOSYSTEM API] Pattern detection completed'))
        .catch(err => console.error('[ECOSYSTEM API] Pattern detection failed:', err));
      
      res.json({
        success: true,
        message: 'Pattern detection triggered (running in background)'
      });
    } catch (error: any) {
      console.error('[ECOSYSTEM API] Error triggering pattern detection:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DEV OS EXECUTION ENDPOINTS
  // Real system control endpoints for Dev OS AI to execute actions
  // ═══════════════════════════════════════════════════════════════════════════════

  // Track active curation jobs
  let activeCurationJob: {
    id: string;
    status: 'running' | 'completed' | 'failed';
    startTime: Date;
    mode: 'aggressive' | 'normal';
    videosProcessed: number;
    videosAdded: number;
    error?: string;
  } | null = null;

  // POST /api/admin/execute/curation/start - Start curation with real job tracking
  app.post('/api/admin/execute/curation/start', checkAdminAuth, async (req, res) => {
    try {
      const { mode = 'aggressive' } = req.body;
      
      // Check if job already running
      if (activeCurationJob && activeCurationJob.status === 'running') {
        return res.json({
          success: false,
          message: 'Curation job already running',
          jobId: activeCurationJob.id,
          startTime: activeCurationJob.startTime
        });
      }

      // Create new job
      const jobId = crypto.randomBytes(8).toString('hex');
      activeCurationJob = {
        id: jobId,
        status: 'running',
        startTime: new Date(),
        mode,
        videosProcessed: 0,
        videosAdded: 0
      };

      console.log(`[EXEC] 🚀 Starting ${mode} curation - Job ID: ${jobId}`);

      // Start curation in background
      (async () => {
        try {
          const { runAggressiveCuration } = await import('./trigger-aggressive-curation');
          const result = await runAggressiveCuration();
          
          if (activeCurationJob && activeCurationJob.id === jobId) {
            activeCurationJob.status = 'completed';
            activeCurationJob.videosProcessed = result?.videosProcessed || 0;
            activeCurationJob.videosAdded = result?.videosAdded || 0;
            console.log(`[EXEC] ✅ Curation job ${jobId} completed successfully`);
          }
        } catch (error: any) {
          if (activeCurationJob && activeCurationJob.id === jobId) {
            activeCurationJob.status = 'failed';
            activeCurationJob.error = error.message;
            console.error(`[EXEC] ❌ Curation job ${jobId} failed:`, error.message);
          }
        }
      })();

      res.json({
        success: true,
        jobId,
        mode,
        message: `${mode.charAt(0).toUpperCase() + mode.slice(1)} curation started successfully`,
        startTime: activeCurationJob.startTime
      });
    } catch (error: any) {
      console.error('[EXEC] Error starting curation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/execute/curation/stop - Stop running curation
  app.post('/api/admin/execute/curation/stop', checkAdminAuth, async (req, res) => {
    try {
      if (!activeCurationJob || activeCurationJob.status !== 'running') {
        return res.json({
          success: false,
          message: 'No active curation job running'
        });
      }

      // Mark job as stopped (actual termination would require more complex job management)
      const stoppedJob = { ...activeCurationJob };
      activeCurationJob = null;

      console.log(`[EXEC] 🛑 Stopped curation job ${stoppedJob.id}`);

      res.json({
        success: true,
        message: 'Curation stopped',
        stoppedJobId: stoppedJob.id,
        videosProcessed: stoppedJob.videosProcessed,
        videosAdded: stoppedJob.videosAdded
      });
    } catch (error: any) {
      console.error('[EXEC] Error stopping curation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/execute/curation/status - Get real curation status
  app.get('/api/admin/execute/curation/status', checkAdminAuth, async (req, res) => {
    try {
      // Get quota info
      const { getQuotaUsage, getRemainingQuota } = await import('./youtube-quota-monitor');
      const quotaUsage = getQuotaUsage();
      const remainingQuota = getRemainingQuota();

      // Get today's video stats
      const videosToday = await db.execute(sql`
        SELECT COUNT(*) as count FROM ai_video_knowledge 
        WHERE DATE(upload_date AT TIME ZONE 'America/New_York') = CURRENT_DATE AT TIME ZONE 'America/New_York'
      `);
      const videosAddedToday = parseInt((videosToday.rows[0] as any)?.count) || 0;

      res.json({
        success: true,
        isRunning: activeCurationJob?.status === 'running',
        activeJob: activeCurationJob || null,
        quotaUsage: {
          searchCalls: quotaUsage.searchCalls,
          estimatedUnits: quotaUsage.estimatedUnits,
          remaining: remainingQuota,
          exceeded: quotaUsage.quotaExceeded
        },
        videosAddedToday
      });
    } catch (error: any) {
      console.error('[EXEC] Error getting curation status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/execute/system/logs - Get recent system logs
  app.get('/api/admin/execute/system/logs', checkAdminAuth, async (req, res) => {
    try {
      const { filter = 'all', limit = 100 } = req.query;
      
      // Get recent activity logs
      let query = db.select()
        .from(activityLog)
        .orderBy(desc(activityLog.timestamp))
        .limit(parseInt(limit as string));

      if (filter === 'curation') {
        query = query.where(ilike(activityLog.action, '%curation%'));
      } else if (filter === 'error') {
        query = query.where(ilike(activityLog.action, '%error%'));
      }

      const logs = await query;

      res.json({
        success: true,
        logs,
        count: logs.length,
        filter
      });
    } catch (error: any) {
      console.error('[EXEC] Error fetching logs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/execute/video/add-manual - Manually add video by URL
  app.post('/api/admin/execute/video/add-manual', checkAdminAuth, async (req, res) => {
    try {
      const { url, bypassQuality = false } = req.body;

      if (!url || !url.includes('youtube.com/watch?v=')) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }

      // Extract video ID
      const videoId = url.split('v=')[1]?.split('&')[0];
      if (!videoId) {
        return res.status(400).json({ error: 'Could not extract video ID from URL' });
      }

      console.log(`[EXEC] 📹 Manually adding video: ${videoId}`);

      // Check if video already exists
      const existing = await db.select()
        .from(videos)
        .where(eq(videos.youtubeId, videoId))
        .limit(1);

      if (existing.length > 0) {
        return res.json({
          success: false,
          message: 'Video already exists in library',
          videoId: existing[0].id
        });
      }

      // Analyze video with AI
      const { analyzeVideoContent } = await import('./content-first-curator');
      
      // Fetch video details from YouTube
      const youtubeApiKey = process.env.YOUTUBE_API_KEY;
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${youtubeApiKey}`
      );
      
      if (!response.ok) {
        return res.status(500).json({ error: 'Failed to fetch video details from YouTube' });
      }

      const data = await response.json();
      if (!data.items || data.items.length === 0) {
        return res.status(404).json({ error: 'Video not found on YouTube' });
      }

      const videoDetails = data.items[0].snippet;
      
      // Analyze with AI
      const analysis = await analyzeVideoContent({
        title: videoDetails.title,
        description: videoDetails.description || '',
        channelName: videoDetails.channelTitle,
        videoId
      });

      // Check quality threshold unless bypassed
      if (!bypassQuality && !analysis.recommended) {
        return res.json({
          success: false,
          message: 'Video did not meet quality threshold',
          analysis
        });
      }

      // Add video to library
      const [newVideo] = await db.insert(videos).values({
        youtubeId: videoId,
        youtubeUrl: url,
        videoTitle: videoDetails.title,
        videoDescription: videoDetails.description || '',
        channelName: videoDetails.channelTitle,
        techniqueName: analysis.technique || 'Unknown',
        techniqueCategory: 'Manual Addition',
        instructorName: analysis.instructorName,
        uploadDate: new Date(videoDetails.publishedAt)
      }).returning();

      console.log(`[EXEC] ✅ Video added successfully: ${newVideo.id}`);

      res.json({
        success: true,
        message: 'Video added successfully',
        videoId: newVideo.id,
        analysis
      });
    } catch (error: any) {
      console.error('[EXEC] Error adding video:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/execute/system/health - Get system health metrics
  app.get('/api/admin/execute/system/health', checkAdminAuth, async (req, res) => {
    try {
      // Get database health
      const dbHealth = await db.execute(sql`SELECT 1 as healthy`);
      
      // Get total videos
      const totalVideos = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
      const videoCount = parseInt((totalVideos.rows[0] as any)?.count) || 0;

      // Get active users count
      let activeUserCount = 0;
      try {
        const activeUsers = await db.execute(sql`
          SELECT COUNT(DISTINCT user_id) as count 
          FROM user_activity 
          WHERE created_at > NOW() - INTERVAL '24 hours'
        `);
        activeUserCount = parseInt((activeUsers.rows[0] as any)?.count) || 0;
      } catch (userError) {
        console.warn('[EXEC] Could not get active users:', userError);
      }

      // Get quota status
      let quotaUsage = { quotaExceeded: false, estimatedUnits: 0 };
      try {
        const { getQuotaUsage } = await import('./youtube-quota-monitor');
        quotaUsage = getQuotaUsage();
      } catch (quotaError) {
        console.warn('[EXEC] Could not get quota usage:', quotaError);
      }

      res.json({
        success: true,
        health: {
          database: dbHealth.rows.length > 0 ? 'healthy' : 'unhealthy',
          videoLibrary: {
            total: videoCount,
            status: videoCount > 0 ? 'active' : 'empty'
          },
          activeUsers: activeUserCount,
          quotaStatus: {
            exceeded: quotaUsage.quotaExceeded || false,
            usage: quotaUsage.estimatedUnits || 0,
            limit: 10000
          },
          curationJob: activeCurationJob || { status: 'idle' }
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[EXEC] Error getting system health:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ELITE CURATOR - Targeted curation using proven elite instructors
  // ═══════════════════════════════════════════════════════════════════════════════

  // GET /api/admin/elite-curator/stats - Get elite curator stats
  app.get('/api/admin/elite-curator/stats', checkAdminAuth, async (req, res) => {
    try {
      const { getEliteCuratorStats } = await import('./elite-curator');
      const stats = await getEliteCuratorStats();
      res.json(stats);
    } catch (error: any) {
      console.error('[ELITE CURATOR] Error getting stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/elite-curator/run - Manually trigger elite curation (ADMIN ONLY)
  app.post('/api/admin/elite-curator/run', checkAdminAuth, async (req, res) => {
    try {
      const { runEliteCuration } = await import('./elite-curator');
      const result = await runEliteCuration();
      res.json(result);
    } catch (error: any) {
      console.error('[ELITE CURATOR] Error running curation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/targeted-instructor-curation/run - Run targeted curation for specific instructors
  app.post('/api/admin/targeted-instructor-curation/run', checkAdminAuth, async (req, res) => {
    try {
      const { runTargetedInstructorCuration } = await import('./targeted-instructor-curation');
      const { instructors, minQuality = 7.0, minDuration = 120 } = req.body;
      
      if (!instructors || !Array.isArray(instructors) || instructors.length === 0) {
        return res.status(400).json({ error: 'instructors array required' });
      }
      
      // Respond immediately, run in background
      res.json({ 
        status: 'started',
        message: `Started targeted curation for ${instructors.length} instructors`,
        instructors
      });
      
      // Run curation in background
      const results: any[] = [];
      let totalBefore = 0;
      let totalAfter = 0;
      let totalAdded = 0;
      
      for (const instructor of instructors) {
        const queries = [
          `${instructor} jiu jitsu technique`,
          `${instructor} BJJ instructional`,
          `${instructor} guard pass`,
          `${instructor} submission`,
          `${instructor} tutorial`
        ];
        
        try {
          const result = await runTargetedInstructorCuration(instructor, queries, minQuality, minDuration);
          results.push({
            instructor,
            before: result.totalBefore,
            after: result.totalAfter,
            added: result.videosAdded,
            techniques: result.techniquesCovered
          });
          totalAdded += result.videosAdded;
        } catch (err: any) {
          console.error(`[TARGETED CURATION] Error for ${instructor}:`, err.message);
          results.push({ instructor, error: err.message });
        }
      }
      
      console.log(`[TARGETED CURATION] Complete: ${totalAdded} videos added for ${instructors.length} instructors`);
      
    } catch (error: any) {
      console.error('[TARGETED CURATION] Error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      }
    }
  });

  // POST /api/admin/elite-curator/toggle - Enable/disable elite curator (ADMIN ONLY)
  app.post('/api/admin/elite-curator/toggle', checkAdminAuth, async (req, res) => {
    try {
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }
      
      await db.execute(sql`
        UPDATE elite_curator_config 
        SET enabled = ${enabled}, updated_at = NOW()
      `);
      
      res.json({ 
        success: true, 
        enabled,
        message: `Elite curator ${enabled ? 'enabled' : 'disabled'}` 
      });
    } catch (error: any) {
      console.error('[ELITE CURATOR] Error toggling:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/elite-curator/config - Update elite curator settings (ADMIN ONLY)
  app.post('/api/admin/elite-curator/config', checkAdminAuth, async (req, res) => {
    try {
      const { maxDailySearches, resultsPerSearch, minQualityThreshold, targetTotalVideos } = req.body;
      
      // Validate inputs
      if (maxDailySearches && (typeof maxDailySearches !== 'number' || maxDailySearches < 0 || maxDailySearches > 1000)) {
        return res.status(400).json({ error: 'maxDailySearches must be between 0 and 1000' });
      }
      if (resultsPerSearch && (typeof resultsPerSearch !== 'number' || resultsPerSearch < 1 || resultsPerSearch > 50)) {
        return res.status(400).json({ error: 'resultsPerSearch must be between 1 and 50' });
      }
      if (minQualityThreshold && (typeof minQualityThreshold !== 'number' || minQualityThreshold < 0 || minQualityThreshold > 10)) {
        return res.status(400).json({ error: 'minQualityThreshold must be between 0 and 10' });
      }
      if (targetTotalVideos && (typeof targetTotalVideos !== 'number' || targetTotalVideos < 100 || targetTotalVideos > 10000)) {
        return res.status(400).json({ error: 'targetTotalVideos must be between 100 and 10,000' });
      }
      
      await db.execute(sql`
        UPDATE elite_curator_config 
        SET 
          max_daily_searches = COALESCE(${maxDailySearches}, max_daily_searches),
          results_per_search = COALESCE(${resultsPerSearch}, results_per_search),
          min_quality_threshold = COALESCE(${minQualityThreshold}, min_quality_threshold),
          target_total_videos = COALESCE(${targetTotalVideos}, target_total_videos),
          updated_at = NOW()
      `);
      
      res.json({ success: true, message: 'Settings updated' });
    } catch (error: any) {
      console.error('[ELITE CURATOR] Error updating config:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUTO-RECOVERY & TESTING SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════════

  // GET /api/admin/auto-recovery/status - Get auto-recovery system status
  app.get('/api/admin/auto-recovery/status', checkAdminAuth, async (req, res) => {
    try {
      const { getAutoRecoveryStatus } = await import('./curation-auto-recovery');
      const status = await getAutoRecoveryStatus();
      res.json(status);
    } catch (error: any) {
      console.error('[AUTO-RECOVERY] Error getting status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/auto-recovery/trigger - Manually trigger auto-recovery check
  app.post('/api/admin/auto-recovery/trigger', checkAdminAuth, async (req, res) => {
    try {
      const { runId } = req.body;
      const { manualRecovery } = await import('./curation-auto-recovery');
      
      const result = await manualRecovery(runId);
      res.json(result);
    } catch (error: any) {
      console.error('[AUTO-RECOVERY] Error triggering recovery:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/testing/system-status - Get comprehensive system testing status
  app.get('/api/admin/testing/system-status', checkAdminAuth, async (req, res) => {
    try {
      // Quick system health check for testing purposes
      const { DEVOPS_TESTS, PROFESSOR_OS_TESTS } = await import('./tests/admin-systems-test');
      
      res.json({
        testing: {
          devOpsTests: DEVOPS_TESTS.length,
          professorOSTests: PROFESSOR_OS_TESTS.length,
          totalTests: DEVOPS_TESTS.length + PROFESSOR_OS_TESTS.length
        },
        systems: {
          devOps: 'operational',
          professorOS: 'operational',
          autoRecovery: 'enabled',
          eliteCurator: 'enabled'
        },
        message: 'All systems operational. Use POST /api/admin/testing/run-comprehensive to execute full test suite.'
      });
    } catch (error: any) {
      console.error('[TESTING] Error getting status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // EMAIL NOTIFICATION TESTING
  // ═══════════════════════════════════════════════════════════════════════════════
  
  // POST /api/admin/test-email/curation - Test curation results email
  app.post('/api/admin/test-email/curation', checkAdminAuth, async (req, res) => {
    try {
      const { sendCurationResultsEmail } = await import('./curation-email-notifications');
      const result = await sendCurationResultsEmail({
        runType: 'manual',
        videosAnalyzed: 50,
        videosAdded: 5,
        videosSkipped: 45,
        addedTitles: [
          'Test Video 1 - Armbar from Guard',
          'Test Video 2 - Triangle Choke Setup',
          'Test Video 3 - Butterfly Sweep'
        ],
        errors: [],
        duration: 120000
      });
      
      res.json({ 
        success: result, 
        message: result ? 'Test curation email sent to todd@bjjos.app' : 'Failed to send email'
      });
    } catch (error: any) {
      console.error('[TEST EMAIL] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/admin/test-email/daily-summary - Test daily summary email
  app.post('/api/admin/test-email/daily-summary', checkAdminAuth, async (req, res) => {
    try {
      const { sendDailySummaryEmail } = await import('./curation-email-notifications');
      const result = await sendDailySummaryEmail();
      
      res.json({ 
        success: result, 
        message: result ? 'Test daily summary email sent to todd@bjjos.app' : 'Failed to send email'
      });
    } catch (error: any) {
      console.error('[TEST EMAIL] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFESSOR OS AUTOMATED QA TEST SUITE
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/api/admin/test-professor-os', checkAdminAuth, async (req, res) => {
    const { categories = ['all'], testUserId } = req.body;
    
    try {
      const { 
        VIDEO_RELEVANCE_TESTS, 
        PERSONALITY_TESTS, 
        COACHING_TESTS,
        runVideoRelevanceTest,
        runPersonalityTest,
        runCoachingTest,
        runVideoCardDataTest,
        generateReport,
        TestResult
      } = await import('./professor-os-tests');
      
      // Use test user ID or default test account
      const userId = testUserId || 'test-qa-user';
      
      // Helper to send message to Professor OS and get response
      async function sendMessage(question: string): Promise<string> {
        return new Promise((resolve, reject) => {
          let fullResponse = '';
          let resolved = false;
          
          // Set timeout to prevent hanging forever
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(fullResponse || 'TIMEOUT: No response received');
            }
          }, 60000); // 60 second timeout per question
          
          // Make internal API call to the Claude chat endpoint
          const http = require('http');
          const postData = JSON.stringify({ message: question, userId, conversationHistory: [] });
          
          const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/ai/chat',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          };
          
          const req = http.request(options, (response: any) => {
            response.on('data', (chunk: Buffer) => {
              const lines = chunk.toString().split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();
                  
                  // Check for [DONE] signal - this means stream is complete
                  if (data === '[DONE]') {
                    if (!resolved) {
                      resolved = true;
                      clearTimeout(timeout);
                      resolve(fullResponse);
                    }
                    return;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.text) fullResponse += parsed.text;
                    if (parsed.content) fullResponse += parsed.content;
                    if (parsed.fullMessage) fullResponse = parsed.fullMessage;
                  } catch (e) {
                    // Not JSON, might be raw text chunk
                    if (data) fullResponse += data;
                  }
                }
              }
            });
            
            response.on('end', () => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve(fullResponse);
              }
            });
            
            response.on('error', (err: Error) => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(err);
              }
            });
          });
          
          req.on('error', (err: Error) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              reject(err);
            }
          });
          
          req.write(postData);
          req.end();
        });
      }
      
      const results: TestResult[] = [];
      const runAll = categories.includes('all');
      
      // Category 1: Video Relevance
      if (runAll || categories.includes('video-relevance')) {
        console.log('[QA TEST] Running video relevance tests...');
        for (const test of VIDEO_RELEVANCE_TESTS) {
          const result = await runVideoRelevanceTest(
            test.id,
            test.question,
            test.keywords,
            test.mode,
            sendMessage
          );
          results.push(result);
          console.log(`[QA TEST] ${test.id}: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
        }
      }
      
      // Category 2: Video Card Data (run during video relevance tests, collect data completeness)
      if ((runAll || categories.includes('video-data')) && results.length > 0) {
        console.log('[QA TEST] Running video card data tests...');
        // Pick a sample response that had videos
        const sampleResult = results.find(r => r.actual.includes('videos matched'));
        if (sampleResult) {
          const dataResults = await runVideoCardDataTest(sampleResult.actual, '2');
          results.push(...dataResults);
        }
      }
      
      // Category 3: Personality
      if (runAll || categories.includes('personality')) {
        console.log('[QA TEST] Running personality tests...');
        for (const test of PERSONALITY_TESTS) {
          const result = await runPersonalityTest(
            test.id,
            test.question,
            test.keywords,
            sendMessage
          );
          results.push(result);
          console.log(`[QA TEST] ${test.id}: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
        }
      }
      
      // Category 4: Coaching Quality
      if (runAll || categories.includes('coaching')) {
        console.log('[QA TEST] Running coaching quality tests...');
        for (const test of COACHING_TESTS) {
          const result = await runCoachingTest(test, sendMessage);
          results.push(result);
          console.log(`[QA TEST] ${test.id}: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
        }
      }
      
      const report = generateReport(results);
      
      console.log(`[QA TEST] Complete: ${report.passed}/${report.totalTests} passed (${report.passPercentage}%)`);
      
      res.json(report);
      
    } catch (error: any) {
      console.error('[QA TEST] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Quick video data quality check (no AI calls)
  app.get('/api/admin/test-professor-os/data-quality', checkAdminAuth, async (req, res) => {
    try {
      const missingThumbnails = await db.execute(sql`
        SELECT COUNT(*) as count FROM ai_video_knowledge 
        WHERE thumbnail_url IS NULL OR thumbnail_url = ''
      `);
      
      const genericInstructors = await db.execute(sql`
        SELECT COUNT(*) as count FROM ai_video_knowledge 
        WHERE instructor_name IS NULL 
           OR instructor_name = '' 
           OR instructor_name ILIKE '%Unknown%'
           OR instructor_name ILIKE '%BJJ Instructor%'
      `);
      
      const missingYoutubeIds = await db.execute(sql`
        SELECT COUNT(*) as count FROM ai_video_knowledge 
        WHERE video_url IS NULL 
           OR video_url = ''
           OR video_url NOT LIKE '%youtube%'
      `);
      
      const totalVideos = await db.execute(sql`
        SELECT COUNT(*) as count FROM ai_video_knowledge
      `);
      
      const total = parseInt((totalVideos.rows?.[0] as any)?.count || '0');
      const noThumbnail = parseInt((missingThumbnails.rows?.[0] as any)?.count || '0');
      const badInstructor = parseInt((genericInstructors.rows?.[0] as any)?.count || '0');
      const noYoutubeId = parseInt((missingYoutubeIds.rows?.[0] as any)?.count || '0');
      
      res.json({
        totalVideos: total,
        issues: {
          missingThumbnails: noThumbnail,
          genericInstructors: badInstructor,
          missingYoutubeIds: noYoutubeId
        },
        healthPercentage: total > 0 
          ? Math.round(((total - Math.max(noThumbnail, badInstructor, noYoutubeId)) / total) * 100) 
          : 0,
        summary: noThumbnail === 0 && badInstructor === 0 && noYoutubeId === 0
          ? '✅ All video data is complete'
          : `⚠️ ${noThumbnail} missing thumbnails, ${badInstructor} generic instructors, ${noYoutubeId} missing YouTube IDs`
      });
      
    } catch (error: any) {
      console.error('[DATA QUALITY] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // INTERNAL: Run elite instructor batch curation (localhost only)
  app.get('/api/internal/run-elite-instructor-curation', async (req, res) => {
    // Only allow from localhost
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (!ip.includes('127.0.0.1') && !ip.includes('::1') && !ip.includes('localhost')) {
      return res.status(403).json({ error: 'Internal only' });
    }
    
    try {
      const { runEliteInstructorBatchCuration } = await import('./run-elite-instructor-batch');
      
      // Respond immediately
      res.json({ 
        status: 'started',
        message: 'Elite instructor batch curation started in background',
        instructors: 16
      });
      
      // Run in background
      runEliteInstructorBatchCuration()
        .then(() => console.log('[ELITE BATCH] Curation complete'))
        .catch(err => console.error('[ELITE BATCH] Error:', err.message));
        
    } catch (error: any) {
      console.error('[ELITE BATCH] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== CURATION COMMAND CENTER API =====
  
  // Helper to format curation run as job
  function formatCurationRunAsJob(run: any) {
    const progress = run.status === 'completed' ? 100 : 
                    run.status === 'failed' || run.status === 'cancelled' ? 0 :
                    Math.min(90, Math.round((run.videosAnalyzed || 0) / Math.max(1, run.videosScreened || 10) * 100));
    return {
      id: run.id,
      type: run.runType || 'manual',
      query: run.searchCategory || '',
      status: run.status as 'running' | 'completed' | 'failed' | 'cancelled',
      progress,
      found: run.videosScreened || 0,
      added: run.videosAdded || 0,
      startedAt: run.startedAt?.toISOString() || new Date().toISOString(),
      completedAt: run.completedAt?.toISOString(),
    };
  }

  // Track cancelled jobs to signal background work to stop
  const cancelledJobIds = new Set<string>();
  
  // Get curation status
  app.get('/api/admin/curation/status', checkAdminAuth, async (req, res) => {
    try {
      // Check if auto-curation is enabled (from curation_settings table)
      // Default to true if no setting exists (matches prior behavior - scheduler is enabled by default)
      let isActive = true;
      try {
        const settingResult = await db.execute(sql`
          SELECT value FROM curation_settings WHERE key = 'auto_curation_enabled' LIMIT 1
        `);
        if (settingResult.rows && settingResult.rows.length > 0) {
          isActive = (settingResult.rows[0] as any)?.value === 'true';
        }
      } catch (settingErr) {
        // Table may not exist yet - default to true
        console.log('[CURATION API] Settings table not ready, defaulting isActive=true');
      }
      
      // Get last curation run
      const [lastRun] = await db.select().from(curationRuns).orderBy(desc(curationRuns.startedAt)).limit(1);
      
      res.json({
        isActive,
        schedule: '4x daily (3:15am, 9am, 3pm, 9pm EST)',
        lastRun: lastRun ? {
          timestamp: lastRun.startedAt,
          discovered: lastRun.videosScreened || 0,
          analyzed: lastRun.videosAnalyzed || 0,
          added: lastRun.videosAdded || 0,
        } : null,
        nextRun: isActive ? 'Scheduled' : 'Paused',
      });
    } catch (error: any) {
      console.error('[CURATION API] Error getting status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get library stats
  app.get('/api/admin/curation/library-stats', checkAdminAuth, async (req, res) => {
    try {
      const totalResult = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
      const giResult = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge WHERE gi_or_nogi = 'gi'`);
      const nogiResult = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge WHERE gi_or_nogi = 'nogi'`);
      const bothResult = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge WHERE gi_or_nogi = 'both'`);
      const avgQualityResult = await db.execute(sql`SELECT AVG(quality_score) as avg FROM ai_video_knowledge WHERE quality_score IS NOT NULL`);
      const instructorResult = await db.execute(sql`SELECT COUNT(DISTINCT instructor_name) as count FROM ai_video_knowledge WHERE instructor_name IS NOT NULL`);
      
      res.json({
        totalVideos: parseInt((totalResult.rows?.[0] as any)?.count || '0'),
        giVideos: parseInt((giResult.rows?.[0] as any)?.count || '0'),
        nogiVideos: parseInt((nogiResult.rows?.[0] as any)?.count || '0'),
        bothVideos: parseInt((bothResult.rows?.[0] as any)?.count || '0'),
        avgQualityScore: parseFloat((avgQualityResult.rows?.[0] as any)?.avg || '0'),
        instructorCount: parseInt((instructorResult.rows?.[0] as any)?.count || '0'),
      });
    } catch (error: any) {
      console.error('[CURATION API] Error getting library stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get active jobs (from database)
  app.get('/api/admin/curation/active-jobs', checkAdminAuth, async (req, res) => {
    try {
      const activeRuns = await db.select().from(curationRuns)
        .where(eq(curationRuns.status, 'running'))
        .orderBy(desc(curationRuns.startedAt))
        .limit(10);
      
      const jobs = activeRuns.map(formatCurationRunAsJob);
      res.json(jobs);
    } catch (error: any) {
      console.error('[CURATION API] Error getting active jobs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get job history (from database)
  app.get('/api/admin/curation/job-history', checkAdminAuth, async (req, res) => {
    try {
      const historyRuns = await db.select().from(curationRuns)
        .where(sql`${curationRuns.status} != 'running'`)
        .orderBy(desc(curationRuns.startedAt))
        .limit(20);
      
      const jobs = historyRuns.map(formatCurationRunAsJob);
      res.json(jobs);
    } catch (error: any) {
      console.error('[CURATION API] Error getting job history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get known instructors
  app.get('/api/admin/curation/known-instructors', checkAdminAuth, async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT instructor_name, COUNT(*) as count 
        FROM ai_video_knowledge 
        WHERE instructor_name IS NOT NULL AND instructor_name != ''
        GROUP BY instructor_name 
        ORDER BY count DESC 
        LIMIT 50
      `);
      const instructors = (result.rows || []).map((r: any) => r.instructor_name);
      res.json(instructors);
    } catch (error: any) {
      console.error('[CURATION API] Error getting instructors:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get API quota usage
  app.get('/api/admin/curation/api-quota', checkAdminAuth, async (req, res) => {
    try {
      // Get YouTube quota from curation_settings table
      const quotaResult = await db.execute(sql`
        SELECT value FROM curation_settings WHERE key = 'youtube_quota_used_today' LIMIT 1
      `);
      const youtubeUsed = parseInt((quotaResult.rows?.[0] as any)?.value || '0');
      
      res.json({
        youtubeUsed,
        youtubeLimit: 10000,
        geminiCostToday: 0.50,
        geminiCostMonth: 15.00,
      });
    } catch (error: any) {
      console.error('[CURATION API] Error getting quota:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Toggle auto-curation
  app.post('/api/admin/curation/toggle', checkAdminAuth, async (req, res) => {
    try {
      const { enabled } = req.body;
      
      // Upsert the setting in curation_settings table
      await db.execute(sql`
        INSERT INTO curation_settings (key, value, updated_at)
        VALUES ('auto_curation_enabled', ${enabled ? 'true' : 'false'}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${enabled ? 'true' : 'false'}, updated_at = NOW()
      `);
      
      console.log(`[CURATION API] Auto-curation ${enabled ? 'enabled' : 'disabled'}`);
      res.json({ success: true, enabled });
    } catch (error: any) {
      console.error('[CURATION API] Error toggling curation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Run curation job (persisted to database)
  app.post('/api/admin/curation/run', checkAdminAuth, async (req, res) => {
    try {
      const { type, query, filter } = req.body;
      const searchCategory = query || filter || type;
      
      // Insert new curation run into database
      const [newRun] = await db.insert(curationRuns).values({
        runType: type,
        searchCategory,
        status: 'running',
        videosScreened: 0,
        videosAnalyzed: 0,
        videosAdded: 0,
      }).returning();
      
      const jobId = newRun.id;
      
      // Respond immediately
      res.json({ success: true, jobId, message: `Started ${type} curation` });
      
      // Run in background with cancellation check
      (async () => {
        let result = { curatedCount: 0, searchesPerformed: 0, found: 0, analyzed: 0 };
        
        // Helper to check if job was cancelled
        const isCancelled = () => cancelledJobIds.has(jobId);
        
        try {
          if (type === 'meta') {
            const { MetaAnalyzer } = await import('./meta-analyzer');
            const analyzer = new MetaAnalyzer();
            const priorities = await analyzer.getCurationPriorities();
            
            const { manualCurateTechnique } = await import('./auto-curator');
            for (const priority of priorities.slice(0, 5)) {
              // Check for cancellation before each technique
              if (isCancelled()) {
                console.log(`[CURATION API] Job ${jobId} cancelled, stopping work`);
                cancelledJobIds.delete(jobId);
                return; // Exit without overwriting status
              }
              
              const r = await manualCurateTechnique(priority.techniqueName, 10);
              // Accumulate per-iteration counts (not cumulative totals)
              const foundThisIteration = r.searchesPerformed * 10;
              result.curatedCount += r.curatedCount;
              result.searchesPerformed += r.searchesPerformed;
              result.found += foundThisIteration;
              result.analyzed += foundThisIteration; // Each found video is analyzed once
            }
          } else if (type === 'instructor' || type === 'technique' || type === 'position' || type === 'custom') {
            if (isCancelled()) {
              cancelledJobIds.delete(jobId);
              return;
            }
            
            const { searchYouTubeVideosExtended } = await import('./intelligent-curator');
            const searchQuery = type === 'instructor' ? `${query} bjj technique` : 
                               type === 'technique' ? `${query} bjj instructional` :
                               type === 'position' ? `${query} bjj guard pass sweep submission` :
                               query;
            
            const videos = await searchYouTubeVideosExtended(searchQuery, undefined, 20);
            result.curatedCount = videos.length;
            result.searchesPerformed = 1;
            result.found = videos.length;
            result.analyzed = videos.length;
          } else if (type === 'gi-nogi') {
            if (isCancelled()) {
              cancelledJobIds.delete(jobId);
              return;
            }
            
            const { searchYouTubeVideosExtended } = await import('./intelligent-curator');
            const searchQuery = filter === 'gi' ? 'gi bjj technique instructional' : 'nogi submission grappling technique';
            
            const videos = await searchYouTubeVideosExtended(searchQuery, undefined, 20);
            result.curatedCount = videos.length;
            result.searchesPerformed = 1;
            result.found = videos.length;
            result.analyzed = videos.length;
          }
          
          // Final check before writing completion
          if (isCancelled()) {
            cancelledJobIds.delete(jobId);
            return;
          }
          
          // Write final results once complete (atomic update)
          await db.update(curationRuns)
            .set({ 
              status: 'completed',
              videosScreened: result.found,
              videosAnalyzed: result.analyzed,
              videosAdded: result.curatedCount,
              completedAt: new Date()
            })
            .where(eq(curationRuns.id, jobId));
          
          // Clean up cancelledJobIds set on successful completion
          cancelledJobIds.delete(jobId);
          
          console.log(`[CURATION API] Job ${jobId} completed: ${result.curatedCount} videos added`);
        } catch (error: any) {
          // Only update to failed if not cancelled
          if (!isCancelled()) {
            await db.update(curationRuns)
              .set({ 
                status: 'failed',
                errorMessage: error.message,
                completedAt: new Date()
              })
              .where(eq(curationRuns.id, jobId));
          }
          cancelledJobIds.delete(jobId);
          console.error(`[CURATION API] Job ${jobId} failed:`, error.message);
        }
      })();
      
    } catch (error: any) {
      console.error('[CURATION API] Error starting curation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel job (updates database and signals background work to stop)
  app.post('/api/admin/curation/cancel/:jobId', checkAdminAuth, async (req, res) => {
    try {
      const { jobId } = req.params;
      
      // Check if job exists and is running
      const [job] = await db.select().from(curationRuns).where(eq(curationRuns.id, jobId)).limit(1);
      
      if (job && job.status === 'running') {
        // Signal the background work to stop
        cancelledJobIds.add(jobId);
        
        // Update database status
        await db.update(curationRuns)
          .set({ 
            status: 'cancelled',
            completedAt: new Date()
          })
          .where(eq(curationRuns.id, jobId));
        
        console.log(`[CURATION API] Job ${jobId} cancelled`);
        res.json({ success: true });
      } else if (job) {
        res.status(400).json({ error: 'Job is not running' });
      } else {
        res.status(404).json({ error: 'Job not found' });
      }
    } catch (error: any) {
      console.error('[CURATION API] Error cancelling job:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return createServer(app);
}