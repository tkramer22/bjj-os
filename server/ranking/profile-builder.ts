import { db } from '../db';
import { bjjUsers, userVideoFeedback, aiVideoKnowledge } from '../../shared/schema';
import { eq, sql, and, desc } from 'drizzle-orm';

export async function buildUserProfile(userId: string) {
  try {
    // Get user data
    const [user] = await db.select({
      id: bjjUsers.id,
      beltLevel: bjjUsers.beltLevel,
      trainingStylePreference: bjjUsers.trainingStylePreference
    })
      .from(bjjUsers)
      .where(eq(bjjUsers.id, userId))
      .limit(1);
    
    if (!user) {
      console.log(`User ${userId} not found`);
      return null;
    }
    
    // Get user's feedback history
    const feedback = await db.select({
      instructor: aiVideoKnowledge.instructorName,
      videoLength: aiVideoKnowledge.duration,
      techniqueType: aiVideoKnowledge.techniqueType,
      helpful: userVideoFeedback.helpful,
      feedbackCategory: userVideoFeedback.feedbackCategory,
    })
    .from(userVideoFeedback)
    .innerJoin(aiVideoKnowledge, eq(userVideoFeedback.videoId, aiVideoKnowledge.id))
    .where(eq(userVideoFeedback.userId, userId))
    .limit(100);
    
    if (feedback.length < 5) {
      console.log(`Not enough feedback data for user ${userId} (${feedback.length} feedbacks)`);
      return user;
    }
    
    // Analyze preferred instructors
    const instructorStats: Record<string, number> = {};
    const videoLengths: number[] = [];
    
    for (const row of feedback) {
      if (row.helpful && row.instructor) {
        instructorStats[row.instructor] = (instructorStats[row.instructor] || 0) + 1;
        if (row.videoLength) {
          videoLengths.push(row.videoLength);
        }
      }
    }
    
    // Get top 3 instructors
    const preferredInstructors = Object.entries(instructorStats)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([instructor]) => instructor);
    
    // Calculate preferred video length range
    if (videoLengths.length > 0) {
      videoLengths.sort((a, b) => a - b);
      const median = videoLengths[Math.floor(videoLengths.length / 2)];
      const preferredMin = Math.max(5, Math.floor(median / 60) - 5);
      const preferredMax = Math.min(30, Math.floor(median / 60) + 5);
      
      // Update user profile
      await db.update(bjjUsers)
        .set({
          preferredInstructors,
          preferredVideoLengthMin: preferredMin,
          preferredVideoLengthMax: preferredMax,
          updatedAt: new Date(),
        })
        .where(eq(bjjUsers.id, userId));
      
      console.log(`✓ Updated profile for user ${userId}: ${preferredInstructors.join(', ')}, ${preferredMin}-${preferredMax} min`);
    }
    
    return user;
  } catch (error) {
    console.error('Profile building error:', error);
    return null;
  }
}

export async function updateAllUserProfiles() {
  try {
    // Get active users with feedback in last 30 days
    const activeUsers = await db.selectDistinct({
      userId: userVideoFeedback.userId,
    })
    .from(userVideoFeedback)
    .where(sql`${userVideoFeedback.createdAt} > NOW() - INTERVAL '30 days'`)
    .limit(100);
    
    console.log(`📊 Updating profiles for ${activeUsers.length} active users...`);
    
    for (const user of activeUsers) {
      if (user.userId) {
        await buildUserProfile(user.userId);
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit
      }
    }
    
    console.log('✓ Profile updates complete');
  } catch (error) {
    console.error('Error updating user profiles:', error);
  }
}
