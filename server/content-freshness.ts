/**
 * Content Freshness & Recency Weighting System
 * Prioritizes recent content while preserving classic fundamentals from legends
 */

const LEGENDARY_INSTRUCTORS = [
  'Marcelo Garcia',
  'Roger Gracie',
  'Demian Maia',
  'Rickson Gracie',
  'Saulo Ribeiro',
  'Xande Ribeiro'
];

export interface FreshnessResult {
  bonusPoints: number;
  ageCategory: string;
  reasoning: string;
}

/**
 * Calculate content freshness bonus
 */
export function calculateFreshnessBonus(
  publishedAt: string,
  instructorName: string
): FreshnessResult {
  
  const publishDate = new Date(publishedAt);
  const now = new Date();
  const ageInMonths = (now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
  
  // Check if legendary instructor (fundamentals always fresh)
  const isLegend = LEGENDARY_INSTRUCTORS.some(legend => 
    instructorName.toLowerCase().includes(legend.toLowerCase())
  );
  
  if (isLegend) {
    return {
      bonusPoints: 10,
      ageCategory: 'legendary_fundamental',
      reasoning: `Classic fundamentals from ${instructorName} - timeless value`
    };
  }
  
  // Recency weighting for regular content
  if (ageInMonths <= 3) {
    return {
      bonusPoints: 10,
      ageCategory: 'very_recent',
      reasoning: 'Published within last 3 months - cutting edge content'
    };
  } else if (ageInMonths <= 12) {
    return {
      bonusPoints: 5,
      ageCategory: 'recent',
      reasoning: 'Published within last year - current techniques'
    };
  } else if (ageInMonths <= 24) {
    return {
      bonusPoints: 0,
      ageCategory: 'moderate',
      reasoning: '1-2 years old - still relevant'
    };
  } else {
    return {
      bonusPoints: -5,
      ageCategory: 'dated',
      reasoning: 'Over 2 years old - may contain outdated meta'
    };
  }
}

/**
 * Get age in months from published date
 */
export function getVideoAgeMonths(publishedAt: string): number {
  const publishDate = new Date(publishedAt);
  const now = new Date();
  return (now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
}

/**
 * Check if content is too old for current meta (unless legendary fundamental)
 */
export function isContentRelevant(
  publishedAt: string,
  instructorName: string,
  maxAgeMonths: number = 36
): boolean {
  
  // Legendary instructors' fundamentals are always relevant
  const isLegend = LEGENDARY_INSTRUCTORS.some(legend => 
    instructorName.toLowerCase().includes(legend.toLowerCase())
  );
  
  if (isLegend) return true;
  
  const ageMonths = getVideoAgeMonths(publishedAt);
  return ageMonths <= maxAgeMonths;
}
