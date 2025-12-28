import { db } from './db';
import { powerUserExamples, userEngagementProfile } from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface PowerUserExample {
  id: string;
  example_type: string;
  user_question: string;
  prof_response_summary: string;
  outcome: string;
  effectiveness_score: number;
}

export class PowerUserShowcase {
  
  /**
   * Get a compelling power user example to show video-only users
   * Demonstrates the value of deeper engagement
   */
  async getExample(userId: string, exampleType?: string): Promise<PowerUserExample | null> {
    try {
      const [profile] = await db.select()
        .from(userEngagementProfile)
        .where(eq(userEngagementProfile.userId, userId))
        .limit(1);
      
      // Don't spam - max 1 example per 2 weeks
      if (profile?.lastPowerUserExampleAt) {
        const daysSince = (Date.now() - new Date(profile.lastPowerUserExampleAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 14) {
          console.log(`[POWER-USER-SHOWCASE] Too soon for next example (${daysSince.toFixed(1)} days since last)`);
          return null;
        }
      }
      
      // Get high-effectiveness active examples
      const examples = await db.select()
        .from(powerUserExamples)
        .where(
          and(
            eq(powerUserExamples.active, true),
            sql`${powerUserExamples.effectivenessScore} >= 7`,
            exampleType ? eq(powerUserExamples.exampleType, exampleType) : sql`true`
          )
        )
        .orderBy(sql`${powerUserExamples.conversionRate} DESC NULLS LAST, ${powerUserExamples.effectivenessScore} DESC`)
        .limit(3);
      
      if (examples.length === 0) {
        console.log('[POWER-USER-SHOWCASE] No active examples found');
        return null;
      }
      
      // Pick randomly from top 3 to avoid showing same example repeatedly
      const selectedExample = examples[Math.floor(Math.random() * examples.length)];
      
      // Track that we showed this example
      await this.markExampleShown(userId, selectedExample.id);
      
      return {
        id: selectedExample.id,
        example_type: selectedExample.exampleType || 'general',
        user_question: selectedExample.userQuestion,
        prof_response_summary: selectedExample.profResponseSummary,
        outcome: selectedExample.outcome,
        effectiveness_score: selectedExample.effectivenessScore || 7
      };
      
    } catch (error) {
      console.error('[POWER-USER-SHOWCASE] Error getting example:', error);
      return null;
    }
  }
  
  /**
   * Mark that an example was shown to a user (UPSERT ensures profile exists)
   */
  private async markExampleShown(userId: string, exampleId: string): Promise<void> {
    try {
      // UPSERT user engagement profile to handle case where it doesn't exist
      await db.insert(userEngagementProfile)
        .values({
          userId,
          engagementStage: 'video_user',
          lastPowerUserExampleAt: new Date(),
          powerUserExamplesShown: 1,
          profileCompletionScore: 0
        })
        .onConflictDoUpdate({
          target: userEngagementProfile.userId,
          set: {
            lastPowerUserExampleAt: new Date(),
            powerUserExamplesShown: sql`${userEngagementProfile.powerUserExamplesShown} + 1`,
            updatedAt: new Date()
          }
        });
      
      // Update example stats
      await db.update(powerUserExamples)
        .set({
          timesShown: sql`${powerUserExamples.timesShown} + 1`
        })
        .where(eq(powerUserExamples.id, exampleId));
      
      console.log(`[POWER-USER-SHOWCASE] Marked example ${exampleId} shown to user ${userId}`);
    } catch (error) {
      console.error('[POWER-USER-SHOWCASE] Error marking example shown:', error);
    }
  }
  
  /**
   * Add a new power user example to the library
   */
  async addExample(
    exampleType: string,
    userQuestion: string,
    profResponseSummary: string,
    outcome: string,
    effectivenessScore: number
  ): Promise<void> {
    try {
      await db.insert(powerUserExamples).values({
        exampleType,
        userQuestion,
        profResponseSummary,
        outcome,
        effectivenessScore,
        active: true,
        timesShown: 0
      });
      
      console.log(`[POWER-USER-SHOWCASE] Added new example: ${exampleType}`);
    } catch (error) {
      console.error('[POWER-USER-SHOWCASE] Error adding example:', error);
    }
  }
  
  /**
   * Seed initial power user examples
   */
  async seedExamples(): Promise<void> {
    try {
      const examples = [
        {
          exampleType: 'pattern_detection',
          userQuestion: 'I keep asking about triangles but can\'t hit them in rolling',
          profResponseSummary: 'Prof. OS noticed they had asked about triangles 5 times but never mentioned hitting them. Suggested they might be telegraphing the setup or missing the angle.',
          outcome: 'User came back 2 weeks later: "You were right - I was telegraphing. Fixed my setup and hit 3 triangles this week!"',
          effectivenessScore: 9
        },
        {
          exampleType: 'progress_tracking',
          userQuestion: 'Just wanted to say thanks',
          profResponseSummary: 'Prof. OS showed them their progress over 8 weeks - from "struggling with guard retention" to "successfully sweeping bigger opponents."',
          outcome: 'User: "I didn\'t realize how far I\'ve come. This made my week."',
          effectivenessScore: 10
        },
        {
          exampleType: 'breakthrough',
          userQuestion: 'My guard keeps getting smashed',
          profResponseSummary: 'Prof. OS remembered they had knee pain from 3 weeks ago, recommended seated guard variations that protect the knees while building retention.',
          outcome: 'User came back: "Game changer. My guard is holding up way better and my knee doesn\'t hurt anymore."',
          effectivenessScore: 9
        }
      ];
      
      for (const ex of examples) {
        await this.addExample(
          ex.exampleType,
          ex.userQuestion,
          ex.profResponseSummary,
          ex.outcome,
          ex.effectivenessScore
        );
      }
      
      console.log(`[POWER-USER-SHOWCASE] Seeded ${examples.length} initial examples`);
    } catch (error) {
      console.error('[POWER-USER-SHOWCASE] Error seeding examples:', error);
    }
  }
}

export const powerUserShowcase = new PowerUserShowcase();
