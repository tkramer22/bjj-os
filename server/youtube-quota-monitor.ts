/**
 * YouTube API Quota Monitor
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Tracks YouTube API quota usage to prevent exceeding daily limits
 * Daily quota: 10,000 units (resets midnight Pacific Time = 3 AM Eastern)
 * 
 * Cost per operation:
 * - search.list: 100 units
 * - videos.list: 1 unit
 * - channels.list: 1 unit
 * 
 * Auto-Recovery Features:
 * - Automatic quota reset at 3:05 AM ET (scheduled cron job)
 * - Stale quota detection (checks if quota data is outdated)
 * - YouTube API health testing (verifies quota is actually exhausted)
 * - Auto-fix mechanism (resets stale quota and resumes curation)
 */

import axios from 'axios';

interface QuotaUsage {
  date: string; // YYYY-MM-DD format
  searchCalls: number;
  videoDetailCalls: number;
  channelStatCalls: number;
  estimatedUnits: number;
  quotaExceeded: boolean;
  lastResetTime: Date; // Track when quota was last reset
}

// In-memory quota tracking (resets on server restart)
let quotaUsage: QuotaUsage = {
  date: new Date().toISOString().split('T')[0],
  searchCalls: 0,
  videoDetailCalls: 0,
  channelStatCalls: 0,
  estimatedUnits: 0,
  quotaExceeded: false,
  lastResetTime: new Date()
};

const DAILY_QUOTA_LIMIT = 10000;
const SEARCH_COST = 100;
const VIDEO_DETAIL_COST = 1;
const CHANNEL_STAT_COST = 1;

/**
 * Reset quota tracking at midnight Pacific Time
 */
function checkAndResetQuota() {
  const today = new Date().toISOString().split('T')[0];
  
  if (quotaUsage.date !== today) {
    console.log('[QUOTA MONITOR] New day detected - resetting quota tracker');
    quotaUsage = {
      date: today,
      searchCalls: 0,
      videoDetailCalls: 0,
      channelStatCalls: 0,
      estimatedUnits: 0,
      quotaExceeded: false,
      lastResetTime: new Date()
    };
  }
}

/**
 * Track a YouTube API search call
 */
export function trackSearchCall() {
  checkAndResetQuota();
  quotaUsage.searchCalls++;
  quotaUsage.estimatedUnits += SEARCH_COST;
  
  if (quotaUsage.estimatedUnits >= DAILY_QUOTA_LIMIT) {
    quotaUsage.quotaExceeded = true;
  }
}

/**
 * Track a YouTube video details call
 */
export function trackVideoDetailCall() {
  checkAndResetQuota();
  quotaUsage.videoDetailCalls++;
  quotaUsage.estimatedUnits += VIDEO_DETAIL_COST;
  
  if (quotaUsage.estimatedUnits >= DAILY_QUOTA_LIMIT) {
    quotaUsage.quotaExceeded = true;
  }
}

/**
 * Track a YouTube channel stats call
 */
export function trackChannelStatCall() {
  checkAndResetQuota();
  quotaUsage.channelStatCalls++;
  quotaUsage.estimatedUnits += CHANNEL_STAT_COST;
  
  if (quotaUsage.estimatedUnits >= DAILY_QUOTA_LIMIT) {
    quotaUsage.quotaExceeded = true;
  }
}

/**
 * Check if quota is likely exceeded
 */
export function isQuotaLikelyExceeded(): boolean {
  checkAndResetQuota();
  return quotaUsage.quotaExceeded || quotaUsage.estimatedUnits >= DAILY_QUOTA_LIMIT * 0.95;
}

/**
 * Get current quota usage statistics
 */
export function getQuotaUsage(): QuotaUsage {
  checkAndResetQuota();
  return { ...quotaUsage };
}

/**
 * Get remaining quota (estimated)
 */
export function getRemainingQuota(): number {
  checkAndResetQuota();
  return Math.max(0, DAILY_QUOTA_LIMIT - quotaUsage.estimatedUnits);
}

/**
 * Mark quota as exceeded (called when API returns quota error)
 */
export function markQuotaExceeded() {
  checkAndResetQuota();
  quotaUsage.quotaExceeded = true;
  console.error('🚫 YouTube API quota exceeded');
  console.error(`   Estimated usage: ${quotaUsage.estimatedUnits}/${DAILY_QUOTA_LIMIT} units`);
  console.error(`   Search calls: ${quotaUsage.searchCalls} (${quotaUsage.searchCalls * SEARCH_COST} units)`);
  console.error(`   Video detail calls: ${quotaUsage.videoDetailCalls} (${quotaUsage.videoDetailCalls * VIDEO_DETAIL_COST} units)`);
  console.error(`   Channel stat calls: ${quotaUsage.channelStatCalls} (${quotaUsage.channelStatCalls * CHANNEL_STAT_COST} units)`);
  console.error('   ⏰ Quota resets at midnight Pacific Time');
}

/**
 * Log current quota status
 */
export function logQuotaStatus() {
  checkAndResetQuota();
  const percentUsed = (quotaUsage.estimatedUnits / DAILY_QUOTA_LIMIT * 100).toFixed(1);
  
  console.log('[QUOTA MONITOR] Current usage:');
  console.log(`   ${quotaUsage.estimatedUnits}/${DAILY_QUOTA_LIMIT} units (${percentUsed}%)`);
  console.log(`   Search: ${quotaUsage.searchCalls} calls (${quotaUsage.searchCalls * SEARCH_COST} units)`);
  console.log(`   Video details: ${quotaUsage.videoDetailCalls} calls (${quotaUsage.videoDetailCalls * VIDEO_DETAIL_COST} units)`);
  console.log(`   Channel stats: ${quotaUsage.channelStatCalls} calls (${quotaUsage.channelStatCalls * CHANNEL_STAT_COST} units)`);
  console.log(`   Remaining: ${getRemainingQuota()} units`);
  
  if (quotaUsage.quotaExceeded) {
    console.warn('   ⚠️  QUOTA EXCEEDED - Curation paused until midnight PT');
  } else if (quotaUsage.estimatedUnits >= DAILY_QUOTA_LIMIT * 0.8) {
    console.warn(`   ⚠️  WARNING: ${percentUsed}% of daily quota used`);
  }
}

// Log quota status every hour
setInterval(() => {
  logQuotaStatus();
}, 60 * 60 * 1000);

/**
 * FORCE RESET: Manually reset quota tracking (called by cron at 3:05 AM ET)
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export function forceResetQuota(reason: string = 'scheduled_reset') {
  const previousState = { ...quotaUsage };
  
  quotaUsage = {
    date: new Date().toISOString().split('T')[0],
    searchCalls: 0,
    videoDetailCalls: 0,
    channelStatCalls: 0,
    estimatedUnits: 0,
    quotaExceeded: false,
    lastResetTime: new Date()
  };
  
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🔄 [QUOTA MONITOR] FORCE RESET TRIGGERED');
  console.log(`   Reason: ${reason}`);
  console.log(`   Previous state:`);
  console.log(`     - Date: ${previousState.date}`);
  console.log(`     - Units used: ${previousState.estimatedUnits}/${DAILY_QUOTA_LIMIT}`);
  console.log(`     - Quota exceeded: ${previousState.quotaExceeded ? 'YES ⚠️' : 'NO ✅'}`);
  console.log(`   New state:`);
  console.log(`     - Date: ${quotaUsage.date}`);
  console.log(`     - Fresh quota: ${DAILY_QUOTA_LIMIT} units available`);
  console.log(`     - Reset time: ${quotaUsage.lastResetTime.toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  return {
    success: true,
    previousQuotaExceeded: previousState.quotaExceeded,
    freshQuotaAvailable: DAILY_QUOTA_LIMIT
  };
}

/**
 * TEST YOUTUBE API: Verify quota is actually exhausted (not stale data)
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export async function testYouTubeAPIHealth(): Promise<{ 
  working: boolean; 
  quotaActuallyExhausted: boolean;
  error?: string;
}> {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return { 
        working: false, 
        quotaActuallyExhausted: false,
        error: 'No API key configured'
      };
    }

    console.log('[QUOTA MONITOR] Testing YouTube API health...');
    
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'id',
        q: 'bjj',
        type: 'video',
        maxResults: 1,
        key: apiKey
      },
      timeout: 5000
    });
    
    console.log(`[QUOTA MONITOR] ✅ API test successful (HTTP ${response.status})`);
    
    return {
      working: true,
      quotaActuallyExhausted: false
    };
    
  } catch (error: any) {
    // Check if it's a quota error
    if (error.response?.data?.error?.errors?.[0]?.reason === 'quotaExceeded') {
      console.log('[QUOTA MONITOR] ⚠️  API returned quotaExceeded - quota actually exhausted');
      return {
        working: false,
        quotaActuallyExhausted: true
      };
    }
    
    console.error('[QUOTA MONITOR] ❌ API test failed:', error.message);
    return {
      working: false,
      quotaActuallyExhausted: false,
      error: error.message
    };
  }
}

/**
 * DETECT STALE QUOTA: Check if quota status is outdated
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export function detectStaleQuota(): { 
  isStale: boolean; 
  reason?: string;
  shouldTest?: boolean;
} {
  // Check if quota shows exceeded
  if (!quotaUsage.quotaExceeded) {
    return { isStale: false };
  }
  
  // Get current time in Eastern Time
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hourET = etTime.getHours();
  
  // If it's past 3 AM ET and quota still shows exhausted, it might be stale
  if (hourET >= 3) {
    const hoursSinceReset = (now.getTime() - quotaUsage.lastResetTime.getTime()) / 1000 / 60 / 60;
    
    if (hoursSinceReset > 3) {
      return {
        isStale: true,
        reason: `Quota shows exhausted at ${hourET}:00 ET (past 3 AM reset time). Last reset: ${hoursSinceReset.toFixed(1)} hours ago`,
        shouldTest: true
      };
    }
  }
  
  return { isStale: false };
}

/**
 * AUTO-FIX STALE QUOTA: Detect and fix stale quota data automatically
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export async function autoFixStaleQuota(): Promise<{
  wasStale: boolean;
  fixed: boolean;
  quotaAvailable: boolean;
}> {
  const staleCheck = detectStaleQuota();
  
  if (!staleCheck.isStale) {
    return { wasStale: false, fixed: false, quotaAvailable: !quotaUsage.quotaExceeded };
  }
  
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🔧 [QUOTA MONITOR] AUTO-FIX: Detected stale quota data');
  console.log(`   Reason: ${staleCheck.reason}`);
  console.log('   Testing YouTube API to verify...');
  
  const apiTest = await testYouTubeAPIHealth();
  
  if (apiTest.working) {
    console.log('   ✅ API WORKS! Quota was stale - resetting to fresh');
    forceResetQuota('autofix_stale_quota');
    console.log('   ✅ Fresh quota available - curation can resume');
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    
    return { wasStale: true, fixed: true, quotaAvailable: true };
  } else if (apiTest.quotaActuallyExhausted) {
    console.log('   ❌ Quota is actually exhausted - not stale');
    console.log('   ⏰ Will retry after midnight Pacific (3 AM ET)');
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    
    return { wasStale: false, fixed: false, quotaAvailable: false };
  } else {
    console.log(`   ⚠️  API test inconclusive: ${apiTest.error}`);
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    
    return { wasStale: true, fixed: false, quotaAvailable: false };
  }
}

/**
 * SMART QUOTA CHECK: Enhanced quota check with auto-recovery
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export async function smartQuotaCheck(): Promise<{
  available: boolean;
  remaining: number;
  autoFixed: boolean;
}> {
  checkAndResetQuota();
  
  // If quota appears exceeded, check if it's stale
  if (quotaUsage.quotaExceeded) {
    const autoFix = await autoFixStaleQuota();
    
    if (autoFix.fixed) {
      return {
        available: true,
        remaining: DAILY_QUOTA_LIMIT,
        autoFixed: true
      };
    }
  }
  
  return {
    available: !quotaUsage.quotaExceeded && quotaUsage.estimatedUnits < DAILY_QUOTA_LIMIT * 0.95,
    remaining: getRemainingQuota(),
    autoFixed: false
  };
}
