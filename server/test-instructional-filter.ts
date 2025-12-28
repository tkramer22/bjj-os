/**
 * Quick test: Does the system filter instructional vs entertainment for elite instructors?
 */

import { analyzeContentQuality } from './curation/content-quality-analyzer';

console.log('\n════════════════════════════════════════════════════════════════════════════════');
console.log('🧪 TESTING INSTRUCTIONAL vs ENTERTAINMENT FILTER');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

const tests = [
  {
    name: 'Elite - Instructional (SHOULD ACCEPT)',
    title: 'Gordon Ryan - Mount Escapes',
    description: 'Learn the fundamentals of escaping mount position with proper technique',
    tier: 'elite' as const,
    expected: { instructional: true, score: '>=75' }
  },
  {
    name: 'Elite - Highlight Reel (SHOULD REJECT)',
    title: 'Lachlan Giles Being a Wizard for 12 Minutes Straight',
    description: 'Compilation of Lachlan dominating opponents at ADCC',
    tier: 'elite' as const,
    expected: { instructional: false, score: '25' }
  },
  {
    name: 'Elite - Q&A (SHOULD REJECT)',
    title: 'Gordon Ryan Q&A Session',
    description: 'Answering questions from fans about training and competition',
    tier: 'elite' as const,
    expected: { instructional: false, score: '25' }
  },
  {
    name: 'Elite - Match Footage (SHOULD REJECT)',
    title: 'Marcelo Garcia VS Lucas Leite World Championship 2011',
    description: 'Full match from the World Championship',
    tier: 'elite' as const,
    expected: { instructional: false, score: '25' }
  },
  {
    name: 'Elite - Instructional with Short Title (SHOULD ACCEPT)',
    title: 'Side Control Escapes',
    description: 'Escape techniques from side control',
    tier: 'elite' as const,
    expected: { instructional: true, score: '>=75' }
  },
  {
    name: 'Unknown - Instructional (TRADITIONAL SCORING)',
    title: 'Complete Step-by-Step Guide to Armbar from Guard',
    description: 'Detailed breakdown of armbar setup, grips, and finish',
    tier: 'unknown' as const,
    expected: { instructional: true, score: '>=70' }
  },
  {
    name: 'Elite - Instructional Comparison with "vs" (SHOULD ACCEPT)',
    title: 'Armbar vs Triangle – When to Use Each',
    description: 'Comparing two submission options and explaining when each is most effective',
    tier: 'elite' as const,
    expected: { instructional: true, score: '>=75' }
  },
  {
    name: 'Elite - Competition Match with "vs" (SHOULD REJECT)',
    title: 'Gordon Ryan vs Felipe Pena - ADCC Finals Match',
    description: 'Full match from ADCC championship finals',
    tier: 'elite' as const,
    expected: { instructional: false, score: '25' }
  }
];

let passed = 0;
let failed = 0;

tests.forEach((test, i) => {
  console.log(`\n[${ i + 1}/${tests.length}] ${test.name}`);
  console.log(`   Title: "${test.title}"`);
  console.log(`   Tier: ${test.tier}`);
  
  const result = analyzeContentQuality(test.title, test.description, test.tier);
  
  console.log(`   Result:`);
  console.log(`     - Score: ${result.score}/100`);
  console.log(`     - Is Instructional: ${result.isInstructional ? 'YES' : 'NO'}`);
  console.log(`     - Content Type: ${result.contentType}`);
  console.log(`     - Reasons Good: ${result.reasonsGood.join(', ') || 'None'}`);
  console.log(`     - Reasons Bad: ${result.reasonsBad.join(', ') || 'None'}`);
  
  // Validate
  const instructionalMatch = result.isInstructional === test.expected.instructional;
  const scoreMatch = test.expected.score.startsWith('>=') 
    ? result.score >= parseInt(test.expected.score.slice(2))
    : result.score === parseInt(test.expected.score);
  
  if (instructionalMatch && scoreMatch) {
    console.log(`   ✅ PASS`);
    passed++;
  } else {
    console.log(`   ❌ FAIL`);
    if (!instructionalMatch) {
      console.log(`      Expected instructional: ${test.expected.instructional}, got: ${result.isInstructional}`);
    }
    if (!scoreMatch) {
      console.log(`      Expected score ${test.expected.score}, got: ${result.score}`);
    }
    failed++;
  }
});

console.log('\n════════════════════════════════════════════════════════════════════════════════');
console.log(`📊 TEST RESULTS: ${passed}/${tests.length} passed`);
console.log('════════════════════════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.error(`❌ ${failed} tests failed`);
  process.exit(1);
} else {
  console.log(`✅ All tests passed!`);
}
