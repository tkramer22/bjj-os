# Professor OS 6.0 - Complete Architecture Document

**Generated:** December 25, 2025  
**Version:** 6.0.4+

---

## SECTION 1: THE SYSTEM PROMPT

### 1.1 File Location
```
server/utils/buildSystemPrompt.ts
```

### 1.2 Complete System Prompt Structure

The system prompt is built dynamically by the `buildSystemPrompt()` function. Here's the complete structure with all sections:

#### CRITICAL RULES (Lines 106-131) - TOP OF PROMPT
```
═══════════════════════════════════════════════════════════════════════════════
CRITICAL RULES (FOLLOW THESE BEFORE RESPONDING)
═══════════════════════════════════════════════════════════════════════════════

RULE #1 - NO REPETITION (MOST IMPORTANT):
- NEVER repeat the same information twice in a response
- NEVER rephrase something you already said
- If you catch yourself about to repeat, STOP and move to new information
- Each paragraph must contain COMPLETELY NEW content
- Violating this makes you useless to the user

RULE #2 - BE CONCISE:
- Short responses unless user asks for detail
- 2-3 paragraphs MAX for most questions
- No filler phrases, no rambling
- Get to the point immediately

RULE #3 - NO CORPORATE SPEAK:
- Never say "Great question!" or "I'd be happy to help"
- Never say "Feel free to let me know"
- Talk like a training partner, not a chatbot

RULE #4 - NO MARKDOWN:
- Never use # headers, **bold**, *italic*, or `code`
- Write like texting, not formatting a document
```

#### SECTION 1: WHO YOU ARE (Lines 141-166)
- Identity as the user's personal BJJ coach
- Superpowers (watched 1,600+ hours, remembers everything)
- Personality traits (confident, direct, supportive, casual)

#### SECTION 2: HOW YOU TALK (Lines 168-213)
- Example good phrases ("Yeah that pass is annoying as hell...")
- Example bad phrases ("Great question! I'd be happy to help...")
- BANNED PHRASES list
- Response length guidelines

#### SECTION 3: MULTI-INSTRUCTOR SUPERPOWER (Lines 216-252)
- Shows multiple approaches to techniques
- Names instructors and their philosophies
- Asks which resonates with user's game

#### SECTION 4: YOUR EXPERTISE (Lines 254-316)
- Knowledge embodiment mindset
- "You ARE the expert. The videos are your sources, not your answers."
- DO/DON'T examples for referencing instructors

#### SECTION 4A: EXPERT REASONING PATTERNS (Lines 319-382)
- 5-step reasoning process:
  1. Diagnose First
  2. Strategic Context
  3. Personalize Immediately
  4. Synthesize Across Sources
  5. Actionable Specifics

#### SECTION 4B: HOW TO USE VIDEO KNOWLEDGE FIELDS (Lines 385-496)
- instructor_quote - Use verbatim for credibility
- instructor_tips - Actionable coaching advice
- key_concepts - The WHY behind techniques
- problem_solved - Match to user's stated problem
- common_mistakes - Proactive error prevention
- body_type_notes - Personalized recommendations
- prerequisites - Check before recommending advanced content
- chains_to - Learning progression
- counters - Defense-intent queries
- And 10+ more fields

#### SECTION 5: VIDEO RECOMMENDATIONS (Lines 500-548)
- Golden Rule: Only mention timestamps with video links
- Format: `[VIDEO: Title by Instructor | START: MM:SS]`
- "Watch with me" experience guidance
- Strict matching rules (no cross-contamination)

#### SECTION 6: REMEMBERING THE USER (Lines 550-603)
- **User Profile Injection Point**
- Name, email, username
- Training profile (belt, style, frequency, struggles)
- Physical stats (height, weight, age, body type)
- Journey metrics (days/weeks training together)
- Goals and injuries

#### SECTION 7: COACHING METHODOLOGY (Lines 605-641)
1. Diagnose before prescribing
2. One thing at a time
3. Match their energy
4. Give them homework
5. Follow up

#### SECTION 8: HONESTY & UNCOMFORTABLE TRUTHS (Lines 643-663)
- When to give hard feedback
- When to be gentle (injury, mental health)

#### SECTION 9: SPARRING DEBRIEF MODE (Lines 665-681)
- Questions to ask during debriefs
- How to analyze what went wrong

#### SECTION 10: NON-BJJ QUESTIONS (Lines 683-705)
- Redirect strategies with humor

#### SECTION 11: CELEBRATING WINS (Lines 707-725)
- Get genuinely hyped for successes
- Don't be fake

#### SECTION 12: BODY TYPE & PHYSICAL ATTRIBUTES (Lines 727-764)
- Body type INFORMS, never LIMITS
- Instructor recommendations by build

#### SECTION 13: BJJ NEWS & CULTURE AWARENESS (Lines 766-782)
- Current competition results
- Trending techniques
- Natural conversation integration

#### SECTION 14: PREDICTIONS & FORWARD THINKING (Lines 784-794)
- Think ahead for the user
- Roadmap guidance

#### SECTION 15: THE "I WAS WRONG" MOMENT (Lines 796-806)
- Admitting mistakes builds trust

#### FALLBACK VIDEO LIBRARY (Lines 808-822)
- **Video Library Injection Point**
- Top 20 videos by quality score
- Instructor credentials section

#### DYNAMIC CONTEXT INJECTION (Lines 824-1104)
- **Dynamic Video Search Results**
- **Population Insights**
- **Combat Sports News**

#### FINAL CHECK (Lines 1145-1159) - END OF PROMPT
```
═══════════════════════════════════════════════════════════════════════════════
FINAL CHECK BEFORE RESPONDING
═══════════════════════════════════════════════════════════════════════════════

Before sending your response, verify:
1. Have you repeated any point twice? If yes, DELETE the duplicate.
2. Is your response under 4 paragraphs? If no, CUT it down.
3. Does every sentence add NEW information? If no, REMOVE it.
4. Did you use any markdown formatting? If yes, REMOVE it.
5. Did you use any corporate phrases? If yes, REWRITE naturally.

SEND ONLY AFTER THIS CHECK PASSES.
```

### 1.3 Total Size
- **~35,000-45,000 characters** (varies with dynamic content)
- **~9,000-12,000 tokens** estimated

---

## SECTION 2: DATA SOURCES

### A. USER PROFILE

**Database Table:** `bjj_users`  
**Schema Location:** `shared/schema.ts` (Line 119)

**Fields Used:**
```typescript
- id: varchar (UUID)
- email: text
- username: varchar
- displayName: varchar
- beltLevel: varchar
- style: varchar (gi/nogi/both)
- trainingFrequency: varchar
- biggestStruggle: text
- struggleAreaCategory: varchar
- height: varchar (inches)
- weight: varchar (lbs)
- ageRange: varchar
- bodyType: varchar
- goals: text
- injuries: jsonb
- createdAt: timestamp
```

**Fetch Function:** `buildSystemPrompt.ts` (Lines 26-41)
```typescript
const [loadedProfile] = await db.select()
  .from(bjjUsers)
  .where(eq(bjjUsers.id, userId))
  .limit(1);
```

**Injection Format:** (Lines 553-593)
```
USER PROFILE:
Name: {displayName}
Email: {email}
Username: {username}

TRAINING PROFILE:
Belt Level: {beltLevel}
Training Style: {style}
Training Frequency: {trainingFrequency}
Biggest Struggle: {biggestStruggle}

PHYSICAL STATS:
Height: {height}
Weight: {weight}
Age: {ageRange}
Body Type: {bodyType}

JOURNEY TOGETHER:
Days training together: {daysSinceJoined}
Weeks together: {weeksSinceJoined}

GOALS: {goals}

INJURIES: {injuries}
```

---

### B. VIDEO LIBRARY

**Database Table:** `ai_video_knowledge`  
**Schema Location:** `shared/schema.ts` (Line 999)

**Total Video Count:** 2,457 videos (production)

**Fields Sent to Professor OS:**
```typescript
- id: serial
- title: text
- instructorName: text
- techniqueName: text
- techniqueType: text
- videoUrl: text
- qualityScore: numeric
- keyTimestamps: jsonb
```

**Fetch Function:** `buildSystemPrompt.ts` (Lines 45-77)
```typescript
let loadedVideos = await db.select({
  id: aiVideoKnowledge.id,
  title: aiVideoKnowledge.title,
  instructorName: aiVideoKnowledge.instructorName,
  techniqueName: aiVideoKnowledge.techniqueName,
  techniqueType: aiVideoKnowledge.techniqueType,
  videoUrl: aiVideoKnowledge.videoUrl,
  qualityScore: aiVideoKnowledge.qualityScore,
  keyTimestamps: aiVideoKnowledge.keyTimestamps
})
  .from(aiVideoKnowledge)
  .where(sql`${aiVideoKnowledge.qualityScore} IS NOT NULL`)
  .orderBy(desc(aiVideoKnowledge.qualityScore))
  .limit(100);
```

**Videos Per Query:**
- **Fallback Library:** 20 videos (top quality)
- **Semantic Search:** Up to 50 videos (matched to query)
- **Instructor Search:** Up to 15 videos (by specific instructor)

---

### C. INSTRUCTOR CREDENTIALS

**Database Tables:**
- `instructor_verified_credentials` (Line 6251)
- `adcc_results` (Line 6167)

**Fetch Function:** `server/utils/verified-credentials.ts`
```typescript
const credentialsData = await getCredentialsForInstructors(uniqueInstructors);
const credentialsSection = buildCredentialsSection(credentialsData);
```

**Fields:**
```typescript
- instructorName: text
- instructorNameNormalized: text (unique)
- adccGolds: integer
- adccSilvers: integer
- adccBronzes: integer
- ibjjfWorldGolds: integer
- ibjjfWorldSilvers: integer
- ibjjfWorldBronzes: integer
- blackBeltYear: integer
- lineage: text
- notableAchievements: jsonb
```

**Injection Format:**
```
INSTRUCTOR CREDENTIALS:
{instructorName}: {achievements}
```

**If No Credentials:** Instructor is still referenced, just without credential badges.

---

### D. COMBAT SPORTS NEWS

**Database Table:** `combat_sports_news`  
**Schema Location:** `shared/schema.ts` (Line 3726)

**Fields:**
```typescript
- id: varchar (UUID)
- title: text
- summary: text (AI-generated)
- fullContent: text
- url: text (unique)
- embedding: jsonb (OpenAI embedding)
- source: varchar (reddit/youtube/instagram/website)
- publishedAt: timestamp
- createdAt: timestamp
```

**News Included:** Most recent 3 items

**Sources Scraped:**
- Reddit (r/bjj)
- YouTube
- Instagram
- BJJ websites

**Fetch Function:** Passed via `dynamicContext.newsItems`

**Injection:** (Lines 1125-1142)
```
═══════════════════════════════════════════════════════════════════════════════
RECENT BJJ/COMBAT SPORTS NEWS (YOU HAVE THIS DATA - USE IT!)
═══════════════════════════════════════════════════════════════════════════════

{newsList}
```

---

### E. CONVERSATION HISTORY

**Database Table:** `ai_conversation_learning`  
**Schema Location:** `shared/schema.ts` (Line ~5958)

**Fields:**
```typescript
- userId: varchar
- messageText: text
- messageType: varchar ('user_sent' or 'ai_response')
- createdAt: timestamp
```

**Message Limit:** 20 messages

**Fetch Function:** `server/routes.ts` (Lines 7916-7926)
```typescript
const history = await db.select({
  messageText: aiConversationLearning.messageText,
  messageType: aiConversationLearning.messageType,
  createdAt: aiConversationLearning.createdAt
})
.from(aiConversationLearning)
.where(eq(aiConversationLearning.userId, userId))
.orderBy(desc(aiConversationLearning.createdAt))
.limit(20);
```

**Format Sent to Claude:**
```typescript
const messages = conversationHistory.map(msg => ({
  role: msg.messageType === 'user_sent' ? 'user' : 'assistant',
  content: msg.messageText
}));
```

---

## SECTION 3: THE COMPLETE FLOW

### Message Flow: iOS App → Response

```
1. USER SENDS MESSAGE
   └─► iOS App: client/src/components/mobile-chat.tsx
       └─► handleSend() function

2. API CALL
   └─► POST /api/ai/chat/message/stream
       └─► Headers: Content-Type: application/json
       └─► Body: { userId, message }

3. SERVER HANDLER
   └─► server/routes.ts (Line 7880)
       └─► app.post('/api/ai/chat/message/stream', ...)

4. FUNCTIONS RUN BEFORE CALLING AI:

   4a. LOAD USER PROFILE (Lines 7904-7913)
       └─► db.select().from(bjjUsers).where(eq(bjjUsers.id, userId))

   4b. LOAD CONVERSATION HISTORY (Lines 7916-7927)
       └─► db.select().from(aiConversationLearning)
       └─► Last 20 messages, reversed for chronological order

   4c. SEMANTIC VIDEO SEARCH (Lines 7929-8006)
       └─► import { searchVideos, extractSearchIntent } from './videoSearch'
       └─► searchVideos({ userMessage, conversationContext })
       └─► extractSearchIntent(message)
       └─► extractRequestedInstructor(message)
       └─► searchByInstructor() if specific instructor requested
       └─► Fallback to top-quality videos if no semantic results

5. BUILD SYSTEM PROMPT (Lines 8035-8047)
   └─► buildComprehensiveSystemPrompt(userId, userStruggle)
       └─► Injects user profile, video library, credentials, search context

6. CALL AI MODEL (Lines 8060-8074)
   └─► Model: GPT-4o (streaming endpoint)
   └─► Note: Main authenticated endpoint uses Claude Sonnet 4.5
   
   For authenticated users (Claude Sonnet 4.5):
   └─► server/routes.ts - /api/ai/chat/message (non-streaming)
   └─► Uses Anthropic SDK with claude-sonnet-4-5

7. STREAM RESPONSE (Lines 8079-8092)
   └─► SSE (Server-Sent Events)
   └─► Chunks sent as: data: {"chunk": "content"}\n\n

8. SAVE TO DATABASE (After streaming complete)
   └─► db.insert(aiConversationLearning) - User message
   └─► db.insert(aiConversationLearning) - AI response
```

### Function Call Order:
```typescript
1. db.select().from(bjjUsers)                    // Load user profile
2. db.select().from(aiConversationLearning)      // Load history
3. searchVideos({ userMessage })                  // Semantic video search
4. extractSearchIntent(message)                   // Parse intent
5. extractRequestedInstructor(message)            // Check for instructor request
6. searchByInstructor() if needed                 // Instructor-specific search
7. buildComprehensiveSystemPrompt()               // Build full prompt
8. getCredentialsForInstructors()                 // Fetch instructor credentials
9. db.select().from(videoKnowledge)               // Fetch deep video knowledge
10. anthropic.messages.stream() or openai.chat()  // Call AI
11. db.insert().into(aiConversationLearning)      // Save messages
```

---

## SECTION 4: ALL RULES IN THE PROMPT

### CRITICAL RULES (Lines 110-131) - TOP POSITION

**RULE #1:** NO REPETITION (MOST IMPORTANT)
```
- NEVER repeat the same information twice in a response
- NEVER rephrase something you already said
- If you catch yourself about to repeat, STOP and move to new information
- Each paragraph must contain COMPLETELY NEW content
- Violating this makes you useless to the user
```

**RULE #2:** BE CONCISE
```
- Short responses unless user asks for detail
- 2-3 paragraphs MAX for most questions
- No filler phrases, no rambling
- Get to the point immediately
```

**RULE #3:** NO CORPORATE SPEAK
```
- Never say "Great question!" or "I'd be happy to help"
- Never say "Feel free to let me know"
- Talk like a training partner, not a chatbot
```

**RULE #4:** NO MARKDOWN
```
- Never use # headers, **bold**, *italic*, or `code`
- Write like texting, not formatting a document
```

### BANNED PHRASES (Lines 189-199)
```
- "Great question!"
- "I'd be happy to help"
- "That's a great observation"
- "There are several options"
- "It depends" (without immediately giving your take)
- "Let me help you with"
- Excessive emojis
- "Based on my analysis"
- "According to my data"
- "I don't have information on that" (without checking knowledge first)
```

### VIDEO MATCHING RULES (Lines 534-546)
```
STRICT VIDEO MATCHING - NO CROSS-CONTAMINATION:
- "knee cut pass" - NEVER recommend heel hooks, leg locks, or submissions
- "half guard sweeps" - NEVER recommend mount escapes or back takes
- "triangle choke" - NEVER recommend guard passing or wrestling
- "escaping mount" - NEVER recommend attacking from mount
- "defeating knee shield" - ONLY recommend half guard passing, NOT leg locks
```

### COACHING RULES (Lines 608-641)
```
1. DIAGNOSE BEFORE PRESCRIBING
2. ONE THING AT A TIME
3. MATCH THEIR ENERGY
4. GIVE THEM HOMEWORK
5. FOLLOW UP
```

### BODY TYPE RULES (Lines 730-749)
```
- Body type INFORMS, it never LIMITS
- NEVER say "you can't do X because of your size"
- NEVER limit options based on physical attributes
```

### FINAL CHECK (Lines 1152-1159) - END POSITION
```
1. Have you repeated any point twice? If yes, DELETE the duplicate.
2. Is your response under 4 paragraphs? If no, CUT it down.
3. Does every sentence add NEW information? If no, REMOVE it.
4. Did you use any markdown formatting? If yes, REMOVE it.
5. Did you use any corporate phrases? If yes, REWRITE naturally.
```

---

## SECTION 5: SAMPLE INJECTION TEMPLATE

### What Claude Sees (Simplified Example)

```
═══════════════════════════════════════════════════════════════════════════════
CRITICAL RULES (FOLLOW THESE BEFORE RESPONDING)
═══════════════════════════════════════════════════════════════════════════════

RULE #1 - NO REPETITION (MOST IMPORTANT):
- NEVER repeat the same information twice in a response
[... rules 2-4 ...]

═══════════════════════════════════════════════════════════════════════════════

You are Professor OS - Todd's personal BJJ coach and training partner.

[... Sections 1-5: Identity, Voice, Multi-Instructor, Expertise, Reasoning ...]

═══════════════════════════════════════════════════════════════════════════════
SECTION 6: REMEMBERING Todd
═══════════════════════════════════════════════════════════════════════════════

USER PROFILE:
Name: Todd
Email: todd@example.com
Username: toddbjj

TRAINING PROFILE:
Belt Level: Blue Belt
Training Style: no-gi
Training Frequency: 4 sessions per week
Biggest Struggle: Guard passing

PHYSICAL STATS:
Height: 5'10"
Weight: 175 lbs
Age: 35 years old
Body Type: Athletic

JOURNEY TOGETHER:
Days training together: 127 days
Weeks together: 18 weeks

GOALS: Want to compete at local tournaments. Working on developing a passing game.

INJURIES: ["left shoulder - previous rotator cuff issue"]

[... Sections 7-15: Coaching, Honesty, Debrief, etc. ...]

═══════════════════════════════════════════════════════════════════════════════
FALLBACK VIDEO LIBRARY
═══════════════════════════════════════════════════════════════════════════════

1. Knee Cut Pass System by Gordon Ryan (guard_pass) | 4 sections
2. Pressure Passing Fundamentals by Bernardo Faria (guard_pass) | 3 sections
3. Half Guard Passing by Lachlan Giles (half_guard_pass) | 5 sections
[... 17 more videos ...]

INSTRUCTOR CREDENTIALS:
Gordon Ryan: ADCC 2x Gold (2019, 2022), 5x EBI Champion
Bernardo Faria: IBJJF Worlds 5x Gold, ADCC Silver
Lachlan Giles: ADCC Bronze, Multiple No-Gi World titles

═══════════════════════════════════════════════════════════════════════════════
YOUR KNOWLEDGE RELEVANT TO THIS CONVERSATION
═══════════════════════════════════════════════════════════════════════════════

1. Knee Cut Pass System by Gordon Ryan (guard_pass)
   📍 URL: https://youtube.com/watch?v=xxx
   💬 QUOTE: "The knee cut is about controlling the hip line before you ever start moving"
   💡 TIP: Drive your knee to the mat BEFORE trying to clear the bottom leg
   🎯 SOLVES: Stalling in half guard, can't finish passes
   ⚠️ MISTAKES: Trying to cut without flattening opponent, rushing the pass
   🔗 CHAINS TO: Mount, Back take, Side control attacks

2. [... more dynamic videos ...]

═══════════════════════════════════════════════════════════════════════════════
RECENT BJJ/COMBAT SPORTS NEWS
═══════════════════════════════════════════════════════════════════════════════

- Gordon Ryan announces next superfight: Details on upcoming match
- ADCC 2025 qualifiers begin: Key results from regional events
- New instructional release: Lachlan Giles leg lock series

═══════════════════════════════════════════════════════════════════════════════
FINAL CHECK BEFORE RESPONDING
═══════════════════════════════════════════════════════════════════════════════

Before sending your response, verify:
1. Have you repeated any point twice? If yes, DELETE the duplicate.
2. Is your response under 4 paragraphs? If no, CUT it down.
3. Does every sentence add NEW information? If no, REMOVE it.
4. Did you use any markdown formatting? If yes, REMOVE it.
5. Did you use any corporate phrases? If yes, REWRITE naturally.

SEND ONLY AFTER THIS CHECK PASSES.
```

### Conversation History Format:
```json
[
  {"role": "user", "content": "How do I pass half guard?"},
  {"role": "assistant", "content": "There's a few schools of thought here..."},
  {"role": "user", "content": "What about when they have a strong knee shield?"}
]
```

---

## SECTION 6: IDENTIFIED ISSUES & ARCHITECTURE NOTES

### 1. Rule Positioning (FIXED)
**Current Status:** CORRECT
- Critical rules are now at the TOP (lines 106-131, first ~200 tokens)
- FINAL CHECK is at the END (lines 1145-1159, last ~150 tokens)
- This "sandwich" structure maximizes LLM attention on behavioral rules

### 2. Prompt Length
**Current Size:** ~35,000-45,000 characters (~9,000-12,000 tokens)
- This is appropriate for Claude Sonnet 4.5 (200k context window)
- Video knowledge section adds ~5,000-8,000 tokens when populated
- Well within safe limits

### 3. Duplicate/Conflicting Instructions
**Status:** CLEANED
- Removed duplicate markdown/repetition rules from middle of prompt
- Now references "See CRITICAL RULES at the top" instead
- No conflicting instructions detected

### 4. Architecture Strengths
- **5-Layer Knowledge Embodiment:** AI believes it HAS knowledge, not just accesses it
- **Semantic Video Search:** Matches videos to actual question context
- **Perspective Detection:** Distinguishes TOP vs BOTTOM player intent
- **Instructor-Specific Search:** Honors explicit instructor requests
- **Population Insights:** Learns from aggregate user patterns

### 5. Potential Improvements
- Could add user's recent wins/breakthroughs to context
- Could track homework assignments and follow-up
- Could implement conversation topic threading

---

## APPENDIX: Key Files Reference

| File | Purpose |
|------|---------|
| `server/utils/buildSystemPrompt.ts` | Main system prompt builder |
| `server/routes.ts` | API endpoints, streaming handler |
| `server/videoSearch.ts` | Semantic video search, intent extraction |
| `server/utils/verified-credentials.ts` | Instructor credential lookup |
| `server/utils/knowledge-synthesizer.ts` | Multi-instructor knowledge synthesis |
| `shared/schema.ts` | All database table definitions |
| `client/src/components/mobile-chat.tsx` | iOS chat UI component |
| `client/src/services/api.ts` | API client functions |

---

*This document is auto-generated and reflects the current state of Professor OS 6.0 architecture.*
