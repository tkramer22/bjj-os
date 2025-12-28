import cron from 'node-cron';
import { runAlertMonitor } from './alert-monitor-service';
import { sendHourlyDigest } from './hourly-digest-service';
import { processBatch as processVideoKnowledgeBatch } from './video-knowledge-service';

/**
 * SCHEDULED TASKS COORDINATOR
 * Manages all automated background tasks for Dev OS 2.0
 */

let isInitialized = false;

/**
 * Initialize all scheduled tasks
 */
export function initScheduledTasks() {
  if (isInitialized) {
    console.log('⏰ [SCHEDULER] Already initialized');
    return;
  }
  
  console.log('⏰ [SCHEDULER] Initializing Dev OS 2.0 scheduled tasks...');
  
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
  // VIDEO KNOWLEDGE PROCESSING - TURBO MODE with PARALLEL dual keys
  // 20 videos/batch, every 30 seconds = 40 videos/min = 2,400/hour
  // With 2 keys processing in parallel, we maximize throughput
  // ═══════════════════════════════════════════════════════════════
  cron.schedule('*/30 * * * * *', async () => {
    try {
      // Only process if at least one Gemini API key is configured
      if (!process.env.GEMINI_API_KEY) {
        return;
      }
      
      const dualKeyMode = process.env.GEMINI_API_KEY_2 ? '⚡ PARALLEL DUAL-KEY' : '🔑 SINGLE KEY';
      console.log(`🚀 [VIDEO-KNOWLEDGE] ${dualKeyMode} TURBO batch starting (20 videos)...`);
      const result = await processVideoKnowledgeBatch(20);
      
      if (result.processed > 0) {
        console.log(`✅ [VIDEO-KNOWLEDGE] Processed ${result.succeeded}/${result.processed} videos (${result.techniquesAdded} techniques)`);
      }
    } catch (error) {
      console.error('❌ [SCHEDULER] Video knowledge processing failed:', error);
    }
  });
  const keyMode = process.env.GEMINI_API_KEY_2 ? 'PARALLEL DUAL-KEY TURBO' : 'single key';
  console.log(`  ✅ Video Knowledge Processing: Every 30 sec (20 videos/batch, ${keyMode})`);
  
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
        schedule: 'Every 5 minutes',
        enabled: isInitialized && !!process.env.GEMINI_API_KEY
      }
    ]
  };
}
