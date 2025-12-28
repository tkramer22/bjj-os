// Language detection utility for BJJ OS
// Supports English, Brazilian Portuguese, and Spanish

/**
 * Detect language from user message
 * @param text - The text to analyze
 * @param userPreference - Optional stored user preference to use as fallback
 * @returns Language code: 'en', 'pt', 'es', or 'mixed'
 */
export function detectLanguage(text: string, userPreference?: string): string {
  // Portuguese indicators (Brazilian Portuguese focused - expanded with common greetings and phrases)
  const portugueseIndicators = [
    // Greetings and common phrases
    'oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'obrigado', 'obrigada', 
    'por favor', 'desculpa', 'desculpe', 'tchau', 'até logo', 'tudo bem',
    'legal', 'bacana', 'cara', 'mano',
    
    // Common verbs and conjugations
    'você', 'está', 'estou', 'estamos', 'treino', 'treinei', 'treinar', 
    'consegui', 'conseguir', 'quero', 'preciso', 'posso', 'tenho', 'tem',
    'fazer', 'ajuda', 'ajudar', 'mostre', 'mostrar', 'ensine', 'ensinar',
    
    // BJJ specific
    'hoje', 'posição', 'finalização', 'guarda', 'passagem', 'defesa', 'técnica',
    'dificuldade', 'mas', 'muito', 'pouco', 'ção', 'não', 'minha', 'meu', 'como',
    'faixa', 'azul', 'roxa', 'marrom', 'preta', 'kimono',
    'raspagem', 'montada', 'lateral', 'chave', 'estrangulamento', 
    'triângulo', 'submissão', 'tá', 'beleza', 'massa', 'valeu',
    
    // Common Portuguese words
    'para', 'pra', 'com', 'sem', 'mais', 'menos', 'onde', 'quando',
    'porque', 'por que', 'qual', 'quais', 'isso', 'essa', 'esse'
  ];
  
  // Spanish indicators (to differentiate from Portuguese)
  const spanishIndicators = [
    // Greetings
    'hola', 'buenos días', 'buenas tardes', 'buenas noches', 'gracias',
    'por favor', 'perdón', 'adiós', 'hasta luego',
    
    // Common verbs
    'entrené', 'entrenar', 'hoy', 'técnica', 'guardia', 'defensa',
    'usted', 'estoy', 'estamos', 'ción', 'pero', 'mucho', 'poco',
    'cómo', 'hacer', 'mi', 'tengo', 'quiero', 'puedo',
    'cinturón', 'azul', 'morado', 'marrón', 'negro',
    'que', 'sí', 'no', 'ayuda', 'ayudar'
  ];

  // English indicators
  const englishIndicators = [
    // Greetings
    'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'thanks', 'thank you',
    
    // Common phrases
    'training', 'trained', 'guard', 'pass', 'submission', 'technique',
    'mount', 'side control', 'back control', 'armbar', 'triangle',
    'how to', 'can you', 'help me', 'what', 'when', 'where', 'show me',
    'white belt', 'blue belt', 'purple belt', 'brown belt', 'black belt',
    'gi', 'nogi', 'no-gi', 'bjj', 'jiu jitsu', 'rolling', 'drill',
    'instructor', 'coach', 'today', 'yesterday', 'tomorrow', 'need', 'want'
  ];
  
  const lowerText = text.toLowerCase();
  
  // Count matches
  const ptMatches = portugueseIndicators.filter(word => 
    lowerText.includes(word.toLowerCase())
  ).length;
  
  const esMatches = spanishIndicators.filter(word => 
    lowerText.includes(word.toLowerCase())
  ).length;

  const enMatches = englishIndicators.filter(word =>
    lowerText.includes(word.toLowerCase())
  ).length;
  
  // Spanish detected (differentiate from Portuguese) - lowered threshold to 1
  if (esMatches > ptMatches && esMatches >= 1) {
    return 'es';
  }
  
  // Portuguese detected - lowered threshold to 1
  if (ptMatches >= 1) {
    return 'pt';
  }

  // English detected - lowered threshold to 1
  if (enMatches >= 1) {
    return 'en';
  }

  // Check for mixed language
  if (isMixedLanguage(text)) {
    return 'mixed';
  }
  
  // If unclear and user has preference, use their preference
  if (userPreference && ['en', 'pt', 'es'].includes(userPreference)) {
    return userPreference;
  }
  
  // Default to English if unclear
  return 'en';
}

/**
 * Check if message has mixed languages
 * @param text - The text to analyze
 * @returns True if mixed English and Portuguese detected
 */
export function isMixedLanguage(text: string): boolean {
  const hasEnglish = /\b(train|trained|guard|pass|submission|technique|help|show|teach)\b/i.test(text);
  const hasPortuguese = /\b(treino|treinei|guarda|passagem|finalização|técnica|ajuda|mostre|ensine)\b/i.test(text);
  
  return hasEnglish && hasPortuguese;
}

/**
 * Get language name for display
 * @param code - Language code (en, pt, es)
 * @returns Language name
 */
export function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    'en': 'English',
    'pt': 'Português (Brasil)',
    'es': 'Español',
    'mixed': 'Mixed'
  };
  return names[code] || 'Unknown';
}

/**
 * Detect video language from transcript
 * @param transcript - Video transcript or description
 * @returns Array of language codes
 */
export function detectVideoLanguage(transcript: string): string[] {
  const detectedLang = detectLanguage(transcript);
  
  if (detectedLang === 'mixed') {
    // If mixed, return both detected languages
    const hasEnglish = /\b(train|guard|pass|submission|technique)\b/i.test(transcript);
    const hasPortuguese = /\b(treino|guarda|passagem|finalização|técnica)\b/i.test(transcript);
    
    const languages: string[] = [];
    if (hasEnglish) languages.push('en');
    if (hasPortuguese) languages.push('pt');
    
    return languages.length > 0 ? languages : ['en'];
  }
  
  return [detectedLang];
}

/**
 * Get Portuguese response templates for common scenarios
 */
export const portugueseResponses = {
  mixedLanguagePrompt: `Vejo que você está misturando inglês e português. Prefere que eu responda em português ou inglês?\n\n(I see you're mixing English and Portuguese. Would you prefer I respond in Portuguese or English?)`,
  
  spanishDetected: `¡Hola! Veo que escribes en español. Por ahora, BJJ OS está disponible en inglés y portugués, pero el español está en camino pronto.\n\n¿Prefieres que continúe en inglés?\n\n(Hi! I see you're writing in Spanish. For now, BJJ OS is available in English and Portuguese, but Spanish is coming soon. Would you prefer I continue in English?)`,
  
  encouragement: ['Isso aí!', 'Massa!', 'Mandou bem!', 'Continua assim!', 'Boa!', 'Beleza!', 'Show!'],
  
  videoContext: (isEnglish: boolean) => 
    isEnglish ? '(Este vídeo é em inglês, mas é excelente)' : '',
};
