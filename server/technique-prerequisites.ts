/**
 * Technique Prerequisites & Safety System
 * Ensures users receive techniques in proper progression order
 * and filters out dangerous content for lower belts
 */

// Technique prerequisite map
export const TECHNIQUE_PREREQUISITES: Record<string, string[]> = {
  // Advanced guard techniques
  "berimbolo": ["de_la_riva_guard", "inversion", "back_takes"],
  "k_guard": ["open_guard", "leg_entanglements", "off_balancing"],
  "reverse_de_la_riva": ["de_la_riva_guard", "open_guard_retention"],
  "worm_guard": ["lapel_guards", "de_la_riva_guard"],
  "lasso_guard": ["spider_guard", "open_guard_basics"],
  
  // Advanced submissions
  "heel_hook": ["basic_leg_positioning", "ashi_garami", "safety_fundamentals"],
  "toe_hold": ["leg_lock_basics", "ashi_garami"],
  "calf_slicer": ["leg_lock_basics", "knee_bar"],
  "bicep_slicer": ["kimura", "arm_attacks"],
  "kneebar": ["leg_lock_basics", "basic_leg_positioning"],
  "straight_ankle_lock": ["leg_lock_basics", "safety_fundamentals"],
  
  // Triangle variations
  "inverted_triangle": ["basic_triangle", "angle_control", "hip_positioning"],
  "mounted_triangle": ["mount_maintenance", "basic_triangle"],
  "reverse_triangle": ["basic_triangle", "body_triangle"],
  
  // Advanced positions
  "truck_position": ["back_control", "leg_entanglements"],
  "crucifix": ["back_control", "arm_control"],
  "body_triangle": ["back_control", "leg_positioning"],
  "twister": ["truck_position", "back_control"],
  
  // Advanced sweeps
  "kiss_of_the_dragon": ["granby_roll", "inversion", "back_takes"],
  "x_guard_sweep": ["x_guard", "off_balancing"],
  
  // Advanced passes
  "cartwheel_pass": ["basic_passing", "leg_drag"],
  "headquarters_pass": ["knee_slice", "pressure_passing"],
  "floating_pass": ["basic_passing", "top_control"],
};

// Technique categories
export const TECHNIQUE_CATEGORIES = {
  SUBMISSIONS: 'submissions',
  GUARD: 'guard',
  PASSING: 'passing',
  SWEEPS: 'sweeps',
  ESCAPES: 'escapes',
  TAKEDOWNS: 'takedowns',
  POSITIONS: 'positions'
} as const;

/**
 * Safety Layer - Auto-reject dangerous content
 */
export interface SafetyResult {
  isSafe: boolean;
  safetyScore: number; // 0-10
  concerns: string[];
  beltRestrictions?: string[];
}

const DANGEROUS_KEYWORDS = [
  { pattern: /crank\s+(the\s+)?neck/i, concern: 'Neck cranking without safety emphasis', minBelt: 'purple' },
  { pattern: /rip\s+(the\s+)?arm/i, concern: 'Excessive force without control', minBelt: 'blue' },
  { pattern: /heel\s+hook/i, concern: 'Heel hook (white/blue belt restricted)', minBelt: 'purple' },
  { pattern: /reap(ing)?/i, concern: 'Reaping (white belt restricted)', minBelt: 'blue' },
  { pattern: /twister/i, concern: 'Twister (neck/spine submission)', minBelt: 'brown' },
  { pattern: /can\s+opener/i, concern: 'Can opener (neck crank)', minBelt: 'blue' },
  { pattern: /spine\s+lock/i, concern: 'Spinal lock', minBelt: 'black' },
  { pattern: /extreme\s+flexibility/i, concern: 'Requires extreme flexibility', minBelt: 'blue' },
  { pattern: /toe\s+hold/i, concern: 'Toe hold (lower belt restricted)', minBelt: 'blue' },
  { pattern: /calf\s+(slicer|crusher)/i, concern: 'Calf slicer', minBelt: 'brown' },
];

export function checkSafety(
  title: string,
  description: string,
  transcript: string,
  userBeltLevel?: string
): SafetyResult {
  const concerns: string[] = [];
  const beltRestrictions: string[] = [];
  const combinedText = `${title} ${description} ${transcript}`.toLowerCase();
  
  let safetyScore = 10; // Start with perfect score
  
  // Check for dangerous keywords
  for (const danger of DANGEROUS_KEYWORDS) {
    if (danger.pattern.test(combinedText)) {
      concerns.push(danger.concern);
      safetyScore -= 3;
      
      // Check belt restrictions
      if (userBeltLevel && !isBeltSufficient(userBeltLevel, danger.minBelt)) {
        beltRestrictions.push(`${danger.concern} - Requires ${danger.minBelt} belt minimum`);
        safetyScore -= 5;
      }
    }
  }
  
  // Clamp score to 0-10
  safetyScore = Math.max(0, Math.min(10, safetyScore));
  
  return {
    isSafe: safetyScore >= 8 && beltRestrictions.length === 0,
    safetyScore,
    concerns,
    beltRestrictions
  };
}

/**
 * Check if user has received prerequisite techniques
 */
export function checkPrerequisites(
  technique: string,
  userTechniqueHistory: string[] = [],
  daysSinceStart: number = 0
): { hasPrerequisites: boolean; missing: string[] } {
  
  const normalizedTechnique = technique.toLowerCase().replace(/\s+/g, '_');
  const prerequisites = TECHNIQUE_PREREQUISITES[normalizedTechnique] || [];
  
  if (prerequisites.length === 0) {
    return { hasPrerequisites: true, missing: [] };
  }
  
  const normalizedHistory = userTechniqueHistory.map(t => 
    t.toLowerCase().replace(/\s+/g, '_')
  );
  
  const missing = prerequisites.filter(prereq => !normalizedHistory.includes(prereq));
  
  return {
    hasPrerequisites: missing.length === 0,
    missing
  };
}

/**
 * Belt level comparison
 */
const BELT_LEVELS: Record<string, number> = {
  'white': 1,
  'blue': 2,
  'purple': 3,
  'brown': 4,
  'black': 5
};

function isBeltSufficient(userBelt: string, requiredBelt: string): boolean {
  const userLevel = BELT_LEVELS[userBelt.toLowerCase()] || 0;
  const requiredLevel = BELT_LEVELS[requiredBelt.toLowerCase()] || 0;
  return userLevel >= requiredLevel;
}

/**
 * Categorize technique from name/description
 */
export function categorizeTechnique(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  
  if (/(armbar|triangle|choke|kimura|guillotine|heel hook|ankle lock|submission)/i.test(text)) {
    return TECHNIQUE_CATEGORIES.SUBMISSIONS;
  }
  if (/(guard|retention|recovery|closed guard|open guard|de la riva|spider)/i.test(text)) {
    return TECHNIQUE_CATEGORIES.GUARD;
  }
  if (/(pass|passing|knee slice|leg drag|toreando)/i.test(text)) {
    return TECHNIQUE_CATEGORIES.PASSING;
  }
  if (/(sweep|sweeping|scissor sweep|butterfly sweep)/i.test(text)) {
    return TECHNIQUE_CATEGORIES.SWEEPS;
  }
  if (/(escape|escaping|mount escape|side control escape)/i.test(text)) {
    return TECHNIQUE_CATEGORIES.ESCAPES;
  }
  if (/(takedown|throw|wrestling|judo|double leg|single leg)/i.test(text)) {
    return TECHNIQUE_CATEGORIES.TAKEDOWNS;
  }
  if (/(mount|side control|back control|position|knee on belly)/i.test(text)) {
    return TECHNIQUE_CATEGORIES.POSITIONS;
  }
  
  return 'general';
}

/**
 * Weekly Diversity Check
 * Ensures balanced technique distribution
 */
export interface WeeklyDistribution {
  submissions: number;
  guard: number;
  passing: number;
  sweeps: number;
  escapes: number;
  takedowns: number;
  positions: number;
}

const WEEKLY_TARGETS: WeeklyDistribution = {
  submissions: 2,
  guard: 2,
  passing: 1,
  sweeps: 1,
  escapes: 1,
  takedowns: 1,
  positions: 1
};

export function checkWeeklyDiversity(
  recentCategories: string[], // Last 7 days
  newCategory: string
): { allowed: boolean; reason?: string } {
  
  // Count current distribution
  const distribution: WeeklyDistribution = {
    submissions: 0,
    guard: 0,
    passing: 0,
    sweeps: 0,
    escapes: 0,
    takedowns: 0,
    positions: 0
  };
  
  for (const cat of recentCategories) {
    if (cat in distribution) {
      distribution[cat as keyof WeeklyDistribution]++;
    }
  }
  
  // Check if new category would exceed target
  const newCat = newCategory as keyof WeeklyDistribution;
  if (newCat in WEEKLY_TARGETS) {
    const currentCount = distribution[newCat] || 0;
    const target = WEEKLY_TARGETS[newCat];
    
    if (currentCount >= target) {
      return {
        allowed: false,
        reason: `Already sent ${currentCount}/${target} ${newCategory} this week`
      };
    }
  }
  
  // Check for same category 3 days in a row
  if (recentCategories.length >= 2) {
    const last2 = recentCategories.slice(-2);
    if (last2.every(cat => cat === newCategory)) {
      return {
        allowed: false,
        reason: `Same category (${newCategory}) 3 days in a row`
      };
    }
  }
  
  return { allowed: true };
}
