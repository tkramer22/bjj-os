import { db } from '../db';
import { 
  trainingPartners,
  userPatternInterventions,
  userInjuryProfile,
  userTechniqueEcosystem
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { detectPatterns } from './pattern-detection';

/**
 * LAYER 4: CONTEXTUAL MEMORY INJECTION
 * Loads accumulated knowledge from all tables and injects into system prompt
 * This runs BEFORE Professor OS generates a response
 */

export async function loadAccumulatedKnowledge(userId: string): Promise<string> {
  console.log('[MEMORY INJECTION] Loading accumulated knowledge for user:', userId);
  
  let contextString = '';
  
  // 1. Load training partners
  try {
    const partners = await db.query.trainingPartners.findMany({
      where: eq(trainingPartners.userId, userId),
      orderBy: [desc(trainingPartners.timesMentioned)],
      limit: 10
    });
    
    if (partners.length > 0) {
      contextString += '\n═══════════════════════════════════════════════════════════════════════════════\n';
      contextString += 'TRAINING PARTNERS YOU\'VE MENTIONED:\n';
      contextString += '═══════════════════════════════════════════════════════════════════════════════\n\n';
      
      for (const partner of partners) {
        contextString += `• ${partner.name}${partner.beltLevel ? ` (${partner.beltLevel} belt)` : ''}\n`;
        contextString += `  First mentioned: ${partner.firstMentioned?.toLocaleDateString()}\n`;
        contextString += `  Times mentioned: ${partner.timesMentioned}\n`;
        if (partner.style) {
          contextString += `  Style: ${partner.style}\n`;
        }
        if (partner.notes) {
          contextString += `  Context: ${partner.notes.split(' | ').slice(-2).join(' | ')}\n`;
        }
        contextString += '\n';
      }
    }
  } catch (error) {
    console.error('[MEMORY INJECTION] Error loading training partners:', error);
  }
  
  // 2. Load recurring problems (active only)
  try {
    const problems = await db.query.userPatternInterventions.findMany({
      where: and(
        eq(userPatternInterventions.userId, userId),
        eq(userPatternInterventions.patternType, 'recurring_problem'),
        eq(userPatternInterventions.addressed, false)
      ),
      orderBy: [desc(userPatternInterventions.occurrenceCount)],
      limit: 5
    });
    
    if (problems.length > 0) {
      contextString += '\n═══════════════════════════════════════════════════════════════════════════════\n';
      contextString += 'RECURRING PROBLEMS (NOT YET SOLVED):\n';
      contextString += '═══════════════════════════════════════════════════════════════════════════════\n\n';
      
      for (const problem of problems) {
        contextString += `• ${problem.description}\n`;
        contextString += `  First detected: ${problem.firstDetected?.toLocaleDateString()}\n`;
        contextString += `  Times mentioned: ${problem.occurrenceCount}\n`;
        contextString += `  Urgency: ${problem.urgency}\n\n`;
      }
    }
  } catch (error) {
    console.error('[MEMORY INJECTION] Error loading problems:', error);
  }
  
  // 3. Load active injuries
  try {
    const injuryProfile = await db.query.userInjuryProfile.findFirst({
      where: eq(userInjuryProfile.userId, userId)
    });
    
    if (injuryProfile?.activeInjuries && Array.isArray(injuryProfile.activeInjuries)) {
      const activeInjuries = injuryProfile.activeInjuries as any[];
      
      if (activeInjuries.length > 0) {
        contextString += '\n═══════════════════════════════════════════════════════════════════════════════\n';
        contextString += '⚠️  ACTIVE INJURIES (BE MINDFUL IN RECOMMENDATIONS):\n';
        contextString += '═══════════════════════════════════════════════════════════════════════════════\n\n';
        
        // Get unique body parts with latest info
        const injuryMap = new Map<string, any>();
        for (const injury of activeInjuries) {
          const bodyPart = injury.body_part || 'unknown';
          if (!injuryMap.has(bodyPart) || new Date(injury.date) > new Date(injuryMap.get(bodyPart).date)) {
            injuryMap.set(bodyPart, injury);
          }
        }
        
        for (const [bodyPart, injury] of injuryMap) {
          contextString += `• ${bodyPart}`;
          if (injury.pain_type) contextString += ` (${injury.pain_type} pain)`;
          if (injury.severity) contextString += ` - Severity: ${injury.severity}/10`;
          contextString += `\n  Last mentioned: ${new Date(injury.date).toLocaleDateString()}\n\n`;
        }
      }
    }
  } catch (error) {
    console.error('[MEMORY INJECTION] Error loading injuries:', error);
  }
  
  // 4. Load technique ecosystem (top techniques)
  try {
    const techniques = await db.query.userTechniqueEcosystem.findMany({
      where: eq(userTechniqueEcosystem.userId, userId),
      orderBy: [desc(userTechniqueEcosystem.attempts)],
      limit: 10
    });
    
    if (techniques.length > 0) {
      const successfulTechniques = techniques.filter(t => (t.successes || 0) > 0);
      const strugglingTechniques = techniques.filter(t => (t.attempts || 0) > 2 && (t.successes || 0) === 0);
      
      if (successfulTechniques.length > 0) {
        contextString += '\n═══════════════════════════════════════════════════════════════════════════════\n';
        contextString += 'TECHNIQUES THEY\'RE HAVING SUCCESS WITH:\n';
        contextString += '═══════════════════════════════════════════════════════════════════════════════\n\n';
        
        for (const tech of successfulTechniques.slice(0, 5)) {
          const successRate = ((tech.successes || 0) / (tech.attempts || 1) * 100).toFixed(0);
          contextString += `• ${tech.techniqueName}: ${tech.successes}/${tech.attempts} (${successRate}% success)\n`;
          if (tech.isSignatureMove) {
            contextString += `  ⭐ SIGNATURE MOVE\n`;
          }
        }
        contextString += '\n';
      }
      
      if (strugglingTechniques.length > 0) {
        contextString += '\n═══════════════════════════════════════════════════════════════════════════════\n';
        contextString += 'TECHNIQUES THEY\'RE STRUGGLING WITH:\n';
        contextString += '═══════════════════════════════════════════════════════════════════════════════\n\n';
        
        for (const tech of strugglingTechniques.slice(0, 5)) {
          contextString += `• ${tech.techniqueName}: 0/${tech.attempts} (0% success) - NEEDS HELP\n`;
        }
        contextString += '\n';
      }
    }
  } catch (error) {
    console.error('[MEMORY INJECTION] Error loading techniques:', error);
  }
  
  // 5. Detect and inject patterns
  try {
    const patterns = await detectPatterns(userId);
    
    if (patterns.length > 0) {
      contextString += '\n═══════════════════════════════════════════════════════════════════════════════\n';
      contextString += '🔍 DETECTED PATTERNS (CRITICAL - ADDRESS THESE):\n';
      contextString += '═══════════════════════════════════════════════════════════════════════════════\n\n';
      
      for (const pattern of patterns) {
        const severityEmoji = pattern.severity === 'high' ? '🔴' : 
                             pattern.severity === 'medium' ? '🟡' : '🟢';
        contextString += `${severityEmoji} ${pattern.description}\n`;
        contextString += `   → ${pattern.action_required}\n\n`;
      }
    }
  } catch (error) {
    console.error('[MEMORY INJECTION] Error detecting patterns:', error);
  }
  
  if (contextString) {
    contextString += '\n═══════════════════════════════════════════════════════════════════════════════\n';
    contextString += 'END OF ACCUMULATED KNOWLEDGE\n';
    contextString += '═══════════════════════════════════════════════════════════════════════════════\n\n';
    
    contextString += '⚡ INSTRUCTIONS: Use this accumulated knowledge to:\n';
    contextString += '1. Reference their training partners by name when relevant\n';
    contextString += '2. Acknowledge and address recurring problems\n';
    contextString += '3. Be mindful of active injuries in your recommendations\n';
    contextString += '4. Build on techniques they\'re having success with\n';
    contextString += '5. Offer specific help with techniques they\'re struggling with\n';
    contextString += '6. Act on detected patterns with HIGH priority\n\n';
    
    console.log(`[MEMORY INJECTION] Loaded accumulated knowledge (${contextString.length} chars)`);
  } else {
    console.log('[MEMORY INJECTION] No accumulated knowledge yet');
  }
  
  return contextString;
}

/**
 * Get short context summary for quick reference
 */
export async function getShortContextSummary(userId: string): Promise<string> {
  const partners = await db.query.trainingPartners.findMany({
    where: eq(trainingPartners.userId, userId),
    limit: 3
  });
  
  const problems = await db.query.userPatternInterventions.findMany({
    where: and(
      eq(userPatternInterventions.userId, userId),
      eq(userPatternInterventions.addressed, false)
    ),
    limit: 2
  });
  
  let summary = '';
  
  if (partners.length > 0) {
    summary += `Training partners: ${partners.map(p => p.name).join(', ')}. `;
  }
  
  if (problems.length > 0) {
    summary += `Active problems: ${problems.map(p => p.description).join('; ')}. `;
  }
  
  return summary;
}
