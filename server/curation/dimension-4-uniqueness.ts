/**
 * Dimension 4: Unique Value Assessment
 * Determines if video adds unique value vs existing library content
 */

import { db } from '../db';
import { aiVideoKnowledge } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface UniquenessAnalysis {
  shouldAdd: boolean;
  uniqueScore: number; // 0-100
  uniqueValueReason: string | null;
  duplicateRisk: boolean;
  reasonsGood: string[];
  reasonsBad: string[];
}

/**
 * Assess if video provides unique value
 */
export async function assessUniqueValue(
  youtubeId: string,
  techniqueName: string,
  title: string,
  keyDetails: any,
  instructorName?: string
): Promise<UniquenessAnalysis> {
  
  try {
    // Check for exact duplicate
    const exactDuplicate = await db.select({ count: sql<number>`count(*)` })
      .from(aiVideoKnowledge)
      .where(eq(aiVideoKnowledge.youtubeId, youtubeId));

    if (Number(exactDuplicate[0].count) > 0) {
      return {
        shouldAdd: false,
        uniqueScore: 0,
        uniqueValueReason: null,
        duplicateRisk: true,
        reasonsGood: [],
        reasonsBad: ['Exact duplicate - already in library']
      };
    }

    // Get similar videos (same technique + instructor)
    const similarVideos = instructorName 
      ? await db.select()
          .from(aiVideoKnowledge)
          .where(and(
            eq(aiVideoKnowledge.techniqueName, techniqueName),
            eq(aiVideoKnowledge.instructorName, instructorName),
            eq(aiVideoKnowledge.status, 'active')
          ))
          .limit(10)
      : [];

    const reasonsGood: string[] = [];
    const reasonsBad: string[] = [];
    let uniqueScore = 70; // Base score
    let uniqueValueReason: string | null = null;

    // Same instructor, same technique - needs strong differentiation
    if (similarVideos.length > 0) {
      uniqueScore -= 15;
      reasonsBad.push(`${similarVideos.length} existing videos from same instructor on this technique`);

      // Check for unique aspects
      const hasUniqueDetails = analyzeUniqueDetails(keyDetails, similarVideos);
      if (hasUniqueDetails.isUnique) {
        uniqueScore += 20;
        uniqueValueReason = hasUniqueDetails.reason;
        reasonsGood.push(hasUniqueDetails.reason);
      }
    }

    // Title analysis for unique angle
    const uniqueAngle = extractUniqueAngle(title);
    if (uniqueAngle) {
      uniqueScore += 10;
      uniqueValueReason = uniqueValueReason || uniqueAngle;
      reasonsGood.push(`Unique angle: ${uniqueAngle}`);
    }

    // Different instructor - automatically adds variety
    if (similarVideos.length === 0 || !instructorName) {
      uniqueScore += 10;
      reasonsGood.push('Adds instructor variety to library');
    }

    const shouldAdd = uniqueScore >= 60;

    return {
      shouldAdd,
      uniqueScore,
      uniqueValueReason,
      duplicateRisk: similarVideos.length >= 3,
      reasonsGood,
      reasonsBad
    };

  } catch (error) {
    console.error('[DIMENSION 4] Error assessing uniqueness:', error);
    return {
      shouldAdd: true,
      uniqueScore: 70,
      uniqueValueReason: null,
      duplicateRisk: false,
      reasonsGood: [],
      reasonsBad: []
    };
  }
}

/**
 * Analyze if video has unique details vs existing videos
 */
function analyzeUniqueDetails(keyDetails: any, existingVideos: any[]): { isUnique: boolean; reason: string } {
  if (!keyDetails) {
    return { isUnique: false, reason: '' };
  }

  // Check for unique problem-solving approach
  const problems = keyDetails.problems_solved || [];
  const uniqueProblems = problems.filter((p: string) => {
    return !existingVideos.some(v => 
      v.problemsSolved && JSON.stringify(v.problemsSolved).includes(p)
    );
  });

  if (uniqueProblems.length > 0) {
    return { isUnique: true, reason: `Addresses unique problem: ${uniqueProblems[0]}` };
  }

  // Check for unique variations
  if (keyDetails.variation && !existingVideos.some(v => v.keyDetails?.variation === keyDetails.variation)) {
    return { isUnique: true, reason: `Shows unique variation: ${keyDetails.variation}` };
  }

  return { isUnique: false, reason: '' };
}

/**
 * Extract unique angle from title
 */
function extractUniqueAngle(title: string): string | null {
  const lowerTitle = title.toLowerCase();
  
  // Check for specific scenarios
  const scenarios = [
    { pattern: /vs|against|counter/, angle: 'Specific counter or response' },
    { pattern: /mistake|error|wrong/, angle: 'Common mistakes breakdown' },
    { pattern: /detail|secret|key/, angle: 'Key details focus' },
    { pattern: /beginner|white belt|first/, angle: 'Beginner-friendly approach' },
    { pattern: /advanced|complex|high level/, angle: 'Advanced variations' },
    { pattern: /competition|match|fight/, angle: 'Competition application' },
    { pattern: /drilling|training|practice/, angle: 'Training methodology' }
  ];

  for (const scenario of scenarios) {
    if (scenario.pattern.test(lowerTitle)) {
      return scenario.angle;
    }
  }

  return null;
}
