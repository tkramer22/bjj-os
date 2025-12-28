/**
 * Professor OS Technique Extraction Test
 * Tests 25 questions and saves results
 */

import { db } from './db';
import { bjjUsers, userTechniqueEcosystem } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { processMessageForTechniqueExtraction, extractTechniquesFromMessage } from './technique-extraction';
import * as fs from 'fs';

const TEST_QUESTIONS = [
  // SUCCESS signals (5)
  'I finally hit my first triangle choke after 3 weeks of drilling!',
  'Finally got my first RNC in live rolling yesterday!',
  'My hip bump sweep worked perfectly today!',
  'Nailed my first kimura from closed guard!',
  'The scissor sweep is clicking now after 2 weeks',
  
  // FAILURE signals (5)
  'I keep struggling with my armbar from guard, people always escape',
  "Can't seem to finish the guillotine when I get it",
  'My knee slice pass keeps getting shut down',
  'Keep failing at the ankle lock setup',
  'Never can hit the omoplata, always getting stacked',
  
  // LEARNING signals (4)
  'Working on my double leg takedown',
  'Drilling the berimbolo this week',
  'Learning the bow and arrow choke',
  'Practicing my x guard entries',
  
  // QUESTIONS - technique mentions (11)
  'What is the best sweep for a blue belt to focus on?',
  'How do I improve my mount escapes?',
  'Tips for knee slice passing against de la riva?',
  'Can you recommend some John Danaher videos?',
  'What does Gordon Ryan teach about passing?',
  'Show me Roger Gracie mounted cross choke technique',
  'Any Marcelo Garcia butterfly guard content?',
  'What are the key concepts in back control?',
  'Best way to escape side control?',
  'How do I attack from closed guard?',
  'Tips for playing half guard?',
];

async function runTest() {
  // Clear existing test data
  await db.delete(userTechniqueEcosystem).where(eq(userTechniqueEcosystem.userId, 'c2cfc0c7-96f2-4f02-8251-bf30b8f6860a'));
  console.log('🧹 Cleared existing ecosystem data');
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧪 PROFESSOR OS COMPREHENSIVE TEST - ' + TEST_QUESTIONS.length + ' QUESTIONS');
  console.log('═══════════════════════════════════════════════════════════════');

  const testUser = await db.select()
    .from(bjjUsers)
    .where(eq(bjjUsers.email, 'testing+e2e@bjjos.app'))
    .limit(1);

  if (!testUser.length) {
    console.log('❌ Test user not found');
    process.exit(1);
  }

  const userId = testUser[0].id;
  console.log('✅ Test user: ' + testUser[0].email + ' (' + testUser[0].beltLevel + ' belt)');
  console.log('   User ID: ' + userId);
  console.log('');

  const results: any[] = [];
  let successCount = 0;
  let failureCount = 0;
  let learningCount = 0;
  let questionCount = 0;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 TECHNIQUE EXTRACTION ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════');
  
  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    const question = TEST_QUESTIONS[i];
    const extraction = extractTechniquesFromMessage(question);
    
    console.log('');
    console.log('[' + (i+1) + '/' + TEST_QUESTIONS.length + '] "' + question.substring(0, 55) + '..."');
    
    if (extraction.length > 0) {
      for (const e of extraction) {
        const timeStr = e.timeIndicator ? ' | time: ' + e.timeIndicator : '';
        const signalEmoji = e.signal === 'success' ? '✅' : e.signal === 'failure' ? '❌' : e.signal === 'learning' ? '📚' : '❓';
        console.log('   ' + signalEmoji + ' ' + e.technique + ' | ' + e.signal.toUpperCase() + ' | ' + (e.confidence * 100).toFixed(0) + '%' + timeStr);
        
        if (e.signal === 'success') successCount++;
        else if (e.signal === 'failure') failureCount++;
        else if (e.signal === 'learning') learningCount++;
        else questionCount++;
      }
      
      await processMessageForTechniqueExtraction(userId, question);
    } else {
      console.log('   (No technique detected)');
    }
    
    results.push({ question, extraction, timestamp: new Date().toISOString() });
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📈 USER TECHNIQUE ECOSYSTEM (FINAL STATE)');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const ecosystem = await db.select()
    .from(userTechniqueEcosystem)
    .where(eq(userTechniqueEcosystem.userId, userId));

  console.log('');
  console.log('| Technique             | Attempts | Successes | Failures | Rate  |');
  console.log('|-----------------------|----------|-----------|----------|-------|');
  for (const tech of ecosystem) {
    const rate = tech.successRate ? (parseFloat(tech.successRate) * 100).toFixed(0) + '%' : 'N/A';
    console.log('| ' + tech.techniqueName.substring(0, 21).padEnd(21) + ' | ' + String(tech.attempts).padStart(8) + ' | ' + String(tech.successes).padStart(9) + ' | ' + String(tech.failures).padStart(8) + ' | ' + rate.padStart(5) + ' |');
  }

  const outputData = {
    testDate: new Date().toISOString(),
    userId,
    userEmail: testUser[0].email,
    userBelt: testUser[0].beltLevel,
    totalQuestions: TEST_QUESTIONS.length,
    extractionResults: results,
    ecosystemUpdates: ecosystem,
    summary: {
      questionsWithExtraction: results.filter(r => r.extraction.length > 0).length,
      successSignals: successCount,
      failureSignals: failureCount,
      learningSignals: learningCount,
      questionSignals: questionCount,
      ecosystemRecordsCreated: ecosystem.length
    }
  };

  fs.writeFileSync('professor_os_test_results.json', JSON.stringify(outputData, null, 2));
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 FINAL TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Total Questions Tested: ' + TEST_QUESTIONS.length);
  console.log('Questions with Extraction: ' + outputData.summary.questionsWithExtraction);
  console.log('');
  console.log('Signal Breakdown:');
  console.log('  ✅ Success Signals: ' + successCount);
  console.log('  ❌ Failure Signals: ' + failureCount);
  console.log('  📚 Learning Signals: ' + learningCount);
  console.log('  ❓ Question Signals: ' + questionCount);
  console.log('');
  console.log('Ecosystem Records Created: ' + ecosystem.length);
  console.log('');
  console.log('✅ Results saved to professor_os_test_results.json');
}

runTest().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
