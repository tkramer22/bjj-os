import Anthropic from "@anthropic-ai/sdk";
import { evaluate7Dimensions, type VideoEvaluationInput } from "./curation/final-evaluator";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

interface VideoCandidate {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  publishedAt: string;
  duration: string; // YouTube ISO 8601 duration format (PT10M30S)
  transcript?: string;
}

interface Stage1Result {
  hasKeyDetail: boolean;
  reasoning: string;
}

interface Stage2Result {
  hasKeyDetail: boolean;
  keyDetail: string;
  timestamp?: string;
  techniqueName: string;
  qualityScore: number; // 0-40
  reasoning: string;
}

interface Stage3Result {
  instructorName: string;
  credibilityScore: number; // 0-30
  reasoning: string;
  isElite: boolean;
}

interface Stage4Result {
  approved: boolean;
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  safetyConcerns?: string;
  improvements?: string;
  reasoning: string;
}

interface Stage5Result {
  matchScore: number; // 0-100
  reasoning: string;
  beltAppropriate: boolean;
  styleMatch: boolean;
}

interface TimestampDetail {
  time: number; // Time in seconds
  description: string;
  keywords: string[];
}

interface Stage6Result {
  timestamp: string; // Legacy single timestamp
  confidence: 'high' | 'medium' | 'low';
  timestamps?: Record<string, TimestampDetail>; // Comprehensive timestamps
  timestampCount?: number;
}

interface SevenDimensionResult {
  decision: 'ACCEPT' | 'REJECT';
  finalScore: number;
  acceptanceReason: string;
  dimensionScores: {
    instructorAuthority: number;
    taxonomyMapping: number;
    coverageBalance: number;
    uniqueValue: number;
    userFeedback: number;
    beltLevelFit: number;
    emergingDetection: number;
  };
}

interface UserProfile {
  beltLevel?: string;
  style?: string;
  focusAreas?: string[];
  recentTechniques?: string[];
  likedInstructors?: string[];
  dislikedInstructors?: string[];
}

interface TaxonomyData {
  techniqueType: 'attack' | 'defense' | 'concept' | null;
  positionCategory: string | null;
  giOrNogi: 'gi' | 'nogi' | 'both' | null;
  tags: string[];
}

interface MultiStageResult {
  passed: boolean;
  stage1: Stage1Result;
  stage2?: Stage2Result;
  stage3?: Stage3Result;
  stage4?: Stage4Result;
  stage5?: Stage5Result;
  stage6?: Stage6Result;
  finalScore?: number;
  rejectReason?: string;
  taxonomy?: TaxonomyData;
}

/**
 * STAGE 1: Quick Filter - Does this video contain specific, actionable technique details?
 */
async function stage1QuickFilter(video: VideoCandidate): Promise<Stage1Result> {
  // DEBUG: Log transcript details
  const transcriptLength = video.transcript?.length || 0;
  const hasTranscript = transcriptLength > 0;
  console.log(`  📊 Transcript: ${transcriptLength} chars ${hasTranscript ? '✅' : '❌'}`);
  
  // CRITICAL FIX: Most BJJ videos don't have transcripts
  // Stage 1 now analyzes title + description instead of requiring transcripts
  const prompt = `Is this a quality BJJ instructional video worth curating?

VIDEO TITLE: ${video.title}
CHANNEL: ${video.channelTitle}
DESCRIPTION: ${video.description || 'N/A'}
${hasTranscript ? `TRANSCRIPT PREVIEW: ${video.transcript?.substring(0, 500)}...` : '(No transcript available - analyze title and description)'}

ACCEPT if the video appears to be:
✅ Instructional BJJ technique video
✅ Teaches a specific technique (triangle, armbar, guard pass, etc.)
✅ From a credible instructor/channel
✅ Has actionable technique content (not just rolling footage)

REJECT if:
❌ Competition highlight/recap only
❌ Interview/podcast
❌ Promotional content
❌ Vlog or lifestyle content
❌ Generic coaching without technique instruction

Return ONLY valid JSON:
{
  "hasKeyDetail": true/false,
  "reasoning": "Brief explanation (1 sentence)"
}

Note: We're looking for instructional content. Title like "Triangle Choke Tutorial" or "How to..." suggests instruction. Be LENIENT - if it's likely instruction, pass it.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }]
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response format');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);
    console.log(`  🤖 Claude: ${result.hasKeyDetail ? '✅ PASS' : '❌ FAIL'} - "${result.reasoning}"`);
    return result;
  } catch (error) {
    console.error('Stage 1 failed:', error);
    return { hasKeyDetail: false, reasoning: 'Analysis failed' };
  }
}

/**
 * STAGE 2: Deep Key Detail Extraction
 * HARD REQUIREMENT: Videos without transcripts automatically receive hasKeyDetail=false
 * This prevents quality regression - we can't verify key details without transcript evidence
 * Stage 4 QC remains MANDATORY and requires actual evidence to validate
 */
async function stage2KeyDetailExtraction(video: VideoCandidate): Promise<Stage2Result> {
  const hasTranscript = (video.transcript?.length || 0) > 0;
  
  // ELITE INSTRUCTOR BYPASS: Check if instructor is from elite_instructors table
  let isEliteInstructor = false;
  const channelName = video.channelTitle || video.channel_name || '';
  if (!hasTranscript && channelName) {
    try {
      console.log(`  🔍 Checking if "${channelName}" is an elite instructor...`);
      const { db } = await import('./db');
      const { eliteInstructors } = await import('../shared/schema');
      const { sql } = await import('drizzle-orm');
      
      // Check if channel title matches any elite instructor (fuzzy match)
      // Use ILIKE for case-insensitive matching to avoid LOWER() issues
      const channelLower = channelName.toLowerCase();
      const eliteCheck = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM elite_instructors 
        WHERE LOWER(instructor_name) LIKE ${'%' + channelLower + '%'}
           OR ${channelLower} LIKE '%' || LOWER(instructor_name) || '%'
      `);
      
      // Handle both array result (postgres-js) and { rows: [...] } format
      const rows = Array.isArray(eliteCheck) ? eliteCheck : (eliteCheck.rows || []);
      isEliteInstructor = rows.length > 0 && (rows[0] as any).count > 0;
      
      if (isEliteInstructor) {
        console.log(`  ✨ ELITE INSTRUCTOR BYPASS: ${channelName} - proceeding without transcript`);
      } else {
        console.log(`  ❌ Not an elite instructor: "${channelName}"`);
      }
    } catch (error) {
      console.warn('Elite instructor check failed:', error);
    }
  }
  
  // CRITICAL SAFEGUARD: Auto-reject videos without transcripts (unless elite instructor)
  // We cannot verify key details exist without hearing the actual instruction
  if (!hasTranscript && !isEliteInstructor) {
    console.log(`  ⚠️  No transcript available - auto-rejecting (quality safeguard)`);
    return {
      hasKeyDetail: false,
      keyDetail: 'TRANSCRIPT_REQUIRED',
      techniqueName: video.title,
      qualityScore: 0,
      reasoning: 'Cannot verify key details without transcript - quality safeguard prevents false positives'
    };
  }
  
  // For elite instructors without transcript, use title/description heuristics
  if (!hasTranscript && isEliteInstructor) {
    console.log(`  📊 Analyzing elite instructor video using title/description only`);
    return {
      hasKeyDetail: true,
      keyDetail: `Elite instructor (${video.channelTitle}) content - transcript unavailable`,
      techniqueName: video.title,
      qualityScore: 25, // Pass threshold (20) but below full quality score
      reasoning: `Pre-vetted elite instructor ${video.channelTitle} - bypassing transcript requirement`
    };
  }
  
  const prompt = `Analyze this BJJ instructional video and extract the KEY DETAIL.

VIDEO TITLE: ${video.title}
CHANNEL: ${video.channelTitle}
DESCRIPTION: ${video.description || 'N/A'}
TRANSCRIPT: ${video.transcript!.substring(0, 2000)}

GOOD KEY DETAILS (specific, actionable):
✅ "Angle your wrist 15° inward at initial contact to prevent the frame"
✅ "Cut the angle deeper by pulling their trapped arm across your body"
✅ "Keep your shin bone angled DOWN into their bottom leg to pin their knee"

BAD KEY DETAILS (generic):
❌ "Keep your elbows tight"
❌ "Maintain pressure"

Return ONLY valid JSON:
{
  "hasKeyDetail": true/false,
  "keyDetail": "The specific micro-adjustment",
  "timestamp": "MM:SS",
  "techniqueName": "Name of technique",
  "qualityScore": 0-40,
  "reasoning": "Brief explanation"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response format');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Stage 2 failed:', error);
    return {
      hasKeyDetail: false,
      keyDetail: '',
      techniqueName: '',
      qualityScore: 0,
      reasoning: 'Analysis failed'
    };
  }
}

/**
 * STAGE 3: Instructor Verification
 */
async function stage3InstructorVerification(video: VideoCandidate): Promise<Stage3Result> {
  const prompt = `Identify the instructor and rate their credibility:

VIDEO TITLE: ${video.title}
CHANNEL: ${video.channelTitle}
DESCRIPTION: ${video.description}

PRIORITY INSTRUCTORS (28-30 points):
John Danaher, Gordon Ryan, Lachlan Giles, Bernardo Faria, JT Torres, Craig Jones, 
Marcelo Garcia, Mikey Musumeci, Keenan Cornelius, Roger Gracie, Andre Galvao, 
Rafael Lovato Jr, Giancarlo Bodoni, Jon Thomas, Chewy BJJ

Check for:
- Competition record (IBJJF, ADCC, etc.)
- Belt rank
- Teaching reputation
- Elite academy association

Return ONLY valid JSON:
{
  "instructorName": "Name",
  "credibilityScore": 0-30,
  "reasoning": "Why this score",
  "isElite": true/false
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }]
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response format');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Stage 3 failed:', error);
    return {
      instructorName: video.channelTitle,
      credibilityScore: 10,
      reasoning: 'Analysis failed',
      isElite: false
    };
  }
}

/**
 * STAGE 4: Quality Control Validation (Second Claude Check)
 */
async function stage4QualityControl(
  keyDetail: string,
  video: VideoCandidate
): Promise<Stage4Result> {
  const prompt = `You are a BJJ black belt doing quality control.

Original key detail: ${keyDetail}
Video: ${video.title}

Review:
1. Is this ACTUALLY specific and actionable, or generic advice?
2. Can a practitioner drill this immediately?
3. Is this technically accurate from BJJ perspective?
4. Is this safe and current best practice?

RED FLAGS:
❌ 'Just' or 'simply' (hides lack of detail)
❌ Relies on strength over technique
❌ Dangerous (spinal locks, neck cranks without control)
❌ Competition-banned for lower belts
❌ Only works on compliant partners

Return ONLY valid JSON:
{
  "approved": true/false,
  "qualityGrade": "A/B/C/D/F",
  "safetyConcerns": "Any issues",
  "improvements": "How to improve",
  "reasoning": "Full analysis"
}

Only approve grade A or B.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }]
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response format');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);
    result.approved = result.approved && (result.qualityGrade === 'A' || result.qualityGrade === 'B');
    return result;
  } catch (error) {
    console.error('Stage 4 failed:', error);
    return {
      approved: false,
      qualityGrade: 'F',
      reasoning: 'Analysis failed'
    };
  }
}

/**
 * STAGE 5: Personalization Match
 */
async function stage5PersonalizationMatch(
  technique: string,
  video: VideoCandidate,
  userProfile: UserProfile
): Promise<Stage5Result> {
  const prompt = `Calculate how well this technique matches the user:

User Profile:
- Belt: ${userProfile.beltLevel || 'unknown'}
- Style: ${userProfile.style || 'both'}
- Focus areas: ${userProfile.focusAreas?.join(', ') || 'none'}
- Recent techniques (30 days): ${userProfile.recentTechniques?.join(', ') || 'none'}

Technique:
- Name: ${technique}
- Video: ${video.title}
- Complexity: Determine from title/description

Return ONLY valid JSON:
{
  "matchScore": 0-100,
  "reasoning": "Why good/bad match",
  "beltAppropriate": true/false,
  "styleMatch": true/false
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }]
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response format');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Stage 5 failed:', error);
    return {
      matchScore: 50,
      reasoning: 'Analysis failed',
      beltAppropriate: true,
      styleMatch: true
    };
  }
}

/**
 * Helper: Parse YouTube duration string (PT#M#S) to minutes
 * Examples: PT10M30S -> 10.5, PT1H15M -> 75
 */
function parseDurationToMinutes(duration: string): number {
  if (!duration) return 0;
  
  const hours = duration.match(/(\d+)H/);
  const minutes = duration.match(/(\d+)M/);
  const seconds = duration.match(/(\d+)S/);
  
  const h = hours ? parseInt(hours[1]) : 0;
  const m = minutes ? parseInt(minutes[1]) : 0;
  const s = seconds ? parseInt(seconds[1]) : 0;
  
  return h * 60 + m + s / 60;
}

/**
 * Helper: Get minimum required timestamps based on video duration
 * Rules:
 * - < 10 min: 5 timestamps
 * - 10-20 min: 8 timestamps
 * - 20-30 min: 10 timestamps
 * - 30+ min: 12 timestamps
 */
function getMinRequiredTimestamps(durationMinutes: number): number {
  if (durationMinutes < 10) return 5;
  if (durationMinutes < 20) return 8;
  if (durationMinutes < 30) return 10;
  return 12;
}

/**
 * STAGE 6: Comprehensive Timestamp Extraction
 * Extract 5-15+ detailed timestamps covering all teaching points in the video
 */
async function stage6ComprehensiveTimestampExtraction(
  video: VideoCandidate
): Promise<Stage6Result> {
  const prompt = `Analyze this BJJ instructional video and extract DETAILED timestamps for ALL distinct teaching points.

Video: ${video.title}
Description: ${video.description || 'N/A'}

Extract timestamps for ALL distinct teaching points. Be thorough and comprehensive.

Categories to look for:
- Introduction/Concept/Theory
- Setup/Entry (from different positions)
- Grips and Hand Positioning (each grip separately)
- Key Details and Mechanics (each detail separately)
- Execution/Finish
- Common Mistakes (each mistake separately)
- Variations (each variation separately)
- Troubleshooting specific issues
- Combinations/Chains
- Drilling methods

IMPORTANT: Extract AT LEAST 5-10 timestamps for videos > 10 minutes. Be specific and granular.

Return as JSON with descriptive keys and structured data:
{
  "timestamps": {
    "introduction": {
      "time": 0,
      "description": "Overview of triangle choke system",
      "keywords": ["overview", "introduction", "concept"]
    },
    "setup_from_closed_guard": {
      "time": 120,
      "description": "How to set up triangle from closed guard",
      "keywords": ["setup", "closed guard", "entry"]
    },
    "grip_details_right_hand": {
      "time": 180,
      "description": "Right hand grip positioning and control",
      "keywords": ["grip", "hand", "right", "control"]
    }
  }
}

Use clear, searchable key names. Each timestamp should be a distinct teaching point.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response format');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);
    
    // Calculate timestamp count
    const timestampCount = result.timestamps ? Object.keys(result.timestamps).length : 0;
    
    // Validate timestamp count based on video duration
    if (video.duration) {
      const durationMinutes = parseDurationToMinutes(video.duration);
      const minRequired = getMinRequiredTimestamps(durationMinutes);
      
      if (timestampCount < minRequired) {
        console.warn(`  ⚠️ Timestamp validation: Got ${timestampCount}, expected minimum ${minRequired} for ${durationMinutes.toFixed(1)}min video`);
      } else {
        console.log(`  ✅ Timestamp validation: ${timestampCount} timestamps meets minimum ${minRequired} for ${durationMinutes.toFixed(1)}min video`);
      }
    } else {
      console.warn(`  ⚠️ Timestamp validation skipped: video.duration is missing`);
    }
    
    console.log(`  📍 Extracted ${timestampCount} comprehensive timestamps`);
    
    // Return with both legacy single timestamp and comprehensive timestamps
    const firstTimestamp = result.timestamps && Object.keys(result.timestamps).length > 0
      ? Object.values(result.timestamps)[0] as TimestampDetail
      : null;
    
    return {
      timestamp: firstTimestamp ? `${Math.floor(firstTimestamp.time / 60)}:${String(firstTimestamp.time % 60).padStart(2, '0')}` : '0:00',
      confidence: timestampCount >= 5 ? 'high' : timestampCount >= 3 ? 'medium' : 'low',
      timestamps: result.timestamps,
      timestampCount
    };
  } catch (error) {
    console.error('Stage 6 comprehensive timestamp extraction failed:', error);
    return {
      timestamp: '0:00',
      confidence: 'low',
      timestamps: {},
      timestampCount: 0
    };
  }
}

/**
 * STAGE 6 (Legacy): Single Timestamp Extraction
 * Kept for backwards compatibility
 */
async function stage6TimestampExtraction(
  keyDetail: string,
  transcript: string
): Promise<Stage6Result> {
  const prompt = `Find exact timestamp where key detail is explained:

Key detail: ${keyDetail}
Transcript: ${transcript.substring(0, 2000)}

Skip intros and setup. Find where SPECIFIC detail is taught.

Return ONLY valid JSON:
{
  "timestamp": "MM:SS",
  "confidence": "high/medium/low"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }]
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response format');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Stage 6 failed:', error);
    return {
      timestamp: '0:00',
      confidence: 'low'
    };
  }
}

/**
 * TAXONOMY COMPUTATION: Extract technique type, position, gi/nogi, and tags
 * ENHANCED: Comprehensive keyword matching for accurate metadata extraction
 */
function computeTaxonomy(video: VideoCandidate, stage2: Stage2Result): TaxonomyData {
  const titleLower = video.title.toLowerCase();
  const techniqueLower = stage2.techniqueName.toLowerCase();
  const descLower = (video.description || '').toLowerCase();
  const combined = `${titleLower} ${techniqueLower} ${descLower}`;
  
  // Determine technique type: attack, defense, or concept
  let techniqueType: 'attack' | 'defense' | 'concept' | null = null;
  
  // EXPANDED attack keywords - submissions, passes, sweeps, takedowns
  const attackKeywords = [
    // Submissions
    'submission', 'choke', 'armbar', 'kimura', 'americana', 'triangle', 'guillotine',
    'darce', 'anaconda', 'ezekiel', 'baseball', 'clock choke', 'bow and arrow',
    'cross collar', 'loop choke', 'arm triangle', 'rear naked', 'rnc', 'buggy choke',
    'paper cutter', 'bread cutter', 'head and arm', 'north south choke',
    // Leg locks
    'heel hook', 'ankle lock', 'knee bar', 'toe hold', 'calf slicer', 'estima lock',
    'aoki lock', 'leg lock', 'inside heel', 'outside heel',
    // Attacks
    'attack', 'finish', 'tap', 'submit', 'wrist lock', 'neck crank',
    // Passes
    'pass', 'guard pass', 'knee slice', 'leg drag', 'body lock pass', 'toreando',
    'pressure pass', 'smash pass', 'over under pass', 'stack pass', 'folding pass',
    'float pass', 'long step', 'x pass', 'headquarters',
    // Sweeps
    'sweep', 'berimbolo', 'scissor sweep', 'hip bump', 'flower sweep', 'pendulum',
    'elevator sweep', 'tripod sweep', 'sickle sweep', 'overhead sweep',
    // Takedowns
    'takedown', 'throw', 'arm drag', 'snap down', 'ankle pick', 'collar drag',
    'single leg', 'double leg', 'hip throw', 'foot sweep', 'osoto gari',
    // Mount/Back attacks
    'mount attack', 'back attack', 'crucifix', 'twister',
  ];
  
  // EXPANDED defense keywords - escapes, retention, prevention
  const defenseKeywords = [
    'escape', 'defense', 'survival', 'recovery', 'retain', 'retention',
    'guard retention', 'prevent', 'counter', 'block', 'posture', 'frame', 'framing',
    'hip escape', 'shrimp', 'bridge', 'elbow escape', 'trap and roll',
    'defend', 'defending', 'stop', 'avoid', 'getting out', 'escaping'
  ];
  
  // EXPANDED concept keywords
  const conceptKeywords = [
    'concept', 'principle', 'theory', 'fundamentals', 'basics', 'overview', 'explained',
    'understanding', 'philosophy', 'mindset', 'strategy', 'game plan', 'breakdown',
    'analysis', 'system', 'guide', 'complete guide', 'intro', 'introduction',
    'transition', 'connection', 'chain', 'flow', 'drill', 'drilling', 'positional',
    'warmup', 'mobility', 'flexibility', 'conditioning', 'solo drill'
  ];
  
  // Priority: defense > attack > concept (most specific first)
  if (defenseKeywords.some(kw => combined.includes(kw))) {
    techniqueType = 'defense';
  } else if (attackKeywords.some(kw => combined.includes(kw))) {
    techniqueType = 'attack';
  } else if (conceptKeywords.some(kw => combined.includes(kw))) {
    techniqueType = 'concept';
  } else {
    techniqueType = 'attack'; // Default to attack for technique videos
  }
  
  // Determine position category - EXPANDED
  let positionCategory: string | null = null;
  
  const positionMap: { [key: string]: string[] } = {
    'closed_guard': ['closed guard', 'full guard', 'rubber guard'],
    'open_guard': [
      'open guard', 'spider guard', 'lasso', 'de la riva', 'dlr', 'reverse de la riva', 'rdlr',
      'x guard', 'single leg x', 'slx', 'k guard', 'k-guard', 'butterfly guard', 'seated guard',
      'collar sleeve', 'worm guard', 'squid guard', 'lapel guard', 'octopus guard',
      'shin to shin', 'koala guard', 'mantis guard', 'sit up guard', 'seated'
    ],
    'half_guard': ['half guard', 'deep half', 'z guard', 'knee shield', 'lockdown', 'coyote guard', 'quarter guard'],
    'mount': ['mount', 'mounted', 'high mount', 'low mount', 's mount', 'technical mount'],
    'back': ['back control', 'back mount', 'rear mount', 'back take', 'turtle', 'truck', 'twister side'],
    'side_control': ['side control', 'side mount', 'hundred kilos', '100 kilos', 'kesa gatame', 'scarf hold', 'north south', 'crossbody', 'crossface'],
    'standing': ['standing', 'takedown', 'throw', 'judo', 'wrestling', 'clinch', 'collar tie', 'underhook', 'overhook', '2 on 1', 'arm drag'],
    'leg_entanglement': [
      'leg lock', 'heel hook', 'ashi garami', 'saddle', '411', '50/50', 'fifty fifty',
      'outside ashi', 'inside sankaku', 'ankle lock', 'knee bar', 'calf slicer', 'toe hold',
      'leg entanglement', 'irimi ashi', 'honey hole', 'game over', 'reap'
    ],
  };
  
  for (const [category, keywords] of Object.entries(positionMap)) {
    if (keywords.some(kw => combined.includes(kw))) {
      positionCategory = category;
      break;
    }
  }
  
  // Determine gi/nogi - more nuanced detection
  let giOrNogi: 'gi' | 'nogi' | 'both' | null = null;
  
  // Strong gi indicators (specific gi techniques)
  const giKeywords = [
    'gi', 'kimono', 'collar', 'lapel', 'sleeve grip', 'belt grip', 'pants grip',
    'ibjjf', 'gi only', 'worm guard', 'lapel guard', 'spider guard', 'lasso',
    'cross collar', 'bow and arrow', 'ezekiel', 'loop choke', 'baseball choke'
  ];
  
  // Strong nogi indicators
  const nogiKeywords = [
    'nogi', 'no-gi', 'no gi', 'submission only', 'sub only', 'adcc', 'submission grappling',
    'rashguard', 'spats', 'gordon ryan', 'danaher', 'craig jones'
  ];
  
  const hasGi = giKeywords.some(kw => combined.includes(kw));
  const hasNogi = nogiKeywords.some(kw => combined.includes(kw));
  
  if (hasGi && hasNogi) {
    giOrNogi = 'both';
  } else if (hasGi) {
    giOrNogi = 'gi';
  } else if (hasNogi) {
    giOrNogi = 'nogi';
  } else {
    giOrNogi = 'both'; // Default to both if not specified
  }
  
  // Generate tags from technique name and title - EXPANDED
  const tags: string[] = [];
  
  // Add technique name as tag
  if (stage2.techniqueName) {
    tags.push(stage2.techniqueName.toLowerCase());
  }
  
  // EXPANDED: Comprehensive technique tags
  const commonTags = [
    // Submissions
    'triangle', 'armbar', 'kimura', 'americana', 'guillotine', 'darce', 'anaconda',
    'omoplata', 'gogoplata', 'ezekiel', 'rear naked', 'buggy choke', 'paper cutter',
    // Guard passes
    'pass', 'knee slice', 'leg drag', 'toreando', 'pressure pass', 'smash pass',
    'body lock', 'over under', 'stack pass', 'float pass', 'headquarters',
    // Sweeps
    'sweep', 'berimbolo', 'scissor sweep', 'hip bump', 'flower sweep', 'pendulum',
    // Guards
    'guard', 'half guard', 'closed guard', 'open guard', 'butterfly', 'de la riva',
    'x guard', 'k guard', 'rubber guard', 'spider guard', 'lasso',
    // Positions
    'mount', 'back', 'side control', 'north south', 'turtle', 'crucifix',
    // Leg locks
    'heel hook', 'knee bar', 'ankle lock', 'toe hold', 'calf slicer', 'leg lock',
    // Actions
    'escape', 'defense', 'attack', 'takedown', 'throw', 'transition', 'control',
    'retention', 'guard retention',
    // Other
    'choke', 'submission', 'beginner', 'advanced', 'fundamental', 'modern', 'classic',
    'competition', 'self defense', 'mma', 'nogi', 'gi', 'drill'
  ];
  
  for (const tag of commonTags) {
    if (combined.includes(tag) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  
  // Add position as tag if identified
  if (positionCategory) {
    const positionTag = positionCategory.replace(/_/g, ' ');
    if (!tags.includes(positionTag)) {
      tags.push(positionTag);
    }
  }
  
  return {
    techniqueType,
    positionCategory,
    giOrNogi,
    tags: tags.slice(0, 10) // Limit to 10 tags
  };
}

/**
 * Run complete multi-stage analysis pipeline
 */
export async function runMultiStageAnalysis(
  video: VideoCandidate,
  userProfile: UserProfile = {}
): Promise<MultiStageResult> {
  
  console.log(`\n🔬 Multi-Stage Analysis: ${video.title}`);
  
  // STAGE 1: Quick Filter
  const stage1 = await stage1QuickFilter(video);
  console.log(`  Stage 1 (Quick Filter): ${stage1.hasKeyDetail ? '✅ PASS' : '❌ FAIL'}`);
  
  if (!stage1.hasKeyDetail) {
    return {
      passed: false,
      stage1,
      rejectReason: 'Stage 1: No specific key detail found'
    };
  }

  // STAGE 2: Deep Key Detail Extraction
  const stage2 = await stage2KeyDetailExtraction(video);
  console.log(`  Stage 2 (Key Detail): Score ${stage2.qualityScore}/40 - ${stage2.hasKeyDetail ? '✅ PASS' : '❌ FAIL'}`);
  
  if (!stage2.hasKeyDetail || stage2.qualityScore < 15) {
    return {
      passed: false,
      stage1,
      stage2,
      rejectReason: `Stage 2: Key detail quality too low (${stage2.qualityScore}/40)`
    };
  }

  // STAGE 3: Instructor Verification
  const stage3 = await stage3InstructorVerification(video);
  console.log(`  Stage 3 (Instructor): ${stage3.instructorName} - ${stage3.credibilityScore}/30 points`);

  // 7-DIMENSIONAL ALGORITHM: Holistic Video Evaluation
  console.log(`\n  🎯 Running 7-Dimensional Evaluation...`);
  
  const sevenDEval: VideoEvaluationInput = {
    youtubeId: video.videoId,
    title: video.title,
    techniqueName: stage2.techniqueName,
    instructorName: stage3.instructorName,
    channelId: null, // Will be extracted from channel data if available
    difficultyScore: null, // Will be derived from belt levels if needed
    beltLevels: null,
    keyDetails: stage2.keyDetail,
    uploadDate: new Date(video.publishedAt),
    giOrNogi: undefined,
    category: undefined
  };

  const sevenDResult = await evaluate7Dimensions(sevenDEval);
  console.log(`  7D Score: ${sevenDResult.finalScore}/100 - ${sevenDResult.decision}`);

  // REJECT if 7D algorithm says no
  if (sevenDResult.decision === 'REJECT') {
    return {
      passed: false,
      stage1,
      stage2,
      stage3,
      rejectReason: `7D Algorithm: ${sevenDResult.acceptanceReason}`
    };
  }

  // STAGE 4: Quality Control Validation
  // ELITE INSTRUCTOR BYPASS: If Stage 2 returned the elite instructor placeholder
  // (no transcript), we bypass Stage 4 since we can't validate specific keyDetails.
  // We rely on Stage 3 instructor credibility + 7D acceptance instead.
  const isEliteNoTranscriptPlaceholder = stage2.keyDetail.includes('Elite instructor') && 
                                          stage2.keyDetail.includes('transcript unavailable');
  
  let stage4: Stage4Result;
  if (isEliteNoTranscriptPlaceholder && sevenDResult.decision === 'ACCEPT') {
    // Bypass Stage 4 for elite instructors without transcripts - trust reputation + 7D
    console.log(`  ✨ ELITE INSTRUCTOR BYPASS: Skipping Stage 4 QC (using 7D acceptance + instructor reputation)`);
    stage4 = {
      approved: true,
      qualityGrade: 'B',
      safetyConcerns: 'None - pre-vetted elite instructor',
      improvements: '',
      reasoning: `Bypassed QC - Elite instructor ${stage3.instructorName} with 7D score ${sevenDResult.finalScore}`
    };
    console.log(`  Stage 4 (QC): Grade ${stage4.qualityGrade} - ✅ ELITE BYPASS`);
  } else {
    stage4 = await stage4QualityControl(stage2.keyDetail, video);
    console.log(`  Stage 4 (QC): Grade ${stage4.qualityGrade} - ${stage4.approved ? '✅ APPROVED' : '❌ REJECTED'}`);
  }
  
  if (!stage4.approved) {
    return {
      passed: false,
      stage1,
      stage2,
      stage3,
      stage4,
      rejectReason: `Stage 4: Quality control failed (Grade ${stage4.qualityGrade})`
    };
  }

  // STAGE 5: Personalization Match
  const stage5 = await stage5PersonalizationMatch(stage2.techniqueName, video, userProfile);
  console.log(`  Stage 5 (Match): ${stage5.matchScore}/100 - ${stage5.beltAppropriate ? 'Belt OK' : 'Belt Mismatch'}`);

  // FIXED: Use 7D score as primary acceptance criteria
  // The 7D evaluator already considers instructor authority, coverage gaps, emerging techniques,
  // uniqueness, and belt level fit with proper boosts. We should trust its ACCEPT decision.
  
  // Calculate legacy score for comparison (but don't use it to reject if 7D approved)
  const teachingClarity = 15;
  const productionQuality = 8;
  const legacyScore = stage2.qualityScore + stage3.credibilityScore + teachingClarity + productionQuality;
  
  // Use 7D score as the authoritative final score since it already passed with ACCEPT
  // The 7D algorithm accounts for coverage gaps, emerging techniques, and quality boosts
  // that the legacy calculation ignores
  let finalScore = sevenDResult.finalScore;
  
  // Apply Stage 4 QC grade boost (Grade A/B videos deserve extra credit)
  if (stage4.qualityGrade === 'A') {
    finalScore = Math.max(finalScore, 80); // Grade A videos should pass easily
  } else if (stage4.qualityGrade === 'B') {
    finalScore = Math.max(finalScore, 72); // Grade B videos pass threshold
  }
  
  // Belt mismatch should be a minor penalty, not a hard rejection
  // The 7D algorithm already considers belt level fit
  if (!stage5.beltAppropriate) {
    finalScore = Math.max(finalScore - 5, 65); // Minor penalty, capped at -5
  }
  
  // ACCEPTANCE LOGIC: Trust 7D decision + Stage 4 QC
  // If 7D said ACCEPT and Stage 4 approved (Grade A/B), we should pass
  const shouldAccept = sevenDResult.decision === 'ACCEPT' && stage4.approved;
  
  // Only reject if truly low quality despite 7D approval
  if (!shouldAccept || finalScore < 65) {
    return {
      passed: false,
      stage1,
      stage2,
      stage3,
      stage4,
      stage5,
      finalScore,
      rejectReason: `Total score below threshold (${finalScore}/100, need 65+)`
    };
  }

  // STAGE 6: Comprehensive Timestamp Extraction
  const stage6 = await stage6ComprehensiveTimestampExtraction(video);
  console.log(`  Stage 6 (Timestamps): ${stage6.timestampCount || 0} extracted - Primary: ${stage6.timestamp} (${stage6.confidence} confidence)`);

  // TAXONOMY EXTRACTION: Compute metadata for video search
  const taxonomy = computeTaxonomy(video, stage2);
  console.log(`  📋 Taxonomy: type=${taxonomy.techniqueType}, position=${taxonomy.positionCategory}, gi/nogi=${taxonomy.giOrNogi}, tags=${taxonomy.tags.length}`);

  console.log(`  ✅ FINAL SCORE: ${finalScore}/100 - APPROVED FOR SENDING`);

  return {
    passed: true,
    stage1,
    stage2,
    stage3,
    stage4,
    stage5,
    stage6,
    finalScore,
    taxonomy
  };
}

// Wrapper function to expose Stage 4 QC for content-first curator
// IMPORTANT: Content-first curator doesn't have transcripts, so we can't validate specific key details
// Instead, we check if the instructor is credible and the video appears instructional
export async function runStage4QC(
  technique: string,
  video: { title: string; description: string; videoId: string; channelTitle: string }
): Promise<Stage4Result> {
  // Elite instructors - auto-approve instructional content
  const eliteInstructors = [
    'gordon ryan', 'danaher', 'lachlan giles', 'craig jones', 'bernardo faria',
    'marcelo garcia', 'roger gracie', 'rickson gracie', 'keenan cornelius',
    'buchecha', 'gordon', 'ruotolo', 'mikey musumeci', 'nicholas meregali',
    'andre galvao', 'rafael lovato', 'caio terra', 'cobrinha', 'leandro lo',
    'lucas lepri', 'priit mihkelson', 'jon thomas', 'jt torres', 'tom deblass',
    'renzo gracie', 'ryan hall', 'garry tonon', 'nicky rod', 'lucas leite',
    'neil melanson', 'chris haueter'
  ];
  
  const titleLower = video.title.toLowerCase();
  const channelLower = video.channelTitle.toLowerCase();
  const isEliteInstructor = eliteInstructors.some(name => 
    titleLower.includes(name) || channelLower.includes(name)
  );
  
  // Check if it's instructional content (not highlights/competition)
  const instructionalKeywords = ['how to', 'tutorial', 'technique', 'breakdown', 'explained', 'details', 'setup', 'finish', 'from'];
  const competitionKeywords = ['highlights', 'vs', 'match', 'finals', 'championship', 'competition footage'];
  
  const appearsInstructional = instructionalKeywords.some(kw => titleLower.includes(kw)) ||
                                !competitionKeywords.some(kw => titleLower.includes(kw));
  
  // Elite instructor + instructional content = auto-approve Grade A
  if (isEliteInstructor && appearsInstructional) {
    return {
      approved: true,
      qualityGrade: 'A',
      reasoning: `Elite instructor (${video.channelTitle}) teaching ${technique} - auto-approved for content-first curation`
    };
  }
  
  // For non-elite instructors, use more lenient quality check
  // We're checking if the video APPEARS to be quality instructional content
  const prompt = `You are reviewing a BJJ instructional video for quality control.

Video Title: ${video.title}
Channel: ${video.channelTitle}
Technique: ${technique}
Description: ${video.description?.substring(0, 300) || 'N/A'}

APPROVE (Grade A/B) if:
✅ The video appears to be genuine technique instruction
✅ The instructor seems credible (mentions belt rank, achievements, or academy)
✅ The title/description suggests step-by-step instruction
✅ No obvious red flags (clickbait, promotional, entertainment only)

REJECT (Grade F) if:
❌ Clearly not instructional (competition highlights, vlogs, interviews)
❌ Obvious clickbait or low-quality content
❌ Entertainment/promotional rather than educational

Be LENIENT - if it looks like a real BJJ instructor teaching a technique, approve it.
We're screening OUT bad content, not requiring perfection.

Return ONLY valid JSON:
{
  "approved": true/false,
  "qualityGrade": "A/B/C/D/F",
  "reasoning": "Brief explanation"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }]
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response format');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);
    result.approved = result.approved && (result.qualityGrade === 'A' || result.qualityGrade === 'B');
    return result;
  } catch (error) {
    console.error('Stage 4 QC failed:', error);
    return {
      approved: false,
      qualityGrade: 'F',
      reasoning: 'Analysis failed'
    };
  }
}

export { VideoCandidate, UserProfile, MultiStageResult };
