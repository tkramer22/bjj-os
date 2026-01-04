import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import jwt from 'jsonwebtoken';
import { db } from "./db";
import { bjjUsers, activityLog, systemErrors, referralCodes, referralCommissions, adminNotesTable, curationRuns, videos, aiVideoKnowledge, videoWatchStatus, videoKnowledge } from "@shared/schema";
import { eq, desc, sql, and, or, ilike, gte, count as drizzleCount } from "drizzle-orm";
import { logSystemError } from "./activity-logger";
import * as curationController from "./curation-controller";
import { sendAdminReport } from "./admin-email";
import { isAutoCurationEnabled, setAutoCurationEnabled, getAutoCurationStatus, initializeAutoCurationState } from "./permanent-auto-curation";

const router = express.Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Middleware to verify admin access
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const JWT_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  
  // Check admin_session cookie (JWT token from admin login)
  const adminSession = req.cookies?.admin_session;
  if (adminSession) {
    try {
      const decoded = jwt.verify(adminSession, JWT_SECRET) as any;
      if (decoded.role === 'admin') {
        req.adminUser = decoded;
        req.admin = decoded;
        return next();
      }
    } catch (error) {
      // Token invalid, fall through to other checks
    }
  }
  
  // Fallback: Check user-based admin access (for user table admins)
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(e => e);
  const isAdminByFlag = req.user && req.user.isAdmin;
  const isAdminByEmail = req.user && req.user.email && adminEmails.includes(req.user.email);
  
  if (!isAdminByFlag && !isAdminByEmail) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
}

// POST: Manual Test Email (for testing admin emails immediately)
router.post('/test-email', requireAdmin, async (req, res) => {
  try {
    console.log('📧 Manual email test triggered by admin');
    const reportType = req.body.reportType || 'morning';
    
    await sendAdminReport(reportType);
    
    res.json({ 
      success: true, 
      message: `${reportType} email sent! Check todd@bjjos.app inbox`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ Email test error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

// GET: Dashboard metrics and data
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // TODAY'S METRICS
    const todayMetrics = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= ${today}) as new_signups_today,
        COUNT(*) FILTER (WHERE subscription_type != 'free_trial' AND created_at >= ${today}) as new_paid_today,
        COUNT(*) FILTER (WHERE subscription_status = 'trialing' AND trial_end_date::date = ${now.toISOString().split('T')[0]}) as trials_ending_today
      FROM bjj_users
    `);
    
    // AI usage today (from activity log)
    const aiUsageToday = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM activity_log
      WHERE event_type = 'ai_conversation' AND created_at >= ${today}
    `);
    
    // ALL-TIME METRICS
    const allTimeMetrics = await db.execute(sql`
      SELECT
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE subscription_type != 'free_trial' AND subscription_status = 'active') as active_paid_users,
        COUNT(*) FILTER (WHERE subscription_type = 'free_trial') as active_trials
      FROM bjj_users
    `);
    
    // postgres-js returns rows directly as array, not { rows: [...] }
    const allTimeRows = Array.isArray(allTimeMetrics) ? allTimeMetrics : (allTimeMetrics.rows || []);
    const totalUsers = Number(allTimeRows[0]?.total_users || 0);
    const activePaidUsers = Number(allTimeRows[0]?.active_paid_users || 0);
    const activeTrials = Number(allTimeRows[0]?.active_trials || 0);
    
    // MRR (Monthly Recurring Revenue) - assuming $19.99/month
    const mrr = activePaidUsers * 19.99;
    
    // Churn rate (cancelled in last 30 days / active 30 days ago)
    const churnData = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE subscription_status = 'canceled' AND updated_at >= NOW() - INTERVAL '30 days') as churned,
        COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '30 days' AND subscription_type != 'free_trial') as base
      FROM bjj_users
    `);
    const churnRows = Array.isArray(churnData) ? churnData : (churnData.rows || []);
    const churnBase = Number(churnRows[0]?.base || 0);
    const churned = Number(churnRows[0]?.churned || 0);
    const churnRate = churnBase > 0 ? ((churned / churnBase) * 100).toFixed(1) : 0;
    
    // CURRENT ACTIVE USERS (last 30 min)
    const activeNow = await db.execute(sql`
      SELECT COUNT(DISTINCT user_id) as count
      FROM activity_log
      WHERE created_at >= NOW() - INTERVAL '30 minutes' AND user_id IS NOT NULL
    `);
    
    // FAILED PAYMENTS
    const failedPayments = await db.execute(sql`
      SELECT 
        u.id,
        u.email,
        u.username,
        al.description,
        al.metadata,
        al.created_at
      FROM activity_log al
      JOIN bjj_users u ON al.user_id = u.id
      WHERE al.event_type = 'payment_failed'
        AND al.created_at >= NOW() - INTERVAL '7 days'
        AND u.subscription_status = 'past_due'
      ORDER BY al.created_at DESC
      LIMIT 10
    `);
    
    // TRIALS ENDING TODAY
    const trialsEndingToday = await db.execute(sql`
      SELECT
        id,
        email,
        username,
        trial_end_date,
        created_at,
        (SELECT COUNT(*) FROM activity_log WHERE user_id = bjj_users.id AND event_type = 'ai_conversation') as ai_chat_count,
        updated_at as last_active
      FROM bjj_users
      WHERE subscription_status = 'trialing'
        AND trial_end_date::date = ${now.toISOString().split('T')[0]}
      ORDER BY trial_end_date ASC
    `);
    
    // RECENT ACTIVITY (last 20 events)
    const recentActivity = await db.select()
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(20);
    
    // TOP REFERRAL CODES
    const topReferralCodes = await db.execute(sql`
      SELECT
        rc.code,
        rc.commission_rate as commission_percent,
        rc.total_signups as signup_count,
        rc.active_subscribers as paid_count,
        COALESCE(rc.total_commissions_paid, 0) as revenue
      FROM referral_codes rc
      WHERE rc.is_active = true
      ORDER BY rc.total_signups DESC
      LIMIT 5
    `);
    
    // RECENT SIGNUPS (last 10)
    const recentSignups = await db.select({
      id: bjjUsers.id,
      email: bjjUsers.email,
      username: bjjUsers.username,
      subscriptionType: bjjUsers.subscriptionType,
      subscriptionStatus: bjjUsers.subscriptionStatus,
      referralCode: bjjUsers.referralCode,
      createdAt: bjjUsers.createdAt,
    })
      .from(bjjUsers)
      .orderBy(desc(bjjUsers.createdAt))
      .limit(10);
    
    // SYSTEM ERRORS (unresolved)
    const systemErrorsCount = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM system_errors
      WHERE resolved = false
        AND created_at >= NOW() - INTERVAL '24 hours'
        AND severity IN ('high', 'critical')
    `);
    
    // postgres-js returns rows directly as array, not { rows: [...] }
    const todayRows = Array.isArray(todayMetrics) ? todayMetrics : (todayMetrics.rows || []);
    const aiUsageRows = Array.isArray(aiUsageToday) ? aiUsageToday : (aiUsageToday.rows || []);
    const activeNowRows = Array.isArray(activeNow) ? activeNow : (activeNow.rows || []);
    const failedPaymentRows = Array.isArray(failedPayments) ? failedPayments : (failedPayments.rows || []);
    const trialsEndingRows = Array.isArray(trialsEndingToday) ? trialsEndingToday : (trialsEndingToday.rows || []);
    const systemErrorRows = Array.isArray(systemErrorsCount) ? systemErrorsCount : (systemErrorsCount.rows || []);
    const topReferralRows = Array.isArray(topReferralCodes) ? topReferralCodes : (topReferralCodes.rows || []);
    
    res.json({
      today: {
        newSignups: parseInt(String(todayRows[0]?.new_signups_today || '0')),
        revenue: 0, // TODO: Calculate from actual payments
        trialConverted: parseInt(String(todayRows[0]?.new_paid_today || '0')),
        aiUsage: parseInt(String(aiUsageRows[0]?.count || '0')),
        trialsEndingCount: parseInt(String(todayRows[0]?.trials_ending_today || '0'))
      },
      allTime: {
        totalUsers,
        mrr: mrr.toFixed(2),
        churnRate: parseFloat(churnRate.toString()),
        lifetimeRevenue: '0.00', // TODO: Calculate from actual payments
        activePaidUsers,
        activeTrials
      },
      live: {
        activeNow: parseInt(String(activeNowRows[0]?.count || '0'))
      },
      alerts: {
        failedPaymentsCount: failedPaymentRows.length,
        trialsEndingCount: trialsEndingRows.length,
        systemErrorsCount: parseInt(String(systemErrorRows[0]?.count || '0'))
      },
      failedPayments: failedPaymentRows,
      trialsEndingToday: trialsEndingRows,
      recentActivity,
      topReferralCodes: topReferralRows,
      recentSignups
    });
    
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD] Dashboard error:', error);
    await logSystemError('admin_dashboard', error.message, {
      endpoint: '/api/admin/dashboard',
      stack: error.stack
    }, 'medium');
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET: Search for user
router.get('/search-user', requireAdmin, async (req, res) => {
  try {
    const query = req.query.query as string;
    
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query too short' });
    }
    
    const users = await db.select({
      id: bjjUsers.id,
      email: bjjUsers.email,
      username: bjjUsers.username,
      subscriptionType: bjjUsers.subscriptionType,
      subscriptionStatus: bjjUsers.subscriptionStatus,
      trialEndDate: bjjUsers.trialEndDate,
      createdAt: bjjUsers.createdAt,
      updatedAt: bjjUsers.updatedAt,
    })
      .from(bjjUsers)
      .where(
        or(
          ilike(bjjUsers.email, `%${query}%`),
          ilike(bjjUsers.username, `%${query}%`)
        )
      )
      .orderBy(desc(bjjUsers.createdAt))
      .limit(10);
    
    res.json({ users });
    
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD] User search error:', error);
    await logSystemError('admin_user_search', error.message, {
      endpoint: '/api/admin/search-user',
      stack: error.stack
    }, 'low');
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET: User details
router.get('/user/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // User info
    const [user] = await db.select()
      .from(bjjUsers)
      .where(eq(bjjUsers.id, id));
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Activity summary
    const activitySummary = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'ai_conversation') as ai_conversations,
        MAX(created_at) FILTER (WHERE event_type = 'ai_conversation') as last_conversation
      FROM activity_log
      WHERE user_id = ${id}
    `);
    
    // Recent conversations (last 5)
    const recentConversations = await db.select({
      description: activityLog.description,
      metadata: activityLog.metadata,
      createdAt: activityLog.createdAt,
    })
      .from(activityLog)
      .where(and(
        eq(activityLog.userId, id),
        eq(activityLog.eventType, 'ai_conversation')
      ))
      .orderBy(desc(activityLog.createdAt))
      .limit(5);
    
    // Payment history
    const paymentHistory = await db.select({
      description: activityLog.description,
      metadata: activityLog.metadata,
      createdAt: activityLog.createdAt,
    })
      .from(activityLog)
      .where(and(
        eq(activityLog.userId, id),
        or(
          eq(activityLog.eventType, 'payment_succeeded'),
          eq(activityLog.eventType, 'payment_failed')
        )
      ))
      .orderBy(desc(activityLog.createdAt))
      .limit(10);
    
    // Admin notes
    const adminNotes = await db.select()
      .from(adminNotesTable)
      .where(eq(adminNotesTable.userId, id))
      .orderBy(desc(adminNotesTable.createdAt));
    
    // postgres-js returns rows directly as array, not { rows: [...] }
    const activityRows = Array.isArray(activitySummary) ? activitySummary : (activitySummary.rows || []);
    
    res.json({
      user,
      activity: {
        aiConversations: parseInt(String(activityRows[0]?.ai_conversations || '0')),
        lastConversation: activityRows[0]?.last_conversation,
        recentConversations
      },
      referral: {
        usedCode: user.referralCode || null
      },
      payments: paymentHistory,
      adminNotes
    });
    
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD] User details error:', error);
    await logSystemError('admin_user_details', error.message, {
      endpoint: '/api/admin/user/:id',
      stack: error.stack
    }, 'low');
    res.status(500).json({ error: 'Failed to load user details' });
  }
});

// POST: Add admin note to user
router.post('/user/:id/note', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const adminEmail = req.user?.email || 'unknown';
    
    if (!note || note.trim().length === 0) {
      return res.status(400).json({ error: 'Note cannot be empty' });
    }
    
    await db.insert(adminNotesTable).values({
      userId: id,
      adminEmail,
      note: note.trim(),
    });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('[ADMIN DASHBOARD] Add note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// ============================================================================
// AUTO-CURATION MANAGEMENT ENDPOINTS
// ============================================================================

// GET: Curation status and stats
router.get('/curation-status', requireAdmin, async (req, res) => {
  try {
    const stats = await curationController.getCurationStats();
    res.json(stats);
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD] Curation status error:', error);
    await logSystemError('admin_curation_status', error.message, {
      endpoint: '/api/admin/curation-status',
      stack: error.stack
    }, 'low');
    res.status(500).json({ error: 'Failed to get curation status' });
  }
});

// POST: Toggle auto-curation on/off
router.post('/toggle-curation', requireAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;
    const adminEmail = req.user?.email || 'admin';
    
    await curationController.updateSetting(
      'auto_curation_enabled',
      enabled,
      adminEmail
    );
    
    console.log(`[AUTO-CURATION] ${enabled ? 'Enabled' : 'Disabled'} by ${adminEmail}`);
    
    res.json({ 
      success: true, 
      enabled,
      message: `Auto-curation ${enabled ? 'enabled' : 'disabled'}`
    });
    
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD] Toggle curation error:', error);
    await logSystemError('admin_toggle_curation', error.message, {
      endpoint: '/api/admin/toggle-curation',
      stack: error.stack
    }, 'medium');
    res.status(500).json({ error: 'Failed to toggle curation' });
  }
});

// POST: Run curation manually
router.post('/run-curation', requireAdmin, async (req, res) => {
  try {
    const adminEmail = req.user?.email || 'admin';
    
    const result = await curationController.startCurationRun('manual', adminEmail);
    
    res.json(result);
    
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD] Run curation error:', error);
    await logSystemError('admin_run_curation', error.message, {
      endpoint: '/api/admin/run-curation',
      stack: error.stack
    }, 'medium');
    res.status(500).json({ error: 'Failed to start curation' });
  }
});

// POST: Run targeted instructor curation
router.post('/targeted-curation', requireAdmin, async (req, res) => {
  try {
    const { instructorName, searchQueries, minQuality = 7.0, minDuration = 120 } = req.body;
    
    if (!instructorName || !searchQueries || !Array.isArray(searchQueries)) {
      return res.status(400).json({ error: 'instructorName and searchQueries[] required' });
    }
    
    const { runTargetedInstructorCuration } = await import('./targeted-instructor-curation');
    
    res.json({ 
      status: 'started',
      message: `Starting targeted curation for ${instructorName}...`
    });
    
    runTargetedInstructorCuration(instructorName, searchQueries, minQuality, minDuration)
      .then(result => {
        console.log(`[TARGETED CURATION] Complete for ${instructorName}:`, result);
      })
      .catch(err => {
        console.error(`[TARGETED CURATION] Error for ${instructorName}:`, err);
      });
    
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD] Targeted curation error:', error);
    res.status(500).json({ error: 'Failed to start targeted curation' });
  }
});

// POST: Update curation settings
router.post('/curation-settings', requireAdmin, async (req, res) => {
  try {
    const { quotaLimit, batchSize, runsPerDay } = req.body;
    const adminEmail = req.user?.email || 'admin';
    
    if (quotaLimit) {
      await curationController.updateSetting('youtube_api_quota_limit', quotaLimit, adminEmail);
    }
    
    if (batchSize) {
      await curationController.updateSetting('curation_batch_size', batchSize, adminEmail);
    }
    
    if (runsPerDay) {
      await curationController.updateSetting('runs_per_day', runsPerDay, adminEmail);
    }
    
    res.json({ success: true, message: 'Settings updated' });
    
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD] Update settings error:', error);
    await logSystemError('admin_curation_settings', error.message, {
      endpoint: '/api/admin/curation-settings',
      stack: error.stack
    }, 'low');
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET: Recent curation runs
router.get('/curation-runs', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    
    const runs = await db.select()
      .from(curationRuns)
      .orderBy(desc(curationRuns.runDate))
      .limit(limit);
    
    res.json({ runs });
    
  } catch (error: any) {
    console.error('[ADMIN DASHBOARD] Get curation runs error:', error);
    await logSystemError('admin_curation_runs', error.message, {
      endpoint: '/api/admin/curation-runs',
      stack: error.stack
    }, 'low');
    res.status(500).json({ error: 'Failed to get curation runs' });
  }
});

// ============================================================================
// VIDEO LIBRARY SMART SEARCH
// ============================================================================

// GET: Dynamic filter options (professors and techniques) - ALL VIDEOS COUNTED
router.get('/videos/filters', requireAdmin, async (req, res) => {
  try {
    const { instructor, technique } = req.query;
    
    // Get all unique instructors with video counts - NO quality filter to show ALL videos
    let instructorsResult;
    if (technique) {
      instructorsResult = await db.execute(sql`
        SELECT DISTINCT instructor_name as name, COUNT(*) as count
        FROM ai_video_knowledge
        WHERE instructor_name IS NOT NULL
          AND instructor_name != ''
          AND technique_name ILIKE ${`%${technique}%`}
        GROUP BY instructor_name
        ORDER BY count DESC
      `);
    } else {
      instructorsResult = await db.execute(sql`
        SELECT DISTINCT instructor_name as name, COUNT(*) as count
        FROM ai_video_knowledge
        WHERE instructor_name IS NOT NULL AND instructor_name != ''
        GROUP BY instructor_name
        ORDER BY count DESC
      `);
    }
    
    // Get all unique techniques with counts - ALPHABETICAL ORDER (A-Z)
    let techniquesResult;
    if (instructor) {
      techniquesResult = await db.execute(sql`
        SELECT DISTINCT technique_name as name, COUNT(*) as count
        FROM ai_video_knowledge
        WHERE technique_name IS NOT NULL
          AND technique_name != ''
          AND instructor_name = ${instructor}
        GROUP BY technique_name
        ORDER BY LOWER(technique_name) ASC
      `);
    } else {
      techniquesResult = await db.execute(sql`
        SELECT DISTINCT technique_name as name, COUNT(*) as count
        FROM ai_video_knowledge
        WHERE technique_name IS NOT NULL AND technique_name != ''
        GROUP BY technique_name
        ORDER BY LOWER(technique_name) ASC
      `);
    }
    
    // postgres-js returns rows directly as array, not { rows: [...] }
    const instructorRows = Array.isArray(instructorsResult) ? instructorsResult : (instructorsResult.rows || []);
    const techniqueRows = Array.isArray(techniquesResult) ? techniquesResult : (techniquesResult.rows || []);
    
    res.json({
      instructors: instructorRows.map((r: any) => ({
        name: r.name,
        count: parseInt(r.count)
      })),
      techniques: techniqueRows.map((r: any) => ({
        name: r.name,
        count: parseInt(r.count)
      }))
    });
    
  } catch (error: any) {
    console.error('[ADMIN] Video filters error:', error);
    res.status(500).json({ error: 'Failed to get filters' });
  }
});

// GET: Smart video search with fuzzy matching
router.get('/videos/search', requireAdmin, async (req, res) => {
  try {
    const { 
      q, 
      instructor, 
      technique, 
      minQuality,
      dateRange,
      limit = '100'
    } = req.query;
    
    const searchLimit = Math.min(parseInt(limit as string) || 100, 500);
    
    // Build dynamic query - NO default quality filter, show all videos
    let conditions: string[] = [];
    
    // Smart search - fuzzy matching on title, instructor, technique
    if (q && typeof q === 'string' && q.trim()) {
      const searchTerm = q.trim().replace(/'/g, "''");
      conditions.push(`(
        title ILIKE '%${searchTerm}%'
        OR instructor_name ILIKE '%${searchTerm}%'
        OR technique_name ILIKE '%${searchTerm}%'
      )`);
    }
    
    // Instructor filter
    if (instructor && typeof instructor === 'string') {
      const instructorVal = instructor.replace(/'/g, "''");
      conditions.push(`instructor_name = '${instructorVal}'`);
    }
    
    // Technique filter
    if (technique && typeof technique === 'string') {
      const techniqueVal = technique.replace(/'/g, "''");
      conditions.push(`technique_name ILIKE '%${techniqueVal}%'`);
    }
    
    // Quality filter - only apply if specified and not "0"
    if (minQuality && minQuality !== '0') {
      const qualityVal = parseFloat(minQuality as string);
      if (!isNaN(qualityVal) && qualityVal > 0) {
        conditions.push(`quality_score >= ${qualityVal}`);
      }
    }
    
    // Date range filter
    if (dateRange && dateRange !== 'all') {
      const dateFilters: Record<string, string> = {
        today: "created_at >= CURRENT_DATE",
        week: "created_at >= CURRENT_DATE - INTERVAL '7 days'",
        month: "created_at >= CURRENT_DATE - INTERVAL '30 days'"
      };
      if (dateFilters[dateRange as string]) {
        conditions.push(dateFilters[dateRange as string]);
      }
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const query = `
      SELECT 
        id, youtube_id, title, instructor_name, technique_name,
        thumbnail_url, duration, quality_score, gi_or_nogi,
        created_at, view_count, like_count
      FROM ai_video_knowledge
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${searchLimit}
    `;
    
    console.log('[ADMIN VIDEO SEARCH] Query:', query);
    
    const result = await db.execute(sql.raw(query));
    
    // Get total count without limit
    const countQuery = `
      SELECT COUNT(*) as total
      FROM ai_video_knowledge
      ${whereClause}
    `;
    
    const countResult = await db.execute(sql.raw(countQuery));
    
    // postgres-js returns rows directly as array, not { rows: [...] }
    const videos = Array.isArray(result) ? result : (result.rows || []);
    const countRows = Array.isArray(countResult) ? countResult : (countResult.rows || []);
    
    console.log('[ADMIN VIDEO SEARCH] Found', videos.length, 'videos, total:', countRows[0]);
    
    res.json({
      videos: videos,
      count: videos.length,
      total: parseInt((countRows[0] as any)?.total || '0')
    });
    
  } catch (error: any) {
    console.error('[ADMIN] Video search error:', error);
    res.status(500).json({ error: 'Failed to search videos', details: error.message });
  }
});

// DELETE: Remove video from library
router.delete('/videos/:id', requireAdmin, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    
    await db.delete(aiVideoKnowledge).where(eq(aiVideoKnowledge.id, videoId));
    
    res.json({ success: true, message: 'Video deleted' });
    
  } catch (error: any) {
    console.error('[ADMIN] Delete video error:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

// GET: Video library stats
router.get('/videos/stats', requireAdmin, async (req, res) => {
  try {
    console.log('[ADMIN STATS] Fetching video stats from ai_video_knowledge...');
    
    const stats = await db.execute(sql`
      SELECT 
        COUNT(*)::int as total_videos,
        COUNT(DISTINCT instructor_name)::int as unique_instructors,
        COUNT(DISTINCT technique_name)::int as unique_techniques,
        ROUND(AVG(quality_score)::numeric, 2) as avg_quality,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int as added_today,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::int as added_week
      FROM ai_video_knowledge
    `);
    
    // postgres-js returns rows directly as array, not { rows: [...] }
    const rows = Array.isArray(stats) ? stats : (stats.rows || []);
    console.log('[ADMIN STATS] Raw result:', rows[0]);
    
    const result = rows[0] || {
      total_videos: 0,
      unique_instructors: 0,
      unique_techniques: 0,
      avg_quality: 0,
      added_today: 0,
      added_week: 0
    };
    
    res.json(result);
    
  } catch (error: any) {
    console.error('[ADMIN] Video stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET: Distinct instructors for dropdown (NO LIMITS - show all instructors)
router.get('/videos/instructors', requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT DISTINCT instructor_name 
      FROM ai_video_knowledge 
      WHERE instructor_name IS NOT NULL 
        AND instructor_name != ''
      ORDER BY instructor_name
    `);
    
    // postgres-js returns rows directly as array, not { rows: [...] }
    const rows = Array.isArray(result) ? result : (result.rows || []);
    res.json(rows.map((r: any) => r.instructor_name));
    
  } catch (error: any) {
    console.error('[ADMIN] Instructors list error:', error);
    res.status(500).json({ error: 'Failed to get instructors' });
  }
});

// GET: Distinct techniques for dropdown
router.get('/videos/techniques', requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT DISTINCT technique_name 
      FROM ai_video_knowledge 
      WHERE technique_name IS NOT NULL 
        AND technique_name != ''
      ORDER BY technique_name
    `);
    
    // postgres-js returns rows directly as array, not { rows: [...] }
    const rows = Array.isArray(result) ? result : (result.rows || []);
    res.json(rows.map((r: any) => r.technique_name));
    
  } catch (error: any) {
    console.error('[ADMIN] Techniques list error:', error);
    res.status(500).json({ error: 'Failed to get techniques' });
  }
});

// GET: Video list with simple filters (includes knowledge status)
router.get('/videos/list', requireAdmin, async (req, res) => {
  try {
    const { q, instructor, technique, knowledgeFilter, limit = '50' } = req.query;
    const searchLimit = Math.min(parseInt(limit as string) || 50, 2000);
    
    let conditions: string[] = [];
    
    if (q && typeof q === 'string' && q.trim()) {
      const searchTerm = q.trim().replace(/'/g, "''");
      conditions.push(`(v.title ILIKE '%${searchTerm}%' OR v.instructor_name ILIKE '%${searchTerm}%')`);
    }
    
    if (instructor && typeof instructor === 'string' && instructor !== 'all') {
      const instructorVal = instructor.replace(/'/g, "''");
      conditions.push(`v.instructor_name = '${instructorVal}'`);
    }
    
    if (technique && typeof technique === 'string' && technique !== 'all') {
      const techniqueVal = technique.replace(/'/g, "''");
      conditions.push(`v.technique_name = '${techniqueVal}'`);
    }
    
    // Knowledge filter
    if (knowledgeFilter === 'watched') {
      conditions.push(`ws.processed = true AND ws.has_transcript = true`);
    } else if (knowledgeFilter === 'pending') {
      conditions.push(`(ws.id IS NULL OR ws.processed = false)`);
    } else if (knowledgeFilter === 'failed') {
      conditions.push(`ws.processed = true AND ws.has_transcript = false`);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const query = `
      SELECT 
        v.id, v.youtube_id, v.title, v.instructor_name, v.technique_name,
        v.thumbnail_url, v.duration, v.quality_score, v.created_at,
        CASE 
          WHEN ws.processed = true AND ws.has_transcript = true THEN 'watched'
          WHEN ws.processed = false OR (ws.processed = true AND ws.has_transcript = false AND ws.error_message IS NOT NULL) THEN 'failed'
          ELSE 'pending'
        END as knowledge_status,
        ws.processed_at as knowledge_processed_at,
        (SELECT COUNT(*) FROM video_knowledge vk WHERE vk.video_id = v.id) as techniques_count
      FROM ai_video_knowledge v
      LEFT JOIN video_watch_status ws ON v.id = ws.video_id
      ${whereClause}
      ORDER BY v.quality_score DESC NULLS LAST
      LIMIT ${searchLimit}
    `;
    
    const result = await db.execute(sql.raw(query));
    
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM ai_video_knowledge v
      LEFT JOIN video_watch_status ws ON v.id = ws.video_id
      ${whereClause}
    `;
    const countResult = await db.execute(sql.raw(countQuery));
    
    // postgres-js returns rows directly as array, not { rows: [...] }
    const videos = Array.isArray(result) ? result : (result.rows || []);
    const countRows = Array.isArray(countResult) ? countResult : (countResult.rows || []);
    
    res.json({
      videos: videos,
      total: parseInt((countRows[0] as any)?.total || '0')
    });
    
  } catch (error: any) {
    console.error('[ADMIN] Video list error:', error);
    res.status(500).json({ error: 'Failed to get videos', details: error.message });
  }
});

// ============================================================================
// VIDEO KNOWLEDGE SYSTEM
// ============================================================================

import { getKnowledgeStatus, processBatch, processVideoKnowledge, testGeminiConnection } from './video-knowledge-service';

// GET: Video knowledge extraction status
router.get('/videos/knowledge-status', requireAdmin, async (req, res) => {
  try {
    const status = await getKnowledgeStatus();
    // FIX: Use 'processed' (all analyzed videos) not 'withTranscript' (only those with successful transcript)
    const percentComplete = status.totalVideos > 0 
      ? ((status.processed / status.totalVideos) * 100).toFixed(1) 
      : '0.0';
    
    res.json({
      ...status,
      percentComplete: parseFloat(percentComplete)
    });
  } catch (error: any) {
    console.error('[ADMIN] Knowledge status error:', error);
    res.status(500).json({ error: 'Failed to get knowledge status' });
  }
});

// GET: Test Gemini API connection
router.get('/videos/test-gemini', requireAdmin, async (req, res) => {
  try {
    const result = await testGeminiConnection();
    res.json(result);
  } catch (error: any) {
    console.error('[ADMIN] Gemini test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Process a batch of videos
router.post('/videos/process-batch', requireAdmin, async (req, res) => {
  try {
    const { batchSize = 10 } = req.body;
    const result = await processBatch(Math.min(batchSize, 50));
    res.json(result);
  } catch (error: any) {
    console.error('[ADMIN] Batch processing error:', error);
    res.status(500).json({ error: 'Failed to process batch' });
  }
});

// POST: Process a single video
router.post('/videos/:id/process', requireAdmin, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    const result = await processVideoKnowledge(videoId);
    res.json(result);
  } catch (error: any) {
    console.error('[ADMIN] Video processing error:', error);
    res.status(500).json({ error: 'Failed to process video' });
  }
});

// GET: Get knowledge for a specific video
router.get('/videos/:id/knowledge', requireAdmin, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    
    const knowledge = await db.select()
      .from(videoKnowledge)
      .where(eq(videoKnowledge.videoId, videoId));
    
    const [watchStatus] = await db.select()
      .from(videoWatchStatus)
      .where(eq(videoWatchStatus.videoId, videoId))
      .limit(1);
    
    res.json({
      videoId,
      watchStatus: watchStatus || null,
      techniques: knowledge
    });
  } catch (error: any) {
    console.error('[ADMIN] Video knowledge error:', error);
    res.status(500).json({ error: 'Failed to get video knowledge' });
  }
});

// Bulk processing state
let bulkProcessingActive = false;
let bulkProcessingProgress = {
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
  currentBatch: 0,
  totalBatches: 0,
  isPaused: false,
  startedAt: null as Date | null,
  estimatedTimeRemaining: null as string | null
};

// GET: Bulk processing status
router.get('/videos/bulk-status', requireAdmin, async (req, res) => {
  res.json({
    isActive: bulkProcessingActive,
    ...bulkProcessingProgress
  });
});

// POST: Start bulk processing of all pending videos
router.post('/videos/process-all', requireAdmin, async (req, res) => {
  if (bulkProcessingActive) {
    return res.status(400).json({ error: 'Bulk processing already in progress' });
  }
  
  try {
    const { batchSize = 10, delayBetweenBatches = 30000 } = req.body;
    
    // Count pending videos
    const pendingResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM ai_video_knowledge v
      LEFT JOIN video_watch_status ws ON v.id = ws.video_id
      WHERE ws.id IS NULL OR (ws.processed = false AND ws.error_message IS NOT NULL)
    `);
    // postgres-js returns rows directly as array, not { rows: [...] }
    const pendingRows = Array.isArray(pendingResult) ? pendingResult : (pendingResult.rows || []);
    const pendingCount = parseInt((pendingRows[0] as any)?.count || '0');
    
    if (pendingCount === 0) {
      return res.json({ message: 'No pending videos to process' });
    }
    
    bulkProcessingActive = true;
    bulkProcessingProgress = {
      total: pendingCount,
      processed: 0,
      succeeded: 0,
      failed: 0,
      currentBatch: 0,
      totalBatches: Math.ceil(pendingCount / batchSize),
      isPaused: false,
      startedAt: new Date(),
      estimatedTimeRemaining: null
    };
    
    res.json({ 
      message: 'Bulk processing started',
      total: pendingCount,
      totalBatches: bulkProcessingProgress.totalBatches
    });
    
    // Process in background
    (async () => {
      try {
        while (bulkProcessingActive && !bulkProcessingProgress.isPaused) {
          bulkProcessingProgress.currentBatch++;
          
          const result = await processBatch(batchSize);
          
          bulkProcessingProgress.processed += result.processed;
          bulkProcessingProgress.succeeded += result.succeeded;
          bulkProcessingProgress.failed += result.failed;
          
          // Calculate estimated time remaining
          if (bulkProcessingProgress.startedAt && bulkProcessingProgress.processed > 0) {
            const elapsed = Date.now() - bulkProcessingProgress.startedAt.getTime();
            const avgPerVideo = elapsed / bulkProcessingProgress.processed;
            const remaining = bulkProcessingProgress.total - bulkProcessingProgress.processed;
            const msRemaining = avgPerVideo * remaining;
            const minsRemaining = Math.ceil(msRemaining / 60000);
            bulkProcessingProgress.estimatedTimeRemaining = `${minsRemaining} minutes`;
          }
          
          // Stop if no more videos to process
          if (result.processed === 0) {
            console.log('[BULK] No more videos to process');
            break;
          }
          
          // Wait between batches
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      } catch (error) {
        console.error('[BULK] Processing error:', error);
      } finally {
        bulkProcessingActive = false;
        console.log('[BULK] Processing complete:', bulkProcessingProgress);
      }
    })();
    
  } catch (error: any) {
    console.error('[ADMIN] Bulk processing start error:', error);
    res.status(500).json({ error: 'Failed to start bulk processing' });
  }
});

// POST: Pause/Resume bulk processing
router.post('/videos/bulk-pause', requireAdmin, async (req, res) => {
  if (!bulkProcessingActive) {
    return res.status(400).json({ error: 'No bulk processing in progress' });
  }
  
  bulkProcessingProgress.isPaused = !bulkProcessingProgress.isPaused;
  res.json({ 
    isPaused: bulkProcessingProgress.isPaused,
    message: bulkProcessingProgress.isPaused ? 'Processing paused' : 'Processing resumed'
  });
});

// POST: Stop bulk processing
router.post('/videos/bulk-stop', requireAdmin, async (req, res) => {
  bulkProcessingActive = false;
  res.json({ message: 'Bulk processing stopped' });
});

// ============================================================================
// DEVOPS COMMAND CENTER
// ============================================================================
// NOTE: DevOps chat functionality has been consolidated into /api/admin/dev-os/chat
// This endpoint now includes real-time metrics via dev-os-metrics service

// ============================================================================
// REFERRAL SYSTEM MANAGEMENT
// ============================================================================

import { 
  createReferralCodeWithCoupon, 
  validateReferralCodeWithDiscount,
  getDiscountDescription,
  deleteStripeCoupon,
  type DiscountType
} from './referral-service';

// GET: List all referral codes
router.get('/referrals/codes', requireAdmin, async (req, res) => {
  try {
    const codes = await db.select()
      .from(referralCodes)
      .orderBy(desc(referralCodes.createdAt));

    // Enhance with discount descriptions
    const enhancedCodes = codes.map(code => ({
      ...code,
      discountDescription: getDiscountDescription(
        (code.discountType || 'none') as DiscountType,
        parseFloat(code.discountValue || '0')
      ),
      commissionPercent: code.commissionRate ? parseFloat(code.commissionRate) * 100 : 0,
    }));

    res.json({ codes: enhancedCodes });
  } catch (error: any) {
    console.error('[ADMIN] List referral codes error:', error);
    res.status(500).json({ error: 'Failed to list referral codes' });
  }
});

// POST: Create new referral code
router.post('/referrals/codes', requireAdmin, async (req, res) => {
  try {
    const { 
      code, 
      codeType = 'influencer',
      influencerName,
      commissionRate,
      discountType = 'none',
      discountValue = 0
    } = req.body;

    if (!code || typeof code !== 'string' || code.trim().length < 2) {
      return res.status(400).json({ error: 'Code must be at least 2 characters' });
    }

    // Validate discount type
    const validDiscountTypes = ['none', 'percentage', 'fixed', 'trial_extension', 'free_month', 'free_months'];
    if (!validDiscountTypes.includes(discountType)) {
      return res.status(400).json({ error: 'Invalid discount type' });
    }

    // Get admin email from token
    const adminEmail = (req as any).adminUser?.email || (req as any).admin?.email || 'unknown';

    const result = await createReferralCodeWithCoupon({
      code: code.trim(),
      codeType: codeType as 'user' | 'influencer',
      influencerName,
      commissionRate: commissionRate ? parseFloat(commissionRate) / 100 : undefined, // Convert % to decimal
      discountType: discountType as DiscountType,
      discountValue: parseFloat(discountValue) || 0,
      createdByAdmin: adminEmail,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ 
      success: true, 
      code: result.referralCode,
      message: `Created referral code ${code.toUpperCase()}`
    });
  } catch (error: any) {
    console.error('[ADMIN] Create referral code error:', error);
    res.status(500).json({ error: 'Failed to create referral code' });
  }
});

// PUT: Update referral code status (activate/deactivate)
router.put('/referrals/codes/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    await db.update(referralCodes)
      .set({ isActive })
      .where(eq(referralCodes.id, id));

    res.json({ 
      success: true, 
      message: `Referral code ${isActive ? 'activated' : 'deactivated'}`
    });
  } catch (error: any) {
    console.error('[ADMIN] Update referral code error:', error);
    res.status(500).json({ error: 'Failed to update referral code' });
  }
});

// DELETE: Delete referral code
router.delete('/referrals/codes/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the code first to check for Stripe coupon
    const [code] = await db.select()
      .from(referralCodes)
      .where(eq(referralCodes.id, id))
      .limit(1);

    if (!code) {
      return res.status(404).json({ error: 'Referral code not found' });
    }

    // Delete Stripe coupon if exists
    if (code.stripeCouponId) {
      await deleteStripeCoupon(code.stripeCouponId);
    }

    // Delete the referral code
    await db.delete(referralCodes).where(eq(referralCodes.id, id));

    res.json({ 
      success: true, 
      message: `Deleted referral code ${code.code}`
    });
  } catch (error: any) {
    console.error('[ADMIN] Delete referral code error:', error);
    res.status(500).json({ error: 'Failed to delete referral code' });
  }
});

// GET: List users who signed up with referral codes
router.get('/referrals/users', requireAdmin, async (req, res) => {
  try {
    const { code, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 50, 200);
    const offset = (pageNum - 1) * limitNum;

    // Build query conditions
    let conditions = sql`${bjjUsers.referralCodeUsed} IS NOT NULL`;
    if (code && typeof code === 'string') {
      conditions = sql`${bjjUsers.referralCodeUsed} = ${code.toUpperCase()}`;
    }

    const users = await db.select({
      id: bjjUsers.id,
      email: bjjUsers.email,
      username: bjjUsers.username,
      referralCodeUsed: bjjUsers.referralCodeUsed,
      referredByInfluencer: bjjUsers.referredByInfluencer,
      referralSignupDate: bjjUsers.referralSignupDate,
      discountTypeReceived: bjjUsers.discountTypeReceived,
      discountValueReceived: bjjUsers.discountValueReceived,
      discountAmountSaved: bjjUsers.discountAmountSaved,
      subscriptionType: bjjUsers.subscriptionType,
      subscriptionStatus: bjjUsers.subscriptionStatus,
      createdAt: bjjUsers.createdAt,
    })
      .from(bjjUsers)
      .where(conditions)
      .orderBy(desc(bjjUsers.referralSignupDate))
      .limit(limitNum)
      .offset(offset);

    // Get total count
    const countResult = await db.select({ count: drizzleCount() })
      .from(bjjUsers)
      .where(conditions);
    const total = countResult[0]?.count || 0;

    // Enhance with discount descriptions
    const enhancedUsers = users.map(user => ({
      ...user,
      discountDescription: user.discountTypeReceived 
        ? getDiscountDescription(
            user.discountTypeReceived as DiscountType,
            parseFloat(user.discountValueReceived || '0')
          )
        : 'No discount',
    }));

    res.json({ 
      users: enhancedUsers,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error: any) {
    console.error('[ADMIN] List referred users error:', error);
    res.status(500).json({ error: 'Failed to list referred users' });
  }
});

// GET: Influencer payouts summary
router.get('/referrals/payouts', requireAdmin, async (req, res) => {
  try {
    // Get all influencer codes with their stats
    const influencerCodes = await db.select()
      .from(referralCodes)
      .where(eq(referralCodes.codeType, 'influencer'))
      .orderBy(desc(referralCodes.totalRevenueGenerated));

    // Enhance with calculated fields
    const payoutSummaries = influencerCodes.map(code => {
      const totalRevenue = parseFloat(code.totalRevenueGenerated || '0');
      const commissionRate = parseFloat(code.commissionRate || '0');
      const commissionOwed = parseFloat(code.commissionOwed || '0');

      return {
        id: code.id,
        code: code.code,
        influencerName: code.influencerName || 'Unknown',
        commissionRate: commissionRate * 100, // Display as percentage
        totalSignups: code.totalSignups || 0,
        activeSubscribers: code.activeSubscribers || 0,
        totalRevenue: totalRevenue.toFixed(2),
        commissionOwed: commissionOwed.toFixed(2),
        stripeAccountId: code.stripeAccountId,
        payoutMethod: code.payoutMethod || 'stripe',
        isActive: code.isActive,
      };
    });

    // Calculate totals
    const totalCommissionOwed = payoutSummaries.reduce((sum, p) => sum + parseFloat(p.commissionOwed), 0);
    const totalRevenue = payoutSummaries.reduce((sum, p) => sum + parseFloat(p.totalRevenue), 0);
    const totalSignups = payoutSummaries.reduce((sum, p) => sum + p.totalSignups, 0);

    res.json({
      influencers: payoutSummaries,
      totals: {
        totalCommissionOwed: totalCommissionOwed.toFixed(2),
        totalRevenue: totalRevenue.toFixed(2),
        totalSignups,
        influencerCount: payoutSummaries.length,
      }
    });
  } catch (error: any) {
    console.error('[ADMIN] Get payouts error:', error);
    res.status(500).json({ error: 'Failed to get payout information' });
  }
});

// GET: Referral analytics
router.get('/referrals/analytics', requireAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Signups over time grouped by day
    const signupsByDay = await db.execute(sql`
      SELECT 
        DATE(referral_signup_date) as date,
        COUNT(*) as count
      FROM bjj_users
      WHERE referral_code_used IS NOT NULL
        AND referral_signup_date >= ${startDate}
      GROUP BY DATE(referral_signup_date)
      ORDER BY date ASC
    `);

    // Top performing codes
    const topCodes = await db.select({
      code: referralCodes.code,
      influencerName: referralCodes.influencerName,
      totalSignups: referralCodes.totalSignups,
      activeSubscribers: referralCodes.activeSubscribers,
      totalRevenueGenerated: referralCodes.totalRevenueGenerated,
    })
      .from(referralCodes)
      .where(eq(referralCodes.isActive, true))
      .orderBy(desc(referralCodes.totalSignups))
      .limit(10);

    // Conversion rate by discount type
    const conversionByDiscount = await db.execute(sql`
      SELECT 
        discount_type_received as discount_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE subscription_status = 'active' AND subscription_type != 'free_trial') as converted
      FROM bjj_users
      WHERE referral_code_used IS NOT NULL
      GROUP BY discount_type_received
    `);

    // Total stats
    const totalStats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_referred,
        COUNT(*) FILTER (WHERE subscription_status = 'active') as active_subscribers,
        COUNT(*) FILTER (WHERE subscription_type = 'free_trial') as trials
      FROM bjj_users
      WHERE referral_code_used IS NOT NULL
    `);

    // postgres-js returns rows directly as array, not { rows: [...] }
    const signupRows = Array.isArray(signupsByDay) ? signupsByDay : (signupsByDay.rows || []);
    const conversionRows = Array.isArray(conversionByDiscount) ? conversionByDiscount : (conversionByDiscount.rows || []);
    const totalStatsRows = Array.isArray(totalStats) ? totalStats : (totalStats.rows || []);
    
    res.json({
      signupsByDay: signupRows,
      topCodes: topCodes.map(c => ({
        ...c,
        totalRevenueGenerated: parseFloat(c.totalRevenueGenerated || '0').toFixed(2)
      })),
      conversionByDiscount: conversionRows.map((r: any) => ({
        discountType: r.discount_type || 'none',
        total: parseInt(r.total),
        converted: parseInt(r.converted),
        conversionRate: r.total > 0 ? ((r.converted / r.total) * 100).toFixed(1) : '0.0'
      })),
      totals: {
        totalReferred: parseInt(String(totalStatsRows[0]?.total_referred || '0')),
        activeSubscribers: parseInt(String(totalStatsRows[0]?.active_subscribers || '0')),
        trials: parseInt(String(totalStatsRows[0]?.trials || '0')),
      }
    });
  } catch (error: any) {
    console.error('[ADMIN] Referral analytics error:', error);
    res.status(500).json({ error: 'Failed to get referral analytics' });
  }
});

// POST: Validate referral code (for testing)
router.post('/referrals/validate', requireAdmin, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const result = await validateReferralCodeWithDiscount(code);
    res.json(result);
  } catch (error: any) {
    console.error('[ADMIN] Validate code error:', error);
    res.status(500).json({ error: 'Failed to validate code' });
  }
});

// GET: Export referral data as CSV
router.get('/referrals/export', requireAdmin, async (req, res) => {
  try {
    const { type = 'users' } = req.query;

    if (type === 'payouts') {
      // Export influencer payouts
      const influencers = await db.select()
        .from(referralCodes)
        .where(eq(referralCodes.codeType, 'influencer'));

      const csvHeader = 'Code,Influencer,Commission Rate,Total Signups,Active Subscribers,Total Revenue,Commission Owed,Status\n';
      const csvRows = influencers.map(i => 
        `${i.code},"${i.influencerName || ''}",${parseFloat(i.commissionRate || '0') * 100}%,${i.totalSignups || 0},${i.activeSubscribers || 0},$${parseFloat(i.totalRevenueGenerated || '0').toFixed(2)},$${parseFloat(i.commissionOwed || '0').toFixed(2)},${i.isActive ? 'Active' : 'Inactive'}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=referral-payouts-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csvHeader + csvRows);
    } else {
      // Export referred users
      const users = await db.select({
        email: bjjUsers.email,
        username: bjjUsers.username,
        referralCodeUsed: bjjUsers.referralCodeUsed,
        referredByInfluencer: bjjUsers.referredByInfluencer,
        referralSignupDate: bjjUsers.referralSignupDate,
        discountTypeReceived: bjjUsers.discountTypeReceived,
        discountValueReceived: bjjUsers.discountValueReceived,
        subscriptionType: bjjUsers.subscriptionType,
        subscriptionStatus: bjjUsers.subscriptionStatus,
      })
        .from(bjjUsers)
        .where(sql`${bjjUsers.referralCodeUsed} IS NOT NULL`)
        .orderBy(desc(bjjUsers.referralSignupDate));

      const csvHeader = 'Email,Username,Code Used,Influencer,Signup Date,Discount Type,Discount Value,Subscription Type,Status\n';
      const csvRows = users.map(u => 
        `${u.email},"${u.username || ''}",${u.referralCodeUsed},"${u.referredByInfluencer || ''}",${u.referralSignupDate?.toISOString().split('T')[0] || ''},${u.discountTypeReceived || 'none'},${u.discountValueReceived || '0'},${u.subscriptionType},${u.subscriptionStatus}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=referred-users-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csvHeader + csvRows);
    }
  } catch (error: any) {
    console.error('[ADMIN] Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ISSUE 1: AUTO CURATION STATUS AND TOGGLE
// ═══════════════════════════════════════════════════════════════════════════════

// GET: Auto curation status
router.get('/curation/auto-status', requireAdmin, async (req, res) => {
  try {
    // Get current state from the permanent-auto-curation module
    const isEnabled = isAutoCurationEnabled();
    const status = getAutoCurationStatus();
    
    // Get last curation run stats and today's run count from database
    const [lastRun, todayRuns] = await Promise.all([
      db.select()
        .from(curationRuns)
        .orderBy(desc(curationRuns.createdAt))
        .limit(1),
      db.select({ count: drizzleCount() })
        .from(curationRuns)
        .where(gte(curationRuns.createdAt, new Date(new Date().setHours(0, 0, 0, 0))))
    ]);
    
    const lastRunData = lastRun[0] ? {
      discovered: lastRun[0].discovered || 0,
      analyzed: lastRun[0].analyzed || 0,
      accepted: lastRun[0].approved || 0,
      rejected: lastRun[0].rejected || 0,
      timestamp: lastRun[0].createdAt
    } : null;
    
    res.json({
      enabled: isEnabled,
      lastRun: lastRunData,
      runsToday: todayRuns[0]?.count || 0,
      lastRunAt: status.lastRunAt,
      lastRunResult: status.lastRunResult,
      videosAddedLastRun: status.videosAddedLastRun
    });
  } catch (error: any) {
    console.error('[ADMIN] Auto curation status error:', error);
    res.status(500).json({ error: 'Failed to get curation status' });
  }
});

// POST: Toggle auto curation (integrates with scheduler via module state + database persistence)
router.post('/curation/auto-toggle', requireAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    
    // Set state in the permanent-auto-curation module (persists to database)
    const result = await setAutoCurationEnabled(enabled);
    
    if (!result.success) {
      console.error(`[ADMIN] Auto curation toggle failed to persist: ${result.error}`);
      return res.status(500).json({ error: 'Failed to persist curation state', details: result.error });
    }
    
    console.log(`[ADMIN] Auto curation ${enabled ? 'ENABLED' : 'DISABLED'} by admin (persisted to database)`);
    
    res.json({ success: true, enabled: isAutoCurationEnabled() });
  } catch (error: any) {
    console.error('[ADMIN] Auto curation toggle error:', error);
    res.status(500).json({ error: 'Failed to toggle curation' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ISSUE 2: GET ALL INSTRUCTORS FROM DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/instructors/all', requireAdmin, async (req, res) => {
  try {
    const result = await db.selectDistinct({ instructor: aiVideoKnowledge.instructorName })
      .from(aiVideoKnowledge)
      .where(sql`${aiVideoKnowledge.instructorName} IS NOT NULL AND ${aiVideoKnowledge.instructorName} != ''`)
      .orderBy(aiVideoKnowledge.instructorName);
    
    const instructors = result
      .map(r => r.instructor)
      .filter((name): name is string => !!name && name.trim().length > 0)
      .sort((a, b) => a.localeCompare(b));
    
    res.json({ instructors });
  } catch (error: any) {
    console.error('[ADMIN] Get instructors error:', error);
    res.status(500).json({ error: 'Failed to get instructors' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ISSUE 3: GET POSITIONS FROM DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/positions/all', requireAdmin, async (req, res) => {
  try {
    // Comprehensive hardcoded list of BJJ positions
    const positions = [
      'Closed Guard', 'Half Guard', 'Deep Half Guard', 'Z Guard', 'Knee Shield',
      'Open Guard', 'Spider Guard', 'Lasso Guard', 'De La Riva', 'Reverse De La Riva',
      'X Guard', 'Single Leg X', 'Butterfly Guard', 'Rubber Guard', 'Worm Guard',
      'Mount', 'S Mount', 'Technical Mount', 'Mount Escape', 'High Mount',
      'Back Control', 'Back Mount', 'Truck', 'Back Escape', 'Rear Naked Choke Position',
      'Side Control', 'Kesa Gatame', 'North South', 'Side Control Escape', 'Scarf Hold',
      'Knee on Belly', 'Knee on Chest',
      'Turtle', 'Turtle Attacks', 'Turtle Escapes',
      'Standing', 'Clinch', 'Takedowns', 'Wrestling', 'Judo Throws',
      'Guard Passing', 'Guard Retention', 'Pressure Passing', 'Speed Passing',
      '50/50', 'Leg Entanglements', 'Ashi Garami', 'Saddle', 'Inside Sankaku',
      'Crucifix', 'Gift Wrap', 'Body Lock', 'Body Triangle'
    ];
    
    res.json({ positions });
  } catch (error: any) {
    console.error('[ADMIN] Get positions error:', error);
    res.status(500).json({ error: 'Failed to get positions' });
  }
});

export default router;
