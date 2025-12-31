/**
 * EMERGENCY VIDEO CURATION SYSTEM
 * 
 * Bypasses normal curation controls when emergency_curation_override is TRUE
 * Runs continuously until:
 * - 2,000 videos reached
 * - 9,000 API quota units used
 * 
 * Schedule: Daily at 6:00 AM EST + immediate execution on startup
 */

import { db } from './db';
import { systemSettings, aiVideoKnowledge } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getSetting, updateSetting } from './curation-controller';

const MAX_DAILY_API_QUOTA = 9000; // Stop at 9k to leave 1k buffer
const TARGET_VIDEOS = 10000;
const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES = 30000; // 30 seconds

let emergencyRunInProgress = false;

/**
 * Check if emergency override is enabled
 */
export async function checkEmergencyOverride(): Promise<boolean> {
  try {
    const override = await getSetting('emergency_curation_override', false);
    return override === true || override === 'true';
  } catch (error) {
    console.error('[EMERGENCY] Error checking override:', error);
    return false;
  }
}

/**
 * Get current Eastern Time as formatted string
 */
function getEasternTime(): string {
  return new Date().toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Emergency curation run - processes videos until quota exhausted or target reached
 */
export async function emergencyCurationRun(): Promise<void> {
  // Prevent multiple simultaneous runs
  if (emergencyRunInProgress) {
    console.log('[EMERGENCY] ⚠️  Run already in progress, skipping');
    return;
  }
  
  const overrideEnabled = await checkEmergencyOverride();
  if (!overrideEnabled) {
    console.log('[EMERGENCY] Override not enabled, skipping emergency run');
    return;
  }
  
  emergencyRunInProgress = true;
  
  const startTime = getEasternTime();
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`🚨 EMERGENCY CURATION STARTED - ${startTime} EST`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  let totalProcessed = 0;
  let totalAdded = 0;
  let apiQuotaUsed = 0;
  let batchNumber = 0;
  
  try {
    const { runContentFirstCuration } = await import('./content-first-curator');
    
    while (apiQuotaUsed < MAX_DAILY_API_QUOTA) {
      batchNumber++;
      
      // Check current video count
      const currentVideos = await db.select().from(aiVideoKnowledge);
      const currentTotal = currentVideos.length;
      
      if (currentTotal >= TARGET_VIDEOS) {
        console.log('\n═══════════════════════════════════════════════════════════════════');
        console.log(`✅ TARGET REACHED: ${currentTotal}/${TARGET_VIDEOS} videos`);
        console.log('═══════════════════════════════════════════════════════════════════\n');
        
        // Disable emergency override
        await updateSetting('emergency_curation_override', 'false', 'auto_system');
        console.log('🔒 Emergency override disabled automatically');
        break;
      }
      
      const currentTime = getEasternTime();
      console.log(`\n[${currentTime} EST] 🎬 Processing Batch #${batchNumber} (${BATCH_SIZE} videos)...`);
      
      try {
        // Run content-first curation
        // Parameters: (numTechniques, videosPerTechnique)
        const techniquesPerBatch = 10;
        const videosPerTechnique = 5;
        
        const result = await runContentFirstCuration(techniquesPerBatch, videosPerTechnique);
        
        const videosAdded = result?.videosSaved || 0;
        const videosProcessed = techniquesPerBatch * videosPerTechnique;
        
        totalProcessed += videosProcessed;
        totalAdded += videosAdded;
        
        // Estimate API quota used (YouTube search + Claude analysis)
        // YouTube search: ~100 units per search
        // Claude analysis: minimal (not counted against YouTube quota)
        const quotaUsedThisBatch = techniquesPerBatch * 100;
        apiQuotaUsed += quotaUsedThisBatch;
        
        const newTotal = currentTotal + videosAdded;
        const progress = ((newTotal / TARGET_VIDEOS) * 100).toFixed(1);
        
        console.log(`[${getEasternTime()} EST] ✅ Batch #${batchNumber} complete:`);
        console.log(`   • Videos added: +${videosAdded}`);
        console.log(`   • Database total: ${newTotal}/${TARGET_VIDEOS} (${progress}%)`);
        console.log(`   • API quota used: ${apiQuotaUsed}/9,000 units`);
        console.log(`   • Session total: +${totalAdded} videos`);
        
        // Delay between batches to avoid rate limits
        if (apiQuotaUsed < MAX_DAILY_API_QUOTA && newTotal < TARGET_VIDEOS) {
          console.log(`[${getEasternTime()} EST] ⏳ Waiting 30 seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
        
      } catch (batchError: any) {
        console.error(`\n[${getEasternTime()} EST] ❌ Batch #${batchNumber} ERROR:`, batchError.message);
        
        // If quota exceeded, stop gracefully
        if (batchError.message?.includes('quota') || batchError.message?.includes('429')) {
          console.log(`[${getEasternTime()} EST] 🛑 API quota limit reached, stopping for today`);
          break;
        }
        
        // For other errors, wait and retry
        console.log(`[${getEasternTime()} EST] ⏳ Waiting 60 seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        continue;
      }
    }
    
    // Final summary
    const endTime = getEasternTime();
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log(`🎯 EMERGENCY RUN COMPLETE - ${endTime} EST`);
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`Started: ${startTime} EST`);
    console.log(`Ended: ${endTime} EST`);
    console.log(`Batches processed: ${batchNumber}`);
    console.log(`Videos added: ${totalAdded}`);
    console.log(`API quota used: ${apiQuotaUsed}/9,000 units`);
    
    const finalCount = await db.select().from(aiVideoKnowledge);
    console.log(`Current database total: ${finalCount.length}/${TARGET_VIDEOS}`);
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
  } catch (error: any) {
    console.error('\n❌ CRITICAL ERROR in emergency curation:', error);
    console.error('Stack:', error.stack);
  } finally {
    emergencyRunInProgress = false;
  }
}

/**
 * Start emergency curation immediately (called on server startup)
 */
export async function startEmergencyCurationIfEnabled(): Promise<void> {
  const overrideEnabled = await checkEmergencyOverride();
  
  if (overrideEnabled) {
    console.log('\n🚨 EMERGENCY OVERRIDE DETECTED - Starting immediate curation run');
    console.log(`🕐 Current time: ${getEasternTime()} EST\n`);
    
    // Start after short delay to ensure server is fully initialized
    setTimeout(async () => {
      await emergencyCurationRun();
    }, 5000); // 5 second delay
  }
}
