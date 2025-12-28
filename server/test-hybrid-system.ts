/**
 * Test Hybrid 3-Path + 8-Dimensional System
 * Fetches real YouTube videos and runs comprehensive analysis
 */

import { evaluateVideoHybrid, HybridEvaluationInput } from './curation/hybrid-evaluator';
import { searchBJJVideos, getVideoDetails } from './youtube-service';
import { getChannelStatistics } from './youtube-service';
import { db } from './db';
import * as fs from 'fs';

async function testHybridSystem() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🧪 TESTING HYBRID 3-PATH + 8-DIMENSIONAL SYSTEM`);
  console.log(`${'═'.repeat(80)}\n`);
  
  // Test queries designed to test all 3 paths
  const testQueries = [
    { query: 'lachlan giles', count: 50, expectedPath: 'Elite Instructor' },
    { query: 'gordon ryan', count: 50, expectedPath: 'Elite Instructor' },
    { query: 'danaher bjj', count: 50, expectedPath: 'Elite Instructor' },
    { query: 'marcelo garcia bjj', count: 50, expectedPath: 'Elite Instructor' },
    { query: 'bernardo faria technique', count: 50, expectedPath: 'Elite Instructor' },
    { query: 'keenan cornelius', count: 50, expectedPath: 'Elite Instructor' },
    { query: 'bjj armbar tutorial', count: 50, expectedPath: 'Metrics-Validated' },
    { query: 'bjj guard passing', count: 50, expectedPath: 'Metrics-Validated' },
    { query: 'jiu jitsu sweep techniques', count: 50, expectedPath: 'Metrics-Validated' },
    { query: 'bjj escapes tutorial', count: 50, expectedPath: 'Known Quality' }
  ];
  
  const allVideos: any[] = [];
  
  // Fetch videos
  for (const test of testQueries) {
    console.log(`\n🔍 Searching: "${test.query}" (expecting: ${test.expectedPath})`);
    
    try {
      const results = await searchBJJVideos(test.query, test.count);
      console.log(`   ✅ Found ${results.length} videos`);
      
      for (const result of results) {
        // Get detailed stats
        const details = await getVideoDetails(result.youtube_id);
        const channelStats = await getChannelStatistics(result.channel_id);
        
        allVideos.push({
          ...result,
          details,
          channelStats,
          expectedPath: test.expectedPath
        });
      }
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log(`\n📊 Total videos collected: ${allVideos.length}`);
  console.log(`${'═'.repeat(80)}\n`);
  
  // Run hybrid evaluation on each
  const results = {
    accepted: [] as any[],
    rejected: [] as any[],
    manualReview: [] as any[],
    pathBreakdown: {
      'Elite Instructor': 0,
      'Metrics-Validated': 0,
      'Known Quality + Metrics': 0,
      'Known Quality - Early': 0,
      'None': 0
    }
  };
  
  for (let i = 0; i < allVideos.length; i++) {
    const video = allVideos[i];
    
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📹 VIDEO ${i + 1}/${allVideos.length}: "${video.title}"`);
    console.log(`   Channel: ${video.channel_name}`);
    console.log(`   ID: ${video.youtube_id}`);
    console.log(`   Stats: ${video.details?.view_count || 0} views, ${video.details?.like_count || 0} likes`);
    console.log(`   Expected: ${video.expectedPath}`);
    console.log(`${'─'.repeat(80)}`);
    
    try {
      // Build input
      const input: HybridEvaluationInput = {
        youtubeId: video.youtube_id,
        title: video.title,
        description: 'BJJ technique instruction', // Would need full description from API
        channelName: video.channel_name,
        channelId: video.channel_id,
        instructorName: null, // Will be extracted from title
        techniqueName: extractTechnique(video.title),
        category: null,
        giOrNogi: null,
        difficultyScore: 5,
        keyDetails: [],
        
        viewCount: video.details?.view_count || 0,
        likeCount: video.details?.like_count || 0,
        commentCount: video.details?.comment_count || 0,
        publishedAt: video.details?.published_at || video.upload_date,
        channelSubscribers: video.channelStats?.subscriber_count || 0
      };
      
      // Run hybrid evaluation
      const evaluation = await evaluateVideoHybrid(input);
      
      console.log(`\n🎯 RESULT:`);
      console.log(`   Decision: ${evaluation.decision}`);
      console.log(`   Path: ${evaluation.acceptancePath}`);
      console.log(`   Score: ${evaluation.finalScore.toFixed(1)}/100`);
      console.log(`   Reason: ${evaluation.acceptanceReason}`);
      
      // Track results
      if (evaluation.decision === 'ACCEPT') {
        results.accepted.push({
          title: video.title,
          path: evaluation.acceptancePath,
          score: evaluation.finalScore
        });
        
        (results.pathBreakdown as any)[evaluation.acceptancePath] = 
          ((results.pathBreakdown as any)[evaluation.acceptancePath] || 0) + 1;
        
        console.log(`   ✅ ACCEPTED`);
      } else if (evaluation.decision === 'MANUAL_REVIEW') {
        results.manualReview.push({
          youtubeId: video.youtube_id,
          title: video.title,
          channelName: video.channel_name,
          channelId: video.channel_id,
          originalScore: evaluation.finalScore,
          instructor: evaluation.metadata.instructorName,
          path: evaluation.acceptancePath,
          reason: evaluation.acceptanceReason,
          allScores: evaluation.metadata.allScores,
          viewCount: video.details?.view_count || 0,
          likeCount: video.details?.like_count || 0
        });
        console.log(`   ⚠️  MANUAL REVIEW`);
      } else {
        results.rejected.push({
          title: video.title,
          reason: evaluation.acceptanceReason
        });
        
        results.pathBreakdown.None++;
        
        console.log(`   ❌ REJECTED`);
      }
      
      // Show dimension breakdown
      console.log(`\n   📊 All Dimension Scores:`);
      console.log(`      Instructor: ${evaluation.metadata.allScores.instructor}/100`);
      console.log(`      Taxonomy: ${evaluation.metadata.allScores.taxonomy}/100`);
      console.log(`      Coverage: ${evaluation.metadata.allScores.coverage}`);
      console.log(`      Uniqueness: ${evaluation.metadata.allScores.uniqueness}/100`);
      console.log(`      User Value: ${evaluation.metadata.allScores.userValue}/100`);
      console.log(`      Belt Level: ${evaluation.metadata.allScores.beltLevel}/100`);
      console.log(`      Emerging: +${evaluation.metadata.allScores.emerging} boost`);
      console.log(`      YouTube: ${evaluation.metadata.allScores.youtube}/100`);
      console.log(`      Content: ${evaluation.metadata.allScores.content}/100`);
      
      if (evaluation.metadata.youtubeSignals.length > 0) {
        console.log(`   🔥 YouTube Signals: ${evaluation.metadata.youtubeSignals.join(', ')}`);
      }
      
    } catch (error: any) {
      console.error(`   ⚠️  ERROR: ${error.message}`);
    }
  }
  
  // Final summary
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📊 HYBRID SYSTEM TEST RESULTS`);
  console.log(`${'═'.repeat(80)}`);
  console.log(`\nOVERALL:`);
  console.log(`   ✅ Accepted: ${results.accepted.length}`);
  console.log(`   ❌ Rejected: ${results.rejected.length}`);
  console.log(`   ⚠️  Manual Review: ${results.manualReview.length}`);
  console.log(`\nACCEPTANCE PATHS:`);
  console.log(`   Elite Instructor: ${results.pathBreakdown['Elite Instructor']}`);
  console.log(`   Metrics-Validated: ${results.pathBreakdown['Metrics-Validated']}`);
  console.log(`   Known Quality + Metrics: ${results.pathBreakdown['Known Quality + Metrics']}`);
  console.log(`   Known Quality - Early: ${results.pathBreakdown['Known Quality - Early']}`);
  console.log(`   None (Rejected): ${results.pathBreakdown.None}`);
  
  if (results.accepted.length > 0) {
    console.log(`\nTOP ACCEPTED VIDEOS:`);
    results.accepted
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .forEach((v, i) => {
        console.log(`   ${i + 1}. "${v.title}"`);
        console.log(`      Path: ${v.path} | Score: ${v.score.toFixed(1)}/100`);
      });
  }
  
  if (results.rejected.length > 0) {
    console.log(`\nREJECTED EXAMPLES:`);
    results.rejected.slice(0, 3).forEach((v, i) => {
      console.log(`   ${i + 1}. "${v.title}"`);
      console.log(`      Reason: ${v.reason}`);
    });
  }
  
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`✅ HYBRID SYSTEM TEST COMPLETE`);
  console.log(`${'═'.repeat(80)}\n`);
  
  // Save manual review videos for re-analysis
  if (results.manualReview.length > 0) {
    const outputFile = '/tmp/manual-review-queue.json';
    fs.writeFileSync(outputFile, JSON.stringify(results.manualReview, null, 2));
    console.log(`💾 Saved ${results.manualReview.length} manual review videos to ${outputFile}`);
    console.log(`   Run 'npx tsx server/reanalyze-manual-review.ts' to process with new thresholds\n`);
  }
  
  // Close DB
  console.log(`📊 Closing database pool...`);
  await db.$client.end();
  console.log(`✅ Database pool closed`);
}

// Helper function to extract technique from title
function extractTechnique(title: string): string {
  const lower = title.toLowerCase();
  
  if (lower.includes('heel hook')) return 'Heel Hook';
  if (lower.includes('armbar')) return 'Armbar';
  if (lower.includes('triangle')) return 'Triangle Choke';
  if (lower.includes('passing')) return 'Guard Passing';
  if (lower.includes('guard retention')) return 'Guard Retention';
  if (lower.includes('sweep')) return 'Sweep';
  
  return 'Technique';
}

// Run test
testHybridSystem().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
