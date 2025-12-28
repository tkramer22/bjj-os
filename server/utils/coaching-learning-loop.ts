import { db } from '../db';
import { coachingInterventionOutcomes, userLearningAnalytics } from '../../shared/schema';
import { sql, eq, and, desc, gte } from 'drizzle-orm';

/**
 * 🔄 COACHING LEARNING LOOP
 * 
 * Layer 5 of the Professor OS Enhancement
 * Tracks what coaching approaches work and builds aggregate insights
 * 
 * This makes Professor OS smarter over time by learning from:
 * - Which instructor approaches work for which user types
 * - What common struggles exist at each belt level
 * - What breakthrough moments look like
 */

export interface CoachingOutcome {
  userId: string;
  topic: string;
  approachUsed: string;
  instructorRecommended: string;
  videoRecommended?: string;
  userResponse: 'positive' | 'neutral' | 'negative' | 'unknown';
  followUpAsked: boolean;
  reportedSuccess: boolean;
  conversationId?: string;
}

export interface TechniqueInsight {
  technique: string;
  mostEffectiveApproach: string;
  mostEffectiveInstructor: string;
  commonStruggles: string[];
  breakthroughMoments: string[];
  successRate: number;
  beltLevelPatterns: {
    whiteBelt: { commonIssue: string; bestFix: string } | null;
    blueBelt: { commonIssue: string; bestFix: string } | null;
    purpleBelt: { commonIssue: string; bestFix: string } | null;
  };
}

/**
 * Track a coaching outcome after a conversation
 * Called after Professor OS provides advice and user responds
 */
export async function trackCoachingOutcome(outcome: CoachingOutcome): Promise<void> {
  try {
    await db.insert(coachingInterventionOutcomes).values({
      userId: outcome.userId,
      interventionType: 'coaching_advice',
      interventionContent: outcome.approachUsed,
      interventionContext: {
        topic: outcome.topic,
        instructor: outcome.instructorRecommended,
        video: outcome.videoRecommended
      },
      userImmediateResponse: outcome.userResponse,
      userAcknowledged: outcome.userResponse === 'positive',
      userExpressedDoubt: outcome.userResponse === 'negative',
      userFollowedAdvice: outcome.reportedSuccess,
      interventionSuccessful: outcome.reportedSuccess,
      outcomeLabel: outcome.reportedSuccess ? 'highly_effective' : 
                   outcome.userResponse === 'positive' ? 'somewhat_effective' : 'ineffective'
    });
    
    console.log(`[LEARNING LOOP] Tracked coaching outcome for ${outcome.topic}`);
  } catch (err) {
    console.error('[LEARNING LOOP] Error tracking outcome:', err);
  }
}

/**
 * Analyze user response to determine sentiment
 * Looks for success indicators in their follow-up messages
 */
export function analyzeUserResponse(message: string): 'positive' | 'neutral' | 'negative' | 'unknown' {
  const normalizedMessage = message.toLowerCase();
  
  // Positive indicators
  const positivePatterns = [
    'worked', 'helped', 'thanks', 'thank you', 'got it', 'makes sense',
    'nailed it', 'hit it', 'finally', 'clicked', 'breakthrough', 'awesome',
    'perfect', 'exactly what i needed', 'that was it', 'you were right'
  ];
  
  // Negative indicators
  const negativePatterns = [
    'didn\'t work', 'not working', 'still stuck', 'doesn\'t make sense',
    'confused', 'struggling', 'can\'t get', 'keeps failing', 'frustrated',
    'that\'s not', 'wrong', 'doesn\'t help', 'not what i meant'
  ];
  
  // Check patterns
  for (const pattern of positivePatterns) {
    if (normalizedMessage.includes(pattern)) {
      return 'positive';
    }
  }
  
  for (const pattern of negativePatterns) {
    if (normalizedMessage.includes(pattern)) {
      return 'negative';
    }
  }
  
  // Check for questions (neutral - still exploring)
  if (normalizedMessage.includes('?')) {
    return 'neutral';
  }
  
  return 'unknown';
}

/**
 * Detect if user is reporting success with a technique
 * Used to track when coaching advice leads to results
 */
export function detectSuccessReport(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  
  const successPatterns = [
    'it worked', 'worked!', 'finally got', 'nailed', 'hit it', 
    'tapped them', 'escaped', 'passed', 'swept', 'submitted',
    'breakthrough', 'clicked', 'makes sense now', 'i get it now',
    'used it in rolling', 'worked in training', 'tried what you said'
  ];
  
  return successPatterns.some(pattern => normalizedMessage.includes(pattern));
}

/**
 * Get aggregate insights for a technique based on coaching history
 * Used to inform future coaching with what has worked before
 */
export async function getTechniqueInsights(technique: string): Promise<TechniqueInsight | null> {
  try {
    // Get all coaching outcomes for this technique from last 90 days
    const outcomes = await db.select()
      .from(coachingInterventionOutcomes)
      .where(
        and(
          sql`${coachingInterventionOutcomes.interventionContext}->>'topic' ILIKE ${`%${technique}%`}`,
          gte(coachingInterventionOutcomes.interventionDate, sql`NOW() - INTERVAL '90 days'`)
        )
      )
      .orderBy(desc(coachingInterventionOutcomes.interventionDate))
      .limit(100);
    
    if (outcomes.length === 0) {
      return null;
    }
    
    // Analyze patterns
    const instructorCounts: Record<string, { success: number; total: number }> = {};
    const approachCounts: Record<string, { success: number; total: number }> = {};
    const struggles: string[] = [];
    const breakthroughs: string[] = [];
    
    for (const outcome of outcomes) {
      const context = outcome.interventionContext as any;
      const instructor = context?.instructor || 'Unknown';
      const approach = outcome.interventionContent || 'General';
      
      // Track instructor effectiveness
      if (!instructorCounts[instructor]) {
        instructorCounts[instructor] = { success: 0, total: 0 };
      }
      instructorCounts[instructor].total++;
      if (outcome.interventionSuccessful) {
        instructorCounts[instructor].success++;
      }
      
      // Track approach effectiveness
      if (!approachCounts[approach]) {
        approachCounts[approach] = { success: 0, total: 0 };
      }
      approachCounts[approach].total++;
      if (outcome.interventionSuccessful) {
        approachCounts[approach].success++;
      }
      
      // Collect struggles (from unsuccessful outcomes)
      if (!outcome.interventionSuccessful && outcome.userImmediateResponse) {
        struggles.push(outcome.userImmediateResponse);
      }
      
      // Collect breakthroughs (from successful outcomes)
      if (outcome.interventionSuccessful && outcome.interventionContent) {
        breakthroughs.push(outcome.interventionContent);
      }
    }
    
    // Find most effective instructor
    let mostEffectiveInstructor = 'Unknown';
    let highestInstructorRate = 0;
    for (const [instructor, stats] of Object.entries(instructorCounts)) {
      const rate = stats.total >= 3 ? stats.success / stats.total : 0;
      if (rate > highestInstructorRate) {
        highestInstructorRate = rate;
        mostEffectiveInstructor = instructor;
      }
    }
    
    // Find most effective approach
    let mostEffectiveApproach = 'General';
    let highestApproachRate = 0;
    for (const [approach, stats] of Object.entries(approachCounts)) {
      const rate = stats.total >= 3 ? stats.success / stats.total : 0;
      if (rate > highestApproachRate) {
        highestApproachRate = rate;
        mostEffectiveApproach = approach;
      }
    }
    
    // Calculate overall success rate
    const totalSuccess = outcomes.filter(o => o.interventionSuccessful).length;
    const successRate = outcomes.length > 0 ? totalSuccess / outcomes.length : 0;
    
    return {
      technique,
      mostEffectiveApproach,
      mostEffectiveInstructor,
      commonStruggles: Array.from(new Set(struggles)).slice(0, 5),
      breakthroughMoments: Array.from(new Set(breakthroughs)).slice(0, 5),
      successRate,
      beltLevelPatterns: {
        whiteBelt: null, // TODO: Implement belt-level analysis
        blueBelt: null,
        purpleBelt: null
      }
    };
  } catch (err) {
    console.error('[LEARNING LOOP] Error getting technique insights:', err);
    return null;
  }
}

/**
 * Format learned insights for prompt injection
 * Adds population-level learnings to enhance coaching
 */
export function formatLearnedInsights(insights: TechniqueInsight[]): string {
  if (insights.length === 0) {
    return '';
  }
  
  let output = `
═══════════════════════════════════════════════════════════════════════════════
WHAT YOU'VE LEARNED FROM COACHING (Population Insights)
═══════════════════════════════════════════════════════════════════════════════

From your coaching experience with users on these techniques:

`;

  for (const insight of insights) {
    output += `${insight.technique.toUpperCase()}:
• Most effective approach: ${insight.mostEffectiveApproach}
• Best instructor for this: ${insight.mostEffectiveInstructor}
• Success rate: ${Math.round(insight.successRate * 100)}%
${insight.commonStruggles.length > 0 ? `• Common struggles: ${insight.commonStruggles.join(', ')}` : ''}
${insight.breakthroughMoments.length > 0 ? `• What makes it click: ${insight.breakthroughMoments[0]}` : ''}

`;
  }

  output += `Use these insights to personalize your coaching approach.`;
  
  return output;
}

/**
 * Weekly job to aggregate learnings and enhance knowledge
 * Run this on a schedule (e.g., Sundays at 2 AM)
 */
export async function runWeeklyKnowledgeEnhancement(): Promise<void> {
  console.log('[LEARNING LOOP] Starting weekly knowledge enhancement...');
  
  try {
    // Get most discussed techniques from last 7 days
    const hotTopics = await db.execute(sql`
      SELECT 
        ${coachingInterventionOutcomes.interventionContext}->>'topic' as topic,
        COUNT(*) as conversation_count,
        SUM(CASE WHEN intervention_successful THEN 1 ELSE 0 END) as success_count
      FROM ${coachingInterventionOutcomes}
      WHERE intervention_date >= NOW() - INTERVAL '7 days'
        AND ${coachingInterventionOutcomes.interventionContext}->>'topic' IS NOT NULL
      GROUP BY ${coachingInterventionOutcomes.interventionContext}->>'topic'
      ORDER BY conversation_count DESC
      LIMIT 10
    `);
    
    console.log(`[LEARNING LOOP] Found ${(hotTopics as any).length} hot topics this week`);
    
    // Generate insights for each hot topic
    for (const topic of (hotTopics as any)) {
      const insights = await getTechniqueInsights(topic.topic);
      if (insights) {
        console.log(`[LEARNING LOOP] Generated insights for ${topic.topic}: ${Math.round(insights.successRate * 100)}% success rate`);
      }
    }
    
    console.log('[LEARNING LOOP] Weekly knowledge enhancement complete');
  } catch (err) {
    console.error('[LEARNING LOOP] Error in weekly enhancement:', err);
  }
}
