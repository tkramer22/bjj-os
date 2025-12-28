# BJJ OS - Professor OS Complete Technical Documentation

**Last Updated:** October 28, 2025  
**Version:** 3.0 (Mobile-First UI + Intelligence Enhancement)

---

## 📋 TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Dual AI System (GPT-4o + Claude Sonnet 4)](#2-dual-ai-system)
3. [3-Brain Memory Architecture](#3-3-brain-memory-architecture)
4. [Multi-Agent Intelligence System](#4-multi-agent-intelligence-system)
5. [API Integration Details](#5-api-integration-details)
6. [Data Persistence & Database Schema](#6-data-persistence--database-schema)
7. [Personalization Engine](#7-personalization-engine)
8. [Video Library Integration](#8-video-library-integration)
9. [Voice Input/Output System](#9-voice-inputoutput-system)
10. [Intelligence Enhancement Layer](#10-intelligence-enhancement-layer)
11. [Frontend Implementation](#11-frontend-implementation)
12. [Backend API Endpoints](#12-backend-api-endpoints)
13. [Error Handling & Fallbacks](#13-error-handling--fallbacks)
14. [Configuration & Environment](#14-configuration--environment)
15. [Complete Code Examples](#15-complete-code-examples)

---

## 1. SYSTEM OVERVIEW

### Architecture Summary

Professor OS is an AI-powered BJJ coaching system that combines:
- **Dual-Model AI Routing** (GPT-4o for complexity analysis, Claude Sonnet 4 for deep coaching)
- **Multi-Agent Intelligence** (5 specialized agents for query understanding, video matching, and learning path synthesis)
- **3-Brain Memory System** (short-term, medium-term, long-term context)
- **Intelligence Enhancement** (combat sports news, individual profiles, population data)
- **Real-time Video Recommendations** with timestamp-level precision

### System Components

**Frontend:**
- `client/src/pages/chat-mobile.tsx` - Mobile-first Professor OS chat interface
- `client/src/components/adaptive-layout.tsx` - Responsive navigation wrapper

**Backend:**
- `server/routes.ts` - Main chat endpoint (`/api/ai/chat/message`)
- `server/ai-orchestrator.ts` - AI model routing and performance tracking
- `server/multi-agent-integration.ts` - Multi-agent system orchestration
- `server/intelligence-enhancer.ts` - Context enrichment layer
- `server/ai-intelligence.ts` - Core AI functions and Claude API calls

**Database:**
- `ai_conversation_learning` - Stores all user/AI messages with metadata
- `ai_user_context` - Comprehensive user profiles and preferences
- `user_cognitive_profile` - Learning styles and cognitive patterns
- `ai_video_knowledge` - 315+ curated BJJ videos with timestamps

---

## 2. DUAL AI SYSTEM

### System Architecture

**IMPORTANT CLARIFICATION:** There is **NO custom ChatGPT agent**. The system uses direct OpenAI API calls with GPT-4o and Anthropic API calls with Claude Sonnet 4.

### How It Works

#### Step 1: GPT-4o Complexity Analysis
```typescript
// Location: server/routes.ts (lines 6157-6199)
const complexityAnalysis = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    {
      role: 'system',
      content: `You are an AI complexity analyzer. Analyze the following BJJ-related user message and rate its complexity from 0-10:

0-3: Simple questions (basic technique names, yes/no questions, greetings)
4-6: Standard queries (specific technique requests, position advice)
7-8: Complex scenarios (multiple positions, strategic planning, injury considerations)
9-10: Expert-level discussions (competition preparation, advanced concepts, philosophical questions)

Respond with ONLY a JSON object:
{"complexity": <number 0-10>, "reason": "<one sentence explaining the score>"}`
    },
    {
      role: 'user',
      content: `Analyze this message:\n\n"${message}"`
    }
  ],
  max_tokens: 100,
  temperature: 0.3
});
```

#### Step 2: Model Selection Based on Complexity

```typescript
// Location: server/routes.ts (lines 6202-6250)

if (complexityScore > 7) {
  // HIGH COMPLEXITY → Use Claude Sonnet 4
  modelUsed = 'claude-sonnet-4';
  
  const claudeMessage = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: aiPrompt, // Full system prompt with user context
    messages: [
      {
        role: 'user',
        content: message
      }
    ]
  });
  
  aiResponse = claudeMessage.content[0].type === 'text' ? claudeMessage.content[0].text : '';
} else {
  // STANDARD COMPLEXITY → Use GPT-4o
  modelUsed = 'gpt-4o';
  
  const gptResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: aiPrompt
      },
      {
        role: 'user',
        content: message
      }
    ],
    max_tokens: 4096,
    temperature: 0.7
  });
  
  aiResponse = gptResponse.choices[0]?.message?.content || '';
}
```

### Model Capabilities

| Model | Use Case | Strengths | When Used |
|-------|----------|-----------|-----------|
| **GPT-4o** | Complexity analysis, simple queries | Fast, cost-effective, good for straightforward questions | Complexity score 0-7 |
| **Claude Sonnet 4** | Deep coaching, complex scenarios | Superior reasoning, nuanced coaching, strategic advice | Complexity score 8-10 |
| **GPT-4o Fallback** | Error recovery | Reliable backup when primary models fail | When Claude/GPT errors |

### Fallback System

```typescript
// Location: server/routes.ts (lines 6252-6285)
try {
  // Primary dual-model logic
} catch (dualModelError: any) {
  console.error('❌ [DUAL-MODEL] Error in dual-model system:', dualModelError.message);
  console.log('🔄 [DUAL-MODEL] Fallback: Attempting GPT-4o rescue');
  
  // Fallback to GPT-4o
  const gptResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: aiPrompt },
      { role: 'user', content: message }
    ],
    max_tokens: 4096,
    temperature: 0.7
  });
  
  aiResponse = gptResponse.choices[0]?.message?.content || '';
  modelUsed = 'gpt-4o-fallback';
}
```

---

## 3. 3-BRAIN MEMORY ARCHITECTURE

### Brain 1: Short-Term Memory (Current Conversation)

**What:** The active conversation context (last 20 messages)  
**Where:** Loaded from `ai_conversation_learning` table  
**How Long:** Session-based, refreshed on each API call

```typescript
// Location: server/routes.ts (lines 6027-6041)
const history = await db.select({
  messageText: aiConversationLearning.messageText,
  messageType: aiConversationLearning.messageType,
  createdAt: aiConversationLearning.createdAt
})
.from(aiConversationLearning)
.where(eq(aiConversationLearning.userId, userId))
.orderBy(desc(aiConversationLearning.createdAt))
.limit(20); // Last 20 messages

const conversationHistory = history
  .reverse()
  .map(m => `${m.messageType === 'user_sent' ? 'User' : 'Coach'}: ${m.messageText}`)
  .join('\n');
```

**Passed to AI as:**
```
User: How do I escape side control?
Coach: Great question! Let's work on your side control escapes...
User: What if they have strong crossface pressure?
Coach: Ah, the dreaded crossface! Here's what I'd recommend...
```

### Brain 2: Medium-Term Memory (Recent Training Patterns)

**What:** Detected patterns, recent feedback signals, effectiveness tracking  
**Where:** `detected_patterns`, `ai_user_feedback_signals`, `ai_effectiveness_tracking` tables  
**How Long:** Last 30-90 days

```typescript
// Location: server/context-builder.ts (lines 115-145)
const memories = await db.select({
  summary: userMemoryMarkers.summary,
  occurred_at: userMemoryMarkers.occurredAt,
  significance_score: userMemoryMarkers.significanceScore,
  memory_type: userMemoryMarkers.memoryType
})
.from(userMemoryMarkers)
.where(
  and(
    eq(userMemoryMarkers.userId, userId),
    sql`(
      (${userMemoryMarkers.memoryTier} = 'working' AND ${userMemoryMarkers.occurredAt} >= ${thirtyDaysAgo})
      OR (${userMemoryMarkers.memoryTier} = 'long_term' AND ${userMemoryMarkers.significanceScore} >= 8)
    )`
  )
)
.orderBy(desc(userMemoryMarkers.significanceScore))
.limit(20);
```

**Injected into System Prompt as:**
```
DETECTED PATTERNS (Last 30 Days):
- Struggling with maintaining guard retention (detected 5x)
- Frequently asks about escapes from bad positions
- Shows preference for NoGi techniques
- High engagement with butterfly guard content
```

### Brain 3: Long-Term Memory (User Profile & History)

**What:** Complete user profile, all historical conversations, saved videos, learning journey  
**Where:** `bjj_users`, `ai_user_context`, `user_cognitive_profile`, `saved_videos` tables  
**How Long:** Permanent (entire user lifetime)

```typescript
// Location: server/ai-intelligence.ts (lines 720-800)
export async function loadFullUserContext(userId: string): Promise<UserContext> {
  const user = await db.select().from(bjjUsers).where(eq(bjjUsers.id, userId)).limit(1);
  const recent_signals = await db.select()
    .from(aiUserFeedbackSignals)
    .where(eq(aiUserFeedbackSignals.userId, userId))
    .orderBy(desc(aiUserFeedbackSignals.createdAt))
    .limit(20);
  const effectiveness_history = await db.select()
    .from(aiEffectivenessTracking)
    .where(eq(aiEffectivenessTracking.userId, userId))
    .orderBy(desc(aiEffectivenessTracking.createdAt))
    .limit(10);
    
  return {
    user: user[0],
    recent_signals,
    effectiveness_history,
    predictions: await getUserPredictions(userId),
    context_summary: buildContextSummary(user[0], recent_signals, effectiveness_history)
  };
}
```

**Injected into System Prompt as:**
```
USER PROFILE:
- Name: Sarah
- Belt: Blue Belt (2 years training)
- Style: Both Gi & NoGi
- Biggest Struggle: "I struggle with guard passing against bigger opponents"
- Training Frequency: 4-5x per week
- Age Range: 25-35
- Goals: Compete at local tournaments
- Days Since Joined: 127 days
- Subscription: Active (Founding Member)

COGNITIVE PROFILE:
- Learning Style: Visual + Step-by-step
- Content Preference: Detailed breakdowns
- Engagement Patterns: High completion rate on 10-15 min videos
```

---

## 4. MULTI-AGENT INTELLIGENCE SYSTEM

### System Overview

The multi-agent system uses 5 specialized AI agents to enhance query processing:

1. **Interpreter Agent** - Analyzes query intent and emotional state
2. **Matcher Agent** - Scores and ranks videos based on multiple criteria
3. **Synthesizer Agent** - Creates personalized learning paths
4. **Evaluator Agent** - Tracks coaching effectiveness
5. **Orchestrator Agent** - Coordinates all agents

### Agent 1: Interpreter Agent

**Purpose:** Deep query understanding beyond surface-level keywords

**Location:** `server/agent-interpreter.ts`

**What it analyzes:**
- **Layer 1:** Linguistic analysis (explicit content)
- **Layer 2:** Intent inference (what they're really asking)
- **Layer 3:** User profile inference (skill level, learning style, emotional state)
- **Layer 4:** Meta-understanding (optimal learning path)

```typescript
// Location: server/agent-interpreter.ts (lines 67-86)
async interpretQuery(userId: string, query: string, queryId: number): Promise<QueryUnderstanding> {
  const userContext = await this.getUserContext(userId);
  const analysisPrompt = this.buildAnalysisPrompt(query, userContext);
  
  const response = await aiOrchestrator.call(
    'query_understanding',
    analysisPrompt,
    { jsonMode: true, temperature: 0.7 }
  );
  
  return {
    explicit: {
      technique: response.technique,
      position: response.position,
      questionType: response.questionType,
      keywords: response.keywords
    },
    intent: {
      rootProblem: response.rootProblem,
      likelyMistakes: response.likelyMistakes,
      learningNeed: response.learningNeed,
      skillGap: response.skillGap
    },
    userProfile: {
      inferredSkillLevel: response.inferredSkillLevel,
      inferredLearningStyle: response.inferredLearningStyle,
      emotionalState: response.emotionalState,
      urgency: response.urgency
    },
    // ... more layers
  };
}
```

**Example Output:**
```json
{
  "explicit": {
    "technique": "triangle choke",
    "position": "closed guard",
    "questionType": "troubleshooting",
    "keywords": ["triangle", "arm", "stuck", "escape"]
  },
  "intent": {
    "rootProblem": "Unable to finish triangle because opponent is defending the arm",
    "likelyMistakes": [
      "Not controlling posture before attacking",
      "Trying to force the arm across without breaking grip"
    ],
    "learningNeed": "Triangle finishing mechanics when opponent defends",
    "skillGap": "Missing fundamental triangle control positions"
  },
  "userProfile": {
    "inferredSkillLevel": "intermediate",
    "inferredLearningStyle": "problem-solving",
    "emotionalState": "frustrated",
    "urgency": "high"
  }
}
```

### Agent 2: Matcher Agent

**Purpose:** Intelligent video ranking based on 6 criteria

**Location:** `server/agent-matcher.ts`

**Scoring Criteria:**
```typescript
// Location: server/agent-matcher.ts (lines 19-33)
interface VideoScore {
  videoId: number;
  video: any;
  scores: {
    relevance: number; // 0-100 (30% weight)
    pedagogicalFit: number; // 0-100 (20% weight)
    engagementProbability: number; // 0-100 (15% weight)
    learningEfficiency: number; // 0-100 (15% weight)
    retentionLikelihood: number; // 0-100 (10% weight)
    progressionValue: number; // 0-100 (10% weight)
  };
  combinedScore: number; // 0-100 weighted average
  reasoning: string;
  rank: number;
}
```

**Scoring Algorithm:**
```typescript
// Location: server/agent-matcher.ts (lines 74-96)
for (const video of candidates) {
  const scores = await this.scoreVideo(video, context, userContext);
  const combinedScore = this.calculateCombinedScore(scores);
  
  scoredVideos.push({
    videoId: video.id,
    video,
    scores,
    combinedScore,
    reasoning: this.generateReasoning(scores, context.understanding),
    rank: 0 // Will be set after sorting
  });
}

// Sort by combined score
scoredVideos.sort((a, b) => b.combinedScore - a.combinedScore);
scoredVideos.forEach((v, i) => v.rank = i + 1);

return scoredVideos.slice(0, maxResults);
```

### Agent 3: Synthesizer Agent

**Purpose:** Create personalized learning paths from matched videos

**Location:** `server/agent-synthesizer.ts`

**What it generates:**
```typescript
// Location: server/agent-synthesizer.ts (lines 89-121)
const response: LearningPathResponse = {
  conceptualFraming: "Here's why this technique will help you...",
  primaryVideo: {
    videoId: primary.video.id,
    title: primary.video.title,
    instructor: primary.video.instructorName,
    startTime: this.selectOptimalTimestamp(primary.video, understanding),
    why: "This video addresses your exact problem because..."
  },
  foundationVideos: [
    { videoId: 123, title: "Guard Retention Basics", instructor: "John Danaher", why: "Builds fundamental understanding" }
  ],
  troubleshootingVideos: [
    { videoId: 456, title: "When They Stand in Guard", instructor: "Gordon Ryan", why: "If primary approach doesn't work" }
  ],
  progressionVideos: [
    { videoId: 789, title: "Advanced Sweep Combinations", instructor: "Lachlan Giles", why: "Next steps after mastery" }
  ],
  encouragement: "You're asking the right questions at exactly the right time...",
  proTip: "Focus on the angle of your knee, not just the lock",
  keyMetric: "Success metric: Can you maintain posture control for 10 seconds?",
  presentationStyle: "empathetic" // Based on emotional state
};
```

---

## 5. API INTEGRATION DETAILS

### Claude API (Anthropic)

**Model:** `claude-sonnet-4-20250514`  
**When Used:** Complex queries (complexity score > 7)  
**Location:** `server/routes.ts` (lines 6212-6224)

```typescript
const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const claudeMessage = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  system: aiPrompt, // Full system prompt with user context
  messages: [
    {
      role: 'user',
      content: message
    }
  ]
});

const aiResponse = claudeMessage.content[0].type === 'text' ? claudeMessage.content[0].text : '';
```

**Request Format:**
```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 4096,
  "system": "<Full system prompt with user context, video library, conversation history>",
  "messages": [
    {
      "role": "user",
      "content": "How do I escape side control against a bigger opponent?"
    }
  ]
}
```

**Response Format:**
```json
{
  "id": "msg_01abc123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Ah, the heavyweight side control escape - this is a common challenge for everyone who trains! Let me break down my favorite high-percentage escapes for you...\n\n[VIDEO: Side Control Escape Fundamentals | John Danaher | 12:45 | abc123 | 42]"
    }
  ],
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input_tokens": 3842,
    "output_tokens": 658
  }
}
```

### OpenAI API (GPT-4o)

**Model:** `gpt-4o`  
**When Used:** Complexity analysis (always), simple queries (complexity score ≤ 7)  
**Location:** `server/routes.ts` (lines 6153-6185, 6232-6249)

```typescript
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Complexity Analysis
const complexityAnalysis = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: '<Complexity analysis prompt>' },
    { role: 'user', content: `Analyze this message:\n\n"${message}"` }
  ],
  max_tokens: 100,
  temperature: 0.3
});

// OR Full Response (for simple queries)
const gptResponse = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: aiPrompt },
    { role: 'user', content: message }
  ],
  max_tokens: 4096,
  temperature: 0.7
});
```

**NO FUNCTION CALLING:** The system does **NOT** use OpenAI function calling. Video recommendations are handled through:
1. Intelligent video ranking (before AI call)
2. Video token injection (after AI response)

---

## 6. DATA PERSISTENCE & DATABASE SCHEMA

### Conversations Table

**Table:** `ai_conversation_learning`  
**Location:** `shared/schema.ts` (lines 2020-2060)

```typescript
export const aiConversationLearning = pgTable("ai_conversation_learning", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  
  messageText: text("message_text").notNull(),
  messageType: text("message_type"), // 'user_sent' or 'ai_sent'
  conversationDate: timestamp("conversation_date").defaultNow(),
  
  containsValuableSignal: boolean("contains_valuable_signal").default(false),
  extractedInsights: jsonb("extracted_insights"),
  
  conversationTopic: text("conversation_topic"),
  sentiment: text("sentiment"), // 'positive', 'neutral', 'negative'
  
  shouldUpdateProfile: boolean("should_update_profile").default(false),
  profileUpdates: jsonb("profile_updates"),
  
  isNoise: boolean("is_noise").default(false),
  noiseReason: text("noise_reason"),
  
  // Dual-model AI tracking
  modelUsed: text("model_used"), // 'gpt-4o', 'claude-sonnet-4', 'gpt-4o-fallback'
  complexityScore: integer("complexity_score"), // 0-10 complexity rating
  
  createdAt: timestamp("created_at").defaultNow(),
});
```

**Example Database Record:**
```json
{
  "id": 1523,
  "userId": "user_abc123",
  "messageText": "How do I escape side control against bigger opponents?",
  "messageType": "user_sent",
  "conversationDate": "2025-10-28T22:45:12.234Z",
  "containsValuableSignal": true,
  "extractedInsights": {
    "technique": "side control escape",
    "position": "bottom side control",
    "challenge": "size disadvantage"
  },
  "conversationTopic": "escapes",
  "sentiment": "neutral",
  "shouldUpdateProfile": false,
  "profileUpdates": null,
  "isNoise": false,
  "noiseReason": null,
  "modelUsed": "claude-sonnet-4",
  "complexityScore": 8,
  "createdAt": "2025-10-28T22:45:12.234Z"
}
```

### Save Logic

**When:** After each user message AND AI response  
**Location:** `server/routes.ts` (lines 6429-6476)

```typescript
// Save user message
await db.insert(aiConversationLearning).values({
  userId,
  messageText: message,
  messageType: 'user_sent',
  conversationTopic: detectTopic(message),
  sentiment: detectSentiment(message),
  containsValuableSignal: true,
  modelUsed: null, // Not applicable for user messages
  complexityScore: null,
  createdAt: new Date()
});

// Save AI response
await db.insert(aiConversationLearning).values({
  userId,
  messageText: aiResponse,
  messageType: 'ai_sent',
  conversationTopic: detectTopic(message),
  sentiment: 'positive', // AI is always positive/supportive
  containsValuableSignal: false, // AI responses are not signals
  modelUsed: modelUsed, // 'gpt-4o', 'claude-sonnet-4', or 'gpt-4o-fallback'
  complexityScore: complexityScore, // 0-10
  createdAt: new Date()
});
```

### Load Logic

**When:** At the start of every chat request  
**Location:** `server/routes.ts` (lines 6027-6041)

```typescript
const history = await db.select({
  messageText: aiConversationLearning.messageText,
  messageType: aiConversationLearning.messageType,
  createdAt: aiConversationLearning.createdAt
})
.from(aiConversationLearning)
.where(eq(aiConversationLearning.userId, userId))
.orderBy(desc(aiConversationLearning.createdAt))
.limit(20); // Last 20 messages

// Convert to conversation string
const conversationHistory = history
  .reverse() // Oldest first
  .map(m => `${m.messageType === 'user_sent' ? 'User' : 'Coach'}: ${m.messageText}`)
  .join('\n');
```

---

## 7. PERSONALIZATION ENGINE

### User Profile Loading

**Database Tables:**
- `bjj_users` - Basic user info (belt, style, email, etc.)
- `ai_user_context` - Detailed training profile
- `user_cognitive_profile` - Learning styles and patterns
- `user_engagement_profile` - Video viewing behavior

**Full Profile Load:**
```typescript
// Location: server/routes.ts (lines 152-188)
function buildSystemPrompt(userContext: any, availableVideos: any[], conversationHistory?: string, learningContext?: string) {
  const user = userContext?.user || {};
  
  // Extract comprehensive profile
  const displayName = user.displayName || user.name || 'there';
  const belt = user.beltLevel || 'white';
  const style = user.style || 'both'; // gi, nogi, both
  const struggleTechnique = user.struggleTechnique || null;
  const ageRange = user.ageRange || null;
  const yearsTraining = user.yearsTraining || null;
  const trainingFrequency = user.trainingFrequency || 'not specified';
  const goal = user.primary_goal || 'improve overall skills';
  const injuries = user.injuries ? JSON.stringify(user.injuries) : '[]';
  const bodyType = user.bodyType || null;
  
  // Calculate journey metrics
  const daysSinceJoined = user.createdAt ? 
    Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  
  // ... inject into system prompt
}
```

### Technique Recommendations

**How videos are personalized:**

1. **Content-Based Filtering:**
   - Belt level matching (belt ± 1 level)
   - Style matching (gi/nogi/both)
   - Technique type (guards, passes, submissions)

2. **Behavioral Filtering:**
   - Watch history (videos you've watched)
   - Save history (videos you've saved)
   - Completion rate (how much you actually watch)

3. **Quality Filtering:**
   - Instructor credibility score (calculated from reputation)
   - Video quality score (7.0+ minimum)
   - Community feedback (helpful ratio)

```typescript
// Location: server/routes.ts (lines 6068-6089)
const rankedVideos = await rankVideos(rawVideos, {
  userId,
  technique: message,
  userBeltLevel: context?.user?.belt_level,
  userStyle: context?.user?.style as 'gi' | 'nogi' | 'both' | undefined,
});

// Top 30 ranked videos passed to AI
const availableVideos = rankedVideos.slice(0, 30).map(v => ({
  id: v.id,
  techniqueName: v.techniqueName || v.title,
  instructorName: v.instructorName,
  positionCategory: v.techniqueType,
  techniqueType: v.techniqueType,
  ranking_score: v.ranking_score,
  timestamps: v.keyTimestamps,
  timestampCount: Array.isArray(v.keyTimestamps) ? v.keyTimestamps.length : 0
}));
```

---

## 8. VIDEO LIBRARY INTEGRATION

### Video Database Schema

**Table:** `ai_video_knowledge`  
**Total Videos:** 315+ curated BJJ instructional videos

```typescript
// Location: shared/schema.ts (lines 950-1050)
export const aiVideoKnowledge = pgTable("ai_video_knowledge", {
  id: serial("id").primaryKey(),
  techniqueName: text("technique_name").notNull(),
  instructorName: text("instructor_name").notNull(),
  videoUrl: text("video_url").notNull(),
  
  // Video metadata
  title: text("title"),
  duration: text("duration"),
  uploadDate: timestamp("upload_date"),
  
  // Classification
  techniqueType: text("technique_type"), // "submission", "guard", "pass", "escape"
  positionCategory: text("position_category"),
  beltLevel: text("belt_level"), // "white", "blue", "purple", "brown", "black"
  giOrNogi: text("gi_or_nogi"), // "gi", "nogi", "both"
  
  // Quality metrics
  qualityScore: numeric("quality_score", { precision: 3, scale: 1 }), // 0-10
  difficultyScore: integer("difficulty_score"), // 1-10
  instructorCredibilityScore: numeric("instructor_credibility_score", { precision: 3, scale: 1 }),
  
  // Engagement metrics
  helpfulCount: integer("helpful_count").default(0),
  notHelpfulCount: integer("not_helpful_count").default(0),
  helpfulRatio: numeric("helpful_ratio", { precision: 3, scale: 2 }),
  totalVotes: integer("total_votes").default(0),
  recommendationCount: integer("recommendation_count").default(0),
  timesSentToUsers: integer("times_sent_to_users").default(0),
  
  // Timestamp system
  keyTimestamps: jsonb("key_timestamps"), // Array of {time, description, keywords}
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
```

### Timestamp System

**Format:**
```json
[
  {
    "time": "0:45",
    "description": "Setting up the initial grip",
    "keywords": ["grip", "setup", "control"]
  },
  {
    "time": "2:30",
    "description": "Breaking opponent's posture",
    "keywords": ["posture", "break", "control"]
  },
  {
    "time": "5:15",
    "description": "Finishing the triangle choke",
    "keywords": ["finish", "triangle", "choke"]
  }
]
```

### Video Recommendation Logic

**Step 1: Query relevant videos**
```typescript
// Location: server/routes.ts (lines 6044-6066)
const rawVideos = await db.select({
  id: aiVideoKnowledge.id,
  techniqueName: aiVideoKnowledge.techniqueName,
  instructorName: aiVideoKnowledge.instructorName,
  techniqueType: aiVideoKnowledge.techniqueType,
  beltLevel: aiVideoKnowledge.beltLevel,
  qualityScore: aiVideoKnowledge.qualityScore,
  giOrNogi: aiVideoKnowledge.giOrNogi,
  keyTimestamps: aiVideoKnowledge.keyTimestamps
})
.from(aiVideoKnowledge)
.where(sql`(${aiVideoKnowledge.qualityScore} >= 7 OR ${aiVideoKnowledge.qualityScore} IS NULL)`)
.limit(50);
```

**Step 2: Rank by relevance**
```typescript
const rankedVideos = await rankVideos(rawVideos, {
  userId,
  technique: message,
  userBeltLevel: context?.user?.belt_level,
  userStyle: context?.user?.style
});
```

**Step 3: Pass top 30 to AI**
```typescript
const availableVideos = rankedVideos.slice(0, 30);
```

**Step 4: AI injects video tokens in response**
```
[VIDEO: Triangle Choke Fundamentals | John Danaher | 12:45 | abc123xyz | 42]
```

---

## 9. VOICE INPUT/OUTPUT SYSTEM

### Voice Input (Whisper API)

**Endpoint:** `/api/ai/chat/transcribe`  
**Location:** `server/routes.ts` (lines 6681-6740)

```typescript
app.post('/api/ai/chat/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    // Send to OpenAI Whisper API
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-1',
      language: 'en'
    });
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({
      text: transcription.text,
      success: true
    });
  } catch (error: any) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});
```

**Frontend Integration:**
```typescript
// Location: client/src/pages/chat-mobile.tsx (lines 112-126)
const handleVoiceInput = () => {
  if (!isRecording) {
    // Start recording
    setIsRecording(true);
    toast({
      title: "Voice input",
      description: "Voice recording coming soon!",
    });
    // TODO: Implement Whisper API integration
    setTimeout(() => setIsRecording(false), 2000);
  } else {
    // Stop recording
    setIsRecording(false);
  }
};
```

### Voice Output (ElevenLabs - NOT IMPLEMENTED)

**Status:** Planned but not yet implemented

**Planned Integration:**
```typescript
// Future implementation
const elevenlabs = new ElevenLabs({
  apiKey: process.env.ELEVENLABS_API_KEY
});

const audio = await elevenlabs.textToSpeech({
  text: aiResponse,
  voice_id: 'professor_os_voice',
  model_id: 'eleven_monolingual_v1'
});

// Stream audio to client
```

---

## 10. INTELLIGENCE ENHANCEMENT LAYER

### Combat Sports Intelligence

**Purpose:** Inject real-time BJJ/MMA news and competition data into responses

**Location:** `server/intelligence-enhancer.ts` (lines 64-100)

```typescript
private async getCombatSportsContext(userMessage: string): Promise<string> {
  // Check if message contains athlete names, competition names, or current events keywords
  const keywords = ['adcc', 'ibjjf', 'worlds', 'ufc', 'championship', 'tournament', 'competition'];
  const isRelevant = keywords.some(keyword => userMessage.toLowerCase().includes(keyword));
  
  if (!isRelevant) {
    return ''; // Don't inject news unless relevant
  }
  
  // Search for relevant news
  const relevantNews = await combatSportsScraper.searchNews(userMessage, 3);
  
  if (relevantNews.length === 0) {
    return '';
  }
  
  // Format news for injection
  let newsContext = '';
  relevantNews.forEach((news, index) => {
    newsContext += `${index + 1}. **${news.title}** (${news.sport.toUpperCase()}, ${this.formatDate(news.publishedDate)})\n`;
    newsContext += `   Summary: ${news.summary}\n`;
    if (news.athletes && news.athletes.length > 0) {
      newsContext += `   Athletes: ${news.athletes.join(', ')}\n`;
    }
    newsContext += `   Source: ${news.sourceName}\n\n`;
  });
  
  return newsContext;
}
```

**Example Injection:**
```
COMBAT SPORTS INTELLIGENCE (Latest News & Competitions):
1. **Gordon Ryan Wins ADCC Absolute** (BJJ, Oct 27, 2025)
   Summary: Gordon Ryan dominated the absolute division at ADCC 2025, submitting all opponents.
   Athletes: Gordon Ryan, Felipe Pena, Marcus Almeida
   Source: FloGrappling

2. **IBJJF Worlds 2025 Registration Opens** (BJJ, Oct 26, 2025)
   Summary: Registration for the 2025 IBJJF World Championships is now open.
   Source: IBJJF
```

### Individual Intelligence

**Purpose:** Inject user-specific cognitive profiles and technique ecosystems

**Location:** `server/intelligence-enhancer.ts` (lines 34-38), `server/individual-intelligence.ts`

```typescript
const individualContext = await individualIntelligence.buildUserContext(userId);

// Returns:
// - Cognitive profile (learning style, preferences)
// - Technique ecosystem (what you know, what connects)
// - Memory markers (significant training moments)
// - Detected patterns (recurring challenges)
```

**Example Injection:**
```
INDIVIDUAL INTELLIGENCE (Personalized Context):
- Learning Style: Visual + Step-by-step
- Strong Techniques: Butterfly guard, arm-in guillotine
- Weak Techniques: Guard passing, leg locks
- Recent Progress: Improved triangle setups (last 14 days)
- Memory Markers:
  * "Had a breakthrough with hip movement in bottom side control" (3 days ago)
  * "Struggled with maintaining closed guard against aggressive opponents" (1 week ago)
```

### Population Intelligence

**Purpose:** Cross-user insights and technique recommendations

**Location:** `server/intelligence-enhancer.ts` (lines 105-123), `server/population-intelligence.ts`

```typescript
private async getPopulationContext(userId: string): Promise<string> {
  const recommendations = await populationIntelligence.getTechniqueRecommendations(userId);
  
  if (recommendations.length === 0) {
    return '';
  }
  
  let context = 'Based on cross-user learning patterns, consider exploring these techniques:\n';
  recommendations.forEach((technique, index) => {
    context += `${index + 1}. ${technique} (commonly learned by users with similar progress)\n`;
  });
  
  return context;
}
```

**Example Injection:**
```
POPULATION INTELLIGENCE (Cross-User Insights):
Based on cross-user learning patterns, consider exploring these techniques:
1. Half guard sweeps (commonly learned by users with similar progress)
2. Kimura grip series (83% of blue belts at your level are working on this)
3. Basic leg lock defense (recommended pathway from guard retention)
```

---

## 11. FRONTEND IMPLEMENTATION

### Chat Component Structure

**Main File:** `client/src/pages/chat-mobile.tsx`

**Component Tree:**
```
<AdaptiveLayout>
  <div className="chat-page">
    <header className="chat-header">
      <Brain icon />
      <h1>Prof. OS</h1>
      <p>Learns your game. Makes you better.</p>
    </header>
    
    <div className="chat-messages">
      {messages.length === 0 ? (
        <IntroMessage />
      ) : (
        <>
          {messages.map(message => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isTyping && <TypingIndicator />}
        </>
      )}
    </div>
    
    <div className="chat-input-area">
      <textarea placeholder="Ask Prof. OS..." />
      <VoiceButton />
      <SendButton />
    </div>
  </div>
</AdaptiveLayout>
```

### State Management

```typescript
// Location: client/src/pages/chat-mobile.tsx (lines 23-31)
const [messages, setMessages] = useState<Message[]>([]);
const [inputValue, setInputValue] = useState("");
const [isTyping, setIsTyping] = useState(false);
const [isRecording, setIsRecording] = useState(false);
const messagesEndRef = useRef<HTMLDivElement>(null);
const textareaRef = useRef<HTMLTextAreaElement>(null);
```

### Sending Messages

```typescript
// Location: client/src/pages/chat-mobile.tsx (lines 95-115)
const handleSendMessage = () => {
  if (!inputValue.trim() || !userId) return;
  
  // Add user message immediately (optimistic update)
  const userMessage: Message = {
    id: String(Date.now()),
    role: 'user',
    content: inputValue,
    timestamp: new Date(),
  };
  setMessages(prev => [...prev, userMessage]);
  setInputValue("");
  setIsTyping(true);
  
  // Send to API
  sendMessageMutation.mutate(inputValue);
  
  // Reset textarea height
  if (textareaRef.current) {
    textareaRef.current.style.height = 'auto';
  }
};
```

### Message Mutation

```typescript
// Location: client/src/pages/chat-mobile.tsx (lines 67-92)
const sendMessageMutation = useMutation({
  mutationFn: async (message: string) => {
    const response = await apiRequest('POST', '/api/ai/chat/message', {
      userId,
      message,
    });
    return response.json();
  },
  onSuccess: (data) => {
    // Add assistant's response
    const assistantMessage: Message = {
      id: String(Date.now() + Math.random()),
      role: 'assistant',
      content: data.response || 'Sorry, I had trouble processing that.',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMessage]);
    setIsTyping(false);
    queryClient.invalidateQueries({ queryKey: ['/api/ai/chat/history', userId] });
  },
  onError: (error) => {
    toast({
      title: "Error",
      description: "Failed to send message. Please try again.",
      variant: "destructive",
    });
    setIsTyping(false);
  },
});
```

---

## 12. BACKEND API ENDPOINTS

### Chat Endpoints

#### POST `/api/ai/chat/message`

**Purpose:** Send message to Professor OS and get AI response

**Request:**
```json
{
  "userId": "user_abc123",
  "message": "How do I escape side control?"
}
```

**Response:**
```json
{
  "response": "Ah, the classic side control escape question! Let me break this down for you...\n\n[VIDEO: Side Control Escape Fundamentals | John Danaher | 12:45 | abc123xyz | 42]",
  "videos": [
    {
      "id": 42,
      "title": "Side Control Escape Fundamentals",
      "instructor": "John Danaher",
      "duration": "12:45",
      "videoId": "abc123xyz"
    }
  ],
  "metadata": {
    "modelUsed": "claude-sonnet-4",
    "complexityScore": 8,
    "multiAgentUsed": true
  }
}
```

**Example cURL:**
```bash
curl -X POST https://bjjos.app/api/ai/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_abc123",
    "message": "How do I escape side control?"
  }'
```

#### GET `/api/ai/chat/history/:userId`

**Purpose:** Get conversation history for a user

**Request:**
```
GET /api/ai/chat/history/user_abc123?limit=50
```

**Response:**
```json
{
  "messages": [
    {
      "id": 1523,
      "messageText": "How do I escape side control?",
      "messageType": "user_sent",
      "conversationTopic": "escapes",
      "createdAt": "2025-10-28T22:45:12.234Z"
    },
    {
      "id": 1524,
      "messageText": "Ah, the classic side control escape question! Let me break this down...",
      "messageType": "ai_sent",
      "conversationTopic": "escapes",
      "modelUsed": "claude-sonnet-4",
      "complexityScore": 8,
      "createdAt": "2025-10-28T22:45:18.567Z"
    }
  ]
}
```

#### POST `/api/ai/chat/transcribe`

**Purpose:** Transcribe voice input using Whisper API

**Request:**
```
POST /api/ai/chat/transcribe
Content-Type: multipart/form-data

audio: <audio file>
```

**Response:**
```json
{
  "text": "How do I escape side control?",
  "success": true
}
```

---

## 13. ERROR HANDLING & FALLBACKS

### Dual-Model Fallback Chain

```typescript
// Location: server/routes.ts (lines 6150-6285)

try {
  // STEP 1: GPT-4o Complexity Analysis
  const complexityAnalysis = await openai.chat.completions.create({...});
  complexityScore = complexityData.complexity || 5;
  
  // STEP 2: Route to appropriate model
  if (complexityScore > 7) {
    // Use Claude Sonnet 4
    const claudeMessage = await anthropic.messages.create({...});
    aiResponse = claudeMessage.content[0].text;
    modelUsed = 'claude-sonnet-4';
  } else {
    // Use GPT-4o
    const gptResponse = await openai.chat.completions.create({...});
    aiResponse = gptResponse.choices[0].message.content;
    modelUsed = 'gpt-4o';
  }
  
} catch (dualModelError) {
  // FALLBACK: GPT-4o Rescue
  console.error('❌ [DUAL-MODEL] Primary models failed, trying GPT-4o fallback');
  
  try {
    const gptResponse = await openai.chat.completions.create({...});
    aiResponse = gptResponse.choices[0].message.content;
    modelUsed = 'gpt-4o-fallback';
  } catch (fallbackError) {
    console.error('❌ [DUAL-MODEL] All AI models failed');
    throw new Error('All AI models failed to respond');
  }
}
```

### Multi-Agent Fallback

```typescript
// Location: server/routes.ts (lines 6095-6134)

try {
  const multiAgentResult = await multiAgentSystem.processQuery(userId, message, context, rankedVideos);
  
  if (multiAgentResult.metadata.usedMultiAgent) {
    // Use enhanced results
    availableVideos = multiAgentResult.videos;
  }
} catch (multiAgentError) {
  console.error('❌ [MULTI-AGENT] Enhancement failed, using fallback');
  // Continue with existing system (video ranking without multi-agent)
}
```

### Rate Limit Handling

**YouTube API:**
- Daily quota: 10,000 units
- Tracked in `api_quota_usage` table
- Auto-disables curation when quota exhausted

**Claude API:**
- Rate limits handled by Anthropic SDK
- Automatic retry with exponential backoff
- Fallback to GPT-4o on failure

**OpenAI API:**
- Rate limits handled by OpenAI SDK
- Automatic retry logic
- Error messages logged to console

---

## 14. CONFIGURATION & ENVIRONMENT

### Required Environment Variables

```bash
# AI Models
ANTHROPIC_API_KEY=sk-ant-...              # Claude Sonnet 4
OPENAI_API_KEY=sk-...                      # GPT-4o + Whisper

# Database
DATABASE_URL=postgresql://...              # Neon PostgreSQL

# Voice (Planned)
ELEVENLABS_API_KEY=...                     # Text-to-speech (not yet implemented)

# Other Services
YOUTUBE_API_KEY=...                        # Video discovery
STRIPE_SECRET_KEY=...                      # Payments
RESEND_API_KEY=...                         # Email notifications
```

### Model Configuration

**Claude Sonnet 4:**
```typescript
{
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  temperature: 0.7 (default, not configurable per request)
}
```

**GPT-4o:**
```typescript
{
  model: 'gpt-4o',
  max_tokens: 4096,
  temperature: 0.7 (for responses) / 0.3 (for complexity analysis)
}
```

**Whisper:**
```typescript
{
  model: 'whisper-1',
  language: 'en'
}
```

---

## 15. COMPLETE CODE EXAMPLES

### Example 1: Send Message to Professor OS

```typescript
// Frontend
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const sendMessage = async (userId: string, message: string) => {
  const response = await apiRequest('POST', '/api/ai/chat/message', {
    userId,
    message
  });
  return response.json();
};

const mutation = useMutation({
  mutationFn: ({ userId, message }: { userId: string, message: string }) => 
    sendMessage(userId, message),
  onSuccess: (data) => {
    console.log('AI Response:', data.response);
    console.log('Videos:', data.videos);
    console.log('Model Used:', data.metadata.modelUsed);
  }
});

// Use it
mutation.mutate({
  userId: 'user_abc123',
  message: 'How do I escape side control?'
});
```

### Example 2: Load Conversation History

```typescript
import { useQuery } from "@tanstack/react-query";

const { data: chatHistory } = useQuery({
  queryKey: ['/api/ai/chat/history', userId],
  enabled: !!userId,
});

// chatHistory structure:
// {
//   messages: [
//     { id: 1, messageText: "...", messageType: "user_sent", ... },
//     { id: 2, messageText: "...", messageType: "ai_sent", modelUsed: "claude-sonnet-4", ... }
//   ]
// }
```

### Example 3: Voice Transcription

```typescript
const transcribeAudio = async (audioBlob: Blob) => {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  
  const response = await fetch('/api/ai/chat/transcribe', {
    method: 'POST',
    body: formData
  });
  
  const data = await response.json();
  return data.text; // Transcribed text
};
```

### Example 4: Parse Video Tokens from Response

```typescript
function parseVideoTokens(content: string) {
  const segments: Array<{ text: string; video?: any }> = [];
  const videoRegex = /\[VIDEO:\s*([^\]]+)\]/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = videoRegex.exec(content)) !== null) {
    // Add text before video token
    if (match.index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, match.index) });
    }
    
    // Parse video data
    const videoData = match[1].split('|').map(s => s.trim());
    if (videoData.length >= 5) {
      segments.push({
        text: '',
        video: {
          title: videoData[0],
          instructor: videoData[1],
          duration: videoData[2],
          videoId: videoData[3],
          id: parseInt(videoData[4], 10)
        }
      });
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex) });
  }
  
  return segments;
}

// Usage:
const segments = parseVideoTokens(aiResponse);
// [
//   { text: "Here's a great video on escapes: " },
//   { video: { title: "Side Control Escape", instructor: "John Danaher", ... } },
//   { text: "\n\nTry this technique next time you roll!" }
// ]
```

---

## 📊 SYSTEM METRICS

### Current Stats (Oct 28, 2025)

- **Total Videos:** 315 curated BJJ instructionals
- **Total Users:** 63
- **Active Trials:** 1
- **Daily Video Additions:** ~30-50 via automated curation
- **AI Models:** GPT-4o (primary) + Claude Sonnet 4 (complex queries)
- **Database Size:** ~50 tables with comprehensive intelligence tracking

### Performance

- **Average Response Time:** 2-4 seconds
- **Complexity Analysis:** ~300ms (GPT-4o)
- **Claude Response:** 2-3 seconds
- **GPT-4o Response:** 1-2 seconds
- **Video Ranking:** ~500ms for 50 videos

---

## 🎯 KEY TAKEAWAYS

1. **No Custom GPT Agent** - The system uses direct API calls to OpenAI (GPT-4o) and Anthropic (Claude Sonnet 4)
2. **Dual-Model Routing** - GPT-4o analyzes complexity, then routes to appropriate model
3. **3-Brain Memory** - Short (20 messages), Medium (30-90 days patterns), Long (full history)
4. **Multi-Agent Enhancement** - 5 specialized agents improve query understanding and video matching
5. **Intelligence Layers** - Combat sports news, individual profiles, population data all injected into context
6. **Video Precision** - Timestamp-level recommendations with optimal starting points
7. **Comprehensive Fallbacks** - Multiple layers of error handling ensure reliability

---

**End of Documentation**

For questions or updates, contact the BJJ OS development team.
