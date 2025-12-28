import { db } from './db';
import { userEngagementProfile, bjjUsers } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';

export interface ProfileQuestion {
  question: string;
  extract: string; // Field to extract: 'belt_level', 'training_frequency', 'main_position', 'training_goals'
}

export class ProfileExtractor {
  
  /**
   * Check if we should ask a profile question based on interaction count
   */
  async getProfileQuestion(userId: string, interactionCount: number): Promise<ProfileQuestion | null> {
    try {
      const [profile] = await db.select()
        .from(userEngagementProfile)
        .where(eq(userEngagementProfile.userId, userId))
        .limit(1);
      
      if (!profile) {
        // Create engagement profile if it doesn't exist
        await this.createEngagementProfile(userId);
        return null;
      }
      
      // Question sequence based on what we don't know
      const questions: Array<{
        condition: boolean;
        question: string;
        extract: string;
      }> = [
        {
          condition: !profile.beltLevel && interactionCount === 1,
          question: "Quick question - are you a beginner just learning this, or more experienced trying to refine your technique?",
          extract: 'belt_level'
        },
        {
          condition: !profile.trainingFrequency && interactionCount === 2,
          question: "How often do you train? (Helps me gauge how quickly to progress recommendations - 2x/week? 3x? More?)",
          extract: 'training_frequency'
        },
        {
          condition: !profile.mainPosition && interactionCount === 3,
          question: "Do you play more guard, or do you prefer being on top?",
          extract: 'main_position'
        },
        {
          condition: !profile.trainingGoals && interactionCount >= 4 && (profile.profileCompletionScore || 0) < 50,
          question: "What are you working towards? Competition? Just getting better? Fitness?",
          extract: 'training_goals'
        }
      ];
      
      const nextQuestion = questions.find(q => q.condition);
      
      if (nextQuestion) {
        return {
          question: nextQuestion.question,
          extract: nextQuestion.extract
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('[PROFILE-EXTRACTOR] Error getting profile question:', error);
      return null;
    }
  }
  
  /**
   * Extract profile data from user response
   */
  async extractFromResponse(userId: string, userMessage: string, field: string): Promise<{ success: boolean; extracted: any }> {
    const lowerMessage = userMessage.toLowerCase();
    
    let extracted = null;
    
    switch(field) {
      case 'belt_level':
        if (lowerMessage.includes('beginner') || lowerMessage.includes('white belt') || lowerMessage.includes('new')) {
          extracted = 'white';
        } else if (lowerMessage.includes('blue')) {
          extracted = 'blue';
        } else if (lowerMessage.includes('purple')) {
          extracted = 'purple';
        } else if (lowerMessage.includes('brown')) {
          extracted = 'brown';
        } else if (lowerMessage.includes('black')) {
          extracted = 'black';
        } else if (lowerMessage.includes('experienced') || lowerMessage.includes('advanced')) {
          extracted = 'blue'; // Educated guess
        }
        break;
        
      case 'training_frequency':
        const numbers = userMessage.match(/\d+/);
        if (numbers) {
          extracted = parseFloat(numbers[0]);
        } else if (lowerMessage.includes('every day') || lowerMessage.includes('daily')) {
          extracted = 6;
        } else if (lowerMessage.includes('couple') || lowerMessage.includes('few')) {
          extracted = 2.5;
        }
        break;
        
      case 'main_position':
        if (lowerMessage.includes('guard')) {
          extracted = 'guard';
        } else if (lowerMessage.includes('top') || lowerMessage.includes('pass')) {
          extracted = 'top';
        } else if (lowerMessage.includes('both') || lowerMessage.includes('either')) {
          extracted = 'balanced';
        }
        break;
        
      case 'training_goals':
        if (lowerMessage.includes('compet')) {
          extracted = 'competition';
        } else if (lowerMessage.includes('better') || lowerMessage.includes('improve')) {
          extracted = 'skill_development';
        } else if (lowerMessage.includes('fit') || lowerMessage.includes('exercise')) {
          extracted = 'fitness';
        } else if (lowerMessage.includes('fun') || lowerMessage.includes('hobby')) {
          extracted = 'recreational';
        }
        break;
    }
    
    // Store extracted data
    if (extracted) {
      await this.updateEngagementProfile(userId, field, extracted);
      return { success: true, extracted };
    }
    
    return { success: false, extracted: null };
  }
  
  /**
   * Create engagement profile for new user
   */
  private async createEngagementProfile(userId: string): Promise<void> {
    try {
      await db.insert(userEngagementProfile).values({
        userId,
        engagementStage: 'discovery',
        profileCompletionScore: 0
      }).onConflictDoNothing();
      
      console.log(`[PROFILE-EXTRACTOR] Created engagement profile for user ${userId}`);
    } catch (error) {
      console.error('[PROFILE-EXTRACTOR] Error creating engagement profile:', error);
    }
  }
  
  /**
   * Update engagement profile with extracted data
   */
  private async updateEngagementProfile(userId: string, field: string, value: any): Promise<void> {
    try {
      const updates: any = {
        updatedAt: new Date()
      };
      
      // Map field to database column
      if (field === 'belt_level') {
        updates.beltLevel = value;
        
        // Also update main bjj_users table
        await db.update(bjjUsers)
          .set({ beltLevel: value })
          .where(eq(bjjUsers.id, userId));
      } else if (field === 'training_frequency') {
        updates.trainingFrequency = value;
        
        // Also update main bjj_users table
        await db.update(bjjUsers)
          .set({ trainingFrequency: Math.round(value) })
          .where(eq(bjjUsers.id, userId));
      } else if (field === 'main_position') {
        updates.mainPosition = value;
      } else if (field === 'training_goals') {
        updates.trainingGoals = value;
      }
      
      // Calculate new completion score
      const newScore = await this.calculateCompletionScore(userId);
      updates.profileCompletionScore = newScore;
      
      await db.update(userEngagementProfile)
        .set(updates)
        .where(eq(userEngagementProfile.userId, userId));
      
      console.log(`[PROFILE-EXTRACTOR] Updated ${field} = ${value} for user ${userId}, completion: ${newScore}%`);
      
    } catch (error) {
      console.error('[PROFILE-EXTRACTOR] Error updating engagement profile:', error);
    }
  }
  
  /**
   * Calculate profile completion score (0-100)
   */
  async calculateCompletionScore(userId: string): Promise<number> {
    try {
      const [profile] = await db.select()
        .from(userEngagementProfile)
        .where(eq(userEngagementProfile.userId, userId))
        .limit(1);
      
      if (!profile) return 0;
      
      let score = 0;
      if (profile.beltLevel) score += 25;
      if (profile.trainingFrequency) score += 25;
      if (profile.mainPosition) score += 25;
      if (profile.trainingGoals) score += 25;
      
      return score;
      
    } catch (error) {
      console.error('[PROFILE-EXTRACTOR] Error calculating completion score:', error);
      return 0;
    }
  }
  
  /**
   * Track that user has asked for advice (UPSERT to ensure profile exists)
   */
  async trackAdviceRequest(userId: string): Promise<void> {
    try {
      // UPSERT: create profile if doesn't exist, update if it does
      await db.insert(userEngagementProfile)
        .values({
          userId,
          engagementStage: 'video_user',
          hasAskedForAdvice: true,
          totalVideoRequests: 1,
          profileCompletionScore: 0,
          lastVideoRequestAt: new Date(),
          lastActivityAt: new Date()
        })
        .onConflictDoUpdate({
          target: userEngagementProfile.userId,
          set: {
            hasAskedForAdvice: true,
            totalVideoRequests: sql`${userEngagementProfile.totalVideoRequests} + 1`,
            lastVideoRequestAt: new Date(),
            lastActivityAt: new Date(),
            updatedAt: new Date()
          }
        });
        
      console.log(`[PROFILE-EXTRACTOR] Tracked advice request for user ${userId}`);
    } catch (error) {
      console.error('[PROFILE-EXTRACTOR] Error tracking advice request:', error);
    }
  }
  
  /**
   * Legacy method - replaced by UPSERT in trackAdviceRequest
   * @deprecated
   */
  private async _trackAdviceRequestOld(userId: string): Promise<void> {
    try {
      const [profile] = await db.select()
        .from(userEngagementProfile)
        .where(eq(userEngagementProfile.userId, userId))
        .limit(1);
      
      if (!profile) {
        await this.createEngagementProfile(userId);
      }
      
      const updates: any = {
        hasAskedForAdvice: true,
        lastVideoRequestAt: new Date(),
        updatedAt: new Date()
      };
      
      if (!profile?.firstAdviceAskedAt) {
        updates.firstAdviceAskedAt = new Date();
      }
      
      await db.update(userEngagementProfile)
        .set(updates)
        .where(eq(userEngagementProfile.userId, userId));
      
    } catch (error) {
      console.error('[PROFILE-EXTRACTOR] Error tracking advice request:', error);
    }
  }
}

export const profileExtractor = new ProfileExtractor();
