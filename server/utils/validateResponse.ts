import { ProfessorOSResponse } from '../types/professorOSResponse';

export interface ValidationContext {
  userMessage: string;
  isTrialUser: boolean;
  daysRemaining?: number;
  hasConversationHistory?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

export function validateResponse(
  response: ProfessorOSResponse,
  context: ValidationContext
): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  
  if (!response.mainResponse || response.mainResponse.length < 20) {
    issues.push('Main response too short or missing');
  }
  
  if (!response.returnLoop) {
    issues.push('Return loop missing - REQUIRED field');
  }
  
  const isSimpleQuestion = context.userMessage.match(
    /^(what|when|where|who|how old|how tall|which|can you)/i
  );
  
  if (!isSimpleQuestion && !response.anticipatoryDiagnosis) {
    warnings.push('Anticipatory diagnosis missing for complex query');
  }
  
  if (context.isTrialUser && context.daysRemaining && context.daysRemaining < 7) {
    if (!response.trialUrgency) {
      warnings.push(`Trial urgency missing for user with ${context.daysRemaining} days remaining`);
    }
  }
  
  const bannedPhrases = ['got it.', 'okay.', 'i understand', 'i see.', 'sure.', 'nice.'];
  const responseText = (response.anticipatoryDiagnosis || '') + ' ' + response.mainResponse;
  const lowerResponse = responseText.toLowerCase();
  
  for (const phrase of bannedPhrases) {
    if (lowerResponse.startsWith(phrase) || lowerResponse.includes(` ${phrase}`)) {
      issues.push(`Contains banned opening phrase: "${phrase}"`);
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
    warnings
  };
}
