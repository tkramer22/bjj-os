#!/usr/bin/env tsx
/**
 * Run Elite Curator to execute 150 searches (15 runs × 10 searches)
 */

import { runEliteCuration, getEliteCuratorStats } from '../server/elite-curator';

async function main() {
  console.log('\n🎯 ELITE CURATOR - EXECUTING 150 SEARCHES');
  console.log('═══════════════════════════════════════════════\n');
  
  const targetSearches = 150;
  let totalSearches = 0;
  let totalVideosApproved = 0;
  let totalVideosFound = 0;
  let runNumber = 1;
  
  // Wait for server to be ready
  console.log('⏳ Waiting 10 seconds for server to be ready...\n');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  while (totalSearches < targetSearches) {
    try {
      // Check current quota
      const statsBefore = await getEliteCuratorStats();
      const remaining = statsBefore.maxDailySearches - statsBefore.dailySearchesUsed;
      
      console.log(`\n📊 Run #${runNumber}`);
      console.log(`   Quota: ${statsBefore.dailySearchesUsed}/${statsBefore.maxDailySearches}`);
      console.log(`   Remaining: ${remaining} searches`);
      
      if (remaining <= 0) {
        console.log('\n✅ QUOTA MAXED OUT!');
        break;
      }
      
      console.log(`\n🚀 Starting run #${runNumber}...`);
      
      // Run curation
      const result = await runEliteCuration();
      
      if (!result.success) {
        console.error(`\n❌ Run #${runNumber} failed: ${result.message}`);
        if (result.message?.includes('quota') || result.message?.includes('disabled')) {
          break;
        }
        // Wait and retry on other errors
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      // Track totals
      totalSearches += result.searchesPerformed || 0;
      totalVideosFound += result.videosFound || 0;
      totalVideosApproved += result.videosApproved || 0;
      
      console.log(`\n✅ Run #${runNumber} Complete:`);
      console.log(`   Searched: ${result.searchesPerformed}`);
      console.log(`   Found: ${result.videosFound}`);
      console.log(`   Approved: ${result.videosApproved}`);
      console.log(`   Approval Rate: ${result.approvalRate?.toFixed(1)}%`);
      console.log(`\n📈 Session Totals:`);
      console.log(`   Total Searches: ${totalSearches}/${targetSearches}`);
      console.log(`   Total Approved: ${totalVideosApproved}`);
      
      runNumber++;
      
      // Brief delay between runs
      console.log('\n⏳ Waiting 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error: any) {
      console.error(`\n❌ Error in run #${runNumber}:`, error.message);
      
      if (error.message?.includes('QUOTA') || error.message?.includes('quota')) {
        console.log('\n✅ QUOTA REACHED!');
        break;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // Final stats
  const finalStats = await getEliteCuratorStats();
  
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 FINAL RESULTS:');
  console.log('═══════════════════════════════════════════════');
  console.log(`   Runs Completed: ${runNumber - 1}`);
  console.log(`   Total Searches: ${totalSearches}`);
  console.log(`   Videos Found: ${totalVideosFound}`);
  console.log(`   Videos Approved: ${totalVideosApproved}`);
  console.log(`   Overall Approval Rate: ${totalVideosFound > 0 ? ((totalVideosApproved / totalVideosFound) * 100).toFixed(1) : 0}%`);
  console.log(`\n   Final Quota: ${finalStats.dailySearchesUsed}/${finalStats.maxDailySearches}`);
  console.log(`   Library Progress: ${finalStats.library.current}/${finalStats.library.target} (${finalStats.library.progress}%)`);
  console.log('═══════════════════════════════════════════════\n');
  
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
