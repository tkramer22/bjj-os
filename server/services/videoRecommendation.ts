import { db } from '../db';
import { aiVideoKnowledge, bjjUsers, userVideoStats, videoKnowledge } from '@shared/schema';
import { eq, and, gte, notInArray, sql, desc, or, inArray, isNull, exists } from 'drizzle-orm';
import { VideoViewTrackingService } from './videoViewTracking';

interface RecommendationContext {
  userId: string;
  query: string;
  technique?: string;
  position?: string;
  beltLevel?: string;
  excludeVideoIds?: number[];
  limit?: number;
}

interface VideoRecommendation {
  video: any;
  tier: string;
  isRepeat: boolean;
  repeatReason?: string;
  credibility: number;
  matchScore: number;
}

export class VideoRecommendationService {
  
  /**
   * Get intelligent video recommendations with tier-based sorting
   * Priority: Elite (>7.5) > Verified (>6.5) > Acceptable (>6.0)
   * Shows best content first, with strategic repetition for mastery
   */
  static async getRecommendations(context: RecommendationContext): Promise<VideoRecommendation[]> {
    const { userId, query, technique, position, beltLevel, limit = 10 } = context;

    // 1. Get user's watch history to exclude already-seen videos
    const watchedVideoIds = await this.getUserWatchedVideoIds(userId);

    // 2. Build query conditions
    const conditions = [
      eq(aiVideoKnowledge.status, 'active'),
      // CRITICAL: Only recommend videos that have been fully analyzed by Gemini
      exists(
        db.select({ one: sql`1` })
          .from(videoKnowledge)
          .where(eq(videoKnowledge.videoId, aiVideoKnowledge.id))
      )
    ];

    // Search by technique name or query
    if (technique) {
      conditions.push(
        or(
          sql`LOWER(${aiVideoKnowledge.techniqueName}) LIKE LOWER(${'%' + technique + '%'})`,
          sql`LOWER(${aiVideoKnowledge.title}) LIKE LOWER(${'%' + technique + '%'})`
        )!
      );
    } else if (query) {
      conditions.push(
        or(
          sql`LOWER(${aiVideoKnowledge.techniqueName}) LIKE LOWER(${'%' + query + '%'})`,
          sql`LOWER(${aiVideoKnowledge.title}) LIKE LOWER(${'%' + query + '%'})`,
          sql`LOWER(${aiVideoKnowledge.positionCategory}) LIKE LOWER(${'%' + query + '%'})`
        )!
      );
    }

    // Filter by position category if specified
    if (position) {
      conditions.push(
        sql`LOWER(${aiVideoKnowledge.positionCategory}) LIKE LOWER(${'%' + position + '%'})`
      );
    }

    // Filter by belt level if specified
    if (beltLevel) {
      conditions.push(
        sql`${beltLevel} = ANY(${aiVideoKnowledge.beltLevel})`
      );
    }

    // 3. Get elite tier videos (credibility > 7.5) - including repeats for mastery
    const eliteVideos = await db.query.aiVideoKnowledge.findMany({
      where: and(...conditions),
      orderBy: [desc(aiVideoKnowledge.instructorCredibility), desc(aiVideoKnowledge.qualityScore)],
      limit: limit * 2 // Get more to account for exclusions
    });

    // 4. Separate into new videos and potential repeats
    const recommendations: VideoRecommendation[] = [];
    const newVideos: any[] = [];
    const repeatVideos: any[] = [];

    for (const video of eliteVideos) {
      const credibility = this.getNumericCredibility(video.instructorCredibility);
      const isWatched = watchedVideoIds.includes(video.id);

      if (!isWatched) {
        // New video
        newVideos.push({
          video,
          tier: this.getVideoTier(credibility),
          isRepeat: false,
          credibility,
          matchScore: this.calculateMatchScore(video, query, technique, position)
        });
      } else if (credibility >= 8.5) {
        // Potential repeat for mastery (elite videos only)
        const repeatCheck = await VideoViewTrackingService.shouldRepeatVideo(
          userId,
          video.id,
          credibility
        );
        
        if (repeatCheck.shouldRepeat) {
          repeatVideos.push({
            video,
            tier: 'elite',
            isRepeat: true,
            repeatReason: repeatCheck.reason,
            credibility,
            matchScore: this.calculateMatchScore(video, query, technique, position)
          });
        }
      }
    }

    // 5. Sort new videos by tier and match score
    newVideos.sort((a, b) => {
      // Sort by tier first (elite > verified > acceptable)
      const tierOrder = { elite: 3, verified: 2, acceptable: 1 };
      const tierDiff = (tierOrder[b.tier as keyof typeof tierOrder] || 0) - 
                       (tierOrder[a.tier as keyof typeof tierOrder] || 0);
      if (tierDiff !== 0) return tierDiff;
      
      // Then by match score
      return b.matchScore - a.matchScore;
    });

    // 6. Build final recommendation list:
    // - Start with best new elite videos
    // - Sprinkle in 1-2 repeats for variety
    // - Fill with remaining new videos

    const eliteNewVideos = newVideos.filter(v => v.tier === 'elite');
    const verifiedNewVideos = newVideos.filter(v => v.tier === 'verified');
    const acceptableNewVideos = newVideos.filter(v => v.tier === 'acceptable');

    // Add top elite videos
    recommendations.push(...eliteNewVideos.slice(0, Math.ceil(limit * 0.6)));

    // Add 1 repeat if available (for mastery)
    if (repeatVideos.length > 0) {
      recommendations.push(repeatVideos[0]);
    }

    // Fill remaining slots with verified and acceptable videos
    const remaining = limit - recommendations.length;
    const additionalVideos = [
      ...eliteNewVideos.slice(Math.ceil(limit * 0.6)),
      ...verifiedNewVideos,
      ...acceptableNewVideos
    ];
    recommendations.push(...additionalVideos.slice(0, remaining));

    return recommendations.slice(0, limit);
  }

  /**
   * Get IDs of videos the user has already watched
   */
  private static async getUserWatchedVideoIds(userId: string): Promise<number[]> {
    const watched = await db
      .select({ videoId: userVideoStats.videoId })
      .from(userVideoStats)
      .where(eq(userVideoStats.userId, userId));

    return watched.map(w => w.videoId);
  }

  /**
   * Calculate video tier based on credibility score
   */
  private static getVideoTier(credibility: number): string {
    if (credibility >= 7.5) return 'elite';
    if (credibility >= 6.5) return 'verified';
    if (credibility >= 6.0) return 'acceptable';
    return 'excluded';
  }

  /**
   * Convert credibility to numeric value
   */
  private static getNumericCredibility(credibility: string | number | null): number {
    if (typeof credibility === 'number') return credibility;
    if (typeof credibility === 'string') {
      const num = parseFloat(credibility);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }

  /**
   * Calculate match score for ranking
   */
  private static calculateMatchScore(
    video: any, 
    query?: string, 
    technique?: string, 
    position?: string
  ): number {
    let score = 0;

    // Exact technique match
    if (technique && video.techniqueName?.toLowerCase().includes(technique.toLowerCase())) {
      score += 10;
    }

    // Position match
    if (position && video.positionCategory?.toLowerCase().includes(position.toLowerCase())) {
      score += 8;
    }

    // General query match in title
    if (query && video.title?.toLowerCase().includes(query.toLowerCase())) {
      score += 5;
    }

    // Quality bonus
    const quality = parseFloat(video.qualityScore || '0');
    score += quality * 0.5;

    // Popularity bonus (helpful ratio)
    const helpful = parseFloat(video.helpfulRatio || '0');
    score += helpful * 2;

    return score;
  }

  /**
   * Get personalized recommendations based on user's belt level and preferences
   */
  static async getPersonalizedRecommendations(userId: string, limit: number = 5): Promise<VideoRecommendation[]> {
    // Get user profile
    const user = await db.query.bjjUsers.findFirst({
      where: eq(bjjUsers.id, userId),
      columns: {
        beltLevel: true,
        focusAreas: true,
        struggles: true,
        style: true,
        preferredInstructors: true
      }
    });

    if (!user) {
      return [];
    }

    // Build context from user profile
    const context: RecommendationContext = {
      userId,
      query: '',
      beltLevel: user.beltLevel || undefined,
      limit
    };

    // Prioritize user's struggle areas
    if (user.struggles && user.struggles.length > 0) {
      context.query = user.struggles[0]; // Focus on primary struggle
    } else if (user.focusAreas && user.focusAreas.length > 0) {
      context.query = user.focusAreas[0]; // Otherwise use focus area
    }

    return this.getRecommendations(context);
  }
}
