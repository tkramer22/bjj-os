import { db } from './db';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { 
  bjjUsers,
  ecosystemTechniqueEffectiveness,
  ecosystemProblemSolutions,
  collaborativeIntelligence,
  userPatternInterventions,
  userTechniqueAttempts,
  userConceptualUnderstanding,
  userLearningAnalytics,
  userBreakthroughPredictions,
  type BjjUser
} from '../shared/schema';

/**
 * PROFESSOR OS HYPER-INTELLIGENT SYSTEM PROMPT BUILDER
 * 
 * This function dynamically builds an enhanced system prompt by:
 * 1. Analyzing the user's message to determine relevant intelligence modules
 * 2. Fetching ecosystem data (what works for similar users)
 * 3. Loading user-specific patterns and predictions
 * 4. Assembling only the relevant context sections
 * 
 * This is ADDITIVE - it enhances the existing Professor OS prompt without replacing it.
 */

interface IntelligenceContext {
  ecosystemTechniques?: any[];
  ecosystemSolutions?: any[];
  collaborativeInsights?: any[];
  activePatterns?: any[];
  techniqueHistory?: any[];
  learningProfile?: any;
  conceptualGaps?: any[];
  breakthroughPredictions?: any[];
}

/**
 * Analyze user message to determine which intelligence modules to load
 */
function analyzeMessageIntent(message: string): {
  needsEcosystemData: boolean;
  needsPatternData: boolean;
  needsTechniqueHistory: boolean;
  needsLearningAnalytics: boolean;
  needsBreakthroughPredictions: boolean;
} {
  const lowerMessage = message.toLowerCase();
  
  // Keywords that indicate need for different data types
  const techniqueKeywords = ['technique', 'move', 'submission', 'pass', 'guard', 'sweep', 'escape', 'position'];
  const problemKeywords = ['stuck', 'struggling', 'can\'t', 'having trouble', 'difficult', 'hard time', 'problem'];
  const progressKeywords = ['progress', 'improving', 'getting better', 'learning', 'breakthrough'];
  const injuryKeywords = ['pain', 'hurt', 'injury', 'sore', 'injured'];
  
  const hasTechniqueIntent = techniqueKeywords.some(kw => lowerMessage.includes(kw));
  const hasProblemIntent = problemKeywords.some(kw => lowerMessage.includes(kw));
  const hasProgressIntent = progressKeywords.some(kw => lowerMessage.includes(kw));
  const hasInjuryIntent = injuryKeywords.some(kw => lowerMessage.includes(kw));
  
  return {
    needsEcosystemData: hasTechniqueIntent || hasProblemIntent,
    needsPatternData: hasProblemIntent || hasInjuryIntent,
    needsTechniqueHistory: hasTechniqueIntent || hasProgressIntent,
    needsLearningAnalytics: hasProgressIntent,
    needsBreakthroughPredictions: hasProgressIntent
  };
}

/**
 * Fetch ecosystem intelligence for similar users
 */
async function fetchEcosystemIntelligence(user: BjjUser, intent: ReturnType<typeof analyzeMessageIntent>): Promise<Partial<IntelligenceContext>> {
  if (!intent.needsEcosystemData) {
    return {};
  }

  try {
    // Fetch top techniques that work for users like them
    const ecosystemTechniques = await db.select()
      .from(ecosystemTechniqueEffectiveness)
      .where(and(
        eq(ecosystemTechniqueEffectiveness.beltLevel, user.belt || 'all'),
        eq(ecosystemTechniqueEffectiveness.bodyType, user.bodyType || 'all'),
        eq(ecosystemTechniqueEffectiveness.style, user.style || 'both')
      ))
      .orderBy(desc(ecosystemTechniqueEffectiveness.successRate))
      .limit(5);

    // Fetch proven solutions to common problems
    const ecosystemSolutions = await db.select()
      .from(ecosystemProblemSolutions)
      .where(and(
        eq(ecosystemProblemSolutions.beltLevel, user.belt || 'all'),
        eq(ecosystemProblemSolutions.bodyType, user.bodyType || 'all')
      ))
      .orderBy(desc(ecosystemProblemSolutions.successRate))
      .limit(5);

    // Fetch recent breakthroughs from similar users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const collaborativeInsights = await db.select()
      .from(collaborativeIntelligence)
      .where(and(
        eq(collaborativeIntelligence.userBelt, user.belt || 'white'),
        gte(collaborativeIntelligence.achievedAt, thirtyDaysAgo)
      ))
      .orderBy(desc(collaborativeIntelligence.achievedAt))
      .limit(3);

    return {
      ecosystemTechniques,
      ecosystemSolutions,
      collaborativeInsights
    };
  } catch (error) {
    console.error('[INTELLIGENCE] Error fetching ecosystem data:', error);
    return {};
  }
}

/**
 * Fetch user-specific pattern data
 */
async function fetchUserPatterns(userId: string, intent: ReturnType<typeof analyzeMessageIntent>): Promise<Partial<IntelligenceContext>> {
  if (!intent.needsPatternData) {
    return {};
  }

  try {
    // Fetch active patterns requiring attention (high/critical priority, not addressed)
    const activePatterns = await db.select()
      .from(userPatternInterventions)
      .where(and(
        eq(userPatternInterventions.userId, userId),
        eq(userPatternInterventions.addressed, false)
      ))
      .orderBy(desc(userPatternInterventions.occurrenceCount))
      .limit(5);

    return { activePatterns };
  } catch (error) {
    console.error('[INTELLIGENCE] Error fetching user patterns:', error);
    return {};
  }
}

/**
 * Fetch user technique history
 */
async function fetchTechniqueHistory(userId: string, intent: ReturnType<typeof analyzeMessageIntent>): Promise<Partial<IntelligenceContext>> {
  if (!intent.needsTechniqueHistory) {
    return {};
  }

  try {
    // Get last 90 days of technique attempts
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const techniqueHistory = await db.select()
      .from(userTechniqueAttempts)
      .where(and(
        eq(userTechniqueAttempts.userId, userId),
        gte(userTechniqueAttempts.attemptedAt, ninetyDaysAgo)
      ))
      .orderBy(desc(userTechniqueAttempts.attemptedAt))
      .limit(20);

    // Aggregate by technique name
    const aggregated = techniqueHistory.reduce((acc: any[], attempt) => {
      const existing = acc.find(t => t.name === attempt.techniqueName);
      if (existing) {
        existing.attempts++;
        if (attempt.successful) existing.successes++;
        existing.lastAttempt = attempt.attemptedAt;
      } else {
        acc.push({
          name: attempt.techniqueName,
          attempts: 1,
          successes: attempt.successful ? 1 : 0,
          stage: attempt.learningStage || 'practice',
          lastAttempt: attempt.attemptedAt,
          successRate: 0
        });
      }
      return acc;
    }, []);

    // Calculate success rates
    aggregated.forEach(t => {
      t.successRate = t.attempts > 0 ? Math.round((t.successes / t.attempts) * 100) : 0;
    });

    return { techniqueHistory: aggregated };
  } catch (error) {
    console.error('[INTELLIGENCE] Error fetching technique history:', error);
    return {};
  }
}

/**
 * Fetch learning analytics
 */
async function fetchLearningAnalytics(userId: string, intent: ReturnType<typeof analyzeMessageIntent>): Promise<Partial<IntelligenceContext>> {
  if (!intent.needsLearningAnalytics) {
    return {};
  }

  try {
    const [learningProfile] = await db.select()
      .from(userLearningAnalytics)
      .where(eq(userLearningAnalytics.userId, userId))
      .limit(1);

    // Fetch conceptual gaps
    const conceptualGaps = await db.select()
      .from(userConceptualUnderstanding)
      .where(and(
        eq(userConceptualUnderstanding.userId, userId),
        eq(userConceptualUnderstanding.needsReinforcement, true)
      ))
      .limit(5);

    return {
      learningProfile,
      conceptualGaps
    };
  } catch (error) {
    console.error('[INTELLIGENCE] Error fetching learning analytics:', error);
    return {};
  }
}

/**
 * Fetch breakthrough predictions
 */
async function fetchBreakthroughPredictions(userId: string, intent: ReturnType<typeof analyzeMessageIntent>): Promise<Partial<IntelligenceContext>> {
  if (!intent.needsBreakthroughPredictions) {
    return {};
  }

  try {
    const breakthroughPredictions = await db.select()
      .from(userBreakthroughPredictions)
      .where(and(
        eq(userBreakthroughPredictions.userId, userId),
        eq(userBreakthroughPredictions.breakthroughAchieved, false)
      ))
      .orderBy(desc(userBreakthroughPredictions.confidence))
      .limit(3);

    return { breakthroughPredictions };
  } catch (error) {
    console.error('[INTELLIGENCE] Error fetching breakthrough predictions:', error);
    return {};
  }
}

/**
 * Build enhanced system prompt sections from intelligence context
 */
function buildIntelligencePromptSections(context: IntelligenceContext, user: BjjUser): string {
  let sections = '';

  // Ecosystem Intelligence Section
  if (context.ecosystemTechniques && context.ecosystemTechniques.length > 0) {
    sections += `\n\n═══════════════════════════════════════════════════════════════════════════════
ECOSYSTEM INTELLIGENCE - WHAT WORKS FOR USERS LIKE YOU
═══════════════════════════════════════════════════════════════════════════════

TOP TECHNIQUES FOR ${user.belt?.toUpperCase()} / ${user.bodyType || 'ALL BODY TYPES'} / ${user.style?.toUpperCase()}:

${context.ecosystemTechniques.map(t => `
- ${t.techniqueName}: ${Math.round(t.successRate)}% success rate (proven by ${t.userCount} users)
  Average proficiency time: ${t.averageSessionsToLearn || 'varies'} sessions
  Category: ${t.category || 'general'}
`).join('')}

USE THIS DATA NATURALLY:
- Don't say "73% success rate" → Say "this works really well for people at your level"
- Don't say "analysis shows" → Say "I've seen this click for a lot of ${user.belt} belts"
- Don't say "data indicates" → Say "this is proven to work for grapplers with your build"
`;
  }

  // Problem Solutions Section
  if (context.ecosystemSolutions && context.ecosystemSolutions.length > 0) {
    sections += `\n\nPROVEN SOLUTIONS FOR COMMON PROBLEMS:

${context.ecosystemSolutions.map(s => `
Problem: ${s.problemDescription}
Best Solution: ${s.solutionTechnique} (${Math.round(s.successRate)}% effective)
${s.instructor ? `Taught by: ${s.instructor}` : ''}
Proven by: ${s.usersSolved} users with similar profiles
`).join('\n')}
`;
  }

  // Collaborative Insights Section
  if (context.collaborativeInsights && context.collaborativeInsights.length > 0) {
    sections += `\n\nRECENT BREAKTHROUGHS FROM SIMILAR USERS:

${context.collaborativeInsights.map(ci => `
- ${ci.technique} solved: "${ci.problemSolved}"
  Time to success: ${ci.sessionsToSuccess || 'varies'} sessions
  User context: ${ci.userBelt} belt / ${ci.userBodyType || 'various'} build
`).join('\n')}
`;
  }

  // Active Patterns Section
  if (context.activePatterns && context.activePatterns.length > 0) {
    sections += `\n\n═══════════════════════════════════════════════════════════════════════════════
ACTIVE PATTERNS REQUIRING ATTENTION
═══════════════════════════════════════════════════════════════════════════════

${context.activePatterns.map((pattern, i) => `
${i + 1}. **${pattern.patternType.toUpperCase()}** [${pattern.urgency?.toUpperCase() || 'MEDIUM'} PRIORITY]
   Problem: ${pattern.description}
   Occurrences: ${pattern.occurrenceCount} times over ${pattern.daysSinceFirst || '?'} days
   ${!pattern.addressed ? '⚠️ NOT YET ADDRESSED - Mention this naturally if relevant' : '✓ Previously mentioned, monitor progress'}
`).join('\n')}

CRITICAL: If any HIGH or CRITICAL patterns exist and are relevant to current conversation,
address them proactively. Don't wait for them to ask.
`;
  }

  // Technique History Section
  if (context.techniqueHistory && context.techniqueHistory.length > 0) {
    sections += `\n\n═══════════════════════════════════════════════════════════════════════════════
TECHNIQUE HISTORY & LEARNING PROGRESS (Last 90 days)
═══════════════════════════════════════════════════════════════════════════════

${context.techniqueHistory.slice(0, 10).map(t => `
- ${t.name}: ${t.attempts} attempts, ${t.successes} successful (${t.stage} stage)
  Success rate: ${t.successRate}%
  Last practiced: ${new Date(t.lastAttempt).toLocaleDateString()}
`).join('')}
`;
  }

  // Learning Profile Section
  if (context.learningProfile) {
    sections += `\n\nLEARNING PROFILE:

Learning Style: ${context.learningProfile.learningStyle || 'analyzing...'}
Prefers: ${context.learningProfile.instructionDepth || 'balanced'} instruction
Retention: ${context.learningProfile.retentionRate ? Math.round(context.learningProfile.retentionRate) + '%' : 'building data...'}
Progress trend: ${context.learningProfile.progressTrend || 'steady'}
Learning speed: ${context.learningProfile.averageSessionsToGrasp || '?'} sessions average to grasp techniques
`;
  }

  // Conceptual Gaps Section
  if (context.conceptualGaps && context.conceptualGaps.length > 0) {
    sections += `\n\nCONCEPTUAL GAPS TO ADDRESS:

${context.conceptualGaps.map(gap => `
- ${gap.concept}: Level ${gap.understandingLevel || '?'}/10 ${gap.needsReinforcement ? '(needs reinforcement)' : ''}
  Category: ${gap.category || 'general'}
  Times applied: ${gap.timesApplied || 0}
`).join('')}

When teaching, focus on strengthening these fundamental concepts naturally.
`;
  }

  // Breakthrough Predictions Section
  if (context.breakthroughPredictions && context.breakthroughPredictions.length > 0) {
    sections += `\n\nPREDICTED BREAKTHROUGHS:

${context.breakthroughPredictions.map(pred => `
- ${pred.technique}: Expected ${pred.predictedWindow || 'soon'} (${pred.confidence || 'medium'} confidence)
  Current stage: ${pred.currentStage || 'practice'}
  ${pred.signals && pred.signals.length > 0 ? `Signals: ${pred.signals.join(', ')}` : ''}
`).join('\n')}

If relevant, mention naturally: "You're close to a breakthrough with this..."
`;
  }

  return sections;
}

/**
 * MAIN FUNCTION: Build hyper-intelligent system prompt
 * 
 * This analyzes the user's message and dynamically loads only the relevant
 * intelligence modules, then injects them into the system prompt.
 */
export async function buildHyperIntelligentSystemPrompt(
  user: BjjUser,
  userMessage: string,
  baseSystemPrompt: string
): Promise<string> {
  try {
    console.log(`[INTELLIGENCE] Building enhanced context for user ${user.id}`);

    // Step 1: Analyze message to determine what to load
    const intent = analyzeMessageIntent(userMessage);
    console.log('[INTELLIGENCE] Message intent:', intent);

    // Step 2: Fetch relevant intelligence modules in parallel
    const [ecosystem, patterns, techniqueHistory, learningAnalytics, breakthroughs] = await Promise.all([
      fetchEcosystemIntelligence(user, intent),
      fetchUserPatterns(user.id, intent),
      fetchTechniqueHistory(user.id, intent),
      fetchLearningAnalytics(user.id, intent),
      fetchBreakthroughPredictions(user.id, intent)
    ]);

    // Step 3: Merge all context
    const context: IntelligenceContext = {
      ...ecosystem,
      ...patterns,
      ...techniqueHistory,
      ...learningAnalytics,
      ...breakthroughs
    };

    // Step 4: Build enhanced sections
    const intelligenceSections = buildIntelligencePromptSections(context, user);

    // Step 5: Inject into base prompt (append to existing prompt)
    const enhancedPrompt = baseSystemPrompt + intelligenceSections;

    console.log(`[INTELLIGENCE] Enhanced prompt built: ${intelligenceSections.length} chars added`);

    return enhancedPrompt;
  } catch (error) {
    console.error('[INTELLIGENCE] Error building enhanced prompt:', error);
    // Fallback to base prompt if enhancement fails
    return baseSystemPrompt;
  }
}

/**
 * Utility function to format ecosystem data naturally in responses
 */
export function formatEcosystemInsight(technique: string, successRate: number, userCount: number): string {
  if (successRate >= 80) {
    return `${technique} works really well for people at your level`;
  } else if (successRate >= 60) {
    return `${technique} is solid - I've seen good results with it`;
  } else {
    return `${technique} can work, though results vary`;
  }
}
