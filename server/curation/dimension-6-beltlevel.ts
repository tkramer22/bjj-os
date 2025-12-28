/**
 * Dimension 6: Belt-Level Appropriateness
 * Ensures library has balanced content for all skill levels
 */

export interface BeltLevelAnalysis {
  appropriatenessScore: number; // 0-100
  targetLevels: string[];
  balanceBoost: number; // 0-10
  reasonsGood: string[];
}

/**
 * Analyze belt-level appropriateness and balance
 */
export function analyzeBeltLevelFit(
  difficultyScore: number | null,
  beltLevels: string[] | null,
  keyDetails: any
): BeltLevelAnalysis {
  
  const reasonsGood: string[] = [];
  let appropriatenessScore = 70;
  let balanceBoost = 0;

  // Extract target belt levels
  const targetLevels: string[] = [];
  
  if (beltLevels && beltLevels.length > 0) {
    targetLevels.push(...beltLevels);
  } else if (difficultyScore !== null) {
    // Map difficulty score to belt levels
    if (difficultyScore <= 3) {
      targetLevels.push('white', 'blue');
      reasonsGood.push('Beginner-friendly content');
      balanceBoost += 5; // Beginner content is always valuable
    } else if (difficultyScore <= 6) {
      targetLevels.push('blue', 'purple');
      reasonsGood.push('Intermediate-level technique');
    } else {
      targetLevels.push('purple', 'brown', 'black');
      reasonsGood.push('Advanced technique for experienced practitioners');
      balanceBoost += 3; // Advanced content adds variety
    }
  }

  // Analyze content characteristics for appropriateness
  if (keyDetails) {
    // Check for fundamentals vs advanced details
    const hasFundamentals = checkForFundamentals(keyDetails);
    const hasAdvancedDetails = checkForAdvancedDetails(keyDetails);

    if (hasFundamentals && targetLevels.includes('white')) {
      appropriatenessScore += 15;
      reasonsGood.push('Covers fundamentals - excellent for beginners');
      balanceBoost += 5;
    }

    if (hasAdvancedDetails && targetLevels.some(l => ['purple', 'brown', 'black'].includes(l))) {
      appropriatenessScore += 10;
      reasonsGood.push('Advanced details for higher belts');
      balanceBoost += 3;
    }

    // Check for progression teaching
    if (keyDetails.prerequisites || keyDetails.progressions_to) {
      appropriatenessScore += 5;
      reasonsGood.push('Shows technique progression path');
    }
  }

  // Multi-level content is valuable
  if (targetLevels.length >= 2) {
    balanceBoost += 2;
    reasonsGood.push(`Appropriate for multiple levels: ${targetLevels.join(', ')}`);
  }

  return {
    appropriatenessScore,
    targetLevels,
    balanceBoost,
    reasonsGood
  };
}

/**
 * Check if content covers fundamentals
 */
function checkForFundamentals(keyDetails: any): boolean {
  const text = JSON.stringify(keyDetails).toLowerCase();
  
  const fundamentalKeywords = [
    'basic',
    'fundamental',
    'foundation',
    'beginner',
    'first',
    'introduction',
    'start',
    'simple'
  ];

  return fundamentalKeywords.some(keyword => text.includes(keyword));
}

/**
 * Check if content has advanced details
 */
function checkForAdvancedDetails(keyDetails: any): boolean {
  const text = JSON.stringify(keyDetails).toLowerCase();
  
  const advancedKeywords = [
    'advanced',
    'complex',
    'subtle',
    'timing',
    'counter',
    'transition',
    'combination',
    'system',
    'strategy'
  ];

  return advancedKeywords.some(keyword => text.includes(keyword));
}
