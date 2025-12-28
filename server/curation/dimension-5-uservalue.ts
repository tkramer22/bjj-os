/**
 * Dimension 5: User Feedback & Performance
 * Tracks how well videos perform with actual users
 */

import { db } from '../db';
import { videoPerformance } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface UserValueAnalysis {
  feedbackScore: number; // 0-100
  hasPerformanceData: boolean;
  performanceBoost: number; // 0-15
  reasonsGood: string[];
}

/**
 * Analyze user feedback and video performance
 */
export async function analyzeUserValue(
  videoId: number
): Promise<UserValueAnalysis> {
  
  try {
    // Get performance data
    const perfRecords = await db.select()
      .from(videoPerformance)
      .where(eq(videoPerformance.videoId, videoId))
      .limit(1);

    if (perfRecords.length === 0) {
      // No data yet - neutral score
      return {
        feedbackScore: 50,
        hasPerformanceData: false,
        performanceBoost: 0,
        reasonsGood: []
      };
    }

    const perf = perfRecords[0];
    const reasonsGood: string[] = [];
    let feedbackScore = 50;
    let performanceBoost = 0;

    // Helpful/Unhelpful ratio
    const totalFeedback = (perf.notedHelpfulCount || 0) + (perf.notedUnhelpfulCount || 0);
    if (totalFeedback >= 5) {
      const helpfulRatio = perf.notedHelpfulCount! / totalFeedback;
      
      if (helpfulRatio > 0.8) {
        feedbackScore += 30;
        performanceBoost += 15;
        reasonsGood.push(`Highly rated: ${Math.round(helpfulRatio * 100)}% helpful (${totalFeedback} votes)`);
      } else if (helpfulRatio > 0.6) {
        feedbackScore += 15;
        performanceBoost += 7;
        reasonsGood.push(`Positive feedback: ${Math.round(helpfulRatio * 100)}% helpful`);
      }
    }

    // Watch completion rate
    const completionRate = Number(perf.watchCompletionRate) || 0;
    if (completionRate > 0.7) {
      feedbackScore += 15;
      performanceBoost += 5;
      reasonsGood.push(`High engagement: ${Math.round(completionRate * 100)}% watch completion`);
    }

    // Recommendation success rate
    const recSuccessRate = Number(perf.recommendationSuccessRate) || 0;
    if (recSuccessRate > 0.5 && (perf.recommendedByOsCount || 0) >= 10) {
      feedbackScore += 10;
      performanceBoost += 5;
      reasonsGood.push(`Successful recommendations: ${Math.round(recSuccessRate * 100)}% acceptance`);
    }

    // Saved to library (strong signal)
    if ((perf.savedToLibraryCount || 0) > 10) {
      feedbackScore += 10;
      performanceBoost += 3;
      reasonsGood.push(`Saved by ${perf.savedToLibraryCount} users`);
    }

    return {
      feedbackScore,
      hasPerformanceData: true,
      performanceBoost,
      reasonsGood
    };

  } catch (error) {
    console.error('[DIMENSION 5] Error analyzing user value:', error);
    return {
      feedbackScore: 50,
      hasPerformanceData: false,
      performanceBoost: 0,
      reasonsGood: []
    };
  }
}
