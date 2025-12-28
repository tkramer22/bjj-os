/**
 * Instructor Priority Auto-Calculation System
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Calculates instructor recommendation priority using a 100-point weighted system:
 * - YouTube Subscribers: 30 points max
 * - Achievements: 25 points max
 * - Instructional Series: 20 points max
 * - User Feedback: 25 points max
 * 
 * Total = 100 points
 */

import type { InstructorCredibility } from "@shared/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// SCORING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate YouTube subscriber score (30 points max)
 */
export function calculateYouTubeScore(subscribers: number): number {
  if (subscribers >= 1_000_000) return 30;
  if (subscribers >= 500_000) return 20;
  if (subscribers >= 100_000) return 10;
  if (subscribers >= 10_000) return 5;
  return 0;
}

/**
 * Calculate achievements score (25 points max)
 * Analyzes achievements JSONB array for championship titles
 */
export function calculateAchievementsScore(achievements: string[]): number {
  if (!achievements || achievements.length === 0) return 0;

  const achievementText = achievements.join(' ').toLowerCase();

  // TIER 1: Elite Championships (25 points)
  const eliteKeywords = [
    'ibjjf world champion',
    'ibjjf pan champion',
    'adcc champion',
    'world champion',
    'pan champion',
    'adcc gold',
  ];
  if (eliteKeywords.some(keyword => achievementText.includes(keyword))) {
    return 25;
  }

  // TIER 2: Notable Medals (15 points)
  const notableKeywords = [
    'ibjjf',
    'adcc',
    'world',
    'pan',
    'european',
    'asian',
    'brazilian nationals',
    'medalist',
    'silver',
    'bronze',
  ];
  if (notableKeywords.some(keyword => achievementText.includes(keyword))) {
    return 15;
  }

  // TIER 3: Competitive Record (5 points)
  const competitiveKeywords = [
    'competitor',
    'champion',
    'tournament',
    'competition',
    'medal',
  ];
  if (competitiveKeywords.some(keyword => achievementText.includes(keyword))) {
    return 5;
  }

  return 0;
}

/**
 * Calculate instructional series score (20 points max)
 * Analyzes instructional_platforms JSONB array
 */
export function calculateInstructionalScore(
  hasInstructionalSeries: boolean,
  platforms: string[]
): number {
  if (!hasInstructionalSeries) return 0;
  if (!platforms || platforms.length === 0) return 0;

  const platformText = platforms.join(' ').toLowerCase();

  // TIER 1: Major Platforms (20 points)
  const majorPlatforms = [
    'bjj fanatics',
    'grapplers guide',
    'digitsu',
    'jiu jitsu x',
  ];
  if (majorPlatforms.some(platform => platformText.includes(platform))) {
    return 20;
  }

  // TIER 2: Other Platforms (10 points)
  return 10;
}

/**
 * Calculate user feedback score (25 points max)
 * Uses helpful_ratio from instructor table
 */
export function calculateFeedbackScore(helpfulRatio: number): number {
  if (helpfulRatio >= 80) return 25;
  if (helpfulRatio >= 60) return 15;
  if (helpfulRatio >= 40) return 5;
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CALCULATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export interface PriorityCalculationResult {
  totalScore: number;
  breakdown: {
    youtube: number;
    achievements: number;
    instructionals: number;
    feedback: number;
  };
}

/**
 * Calculate total instructor priority score
 * Returns 0-100 score based on weighted formula
 */
export function calculateInstructorPriority(
  instructor: InstructorCredibility
): PriorityCalculationResult {
  const youtubeScore = calculateYouTubeScore(instructor.youtubeSubscribers || 0);
  
  const achievementsScore = calculateAchievementsScore(
    Array.isArray(instructor.achievements) ? instructor.achievements : []
  );
  
  const instructionalsScore = calculateInstructionalScore(
    instructor.hasInstructionalSeries || false,
    Array.isArray(instructor.instructionalPlatforms) ? instructor.instructionalPlatforms : []
  );
  
  const feedbackScore = calculateFeedbackScore(
    parseFloat(instructor.helpfulRatio?.toString() || '0')
  );

  const totalScore = youtubeScore + achievementsScore + instructionalsScore + feedbackScore;

  return {
    totalScore,
    breakdown: {
      youtube: youtubeScore,
      achievements: achievementsScore,
      instructionals: instructionalsScore,
      feedback: feedbackScore,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRIORITY MODE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the effective priority based on mode (auto vs manual)
 */
export function getEffectivePriority(instructor: InstructorCredibility): number {
  if (instructor.priorityMode === 'manual' && instructor.manualOverridePriority !== null) {
    return instructor.manualOverridePriority;
  }
  return instructor.autoCalculatedPriority || 0;
}

/**
 * Determine if instructor meets quality threshold
 * Used during video curation to filter out low-quality content
 */
export function meetsQualityThreshold(
  videoQualityScore: number,
  instructorThreshold: number
): boolean {
  return videoQualityScore >= instructorThreshold;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Recalculate priority for a single instructor
 * Updates database with new auto-calculated score
 */
export async function recalculateInstructorPriority(
  instructor: InstructorCredibility
): Promise<InstructorCredibility> {
  const { db } = await import("../db");
  const { instructorCredibility } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  
  // Calculate new priority
  const calculation = calculateInstructorPriority(instructor);
  
  // Update database with new auto-calculated score
  // If in auto mode, also update recommendationPriority
  const updates: any = {
    autoCalculatedPriority: calculation.totalScore,
    lastAutoCalculation: new Date(),
    updatedAt: new Date(),
  };
  
  // If in auto mode, update the effective priority too
  if (instructor.priorityMode === 'auto') {
    updates.recommendationPriority = calculation.totalScore;
  }
  
  const [updated] = await db
    .update(instructorCredibility)
    .set(updates)
    .where(eq(instructorCredibility.id, instructor.id))
    .returning();
  
  return updated;
}

/**
 * Recalculate priorities for ALL instructors
 * Used by nightly cron job
 * Returns stats about the batch operation
 */
export async function recalculateAllInstructorPriorities(): Promise<{
  updated: number;
  failed: number;
  errors: Array<{ name: string; error: string }>;
}> {
  const { db } = await import("../db");
  const { instructorCredibility } = await import("@shared/schema");
  
  // Fetch all instructors
  const instructors = await db.select().from(instructorCredibility);
  
  let updated = 0;
  let failed = 0;
  const errors: Array<{ name: string; error: string }> = [];
  
  // Recalculate each instructor
  for (const instructor of instructors) {
    try {
      await recalculateInstructorPriority(instructor);
      updated++;
    } catch (error: any) {
      failed++;
      errors.push({
        name: instructor.name,
        error: error.message,
      });
      console.error(`Failed to recalculate priority for ${instructor.name}:`, error);
    }
  }
  
  console.log(`✅ Batch priority recalculation complete: ${updated} updated, ${failed} failed`);
  
  return { updated, failed, errors };
}
