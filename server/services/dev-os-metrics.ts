import { db } from '../db';
import { sql } from 'drizzle-orm';

/**
 * DevOps System Snapshot
 * Real-time metrics for the DevOps Command Center
 */
export interface DevOpsSystemSnapshot {
  timestamp: string;
  users: {
    total: number;
    activeSubscriptions: number;
    trialUsers: number;
    lifetimeUsers: number;
    newToday: number;
    newThisWeek: number;
    activeThisWeek: number;
  };
  videos: {
    total: number;
    accepted: number;
    rejected: number;
    addedToday: number;
    addedThisWeek: number;
    avgQuality: number;
    uniqueInstructors: number;
    uniqueTechniques: number;
    eliteVideos: number;
    elitePercent: number;
  };
  revenue: {
    mrr: number;
    arr: number;
    activeSubscriptions: number;
    totalLifetimeRevenue: number;
  };
  curation: {
    isRunning: boolean;
    screened: number;
    accepted: number;
    rejected: number;
    acceptanceRate: number;
    quotaUsed: number;
    quotaRemaining: number;
  };
  activity: {
    chatMessagesToday: number;
    chatMessagesThisWeek: number;
    avgMessagesPerUser: number;
    activeChatsToday: number;
  };
}

/**
 * Collect comprehensive DevOps system snapshot with parallel queries
 * Returns real-time metrics for users, videos, revenue, curation, and activity
 */
export async function collectDevOpsSnapshot(): Promise<DevOpsSystemSnapshot> {
  const timestamp = new Date().toISOString();

  try {
    // Execute all queries in parallel for maximum performance
    const [userStats, videoStats, revenueStats, curationStats, activityStats] = await Promise.all([
      // User statistics
      db.execute(sql`
        SELECT 
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE subscription_status = 'active') as active_subs,
          COUNT(*) FILTER (WHERE subscription_status = 'trialing') as trial_users,
          COUNT(*) FILTER (WHERE lifetime_access = true) as lifetime_users,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as new_today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as new_this_week,
          COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days') as active_this_week
        FROM bjj_users
      `),

      // Video statistics - Query ALL videos, use FILTER for segmentation
      db.execute(sql`
        SELECT 
          COUNT(*) as total_videos,
          COUNT(*) FILTER (WHERE accepted = true) as accepted_videos,
          COUNT(*) FILTER (WHERE accepted = false) as rejected_videos,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as added_today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as added_this_week,
          ROUND(AVG(final_score) FILTER (WHERE accepted = true)::numeric, 2) as avg_quality,
          COUNT(DISTINCT instructor_name) FILTER (WHERE accepted = true) as unique_instructors,
          COUNT(DISTINCT technique_type) FILTER (WHERE accepted = true) as unique_techniques,
          COUNT(*) FILTER (WHERE accepted = true AND final_score >= 85) as elite_videos
        FROM videos
      `),

      // Revenue statistics - Calculate MRR and ARR correctly
      db.execute(sql`
        SELECT 
          COALESCE(SUM(CASE 
            WHEN subscription_status = 'active' AND subscription_type = 'monthly' THEN 20 
            WHEN subscription_status = 'active' AND subscription_type = 'annual' THEN 20
            ELSE 0 
          END), 0) as monthly_recurring,
          COUNT(*) FILTER (WHERE subscription_status = 'active') as active_count,
          COUNT(*) FILTER (WHERE lifetime_access = true) * 599 as lifetime_total
        FROM bjj_users
      `),

      // Curation statistics - Query actual curation_runs table
      db.execute(sql`
        SELECT 
          COALESCE(SUM(videos_screened), 0) as screened,
          COALESCE(SUM(videos_added), 0) as accepted,
          COALESCE(SUM(videos_rejected), 0) as rejected,
          COALESCE(SUM(api_units_used), 0) as quota_used
        FROM curation_runs
        WHERE DATE(run_date) = CURRENT_DATE
      `),

      // Activity statistics
      db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as messages_today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as messages_this_week,
          COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as active_chats_today
        FROM chat_history
      `)
    ]);

    // Parse results with safe fallbacks
    const users = userStats.rows[0] || {};
    const videos = videoStats.rows[0] || {};
    const revenue = revenueStats.rows[0] || {};
    const curation = curationStats.rows[0] || {};
    const activity = activityStats.rows[0] || {};

    // Calculate derived metrics
    const totalUsers = Number(users.total_users || 0);
    const totalVideos = Number(videos.total_videos || 0);
    const eliteVideos = Number(videos.elite_videos || 0);
    const elitePercent = totalVideos > 0 ? Math.round((eliteVideos / totalVideos) * 100) : 0;
    
    const curationScreened = Number(curation.screened || 0);
    const curationAccepted = Number(curation.accepted || 0);
    const acceptanceRate = curationScreened > 0 
      ? Math.round((curationAccepted / curationScreened) * 100) 
      : 0;

    const messagesThisWeek = Number(activity.messages_this_week || 0);
    const avgMessagesPerUser = totalUsers > 0 
      ? Math.round(messagesThisWeek / totalUsers) 
      : 0;

    // Calculate revenue metrics
    const mrr = Number(revenue.monthly_recurring || 0);
    const arr = mrr * 12; // ARR is simply MRR * 12

    return {
      timestamp,
      users: {
        total: totalUsers,
        activeSubscriptions: Number(users.active_subs || 0),
        trialUsers: Number(users.trial_users || 0),
        lifetimeUsers: Number(users.lifetime_users || 0),
        newToday: Number(users.new_today || 0),
        newThisWeek: Number(users.new_this_week || 0),
        activeThisWeek: Number(users.active_this_week || 0)
      },
      videos: {
        total: totalVideos,
        accepted: Number(videos.accepted_videos || 0),
        rejected: Number(videos.rejected_videos || 0),
        addedToday: Number(videos.added_today || 0),
        addedThisWeek: Number(videos.added_this_week || 0),
        avgQuality: Number(videos.avg_quality || 0),
        uniqueInstructors: Number(videos.unique_instructors || 0),
        uniqueTechniques: Number(videos.unique_techniques || 0),
        eliteVideos,
        elitePercent
      },
      revenue: {
        mrr,
        arr,
        activeSubscriptions: Number(revenue.active_count || 0),
        totalLifetimeRevenue: Number(revenue.lifetime_total || 0)
      },
      curation: {
        isRunning: false, // TODO: Connect to actual curation system
        screened: curationScreened,
        accepted: curationAccepted,
        rejected: Number(curation.rejected || 0),
        acceptanceRate,
        quotaUsed: Number(curation.quota_used || 0),
        quotaRemaining: 10000 - Number(curation.quota_used || 0)
      },
      activity: {
        chatMessagesToday: Number(activity.messages_today || 0),
        chatMessagesThisWeek: messagesThisWeek,
        avgMessagesPerUser,
        activeChatsToday: Number(activity.active_chats_today || 0)
      }
    };
  } catch (error: any) {
    console.error('[DEV OS METRICS] Error collecting system snapshot:', error);
    
    // Return safe defaults on error
    return {
      timestamp,
      users: {
        total: 0,
        activeSubscriptions: 0,
        trialUsers: 0,
        lifetimeUsers: 0,
        newToday: 0,
        newThisWeek: 0,
        activeThisWeek: 0
      },
      videos: {
        total: 0,
        accepted: 0,
        rejected: 0,
        addedToday: 0,
        addedThisWeek: 0,
        avgQuality: 0,
        uniqueInstructors: 0,
        uniqueTechniques: 0,
        eliteVideos: 0,
        elitePercent: 0
      },
      revenue: {
        mrr: 0,
        arr: 0,
        activeSubscriptions: 0,
        totalLifetimeRevenue: 0
      },
      curation: {
        isRunning: false,
        screened: 0,
        accepted: 0,
        rejected: 0,
        acceptanceRate: 0,
        quotaUsed: 0,
        quotaRemaining: 10000
      },
      activity: {
        chatMessagesToday: 0,
        chatMessagesThisWeek: 0,
        avgMessagesPerUser: 0,
        activeChatsToday: 0
      }
    };
  }
}

/**
 * Format system snapshot for Claude's context
 * Returns a formatted string suitable for injection into the system prompt
 */
export function formatSnapshotForPrompt(snapshot: DevOpsSystemSnapshot): string {
  return `
## REAL-TIME SYSTEM DATA (as of ${new Date(snapshot.timestamp).toLocaleString()})

### Users (${snapshot.users.total} total)
- Active subscriptions: ${snapshot.users.activeSubscriptions}
- Trial users: ${snapshot.users.trialUsers}
- Lifetime access: ${snapshot.users.lifetimeUsers}
- New today: ${snapshot.users.newToday}
- New this week: ${snapshot.users.newThisWeek}
- Active this week: ${snapshot.users.activeThisWeek}

### Video Library (${snapshot.videos.total} videos)
- Accepted: ${snapshot.videos.accepted}
- Rejected: ${snapshot.videos.rejected}
- Added today: ${snapshot.videos.addedToday}
- Added this week: ${snapshot.videos.addedThisWeek}
- Average quality: ${snapshot.videos.avgQuality}/100
- Elite videos (≥85 score): ${snapshot.videos.eliteVideos} (${snapshot.videos.elitePercent}%)
- Unique instructors: ${snapshot.videos.uniqueInstructors}
- Technique types: ${snapshot.videos.uniqueTechniques}

### Revenue
- Monthly Recurring Revenue (MRR): $${snapshot.revenue.mrr.toLocaleString()}
- Annual Recurring Revenue (ARR): $${snapshot.revenue.arr.toLocaleString()}
- Active subscriptions: ${snapshot.revenue.activeSubscriptions}
- Lifetime revenue: $${snapshot.revenue.totalLifetimeRevenue.toLocaleString()}

### Curation System
- Status: ${snapshot.curation.isRunning ? '🟢 Running' : '⭕ Idle'}
- Videos screened: ${snapshot.curation.screened}
- Accepted: ${snapshot.curation.accepted} (${snapshot.curation.acceptanceRate}% acceptance rate)
- Rejected: ${snapshot.curation.rejected}
- API quota used: ${snapshot.curation.quotaUsed} / 10,000
- Quota remaining: ${snapshot.curation.quotaRemaining}

### User Activity
- Chat messages today: ${snapshot.activity.chatMessagesToday}
- Chat messages this week: ${snapshot.activity.chatMessagesThisWeek}
- Avg messages per user: ${snapshot.activity.avgMessagesPerUser}
- Active chats today: ${snapshot.activity.activeChatsToday}

You have access to this LIVE data. When answering questions about system metrics, use these exact numbers.
`;
}
