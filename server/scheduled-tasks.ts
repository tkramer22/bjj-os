import cron from 'node-cron';
import { formatInTimeZone } from 'date-fns-tz';
import { runAlertMonitor } from './alert-monitor-service';
import { sendHourlyDigest } from './hourly-digest-service';
import { processBatch as processVideoKnowledgeBatch } from './video-knowledge-service';
import { runPermanentAutoCuration, initializeAutoCurationState } from './permanent-auto-curation';
import { runDemandDrivenCuration, initializeDemandCurationState, isDemandCurationEnabled } from './demand-driven-curation';

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
      
      const dualKeyMode = process.env.GEMINI_API_KEY_2 ? '⚡ PARALLEL DUAL-KEY' : '🔑 SINGLE KEY';
      console.log(`🚀 [VIDEO-KNOWLEDGE] ${dualKeyMode} batch starting (20 videos)...`);
      const result = await processVideoKnowledgeBatch(20);
      
      if (result.processed > 0) {
        console.log(`✅ [VIDEO-KNOWLEDGE] Processed ${result.succeeded}/${result.processed} videos (${result.techniquesAdded} techniques)`);
      }
    } catch (error) {
      console.error('❌ [SCHEDULER] Video knowledge processing failed:', error);
    }
  });
  const keyMode = process.env.GEMINI_API_KEY_2 ? 'PARALLEL DUAL-KEY' : 'single key';
  console.log(`  ✅ Video Knowledge Processing: Every 2 min (20 videos/batch, ${keyMode})`);
  
  // ═══════════════════════════════════════════════════════════════
  // PERMANENT AUTO-CURATION - 4x daily (EST/EDT times with timezone)
  // Automatically curates videos targeting underrepresented instructors
  // Using America/New_York timezone to handle DST automatically
  // ═══════════════════════════════════════════════════════════════
  
  const cronOptions = { timezone: 'America/New_York' };
  
  // 3:15 AM EST/EDT - Primary run (right after YouTube quota reset at midnight PT)
  // MONDAY: Demand-driven curation (user requests)
  // TUESDAY-SUNDAY: Regular instructor-based curation
  cron.schedule('15 3 * * *', async () => {
    const now = new Date();
    const dayOfWeek = formatInTimeZone(now, 'America/New_York', 'EEEE');
    
    if (dayOfWeek === 'Monday' && isDemandCurationEnabled()) {
      console.log('🎯 [DEMAND-CURATION] Starting Monday 3:15 AM demand-driven curation...');
      try {
        await runDemandDrivenCuration();
      } catch (error) {
        console.error('❌ [DEMAND-CURATION] Monday 3:15 AM run failed:', error);
        // Fall back to regular curation if demand curation fails
        console.log('🔄 [AUTO-CURATION] Falling back to regular instructor-based curation...');
        await runPermanentAutoCuration();
      }
    } else {
      console.log('🤖 [AUTO-CURATION] Starting 3:15 AM EST/EDT run...');
      try {
        await runPermanentAutoCuration();
      } catch (error) {
        console.error('❌ [AUTO-CURATION] 3:15 AM run failed:', error);
      }
    }
  }, cronOptions);
  
  // 9:00 AM EST/EDT - Morning run
  cron.schedule('0 9 * * *', async () => {
    console.log('🤖 [AUTO-CURATION] Starting 9:00 AM EST/EDT run...');
    try {
      await runPermanentAutoCuration();
    } catch (error) {
      console.error('❌ [AUTO-CURATION] 9:00 AM run failed:', error);
    }
  }, cronOptions);
  
  // 3:00 PM EST/EDT - Afternoon run
  cron.schedule('0 15 * * *', async () => {
    console.log('🤖 [AUTO-CURATION] Starting 3:00 PM EST/EDT run...');
    try {
      await runPermanentAutoCuration();
    } catch (error) {
      console.error('❌ [AUTO-CURATION] 3:00 PM run failed:', error);
    }
  }, cronOptions);
  
  // 9:00 PM EST/EDT - Evening run
  cron.schedule('0 21 * * *', async () => {
    console.log('🤖 [AUTO-CURATION] Starting 9:00 PM EST/EDT run...');
    try {
      await runPermanentAutoCuration();
    } catch (error) {
      console.error('❌ [AUTO-CURATION] 9:00 PM run failed:', error);
    }
  }, cronOptions);
  
  console.log('  ✅ Permanent Auto-Curation: 4x daily (3:15am, 9am, 3pm, 9pm America/New_York)');
  console.log('     📌 Monday 3:15 AM: Demand-driven curation (user requests)');
  console.log('     📌 Tue-Sun 3:15 AM: Regular instructor-based curation');
  
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
        schedule: '4x daily (3:15am, 9am, 3pm, 9pm EST)',
        enabled: isInitialized && !!process.env.YOUTUBE_API_KEY
      }
    ]
  };
}
