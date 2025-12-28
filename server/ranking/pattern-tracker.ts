import { db } from '../db';
import { bjjUsers, videoSuccessPatterns, userVideoInteractions } from '../../shared/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';

export async function updateSuccessPattern(
  userId: string,
  videoId: number,
  wasHelpful: boolean
) {
  try {
    // Get user profile
    const [user] = await db.select({
      beltLevel: bjjUsers.beltLevel,
      bodyType: bjjUsers.bodyType,
      ageRange: bjjUsers.ageRange,
      trainingStylePreference: bjjUsers.trainingStylePreference,
    })
    .from(bjjUsers)
    .where(eq(bjjUsers.id, userId))
    .limit(1);
    
    if (!user) {
      console.log(`User ${userId} not found for pattern tracking`);
      return;
    }
    
    // Check if pattern exists (handle null values correctly)
    const whereConditions = [
      eq(videoSuccessPatterns.videoId, videoId),
      user.beltLevel ? eq(videoSuccessPatterns.beltLevel, user.beltLevel) : isNull(videoSuccessPatterns.beltLevel),
      user.bodyType ? eq(videoSuccessPatterns.bodyType, user.bodyType) : isNull(videoSuccessPatterns.bodyType),
      user.ageRange ? eq(videoSuccessPatterns.ageRange, user.ageRange) : isNull(videoSuccessPatterns.ageRange),
      user.trainingStylePreference ? eq(videoSuccessPatterns.trainingStyle, user.trainingStylePreference) : isNull(videoSuccessPatterns.trainingStyle)
    ];
    
    const existingPattern = await db.select({
      id: videoSuccessPatterns.id,
      helpfulCount: videoSuccessPatterns.helpfulCount,
      totalViews: videoSuccessPatterns.totalViews
    })
      .from(videoSuccessPatterns)
      .where(and(...whereConditions))
      .limit(1);
    
    if (existingPattern.length > 0) {
      // Update existing pattern
      const pattern = existingPattern[0];
      const newHelpfulCount = pattern.helpfulCount + (wasHelpful ? 1 : 0);
      const newTotalViews = pattern.totalViews + 1;
      const newSuccessRate = (newHelpfulCount / newTotalViews).toFixed(2);
      
      await db.update(videoSuccessPatterns)
        .set({
          helpfulCount: newHelpfulCount,
          totalViews: newTotalViews,
          successRate: newSuccessRate,
          updatedAt: new Date(),
        })
        .where(eq(videoSuccessPatterns.id, pattern.id));
    } else {
      // Create new pattern
      await db.insert(videoSuccessPatterns).values({
        videoId,
        beltLevel: user.beltLevel,
        bodyType: user.bodyType,
        ageRange: user.ageRange,
        trainingStyle: user.trainingStylePreference,
        helpfulCount: wasHelpful ? 1 : 0,
        totalViews: 1,
        successRate: wasHelpful ? "1.00" : "0.00",
      });
    }
    
    console.log(`✓ Updated success pattern for video ${videoId}, belt ${user.beltLevel}, helpful=${wasHelpful}`);
  } catch (error) {
    console.error('Pattern tracking error:', error);
  }
}

export async function trackVideoInteraction(
  userId: string,
  videoId: number,
  interaction: {
    viewed?: boolean;
    watchedDurationSeconds?: number;
    clickedKeyDetail?: boolean;
    markedHelpful?: boolean;
    appliedInTraining?: boolean;
  }
) {
  try {
    // Check if interaction exists
    const existing = await db.select({
      id: userVideoInteractions.id
    })
      .from(userVideoInteractions)
      .where(
        and(
          eq(userVideoInteractions.userId, userId),
          eq(userVideoInteractions.videoId, videoId)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing interaction
      await db.update(userVideoInteractions)
        .set({
          ...interaction,
        })
        .where(eq(userVideoInteractions.id, existing[0].id));
    } else {
      // Create new interaction
      await db.insert(userVideoInteractions).values({
        userId,
        videoId,
        ...interaction,
      });
    }
  } catch (error) {
    console.error('Interaction tracking error:', error);
  }
}
