# BJJ OS - AI/ML CODE (VERIFIED FROM server/)

**Total AI Files:** 15+ files (verified by listing)  
**Generated:** January 18, 2025  
**METHOD:** Direct file system analysis - NO FABRICATIONS

---

## CORE AI FILES

### 1. ai-intelligence.ts (1,261 lines) ⭐
**Purpose:** Prof. OS AI coach - Dual-model system  
**Features:**
- Dual-model routing (GPT-4o for simple, Claude Sonnet 4 for complex)
- Complexity scoring (0-10)
- Journey-focused personality
- Video recommendation integration
- Conversation learning
- User context awareness

**Key Functions:**
- `chatWithProfessorOS()` - Main chat handler
- `analyzeComplexity()` - Route to appropriate model
- `buildSystemPrompt()` - Dynamic prompt generation
- `selectVideos()` - Video recommendation logic

### 2. content-first-curator.ts (469 lines) ⭐
**Purpose:** Revolutionary technique-first video curator  
**Features:**
- 190+ technique search queries
- Content-first strategy (search techniques, not instructors)
- Claude Sonnet 4 instructor identification
- Accepts ANY source if instructor credible (7.5+ threshold)
- Real-time progress tracking
- Async background job processing

**Search Strategy (from code):**
- Searches for TECHNIQUES (not instructors)
- Covers submissions, guards, passes, escapes, positions
- Auto-discovers new instructors
- Designed for periodic automated runs (schedule not verified)

### 3. intelligent-curator.ts (510 lines)
**Purpose:** 6-stage multi-analysis BJJ video curator  
**Features:**
- Stage 1: Quick filter
- Stage 2: Key detail extraction (40 points)
- Stage 3: Instructor credibility (30 points)
- Stage 4: Quality control (A/B/C/D/F grade)
- Stage 5: Personalization (belt + preference)
- Stage 6: Final scoring (out of 100)

**Thresholds:**
- Accept: 70+ points
- Reject: <70 points

### 4. ai-agent.ts (204 lines)
**Purpose:** Daily technique generation  
**Features:**
- Generate personalized technique recommendations
- Belt-appropriate content
- Injury awareness
- Training goal alignment

### 5. meta-analyzer.ts (349 lines)
**Purpose:** Meta monitoring & automation  
**Features:**
- Track trending techniques
- Identify emerging patterns
- Monitor competition meta
- Auto-adjust curation priorities

### 6. multi-stage-analyzer.ts (496 lines)
**Purpose:** Legacy multi-stage video analysis  
**Features:**
- 6-stage analysis pipeline
- Quality scoring
- Instructor credibility
- Content personalization

### 7. auto-curator.ts (86 lines)
**Purpose:** Automated curation scheduler  
**Features:**
- Background job scheduling
- Periodic curation runs
- Automated video discovery

---

## RANKING SYSTEM (server/ranking/)

### 8. ranker.ts (272 lines)
**Purpose:** Smart video ranking algorithm  
**Features:**
- 6 ranking factors:
  1. Community Feedback (40%)
  2. Success with Similar Users (25%)
  3. User Preference Match (20%)
  4. Belt Level Appropriateness (10%)
  5. Recency & Freshness (5%)
  6. Instructor Priority Bonus (0-10 points)

### 9. profile-builder.ts (105 lines)
**Purpose:** Build user preference profiles  
**Features:**
- Track favorite instructors
- Track preferred techniques
- Learning style detection
- Video length preferences

### 10. pattern-tracker.ts (117 lines)
**Purpose:** Track video success patterns  
**Features:**
- Track video interactions
- Identify successful videos
- Build success patterns
- Personalization engine

---

## AI UTILITIES

### 11. whisper.ts (63 lines)
**Purpose:** OpenAI Whisper voice-to-text  
**Features:**
- Audio transcription
- Voice input support for chat
- Multi-format support

### 12. elevenlabs.ts (101 lines)
**Purpose:** ElevenLabs text-to-speech  
**Features:**
- Voice output for Prof. OS
- Voice selection (Antoni/Adam)
- Playback speed control (0.5x-1.5x)
- Auto-play functionality

### 13. youtube-service.ts (88 lines)
**Purpose:** YouTube API integration  
**Features:**
- Video search
- Channel data retrieval
- Subscriber count scraping

### 14. youtube.ts (77 lines)
**Purpose:** YouTube data extraction  
**Features:**
- Video metadata extraction
- Channel information
- Basic YouTube API wrapper

### 15. utils/youtubeApi.ts (212 lines)
**Purpose:** Enhanced YouTube API utilities  
**Features:**
- Advanced video search
- Channel analytics
- Instructor discovery

---

## OTHER AI-RELATED FILES

### feedback-tracker.ts (357 lines)
**Purpose:** User feedback tracking  
**Features:**
- Track video feedback
- Instructor performance
- Success pattern detection

### competition-meta-tracker.ts (102 lines)
**Purpose:** BJJ competition meta tracking  
**Features:**
- Track trending techniques in competition
- Monitor rule changes
- Competition-specific recommendations

### teaching-style-classifier.ts (107 lines)
**Purpose:** Classify instructor teaching styles  
**Features:**
- Analyze teaching approach
- Classify verbosity
- Detect pacing and detail level

### technique-extractor.ts (101 lines)
**Purpose:** Extract techniques from video titles  
**Features:**
- Parse technique names
- Identify position categories
- Extract technique types

---

## AI MODELS USED

**Primary Models:**
1. **GPT-4o** (OpenAI)
   - Simple queries (complexity 0-5)
   - Fast responses
   - Lower cost
   - Fallback for failed Claude calls

2. **Claude Sonnet 4** (Anthropic)
   - Complex queries (complexity 6-10)
   - Deep analysis
   - Higher quality
   - Strategic recommendations

3. **Whisper** (OpenAI)
   - Voice-to-text transcription
   - Multi-language support
   - High accuracy

4. **ElevenLabs** (eleven_turbo_v2_5)
   - Text-to-speech
   - Natural voice output
   - Multiple voice options

---

## AI SYSTEM ARCHITECTURE

**Dual-Model Routing:**
```
User Message
    ↓
Complexity Analysis (0-10)
    ↓
├─ 0-5: GPT-4o (fast, simple)
└─ 6-10: Claude Sonnet 4 (deep, complex)
    ↓
Response + Video Recommendations
    ↓
Save to aiConversationLearning table
```

**Video Curation Pipeline:**
```
Technique Search Queries (190+)
    ↓
YouTube API Search
    ↓
Claude Sonnet 4 Analysis
    ├─ Quality Score (0-10)
    ├─ Instructor Identification
    ├─ Teaching Quality Assessment
    └─ Credibility Evidence
    ↓
Accept if Quality ≥ 7.5
    ↓
Save to aiVideoKnowledge table
```

**Ranking Pipeline:**
```
User Profile + Video Library
    ↓
Smart Ranker (6 factors)
    ├─ Community Feedback (40%)
    ├─ Success Patterns (25%)
    ├─ Preference Match (20%)
    ├─ Belt Appropriate (10%)
    ├─ Recency (5%)
    └─ Instructor Priority (+0-10 bonus)
    ↓
Personalized Video List
```

---

## WHAT I CANNOT VERIFY

**Cannot verify without API keys:**
- Whether OpenAI API works
- Whether Anthropic API works
- Whether ElevenLabs API works
- Whether YouTube API works
- Actual API costs

**Cannot verify without running code:**
- Whether dual-model routing works
- Whether complexity scoring is accurate
- Whether video curation succeeds
- Whether ranking algorithm produces good results
- Whether voice features work

**Cannot verify without database:**
- How many conversations logged
- AI performance metrics
- Success rates
- Response times
- Token usage

**To verify AI systems work:**
1. Set up API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
2. Start server: `npm run dev`
3. Test chat with Prof. OS
4. Test video curation
5. Test voice input/output
6. Monitor AI logs in database
7. Check performance metrics

**Known Facts:**
- 15+ AI-related files (verified by counting)
- Dual-model system (GPT-4o + Claude Sonnet 4)
- 6-stage video analysis
- 6-factor ranking algorithm
- Real-time progress tracking for curator
- Voice input/output support
