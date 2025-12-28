/**
 * Professor OS FAST 145+ Question Simulation Test
 * Optimized for speed - parallel processing and reduced delays
 */

import { db } from './db';
import { bjjUsers, userTechniqueEcosystem } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { extractTechniquesFromMessage } from './technique-extraction';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// All test questions organized by phase
const ALL_QUESTIONS: { phase: string; questions: string[] }[] = [
  { phase: 'ONBOARDING', questions: [
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
  ]},
  { phase: 'BASIC_TECHNIQUES', questions: [
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
  ]},
  { phase: 'INTERMEDIATE', questions: [
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
  ]},
  { phase: 'INSTRUCTOR_REQUESTS', questions: [
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
  ]},
  { phase: 'PROBLEMS', questions: [
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
  ]},
  { phase: 'FRUSTRATION', questions: [
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
  ]},
  { phase: 'COMPETITION', questions: [
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
  ]},
  { phase: 'BODY_TYPE', questions: [
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
  ]},
  { phase: 'TRAINING', questions: [
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
  ]},
  { phase: 'INJURIES', questions: [
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
  ]},
  { phase: 'ADVANCED', questions: [
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
  ]},
  { phase: 'SUCCESS', questions: [
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
  ]},
  { phase: 'POPULATION_INTELLIGENCE', questions: [
    "How do blue belts typically do with triangles?",
    "What's the most common mistake with hip bumps?",
    "Is the knee slice a high percentage pass?",
    "How long does it take to get good at armbars?",
    "What techniques work well for shorter stocky guys?"
  ]},
  { phase: 'MULTI_SESSION', questions: [
    "Hey I'm back after a few days",
    "What did we talk about earlier?",
    "Remember my guard passing problem?",
    "What techniques have I been working on?",
    "Can you remind me what I should focus on?"
  ]},
  { phase: 'COMBAT_SPORTS', questions: [
    "Who are the top competitors at 77kg right now?",
    "What happened at the last IBJJF Worlds?",
    "Is Mikey Musumeci still competing?",
    "Any big upsets recently in ADCC?",
    "Who should I watch to learn modern leg locks?"
  ]}
];

interface TestResult {
  phase: string;
  questionNum: number;
  question: string;
  responsePreview: string;
  passed: boolean;
  flags: string[];
  techniqueExtraction: string[];
  responseLength: number;
  failureReason?: string;
}

const SYSTEM_PROMPT = `You are Professor OS, an elite AI BJJ coach powered by the accumulated wisdom of the sport's greatest practitioners.

USER: Blue belt, balanced training style, average body type, focusing on general improvement.

PERSONALITY:
- Speak with authority but warmth
- Use appropriate BJJ terminology for their belt level
- Reference specific techniques and positions
- When relevant, mention elite instructors by name
- Be encouraging but realistic

Keep responses focused and actionable. Aim for 150-250 words.`;

async function sendBatch(
  questions: { phase: string; question: string; idx: number }[],
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<{ question: string; phase: string; idx: number; response: string }[]> {
  const results: { question: string; phase: string; idx: number; response: string }[] = [];
  
  // Process in parallel batches of 5
  const BATCH_SIZE = 5;
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (q) => {
      try {
        const messages = [
          ...history.slice(-10), // Keep last 5 exchanges
          { role: 'user' as const, content: q.question }
        ];
        
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages
        });
        
        const textBlock = response.content.find(b => b.type === 'text');
        return { ...q, response: textBlock?.text || 'No response' };
      } catch (error) {
        return { ...q, response: `ERROR: ${error instanceof Error ? error.message : 'Unknown'}` };
      }
    });
    
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
    
    // Update history with batch results
    for (const r of batchResults) {
      history.push({ role: 'user', content: r.question });
      history.push({ role: 'assistant', content: r.response });
    }
    
    // Trim history
    while (history.length > 20) history.shift();
    
    // Progress indicator
    console.log(`   Processed ${Math.min(i + BATCH_SIZE, questions.length)}/${questions.length}...`);
  }
  
  return results;
}

function evaluateResponse(phase: string, question: string, response: string): TestResult {
  const flags: string[] = [];
  
  if (/video|watch|check out|recommend|tutorial/i.test(response)) flags.push('📹video');
  if (/most\s+(people|practitioners|students)|typically|commonly|percentage|data/i.test(response)) flags.push('👥popdata');
  if (/earlier|before|mentioned|we discussed|you said|remember|last time/i.test(response)) flags.push('🧠memory');
  if (/ADCC|IBJJF|Worlds|championship|competitor|medal|champion/i.test(response)) flags.push('🏆sports');
  
  const extraction = extractTechniquesFromMessage(question);
  if (extraction.length > 0) {
    flags.push(`🎯[${extraction.map(e => e.technique).join(',')}]`);
  }
  
  let passed = true;
  let failureReason: string | undefined;
  
  if (response.length < 50) {
    passed = false;
    failureReason = 'Response too short';
  }
  if (response.startsWith('ERROR:')) {
    passed = false;
    failureReason = response;
  }
  
  return {
    phase,
    questionNum: 0,
    question,
    responsePreview: response.substring(0, 150) + (response.length > 150 ? '...' : ''),
    passed,
    flags,
    techniqueExtraction: extraction.map(e => e.technique),
    responseLength: response.length,
    failureReason
  };
}

async function runTest() {
  const startTime = Date.now();
  console.log('═'.repeat(70));
  console.log('🥋 PROFESSOR OS - FAST 145+ QUESTION SIMULATION TEST');
  console.log('═'.repeat(70));
  console.log(`Started: ${new Date().toISOString()}\n`);
  
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
  console.log(`👤 Test User: ${user.email} (${user.beltLevel} belt)\n`);
  
  // Clear ecosystem
  await db.delete(userTechniqueEcosystem).where(eq(userTechniqueEcosystem.userId, user.id));
  
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  const allResults: TestResult[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let globalIdx = 0;
  
  // Process each phase
  for (const { phase, questions } of ALL_QUESTIONS) {
    console.log(`\n━━━ PHASE: ${phase} (${questions.length}q) ━━━`);
    
    const questionsWithIdx = questions.map((q, i) => ({ phase, question: q, idx: globalIdx + i }));
    const responses = await sendBatch(questionsWithIdx, history);
    
    for (let i = 0; i < responses.length; i++) {
      const r = responses[i];
      const result = evaluateResponse(r.phase, r.question, r.response);
      result.questionNum = i + 1;
      allResults.push(result);
      
      if (result.passed) {
        totalPassed++;
        console.log(`   [${i+1}] ✅ ${result.flags.join(' ')} (${result.responseLength}c)`);
      } else {
        totalFailed++;
        console.log(`   [${i+1}] ❌ ${result.failureReason}`);
      }
    }
    
    globalIdx += questions.length;
  }
  
  // Generate report
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const report = generateReport(allResults, totalPassed, totalFailed, user, elapsed);
  
  fs.writeFileSync('public/professor-os-FINAL-145-test.txt', report);
  
  console.log('\n' + '═'.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('═'.repeat(70));
  console.log(`Total: ${allResults.length} | Passed: ${totalPassed} (${(totalPassed/allResults.length*100).toFixed(1)}%) | Failed: ${totalFailed}`);
  console.log(`Time: ${elapsed} minutes`);
  console.log(`\n✅ Saved to: public/professor-os-FINAL-145-test.txt`);
}

function generateReport(results: TestResult[], passed: number, failed: number, user: any, elapsed: string): string {
  const lines: string[] = [];
  
  lines.push('═'.repeat(80));
  lines.push('PROFESSOR OS - FINAL 145+ QUESTION SIMULATION TEST RESULTS');
  lines.push('═'.repeat(80));
  lines.push('');
  lines.push(`Test Date: ${new Date().toISOString()}`);
  lines.push(`Duration: ${elapsed} minutes`);
  lines.push(`Test User: ${user.email} (${user.beltLevel} belt)`);
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
  for (const r of results) {
    if (!phaseStats[r.phase]) phaseStats[r.phase] = { total: 0, passed: 0 };
    phaseStats[r.phase].total++;
    if (r.passed) phaseStats[r.phase].passed++;
  }
  
  lines.push('─'.repeat(80));
  lines.push('PHASE BREAKDOWN');
  lines.push('─'.repeat(80));
  for (const [phase, stats] of Object.entries(phaseStats)) {
    lines.push(`${phase.padEnd(25)} ${stats.passed}/${stats.total} (${(stats.passed/stats.total*100).toFixed(0)}%)`);
  }
  lines.push('');
  
  // Feature detection
  let videoRecs = 0, popData = 0, memRefs = 0, combatRefs = 0, techExtractions = 0;
  for (const r of results) {
    if (r.flags.some(f => f.includes('video'))) videoRecs++;
    if (r.flags.some(f => f.includes('popdata'))) popData++;
    if (r.flags.some(f => f.includes('memory'))) memRefs++;
    if (r.flags.some(f => f.includes('sports'))) combatRefs++;
    if (r.flags.some(f => f.includes('🎯'))) techExtractions++;
  }
  
  lines.push('─'.repeat(80));
  lines.push('FEATURE DETECTION');
  lines.push('─'.repeat(80));
  lines.push(`📹 Video Recommendations: ${videoRecs}/${results.length} (${(videoRecs/results.length*100).toFixed(0)}%)`);
  lines.push(`👥 Population Data: ${popData}/${results.length} (${(popData/results.length*100).toFixed(0)}%)`);
  lines.push(`🧠 Memory References: ${memRefs}/${results.length} (${(memRefs/results.length*100).toFixed(0)}%)`);
  lines.push(`🏆 Combat Sports Refs: ${combatRefs}/${results.length} (${(combatRefs/results.length*100).toFixed(0)}%)`);
  lines.push(`🎯 Technique Extractions: ${techExtractions}/${results.length} (${(techExtractions/results.length*100).toFixed(0)}%)`);
  lines.push('');
  
  // Detailed results
  lines.push('═'.repeat(80));
  lines.push('DETAILED RESULTS');
  lines.push('═'.repeat(80));
  
  let currentPhase = '';
  for (const r of results) {
    if (r.phase !== currentPhase) {
      currentPhase = r.phase;
      lines.push('');
      lines.push(`─── ${currentPhase} ───`);
    }
    
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    lines.push('');
    lines.push(`[${r.questionNum}] ${status} | ${r.responseLength}c | ${r.flags.join(' ')}`);
    lines.push(`Q: "${r.question}"`);
    lines.push(`A: ${r.responsePreview}`);
    if (r.failureReason) lines.push(`FAIL: ${r.failureReason}`);
  }
  
  lines.push('');
  lines.push('═'.repeat(80));
  lines.push('END OF REPORT');
  lines.push('═'.repeat(80));
  
  return lines.join('\n');
}

runTest().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
