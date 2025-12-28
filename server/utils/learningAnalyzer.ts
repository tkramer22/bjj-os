// ═══════════════════════════════════════════════════════════════
// LEARNING ANALYZER - Phase 3B
// ═══════════════════════════════════════════════════════════════
// Analyzes Professor OS conversations to extract topics, patterns,
// and insights for personalized learning loop

import type { ProfessorOsInsight } from '@shared/schema';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface AnalysisResult {
  topics: TopicMention[];
  techniques: TechniqueMention[];
  sentiment: ConversationSentiment;
  patterns: Pattern[];
  confidenceScore: number;
}

export interface TopicMention {
  topic: string;
  concept?: string;
  frequency: number;
  context: string; // Surrounding text for context
}

export interface TechniqueMention {
  technique: string;
  position?: string;
  frequency: number;
  sentiment: 'struggling' | 'neutral' | 'improving';
}

export interface Pattern {
  type: 'repeated_topic' | 'breakthrough' | 'struggle' | 'progression';
  description: string;
  confidence: number;
}

export interface ConversationSentiment {
  overall: 'struggling' | 'neutral' | 'improving' | 'breakthrough';
  indicators: string[]; // Words/phrases that indicate sentiment
}

// ═══════════════════════════════════════════════════════════════
// BJJ KNOWLEDGE BASE
// ═══════════════════════════════════════════════════════════════

const BJJ_TOPICS = [
  // Positions
  'mount', 'guard', 'side control', 'back control', 'half guard', 'closed guard',
  'open guard', 'butterfly guard', 'x-guard', 'spider guard', 'de la riva',
  'knee on belly', 'north-south', 'turtle', 'standing',
  
  // Techniques
  'armbar', 'triangle', 'kimura', 'americana', 'guillotine', 'rear naked choke',
  'bow and arrow', 'loop choke', 'ezekiel', 'darce', 'd\'arce', 'anaconda',
  'arm triangle', 'omoplata', 'gogoplata', 'buggy choke',
  
  // Concepts
  'sweep', 'pass', 'escape', 'retention', 'control', 'submission',
  'takedown', 'throw', 'grip', 'frame', 'base', 'posture', 'pressure',
  'transition', 'chain', 'combo', 'counter',
  
  // Leg locks
  'heel hook', 'toe hold', 'knee bar', 'ankle lock', 'calf slicer',
  'ashi garami', 'saddle', '50/50', 'inside sankaku',
];

const STRUGGLE_INDICATORS = [
  'struggling', 'stuck', 'can\'t', 'don\'t understand', 'confused',
  'frustrated', 'always get', 'keep getting', 'problem', 'issue',
  'difficulty', 'hard time', 'trouble', 'fail', 'not working',
  'help me', 'how do i', 'why does', 'what am i doing wrong',
];

const BREAKTHROUGH_INDICATORS = [
  'finally', 'got it', 'understand now', 'makes sense', 'clicked',
  'working now', 'succeeded', 'pulled off', 'managed to', 'better at',
  'improvement', 'progress', 'breakthrough', 'figured out', 'solved',
];

const IMPROVING_INDICATORS = [
  'getting better', 'improving', 'progress', 'advancing', 'developing',
  'learning', 'practicing', 'working on', 'focusing on', 'studying',
];

// ═══════════════════════════════════════════════════════════════
// CORE ANALYSIS FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export function analyzeConversation(
  messages: ConversationMessage[]
): AnalysisResult {
  const userMessages = messages.filter(m => m.role === 'user');
  const fullText = userMessages.map(m => m.content.toLowerCase()).join(' ');
  
  return {
    topics: extractTopics(fullText),
    techniques: extractTechniques(fullText),
    sentiment: analyzeSentiment(fullText),
    patterns: detectPatterns(messages),
    confidenceScore: calculateConfidence(userMessages.length),
  };
}

// ─────────────────────────────────────────────────────────────────
// Topic Extraction
// ─────────────────────────────────────────────────────────────────

function extractTopics(text: string): TopicMention[] {
  const topics: Map<string, TopicMention> = new Map();
  
  BJJ_TOPICS.forEach(topic => {
    const regex = new RegExp(`\\b${escapeRegex(topic)}\\b`, 'gi');
    const matches = text.match(regex);
    
    if (matches && matches.length > 0) {
      const contextStart = text.indexOf(topic.toLowerCase());
      const context = text.substring(
        Math.max(0, contextStart - 30),
        Math.min(text.length, contextStart + topic.length + 30)
      );
      
      topics.set(topic, {
        topic,
        frequency: matches.length,
        context: context.trim(),
      });
    }
  });
  
  return Array.from(topics.values())
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10); // Top 10 topics
}

// ─────────────────────────────────────────────────────────────────
// Technique Extraction
// ─────────────────────────────────────────────────────────────────

function extractTechniques(text: string): TechniqueMention[] {
  const techniques: Map<string, TechniqueMention> = new Map();
  
  // Focus on submission and sweep techniques
  const techniqueKeywords = BJJ_TOPICS.filter(t => 
    ['armbar', 'triangle', 'kimura', 'guillotine', 'sweep', 'choke'].some(k => t.includes(k))
  );
  
  techniqueKeywords.forEach(technique => {
    const regex = new RegExp(`\\b${escapeRegex(technique)}\\b`, 'gi');
    const matches = text.match(regex);
    
    if (matches && matches.length > 0) {
      // Determine sentiment based on context
      const contextRegex = new RegExp(`.{0,50}${escapeRegex(technique)}.{0,50}`, 'i');
      const contextMatch = text.match(contextRegex);
      const context = contextMatch ? contextMatch[0].toLowerCase() : '';
      
      let sentiment: 'struggling' | 'neutral' | 'improving' = 'neutral';
      if (STRUGGLE_INDICATORS.some(ind => context.includes(ind))) {
        sentiment = 'struggling';
      } else if (IMPROVING_INDICATORS.some(ind => context.includes(ind))) {
        sentiment = 'improving';
      }
      
      techniques.set(technique, {
        technique,
        frequency: matches.length,
        sentiment,
      });
    }
  });
  
  return Array.from(techniques.values())
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5); // Top 5 techniques
}

// ─────────────────────────────────────────────────────────────────
// Sentiment Analysis
// ─────────────────────────────────────────────────────────────────

function analyzeSentiment(text: string): ConversationSentiment {
  const indicators: string[] = [];
  
  const struggleCount = STRUGGLE_INDICATORS.filter(ind => {
    if (text.includes(ind)) {
      indicators.push(ind);
      return true;
    }
    return false;
  }).length;
  
  const breakthroughCount = BREAKTHROUGH_INDICATORS.filter(ind => {
    if (text.includes(ind)) {
      indicators.push(ind);
      return true;
    }
    return false;
  }).length;
  
  const improvingCount = IMPROVING_INDICATORS.filter(ind => {
    if (text.includes(ind)) {
      indicators.push(ind);
      return true;
    }
    return false;
  }).length;
  
  // Determine overall sentiment
  let overall: ConversationSentiment['overall'] = 'neutral';
  
  if (breakthroughCount > 0 && breakthroughCount > struggleCount) {
    overall = 'breakthrough';
  } else if (improvingCount > struggleCount) {
    overall = 'improving';
  } else if (struggleCount > 2) {
    overall = 'struggling';
  }
  
  return { overall, indicators };
}

// ─────────────────────────────────────────────────────────────────
// Pattern Detection
// ─────────────────────────────────────────────────────────────────

function detectPatterns(messages: ConversationMessage[]): Pattern[] {
  const patterns: Pattern[] = [];
  
  // Detect repeated topics
  const topicFrequency = new Map<string, number>();
  messages.filter(m => m.role === 'user').forEach(msg => {
    BJJ_TOPICS.forEach(topic => {
      if (msg.content.toLowerCase().includes(topic)) {
        topicFrequency.set(topic, (topicFrequency.get(topic) || 0) + 1);
      }
    });
  });
  
  topicFrequency.forEach((count, topic) => {
    if (count >= 3) {
      patterns.push({
        type: 'repeated_topic',
        description: `Frequently asks about ${topic} (${count} times)`,
        confidence: Math.min(95, 50 + (count * 10)),
      });
    }
  });
  
  // Detect progression in conversation
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length >= 5) {
    const firstHalf = userMessages.slice(0, Math.floor(userMessages.length / 2))
      .map(m => m.content.toLowerCase()).join(' ');
    const secondHalf = userMessages.slice(Math.floor(userMessages.length / 2))
      .map(m => m.content.toLowerCase()).join(' ');
    
    const strugglingInFirst = STRUGGLE_INDICATORS.some(ind => firstHalf.includes(ind));
    const improvingInSecond = IMPROVING_INDICATORS.some(ind => secondHalf.includes(ind)) ||
                               BREAKTHROUGH_INDICATORS.some(ind => secondHalf.includes(ind));
    
    if (strugglingInFirst && improvingInSecond) {
      patterns.push({
        type: 'progression',
        description: 'Shows progression from struggling to improving within conversation',
        confidence: 75,
      });
    }
  }
  
  return patterns;
}

// ─────────────────────────────────────────────────────────────────
// Confidence Scoring
// ─────────────────────────────────────────────────────────────────

function calculateConfidence(messageCount: number): number {
  // More messages = higher confidence in analysis
  // 1-2 messages: 30% confidence
  // 3-5 messages: 50-70% confidence
  // 6+ messages: 70-90% confidence
  
  if (messageCount <= 2) return 30;
  if (messageCount <= 5) return 30 + (messageCount * 10);
  return Math.min(90, 50 + (messageCount * 5));
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

export const learningAnalyzer = {
  analyzeConversation,
  extractTopics,
  extractTechniques,
  analyzeSentiment,
  detectPatterns,
};
