import { db } from './db';
import { engagementNudges, userEngagementProfile, videoRequestHistory } from '../shared/schema';
import { eq, desc, sql, and, isNull } from 'drizzle-orm';

export interface EngagementNudge {
  type: string;
  content: string;
  priority: 'low' | 'medium' | 'high';
  optimalDeliveryTime: Date;
}

export class NudgeGenerator {
  
  /**
   * Generate smart engagement nudges based on user behavior
   */
  async generateNudges(userId: string): Promise<void> {
    try {
      const [profile] = await db.select()
        .from(userEngagementProfile)
        .where(eq(userEngagementProfile.userId, userId))
        .limit(1);
      
      if (!profile) {
        console.log(`[NUDGE-GENERATOR] No profile found for user ${userId}`);
        return;
      }
      
      // Check for existing pending nudges
      const pendingNudges = await db.select()
        .from(engagementNudges)
        .where(
          and(
            eq(engagementNudges.userId, userId),
            isNull(engagementNudges.deliveredAt)
          )
        );
      
      if (pendingNudges.length > 0) {
        console.log(`[NUDGE-GENERATOR] User ${userId} already has ${pendingNudges.length} pending nudges`);
        return;
      }
      
      // Get video request history
      const recentRequests = await db.select()
        .from(videoRequestHistory)
        .where(eq(videoRequestHistory.userId, userId))
        .orderBy(desc(videoRequestHistory.createdAt))
        .limit(5);
      
      // NUDGE 1: Discover session logging (video-only users)
      if (
        profile.engagementStage === 'video_user' &&
        !profile.hasLoggedSession &&
        recentRequests.length >= 3
      ) {
        await this.createNudge(userId, {
          type: 'discover_session_logging',
          content: `By the way - I can track your progress if you tell me how training went. Like "Landed my first armbar today" or "Still struggling with guard retention." Then I can give you way better recommendations based on what's actually working.`,
          priority: 'medium',
          optimalDeliveryTime: this.getNextInteractionTime(profile)
        });
      }
      
      // NUDGE 2: Discover pattern detection (light loggers)
      if (
        profile.engagementStage === 'light_logger' &&
        !profile.hasReceivedPatternInsight &&
        profile.totalSessionsLogged >= 3
      ) {
        await this.createNudge(userId, {
          type: 'discover_pattern_detection',
          content: `You've been logging sessions - that's awesome. I'm starting to see patterns in your training. Want me to point out what I'm noticing? Could help you break through plateaus faster.`,
          priority: 'medium',
          optimalDeliveryTime: this.getNextInteractionTime(profile)
        });
      }
      
      // NUDGE 3: Pre-training focus (any active user)
      if (
        profile.lastVideoRequestAt &&
        this.isWithin24Hours(profile.lastVideoRequestAt)
      ) {
        await this.createNudge(userId, {
          type: 'pre_training_focus',
          content: `Got training coming up? Tell me ONE thing you want to work on today, and I'll give you a focused game plan + the best video to drill before class.`,
          priority: 'high',
          optimalDeliveryTime: this.getPreTrainingTime(profile)
        });
      }
      
      // NUDGE 4: Profile completion (incomplete profiles)
      if (
        profile.profileCompletionScore < 75 &&
        recentRequests.length >= 2
      ) {
        await this.createNudge(userId, {
          type: 'profile_completion',
          content: `Quick question - knowing your belt level and training frequency helps me filter videos better. Mind if I ask a couple quick questions?`,
          priority: 'low',
          optimalDeliveryTime: this.getNextInteractionTime(profile)
        });
      }
      
      console.log(`[NUDGE-GENERATOR] Nudge generation complete for user ${userId}`);
      
    } catch (error) {
      console.error('[NUDGE-GENERATOR] Error generating nudges:', error);
    }
  }
  
  /**
   * Create a new engagement nudge
   */
  private async createNudge(userId: string, nudge: EngagementNudge): Promise<void> {
    try {
      await db.insert(engagementNudges).values({
        userId,
        nudgeType: nudge.type,
        content: nudge.content,
        priority: nudge.priority,
        optimalDeliveryTime: nudge.optimalDeliveryTime,
        triggerReason: `Generated based on user engagement patterns`
      });
      
      console.log(`[NUDGE-GENERATOR] Created ${nudge.priority} priority nudge: ${nudge.type}`);
    } catch (error) {
      console.error('[NUDGE-GENERATOR] Error creating nudge:', error);
    }
  }
  
  /**
   * Get pending nudge for user (if any)
   */
  async getPendingNudge(userId: string): Promise<any> {
    try {
      const [nudge] = await db.select()
        .from(engagementNudges)
        .where(
          and(
            eq(engagementNudges.userId, userId),
            isNull(engagementNudges.deliveredAt),
            sql`${engagementNudges.optimalDeliveryTime} <= NOW()`
          )
        )
        .orderBy(
          sql`CASE ${engagementNudges.priority}
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
          END`,
          engagementNudges.optimalDeliveryTime
        )
        .limit(1);
      
      return nudge || null;
    } catch (error) {
      console.error('[NUDGE-GENERATOR] Error getting pending nudge:', error);
      return null;
    }
  }
  
  /**
   * Mark nudge as delivered
   */
  async markNudgeDelivered(nudgeId: string, userAction: 'acted_on' | 'dismissed' | 'ignored'): Promise<void> {
    try {
      await db.update(engagementNudges)
        .set({
          deliveredAt: new Date(),
          userAction
        })
        .where(eq(engagementNudges.id, nudgeId));
      
      console.log(`[NUDGE-GENERATOR] Marked nudge ${nudgeId} as delivered with action: ${userAction}`);
    } catch (error) {
      console.error('[NUDGE-GENERATOR] Error marking nudge delivered:', error);
    }
  }
  
  /**
   * Get optimal delivery time based on user's last interaction
   */
  private getNextInteractionTime(profile: any): Date {
    // Deliver on next interaction (estimate 1-3 days from now)
    const hoursFromNow = 24 + Math.random() * 48; // Random 1-3 days
    return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  }
  
  /**
   * Get pre-training optimal time (2-4 hours before typical training time)
   */
  private getPreTrainingTime(profile: any): Date {
    // Assume typical training time is evening (6 PM)
    // Send nudge 2-4 hours before (2-4 PM)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0); // 2 PM tomorrow
    
    return tomorrow;
  }
  
  /**
   * Check if timestamp is within last 24 hours
   */
  private isWithin24Hours(timestamp: Date): boolean {
    const hoursAgo = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
    return hoursAgo <= 24;
  }
}

export const nudgeGenerator = new NudgeGenerator();
