import { db } from '../db';
import { aiVideoKnowledge, videoKnowledge } from '../../shared/schema';
import { sql, ilike, or, and, eq } from 'drizzle-orm';

/**
 * 🧠 KNOWLEDGE SYNTHESIZER V1
 * 
 * Groups extracted Gemini knowledge by topic across instructors.
 * Instead of sending Claude a list of videos, we send SYNTHESIZED knowledge.
 * 
 * This transforms raw video data into structured expert knowledge.
 */

export interface InstructorApproach {
  name: string;
  instructor: string;
  coreConcept: string;
  keyDetail: string;
  timestamp: string;
  videoId: number;
  videoUrl: string;
  bestFor: string;
  instructorQuote?: string;
}

export interface SynthesizedKnowledge {
  topic: string;
  summary: string;
  approachCount: number;
  approaches: InstructorApproach[];
  commonMistakes: string[];
  prerequisites: string[];
  chainsTo: string[];
  bodyTypeNotes: Map<string, string>;
  skillLevels: string[];
  giOrNogi: 'gi' | 'nogi' | 'both' | 'unknown';
}

/**
 * Synthesize knowledge across all videos for a specific topic
 * Returns grouped, de-duplicated knowledge ready for prompt injection
 */
export async function synthesizeKnowledgeByTopic(
  topic: string,
  userId?: string
): Promise<SynthesizedKnowledge> {
  console.log(`[KNOWLEDGE SYNTHESIZER] Synthesizing knowledge for topic: ${topic}`);
  
  const normalizedTopic = topic.toLowerCase().replace(/[-_]/g, ' ').trim();
  const topicVariants = generateTopicVariants(normalizedTopic);
  
  // Find all videos related to this topic with quality threshold
  const matchedVideos = await db.select({
    id: aiVideoKnowledge.id,
    title: aiVideoKnowledge.title,
    instructorName: aiVideoKnowledge.instructorName,
    techniqueName: aiVideoKnowledge.techniqueName,
    techniqueType: aiVideoKnowledge.techniqueType,
    videoUrl: aiVideoKnowledge.videoUrl,
    qualityScore: aiVideoKnowledge.qualityScore
  })
    .from(aiVideoKnowledge)
    .where(
      and(
        eq(aiVideoKnowledge.status, 'active'),
        sql`CAST(${aiVideoKnowledge.qualityScore} AS NUMERIC) >= 7.0`,
        or(
          ...topicVariants.map(v => ilike(aiVideoKnowledge.techniqueName, `%${v}%`)),
          ...topicVariants.map(v => ilike(aiVideoKnowledge.title, `%${v}%`)),
          ...topicVariants.map(v => ilike(aiVideoKnowledge.techniqueType, `%${v}%`))
        )
      )
    )
    .limit(20);
  
  console.log(`[KNOWLEDGE SYNTHESIZER] Found ${matchedVideos.length} videos for topic: ${topic}`);
  
  if (matchedVideos.length === 0) {
    return createEmptySynthesis(topic);
  }
  
  // Fetch extracted knowledge for matched videos
  const videoIds = matchedVideos.map(v => v.id);
  const knowledgeRows = await db.select({
      id: videoKnowledge.id,
      videoId: videoKnowledge.videoId,
      techniqueName: videoKnowledge.techniqueName,
      positionContext: videoKnowledge.positionContext,
      keyConcepts: videoKnowledge.keyConcepts,
      instructorTips: videoKnowledge.instructorTips,
      commonMistakes: videoKnowledge.commonMistakes,
      timestampStart: videoKnowledge.timestampStart,
      fullSummary: videoKnowledge.fullSummary,
      techniqueType: videoKnowledge.techniqueType,
      giOrNogi: videoKnowledge.giOrNogi,
      skillLevel: videoKnowledge.skillLevel,
      competitionLegal: videoKnowledge.competitionLegal,
      detailType: videoKnowledge.detailType,
      detailDescription: videoKnowledge.detailDescription,
      instructorQuote: videoKnowledge.instructorQuote,
      whyItMatters: videoKnowledge.whyItMatters,
      problemSolved: videoKnowledge.problemSolved,
      setupsFrom: videoKnowledge.setupsFrom,
      chainsTo: videoKnowledge.chainsTo,
      counters: videoKnowledge.counters,
      counterTo: videoKnowledge.counterTo,
      bodyTypeNotes: videoKnowledge.bodyTypeNotes,
      strengthRequired: videoKnowledge.strengthRequired,
      flexibilityRequired: videoKnowledge.flexibilityRequired,
      athleticDemand: videoKnowledge.athleticDemand,
      instructorName: videoKnowledge.instructorName,
      instructorCredentials: videoKnowledge.instructorCredentials,
      prerequisites: videoKnowledge.prerequisites,
      nextToLearn: videoKnowledge.nextToLearn,
      bestFor: videoKnowledge.bestFor,
    })
    .from(videoKnowledge)
    .where(sql`${videoKnowledge.videoId} = ANY(ARRAY[${sql.join(videoIds, sql`, `)}]::integer[])`);
  
  // Group knowledge by video
  const knowledgeByVideo = new Map<number, typeof knowledgeRows>();
  for (const row of knowledgeRows) {
    if (!knowledgeByVideo.has(row.videoId)) {
      knowledgeByVideo.set(row.videoId, []);
    }
    knowledgeByVideo.get(row.videoId)!.push(row);
  }
  
  // Build approaches from each instructor
  const approaches: InstructorApproach[] = [];
  const allMistakes = new Set<string>();
  const allPrereqs = new Set<string>();
  const allChains = new Set<string>();
  const bodyTypeNotes = new Map<string, string>();
  const skillLevels = new Set<string>();
  let giCount = 0, nogiCount = 0, bothCount = 0;
  
  for (const video of matchedVideos) {
    const knowledge = knowledgeByVideo.get(video.id);
    if (!knowledge || knowledge.length === 0) continue;
    
    // Use first knowledge entry for this video (usually the main technique)
    const k = knowledge[0];
    
    // Build approach
    const approach: InstructorApproach = {
      name: k.techniqueName || video.techniqueName || 'Technique',
      instructor: video.instructorName || 'Unknown',
      coreConcept: k.keyConcepts?.[0] || 'Core technique',
      keyDetail: k.instructorTips?.[0] || k.detailDescription?.substring(0, 100) || '',
      timestamp: k.timestampStart || '0:00',
      videoId: video.id,
      videoUrl: video.videoUrl || '',
      bestFor: k.bestFor || k.bodyTypeNotes || 'all practitioners',
      instructorQuote: k.instructorQuote || undefined
    };
    approaches.push(approach);
    
    // Aggregate common mistakes
    if (k.commonMistakes?.length) {
      k.commonMistakes.forEach(m => allMistakes.add(m));
    }
    
    // Aggregate prerequisites
    if (k.prerequisites?.length) {
      k.prerequisites.forEach(p => allPrereqs.add(p));
    }
    
    // Aggregate chains
    if (k.chainsTo?.length) {
      k.chainsTo.forEach(c => allChains.add(c));
    }
    
    // Track body type notes by instructor
    if (k.bodyTypeNotes) {
      bodyTypeNotes.set(video.instructorName || 'Unknown', k.bodyTypeNotes);
    }
    
    // Track skill levels
    if (k.skillLevel) {
      skillLevels.add(k.skillLevel);
    }
    
    // Track gi/nogi
    if (k.giOrNogi === 'gi') giCount++;
    else if (k.giOrNogi === 'nogi') nogiCount++;
    else if (k.giOrNogi === 'both') bothCount++;
  }
  
  // Determine overall gi/nogi
  let giOrNogi: 'gi' | 'nogi' | 'both' | 'unknown' = 'unknown';
  if (bothCount > 0 || (giCount > 0 && nogiCount > 0)) {
    giOrNogi = 'both';
  } else if (giCount > nogiCount) {
    giOrNogi = 'gi';
  } else if (nogiCount > giCount) {
    giOrNogi = 'nogi';
  }
  
  // Generate summary
  const topInstructors = Array.from(new Set(approaches.map(a => a.instructor))).slice(0, 3);
  const summary = approaches.length === 1
    ? `${approaches[0].instructor}'s approach to ${topic}`
    : `${approaches.length} different approaches from ${topInstructors.join(', ')}${topInstructors.length < approaches.length ? ', and more' : ''}`;
  
  return {
    topic,
    summary,
    approachCount: approaches.length,
    approaches: approaches.slice(0, 5), // Top 5 approaches
    commonMistakes: Array.from(allMistakes).slice(0, 5),
    prerequisites: Array.from(allPrereqs).slice(0, 4),
    chainsTo: Array.from(allChains).slice(0, 5),
    bodyTypeNotes,
    skillLevels: Array.from(skillLevels),
    giOrNogi
  };
}

/**
 * Format synthesized knowledge for prompt injection
 * This creates the "expert knowledge" framing
 */
export function formatSynthesizedKnowledge(knowledge: SynthesizedKnowledge): string {
  if (knowledge.approachCount === 0) {
    return '';
  }
  
  let output = `
═══════════════════════════════════════════════════════════════════════════════
YOUR KNOWLEDGE ON: ${knowledge.topic.toUpperCase()}
═══════════════════════════════════════════════════════════════════════════════

You've studied this extensively. Here's what you know:

${knowledge.summary}

`;

  // Add each approach
  knowledge.approaches.forEach((a, i) => {
    output += `APPROACH ${i + 1}: ${a.name}
└── Instructor: ${a.instructor}
└── Core concept: "${a.coreConcept}"
${a.keyDetail ? `└── Key detail: ${a.keyDetail}` : ''}
${a.bestFor ? `└── Best for: ${a.bestFor}` : ''}
${a.instructorQuote ? `└── Quote: "${a.instructorQuote.substring(0, 80)}${a.instructorQuote.length > 80 ? '...' : ''}"` : ''}
└── Reference: [VIDEO: ${a.name} by ${a.instructor} | START: ${a.timestamp}]

`;
  });

  // Add common mistakes
  if (knowledge.commonMistakes.length > 0) {
    output += `COMMON MISTAKES YOU'VE SEEN:
${knowledge.commonMistakes.map(m => `• ${m}`).join('\n')}

`;
  }

  // Add prerequisites
  if (knowledge.prerequisites.length > 0) {
    output += `PREREQUISITES (what they should know first):
${knowledge.prerequisites.map(p => `• ${p}`).join('\n')}

`;
  }

  // Add chains
  if (knowledge.chainsTo.length > 0) {
    output += `THIS CHAINS TO:
${knowledge.chainsTo.map(c => `• ${c}`).join('\n')}

`;
  }

  // Add gi/nogi context
  if (knowledge.giOrNogi !== 'unknown') {
    const giNote = knowledge.giOrNogi === 'both' 
      ? 'Works in both gi and no-gi'
      : knowledge.giOrNogi === 'gi' 
        ? 'Primarily a gi technique'
        : 'Primarily a no-gi technique';
    output += `STYLE: ${giNote}

`;
  }

  output += `Speak from this knowledge naturally. You KNOW this material.`;

  return output;
}

/**
 * Generate topic variants for fuzzy matching
 * "knee shield" → ["knee shield", "kneeshield", "knee-shield"]
 */
function generateTopicVariants(topic: string): string[] {
  const variants = new Set<string>();
  
  // Original
  variants.add(topic);
  
  // Without spaces
  variants.add(topic.replace(/\s+/g, ''));
  
  // With hyphens
  variants.add(topic.replace(/\s+/g, '-'));
  
  // With underscores
  variants.add(topic.replace(/\s+/g, '_'));
  
  // Common BJJ term mappings
  const mappings: Record<string, string[]> = {
    'half guard': ['half_guard', 'halfguard', 'half-guard'],
    'closed guard': ['closed_guard', 'closedguard'],
    'open guard': ['open_guard', 'openguard'],
    'knee shield': ['knee_shield', 'kneeshield', 'z guard', 'z-guard'],
    'z guard': ['knee shield', 'knee_shield', 'kneeshield'],
    'side control': ['side_control', 'sidecontrol', 'cross side', 'crossside'],
    'mount': ['mounted', 'full mount', 'full_mount'],
    'back control': ['back_control', 'backcontrol', 'back take', 'back_take'],
    'arm bar': ['armbar', 'arm_bar', 'armlock', 'arm lock'],
    'triangle': ['triangle choke', 'triangle_choke', 'sankaku'],
    'kimura': ['double wrist lock', 'chicken wing'],
    'americana': ['keylock', 'key lock', 'ude garami'],
    'guillotine': ['guillotine choke', 'guillotine_choke'],
    'rear naked': ['rear naked choke', 'rnc', 'mata leao'],
    'leg lock': ['leglock', 'leg_lock', 'lower body attack'],
    'heel hook': ['heelhook', 'heel_hook'],
    'knee cut': ['knee slice', 'knee_cut', 'kneecut', 'knee_slice'],
    'passing': ['pass', 'guard pass', 'guard_pass'],
    'sweep': ['sweeps', 'reversal'],
    'escape': ['escapes', 'escaping']
  };
  
  // Add mapped variants
  for (const [key, values] of Object.entries(mappings)) {
    if (topic.includes(key)) {
      values.forEach(v => variants.add(topic.replace(key, v)));
    }
    for (const v of values) {
      if (topic.includes(v)) {
        variants.add(topic.replace(v, key));
      }
    }
  }
  
  return Array.from(variants);
}

function createEmptySynthesis(topic: string): SynthesizedKnowledge {
  return {
    topic,
    summary: '',
    approachCount: 0,
    approaches: [],
    commonMistakes: [],
    prerequisites: [],
    chainsTo: [],
    bodyTypeNotes: new Map(),
    skillLevels: [],
    giOrNogi: 'unknown'
  };
}

/**
 * Detect topics from user message using BJJ terminology
 * Returns array of detected topics for knowledge synthesis
 */
export function detectTopicsFromMessage(message: string): string[] {
  const normalizedMessage = message.toLowerCase();
  const topics: string[] = [];
  
  // Position keywords
  const positions = [
    'closed guard', 'open guard', 'half guard', 'butterfly guard', 'spider guard',
    'lasso guard', 'de la riva', 'reverse de la riva', 'x guard', 'single leg x',
    'mount', 'side control', 'back control', 'turtle', 'north south',
    'knee on belly', 'headquarters', 'standing', 'takedown'
  ];
  
  // Technique types
  const techniqueTypes = [
    'pass', 'passing', 'sweep', 'sweeps', 'escape', 'escapes',
    'submission', 'attack', 'defense', 'control', 'transition',
    'takedown', 'guard retention', 'recovery'
  ];
  
  // Specific techniques
  const techniques = [
    'arm bar', 'armbar', 'triangle', 'kimura', 'americana', 'guillotine',
    'rear naked', 'rnc', 'darce', 'd\'arce', 'anaconda', 'ezekiel',
    'heel hook', 'knee bar', 'toe hold', 'calf slicer', 'leg lock',
    'knee cut', 'knee slice', 'toreando', 'leg drag', 'long step',
    'hip escape', 'shrimp', 'bridge', 'upa', 'elbow knee',
    'single leg', 'double leg', 'ankle pick', 'snap down'
  ];
  
  // Check for positions
  for (const pos of positions) {
    if (normalizedMessage.includes(pos)) {
      topics.push(pos);
    }
  }
  
  // Check for technique types (often combined with positions)
  for (const type of techniqueTypes) {
    if (normalizedMessage.includes(type)) {
      // Try to find position + type combinations
      for (const pos of positions) {
        if (normalizedMessage.includes(pos)) {
          topics.push(`${pos} ${type}`);
        }
      }
      if (topics.length === 0) {
        topics.push(type);
      }
    }
  }
  
  // Check for specific techniques
  for (const tech of techniques) {
    if (normalizedMessage.includes(tech)) {
      topics.push(tech);
    }
  }
  
  // Deduplicate and return
  return Array.from(new Set(topics)).slice(0, 3); // Max 3 topics
}
