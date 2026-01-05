import { db } from './db';
import { aiVideoKnowledge, videoKnowledge, videoWatchStatus } from '../shared/schema';
import { sql, desc, and, or, eq, ilike, inArray, exists } from 'drizzle-orm';

interface VideoSearchParams {
  userMessage: string;
  userId?: string; // For session context lookup
  conversationContext?: {
    sessionFocus?: Record<string, number>;
    recommendedVideoIds?: number[];
    userGiNogi?: string;
    lastInstructor?: string; // From session context
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI-FIRST VIDEO SEARCH - January 2026
// ═══════════════════════════════════════════════════════════════════════════════
// 
// THE RULE: Video selection is DATABASE QUERY against Gemini fields, NOT AI judgment.
// 
// Gemini analyzed the videos. Gemini knows what's in them. Query Gemini's analysis.
// 
// If user asks about guillotines:
//   1. Extract "guillotine" from message
//   2. Query: WHERE techniqueName ILIKE '%guillotine%' in videoKnowledge
//   3. Return ONLY videos where Gemini identified guillotine content
//   4. If no matches, return NOTHING — don't fall back to random videos
// 
// ═══════════════════════════════════════════════════════════════════════════════

// Ordered by specificity (most specific first) - used for keyword extraction
const TECHNIQUE_KEYWORDS = [
  // Specific chokes
  'high elbow guillotine', 'arm in guillotine', 'standing guillotine', 'guillotine',
  'rear naked choke', 'rnc', 'bow and arrow', 'bow arrow', 
  'baseball choke', 'north south choke', 'loop choke', 'paper cutter', 'clock choke',
  'ezekiel', 'cross collar choke', 'collar choke',
  // Triangles
  'triangle choke', 'triangle', 'mounted triangle', 'reverse triangle',
  // Arm attacks
  'arm triangle', 'darce', "d'arce", 'anaconda choke', 'anaconda', 
  'armbar', 'arm bar', 'straight armbar', 'belly down armbar',
  'kimura', 'americana', 'omoplata', 'gogoplata',
  // Leg locks
  'heel hook', 'inside heel hook', 'outside heel hook',
  'knee bar', 'kneebar', 'toe hold', 'calf slicer', 'ankle lock', 'straight ankle',
  // Guards
  'half guard', 'deep half', 'lockdown', 'knee shield',
  'closed guard', 'full guard',
  'open guard', 'butterfly guard', 'butterfly', 
  'de la riva', 'dlr', 'rdlr', 'reverse de la riva',
  'x guard', 'x-guard', 'single leg x', 'slx',
  'spider guard', 'lasso guard', 'worm guard', 'lapel guard',
  'rubber guard', 'mission control', 'z guard',
  // Positions
  'mount', 'mount escape', 'mounted', 's mount', 's-mount',
  'back control', 'back take', 'back mount', 'rear mount',
  'side control', 'side mount', 'cross side', 'knee on belly', 'kob',
  'turtle', 'crucifix', 'north south',
  // Techniques
  'berimbolo', 'kiss of the dragon', 
  'leg drag', 'knee slice', 'knee cut', 'torreando', 'bullfighter',
  'sweep', 'scissor sweep', 'hip bump', 'flower sweep', 'pendulum sweep',
  'escape', 'bridge', 'hip escape', 'shrimp', 'upa',
  'takedown', 'single leg', 'double leg', 'snap down', 'arm drag',
  'pass', 'guard pass', 'guard passing',
  'retention', 'guard retention'
];

/**
 * Extract technique keyword from user message
 * Returns the most specific matching technique (longer matches first)
 */
export function extractTechniqueKeyword(message: string): string | null {
  const lower = message.toLowerCase();
  
  for (const kw of TECHNIQUE_KEYWORDS) {
    if (lower.includes(kw)) {
      console.log(`[GEMINI SEARCH] Extracted technique keyword: "${kw}"`);
      return kw;
    }
  }
  
  return null;
}

/**
 * GEMINI-FIRST VIDEO SEARCH
 * 
 * This function ONLY queries the Gemini-analyzed videoKnowledge table.
 * It returns ONLY videos where Gemini identified the requested technique.
 * If no match, returns empty array (not random videos).
 */
export async function searchGeminiFirst(technique: string): Promise<{
  videos: any[];
  technique: string;
  noMatchFound: boolean;
}> {
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`[GEMINI SEARCH] 🔍 Searching Gemini-analyzed data for: "${technique}"`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  
  const searchTerm = `%${technique.toLowerCase()}%`;
  
  try {
    // Step 1: Query GEMINI FIELDS ONLY via videoKnowledge table
    // Join with aiVideoKnowledge to get full video metadata
    const videos = await db.select({
      // Required fields for video playback
      id: aiVideoKnowledge.id,
      title: aiVideoKnowledge.title,
      youtubeId: aiVideoKnowledge.youtubeId,
      videoUrl: aiVideoKnowledge.videoUrl, // CRITICAL: Needed for video playback
      instructorName: aiVideoKnowledge.instructorName,
      thumbnailUrl: aiVideoKnowledge.thumbnailUrl,
      qualityScore: aiVideoKnowledge.qualityScore,
      duration: aiVideoKnowledge.duration,
      positionCategory: aiVideoKnowledge.positionCategory,
      techniqueType: aiVideoKnowledge.techniqueType,
      giOrNogi: aiVideoKnowledge.giOrNogi,
      tags: aiVideoKnowledge.tags,
      keyTimestamps: aiVideoKnowledge.keyTimestamps, // CRITICAL: Needed for timestamp linking
      // Gemini-analyzed fields
      techniqueName: videoKnowledge.techniqueName,
      positionContext: videoKnowledge.positionContext,
      keyConcepts: videoKnowledge.keyConcepts,
      instructorTips: videoKnowledge.instructorTips,
      commonMistakes: videoKnowledge.commonMistakes,
      fullSummary: videoKnowledge.fullSummary,
      problemSolved: videoKnowledge.problemSolved,
      instructorQuote: videoKnowledge.instructorQuote,
      chainsTo: videoKnowledge.chainsTo,
      setupsFrom: videoKnowledge.setupsFrom,
      timestampStart: videoKnowledge.timestampStart,
      skillLevel: videoKnowledge.skillLevel
    })
    .from(videoKnowledge)
    .innerJoin(aiVideoKnowledge, eq(videoKnowledge.videoId, aiVideoKnowledge.id))
    .where(
      and(
        // Quality threshold
        sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 5.0`,
        // Match technique in ANY Gemini-analyzed field
        or(
          sql`LOWER(${videoKnowledge.techniqueName}) LIKE LOWER(${searchTerm})`,
          sql`array_to_string(COALESCE(${videoKnowledge.keyConcepts}, '{}'), ' ') ILIKE ${searchTerm}`,
          sql`COALESCE(${videoKnowledge.fullSummary}, '') ILIKE ${searchTerm}`,
          sql`array_to_string(COALESCE(${videoKnowledge.instructorTips}, '{}'), ' ') ILIKE ${searchTerm}`,
          sql`COALESCE(${videoKnowledge.positionContext}, '') ILIKE ${searchTerm}`,
          sql`COALESCE(${videoKnowledge.problemSolved}, '') ILIKE ${searchTerm}`,
          sql`array_to_string(COALESCE(${videoKnowledge.chainsTo}, '{}'), ' ') ILIKE ${searchTerm}`,
          sql`array_to_string(COALESCE(${videoKnowledge.setupsFrom}, '{}'), ' ') ILIKE ${searchTerm}`
        )
      )
    )
    .orderBy(desc(aiVideoKnowledge.qualityScore))
    .limit(10);
    
    console.log(`[GEMINI SEARCH] Found ${videos.length} videos in Gemini data for "${technique}"`);
    
    // Step 2: POST-VALIDATION - Verify matches contain the technique
    const techniqueWords = technique.toLowerCase().split(/\s+/);
    const verified = videos.filter(v => {
      const searchableText = [
        v.techniqueName || '',
        (v.keyConcepts || []).join(' '),
        v.fullSummary || '',
        (v.instructorTips || []).join(' '),
        v.positionContext || '',
        v.problemSolved || '',
        (v.chainsTo || []).join(' '),
        (v.setupsFrom || []).join(' '),
        v.title || ''
      ].join(' ').toLowerCase();
      
      // At least one technique word must match
      return techniqueWords.some(word => word.length > 2 && searchableText.includes(word));
    });
    
    console.log(`[GEMINI SEARCH] ${verified.length} videos passed post-validation`);
    verified.slice(0, 5).forEach((v, i) => {
      console.log(`  ${i + 1}. "${v.title}" by ${v.instructorName} (technique: ${v.techniqueName})`);
    });
    
    // Deduplicate by video ID (multiple videoKnowledge rows can exist per video)
    const uniqueVideos = Array.from(new Map(verified.map(v => [v.id, v])).values());
    
    console.log(`[GEMINI SEARCH] Returning ${uniqueVideos.length} unique videos`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);
    
    return {
      videos: uniqueVideos,
      technique,
      noMatchFound: uniqueVideos.length === 0
    };
    
  } catch (error) {
    console.error(`[GEMINI SEARCH] Error:`, error);
    return {
      videos: [],
      technique,
      noMatchFound: true
    };
  }
}

interface SearchIntent {
  techniqueType?: string;
  positionCategory?: string;
  searchTerms: string[];
  specificIntent?: 'escape' | 'sweep' | 'pass' | 'attack' | 'retention' | 'takedown' | 'transition';
  perspective?: 'top' | 'bottom';
  requestedInstructor?: string;
  hasTechniqueTerms: boolean; // TRUE if real technique terms found, FALSE if only fallback keywords
}

interface VideoSearchResult {
  videos: any[];
  totalMatches: number;
  searchIntent: SearchIntent;
  noMatchFound?: boolean; // True when search found zero matching videos - DON'T fallback to random videos
  searchTermsValidated?: boolean; // True when all search terms were matched in returned videos
}

// ============================================================================
// DYNAMIC INSTRUCTOR CACHE - pulls from database instead of hardcoded list
// ============================================================================

// Cache for instructor names from database
let cachedInstructors: string[] = [];
let cachedInstructorVariations: Map<string, string> = new Map(); // Variation -> canonical name
let lastInstructorCacheTime = 0;
const INSTRUCTOR_CACHE_TTL = 3600000; // 1 hour

// Fallback list for common nicknames/variations not in database
const INSTRUCTOR_ALIASES: Record<string, string[]> = {
  'john danaher': ['danaher'],
  'gordon ryan': ['gordon'],
  'jt torres': ['j.t. torres', 'jt'],
  'marcelo garcia': ['marcelo'],
  'roger gracie': ['roger'],
  'lachlan giles': ['lachlan'],
  'bernardo faria': ['bernardo'],
  'craig jones': ['craig'],
  'mikey musumeci': ['mikey'],
  'marcus buchecha': ['buchecha'],
  'keenan cornelius': ['keenan'],
  'priit mihkelson': ['priit'],
  'andre galvao': ['galvao'],
  'rafael mendes': ['rafa mendes', 'rafa'],
  'guilherme mendes': ['gui mendes', 'gui'],
  'eddie bravo': ['eddie', 'bravo'],
  'stephan kesting': ['kesting'],
  'andrew wiltse': ['wiltse'],
  'ryan hall': ['hall'],
  'lucas lepri': ['lepri'],
  'nicholas meregali': ['meregali'],
  'roberto abreu': ['cyborg'],
  'rodolfo vieira': ['rodolfo'],
  'rickson gracie': ['rickson'],
  'georges st pierre': ['gsp'],
};

async function loadInstructorCache(): Promise<void> {
  try {
    // Query database for all unique instructor names
    const results = await db.selectDistinct({ name: aiVideoKnowledge.instructorName })
      .from(aiVideoKnowledge)
      .where(sql`${aiVideoKnowledge.instructorName} IS NOT NULL`);
    
    // Build list with the canonical names
    const instructorNames = results
      .map(r => r.name?.toLowerCase().trim())
      .filter((name): name is string => !!name && name.length > 0);
    
    cachedInstructors = [...new Set(instructorNames)]; // Deduplicate
    
    // Build variations map
    cachedInstructorVariations.clear();
    
    // Add canonical names
    for (const name of cachedInstructors) {
      cachedInstructorVariations.set(name, name);
    }
    
    // Add known aliases
    for (const [canonical, aliases] of Object.entries(INSTRUCTOR_ALIASES)) {
      // Only add aliases if we have videos from this instructor
      const matchingInstructor = cachedInstructors.find(name => 
        name.includes(canonical) || canonical.includes(name)
      );
      if (matchingInstructor) {
        for (const alias of aliases) {
          cachedInstructorVariations.set(alias.toLowerCase(), matchingInstructor);
        }
      }
    }
    
    // Also add first/last name variations
    for (const name of cachedInstructors) {
      const parts = name.split(' ').filter(p => p.length >= 3);
      for (const part of parts) {
        // Only add if not too generic and doesn't conflict
        if (!cachedInstructorVariations.has(part) && part.length >= 4) {
          cachedInstructorVariations.set(part, name);
        }
      }
    }
    
    lastInstructorCacheTime = Date.now();
    console.log(`[INSTRUCTOR CACHE] Loaded ${cachedInstructors.length} instructors, ${cachedInstructorVariations.size} variations`);
  } catch (error) {
    console.error('[INSTRUCTOR CACHE] Failed to load:', error);
  }
}

async function getInstructorList(): Promise<string[]> {
  const now = Date.now();
  
  // Return cached list if fresh
  if (cachedInstructors.length > 0 && (now - lastInstructorCacheTime) < INSTRUCTOR_CACHE_TTL) {
    return cachedInstructors;
  }
  
  // Reload cache
  await loadInstructorCache();
  return cachedInstructors;
}

// Export for initialization on server start
export async function initializeInstructorCache(): Promise<void> {
  await loadInstructorCache();
}

// ============================================================================
// INSTRUCTOR EXTRACTION - uses dynamic cache
// ============================================================================

export async function extractRequestedInstructorAsync(message: string): Promise<string | undefined> {
  // Normalize: lowercase, remove punctuation, collapse spaces
  const normalizedMessage = message.toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Ensure cache is loaded
  await getInstructorList();
  
  // Check for full names first (more specific) - sort by length descending
  const fullNames = cachedInstructors
    .filter(name => name.includes(' '))
    .sort((a, b) => b.length - a.length);
  
  for (const instructor of fullNames) {
    const normalizedInstructor = instructor.replace(/\./g, '').replace(/\s+/g, ' ');
    if (normalizedMessage.includes(normalizedInstructor)) {
      console.log(`[INSTRUCTOR EXTRACT] Matched full name: "${instructor}"`);
      return instructor;
    }
  }
  
  // Check aliases and single-word matches
  for (const [variation, canonical] of cachedInstructorVariations.entries()) {
    if (!variation.includes(' ')) {
      // Use word boundary matching for single names
      const regex = new RegExp(`\\b${variation}\\b`, 'i');
      if (regex.test(normalizedMessage)) {
        console.log(`[INSTRUCTOR EXTRACT] Matched variation "${variation}" -> "${canonical}"`);
        return canonical;
      }
    }
  }
  
  return undefined;
}

// Fallback hardcoded instructor names for cold start / cache miss scenarios
// Includes both full names AND common single-word aliases
const FALLBACK_INSTRUCTORS = [
  // Full names
  'john danaher', 'gordon ryan', 'craig jones', 'lachlan giles', 'bernardo faria',
  'marcelo garcia', 'roger gracie', 'mikey musumeci', 'garry tonon', 'andre galvao',
  'keenan cornelius', 'jt torres', 'priit mihkelson', 'ryan hall', 'eddie bravo',
  'stephan kesting', 'andrew wiltse', 'jon thomas', 'lucas lepri', 'nicholas meregali',
  // Common single-word aliases (for alias coverage during cold start)
  'danaher', 'gordon', 'marcelo', 'lachlan', 'bernardo', 'craig', 'keenan',
  'priit', 'mikey', 'galvao', 'wiltse', 'meregali', 'lepri', 'buchecha'
];

// Synchronous version (uses cached data with robust fallback)
export function extractRequestedInstructor(message: string): string | undefined {
  // Normalize: lowercase, remove punctuation, collapse spaces
  const normalizedMessage = message.toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Use fallback list if cache is empty (cold start scenario)
  const instructorList = cachedInstructors.length > 0 ? cachedInstructors : FALLBACK_INSTRUCTORS;
  const variationsMap = cachedInstructorVariations.size > 0 ? cachedInstructorVariations : new Map<string, string>();
  
  // Check for full names first (more specific)
  const fullNames = instructorList
    .filter(name => name.includes(' '))
    .sort((a, b) => b.length - a.length);
  
  for (const instructor of fullNames) {
    const normalizedInstructor = instructor.replace(/\./g, '').replace(/\s+/g, ' ');
    if (normalizedMessage.includes(normalizedInstructor)) {
      return instructor;
    }
  }
  
  // Helper function to escape special regex characters
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Check variations from cache (if available)
  for (const [variation, canonical] of variationsMap.entries()) {
    if (!variation.includes(' ')) {
      try {
        const regex = new RegExp(`\\b${escapeRegex(variation)}\\b`, 'i');
        if (regex.test(normalizedMessage)) {
          return canonical;
        }
      } catch (e) {
        // Skip invalid patterns
        console.warn(`[INSTRUCTOR EXTRACT] Invalid regex for variation: "${variation}"`);
      }
    }
  }
  
  // Check single names from instructor list
  for (const instructor of instructorList) {
    if (!instructor.includes(' ')) {
      try {
        const regex = new RegExp(`\\b${escapeRegex(instructor)}\\b`, 'i');
        if (regex.test(normalizedMessage)) {
          return instructor;
        }
      } catch (e) {
        // Skip invalid patterns
        console.warn(`[INSTRUCTOR EXTRACT] Invalid regex for instructor: "${instructor}"`);
      }
    }
  }
  
  // Final fallback: extract capitalized name patterns from original message
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  const matches = message.match(namePattern);
  if (matches && matches.length > 0) {
    console.log(`[INSTRUCTOR EXTRACT] Fallback pattern matched: "${matches[0]}"`);
    return matches[0].toLowerCase();
  }
  
  return undefined;
}

export async function searchByInstructor(instructorName: string, limit: number = 20): Promise<{
  videos: any[];
  totalMatches: number;
  instructorFound: boolean;
}> {
  try {
    // Search for videos by this instructor (case-insensitive)
    const videos = await db.select()
      .from(aiVideoKnowledge)
      .where(and(
        sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 6.5`,
        ilike(aiVideoKnowledge.instructorName, `%${instructorName}%`)
      ))
      .orderBy(desc(aiVideoKnowledge.qualityScore))
      .limit(limit);
    
    // Get total count for this instructor
    const countResult = await db.select({ count: sql`COUNT(*)` })
      .from(aiVideoKnowledge)
      .where(and(
        sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 6.5`,
        ilike(aiVideoKnowledge.instructorName, `%${instructorName}%`)
      ));
    
    const totalMatches = Number(countResult[0]?.count) || 0;
    
    console.log(`[INSTRUCTOR SEARCH] Searched for "${instructorName}": found ${videos.length} videos (${totalMatches} total)`);
    
    return {
      videos,
      totalMatches,
      instructorFound: videos.length > 0
    };
  } catch (error) {
    console.error('[INSTRUCTOR SEARCH] Error:', error);
    return { videos: [], totalMatches: 0, instructorFound: false };
  }
}

export async function getAvailableInstructors(): Promise<{ name: string; videoCount: number }[]> {
  try {
    const result = await db.select({
      name: aiVideoKnowledge.instructorName,
      count: sql<number>`COUNT(*)`
    })
      .from(aiVideoKnowledge)
      .where(sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 6.5`)
      .groupBy(aiVideoKnowledge.instructorName)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(50);
    
    return result.map(r => ({ name: r.name || 'Unknown', videoCount: Number(r.count) }));
  } catch (error) {
    console.error('[INSTRUCTOR LIST] Error:', error);
    return [];
  }
}

export function extractSearchIntent(message: string): {
  techniqueType?: string;
  positionCategory?: string;
  searchTerms: string[];
  specificIntent?: 'escape' | 'sweep' | 'pass' | 'attack' | 'retention' | 'takedown' | 'transition';
  perspective?: 'top' | 'bottom';
  requestedInstructor?: string;
  hasTechniqueTerms: boolean; // TRUE if real technique terms found, FALSE if only fallback keywords
} {
  const lowerMessage = message.toLowerCase();
  
  let techniqueType: string | undefined;
  let specificIntent: 'escape' | 'sweep' | 'pass' | 'attack' | 'retention' | 'takedown' | 'transition' | undefined;
  let perspective: 'top' | 'bottom' | undefined;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PERSPECTIVE DETECTION: Determine if user wants TOP (passer) or BOTTOM (guard)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // TOP/PASSER perspective indicators - specific passing/smashing terms only
  // Avoid generic phrases like "how to", "against" which could apply to any perspective
  const topIndicators = [
    'pass guard', 'passing guard', 'pass the guard', 'guard pass', 'guard passing',
    'smash pass', 'smash their', 'smashing', 'crush their', 'crushing their',
    'flatten them', 'flatten their', 'pressure pass', 'knee cut pass', 'leg drag',
    'torreando', 'headquarters', 'combat base', 'open their guard', 'break open',
    'stack pass', 'over under pass', 'bullfighter', 'x pass', 'knee slice'
  ];
  
  // BOTTOM/GUARD perspective indicators - words that indicate user is ON BOTTOM
  const bottomIndicators = [
    'retain', 'retention', 'keep', 'maintain', 'hold', 'sweep', 'submit from',
    'attack from', 'play', 'playing', 'my guard', 'from guard', 'off my back',
    'when im on bottom', 'when i\'m on bottom', 'recover', 'regain',
    'use my', 'my half', 'my closed', 'my open'
  ];
  
  const hasTopIndicator = topIndicators.some(ind => lowerMessage.includes(ind));
  const hasBottomIndicator = bottomIndicators.some(ind => lowerMessage.includes(ind));
  
  // Detect specific intent FIRST (more precise than general attack/defense)
  const escapeKeywords = ['escape', 'escapes', 'escaping', 'get out', 'getting out', 'survive', 'survival'];
  const sweepKeywords = ['sweep', 'sweeps', 'sweeping', 'reversal', 'reversals'];
  const passKeywords = ['pass', 'passes', 'passing', 'guard pass'];
  const retentionKeywords = ['retention', 'retain', 'retaining', 'keep', 'keeping guard', 'guard retention'];
  const attackKeywords = ['submit', 'submission', 'finish', 'finishing', 'attack', 'attacking', 'choke', 'choking', 
    'lock', 'locking', 'armbar', 'triangle', 'kimura', 'guillotine', 'rnc', 'rear naked'];
  const takedownKeywords = ['takedown', 'takedowns', 'taking down', 'throw', 'throws'];
  
  // Check for specific intents in order of specificity
  if (escapeKeywords.some(k => lowerMessage.includes(k))) {
    specificIntent = 'escape';
    techniqueType = 'defense';
    perspective = 'bottom'; // Escaping = you're in bad position (bottom)
  } else if (sweepKeywords.some(k => lowerMessage.includes(k))) {
    specificIntent = 'sweep';
    techniqueType = 'attack'; // Sweeps are offensive moves
    perspective = 'bottom'; // Sweeping = you're on bottom
  } else if (passKeywords.some(k => lowerMessage.includes(k))) {
    specificIntent = 'pass';
    techniqueType = 'attack';
    perspective = 'top'; // Passing = you're on top
  } else if (retentionKeywords.some(k => lowerMessage.includes(k))) {
    specificIntent = 'retention';
    techniqueType = 'defense';
    perspective = 'bottom'; // Retaining guard = you're on bottom
  } else if (takedownKeywords.some(k => lowerMessage.includes(k))) {
    specificIntent = 'takedown';
    techniqueType = 'attack';
    // No perspective for standing
  } else if (attackKeywords.some(k => lowerMessage.includes(k))) {
    specificIntent = 'attack';
    techniqueType = 'attack';
    // Could be either top or bottom depending on position
  }
  
  // OVERRIDE perspective based on explicit keywords (if intent didn't set it)
  if (!perspective) {
    if (hasTopIndicator && !hasBottomIndicator) {
      perspective = 'top';
    } else if (hasBottomIndicator && !hasTopIndicator) {
      perspective = 'bottom';
    }
  }
  
  // If no specific intent found, check general categories
  const defenseKeywords = ['defense', 'defend', 'defending', 'counter', 'countering', 'recover', 'recovering'];
  if (!specificIntent && defenseKeywords.some(k => lowerMessage.includes(k))) {
    techniqueType = 'defense';
  }
  
  let positionCategory: string | undefined;
  
  const positionMap: Record<string, string> = {
    'closed guard': 'closed_guard',
    'full guard': 'closed_guard',
    'open guard': 'open_guard',
    'spider guard': 'open_guard',
    'spider': 'open_guard',
    'de la riva': 'open_guard',
    'dlr': 'open_guard',
    'rdlr': 'open_guard',
    'reverse de la riva': 'open_guard',
    'butterfly guard': 'open_guard',
    'butterfly': 'open_guard',
    'x guard': 'open_guard',
    'x-guard': 'open_guard',
    'single leg x': 'open_guard',
    'slx': 'open_guard',
    'lasso guard': 'open_guard',
    'lasso': 'open_guard',
    'collar sleeve': 'open_guard',
    'half guard': 'half_guard',
    'half-guard': 'half_guard',
    'deep half': 'half_guard',
    'z guard': 'half_guard',
    'z-guard': 'half_guard',
    'knee shield': 'half_guard',
    'lockdown': 'half_guard',
    'mount': 'mount',
    'mounted': 'mount',
    'full mount': 'mount',
    's mount': 'mount',
    's-mount': 'mount',
    'high mount': 'mount',
    'low mount': 'mount',
    'side control': 'side_control',
    'side mount': 'side_control',
    'cross side': 'side_control',
    'cross-side': 'side_control',
    '100 kilos': 'side_control',
    'kesa gatame': 'side_control',
    'scarf hold': 'side_control',
    'back control': 'back',
    'back mount': 'back',
    'rear mount': 'back',
    'the back': 'back',
    'back take': 'back',
    'taking the back': 'back',
    'standing': 'standing',
    'stand up': 'standing',
    'takedown': 'standing',
    'takedowns': 'standing',
    'wrestling': 'standing',
    'judo': 'standing',
    'throws': 'standing',
    'throw': 'standing',
    'single leg': 'standing',
    'double leg': 'standing',
    'turtle': 'turtle',
    'front headlock': 'turtle',
    'leg lock': 'leg_entanglement',
    'leg locks': 'leg_entanglement',
    'heel hook': 'leg_entanglement',
    'heel hooks': 'leg_entanglement',
    'knee bar': 'leg_entanglement',
    'kneebar': 'leg_entanglement',
    'toe hold': 'leg_entanglement',
    'calf slicer': 'leg_entanglement',
    '50/50': 'leg_entanglement',
    'fifty fifty': 'leg_entanglement',
    'ashi garami': 'leg_entanglement',
    'ashi': 'leg_entanglement',
    'saddle': 'leg_entanglement',
    'inside sankaku': 'leg_entanglement',
    'north south': 'north_south',
    'north-south': 'north_south',
    'knee on belly': 'knee_on_belly',
    'kob': 'knee_on_belly',
    'passing': 'guard_passing',
    'guard pass': 'guard_passing',
    'guard passing': 'guard_passing',
    'pass guard': 'guard_passing'
  };
  
  for (const [keyword, category] of Object.entries(positionMap)) {
    if (lowerMessage.includes(keyword)) {
      positionCategory = category;
      break;
    }
  }
  
  const techniquePatterns = [
    'armbar', 'arm bar', 'juji gatame',
    'triangle', 'triangle choke', 'sankaku',
    'kimura', 'double wristlock',
    'americana', 'keylock', 'ude garami',
    'omoplata', 'omo plata',
    'guillotine', 'guillotine choke',
    'rear naked', 'rnc', 'mata leao', 'rear naked choke',
    'arm triangle', 'head and arm', 'kata gatame',
    'darce', "d'arce", 'brabo',
    'anaconda', 'anaconda choke',
    'ezekiel', 'ezequiel', 'sode guruma jime',
    'bow and arrow', 'bow arrow',
    'collar choke', 'cross collar', 'cross choke',
    'loop choke',
    'baseball choke', 'baseball bat',
    'north south choke',
    'clock choke',
    'hip bump', 'hip bump sweep',
    'scissor sweep', 'scissor',
    'flower sweep', 'pendulum sweep', 'pendulum',
    'elevator sweep',
    'knee slice', 'knee cut', 'knee slide',
    'torreando', 'toreando', 'bullfighter',
    'over under', 'over-under',
    'stack pass', 'stacking',
    'leg drag',
    'x pass',
    'smash pass', 'pressure pass',
    'long step', 'long step pass',
    'folding pass',
    'single leg', 'single leg takedown',
    'double leg', 'double leg takedown',
    'ankle pick',
    'snap down',
    'arm drag',
    'berimbolo', 'bolo',
    'kiss of the dragon',
    'crab ride',
    'shrimp', 'hip escape',
    'bridge', 'bridging',
    'frame', 'framing', 'frames',
    'underhook', 'underhooks',
    'overhook', 'whizzer'
  ];
  
  const rawSearchTerms: string[] = [];
  for (const technique of techniquePatterns) {
    if (lowerMessage.includes(technique)) {
      rawSearchTerms.push(technique);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TERM NORMALIZATION: Deduplicate overlapping phrases
  // If "triangle" and "triangle choke" both match, keep only "triangle choke" 
  // This prevents over-constraining AND conditions
  // ═══════════════════════════════════════════════════════════════════════════
  const searchTerms = rawSearchTerms.filter(term => {
    // Check if this term is a substring of any other term
    const isSubstringOfAnother = rawSearchTerms.some(otherTerm => 
      otherTerm !== term && otherTerm.includes(term)
    );
    return !isSubstringOfAnother;
  });
  
  if (rawSearchTerms.length !== searchTerms.length) {
    console.log(`[TERM NORMALIZATION] Deduplicated: [${rawSearchTerms.join(', ')}] → [${searchTerms.join(', ')}]`);
  }
  
  if (searchTerms.length === 0) {
    const words = lowerMessage.split(/\s+/);
    const stopWords = ['the', 'a', 'an', 'for', 'on', 'in', 'with', 'show', 'me', 'video', 'videos', 
      'how', 'to', 'do', 'can', 'you', 'help', 'my', 'i', 'get', 'keep', 'getting', 'from', 
      'when', 'what', 'why', 'any', 'some', 'more', 'good', 'best', 'need', 'want', 'like',
      'about', 'please', 'could', 'would', 'should'];
    const meaningful = words.filter(w => w.length > 3 && !stopWords.includes(w));
    searchTerms.push(...meaningful.slice(0, 3));
  }
  
  // Detect instructor request
  const requestedInstructor = extractRequestedInstructor(message);
  
  // CRITICAL FLAG: TRUE only if real technique terms were detected from techniquePatterns
  // FALSE if we only have fallback keywords from message splitting
  // This determines whether technique match is MANDATORY in video search
  const hasTechniqueTerms = rawSearchTerms.length > 0;
  
  return { techniqueType, positionCategory, searchTerms, specificIntent, perspective, requestedInstructor, hasTechniqueTerms };
}

export async function searchVideos(params: VideoSearchParams): Promise<VideoSearchResult> {
  const { userMessage, userId, conversationContext } = params;
  const intent = extractSearchIntent(userMessage);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DEBUG: VIDEO SEARCH TRACE - Added to diagnose wrong video returns
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('[VIDEO SEARCH DEBUG] User message:', userMessage);
  console.log('[VIDEO SEARCH DEBUG] Parsed intent:', JSON.stringify(intent, null, 2));
  console.log(`[VIDEO SEARCH DEBUG] hasTechniqueTerms=${intent.hasTechniqueTerms} (real technique match)`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FOLLOW-UP REFERENCE DETECTION
  // Handle phrases like "his videos", "their instructionals", "that instructor"
  // ═══════════════════════════════════════════════════════════════════════════
  const lowerMessage = userMessage.toLowerCase();
  const followUpPatterns = [
    'his video', 'his vid', 'his instructional', 'his content', 'his stuff',
    'their video', 'their vid', 'their instructional', 'their content', 'their stuff',
    'that instructor', 'that person', 'from them', 'from him', 'by him', 'by them',
    'do you have any of his', 'do you have videos of his', 'vids of his',
    'any videos from', 'show me his', 'show me their', 'recommend his', 'recommend their',
    'anything from him', 'anything from them', 'more from him', 'more from them'
  ];
  const isFollowUpReference = followUpPatterns.some(p => lowerMessage.includes(p));
  
  // Check session context for last instructor if this is a follow-up
  let resolvedInstructor = intent.requestedInstructor;
  if (!resolvedInstructor && isFollowUpReference) {
    // Try to get from conversation context
    if (conversationContext?.lastInstructor) {
      resolvedInstructor = conversationContext.lastInstructor;
      console.log(`[VIDEO SEARCH] 🔄 FOLLOW-UP DETECTED: Using session instructor "${resolvedInstructor}"`);
    }
    // Also try to get from session map if userId provided
    else if (userId) {
      const session = getSessionContext(userId);
      if (session.lastInstructor) {
        resolvedInstructor = session.lastInstructor;
        console.log(`[VIDEO SEARCH] 🔄 FOLLOW-UP DETECTED: Using session instructor "${resolvedInstructor}" (from userId)`);
      }
    }
    
    if (!resolvedInstructor) {
      console.log(`[VIDEO SEARCH] ⚠️ Follow-up detected but no lastInstructor in session`);
    }
  }
  
  // Update intent with resolved instructor for return value
  if (resolvedInstructor && !intent.requestedInstructor) {
    intent.requestedInstructor = resolvedInstructor;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RETRY LOGIC: Attempt database queries up to 3 times before failing
  // This prevents transient connection issues from returning wrong/cached results
  // ═══════════════════════════════════════════════════════════════════════════
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // BJJ-INTELLIGENT SEARCH: Position-first, title-matching, NO broad categories
    // ═══════════════════════════════════════════════════════════════════════════
    // 
    // PRINCIPLE: "Half guard escape" should ONLY return half guard videos.
    //            Triangle videos should NEVER appear for half guard queries.
    //
    // APPROACH:
    // 1. POSITION is MANDATORY when detected - this is the primary filter
    // 2. Use TITLE MATCHING for technique keywords - not broad technique_type
    // 3. Never broaden to generic "attack" or "defense" categories
    // 4. Let quality score sort the best content to the top
    // ═══════════════════════════════════════════════════════════════════════════
    
    const conditions: any[] = [];
    
    // Base quality threshold
    conditions.push(sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 6.5`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // NOTE: Removed mandatory videoKnowledge filter that was excluding all unanalyzed videos
    // Previously this required Gemini-analyzed knowledge records, but this was blocking
    // valid guillotine/technique searches when videoKnowledge table was empty or sparse.
    // The title/tag/techniqueName search is sufficient for finding relevant videos.
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[VIDEO SEARCH] ✅ Searching ALL qualifying videos (Gemini analysis not required)`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 0: INSTRUCTOR FILTER - ONLY apply when NO technique is specified
    // 
    // CRITICAL FIX (January 2026): Technique match takes PRIORITY over instructor.
    // If user mentions a technique (guillotine, armbar, etc.), we MUST return
    // videos matching that technique - instructor becomes OPTIONAL BOOST.
    // 
    // OLD (WRONG): Instructor filter was ALWAYS applied first, causing:
    //   "Marcelo Garcia guillotine" -> Returns ANY Marcelo video (including X-guard)
    // 
    // NEW (CORRECT): Technique is MANDATORY when present:
    //   "Marcelo Garcia guillotine" -> Returns ONLY guillotine videos (prefer Marcelo's)
    //   "Show me Marcelo Garcia videos" -> Returns all Marcelo videos (no technique)
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL: Use hasTechniqueTerms from intent, NOT searchTerms.length
    // searchTerms always has fallback keywords, hasTechniqueTerms only tracks REAL technique matches
    const hasTechniqueTerms = intent.hasTechniqueTerms;
    
    if (resolvedInstructor && !hasTechniqueTerms) {
      // ONLY filter by instructor when NO technique is specified
      conditions.push(ilike(aiVideoKnowledge.instructorName, `%${resolvedInstructor}%`));
      console.log(`[VIDEO SEARCH] 🎯 INSTRUCTOR LOCKED (no technique): ${resolvedInstructor}`);
    } else if (resolvedInstructor && hasTechniqueTerms) {
      // Technique IS specified - instructor becomes OPTIONAL BOOST (applied later in ranking)
      console.log(`[VIDEO SEARCH] 📌 TECHNIQUE PRIORITY: [${intent.searchTerms.join(', ')}] (instructor "${resolvedInstructor}" is optional boost)`);
    }
  
    // Exclude already-recommended videos
    if (conversationContext?.recommendedVideoIds?.length) {
      const excludeIds = conversationContext.recommendedVideoIds;
      conditions.push(sql`${aiVideoKnowledge.id} NOT IN (${sql.join(excludeIds.map(id => sql`${id}`), sql`, `)})`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: POSITION FILTER (CONDITIONAL - NOT mandatory when specific technique is mentioned)
    // If user mentions "half guard escape" - position matters
    // If user mentions "front headlock guillotine" - technique (guillotine) takes priority
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Check if user mentioned a specific named technique (these should take priority over position)
    const SPECIFIC_TECHNIQUES = [
      'guillotine', 'armbar', 'triangle', 'kimura', 'americana', 'omoplata',
      'rear naked', 'rnc', 'darce', "d'arce", 'anaconda', 'ezekiel', 'arm triangle',
      'bow and arrow', 'loop choke', 'baseball choke', 'north south choke',
      'heel hook', 'knee bar', 'kneebar', 'toe hold', 'calf slicer',
      'berimbolo', 'kiss of the dragon', 'leg drag', 'knee slice', 'knee cut'
    ];
    const hasSpecificTechnique = intent.searchTerms.some(term => 
      SPECIFIC_TECHNIQUES.some(t => term.toLowerCase().includes(t))
    );
    
    if (intent.positionCategory && !hasSpecificTechnique) {
      // Position filter is MANDATORY only when NO specific technique is mentioned
      // Handle positions that might be stored with different variations
      const positionVariations: string[] = [intent.positionCategory];
      
      // Add related position variations for broader matching
      if (intent.positionCategory === 'half_guard') {
        positionVariations.push('half guard', 'deep_half', 'deep half');
      } else if (intent.positionCategory === 'closed_guard') {
        positionVariations.push('closed guard', 'full_guard', 'guard');
      } else if (intent.positionCategory === 'open_guard') {
        positionVariations.push('open guard', 'spider', 'de_la_riva', 'butterfly');
      } else if (intent.positionCategory === 'side_control') {
        positionVariations.push('side control', 'cross_side', 'kesa_gatame');
      } else if (intent.positionCategory === 'back') {
        positionVariations.push('back_control', 'rear_mount');
      }
      
      // Position match is MANDATORY - use OR for variations
      const positionConditions = positionVariations.map(p => 
        sql`${aiVideoKnowledge.positionCategory} ILIKE ${`%${p.replace('_', '%')}%`}`
      );
      
      // Also check title for position mentions (catches videos with wrong category metadata)
      positionConditions.push(sql`${aiVideoKnowledge.title} ILIKE ${`%${intent.positionCategory.replace('_', ' ')}%`}`);
      
      conditions.push(or(...positionConditions));
      
      console.log(`[VIDEO SEARCH] 🎯 POSITION LOCKED: ${intent.positionCategory} (${positionVariations.length} variations)`);
    } else if (intent.positionCategory && hasSpecificTechnique) {
      // When specific technique is mentioned, position becomes OPTIONAL (prefer but don't require)
      console.log(`[VIDEO SEARCH] 📌 Position "${intent.positionCategory}" detected but TECHNIQUE "${intent.searchTerms.join(', ')}" takes priority`);
      console.log(`[VIDEO SEARCH] 📌 Searching technique across ALL positions (better coverage)`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: TECHNIQUE/INTENT FILTER (Title-based, NOT category-based)
    // Use actual keywords from user query, not broad "attack"/"defense" categories
    // ═══════════════════════════════════════════════════════════════════════════
    if (intent.specificIntent) {
      const intentTitleConditions: any[] = [];
      
      switch (intent.specificIntent) {
        case 'escape':
          // Match escape-specific title keywords
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%escape%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%get out%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%survival%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%stop getting%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%defense%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%recover%'`);
          // Also allow technique_type = 'defense' OR 'escape' (if position is locked)
          if (intent.positionCategory) {
            intentTitleConditions.push(sql`${aiVideoKnowledge.techniqueType} = 'defense'`);
            intentTitleConditions.push(sql`${aiVideoKnowledge.techniqueType} = 'escape'`);
          }
          conditions.push(or(...intentTitleConditions));
          break;
          
        case 'sweep':
          // Match sweep-specific keywords only
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%sweep%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%reversal%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.techniqueType} = 'sweep'`);
          conditions.push(or(...intentTitleConditions));
          break;
          
        case 'pass':
          // Match pass-specific keywords only
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%pass%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%passing%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.techniqueType} = 'pass'`);
          conditions.push(or(...intentTitleConditions));
          break;
          
        case 'retention':
          // Match retention-specific keywords
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%retention%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%keep%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%maintain%'`);
          if (intent.positionCategory) {
            intentTitleConditions.push(sql`${aiVideoKnowledge.techniqueType} = 'defense'`);
          }
          conditions.push(or(...intentTitleConditions));
          break;
          
        case 'attack':
          // ═══════════════════════════════════════════════════════════════════════════
          // FIX: For specific technique searches (guillotine, triangle, etc.), DON'T add
          // the restrictive technique_type='attack' filter. Let the searchTerms handle it.
          // This fixes the bug where "guillotine videos" returned leg locks because
          // guillotine videos might be stored as technique_type='submission' or 'choke'
          // ═══════════════════════════════════════════════════════════════════════════
          // ONLY add technique_type filter if:
          // 1. NO position is specified AND
          // 2. NO REAL technique terms were found (generic "attack" request)
          // Use hasTechniqueTerms (not searchTerms.length) to detect real techniques
          if (!intent.positionCategory && !hasTechniqueTerms) {
            conditions.push(eq(aiVideoKnowledge.techniqueType, 'attack'));
            console.log(`[VIDEO SEARCH] 📌 Generic attack filter applied (no specific technique)`);
          } else if (hasTechniqueTerms) {
            console.log(`[VIDEO SEARCH] 📌 Specific technique search: [${intent.searchTerms.join(', ')}] - skipping technique_type filter`);
          }
          break;
          
        case 'takedown':
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%takedown%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.title} ILIKE '%throw%'`);
          intentTitleConditions.push(sql`${aiVideoKnowledge.positionCategory} = 'standing'`);
          conditions.push(or(...intentTitleConditions));
          break;
      }
      
      console.log(`[VIDEO SEARCH] 🎯 INTENT: ${intent.specificIntent}`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: MANDATORY TECHNIQUE TERM MATCHING - SEARCH ALL GEMINI FIELDS
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Apply term matching ONLY when REAL technique terms exist.
    // Use hasTechniqueTerms (not searchTerms.length) to avoid false positives
    // from fallback keywords like instructor names.
    // 
    // This fixes "half guard guillotine" returning half guard videos without 
    // guillotine content, while also fixing "show me Marcelo videos" not
    // applying the instructor filter.
    // 
    // The REAL value of Gemini analysis is finding content by what's IN the video,
    // not just the title. A video called "Front Headlock System" should still appear
    // for "guillotine" if Gemini found guillotine content in it.
    // ═══════════════════════════════════════════════════════════════════════════
    if (hasTechniqueTerms) {
      // For EACH search term, create a MANDATORY match requirement
      // All terms must match (AND), but each term can match any field (OR)
      for (const term of intent.searchTerms) {
        const termMatchConditions: any[] = [
          // ═══════════════════════════════════════════════════════════════════
          // LEVEL 1: ai_video_knowledge fields (fast, direct lookup)
          // ═══════════════════════════════════════════════════════════════════
          sql`${aiVideoKnowledge.title} ILIKE ${`%${term}%`}`,
          sql`${aiVideoKnowledge.techniqueName} ILIKE ${`%${term}%`}`,
          sql`COALESCE(${aiVideoKnowledge.tags}, '{}')::text ILIKE ${`%${term}%`}`,
          sql`COALESCE(${aiVideoKnowledge.specificTechnique}, '') ILIKE ${`%${term}%`}`,
          // JSONB fields that might contain technique names
          sql`COALESCE(${aiVideoKnowledge.problemsSolved}::text, '') ILIKE ${`%${term}%`}`,
          sql`COALESCE(${aiVideoKnowledge.keyDetails}::text, '') ILIKE ${`%${term}%`}`,
          sql`COALESCE(${aiVideoKnowledge.relatedTechniques}::text, '') ILIKE ${`%${term}%`}`,
          
          // ═══════════════════════════════════════════════════════════════════
          // LEVEL 2: video_knowledge (Gemini-analyzed deep knowledge)
          // This is WHERE THE REAL VALUE IS - Gemini extracts techniques that
          // aren't even mentioned in the title!
          // ═══════════════════════════════════════════════════════════════════
          exists(
            db.select({ one: sql`1` })
              .from(videoKnowledge)
              .where(and(
                eq(videoKnowledge.videoId, aiVideoKnowledge.id),
                or(
                  // Core technique fields
                  sql`${videoKnowledge.techniqueName} ILIKE ${`%${term}%`}`,
                  sql`COALESCE(${videoKnowledge.positionContext}, '') ILIKE ${`%${term}%`}`,
                  // Instructor teaching content
                  sql`array_to_string(COALESCE(${videoKnowledge.keyConcepts}, '{}'), ' ') ILIKE ${`%${term}%`}`,
                  sql`array_to_string(COALESCE(${videoKnowledge.instructorTips}, '{}'), ' ') ILIKE ${`%${term}%`}`,
                  sql`array_to_string(COALESCE(${videoKnowledge.commonMistakes}, '{}'), ' ') ILIKE ${`%${term}%`}`,
                  // Summary and problem solving
                  sql`COALESCE(${videoKnowledge.fullSummary}, '') ILIKE ${`%${term}%`}`,
                  sql`COALESCE(${videoKnowledge.problemSolved}, '') ILIKE ${`%${term}%`}`,
                  // Technique chains and relationships
                  sql`array_to_string(COALESCE(${videoKnowledge.setupsFrom}, '{}'), ' ') ILIKE ${`%${term}%`}`,
                  sql`array_to_string(COALESCE(${videoKnowledge.chainsTo}, '{}'), ' ') ILIKE ${`%${term}%`}`,
                  sql`array_to_string(COALESCE(${videoKnowledge.counters}, '{}'), ' ') ILIKE ${`%${term}%`}`
                )
              ))
          )
        ];
        
        // MANDATORY: Video MUST match this term in at least one field
        conditions.push(or(...termMatchConditions));
        console.log(`[VIDEO SEARCH] 🔒 MANDATORY MATCH: "${term}" - searching ALL Gemini fields`);
      }
    }
    
    // Gi/Nogi preference
    if (conversationContext?.userGiNogi && conversationContext.userGiNogi !== 'both') {
      conditions.push(
        or(
          eq(aiVideoKnowledge.giOrNogi, conversationContext.userGiNogi),
          eq(aiVideoKnowledge.giOrNogi, 'both'),
          sql`${aiVideoKnowledge.giOrNogi} IS NULL`
        )
      );
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: PERSPECTIVE FILTER (Top vs Bottom content)
    // If user wants PASSING videos, exclude RETENTION/SWEEP content and vice versa
    // ═══════════════════════════════════════════════════════════════════════════
    if (intent.perspective === 'top') {
      // User wants TOP/PASSER content - find videos about passing/crushing/collapsing
      const topContentConditions: any[] = [
        sql`${aiVideoKnowledge.title} ILIKE '%pass%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%smash%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%pressure%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%collapse%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%kill%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%crush%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%beat%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%counter%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%defeat%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%open%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%break%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%top%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%passer%'`,
        sql`${aiVideoKnowledge.techniqueType} = 'pass'`
      ];
      conditions.push(or(...topContentConditions));
      console.log(`[VIDEO SEARCH] 🎯 PERSPECTIVE: TOP (passer) - filtering for passing/crushing content`);
    } else if (intent.perspective === 'bottom') {
      // User wants BOTTOM/GUARD content - find videos about playing/retaining/sweeping
      const bottomContentConditions: any[] = [
        sql`${aiVideoKnowledge.title} ILIKE '%sweep%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%retain%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%retention%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%escape%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%recover%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%play%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%guard game%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%from guard%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%bottom%'`,
        sql`${aiVideoKnowledge.title} ILIKE '%attack from%'`,
        sql`${aiVideoKnowledge.techniqueType} = 'sweep'`,
        sql`${aiVideoKnowledge.techniqueType} = 'defense'`,
        sql`${aiVideoKnowledge.techniqueType} = 'escape'`
      ];
      conditions.push(or(...bottomContentConditions));
      console.log(`[VIDEO SEARCH] 🎯 PERSPECTIVE: BOTTOM (guard) - filtering for retention/sweep/escape content`);
    }
    
    console.log(`[VIDEO SEARCH] Query: "${userMessage}"`);
    console.log(`[VIDEO SEARCH] Intent: ${intent.specificIntent || 'general'}, Position: ${intent.positionCategory || 'any'}, Perspective: ${intent.perspective || 'any'}, Terms: [${intent.searchTerms.join(', ')}]`);
    
    // Execute primary search
    let videos = await db.select()
      .from(aiVideoKnowledge)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(aiVideoKnowledge.qualityScore))
      .limit(50);
    
    console.log(`[VIDEO SEARCH] Primary search returned ${videos.length} videos`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: FALLBACK - If too few results, broaden within constraints
    // ═══════════════════════════════════════════════════════════════════════════
    
    // INSTRUCTOR FALLBACK: If instructor search returned few results, lower quality threshold
    // CRITICAL FIX: Only lock instructor when NO technique is specified
    // When technique IS specified, technique match remains MANDATORY
    if (videos.length < 3 && intent.requestedInstructor && !hasTechniqueTerms) {
      console.log(`[VIDEO SEARCH] ⚠️ Only ${videos.length} results for instructor ${intent.requestedInstructor} (no technique), lowering quality threshold`);
      
      // Simple instructor-only fallback: quality + instructor name only
      // No technique filters needed here since hasTechniqueTerms is false
      const fallbackConditions: any[] = [
        sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 5.0`,
        ilike(aiVideoKnowledge.instructorName, `%${intent.requestedInstructor}%`)
      ];
      
      videos = await db.select()
        .from(aiVideoKnowledge)
        .where(and(...fallbackConditions))
        .orderBy(desc(aiVideoKnowledge.qualityScore))
        .limit(50);
        
      console.log(`[VIDEO SEARCH] Instructor fallback search returned ${videos.length} videos`);
    }
    
    // TECHNIQUE + INSTRUCTOR FALLBACK: When both specified but few results,
    // keep technique mandatory but broaden to ALL instructors
    if (videos.length < 3 && resolvedInstructor && hasTechniqueTerms) {
      console.log(`[VIDEO SEARCH] ⚠️ Only ${videos.length} results for technique [${intent.searchTerms.join(', ')}] by ${resolvedInstructor}`);
      console.log(`[VIDEO SEARCH] 🔄 Broadening to ALL instructors for this technique (instructor becomes boost only)`);
      
      // Lower quality threshold but KEEP technique mandatory
      const fallbackConditions: any[] = [
        sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 5.5`
      ];
      
      // Add technique matching (MANDATORY)
      for (const term of intent.searchTerms) {
        const termMatchConditions: any[] = [
          sql`${aiVideoKnowledge.title} ILIKE ${`%${term}%`}`,
          sql`${aiVideoKnowledge.techniqueName} ILIKE ${`%${term}%`}`,
          sql`COALESCE(${aiVideoKnowledge.tags}, '{}')::text ILIKE ${`%${term}%`}`,
          sql`COALESCE(${aiVideoKnowledge.specificTechnique}, '') ILIKE ${`%${term}%`}`
        ];
        fallbackConditions.push(or(...termMatchConditions));
      }
      
      // NO instructor filter - just technique
      videos = await db.select()
        .from(aiVideoKnowledge)
        .where(and(...fallbackConditions))
        .orderBy(desc(aiVideoKnowledge.qualityScore))
        .limit(50);
      
      console.log(`[VIDEO SEARCH] Technique-only fallback returned ${videos.length} videos`);
    }
    
    // POSITION FALLBACK: Broaden within position category
    if (videos.length < 3 && intent.positionCategory && !intent.requestedInstructor) {
      console.log(`[VIDEO SEARCH] ⚠️ Only ${videos.length} results, broadening WITHIN position: ${intent.positionCategory}`);
      
      // Keep position locked, but remove intent/technique restrictions
      const fallbackConditions: any[] = [
        sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 6.5`
      ];
      
      // Position variations (same as above)
      const positionVariations: string[] = [intent.positionCategory];
      if (intent.positionCategory === 'half_guard') {
        positionVariations.push('half guard', 'deep_half');
      } else if (intent.positionCategory === 'closed_guard') {
        positionVariations.push('closed guard', 'full_guard');
      }
      
      const positionConditions = positionVariations.map(p => 
        sql`${aiVideoKnowledge.positionCategory} ILIKE ${`%${p.replace('_', '%')}%`}`
      );
      positionConditions.push(sql`${aiVideoKnowledge.title} ILIKE ${`%${intent.positionCategory.replace('_', ' ')}%`}`);
      fallbackConditions.push(or(...positionConditions));
      
      videos = await db.select()
        .from(aiVideoKnowledge)
        .where(and(...fallbackConditions))
        .orderBy(desc(aiVideoKnowledge.qualityScore))
        .limit(50);
        
      console.log(`[VIDEO SEARCH] Fallback search returned ${videos.length} videos`);
    }
    
    // Session focus boosting + INSTRUCTOR BOOSTING (keeps position-filtered results, just re-ranks)
    // CRITICAL: Instructor boost is applied HERE (after technique filtering) - not as a filter
    if (videos.length > 0) {
      videos = videos.map(v => {
        let boost = 0;
        const videoTags = v.tags || [];
        
        // Session focus boost
        if (conversationContext?.sessionFocus) {
          for (const [topic, count] of Object.entries(conversationContext.sessionFocus)) {
            const topicLower = topic.toLowerCase().replace('_', ' ');
            
            if (videoTags.some((t: string) => t.toLowerCase().includes(topicLower))) {
              boost += (count as number) * 2;
            }
            if (v.positionCategory?.includes(topic)) {
              boost += (count as number) * 3;
            }
            if (v.techniqueName?.toLowerCase().includes(topicLower)) {
              boost += (count as number) * 2;
            }
          }
        }
        
        // ═══════════════════════════════════════════════════════════════════════════
        // INSTRUCTOR BOOST: When technique + instructor are mentioned, prefer that instructor
        // This is an OPTIONAL boost, NOT a filter - technique match is still mandatory
        // ═══════════════════════════════════════════════════════════════════════════
        if (resolvedInstructor && hasTechniqueTerms) {
          const instructorMatch = v.instructorName?.toLowerCase().includes(resolvedInstructor.toLowerCase());
          if (instructorMatch) {
            boost += 50; // Significant boost for matching instructor
            console.log(`[VIDEO SEARCH] 🔥 INSTRUCTOR BOOST: "${v.title}" by ${v.instructorName}`);
          }
        }
        
        return { ...v, relevanceBoost: boost };
      }).sort((a: any, b: any) => {
        const scoreA = (Number(a.qualityScore) || 0) + (a.relevanceBoost || 0);
        const scoreB = (Number(b.qualityScore) || 0) + (b.relevanceBoost || 0);
        return scoreB - scoreA;
      });
    }
    
    // Limit to 2 videos per instructor for variety
    // BUT: Skip this limit when user specifically requested an instructor
    if (!intent.requestedInstructor) {
      const instructorCount: Record<string, number> = {};
      videos = videos.filter(v => {
        const instructor = v.instructorName || 'unknown';
        instructorCount[instructor] = (instructorCount[instructor] || 0) + 1;
        return instructorCount[instructor] <= 2;
      });
    }
    
    const countResult = await db.select({ count: sql`COUNT(*)` })
      .from(aiVideoKnowledge)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const totalMatches = Number(countResult[0]?.count) || 0;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // POST-VALIDATION: Verify returned videos ACTUALLY match the search terms
    // This catches edge cases where DB query succeeded but results don't match
    // ONLY runs when hasTechniqueTerms is true (real technique search, not instructor-only)
    // ═══════════════════════════════════════════════════════════════════════════
    let validatedVideos = videos;
    let searchTermsValidated = true;
    
    if (hasTechniqueTerms && videos.length > 0) {
      const termsLower = intent.searchTerms.map(t => t.toLowerCase());
      
      // Filter videos that ACTUALLY contain at least one of the search terms
      // CRITICAL: Include ALL fields we search in SQL to avoid false "no match" results
      validatedVideos = videos.filter(v => {
        const searchableText = [
          // From aiVideoKnowledge (SQL fields)
          v.title || '',
          v.techniqueName || '',
          v.specificTechnique || '',
          (v.tags || []).join(' '),
          JSON.stringify(v.problemsSolved || {}),
          JSON.stringify(v.keyDetails || {}),
          JSON.stringify(v.relatedTechniques || {}),
          // From videoKnowledge (Gemini fields) - may be in response if joined
          v.fullSummary || '',
          (v.instructorTips || []).join(' '),
          (v.keyConcepts || []).join(' '),
          (v.commonMistakes || []).join(' '),
          (v.setupsFrom || []).join(' '),
          (v.chainsTo || []).join(' '),
          (v.counters || []).join(' '),
          v.positionContext || '',
          v.problemSolved || ''
        ].join(' ').toLowerCase();
        
        return termsLower.some(term => searchableText.includes(term));
      });
      
      if (validatedVideos.length < videos.length) {
        console.log(`[VIDEO SEARCH] ⚠️ POST-VALIDATION: Removed ${videos.length - validatedVideos.length} videos that didn't contain search terms`);
        searchTermsValidated = validatedVideos.length > 0;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // LAST RESORT: COMPREHENSIVE search on ALL fields when zero results
    // Searches: title, techniqueName, tags, specificTechnique (covers all technique data)
    // This catches cases where videos exist but technique name is in tags not title
    // ONLY runs when hasTechniqueTerms is true (real technique search, not instructor-only)
    // ═══════════════════════════════════════════════════════════════════════════
    if (validatedVideos.length === 0 && hasTechniqueTerms) {
      console.log(`[VIDEO SEARCH] ⚡ LAST RESORT: COMPREHENSIVE search for [${intent.searchTerms.join(', ')}]`);
      
      // Search ALL text fields that could contain the technique name
      const directTermConditions = intent.searchTerms.map(term => 
        sql`(
          ${aiVideoKnowledge.title} ILIKE ${`%${term}%`} OR 
          ${aiVideoKnowledge.techniqueName} ILIKE ${`%${term}%`} OR
          ${aiVideoKnowledge.specificTechnique} ILIKE ${`%${term}%`} OR
          COALESCE(${aiVideoKnowledge.tags}, '{}')::text ILIKE ${`%${term}%`}
        )`
      );
      
      const directSearchResults = await db.select()
        .from(aiVideoKnowledge)
        .where(and(
          sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 5.0`, // Lower threshold for last resort
          or(...directTermConditions)
        ))
        .orderBy(desc(aiVideoKnowledge.qualityScore))
        .limit(15);
      
      if (directSearchResults.length > 0) {
        console.log(`[VIDEO SEARCH] 🎉 LAST RESORT SUCCESS: Found ${directSearchResults.length} videos!`);
        directSearchResults.forEach((v, i) => {
          console.log(`  ${i + 1}. "${v.title}" by ${v.instructorName} (quality: ${v.qualityScore}, tags: ${(v.tags || []).slice(0,3).join(', ')})`);
        });
        validatedVideos = directSearchResults;
      } else {
        console.log(`[VIDEO SEARCH] ❌ LAST RESORT: No videos found even after comprehensive search`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // DEBUG: Final results trace
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`[VIDEO SEARCH DEBUG] FINAL RESULTS: ${validatedVideos.length} videos`);
    console.log(`[VIDEO SEARCH DEBUG] Search terms: [${intent.searchTerms.join(', ')}]`);
    console.log('[VIDEO SEARCH DEBUG] First 5 videos:');
    validatedVideos.slice(0, 5).forEach((v, i) => {
      console.log(`  ${i + 1}. "${v.title}" by ${v.instructorName} (technique_type: ${v.techniqueType}, quality: ${v.qualityScore})`);
    });
    console.log('═══════════════════════════════════════════════════════════════');
    
    // Return noMatchFound=true if we have REAL technique terms but STILL zero results after last resort
    // Use hasTechniqueTerms (not searchTerms.length) to avoid false positives from fallback keywords
    const noMatchFound = hasTechniqueTerms && validatedVideos.length === 0;
    
    return {
      videos: validatedVideos.slice(0, 50),
      totalMatches: validatedVideos.length,
      searchIntent: intent,
      noMatchFound,
      searchTermsValidated
    };
  } catch (error) {
    // ═══════════════════════════════════════════════════════════════════════════
    // RETRY LOGIC: Retry on transient database errors, fail after MAX_RETRIES
    // ═══════════════════════════════════════════════════════════════════════════
    console.error(`[VIDEO SEARCH] Database error (attempt ${attempt}/${MAX_RETRIES}):`, error);
    
    if (attempt < MAX_RETRIES) {
      console.log(`[VIDEO SEARCH] ⏳ Retrying in ${RETRY_DELAY_MS}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      continue; // Retry the loop
    }
    
    // All retries exhausted - return noMatchFound=true to prevent wrong videos
    console.error(`[VIDEO SEARCH] ❌ All ${MAX_RETRIES} retries exhausted. Returning error state.`);
    return {
      videos: [],
      totalMatches: 0,
      searchIntent: intent,
      noMatchFound: true // CRITICAL: Prevents fallback from returning random videos
    };
  }
  } // End retry loop
  
  // Should never reach here, but return safe empty result if we do
  return {
    videos: [],
    totalMatches: 0,
    searchIntent: intent,
    noMatchFound: true
  };
}

export async function fallbackSearch(userMessage: string): Promise<VideoSearchResult> {
  const intent = extractSearchIntent(userMessage);
  
  // CRITICAL: Only return videos with Gemini-extracted knowledge
  const analyzedVideoFilter = exists(
    db.select({ one: sql`1` })
      .from(videoKnowledge)
      .where(eq(videoKnowledge.videoId, aiVideoKnowledge.id))
  );
  
  let videos;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 0: TECHNIQUE + INSTRUCTOR (when both are present)
  // CRITICAL FIX: When user mentions a technique, ALWAYS require technique match
  // even when they also mention an instructor. "Marcelo guillotine" must return
  // ONLY guillotine videos by Marcelo, not any random Marcelo video.
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL: Use intent.hasTechniqueTerms, NOT intent.searchTerms.length
  // searchTerms always has fallback keywords, hasTechniqueTerms only tracks REAL technique matches
  if (intent.requestedInstructor && intent.hasTechniqueTerms) {
    console.log(`[FALLBACK SEARCH] Using INSTRUCTOR + TECHNIQUE filter: ${intent.requestedInstructor} + [${intent.searchTerms.join(', ')}]`);
    
    // Build technique matching conditions (must match at least one term)
    const termConditions = intent.searchTerms.map(term => 
      sql`(${aiVideoKnowledge.title} ILIKE ${`%${term}%`} OR 
          ${aiVideoKnowledge.techniqueName} ILIKE ${`%${term}%`} OR
          COALESCE(${aiVideoKnowledge.tags}, '{}')::text ILIKE ${`%${term}%`})`
    );
    
    videos = await db.select()
      .from(aiVideoKnowledge)
      .where(and(
        sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 6.5`,
        ilike(aiVideoKnowledge.instructorName, `%${intent.requestedInstructor}%`),
        or(...termConditions), // MUST match the technique
        analyzedVideoFilter
      ))
      .orderBy(desc(aiVideoKnowledge.qualityScore))
      .limit(50);
  }
  // PRIORITY 0B: Instructor ONLY (when no technique specified)
  else if (intent.requestedInstructor) {
    console.log(`[FALLBACK SEARCH] Using instructor filter: ${intent.requestedInstructor} (ANALYZED only)`);
    videos = await db.select()
      .from(aiVideoKnowledge)
      .where(and(
        sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 6.5`,
        ilike(aiVideoKnowledge.instructorName, `%${intent.requestedInstructor}%`),
        analyzedVideoFilter
      ))
      .orderBy(desc(aiVideoKnowledge.qualityScore))
      .limit(50);
  }
  // PRIORITY 1: Position category is most specific - use it first
  // This prevents cross-contamination (e.g., half guard query returning leg lock videos)
  else if (intent.positionCategory) {
    console.log(`[FALLBACK SEARCH] Using position category: ${intent.positionCategory} (ANALYZED only)`);
    videos = await db.select()
      .from(aiVideoKnowledge)
      .where(and(
        sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 7.0`,
        eq(aiVideoKnowledge.positionCategory, intent.positionCategory),
        analyzedVideoFilter
      ))
      .orderBy(desc(aiVideoKnowledge.qualityScore))
      .limit(5);
  } 
  // PRIORITY 2: Use specific intent (pass, sweep, escape) with title matching
  // Avoid broad "attack"/"defense" categories that cause cross-contamination
  else if (intent.specificIntent && intent.specificIntent !== 'attack') {
    console.log(`[FALLBACK SEARCH] Using specific intent: ${intent.specificIntent} (ANALYZED only)`);
    const intentKeyword = intent.specificIntent;
    videos = await db.select()
      .from(aiVideoKnowledge)
      .where(and(
        sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 7.0`,
        sql`${aiVideoKnowledge.title} ILIKE ${`%${intentKeyword}%`}`,
        analyzedVideoFilter
      ))
      .orderBy(desc(aiVideoKnowledge.qualityScore))
      .limit(5);
  }
  // PRIORITY 3: Use REAL technique terms from message for COMPREHENSIVE matching
  // Searches: title, techniqueName, specificTechnique, tags
  // Only use this path when hasTechniqueTerms is true (real techniques detected)
  else if (intent.hasTechniqueTerms) {
    console.log(`[FALLBACK SEARCH] Using search terms: ${intent.searchTerms.join(', ')} (COMPREHENSIVE, ANALYZED only)`);
    const termConditions = intent.searchTerms.map(term => 
      sql`(
        ${aiVideoKnowledge.title} ILIKE ${`%${term}%`} OR
        ${aiVideoKnowledge.techniqueName} ILIKE ${`%${term}%`} OR
        ${aiVideoKnowledge.specificTechnique} ILIKE ${`%${term}%`} OR
        COALESCE(${aiVideoKnowledge.tags}, '{}')::text ILIKE ${`%${term}%`}
      )`
    );
    videos = await db.select()
      .from(aiVideoKnowledge)
      .where(and(
        sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 6.5`, // Lower threshold for better technique coverage
        or(...termConditions),
        analyzedVideoFilter
      ))
      .orderBy(desc(aiVideoKnowledge.qualityScore))
      .limit(10); // Increased limit for better variety
  }
  // PRIORITY 4: Last resort - return empty to avoid wrong recommendations
  else {
    console.log(`[FALLBACK SEARCH] No specific criteria found, returning empty to avoid cross-contamination`);
    videos = [];
  }
  
  console.log(`[FALLBACK SEARCH] Found ${videos.length} ANALYZED videos`);
  
  // Return noMatchFound=true if we have REAL technique terms but zero results
  // Use hasTechniqueTerms (not searchTerms.length) to avoid false positives from fallback keywords
  const noMatchFound = intent.hasTechniqueTerms && videos.length === 0;
  
  return { 
    videos, 
    totalMatches: videos.length,
    searchIntent: intent,
    noMatchFound
  };
}

// Session context manager for tracking topic focus across messages
const sessionContextMap = new Map<string, SessionContext>();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface SessionContext {
  sessionFocus: Record<string, number>;
  recommendedVideoIds: string[];
  lastActivity: number;
  lastInstructor?: string; // Track last mentioned instructor for follow-up references
}

export function getSessionContext(userId: string): SessionContext {
  const existing = sessionContextMap.get(userId);
  const now = Date.now();
  
  // Return existing if still fresh
  if (existing && (now - existing.lastActivity) < SESSION_TIMEOUT_MS) {
    return existing;
  }
  
  // Create new session
  const newSession: SessionContext = {
    sessionFocus: {},
    recommendedVideoIds: [],
    lastActivity: now
  };
  sessionContextMap.set(userId, newSession);
  return newSession;
}

export function updateSessionContext(userId: string, searchIntent: SearchIntent, recommendedVideoIds?: string[]): void {
  const session = getSessionContext(userId);
  session.lastActivity = Date.now();
  
  // Track instructor if detected (for follow-up references like "his videos")
  if (searchIntent.requestedInstructor) {
    session.lastInstructor = searchIntent.requestedInstructor;
    console.log(`[SESSION] Saved last instructor: ${searchIntent.requestedInstructor}`);
  }
  
  // Track technique type focus
  if (searchIntent.techniqueType) {
    session.sessionFocus[searchIntent.techniqueType] = (session.sessionFocus[searchIntent.techniqueType] || 0) + 1;
  }
  
  // Track position focus
  if (searchIntent.positionCategory) {
    session.sessionFocus[searchIntent.positionCategory] = (session.sessionFocus[searchIntent.positionCategory] || 0) + 1;
  }
  
  // Track search terms
  for (const term of searchIntent.searchTerms) {
    session.sessionFocus[term.toLowerCase()] = (session.sessionFocus[term.toLowerCase()] || 0) + 1;
  }
  
  // Track recommended videos to avoid repeats
  if (recommendedVideoIds) {
    for (const id of recommendedVideoIds) {
      if (!session.recommendedVideoIds.includes(id)) {
        session.recommendedVideoIds.push(id);
      }
    }
    // Keep only last 50 recommended videos
    if (session.recommendedVideoIds.length > 50) {
      session.recommendedVideoIds = session.recommendedVideoIds.slice(-50);
    }
  }
  
  sessionContextMap.set(userId, session);
}

export function clearSessionContext(userId: string): void {
  sessionContextMap.delete(userId);
}

// Periodic cleanup of stale sessions (runs every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of sessionContextMap.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      sessionContextMap.delete(userId);
    }
  }
}, 10 * 60 * 1000);

export function formatVideosForPrompt(videos: any[], totalMatches: number): string {
  if (videos.length === 0) {
    return '';
  }
  
  // Format each video with RICH Gemini analysis for AI to use
  const lines = videos.map((v, idx) => {
    const position = v.positionCategory?.replace('_', ' ') || '';
    const type = v.techniqueType || '';
    const tags = (v.tags || []).slice(0, 3).join(', ');
    
    // Build rich knowledge section from Gemini data
    let knowledgeDetails: string[] = [];
    
    // Instructor tips - QUOTE THESE
    if (v.instructorTips && Array.isArray(v.instructorTips) && v.instructorTips.length > 0) {
      knowledgeDetails.push(`   INSTRUCTOR TIPS: ${v.instructorTips.slice(0, 2).join('; ')}`);
    }
    
    // Common mistakes to avoid
    if (v.commonMistakes && Array.isArray(v.commonMistakes) && v.commonMistakes.length > 0) {
      knowledgeDetails.push(`   COMMON MISTAKES: ${v.commonMistakes.slice(0, 2).join('; ')}`);
    }
    
    // Key concepts
    if (v.keyConcepts && Array.isArray(v.keyConcepts) && v.keyConcepts.length > 0) {
      knowledgeDetails.push(`   KEY CONCEPTS: ${v.keyConcepts.slice(0, 3).join('; ')}`);
    }
    
    // Instructor quote
    if (v.instructorQuote) {
      knowledgeDetails.push(`   QUOTE: "${v.instructorQuote}"`);
    }
    
    // Technique chains
    if (v.chainsTo && Array.isArray(v.chainsTo) && v.chainsTo.length > 0) {
      knowledgeDetails.push(`   CHAINS TO: ${v.chainsTo.slice(0, 3).join(', ')}`);
    }
    
    // Timestamp for key content
    if (v.timestampStart) {
      knowledgeDetails.push(`   KEY TIMESTAMP: ${v.timestampStart}`);
    } else if (v.keyTimestamps && typeof v.keyTimestamps === 'string' && v.keyTimestamps.length > 0) {
      // Parse first timestamp from keyTimestamps field
      const firstTs = v.keyTimestamps.match(/(\d{1,2}:\d{2})/);
      if (firstTs) {
        knowledgeDetails.push(`   KEY TIMESTAMP: ${firstTs[1]}`);
      }
    }
    
    // Summary
    if (v.fullSummary) {
      knowledgeDetails.push(`   SUMMARY: ${v.fullSummary.substring(0, 150)}${v.fullSummary.length > 150 ? '...' : ''}`);
    }
    
    const header = `${idx + 1}. "${v.techniqueName || v.title}" by ${v.instructorName || 'Unknown'} [${type}/${position}] ${tags ? `(${tags})` : ''}`;
    
    if (knowledgeDetails.length > 0) {
      return header + '\n' + knowledgeDetails.join('\n');
    }
    return header;
  });
  
  let result = lines.join('\n\n');
  
  if (totalMatches > videos.length) {
    result += `\n\n(${totalMatches - videos.length} more videos available on this topic)`;
  }
  
  return result;
}

export async function getVideoLibrarySummary(): Promise<string> {
  const stats = await db.select({
    total: sql`COUNT(*)`,
    attacks: sql`COUNT(CASE WHEN technique_type = 'attack' THEN 1 END)`,
    defenses: sql`COUNT(CASE WHEN technique_type = 'defense' THEN 1 END)`,
    concepts: sql`COUNT(CASE WHEN technique_type = 'concept' THEN 1 END)`
  })
    .from(aiVideoKnowledge)
    .where(sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 6.5`);
  
  const positionStats = await db.select({
    position: aiVideoKnowledge.positionCategory,
    count: sql`COUNT(*)`
  })
    .from(aiVideoKnowledge)
    .where(sql`${aiVideoKnowledge.positionCategory} IS NOT NULL`)
    .groupBy(aiVideoKnowledge.positionCategory)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(10);
  
  const s = stats[0];
  const positions = positionStats.map(p => `${p.position?.replace('_', ' ')}: ${p.count}`).join(', ');
  
  return `Video Library: ${s.total} total (${s.attacks} attacks, ${s.defenses} defenses, ${s.concepts} concepts). Top positions: ${positions}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TECHNIQUE-PRIORITIZED VIDEO SEARCH (January 2026 Intelligence Upgrade)
// ═══════════════════════════════════════════════════════════════════════════════
// 
// CRITICAL FIX: Video search must prioritize TECHNIQUE MATCH over instructor.
// Previously: "Marcelo Garcia guillotine" → ANY Marcelo video (X-Guard, etc.)
// Now: "Marcelo Garcia guillotine" → Marcelo's GUILLOTINE videos specifically
//
// Uses ALL Gemini-analyzed fields for comprehensive technique matching with
// relevance scoring to rank results by how well they match the query.
// ═══════════════════════════════════════════════════════════════════════════════

const BJJ_TECHNIQUES = [
  // Chokes - High Priority
  'guillotine', 'high elbow guillotine', 'arm in guillotine', 'marcelotine',
  'triangle', 'triangle choke', 'mounted triangle',
  'rear naked choke', 'rnc', 'mata leão',
  'darce', "d'arce", 'brabo choke',
  'anaconda', 'anaconda choke',
  'arm triangle', 'head and arm', 'kata gatame',
  'ezekiel', 'ezequiel',
  'bow and arrow', 'bow and arrow choke',
  'cross collar', 'cross choke',
  'loop choke', 'clock choke', 'baseball bat choke', 'baseball choke',
  'north south choke',
  
  // Arm Locks
  'armbar', 'arm bar', 'juji gatame',
  'kimura', 'americana', 'keylock',
  'omoplata', 'gogoplata',
  
  // Leg Locks
  'heel hook', 'inside heel hook', 'outside heel hook',
  'knee bar', 'kneebar',
  'toe hold', 'toehold',
  'ankle lock', 'straight ankle lock', 'achilles lock',
  'calf slicer',
  
  // Guards - Bottom Positions
  'half guard', 'deep half', 'knee shield', 'z guard', 'lockdown',
  'closed guard', 'full guard',
  'open guard', 'spider guard', 'lasso guard',
  'de la riva', 'dlr', 'reverse de la riva', 'rdlr',
  'x guard', 'single leg x', 'slx',
  'butterfly guard', 'butterfly sweep',
  'worm guard', 'lapel guard',
  
  // Top Control
  'mount', 'mount escape', 's mount', 'technical mount', 'high mount',
  'back control', 'back take', 'back mount', 'body triangle',
  'side control', 'side mount', 'kesa gatame', 'scarf hold',
  'knee on belly', 'knee on chest',
  'north south',
  'turtle', 'turtle attack', 'turtle escape',
  
  // Passing
  'guard pass', 'passing', 'torreando', 'knee cut', 'knee slice',
  'smash pass', 'pressure pass', 'over under', 'leg drag', 'x pass',
  'stack pass', 'long step', 'headquarters',
  
  // Sweeps
  'sweep', 'scissor sweep', 'hip bump', 'pendulum sweep', 'flower sweep',
  'elevator sweep', 'hook sweep', 'tripod sweep',
  
  // Escapes & Defense
  'escape', 'shrimp', 'bridge', 'elbow escape', 'hip escape',
  'mount escape', 'side control escape', 'back escape',
  
  // Takedowns
  'takedown', 'single leg', 'double leg', 'ankle pick', 'arm drag',
  'duck under', 'snap down', 'throw', 'hip throw',
  
  // Transitions & Concepts
  'transition', 'scramble', 'reversal',
  'berimbolo', 'crab ride', 'kiss of the dragon',
  'frames', 'framing', 'underhook', 'overhook', 'whizzer',
  'posture', 'base', 'connection', 'pressure', 'leverage'
];

export function extractTechniques(text: string): string[] {
  const lowerText = text.toLowerCase();
  const found: string[] = [];
  
  for (const tech of BJJ_TECHNIQUES) {
    if (lowerText.includes(tech)) {
      found.push(tech);
    }
  }
  
  // Sort by specificity - longer phrases are more specific
  // This ensures "high elbow guillotine" is prioritized over "guillotine"
  found.sort((a, b) => b.length - a.length);
  
  // Deduplicate: remove general terms if specific variant exists
  // e.g., if "high elbow guillotine" matched, remove "guillotine"
  const deduped: string[] = [];
  for (const term of found) {
    const isSubsetOfAnother = found.some(otherTerm => 
      otherTerm !== term && otherTerm.includes(term)
    );
    if (!isSubsetOfAnother) {
      deduped.push(term);
    }
  }
  
  return deduped;
}

interface TechniqueVideoResult {
  id: number;
  youtubeId: string | null;
  title: string;
  techniqueName: string;
  instructorName: string | null;
  videoUrl: string;
  qualityScore: string | null;
  positionCategory: string | null;
  techniqueType: string | null;
  tags: string[] | null;
  specificTechnique: string | null;
  thumbnailUrl: string | null;
  relevanceScore: number;
  matchedFields: string[];
}

export async function searchVideosForTechnique(
  techniqueQuery: string, 
  instructorHint?: string, 
  limit: number = 5
): Promise<TechniqueVideoResult[]> {
  const searchTerm = techniqueQuery.toLowerCase().trim();
  const searchPattern = `%${searchTerm}%`;
  
  console.log(`[TECHNIQUE SEARCH] Searching for: "${searchTerm}" (instructor hint: ${instructorHint || 'none'})`);
  
  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1: Get candidate videos that match technique in ANY Gemini field
    // Search ALL fields where technique info might be stored
    // ═══════════════════════════════════════════════════════════════════════════
    
    const candidates = await db.select({
      id: aiVideoKnowledge.id,
      youtubeId: aiVideoKnowledge.youtubeId,
      title: aiVideoKnowledge.title,
      techniqueName: aiVideoKnowledge.techniqueName,
      instructorName: aiVideoKnowledge.instructorName,
      videoUrl: aiVideoKnowledge.videoUrl,
      qualityScore: aiVideoKnowledge.qualityScore,
      positionCategory: aiVideoKnowledge.positionCategory,
      techniqueType: aiVideoKnowledge.techniqueType,
      tags: aiVideoKnowledge.tags,
      specificTechnique: aiVideoKnowledge.specificTechnique,
      thumbnailUrl: aiVideoKnowledge.thumbnailUrl,
      problemsSolved: aiVideoKnowledge.problemsSolved,
      keyDetails: aiVideoKnowledge.keyDetails,
      relatedTechniques: aiVideoKnowledge.relatedTechniques,
    })
      .from(aiVideoKnowledge)
      .where(
        and(
          sql`COALESCE(${aiVideoKnowledge.qualityScore}, 0) >= 5.0`, // Lower threshold to get more candidates
          or(
            // Primary technique fields - HIGHEST PRIORITY
            sql`LOWER(${aiVideoKnowledge.techniqueName}) LIKE ${searchPattern}`,
            sql`LOWER(${aiVideoKnowledge.title}) LIKE ${searchPattern}`,
            sql`LOWER(COALESCE(${aiVideoKnowledge.specificTechnique}, '')) LIKE ${searchPattern}`,
            sql`COALESCE(${aiVideoKnowledge.tags}::text, '') ILIKE ${searchPattern}`,
            // Secondary technique context - JSONB fields
            sql`COALESCE(${aiVideoKnowledge.problemsSolved}::text, '') ILIKE ${searchPattern}`,
            sql`COALESCE(${aiVideoKnowledge.keyDetails}::text, '') ILIKE ${searchPattern}`,
            sql`COALESCE(${aiVideoKnowledge.relatedTechniques}::text, '') ILIKE ${searchPattern}`,
            // Also check videoKnowledge (Gemini) table
            exists(
              db.select({ one: sql`1` })
                .from(videoKnowledge)
                .where(and(
                  eq(videoKnowledge.videoId, aiVideoKnowledge.id),
                  or(
                    sql`LOWER(${videoKnowledge.techniqueName}) LIKE ${searchPattern}`,
                    sql`COALESCE(${videoKnowledge.keyConcepts}::text, '') ILIKE ${searchPattern}`,
                    sql`COALESCE(${videoKnowledge.instructorTips}::text, '') ILIKE ${searchPattern}`,
                    sql`COALESCE(${videoKnowledge.commonMistakes}::text, '') ILIKE ${searchPattern}`,
                    sql`COALESCE(${videoKnowledge.fullSummary}, '') ILIKE ${searchPattern}`,
                    sql`COALESCE(${videoKnowledge.setupsFrom}::text, '') ILIKE ${searchPattern}`,
                    sql`COALESCE(${videoKnowledge.chainsTo}::text, '') ILIKE ${searchPattern}`,
                    sql`COALESCE(${videoKnowledge.problemSolved}, '') ILIKE ${searchPattern}`
                  )
                ))
            )
          )
        )
      )
      .limit(limit * 6); // Get extra candidates for scoring
    
    console.log(`[TECHNIQUE SEARCH] Found ${candidates.length} candidate videos`);
    
    if (candidates.length === 0) {
      console.log(`[TECHNIQUE SEARCH] No videos found for "${searchTerm}"`);
      return [];
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2: Get Gemini knowledge for candidates to calculate relevance scores
    // ═══════════════════════════════════════════════════════════════════════════
    
    const videoIds = candidates.map(c => c.id);
    const knowledgeRecords = await db.select()
      .from(videoKnowledge)
      .where(inArray(videoKnowledge.videoId, videoIds));
    
    // Group knowledge by videoId
    const knowledgeMap = new Map<number, any[]>();
    for (const record of knowledgeRecords) {
      if (!knowledgeMap.has(record.videoId)) {
        knowledgeMap.set(record.videoId, []);
      }
      knowledgeMap.get(record.videoId)!.push(record);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3: Score and rank videos by technique relevance
    // ═══════════════════════════════════════════════════════════════════════════
    
    const scoredResults: TechniqueVideoResult[] = candidates.map(video => {
      let score = 0;
      const matchedFields: string[] = [];
      const lowerTechnique = searchTerm;
      
      // Helper to check and score field match
      const checkField = (value: string | null | undefined, fieldName: string, points: number): void => {
        if (value && value.toLowerCase().includes(lowerTechnique)) {
          score += points;
          matchedFields.push(fieldName);
        }
      };
      
      const checkArrayField = (value: string[] | null | undefined, fieldName: string, points: number): void => {
        if (value && value.some(v => v.toLowerCase().includes(lowerTechnique))) {
          score += points;
          matchedFields.push(fieldName);
        }
      };
      
      const checkJsonField = (value: any, fieldName: string, points: number): void => {
        if (value && JSON.stringify(value).toLowerCase().includes(lowerTechnique)) {
          score += points;
          matchedFields.push(fieldName);
        }
      };
      
      // ═══════════════════════════════════════════════════════════════════════════
      // SCORE HIERARCHY: Technique fields first, instructor is just a BOOST
      // ═══════════════════════════════════════════════════════════════════════════
      
      // PRIMARY TECHNIQUE FIELDS - Highest scores
      checkField(video.techniqueName, 'techniqueName', 100);
      checkField(video.specificTechnique, 'specificTechnique', 90);
      checkField(video.title, 'title', 60);
      checkArrayField(video.tags, 'tags', 50);
      
      // SECONDARY TECHNIQUE CONTEXT
      checkJsonField(video.problemsSolved, 'problemsSolved', 40);
      checkJsonField(video.keyDetails, 'keyDetails', 30);
      checkJsonField(video.relatedTechniques, 'relatedTechniques', 20);
      
      // GEMINI KNOWLEDGE FIELDS (Deep analysis)
      const knowledge = knowledgeMap.get(video.id) || [];
      for (const k of knowledge) {
        checkField(k.techniqueName, 'gemini.techniqueName', 80);
        checkArrayField(k.keyConcepts, 'gemini.keyConcepts', 45);
        checkArrayField(k.instructorTips, 'gemini.instructorTips', 35);
        checkArrayField(k.commonMistakes, 'gemini.commonMistakes', 25);
        checkField(k.fullSummary, 'gemini.fullSummary', 20);
        checkField(k.problemSolved, 'gemini.problemSolved', 30);
        checkArrayField(k.setupsFrom, 'gemini.setupsFrom', 15);
        checkArrayField(k.chainsTo, 'gemini.chainsTo', 15);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // INSTRUCTOR BOOST - Only adds points if BOTH technique AND instructor match
      // This is a BOOST, not the primary factor
      // ═══════════════════════════════════════════════════════════════════════════
      if (instructorHint && video.instructorName?.toLowerCase().includes(instructorHint.toLowerCase())) {
        if (score > 0) { // Only boost if technique already matched
          score += 25;
          matchedFields.push('instructorMatch');
        }
      }
      
      // QUALITY MULTIPLIER - Higher quality videos rank higher among equally relevant
      const quality = parseFloat(video.qualityScore || '7') / 10;
      score *= quality;
      
      return {
        id: video.id,
        youtubeId: video.youtubeId,
        title: video.title,
        techniqueName: video.techniqueName,
        instructorName: video.instructorName,
        videoUrl: video.videoUrl,
        qualityScore: video.qualityScore,
        positionCategory: video.positionCategory,
        techniqueType: video.techniqueType,
        tags: video.tags,
        specificTechnique: video.specificTechnique,
        thumbnailUrl: video.thumbnailUrl,
        relevanceScore: score,
        matchedFields
      };
    });
    
    // Sort by relevance score (highest first), return top results
    const results = scoredResults
      .filter(r => r.relevanceScore > 0) // Only include videos that actually matched
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
    
    console.log(`[TECHNIQUE SEARCH] Returning ${results.length} videos for "${searchTerm}":`);
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. "${r.title}" by ${r.instructorName} (score: ${r.relevanceScore.toFixed(1)}, matched: ${r.matchedFields.join(', ')})`);
    });
    
    return results;
    
  } catch (error) {
    console.error('[TECHNIQUE SEARCH] Error:', error);
    return [];
  }
}

export async function getRelevantVideosForChat(
  userMessage: string, 
  aiResponse?: string, 
  instructorMentioned?: string
): Promise<TechniqueVideoResult[]> {
  // Extract techniques from both user message and AI response
  const combinedText = userMessage + (aiResponse ? ' ' + aiResponse : '');
  const techniques = extractTechniques(combinedText);
  
  if (techniques.length === 0) {
    console.log('[CHAT VIDEO SEARCH] No specific technique mentioned');
    return [];
  }
  
  // Use the most specific technique (first after sorting by length)
  const primaryTechnique = techniques[0];
  console.log(`[CHAT VIDEO SEARCH] Primary technique: "${primaryTechnique}" (from ${techniques.length} detected)`);
  
  // Search for videos matching the TECHNIQUE, with instructor as optional boost
  const videos = await searchVideosForTechnique(
    primaryTechnique,
    instructorMentioned, // Instructor hint (boost, not filter)
    3
  );
  
  return videos;
}
