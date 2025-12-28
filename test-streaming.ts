/**
 * TEST THE STREAMING ENDPOINT
 * Shows actual SSE chunks and metadata
 */

import { db } from './server/db';
import { bjjUsers } from './shared/schema';

const API_URL = 'http://localhost:5000';

async function testStreaming() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🚀 TESTING PROFESSOR OS STREAMING ENDPOINT');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get test user
  const [testUser] = await db.select().from(bjjUsers).limit(1);
  if (!testUser) {
    console.error('❌ No users found');
    return;
  }

  console.log(`✅ Test User: ${testUser.username} (${testUser.id})\n`);

  // Test message (unique to avoid cache)
  const testMessage = `What's a good triangle defense? (stream test ${Date.now()})`;
  
  console.log(`📝 Test Message: "${testMessage}"\n`);
  console.log('🎯 Calling /api/ai/chat/message/stream...\n');

  const startTime = Date.now();
  let firstTokenTime = 0;
  let fullResponse = '';
  let chunkCount = 0;
  let metadata: any = null;

  try {
    const response = await fetch(`${API_URL}/api/ai/chat/message/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUser.id,
        message: testMessage
      })
    });

    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
      return;
    }

    if (!response.body) {
      console.error('❌ No response body');
      return;
    }

    console.log('✅ Connected to SSE stream\n');
    console.log('📥 STREAMING CHUNKS:\n');
    console.log('─'.repeat(70));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.chunk) {
              if (!firstTokenTime) {
                firstTokenTime = Date.now() - startTime;
                console.log(`⚡ FIRST TOKEN RECEIVED: ${firstTokenTime}ms\n`);
              }
              
              chunkCount++;
              fullResponse += parsed.chunk;
              
              // Show first 10 chunks, then summarize
              if (chunkCount <= 10) {
                console.log(`Chunk ${chunkCount}: "${parsed.chunk}"`);
              } else if (chunkCount === 11) {
                console.log(`... (streaming continues) ...`);
              }
            }
            
            if (parsed.done) {
              console.log('\n─'.repeat(70));
              console.log('✅ STREAM COMPLETE\n');
              metadata = parsed.metadata || {};
            }
          } catch (e) {
            // Ignore parse errors for partial chunks
          }
        }
      }
    }

    const totalTime = Date.now() - startTime;

    console.log('📊 STREAMING RESULTS:\n');
    console.log(`   First Token Time: ${firstTokenTime}ms`);
    console.log(`   Total Response Time: ${totalTime}ms`);
    console.log(`   Total Chunks Received: ${chunkCount}`);
    console.log(`   Response Length: ${fullResponse.length} characters\n`);

    if (metadata) {
      console.log('📋 METADATA FROM SERVER:\n');
      console.log(`   System Prompt Length: ${metadata.promptLength || 'N/A'} characters`);
      console.log(`   Videos Loaded: ${metadata.videoCount || 'N/A'} videos`);
      console.log(`   Model: ${metadata.model || 'N/A'}`);
      console.log(`   Server Response Time: ${metadata.responseTime || 'N/A'}ms`);
      console.log(`   Server First Token: ${metadata.firstTokenTime || 'N/A'}ms\n`);
    }

    console.log('🤖 COMPLETE GPT-4o RESPONSE:\n');
    console.log('─'.repeat(70));
    console.log(fullResponse);
    console.log('─'.repeat(70));
    console.log();

    // Analysis
    const sentences = fullResponse.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const hasInstructorCitations = fullResponse.includes('Danaher') || 
                                    fullResponse.includes('Lachlan') ||
                                    fullResponse.includes('Gordon') ||
                                    fullResponse.includes('Marcelo') ||
                                    fullResponse.includes('Roger');
    
    console.log('✅ ANALYSIS:\n');
    console.log(`   Sentences: ${sentences}`);
    console.log(`   Avg chars/sentence: ${Math.round(fullResponse.length / (sentences || 1))}`);
    console.log(`   Cites instructors: ${hasInstructorCitations ? '✅ YES' : '❌ NO'}`);
    console.log(`   Streaming speed: ${firstTokenTime < 1500 ? '✅ FAST (<1.5s)' : '⚠️  SLOW (>1.5s)'}`);
    
    if (metadata?.promptLength) {
      console.log(`   Prompt length: ${metadata.promptLength > 5000 ? '✅ GOOD (>5000 chars)' : '❌ TOO SHORT'}`);
      console.log(`   Videos loaded: ${metadata.videoCount >= 5 ? '✅ GOOD (≥5 videos)' : '❌ TOO FEW'}`);
    }
    
    console.log('\n🎯 VERDICT:\n');
    
    if (firstTokenTime < 1500 && metadata?.promptLength > 5000 && metadata?.videoCount >= 5) {
      console.log('   ✅ STREAMING ENDPOINT IS WORKING PERFECTLY!');
      console.log('   ✅ Sub-1.5s first token delivery');
      console.log('   ✅ Complete prompt with full intelligence');
      console.log('   ✅ Video library loaded and accessible');
    } else {
      console.log('   ⚠️  ISSUES DETECTED:');
      if (firstTokenTime >= 1500) console.log('      - Slow first token (>1.5s)');
      if (metadata?.promptLength <= 5000) console.log('      - Prompt too short');
      if (metadata?.videoCount < 5) console.log('      - Too few videos loaded');
    }

  } catch (error: any) {
    console.error('❌ Streaming test failed:', error.message);
  }

  console.log('\n');
}

testStreaming()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
