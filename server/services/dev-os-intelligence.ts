import { db } from '../db';
import { eq, and, or, gte, desc, lt, sql } from 'drizzle-orm';
import {
  bjjUsers,
  aiVideoKnowledge,
  systemErrors,
  devOsThresholds,
  devOsInteractions,
  devOsAlerts,
  devOsSnapshots,
  devOsActions,
} from '@shared/schema';

// ============================================================================
// SYSTEM SNAPSHOT - Real-time data gathering
// ============================================================================

export async function getSystemSnapshot() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  
  const last7Days = new Date(today);
  last7Days.setDate(last7Days.getDate() - 7);
  
  // Get current metrics
  const allUsers = await db.select().from(bjjUsers);
  const totalUsers = allUsers.length;
  
  // Active users (logged in last 7 days)
  const activeUsers = allUsers.filter(u => 
    u.lastLogin && new Date(u.lastLogin) >= last7Days
  ).length;
  
  // Signups today
  const signupsToday = allUsers.filter(u => 
    u.createdAt && new Date(u.createdAt) >= today
  ).length;
  
  // Video metrics
  const allVideos = await db.select().from(aiVideoKnowledge);
  const totalVideos = allVideos.length;
  const videosAddedToday = allVideos.filter(v => 
    v.analyzedAt && new Date(v.analyzedAt) >= today
  ).length;
  
  // Active subscriptions
  const activeSubscriptions = allUsers.filter(u => 
    u.subscriptionStatus === 'active' && 
    (u.subscriptionType === 'monthly' || u.subscriptionType === 'annual' || u.subscriptionType === 'lifetime')
  ).length;
  
  // MRR calculation ($30/month per active subscriber)
  const mrr = activeSubscriptions * 30;
  
  // Retention and session metrics (approximated)
  const retention7day = await calculate7DayRetention();
  const avgSessionLength = await calculateAvgSessionLength(7);
  
  // System errors (last 24 hours)
  const recentErrors = await db.select()
    .from(systemErrors)
    .where(and(
      gte(systemErrors.createdAt, yesterday),
      eq(systemErrors.resolved, false)
    ));
  
  const systemErrorsCount = recentErrors.length;
  
  // API quota - Calculate from curationRuns table (today's usage)
  const { curationRuns } = await import('@shared/schema');
  const apiUsageResult = await db.execute(sql`
    SELECT COALESCE(SUM(api_units_used), 0) as total_units
    FROM ${curationRuns}
    WHERE DATE(run_date) = ${today.toISOString().split('T')[0]}
  `);
  const apiQuotaUsed = Number(apiUsageResult.rows[0]?.total_units || 0);
  
  // Get auto-curation status
  const curationStatus = await getCurationStatus();
  
  // Churn count (users who cancelled in last 7 days)
  const churnCount = allUsers.filter(u => 
    u.subscriptionStatus === 'cancelled' &&
    u.updatedAt && new Date(u.updatedAt) >= last7Days
  ).length;
  
  // Messages sent - Dev OS doesn't track individual user conversations
  const messagesSent = 0;
  
  // Save snapshot for historical analysis
  try {
    await db.insert(devOsSnapshots).values({
      snapshotDate: today.toISOString().split('T')[0],
      activeUsers,
      dailySignups: signupsToday,
      mrr: mrr.toString(),
      totalVideos,
      avgSessionLength: avgSessionLength.toString(),
      retention7day: retention7day.toString(),
      churnCount,
      messagesSent,
      apiQuotaUsed,
      systemErrors: systemErrorsCount,
    });
  } catch (error) {
    // Snapshot might already exist for today
    console.error('[DEV OS] Snapshot save failed:', error);
  }
  
  return {
    timestamp: new Date().toISOString(),
    users: {
      total: totalUsers,
      active: activeUsers,
      signupsToday: signupsToday
    },
    videos: {
      total: totalVideos,
      addedToday: videosAddedToday,
      target: 2000,
      progress: (totalVideos / 2000 * 100).toFixed(1) + '%'
    },
    revenue: {
      mrr,
      activeSubscriptions,
      churnToday: churnCount
    },
    engagement: {
      retention7day,
      avgSessionLength,
      messagesToday: messagesSent
    },
    system: {
      curationStatus,
      errorsLast24h: systemErrorsCount,
      apiQuotaUsed,
      apiQuotaLimit: 10000
    }
  };
}

// Helper: Calculate 7-day retention
async function calculate7DayRetention(): Promise<number> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  
  const allUsers = await db.select().from(bjjUsers);
  
  // Users who signed up 7-14 days ago
  const cohort = allUsers.filter(u => 
    u.createdAt &&
    new Date(u.createdAt) >= fourteenDaysAgo &&
    new Date(u.createdAt) < sevenDaysAgo
  );
  
  if (cohort.length === 0) return 0;
  
  // How many of them logged in within last 7 days
  const retained = cohort.filter(u => 
    u.lastLogin && new Date(u.lastLogin) >= sevenDaysAgo
  ).length;
  
  return (retained / cohort.length) * 100;
}

// Helper: Calculate average session length
async function calculateAvgSessionLength(days: number): Promise<number> {
  // Dev OS doesn't track individual session times
  // Return 0 since this metric isn't applicable for admin intelligence
  return 0;
}

// Helper: Get curation status
async function getCurationStatus() {
  // Check if curation is running by looking at recent video additions
  const lastHour = new Date();
  lastHour.setHours(lastHour.getHours() - 1);
  
  const recentVideos = await db.select()
    .from(aiVideoKnowledge)
    .where(gte(aiVideoKnowledge.analyzedAt, lastHour));
  
  return {
    running: recentVideos.length > 0,
    recentlyAdded: recentVideos.length,
    lastActivity: recentVideos[0]?.analyzedAt || null
  };
}

// ============================================================================
// TEMPORAL ANALYSIS - Week-over-week, trends, projections
// ============================================================================

export async function getTemporalAnalysis(metric: string, days: number = 30) {
  const snapshots = await db.select()
    .from(devOsSnapshots)
    .where(gte(devOsSnapshots.snapshotDate, 
      new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    ))
    .orderBy(desc(devOsSnapshots.snapshotDate));
  
  if (snapshots.length < 2) {
    return null; // Not enough data
  }
  
  const current = getMetricValue(snapshots[0], metric);
  
  // Find last week's snapshot (6-8 days ago)
  const lastWeek = snapshots.find((s, i) => {
    if (i === 0) return false;
    const daysDiff = Math.floor(
      (new Date(snapshots[0].snapshotDate).getTime() - new Date(s.snapshotDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysDiff >= 6 && daysDiff <= 8;
  });
  
  if (!lastWeek) return null;
  
  const lastWeekValue = getMetricValue(lastWeek, metric);
  
  const weekOverWeek = {
    current,
    lastWeek: lastWeekValue,
    absolute: current - lastWeekValue,
    percent: lastWeekValue !== 0 ? ((current - lastWeekValue) / lastWeekValue * 100).toFixed(1) : '0.0'
  };
  
  // Calculate trend (acceleration/deceleration)
  const values = snapshots.map(s => getMetricValue(s, metric));
  const trend = detectTrend(values);
  
  // Project future
  const projection = projectMetric(values);
  
  return {
    weekOverWeek,
    trend,
    projection,
    volatility: calculateVolatility(values),
    confidence: snapshots.length >= 30 ? 'high' : 'medium'
  };
}

function getMetricValue(snapshot: any, metric: string): number {
  const mapping: Record<string, string> = {
    signups: 'dailySignups',
    active_users: 'activeUsers',
    mrr: 'mrr',
    retention_7day: 'retention7day',
    session_length: 'avgSessionLength',
    videos: 'totalVideos',
    churn: 'churnCount',
    messages: 'messagesSent',
    errors: 'systemErrors'
  };
  
  const field = mapping[metric] || metric;
  const value = snapshot[field];
  
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return parseFloat(value) || 0;
  return Number(value) || 0;
}

function detectTrend(values: number[]): string {
  if (values.length < 4) return 'insufficient_data';
  
  // Calculate week-over-week changes for last 4 weeks
  const changes = [];
  for (let i = 0; i < Math.min(4, values.length - 1); i++) {
    if (values[i + 1] === 0) continue;
    const change = ((values[i] - values[i + 1]) / values[i + 1]) * 100;
    changes.push(change);
  }
  
  if (changes.length < 3) return 'insufficient_data';
  
  // Check for acceleration (each week's growth rate increases)
  const isAccelerating = changes.every((c, i) => 
    i === 0 || c >= changes[i - 1]
  );
  
  // Check for consistent growth (3+ weeks same direction)
  const allPositive = changes.filter(c => c > 0).length >= 3;
  const allNegative = changes.filter(c => c < 0).length >= 3;
  
  if (isAccelerating && allPositive) return 'accelerating';
  if (allPositive) return 'growing';
  if (allNegative) return 'declining';
  return 'stable';
}

function calculateVolatility(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return stdDev / mean; // Coefficient of variation
}

function projectMetric(values: number[], daysAhead: number = 7): number {
  if (values.length < 3) return values[0] || 0;
  
  // Simple linear regression
  const n = values.length;
  const reversed = [...values].reverse(); // Oldest to newest
  const x = Array.from({ length: n }, (_, i) => i);
  const y = reversed;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  
  const denominator = (n * sumX2 - sumX * sumX);
  if (denominator === 0) return values[0] || 0;
  
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  
  return Math.round(slope * (n + daysAhead) + intercept);
}

// ============================================================================
// ADAPTIVE THRESHOLDS - Self-calibrating system
// ============================================================================

export async function getAdaptiveThresholds(adminUserId: string) {
  // Get or initialize thresholds
  let thresholds = await db.select()
    .from(devOsThresholds)
    .where(eq(devOsThresholds.adminUserId, adminUserId));
  
  if (thresholds.length === 0) {
    // Initialize default thresholds
    thresholds = await initializeDefaultThresholds(adminUserId);
  }
  
  // Check if thresholds need adjustment (run weekly)
  const lastAdjusted = thresholds[0]?.lastAdjusted;
  const daysSinceAdjustment = lastAdjusted 
    ? Math.floor((Date.now() - new Date(lastAdjusted).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  
  if (daysSinceAdjustment >= 7) {
    // Run adaptive learning
    await learnAndAdjustThresholds(adminUserId);
    thresholds = await db.select()
      .from(devOsThresholds)
      .where(eq(devOsThresholds.adminUserId, adminUserId));
  }
  
  return thresholds;
}

async function initializeDefaultThresholds(adminUserId: string) {
  const metrics = [
    { name: 'signups', value: '20', type: 'absolute' },
    { name: 'active_users', value: '25', type: 'absolute' },
    { name: 'mrr', value: '500', type: 'absolute' },
    { name: 'retention_7day', value: '5', type: 'percentage_points' },
    { name: 'session_length', value: '2', type: 'minutes' },
    { name: 'videos', value: '65', type: 'absolute' }
  ];
  
  const thresholds = [];
  for (const metric of metrics) {
    const result = await db.insert(devOsThresholds).values({
      adminUserId,
      metricName: metric.name,
      thresholdValue: metric.value,
      thresholdType: metric.type,
      confidenceLevel: 'low',
      learningPeriodDays: 14,
      adjustmentReason: 'Initial default threshold'
    }).returning();
    
    thresholds.push(result[0]);
  }
  
  return thresholds;
}

async function learnAndAdjustThresholds(adminUserId: string) {
  const metrics = ['signups', 'active_users', 'mrr', 'retention_7day', 'session_length', 'videos'];
  
  for (const metric of metrics) {
    // LAYER 1: Statistical learning from data
    const snapshots = await db.select()
      .from(devOsSnapshots)
      .where(gte(devOsSnapshots.snapshotDate,
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      ))
      .orderBy(desc(devOsSnapshots.snapshotDate));
    
    if (snapshots.length < 30) continue; // Need more data
    
    const values = snapshots.map(s => getMetricValue(s, metric)).filter(v => v !== 0);
    if (values.length < 30) continue;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const volatility = mean !== 0 ? stdDev / mean : 0;
    
    // LAYER 2: Behavioral learning from user actions
    const interactions = await db.select()
      .from(devOsInteractions)
      .where(and(
        eq(devOsInteractions.adminUserId, adminUserId),
        eq(devOsInteractions.metricName, metric),
        gte(devOsInteractions.createdAt,
          new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
        )
      ));
    
    const actedOn = interactions.filter(i => i.userClicked || i.userAskedFollowup);
    const ignored = interactions.filter(i => !i.userClicked && !i.userAskedFollowup);
    
    let newThreshold: number;
    let confidenceLevel: string;
    let reason: string;
    
    if (actedOn.length >= 3 && ignored.length >= 3) {
      // Have enough behavioral data
      const minActedChange = Math.min(...actedOn.map(i => Math.abs(parseFloat(i.changeSize?.toString() || '0'))));
      const maxIgnoredChange = Math.max(...ignored.map(i => Math.abs(parseFloat(i.changeSize?.toString() || '0'))));
      
      // Threshold = midpoint between max ignored and min acted
      newThreshold = ((minActedChange + maxIgnoredChange) / 2) * 1.1; // 10% buffer
      confidenceLevel = 'high';
      reason = `Learned from behavior: acts on >${minActedChange.toFixed(0)}, ignores <${maxIgnoredChange.toFixed(0)}`;
      
    } else {
      // Use statistical learning only
      if (volatility > 0.3) {
        // High volatility = need bigger changes to be meaningful
        newThreshold = mean * 0.25; // 25% of average
      } else {
        // Low volatility = smaller changes meaningful
        newThreshold = mean * 0.15; // 15% of average
      }
      
      confidenceLevel = actedOn.length + ignored.length >= 5 ? 'medium' : 'low';
      reason = `Statistical learning: volatility ${(volatility * 100).toFixed(1)}%, threshold ${newThreshold.toFixed(0)}`;
    }
    
    await db.update(devOsThresholds)
      .set({
        thresholdValue: newThreshold.toFixed(2),
        confidenceLevel,
        learningPeriodDays: confidenceLevel === 'high' ? 90 : 60,
        lastAdjusted: new Date(),
        adjustmentReason: reason
      })
      .where(and(
        eq(devOsThresholds.adminUserId, adminUserId),
        eq(devOsThresholds.metricName, metric)
      ));
  }
  
  // LAYER 3: Fatigue prevention
  const alertCount = await db.select()
    .from(devOsAlerts)
    .where(and(
      eq(devOsAlerts.adminUserId, adminUserId),
      eq(devOsAlerts.shown, true),
      gte(devOsAlerts.createdAt,
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      )
    ));
  
  if (alertCount.length > 15) {
    // Too many alerts - raise all thresholds 20%
    await db.execute(sql`
      UPDATE dev_os_thresholds
      SET threshold_value = threshold_value::numeric * 1.2,
          adjustment_reason = 'Fatigue prevention: reducing alert frequency'
      WHERE admin_user_id = ${adminUserId}
    `);
  } else if (alertCount.length < 2) {
    // Too few alerts - lower thresholds 10%
    await db.execute(sql`
      UPDATE dev_os_thresholds
      SET threshold_value = threshold_value::numeric * 0.9,
          adjustment_reason = 'Increasing sensitivity: more alerts needed'
      WHERE admin_user_id = ${adminUserId}
    `);
  }
}

// ============================================================================
// BEHAVIORAL TRACKING - Learn from user actions
// ============================================================================

export async function trackInteraction(
  adminUserId: string,
  message: string,
  response: string
) {
  // Extract metrics mentioned in conversation
  const metricKeywords = {
    'signups': ['signup', 'sign up', 'new user', 'registration'],
    'active_users': ['active user', 'engagement', 'dau', 'mau'],
    'mrr': ['revenue', 'mrr', 'arr', 'money'],
    'retention': ['retention', 'churn', 'stick'],
    'videos': ['video', 'content', 'library'],
    'errors': ['error', 'bug', 'issue', 'problem']
  };
  
  for (const [metric, keywords] of Object.entries(metricKeywords)) {
    const mentioned = keywords.some(kw => 
      message.toLowerCase().includes(kw) || response.toLowerCase().includes(kw)
    );
    
    if (mentioned) {
      await db.insert(devOsInteractions).values({
        adminUserId,
        metricName: metric,
        alertType: 'insight',
        userAskedFollowup: true,
        createdAt: new Date()
      });
    }
  }
}

export async function getUserBehavioralData(adminUserId: string) {
  const interactions = await db.select()
    .from(devOsInteractions)
    .where(eq(devOsInteractions.adminUserId, adminUserId))
    .orderBy(desc(devOsInteractions.createdAt))
    .limit(50);
  
  return {
    totalInteractions: interactions.length,
    metricsOfInterest: Array.from(new Set(interactions.map(i => i.metricName).filter(Boolean))),
    recentActivity: interactions.slice(0, 10)
  };
}
