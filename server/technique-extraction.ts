/**
 * TECHNIQUE EXTRACTION SERVICE
 * 
 * Extracts technique success/failure signals from user conversations
 * and updates user_technique_ecosystem for population learning.
 * 
 * Created: Nov 27, 2025
 */

import { db } from "./db";
import { userTechniqueEcosystem, populationIntelligence, bjjUsers } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

interface TechniqueExtractionResult {
  technique: string;
  signal: 'success' | 'failure' | 'learning' | 'question';
  timeIndicator?: string;  // "after 3 weeks", "first time", etc.
  confidence: number;      // 0-1
  extractedFrom: string;   // Quote from message
}

interface ExtractionDiagnostic {
  techniqueExtracted: string | null;
  successSignal: boolean | null;
  timeIndicator: string | null;
  userBelt: string | null;
  updatedTables: string[];
}

const TECHNIQUE_PATTERNS = [
  { pattern: /triangle\s*(choke)?/i, name: 'triangle choke', normalized: 'Triangle Choke' },
  { pattern: /armbar|arm\s*bar|juji\s*gatame/i, name: 'armbar', normalized: 'Armbar from Guard' },
  { pattern: /hip\s*bump|bump\s*sweep/i, name: 'hip bump', normalized: 'Hip Bump Sweep' },
  { pattern: /guillotine\s*(choke)?/i, name: 'guillotine', normalized: 'Guillotine Choke' },
  { pattern: /rear\s*naked|rnc|mata\s*leao/i, name: 'rnc', normalized: 'Rear Naked Choke' },
  { pattern: /knee\s*(slice|cut)|knee\s*pass/i, name: 'knee slice', normalized: 'Knee Slice Pass' },
  { pattern: /mount\s*escape|escape.*mount|upa/i, name: 'mount escape', normalized: 'Mount Escape Elbow-Knee' },
  { pattern: /double\s*leg|double\s*takedown/i, name: 'double leg', normalized: 'Double Leg Takedown' },
  { pattern: /scissor\s*sweep/i, name: 'scissor sweep', normalized: 'Scissor Sweep' },
  { pattern: /americana|key\s*lock|ude\s*garami/i, name: 'americana', normalized: 'Americana from Mount' },
  { pattern: /kimura/i, name: 'kimura', normalized: 'Kimura' },
  { pattern: /omoplata/i, name: 'omoplata', normalized: 'Omoplata' },
  { pattern: /bow\s*(and|&)?\s*arrow/i, name: 'bow and arrow', normalized: 'Bow and Arrow Choke' },
  { pattern: /arm\s*triangle|head\s*and\s*arm/i, name: 'arm triangle', normalized: 'Arm Triangle' },
  { pattern: /darce|d'arce/i, name: 'darce', normalized: 'Darce Choke' },
  { pattern: /anaconda\s*(choke)?/i, name: 'anaconda', normalized: 'Anaconda Choke' },
  { pattern: /ezekiel|ezequiel/i, name: 'ezekiel', normalized: 'Ezekiel Choke' },
  { pattern: /heel\s*hook/i, name: 'heel hook', normalized: 'Heel Hook' },
  { pattern: /knee\s*bar|kneebar/i, name: 'knee bar', normalized: 'Knee Bar' },
  { pattern: /ankle\s*lock|straight\s*ankle/i, name: 'ankle lock', normalized: 'Ankle Lock' },
  { pattern: /toe\s*hold/i, name: 'toe hold', normalized: 'Toe Hold' },
  { pattern: /single\s*leg/i, name: 'single leg', normalized: 'Single Leg Takedown' },
  { pattern: /berimbolo/i, name: 'berimbolo', normalized: 'Berimbolo' },
  { pattern: /de\s*la\s*riva|dlr/i, name: 'de la riva', normalized: 'De La Riva Guard' },
  { pattern: /x\s*guard/i, name: 'x guard', normalized: 'X Guard' },
  { pattern: /butterfly\s*(sweep|guard)?/i, name: 'butterfly', normalized: 'Butterfly Guard' },
  { pattern: /half\s*guard/i, name: 'half guard', normalized: 'Half Guard' },
  { pattern: /closed\s*guard/i, name: 'closed guard', normalized: 'Closed Guard' },
  { pattern: /back\s*take|taking\s*(the\s*)?back/i, name: 'back take', normalized: 'Back Take' },
  { pattern: /arm\s*drag/i, name: 'arm drag', normalized: 'Arm Drag' },
  { pattern: /toreando|toreando\s*pass/i, name: 'toreando', normalized: 'Toreando Pass' },
  { pattern: /leg\s*drag/i, name: 'leg drag', normalized: 'Leg Drag Pass' },
  { pattern: /body\s*lock/i, name: 'body lock', normalized: 'Body Lock Pass' },
  { pattern: /sweep/i, name: 'sweep', normalized: 'Sweep' },
  { pattern: /pass(ing)?/i, name: 'guard pass', normalized: 'Guard Pass' },
];

const SUCCESS_SIGNALS = [
  { pattern: /finally\s*(hit|got|landed|finished|submitted)/i, signal: 'success', confidence: 0.95 },
  { pattern: /first\s*time\s*(hitting|getting|landing)/i, signal: 'success', confidence: 0.95 },
  { pattern: /(it\s*)?worked!?/i, signal: 'success', confidence: 0.85 },
  { pattern: /got\s*(the|my|a)\s*\w+!?$/i, signal: 'success', confidence: 0.8 },
  { pattern: /tapped\s*(him|her|them|someone|my\s*partner)/i, signal: 'success', confidence: 0.9 },
  { pattern: /submitted\s*(him|her|them|someone)/i, signal: 'success', confidence: 0.9 },
  { pattern: /pulled\s*off/i, signal: 'success', confidence: 0.85 },
  { pattern: /nailed\s*it/i, signal: 'success', confidence: 0.9 },
  { pattern: /breakthrough/i, signal: 'success', confidence: 0.9 },
  { pattern: /working\s*(well|great|better)/i, signal: 'success', confidence: 0.7 },
  { pattern: /clicking\s*now/i, signal: 'success', confidence: 0.85 },
];

const FAILURE_SIGNALS = [
  { pattern: /keep\s*(failing|missing|losing)/i, signal: 'failure', confidence: 0.9 },
  { pattern: /can'?t\s*(seem\s*to\s*)?(hit|get|land|finish)/i, signal: 'failure', confidence: 0.85 },
  { pattern: /struggle|struggling/i, signal: 'failure', confidence: 0.8 },
  { pattern: /never\s*(hit|get|land|work)/i, signal: 'failure', confidence: 0.85 },
  { pattern: /not\s*working/i, signal: 'failure', confidence: 0.8 },
  { pattern: /keeps?\s*escaping/i, signal: 'failure', confidence: 0.85 },
  { pattern: /always\s*(get\s*)?(passed|swept|submitted)/i, signal: 'failure', confidence: 0.85 },
  { pattern: /frustrat(ed|ing)/i, signal: 'failure', confidence: 0.7 },
  { pattern: /stuck/i, signal: 'failure', confidence: 0.7 },
];

const LEARNING_SIGNALS = [
  { pattern: /learning|trying\s*to\s*learn/i, signal: 'learning', confidence: 0.7 },
  { pattern: /working\s*on/i, signal: 'learning', confidence: 0.7 },
  { pattern: /drilling/i, signal: 'learning', confidence: 0.75 },
  { pattern: /practicing/i, signal: 'learning', confidence: 0.75 },
  { pattern: /want\s*to\s*(learn|get|improve)/i, signal: 'learning', confidence: 0.7 },
];

const TIME_PATTERNS = [
  { pattern: /after\s*(\d+)\s*(days?|weeks?|months?)/i, extract: (m: RegExpMatchArray) => `${m[1]} ${m[2]}` },
  { pattern: /(\d+)\s*(days?|weeks?|months?)\s*(of\s*)?(drilling|practice|training)/i, extract: (m: RegExpMatchArray) => `${m[1]} ${m[2]}` },
  { pattern: /first\s*time/i, extract: () => 'first time' },
  { pattern: /finally/i, extract: () => 'after extended effort' },
  { pattern: /today/i, extract: () => 'same day' },
  { pattern: /yesterday/i, extract: () => '1 day' },
  { pattern: /this\s*week/i, extract: () => 'this week' },
  { pattern: /last\s*week/i, extract: () => 'last week' },
];

/**
 * Extract techniques and signals from a user message
 */
export function extractTechniquesFromMessage(message: string): TechniqueExtractionResult[] {
  const results: TechniqueExtractionResult[] = [];
  const messageLower = message.toLowerCase();
  
  for (const technique of TECHNIQUE_PATTERNS) {
    const match = message.match(technique.pattern);
    if (match) {
      let signal: 'success' | 'failure' | 'learning' | 'question' = 'question';
      let signalConfidence = 0.5;
      
      for (const s of SUCCESS_SIGNALS) {
        if (s.pattern.test(message)) {
          signal = 'success';
          signalConfidence = s.confidence;
          break;
        }
      }
      
      if (signal === 'question') {
        for (const s of FAILURE_SIGNALS) {
          if (s.pattern.test(message)) {
            signal = 'failure';
            signalConfidence = s.confidence;
            break;
          }
        }
      }
      
      if (signal === 'question') {
        for (const s of LEARNING_SIGNALS) {
          if (s.pattern.test(message)) {
            signal = 'learning';
            signalConfidence = s.confidence;
            break;
          }
        }
      }
      
      let timeIndicator: string | undefined;
      for (const tp of TIME_PATTERNS) {
        const timeMatch = message.match(tp.pattern);
        if (timeMatch) {
          timeIndicator = tp.extract(timeMatch);
          break;
        }
      }
      
      results.push({
        technique: technique.normalized,
        signal,
        timeIndicator,
        confidence: signalConfidence,
        extractedFrom: match[0]
      });
    }
  }
  
  return results;
}

/**
 * Update user_technique_ecosystem based on extracted technique feedback
 */
export async function updateTechniqueEcosystem(
  userId: string,
  extraction: TechniqueExtractionResult
): Promise<void> {
  console.log(`🧬 [TECHNIQUE ECOSYSTEM] Updating for user ${userId}: ${extraction.technique} (${extraction.signal})`);
  
  try {
    const existing = await db.select()
      .from(userTechniqueEcosystem)
      .where(and(
        eq(userTechniqueEcosystem.userId, userId),
        eq(userTechniqueEcosystem.techniqueName, extraction.technique)
      ))
      .limit(1);
    
    const now = new Date();
    
    if (existing.length > 0) {
      const record = existing[0];
      const updates: any = {
        updatedAt: now
      };
      
      if (extraction.signal === 'success') {
        updates.successes = (record.successes || 0) + 1;
        updates.attempts = (record.attempts || 0) + 1;
        
        if (!record.firstSuccessDate) {
          updates.firstSuccessDate = now;
          updates.attemptsToFirstSuccess = record.attempts || 1;
        }
      } else if (extraction.signal === 'failure') {
        updates.failures = (record.failures || 0) + 1;
        updates.attempts = (record.attempts || 0) + 1;
      } else if (extraction.signal === 'learning') {
        if (!record.firstAttemptedDate) {
          updates.firstAttemptedDate = now;
        }
      }
      
      if (updates.attempts !== undefined) {
        const totalSuccesses = updates.successes || record.successes || 0;
        // Store as decimal 0.00-1.00 (schema has precision 4, scale 2)
        updates.successRate = (totalSuccesses / updates.attempts).toFixed(2);
      }
      
      await db.update(userTechniqueEcosystem)
        .set(updates)
        .where(eq(userTechniqueEcosystem.id, record.id));
        
      console.log(`   ✅ Updated existing record: attempts=${updates.attempts}, successes=${updates.successes || record.successes}`);
    } else {
      await db.insert(userTechniqueEcosystem).values({
        userId,
        techniqueName: extraction.technique,
        attempts: extraction.signal === 'success' || extraction.signal === 'failure' ? 1 : 0,
        successes: extraction.signal === 'success' ? 1 : 0,
        failures: extraction.signal === 'failure' ? 1 : 0,
        successRate: extraction.signal === 'success' ? '1.00' : extraction.signal === 'failure' ? '0.00' : null,
        firstAttemptedDate: now,
        firstSuccessDate: extraction.signal === 'success' ? now : null,
        attemptsToFirstSuccess: extraction.signal === 'success' ? 1 : null,
        createdAt: now,
        updatedAt: now
      });
      
      console.log(`   ✅ Created new record for ${extraction.technique}`);
    }
  } catch (error: any) {
    console.error(`   ❌ Error updating technique ecosystem:`, error.message);
  }
}

/**
 * Main function: Process a user message and update ecosystems
 * Returns diagnostic information for logging
 */
export async function processMessageForTechniqueExtraction(
  userId: string,
  message: string
): Promise<ExtractionDiagnostic> {
  const diagnostic: ExtractionDiagnostic = {
    techniqueExtracted: null,
    successSignal: null,
    timeIndicator: null,
    userBelt: null,
    updatedTables: []
  };
  
  try {
    const user = await db.select({ beltLevel: bjjUsers.beltLevel })
      .from(bjjUsers)
      .where(eq(bjjUsers.id, userId))
      .limit(1);
    
    diagnostic.userBelt = user[0]?.beltLevel || null;
    
    const extractions = extractTechniquesFromMessage(message);
    
    if (extractions.length === 0) {
      return diagnostic;
    }
    
    for (const extraction of extractions) {
      if (extraction.signal === 'success' || extraction.signal === 'failure') {
        diagnostic.techniqueExtracted = extraction.technique;
        diagnostic.successSignal = extraction.signal === 'success';
        diagnostic.timeIndicator = extraction.timeIndicator || null;
        
        await updateTechniqueEcosystem(userId, extraction);
        diagnostic.updatedTables.push('user_technique_ecosystem');
        
        console.log(`📊 [EXTRACTION DIAGNOSTIC] ${JSON.stringify(diagnostic)}`);
      }
    }
    
  } catch (error: any) {
    console.error(`[TECHNIQUE EXTRACTION] Error processing message:`, error.message);
  }
  
  return diagnostic;
}

/**
 * Aggregate user data into population_intelligence
 * Should be called by scheduler (daily at 7 AM EST)
 */
export async function aggregateToPopulationIntelligence(): Promise<void> {
  console.log('[POPULATION AGGREGATION] Starting daily aggregation...');
  
  try {
    const techniqueStats = await db.execute(sql`
      SELECT 
        te.technique_name,
        u.belt_level,
        u.body_type,
        COUNT(DISTINCT te.user_id) as user_count,
        AVG(te.success_rate::numeric) as avg_success_rate,
        AVG(
          CASE WHEN te.first_success_date IS NOT NULL AND te.first_attempted_date IS NOT NULL
          THEN EXTRACT(DAY FROM te.first_success_date - te.first_attempted_date)
          ELSE NULL END
        ) as avg_days_to_success,
        SUM(te.attempts) as total_attempts
      FROM user_technique_ecosystem te
      JOIN bjj_users u ON te.user_id = u.id
      WHERE te.attempts >= 1
      GROUP BY te.technique_name, u.belt_level, u.body_type
      HAVING COUNT(DISTINCT te.user_id) >= 1
    `);
    
    for (const stat of techniqueStats.rows as any[]) {
      const existing = await db.select()
        .from(populationIntelligence)
        .where(eq(populationIntelligence.techniqueName, stat.technique_name))
        .limit(1);
      
      if (existing.length > 0) {
        const updates: any = {
          lastUpdated: new Date(),
          sampleSize: (existing[0].sampleSize || 0) + parseInt(stat.user_count)
        };
        
        const belt = stat.belt_level?.toLowerCase();
        const successRate = parseFloat(stat.avg_success_rate || 0) / 100;
        
        if (belt === 'white') updates.successRateWhite = successRate.toFixed(2);
        else if (belt === 'blue') updates.successRateBlue = successRate.toFixed(2);
        else if (belt === 'purple') updates.successRatePurple = successRate.toFixed(2);
        else if (belt === 'brown') updates.successRateBrown = successRate.toFixed(2);
        else if (belt === 'black') updates.successRateBlack = successRate.toFixed(2);
        
        const bodyType = stat.body_type?.toLowerCase();
        if (bodyType === 'tall_lanky' || bodyType === 'tall and lanky') {
          updates.successRateTallLanky = successRate.toFixed(2);
        } else if (bodyType === 'average') {
          updates.successRateAverage = successRate.toFixed(2);
        } else if (bodyType === 'short_stocky' || bodyType === 'short and stocky') {
          updates.successRateShortStocky = successRate.toFixed(2);
        }
        
        if (stat.avg_days_to_success) {
          updates.avgDaysToFirstSuccess = Math.round(parseFloat(stat.avg_days_to_success));
        }
        
        await db.update(populationIntelligence)
          .set(updates)
          .where(eq(populationIntelligence.id, existing[0].id));
          
        console.log(`   ✅ Updated population data for ${stat.technique_name}`);
      }
    }
    
    console.log('[POPULATION AGGREGATION] ✅ Aggregation complete');
  } catch (error: any) {
    console.error('[POPULATION AGGREGATION] Error:', error.message);
  }
}
