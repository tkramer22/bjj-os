/**
 * Dimension 3: Coverage Gap Analysis
 * Prioritizes videos that fill gaps in the library
 */

import { db } from '../db';
import { coverageStatus, aiVideoKnowledge } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface CoverageAnalysis {
  currentCount: number;
  targetCount: number;
  coverageRatio: number;
  needsMore: boolean;
  gapBoost: number; // 0-25 bonus points
  skillLevelNeeded: string | null;
  reasonsGood: string[];
}

/**
 * Analyze coverage gaps and boost score if video fills a gap
 */
export async function analyzeCoverageGap(
  techniqueName: string,
  difficultyLevel?: string
): Promise<CoverageAnalysis> {
  
  try {
    // Get current coverage status
    const coverageRecords = await db.select()
      .from(coverageStatus)
      .where(eq(coverageStatus.techniqueName, techniqueName))
      .limit(1);

    let currentCount = 0;
    let targetCount = 50;
    let beginnerCount = 0;
    let intermediateCount = 0;
    let advancedCount = 0;

    if (coverageRecords.length > 0) {
      const coverage = coverageRecords[0];
      currentCount = coverage.currentCount || 0;
      targetCount = coverage.targetCount || 50;
      beginnerCount = coverage.beginnerCount || 0;
      intermediateCount = coverage.intermediateCount || 0;
      advancedCount = coverage.advancedCount || 0;
    } else {
      // Initialize coverage tracking for new technique
      currentCount = await getCurrentVideoCount(techniqueName);
    }

    const coverageRatio = targetCount > 0 ? currentCount / targetCount : 0;
    const needsMore = coverageRatio < 0.8; // Less than 80% covered

    let gapBoost = 0;
    const reasonsGood: string[] = [];

    // Boost for under-covered techniques WITH CAPS
    // CAP: Common techniques (10+ videos) get limited boosts to prevent low-quality spam
    const isCommonTechnique = currentCount >= 10;
    
    if (coverageRatio < 0.3) {
      gapBoost = isCommonTechnique ? 10 : 25; // Cap at +10 if already saturated
      reasonsGood.push(`${isCommonTechnique ? 'Moderate gap' : 'High-priority gap'}: ${currentCount}/${targetCount} videos (${Math.round(coverageRatio * 100)}%)`);
    } else if (coverageRatio < 0.5) {
      gapBoost = isCommonTechnique ? 8 : 15;
      reasonsGood.push(`Coverage gap: ${currentCount}/${targetCount} videos (${Math.round(coverageRatio * 100)}%)`);
    } else if (coverageRatio < 0.8) {
      gapBoost = isCommonTechnique ? 3 : 5;
      reasonsGood.push(`Approaching target: ${currentCount}/${targetCount} videos`);
    }

    // Skill level distribution analysis
    let skillLevelNeeded: string | null = null;
    if (difficultyLevel) {
      const levelCounts = { beginner: beginnerCount, intermediate: intermediateCount, advanced: advancedCount };
      const minLevel = Object.entries(levelCounts).reduce((a, b) => a[1] < b[1] ? a : b)[0];
      
      if (difficultyLevel === minLevel) {
        gapBoost += 5;
        skillLevelNeeded = minLevel;
        reasonsGood.push(`Fills ${minLevel} level gap (only ${levelCounts[minLevel as keyof typeof levelCounts]} videos)`);
      }
    }

    return {
      currentCount,
      targetCount,
      coverageRatio,
      needsMore,
      gapBoost,
      skillLevelNeeded,
      reasonsGood
    };

  } catch (error) {
    console.error('[DIMENSION 3] Error analyzing coverage:', error);
    return {
      currentCount: 0,
      targetCount: 50,
      coverageRatio: 0,
      needsMore: true,
      gapBoost: 10,
      skillLevelNeeded: null,
      reasonsGood: []
    };
  }
}

/**
 * Get current video count for a technique
 */
async function getCurrentVideoCount(techniqueName: string): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(and(eq(aiVideoKnowledge.techniqueName, techniqueName), eq(aiVideoKnowledge.status, 'active')));
  
  return Number(result[0].count);
}

/**
 * Update coverage status after adding a video
 */
export async function updateCoverageAfterAdd(
  techniqueName: string,
  difficultyLevel?: string
): Promise<void> {
  
  const currentCount = await getCurrentVideoCount(techniqueName);
  const coverageRatio = currentCount / 50; // Assuming 50 is default target

  // Increment skill level counts
  const skillUpdates: any = {
    currentCount,
    coverageRatio: coverageRatio.toFixed(2),
    lastAdded: sql`NOW()`,
    updatedAt: sql`NOW()`
  };

  if (difficultyLevel === 'beginner') {
    skillUpdates.beginnerCount = sql`${coverageStatus.beginnerCount} + 1`;
  } else if (difficultyLevel === 'intermediate') {
    skillUpdates.intermediateCount = sql`${coverageStatus.intermediateCount} + 1`;
  } else if (difficultyLevel === 'advanced' || difficultyLevel === 'expert') {
    skillUpdates.advancedCount = sql`${coverageStatus.advancedCount} + 1`;
  }

  await db.insert(coverageStatus)
    .values({
      techniqueName,
      currentCount,
      coverageRatio: coverageRatio.toFixed(2)
    })
    .onConflictDoUpdate({
      target: coverageStatus.techniqueName,
      set: skillUpdates
    });
}
