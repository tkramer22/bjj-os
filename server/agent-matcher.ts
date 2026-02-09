import { db } from "./db";
import { aiVideoKnowledge, bjjUsers, videoInteractions, recommendationOutcomes, instructorCredibility } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { QueryUnderstanding } from "./agent-interpreter";

/**
 * AGENT 3: THE MATCHER
 * Intelligent recommendation with multi-objective optimization
 * 
 * Optimizes for:
 * - Relevance to immediate question (30%)
 * - Pedagogical fit (20%)
 * - Engagement probability (15%)
 * - Learning efficiency (15%)
 * - Retention likelihood (10%)
 * - Progression value (10%)
 */

export interface VideoScore {
  videoId: number;
  video: any; // Full video object
  scores: {
    relevance: number; // 0-100
    pedagogicalFit: number; // 0-100
    engagementProbability: number; // 0-100
    learningEfficiency: number; // 0-100
    retentionLikelihood: number; // 0-100
    progressionValue: number; // 0-100
  };
  combinedScore: number; // 0-100 weighted average
  reasoning: string;
  rank: number;
}

export interface MatchingContext {
  query: string;
  understanding: QueryUnderstanding;
  userId: string;
  userProfile?: {
    beltLevel?: string;
    style?: string;
    contentPreference?: string;
  };
  userHistory?: {
    viewedVideos: number[];
    savedVideos: number[];
    avgWatchDuration: number;
    completionRate: number;
  };
}

export class MatcherAgent {
  /**
   * Find and rank best videos for user query
   */
  async matchVideos(
    context: MatchingContext,
    maxResults: number = 5
  ): Promise<VideoScore[]> {
    console.log(`[MATCHER] Finding best videos for query: "${context.query}"`);

    // Get candidate videos based on query understanding
    const candidates = await this.getCandidateVideos(context);

    if (candidates.length === 0) {
      console.log('[MATCHER] No candidate videos found');
      return [];
    }

    // Get user context for personalization
    const userContext = await this.getUserContext(context.userId);

    // Score each candidate
    const scoredVideos: VideoScore[] = [];

    for (const video of candidates) {
      const scores = await this.scoreVideo(video, context, userContext);
      const combinedScore = this.calculateCombinedScore(scores);

      scoredVideos.push({
        videoId: video.id,
        video,
        scores,
        combinedScore,
        reasoning: this.generateReasoning(scores, context.understanding),
        rank: 0 // Will be set after sorting
      });
    }

    // Sort by combined score and assign ranks
    scoredVideos.sort((a, b) => b.combinedScore - a.combinedScore);
    scoredVideos.forEach((v, i) => v.rank = i + 1);

    // Return top N
    const topVideos = scoredVideos.slice(0, maxResults);

    console.log(`[MATCHER] Ranked ${topVideos.length} videos:`, 
      topVideos.map(v => `#${v.rank}: ${v.video.title} (score: ${v.combinedScore.toFixed(1)})`));

    return topVideos;
  }

  /**
   * Get candidate videos based on query understanding
   * CRITICAL: Only return videos that match the requested technique - no substitutions
   */
  private async getCandidateVideos(context: MatchingContext): Promise<any[]> {
    const { understanding } = context;

    try {
      // If a specific technique is requested, we MUST match it exactly
      // Do NOT substitute with unrelated techniques
      if (understanding.explicit.technique) {
        const technique = understanding.explicit.technique.toLowerCase();
        console.log(`[MATCHER] Searching for exact technique: "${technique}"`);
        
        // Build strict technique matching patterns
        // For "triangle choke", match "triangle", "triangulo", "sankaku"
        const techniqueVariations = this.getTechniqueVariations(technique);
        
        const techniqueConditions = techniqueVariations.map(variation => {
          const pattern = `%${variation}%`;
          return sql`(
            LOWER(${aiVideoKnowledge.techniqueName}) ILIKE ${pattern} OR
            LOWER(${aiVideoKnowledge.title}) ILIKE ${pattern} OR
            (${aiVideoKnowledge.tags}::text ILIKE ${pattern})
          )`;
        });
        
        const results = await db.select()
          .from(aiVideoKnowledge)
          .where(and(sql`(${sql.join(techniqueConditions, sql.raw(' OR '))})`, eq(aiVideoKnowledge.status, 'active')))
          .orderBy(desc(aiVideoKnowledge.qualityScore))
          .limit(20);
        
        console.log(`[MATCHER] Found ${results.length} videos matching technique "${technique}"`);
        
        // If we found matching videos, return them
        if (results.length > 0) {
          return results;
        }
        
        // CRITICAL: If no matching videos found, return EMPTY array
        // Do NOT fall back to random high-quality videos
        console.log(`[MATCHER] No videos found for technique "${technique}" - returning empty (no substitution)`);
        return [];
      }

      // Position-only search (no specific technique requested)
      if (understanding.explicit.position) {
        const positionPattern = `%${understanding.explicit.position}%`;
        const results = await db.select()
          .from(aiVideoKnowledge)
          .where(and(sql`LOWER(${aiVideoKnowledge.title}) ILIKE ${positionPattern}`, eq(aiVideoKnowledge.status, 'active')))
          .orderBy(desc(aiVideoKnowledge.qualityScore))
          .limit(20);
        
        if (results.length > 0) {
          return results;
        }
      }

      // Keyword search if no specific technique or position
      if (understanding.explicit.keywords.length > 0) {
        const keyword = understanding.explicit.keywords[0];
        const keywordPattern = `%${keyword}%`;
        const results = await db.select()
          .from(aiVideoKnowledge)
          .where(and(sql`LOWER(${aiVideoKnowledge.title}) ILIKE ${keywordPattern}`, eq(aiVideoKnowledge.status, 'active')))
          .orderBy(desc(aiVideoKnowledge.qualityScore))
          .limit(20);
        
        if (results.length > 0) {
          return results;
        }
      }

      // No matching videos found - return empty array, NOT random videos
      console.log('[MATCHER] No specific criteria matched - returning empty array');
      return [];
      
    } catch (error) {
      console.error('[MATCHER] Failed to get candidate videos:', error);
      // On error, return empty - do NOT return random videos
      return [];
    }
  }

  /**
   * Get technique variations for fuzzy matching
   * Maps techniques to their common variations and aliases
   */
  private getTechniqueVariations(technique: string): string[] {
    const variations = [technique];
    const lowerTechnique = technique.toLowerCase();
    
    // Triangle choke variations
    if (lowerTechnique.includes('triangle')) {
      variations.push('triangle', 'triangulo', 'sankaku', 'triangl');
    }
    
    // Armbar variations
    if (lowerTechnique.includes('armbar') || lowerTechnique.includes('arm bar')) {
      variations.push('armbar', 'arm bar', 'juji gatame', 'juji-gatame', 'armlock');
    }
    
    // Kimura variations
    if (lowerTechnique.includes('kimura')) {
      variations.push('kimura', 'double wristlock', 'americana', 'ude garami');
    }
    
    // Guillotine variations
    if (lowerTechnique.includes('guillotine')) {
      variations.push('guillotine', 'guillotin', 'gillotin');
    }
    
    // Rear naked choke variations
    if (lowerTechnique.includes('rear naked') || lowerTechnique.includes('rnc')) {
      variations.push('rear naked', 'rnc', 'mata leao', 'lion killer');
    }
    
    // Omoplata variations
    if (lowerTechnique.includes('omoplata')) {
      variations.push('omoplata', 'omo plata', 'shoulder lock');
    }
    
    // Guard pass variations
    if (lowerTechnique.includes('pass') || lowerTechnique.includes('passing')) {
      variations.push('pass', 'passing', 'guard pass');
    }
    
    // Sweep variations
    if (lowerTechnique.includes('sweep')) {
      variations.push('sweep', 'reversal');
    }
    
    return [...new Set(variations)]; // Remove duplicates
  }

  /**
   * Get user context for personalization
   */
  private async getUserContext(userId: string) {
    try {
      // Get user profile
      const user = await db.select()
        .from(bjjUsers)
        .where(eq(bjjUsers.id, userId))
        .limit(1);

      // Get user's video interactions
      const interactions = await db.select()
        .from(videoInteractions)
        .where(eq(videoInteractions.userId, userId))
        .orderBy(desc(videoInteractions.createdAt))
        .limit(50);

      // Get user's recommendation outcomes
      const outcomes = await db.select()
        .from(recommendationOutcomes)
        .where(eq(recommendationOutcomes.userId, userId))
        .orderBy(desc(recommendationOutcomes.createdAt))
        .limit(50);

      return {
        profile: user[0] || null,
        interactions,
        outcomes,
        viewedVideos: interactions.filter(i => i.clicked).map(i => i.videoId),
        savedVideos: interactions.filter(i => i.savedToLibrary).map(i => i.videoId),
        avgWatchDuration: this.calculateAvgWatchDuration(interactions),
        completionRate: this.calculateCompletionRate(interactions)
      };
    } catch (error) {
      console.error('[MATCHER] Failed to get user context:', error);
      return {
        profile: null,
        interactions: [],
        outcomes: [],
        viewedVideos: [],
        savedVideos: [],
        avgWatchDuration: 0,
        completionRate: 0
      };
    }
  }

  /**
   * Score individual video against all criteria
   */
  private async scoreVideo(
    video: any,
    context: MatchingContext,
    userContext: any
  ): Promise<VideoScore['scores']> {
    // 1. Relevance (30%): How well does content match query?
    const relevance = this.scoreRelevance(video, context.understanding);

    // 2. Pedagogical Fit (20%): Does teaching style match user's learning style?
    const pedagogicalFit = this.scorePedagogicalFit(video, context.understanding, userContext);

    // 3. Engagement Probability (15%): Will they actually watch it?
    const engagementProbability = await this.scoreEngagementProbability(video, userContext);

    // 4. Learning Efficiency (15%): Will they learn effectively from this?
    const learningEfficiency = this.scoreLearningEfficiency(video, context.understanding);

    // 5. Retention Likelihood (10%): Will they remember it?
    const retentionLikelihood = this.scoreRetentionLikelihood(video, context.understanding);

    // 6. Progression Value (10%): Does it move them forward?
    const progressionValue = this.scoreProgressionValue(video, context.understanding, userContext);

    return {
      relevance,
      pedagogicalFit,
      engagementProbability,
      learningEfficiency,
      retentionLikelihood,
      progressionValue
    };
  }

  /**
   * Score relevance to query
   */
  private scoreRelevance(video: any, understanding: QueryUnderstanding): number {
    let score = 50; // Base score

    // Exact technique match
    if (understanding.explicit.technique) {
      const title = video.title.toLowerCase();
      const technique = understanding.explicit.technique.toLowerCase();
      
      if (title.includes(technique)) {
        score += 30;
      }
    }

    // Position match
    if (understanding.explicit.position) {
      const title = video.title.toLowerCase();
      const position = understanding.explicit.position.toLowerCase();
      
      if (title.includes(position)) {
        score += 20;
      }
    }

    // Question type alignment
    if (understanding.explicit.questionType === 'troubleshooting' && video.coversMistakes) {
      score += 10;
    }

    // Has timestamps (more specific content)
    if (video.timestampCount && video.timestampCount > 5) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Score pedagogical fit (teaching style match)
   */
  private scorePedagogicalFit(
    video: any,
    understanding: QueryUnderstanding,
    userContext: any
  ): number {
    let score = 50;

    // Match presentation style to user's emotional state
    if (understanding.userProfile.emotionalState === 'frustrated') {
      // Frustrated users need encouraging, clear instruction
      if (video.teachingClarityScore && video.teachingClarityScore > 15) {
        score += 25;
      }
    } else if (understanding.userProfile.emotionalState === 'curious') {
      // Curious users can handle more complex content
      if (video.technicalDepth === 'advanced') {
        score += 15;
      }
    }

    // Match to learning style
    if (understanding.userProfile.inferredLearningStyle === 'step-by-step') {
      if (video.timestampCount && video.timestampCount > 8) {
        score += 20; // More timestamps = more step-by-step
      }
    }

    // Match to skill level
    const beltMatch = this.matchBeltLevel(
      video.skillLevel,
      understanding.userProfile.inferredSkillLevel
    );
    score += beltMatch * 25;

    return Math.min(100, score);
  }

  /**
   * Score engagement probability (will they watch?)
   */
  private async scoreEngagementProbability(video: any, userContext: any): Promise<number> {
    let score = 50;

    // Check if user has engaged with this instructor before
    const instructorVideos = userContext.interactions.filter(
      (i: any) => i.videoId && userContext.profile?.favoriteInstructors?.includes(video.instructorName)
    );

    if (instructorVideos.length > 0) {
      const avgCompletion = instructorVideos.reduce((sum: number, i: any) => 
        sum + (i.completed ? 1 : 0), 0) / instructorVideos.length;
      
      score += avgCompletion * 30; // Boost if they complete this instructor's videos
    }

    // Production quality matters for engagement
    if (video.productionQualityScore && video.productionQualityScore > 7) {
      score += 15;
    }

    // Video duration sweet spot (10-20 minutes tends to have best completion)
    if (video.duration) {
      const durationMatch = this.matchDurationPreference(video.duration, userContext.avgWatchDuration);
      score += durationMatch * 15;
    }

    // Fresh content gets slight boost
    const daysSincePublished = this.getDaysSincePublished(video.publishedAt);
    if (daysSincePublished < 90) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Score learning efficiency (will they actually learn?)
   */
  private scoreLearningEfficiency(video: any, understanding: QueryUnderstanding): number {
    let score = 50;

    // Prerequisites alignment
    if (understanding.learningPath.prerequisiteCheck.needs_fundamentals) {
      // User needs fundamentals - prefer fundamental-focused content
      if (video.skillLevel === 'beginner' || video.coversMistakes) {
        score += 30;
      }
    } else if (understanding.learningPath.prerequisiteCheck.ready_for_advanced) {
      // User ready for advanced - prefer higher-level content
      if (video.skillLevel === 'advanced') {
        score += 30;
      }
    }

    // Teaching clarity is critical for learning
    if (video.teachingClarityScore) {
      score += (video.teachingClarityScore / 20) * 20; // Scale 0-20 to 0-20 contribution
    }

    // Comprehensive timestamps = better learning
    if (video.timestampCount && video.timestampCount >= 10) {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * Score retention likelihood (will they remember?)
   */
  private scoreRetentionLikelihood(video: any, understanding: QueryUnderstanding): number {
    let score = 50;

    // Covers mistakes = better retention (knowing what NOT to do)
    if (video.coversMistakes) {
      score += 25;
    }

    // Shows live application = better retention (seeing it in action)
    if (video.showsLiveApplication) {
      score += 20;
    }

    // Drilling exercises = better retention (practice)
    if (video.includesDrilling) {
      score += 15;
    }

    // Clear instruction = better retention
    if (video.teachingClarityScore && video.teachingClarityScore > 15) {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * Score progression value (does it move them forward?)
   */
  private scoreProgressionValue(
    video: any,
    understanding: QueryUnderstanding,
    userContext: any
  ): number {
    let score = 50;

    // Haven't seen this video before = new learning
    if (!userContext.viewedVideos.includes(video.id)) {
      score += 30;
    }

    // Matches next steps in learning path
    if (understanding.learningPath.followUpConcepts.length > 0) {
      const hasFollowUp = understanding.learningPath.followUpConcepts.some(
        concept => video.title.toLowerCase().includes(concept.toLowerCase())
      );
      
      if (hasFollowUp) {
        score += 25;
      }
    }

    // High-quality instruction moves them forward faster
    if (video.instructorCredibilityScore && video.instructorCredibilityScore > 25) {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * Calculate combined score with weights
   */
  private calculateCombinedScore(scores: VideoScore['scores']): number {
    return (
      scores.relevance * 0.30 +
      scores.pedagogicalFit * 0.20 +
      scores.engagementProbability * 0.15 +
      scores.learningEfficiency * 0.15 +
      scores.retentionLikelihood * 0.10 +
      scores.progressionValue * 0.10
    );
  }

  /**
   * Generate reasoning for recommendation
   */
  private generateReasoning(scores: VideoScore['scores'], understanding: QueryUnderstanding): string {
    const reasons: string[] = [];

    // Find top 2-3 scores
    const scoreEntries = Object.entries(scores).sort((a, b) => b[1] - a[1]);

    for (const [key, value] of scoreEntries.slice(0, 3)) {
      if (value > 70) {
        switch (key) {
          case 'relevance':
            reasons.push('highly relevant to your question');
            break;
          case 'pedagogicalFit':
            reasons.push(`matches your ${understanding.userProfile.inferredLearningStyle} learning style`);
            break;
          case 'engagementProbability':
            reasons.push('high engagement rate with similar users');
            break;
          case 'learningEfficiency':
            reasons.push('efficient learning for your skill level');
            break;
          case 'retentionLikelihood':
            reasons.push('high retention (covers mistakes & application)');
            break;
          case 'progressionValue':
            reasons.push('moves you forward on your BJJ journey');
            break;
        }
      }
    }

    return reasons.join(', ') || 'good overall match';
  }

  // Helper methods
  private calculateAvgWatchDuration(interactions: any[]): number {
    const watched = interactions.filter(i => i.watchDuration && i.watchDuration > 0);
    if (watched.length === 0) return 0;
    
    return watched.reduce((sum, i) => sum + (i.watchDuration || 0), 0) / watched.length;
  }

  private calculateCompletionRate(interactions: any[]): number {
    const clicked = interactions.filter(i => i.clicked);
    if (clicked.length === 0) return 0;
    
    const completed = clicked.filter(i => i.completed);
    return completed.length / clicked.length;
  }

  private matchBeltLevel(videoLevel: string, userLevel: string): number {
    const levels: Record<string, number> = {
      'beginner': 1,
      'intermediate': 2,
      'advanced': 3
    };

    const videoNum = levels[videoLevel] || 2;
    const userNum = levels[userLevel] || 2;

    const diff = Math.abs(videoNum - userNum);
    
    if (diff === 0) return 1.0; // Perfect match
    if (diff === 1) return 0.7; // Close match
    return 0.3; // Far apart
  }

  private matchDurationPreference(videoDuration: string, avgWatchDuration: number): number {
    // Guard against null/undefined videoDuration
    if (!videoDuration || typeof videoDuration !== 'string') {
      return 0.5; // Default score if duration is missing
    }
    
    // Parse ISO 8601 duration (PT10M30S)
    const match = videoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0.5;

    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;

    if (avgWatchDuration === 0) {
      // No history - prefer 10-20 min videos
      return totalSeconds >= 600 && totalSeconds <= 1200 ? 1.0 : 0.5;
    }

    // Match to user's average watch duration
    const diff = Math.abs(totalSeconds - avgWatchDuration);
    
    if (diff < 300) return 1.0; // Within 5 minutes
    if (diff < 600) return 0.7; // Within 10 minutes
    return 0.3; // More than 10 minutes off
  }

  private getDaysSincePublished(publishedAt: string): number {
    const published = new Date(publishedAt);
    const now = new Date();
    const diff = now.getTime() - published.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }
}

// Export singleton
export const matcherAgent = new MatcherAgent();
