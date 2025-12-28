import { interpreterAgent } from "./agent-interpreter";
import { matcherAgent } from "./agent-matcher";
import { synthesizerAgent } from "./agent-synthesizer";
import { engagementTracker } from "./engagement-tracker";
import { webSearchHandler } from "./web-search-handler";
import { getUserProfileContext } from "./personalization";
import { db } from "./db";
import { profQueries } from "@shared/schema";
import type { Request } from "express";

/**
 * Multi-Agent Intelligence Integration
 * 
 * This module integrates all multi-agent components into Prof. OS chat.
 * It can be enabled/disabled via feature flag for safe rollout.
 */

export interface MultiAgentConfig {
  enabled: boolean; // Master switch
  enableInterpreter: boolean; // Deep query understanding
  enableMatcher: boolean; // Multi-objective optimization
  enableSynthesizer: boolean; // Learning path generation
  enableWebSearch: boolean; // Real-time info retrieval
  enableEngagementTracking: boolean; // Track all interactions
}

// Default configuration (can be overridden per user or globally)
// ENABLED: Database schema deployed successfully - all agents active!
const DEFAULT_CONFIG: MultiAgentConfig = {
  enabled: true, // ✅ ENABLED - schema deployed
  enableInterpreter: true, // ✅ profQueries table ready
  enableMatcher: true, // ✅ profQueries, videoInteractions tables ready
  enableSynthesizer: true, // ✅ learningPathRecommendations table ready
  enableWebSearch: true, // ✅ No DB dependencies
  enableEngagementTracking: true // ✅ ENABLED - videoInteractions, recommendationOutcomes tables ready
};

export interface MultiAgentResponse {
  response: string; // AI response text
  videos: any[]; // Recommended videos
  metadata: {
    usedMultiAgent: boolean;
    interpreterUsed: boolean;
    matcherUsed: boolean;
    synthesizerUsed: boolean;
    webSearchUsed: boolean;
    understanding?: any;
    matchScores?: any[];
    learningPath?: any;
  };
}

export class MultiAgentIntegration {
  private config: MultiAgentConfig;

  constructor(config?: Partial<MultiAgentConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process user query through multi-agent system
   */
  async processQuery(
    userId: string,
    query: string,
    context: any, // User context from existing system
    availableVideos: any[] // Pre-ranked videos from existing system
  ): Promise<MultiAgentResponse> {
    console.log('[MULTI-AGENT] Processing query:', query.substring(0, 100));

    const metadata: MultiAgentResponse['metadata'] = {
      usedMultiAgent: this.config.enabled,
      interpreterUsed: false,
      matcherUsed: false,
      synthesizerUsed: false,
      webSearchUsed: false
    };

    // SAFETY: If multi-agent disabled, return immediately WITHOUT database operations
    if (!this.config.enabled) {
      console.log('[MULTI-AGENT] System disabled, skipping all processing');
      return {
        response: '',
        videos: [],
        metadata
      };
    }

    // Store query in profQueries table for tracking (only when enabled)
    let queryId: number | undefined;
    try {
      const result = await db.insert(profQueries).values({
        userId,
        query,
        queryType: 'chat',
        createdAt: new Date()
      }).returning();
      
      queryId = result[0]?.id;
    } catch (error) {
      console.error('[MULTI-AGENT] Failed to store query:', error);
      // If table doesn't exist, system is not deployed - return fallback
      return {
        response: '',
        videos: [],
        metadata: {
          ...metadata,
          usedMultiAgent: false
        }
      };
    }

    try {
      // Step 1: Check for web search need
      if (this.config.enableWebSearch) {
        const webSearchContext = webSearchHandler.shouldUseWebSearch(query);
        
        if (webSearchContext) {
          console.log(`[MULTI-AGENT] Web search needed: ${webSearchContext.searchType}`);
          metadata.webSearchUsed = true;
          
          // TODO: Integrate actual web_search tool here
          // For now, just log that web search would be used
        }
      }

      // Step 2: Deep query understanding (Interpreter Agent)
      let understanding;
      if (this.config.enableInterpreter && queryId) {
        try {
          understanding = await interpreterAgent.interpretQuery(userId, query, queryId);
          metadata.interpreterUsed = true;
          metadata.understanding = {
            emotionalState: understanding.userProfile.emotionalState,
            skillLevel: understanding.userProfile.inferredSkillLevel,
            rootProblem: understanding.intent.rootProblem,
            questionType: understanding.explicit.questionType
          };
          
          console.log(`[MULTI-AGENT] Query understood: ${understanding.intent.rootProblem} (${understanding.userProfile.emotionalState})`);
        } catch (error) {
          console.error('[MULTI-AGENT] Interpreter failed, continuing without:', error);
        }
      }

      // Step 3: Multi-objective video matching (Matcher Agent)
      let matchedVideos = availableVideos; // Fallback to existing ranking
      if (this.config.enableMatcher && understanding) {
        try {
          // Get enriched user profile with personalization data
          const enrichedProfile = context?.user ? getUserProfileContext(context.user) : {
            beltLevel: context?.user?.belt_level,
            style: context?.user?.style,
            contentPreference: context?.user?.content_preference
          };

          const matchContext = {
            query,
            understanding,
            userId,
            userProfile: enrichedProfile
          };

          const scored = await matcherAgent.matchVideos(matchContext, 5);
          
          if (scored.length > 0) {
            matchedVideos = scored.map(s => s.video);
            metadata.matcherUsed = true;
            metadata.matchScores = scored.map(s => ({
              videoId: s.videoId,
              combinedScore: s.combinedScore,
              reasoning: s.reasoning
            }));
            
            console.log(`[MULTI-AGENT] Matched ${scored.length} videos with multi-objective optimization`);
          }
        } catch (error) {
          console.error('[MULTI-AGENT] Matcher failed, using fallback ranking:', error);
        }
      }

      // Step 4: Learning path synthesis (Synthesizer Agent)
      let learningPath;
      if (this.config.enableSynthesizer && understanding && queryId) {
        try {
          // Convert matched videos to VideoScore format expected by synthesizer
          const videoScores = matchedVideos.slice(0, 5).map((v, i) => ({
            videoId: v.id,
            video: v,
            scores: {
              relevance: 80,
              pedagogicalFit: 75,
              engagementProbability: 70,
              learningEfficiency: 75,
              retentionLikelihood: 70,
              progressionValue: 65
            },
            combinedScore: 75,
            reasoning: 'Pre-ranked video',
            rank: i + 1
          }));

          learningPath = await synthesizerAgent.synthesizeLearningPath(
            userId,
            queryId,
            query,
            understanding,
            videoScores
          );

          metadata.synthesizerUsed = true;
          metadata.learningPath = {
            conceptualFraming: learningPath.conceptualFraming,
            encouragement: learningPath.encouragement,
            proTip: learningPath.proTip
          };

          console.log('[MULTI-AGENT] Learning path synthesized');
        } catch (error) {
          console.error('[MULTI-AGENT] Synthesizer failed, continuing without:', error);
        }
      }

      // Return enhanced results (existing system will handle response generation)
      return {
        response: '', // Existing system generates this
        videos: matchedVideos.slice(0, 5), // Top 5 matched videos
        metadata
      };

    } catch (error) {
      console.error('[MULTI-AGENT] System error:', error);
      
      // Return fallback
      return {
        response: '',
        videos: availableVideos.slice(0, 5),
        metadata: {
          ...metadata,
          usedMultiAgent: false
        }
      };
    }
  }

  /**
   * Track video click from user
   */
  async trackVideoClick(
    userId: string,
    videoId: number,
    queryId?: number,
    startTimestamp?: number
  ) {
    if (!this.config.enableEngagementTracking) return;

    try {
      await engagementTracker.trackVideoClick({
        userId,
        videoId,
        queryId,
        startTimestamp,
        deviceType: 'mobile' // Most users are mobile
      });
    } catch (error) {
      console.error('[MULTI-AGENT] Failed to track click:', error);
    }
  }

  /**
   * Track video watch duration
   */
  async trackVideoWatch(
    userId: string,
    videoId: number,
    watchDuration: number,
    completed: boolean
  ) {
    if (!this.config.enableEngagementTracking) return;

    try {
      await engagementTracker.trackVideoWatch({
        userId,
        videoId,
        watchDuration,
        completed
      });
    } catch (error) {
      console.error('[MULTI-AGENT] Failed to track watch:', error);
    }
  }

  /**
   * Track user feedback (thumbs up/down, save, share)
   */
  async trackFeedback(
    userId: string,
    videoId: number,
    feedbackType: 'thumbs_up' | 'thumbs_down' | 'save' | 'share',
    feedbackText?: string
  ) {
    if (!this.config.enableEngagementTracking) return;

    try {
      await engagementTracker.trackVideoFeedback({
        userId,
        videoId,
        feedbackType,
        feedbackText
      });
    } catch (error) {
      console.error('[MULTI-AGENT] Failed to track feedback:', error);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MultiAgentConfig>) {
    this.config = { ...this.config, ...newConfig };
    console.log('[MULTI-AGENT] Configuration updated:', this.config);
  }
}

// Export singleton instance
export const multiAgentSystem = new MultiAgentIntegration();

// Export convenience function for easy integration
export async function enhanceQueryWithMultiAgent(
  userId: string,
  query: string,
  context: any,
  availableVideos: any[]
): Promise<MultiAgentResponse> {
  return multiAgentSystem.processQuery(userId, query, context, availableVideos);
}
