import { synthesizeKnowledgeByTopic, formatSynthesizedKnowledge, detectTopicsFromMessage } from './utils/knowledge-synthesizer';

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('TEST 1: KNOWLEDGE SYNTHESIS');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const testTopics = ['half_guard', 'guard_passing'];
  
  for (const topic of testTopics) {
    console.log(`\n📚 Synthesizing knowledge for topic: "${topic}"`);
    console.log('─'.repeat(60));
    
    const knowledge = await synthesizeKnowledgeByTopic(topic);
    
    console.log(`\n✅ Videos found: ${knowledge.approaches.length} instructor approaches`);
    console.log('\n📋 SYNTHESIZED KNOWLEDGE OBJECT:');
    console.log(JSON.stringify({
      topic: knowledge.topic,
      summary: knowledge.summary,
      approachCount: knowledge.approachCount,
      commonMistakes: knowledge.commonMistakes,
      prerequisites: knowledge.prerequisites,
      chainsTo: knowledge.chainsTo,
      skillLevels: knowledge.skillLevels,
      giOrNogi: knowledge.giOrNogi
    }, null, 2));
    
    if (knowledge.approaches.length > 0) {
      console.log('\n👨‍🏫 INSTRUCTOR APPROACHES GROUPED:');
      knowledge.approaches.slice(0, 5).forEach((approach, i) => {
        console.log(`\n  ${i + 1}. ${approach.instructor}:`);
        console.log(`     Technique: ${approach.name}`);
        console.log(`     Core Concept: ${approach.coreConcept}`);
        console.log(`     Best For: ${approach.bestFor || 'N/A'}`);
      });
    }
  }

  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('TEST 2: TOPIC DETECTION');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const testMessages = [
    "How do I pass knee shield?",
    "I keep getting swept from half guard",
    "Triangle escape help"
  ];

  for (const message of testMessages) {
    console.log(`\n💬 Message: "${message}"`);
    console.log('─'.repeat(60));
    
    const topics = detectTopicsFromMessage(message);
    console.log(`   Detected topics: [${topics.join(', ')}]`);
  }

  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('TEST 3: FULL SYNTHESIS FLOW');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const fullTestMessage = "How do I pass knee shield? It's killing me.";
  console.log(`💬 Test message: "${fullTestMessage}"`);
  console.log('─'.repeat(60));

  const detectedTopics = detectTopicsFromMessage(fullTestMessage);
  console.log(`\n📍 Detected topics: [${detectedTopics.join(', ')}]`);

  // Synthesize knowledge for each topic and combine
  let combinedSynthesis = '';
  for (const topic of detectedTopics) {
    const knowledge = await synthesizeKnowledgeByTopic(topic);
    if (knowledge.approaches.length > 0) {
      combinedSynthesis += formatSynthesizedKnowledge(knowledge) + '\n\n';
    }
  }

  console.log('\n📝 SYNTHESIZED KNOWLEDGE SECTION (what gets injected into prompt):');
  console.log('─'.repeat(60));
  console.log(combinedSynthesis || '(No synthesis generated - check if videos exist for these topics)');

  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
}

runTests().catch(console.error);
