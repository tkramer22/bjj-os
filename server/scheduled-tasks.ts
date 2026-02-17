import cron from 'node-cron';
import { formatInTimeZone } from 'date-fns-tz';
import { runAlertMonitor } from './alert-monitor-service';
import { sendHourlyDigest } from './hourly-digest-service';
import { processBatch as processVideoKnowledgeBatch } from './video-knowledge-service';
import { runPermanentAutoCuration, initializeAutoCurationState, checkAndResendMissedCurationEmails, sendDailyCurationDigest } from './permanent-auto-curation';
import { runDemandDrivenCuration, initializeDemandCurationState, isDemandCurationEnabled } from './demand-driven-curation';
import { withMemoryManagement, forceGC, shouldSkipDueToMemory, logMemory } from './utils/memory-management';

/**
 * SCHEDULED TASKS COORDINATOR
 * Manages all automated background tasks for Dev OS 2.0
 */

let isInitialized = false;

/**
 * Initialize all scheduled tasks
 */
export async function initScheduledTasks() {
  if (isInitialized) {
    console.log('⏰ [SCHEDULER] Already initialized');
    return;
  }
  
  console.log('⏰ [SCHEDULER] Initializing Dev OS 2.0 scheduled tasks...');
  
  // Initialize auto-curation state from database BEFORE starting schedulers
  await initializeAutoCurationState();
  await initializeDemandCurationState();
  
  // Check for missed curation emails on startup (recovery mechanism)
  await checkAndResendMissedCurationEmails();
  
  // ═══════════════════════════════════════════════════════════════
  // ALERT MONITOR - Every 2 minutes
  // ═══════════════════════════════════════════════════════════════
  cron.schedule('*/2 * * * *', async () => {
    try {
      await runAlertMonitor();
    } catch (error) {
      console.error('❌ [SCHEDULER] Alert monitor failed:', error);
    }
  });
  console.log('  ✅ Alert Monitor: Every 2 minutes');
  
  // ═══════════════════════════════════════════════════════════════
  // HOURLY DIGEST - At :00 of every hour
  // ═══════════════════════════════════════════════════════════════
  cron.schedule('0 * * * *', async () => {
    try {
      await sendHourlyDigest();
    } catch (error) {
      console.error('❌ [SCHEDULER] Hourly digest failed:', error);
    }
  });
  console.log('  ✅ Hourly Digest: Every hour at :00');
  
  // ═══════════════════════════════════════════════════════════════
  // QUOTA AUTO-FIX - Every 15 minutes (proactive stale quota detection)
  // ═══════════════════════════════════════════════════════════════
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { autoFixStaleQuota } = await import('./youtube-quota-monitor');
      const result = await autoFixStaleQuota();
      
      if (result.fixed) {
        console.log('🔧 [QUOTA AUTO-FIX] Detected and fixed stale quota data');
        console.log('   Curation can now resume with fresh quota');
      }
    } catch (error) {
      console.error('❌ [SCHEDULER] Quota auto-fix failed:', error);
    }
  });
  console.log('  ✅ Quota Auto-Fix: Every 15 minutes');
  
  // ═══════════════════════════════════════════════════════════════
  // VIDEO KNOWLEDGE PROCESSING - OPTIMIZED for stability
  // 20 videos/batch, every 2 minutes = 10 videos/min = 600/hour
  // Reduced from 30s to 2min to lower memory churn and improve stability
  // With 2 keys processing in parallel when available
  // ═══════════════════════════════════════════════════════════════
  cron.schedule('*/2 * * * *', async () => {
    try {
      // Only process if at least one Gemini API key is configured
      if (!process.env.GEMINI_API_KEY) {
        return;
      }
      
      // Skip if memory is critically low
      if (shouldSkipDueToMemory()) {
        console.log('⏸️ [VIDEO-KNOWLEDGE] Skipping batch due to memory pressure');
        return;
      }
      
      const dualKeyMode = process.env.GEMINI_API_KEY_2 ? '⚡ PARALLEL DUAL-KEY' : '🔑 SINGLE KEY';
      console.log(`🚀 [VIDEO-KNOWLEDGE] ${dualKeyMode} batch starting (20 videos)...`);
      
      await withMemoryManagement('Video Knowledge Processing', async () => {
        const result = await processVideoKnowledgeBatch(20);
        if (result.processed > 0) {
          console.log(`✅ [VIDEO-KNOWLEDGE] Processed ${result.succeeded}/${result.processed} videos (${result.techniquesAdded} techniques)`);
        }
      });
    } catch (error) {
      console.error('❌ [SCHEDULER] Video knowledge processing failed:', error);
      forceGC('Video Knowledge Error Recovery');
    }
  });
  const keyMode = process.env.GEMINI_API_KEY_2 ? 'PARALLEL DUAL-KEY' : 'single key';
  console.log(`  ✅ Video Knowledge Processing: Every 2 min (20 videos/batch, ${keyMode})`);
  
  // ═══════════════════════════════════════════════════════════════
  // PERMANENT AUTO-CURATION - 2x daily + daily digest email
  // Reduced from 4x to minimize API usage and email spam
  // Using America/New_York timezone to handle DST automatically
  // ═══════════════════════════════════════════════════════════════
  
  const cronOptions = { timezone: 'America/New_York' };
  
  // 3:15 AM EST/EDT - Primary run (right after YouTube quota reset at midnight PT)
  // MONDAY: Demand-driven curation (user requests)
  // TUESDAY-SUNDAY: Regular instructor-based curation
  cron.schedule('15 3 * * *', async () => {
    const now = new Date();
    const dayOfWeek = formatInTimeZone(now, 'America/New_York', 'EEEE');
    
    if (shouldSkipDueToMemory()) {
      console.log('[AUTO-CURATION] Skipping 3:15 AM run due to memory pressure');
      return;
    }
    
    if (dayOfWeek === 'Monday' && isDemandCurationEnabled()) {
      console.log('[DEMAND-CURATION] Starting Monday 3:15 AM demand-driven curation...');
      try {
        await withMemoryManagement('Demand-Driven Curation', runDemandDrivenCuration);
      } catch (error) {
        console.error('[DEMAND-CURATION] Monday 3:15 AM run failed:', error);
        console.log('[AUTO-CURATION] Falling back to regular instructor-based curation...');
        await withMemoryManagement('Auto-Curation Fallback', runPermanentAutoCuration);
      }
    } else {
      console.log('[AUTO-CURATION] Starting 3:15 AM EST/EDT run...');
      try {
        await withMemoryManagement('Auto-Curation 3:15AM', runPermanentAutoCuration);
      } catch (error) {
        console.error('[AUTO-CURATION] 3:15 AM run failed:', error);
        forceGC('Auto-Curation Error Recovery');
      }
    }
  }, cronOptions);
  
  // 2:00 PM EST/EDT - Afternoon run
  cron.schedule('0 14 * * *', async () => {
    if (shouldSkipDueToMemory()) {
      console.log('[AUTO-CURATION] Skipping 2:00 PM run due to memory pressure');
      return;
    }
    console.log('[AUTO-CURATION] Starting 2:00 PM EST/EDT run...');
    try {
      await withMemoryManagement('Auto-Curation 2PM', runPermanentAutoCuration);
    } catch (error) {
      console.error('[AUTO-CURATION] 2:00 PM run failed:', error);
      forceGC('Auto-Curation Error Recovery');
    }
  }, cronOptions);
  
  // 9:00 PM EST/EDT - Daily curation digest email (ONE email per day)
  cron.schedule('0 21 * * *', async () => {
    console.log('[AUTO-CURATION] Sending daily curation digest email...');
    try {
      await sendDailyCurationDigest();
    } catch (error) {
      console.error('[AUTO-CURATION] Failed to send daily digest:', error);
    }
  }, cronOptions);
  
  console.log('  ✅ Permanent Auto-Curation: 2x daily (3:15am, 2pm America/New_York)');
  console.log('     📌 Monday 3:15 AM: Demand-driven curation (user requests)');
  console.log('     📌 Tue-Sun 3:15 AM: Regular instructor-based curation');
  console.log('     📧 Daily digest email: 9:00 PM EST (single summary)');
  
  // ═══════════════════════════════════════════════════════════════
  // INITIAL RUN - Run alert monitor on startup
  // ═══════════════════════════════════════════════════════════════
  setTimeout(async () => {
    console.log('⏰ [SCHEDULER] Running initial alert monitor check...');
    try {
      await runAlertMonitor();
    } catch (error) {
      console.error('❌ [SCHEDULER] Initial alert monitor failed:', error);
    }
  }, 5000); // Wait 5 seconds after startup
  
  isInitialized = true;
  console.log('✅ [SCHEDULER] Dev OS 2.0 scheduled tasks active\n');
}

/**
 * Schedule a one-time reminder
 * Used for chat-based requests like "check curation in 30 minutes"
 */
export function scheduleReminder(
  delayMinutes: number,
  task: () => Promise<void>,
  description: string
) {
  console.log(`⏰ [SCHEDULER] Scheduling reminder: "${description}" in ${delayMinutes} minutes`);
  
  setTimeout(async () => {
    console.log(`🔔 [SCHEDULER] Executing reminder: "${description}"`);
    try {
      await task();
    } catch (error) {
      console.error(`❌ [SCHEDULER] Reminder "${description}" failed:`, error);
    }
  }, delayMinutes * 60 * 1000);
  
  return {
    scheduledFor: new Date(Date.now() + delayMinutes * 60 * 1000),
    description
  };
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    initialized: isInitialized,
    tasks: [
      {
        name: 'Alert Monitor',
        schedule: 'Every 2 minutes',
        enabled: isInitialized
      },
      {
        name: 'Hourly Digest',
        schedule: 'Every hour at :00',
        enabled: isInitialized
      },
      {
        name: 'Quota Auto-Fix',
        schedule: 'Every 15 minutes',
        enabled: isInitialized
      },
      {
        name: 'Video Knowledge Processing',
        schedule: 'Every 2 minutes',
        enabled: isInitialized && !!process.env.GEMINI_API_KEY
      },
      {
        name: 'Permanent Auto-Curation',
        schedule: '2x daily (3:15am, 2pm EST) + 9pm digest email',
        enabled: isInitialized && !!process.env.YOUTUBE_API_KEY
      }
    ]
  };
}
