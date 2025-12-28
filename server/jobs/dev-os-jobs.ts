import cron from 'node-cron';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { bjjUsers } from '@shared/schema';

// ============================================================================
// DEV OS SCHEDULED JOBS - Automated Intelligence
// ============================================================================

// Daily snapshot (every day at midnight EST)
cron.schedule('0 0 * * *', async () => {
  console.log('[DEV OS JOBS] Running daily system snapshot...');
  try {
    const { getSystemSnapshot } = await import('../services/dev-os-intelligence');
    await getSystemSnapshot();
    console.log('✅ [DEV OS JOBS] Daily snapshot saved');
  } catch (error) {
    console.error('❌ [DEV OS JOBS] Daily snapshot failed:', error);
  }
}, {
  timezone: 'America/New_York'
});

// Weekly threshold adjustment (every Monday at 1 AM EST)
cron.schedule('0 1 * * 1', async () => {
  console.log('[DEV OS JOBS] Running weekly threshold adjustment...');
  try {
    const { getAdaptiveThresholds } = await import('../services/dev-os-intelligence');
    
    // Get all admin users (identified by isAdmin flag)
    const adminUsers = await db.select()
      .from(bjjUsers)
      .where(eq(bjjUsers.isAdmin, true));
    
    if (adminUsers.length === 0) {
      console.log('[DEV OS JOBS] No admin users found for threshold adjustment');
      return;
    }
    
    for (const admin of adminUsers) {
      await getAdaptiveThresholds(admin.id);
      console.log(`✅ [DEV OS JOBS] Thresholds adjusted for admin: ${admin.email || admin.id}`);
    }
    
    console.log(`✅ [DEV OS JOBS] All thresholds adjusted for ${adminUsers.length} admin(s)`);
  } catch (error) {
    console.error('❌ [DEV OS JOBS] Threshold adjustment failed:', error);
  }
}, {
  timezone: 'America/New_York'
});

// Hourly lightweight metrics collection (for real-time trending)
cron.schedule('0 * * * *', async () => {
  try {
    // Lightweight data collection for intraday trending
    await collectHourlyMetrics();
  } catch (error) {
    console.error('❌ [DEV OS JOBS] Hourly metrics failed:', error);
  }
}, {
  timezone: 'America/New_York'
});

async function collectHourlyMetrics() {
  // Store lightweight metrics for intraday trending
  // This can be expanded based on specific needs
  const timestamp = new Date();
  console.log(`[DEV OS JOBS] Hourly metrics collected at ${timestamp.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
}

// Initialize Dev OS cron jobs
export function initializeDevOsJobs() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ DEV OS SCHEDULED JOBS INITIALIZED');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📊 Daily snapshots: Midnight EST (00:00)');
  console.log('  🧠 Weekly threshold adjustment: Monday 1 AM EST (01:00)');
  console.log('  ⏱️  Hourly metrics: Every hour (00:00)');
  console.log('═══════════════════════════════════════════════════════════════');
}
