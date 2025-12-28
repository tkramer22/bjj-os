/**
 * Re-analyze Manual Review Queue with New System
 * - Lower threshold: 72 → 67
 * - Add Dimension 9: Transcript Quality (+5 good, -3 bad)
 * - Priority queue: highest scores first
 */

import * as fs from 'fs';
import { analyzeTranscriptQuality } from './curation/dimension-9-transcript';
import { db } from './db';

const OLD_THRESHOLD = 72;
const NEW_THRESHOLD = 67;

async function reanalyzeManualReview() {
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log('🔄 RE-ANALYZING MANUAL REVIEW QUEUE WITH NEW SYSTEM');
  console.log('════════════════════════════════════════════════════════════════════════════════\n');
  
  console.log('CHANGES:');
  console.log(`  • Acceptance threshold: ${OLD_THRESHOLD} → ${NEW_THRESHOLD}`);
  console.log('  • New Dimension 9: Transcript Quality Analysis');
  console.log('    - Excellent transcript: +5 boost');
  console.log('    - Good transcript: +3 boost');
  console.log('    - Poor transcript: -3 penalty');
  console.log('  • No more manual review - accept or reject decisively');
  console.log('  • Priority queue: highest scores shown first\n');
  
  // Load manual review videos
  const queueFile = '/tmp/manual-review-queue.json';
  if (!fs.existsSync(queueFile)) {
    console.error(`❌ No manual review queue found at ${queueFile}`);
    console.error(`   Run the test first to generate the queue:`);
    console.error(`   npx tsx server/test-hybrid-system.ts\n`);
    process.exit(1);
  }
  
  const manualReviewVideos = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
  console.log(`📂 Loaded ${manualReviewVideos.length} videos from manual review queue\n`);
  console.log('════════════════════════════════════════════════════════════════════════════════\n');
  
  const results = {
    nowAccepted: [] as any[],
    stillRejected: [] as any[],
    transcriptHelped: 0,
    transcriptHurt: 0,
    thresholdHelped: 0
  };
  
  // Process each video
  for (let i = 0; i < manualReviewVideos.length; i++) {
    const video = manualReviewVideos[i];
    
    console.log(`[${i + 1}/${manualReviewVideos.length}] "${video.title}"`);
    console.log(`   Channel: ${video.channelName}`);
    console.log(`   Original score: ${video.originalScore.toFixed(1)}/100 (${video.path})`);
    
    try {
      // Run Dimension 9: Transcript Quality
      const transcript = await analyzeTranscriptQuality(video.youtubeId);
      
      // Calculate new score
      const newScore = video.originalScore + transcript.boost;
      
      console.log(`   Transcript boost: ${transcript.boost > 0 ? '+' : ''}${transcript.boost}`);
      console.log(`   New score: ${newScore.toFixed(1)}/100`);
      
      // Apply new threshold
      if (newScore >= NEW_THRESHOLD) {
        console.log(`   ✅ NOW ACCEPTED (≥${NEW_THRESHOLD})\n`);
        
        results.nowAccepted.push({
          youtubeId: video.youtubeId,
          title: video.title,
          channelName: video.channelName,
          instructor: video.instructor,
          originalScore: video.originalScore,
          transcriptBoost: transcript.boost,
          newScore: newScore,
          path: video.path,
          priority: newScore, // Higher score = higher priority
          transcriptQuality: transcript.qualityScore,
          transcriptReason: transcript.reason,
          viewCount: video.viewCount,
          likeCount: video.likeCount
        });
        
        // Track what helped
        if (transcript.boost > 0) {
          results.transcriptHelped++;
        } else if (video.originalScore < NEW_THRESHOLD && transcript.boost === 0) {
          results.thresholdHelped++;
        }
        
      } else {
        console.log(`   ❌ STILL REJECTED (<${NEW_THRESHOLD})\n`);
        
        results.stillRejected.push({
          youtubeId: video.youtubeId,
          title: video.title,
          originalScore: video.originalScore,
          transcriptBoost: transcript.boost,
          newScore: newScore,
          reason: `Score ${newScore.toFixed(1)} below ${NEW_THRESHOLD} threshold`
        });
        
        if (transcript.boost < 0) {
          results.transcriptHurt++;
        }
      }
      
    } catch (error: any) {
      if (error.message?.includes('QUOTA')) {
        console.log(`   ⚠️  YouTube API quota exceeded - stopping analysis`);
        console.log(`   ${i}/${manualReviewVideos.length} videos processed before quota limit\n`);
        break;
      }
      console.error(`   ⚠️  Error: ${error.message}\n`);
    }
  }
  
  // Sort accepted by priority (highest scores first)
  results.nowAccepted.sort((a, b) => b.priority - a.priority);
  
  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log('📊 RE-ANALYSIS COMPLETE');
  console.log('════════════════════════════════════════════════════════════════════════════════\n');
  
  console.log(`BEFORE (with ${OLD_THRESHOLD} threshold):`);
  console.log(`  ⚠️  Manual Review: ${manualReviewVideos.length} videos (100%)\n`);
  
  console.log(`AFTER (with ${NEW_THRESHOLD} threshold + transcript analysis):`);
  console.log(`  ✅ Now Accepted: ${results.nowAccepted.length} videos (${(results.nowAccepted.length / manualReviewVideos.length * 100).toFixed(1)}%)`);
  console.log(`  ❌ Rejected: ${results.stillRejected.length} videos (${(results.stillRejected.length / manualReviewVideos.length * 100).toFixed(1)}%)\n`);
  
  console.log(`WHAT HELPED ACCEPTANCE:`);
  console.log(`  • Transcript boost: ${results.transcriptHelped} videos`);
  console.log(`  • Lower threshold alone: ${results.thresholdHelped} videos`);
  console.log(`  • Transcript penalty: ${results.transcriptHurt} videos hurt\n`);
  
  // ═══════════════════════════════════════════════════════════
  // PRIORITY QUEUE (Top Accepted)
  // ═══════════════════════════════════════════════════════════
  
  if (results.nowAccepted.length > 0) {
    console.log('════════════════════════════════════════════════════════════════════════════════');
    console.log('🏆 PRIORITY QUEUE: TOP ACCEPTED VIDEOS (HIGHEST SCORES FIRST)');
    console.log('════════════════════════════════════════════════════════════════════════════════\n');
    
    const showCount = Math.min(10, results.nowAccepted.length);
    results.nowAccepted.slice(0, showCount).forEach((v, i) => {
      console.log(`${i + 1}. "${v.title}"`);
      console.log(`   Score: ${v.newScore.toFixed(1)}/100 (was ${v.originalScore.toFixed(1)}, ${v.transcriptBoost > 0 ? '+' : ''}${v.transcriptBoost} from transcript)`);
      console.log(`   Instructor: ${v.instructor || 'Unknown'}`);
      console.log(`   Path: ${v.path}`);
      console.log(`   Stats: ${v.viewCount.toLocaleString()} views, ${v.likeCount.toLocaleString()} likes`);
      console.log(`   Priority: ${i < 3 ? 'HIGHEST' : i < 7 ? 'HIGH' : 'MEDIUM'} (show ${i < 3 ? 'FIRST' : i < 7 ? 'early' : 'later'} in queue)\n`);
    });
    
    if (results.nowAccepted.length > 10) {
      console.log(`... and ${results.nowAccepted.length - 10} more videos (lower priority)\n`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════
  // EXAMPLES
  // ═══════════════════════════════════════════════════════════
  
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('📋 DETAILED EXAMPLES');
  console.log('════════════════════════════════════════════════════════════════════════════════\n');
  
  // Example: Transcript helped
  const transcriptHelped = results.nowAccepted.find(v => v.transcriptBoost > 0);
  if (transcriptHelped) {
    console.log(`✅ EXAMPLE: Transcript Boost Helped Accept`);
    console.log(`   "${transcriptHelped.title}"`);
    console.log(`   Original: ${transcriptHelped.originalScore.toFixed(1)}/100 (manual review)`);
    console.log(`   Transcript: +${transcriptHelped.transcriptBoost} boost (${transcriptHelped.transcriptQuality}/100 quality)`);
    console.log(`   Reason: ${transcriptHelped.transcriptReason}`);
    console.log(`   New: ${transcriptHelped.newScore.toFixed(1)}/100 → ACCEPTED ✅\n`);
  }
  
  // Example: Threshold change helped
  const thresholdHelped = results.nowAccepted.find(v => v.transcriptBoost === 0 && v.originalScore < OLD_THRESHOLD);
  if (thresholdHelped) {
    console.log(`✅ EXAMPLE: Lower Threshold Helped Accept`);
    console.log(`   "${thresholdHelped.title}"`);
    console.log(`   Score: ${thresholdHelped.originalScore.toFixed(1)}/100`);
    console.log(`   Old threshold: ${OLD_THRESHOLD} → would reject ❌`);
    console.log(`   New threshold: ${NEW_THRESHOLD} → ACCEPTED ✅\n`);
  }
  
  // Example: Transcript hurt
  const transcriptHurt = results.stillRejected.find(v => v.transcriptBoost < 0);
  if (transcriptHurt) {
    console.log(`❌ EXAMPLE: Poor Transcript Caused Rejection`);
    console.log(`   "${transcriptHurt.title}"`);
    console.log(`   Original: ${transcriptHurt.originalScore.toFixed(1)}/100`);
    console.log(`   Transcript: ${transcriptHurt.transcriptBoost} penalty (poor quality)`);
    console.log(`   New: ${transcriptHurt.newScore.toFixed(1)}/100 → REJECTED ❌\n`);
  }
  
  // Example: Still rejected
  if (results.stillRejected.length > 0) {
    const example = results.stillRejected[0];
    console.log(`❌ EXAMPLE: Still Rejected Despite Changes`);
    console.log(`   "${example.title}"`);
    console.log(`   Score: ${example.newScore.toFixed(1)}/100`);
    console.log(`   Reason: ${example.reason}\n`);
  }
  
  // ═══════════════════════════════════════════════════════════
  // COMBINED RESULTS
  // ═══════════════════════════════════════════════════════════
  
  const originalAccepted = 31; // From 200-video test
  const totalAccepted = originalAccepted + results.nowAccepted.length;
  const totalProcessed = 176; // From original test
  
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('📈 COMBINED SYSTEM PERFORMANCE');
  console.log('════════════════════════════════════════════════════════════════════════════════\n');
  
  console.log(`ORIGINAL SYSTEM (${OLD_THRESHOLD} threshold, no transcripts):`);
  console.log(`  ✅ Accepted: ${originalAccepted} videos (17.6%)`);
  console.log(`  ⚠️  Manual Review: ${manualReviewVideos.length} videos (49.4%)`);
  console.log(`  ❌ Rejected: ${totalProcessed - originalAccepted - manualReviewVideos.length} videos (33.0%)\n`);
  
  console.log(`NEW SYSTEM (${NEW_THRESHOLD} threshold + transcripts):`);
  console.log(`  ✅ Auto-Accepted: ${totalAccepted} videos (${(totalAccepted / totalProcessed * 100).toFixed(1)}%)`);
  console.log(`  ⚠️  Manual Review: 0 videos (0%)`);
  console.log(`  ❌ Rejected: ${totalProcessed - totalAccepted} videos (${((totalProcessed - totalAccepted) / totalProcessed * 100).toFixed(1)}%)\n`);
  
  console.log(`IMPROVEMENT:`);
  console.log(`  📈 Acceptance rate: 17.6% → ${(totalAccepted / totalProcessed * 100).toFixed(1)}%`);
  console.log(`  ⚡ Manual review eliminated: 87 → 0 videos`);
  console.log(`  🎯 Decisive system: All videos auto-processed\n`);
  
  // Save results
  const outputFile = '/tmp/reanalysis-results.json';
  fs.writeFileSync(outputFile, JSON.stringify({
    summary: {
      totalProcessed: manualReviewVideos.length,
      nowAccepted: results.nowAccepted.length,
      stillRejected: results.stillRejected.length,
      transcriptHelped: results.transcriptHelped,
      transcriptHurt: results.transcriptHurt,
      thresholdHelped: results.thresholdHelped
    },
    priorityQueue: results.nowAccepted,
    rejected: results.stillRejected
  }, null, 2));
  
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(`💾 Results saved to ${outputFile}`);
  console.log('════════════════════════════════════════════════════════════════════════════════\n');
  
  // Close DB
  await db.$client.end();
}

reanalyzeManualReview().catch(error => {
  console.error('Re-analysis failed:', error);
  process.exit(1);
});
