import { db } from "./db";
import { userFeedbackHistory, userLearningProfile, instructorPerformance, dailyAiMetrics, UserFeedbackHistory } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";

/**
 * Feedback Tracking & Learning System
 * Tracks user interactions and adjusts future scoring
 */

export type UserAction = 'clicked' | 'skipped' | 'replied_bad' | 'no_action' | 'multiple_views';

/**
 * Record user feedback for a technique
 */
export async function recordFeedback(
  userId: string,
  techniqueSent: string,
  instructor: string,
  videoId: string,
  action: UserAction
) {
  try {
    // Map UserAction to feedbackType for schema
    const feedbackType = action === 'clicked' ? 'click' : 
                         action === 'skipped' ? 'skip' : 
                         action === 'replied_bad' ? 'bad' : 'good';
    
    await db.insert(userFeedbackHistory).values({
      userId,
      videoId,
      feedbackType
    });

    // Update learning profile based on action
    await updateLearningProfile(userId, instructor, action);
    
    // Update instructor performance
    await updateInstructorPerformance(instructor, action);
    
    console.log(`📊 Feedback recorded: ${userId} - ${action} - ${instructor}`);
  } catch (error) {
    console.error('Error recording feedback:', error);
  }
}

/**
 * Update user learning profile based on feedback
 */
async function updateLearningProfile(
  userId: string,
  instructor: string,
  action: UserAction
) {
  try {
    // Get or create learning profile
    const existing = await db.select(getTableColumns(userLearningProfile)).from(userLearningProfile).where(
      eq(userLearningProfile.userId, userId)
    ).limit(1);

    if (existing.length === 0) {
      // Create new profile
      await db.insert(userLearningProfile).values({
        userId,
        favoriteInstructors: action === 'clicked' || action === 'multiple_views' ? [instructor] : [],
        avoidInstructors: action === 'replied_bad' || action === 'skipped' ? [instructor] : [],
        preferredPositions: [],
        learningStyle: 'visual'
      });
    } else {
      // Update existing profile
      const profile = existing[0];
      const favorite = profile.favoriteInstructors || [];
      const avoid = profile.avoidInstructors || [];

      if (action === 'clicked' || action === 'multiple_views') {
        if (!favorite.includes(instructor)) {
          favorite.push(instructor);
        }
        // Remove from avoid if present
        const avoidIndex = avoid.indexOf(instructor);
        if (avoidIndex > -1) {
          avoid.splice(avoidIndex, 1);
        }
      } else if (action === 'replied_bad' || action === 'skipped') {
        if (!avoid.includes(instructor)) {
          avoid.push(instructor);
        }
        // Remove from favorite if present
        const favoriteIndex = favorite.indexOf(instructor);
        if (favoriteIndex > -1) {
          favorite.splice(favoriteIndex, 1);
        }
      }

      await db.update(userLearningProfile)
        .set({
          favoriteInstructors: favorite,
          avoidInstructors: avoid,
          updatedAt: new Date()
        })
        .where(eq(userLearningProfile.userId, userId));
    }
  } catch (error) {
    console.error('Error updating learning profile:', error);
  }
}

/**
 * Update instructor performance metrics
 */
async function updateInstructorPerformance(
  instructorName: string,
  action: UserAction
) {
  try {
    // Get existing performance record
    const existing = await db.select(getTableColumns(instructorPerformance)).from(instructorPerformance).where(
      eq(instructorPerformance.instructorName, instructorName)
    ).limit(1);

    if (existing.length === 0) {
      // Create new record
      const totalClicks = action === 'clicked' ? 1 : 0;
      const totalSkips = action === 'skipped' ? 1 : 0;
      const totalBad = action === 'replied_bad' ? 1 : 0;
      
      await db.insert(instructorPerformance).values({
        instructorName,
        totalVideosSent: 1,
        totalClicks,
        totalSkips,
        totalBadRatings: totalBad,
        clickRate: (totalClicks * 100).toString(),
        skipRate: (totalSkips * 100).toString(),
        badRate: (totalBad * 100).toString(),
        credibilityScore: 20
      });
    } else {
      // Update existing record
      const perf = existing[0];
      const total = (perf.totalVideosSent || 0) + 1;
      const clicks = (perf.totalClicks || 0) + (action === 'clicked' ? 1 : 0);
      const skips = (perf.totalSkips || 0) + (action === 'skipped' ? 1 : 0);
      const bads = (perf.totalBadRatings || 0) + (action === 'replied_bad' ? 1 : 0);
      
      const newClickRate = (clicks / total) * 100;
      const newSkipRate = (skips / total) * 100;
      const newBadRate = (bads / total) * 100;
      
      // Calculate credibility score (20 base + adjustments)
      let credibility = 20;
      if (newClickRate > 30) credibility += 5;
      if (newSkipRate > 20) credibility -= 5;
      if (newBadRate > 10) credibility -= 5;
      credibility = Math.max(0, Math.min(100, credibility));

      await db.update(instructorPerformance)
        .set({
          totalVideosSent: total,
          totalClicks: clicks,
          totalSkips: skips,
          totalBadRatings: bads,
          clickRate: newClickRate.toFixed(2),
          skipRate: newSkipRate.toFixed(2),
          badRate: newBadRate.toFixed(2),
          credibilityScore: credibility,
          updatedAt: new Date()
        })
        .where(eq(instructorPerformance.instructorName, instructorName));
    }
  } catch (error) {
    console.error('Error updating instructor performance:', error);
  }
}

/**
 * Get scoring adjustments based on user's learning profile
 */
export async function getScoringAdjustments(
  userId: string,
  instructor: string,
  techniqueName: string
): Promise<{ instructorAdjustment: number; techniqueAdjustment: number }> {
  
  try {
    // Get learning profile
    const profile = await db.select(getTableColumns(userLearningProfile)).from(userLearningProfile).where(
      eq(userLearningProfile.userId, userId)
    ).limit(1);

    if (profile.length === 0) {
      return { instructorAdjustment: 0, techniqueAdjustment: 0 };
    }

    const p = profile[0];
    let instructorAdjustment = 0;
    let techniqueAdjustment = 0;

    // Instructor adjustments
    if (p.favoriteInstructors?.includes(instructor)) {
      instructorAdjustment += 5;
    }
    if (p.avoidInstructors?.includes(instructor)) {
      instructorAdjustment -= 15;
    }

    // Check recent feedback for similar techniques (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentFeedback = await db.select(getTableColumns(userFeedbackHistory)).from(userFeedbackHistory).where(
      and(
        eq(userFeedbackHistory.userId, userId),
        gte(userFeedbackHistory.createdAt, thirtyDaysAgo)
      )
    );

    // Check for feedback by type
    for (const feedback of recentFeedback) {
      if (feedback.feedbackType === 'skip') techniqueAdjustment -= 5;
      if (feedback.feedbackType === 'bad') techniqueAdjustment -= 15;
      if (feedback.feedbackType === 'click' || feedback.feedbackType === 'good') {
        techniqueAdjustment += 5;
      }
    }

    return { instructorAdjustment, techniqueAdjustment };
  } catch (error) {
    console.error('Error getting scoring adjustments:', error);
    return { instructorAdjustment: 0, techniqueAdjustment: 0 };
  }
}

/**
 * Get instructor credibility adjustment from performance
 */
export async function getInstructorCredibilityAdjustment(
  instructorName: string
): Promise<number> {
  try {
    const perf = await db.select(getTableColumns(instructorPerformance)).from(instructorPerformance).where(
      eq(instructorPerformance.instructorName, instructorName)
    ).limit(1);

    if (perf.length === 0) return 0;
    
    return perf[0].credibilityScore || 0;
  } catch (error) {
    console.error('Error getting credibility adjustment:', error);
    return 0;
  }
}

/**
 * Record daily AI metrics
 */
export async function recordDailyMetrics(metrics: {
  totalUsersSent: number;
  avgQualityScore: number;
  avgKeyDetailScore: number;
  skipRate: number;
  badRate: number;
  clickRate: number;
  diversityScore: number;
  duplicateInstructorViolations: number;
}) {
  try {
    const today = new Date().toISOString().split('T')[0];
    await db.insert(dailyAiMetrics).values({
      date: today,
      totalUsersSent: metrics.totalUsersSent,
      avgQualityScore: metrics.avgQualityScore.toFixed(2),
      avgKeyDetailScore: metrics.avgKeyDetailScore.toFixed(2),
      clickRate: metrics.clickRate.toFixed(2),
      skipRate: metrics.skipRate.toFixed(2),
      badRate: metrics.badRate.toFixed(2),
      diversityScore: metrics.diversityScore.toFixed(2),
      duplicateInstructorViolations: metrics.duplicateInstructorViolations
    });

    console.log(`📈 Daily AI metrics recorded for ${today}`);
  } catch (error) {
    console.error('Error recording daily metrics:', error);
  }
}

/**
 * Get user's recent technique categories for diversity checking
 */
export async function getRecentCategories(
  userId: string,
  days: number = 7
): Promise<string[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recent = await db.select(getTableColumns(userFeedbackHistory)).from(userFeedbackHistory).where(
      and(
        eq(userFeedbackHistory.userId, userId),
        gte(userFeedbackHistory.createdAt, cutoffDate)
      )
    ).orderBy(sql`${userFeedbackHistory.createdAt} DESC`);

    // Return feedback types as categories
    return recent.map((r: UserFeedbackHistory) => r.feedbackType);
  } catch (error) {
    console.error('Error getting recent categories:', error);
    return [];
  }
}

/**
 * Get alert conditions
 */
export async function checkAlertConditions(): Promise<{
  skipRateHigh: boolean;
  badRateHigh: boolean;
  duplicateViolations: boolean;
  alerts: string[];
}> {
  try {
    // Get today's metrics
    const today = new Date().toISOString().split('T')[0];

    const metrics = await db.select(getTableColumns(dailyAiMetrics)).from(dailyAiMetrics).where(
      eq(dailyAiMetrics.date, today)
    ).limit(1);

    if (metrics.length === 0) {
      return { skipRateHigh: false, badRateHigh: false, duplicateViolations: false, alerts: [] };
    }

    const m = metrics[0];
    const alerts: string[] = [];
    
    const skipRateHigh = parseFloat(m.skipRate || '0') > 15;
    const badRateHigh = parseFloat(m.badRate || '0') > 5;
    const hasDuplicates = (m.duplicateInstructorViolations || 0) > 0;

    if (skipRateHigh) {
      alerts.push(`⚠️ Skip rate above 15%: ${m.skipRate}%`);
    }
    if (badRateHigh) {
      alerts.push(`🚨 BAD rate above 5%: ${m.badRate}%`);
    }
    if (hasDuplicates) {
      alerts.push(`⚠️ Duplicate violations detected: ${m.duplicateInstructorViolations}`);
    }

    return {
      skipRateHigh,
      badRateHigh,
      duplicateViolations: hasDuplicates,
      alerts
    };
  } catch (error) {
    console.error('Error checking alert conditions:', error);
    return { skipRateHigh: false, badRateHigh: false, duplicateViolations: false, alerts: [] };
  }
}
