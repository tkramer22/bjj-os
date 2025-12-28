/**
 * Check Current YouTube API Quota Usage
 */

import { getQuotaUsage, getRemainingQuota, logQuotaStatus } from './youtube-quota-monitor';
import { db } from './db';

async function checkQuota() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 CURRENT YOUTUBE API QUOTA STATUS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const usage = getQuotaUsage();
  const remaining = getRemainingQuota();
  const percentUsed = (usage.estimatedUnits / 10000 * 100).toFixed(1);
  
  console.log(`Date: ${usage.date}`);
  console.log(`Last Reset: ${usage.lastResetTime.toISOString()}\n`);
  
  console.log(`USAGE BREAKDOWN:`);
  console.log(`  Search calls:        ${usage.searchCalls} calls × 100 units = ${usage.searchCalls * 100} units`);
  console.log(`  Video detail calls:  ${usage.videoDetailCalls} calls × 1 unit   = ${usage.videoDetailCalls} units`);
  console.log(`  Channel stat calls:  ${usage.channelStatCalls} calls × 1 unit   = ${usage.channelStatCalls} units`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  TOTAL USED:          ${usage.estimatedUnits} / 10,000 units (${percentUsed}%)`);
  console.log(`  REMAINING:           ${remaining} units\n`);
  
  if (usage.quotaExceeded) {
    console.log(`⚠️  STATUS: QUOTA EXCEEDED`);
    console.log(`   Curation is paused until quota resets`);
    console.log(`   Next reset: Midnight Pacific Time (3 AM Eastern)`);
  } else if (usage.estimatedUnits >= 9500) {
    console.log(`⚠️  STATUS: NEAR LIMIT (95%+ used)`);
    console.log(`   ${remaining} units remaining before auto-pause`);
  } else if (usage.estimatedUnits >= 8000) {
    console.log(`⚠️  STATUS: HIGH USAGE (80%+ used)`);
    console.log(`   ${remaining} units remaining`);
  } else {
    console.log(`✅ STATUS: HEALTHY`);
    console.log(`   ${remaining} units available`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
  
  // Close DB
  await db.$client.end();
}

checkQuota().catch(console.error);
