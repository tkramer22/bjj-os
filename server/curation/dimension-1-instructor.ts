/**
 * Dimension 1: Instructor Authority Score
 * Evaluates instructor credibility based on competition achievements, tier, and reputation
 */

import { db } from '../db';
import { instructors } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface InstructorEvaluation {
  credibilityScore: number; // 0-100
  tier: 'elite' | 'high_quality' | 'emerging' | 'unknown';
  autoAccept: boolean;
  boostMultiplier: number;
  reasonsGood: string[];
  instructorId?: number;
}

/**
 * Extract instructor names from video title
 * Looks for elite instructor names mentioned in title (e.g., "Gordon Ryan Passing" or "Lachlan Giles | HEEL HOOKS")
 */
function extractInstructorFromTitle(title: string): string | null {
  const eliteNames = [
    'Gordon Ryan', 'John Danaher', 'Lachlan Giles', 'Craig Jones',
    'Mikey Musumeci', 'Rafael Mendes', 'Marcelo Garcia', 'Bernardo Faria',
    'Garry Tonon', 'Eddie Cummings', 'Keenan Cornelius', 'Ryan Hall',
    'Caio Terra', 'Andre Galvao', 'Roger Gracie'
  ];

  const titleLower = title.toLowerCase();
  
  for (const name of eliteNames) {
    if (titleLower.includes(name.toLowerCase())) {
      return name;
    }
  }
  
  return null;
}

/**
 * Evaluate instructor authority and credibility
 */
export async function evaluateInstructorAuthority(
  instructorName: string | null,
  channelId: string | null,
  videoTitle?: string
): Promise<InstructorEvaluation> {
  
  // Default for unknown instructors
  const defaultEval: InstructorEvaluation = {
    credibilityScore: 40,
    tier: 'unknown',
    autoAccept: false,
    boostMultiplier: 1.0,
    reasonsGood: []
  };

  // Try extracting instructor from video title if channel not recognized
  let searchName = instructorName;
  if (videoTitle && !instructorName) {
    const extractedName = extractInstructorFromTitle(videoTitle);
    if (extractedName) {
      searchName = extractedName;
      console.log(`   [D1] Extracted instructor "${extractedName}" from title`);
    }
  }

  if (!searchName && !channelId) {
    return defaultEval;
  }

  try {
    // Look up instructor in database - try both name AND channelId for reliability
    let instructorRecords: any[] = [];
    
    if (searchName) {
      instructorRecords = await db.select()
        .from(instructors)
        .where(eq(instructors.name, searchName))
        .limit(1);
    }
    
    // Fallback to channelId if name lookup failed
    if (instructorRecords.length === 0 && channelId) {
      instructorRecords = await db.select()
        .from(instructors)
        .where(eq(instructors.channelId, channelId))
        .limit(1);
    }

    if (instructorRecords.length === 0) {
      // Unknown instructor - check for emerging patterns
      return await evaluateUnknownInstructor(searchName);
    }

    const instructor = instructorRecords[0];
    const reasonsGood: string[] = [];

    // Elite instructors get special treatment
    if (instructor.tier === 'elite') {
      reasonsGood.push('Elite instructor with proven track record');
      
      if (instructor.adccAchievements && Array.isArray(instructor.adccAchievements) && instructor.adccAchievements.length > 0) {
        reasonsGood.push(`ADCC achievements: ${instructor.adccAchievements.join(', ')}`);
      }
      
      if (instructor.ibjjfAchievements && Array.isArray(instructor.ibjjfAchievements) && instructor.ibjjfAchievements.length > 0) {
        reasonsGood.push(`IBJJF achievements: ${instructor.ibjjfAchievements.join(', ')}`);
      }

      if (instructor.specialties && Array.isArray(instructor.specialties) && instructor.specialties.length > 0) {
        reasonsGood.push(`Specialist in: ${instructor.specialties.join(', ')}`);
      }
    }

    return {
      credibilityScore: instructor.credibilityScore || 40,
      tier: (instructor.tier as any) || 'unknown',
      autoAccept: instructor.autoAccept || false,
      boostMultiplier: Number(instructor.boostMultiplier) || 1.0,
      reasonsGood,
      instructorId: instructor.id
    };

  } catch (error) {
    console.error('[DIMENSION 1] Error evaluating instructor:', error);
    return defaultEval;
  }
}

/**
 * Evaluate unknown instructors based on heuristics
 */
async function evaluateUnknownInstructor(instructorName: string | null): Promise<InstructorEvaluation> {
  if (!instructorName) {
    return {
      credibilityScore: 30,
      tier: 'unknown',
      autoAccept: false,
      boostMultiplier: 1.0,
      reasonsGood: []
    };
  }

  const reasonsGood: string[] = [];
  let credibilityScore = 40;

  // Check for known name patterns that indicate quality
  const lowerName = instructorName.toLowerCase();

  // Known gyms/affiliations in channel name
  const knownGyms = ['gracie', 'atos', 'alliance', 'checkmat', 'unity', 'b-team', 'new wave'];
  if (knownGyms.some(gym => lowerName.includes(gym))) {
    credibilityScore += 10;
    reasonsGood.push('Associated with reputable BJJ gym');
  }

  // Brazilian Portuguese names (common in high-level BJJ)
  const brazilianIndicators = ['da silva', 'dos santos', 'de jesus', 'oliveira', 'mendes', 'ribeiro'];
  if (brazilianIndicators.some(indicator => lowerName.includes(indicator))) {
    credibilityScore += 5;
  }

  return {
    credibilityScore,
    tier: 'unknown',
    autoAccept: false,
    boostMultiplier: 1.0,
    reasonsGood
  };
}

/**
 * Add new instructor to database (for discovered high-quality instructors)
 */
export async function addInstructor(
  name: string,
  channelId: string,
  tier: 'elite' | 'high_quality' | 'emerging',
  credibilityScore: number,
  achievements?: {
    adcc?: string[];
    ibjjf?: string[];
    specialties?: string[];
  }
): Promise<number> {
  
  const result = await db.insert(instructors)
    .values({
      name,
      channelId,
      tier,
      credibilityScore,
      adccAchievements: achievements?.adcc,
      ibjjfAchievements: achievements?.ibjjf,
      specialties: achievements?.specialties
    })
    .returning({ id: instructors.id });

  return result[0].id;
}
