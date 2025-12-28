import { Anthropic } from '@anthropic-ai/sdk';
import { db } from '../db';
import { 
  trainingPartners, 
  userPatternInterventions, 
  userInjuryProfile,
  userTechniqueEcosystem,
  conversationStructuredData
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * LAYER 2: STRUCTURED DATA EXTRACTION
 * Extracts and saves structured data from Professor OS conversations
 * Maps to EXISTING tables (100% additive):
 * - training_partners (NEW)
 * - userPatternInterventions (existing - problems)
 * - userInjuryProfile (existing - injuries)
 * - userTechniqueEcosystem (existing - techniques)
 * - conversationStructuredData (existing - metadata)
 */

interface ExtractedData {
  training_partners: Array<{
    name: string;
    belt_level?: string;
    style?: string;
    context: string;
  }>;
  problems: Array<{
    problem_type: string;
    position?: string;
    related_opponent?: string;
  }>;
  injuries: Array<{
    body_part: string;
    pain_type?: string;
    severity?: number;
  }>;
  techniques: Array<{
    technique_name: string;
    category?: string;
    attempted?: boolean;
    successful?: boolean;
  }>;
  emotional_tone: 'frustrated' | 'excited' | 'neutral' | 'analytical';
  successes: string[];
}

export async function extractStructuredData(
  userMessage: string,
  osResponse: string
): Promise<ExtractedData> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  
  const extractionPrompt = `
Analyze this BJJ training conversation and extract structured data.

USER MESSAGE: "${userMessage}"
PROFESSOR OS RESPONSE: "${osResponse}"

Extract the following in JSON format:

{
  "training_partners": [
    {
      "name": "exact name mentioned",
      "belt_level": "white/blue/purple/brown/black (if mentioned)",
      "style": "pressure/speed/technical/scramble (if inferrable)",
      "context": "brief context of mention"
    }
  ],
  "problems": [
    {
      "problem_type": "retention/passing/submissions/escapes/takedowns",
      "position": "half_guard/closed_guard/mount/side_control/etc (if mentioned)",
      "related_opponent": "name (if problem is vs specific person)"
    }
  ],
  "injuries": [
    {
      "body_part": "knee/shoulder/back/neck/ribs/etc",
      "pain_type": "sharp/dull/ache/burning (if mentioned)",
      "severity": 1-10 (if inferrable)
    }
  ],
  "techniques": [
    {
      "technique_name": "triangle/armbar/sweep/kimura/etc",
      "category": "submission/sweep/pass/escape/takedown",
      "attempted": true/false,
      "successful": true/false (if mentioned)
    }
  ],
  "emotional_tone": "frustrated/excited/neutral/analytical",
  "successes": ["any wins or breakthroughs mentioned"]
}

CRITICAL: Respond ONLY with valid JSON. No explanations, no markdown code blocks, just pure JSON.
If nothing in a category, return empty array. Be precise. Only extract what's explicitly mentioned or clearly inferrable.
  `.trim();
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: extractionPrompt
      }]
    });
    
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '{}';
    
    // Handle markdown code blocks and extract JSON
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```')) {
      // Remove markdown code block formatting
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    
    // Parse JSON with robust error handling
    let extracted: any;
    try {
      extracted = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[DATA EXTRACTION] JSON parse failed, raw response:', responseText);
      console.error('[DATA EXTRACTION] Parse error:', parseError);
      // Return empty structure on parse failure
      extracted = {};
    }
    
    // Normalize extracted data with defaults (prevent TypeErrors)
    const normalized: ExtractedData = {
      training_partners: Array.isArray(extracted.training_partners) ? extracted.training_partners : [],
      problems: Array.isArray(extracted.problems) ? extracted.problems : [],
      injuries: Array.isArray(extracted.injuries) ? extracted.injuries : [],
      techniques: Array.isArray(extracted.techniques) ? extracted.techniques : [],
      emotional_tone: extracted.emotional_tone || 'neutral',
      successes: Array.isArray(extracted.successes) ? extracted.successes : []
    };
    
    return normalized;
  } catch (apiError) {
    console.error('[DATA EXTRACTION] API call failed:', apiError);
    // Return empty structure on API failure
    return {
      training_partners: [],
      problems: [],
      injuries: [],
      techniques: [],
      emotional_tone: 'neutral',
      successes: []
    };
  }
}

export async function saveExtractedData(
  userId: string,
  conversationId: string | null,
  extracted: ExtractedData
): Promise<void> {
  console.log('[DATA EXTRACTION] Saving extracted data for user:', userId);
  
  // 1. Save training partners to NEW training_partners table
  for (const partner of extracted.training_partners) {
    try {
      await db
        .insert(trainingPartners)
        .values({
          userId,
          name: partner.name,
          beltLevel: partner.belt_level,
          style: partner.style,
          notes: partner.context,
          timesMentioned: 1,
          firstMentioned: new Date(),
          lastMentioned: new Date()
        })
        .onConflictDoUpdate({
          target: [trainingPartners.userId, trainingPartners.name],
          set: {
            timesMentioned: sql`${trainingPartners.timesMentioned} + 1`,
            lastMentioned: new Date(),
            beltLevel: partner.belt_level || sql`${trainingPartners.beltLevel}`,
            style: partner.style || sql`${trainingPartners.style}`,
            notes: sql`CONCAT(${trainingPartners.notes}, ' | ', ${partner.context})`
          }
        });
    } catch (error) {
      console.error('[DATA EXTRACTION] Failed to save training partner:', error);
    }
  }
  
  // 2. Save problems to EXISTING userPatternInterventions table
  for (const problem of extracted.problems) {
    try {
      const description = `${problem.problem_type}${problem.position ? ` from ${problem.position}` : ''}${problem.related_opponent ? ` vs ${problem.related_opponent}` : ''}`;
      
      await db
        .insert(userPatternInterventions)
        .values({
          userId,
          patternType: 'recurring_problem',
          description,
          occurrenceCount: 1,
          firstDetected: new Date(),
          lastOccurrence: new Date(),
          urgency: 'medium',
          addressed: false
        })
        .onConflictDoNothing();
    } catch (error) {
      console.error('[DATA EXTRACTION] Failed to save problem:', error);
    }
  }
  
  // 3. Save injuries to EXISTING userInjuryProfile table (JSONB update)
  if (extracted.injuries.length > 0) {
    try {
      const existingProfile = await db.query.userInjuryProfile.findFirst({
        where: eq(userInjuryProfile.userId, userId)
      });
      
      const currentInjuries = existingProfile?.activeInjuries as any[] || [];
      const currentHistory = existingProfile?.injuryHistory as any[] || [];
      
      for (const injury of extracted.injuries) {
        // Add to active injuries
        const newInjury = {
          body_part: injury.body_part,
          pain_type: injury.pain_type,
          severity: injury.severity,
          date: new Date().toISOString()
        };
        
        currentInjuries.push(newInjury);
        currentHistory.push(newInjury);
      }
      
      if (existingProfile) {
        await db.update(userInjuryProfile)
          .set({
            activeInjuries: currentInjuries,
            injuryHistory: currentHistory,
            lastUpdated: new Date()
          })
          .where(eq(userInjuryProfile.userId, userId));
      } else {
        await db.insert(userInjuryProfile).values({
          userId,
          activeInjuries: currentInjuries,
          injuryHistory: currentHistory,
          lastUpdated: new Date()
        });
      }
    } catch (error) {
      console.error('[DATA EXTRACTION] Failed to save injuries:', error);
    }
  }
  
  // 4. Save techniques to EXISTING userTechniqueEcosystem table
  for (const technique of extracted.techniques) {
    try {
      await db
        .insert(userTechniqueEcosystem)
        .values({
          userId,
          techniqueName: technique.technique_name,
          attempts: technique.attempted ? 1 : 0,
          successes: technique.successful ? 1 : 0,
          failures: technique.attempted && !technique.successful ? 1 : 0,
          firstAttemptedDate: technique.attempted ? new Date() : undefined
        })
        .onConflictDoUpdate({
          target: [userTechniqueEcosystem.userId, userTechniqueEcosystem.techniqueName],
          set: {
            attempts: technique.attempted 
              ? sql`${userTechniqueEcosystem.attempts} + 1`
              : sql`${userTechniqueEcosystem.attempts}`,
            successes: technique.successful
              ? sql`${userTechniqueEcosystem.successes} + 1`
              : sql`${userTechniqueEcosystem.successes}`,
            failures: technique.attempted && !technique.successful
              ? sql`${userTechniqueEcosystem.failures} + 1`
              : sql`${userTechniqueEcosystem.failures}`,
            updatedAt: new Date()
          }
        });
    } catch (error) {
      console.error('[DATA EXTRACTION] Failed to save technique:', error);
    }
  }
  
  // 5. Save conversation metadata to EXISTING conversationStructuredData table
  try {
    await db.insert(conversationStructuredData).values({
      userId,
      conversationId,
      techniquesMentioned: extracted.techniques.map(t => t.technique_name),
      problemsMentioned: extracted.problems.map(p => p.problem_type),
      successesMentioned: extracted.successes,
      injuriesPainMentioned: extracted.injuries.map(i => i.body_part),
      opponentsMentioned: extracted.training_partners.map(p => p.name),
      emotionalTone: extracted.emotional_tone,
      frustrationLevel: extracted.emotional_tone === 'frustrated' ? 7 : 5,
      confidenceLevel: extracted.emotional_tone === 'excited' ? 8 : 5
    });
  } catch (error) {
    console.error('[DATA EXTRACTION] Failed to save conversation metadata:', error);
  }
  
  console.log('[DATA EXTRACTION] Successfully saved all extracted data');
}

/**
 * Main function: Extract and save data from a conversation
 * This runs asynchronously AFTER the user receives their response (non-blocking)
 */
export async function extractAndSaveConversationData(
  userId: string,
  userMessage: string,
  osResponse: string,
  conversationId: string | null = null
): Promise<void> {
  try {
    console.log('[DATA EXTRACTION] Starting extraction for user:', userId);
    const extracted = await extractStructuredData(userMessage, osResponse);
    await saveExtractedData(userId, conversationId, extracted);
  } catch (error) {
    console.error('[DATA EXTRACTION] Extraction failed:', error);
    // Don't throw - this is a background process
  }
}
