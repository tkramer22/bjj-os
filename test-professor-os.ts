/**
 * PROGRAMMATIC TEST OF PROFESSOR OS
 * Tests the chat endpoint with actual API calls
 */

import { db } from './server/db';
import { bjjUsers, aiVideoKnowledge } from './shared/schema';
import { desc, sql } from 'drizzle-orm';

const API_URL = 'http://localhost:5000';

interface TestResult {
  testName: string;
  userMessage: string;
  systemPromptLength: number;
  videosLoaded: number;
  firstThreeVideos: string[];
  gptResponse: string;
  responseLength: number;
  responseSentences: number;
  metadata?: any;
}

async function testProfessorOS() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🧪 PROFESSOR OS PROGRAMMATIC TESTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get a test user
  const [testUser] = await db.select()
    .from(bjjUsers)
    .limit(1);
  
  if (!testUser) {
    console.error('❌ No users in database - cannot test');
    return;
  }

  console.log(`✅ Test User: ${testUser.username} (${testUser.id})`);
  console.log(`   Belt: ${testUser.beltLevel} | Style: ${testUser.style}`);
  console.log(`   Struggle: ${testUser.biggestStruggle || 'none'}\n`);

  // Get video count from database
  const videoCount = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(sql`${aiVideoKnowledge.qualityScore} IS NOT NULL`);
  
  console.log(`📚 Videos in database: ${videoCount[0].count}\n`);

  const tests = [
    {
      name: 'Video Request',
      message: 'Any videos on passing guard?',
      expectVideos: true
    },
    {
      name: 'Greeting',
      message: 'Hey what\'s up?',
      expectVideos: false
    },
    {
      name: 'Diagnostic Flow',
      message: 'My mount escapes suck',
      expectVideos: false
    },
    {
      name: 'Profile Question',
      message: 'How tall am I?',
      expectVideos: false
    }
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`TEST: ${test.name}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`📝 User Message: "${test.message}"\n`);

    try {
      const response = await fetch(`${API_URL}/api/ai/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: testUser.id,
          message: test.message
        })
      });

      if (!response.ok) {
        console.error(`❌ API Error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`   Error: ${errorText}`);
        continue;
      }

      const data = await response.json();
      
      // Extract metadata if available
      const metadata = data.metadata || {};
      const promptLength = metadata.promptLength || 0;
      const videoCount = metadata.videoCount || 0;
      
      // Count sentences in response
      const gptResponse = data.content || data.message || '';
      const sentences = gptResponse.split(/[.!?]+/).filter((s: string) => s.trim().length > 0).length;

      console.log(`📊 RESPONSE METADATA:`);
      console.log(`   System Prompt Length: ${promptLength} characters`);
      console.log(`   Videos Loaded: ${videoCount} videos`);
      console.log(`   Response Time: ${metadata.responseTime || 'N/A'}ms`);
      console.log(`   Model: ${metadata.model || 'N/A'}`);

      console.log(`\n🤖 GPT-4o RESPONSE:`);
      console.log(`${'─'.repeat(70)}`);
      console.log(gptResponse);
      console.log(`${'─'.repeat(70)}`);
      
      console.log(`\n📈 RESPONSE ANALYSIS:`);
      console.log(`   Length: ${gptResponse.length} characters`);
      console.log(`   Sentences: ${sentences}`);
      console.log(`   Avg chars/sentence: ${Math.round(gptResponse.length / (sentences || 1))}`);

      // Check if it matches expectations
      console.log(`\n✅ EXPECTATIONS:`);
      if (test.expectVideos) {
        const hasVideoLink = gptResponse.includes('youtube.com') || gptResponse.includes('youtu.be') || gptResponse.includes('[VIDEO:');
        console.log(`   Should include video: ${hasVideoLink ? '✅ YES' : '❌ NO'}`);
      } else {
        console.log(`   Should be brief (2-4 sentences): ${sentences <= 4 ? '✅ YES' : '❌ NO'}`);
      }

      const hasRoboticLanguage = gptResponse.includes('I understand you\'re experiencing') || 
                                  gptResponse.includes('Let me provide') ||
                                  gptResponse.includes('I\'d be happy to') ||
                                  gptResponse.includes('In the meantime');
      console.log(`   No robotic language: ${!hasRoboticLanguage ? '✅ YES' : '❌ NO'}`);

      results.push({
        testName: test.name,
        userMessage: test.message,
        systemPromptLength: promptLength,
        videosLoaded: videoCount,
        firstThreeVideos: [],
        gptResponse,
        responseLength: gptResponse.length,
        responseSentences: sentences,
        metadata
      });

    } catch (error: any) {
      console.error(`❌ Test failed:`, error.message);
    }
  }

  // Summary
  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('📊 TEST SUMMARY');
  console.log(`${'═'.repeat(70)}\n`);

  for (const result of results) {
    console.log(`${result.testName}:`);
    console.log(`  Prompt: ${result.systemPromptLength} chars | Videos: ${result.videosLoaded}`);
    console.log(`  Response: ${result.responseLength} chars, ${result.responseSentences} sentences`);
    console.log();
  }

  console.log('🎯 KEY FINDINGS:');
  const avgPromptLength = results.reduce((sum, r) => sum + r.systemPromptLength, 0) / results.length;
  const avgVideos = results.reduce((sum, r) => sum + r.videosLoaded, 0) / results.length;
  
  console.log(`   Average Prompt Length: ${Math.round(avgPromptLength)} characters`);
  console.log(`   Average Videos Loaded: ${Math.round(avgVideos)} videos`);
  
  if (avgPromptLength < 1000) {
    console.log(`\n🚨 WARNING: Prompt too short! Expected 2000-4000 characters.`);
    console.log(`   This suggests buildSystemPrompt() may not be working correctly.`);
  } else {
    console.log(`\n✅ Prompt length looks good (${Math.round(avgPromptLength)} chars).`);
  }

  if (avgVideos < 5) {
    console.log(`\n🚨 WARNING: Too few videos! Expected ~10 videos per request.`);
  } else {
    console.log(`\n✅ Video loading looks good (~${Math.round(avgVideos)} videos).`);
  }

  console.log('\n');
}

testProfessorOS()
  .then(() => {
    console.log('✅ Tests complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
