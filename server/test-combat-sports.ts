/**
 * Combat Sports Intelligence Test Suite
 * Tests that ADCC, IBJJF, and competitor questions are NOT treated as off-topic
 */

import { db } from './db';
import { sql, eq } from 'drizzle-orm';
import { bjjUsers } from '@shared/schema';
import Anthropic from '@anthropic-ai/sdk';
import { buildProfessorOSPrompt } from './utils/professorOSPrompt';
import { searchVideos, fallbackSearch, getSessionContext, updateSessionContext } from './videoSearch';

const TEST_USER_ID = 'c2cfc0c7-96f2-4f02-8251-bf30b8f6860a';

// ═══════════════════════════════════════════════════════════════
// COMBAT SPORTS KEYWORD DETECTION (must match ai-chat-claude.ts)
// ═══════════════════════════════════════════════════════════════

const COMBAT_SPORTS_KEYWORDS = [
  'adcc', 'ibjjf', 'worlds', 'mundials', 'pans', 'euros', 'brasileiros',
  'world championship', 'european championship', 'pan american',
  'no-gi worlds', 'gi worlds', 'absolute', 'superfight',
  'ufc', 'mma', 'bellator', 'one championship', 'who\'s number one', 'wno',
  'eby', 'ebi', 'polaris', 'kasai', 'f2w', 'fight to win', 'third coast grappling',
  'combat jiu jitsu', 'cjj', 'quintet', 'grappling industries', 'naga', 'good fight',
  'gordon ryan', 'andre galvao', 'marcus buchecha', 'buchecha',
  'mikey musumeci', 'craig jones', 'kade ruotolo', 'tye ruotolo', 'ruotolo',
  'john danaher', 'roger gracie', 'marcelo garcia', 'bernardo faria',
  'kaynan duarte', 'nicholas meregali', 'meregali', 'felipe pena', 'preguica',
  'ffion davies', 'gabi garcia', 'bia mesquita', 'bia basilio', 'mayssa basilio',
  'nicky ryan', 'nicky rod', 'nicholas rodriguez', 'lachlan giles',
  'giancarlo bodoni', 'bodoni', 'diogo reis', 'micael galvao', 'mica',
  'gordon', 'danaher', 'galvao', 'musumeci',
  'tournament', 'competition', 'match', 'competitor', 'champion', 'medal',
  'gold', 'silver', 'bronze', 'division', 'weight class', 'superfight',
  'last match', 'recent match', 'who won', 'results', 'bracket'
];

function detectCombatSports(message: string): { isCombatSports: boolean; keywords: string[] } {
  const messageLower = message.toLowerCase();
  const matchedKeywords: string[] = [];
  
  for (const keyword of COMBAT_SPORTS_KEYWORDS) {
    if (messageLower.includes(keyword)) {
      matchedKeywords.push(keyword);
    }
  }
  
  return {
    isCombatSports: matchedKeywords.length > 0,
    keywords: matchedKeywords
  };
}

// ═══════════════════════════════════════════════════════════════
// TEST DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const COMBAT_SPORTS_TESTS = [
  {
    id: 'A',
    message: 'Who won ADCC 2024?',
    expectedKeywords: ['adcc', 'who won'],
    expectCombatSports: true
  },
  {
    id: 'B',
    message: "What's happening in IBJJF this year?",
    expectedKeywords: ['ibjjf'],
    expectCombatSports: true
  },
  {
    id: 'C',
    message: 'How did Gordon Ryan do in his last competition?',
    expectedKeywords: ['gordon ryan', 'gordon', 'competition'],
    expectCombatSports: true
  }
];

async function runCombatSportsTest(test: typeof COMBAT_SPORTS_TESTS[0]) {
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`TEST ${test.id}: "${test.message}"`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  
  // Step 1: Topic Detection
  const topicResult = detectCombatSports(test.message);
  console.log('🔍 TOPIC DETECTION:');
  console.log(`   Combat Sports Detected: ${topicResult.isCombatSports ? '✅ YES' : '❌ NO'}`);
  console.log(`   Keywords Found: ${topicResult.keywords.join(', ') || 'none'}`);
  console.log(`   Expected: ${test.expectCombatSports ? 'Combat Sports' : 'Off-Topic'}`);
  console.log(`   Status: ${topicResult.isCombatSports === test.expectCombatSports ? '✅ PASS' : '❌ FAIL'}`);
  
  // Step 2: Load user and build prompt
  const [user] = await db.select().from(bjjUsers).where(eq(bjjUsers.id, TEST_USER_ID));
  if (!user) {
    console.log('❌ Test user not found');
    return { pass: false, reason: 'User not found' };
  }
  
  // Step 3: Video search
  const sessionContext = getSessionContext(TEST_USER_ID);
  let videoSearchResult = await searchVideos({
    userMessage: test.message,
    conversationContext: {
      userGiNogi: (user as any).style || 'both',
      sessionFocus: sessionContext.sessionFocus,
      recommendedVideoIds: sessionContext.recommendedVideoIds
    }
  });
  
  if (videoSearchResult.videos.length === 0) {
    videoSearchResult = await fallbackSearch(test.message);
  }
  
  console.log('\n🎥 VIDEO SEARCH:');
  console.log(`   Videos Found: ${videoSearchResult.videos.length}`);
  console.log(`   Search Intent: ${JSON.stringify(videoSearchResult.searchIntent)}`);
  
  // Step 4: Build system prompt
  const heightDisplay = (user as any).heightFeet && (user as any).heightInches 
    ? `${(user as any).heightFeet}'${(user as any).heightInches}"`
    : null;
  const daysSinceJoined = user.createdAt 
    ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const weeksSinceJoined = Math.floor(daysSinceJoined / 7);
  
  const videoLibrary = videoSearchResult.videos.map((v: any) => ({
    id: v.id,
    techniqueName: v.techniqueName || v.title,
    title: v.techniqueName || v.title,
    instructorName: v.instructorName,
    techniqueType: v.techniqueType,
    positionCategory: v.positionCategory,
    qualityScore: v.qualityScore,
    videoUrl: v.videoUrl,
    tags: v.tags || [],
    relevanceScore: Number(v.qualityScore) || 0
  }));
  
  const systemPrompt = await buildProfessorOSPrompt(TEST_USER_ID, (user as any).biggestStruggle || null, {
    includeLearningInsights: true,
    newsItems: [],
    preloadedContext: {
      user: user as any,
      videos: videoLibrary,
      daysSinceJoined,
      weeksSinceJoined,
      heightDisplay
    },
    videoSearchContext: {
      totalMatches: videoSearchResult.totalMatches,
      searchIntent: videoSearchResult.searchIntent
    }
  });
  
  console.log('\n📝 SYSTEM PROMPT:');
  console.log(`   Length: ${systemPrompt.length.toLocaleString()} chars`);
  
  // Check if off-topic section mentions this is NOT off-topic
  const hasCompetitionGuidance = systemPrompt.includes('ADCC') && 
    systemPrompt.includes('NOT OFF-TOPIC') || systemPrompt.includes('*NOT* OFF-TOPIC');
  console.log(`   Competition Guidance: ${hasCompetitionGuidance ? '✅ YES' : '❌ NO'}`);
  
  // Step 5: Call Claude API
  console.log('\n🤖 CALLING CLAUDE API...');
  const startTime = Date.now();
  
  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: test.message }]
    });
    
    const apiTime = Date.now() - startTime;
    console.log(`   Response Time: ${apiTime}ms`);
    
    const textContent = response.content.find(c => c.type === 'text');
    const responseText = textContent?.text || '';
    
    console.log('\n📤 PROFESSOR OS RESPONSE:');
    console.log(`   ${responseText.substring(0, 500)}${responseText.length > 500 ? '...' : ''}`);
    
    // Check if response contains off-topic redirect vs actual answer
    const isOffTopicRedirect = responseText.toLowerCase().includes('outside my guard') ||
      responseText.toLowerCase().includes('not a general assistant') ||
      responseText.toLowerCase().includes('training questions');
    
    const containsRealAnswer = responseText.toLowerCase().includes('gordon') ||
      responseText.toLowerCase().includes('adcc') ||
      responseText.toLowerCase().includes('ibjjf') ||
      responseText.toLowerCase().includes('bodoni') ||
      responseText.toLowerCase().includes('galvao') ||
      responseText.toLowerCase().includes('gold') ||
      responseText.toLowerCase().includes('superfight') ||
      responseText.toLowerCase().includes('champion');
    
    console.log('\n📊 RESPONSE ANALYSIS:');
    console.log(`   Off-Topic Redirect: ${isOffTopicRedirect ? '❌ YES (BAD)' : '✅ NO (GOOD)'}`);
    console.log(`   Contains Real Answer: ${containsRealAnswer ? '✅ YES (GOOD)' : '❌ NO (BAD)'}`);
    
    const testPassed = !isOffTopicRedirect && containsRealAnswer;
    console.log(`\n   OVERALL: ${testPassed ? '✅ PASS - Combat sports properly handled!' : '❌ FAIL - Still treating as off-topic!'}`);
    
    return { 
      pass: testPassed, 
      topicDetection: topicResult,
      isOffTopicRedirect,
      containsRealAnswer,
      responseTime: apiTime
    };
    
  } catch (error: any) {
    console.log(`   ❌ ERROR: ${error.message}`);
    return { pass: false, reason: error.message };
  }
}

async function runAllTests() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏆 COMBAT SPORTS INTELLIGENCE TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Testing that ADCC, IBJJF, and competitor questions are NOT off-topic\n');
  
  const results: any[] = [];
  
  for (const test of COMBAT_SPORTS_TESTS) {
    const result = await runCombatSportsTest(test);
    results.push({ test: test.id, message: test.message, ...result });
  }
  
  // Summary
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 FINAL SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  
  for (const r of results) {
    console.log(`TEST ${r.test}: ${r.pass ? '✅ PASS' : '❌ FAIL'} - "${r.message}"`);
    if (r.topicDetection) {
      console.log(`   Combat Sports Keywords: ${r.topicDetection.keywords.join(', ')}`);
    }
  }
  
  console.log(`\n${passed}/${results.length} tests passed`);
  
  if (failed === 0) {
    console.log('\n✅ ALL COMBAT SPORTS TESTS PASSED!');
    console.log('   ADCC, IBJJF, and competitor questions are now properly handled.');
  } else {
    console.log('\n❌ SOME TESTS FAILED - Combat sports still being treated as off-topic');
  }
  
  console.log('\n');
}

runAllTests().catch(console.error);
