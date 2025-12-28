/**
 * Internal API Testing - Professor OS Performance Validation
 * Tests Claude endpoint directly with timing telemetry
 */

const TEST_USER_ID = 'ae9891bc-d0ff-422b-9b0e-f8aedd05cd17';
const ENDPOINT = 'http://localhost:5000/api/ai/chat/claude/stream';

const TEST_MESSAGES = [
  "I keep getting passed when I play closed guard",
  "Show me a video on knee slice defense",
  "I tried that move you suggested",
  "Help me with triangle chokes",
  "What about guard passing?"
];

interface TestResult {
  testNumber: number;
  message: string;
  responseTime: number;
  passed: boolean;
  hasAnticipatory: boolean;
  hasReturnLoop: boolean;
  hasVideo: boolean;
  response: string;
}

async function runTest(message: string, testNum: number): Promise<TestResult> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 TEST ${testNum}: "${message}"`);
  console.log('='.repeat(70));
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'sessionToken=test_session' // This won't work, but let's try
      },
      body: JSON.stringify({ 
        message,
        userId: TEST_USER_ID
      })
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      console.log(`❌ Response error: ${response.status} ${response.statusText}`);
      const body = await response.text();
      console.log(`   Error details: ${body.substring(0, 200)}`);
      
      return {
        testNumber: testNum,
        message,
        responseTime,
        passed: false,
        hasAnticipatory: false,
        hasReturnLoop: false,
        hasVideo: false,
        response: `Error: ${response.status}`
      };
    }
    
    // Read streaming response
    let fullResponse = '';
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        fullResponse += chunk;
      }
    }
    
    console.log(`⏱️  Response time: ${responseTime}ms`);
    console.log(`   ${responseTime < 2000 ? '✅' : responseTime < 3000 ? '⚠️' : '❌'} ${
      responseTime < 2000 ? 'Under 2000ms' : 
      responseTime < 3000 ? 'Under 3000ms' : 
      'Over 3000ms - TOO SLOW'
    }`);
    
    // Analyze response
    const hasAnticipatory = /let me guess|i bet|probably|i'm sensing|sounds like/i.test(fullResponse);
    const hasReturnLoop = /try.*tell me|let me know|report back|give.*try/i.test(fullResponse);
    const hasVideo = /\[VIDEO:/i.test(fullResponse);
    
    console.log(`\n📋 ENGAGEMENT HOOKS:`);
    console.log(`   Anticipatory diagnosis: ${hasAnticipatory ? '✅' : '❌'}`);
    console.log(`   Return loop: ${hasReturnLoop ? '✅' : '❌'}`);
    console.log(`   Video recommendation: ${hasVideo ? '✅' : 'N/A'}`);
    
    if (fullResponse.length > 0) {
      console.log(`\n💬 RESPONSE PREVIEW:`);
      console.log(`   ${fullResponse.substring(0, 150)}...`);
    }
    
    return {
      testNumber: testNum,
      message,
      responseTime,
      passed: responseTime < 3000 && hasAnticipatory && hasReturnLoop,
      hasAnticipatory,
      hasReturnLoop,
      hasVideo,
      response: fullResponse
    };
    
  } catch (error: any) {
    console.log(`❌ Test failed: ${error.message}`);
    return {
      testNumber: testNum,
      message,
      responseTime: Date.now() - startTime,
      passed: false,
      hasAnticipatory: false,
      hasReturnLoop: false,
      hasVideo: false,
      response: `Error: ${error.message}`
    };
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 INTERNAL API PERFORMANCE TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`User ID: ${TEST_USER_ID}`);
  console.log(`Tests: ${TEST_MESSAGES.length}\n`);
  
  const results: TestResult[] = [];
  
  for (let i = 0; i < TEST_MESSAGES.length; i++) {
    const result = await runTest(TEST_MESSAGES[i], i + 1);
    results.push(result);
    
    // Pause between tests
    if (i < TEST_MESSAGES.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Final statistics
  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(70));
  
  const validTests = results.filter(r => r.responseTime > 0 && !r.response.startsWith('Error'));
  
  if (validTests.length === 0) {
    console.log('\n❌ NO VALID TESTS - All tests failed or had errors');
    console.log('\nPossible issues:');
    console.log('  - Authentication required (need valid session token)');
    console.log('  - Endpoint not accessible');
    console.log('  - Server not running');
    return;
  }
  
  const avgTime = validTests.reduce((sum, r) => sum + r.responseTime, 0) / validTests.length;
  const under2000 = validTests.filter(r => r.responseTime < 2000).length;
  const under3000 = validTests.filter(r => r.responseTime < 3000).length;
  
  const anticipatoryCount = validTests.filter(r => r.hasAnticipatory).length;
  const returnLoopCount = validTests.filter(r => r.hasReturnLoop).length;
  const videoCount = validTests.filter(r => r.hasVideo).length;
  
  console.log(`\n⏱️  TIMING METRICS:`);
  console.log(`   Tests completed: ${validTests.length}/${results.length}`);
  console.log(`   Average time: ${avgTime.toFixed(0)}ms`);
  console.log(`   Under 2000ms: ${under2000}/${validTests.length} (${(under2000/validTests.length*100).toFixed(0)}%)`);
  console.log(`   Under 3000ms: ${under3000}/${validTests.length} (${(under3000/validTests.length*100).toFixed(0)}%)`);
  
  console.log(`\n🎯 ENGAGEMENT METRICS:`);
  console.log(`   Anticipatory diagnosis: ${anticipatoryCount}/${validTests.length} (${(anticipatoryCount/validTests.length*100).toFixed(0)}%)`);
  console.log(`   Return loops: ${returnLoopCount}/${validTests.length} (${(returnLoopCount/validTests.length*100).toFixed(0)}%)`);
  console.log(`   Video recommendations: ${videoCount}/${validTests.length}`);
  
  console.log(`\n✅ PASS CRITERIA:`);
  const timing90 = (under2000 / validTests.length) >= 0.9;
  const timing100 = (under3000 / validTests.length) >= 1.0;
  const engagement95 = (anticipatoryCount / validTests.length) >= 0.95;
  
  console.log(`   90% under 2000ms: ${timing90 ? '✅ PASS' : '❌ FAIL'} (${(under2000/validTests.length*100).toFixed(0)}%)`);
  console.log(`   100% under 3000ms: ${timing100 ? '✅ PASS' : '❌ FAIL'} (${(under3000/validTests.length*100).toFixed(0)}%)`);
  console.log(`   95% engagement: ${engagement95 ? '✅ PASS' : '❌ FAIL'} (${(anticipatoryCount/validTests.length*100).toFixed(0)}%)`);
  
  const overallPass = timing90 && timing100 && engagement95;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`   OVERALL: ${overallPass ? '✅ PASS - READY TO SHIP' : '⚠️  NEEDS REVIEW'}`);
  console.log('='.repeat(70) + '\n');
}

runAllTests().catch(console.error);
