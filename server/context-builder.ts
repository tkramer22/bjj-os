import { db } from './db';
import {
  bjjUsers,
  userMemoryMarkers,
  coachingInterventionOutcomes,
  aiConversationLearning,
  detectedPatterns,
  userEngagementProfile
} from '../shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

export interface EnhancedUserContext {
  // Base user info
  user: any;
  
  // Tiered memory system
  relevantMemories: Array<{
    summary: string;
    occurred_at: Date;
    significance_score: number;
    memory_type: string;
  }>;
  
  // Coaching style preferences (learned from effectiveness)
  coachingStyle: {
    prefers_brief: boolean;
    responds_to_data: boolean;
    responds_to_encouragement: boolean;
    preferred_style: string; // 'data_driven', 'supportive', 'technical', 'mixed'
  };
  
  // Conversation history (last 10 messages)
  conversationHistory: Array<{
    role: string;
    content: string;
  }>;
  
  // Engagement profile
  engagementProfile: {
    stage: string;
    primary_use_case: string;
    profile_completion: number;
  } | null;
  
  // Recent patterns detected
  recentPatterns: Array<{
    type: string;
    description: string;
    first_detected: Date;
  }>;
}

export class ContextBuilder {
  
  /**
   * Build enhanced context with tiered memory, coaching style, and conversation history
   */
  async buildEnhancedContext(userId: string): Promise<EnhancedUserContext> {
    const startTime = Date.now();
    console.log(`[CONTEXT-BUILDER] Building enhanced context for user ${userId}`);
    
    try {
      // Fetch all data in parallel for speed
      const [
        user,
        relevantMemories,
        coachingEffectiveness,
        conversationHistory,
        engagementProfile,
        recentPatterns
      ] = await Promise.all([
        this.getUserData(userId),
        this.loadRelevantMemories(userId),
        this.analyzeCoachingEffectiveness(userId),
        this.loadConversationHistory(userId),
        this.getEngagementProfile(userId),
        this.getRecentPatterns(userId)
      ]);
      
      // Analyze coaching effectiveness to determine preferred style
      const coachingStyle = this.deriveCoachingStyle(coachingEffectiveness);
      
      const context: EnhancedUserContext = {
        user,
        relevantMemories,
        coachingStyle,
        conversationHistory,
        engagementProfile,
        recentPatterns
      };
      
      const duration = Date.now() - startTime;
      console.log(`[CONTEXT-BUILDER] Context built in ${duration}ms with ${relevantMemories.length} memories, ${conversationHistory.length} messages`);
      
      return context;
      
    } catch (error) {
      console.error('[CONTEXT-BUILDER] Error building context:', error);
      // Return minimal context on error
      return this.getMinimalContext(userId);
    }
  }
  
  /**
   * Load user data
   */
  private async getUserData(userId: string): Promise<any> {
    const [user] = await db.select().from(bjjUsers).where(eq(bjjUsers.id, userId)).limit(1);
    return user || null;
  }
  
  /**
   * Load tiered memory system - prioritize by significance and recency
   */
  private async loadRelevantMemories(userId: string): Promise<Array<any>> {
    // Get working memory (last 30 days) + long-term high-significance memories
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const memories = await db.select({
      summary: userMemoryMarkers.summary,
      occurred_at: userMemoryMarkers.occurredAt,
      significance_score: userMemoryMarkers.significanceScore,
      memory_type: userMemoryMarkers.memoryType
    })
      .from(userMemoryMarkers)
      .where(
        and(
          eq(userMemoryMarkers.userId, userId),
          sql`(
            (${userMemoryMarkers.memoryTier} = 'working' AND ${userMemoryMarkers.occurredAt} >= ${thirtyDaysAgo})
            OR
            (${userMemoryMarkers.memoryTier} = 'long_term' AND ${userMemoryMarkers.significanceScore} >= 8)
          )`
        )
      )
      .orderBy(desc(userMemoryMarkers.significanceScore), desc(userMemoryMarkers.occurredAt))
      .limit(10);
    
    return memories;
  }
  
  /**
   * Analyze coaching effectiveness to learn user's preferred coaching style
   */
  private async analyzeCoachingEffectiveness(userId: string): Promise<Array<any>> {
    const outcomes = await db.select()
      .from(coachingInterventionOutcomes)
      .where(eq(coachingInterventionOutcomes.userId, userId))
      .orderBy(desc(coachingInterventionOutcomes.interventionDate))
      .limit(20);
    
    return outcomes;
  }
  
  /**
   * Derive preferred coaching style from effectiveness data
   */
  private deriveCoachingStyle(effectiveness: Array<any>): any {
    if (effectiveness.length === 0) {
      return {
        prefers_brief: false,
        responds_to_data: false,
        responds_to_encouragement: true, // Default to supportive
        preferred_style: 'supportive'
      };
    }
    
    // Analyze intervention types that were effective
    const effectiveInterventions = effectiveness.filter(e => e.interventionSuccessful);
    
    const dataBasedCount = effectiveInterventions.filter(e => 
      e.interventionType?.includes('data') || e.interventionType?.includes('stats')
    ).length;
    
    const encouragementCount = effectiveInterventions.filter(e => 
      e.interventionType?.includes('encouragement') || e.interventionType?.includes('supportive')
    ).length;
    
    const briefCount = effectiveInterventions.filter(e => 
      e.interventionContent && e.interventionContent.length < 500
    ).length;
    
    return {
      prefers_brief: briefCount > effectiveInterventions.length / 2,
      responds_to_data: dataBasedCount > encouragementCount,
      responds_to_encouragement: encouragementCount > dataBasedCount,
      preferred_style: dataBasedCount > encouragementCount ? 'data_driven' : 'supportive'
    };
  }
  
  /**
   * Load recent conversation history (last 10 messages)
   */
  private async loadConversationHistory(userId: string): Promise<Array<any>> {
    const messages = await db.select({
      userMessage: aiConversationLearning.userMessage,
      aiResponse: aiConversationLearning.aiResponse,
      createdAt: aiConversationLearning.createdAt
    })
      .from(aiConversationLearning)
      .where(eq(aiConversationLearning.userId, userId))
      .orderBy(desc(aiConversationLearning.createdAt))
      .limit(10);
    
    // Convert to alternating user/assistant messages
    const history: Array<any> = [];
    messages.reverse().forEach(msg => {
      if (msg.userMessage) {
        history.push({ role: 'user', content: msg.userMessage });
      }
      if (msg.aiResponse) {
        history.push({ role: 'assistant', content: msg.aiResponse });
      }
    });
    
    return history;
  }
  
  /**
   * Get engagement profile
   */
  private async getEngagementProfile(userId: string): Promise<any> {
    const [profile] = await db.select()
      .from(userEngagementProfile)
      .where(eq(userEngagementProfile.userId, userId))
      .limit(1);
    
    if (!profile) return null;
    
    return {
      stage: profile.engagementStage || 'discovery',
      primary_use_case: profile.primaryUseCase || 'unknown',
      profile_completion: profile.profileCompletionScore || 0
    };
  }
  
  /**
   * Get recent detected patterns
   */
  private async getRecentPatterns(userId: string): Promise<Array<any>> {
    const patterns = await db.select({
      type: detectedPatterns.patternType,
      description: detectedPatterns.description,
      first_detected: detectedPatterns.firstDetected
    })
      .from(detectedPatterns)
      .where(eq(detectedPatterns.userId, userId))
      .orderBy(desc(detectedPatterns.firstDetected))
      .limit(5);
    
    return patterns;
  }
  
  /**
   * Minimal fallback context on error
   */
  private async getMinimalContext(userId: string): Promise<EnhancedUserContext> {
    const user = await this.getUserData(userId);
    
    return {
      user,
      relevantMemories: [],
      coachingStyle: {
        prefers_brief: false,
        responds_to_data: false,
        responds_to_encouragement: true,
        preferred_style: 'supportive'
      },
      conversationHistory: [],
      engagementProfile: null,
      recentPatterns: []
    };
  }
  
  /**
   * Format date for display (helper)
   */
  formatDate(date: Date): string {
    const daysAgo = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo === 0) return 'today';
    if (daysAgo === 1) return 'yesterday';
    if (daysAgo < 7) return `${daysAgo} days ago`;
    if (daysAgo < 30) return `${Math.floor(daysAgo / 7)} weeks ago`;
    return `${Math.floor(daysAgo / 30)} months ago`;
  }
}

export const contextBuilder = new ContextBuilder();
