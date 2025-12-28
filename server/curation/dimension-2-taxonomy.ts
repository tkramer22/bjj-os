/**
 * Dimension 2: Technique Taxonomy Mapping
 * Maps videos to BJJ technique taxonomy and validates categorization
 */

import { db } from '../db';
import { techniqueTaxonomy } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface TaxonomyMapping {
  techniqueFound: boolean;
  techniqueName: string | null;
  category: string | null;
  priority: number;
  targetCount: number;
  difficultyLevel: string | null;
  giApplicability: string | null;
  taxonomyScore: number; // 0-100
  reasonsBad: string[];
}

/**
 * Map video to technique taxonomy and evaluate categorization quality
 */
export async function mapToTaxonomy(
  techniqueName: string,
  detectedCategory?: string,
  giOrNogi?: string
): Promise<TaxonomyMapping> {
  
  try {
    // Normalize technique name
    const normalizedTechnique = normalizeTechniqueName(techniqueName);

    // Look up in taxonomy
    const techniqueRecords = await db.select()
      .from(techniqueTaxonomy)
      .where(eq(techniqueTaxonomy.techniqueName, normalizedTechnique))
      .limit(1);

    if (techniqueRecords.length === 0) {
      // Technique not in taxonomy - check if it's emerging
      return {
        techniqueFound: false,
        techniqueName: normalizedTechnique,
        category: detectedCategory || null,
        priority: 3, // Low priority for unknown techniques
        targetCount: 30,
        difficultyLevel: null,
        giApplicability: null,
        taxonomyScore: 40,
        reasonsBad: ['Technique not in official taxonomy - may be emerging or misidentified']
      };
    }

    const technique = techniqueRecords[0];
    const reasonsBad: string[] = [];
    let taxonomyScore = 85; // Base score for recognized techniques

    // Validate gi/nogi applicability
    if (giOrNogi && technique.giApplicability) {
      if (technique.giApplicability === 'gi_only' && giOrNogi === 'nogi') {
        reasonsBad.push('Video shows no-gi version of gi-only technique');
        taxonomyScore -= 20;
      } else if (technique.giApplicability === 'nogi_only' && giOrNogi === 'gi') {
        reasonsBad.push('Video shows gi version of no-gi-only technique');
        taxonomyScore -= 20;
      }
    }

    // Validate category match
    if (detectedCategory && technique.category && detectedCategory !== technique.category) {
      reasonsBad.push(`Category mismatch: detected as ${detectedCategory}, taxonomy says ${technique.category}`);
      taxonomyScore -= 10;
    }

    return {
      techniqueFound: true,
      techniqueName: technique.techniqueName,
      category: technique.category,
      priority: technique.priority || 5,
      targetCount: technique.targetVideoCount || 50,
      difficultyLevel: technique.difficultyLevel,
      giApplicability: technique.giApplicability,
      taxonomyScore,
      reasonsBad
    };

  } catch (error) {
    console.error('[DIMENSION 2] Error mapping to taxonomy:', error);
    return {
      techniqueFound: false,
      techniqueName: null,
      category: null,
      priority: 1,
      targetCount: 30,
      difficultyLevel: null,
      giApplicability: null,
      taxonomyScore: 30,
      reasonsBad: ['Error processing taxonomy mapping']
    };
  }
}

/**
 * Normalize technique names for consistent matching
 */
function normalizeTechniqueName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_') // Spaces to underscores
    .replace(/[^a-z0-9_]/g, '') // Remove special chars
    .replace(/_+/g, '_'); // Collapse multiple underscores
}

/**
 * Add new technique to taxonomy (for validated emerging techniques)
 */
export async function addToTaxonomy(
  techniqueName: string,
  category: string,
  priority: number = 5,
  targetVideoCount: number = 50,
  difficultyLevel?: string,
  giApplicability?: string
): Promise<number> {
  
  const normalized = normalizeTechniqueName(techniqueName);
  
  const result = await db.insert(techniqueTaxonomy)
    .values({
      techniqueName: normalized,
      category,
      priority,
      targetVideoCount,
      difficultyLevel,
      giApplicability
    })
    .returning({ id: techniqueTaxonomy.id });

  return result[0].id;
}
