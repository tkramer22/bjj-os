// Intelligent Knowledge Retrieval Service
// Parses user queries and returns relevant video knowledge with context-awareness

import { db } from './db';
import { videoKnowledge, aiVideoKnowledge, knowledgeEffectiveness } from '@shared/schema';
import { sql, eq, ilike, or, and, desc, asc, inArray } from 'drizzle-orm';

// User context for personalized results
interface UserContext {
  beltLevel?: string; // white, blue, purple, brown, black
  bodyType?: string; // stocky, average, tall, athletic
  struggles?: string[]; // areas user struggles with
  style?: string; // gi, nogi, both
  competeStatus?: string; // active_competitor, hobbyist, preparing_for_comp
  preferredInstructors?: string[];
}

// Query intent types
type QueryIntent = 
  | 'learning' // wants to learn a technique
  | 'troubleshooting' // something isn't working
  | 'defense' // wants to stop opponent's technique
  | 'competition' // preparing for tournament
  | 'chains' // what flows from/to this
  | 'comparison' // which instructor teaches best
  | 'instructor_specific'; // asking about specific instructor

// Parsed query result
interface ParsedQuery {
  technique: string | null;
  position: string | null;
  intent: QueryIntent;
  problemKeywords: string[];
  instructor: string | null;
  bodyTypeRequest: string | null;
  skillLevelRequest: string | null;
}

// Knowledge result with relevance scoring
interface KnowledgeResult {
  relevanceScore: number;
  videoId: number;
  videoTitle: string;
  youtubeId: string;
  instructor: string;
  instructorCredentials: string | null;
  primaryTechnique: string;
  positionContext: string | null;
  techniqueType: string | null;
  detailType: string | null;
  detailDescription: string | null;
  instructorQuote: string | null;
  keyConcepts: string[];
  instructorTips: string[];
  commonMistakes: string[];
  whyItMatters: string | null;
  problemSolved: string | null;
  timestamp: string;
  timestampEnd: string | null;
  setupsFrom: string[];
  chainsTo: string[];
  counters: string[];
  bodyTypeNotes: string | null;
  skillLevel: string | null;
  prerequisites: string[];
  nextToLearn: string[];
  fullSummary: string | null;
}

// Retrieval response
interface RetrievalResponse {
  queryUnderstood: string;
  intent: QueryIntent;
  results: KnowledgeResult[];
  relatedTechniques: string[];
  suggestedNext: string;
  totalMatches: number;
}

// BJJ position keywords for matching
const POSITION_KEYWORDS: Record<string, string[]> = {
  'mount': ['mount', 'mounted', 's-mount', 'high mount', 'low mount'],
  'guard': ['guard', 'closed guard', 'open guard', 'butterfly guard', 'spider guard', 'lasso guard', 'de la riva', 'dlr', 'x-guard', 'half guard'],
  'side_control': ['side control', 'side mount', 'kesa gatame', 'hundred kilos', '100 kilos', 'crossside'],
  'back': ['back', 'back control', 'back mount', 'rear mount', 'seatbelt', 'hooks'],
  'standing': ['standing', 'takedown', 'wrestling', 'judo', 'clinch'],
  'turtle': ['turtle', 'all fours', 'quad position'],
  'half_guard': ['half guard', 'z-guard', 'knee shield', 'lockdown'],
  'closed_guard': ['closed guard', 'full guard'],
  'open_guard': ['open guard', 'seated guard', 'butterfly', 'dlr', 'de la riva', 'spider'],
  'leg_entanglement': ['leg lock', 'heel hook', 'ashi garami', 'saddle', '50/50', 'inside sankaku', 'outside ashi']
};

// Technique type keywords
const TECHNIQUE_TYPE_KEYWORDS: Record<string, string[]> = {
  'submission': ['submit', 'submission', 'finish', 'tap', 'choke', 'lock', 'armbar', 'triangle', 'kimura', 'americana', 'guillotine', 'rear naked', 'heel hook', 'kneebar', 'omoplata'],
  'sweep': ['sweep', 'reversal', 'get on top'],
  'pass': ['pass', 'passing', 'get past', 'open guard'],
  'escape': ['escape', 'get out', 'recover', 'survive'],
  'control': ['control', 'maintain', 'hold', 'pin', 'pressure'],
  'transition': ['transition', 'flow', 'chain', 'move to'],
  'takedown': ['takedown', 'take down', 'wrestling', 'throw', 'trip', 'sweep standing'],
  'defense': ['defend', 'defense', 'stop', 'counter', 'prevent']
};

// Problem keywords for troubleshooting
const PROBLEM_KEYWORDS = [
  'escape', 'escaping', 'get out', 'getting out',
  'finish', 'finishing', 'tap', 'submit',
  'maintain', 'holding', 'keep', 'losing',
  'pass', 'passing', 'open',
  'grip', 'grips', 'breaking',
  'timing', 'too slow', 'too fast',
  'strength', 'strong', 'stronger',
  'flexible', 'flexibility',
  'fails', 'failing', 'not working', "doesn't work", "keep failing"
];

/**
 * Parse user query to understand intent and extract key information
 */
export function parseUserQuery(query: string): ParsedQuery {
  const lowerQuery = query.toLowerCase();
  
  // Detect intent
  let intent: QueryIntent = 'learning';
  
  if (lowerQuery.includes('escape') || lowerQuery.includes('keep ') || lowerQuery.includes('failing') || 
      lowerQuery.includes("doesn't work") || lowerQuery.includes('not working') || lowerQuery.includes('problem') ||
      lowerQuery.includes('trouble') || lowerQuery.includes('struggle')) {
    intent = 'troubleshooting';
  } else if (lowerQuery.includes('defend') || lowerQuery.includes('stop') || lowerQuery.includes('counter') || 
             lowerQuery.includes('prevent') || lowerQuery.includes('when they')) {
    intent = 'defense';
  } else if (lowerQuery.includes('competition') || lowerQuery.includes('tournament') || lowerQuery.includes('compete') ||
             lowerQuery.includes('ibjjf') || lowerQuery.includes('legal')) {
    intent = 'competition';
  } else if (lowerQuery.includes('chain') || lowerQuery.includes('after') || lowerQuery.includes('then what') ||
             lowerQuery.includes('flow') || lowerQuery.includes('transition') || lowerQuery.includes('if that fails')) {
    intent = 'chains';
  } else if (lowerQuery.includes('who teaches') || lowerQuery.includes('best instructor') || lowerQuery.includes('compare')) {
    intent = 'comparison';
  }
  
  // Detect instructor mention
  let instructor: string | null = null;
  const instructorPatterns = [
    /danaher/i, /roger gracie/i, /marcelo garcia/i, /gordon ryan/i, /john danaher/i,
    /bernardo faria/i, /keenan/i, /lachlan giles/i, /craig jones/i, /mikey musumeci/i,
    /andre galvao/i, /ryan hall/i, /stephan kesting/i, /jt torres/i, /josh hinger/i
  ];
  for (const pattern of instructorPatterns) {
    const match = lowerQuery.match(pattern);
    if (match) {
      instructor = match[0];
      intent = 'instructor_specific';
      break;
    }
  }
  
  // Detect position
  let position: string | null = null;
  for (const [posKey, keywords] of Object.entries(POSITION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerQuery.includes(keyword)) {
        position = posKey;
        break;
      }
    }
    if (position) break;
  }
  
  // Detect technique (common BJJ techniques)
  let technique: string | null = null;
  const techniquePatterns = [
    'armbar', 'arm bar', 'kimura', 'americana', 'triangle', 'guillotine', 'rear naked',
    'heel hook', 'kneebar', 'ankle lock', 'omoplata', 'ezekiel', 'd\'arce', 'anaconda',
    'knee cut', 'torreando', 'leg drag', 'x-pass', 'stack pass', 'double under',
    'hip escape', 'bridge', 'shrimp', 'elbow escape', 'trap and roll',
    'single leg', 'double leg', 'snap down', 'arm drag', 'collar drag',
    'mount', 'back take', 'berimbolo', 'sweep', 'pass'
  ];
  for (const tech of techniquePatterns) {
    if (lowerQuery.includes(tech)) {
      technique = tech;
      break;
    }
  }
  
  // Extract problem keywords
  const problemKeywords = PROBLEM_KEYWORDS.filter(kw => lowerQuery.includes(kw));
  
  // Detect body type requests
  let bodyTypeRequest: string | null = null;
  if (lowerQuery.includes('short') || lowerQuery.includes('smaller')) {
    bodyTypeRequest = 'short';
  } else if (lowerQuery.includes('tall') || lowerQuery.includes('long')) {
    bodyTypeRequest = 'tall';
  } else if (lowerQuery.includes('heavy') || lowerQuery.includes('bigger')) {
    bodyTypeRequest = 'heavy';
  }
  
  // Detect skill level requests
  let skillLevelRequest: string | null = null;
  if (lowerQuery.includes('beginner') || lowerQuery.includes('white belt') || lowerQuery.includes('basic')) {
    skillLevelRequest = 'beginner';
  } else if (lowerQuery.includes('advanced') || lowerQuery.includes('black belt')) {
    skillLevelRequest = 'advanced';
  } else if (lowerQuery.includes('blue belt') || lowerQuery.includes('purple belt')) {
    skillLevelRequest = 'intermediate';
  }
  
  return {
    technique,
    position,
    intent,
    problemKeywords,
    instructor,
    bodyTypeRequest,
    skillLevelRequest
  };
}

/**
 * Build intelligent SQL query based on parsed query and user context
 */
export async function getRelevantKnowledge(
  userQuery: string,
  userContext?: UserContext,
  limit: number = 10
): Promise<RetrievalResponse> {
  const parsed = parseUserQuery(userQuery);
  
  // Build query understood string
  const queryUnderstood = buildQueryUnderstanding(parsed, userContext);
  
  // Build SQL conditions
  const conditions: any[] = [];
  
  // Technique matching
  if (parsed.technique) {
    conditions.push(
      or(
        ilike(videoKnowledge.techniqueName, `%${parsed.technique}%`),
        ilike(videoKnowledge.detailDescription, `%${parsed.technique}%`)
      )
    );
  }
  
  // Position matching
  if (parsed.position) {
    conditions.push(ilike(videoKnowledge.positionContext, `%${parsed.position}%`));
  }
  
  // Instructor matching
  if (parsed.instructor) {
    conditions.push(ilike(videoKnowledge.instructorName, `%${parsed.instructor}%`));
  }
  
  // Intent-based filtering
  if (parsed.intent === 'troubleshooting') {
    conditions.push(
      or(
        sql`${videoKnowledge.detailType} IN ('counter', 'mistake', 'tip', 'finish')`,
        sql`${videoKnowledge.problemSolved} IS NOT NULL`
      )
    );
  } else if (parsed.intent === 'defense') {
    conditions.push(
      sql`${videoKnowledge.detailType} IN ('defense', 'counter', 'escape')`
    );
  } else if (parsed.intent === 'competition') {
    conditions.push(eq(videoKnowledge.competitionLegal, true));
  }
  
  // Body type matching
  if (parsed.bodyTypeRequest) {
    conditions.push(ilike(videoKnowledge.bodyTypeNotes, `%${parsed.bodyTypeRequest}%`));
  }
  
  // Skill level matching (from user context)
  if (userContext?.beltLevel) {
    const skillMap: Record<string, string[]> = {
      'white': ['beginner'],
      'blue': ['beginner', 'intermediate'],
      'purple': ['intermediate', 'advanced'],
      'brown': ['intermediate', 'advanced'],
      'black': ['advanced']
    };
    const levels = skillMap[userContext.beltLevel] || ['beginner', 'intermediate', 'advanced'];
    conditions.push(
      or(
        inArray(videoKnowledge.skillLevel, levels),
        sql`${videoKnowledge.skillLevel} IS NULL`
      )
    );
  }
  
  // Execute query
  let query = db.select({
    id: videoKnowledge.id,
    videoId: videoKnowledge.videoId,
    techniqueName: videoKnowledge.techniqueName,
    positionContext: videoKnowledge.positionContext,
    techniqueType: videoKnowledge.techniqueType,
    detailType: videoKnowledge.detailType,
    detailDescription: videoKnowledge.detailDescription,
    instructorQuote: videoKnowledge.instructorQuote,
    keyConcepts: videoKnowledge.keyConcepts,
    instructorTips: videoKnowledge.instructorTips,
    commonMistakes: videoKnowledge.commonMistakes,
    whyItMatters: videoKnowledge.whyItMatters,
    problemSolved: videoKnowledge.problemSolved,
    timestampStart: videoKnowledge.timestampStart,
    timestampEnd: videoKnowledge.timestampEnd,
    setupsFrom: videoKnowledge.setupsFrom,
    chainsTo: videoKnowledge.chainsTo,
    counters: videoKnowledge.counters,
    bodyTypeNotes: videoKnowledge.bodyTypeNotes,
    skillLevel: videoKnowledge.skillLevel,
    prerequisites: videoKnowledge.prerequisites,
    nextToLearn: videoKnowledge.nextToLearn,
    fullSummary: videoKnowledge.fullSummary,
    instructorName: videoKnowledge.instructorName,
    instructorCredentials: videoKnowledge.instructorCredentials,
    videoTitle: aiVideoKnowledge.title,
    youtubeId: aiVideoKnowledge.youtubeId
  })
  .from(videoKnowledge)
  .innerJoin(aiVideoKnowledge, eq(videoKnowledge.videoId, aiVideoKnowledge.id))
  .limit(limit * 2); // Get extra for scoring
  
  // Apply conditions if any
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  const rows = await query;
  
  // Score and sort results
  const scoredResults: KnowledgeResult[] = rows.map(row => {
    let score = 0.5; // Base score
    
    // Technique name match boost
    if (parsed.technique && row.techniqueName?.toLowerCase().includes(parsed.technique)) {
      score += 0.3;
    }
    
    // Position match boost
    if (parsed.position && row.positionContext?.toLowerCase().includes(parsed.position)) {
      score += 0.1;
    }
    
    // Instructor match boost
    if (parsed.instructor && row.instructorName?.toLowerCase().includes(parsed.instructor.toLowerCase())) {
      score += 0.2;
    }
    
    // Has timestamp boost
    if (row.timestampStart) {
      score += 0.1;
    }
    
    // Has instructor quote boost
    if (row.instructorQuote) {
      score += 0.05;
    }
    
    // Problem match for troubleshooting
    if (parsed.intent === 'troubleshooting' && row.problemSolved) {
      for (const kw of parsed.problemKeywords) {
        if (row.problemSolved.toLowerCase().includes(kw)) {
          score += 0.15;
          break;
        }
      }
    }
    
    return {
      relevanceScore: Math.min(score, 1.0),
      videoId: row.videoId,
      videoTitle: row.videoTitle || 'Unknown',
      youtubeId: row.youtubeId || '',
      instructor: row.instructorName || 'Unknown',
      instructorCredentials: row.instructorCredentials,
      primaryTechnique: row.techniqueName,
      positionContext: row.positionContext,
      techniqueType: row.techniqueType,
      detailType: row.detailType,
      detailDescription: row.detailDescription,
      instructorQuote: row.instructorQuote,
      keyConcepts: row.keyConcepts || [],
      instructorTips: row.instructorTips || [],
      commonMistakes: row.commonMistakes || [],
      whyItMatters: row.whyItMatters,
      problemSolved: row.problemSolved,
      timestamp: row.timestampStart || '',
      timestampEnd: row.timestampEnd,
      setupsFrom: row.setupsFrom || [],
      chainsTo: row.chainsTo || [],
      counters: row.counters || [],
      bodyTypeNotes: row.bodyTypeNotes,
      skillLevel: row.skillLevel,
      prerequisites: row.prerequisites || [],
      nextToLearn: row.nextToLearn || [],
      fullSummary: row.fullSummary
    };
  });
  
  // Sort by score descending
  scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  // Take top results
  const topResults = scoredResults.slice(0, limit);
  
  // Collect related techniques from chains_to
  const relatedTechniques = new Set<string>();
  for (const result of topResults) {
    for (const chain of result.chainsTo) {
      relatedTechniques.add(chain);
    }
    for (const next of result.nextToLearn) {
      relatedTechniques.add(next);
    }
  }
  
  // Build suggested next
  const suggestedNext = buildSuggestedNext(topResults, parsed.intent);
  
  return {
    queryUnderstood,
    intent: parsed.intent,
    results: topResults,
    relatedTechniques: Array.from(relatedTechniques).slice(0, 5),
    suggestedNext,
    totalMatches: scoredResults.length
  };
}

/**
 * Build human-readable query understanding
 */
function buildQueryUnderstanding(parsed: ParsedQuery, userContext?: UserContext): string {
  const parts: string[] = [];
  
  if (parsed.intent === 'troubleshooting') {
    parts.push('User is troubleshooting');
  } else if (parsed.intent === 'defense') {
    parts.push('User wants to defend');
  } else if (parsed.intent === 'competition') {
    parts.push('User is preparing for competition');
  } else if (parsed.intent === 'chains') {
    parts.push('User wants technique chains');
  } else if (parsed.intent === 'comparison') {
    parts.push('User wants instructor comparison');
  } else if (parsed.intent === 'instructor_specific') {
    parts.push(`User wants ${parsed.instructor}'s teaching on`);
  } else {
    parts.push('User wants to learn');
  }
  
  if (parsed.technique) {
    parts.push(`the ${parsed.technique}`);
  }
  
  if (parsed.position) {
    parts.push(`from ${parsed.position}`);
  }
  
  if (parsed.bodyTypeRequest) {
    parts.push(`for ${parsed.bodyTypeRequest} body type`);
  }
  
  if (userContext?.beltLevel) {
    parts.push(`(${userContext.beltLevel} belt level)`);
  }
  
  return parts.join(' ');
}

/**
 * Build suggested next based on results and intent
 */
function buildSuggestedNext(results: KnowledgeResult[], intent: QueryIntent): string {
  if (results.length === 0) {
    return "Try a different search or ask about a specific technique";
  }
  
  const firstResult = results[0];
  
  if (intent === 'learning' && firstResult.nextToLearn.length > 0) {
    return `Once you master this, learn: ${firstResult.nextToLearn.join(', ')}`;
  }
  
  if (intent === 'troubleshooting') {
    return "Would you like me to show you the specific drill to fix this?";
  }
  
  if (intent === 'chains' && firstResult.chainsTo.length > 0) {
    return `These chain into: ${firstResult.chainsTo.join(', ')}`;
  }
  
  if (intent === 'competition') {
    return "Want me to break down the point strategy for this technique?";
  }
  
  return "Want me to go deeper on any of these concepts?";
}

/**
 * Track when knowledge is recommended (for continuous learning)
 */
export async function trackKnowledgeRecommendation(videoKnowledgeId: number): Promise<void> {
  try {
    // Check if tracking record exists
    const existing = await db.select()
      .from(knowledgeEffectiveness)
      .where(eq(knowledgeEffectiveness.videoKnowledgeId, videoKnowledgeId))
      .limit(1);
    
    if (existing.length > 0) {
      // Increment times recommended
      await db.execute(sql`
        UPDATE knowledge_effectiveness 
        SET times_recommended = times_recommended + 1, updated_at = NOW()
        WHERE video_knowledge_id = ${videoKnowledgeId}
      `);
    } else {
      // Create new tracking record
      await db.insert(knowledgeEffectiveness).values({
        videoKnowledgeId,
        timesRecommended: 1
      });
    }
  } catch (error) {
    console.error('[KNOWLEDGE] Error tracking recommendation:', error);
  }
}

/**
 * Record user feedback on knowledge recommendation
 */
export async function recordKnowledgeFeedback(
  videoKnowledgeId: number, 
  isPositive: boolean,
  feedback?: string
): Promise<void> {
  try {
    const column = isPositive ? 'thumbs_up_count' : 'thumbs_down_count';
    
    await db.execute(sql`
      UPDATE knowledge_effectiveness 
      SET ${sql.raw(column)} = ${sql.raw(column)} + 1,
          user_feedback = COALESCE(${feedback}, user_feedback),
          updated_at = NOW()
      WHERE video_knowledge_id = ${videoKnowledgeId}
    `);
  } catch (error) {
    console.error('[KNOWLEDGE] Error recording feedback:', error);
  }
}

export { ParsedQuery, QueryIntent, KnowledgeResult, RetrievalResponse, UserContext };
