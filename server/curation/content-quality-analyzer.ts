/**
 * Content Quality Analyzer
 * Analyzes video title and description for BJJ technique quality indicators
 */

export interface ContentQualityAnalysis {
  score: number; // 0-100
  isInstructional: boolean; // NEW: Is this teaching content?
  contentType: 'instructional' | 'highlight' | 'vlog' | 'qa' | 'other'; // NEW
  hasStepByStep: boolean;
  hasSetupDetails: boolean;
  hasTroubleshooting: boolean;
  hasCommonMistakes: boolean;
  hasCompetitionContext: boolean;
  techniqueDepth: 'basic' | 'intermediate' | 'advanced';
  reasonsGood: string[];
  reasonsBad: string[];
}

/**
 * Analyze content quality from title and description
 * For elite instructors: focuses on INSTRUCTIONAL vs ENTERTAINMENT
 * For unknown instructors: focuses on QUALITY of instruction
 */
export function analyzeContentQuality(
  title: string,
  description: string,
  instructorTier: 'elite' | 'high_quality' | 'unknown' = 'unknown'
): ContentQualityAnalysis {
  
  const combinedText = `${title} ${description}`.toLowerCase();
  
  const reasonsGood: string[] = [];
  const reasonsBad: string[] = [];
  
  // ═══════════════════════════════════════════════════════════
  // INSTRUCTIONAL vs ENTERTAINMENT DETECTION
  // ═══════════════════════════════════════════════════════════
  
  // Highlight reel / competition footage indicators
  // NOTE: "vs" is tricky - could be comparison ("armbar vs triangle - when to use")
  // or competition ("gordon ryan vs felipe pena"). Use context clues.
  const highlightPatterns = [
    'highlights', 'highlight reel', 'being a wizard', 'destroys', 
    'compilation', 'best of', 'greatest', 'top 10', 'full match',
    'rolling with', 'sparring footage'
  ];
  
  // Competition match indicators (need more context than just "vs")
  const isCompetitionMatch = (
    (combinedText.includes(' vs ') || combinedText.includes(' vs.') || combinedText.includes('versus')) &&
    (combinedText.includes('match') || combinedText.includes('championship') || 
     combinedText.includes('tournament') || combinedText.includes('adcc') ||
     combinedText.includes('worlds') || combinedText.includes('finals'))
  );
  
  const isHighlight = highlightPatterns.some(p => combinedText.includes(p)) || isCompetitionMatch;
  
  // Vlog / personal content indicators  
  const vlogPatterns = [
    'vlog', 'day in the life', 'behind the scenes', 'my thoughts on',
    'talking about', 'reaction', 'podcast', 'interview'
  ];
  const isVlog = vlogPatterns.some(p => combinedText.includes(p));
  
  // Q&A / discussion indicators
  const qaPatterns = [
    'q&a', 'q and a', 'ask me', 'answering', 'questions',
    'discussion', 'debate', 'opinion on'
  ];
  const isQA = qaPatterns.some(p => combinedText.includes(p));
  
  // INSTRUCTIONAL indicators (positive signals)
  const instructionalPatterns = [
    'how to', 'tutorial', 'technique', 'breakdown', 'guide',
    'escape', 'submission', 'guard', 'pass', 'sweep', 'choke',
    'armbar', 'kimura', 'triangle', 'details', 'setup',
    'step by step', 'instruction', 'teaching', 'drill',
    'position', 'control', 'defense', 'attack', 'entry'
  ];
  const hasInstructionalSignals = instructionalPatterns.some(p => combinedText.includes(p));
  
  // Determine content type
  let contentType: 'instructional' | 'highlight' | 'vlog' | 'qa' | 'other';
  let isInstructional: boolean;
  
  if (isHighlight) {
    contentType = 'highlight';
    isInstructional = false;
    reasonsBad.push('Appears to be highlight reel or competition footage');
  } else if (isVlog) {
    contentType = 'vlog';
    isInstructional = false;
    reasonsBad.push('Appears to be vlog/personal content');
  } else if (isQA) {
    contentType = 'qa';
    isInstructional = false;
    reasonsBad.push('Appears to be Q&A or discussion');
  } else if (hasInstructionalSignals) {
    contentType = 'instructional';
    isInstructional = true;
    reasonsGood.push('Contains instructional content signals');
  } else {
    // Ambiguous - default based on instructor tier
    contentType = 'other';
    isInstructional = instructorTier === 'elite'; // Give benefit of doubt to elite
  }
  
  // ═══════════════════════════════════════════════════════════
  // QUALITY INDICATORS
  // ═══════════════════════════════════════════════════════════
  
  // Step-by-step instruction
  const stepByStepPatterns = [
    'step by step', 'step-by-step', 'breakdown', 'how to',
    'complete guide', 'full tutorial', 'beginners guide'
  ];
  const hasStepByStep = stepByStepPatterns.some(p => combinedText.includes(p));
  if (hasStepByStep) reasonsGood.push('Contains step-by-step instruction');
  
  // Setup details
  const setupPatterns = [
    'setup', 'entry', 'position', 'grip', 'control',
    'establish', 'transitions'
  ];
  const hasSetupDetails = setupPatterns.some(p => combinedText.includes(p));
  if (hasSetupDetails) reasonsGood.push('Includes setup/entry details');
  
  // Troubleshooting / Tips
  const troubleshootingPatterns = [
    'common mistakes', 'avoid', 'tip', 'secret', 'key detail',
    'mistake', 'fix', 'troubleshoot', 'problem'
  ];
  const hasTroubleshooting = troubleshootingPatterns.some(p => combinedText.includes(p));
  if (hasTroubleshooting) reasonsGood.push('Includes troubleshooting/tips');
  
  // Common mistakes
  const mistakePatterns = [
    'common mistakes', 'dont', "don't", 'avoid', 'wrong way',
    'correct way', 'proper technique'
  ];
  const hasCommonMistakes = mistakePatterns.some(p => combinedText.includes(p));
  if (hasCommonMistakes) reasonsGood.push('Addresses common mistakes');
  
  // Competition context
  const competitionPatterns = [
    'adcc', 'ibjjf', 'worlds', 'pan ams', 'competition',
    'tournament', 'match', 'no-gi worlds'
  ];
  const hasCompetitionContext = competitionPatterns.some(p => combinedText.includes(p));
  if (hasCompetitionContext) reasonsGood.push('Real competition context');
  
  // ═══════════════════════════════════════════════════════════
  // ADDITIONAL NEGATIVE INDICATORS (for scoring)
  // ═══════════════════════════════════════════════════════════
  
  const clickbaitPatterns = [
    'you wont believe', "won't believe", 'insane', 'crazy',
    'destroys everyone', 'unbelievable', 'mind blowing'
  ];
  const hasClickbait = clickbaitPatterns.some(p => combinedText.includes(p));
  if (hasClickbait && !reasonsBad.includes('Clickbait language detected')) {
    reasonsBad.push('Clickbait language detected');
  }
  
  const tooShortTitle = title.length < 15;
  if (tooShortTitle && !reasonsBad.some(r => r.includes('short'))) {
    reasonsBad.push('Title too short - lacks detail');
  }
  
  const tooGeneric = /^(bjj|jiu jitsu|jiujitsu|grappling)\s*(tutorial|technique|move)?$/i.test(title.trim());
  if (tooGeneric && !reasonsBad.includes('Title too generic')) {
    reasonsBad.push('Title too generic');
  }
  
  // ═══════════════════════════════════════════════════════════
  // TECHNIQUE DEPTH ASSESSMENT
  // ═══════════════════════════════════════════════════════════
  
  const basicPatterns = [
    'beginner', 'basics', 'fundamental', 'introduction',
    'white belt', 'getting started'
  ];
  const advancedPatterns = [
    'advanced', 'high level', 'black belt', 'purple belt',
    'competition', 'mastery', 'details', 'nuances'
  ];
  
  const isBasic = basicPatterns.some(p => combinedText.includes(p));
  const isAdvanced = advancedPatterns.some(p => combinedText.includes(p));
  
  let techniqueDepth: 'basic' | 'intermediate' | 'advanced';
  if (isAdvanced) techniqueDepth = 'advanced';
  else if (isBasic) techniqueDepth = 'basic';
  else techniqueDepth = 'intermediate';
  
  // ═══════════════════════════════════════════════════════════
  // SCORING
  // ═══════════════════════════════════════════════════════════
  
  let score = 50; // Base score
  
  // For ELITE instructors: Simple binary check
  if (instructorTier === 'elite') {
    if (!isInstructional) {
      // Highlight reel, vlog, Q&A → Reject
      score = 25;
    } else {
      // Instructional content → High score (don't penalize short titles)
      score = 75;
      
      // Bonus for quality indicators
      if (hasStepByStep) score += 5;
      if (hasSetupDetails) score += 5;
      if (hasTroubleshooting) score += 5;
      if (hasCommonMistakes) score += 5;
      if (hasCompetitionContext) score += 5;
    }
  } else {
    // For UNKNOWN/HIGH_QUALITY: Traditional scoring
    
    // Positive indicators (+10 each)
    if (hasStepByStep) score += 10;
    if (hasSetupDetails) score += 10;
    if (hasTroubleshooting) score += 10;
    if (hasCommonMistakes) score += 10;
    if (hasCompetitionContext) score += 10;
    
    // Negative indicators
    if (hasClickbait) score -= 15;
    if (!isInstructional) score -= 30; // Big penalty for non-instructional
    if (tooShortTitle) score -= 10;
    if (tooGeneric) score -= 15;
  }
  
  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));
  
  return {
    score,
    isInstructional,
    contentType,
    hasStepByStep,
    hasSetupDetails,
    hasTroubleshooting,
    hasCommonMistakes,
    hasCompetitionContext,
    techniqueDepth,
    reasonsGood,
    reasonsBad
  };
}
