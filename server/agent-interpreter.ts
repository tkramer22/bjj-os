import { aiOrchestrator } from "./ai-orchestrator";
import { db } from "./db";
import { queryAnalysis, bjjUsers } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * AGENT 2: THE INTERPRETER
 * Deep understanding of what user REALLY wants
 * 
 * Multi-layer analysis:
 * - Layer 1: Linguistic Analysis (explicit content)
 * - Layer 2: Intent Inference (what they're really asking)
 * - Layer 3: User Profile Inference (skill level, learning style, emotional state)
 * - Layer 4: Meta-Understanding (optimal learning path)
 */

export interface QueryUnderstanding {
  // Layer 1: Linguistic Analysis
  explicit: {
    technique?: string;
    position?: string;
    questionType: 'how-to' | 'troubleshooting' | 'conceptual' | 'comparison' | 'other';
    keywords: string[];
  };

  // Layer 2: Intent Inference
  intent: {
    rootProblem: string; // What they're REALLY asking about
    likelyMistakes: string[]; // Common mistakes they might be making
    learningNeed: string; // What they need to learn
    skillGap: string; // What's missing in their understanding
  };

  // Layer 3: User Profile Inference
  userProfile: {
    inferredSkillLevel: 'beginner' | 'intermediate' | 'advanced';
    inferredLearningStyle: 'visual' | 'step-by-step' | 'conceptual' | 'problem-solving';
    emotionalState: 'curious' | 'frustrated' | 'confused' | 'excited';
    urgency: 'low' | 'medium' | 'high';
  };

  // Layer 4: Learning Path
  learningPath: {
    immediateNeed: string; // What to show them first
    foundationalConcepts: string[]; // Prerequisites
    followUpConcepts: string[]; // What's next
    prerequisiteCheck: Record<string, boolean>; // Do they need fundamentals first?
  };

  // Recommendation strategy
  recommendationStrategy: {
    primary: string; // Main recommendation focus
    secondary: string; // Supporting content
    tertiary: string; // Follow-up/advanced
    presentationStyle: 'empathetic' | 'direct' | 'encouraging' | 'technical';
  };

  // Metadata
  confidence: number; // 0-1
  analysisModel: string;
}

export class InterpreterAgent {
  /**
   * Perform deep analysis of user query
   */
  async interpretQuery(
    userId: string,
    query: string,
    queryId: number
  ): Promise<QueryUnderstanding> {
    console.log(`[INTERPRETER] Analyzing query: "${query}"`);

    // Get user context from database
    const userContext = await this.getUserContext(userId);

    // Build comprehensive prompt for AI analysis
    const analysisPrompt = this.buildAnalysisPrompt(query, userContext);

    try {
      // Call AI orchestrator (will automatically select best model)
      const response = await aiOrchestrator.call(
        'query_understanding',
        analysisPrompt,
        { jsonMode: true, temperature: 0.7 }
      );

      // Parse AI response
      const understanding = this.parseAIResponse(response.content);

      // Save analysis to database
      await this.saveAnalysis(userId, queryId, query, understanding, response.model);

      console.log(`[INTERPRETER] Query interpreted:`, {
        rootProblem: understanding.intent.rootProblem,
        skillLevel: understanding.userProfile.inferredSkillLevel,
        emotionalState: understanding.userProfile.emotionalState
      });

      return understanding;
    } catch (error) {
      console.error('[INTERPRETER] Failed to interpret query:', error);
      
      // Return basic fallback interpretation
      return this.getFallbackInterpretation(query);
    }
  }

  /**
   * Build comprehensive analysis prompt
   */
  private buildAnalysisPrompt(query: string, userContext: any): string {
    return `You are an expert BJJ coach analyzing a student's question to understand their REAL needs.

STUDENT QUESTION: "${query}"

USER CONTEXT:
${userContext.beltLevel ? `- Belt Level: ${userContext.beltLevel}` : '- Belt Level: Unknown (assume beginner-intermediate)'}
${userContext.style ? `- Training Style: ${userContext.style}` : ''}
${userContext.recentQueries ? `- Recent Questions: ${userContext.recentQueries.slice(0, 3).join(', ')}` : ''}
${userContext.contentPreference ? `- Content Preference: ${userContext.contentPreference}` : ''}

ANALYSIS TASK:
Perform multi-layer analysis to understand what this student REALLY needs:

1. LINGUISTIC ANALYSIS (Surface Level):
   - What technique are they asking about? (explicit)
   - What position/scenario? (explicit)
   - Question type: how-to, troubleshooting, conceptual, comparison?
   - Key words/phrases

2. INTENT INFERENCE (Deeper Understanding):
   - What is their ROOT problem? (beyond the surface question)
   - What mistakes are they LIKELY making? (common beginner/intermediate errors)
   - What do they REALLY need to learn?
   - What skill/knowledge gap exists?

3. USER PROFILE INFERENCE:
   - Skill level: beginner, intermediate, or advanced? (based on language, question complexity)
   - Learning style: visual, step-by-step, conceptual, problem-solving?
   - Emotional state: curious, frustrated, confused, excited? (look for indicators like "keep losing", "can't figure out", "excited to learn")
   - Urgency: low (casual question), medium (need help soon), high (urgent problem)?

4. OPTIMAL LEARNING PATH:
   - What should they learn FIRST (immediate need)?
   - What foundational concepts might they be missing?
   - What follow-up concepts come next?
   - Do they need prerequisites before the main technique?

5. RECOMMENDATION STRATEGY:
   - Primary focus: what to show them first
   - Secondary: supporting content
   - Tertiary: next steps after mastery
   - Presentation style: empathetic (if frustrated), direct (if clear question), encouraging (if struggling), technical (if advanced)

RESPONSE FORMAT (JSON):
{
  "explicit": {
    "technique": "technique name or null",
    "position": "position/scenario or null",
    "questionType": "how-to|troubleshooting|conceptual|comparison|other",
    "keywords": ["word1", "word2", ...]
  },
  "intent": {
    "rootProblem": "What they're REALLY asking about",
    "likelyMistakes": ["mistake1", "mistake2", ...],
    "learningNeed": "What they need to learn",
    "skillGap": "What's missing"
  },
  "userProfile": {
    "inferredSkillLevel": "beginner|intermediate|advanced",
    "inferredLearningStyle": "visual|step-by-step|conceptual|problem-solving",
    "emotionalState": "curious|frustrated|confused|excited",
    "urgency": "low|medium|high"
  },
  "learningPath": {
    "immediateNeed": "What to show first",
    "foundationalConcepts": ["concept1", "concept2", ...],
    "followUpConcepts": ["concept1", "concept2", ...],
    "prerequisiteCheck": {
      "needs_fundamentals": true/false,
      "ready_for_advanced": true/false
    }
  },
  "recommendationStrategy": {
    "primary": "Main recommendation focus",
    "secondary": "Supporting content focus",
    "tertiary": "Follow-up content focus",
    "presentationStyle": "empathetic|direct|encouraging|technical"
  },
  "confidence": 0.85
}

Be insightful. Think like a coach who can read between the lines.`;
  }

  /**
   * Get user context from database
   */
  private async getUserContext(userId: string) {
    try {
      const user = await db.select({
        beltLevel: bjjUsers.beltLevel,
        style: bjjUsers.style,
        contentPreference: bjjUsers.contentPreference
      })
      .from(bjjUsers)
      .where(eq(bjjUsers.id, userId))
      .limit(1);

      if (user.length === 0) {
        return {};
      }

      // Get recent queries (would need profQueries table, but let's keep it simple for now)
      return {
        beltLevel: user[0].beltLevel,
        style: user[0].style,
        contentPreference: user[0].contentPreference,
        recentQueries: [] // TODO: Implement when needed
      };
    } catch (error) {
      console.error('[INTERPRETER] Failed to get user context:', error);
      return {};
    }
  }

  /**
   * Parse AI response
   */
  private parseAIResponse(content: string): QueryUnderstanding {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        explicit: parsed.explicit || {},
        intent: parsed.intent || {},
        userProfile: parsed.userProfile || {},
        learningPath: parsed.learningPath || {},
        recommendationStrategy: parsed.recommendationStrategy || {},
        confidence: parsed.confidence || 0.5,
        analysisModel: 'gpt-4o' // Will be set by orchestrator
      };
    } catch (error) {
      console.error('[INTERPRETER] Failed to parse AI response:', error);
      throw error;
    }
  }

  /**
   * Save analysis to database
   */
  private async saveAnalysis(
    userId: string,
    queryId: number,
    rawQuery: string,
    understanding: QueryUnderstanding,
    model: string
  ) {
    try {
      await db.insert(queryAnalysis).values({
        userId,
        queryId,
        rawQuery,
        
        // Layer 1
        explicitTechnique: understanding.explicit.technique,
        explicitPosition: understanding.explicit.position,
        questionType: understanding.explicit.questionType,
        
        // Layer 2
        inferredIntent: understanding.intent.learningNeed,
        rootProblem: understanding.intent.rootProblem,
        likelyMistakes: understanding.intent.likelyMistakes,
        
        // Layer 3
        inferredSkillLevel: understanding.userProfile.inferredSkillLevel,
        inferredLearningStyle: understanding.userProfile.inferredLearningStyle,
        emotionalState: understanding.userProfile.emotionalState,
        urgency: understanding.userProfile.urgency,
        
        // Layer 4
        optimalLearningPath: understanding.learningPath as any,
        prerequisiteCheck: understanding.learningPath.prerequisiteCheck as any,
        followUpConcepts: understanding.learningPath.followUpConcepts,
        
        // Strategy
        recommendationStrategy: understanding.recommendationStrategy.presentationStyle,
        presentationStyle: understanding.recommendationStrategy.presentationStyle,
        
        // Metadata
        analysisModel: model,
        confidence: understanding.confidence.toString()
      });

      console.log(`[INTERPRETER] Analysis saved to database`);
    } catch (error) {
      console.error('[INTERPRETER] Failed to save analysis:', error);
    }
  }

  /**
   * Fallback interpretation if AI fails
   */
  private getFallbackInterpretation(query: string): QueryUnderstanding {
    // Simple keyword-based fallback
    const lowerQuery = query.toLowerCase();
    
    let questionType: 'how-to' | 'troubleshooting' | 'conceptual' | 'comparison' | 'other' = 'other';
    if (lowerQuery.includes('how') || lowerQuery.includes('show me')) {
      questionType = 'how-to';
    } else if (lowerQuery.includes('keep') || lowerQuery.includes('can\'t') || lowerQuery.includes('losing')) {
      questionType = 'troubleshooting';
    } else if (lowerQuery.includes('why') || lowerQuery.includes('what is')) {
      questionType = 'conceptual';
    } else if (lowerQuery.includes('vs') || lowerQuery.includes('better')) {
      questionType = 'comparison';
    }

    const emotionalState = (lowerQuery.includes('keep') || lowerQuery.includes('can\'t')) ? 'frustrated' : 'curious';

    return {
      explicit: {
        technique: undefined,
        position: undefined,
        questionType,
        keywords: query.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      },
      intent: {
        rootProblem: query,
        likelyMistakes: [],
        learningNeed: query,
        skillGap: 'unknown'
      },
      userProfile: {
        inferredSkillLevel: 'intermediate',
        inferredLearningStyle: 'step-by-step',
        emotionalState,
        urgency: 'medium'
      },
      learningPath: {
        immediateNeed: query,
        foundationalConcepts: [],
        followUpConcepts: [],
        prerequisiteCheck: {}
      },
      recommendationStrategy: {
        primary: 'show relevant technique',
        secondary: 'provide context',
        tertiary: 'suggest next steps',
        presentationStyle: emotionalState === 'frustrated' ? 'empathetic' : 'direct'
      },
      confidence: 0.3,
      analysisModel: 'fallback'
    };
  }
}

// Export singleton
export const interpreterAgent = new InterpreterAgent();
