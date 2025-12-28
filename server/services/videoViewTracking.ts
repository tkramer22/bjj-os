import { db } from '../db';
import { videoViews, userVideoStats, bjjUsers, aiVideoKnowledge } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class VideoViewTrackingService {
  
  /**
   * Record when a user views a video
   * Updates both video_views and user_video_stats
   */
  static async recordView(
    userId: string, 
    videoId: number, 
    watchDuration: number = 0, 
    completed: boolean = false
  ): Promise<{ success: boolean; error?: any }> {
    try {
      // 1. Insert view record
      await db.insert(videoViews).values({
        userId,
        videoId,
        watchDuration,
        completed,
        viewedAt: new Date()
      });

      // 2. Update or create aggregated stats
      const existing = await db.query.userVideoStats.findFirst({
        where: and(
          eq(userVideoStats.userId, userId),
          eq(userVideoStats.videoId, videoId)
        )
      });

      if (existing) {
        // Update existing stats
        await db.update(userVideoStats)
          .set({
            viewCount: sql`${userVideoStats.viewCount} + 1`,
            lastViewedAt: new Date(),
            totalWatchTime: sql`${userVideoStats.totalWatchTime} + ${watchDuration}`
          })
          .where(and(
            eq(userVideoStats.userId, userId),
            eq(userVideoStats.videoId, videoId)
          ));
      } else {
        // Create new stats
        await db.insert(userVideoStats).values({
          userId,
          videoId,
          viewCount: 1,
          firstViewedAt: new Date(),
          lastViewedAt: new Date(),
          totalWatchTime: watchDuration
        });

        // New unique video - increment user's watched count
        await db.update(bjjUsers)
          .set({
            videosWatchedCount: sql`COALESCE(${bjjUsers.videosWatchedCount}, 0) + 1`,
            lastVideoWatchedAt: new Date()
          })
          .where(eq(bjjUsers.id, userId));

        // Update user's recommendation tier based on watch count
        await this.updateUserTier(userId);
      }

      return { success: true };
    } catch (error) {
      console.error('Error recording video view:', error);
      return { success: false, error };
    }
  }

  /**
   * Update user's recommendation tier based on videos watched
   */
  static async updateUserTier(userId: string): Promise<void> {
    const user = await db.query.bjjUsers.findFirst({
      where: eq(bjjUsers.id, userId),
      columns: { videosWatchedCount: true }
    });

    if (!user) return;

    const count = user.videosWatchedCount || 0;
    let newTier = 'new_user';
    
    if (count >= 50) {
      newTier = 'power_user';
    } else if (count >= 10) {
      newTier = 'established_user';
    }

    await db.update(bjjUsers)
      .set({ recommendationTier: newTier })
      .where(eq(bjjUsers.id, userId));
  }

  /**
   * Get user's watch history for a specific video
   */
  static async getUserVideoHistory(userId: string, videoId: number): Promise<{
    viewCount: number;
    firstViewedAt: Date | null;
    lastViewedAt: Date | null;
    totalWatchTime: number;
  }> {
    const stats = await db.query.userVideoStats.findFirst({
      where: and(
        eq(userVideoStats.userId, userId),
        eq(userVideoStats.videoId, videoId)
      )
    });

    return stats || {
      viewCount: 0,
      firstViewedAt: null,
      lastViewedAt: null,
      totalWatchTime: 0
    };
  }

  /**
   * Get all videos a user has watched (most recent first)
   */
  static async getUserWatchHistory(userId: string, limit: number = 50) {
    const history = await db
      .select({
        stats: userVideoStats,
        video: aiVideoKnowledge
      })
      .from(userVideoStats)
      .leftJoin(aiVideoKnowledge, eq(userVideoStats.videoId, aiVideoKnowledge.id))
      .where(eq(userVideoStats.userId, userId))
      .orderBy(sql`${userVideoStats.lastViewedAt} DESC`)
      .limit(limit);

    return history;
  }

  /**
   * Check if a video should be repeated for this user
   * Elite videos (>8.5 credibility) can be repeated for mastery
   */
  static async shouldRepeatVideo(
    userId: string, 
    videoId: number, 
    videoCredibility: number | string
  ): Promise<{
    shouldRepeat: boolean;
    reason?: string;
    daysSinceLastView?: number;
  }> {
    // Convert credibility to number if string
    const credScore = typeof videoCredibility === 'string' 
      ? parseFloat(videoCredibility) 
      : videoCredibility;

    // Only consider repetition for elite videos (>8.5 credibility)
    if (!credScore || credScore < 8.5) {
      return { shouldRepeat: false };
    }

    const history = await this.getUserVideoHistory(userId, videoId);

    // Never seen it? Not a repeat
    if (history.viewCount === 0) {
      return { shouldRepeat: false };
    }

    // Seen 3+ times? Don't repeat
    if (history.viewCount >= 3) {
      return { shouldRepeat: false };
    }

    // Check days since last view
    const daysSinceLastView = history.lastViewedAt 
      ? Math.floor((Date.now() - new Date(history.lastViewedAt).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Repeat if >7 days since last view
    if (daysSinceLastView >= 7) {
      return { 
        shouldRepeat: true, 
        reason: 'repetition_for_mastery',
        daysSinceLastView 
      };
    }

    return { shouldRepeat: false, daysSinceLastView };
  }

  /**
   * Get user's recommendation statistics
   */
  static async getUserStats(userId: string): Promise<{
    totalVideosWatched: number;
    totalWatchTime: number;
    tier: string;
    averageWatchDuration: number;
  }> {
    const user = await db.query.bjjUsers.findFirst({
      where: eq(bjjUsers.id, userId),
      columns: { 
        videosWatchedCount: true, 
        recommendationTier: true 
      }
    });

    const stats = await db
      .select({
        totalWatchTime: sql<number>`SUM(${userVideoStats.totalWatchTime})`,
        videoCount: sql<number>`COUNT(*)`,
      })
      .from(userVideoStats)
      .where(eq(userVideoStats.userId, userId))
      .then(rows => rows[0] || { totalWatchTime: 0, videoCount: 0 });

    const avgDuration = stats.videoCount > 0 
      ? Math.round(stats.totalWatchTime / stats.videoCount) 
      : 0;

    return {
      totalVideosWatched: user?.videosWatchedCount || 0,
      totalWatchTime: stats.totalWatchTime || 0,
      tier: user?.recommendationTier || 'new_user',
      averageWatchDuration: avgDuration
    };
  }
}
