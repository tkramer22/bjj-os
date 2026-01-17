import cron from 'node-cron';
import { db } from '../db';
import { systemSnapshots, aiVideoKnowledge, bjjUsers, curationRuns } from '@shared/schema';
import { eq, and, gte, sql as sqlBuilder, desc } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ============================================================================
// COMMAND CENTER INTELLIGENCE - Hourly System Snapshots with AI Insights
// ============================================================================

interface SystemMetrics {
  videoCount: number;
  videosAddedToday: number;
  userCount: number;
  curationRunsToday: number;
  approvalRate: number;
  apiQuotaUsed: number;
}

interface AIInsights {
  insights: string[];
  anomalies: string[];
  recommendations: string[];
  healthStatus: 'healthy' | 'warning' | 'critical';
  summary: string;
}

// Calculate current system metrics
export async function collectSystemMetrics(): Promise<SystemMetrics> {
  console.log('📊 [SNAPSHOT] Collecting system metrics...');
  
  try {
    // Get video count
    const videoCountResult = await db.select({ count: sqlBuilder`count(*)::int` })
      .from(aiVideoKnowledge);
    const videoCount = videoCountResult[0]?.count || 0;
    
    // Get videos added today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const videosAddedTodayResult = await db.select({ count: sqlBuilder`count(*)::int` })
      .from(aiVideoKnowledge)
      .where(gte(aiVideoKnowledge.analyzedAt, todayStart));
    const videosAddedToday = videosAddedTodayResult[0]?.count || 0;
    
    // Get user count
    const userCountResult = await db.select({ count: sqlBuilder`count(*)::int` })
      .from(bjjUsers);
    const userCount = userCountResult[0]?.count || 0;
    
    // Get curation runs today (from curationRuns table, not videoCurationLog)
    const curationRunsResult = await db.select({ count: sqlBuilder`count(*)::int` })
      .from(curationRuns)
      .where(gte(curationRuns.createdAt, todayStart));
    const curationRunsToday = curationRunsResult[0]?.count || 0;
    
    // Calculate approval rate from today's curation runs
    const approvalData = await db.select({
      accepted: sqlBuilder<number>`COALESCE(SUM(videos_added), 0)::int`,
      analyzed: sqlBuilder<number>`COALESCE(SUM(videos_analyzed), 0)::int`
    })
      .from(curationRuns)
      .where(gte(curationRuns.createdAt, todayStart));
    
    const accepted = approvalData[0]?.accepted || 0;
    const analyzed = approvalData[0]?.analyzed || 0;
    const approvalRate = analyzed > 0 ? Math.round((accepted / analyzed) * 100) : 0;
    
    // Get API quota used (from YouTube API)
    // This would need to be tracked separately - for now, placeholder
    const apiQuotaUsed = 0;
    
    const metrics: SystemMetrics = {
      videoCount,
      videosAddedToday,
      userCount,
      curationRunsToday,
      approvalRate,
      apiQuotaUsed
    };
    
    console.log('✅ [SNAPSHOT] Metrics collected:', metrics);
    return metrics;
    
  } catch (error) {
    console.error('❌ [SNAPSHOT] Failed to collect metrics:', error);
    // Return fallback metrics instead of crashing
    return {
      videoCount: 0,
      videosAddedToday: 0,
      userCount: 0,
      curationRunsToday: 0,
      approvalRate: 0,
      apiQuotaUsed: 0
    };
  }
}

// Generate AI insights from current and historical metrics
export async function generateAIInsights(
  currentMetrics: SystemMetrics,
  historicalSnapshots: any[]
): Promise<AIInsights> {
  console.log('🤖 [SNAPSHOT] Generating AI insights...');
  
  try {
    const prompt = `You are an AI analyst for BJJ OS - an AI-powered BJJ training platform. Analyze these system metrics and provide actionable insights for the founder.

CURRENT METRICS:
- Video Library: ${currentMetrics.videoCount} videos (${currentMetrics.videosAddedToday} added today)
- User Base: ${currentMetrics.userCount} users
- Curation Runs Today: ${currentMetrics.curationRunsToday}
- Approval Rate: ${currentMetrics.approvalRate}%
- API Quota Used: ${currentMetrics.apiQuotaUsed}

LAST 24 HOURS TREND:
${historicalSnapshots.length > 0 ? JSON.stringify(historicalSnapshots.slice(0, 24).map(s => ({
  time: s.timestamp,
  videos: s.videoCount,
  users: s.userCount,
  approval: Number(s.approvalRate || 0)
})), null, 2) : 'No historical data available'}

Provide analysis in this exact JSON format (no markdown, no code blocks, just raw JSON):
{
  "insights": [
    "Key observation 1 about growth or performance",
    "Key observation 2 about trends",
    "Key observation 3 about system health"
  ],
  "anomalies": [
    "Any unusual patterns that need attention (empty array if none)"
  ],
  "recommendations": [
    "Specific action the founder should take",
    "Another actionable recommendation"
  ],
  "healthStatus": "healthy",
  "summary": "One sentence overview of system status"
}

Focus on:
- Library growth trends (target: 3,000 videos by end of month)
- Curation efficiency (approval rate, runs per day, videos per run)
- User base growth and engagement patterns
- API quota management and optimization
- System bottlenecks or opportunities for improvement

Be specific and actionable. Flag anything that deviates >20% from recent average.
Use "healthy", "warning", or "critical" for healthStatus (camelCase).`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    let responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    
    // Strip markdown code blocks if present (```json ... ```)
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    
    const insights: AIInsights = JSON.parse(responseText);
    
    console.log('✅ [SNAPSHOT] AI insights generated:', {
      insights: insights.insights.length,
      anomalies: insights.anomalies.length,
      health: insights.healthStatus
    });
    
    return insights;
    
  } catch (error) {
    console.error('❌ [SNAPSHOT] Failed to generate AI insights:', error);
    // Return fallback insights on error
    return {
      insights: [
        'System operational with current metrics',
        `Video library at ${currentMetrics.videoCount} videos`,
        `${currentMetrics.userCount} registered users`
      ],
      anomalies: [],
      recommendations: ['Monitor system health', 'Review metrics dashboard'],
      healthStatus: 'healthy',
      summary: 'System operational - AI analysis unavailable'
    };
  }
}

// Generate and save hourly snapshot
export async function generateHourlySnapshot(): Promise<void> {
  console.log('📸 [SNAPSHOT] Generating hourly snapshot...');
  
  try {
    // Collect current metrics
    const metrics = await collectSystemMetrics();
    
    // Get last 24 hours of snapshots for comparison
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const historicalSnapshots = await db.select()
      .from(systemSnapshots)
      .where(gte(systemSnapshots.timestamp, twentyFourHoursAgo))
      .orderBy(sqlBuilder`${systemSnapshots.timestamp} DESC`)
      .limit(24);
    
    // Generate AI insights
    const insights = await generateAIInsights(metrics, historicalSnapshots);
    
    // Save snapshot (schema has separate columns for anomalies, recommendations, healthStatus)
    await db.insert(systemSnapshots).values({
      videoCount: metrics.videoCount,
      videosAddedToday: metrics.videosAddedToday,
      userCount: metrics.userCount,
      curationRunsToday: metrics.curationRunsToday,
      approvalRate: metrics.approvalRate,
      apiQuotaUsed: metrics.apiQuotaUsed, // TODO: Wire to actual YouTube quota tracker
      insights: { insights: insights.insights, summary: insights.summary }, // Only array + summary
      anomalies: insights.anomalies,
      recommendations: insights.recommendations,
      healthStatus: insights.healthStatus
    });
    
    console.log('✅ [SNAPSHOT] Snapshot saved successfully');
    console.log(`   Health: ${insights.healthStatus.toUpperCase()}`);
    console.log(`   Summary: ${insights.summary}`);
    
  } catch (error) {
    console.error('❌ [SNAPSHOT] Failed to generate snapshot:', error);
  }
}

// Hourly snapshot job (every hour on the hour)
cron.schedule('0 * * * *', async () => {
  await generateHourlySnapshot();
}, {
  timezone: 'America/New_York'
});

// Initialize Command Center snapshot job
export function initializeCommandCenterSnapshots() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📸 COMMAND CENTER INTELLIGENCE INITIALIZED');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ⏱️  Hourly snapshots with AI insights: Every hour (00:00)');
  console.log('  🤖 AI-powered system analysis via Claude Sonnet 4.5');
  console.log('  📊 Tracks: Videos, Users, Curation Performance, API Quota');
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Generate initial snapshot on startup
  console.log('🔄 [SNAPSHOT] Generating initial snapshot...');
  setTimeout(() => {
    generateHourlySnapshot().catch(err => 
      console.error('❌ [SNAPSHOT] Initial snapshot failed:', err)
    );
  }, 5000); // 5 second delay to allow server to fully initialize
}
