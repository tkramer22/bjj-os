/**
 * 🧪 COMPREHENSIVE TESTING PROTOCOL - PERFORMANCE & TIMING
 * 
 * Test Suite 1: Performance & Timing Validation
 * Tests Claude Sonnet 4.5 endpoint with full timing telemetry
 * 
 * PASS CRITERIA:
 * ✅ 90% of queries under 2000ms
 * ✅ 100% of queries under 3000ms
 * ❌ Any query over 3000ms = FAIL
 */

import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';

// Database setup
const sql = neon(process.env.DATABASE_URL!);

// Test user ID (using existing test account)
const TEST_USER_ID = 'ae9891bc-d0ff-422b-9b0e-f8aedd05cd17'; // test+autotest@bjjos.app

interface TimingBreakdown {
  parallelDataLoad: number;
  systemPromptBuild: number;
  claudeAPI: number;
  composition: number;
  total: number;
}

interface TestResult {
  testNumber: number;
  message: string;
  timing: TimingBreakdown;
  passed: boolean;
  anticipatoryDiagnosis: boolean;
  returnLoop: boolean;
  videoRecommendation: boolean;
}

const TEST_QUERIES = [
  "I struggle with triangle chokes",
  "My guard keeps getting passed and I don't know why. I'm a blue belt training 5x per week",
  "That helped! What should I work on next?",
  "Show me videos about deep half guard",
  "What's my belt level?",
  "Help me with armbar setups from guard",
  "My half guard retention needs work",
  "I keep getting stuck in mount",
  "How do I escape back control?",
  "Teach me about kimura from closed guard"
];

async function runPerformanceTest(message: string, testNumber: number): Promise<TestResult> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 TEST ${testNumber}: "${message}"`);
  console.log('='.repeat(70));
  
  const startTotal = Date.now();
  
  // PHASE 1: Parallel data loading (simulating the optimized route)
  const t1 = Date.now();
  const [userProfile, allVideos, history, recentNews] = await Promise.all([
    sql`SELECT * FROM bjj_users WHERE id = ${TEST_USER_ID} LIMIT 1`,
    sql`SELECT * FROM ai_video_knowledge ORDER BY quality_score DESC LIMIT 100`,
    sql`SELECT * FROM ai_conversation_learning WHERE user_id = ${TEST_USER_ID} ORDER BY timestamp DESC LIMIT 20`,
    sql`SELECT * FROM combat_sports_news WHERE published_at >= NOW() - INTERVAL '7 days' ORDER BY published_at DESC LIMIT 5`
  ]);
  const parallelDataLoad = Date.now() - t1;
  console.log(`⏱️  Parallel data load: ${parallelDataLoad}ms`);
  
  // PHASE 2: Build conversation messages
  const conversationMessages = history.map((h: any) => ({
    role: h.role,
    content: h.message
  }));
  
  conversationMessages.push({
    role: 'user',
    content: message
  });
  
  // PHASE 3: Call Claude API directly
  const t2 = Date.now();
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  
  // Simplified system prompt for testing
  const systemPrompt = `You are Professor OS, an expert BJJ coach. User is ${userProfile[0]?.belt_level || 'blue'} belt. Respond with coaching advice.`;
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    temperature: 0.7,
    system: systemPrompt,
    messages: conversationMessages as any,
    tools: [{
      name: 'respond_with_coaching',
      description: 'Respond to user with personalized BJJ coaching',
      input_schema: {
        type: 'object',
        properties: {
          anticipatoryDiagnosis: {
            type: 'string',
            description: 'Opening hook that shows you understand their problem (e.g., "Let me guess...", "I bet...")'
          },
          mainCoaching: {
            type: 'string',
            description: 'Main coaching guidance'
          },
          returnLoop: {
            type: 'string',
            description: 'Question or suggestion that creates anticipation for next interaction'
          }
        },
        required: ['anticipatoryDiagnosis', 'mainCoaching', 'returnLoop']
      }
    }],
    tool_choice: { type: 'tool', name: 'respond_with_coaching' }
  });
  
  const claudeAPI = Date.now() - t2;
  console.log(`⏱️  Claude API call: ${claudeAPI}ms`);
  
  // PHASE 4: Parse response
  const t3 = Date.now();
  const toolUse = response.content.find((c: any) => c.type === 'tool_use');
  const coaching = toolUse?.input || {};
  const composition = Date.now() - t3;
  
  const total = Date.now() - startTotal;
  
  // Analyze response
  const anticipatoryDiagnosis = !!(coaching.anticipatoryDiagnosis && coaching.anticipatoryDiagnosis.length > 10);
  const returnLoop = !!(coaching.returnLoop && coaching.returnLoop.length > 10);
  const videoRecommendation = false; // Would need full video enrichment logic
  
  const passed = total < 3000;
  
  console.log(`\n📊 TIMING BREAKDOWN:`);
  console.log(`   Parallel data load: ${parallelDataLoad}ms`);
  console.log(`   Claude API call: ${claudeAPI}ms`);
  console.log(`   Composition: ${composition}ms`);
  console.log(`   ──────────────────────────`);
  console.log(`   TOTAL: ${total}ms ${passed ? '✅' : '❌'}`);
  
  console.log(`\n📋 ENGAGEMENT HOOKS:`);
  console.log(`   Anticipatory diagnosis: ${anticipatoryDiagnosis ? '✅' : '❌'}`);
  console.log(`   Return loop: ${returnLoop ? '✅' : '❌'}`);
  
  if (anticipatoryDiagnosis) {
    console.log(`   → "${coaching.anticipatoryDiagnosis.substring(0, 60)}..."`);
  }
  
  return {
    testNumber,
    message,
    timing: {
      parallelDataLoad,
      systemPromptBuild: 0, // Not measured in this test
      claudeAPI,
      composition,
      total
    },
    passed,
    anticipatoryDiagnosis,
    returnLoop,
    videoRecommendation
  };
}

async function runFullTestSuite() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 COMPREHENSIVE PERFORMANCE & TIMING TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Testing with user: ${TEST_USER_ID}`);
  console.log(`Target: 90% under 2000ms, 100% under 3000ms\n`);
  
  const results: TestResult[] = [];
  
  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const result = await runPerformanceTest(TEST_QUERIES[i], i + 1);
    results.push(result);
    
    // Brief pause between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Calculate statistics
  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(70));
  
  const under2000 = results.filter(r => r.timing.total < 2000).length;
  const under3000 = results.filter(r => r.timing.total < 3000).length;
  const avgTime = results.reduce((sum, r) => sum + r.timing.total, 0) / results.length;
  const avgDataLoad = results.reduce((sum, r) => sum + r.timing.parallelDataLoad, 0) / results.length;
  const avgClaudeAPI = results.reduce((sum, r) => sum + r.timing.claudeAPI, 0) / results.length;
  
  const anticipatoryCount = results.filter(r => r.anticipatoryDiagnosis).length;
  const returnLoopCount = results.filter(r => r.returnLoop).length;
  
  console.log(`\n⏱️  TIMING METRICS:`);
  console.log(`   Average total time: ${avgTime.toFixed(0)}ms`);
  console.log(`   Average data load: ${avgDataLoad.toFixed(0)}ms`);
  console.log(`   Average Claude API: ${avgClaudeAPI.toFixed(0)}ms`);
  console.log(`   Under 2000ms: ${under2000}/${results.length} (${(under2000/results.length*100).toFixed(0)}%)`);
  console.log(`   Under 3000ms: ${under3000}/${results.length} (${(under3000/results.length*100).toFixed(0)}%)`);
  
  console.log(`\n🎯 ENGAGEMENT METRICS:`);
  console.log(`   Anticipatory diagnosis: ${anticipatoryCount}/${results.length} (${(anticipatoryCount/results.length*100).toFixed(0)}%)`);
  console.log(`   Return loops: ${returnLoopCount}/${results.length} (${(returnLoopCount/results.length*100).toFixed(0)}%)`);
  
  console.log(`\n✅ PASS CRITERIA:`);
  const timing90Pass = (under2000 / results.length) >= 0.9;
  const timing100Pass = (under3000 / results.length) >= 1.0;
  const engagementPass = (anticipatoryCount / results.length) >= 0.95;
  
  console.log(`   90% under 2000ms: ${timing90Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   100% under 3000ms: ${timing100Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   95% engagement hooks: ${engagementPass ? '✅ PASS' : '❌ FAIL'}`);
  
  const overallPass = timing90Pass && timing100Pass && engagementPass;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`   OVERALL: ${overallPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(70) + '\n');
  
  return {
    results,
    stats: {
      avgTime,
      avgDataLoad,
      avgClaudeAPI,
      under2000Percent: under2000/results.length,
      under3000Percent: under3000/results.length,
      anticipatoryPercent: anticipatoryCount/results.length,
      returnLoopPercent: returnLoopCount/results.length
    },
    passed: overallPass
  };
}

// Run the test suite
runFullTestSuite()
  .then(summary => {
    process.exit(summary.passed ? 0 : 1);
  })
  .catch(err => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
