import { db } from "./db";
import { videoInteractions, recommendationOutcomes } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import type { Request } from "express";

/**
 * Engagement Tracker - Comprehensive user interaction logging
 * Tracks all video clicks, watch duration, feedback, and learning signals
 */

export interface VideoClickEvent {
  userId: string;
  videoId: number;
  queryId?: number;
  startTimestamp?: number; // Timestamp in video (seconds)
  deviceType?: 'mobile' | 'desktop' | 'tablet';
}

export interface VideoWatchEvent {
  userId: string;
  videoId: number;
  watchDuration: number; // Seconds watched
  completed: boolean; // Did they watch to the end of the timestamp segment
}

export interface VideoFeedbackEvent {
  userId: string;
  videoId: number;
  feedbackType: 'thumbs_up' | 'thumbs_down' | 'save' | 'share';
  feedbackText?: string;
}

export interface LearningSignalEvent {
  userId: string;
  videoId: number;
  signalType: 'rewatch' | 'problem_solved' | 'follow_up_query';
  metadata?: Record<string, any>;
}

export interface RecommendationEvent {
  userId: string;
  queryId: number;
  videoId: number;
  recommendationRank: number; // 1st, 2nd, 3rd, etc.
  algorithm: string; // Which recommendation algorithm was used
  relevanceScore?: number;
  pedagogyScore?: number;
  engagementPrediction?: number;
}

class EngagementTracker {
  /**
   * Track video click event
   */
  async trackVideoClick(event: VideoClickEvent) {
    try {
      const deviceType = event.deviceType || this.detectDeviceType();

      // Create or update interaction record
      const result = await db.insert(videoInteractions).values({
        userId: event.userId,
        videoId: event.videoId,
        queryId: event.queryId,
        clicked: true,
        clickedAt: new Date(),
        startTimestamp: event.startTimestamp,
        deviceType
      }).returning();

      console.log(`[ENGAGEMENT] Video click tracked: user=${event.userId}, video=${event.videoId}`);
      
      // Also update recommendation outcome if this was from a recommendation
      if (event.queryId) {
        await this.updateRecommendationOutcome(event.userId, event.queryId, event.videoId, {
          clicked: true
        });
      }

      return result[0];
    } catch (error) {
      console.error('[ENGAGEMENT] Failed to track video click:', error);
      return null;
    }
  }

  /**
   * Track video watch duration
   */
  async trackVideoWatch(event: VideoWatchEvent) {
    try {
      // Find existing interaction record
      const existing = await db.select()
        .from(videoInteractions)
        .where(and(
          eq(videoInteractions.userId, event.userId),
          eq(videoInteractions.videoId, event.videoId)
        ))
        .orderBy(desc(videoInteractions.createdAt))
        .limit(1);

      if (existing.length > 0) {
        // Update existing record
        await db.update(videoInteractions)
          .set({
            watchDuration: event.watchDuration,
            completed: event.completed,
            updatedAt: new Date()
          })
          .where(eq(videoInteractions.id, existing[0].id));

        console.log(`[ENGAGEMENT] Watch duration updated: user=${event.userId}, video=${event.videoId}, duration=${event.watchDuration}s`);
      } else {
        // Create new record (shouldn't happen if click was tracked, but handle it)
        await db.insert(videoInteractions).values({
          userId: event.userId,
          videoId: event.videoId,
          watchDuration: event.watchDuration,
          completed: event.completed
        });
      }

      // Update recommendation outcome engagement metrics
      const engagement = this.calculateEngagementScore(event.watchDuration, event.completed);
      await this.updateRecommendationOutcome(event.userId, undefined, event.videoId, {
        actualEngagement: engagement.toString()
      });
    } catch (error) {
      console.error('[ENGAGEMENT] Failed to track video watch:', error);
    }
  }

  /**
   * Track user feedback
   */
  async trackVideoFeedback(event: VideoFeedbackEvent) {
    try {
      const updates: any = {
        updatedAt: new Date()
      };

      if (event.feedbackType === 'thumbs_up') {
        updates.thumbsUp = true;
        updates.thumbsDown = false;
      } else if (event.feedbackType === 'thumbs_down') {
        updates.thumbsUp = false;
        updates.thumbsDown = true;
      } else if (event.feedbackType === 'save') {
        updates.savedToLibrary = true;
      } else if (event.feedbackType === 'share') {
        updates.sharedWithOthers = true;
      }

      if (event.feedbackText) {
        updates.feedbackText = event.feedbackText;
      }

      // Find and update existing interaction
      const existing = await db.select()
        .from(videoInteractions)
        .where(and(
          eq(videoInteractions.userId, event.userId),
          eq(videoInteractions.videoId, event.videoId)
        ))
        .orderBy(desc(videoInteractions.createdAt))
        .limit(1);

      if (existing.length > 0) {
        await db.update(videoInteractions)
          .set(updates)
          .where(eq(videoInteractions.id, existing[0].id));
      } else {
        // Create new record with feedback
        await db.insert(videoInteractions).values({
          userId: event.userId,
          videoId: event.videoId,
          ...updates
        });
      }

      console.log(`[ENGAGEMENT] Feedback tracked: user=${event.userId}, video=${event.videoId}, type=${event.feedbackType}`);

      // Update recommendation outcome
      if (event.feedbackType === 'thumbs_up' || event.feedbackType === 'save') {
        await this.updateRecommendationOutcome(event.userId, undefined, event.videoId, {
          helpful: true
        });
      }
    } catch (error) {
      console.error('[ENGAGEMENT] Failed to track feedback:', error);
    }
  }

  /**
   * Track learning signals
   */
  async trackLearningSignal(event: LearningSignalEvent) {
    try {
      const updates: any = {
        updatedAt: new Date()
      };

      if (event.signalType === 'rewatch') {
        // Increment rewatch count
        const existing = await db.select()
          .from(videoInteractions)
          .where(and(
            eq(videoInteractions.userId, event.userId),
            eq(videoInteractions.videoId, event.videoId)
          ))
          .orderBy(desc(videoInteractions.createdAt))
          .limit(1);

        if (existing.length > 0) {
          updates.rewatchCount = (existing[0].rewatchCount || 0) + 1;
          
          await db.update(videoInteractions)
            .set(updates)
            .where(eq(videoInteractions.id, existing[0].id));
        }
      } else if (event.signalType === 'problem_solved') {
        updates.problemSolved = true;

        const existing = await db.select()
          .from(videoInteractions)
          .where(and(
            eq(videoInteractions.userId, event.userId),
            eq(videoInteractions.videoId, event.videoId)
          ))
          .orderBy(desc(videoInteractions.createdAt))
          .limit(1);

        if (existing.length > 0) {
          await db.update(videoInteractions)
            .set(updates)
            .where(eq(videoInteractions.id, existing[0].id));
        }

        // Update recommendation outcome
        await this.updateRecommendationOutcome(event.userId, undefined, event.videoId, {
          solvedProblem: true
        });
      }

      console.log(`[ENGAGEMENT] Learning signal tracked: user=${event.userId}, video=${event.videoId}, signal=${event.signalType}`);
    } catch (error) {
      console.error('[ENGAGEMENT] Failed to track learning signal:', error);
    }
  }

  /**
   * Track recommendation event (when video is recommended to user)
   */
  async trackRecommendation(event: RecommendationEvent) {
    try {
      await db.insert(recommendationOutcomes).values({
        userId: event.userId,
        queryId: event.queryId,
        videoId: event.videoId,
        recommendationRank: event.recommendationRank,
        algorithm: event.algorithm,
        relevanceScore: event.relevanceScore?.toString(),
        pedagogyScore: event.pedagogyScore?.toString(),
        engagementPrediction: event.engagementPrediction?.toString(),
        clicked: false // Will be updated when they click
      });

      console.log(`[ENGAGEMENT] Recommendation tracked: user=${event.userId}, video=${event.videoId}, rank=${event.recommendationRank}`);
    } catch (error) {
      console.error('[ENGAGEMENT] Failed to track recommendation:', error);
    }
  }

  /**
   * Update recommendation outcome
   * CRITICAL: Must handle undefined queryId properly to enable learning loops
   */
  private async updateRecommendationOutcome(
    userId: string,
    queryId: number | undefined,
    videoId: number,
    updates: Partial<{
      clicked: boolean;
      helpful: boolean;
      solvedProblem: boolean;
      actualEngagement: string;
    }>
  ) {
    try {
      // Find recommendation outcome - prioritize matching queryId, fall back to latest recommendation
      let existing;
      
      if (queryId) {
        // If queryId provided, find exact match
        existing = await db.select()
          .from(recommendationOutcomes)
          .where(and(
            eq(recommendationOutcomes.userId, userId),
            eq(recommendationOutcomes.queryId, queryId),
            eq(recommendationOutcomes.videoId, videoId)
          ))
          .orderBy(desc(recommendationOutcomes.createdAt))
          .limit(1);
      }
      
      // If no match found (or queryId was undefined), find latest recommendation for this user/video
      if (!existing || existing.length === 0) {
        existing = await db.select()
          .from(recommendationOutcomes)
          .where(and(
            eq(recommendationOutcomes.userId, userId),
            eq(recommendationOutcomes.videoId, videoId)
          ))
          .orderBy(desc(recommendationOutcomes.createdAt))
          .limit(1);
      }

      if (existing && existing.length > 0) {
        await db.update(recommendationOutcomes)
          .set({
            ...updates,
            evaluatedAt: new Date()
          })
          .where(eq(recommendationOutcomes.id, existing[0].id));
        
        console.log(`[ENGAGEMENT] Updated recommendation outcome for video=${videoId}, user=${userId}`);
      } else {
        console.log(`[ENGAGEMENT] No recommendation outcome found for video=${videoId}, user=${userId} - skipping update`);
      }
    } catch (error) {
      console.error('[ENGAGEMENT] Failed to update recommendation outcome:', error);
    }
  }

  /**
   * Calculate engagement score from watch duration
   */
  private calculateEngagementScore(watchDuration: number, completed: boolean): number {
    if (completed) return 100;
    
    // Assume typical instructional segment is 3-5 minutes
    const assumedLength = 240; // 4 minutes
    const percentage = Math.min(100, (watchDuration / assumedLength) * 100);
    
    return Math.round(percentage);
  }

  /**
   * Detect device type from user agent
   */
  private detectDeviceType(): 'mobile' | 'desktop' | 'tablet' {
    // This will be set from request headers in actual middleware
    return 'mobile'; // Default to mobile since it's a PWA
  }

  /**
   * Get engagement metrics for a user
   */
  async getUserEngagementMetrics(userId: string) {
    try {
      const interactions = await db.select()
        .from(videoInteractions)
        .where(eq(videoInteractions.userId, userId));

      const totalVideos = interactions.length;
      const totalClicks = interactions.filter(i => i.clicked).length;
      const totalCompleted = interactions.filter(i => i.completed).length;
      const totalSaved = interactions.filter(i => i.savedToLibrary).length;
      const totalRewatches = interactions.reduce((sum, i) => sum + (i.rewatchCount || 0), 0);
      const avgWatchDuration = interactions.reduce((sum, i) => sum + (i.watchDuration || 0), 0) / Math.max(1, totalVideos);

      return {
        totalVideos,
        totalClicks,
        totalCompleted,
        totalSaved,
        totalRewatches,
        avgWatchDuration,
        completionRate: totalCompleted / Math.max(1, totalClicks),
        saveRate: totalSaved / Math.max(1, totalVideos)
      };
    } catch (error) {
      console.error('[ENGAGEMENT] Failed to get user metrics:', error);
      return null;
    }
  }

  /**
   * Get recommendation performance metrics
   */
  async getRecommendationMetrics(algorithm: string, days: number = 7) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const outcomes = await db.select()
        .from(recommendationOutcomes)
        .where(and(
          eq(recommendationOutcomes.algorithm, algorithm),
          gte(recommendationOutcomes.createdAt, since)
        ));

      const total = outcomes.length;
      const clicked = outcomes.filter(o => o.clicked).length;
      const helpful = outcomes.filter(o => o.helpful === true).length;
      const solved = outcomes.filter(o => o.solvedProblem === true).length;
      const avgEngagement = outcomes.reduce((sum, o) => 
        sum + parseFloat(String(o.actualEngagement || 0)), 0) / Math.max(1, total);

      return {
        algorithm,
        total,
        clicked,
        helpful,
        solved,
        clickRate: clicked / Math.max(1, total),
        helpfulRate: helpful / Math.max(1, clicked),
        solveRate: solved / Math.max(1, clicked),
        avgEngagement
      };
    } catch (error) {
      console.error('[ENGAGEMENT] Failed to get recommendation metrics:', error);
      return null;
    }
  }
}

// Export singleton instance
export const engagementTracker = new EngagementTracker();

/**
 * Express middleware to automatically track engagement from requests
 */
export function engagementMiddleware(req: Request, res: any, next: any) {
  // Attach engagement tracker to request object
  (req as any).engagementTracker = engagementTracker;
  
  // Detect device type from user agent
  const userAgent = req.headers['user-agent'] || '';
  let deviceType: 'mobile' | 'desktop' | 'tablet' = 'desktop';
  
  if (/mobile/i.test(userAgent)) {
    deviceType = 'mobile';
  } else if (/tablet|ipad/i.test(userAgent)) {
    deviceType = 'tablet';
  }
  
  (req as any).deviceType = deviceType;
  
  next();
}
