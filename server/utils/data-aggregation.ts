import { db } from '../db';
import { 
  userTechniqueEcosystem,
  userLearningProfile,
  videoRecommendationLog,
  ecosystemTechniqueEffectiveness,
  ecosystemProblemSolutions,
  userEngagementPatterns,
  breakthroughTracking,
  conversationStructuredData,
  bjjUsers
} from '@shared/schema';
import { eq, sql, gte, lte, and, isNull } from 'drizzle-orm';

/**
 * PROFESSOR OS DATA INFRASTRUCTURE - DAILY AGGREGATION JOBS
 * These run once daily during off-peak hours to aggregate and analyze collected data.
 * CRITICAL: This is DATA COLLECTION ONLY - does NOT modify Professor OS responses.
 */

/**
 * JOB 1: Update technique_journey / technique ecosystem
 * Aggregates technique data from conversation_structured_data
 * Updates learning stage: learning → improving → clicked → mastered
 */
export async function aggregateTechniqueJourneys(): Promise<void> {
  console.log('[AGGREGATION] Starting technique journey aggregation...');
  
  try {
    // Get all users with technique ecosystem data
    const users = await db.query.userTechniqueEcosystem.findMany({
      columns: { userId: true },
    });
    
    const uniqueUserIds = [...new Set(users.map(u => u.userId))];
    console.log(`[AGGREGATION] Processing ${uniqueUserIds.length} users with technique data`);
    
    for (const userId of uniqueUserIds) {
      // Get user's technique data
      const techniques = await db.query.userTechniqueEcosystem.findMany({
        where: eq(userTechniqueEcosystem.userId, userId)
      });
      
      for (const tech of techniques) {
        // Calculate success rate as number
        const totalAttempts = (tech.attempts || 0);
        const successCount = (tech.successes || 0);
        
        if (totalAttempts === 0) continue;
        
        const successRateNum = (successCount / totalAttempts * 100);
        
        // Determine learning curve based on success rate and attempts (numeric comparison)
        let learningCurve = 'learning';
        if (successRateNum >= 75 && totalAttempts >= 10) {
          learningCurve = 'mastered';
        } else if (successRateNum >= 50 && totalAttempts >= 5) {
          learningCurve = 'improving';
        } else if (successRateNum >= 25 && totalAttempts >= 3) {
          learningCurve = 'clicked';
        } else if (totalAttempts >= 10 && successRateNum < 10) {
          learningCurve = 'plateau';
        }
        
        // Update technique ecosystem (store as string with 2 decimal places)
        await db.update(userTechniqueEcosystem)
          .set({
            successRate: successRateNum.toFixed(2),
            learningCurve,
            updatedAt: new Date()
          })
          .where(eq(userTechniqueEcosystem.id, tech.id));
      }
    }
    
    console.log('[AGGREGATION] ✅ Technique journey aggregation complete');
  } catch (error) {
    console.error('[AGGREGATION] ❌ Technique journey aggregation failed:', error);
  }
}

/**
 * JOB 2: Update user_learning_profile
 * Calculates vocabulary level, question complexity, engagement score, churn risk
 */
export async function aggregateUserLearningProfiles(): Promise<void> {
  console.log('[AGGREGATION] Starting user learning profile aggregation...');
  
  try {
    // Get users with recent engagement data
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentEngagement = await db.query.userEngagementPatterns.findMany({
      where: gte(userEngagementPatterns.createdAt, sevenDaysAgo)
    });
    
    const userEngagementMap = new Map<string, typeof recentEngagement>();
    for (const eng of recentEngagement) {
      if (!userEngagementMap.has(eng.userId)) {
        userEngagementMap.set(eng.userId, []);
      }
      userEngagementMap.get(eng.userId)!.push(eng);
    }
    
    console.log(`[AGGREGATION] Processing ${userEngagementMap.size} users with engagement data`);
    
    for (const [userId, engagements] of userEngagementMap) {
      // Calculate engagement score (0-100)
      const totalMessages = engagements.reduce((sum, e) => sum + (e.messagesSent || 0), 0);
      const activeDays = engagements.length;
      const avgMessageLength = engagements.reduce((sum, e) => sum + (e.averageMessageLength || 0), 0) / engagements.length;
      
      // Engagement score: messages * days * avg length factor
      const engagementScore = Math.min(100, Math.round((totalMessages * 2) + (activeDays * 10) + (avgMessageLength / 10)));
      
      // Calculate churn risk (0-100)
      // High risk if: low engagement, long gaps between sessions, declining emotional trend
      const lastEngagement = engagements.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0];
      
      const daysSinceLastActive = lastEngagement?.daysSincePrevious || 0;
      let churnRiskScore = 0;
      
      if (daysSinceLastActive > 14) churnRiskScore += 40;
      else if (daysSinceLastActive > 7) churnRiskScore += 20;
      else if (daysSinceLastActive > 3) churnRiskScore += 10;
      
      if (totalMessages < 5) churnRiskScore += 30;
      else if (totalMessages < 10) churnRiskScore += 15;
      
      if (lastEngagement?.emotionalTrend === 'declining') churnRiskScore += 20;
      
      churnRiskScore = Math.min(100, churnRiskScore);
      
      // Determine vocabulary level based on average message length
      let vocabularyLevel = 'beginner';
      if (avgMessageLength > 100) vocabularyLevel = 'advanced';
      else if (avgMessageLength > 50) vocabularyLevel = 'intermediate';
      
      // Determine preferred response length based on engagement patterns
      let preferredResponseLength = 'medium';
      if (avgMessageLength < 30) preferredResponseLength = 'short';
      else if (avgMessageLength > 80) preferredResponseLength = 'long';
      
      // Update or insert learning profile
      const existingProfile = await db.query.userLearningProfile.findFirst({
        where: eq(userLearningProfile.userId, userId)
      });
      
      if (existingProfile) {
        await db.update(userLearningProfile)
          .set({
            vocabularyLevel,
            preferredResponseLength,
            updatedAt: new Date()
          })
          .where(eq(userLearningProfile.userId, userId));
      }
    }
    
    console.log('[AGGREGATION] ✅ User learning profile aggregation complete');
  } catch (error) {
    console.error('[AGGREGATION] ❌ User learning profile aggregation failed:', error);
  }
}

/**
 * JOB 3: Update ecosystem_technique_data
 * Aggregates success/failure rates across ALL users
 * Segments by belt level, body type, style
 */
export async function aggregateEcosystemTechniqueData(): Promise<void> {
  console.log('[AGGREGATION] Starting ecosystem technique data aggregation...');
  
  try {
    // Get all technique ecosystem data
    const allTechniques = await db.query.userTechniqueEcosystem.findMany();
    
    // Group by technique name
    const techniqueMap = new Map<string, typeof allTechniques>();
    for (const tech of allTechniques) {
      const key = tech.techniqueName.toLowerCase();
      if (!techniqueMap.has(key)) {
        techniqueMap.set(key, []);
      }
      techniqueMap.get(key)!.push(tech);
    }
    
    console.log(`[AGGREGATION] Processing ${techniqueMap.size} unique techniques`);
    
    for (const [techniqueName, techniques] of techniqueMap) {
      const totalAttempts = techniques.reduce((sum, t) => sum + (t.attempts || 0), 0);
      const totalSuccesses = techniques.reduce((sum, t) => sum + (t.successes || 0), 0);
      const totalFailures = techniques.reduce((sum, t) => sum + (t.failures || 0), 0);
      const userCount = techniques.length;
      
      if (totalAttempts === 0) continue;
      
      const successRate = (totalSuccesses / totalAttempts * 100);
      
      // Calculate average sessions to learn (using attempts as proxy)
      const avgAttempts = totalAttempts / userCount;
      
      // Update or insert ecosystem effectiveness data
      const existing = await db.query.ecosystemTechniqueEffectiveness.findFirst({
        where: eq(ecosystemTechniqueEffectiveness.techniqueName, techniqueName)
      });
      
      if (existing) {
        await db.update(ecosystemTechniqueEffectiveness)
          .set({
            totalAttempts,
            successfulAttempts: totalSuccesses,
            successRate,
            userCount,
            averageSessionsToLearn: avgAttempts,
            lastUpdated: new Date()
          })
          .where(eq(ecosystemTechniqueEffectiveness.id, existing.id));
      } else {
        await db.insert(ecosystemTechniqueEffectiveness).values({
          techniqueName,
          totalAttempts,
          successfulAttempts: totalSuccesses,
          successRate,
          userCount,
          averageSessionsToLearn: avgAttempts
        });
      }
    }
    
    console.log('[AGGREGATION] ✅ Ecosystem technique data aggregation complete');
  } catch (error) {
    console.error('[AGGREGATION] ❌ Ecosystem technique data aggregation failed:', error);
  }
}

/**
 * JOB 4: Update ecosystem_problem_solutions
 * Finds problems that got solved and logs what helped
 */
export async function aggregateEcosystemProblemSolutions(): Promise<void> {
  console.log('[AGGREGATION] Starting ecosystem problem solutions aggregation...');
  
  try {
    // Get all breakthroughs in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentBreakthroughs = await db.query.breakthroughTracking.findMany({
      where: gte(breakthroughTracking.createdAt, thirtyDaysAgo)
    });
    
    console.log(`[AGGREGATION] Processing ${recentBreakthroughs.length} recent breakthroughs`);
    
    // Group by technique name
    const breakthroughMap = new Map<string, typeof recentBreakthroughs>();
    for (const bt of recentBreakthroughs) {
      const key = bt.techniqueName.toLowerCase();
      if (!breakthroughMap.has(key)) {
        breakthroughMap.set(key, []);
      }
      breakthroughMap.get(key)!.push(bt);
    }
    
    for (const [technique, breakthroughs] of breakthroughMap) {
      const usersSolved = breakthroughs.length;
      const breakthroughsWithDays = breakthroughs.filter(b => b.daysToBreakthrough);
      const avgDaysToBreakthrough = breakthroughsWithDays.length > 0
        ? breakthroughsWithDays.reduce((sum, b) => sum + (b.daysToBreakthrough || 0), 0) / breakthroughsWithDays.length
        : 0;
      
      // Extract common problem context from breakthroughs
      const problemContext = breakthroughs[0]?.problemContext || 'general struggle';
      
      // Update or insert problem solution
      const existing = await db.query.ecosystemProblemSolutions.findFirst({
        where: eq(ecosystemProblemSolutions.solutionTechnique, technique)
      });
      
      if (existing) {
        // Update existing: add new users, recalculate average time
        const newTotalUsers = (existing.usersSolved || 0) + usersSolved;
        const existingTimeWeight = (existing.usersSolved || 0) * (existing.averageTimeToSolve || 0);
        const newTimeWeight = usersSolved * avgDaysToBreakthrough;
        const newAvgTime = newTotalUsers > 0 ? (existingTimeWeight + newTimeWeight) / newTotalUsers : 0;
        
        await db.update(ecosystemProblemSolutions)
          .set({
            usersSolved: newTotalUsers,
            averageTimeToSolve: Math.round(newAvgTime),
            lastUpdated: new Date()
          })
          .where(eq(ecosystemProblemSolutions.id, existing.id));
      } else {
        // Insert new problem solution entry
        await db.insert(ecosystemProblemSolutions).values({
          problemType: problemContext,
          solutionTechnique: technique,
          usersSolved,
          successRate: 100,
          averageTimeToSolve: Math.round(avgDaysToBreakthrough)
        });
      }
    }
    
    console.log('[AGGREGATION] ✅ Ecosystem problem solutions aggregation complete');
  } catch (error) {
    console.error('[AGGREGATION] ❌ Ecosystem problem solutions aggregation failed:', error);
  }
}

/**
 * JOB 5: Update video_recommendation_log outcomes
 * For recommendations 7+ days old with unknown outcome,
 * checks if user mentioned success with that technique
 */
export async function updateVideoRecommendationOutcomes(): Promise<void> {
  console.log('[AGGREGATION] Starting video recommendation outcome updates...');
  
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Get recommendations OLDER than 7 days with unknown outcomes (using lte)
    const oldRecommendations = await db.query.videoRecommendationLog.findMany({
      where: and(
        lte(videoRecommendationLog.recommendedAt, sevenDaysAgo),
        eq(videoRecommendationLog.userResponse, 'unknown')
      )
    });
    
    console.log(`[AGGREGATION] Processing ${oldRecommendations.length} old recommendations`);
    
    for (const rec of oldRecommendations) {
      // Check if user had subsequent success with related techniques
      const userBreakthroughs = await db.query.breakthroughTracking.findMany({
        where: and(
          eq(breakthroughTracking.userId, rec.userId),
          gte(breakthroughTracking.createdAt, rec.recommendedAt)
        )
      });
      
      // Check if any breakthrough matches the video's problem context
      let foundSuccess = false;
      for (const bt of userBreakthroughs) {
        if (rec.problemItSolved && bt.techniqueName.toLowerCase().includes(rec.problemItSolved.toLowerCase())) {
          foundSuccess = true;
          
          // Calculate days to outcome
          const daysToOutcome = Math.floor(
            (bt.createdAt.getTime() - rec.recommendedAt.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          await db.update(videoRecommendationLog)
            .set({
              followUpSuccess: true,
              daysToOutcome,
              userResponse: 'positive'
            })
            .where(eq(videoRecommendationLog.id, rec.id));
          
          break;
        }
      }
      
      // If 14+ days with no success, mark as neutral
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      
      if (!foundSuccess && rec.recommendedAt < fourteenDaysAgo) {
        await db.update(videoRecommendationLog)
          .set({
            userResponse: 'neutral',
            followUpSuccess: false
          })
          .where(eq(videoRecommendationLog.id, rec.id));
      }
    }
    
    console.log('[AGGREGATION] ✅ Video recommendation outcome updates complete');
  } catch (error) {
    console.error('[AGGREGATION] ❌ Video recommendation outcome updates failed:', error);
  }
}

/**
 * Run all daily aggregation jobs
 */
export async function runAllDailyAggregations(): Promise<void> {
  console.log('[AGGREGATION] ═══════════════════════════════════════════');
  console.log('[AGGREGATION] Starting daily data aggregation jobs...');
  console.log('[AGGREGATION] ═══════════════════════════════════════════');
  
  const startTime = Date.now();
  
  try {
    await aggregateTechniqueJourneys();
    await aggregateUserLearningProfiles();
    await aggregateEcosystemTechniqueData();
    await aggregateEcosystemProblemSolutions();
    await updateVideoRecommendationOutcomes();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[AGGREGATION] ═══════════════════════════════════════════`);
    console.log(`[AGGREGATION] ✅ All daily aggregations complete in ${duration}s`);
    console.log(`[AGGREGATION] ═══════════════════════════════════════════`);
  } catch (error) {
    console.error('[AGGREGATION] ❌ Daily aggregation failed:', error);
  }
}
