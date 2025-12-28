import { db } from "./db";
import { recommendationOutcomes, videoInteractions, modelPerformance, abTestExperiments } from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

/**
 * AGENT 5: THE EVALUATOR
 * Measures what worked, understands why, improves system
 * 
 * Evaluation signals:
 * - IMMEDIATE (within 5 min): clicked, watch duration, completion
 * - SHORT-TERM (within 24 hrs): saved, shared, follow-up query sentiment
 * - LONG-TERM (within 7 days): knowledge retained, skill improved, problem solved
 */

export interface RecommendationQuality {
  recommendationId: number;
  immediateQuality: number; // 0-100
  shortTermQuality: number; // 0-100
  longTermQuality: number; // 0-100
  overallQuality: number; // Weighted average
  attribution: {
    whyItWorked: string[];
    whatToReplicate: string[];
    whatToAvoid: string[];
  };
}

export class EvaluatorAgent {
  /**
   * Evaluate recommendation quality (called 24 hours after recommendation)
   */
  async evaluateRecommendation(recommendationId: number): Promise<RecommendationQuality> {
    console.log(`[EVALUATOR] Evaluating recommendation ${recommendationId}`);

    // Get recommendation outcome
    const outcomes = await db.select()
      .from(recommendationOutcomes)
      .where(eq(recommendationOutcomes.id, recommendationId))
      .limit(1);

    if (outcomes.length === 0) {
      throw new Error(`Recommendation ${recommendationId} not found`);
    }

    const outcome = outcomes[0];

    // Get video interaction
    const interactions = await db.select()
      .from(videoInteractions)
      .where(and(
        eq(videoInteractions.userId, outcome.userId),
        eq(videoInteractions.videoId, outcome.videoId)
      ))
      .orderBy(desc(videoInteractions.createdAt))
      .limit(1);

    const interaction = interactions.length > 0 ? interactions[0] : null;

    // Calculate quality scores
    const immediateQuality = this.calculateImmediateQuality(outcome, interaction);
    const shortTermQuality = this.calculateShortTermQuality(outcome, interaction);
    const longTermQuality = this.calculateLongTermQuality(outcome, interaction);

    // Overall quality (weighted: 30% immediate, 30% short-term, 40% long-term)
    const overallQuality = (
      immediateQuality * 0.30 +
      shortTermQuality * 0.30 +
      longTermQuality * 0.40
    );

    // Attribution analysis
    const attribution = this.analyzeAttribution(outcome, interaction, {
      immediateQuality,
      shortTermQuality,
      longTermQuality
    });

    // Update recommendation outcome with actual quality
    await db.update(recommendationOutcomes)
      .set({
        actualEngagement: immediateQuality.toString(),
        actualLearningGain: longTermQuality.toString(),
        predictionAccuracy: this.calculatePredictionAccuracy(outcome, overallQuality).toString(),
        evaluatedAt: new Date()
      })
      .where(eq(recommendationOutcomes.id, recommendationId));

    console.log(`[EVALUATOR] Recommendation ${recommendationId} quality: ${overallQuality.toFixed(1)}/100`);

    return {
      recommendationId,
      immediateQuality,
      shortTermQuality,
      longTermQuality,
      overallQuality,
      attribution
    };
  }

  /**
   * Calculate immediate quality (within 5 minutes)
   */
  private calculateImmediateQuality(outcome: any, interaction: any): number {
    let score = 0;

    // Did they click? (40 points)
    if (outcome.clicked || interaction?.clicked) {
      score += 40;
    }

    // Watch duration (40 points max)
    if (interaction?.watchDuration) {
      const durationScore = Math.min(40, (interaction.watchDuration / 300) * 40); // Max at 5 minutes
      score += durationScore;
    }

    // Completion (20 points)
    if (interaction?.completed) {
      score += 20;
    }

    return score;
  }

  /**
   * Calculate short-term quality (within 24 hours)
   */
  private calculateShortTermQuality(outcome: any, interaction: any): number {
    let score = 50; // Base score

    // Saved to library (30 points) - strong positive signal
    if (interaction?.savedToLibrary) {
      score += 30;
    }

    // Shared with others (20 points) - very strong positive signal
    if (interaction?.sharedWithOthers) {
      score += 20;
    }

    // Thumbs up (15 points)
    if (interaction?.thumbsUp) {
      score += 15;
    }

    // Thumbs down (-30 points)
    if (interaction?.thumbsDown) {
      score -= 30;
    }

    // Rewatched (10 points per rewatch, max 20)
    if (interaction?.rewatchCount) {
      score += Math.min(20, interaction.rewatchCount * 10);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate long-term quality (within 7 days)
   */
  private calculateLongTermQuality(outcome: any, interaction: any): number {
    let score = 50; // Base score

    // Problem solved (40 points) - THE most important signal
    if (outcome.solvedProblem || interaction?.problemSolved) {
      score += 40;
    }

    // Marked as helpful (25 points)
    if (outcome.helpful) {
      score += 25;
    }

    // No follow-up query on same problem (15 points)
    if (!outcome.askedSameProblemAgain) {
      score += 15;
    }

    // Positive sentiment in follow-up (10 points)
    if (outcome.followUpQuerySentiment === 'positive') {
      score += 10;
    }

    // Negative sentiment (-20 points)
    if (outcome.followUpQuerySentiment === 'negative' || outcome.followUpQuerySentiment === 'frustrated') {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate prediction accuracy
   */
  private calculatePredictionAccuracy(outcome: any, actualQuality: number): number {
    const predicted = parseFloat(String(outcome.engagementPrediction || 50));
    const error = Math.abs(predicted - actualQuality);
    
    // Accuracy = 100 - error percentage
    return Math.max(0, 100 - error);
  }

  /**
   * Analyze why recommendation worked or failed
   */
  private analyzeAttribution(
    outcome: any,
    interaction: any,
    qualities: { immediateQuality: number; shortTermQuality: number; longTermQuality: number }
  ): RecommendationQuality['attribution'] {
    const whyItWorked: string[] = [];
    const whatToReplicate: string[] = [];
    const whatToAvoid: string[] = [];

    // Analyze success factors
    if (qualities.overallQuality >= 70) {
      if (interaction?.completed) {
        whyItWorked.push('High completion rate indicates good relevance');
        whatToReplicate.push('Match algorithm that led to this recommendation');
      }

      if (interaction?.savedToLibrary) {
        whyItWorked.push('User saved for future reference - high perceived value');
        whatToReplicate.push('Content characteristics that drive saves');
      }

      if (outcome.solvedProblem) {
        whyItWorked.push('Recommendation directly solved user\'s problem');
        whatToReplicate.push('Query understanding → video matching accuracy');
      }

      if (parseFloat(String(outcome.relevanceScore || 0)) > 80) {
        whatToReplicate.push('High relevance score correlates with success');
      }
    }

    // Analyze failure factors
    if (qualities.overallQuality < 40) {
      if (!outcome.clicked) {
        whatToAvoid.push('Recommendation not clicked - poor title/description?');
      }

      if (interaction && !interaction.completed && interaction.watchDuration < 60) {
        whatToAvoid.push('User left quickly - content didn\'t match expectation');
      }

      if (interaction?.thumbsDown) {
        whatToAvoid.push('Negative feedback - wrong skill level or irrelevant');
      }

      if (outcome.askedSameProblemAgain) {
        whatToAvoid.push('Didn\'t solve problem - need better matching');
      }
    }

    return {
      whyItWorked: whyItWorked.length > 0 ? whyItWorked : ['Standard recommendation flow'],
      whatToReplicate: whatToReplicate.length > 0 ? whatToReplicate : ['Continue current approach'],
      whatToAvoid: whatToAvoid.length > 0 ? whatToAvoid : ['No major issues identified']
    };
  }

  /**
   * Batch evaluate all recommendations from last 24 hours
   */
  async evaluateRecentRecommendations() {
    console.log('[EVALUATOR] Evaluating recommendations from last 24 hours');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    try {
      const recentOutcomes = await db.select()
        .from(recommendationOutcomes)
        .where(and(
          gte(recommendationOutcomes.createdAt, yesterday),
          eq(recommendationOutcomes.evaluatedAt, null)
        ))
        .limit(100);

      console.log(`[EVALUATOR] Found ${recentOutcomes.length} recommendations to evaluate`);

      const results = [];
      for (const outcome of recentOutcomes) {
        try {
          const quality = await this.evaluateRecommendation(outcome.id);
          results.push(quality);
        } catch (error) {
          console.error(`[EVALUATOR] Failed to evaluate ${outcome.id}:`, error);
        }
      }

      // Aggregate results
      const avgQuality = results.reduce((sum, r) => sum + r.overallQuality, 0) / Math.max(1, results.length);
      
      console.log(`[EVALUATOR] Batch evaluation complete. Average quality: ${avgQuality.toFixed(1)}/100`);

      return {
        evaluated: results.length,
        avgQuality,
        results
      };
    } catch (error) {
      console.error('[EVALUATOR] Batch evaluation failed:', error);
      return { evaluated: 0, avgQuality: 0, results: [] };
    }
  }

  /**
   * Update algorithm weights based on A/B test results
   */
  async evaluateABTest(experimentName: string) {
    console.log(`[EVALUATOR] Evaluating A/B test: ${experimentName}`);

    try {
      // Get experiment
      const experiments = await db.select()
        .from(abTestExperiments)
        .where(and(
          eq(abTestExperiments.experimentName, experimentName),
          eq(abTestExperiments.status, 'active')
        ))
        .limit(1);

      if (experiments.length === 0) {
        console.log(`[EVALUATOR] No active experiment found: ${experimentName}`);
        return null;
      }

      const experiment = experiments[0];

      // Get outcomes for control group
      const controlOutcomes = await db.select()
        .from(recommendationOutcomes)
        .where(eq(recommendationOutcomes.algorithm, experiment.controlAlgorithm))
        .limit(1000);

      // Get outcomes for treatment group
      const treatmentOutcomes = await db.select()
        .from(recommendationOutcomes)
        .where(eq(recommendationOutcomes.algorithm, experiment.treatmentAlgorithm))
        .limit(1000);

      // Calculate metrics
      const controlMetrics = this.calculateGroupMetrics(controlOutcomes);
      const treatmentMetrics = this.calculateGroupMetrics(treatmentOutcomes);

      // Determine winner (simple: higher engagement wins)
      const winner = treatmentMetrics.avgEngagement > controlMetrics.avgEngagement 
        ? 'treatment' 
        : treatmentMetrics.avgEngagement < controlMetrics.avgEngagement
          ? 'control'
          : 'inconclusive';

      // Update experiment
      await db.update(abTestExperiments)
        .set({
          controlEngagement: controlMetrics.avgEngagement.toString(),
          treatmentEngagement: treatmentMetrics.avgEngagement.toString(),
          controlSatisfaction: controlMetrics.avgSatisfaction.toString(),
          treatmentSatisfaction: treatmentMetrics.avgSatisfaction.toString(),
          winner,
          conclusion: `${winner === 'treatment' ? 'Treatment' : 'Control'} algorithm performed better`,
          endedAt: new Date(),
          status: 'completed'
        })
        .where(eq(abTestExperiments.id, experiment.id));

      console.log(`[EVALUATOR] A/B test complete. Winner: ${winner}`);

      return {
        winner,
        controlMetrics,
        treatmentMetrics
      };
    } catch (error) {
      console.error('[EVALUATOR] A/B test evaluation failed:', error);
      return null;
    }
  }

  /**
   * Calculate metrics for a group of recommendations
   */
  private calculateGroupMetrics(outcomes: any[]) {
    const total = outcomes.length;
    const clicked = outcomes.filter(o => o.clicked).length;
    const helpful = outcomes.filter(o => o.helpful === true).length;
    const solved = outcomes.filter(o => o.solvedProblem === true).length;
    const avgEngagement = outcomes.reduce((sum, o) => 
      sum + parseFloat(String(o.actualEngagement || 0)), 0) / Math.max(1, total);
    const avgSatisfaction = outcomes.reduce((sum, o) => 
      sum + parseFloat(String(o.actualLearningGain || 0)), 0) / Math.max(1, total);

    return {
      total,
      clicked,
      helpful,
      solved,
      clickRate: clicked / Math.max(1, total),
      helpfulRate: helpful / Math.max(1, clicked),
      solveRate: solved / Math.max(1, clicked),
      avgEngagement,
      avgSatisfaction
    };
  }
}

// Export singleton
export const evaluatorAgent = new EvaluatorAgent();

/**
 * Background job: Evaluate recommendations daily
 */
export async function runDailyEvaluation() {
  console.log('[EVALUATOR] Starting daily evaluation job');
  
  try {
    const result = await evaluatorAgent.evaluateRecentRecommendations();
    
    console.log(`[EVALUATOR] Daily evaluation complete:`, {
      evaluated: result.evaluated,
      avgQuality: result.avgQuality.toFixed(1)
    });
  } catch (error) {
    console.error('[EVALUATOR] Daily evaluation failed:', error);
  }
}
