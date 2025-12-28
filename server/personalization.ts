/**
 * Ultimate BJJ Personalization System
 * Calculates derived metrics from onboarding data
 */

interface OnboardingData {
  age: string; // "16-20", "21-30", "31-40", "41-50", "51-60", "61+", "prefer-not-to-say"
  trainingFrequency: number; // 1-2, 3-4, 5-6, 7+
  struggles: string[];
  strengths: string[];
  trainingContext: string; // "gi", "nogi", "both", "mma"
}

interface DerivedMetrics {
  struggleDensity: number;
  injuryRisk: string;
  experienceScore: number;
  learningVelocity: string;
  bodyTypeInferred: string;
  userState: string;
  clusterAssignment: string;
  clusterConfidence: number;
}

/**
 * Calculate struggle density score (0-1)
 */
export function calculateStruggleDensity(struggles: string[]): number {
  const totalOptions = 9; // Total struggle options in onboarding
  return struggles.length / totalOptions;
}

/**
 * Determine user state based on struggle density
 */
export function determineUserState(struggleDensity: number): string {
  if (struggleDensity >= 0.67) return "OVERWHELMED";
  if (struggleDensity >= 0.33) return "DEVELOPING";
  if (struggleDensity > 0) return "FOCUSED";
  return "CONFIDENT";
}

/**
 * Parse age range to get minimum age for calculations
 */
function getAgeValue(ageRange: string): number {
  const ageMap: Record<string, number> = {
    "16-20": 18,
    "21-30": 25,
    "31-40": 35,
    "41-50": 45,
    "51-60": 55,
    "61+": 65,
    "prefer-not-to-say": 35, // Default to middle age
  };
  return ageMap[ageRange] || 35;
}

/**
 * Calculate injury risk score
 */
export function calculateInjuryRisk(age: string, trainingFrequency: number): string {
  const ageValue = getAgeValue(age);
  
  if (ageValue >= 50 && trainingFrequency >= 4) return "VERY_HIGH";
  if (ageValue >= 40 && trainingFrequency >= 5) return "HIGH";
  if (ageValue >= 35 && trainingFrequency >= 6) return "MODERATE_HIGH";
  if (ageValue >= 30) return "MODERATE";
  return "LOW";
}

/**
 * Infer experience score (0-100) from training data
 */
export function inferExperienceScore(trainingFrequency: number, struggles: string[]): number {
  let score = 50; // Start at intermediate
  
  // Beginner indicators
  if (struggles.includes("surviving")) score -= 20;
  if (struggles.includes("everything")) score -= 20;
  if (trainingFrequency <= 2) score -= 15;
  
  // Advanced indicators
  if (struggles.length <= 2) score += 15;
  if (!struggles.includes("surviving") && !struggles.includes("everything")) score += 10;
  if (trainingFrequency >= 5) score += 15;
  
  // Intermediate indicators
  if (struggles.includes("passing") || struggles.includes("finishing")) score += 5;
  if (struggles.includes("retention")) score += 5;
  if (trainingFrequency === 3 || trainingFrequency === 4) score += 5;
  
  // Clamp between 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate learning velocity
 */
export function calculateLearningVelocity(trainingFrequency: number, experienceScore: number): string {
  if (trainingFrequency >= 5 && experienceScore >= 70) return "FAST_ADVANCED";
  if (trainingFrequency >= 5 && experienceScore < 50) return "FAST";
  if (trainingFrequency <= 2 && experienceScore >= 50) return "SLOW_EXPERIENCED";
  if (trainingFrequency <= 2 && experienceScore < 30) return "SLOW_BEGINNER";
  return "MEDIUM";
}

/**
 * Infer body type from struggles
 */
export function inferBodyType(struggles: string[]): string {
  if (struggles.includes("bigger/stronger opponents")) return "SMALLER";
  if (struggles.includes("using my size")) return "LARGER";
  return "AVERAGE_OR_UNKNOWN";
}

/**
 * Assign user to a cluster/archetype
 */
export function assignCluster(data: OnboardingData, metrics: Partial<DerivedMetrics>): {
  cluster: string;
  confidence: number;
} {
  const { trainingFrequency, struggles, trainingContext } = data;
  const { experienceScore, struggleDensity } = metrics;
  
  let bestCluster = "CASUAL_ENJOYER";
  let confidence = 0.5;
  
  // SURVIVAL BEGINNER
  if (
    trainingFrequency <= 2 &&
    (struggles.includes("surviving") || struggles.includes("everything") || struggles.includes("cardio"))
  ) {
    bestCluster = "SURVIVAL_BEGINNER";
    confidence = 0.85;
  }
  
  // COMPETITOR IN TRAINING
  else if (
    trainingFrequency >= 5 &&
    (struggles.includes("passing") || struggles.includes("finishing")) &&
    (trainingContext === "both" || trainingContext === "nogi")
  ) {
    bestCluster = "COMPETITOR";
    confidence = 0.80;
  }
  
  // TECHNICAL STUDENT
  else if (
    (trainingFrequency === 3 || trainingFrequency === 4) &&
    (struggles.includes("passing") || struggles.includes("retention")) &&
    trainingContext === "gi"
  ) {
    bestCluster = "TECHNICAL_STUDENT";
    confidence = 0.75;
  }
  
  // ATHLETIC GRAPPLER
  else if (
    trainingFrequency >= 4 &&
    (struggles.includes("finishing") || struggles.includes("cardio")) &&
    (trainingContext === "nogi" || trainingContext === "mma")
  ) {
    bestCluster = "ATHLETIC_GRAPPLER";
    confidence = 0.75;
  }
  
  // OVERWHELMED IMPROVER
  else if ((struggleDensity || 0) >= 0.33 && trainingFrequency >= 3) {
    bestCluster = "OVERWHELMED_IMPROVER";
    confidence = 0.70;
  }
  
  // CASUAL ENJOYER (default)
  else if (trainingFrequency <= 2 && struggles.length <= 2) {
    bestCluster = "CASUAL_ENJOYER";
    confidence = 0.70;
  }
  
  return { cluster: bestCluster, confidence };
}

/**
 * Normalize user inputs before metric calculation
 */
function normalizeInputs(data: OnboardingData): OnboardingData {
  // Normalize struggles: "none" or "nothing" means empty array
  const normalizedStruggles = data.struggles.includes("none") || data.struggles.includes("nothing") 
    ? [] 
    : data.struggles.filter(s => s !== "none" && s !== "nothing");
  
  // Normalize strengths: "nothing" means empty array
  const normalizedStrengths = data.strengths.includes("nothing")
    ? []
    : data.strengths.filter(s => s !== "nothing");
  
  return {
    ...data,
    struggles: normalizedStruggles,
    strengths: normalizedStrengths,
  };
}

/**
 * Main function: Calculate all derived metrics from onboarding data
 */
export function calculatePersonalizationMetrics(data: OnboardingData): DerivedMetrics {
  // Normalize inputs first
  const normalized = normalizeInputs(data);
  
  const struggleDensity = calculateStruggleDensity(normalized.struggles);
  const injuryRisk = calculateInjuryRisk(normalized.age, normalized.trainingFrequency);
  const experienceScore = inferExperienceScore(normalized.trainingFrequency, normalized.struggles);
  const learningVelocity = calculateLearningVelocity(normalized.trainingFrequency, experienceScore);
  const bodyTypeInferred = inferBodyType(normalized.struggles);
  const userState = determineUserState(struggleDensity);
  
  const { cluster, confidence } = assignCluster(normalized, {
    experienceScore,
    struggleDensity,
  });
  
  return {
    struggleDensity,
    injuryRisk,
    experienceScore,
    learningVelocity,
    bodyTypeInferred,
    userState,
    clusterAssignment: cluster,
    clusterConfidence: confidence,
  };
}

/**
 * Get user profile context for AI agents
 */
export function getUserProfileContext(user: any) {
  return {
    // Explicit data
    age: user.ageRange,
    trainingFrequency: user.trainingFrequency,
    struggles: user.struggles || [],
    strengths: user.strengths || [],
    trainingContext: user.trainingContext,
    beltLevel: user.beltLevel,
    
    // Derived metrics
    injuryRisk: user.injuryRisk,
    experienceScore: user.experienceScore,
    struggleDensity: user.struggleDensity,
    learningVelocity: user.learningVelocity,
    userState: user.userState,
    bodyTypeInferred: user.bodyTypeInferred,
    cluster: user.clusterAssignment,
    clusterConfidence: user.clusterConfidence,
    
    // Existing profile data
    preferredLanguage: user.preferredLanguage,
    contentPreference: user.contentPreference,
    progressionLevel: user.progressionLevel,
  };
}
