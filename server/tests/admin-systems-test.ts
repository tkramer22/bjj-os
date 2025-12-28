/**
 * COMPREHENSIVE ADMIN SYSTEMS TEST SUITE
 * Tests DevOps Command Center and Professor OS extensively
 * 40 TOTAL TESTS: 20 DevOps + 20 Professor OS
 */

import Anthropic from '@anthropic-ai/sdk';

// ═══════════════════════════════════════════════════════════
// TEST CONFIGURATIONS
// ═══════════════════════════════════════════════════════════

interface DevOpsTest {
  query: string;
  expectedIncludes?: string[];
  expectsNumber?: boolean;
  category: string;
}

interface ProfessorOSTest {
  query: string;
  expectedElements?: string[];
  shouldNotInclude?: string[];
  shouldIncludeVideoRecommendation?: boolean;
  shouldMentionTrialDays?: boolean;
  shouldReferenceCombatSports?: boolean;
  category: string;
  followUp?: string;
  expectedFollowUp?: string[];
}

// ═══════════════════════════════════════════════════════════
// DEVOPS CHAT - 20 TEST QUERIES
// ═══════════════════════════════════════════════════════════

const DEVOPS_TESTS: DevOpsTest[] = [
  // System Status Queries (5 tests)
  {
    query: "What's the system health?",
    expectedIncludes: ["database", "operational", "status"],
    category: "System Health"
  },
  {
    query: "Are there any errors in the last 24 hours?",
    expectedIncludes: ["error", "24", "hour"],
    category: "System Health"
  },
  {
    query: "What's the server uptime?",
    expectedIncludes: ["uptime", "hour", "running"],
    category: "System Health"
  },
  {
    query: "Is curation working?",
    expectedIncludes: ["curation"],
    category: "System Health"
  },
  {
    query: "What's the database status?",
    expectedIncludes: ["database", "connected"],
    category: "System Health"
  },

  // User Metrics Queries (5 tests)
  {
    query: "How many users do we have?",
    expectedIncludes: ["user", "total"],
    expectsNumber: true,
    category: "User Metrics"
  },
  {
    query: "What's our current MRR?",
    expectedIncludes: ["mrr", "revenue"],
    expectsNumber: true,
    category: "User Metrics"
  },
  {
    query: "How many active subscribers?",
    expectedIncludes: ["subscriber", "active"],
    expectsNumber: true,
    category: "User Metrics"
  },
  {
    query: "How many users signed up today?",
    expectedIncludes: ["today", "user"],
    expectsNumber: true,
    category: "User Metrics"
  },
  {
    query: "What's our trial conversion rate?",
    expectedIncludes: ["trial", "conversion"],
    category: "User Metrics"
  },

  // Curation Queries (5 tests)
  {
    query: "How many videos were added today?",
    expectedIncludes: ["video", "today"],
    expectsNumber: true,
    category: "Curation"
  },
  {
    query: "What's today's curation approval rate?",
    expectedIncludes: ["approval", "rate"],
    category: "Curation"
  },
  {
    query: "Show me curation stats",
    expectedIncludes: ["discovered", "approved"],
    category: "Curation"
  },
  {
    query: "When is the next curation run?",
    expectedIncludes: ["next", "curation"],
    category: "Curation"
  },
  {
    query: "How many videos in the library?",
    expectedIncludes: ["video", "library"],
    expectsNumber: true,
    category: "Curation"
  },

  // Combat Sports Queries (3 tests)
  {
    query: "How many combat sports articles today?",
    expectedIncludes: ["article", "today"],
    expectsNumber: true,
    category: "Combat Sports"
  },
  {
    query: "When does the combat sports scraper run?",
    expectedIncludes: ["6", "AM"],
    category: "Combat Sports"
  },
  {
    query: "Is combat sports news integrated with Professor OS?",
    expectedIncludes: ["professor"],
    category: "Combat Sports"
  },

  // Complex Queries (2 tests)
  {
    query: "Give me a complete system overview",
    expectedIncludes: ["user", "video", "curation"],
    category: "Complex"
  },
  {
    query: "What are the top 3 priorities I should focus on?",
    expectedIncludes: ["priority"],
    category: "Complex"
  }
];

// ═══════════════════════════════════════════════════════════
// PROFESSOR OS - 20 TEST QUERIES
// ═══════════════════════════════════════════════════════════

const PROFESSOR_OS_TESTS: ProfessorOSTest[] = [
  // Basic Technique Questions (5 tests)
  {
    query: "How do I escape side control?",
    expectedElements: ["anticipatoryDiagnosis", "main_response", "returnLoop"],
    shouldNotInclude: ["got it", "okay", "i understand"],
    category: "Technique - Basic"
  },
  {
    query: "I keep getting passed from closed guard",
    expectedElements: ["anticipatoryDiagnosis", "main_response", "returnLoop"],
    shouldIncludeVideoRecommendation: true,
    category: "Technique - Basic"
  },
  {
    query: "Teach me how to do an armbar from mount",
    expectedElements: ["main_response", "returnLoop"],
    shouldIncludeVideoRecommendation: true,
    category: "Technique - Basic"
  },
  {
    query: "What's a good sweep from half guard?",
    expectedElements: ["main_response", "returnLoop"],
    shouldIncludeVideoRecommendation: true,
    category: "Technique - Basic"
  },
  {
    query: "I'm having trouble finishing the triangle",
    expectedElements: ["anticipatoryDiagnosis", "main_response", "returnLoop"],
    category: "Technique - Basic"
  },

  // Pattern Recognition (3 tests)
  {
    query: "I'm working on my back attacks",
    expectedElements: ["main_response", "returnLoop"],
    category: "Pattern Recognition"
  },
  {
    query: "I keep losing to bigger opponents",
    expectedElements: ["anticipatoryDiagnosis", "main_response", "returnLoop"],
    category: "Pattern Recognition"
  },
  {
    query: "I competed last week and got submitted by kimura",
    expectedElements: ["main_response", "returnLoop"],
    category: "Pattern Recognition"
  },

  // Video Recommendations (3 tests)
  {
    query: "Show me a video on knee slice pass",
    shouldIncludeVideoRecommendation: true,
    category: "Video Request"
  },
  {
    query: "I need to learn berimbolo",
    expectedElements: ["main_response", "returnLoop"],
    shouldIncludeVideoRecommendation: true,
    category: "Video Request"
  },
  {
    query: "Best videos for leg locks?",
    shouldIncludeVideoRecommendation: true,
    category: "Video Request"
  },

  // Trial User Experience (3 tests)
  {
    query: "I'm new to BJJ, where should I start?",
    expectedElements: ["main_response", "returnLoop"],
    shouldMentionTrialDays: true,
    category: "Trial UX"
  },
  {
    query: "What can you help me with?",
    expectedElements: ["main_response"],
    category: "Trial UX"
  },
  {
    query: "I train 5 times a week and want to improve fast",
    expectedElements: ["main_response", "returnLoop"],
    shouldMentionTrialDays: true,
    category: "Trial UX"
  },

  // Engagement Hooks (3 tests)
  {
    query: "Thanks, that's helpful",
    expectedElements: ["follow_up_question", "returnLoop"],
    shouldNotInclude: ["got it", "okay"],
    category: "Engagement"
  },
  {
    query: "I don't understand",
    expectedElements: ["main_response"],
    shouldNotInclude: ["got it", "okay", "i see"],
    category: "Engagement"
  },
  {
    query: "Can you explain that differently?",
    expectedElements: ["main_response", "returnLoop"],
    category: "Engagement"
  },

  // Combat Sports Integration (3 tests)
  {
    query: "What happened at the recent UFC event?",
    shouldReferenceCombatSports: true,
    category: "Combat Sports"
  },
  {
    query: "Tell me about recent BJJ tournaments",
    shouldReferenceCombatSports: true,
    category: "Combat Sports"
  },
  {
    query: "Who won the last IBJJF worlds?",
    shouldReferenceCombatSports: true,
    category: "Combat Sports"
  }
];

// ═══════════════════════════════════════════════════════════
// TEST RESULTS INTERFACE
// ═══════════════════════════════════════════════════════════

interface TestResults {
  total: number;
  passed: number;
  failed: number;
  errors: Array<{
    testNumber: number;
    query: string;
    category: string;
    issue: string;
    response?: string;
  }>;
  timings: number[];
  avgResponseTime: number;
  medianResponseTime: number;
  p95ResponseTime: number;
}

// ═══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

function calculateStats(timings: number[]): { avg: number; median: number; p95: number } {
  if (timings.length === 0) return { avg: 0, median: 0, p95: 0 };
  
  const sorted = [...timings].sort((a, b) => a - b);
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index] || sorted[sorted.length - 1];
  
  return { avg, median, p95 };
}

// ═══════════════════════════════════════════════════════════
// EXPORTS FOR API ENDPOINT
// ═══════════════════════════════════════════════════════════

export { DEVOPS_TESTS, PROFESSOR_OS_TESTS, TestResults, DevOpsTest, ProfessorOSTest, calculateStats };
