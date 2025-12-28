/**
 * Dimension 7: Emerging Technique Detection
 * Detects and validates new/trending techniques in BJJ
 */

import { db } from '../db';
import { emergingTechniques } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

export interface EmergingAnalysis {
  isEmergingTechnique: boolean;
  confidenceScore: number; // 0-100
  emergingBoost: number; // 0-20
  status: string;
  reasonsGood: string[];
}

/**
 * Detect and analyze emerging techniques
 */
export async function detectEmergingTechnique(
  techniqueName: string,
  instructorName: string | null,
  uploadDate: Date | null
): Promise<EmergingAnalysis> {
  
  try {
    // Check if technique is in emerging techniques table
    const emergingRecords = await db.select()
      .from(emergingTechniques)
      .where(eq(emergingTechniques.techniqueName, techniqueName))
      .limit(1);

    if (emergingRecords.length === 0) {
      // Not tracked as emerging - could be new discovery
      return analyzeNewTechnique(techniqueName, instructorName, uploadDate);
    }

    const emerging = emergingRecords[0];
    const reasonsGood: string[] = [];
    let emergingBoost = 0;

    // Validate emerging technique
    if (emerging.status === 'monitoring') {
      emergingBoost = 15;
      reasonsGood.push(`Emerging technique under monitoring (${emerging.videoCount} videos detected)`);
    } else if (emerging.status === 'validated') {
      emergingBoost = 20;
      reasonsGood.push(`Validated emerging technique - adds cutting-edge content`);
    }

    // High confidence = more valuable
    const confidenceScore = emerging.confidenceScore || 50;
    if (confidenceScore > 70) {
      emergingBoost += 5;
      reasonsGood.push(`High confidence emerging technique (${confidenceScore}%)`);
    }

    return {
      isEmergingTechnique: true,
      confidenceScore,
      emergingBoost,
      status: emerging.status || 'monitoring',
      reasonsGood
    };

  } catch (error) {
    console.error('[DIMENSION 7] Error detecting emerging technique:', error);
    return {
      isEmergingTechnique: false,
      confidenceScore: 0,
      emergingBoost: 0,
      status: 'unknown',
      reasonsGood: []
    };
  }
}

/**
 * Analyze potential new emerging technique
 */
async function analyzeNewTechnique(
  techniqueName: string,
  instructorName: string | null,
  uploadDate: Date | null
): Promise<EmergingAnalysis> {
  
  const reasonsGood: string[] = [];
  let confidenceScore = 40;
  let emergingBoost = 0;

  // Recent upload = more likely to be emerging
  if (uploadDate) {
    const monthsAgo = (Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsAgo < 6) {
      confidenceScore += 20;
      reasonsGood.push('Recent upload - may be emerging technique');
    }
  }

  // Elite instructor teaching new technique = strong signal
  if (instructorName) {
    const eliteInstructors = ['Gordon Ryan', 'Lachlan Giles', 'John Danaher', 'Craig Jones'];
    if (eliteInstructors.some(name => instructorName.includes(name))) {
      confidenceScore += 30;
      emergingBoost = 15;
      reasonsGood.push('Elite instructor teaching potential new technique');
    }
  }

  // Check for emerging keywords in technique name
  const emergingKeywords = ['new', 'modern', 'latest', '2024', '2025', 'innovation'];
  if (emergingKeywords.some(kw => techniqueName.toLowerCase().includes(kw))) {
    confidenceScore += 10;
    reasonsGood.push('Technique name suggests innovation');
  }

  const isEmergingTechnique = confidenceScore >= 60;

  // Track if confidence is high
  if (isEmergingTechnique) {
    await addEmergingTechnique(techniqueName);
  }

  return {
    isEmergingTechnique,
    confidenceScore,
    emergingBoost,
    status: isEmergingTechnique ? 'monitoring' : 'unknown',
    reasonsGood
  };
}

/**
 * Add technique to emerging techniques tracking
 */
async function addEmergingTechnique(techniqueName: string): Promise<void> {
  try {
    await db.insert(emergingTechniques)
      .values({
        techniqueName,
        videoCount: 1,
        instructorCount: 1,
        status: 'monitoring',
        confidenceScore: 60
      })
      .onConflictDoUpdate({
        target: emergingTechniques.techniqueName,
        set: {
          videoCount: sql`${emergingTechniques.videoCount} + 1`,
          updatedAt: sql`NOW()`
        }
      });
  } catch (error) {
    console.error('[DIMENSION 7] Error adding emerging technique:', error);
  }
}
