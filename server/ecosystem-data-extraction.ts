import { db } from './db';
import { eq, and } from 'drizzle-orm';
import {
  conversationStructuredData,
  userTechniqueAttempts,
  userPatternInterventions,
  userConceptualUnderstanding,
  userLearningAnalytics,
  ecosystemTechniqueEffectiveness,
  ecosystemProblemSolutions,
  collaborativeIntelligence,
  type BjjUser
} from '../shared/schema';
import OpenAI from 'openai';

/**
 * ECOSYSTEM DATA EXTRACTION - V5.0
 * 
 * This function runs AFTER each Professor OS conversation to extract learning signals:
 * 1. Techniques mentioned/attempted
 * 2. Problems discussed
 * 3. Successes/breakthroughs
 * 4. Emotional tone and confidence levels
 * 5. Injuries mentioned
 * 6. Opponents/training partners
 * 
 * This data feeds back into the ecosystem intelligence to improve future coaching.
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ExtractionResult {
  techniques: string[];
  problems: string[];
  successes: string[];
  emotionalTone: 'frustrated' | 'confident' | 'neutral' | 'overwhelmed' | 'motivated';
  confidenceLevel: number; // 1-10
  injuries: string[];
  conceptsDiscussed: string[];
  learningStage?: 'discovery' | 'practice' | 'refinement' | 'mastery';
  opponentType?: string;
}

/**
 * Extract structured data from conversation using GPT-4o
 */
async function extractConversationData(
  userMessage: string,
  aiResponse: string
): Promise<ExtractionResult> {
  try {
    const extractionPrompt = `Analyze this Brazilian Jiu-Jitsu coaching conversation and extract structured data.

USER MESSAGE:
${userMessage}

COACH RESPONSE:
${aiResponse}

Extract the following information in JSON format:

{
  "techniques": ["array of specific technique names mentioned - ONLY real BJJ techniques"],
  "problems": ["array of problems/struggles the user is experiencing"],
  "successes": ["array of wins/breakthroughs/improvements mentioned"],
  "emotionalTone": "frustrated|confident|neutral|overwhelmed|motivated",
  "confidenceLevel": <1-10 based on user's tone>,
  "injuries": ["array of injuries or pain mentioned"],
  "conceptsDiscussed": ["array of conceptual principles discussed, e.g. 'base', 'frames', 'leverage'"],
  "learningStage": "discovery|practice|refinement|mastery (or null)",
  "opponentType": "bigger|smaller|faster|stronger|technical|beginner (or null)"
}

CRITICAL RULES:
- Only include REAL BJJ techniques (e.g. "kimura", "armbar", "triangle", "knee slice pass")
- Do NOT include vague terms like "technique", "move", "position"
- Only extract injuries if EXPLICITLY mentioned (pain, soreness, injury)
- Only extract opponent type if clearly described
- Be conservative - if unsure, omit the field
- Return ONLY valid JSON, no other text

Example:
User: "I can't finish my armbar from guard, they always escape"
Coach: "The problem is your angle. Try the armbar entry Roger Gracie teaches..."

Response:
{
  "techniques": ["armbar from guard"],
  "problems": ["can't finish armbar from guard"],
  "successes": [],
  "emotionalTone": "frustrated",
  "confidenceLevel": 4,
  "injuries": [],
  "conceptsDiscussed": ["angle", "entry"],
  "learningStage": "practice",
  "opponentType": null
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast and cheap for extraction
      messages: [
        { role: 'system', content: 'You are a BJJ conversation data extraction specialist. Extract only accurate, specific data. Return ONLY valid JSON.' },
        { role: 'user', content: extractionPrompt }
      ],
      temperature: 0.1, // Low temperature for consistent extraction
      max_tokens: 1000
    });

    const extracted = response.choices[0]?.message?.content || '{}';
    
    // Parse JSON safely
    const cleaned = extracted.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const data = JSON.parse(cleaned);

    return {
      techniques: data.techniques || [],
      problems: data.problems || [],
      successes: data.successes || [],
      emotionalTone: data.emotionalTone || 'neutral',
      confidenceLevel: data.confidenceLevel || 5,
      injuries: data.injuries || [],
      conceptsDiscussed: data.conceptsDiscussed || [],
      learningStage: data.learningStage || undefined,
      opponentType: data.opponentType || undefined
    };
  } catch (error) {
    console.error('[EXTRACTION] Error extracting conversation data:', error);
    // Return empty data if extraction fails
    return {
      techniques: [],
      problems: [],
      successes: [],
      emotionalTone: 'neutral',
      confidenceLevel: 5,
      injuries: [],
      conceptsDiscussed: []
    };
  }
}

/**
 * Save extracted data to database tables
 */
async function persistExtractionData(
  userId: string,
  conversationId: number,
  extraction: ExtractionResult,
  user: BjjUser
) {
  try {
    // 1. Save structured conversation data
    await db.insert(conversationStructuredData).values({
      userId,
      conversationId,
      techniquesMentioned: extraction.techniques,
      problemsDiscussed: extraction.problems,
      successesMentioned: extraction.successes,
      emotionalTone: extraction.emotionalTone,
      confidenceLevel: extraction.confidenceLevel,
      injuriesMentioned: extraction.injuries,
      conceptsDiscussed: extraction.conceptsDiscussed,
      learningStage: extraction.learningStage,
      opponentType: extraction.opponentType,
      extractedAt: new Date()
    });

    // 2. Record technique attempts
    for (const technique of extraction.techniques) {
      // Check if this is a success or just mentioned
      const isSuccess = extraction.successes.some(s => 
        s.toLowerCase().includes(technique.toLowerCase())
      );

      await db.insert(userTechniqueAttempts).values({
        userId,
        techniqueName: technique,
        successful: isSuccess,
        learningStage: extraction.learningStage || 'practice',
        attemptedAt: new Date()
      });
    }

    // 3. Update conceptual understanding
    for (const concept of extraction.conceptsDiscussed) {
      // Check if concept already exists
      const [existing] = await db.select()
        .from(userConceptualUnderstanding)
        .where(and(
          eq(userConceptualUnderstanding.userId, userId),
          eq(userConceptualUnderstanding.concept, concept)
        ))
        .limit(1);

      if (existing) {
        // Increment times applied
        await db.update(userConceptualUnderstanding)
          .set({
            timesApplied: (existing.timesApplied || 0) + 1,
            lastApplied: new Date()
          })
          .where(eq(userConceptualUnderstanding.id, existing.id));
      } else {
        // Create new concept record
        await db.insert(userConceptualUnderstanding).values({
          userId,
          concept,
          category: 'general', // Could be enhanced with categorization
          understandingLevel: 5, // Default mid-level, will be refined over time
          timesApplied: 1,
          needsReinforcement: false,
          lastApplied: new Date()
        });
      }
    }

    // 4. Update learning analytics (or create if not exists)
    const [analytics] = await db.select()
      .from(userLearningAnalytics)
      .where(eq(userLearningAnalytics.userId, userId))
      .limit(1);

    if (analytics) {
      // Update existing analytics
      const totalSessions = (analytics.totalTrainingSessions || 0) + 1;
      const totalSuccesses = (analytics.totalSuccesses || 0) + extraction.successes.length;
      
      await db.update(userLearningAnalytics)
        .set({
          totalTrainingSessions: totalSessions,
          totalSuccesses: totalSuccesses,
          lastSessionDate: new Date()
        })
        .where(eq(userLearningAnalytics.id, analytics.id));
    } else {
      // Create new analytics record
      await db.insert(userLearningAnalytics).values({
        userId,
        learningStyle: 'analyzing', // Default, will be learned over time
        instructionDepth: 'balanced',
        totalTrainingSessions: 1,
        totalSuccesses: extraction.successes.length,
        lastSessionDate: new Date()
      });
    }

    // 5. Update ecosystem technique effectiveness (if successful techniques)
    for (const technique of extraction.techniques) {
      const isSuccess = extraction.successes.some(s => 
        s.toLowerCase().includes(technique.toLowerCase())
      );

      if (isSuccess) {
        // Check if technique effectiveness record exists
        const [existing] = await db.select()
          .from(ecosystemTechniqueEffectiveness)
          .where(and(
            eq(ecosystemTechniqueEffectiveness.techniqueName, technique),
            eq(ecosystemTechniqueEffectiveness.beltLevel, user.belt || 'all'),
            eq(ecosystemTechniqueEffectiveness.bodyType, user.bodyType || 'all'),
            eq(ecosystemTechniqueEffectiveness.style, user.style || 'both')
          ))
          .limit(1);

        if (existing) {
          // Update success metrics
          const newTotal = (existing.totalAttempts || 0) + 1;
          const newSuccesses = (existing.totalSuccesses || 0) + 1;
          const newSuccessRate = (newSuccesses / newTotal) * 100;

          await db.update(ecosystemTechniqueEffectiveness)
            .set({
              totalAttempts: newTotal,
              totalSuccesses: newSuccesses,
              successRate: newSuccessRate,
              userCount: (existing.userCount || 0) + 1, // Increment unique users
              lastUpdated: new Date()
            })
            .where(eq(ecosystemTechniqueEffectiveness.id, existing.id));
        } else {
          // Create new technique effectiveness record
          await db.insert(ecosystemTechniqueEffectiveness).values({
            techniqueName: technique,
            category: 'general', // Could be enhanced
            beltLevel: user.belt || 'all',
            bodyType: user.bodyType || 'all',
            style: user.style || 'both',
            totalAttempts: 1,
            totalSuccesses: 1,
            successRate: 100,
            userCount: 1,
            lastUpdated: new Date()
          });
        }
      }
    }

    // 6. Record problem solutions (if problem + success in same conversation)
    if (extraction.problems.length > 0 && extraction.successes.length > 0) {
      for (const problem of extraction.problems) {
        // Find the solution technique (first technique mentioned)
        const solutionTechnique = extraction.techniques[0];
        
        if (solutionTechnique) {
          await db.insert(ecosystemProblemSolutions).values({
            problemDescription: problem,
            solutionTechnique: solutionTechnique,
            beltLevel: user.belt || 'all',
            bodyType: user.bodyType || 'all',
            totalAttempts: 1,
            totalSuccesses: 1,
            successRate: 100,
            usersSolved: 1,
            lastUpdated: new Date()
          });
        }
      }
    }

    // 7. Record collaborative intelligence (breakthroughs)
    if (extraction.successes.length > 0) {
      for (const success of extraction.successes) {
        const technique = extraction.techniques[0]; // Associate with first technique
        const problem = extraction.problems[0]; // Associate with first problem

        if (technique) {
          await db.insert(collaborativeIntelligence).values({
            userId,
            userBelt: user.belt || 'white',
            userBodyType: user.bodyType || null,
            technique: technique,
            problemSolved: problem || success,
            achievedAt: new Date()
          });
        }
      }
    }

    console.log(`✅ [EXTRACTION] Persisted data: ${extraction.techniques.length} techniques, ${extraction.problems.length} problems, ${extraction.successes.length} successes`);
  } catch (error) {
    console.error('[EXTRACTION] Error persisting data:', error);
    // Don't throw - extraction is optional enhancement
  }
}

/**
 * MAIN FUNCTION: Extract and persist conversation data
 * 
 * This is called after each Professor OS conversation to feed the ecosystem intelligence.
 */
export async function extractConversationLearning(
  userId: string,
  conversationId: number,
  userMessage: string,
  aiResponse: string,
  user: BjjUser
): Promise<void> {
  try {
    console.log(`[EXTRACTION] Processing conversation ${conversationId} for user ${userId}`);

    // Step 1: Extract structured data
    const extraction = await extractConversationData(userMessage, aiResponse);

    // Step 2: Persist to database
    await persistExtractionData(userId, conversationId, extraction, user);

    console.log(`✅ [EXTRACTION] Completed for conversation ${conversationId}`);
  } catch (error) {
    console.error('[EXTRACTION] Top-level extraction error:', error);
    // Don't throw - extraction failure shouldn't break the chat flow
  }
}
