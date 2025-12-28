import { db } from './db';
import { userEngagementProfile, videoRequestHistory } from '../shared/schema';
import { eq, desc } from 'drizzle-orm';

export interface PatternTeaser {
  type: string; // 'repeated_technique', 'complementary_pattern', 'exploration_pattern', 'gi_nogi_mix'
  content: string; // The teaser message to show user
}

export class PatternTeaserService {
  
  /**
   * Generate pattern teasers from video request history
   * Shows intelligence even without session logs
   */
  async generateTeaser(userId: string): Promise<PatternTeaser | null> {
    try {
      const [profile] = await db.select()
        .from(userEngagementProfile)
        .where(eq(userEngagementProfile.userId, userId))
        .limit(1);
      
      // Don't spam - max 1 teaser per week
      if (profile?.lastPatternTeaserAt) {
        const daysSince = (Date.now() - new Date(profile.lastPatternTeaserAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
          console.log(`[PATTERN-TEASER] Too soon for next teaser (${daysSince.toFixed(1)} days since last)`);
          return null;
        }
      }
      
      // Get recent video requests
      const recentRequests = await db.select()
        .from(videoRequestHistory)
        .where(eq(videoRequestHistory.userId, userId))
        .orderBy(desc(videoRequestHistory.createdAt))
        .limit(10);
      
      if (recentRequests.length < 3) {
        console.log(`[PATTERN-TEASER] Not enough video requests (${recentRequests.length})`);
        return null;
      }
      
      // Extract all topics from requests
      const allTopics = recentRequests.flatMap(r => r.extractedTopics || []);
      const topicCounts: Record<string, number> = {};
      allTopics.forEach(t => {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      });
      
      // Pattern 1: Multiple requests for same technique (3+ times)
      const repeatedTechnique = Object.entries(topicCounts).find(([_, count]) => count >= 3);
      if (repeatedTechnique) {
        const [technique, count] = repeatedTechnique;
        await this.markTeaserShown(userId);
        return {
          type: 'repeated_technique',
          content: `I see you've been deep-diving ${technique} (${count} video requests). That's the right approach - focused repetition. Are you hitting it in training yet, or still drilling? If you tell me how it's going, I can recommend what to work on next based on your actual progress.`
        };
      }
      
      // Pattern 2: Complementary techniques (attack + defense)
      const hasGuardPassing = topicCounts['guard_passing'] >= 2 || topicCounts['passing'] >= 2;
      const hasTriangleDefense = topicCounts['triangle_defense'] >= 2 || topicCounts['triangle'] >= 2;
      
      if (hasGuardPassing && hasTriangleDefense) {
        await this.markTeaserShown(userId);
        return {
          type: 'complementary_pattern',
          content: `Quick observation - you've asked about guard passing and triangle defense. That combination usually means you're getting passed and then triangled from guard. If I'm reading that right, these videos will help with passing, but there's a defensive gap I could help you fix too. Am I onto something?`
        };
      }
      
      // Pattern 3: Position exploration (4+ different positions)
      const positions = ['closed_guard', 'half_guard', 'mount', 'back', 'side_control'];
      const positionRequests = positions.filter(p => topicCounts[p] >= 1);
      
      if (positionRequests.length >= 4) {
        await this.markTeaserShown(userId);
        return {
          type: 'exploration_pattern',
          content: `You're exploring a lot of different positions (${positionRequests.length} different areas). That's great for learning the whole game. But if you tell me what you're actually working on in training, I can help you prioritize instead of spreading thin across everything.`
        };
      }
      
      // Pattern 4: Gi vs No-gi mix
      const hasGi = allTopics.some(t => t.includes('gi') && !t.includes('no-gi'));
      const hasNoGi = allTopics.some(t => t.includes('no-gi') || t.includes('nogi'));
      
      if (hasGi && hasNoGi) {
        await this.markTeaserShown(userId);
        return {
          type: 'gi_nogi_mix',
          content: `I'm seeing requests for both gi and no-gi techniques. Do you train both, or focusing on one? (Helps me filter videos that match your actual training)`
        };
      }
      
      console.log('[PATTERN-TEASER] No significant patterns detected yet');
      return null;
      
    } catch (error) {
      console.error('[PATTERN-TEASER] Error generating teaser:', error);
      return null;
    }
  }
  
  /**
   * Mark that a teaser was shown to user (UPSERT ensures profile exists)
   */
  private async markTeaserShown(userId: string): Promise<void> {
    try {
      // UPSERT to handle case where profile doesn't exist yet
      await db.insert(userEngagementProfile)
        .values({
          userId,
          engagementStage: 'video_user',
          lastPatternTeaserAt: new Date(),
          patternTeasersShown: 1,
          profileCompletionScore: 0
        })
        .onConflictDoUpdate({
          target: userEngagementProfile.userId,
          set: {
            lastPatternTeaserAt: new Date(),
            patternTeasersShown: sql`${userEngagementProfile.patternTeasersShown} + 1`,
            updatedAt: new Date()
          }
        });
      
      console.log(`[PATTERN-TEASER] Marked teaser shown for user ${userId}`);
    } catch (error) {
      console.error('[PATTERN-TEASER] Error marking teaser shown:', error);
    }
  }
  
  /**
   * Extract topics from a user query (simple keyword extraction)
   */
  extractTopics(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const topics: string[] = [];
    
    // Positions
    if (lowerQuery.includes('closed guard')) topics.push('closed_guard');
    if (lowerQuery.includes('half guard')) topics.push('half_guard');
    if (lowerQuery.includes('mount')) topics.push('mount');
    if (lowerQuery.includes('back') && lowerQuery.includes('control')) topics.push('back');
    if (lowerQuery.includes('side control')) topics.push('side_control');
    
    // Techniques
    if (lowerQuery.includes('triangle')) topics.push('triangle');
    if (lowerQuery.includes('armbar')) topics.push('armbar');
    if (lowerQuery.includes('kimura')) topics.push('kimura');
    if (lowerQuery.includes('passing') || lowerQuery.includes('pass')) topics.push('guard_passing');
    if (lowerQuery.includes('sweep')) topics.push('sweep');
    if (lowerQuery.includes('escape')) topics.push('escape');
    
    // Gi/Nogi
    if (lowerQuery.includes('no-gi') || lowerQuery.includes('nogi')) topics.push('no-gi');
    if (lowerQuery.includes(' gi ') || lowerQuery.includes('kimono')) topics.push('gi');
    
    return topics;
  }
}

export const patternTeaserService = new PatternTeaserService();
