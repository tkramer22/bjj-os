import { OpenAI } from 'openai';
import { db } from './db';
import { 
  userCognitiveProfile,
  userTechniqueEcosystem,
  userTemporalPatterns,
  userInjuryProfile,
  userPsychologicalProfile,
  userMemoryMarkers,
  detectedPatterns,
  aiConversationLearning
} from '../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class IndividualIntelligenceService {
  
  // Extract cognitive profile from conversation history
  async updateCognitiveProfile(userId: string) {
    try {
      console.log(`[INTELLIGENCE] Updating cognitive profile for user ${userId}`);
      
      // Get recent conversation history
      const conversations = await db.select()
        .from(aiConversationLearning)
        .where(eq(aiConversationLearning.userId, userId))
        .orderBy(desc(aiConversationLearning.createdAt))
        .limit(50);

      if (conversations.length < 5) {
        console.log(`[INTELLIGENCE] Not enough data to build cognitive profile (need 5+ conversations)`);
        return;
      }

      // Build conversation summary for analysis
      const conversationText = conversations
        .map(c => `User: ${c.userMessage}\nProf OS: ${c.professorResponse}`)
        .join('\n\n');

      // Use AI to extract cognitive patterns
      const prompt = `Analyze these BJJ coaching conversations and extract the user's cognitive profile. Return JSON with:

{
  "learningStyle": "visual" | "kinesthetic" | "conceptual" | "repetition_based",
  "learningStyleConfidence": 0.0-1.0,
  "prefersBriefResponses": boolean,
  "prefersDetailedExplanations": boolean,
  "prefersQuestionsFirst": boolean,
  "prefersDirectAnswers": boolean,
  "asksWhyFrequently": boolean,
  "asksHowFrequently": boolean,
  "respondsToEncouragement": boolean,
  "respondsToDirectness": boolean,
  "respondsToData": boolean,
  "selfAwareLevel": 1-10,
  "acceptsCriticismWell": boolean
}

Conversations:
${conversationText.substring(0, 6000)}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });

      const profile = JSON.parse(response.choices[0].message.content || '{}');

      // Upsert cognitive profile
      const existing = await db.select()
        .from(userCognitiveProfile)
        .where(eq(userCognitiveProfile.userId, userId))
        .limit(1);

      if (existing.length > 0) {
        await db.update(userCognitiveProfile)
          .set({
            learningStyle: profile.learningStyle,
            learningStyleConfidence: profile.learningStyleConfidence,
            prefersBriefResponses: profile.prefersBriefResponses,
            prefersDetailedExplanations: profile.prefersDetailedExplanations,
            prefersQuestionsFirst: profile.prefersQuestionsFirst,
            prefersDirectAnswers: profile.prefersDirectAnswers,
            asksWhyFrequently: profile.asksWhyFrequently,
            asksHowFrequently: profile.asksHowFrequently,
            respondsToEncouragement: profile.respondsToEncouragement,
            respondsToDirectness: profile.respondsToDirectness,
            respondsToData: profile.respondsToData,
            selfAwareLevel: profile.selfAwareLevel,
            acceptsCriticismWell: profile.acceptsCriticismWell,
            interactionsAnalyzed: conversations.length,
            lastUpdated: new Date()
          })
          .where(eq(userCognitiveProfile.userId, userId));
      } else {
        await db.insert(userCognitiveProfile).values({
          userId,
          ...profile,
          interactionsAnalyzed: conversations.length,
          lastUpdated: new Date()
        });
      }

      console.log(`[INTELLIGENCE] ✅ Cognitive profile updated for user ${userId}`);
    } catch (error: any) {
      console.error(`[INTELLIGENCE] Error updating cognitive profile:`, error.message);
    }
  }

  // Track technique success/failure patterns
  async updateTechniqueEcosystem(userId: string, techniqueName: string, success: boolean, context?: any) {
    try {
      console.log(`[INTELLIGENCE] Recording technique: ${techniqueName} (${success ? 'success' : 'failure'})`);
      
      // Get existing technique record
      const existing = await db.select()
        .from(userTechniqueEcosystem)
        .where(and(
          eq(userTechniqueEcosystem.userId, userId),
          eq(userTechniqueEcosystem.techniqueName, techniqueName)
        ))
        .limit(1);

      if (existing.length > 0) {
        const tech = existing[0];
        const newAttempts = (tech.attempts || 0) + 1;
        const newSuccesses = (tech.successes || 0) + (success ? 1 : 0);
        const newFailures = (tech.failures || 0) + (success ? 0 : 1);
        const newSuccessRate = (newSuccesses / newAttempts) * 100;

        await db.update(userTechniqueEcosystem)
          .set({
            attempts: newAttempts,
            successes: newSuccesses,
            failures: newFailures,
            successRate: newSuccessRate,
            firstSuccessDate: success && !tech.firstSuccessDate ? new Date() : tech.firstSuccessDate,
            attemptsToFirstSuccess: success && !tech.firstSuccessDate ? newAttempts : tech.attemptsToFirstSuccess,
            learningCurve: this.calculateLearningCurve(newAttempts, newSuccessRate, tech.firstAttemptedDate),
            updatedAt: new Date()
          })
          .where(and(
            eq(userTechniqueEcosystem.userId, userId),
            eq(userTechniqueEcosystem.techniqueName, techniqueName)
          ));
      } else {
        // Create new technique record
        await db.insert(userTechniqueEcosystem).values({
          userId,
          techniqueName,
          attempts: 1,
          successes: success ? 1 : 0,
          failures: success ? 0 : 1,
          successRate: success ? 100 : 0,
          firstAttemptedDate: new Date(),
          firstSuccessDate: success ? new Date() : null,
          attemptsToFirstSuccess: success ? 1 : null,
          learningCurve: 'early',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      console.log(`[INTELLIGENCE] ✅ Technique ecosystem updated`);
    } catch (error: any) {
      console.error(`[INTELLIGENCE] Error updating technique ecosystem:`, error.message);
    }
  }

  // Calculate learning curve classification
  private calculateLearningCurve(attempts: number, successRate: number, startDate: Date | null): string {
    if (!startDate) return 'early';
    
    const daysTraining = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (attempts < 5) return 'early';
    if (successRate > 70 && daysTraining < 30) return 'fast_learner';
    if (successRate > 50 && daysTraining < 60) return 'steady';
    if (successRate < 30 && daysTraining > 90) return 'plateau';
    if (attempts > 50 && successRate < 20) return 'abandoned';
    
    return 'slow_burn';
  }

  // Detect patterns in user behavior (plateaus, breakthroughs, overtraining, etc.)
  async detectPatterns(userId: string) {
    try {
      console.log(`[INTELLIGENCE] Detecting patterns for user ${userId}`);
      
      // Get recent conversations
      const conversations = await db.select()
        .from(aiConversationLearning)
        .where(eq(aiConversationLearning.userId, userId))
        .orderBy(desc(aiConversationLearning.createdAt))
        .limit(30);

      if (conversations.length < 10) {
        console.log(`[INTELLIGENCE] Not enough data for pattern detection`);
        return;
      }

      // Build conversation summary
      const conversationText = conversations
        .map(c => `Date: ${c.createdAt?.toISOString()}\nUser: ${c.userMessage}\nStruggles: ${c.strugglesDetected?.join(', ') || 'none'}\nSuccesses: ${c.successesDetected?.join(', ') || 'none'}`)
        .join('\n\n');

      // Use AI to detect patterns
      const prompt = `Analyze these BJJ training conversations and detect patterns. Return JSON array of patterns:

[
  {
    "patternType": "plateau" | "overtraining" | "breakthrough_pattern" | "injury_risk" | "success_pattern",
    "priority": "high" | "medium" | "low",
    "interventionSuggested": "specific actionable suggestion",
    "triggerData": { evidence and details },
    "supportingSessionIds": []
  }
]

Only return patterns with strong evidence (3+ supporting examples).

Conversations:
${conversationText.substring(0, 6000)}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });

      const result = JSON.parse(response.choices[0].message.content || '{"patterns":[]}');
      const patterns = result.patterns || [];

      // Store detected patterns
      for (const pattern of patterns) {
        // Check if similar pattern already exists
        const existing = await db.select()
          .from(detectedPatterns)
          .where(and(
            eq(detectedPatterns.userId, userId),
            eq(detectedPatterns.patternType, pattern.patternType),
            eq(detectedPatterns.status, 'detected')
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(detectedPatterns).values({
            userId,
            patternType: pattern.patternType,
            triggerData: pattern.triggerData,
            supportingSessionIds: pattern.supportingSessionIds || [],
            interventionSuggested: pattern.interventionSuggested,
            priority: pattern.priority,
            status: 'detected',
            detectedAt: new Date()
          });

          console.log(`[INTELLIGENCE] ✅ New pattern detected: ${pattern.patternType} (${pattern.priority} priority)`);
        }
      }
    } catch (error: any) {
      console.error(`[INTELLIGENCE] Error detecting patterns:`, error.message);
    }
  }

  // Create memory marker for significant events
  async createMemoryMarker(userId: string, memoryType: string, summary: string, significanceScore: number, fullContext?: any) {
    try {
      // Determine memory tier based on significance
      let memoryTier = 'working'; // 7 days
      if (significanceScore >= 8) {
        memoryTier = 'long_term'; // Permanent
      } else if (significanceScore >= 6) {
        memoryTier = 'medium'; // 3 months
      }

      await db.insert(userMemoryMarkers).values({
        userId,
        memoryType,
        significanceScore,
        summary,
        fullContext: fullContext || {},
        occurredAt: new Date(),
        memoryTier,
        referenceCount: 0,
        createdAt: new Date()
      });

      console.log(`[INTELLIGENCE] ✅ Memory marker created: ${memoryType} (tier: ${memoryTier})`);
    } catch (error: any) {
      console.error(`[INTELLIGENCE] Error creating memory marker:`, error.message);
    }
  }

  // Get cognitive profile for coaching adaptation
  async getCognitiveProfile(userId: string) {
    const profile = await db.select()
      .from(userCognitiveProfile)
      .where(eq(userCognitiveProfile.userId, userId))
      .limit(1);

    return profile[0] || null;
  }

  // Get technique ecosystem for a user
  async getTechniqueEcosystem(userId: string) {
    return await db.select()
      .from(userTechniqueEcosystem)
      .where(eq(userTechniqueEcosystem.userId, userId))
      .orderBy(desc(userTechniqueEcosystem.successRate));
  }

  // Get signature moves (high success rate, 10+ attempts)
  async getSignatureMoves(userId: string) {
    const techniques = await db.select()
      .from(userTechniqueEcosystem)
      .where(and(
        eq(userTechniqueEcosystem.userId, userId),
        sql`${userTechniqueEcosystem.attempts} >= 10`,
        sql`${userTechniqueEcosystem.successRate} >= 70`
      ))
      .orderBy(desc(userTechniqueEcosystem.successRate))
      .limit(5);

    return techniques;
  }

  // Get active patterns that need intervention
  async getActivePatternsForIntervention(userId: string) {
    return await db.select()
      .from(detectedPatterns)
      .where(and(
        eq(detectedPatterns.userId, userId),
        eq(detectedPatterns.status, 'detected')
      ))
      .orderBy(desc(detectedPatterns.priority));
  }

  // Get recent memory markers
  async getRecentMemories(userId: string, limit: number = 10) {
    return await db.select()
      .from(userMemoryMarkers)
      .where(eq(userMemoryMarkers.userId, userId))
      .orderBy(desc(userMemoryMarkers.occurredAt))
      .limit(limit);
  }

  // Build comprehensive user context for Prof. OS
  async buildUserContext(userId: string): Promise<string> {
    try {
      const cognitiveProfile = await this.getCognitiveProfile(userId);
      const signatureMoves = await this.getSignatureMoves(userId);
      const activePatterns = await this.getActivePatternsForIntervention(userId);
      const recentMemories = await this.getRecentMemories(userId, 5);

      let context = '';

      // Cognitive profile
      if (cognitiveProfile) {
        context += `\n**Cognitive Profile:**\n`;
        context += `- Learning Style: ${cognitiveProfile.learningStyle} (${(cognitiveProfile.learningStyleConfidence || 0) * 100}% confidence)\n`;
        context += `- Prefers: ${cognitiveProfile.prefersDetailedExplanations ? 'detailed explanations' : 'brief responses'}\n`;
        context += `- Response Style: ${cognitiveProfile.respondsToEncouragement ? 'encouraging' : cognitiveProfile.respondsToDirectness ? 'direct' : 'data-driven'}\n`;
      }

      // Signature moves
      if (signatureMoves.length > 0) {
        context += `\n**Signature Moves (High Success):**\n`;
        signatureMoves.forEach(move => {
          context += `- ${move.techniqueName}: ${move.successRate}% success rate (${move.attempts} attempts)\n`;
        });
      }

      // Active patterns needing intervention
      if (activePatterns.length > 0) {
        context += `\n**Active Patterns Detected:**\n`;
        activePatterns.forEach(pattern => {
          context += `- ${pattern.patternType} (${pattern.priority} priority): ${pattern.interventionSuggested}\n`;
        });
      }

      // Recent significant memories
      if (recentMemories.length > 0) {
        context += `\n**Recent Significant Events:**\n`;
        recentMemories.forEach(memory => {
          context += `- ${memory.memoryType}: ${memory.summary}\n`;
        });
      }

      return context;
    } catch (error: any) {
      console.error(`[INTELLIGENCE] Error building user context:`, error.message);
      return '';
    }
  }
}

export const individualIntelligence = new IndividualIntelligenceService();
