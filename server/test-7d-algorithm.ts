/**
 * Test Script: 7-Dimensional Algorithm
 * 
 * Tests the integrated 7D evaluation with sample videos
 */

import { evaluate7Dimensions, type VideoEvaluationInput } from "./curation/final-evaluator";

async function test7DAlgorithm() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🧪 7-DIMENSIONAL ALGORITHM TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // TEST 1: Elite Instructor Video (Gordon Ryan)
  console.log('📝 TEST 1: Elite Instructor Video (Gordon Ryan)\n');
  
  const gordonRyanVideo: VideoEvaluationInput = {
    youtubeId: 'test_gordon_1',
    title: 'Gordon Ryan Triangle Choke Details - Precision Adjustments',
    techniqueName: 'Triangle Choke',
    instructorName: 'Gordon Ryan',
    channelId: 'UC_gordon_ryan',
    difficultyScore: 7,
    beltLevels: ['purple', 'brown', 'black'],
    keyDetails: {
      mainDetail: 'Angle your wrist 15° inward at initial contact to prevent the frame',
      prerequisites: ['closed_guard', 'hip_escape'],
      stepByStep: true
    },
    uploadDate: new Date('2024-10-15'),
    giOrNogi: 'nogi',
    category: 'submission'
  };

  const result1 = await evaluate7Dimensions(gordonRyanVideo);
  
  console.log('\n📊 RESULTS:');
  console.log(`   Decision: ${result1.decision}`);
  console.log(`   Final Score: ${result1.finalScore}/100`);
  console.log(`   Reason: ${result1.acceptanceReason}`);
  console.log(`\n   Dimension Breakdown:`);
  console.log(`     - Instructor Authority: ${result1.dimensionScores.instructorAuthority}/100`);
  console.log(`     - Taxonomy Mapping: ${result1.dimensionScores.taxonomyMapping}/100`);
  console.log(`     - Coverage Balance: ${result1.dimensionScores.coverageBalance}/100`);
  console.log(`     - Unique Value: ${result1.dimensionScores.uniqueValue}/100`);
  console.log(`     - User Feedback: ${result1.dimensionScores.userFeedback}/100`);
  console.log(`     - Belt Level Fit: ${result1.dimensionScores.beltLevelFit}/100`);
  console.log(`     - Emerging Detection: ${result1.dimensionScores.emergingDetection}/100`);
  console.log(`\n   Boosts Applied: ${result1.metadata.boostsApplied.join(', ') || 'None'}`);
  console.log(`\n   ✅ Expected: ACCEPT with high score (elite instructor + quality technique)`);
  console.log(`   ${result1.decision === 'ACCEPT' && result1.finalScore >= 70 ? '✅ PASS' : '❌ FAIL'}\n`);

  // TEST 2: Unknown Instructor Video
  console.log('\n───────────────────────────────────────────────────────────────\n');
  console.log('📝 TEST 2: Unknown Instructor Video\n');
  
  const unknownVideo: VideoEvaluationInput = {
    youtubeId: 'test_unknown_1',
    title: 'Armbar Tutorial - Basic Technique',
    techniqueName: 'Armbar',
    instructorName: 'Random BJJ Gym',
    channelId: 'UC_unknown_123',
    difficultyScore: 3,
    beltLevels: ['white', 'blue'],
    keyDetails: {
      mainDetail: 'Keep elbows tight and maintain control',
      stepByStep: false
    },
    uploadDate: new Date('2024-11-01'),
    giOrNogi: 'both',
    category: 'submission'
  };

  const result2 = await evaluate7Dimensions(unknownVideo);
  
  console.log('\n📊 RESULTS:');
  console.log(`   Decision: ${result2.decision}`);
  console.log(`   Final Score: ${result2.finalScore}/100`);
  console.log(`   Reason: ${result2.acceptanceReason}`);
  console.log(`\n   Dimension Breakdown:`);
  console.log(`     - Instructor Authority: ${result2.dimensionScores.instructorAuthority}/100`);
  console.log(`     - Taxonomy Mapping: ${result2.dimensionScores.taxonomyMapping}/100`);
  console.log(`     - Coverage Balance: ${result2.dimensionScores.coverageBalance}/100`);
  console.log(`     - Unique Value: ${result2.dimensionScores.uniqueValue}/100`);
  console.log(`\n   ✅ Expected: Lower score (unknown instructor, generic technique)`);
  console.log(`   ${result2.finalScore < 70 ? '✅ PASS (correctly filtered)' : '⚠️  Accepted but with lower score'}\n`);

  // TEST 3: High-Quality Instructor (Bernardo Faria)
  console.log('\n───────────────────────────────────────────────────────────────\n');
  console.log('📝 TEST 3: High-Quality Instructor Video (Bernardo Faria)\n');
  
  const bernardoVideo: VideoEvaluationInput = {
    youtubeId: 'test_bernardo_1',
    title: 'Half Guard Sweep Sequence - 3 Connected Options',
    techniqueName: 'Half Guard',
    instructorName: 'Bernardo Faria',
    channelId: 'UC_bernardo',
    difficultyScore: 5,
    beltLevels: ['blue', 'purple'],
    keyDetails: {
      mainDetail: 'Connect underhook to lockdown timing for maximum sweep efficiency',
      prerequisites: ['half_guard_basics'],
      progressionsTo: ['deep_half', 'back_take'],
      stepByStep: true
    },
    uploadDate: new Date('2024-09-20'),
    giOrNogi: 'both',
    category: 'guard'
  };

  const result3 = await evaluate7Dimensions(bernardoVideo);
  
  console.log('\n📊 RESULTS:');
  console.log(`   Decision: ${result3.decision}`);
  console.log(`   Final Score: ${result3.finalScore}/100`);
  console.log(`   Reason: ${result3.acceptanceReason}`);
  console.log(`\n   Dimension Breakdown:`);
  console.log(`     - Instructor Authority: ${result3.dimensionScores.instructorAuthority}/100`);
  console.log(`     - Taxonomy Mapping: ${result3.dimensionScores.taxonomyMapping}/100`);
  console.log(`     - Coverage Balance: ${result3.dimensionScores.coverageBalance}/100`);
  console.log(`     - Unique Value: ${result3.dimensionScores.uniqueValue}/100`);
  console.log(`     - Belt Level Fit: ${result3.dimensionScores.beltLevelFit}/100`);
  console.log(`\n   Boosts Applied: ${result3.metadata.boostsApplied.join(', ') || 'None'}`);
  console.log(`\n   ✅ Expected: ACCEPT (high-quality instructor + quality content)`);
  console.log(`   ${result3.decision === 'ACCEPT' && result3.finalScore >= 65 ? '✅ PASS' : '❌ FAIL'}\n`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🎯 TEST SUITE COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// Run tests
test7DAlgorithm().catch(console.error);
