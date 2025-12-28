import { db } from '../db';
import { sql } from 'drizzle-orm';

export async function getSystemHealth() {
  console.log('🔍 Gathering system health data...');
  
  try {
    // Database status
    await db.execute(sql`SELECT 1`);
    const dbStatus = 'healthy';
    
    // User stats
    const userStats = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN last_login_date > NOW() - INTERVAL '24 hours' THEN 1 END) as active_24h,
        COUNT(CASE WHEN last_login_date > NOW() - INTERVAL '7 days' THEN 1 END) as active_7d
      FROM bjj_users
    `);
    
    // Video stats
    const videoStats = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN quality_score >= 7.0 THEN 1 END) as high_quality
      FROM ai_video_knowledge
      WHERE quality_score IS NOT NULL
    `);
    
    // Curation stats (today)
    const today = new Date().toISOString().split('T')[0];
    const curationStats = await db.execute(sql`
      SELECT 
        COALESCE(SUM(videos_screened), 0) as screened,
        COALESCE(SUM(videos_added), 0) as accepted,
        COALESCE(SUM(videos_rejected), 0) as rejected
      FROM curation_runs
      WHERE DATE(run_date) = ${today}
    `);
    
    // Revenue stats (active subscriptions)
    const revenueStats = await db.execute(sql`
      SELECT 
        COUNT(CASE WHEN is_lifetime = false AND subscription_status = 'active' THEN 1 END) as active_subs,
        COUNT(CASE WHEN is_lifetime = true THEN 1 END) as lifetime_users
      FROM bjj_users
    `);
    
    const screened = parseInt(curationStats.rows[0]?.screened || '0');
    const accepted = parseInt(curationStats.rows[0]?.accepted || '0');
    const rejected = parseInt(curationStats.rows[0]?.rejected || '0');
    const acceptanceRate = screened > 0 ? ((accepted / screened) * 100).toFixed(1) : '0';
    
    const activeSubs = parseInt(revenueStats.rows[0]?.active_subs || '0');
    const lifetimeUsers = parseInt(revenueStats.rows[0]?.lifetime_users || '0');
    const mrr = (activeSubs * 14.99).toFixed(2);
    
    return {
      database: {
        status: dbStatus
      },
      users: {
        total: parseInt(userStats.rows[0]?.total || '0'),
        active24h: parseInt(userStats.rows[0]?.active_24h || '0'),
        active7d: parseInt(userStats.rows[0]?.active_7d || '0')
      },
      videos: {
        total: parseInt(videoStats.rows[0]?.total || '0'),
        highQuality: parseInt(videoStats.rows[0]?.high_quality || '0')
      },
      curation: {
        screened,
        accepted,
        rejected,
        acceptanceRate
      },
      revenue: {
        activeSubs,
        lifetimeUsers,
        mrr
      },
      api: {
        status: 'OK'
      }
    };
    
  } catch (error) {
    console.error('❌ Error gathering system health:', error);
    throw error;
  }
}
