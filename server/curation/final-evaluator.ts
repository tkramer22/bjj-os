/**
 * FINAL EVALUATOR - 7-Dimensional Curation Algorithm
 * Combines all 7 dimensions into unified scoring and decision-making
 */

import { evaluateInstructorAuthority } from './dimension-1-instructor';
import { mapToTaxonomy } from './dimension-2-taxonomy';
import { analyzeCoverageGap, updateCoverageAfterAdd } from './dimension-3-coverage';
import { assessUniqueValue } from './dimension-4-uniqueness';
import { analyzeUserValue } from './dimension-5-uservalue';
import { analyzeBeltLevelFit } from './dimension-6-beltlevel';
import { detectEmergingTechnique } from './dimension-7-emerging';

export interface VideoEvaluationInput {
  youtubeId: string;
  title: string;
  techniqueName: string;
  instructorName: string | null;
  channelId: string | null;
  difficultyScore: number | null;
  beltLevels: string[] | null;
  keyDetails: any;
  uploadDate: Date | null;
  giOrNogi?: string;
  category?: string;
}

export interface VideoEvaluationResult {
  decision: 'ACCEPT' | 'REJECT';
  finalScore: number; // 0-100
  acceptanceReason: string;
  dimensionScores: {
    instructorAuthority: number;
    taxonomyMapping: number;
    coverageBalance: number;
    uniqueValue: number;
    userFeedback: number;
    beltLevelFit: number;
    emergingDetection: number;
  };
  metadata: {
    tier: string;
    autoAccept: boolean;
    uniqueValueReason: string | null;
    goodBecause: string[];
    badBecause: string[];
    boostsApplied: string[];
  };
}

/**
 * MAIN EVALUATION FUNCTION
 * Runs all 7 dimensions and produces final decision
 */
export async function evaluate7Dimensions(
  video: VideoEvaluationInput,
  existingVideoId?: number
): Promise<VideoEvaluationResult> {
  
  console.log(`\n🔍 [7D EVALUATOR] Evaluating: "${video.title}"`);
  console.log(`   Technique: ${video.techniqueName} | Instructor: ${video.instructorName || 'Unknown'}`);

  // ═══════════════════════════════════════════════════════════════
  // DIMENSION 1: Instructor Authority
  // ═══════════════════════════════════════════════════════════════
  const instructorEval = await evaluateInstructorAuthority(
    video.instructorName,
    video.channelId,
    video.title // Pass title to extract instructor names
  );
  
  console.log(`   [D1] Instructor: ${instructorEval.tier} (${instructorEval.credibilityScore}/100)`);
  
  // Note: Elite instructors still go through all 7 dimensions (Stage 4 QC requirement)
  // They receive heavy boosts but must pass quality checks

  // ═══════════════════════════════════════════════════════════════
  // DIMENSION 2: Taxonomy Mapping
  // ═══════════════════════════════════════════════════════════════
  const taxonomyMapping = await mapToTaxonomy(
    video.techniqueName,
    video.category,
    video.giOrNogi
  );
  
  console.log(`   [D2] Taxonomy: ${taxonomyMapping.techniqueFound ? 'Found' : 'Not found'} (${taxonomyMapping.taxonomyScore}/100)`);

  // ═══════════════════════════════════════════════════════════════
  // DIMENSION 3: Coverage Balance
  // ═══════════════════════════════════════════════════════════════
  const coverageAnalysis = await analyzeCoverageGap(
    video.techniqueName,
    getDifficultyLevel(video.difficultyScore)
  );
  
  console.log(`   [D3] Coverage: ${coverageAnalysis.currentCount}/${coverageAnalysis.targetCount} (+${coverageAnalysis.gapBoost} boost)`);

  // ═══════════════════════════════════════════════════════════════
  // DIMENSION 4: Unique Value
  // ═══════════════════════════════════════════════════════════════
  const uniquenessAnalysis = await assessUniqueValue(
    video.youtubeId,
    video.techniqueName,
    video.title,
    video.keyDetails,
    video.instructorName || undefined
  );
  
  console.log(`   [D4] Uniqueness: ${uniquenessAnalysis.shouldAdd ? 'PASS' : 'FAIL'} (${uniquenessAnalysis.uniqueScore}/100)`);

  // REJECT if duplicate
  if (!uniquenessAnalysis.shouldAdd) {
    console.log(`   ❌ REJECTED: ${uniquenessAnalysis.reasonsBad[0]}`);
    return {
      decision: 'REJECT',
      finalScore: uniquenessAnalysis.uniqueScore,
      acceptanceReason: uniquenessAnalysis.reasonsBad[0] || 'Does not add unique value',
      dimensionScores: {
        instructorAuthority: instructorEval.credibilityScore,
        taxonomyMapping: taxonomyMapping.taxonomyScore,
        coverageBalance: 0,
        uniqueValue: uniquenessAnalysis.uniqueScore,
        userFeedback: 50,
        beltLevelFit: 70,
        emergingDetection: 0
      },
      metadata: {
        tier: instructorEval.tier,
        autoAccept: false,
        uniqueValueReason: null,
        goodBecause: [],
        badBecause: uniquenessAnalysis.reasonsBad,
        boostsApplied: []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // DIMENSION 5: User Feedback (for existing videos only)
  // ═══════════════════════════════════════════════════════════════
  let userValueAnalysis = {
    feedbackScore: 50,
    hasPerformanceData: false,
    performanceBoost: 0,
    reasonsGood: []
  };
  
  if (existingVideoId) {
    userValueAnalysis = await analyzeUserValue(existingVideoId);
    console.log(`   [D5] User Value: ${userValueAnalysis.feedbackScore}/100 (+${userValueAnalysis.performanceBoost} boost)`);
  }

  // ═══════════════════════════════════════════════════════════════
  // DIMENSION 6: Belt-Level Appropriateness
  // ═══════════════════════════════════════════════════════════════
  const beltLevelAnalysis = analyzeBeltLevelFit(
    video.difficultyScore,
    video.beltLevels,
    video.keyDetails
  );
  
  console.log(`   [D6] Belt Level: ${beltLevelAnalysis.targetLevels.join(', ')} (${beltLevelAnalysis.appropriatenessScore}/100)`);

  // ═══════════════════════════════════════════════════════════════
  // DIMENSION 7: Emerging Technique Detection
  // ═══════════════════════════════════════════════════════════════
  const emergingAnalysis = await detectEmergingTechnique(
    video.techniqueName,
    video.instructorName,
    video.uploadDate
  );
  
  console.log(`   [D7] Emerging: ${emergingAnalysis.isEmergingTechnique ? 'YES' : 'NO'} (+${emergingAnalysis.emergingBoost} boost)`);

  // ═══════════════════════════════════════════════════════════════
  // FINAL SCORE CALCULATION
  // ═══════════════════════════════════════════════════════════════
  
  let finalScore = 0;

  // Weighted base scores (total: 100)
  finalScore += instructorEval.credibilityScore * 0.30; // 30% weight
  finalScore += taxonomyMapping.taxonomyScore * 0.15;   // 15% weight
  finalScore += uniquenessAnalysis.uniqueScore * 0.20;  // 20% weight
  finalScore += userValueAnalysis.feedbackScore * 0.10; // 10% weight
  finalScore += beltLevelAnalysis.appropriatenessScore * 0.15; // 15% weight
  finalScore += (coverageAnalysis.needsMore ? 70 : 50) * 0.10; // 10% weight

  // Apply boosts (can exceed 100)
  const boostsApplied: string[] = [];
  
  if (coverageAnalysis.gapBoost > 0) {
    finalScore += coverageAnalysis.gapBoost;
    boostsApplied.push(`Coverage gap: +${coverageAnalysis.gapBoost}`);
  }
  
  if (emergingAnalysis.emergingBoost > 0) {
    finalScore += emergingAnalysis.emergingBoost;
    boostsApplied.push(`Emerging technique: +${emergingAnalysis.emergingBoost}`);
  }
  
  if (userValueAnalysis.performanceBoost > 0) {
    finalScore += userValueAnalysis.performanceBoost;
    boostsApplied.push(`User feedback: +${userValueAnalysis.performanceBoost}`);
  }
  
  if (beltLevelAnalysis.balanceBoost > 0) {
    finalScore += beltLevelAnalysis.balanceBoost;
    boostsApplied.push(`Belt level balance: +${beltLevelAnalysis.balanceBoost}`);
  }

  // Elite instructor boost (heavy bonus but still requires quality)
  if (instructorEval.tier === 'elite' && instructorEval.autoAccept) {
    const eliteBoost = 25;
    finalScore += eliteBoost;
    boostsApplied.push(`Elite instructor: +${eliteBoost}`);
  }
  
  // Instructor multiplier (additional boost for high-quality instructors)
  if (instructorEval.boostMultiplier > 1.0) {
    const boost = (instructorEval.boostMultiplier - 1.0) * 20;
    finalScore += boost;
    boostsApplied.push(`Instructor reputation: +${boost.toFixed(1)}`);
  }

  finalScore = Math.min(finalScore, 100);

  // Collect reasons (needed early for dimension minimum checks)
  const goodBecause: string[] = [
    ...instructorEval.reasonsGood,
    ...coverageAnalysis.reasonsGood,
    ...uniquenessAnalysis.reasonsGood,
    ...userValueAnalysis.reasonsGood,
    ...beltLevelAnalysis.reasonsGood,
    ...emergingAnalysis.reasonsGood
  ];

  const badBecause: string[] = [
    ...taxonomyMapping.reasonsBad,
    ...uniquenessAnalysis.reasonsBad
  ];

  // ═══════════════════════════════════════════════════════════════
  // DECISION THRESHOLDS: Overall 71/100 + Per-Dimension Minimums
  // ═══════════════════════════════════════════════════════════════
  
  const ACCEPTANCE_THRESHOLD = 71;
  
  // Per-dimension minimum requirements (prevent low-authority spam)
  const MIN_INSTRUCTOR_AUTHORITY = 40; // Balanced threshold: allows quality competitors + coaches
  const MIN_TAXONOMY_MAPPING = 40; // Allow techniques not in taxonomy if other dimensions strong
  
  // Check per-dimension minimums
  const failedMinimums: string[] = [];
  
  if (instructorEval.credibilityScore < MIN_INSTRUCTOR_AUTHORITY) {
    failedMinimums.push(`Instructor credibility too low (${instructorEval.credibilityScore}/${MIN_INSTRUCTOR_AUTHORITY} required)`);
  }
  
  if (taxonomyMapping.taxonomyScore < MIN_TAXONOMY_MAPPING) {
    failedMinimums.push(`Taxonomy mapping too weak (${taxonomyMapping.taxonomyScore}/${MIN_TAXONOMY_MAPPING} required)`);
  }
  
  // REJECT if failed dimension minimums (even with high total score)
  if (failedMinimums.length > 0) {
    badBecause.push(...failedMinimums);
    console.log(`\n   🎯 FINAL SCORE: ${finalScore.toFixed(1)}/100`);
    console.log(`   📌 DECISION: REJECT (failed dimension minimums)`);
    console.log(`   ❌ ${failedMinimums.join(', ')}\n`);
    
    return {
      decision: 'REJECT',
      finalScore: Number(finalScore.toFixed(1)),
      acceptanceReason: failedMinimums[0] || 'Failed dimension minimums',
      dimensionScores: {
        instructorAuthority: instructorEval.credibilityScore,
        taxonomyMapping: taxonomyMapping.taxonomyScore,
        coverageBalance: Math.round((coverageAnalysis.currentCount / coverageAnalysis.targetCount) * 100),
        uniqueValue: uniquenessAnalysis.uniqueScore,
        userFeedback: userValueAnalysis.feedbackScore,
        beltLevelFit: beltLevelAnalysis.appropriatenessScore,
        emergingDetection: emergingAnalysis.confidenceScore
      },
      metadata: {
        tier: instructorEval.tier,
        autoAccept: false,
        uniqueValueReason: null,
        goodBecause,
        badBecause,
        boostsApplied
      }
    };
  }
  
  const decision: 'ACCEPT' | 'REJECT' = finalScore >= ACCEPTANCE_THRESHOLD ? 'ACCEPT' : 'REJECT';

  if (decision === 'REJECT') {
    badBecause.push(`Score too low: ${finalScore.toFixed(1)}/${ACCEPTANCE_THRESHOLD} required`);
  }

  console.log(`\n   🎯 FINAL SCORE: ${finalScore.toFixed(1)}/100`);
  console.log(`   📌 DECISION: ${decision}`);
  console.log(`   ✨ Boosts: ${boostsApplied.join(', ') || 'None'}\n`);

  // Update coverage if accepted
  if (decision === 'ACCEPT' && existingVideoId) {
    await updateCoverageAfterAdd(video.techniqueName, getDifficultyLevel(video.difficultyScore));
  }

  return {
    decision,
    finalScore: Number(finalScore.toFixed(1)),
    acceptanceReason: decision === 'ACCEPT' 
      ? `Quality score: ${finalScore.toFixed(1)}/100 (${goodBecause.length} positive factors)`
      : badBecause[0] || `Score below threshold (${finalScore.toFixed(1)}/${ACCEPTANCE_THRESHOLD})`,
    dimensionScores: {
      instructorAuthority: instructorEval.credibilityScore,
      taxonomyMapping: taxonomyMapping.taxonomyScore,
      coverageBalance: Math.round((coverageAnalysis.currentCount / coverageAnalysis.targetCount) * 100),
      uniqueValue: uniquenessAnalysis.uniqueScore,
      userFeedback: userValueAnalysis.feedbackScore,
      beltLevelFit: beltLevelAnalysis.appropriatenessScore,
      emergingDetection: emergingAnalysis.confidenceScore
    },
    metadata: {
      tier: instructorEval.tier,
      autoAccept: false,
      uniqueValueReason: uniquenessAnalysis.uniqueValueReason,
      goodBecause,
      badBecause,
      boostsApplied
    }
  };
}

/**
 * Helper: Convert difficulty score to level
 */
function getDifficultyLevel(score: number | null): string {
  if (!score) return 'intermediate';
  if (score <= 3) return 'beginner';
  if (score <= 6) return 'intermediate';
  return 'advanced';
}
