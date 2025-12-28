import { aiOrchestrator } from "./ai-orchestrator";
import { db } from "./db";
import { learningPathRecommendations } from "@shared/schema";
import type { QueryUnderstanding } from "./agent-interpreter";
import type { VideoScore } from "./agent-matcher";

/**
 * AGENT 4: THE SYNTHESIZER
 * Creates optimal learning experiences, not just "show videos"
 * 
 * Outputs:
 * - Conceptual framing (set context before showing videos)
 * - Primary recommendation (best immediate answer)
 * - Supporting content (builds foundation)
 * - Preview of progression (what's next)
 * - Encouragement/motivation (especially if user is frustrated)
 * - Metacognitive guidance (help them learn how to learn)
 */

export interface LearningPathResponse {
  conceptualFraming: string; // Context before videos
  primaryVideo: {
    videoId: number;
    title: string;
    instructor: string;
    startTime?: number; // Specific timestamp to start at
    why: string; // Why this video first
  };
  foundationVideos: Array<{
    videoId: number;
    title: string;
    instructor: string;
    why: string;
  }>;
  troubleshootingVideos: Array<{
    videoId: number;
    title: string;
    instructor: string;
    why: string;
  }>;
  progressionVideos: Array<{
    videoId: number;
    title: string;
    instructor: string;
    why: string;
  }>;
  encouragement: string; // Motivational message
  proTip: string; // Metacognitive guidance
  keyMetric: string; // What to measure for success
  presentationStyle: 'empathetic' | 'direct' | 'encouraging' | 'technical';
}

export class SynthesizerAgent {
  /**
   * Synthesize optimal learning experience from matched videos
   */
  async synthesizeLearningPath(
    userId: string,
    queryId: number,
    query: string,
    understanding: QueryUnderstanding,
    rankedVideos: VideoScore[]
  ): Promise<LearningPathResponse> {
    console.log(`[SYNTHESIZER] Creating learning path for: "${query}"`);

    if (rankedVideos.length === 0) {
      return this.createFallbackResponse(query, understanding);
    }

    // Categorize videos by role
    const primary = rankedVideos[0];
    const foundation = this.selectFoundationVideos(rankedVideos, understanding);
    const troubleshooting = this.selectTroubleshootingVideos(rankedVideos, understanding);
    const progression = this.selectProgressionVideos(rankedVideos, understanding);

    // Generate contextual framing
    const conceptualFraming = await this.generateConceptualFraming(query, understanding, primary);

    // Generate encouragement based on emotional state
    const encouragement = this.generateEncouragement(understanding);

    // Generate metacognitive guidance
    const proTip = this.generateProTip(understanding, primary);

    // Determine key success metric
    const keyMetric = this.determineKeyMetric(understanding);

    // Build response
    const response: LearningPathResponse = {
      conceptualFraming,
      primaryVideo: {
        videoId: primary.video.id,
        title: primary.video.title,
        instructor: primary.video.instructorName,
        startTime: this.selectOptimalTimestamp(primary.video, understanding),
        why: this.explainPrimaryChoice(primary, understanding)
      },
      foundationVideos: foundation.map(v => ({
        videoId: v.video.id,
        title: v.video.title,
        instructor: v.video.instructorName,
        why: 'Builds fundamental understanding'
      })),
      troubleshootingVideos: troubleshooting.map(v => ({
        videoId: v.video.id,
        title: v.video.title,
        instructor: v.video.instructorName,
        why: 'If primary approach doesn\'t work'
      })),
      progressionVideos: progression.map(v => ({
        videoId: v.video.id,
        title: v.video.title,
        instructor: v.video.instructorName,
        why: 'Next steps after mastery'
      })),
      encouragement,
      proTip,
      keyMetric,
      presentationStyle: understanding.recommendationStrategy.presentationStyle
    };

    // Save learning path to database
    await this.saveLearningPath(userId, queryId, response);

    console.log(`[SYNTHESIZER] Learning path created with ${rankedVideos.length} total videos`);

    return response;
  }

  /**
   * Generate conceptual framing using AI
   */
  private async generateConceptualFraming(
    query: string,
    understanding: QueryUnderstanding,
    primary: VideoScore
  ): Promise<string> {
    const prompt = `You are Prof. OS, a BJJ black belt coach. A student asked: "${query}"

Their emotional state: ${understanding.userProfile.emotionalState}
Their skill level: ${understanding.userProfile.inferredSkillLevel}
Root problem: ${understanding.intent.rootProblem}

You're about to recommend "${primary.video.title}" by ${primary.video.instructorName}.

Write a brief (2-3 sentences) conceptual framing that:
1. Acknowledges their question/frustration
2. Provides key insight they need to understand
3. Sets up WHY the video recommendation will help

Be conversational, supportive, and insightful. Speak like a coach, not a robot.`;

    try {
      const response = await aiOrchestrator.call(
        'recommendation_synthesis',
        prompt,
        { maxTokens: 200, temperature: 0.8 }
      );

      return response.content.trim();
    } catch (error) {
      console.error('[SYNTHESIZER] Failed to generate framing:', error);
      return `Great question! Let's break this down systematically.`;
    }
  }

  /**
   * Select foundation videos (prerequisites)
   */
  private selectFoundationVideos(videos: VideoScore[], understanding: QueryUnderstanding): VideoScore[] {
    if (!understanding.learningPath.prerequisiteCheck.needs_fundamentals) {
      return [];
    }

    // Find videos that cover fundamentals
    return videos
      .filter(v => 
        v.video.skillLevel === 'beginner' || 
        v.video.coversMistakes ||
        v.scores.learningEfficiency > 70
      )
      .slice(0, 2); // Max 2 foundation videos
  }

  /**
   * Select troubleshooting videos (alternatives)
   */
  private selectTroubleshootingVideos(videos: VideoScore[], understanding: QueryUnderstanding): VideoScore[] {
    if (understanding.explicit.questionType !== 'troubleshooting') {
      return [];
    }

    // Find videos that cover mistakes/troubleshooting
    return videos
      .filter(v => 
        v.video.coversMistakes || 
        v.video.showsLiveApplication
      )
      .slice(1, 3); // Videos 2-3 (skip primary)
  }

  /**
   * Select progression videos (next steps)
   */
  private selectProgressionVideos(videos: VideoScore[], understanding: QueryUnderstanding): VideoScore[] {
    // Find videos that match follow-up concepts
    return videos
      .filter(v => {
        const followUpConcepts = understanding.learningPath?.followUpConcepts || [];
        const hasFollowUp = followUpConcepts.some(
          concept => concept && v.video?.title && v.video.title.toLowerCase().includes(concept.toLowerCase())
        );
        return hasFollowUp || v.scores.progressionValue > 70;
      })
      .slice(0, 2); // Max 2 progression videos
  }

  /**
   * Select optimal timestamp to start video
   */
  private selectOptimalTimestamp(video: any, understanding: QueryUnderstanding): number | undefined {
    if (!video.timestamps || Object.keys(video.timestamps).length === 0) {
      return undefined;
    }

    // Find timestamp that best matches the query
    const timestamps = video.timestamps as Record<string, { time: number; description: string; keywords: string[] }>;
    
    // Look for keywords from query in timestamp descriptions
    const queryWords = understanding.explicit?.keywords || [];
    
    // If no query words, return undefined
    if (queryWords.length === 0) {
      return undefined;
    }
    
    let bestMatch: { time: number; matchCount: number } | null = null;

    for (const [key, ts] of Object.entries(timestamps)) {
      if (!ts.description || !ts.keywords) continue;
      
      const descWords = ts.description.toLowerCase().split(/\s+/);
      const keywordWords = ts.keywords.map(k => k?.toLowerCase?.() || '').filter(k => k);
      const allWords = [...descWords, ...keywordWords];

      const matchCount = queryWords.filter(qw => 
        qw && allWords.some(w => w.includes(qw.toLowerCase()))
      ).length;

      if (!bestMatch || matchCount > bestMatch.matchCount) {
        bestMatch = { time: ts.time, matchCount };
      }
    }

    return bestMatch ? bestMatch.time : undefined;
  }

  /**
   * Explain why primary video was chosen
   */
  private explainPrimaryChoice(primary: VideoScore, understanding: QueryUnderstanding): string {
    const reasons: string[] = [];

    if (primary.scores.relevance > 80) {
      reasons.push('directly answers your question');
    }

    if (primary.scores.pedagogicalFit > 75) {
      reasons.push(`matches your ${understanding.userProfile.inferredLearningStyle} learning style`);
    }

    if (primary.scores.learningEfficiency > 75) {
      reasons.push('perfect for your current level');
    }

    if (primary.video.instructorCredibilityScore > 25) {
      reasons.push(`${primary.video.instructorName} is highly credible`);
    }

    return reasons.length > 0 
      ? reasons.slice(0, 2).join(' and ')
      : 'best overall match for your needs';
  }

  /**
   * Generate encouragement based on emotional state
   */
  private generateEncouragement(understanding: QueryUnderstanding): string {
    switch (understanding.userProfile.emotionalState) {
      case 'frustrated':
        return `This is a really common issue - you're not alone! The key insight will help everything click.`;
      
      case 'confused':
        return `Don't worry, this concept confuses many people at first. We'll break it down step by step.`;
      
      case 'excited':
        return `Love the enthusiasm! This technique is going to add a powerful tool to your game.`;
      
      case 'curious':
      default:
        return `Great question! Understanding this will level up your game significantly.`;
    }
  }

  /**
   * Generate metacognitive guidance (help them learn how to learn)
   */
  private generateProTip(understanding: QueryUnderstanding, primary: VideoScore): string {
    if (understanding.explicit.questionType === 'troubleshooting') {
      return `PRO TIP: When troubleshooting, focus on one detail at a time. Master the mechanics before worrying about timing.`;
    }

    if (understanding.userProfile.inferredSkillLevel === 'beginner') {
      return `PRO TIP: Watch the video once for overall concept, then rewatch focusing on specific details. Repetition builds mastery.`;
    }

    if (primary.video.coversMistakes) {
      return `PRO TIP: Pay special attention to the "common mistakes" section - knowing what NOT to do is just as important as the technique itself.`;
    }

    return `PRO TIP: After watching, try drilling it slowly 5-10 times before going live. Muscle memory takes repetition.`;
  }

  /**
   * Determine key success metric
   */
  private determineKeyMetric(understanding: QueryUnderstanding): string {
    if (understanding.explicit.questionType === 'troubleshooting') {
      const problem = understanding.intent.rootProblem;
      return `Success metric: Can you execute the technique without experiencing "${problem}"?`;
    }

    if (understanding.userProfile.inferredSkillLevel === 'beginner') {
      return `Success metric: Can you perform the basic movement slowly and correctly?`;
    }

    return `Success metric: Can you apply this in live rolling?`;
  }

  /**
   * Save learning path to database
   */
  private async saveLearningPath(
    userId: string,
    queryId: number,
    response: LearningPathResponse
  ) {
    try {
      await db.insert(learningPathRecommendations).values({
        userId,
        queryId,
        primaryVideoId: response.primaryVideo.videoId,
        foundationVideoIds: response.foundationVideos.map(v => v.videoId),
        troubleshootingVideoIds: response.troubleshootingVideos.map(v => v.videoId),
        progressionVideoIds: response.progressionVideos.map(v => v.videoId),
        conceptualFraming: response.conceptualFraming,
        encouragement: response.encouragement,
        metacognitiveGuidance: response.proTip
      });

      console.log(`[SYNTHESIZER] Learning path saved to database`);
    } catch (error) {
      console.error('[SYNTHESIZER] Failed to save learning path:', error);
    }
  }

  /**
   * Fallback response when no videos found
   */
  private createFallbackResponse(query: string, understanding: QueryUnderstanding): LearningPathResponse {
    return {
      conceptualFraming: `I don't have a specific video for "${query}" yet, but let me help guide you.`,
      primaryVideo: {
        videoId: 0,
        title: 'No video available',
        instructor: 'Prof. OS',
        why: 'Expanding video library soon'
      },
      foundationVideos: [],
      troubleshootingVideos: [],
      progressionVideos: [],
      encouragement: `I'm still learning and building my video library. In the meantime, I'd recommend asking your coach about ${understanding.explicit.technique || query}.`,
      proTip: `PRO TIP: The best way to learn is through consistent drilling with a patient training partner.`,
      keyMetric: `Focus on understanding the fundamental movement pattern first.`,
      presentationStyle: 'empathetic'
    };
  }
}

// Export singleton
export const synthesizerAgent = new SynthesizerAgent();
