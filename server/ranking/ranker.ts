import { db } from '../db';
import { bjjUsers, videoSuccessPatterns, userVideoInteractions, instructorCredibility } from '../../shared/schema';
import { eq, and, sql, isNull, or } from 'drizzle-orm';

interface RankingContext {
  userId: string;
  technique?: string;
  position?: string;
  userBeltLevel?: string;
  userBodyType?: string;
  userAge?: number;
  userStyle?: 'gi' | 'nogi' | 'both';
}

interface RankingFactors {
  feedback?: number;
  similarUsers?: number;
  preference?: number;
  belt?: number;
  recency?: number;
  instructorPriority?: number;
  penalty?: string;
}

export async function rankVideos(
  videos: any[],
  context: RankingContext
): Promise<any[]> {
  
  // Get user profile
  const [user] = await db.select({
    beltLevel: bjjUsers.beltLevel,
    bodyType: bjjUsers.bodyType,
    ageRange: bjjUsers.ageRange,
    trainingStylePreference: bjjUsers.trainingStylePreference,
    preferredInstructors: bjjUsers.preferredInstructors,
    preferredVideoLengthMin: bjjUsers.preferredVideoLengthMin,
    preferredVideoLengthMax: bjjUsers.preferredVideoLengthMax,
    preferredLanguage: bjjUsers.preferredLanguage,
  })
  .from(bjjUsers)
  .where(eq(bjjUsers.id, context.userId))
  .limit(1);
  
  if (!user) {
    console.log('User not found for ranking');
    return videos; // Return unranked if user not found
  }
  
  // OPTIMIZATION: Batch-load success patterns for all videos upfront (avoid N+1 queries)
  const videoIds = videos.map(v => v.id);
  
  // Guard against empty videos array
  if (videoIds.length === 0) {
    return videos;
  }
  
  const patternWhereConditions = [
    sql`${videoSuccessPatterns.videoId} IN (${sql.join(videoIds.map(id => sql`${id}`), sql`, `)})`,
    user.beltLevel ? eq(videoSuccessPatterns.beltLevel, user.beltLevel) : isNull(videoSuccessPatterns.beltLevel),
    user.bodyType ? eq(videoSuccessPatterns.bodyType, user.bodyType) : isNull(videoSuccessPatterns.bodyType),
    user.ageRange ? eq(videoSuccessPatterns.ageRange, user.ageRange) : isNull(videoSuccessPatterns.ageRange),
    user.trainingStylePreference ? eq(videoSuccessPatterns.trainingStyle, user.trainingStylePreference) : isNull(videoSuccessPatterns.trainingStyle)
  ];
  
  const allSuccessPatterns = await db.select({
    videoId: videoSuccessPatterns.videoId,
    successRate: videoSuccessPatterns.successRate,
  })
  .from(videoSuccessPatterns)
  .where(and(...patternWhereConditions));
  
  const successPatternMap = new Map(
    allSuccessPatterns.map(p => [p.videoId, p.successRate])
  );
  
  // OPTIMIZATION: Batch-load user's video interactions upfront (avoid N+1 queries)
  const allInteractions = await db.select({
    videoId: userVideoInteractions.videoId,
    markedHelpful: userVideoInteractions.markedHelpful,
  })
  .from(userVideoInteractions)
  .where(
    and(
      eq(userVideoInteractions.userId, context.userId),
      sql`${userVideoInteractions.videoId} IN (${sql.join(videoIds.map(id => sql`${id}`), sql`, `)})`
    )
  );
  
  const interactionMap = new Map(
    allInteractions.map(i => [i.videoId, i.markedHelpful])
  );
  
  // OPTIMIZATION: Batch-load instructor priority data upfront
  const instructorNames = [...new Set(videos.map(v => v.instructor_name || v.instructorName).filter(Boolean))];
  
  let instructorPriorities: Array<{ name: string; priorityScore: number }> = [];
  
  // Only query if we have instructor names (avoid Drizzle or() with empty array)
  if (instructorNames.length > 0) {
    instructorPriorities = await db.select({
      name: instructorCredibility.name,
      priorityScore: instructorCredibility.recommendationPriority,
    })
    .from(instructorCredibility)
    .where(
      or(...instructorNames.map(name => sql`LOWER(${instructorCredibility.name}) = LOWER(${name})`))
    );
  }
  
  const instructorPriorityMap = new Map(
    instructorPriorities.map(i => [i.name.toLowerCase(), i.priorityScore])
  );
  
  // Calculate scores for each video
  const scoredVideos = await Promise.all(videos.map(async (video) => {
    let score = 0;
    const factors: RankingFactors = {};
    
    // FACTOR 1: Community Feedback (40% weight)
    if (video.total_votes >= 50) {
      const feedbackScore = (video.helpful_ratio || 0) * 40;
      score += feedbackScore;
      factors.feedback = feedbackScore;
    } else if (video.total_votes >= 20) {
      // Less confidence with fewer votes
      const feedbackScore = (video.helpful_ratio || 0) * 30;
      score += feedbackScore;
      factors.feedback = feedbackScore;
    } else {
      // Not enough votes, use quality score
      const feedbackScore = ((video.quality_score || 7) / 10) * 25;
      score += feedbackScore;
      factors.feedback = feedbackScore;
    }
    
    // FACTOR 2: Success with Similar Users (25% weight) - Use batch-loaded data
    const successRate = successPatternMap.get(video.id);
    
    if (successRate) {
      const similarUserScore = parseFloat(successRate.toString()) * 25;
      score += similarUserScore;
      factors.similarUsers = similarUserScore;
    } else {
      // No data for similar users, use average
      factors.similarUsers = 12.5;
      score += 12.5;
    }
    
    // FACTOR 3: User Preference Match (20% weight)
    let preferenceScore = 0;
    
    // Preferred instructor bonus
    if (user.preferredInstructors && user.preferredInstructors.includes(video.instructor_name || video.instructorName)) {
      preferenceScore += 7;
    }
    
    // Language preference bonus
    const userLanguage = user.preferredLanguage || 'en';
    const videoLanguages = video.languages || ['en'];
    if (videoLanguages.includes(userLanguage)) {
      preferenceScore += 8; // Strong bonus for language match
    } else {
      // Video not in user's preferred language, slight penalty
      preferenceScore += 3;
    }
    
    // Video length preference
    const videoLengthMin = Math.floor((video.duration || 600) / 60);
    if (videoLengthMin >= (user.preferredVideoLengthMin || 5) &&
        videoLengthMin <= (user.preferredVideoLengthMax || 20)) {
      preferenceScore += 5;
    } else {
      // Penalty for length mismatch
      preferenceScore += 2;
    }
    
    score += preferenceScore;
    factors.preference = preferenceScore;
    
    // FACTOR 4: Belt Level Appropriateness (10% weight)
    let beltScore = 0;
    
    const videoBeltLevel = video.belt_level || video.beltLevel;
    if (videoBeltLevel && user.beltLevel && videoBeltLevel.includes(user.beltLevel)) {
      beltScore = 10;
    } else if (!videoBeltLevel || videoBeltLevel.length === 0) {
      // No belt targeting, assume appropriate for all
      beltScore = 8;
    } else {
      // Not targeted for user's belt, penalty
      beltScore = 3;
    }
    
    score += beltScore;
    factors.belt = beltScore;
    
    // FACTOR 5: Recency & Freshness (5% weight)
    const daysSinceAdded = (Date.now() - new Date(video.created_at || video.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    let recencyScore = 0;
    
    if (daysSinceAdded < 30) {
      recencyScore = 5; // New content bonus
    } else if (daysSinceAdded < 180) {
      recencyScore = 4;
    } else {
      recencyScore = 3; // Older content, still good
    }
    
    score += recencyScore;
    factors.recency = recencyScore;
    
    // FACTOR 6: Instructor Priority Bonus (0-10 points)
    // High-priority instructors get a ranking boost
    const instructorName = (video.instructor_name || video.instructorName || '').toLowerCase();
    const priorityScore = instructorPriorityMap.get(instructorName);
    let instructorPriorityBonus = 0;
    
    if (priorityScore !== undefined) {
      // Priority score ranges from 0-100, convert to 0-10 bonus points
      // 80-100: +10 points (elite instructors)
      // 60-79: +7 points (high-quality instructors)
      // 40-59: +5 points (solid instructors)
      // 20-39: +3 points (decent instructors)
      // 0-19: +1 point (minimal boost)
      if (priorityScore >= 80) {
        instructorPriorityBonus = 10;
      } else if (priorityScore >= 60) {
        instructorPriorityBonus = 7;
      } else if (priorityScore >= 40) {
        instructorPriorityBonus = 5;
      } else if (priorityScore >= 20) {
        instructorPriorityBonus = 3;
      } else {
        instructorPriorityBonus = 1;
      }
      
      score += instructorPriorityBonus;
      factors.instructorPriority = instructorPriorityBonus;
    }
    
    // Check if user has seen this video before - Use batch-loaded data
    const markedHelpful = interactionMap.get(video.id);
    
    if (markedHelpful !== undefined) {
      if (markedHelpful === false) {
        // User marked unhelpful before, major penalty
        score *= 0.3;
        factors.penalty = 'previously_unhelpful';
      } else if (markedHelpful === true) {
        // User found helpful before, slight penalty (they've seen it)
        score *= 0.8;
        factors.penalty = 'previously_helpful_seen';
      } else {
        // Seen but no feedback, moderate penalty
        score *= 0.6;
        factors.penalty = 'previously_seen';
      }
    }
    
    return {
      ...video,
      ranking_score: Math.round(score * 100) / 100,
      ranking_factors: factors
    };
  }));
  
  // Sort by score descending
  scoredVideos.sort((a, b) => b.ranking_score - a.ranking_score);
  
  return scoredVideos;
}
