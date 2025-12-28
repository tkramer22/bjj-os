import { db } from './db';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import {
  bjjUsers,
  conversationStructuredData,
  userPatternInterventions,
  userTechniqueAttempts,
  userBreakthroughPredictions,
  userLearningAnalytics
} from '../shared/schema';

/**
 * ECOSYSTEM PATTERN DETECTION - V5.0
 * 
 * This background job runs daily to detect patterns across all users:
 * 1. Recurring problems (same issue mentioned multiple times)
 * 2. Recurring injuries (same injury across multiple conversations)
 * 3. Fatigue patterns (consistent low confidence/overwhelmed tone)
 * 4. Breakthrough predictions (technique mastery imminent)
 * 
 * Runs daily at 8:00 PM EST via scheduler
 */

interface PatternDetectionResult {
  userId: string;
  patternsDetected: number;
  breakthroughsIdentified: number;
  interventionsCreated: number;
}

/**
 * Detect recurring problems for a user
 */
async function detectRecurringProblems(userId: string): Promise<number> {
  try {
    // Get last 30 days of conversations
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const conversations = await db.select()
      .from(conversationStructuredData)
      .where(and(
        eq(conversationStructuredData.userId, userId),
        gte(conversationStructuredData.extractedAt, thirtyDaysAgo)
      ))
      .orderBy(desc(conversationStructuredData.extractedAt));

    if (conversations.length === 0) return 0;

    // Aggregate problems by similarity
    const problemCounts: { [key: string]: number } = {};
    const problemDates: { [key: string]: Date[] } = {};

    for (const conv of conversations) {
      const problems = conv.problemsDiscussed || [];
      for (const problem of problems) {
        const normalized = problem.toLowerCase().trim();
        problemCounts[normalized] = (problemCounts[normalized] || 0) + 1;
        if (!problemDates[normalized]) problemDates[normalized] = [];
        problemDates[normalized].push(conv.extractedAt);
      }
    }

    // Find problems mentioned 3+ times (recurring)
    let interventionsCreated = 0;
    for (const [problem, count] of Object.entries(problemCounts)) {
      if (count >= 3) {
        const dates = problemDates[problem];
        const firstMention = dates[dates.length - 1]; // Oldest
        const lastMention = dates[0]; // Most recent
        const daysSinceFirst = Math.floor((new Date().getTime() - firstMention.getTime()) / (1000 * 60 * 60 * 24));

        // Check if intervention already exists
        const [existing] = await db.select()
          .from(userPatternInterventions)
          .where(and(
            eq(userPatternInterventions.userId, userId),
            eq(userPatternInterventions.description, problem)
          ))
          .limit(1);

        if (!existing) {
          // Create new intervention
          await db.insert(userPatternInterventions).values({
            userId,
            patternType: 'recurring_problem',
            description: problem,
            firstDetected: firstMention,
            lastOccurrence: lastMention,
            occurrenceCount: count,
            urgency: count >= 5 ? 'high' : 'medium',
            addressed: false,
            daysSinceFirst
          });
          interventionsCreated++;
          console.log(`[PATTERN] Created intervention for user ${userId}: "${problem}" (${count} occurrences)`);
        } else if (!existing.addressed) {
          // Update existing intervention
          await db.update(userPatternInterventions)
            .set({
              lastOccurrence: lastMention,
              occurrenceCount: count,
              urgency: count >= 5 ? 'high' : existing.urgency,
              daysSinceFirst
            })
            .where(eq(userPatternInterventions.id, existing.id));
        }
      }
    }

    return interventionsCreated;
  } catch (error) {
    console.error(`[PATTERN] Error detecting recurring problems for user ${userId}:`, error);
    return 0;
  }
}

/**
 * Detect recurring injuries
 */
async function detectRecurringInjuries(userId: string): Promise<number> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const conversations = await db.select()
      .from(conversationStructuredData)
      .where(and(
        eq(conversationStructuredData.userId, userId),
        gte(conversationStructuredData.extractedAt, thirtyDaysAgo)
      ))
      .orderBy(desc(conversationStructuredData.extractedAt));

    if (conversations.length === 0) return 0;

    // Aggregate injuries
    const injuryCounts: { [key: string]: number } = {};
    const injuryDates: { [key: string]: Date[] } = {};

    for (const conv of conversations) {
      const injuries = conv.injuriesMentioned || [];
      for (const injury of injuries) {
        const normalized = injury.toLowerCase().trim();
        injuryCounts[normalized] = (injuryCounts[normalized] || 0) + 1;
        if (!injuryDates[normalized]) injuryDates[normalized] = [];
        injuryDates[normalized].push(conv.extractedAt);
      }
    }

    // Find injuries mentioned 2+ times (critical)
    let interventionsCreated = 0;
    for (const [injury, count] of Object.entries(injuryCounts)) {
      if (count >= 2) {
        const dates = injuryDates[injury];
        const firstMention = dates[dates.length - 1];
        const lastMention = dates[0];
        const daysSinceFirst = Math.floor((new Date().getTime() - firstMention.getTime()) / (1000 * 60 * 60 * 24));

        // Check if intervention exists
        const [existing] = await db.select()
          .from(userPatternInterventions)
          .where(and(
            eq(userPatternInterventions.userId, userId),
            eq(userPatternInterventions.description, injury)
          ))
          .limit(1);

        if (!existing) {
          await db.insert(userPatternInterventions).values({
            userId,
            patternType: 'recurring_injury',
            description: injury,
            firstDetected: firstMention,
            lastOccurrence: lastMention,
            occurrenceCount: count,
            urgency: 'critical', // Injuries are always critical
            addressed: false,
            daysSinceFirst
          });
          interventionsCreated++;
          console.log(`[PATTERN] CRITICAL: Recurring injury for user ${userId}: "${injury}"`);
        } else if (!existing.addressed) {
          await db.update(userPatternInterventions)
            .set({
              lastOccurrence: lastMention,
              occurrenceCount: count,
              urgency: 'critical',
              daysSinceFirst
            })
            .where(eq(userPatternInterventions.id, existing.id));
        }
      }
    }

    return interventionsCreated;
  } catch (error) {
    console.error(`[PATTERN] Error detecting injuries for user ${userId}:`, error);
    return 0;
  }
}

/**
 * Detect fatigue patterns (consistent low confidence)
 */
async function detectFatiguePatterns(userId: string): Promise<number> {
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const conversations = await db.select()
      .from(conversationStructuredData)
      .where(and(
        eq(conversationStructuredData.userId, userId),
        gte(conversationStructuredData.extractedAt, fourteenDaysAgo)
      ))
      .orderBy(desc(conversationStructuredData.extractedAt));

    if (conversations.length < 3) return 0;

    // Count low confidence occurrences
    let lowConfidenceCount = 0;
    let overwhelmedCount = 0;
    
    for (const conv of conversations) {
      if (conv.confidenceLevel && conv.confidenceLevel <= 4) {
        lowConfidenceCount++;
      }
      if (conv.emotionalTone === 'overwhelmed' || conv.emotionalTone === 'frustrated') {
        overwhelmedCount++;
      }
    }

    // Trigger if 50%+ conversations show fatigue signs
    const fatigueRatio = (lowConfidenceCount + overwhelmedCount) / conversations.length;
    
    if (fatigueRatio >= 0.5) {
      // Check if intervention exists
      const [existing] = await db.select()
        .from(userPatternInterventions)
        .where(and(
          eq(userPatternInterventions.userId, userId),
          eq(userPatternInterventions.patternType, 'fatigue_pattern')
        ))
        .limit(1);

      if (!existing) {
        await db.insert(userPatternInterventions).values({
          userId,
          patternType: 'fatigue_pattern',
          description: `Low confidence in ${Math.round(fatigueRatio * 100)}% of recent conversations`,
          firstDetected: conversations[conversations.length - 1].extractedAt,
          lastOccurrence: conversations[0].extractedAt,
          occurrenceCount: lowConfidenceCount + overwhelmedCount,
          urgency: fatigueRatio >= 0.7 ? 'high' : 'medium',
          addressed: false,
          daysSinceFirst: 14
        });
        console.log(`[PATTERN] Fatigue detected for user ${userId}: ${Math.round(fatigueRatio * 100)}% fatigue ratio`);
        return 1;
      }
    }

    return 0;
  } catch (error) {
    console.error(`[PATTERN] Error detecting fatigue for user ${userId}:`, error);
    return 0;
  }
}

/**
 * Predict breakthroughs based on technique attempt patterns
 */
async function predictBreakthroughs(userId: string): Promise<number> {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const attempts = await db.select()
      .from(userTechniqueAttempts)
      .where(and(
        eq(userTechniqueAttempts.userId, userId),
        gte(userTechniqueAttempts.attemptedAt, ninetyDaysAgo)
      ))
      .orderBy(desc(userTechniqueAttempts.attemptedAt));

    if (attempts.length === 0) return 0;

    // Aggregate by technique
    const techniqueData: { [key: string]: { total: number; successes: number; dates: Date[] } } = {};

    for (const attempt of attempts) {
      const tech = attempt.techniqueName;
      if (!techniqueData[tech]) {
        techniqueData[tech] = { total: 0, successes: 0, dates: [] };
      }
      techniqueData[tech].total++;
      if (attempt.successful) techniqueData[tech].successes++;
      techniqueData[tech].dates.push(attempt.attemptedAt);
    }

    let breakthroughsIdentified = 0;

    // Identify breakthrough candidates
    for (const [technique, data] of Object.entries(techniqueData)) {
      // Criteria: 5+ attempts, 60-85% success rate, recent activity
      const successRate = (data.successes / data.total) * 100;
      const daysSinceFirst = Math.floor((new Date().getTime() - data.dates[data.dates.length - 1].getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceLast = Math.floor((new Date().getTime() - data.dates[0].getTime()) / (1000 * 60 * 60 * 24));

      if (data.total >= 5 && successRate >= 60 && successRate <= 85 && daysSinceLast <= 14) {
        // Check if prediction exists
        const [existing] = await db.select()
          .from(userBreakthroughPredictions)
          .where(and(
            eq(userBreakthroughPredictions.userId, userId),
            eq(userBreakthroughPredictions.technique, technique),
            eq(userBreakthroughPredictions.breakthroughAchieved, false)
          ))
          .limit(1);

        if (!existing) {
          // Predict breakthrough window
          let predictedWindow = '1-2 weeks';
          let confidence: 'high' | 'medium' | 'low' = 'medium';

          if (successRate >= 75 && data.total >= 8) {
            predictedWindow = '3-7 days';
            confidence = 'high';
          } else if (successRate >= 70) {
            predictedWindow = '1-2 weeks';
            confidence = 'medium';
          } else {
            predictedWindow = '2-4 weeks';
            confidence = 'low';
          }

          await db.insert(userBreakthroughPredictions).values({
            userId,
            technique,
            currentStage: 'refinement',
            predictedWindow,
            confidence,
            signals: [
              `${data.total} attempts`,
              `${Math.round(successRate)}% success rate`,
              `Active in last ${daysSinceLast} days`
            ],
            breakthroughAchieved: false,
            predictedAt: new Date()
          });

          breakthroughsIdentified++;
          console.log(`[PATTERN] Breakthrough predicted for user ${userId}: ${technique} (${confidence} confidence)`);
        }
      }
    }

    return breakthroughsIdentified;
  } catch (error) {
    console.error(`[PATTERN] Error predicting breakthroughs for user ${userId}:`, error);
    return 0;
  }
}

/**
 * Run pattern detection for a single user
 */
async function detectPatternsForUser(userId: string): Promise<PatternDetectionResult> {
  console.log(`[PATTERN] Running detection for user ${userId}`);

  const [
    problemInterventions,
    injuryInterventions,
    fatigueInterventions,
    breakthroughs
  ] = await Promise.all([
    detectRecurringProblems(userId),
    detectRecurringInjuries(userId),
    detectFatiguePatterns(userId),
    predictBreakthroughs(userId)
  ]);

  const totalInterventions = problemInterventions + injuryInterventions + fatigueInterventions;
  const totalPatterns = totalInterventions + breakthroughs;

  if (totalPatterns > 0) {
    console.log(`[PATTERN] ✅ User ${userId}: ${totalPatterns} patterns (${totalInterventions} interventions, ${breakthroughs} breakthroughs)`);
  }

  return {
    userId,
    patternsDetected: totalPatterns,
    breakthroughsIdentified: breakthroughs,
    interventionsCreated: totalInterventions
  };
}

/**
 * MAIN FUNCTION: Run pattern detection for all active users
 * 
 * This is called by the scheduler daily at 8:00 PM EST
 */
export async function runPatternDetection(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('[PATTERN DETECTION] Starting daily pattern analysis');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    // Get all active users (have had conversations in last 60 days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const activeUserIds = await db.selectDistinct({ 
      userId: conversationStructuredData.userId 
    })
      .from(conversationStructuredData)
      .where(gte(conversationStructuredData.extractedAt, sixtyDaysAgo));

    console.log(`[PATTERN] Found ${activeUserIds.length} active users to analyze`);

    if (activeUserIds.length === 0) {
      console.log('[PATTERN] No active users found, skipping');
      return;
    }

    // Run pattern detection for each user (in parallel batches of 5)
    const batchSize = 5;
    let totalPatterns = 0;
    let totalBreakthroughs = 0;
    let totalInterventions = 0;

    for (let i = 0; i < activeUserIds.length; i += batchSize) {
      const batch = activeUserIds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(({ userId }) => detectPatternsForUser(userId))
      );

      for (const result of results) {
        totalPatterns += result.patternsDetected;
        totalBreakthroughs += result.breakthroughsIdentified;
        totalInterventions += result.interventionsCreated;
      }
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('[PATTERN DETECTION] Daily analysis complete');
    console.log(`  Users analyzed: ${activeUserIds.length}`);
    console.log(`  Total patterns: ${totalPatterns}`);
    console.log(`  Interventions created: ${totalInterventions}`);
    console.log(`  Breakthroughs predicted: ${totalBreakthroughs}`);
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (error) {
    console.error('[PATTERN DETECTION] Fatal error:', error);
  }
}
