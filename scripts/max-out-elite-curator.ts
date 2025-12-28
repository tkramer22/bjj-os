#!/usr/bin/env tsx
/**
 * Max out Elite Curator daily quota
 */

import { runEliteCuration, getEliteCuratorStats } from '../server/elite-curator';

async function main() {
  console.log('\n🎯 ELITE CURATOR - MAXING OUT DAILY QUOTA');
  console.log('═══════════════════════════════════════════════\n');
  
  let runNumber = 1;
  let totalVideosApproved = 0;
  let totalVideosFound = 0;
  let totalSearches = 0;
  
  while (true) {
    try {
      // Check stats before run
      const statsBefore = await getEliteCuratorStats();
      console.log(`Run #${runNumber} | Searches: ${statsBefore.dailySearchesUsed}/${statsBefore.maxDailySearches}`);
      
      // Check if quota is maxed
      if (statsBefore.dailySearchesUsed >= statsBefore.maxDailySearches) {
        console.log('\n✅ QUOTA MAXED OUT!');
        break;
      }
      
      // Run curation
      const result = await runEliteCuration();
      
      if (!result.success) {
        console.error(`❌ Failed: ${result.message}`);
        break;
      }
      
      // Track totals
      totalSearches += result.searchesPerformed || 0;
      totalVideosFound += result.videosFound || 0;
      totalVideosApproved += result.videosApproved || 0;
      
      console.log(`   ✅ Searched: ${result.searchesPerformed} | Found: ${result.videosFound} | Approved: ${result.videosApproved} | Rate: ${result.approvalRate?.toFixed(1)}%\n`);
      
      runNumber++;
      
      // Quick delay between runs
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error: any) {
      console.error(`❌ Error:`, error.message);
      if (error.message?.includes('QUOTA')) break;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 FINAL RESULTS:');
  console.log(`   Runs: ${runNumber - 1}`);
  console.log(`   Searches: ${totalSearches}`);
  console.log(`   Videos Found: ${totalVideosFound}`);
  console.log(`   Videos Approved: ${totalVideosApproved}`);
  console.log(`   Overall Approval Rate: ${totalSearches > 0 ? ((totalVideosApproved / totalVideosFound) * 100).toFixed(1) : 0}%`);
  console.log('═══════════════════════════════════════════════\n');
  
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
