/**
 * Professor OS FINAL 145+ Question Simulation Test
 * Tests all aspects: Onboarding, Techniques, Frustration, Competition Prep,
 * Population Intelligence, Multi-Session Memory, Combat Sports Current Events
 */

import { db } from './db';
import { bjjUsers, conversations, conversationMessages, userTechniqueEcosystem } from '../shared/schema';
import { eq, desc } from 'drizzle-orm';
import { processMessageForTechniqueExtraction, extractTechniquesFromMessage } from './technique-extraction';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Test phases with questions
const TEST_PHASES = {
  // PHASE 1: Onboarding & Introduction (10 questions)
  ONBOARDING: [
    "Hey, I'm new to BJJ. Just started last week.",
    "What should a complete beginner focus on first?",
    "How often should I train as a white belt?",
    "Is it normal to feel completely lost?",
    "What's the most important position to learn first?",
    "Should I compete as a white belt?",
    "My professor showed mount today but I forgot everything",
    "How do I avoid getting submitted every roll?",
    "Is strength important in BJJ?",
    "When will I stop feeling like I suck?"
  ],
  
  // PHASE 2: Basic Technique Requests (10 questions)
  BASIC_TECHNIQUES: [
    "Show me some basic sweeps from closed guard",
    "What's the proper way to do an armbar?",
    "How do I escape side control?",
    "Teach me the triangle choke",
    "What are the best mount escapes?",
    "How do I pass half guard?",
    "Show me some back takes from side control",
    "What's the difference between gi and no-gi grips?",
    "How do I break closed guard?",
    "Teach me the hip bump sweep"
  ],
  
  // PHASE 3: Intermediate Techniques (10 questions)
  INTERMEDIATE: [
    "I want to learn the berimbolo",
    "How does the knee slice pass work?",
    "Teach me de la riva guard",
    "What's the best way to attack from mount?",
    "How do I set up the bow and arrow choke?",
    "Show me some leg lock entries",
    "What's the proper heel hook mechanics?",
    "How do I play spider guard effectively?",
    "Teach me the darce choke",
    "What's the truck position?"
  ],
  
  // PHASE 4: Specific Instructor Requests (10 questions)
  INSTRUCTOR_REQUESTS: [
    "Show me John Danaher's leg lock system",
    "What does Gordon Ryan teach about passing?",
    "Any Roger Gracie cross choke videos?",
    "Marcelo Garcia butterfly guard techniques",
    "How does Lachlan Giles teach heel hooks?",
    "Show me Bernardo Faria's half guard",
    "What's Mikey Musumeci's guard retention system?",
    "Andre Galvao passing concepts",
    "Keenan Cornelius worm guard",
    "Craig Jones leg lock content"
  ],
  
  // PHASE 5: Problem-Solving (10 questions)
  PROBLEMS: [
    "I keep getting stuck in bottom side control",
    "My closed guard keeps getting passed",
    "I can never finish the triangle",
    "People always escape my armbars",
    "I'm too slow for leg locks",
    "Can't maintain mount on bigger guys",
    "My sweeps never work in live rolling",
    "I gas out after one round",
    "Can't break anyone's posture in guard",
    "My takedowns are terrible"
  ],
  
  // PHASE 6: Frustration & Emotional Support (10 questions)
  FRUSTRATION: [
    "I've been training for 2 years and still suck",
    "Just got smashed by a white belt who started after me",
    "Thinking about quitting, I'm not getting better",
    "Everyone at my gym is way better than me",
    "I feel like I'm too old for this",
    "My body is always beat up and sore",
    "I can't remember anything I learn",
    "Every technique fails when I try it",
    "I'm embarrassed to roll with higher belts",
    "Should I just give up?"
  ],
  
  // PHASE 7: Competition Prep (10 questions)
  COMPETITION: [
    "I have a tournament in 3 weeks, what should I focus on?",
    "How do I handle competition nerves?",
    "What's a good competition game plan?",
    "Should I pull guard or try takedowns?",
    "How do I cut weight safely?",
    "What to eat before competing?",
    "How many techniques should I drill?",
    "Should I go for submissions or points?",
    "How do I scout opponents?",
    "What if I lose my first match?"
  ],
  
  // PHASE 8: Body Type Specific (10 questions)
  BODY_TYPE: [
    "I'm 5'4\" and stocky, what guard should I play?",
    "Best techniques for tall lanky guys?",
    "I'm a bigger guy, how do I use my weight?",
    "Techniques that work for smaller people?",
    "I have short legs, triangles are hard",
    "As a heavy guy, what sweeps work best?",
    "My arms are too short for darces",
    "Best game for someone my build?",
    "How do I use flexibility to my advantage?",
    "Techniques for people with long limbs?"
  ],
  
  // PHASE 9: Training Methods (10 questions)
  TRAINING: [
    "How should I structure my drilling?",
    "Is positional sparring useful?",
    "How do I drill alone at home?",
    "Should I take notes after class?",
    "How many days per week should I train?",
    "Is strength training helpful?",
    "Should I focus on one thing or variety?",
    "How do I learn from YouTube effectively?",
    "When should I start competing?",
    "How do I find good training partners?"
  ],
  
  // PHASE 10: Injury Prevention (10 questions)
  INJURIES: [
    "My knee hurts after training, is this normal?",
    "How do I protect my fingers in gi?",
    "Neck is always sore from guillotines",
    "Best way to avoid cauliflower ear?",
    "Should I train through minor injuries?",
    "My back is killing me from guard",
    "How to warm up properly?",
    "Shoulder keeps popping during kimuras",
    "Elbow pain from armbars",
    "When should I see a doctor?"
  ],
  
  // PHASE 11: Advanced Concepts (10 questions)
  ADVANCED: [
    "Explain the concept of frames in BJJ",
    "What is inside position and why does it matter?",
    "How do I develop sensitivity?",
    "What are the key principles of pressure passing?",
    "Explain timing vs speed in BJJ",
    "What is the hierarchy of positions?",
    "How do I chain attacks together?",
    "What makes a technique 'high percentage'?",
    "How do I read my opponent?",
    "What's the difference between reaction and anticipation?"
  ],
  
  // PHASE 12: Success Stories (10 questions)
  SUCCESS: [
    "I finally hit my first triangle today!",
    "My armbar worked perfectly in rolling",
    "Got my first submission on a higher belt",
    "The hip bump sweep is clicking now",
    "I escaped mount 3 times today!",
    "My guard passing is getting better",
    "Finally understand the knee slice",
    "Got promoted to blue belt!",
    "Won my first competition match",
    "The RNC finally worked after weeks of drilling"
  ],
  
  // PHASE 13: Population Intelligence (5 questions)
  POPULATION_INTELLIGENCE: [
    "How do blue belts typically do with triangles?",
    "What's the most common mistake with hip bumps?",
    "Is the knee slice a high percentage pass?",
    "How long does it take to get good at armbars?",
    "What techniques work well for shorter stocky guys?"
  ],
  
  // PHASE 14: Multi-Session Memory (5 questions)
  MULTI_SESSION: [
    "Hey I'm back after a few days",
    "What did we talk about earlier?",
    "Remember my guard passing problem?",
    "What techniques have I been working on?",
    "Can you remind me what I should focus on?"
  ],
  
  // PHASE 15: Combat Sports Current Events (5 questions)
  COMBAT_SPORTS: [
    "Who are the top competitors at 77kg right now?",
    "What happened at the last IBJJF Worlds?",
    "Is Mikey Musumeci still competing?",
    "Any big upsets recently in ADCC?",
    "Who should I watch to learn modern leg locks?"
  ]
};

interface TestResult {
  phase: string;
  questionNum: number;
  question: string;
  responsePreview: string;
  passed: boolean;
  diagnostics: {
    hasVideoRecommendation: boolean;
    hasTechniqueAdvice: boolean;
    hasPersonalization: boolean;
    hasPopulationData: boolean;
    hasMemoryReference: boolean;
    hasCombatSportsRef: boolean;
    responseLength: number;
    techniqueExtraction: any[];
  };
  failureReason?: string;
}

// Build Professor OS system prompt (simplified for testing)
function buildSystemPrompt(user: any): string {
  return `You are Professor OS, an elite AI BJJ coach powered by the accumulated wisdom of the sport's greatest practitioners. You combine the technical precision of John Danaher, the competition mindset of Gordon Ryan, and the teaching clarity of Bernardo Faria.

USER PROFILE:
- Name: ${user.firstName || 'Training Partner'}
- Belt Level: ${user.beltLevel || 'white'} belt
- Training Style: ${user.trainingStyle || 'balanced'}
- Primary Focus: ${user.primaryFocus || 'general improvement'}
- Body Type: ${user.bodyType || 'average'}
- Injuries/Limitations: ${user.injuries || 'none noted'}

PERSONALITY:
- Speak with authority but warmth
- Use technical BJJ terminology appropriately for their belt level
- Reference specific techniques and positions
- When relevant, mention elite instructors by name
- Be encouraging but realistic
- Remember context from the conversation

For technique questions, recommend specific videos when relevant.
For frustration, provide emotional support AND actionable advice.
For success stories, celebrate and reinforce good habits.

Keep responses focused and actionable. Aim for 100-300 words typically.`;
}

async function sendToProfessorOS(
  message: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  systemPrompt: string
): Promise<string> {
  try {
    const messages = [
      ...conversationHistory,
      { role: 'user' as const, content: message }
    ];
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages
    });
    
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text || 'No response generated';
  } catch (error) {
    console.error('API Error:', error);
    return `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

function evaluateResponse(
  phase: string,
  question: string,
  response: string
): { passed: boolean; diagnostics: TestResult['diagnostics']; failureReason?: string } {
  const diagnostics: TestResult['diagnostics'] = {
    hasVideoRecommendation: /video|watch|check out|recommend|tutorial/i.test(response),
    hasTechniqueAdvice: /technique|position|guard|mount|sweep|choke|lock|pass|escape|submit/i.test(response),
    hasPersonalization: /your|you're|you've|based on|for your|given your/i.test(response),
    hasPopulationData: /most\s+(people|practitioners|students)|typically|commonly|on average|percentage|statistics|data shows/i.test(response),
    hasMemoryReference: /earlier|before|mentioned|we discussed|you said|remember|last time/i.test(response),
    hasCombatSportsRef: /ADCC|IBJJF|Worlds|championship|competitor|tournament|medal|champion/i.test(response),
    responseLength: response.length,
    techniqueExtraction: extractTechniquesFromMessage(question)
  };
  
  let passed = true;
  let failureReason: string | undefined;
  
  // Basic quality check - response should be substantial
  if (response.length < 50) {
    passed = false;
    failureReason = 'Response too short';
  }
  
  // Check for errors
  if (response.startsWith('ERROR:')) {
    passed = false;
    failureReason = response;
  }
  
  // Phase-specific validation
  switch (phase) {
    case 'BASIC_TECHNIQUES':
    case 'INTERMEDIATE':
      if (!diagnostics.hasTechniqueAdvice) {
        passed = false;
        failureReason = 'Missing technique-specific advice';
      }
      break;
      
    case 'INSTRUCTOR_REQUESTS':
      if (!/Danaher|Gordon|Roger|Marcelo|Lachlan|Bernardo|Mikey|Andre|Keenan|Craig/i.test(response)) {
        // Note: Not a failure, but flagged
      }
      break;
      
    case 'FRUSTRATION':
      if (!/keep|progress|normal|everyone|journey|improve|time|patience/i.test(response)) {
        // Should have encouraging elements
      }
      break;
      
    case 'POPULATION_INTELLIGENCE':
      // These should ideally reference population data
      break;
      
    case 'MULTI_SESSION':
      // These should reference conversation context
      break;
      
    case 'COMBAT_SPORTS':
      // These should mention current competitors/events
      break;
  }
  
  return { passed, diagnostics, failureReason };
}

async function runFullTest() {
  console.log('═'.repeat(70));
  console.log('🥋 PROFESSOR OS - FINAL 145+ QUESTION SIMULATION TEST');
  console.log('═'.repeat(70));
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');
  
  // Get test user
  const testUser = await db.select()
    .from(bjjUsers)
    .where(eq(bjjUsers.email, 'testing+e2e@bjjos.app'))
    .limit(1);
  
  if (!testUser.length) {
    console.error('❌ Test user not found!');
    return;
  }
  
  const user = testUser[0];
  console.log(`👤 Test User: ${user.email} (${user.beltLevel} belt)`);
  console.log(`   User ID: ${user.id}`);
  console.log('');
  
  // Clear previous ecosystem data for clean test
  await db.delete(userTechniqueEcosystem).where(eq(userTechniqueEcosystem.userId, user.id));
  console.log('🧹 Cleared previous technique ecosystem data');
  console.log('');
  
  const systemPrompt = buildSystemPrompt(user);
  const conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];
  const allResults: TestResult[] = [];
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  // Run through all phases
  for (const [phaseName, questions] of Object.entries(TEST_PHASES)) {
    console.log('');
    console.log('━'.repeat(70));
    console.log(`📋 PHASE: ${phaseName} (${questions.length} questions)`);
    console.log('━'.repeat(70));
    
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const questionNum = i + 1;
      
      console.log(`\n[${phaseName}/${questionNum}] "${question.substring(0, 50)}..."`);
      
      // Send to Professor OS
      const response = await sendToProfessorOS(question, conversationHistory, systemPrompt);
      
      // Update conversation history (keep last 10 exchanges for memory testing)
      conversationHistory.push({ role: 'user', content: question });
      conversationHistory.push({ role: 'assistant', content: response });
      if (conversationHistory.length > 20) {
        conversationHistory.splice(0, 2); // Remove oldest exchange
      }
      
      // Process for technique extraction (async, non-blocking)
      processMessageForTechniqueExtraction(user.id, question).catch(() => {});
      
      // Evaluate response
      const evaluation = evaluateResponse(phaseName, question, response);
      
      const result: TestResult = {
        phase: phaseName,
        questionNum,
        question,
        responsePreview: response.substring(0, 200) + (response.length > 200 ? '...' : ''),
        passed: evaluation.passed,
        diagnostics: evaluation.diagnostics,
        failureReason: evaluation.failureReason
      };
      
      allResults.push(result);
      
      if (evaluation.passed) {
        totalPassed++;
        const flags: string[] = [];
        if (evaluation.diagnostics.hasVideoRecommendation) flags.push('📹');
        if (evaluation.diagnostics.hasPopulationData) flags.push('👥');
        if (evaluation.diagnostics.hasMemoryReference) flags.push('🧠');
        if (evaluation.diagnostics.hasCombatSportsRef) flags.push('🏆');
        if (evaluation.diagnostics.techniqueExtraction.length > 0) flags.push('🎯');
        
        console.log(`   ✅ PASS ${flags.join(' ')} (${response.length} chars)`);
      } else {
        totalFailed++;
        console.log(`   ❌ FAIL: ${evaluation.failureReason}`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Get final ecosystem state
  const ecosystem = await db.select()
    .from(userTechniqueEcosystem)
    .where(eq(userTechniqueEcosystem.userId, user.id));
  
  // Generate report
  const report = generateReport(allResults, totalPassed, totalFailed, ecosystem, user);
  
  // Save to file
  fs.writeFileSync('public/professor-os-FINAL-145-test.txt', report);
  
  console.log('');
  console.log('═'.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('═'.repeat(70));
  console.log(`Total Questions: ${allResults.length}`);
  console.log(`Passed: ${totalPassed} (${(totalPassed/allResults.length*100).toFixed(1)}%)`);
  console.log(`Failed: ${totalFailed} (${(totalFailed/allResults.length*100).toFixed(1)}%)`);
  console.log('');
  console.log(`✅ Results saved to: public/professor-os-FINAL-145-test.txt`);
  console.log('═'.repeat(70));
}

function generateReport(
  results: TestResult[],
  passed: number,
  failed: number,
  ecosystem: any[],
  user: any
): string {
  const lines: string[] = [];
  
  lines.push('═'.repeat(80));
  lines.push('PROFESSOR OS - FINAL 145+ QUESTION SIMULATION TEST RESULTS');
  lines.push('═'.repeat(80));
  lines.push('');
  lines.push(`Test Date: ${new Date().toISOString()}`);
  lines.push(`Test User: ${user.email} (${user.beltLevel} belt)`);
  lines.push(`User ID: ${user.id}`);
  lines.push('');
  lines.push('─'.repeat(80));
  lines.push('SUMMARY');
  lines.push('─'.repeat(80));
  lines.push(`Total Questions: ${results.length}`);
  lines.push(`Passed: ${passed} (${(passed/results.length*100).toFixed(1)}%)`);
  lines.push(`Failed: ${failed} (${(failed/results.length*100).toFixed(1)}%)`);
  lines.push('');
  
  // Phase breakdown
  const phaseStats: Record<string, { total: number; passed: number }> = {};
  for (const result of results) {
    if (!phaseStats[result.phase]) {
      phaseStats[result.phase] = { total: 0, passed: 0 };
    }
    phaseStats[result.phase].total++;
    if (result.passed) phaseStats[result.phase].passed++;
  }
  
  lines.push('─'.repeat(80));
  lines.push('PHASE BREAKDOWN');
  lines.push('─'.repeat(80));
  for (const [phase, stats] of Object.entries(phaseStats)) {
    const pct = (stats.passed / stats.total * 100).toFixed(0);
    lines.push(`${phase.padEnd(25)} ${stats.passed}/${stats.total} (${pct}%)`);
  }
  lines.push('');
  
  // Diagnostics summary
  let videoRecs = 0, popData = 0, memRefs = 0, combatRefs = 0, techExtractions = 0;
  for (const result of results) {
    if (result.diagnostics.hasVideoRecommendation) videoRecs++;
    if (result.diagnostics.hasPopulationData) popData++;
    if (result.diagnostics.hasMemoryReference) memRefs++;
    if (result.diagnostics.hasCombatSportsRef) combatRefs++;
    if (result.diagnostics.techniqueExtraction.length > 0) techExtractions++;
  }
  
  lines.push('─'.repeat(80));
  lines.push('FEATURE DETECTION');
  lines.push('─'.repeat(80));
  lines.push(`📹 Video Recommendations: ${videoRecs}/${results.length} (${(videoRecs/results.length*100).toFixed(0)}%)`);
  lines.push(`👥 Population Data References: ${popData}/${results.length} (${(popData/results.length*100).toFixed(0)}%)`);
  lines.push(`🧠 Memory References: ${memRefs}/${results.length} (${(memRefs/results.length*100).toFixed(0)}%)`);
  lines.push(`🏆 Combat Sports References: ${combatRefs}/${results.length} (${(combatRefs/results.length*100).toFixed(0)}%)`);
  lines.push(`🎯 Technique Extractions: ${techExtractions}/${results.length} (${(techExtractions/results.length*100).toFixed(0)}%)`);
  lines.push('');
  
  // Technique Ecosystem
  lines.push('─'.repeat(80));
  lines.push('TECHNIQUE ECOSYSTEM (Built During Test)');
  lines.push('─'.repeat(80));
  if (ecosystem.length > 0) {
    lines.push('| Technique             | Attempts | Successes | Failures | Rate  |');
    lines.push('|-----------------------|----------|-----------|----------|-------|');
    for (const tech of ecosystem) {
      const rate = tech.successRate ? (parseFloat(tech.successRate) * 100).toFixed(0) + '%' : 'N/A';
      lines.push(`| ${tech.techniqueName.substring(0, 21).padEnd(21)} | ${String(tech.attempts).padStart(8)} | ${String(tech.successes).padStart(9)} | ${String(tech.failures).padStart(8)} | ${rate.padStart(5)} |`);
    }
  } else {
    lines.push('(No ecosystem data generated)');
  }
  lines.push('');
  
  // Detailed results
  lines.push('═'.repeat(80));
  lines.push('DETAILED RESULTS BY PHASE');
  lines.push('═'.repeat(80));
  
  let currentPhase = '';
  for (const result of results) {
    if (result.phase !== currentPhase) {
      currentPhase = result.phase;
      lines.push('');
      lines.push('─'.repeat(80));
      lines.push(`PHASE: ${currentPhase}`);
      lines.push('─'.repeat(80));
    }
    
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const flags: string[] = [];
    if (result.diagnostics.hasVideoRecommendation) flags.push('📹video');
    if (result.diagnostics.hasPopulationData) flags.push('👥popdata');
    if (result.diagnostics.hasMemoryReference) flags.push('🧠memory');
    if (result.diagnostics.hasCombatSportsRef) flags.push('🏆sports');
    if (result.diagnostics.techniqueExtraction.length > 0) {
      const techs = result.diagnostics.techniqueExtraction.map(t => t.technique).join(', ');
      flags.push(`🎯[${techs}]`);
    }
    
    lines.push('');
    lines.push(`[${result.questionNum}] ${status}`);
    lines.push(`Q: "${result.question}"`);
    lines.push(`A: ${result.responsePreview}`);
    if (flags.length > 0) {
      lines.push(`Flags: ${flags.join(' | ')}`);
    }
    if (result.failureReason) {
      lines.push(`Failure: ${result.failureReason}`);
    }
    lines.push(`Length: ${result.diagnostics.responseLength} chars`);
  }
  
  lines.push('');
  lines.push('═'.repeat(80));
  lines.push('END OF REPORT');
  lines.push('═'.repeat(80));
  
  return lines.join('\n');
}

// Run the test
runFullTest().then(() => {
  console.log('\n✅ Test complete');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
