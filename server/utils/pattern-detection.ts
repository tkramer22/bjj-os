import { db } from '../db';
import { 
  userPatternInterventions, 
  userInjuryProfile,
  trainingPartners
} from '@shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';

/**
 * LAYER 3: PATTERN DETECTION
 * Automatically detects patterns from existing data:
 * - Recurring problems (userPatternInterventions)
 * - Injury escalation (userInjuryProfile)
 * - Opponent dominance (trainingPartners)
 */

interface DetectedPattern {
  type: 'recurring_problem' | 'injury_escalation' | 'opponent_dominance' | 'breakthrough_potential';
  severity: 'low' | 'medium' | 'high';
  description: string;
  action_required: string;
}

export async function detectPatterns(userId: string): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = [];
  
  console.log('[PATTERN DETECTION] Analyzing patterns for user:', userId);
  
  // 1. Check for recurring problems (mentioned 3+ times, not addressed)
  try {
    const recurringProblems = await db.query.userPatternInterventions.findMany({
      where: and(
        eq(userPatternInterventions.userId, userId),
        eq(userPatternInterventions.patternType, 'recurring_problem'),
        eq(userPatternInterventions.addressed, false)
      ),
      orderBy: [desc(userPatternInterventions.occurrenceCount)]
    });
    
    for (const problem of recurringProblems) {
      if ((problem.occurrenceCount || 0) >= 3) {
        patterns.push({
          type: 'recurring_problem',
          severity: 'high',
          description: `${problem.description} mentioned ${problem.occurrenceCount} times`,
          action_required: 'Create focused solution plan in next conversation'
        });
      }
    }
  } catch (error) {
    console.error('[PATTERN DETECTION] Error checking recurring problems:', error);
  }
  
  // 2. Check for injury escalation (active injuries with multiple mentions)
  try {
    const injuryProfile = await db.query.userInjuryProfile.findFirst({
      where: eq(userInjuryProfile.userId, userId)
    });
    
    if (injuryProfile?.activeInjuries) {
      const activeInjuries = injuryProfile.activeInjuries as any[];
      
      // Group injuries by body part
      const injuryCount: Record<string, number> = {};
      for (const injury of activeInjuries) {
        const bodyPart = injury.body_part || 'unknown';
        injuryCount[bodyPart] = (injuryCount[bodyPart] || 0) + 1;
      }
      
      // Detect escalating injuries (mentioned 2+ times)
      for (const [bodyPart, count] of Object.entries(injuryCount)) {
        if (count >= 2) {
          patterns.push({
            type: 'injury_escalation',
            severity: 'high',
            description: `${bodyPart} pain mentioned ${count} times recently`,
            action_required: 'CRITICAL: Address injury immediately in next conversation'
          });
        }
      }
    }
  } catch (error) {
    console.error('[PATTERN DETECTION] Error checking injury escalation:', error);
  }
  
  // 3. Check for opponent dominance (same opponent mentioned 3+ times)
  try {
    const dominantOpponents = await db.query.trainingPartners.findMany({
      where: eq(trainingPartners.userId, userId),
      orderBy: [desc(trainingPartners.timesMentioned)],
      limit: 10
    });
    
    for (const opponent of dominantOpponents) {
      if ((opponent.timesMentioned || 0) >= 3) {
        patterns.push({
          type: 'opponent_dominance',
          severity: 'medium',
          description: `${opponent.name}${opponent.beltLevel ? ` (${opponent.beltLevel} belt)` : ''} mentioned ${opponent.timesMentioned} times`,
          action_required: 'Build scouting report on opponent'
        });
      }
    }
  } catch (error) {
    console.error('[PATTERN DETECTION] Error checking opponent dominance:', error);
  }
  
  console.log(`[PATTERN DETECTION] Detected ${patterns.length} patterns`);
  return patterns;
}

/**
 * Get pattern summary for injection into AI context
 */
export async function getPatternSummary(userId: string): Promise<string> {
  const patterns = await detectPatterns(userId);
  
  if (patterns.length === 0) {
    return '';
  }
  
  let summary = '\n\n🔍 DETECTED PATTERNS (IMPORTANT):\n';
  
  for (const pattern of patterns) {
    const severityEmoji = pattern.severity === 'high' ? '🔴' : 
                         pattern.severity === 'medium' ? '🟡' : '🟢';
    summary += `${severityEmoji} ${pattern.description}\n`;
    summary += `   → ${pattern.action_required}\n\n`;
  }
  
  return summary;
}
