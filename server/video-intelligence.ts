/**
 * Video Intelligence System - Phase 3A
 * 
 * Analytics module for video feedback by demographics:
 * 1. Identify top performing videos per demographic
 * 2. Find low-performing videos that need replacement
 * 3. Detect content gaps (high demand, low supply techniques)
 * 
 * Note: Demographic pattern tracking happens in server/ranking/pattern-tracker.ts
 * This module provides analytics queries on top of that data
 */

import { db } from './db';
import { sql } from 'drizzle-orm';

/**
 * Get top performing videos for a specific demographic
 */
export async function getTopVideosForDemographic(
  beltLevel: string,
  bodyType?: string,
  trainingStyle?: string,
  limit: number = 10
) {
  try {
    const results = await db.execute(sql`
      SELECT 
        vsp.video_id,
        vsp.success_rate,
        vsp.helpful_count,
        vsp.total_views,
        avk.technique_name,
        avk.instructor_name,
        avk.video_url
      FROM video_success_patterns vsp
      INNER JOIN videos avk ON vsp.video_id = avk.id
      WHERE 
        vsp.belt_level = ${beltLevel}
        ${bodyType ? sql`AND vsp.body_type = ${bodyType}` : sql``}
        ${trainingStyle ? sql`AND vsp.training_style = ${trainingStyle}` : sql``}
        AND vsp.total_views >= 3
      ORDER BY vsp.success_rate DESC, vsp.total_views DESC
      LIMIT ${limit}
    `);
    
    return results.rows;
  } catch (error) {
    console.error('[VIDEO INTELLIGENCE] Error fetching top videos:', error);
    return [];
  }
}

/**
 * Identify videos with low success rates that need replacement
 */
export async function identifyLowPerformingVideos(
  minVotes: number = 5,
  maxSuccessRate: number = 40
) {
  try {
    const results = await db.execute(sql`
      SELECT 
        avk.id,
        avk.technique_name,
        avk.instructor_name,
        avk.helpful_ratio,
        avk.helpful_count,
        avk.not_helpful_count,
        avk.total_votes,
        STRING_AGG(
          DISTINCT CONCAT(vsp.belt_level, ': ', vsp.success_rate, '%'), 
          ', '
        ) as demographic_breakdown
      FROM ai_video_knowledge avk
      LEFT JOIN video_success_patterns vsp ON avk.id = vsp.video_id
      WHERE 
        avk.total_votes >= ${minVotes}
        AND avk.helpful_ratio < ${maxSuccessRate / 100}
      GROUP BY avk.id, avk.technique_name, avk.instructor_name, 
               avk.helpful_ratio, avk.helpful_count, avk.not_helpful_count, avk.total_votes
      ORDER BY avk.total_votes DESC, avk.helpful_ratio ASC
      LIMIT 50
    `);
    
    return results.rows;
  } catch (error) {
    console.error('[VIDEO INTELLIGENCE] Error identifying low performing videos:', error);
    return [];
  }
}

/**
 * Gap Detection: Find techniques with high demand but low supply
 * Analyzes user queries vs available helpful videos
 */
export async function detectContentGaps() {
  try {
    const results = await db.execute(sql`
      WITH technique_demand AS (
        SELECT 
          technique_searched as technique,
          COUNT(*) as search_count,
          COUNT(CASE WHEN helpful = true THEN 1 END) as helpful_results
        FROM user_video_feedback
        WHERE technique_searched IS NOT NULL
        GROUP BY technique_searched
        HAVING COUNT(*) >= 3
      ),
      technique_supply AS (
        SELECT 
          technique_name as technique,
          COUNT(*) as available_videos,
          AVG(helpful_ratio::numeric) as avg_success_rate
        FROM ai_video_knowledge
        WHERE quality_tier NOT IN ('removed', 'flagged')
        GROUP BY technique_name
      ),
      combined_data AS (
        SELECT 
          COALESCE(td.technique, ts.technique) as technique,
          COALESCE(td.search_count, 0) as searches,
          COALESCE(td.helpful_results, 0) as helpful_results,
          COALESCE(ts.available_videos, 0) as available_videos,
          COALESCE(ts.avg_success_rate, 0) as avg_success_rate,
          CASE 
            WHEN td.search_count > 0 AND td.search_count IS NOT NULL
            THEN ROUND((COALESCE(td.helpful_results, 0)::numeric / td.search_count::numeric) * 100, 1)
            ELSE 0 
          END as satisfaction_rate
        FROM technique_demand td
        FULL OUTER JOIN technique_supply ts ON LOWER(td.technique) = LOWER(ts.technique)
      )
      SELECT * FROM combined_data
      WHERE 
        (searches >= 5 AND available_videos < 3)
        OR (searches >= 10 AND satisfaction_rate < 50)
      ORDER BY searches DESC
      LIMIT 30
    `);
    
    return results.rows.map((row: any) => ({
      technique: row.technique,
      demand: {
        searches: parseInt(row.searches),
        helpfulResults: parseInt(row.helpful_results),
        satisfactionRate: parseFloat(row.satisfaction_rate)
      },
      supply: {
        availableVideos: parseInt(row.available_videos),
        avgSuccessRate: parseFloat(row.avg_success_rate)
      },
      gapSeverity: calculateGapSeverity(
        parseInt(row.searches),
        parseInt(row.available_videos),
        parseFloat(row.satisfaction_rate)
      )
    }));
  } catch (error) {
    console.error('[VIDEO INTELLIGENCE] Error detecting content gaps:', error);
    return [];
  }
}

/**
 * Calculate gap severity score (0-100)
 * Higher = more urgent need for content
 */
function calculateGapSeverity(
  searches: number,
  availableVideos: number,
  satisfactionRate: number
): number {
  // High demand, low supply, low satisfaction = high severity
  const demandScore = Math.min(searches / 20, 1) * 40; // Max 40 points
  const supplyScore = Math.max(0, 1 - (availableVideos / 5)) * 30; // Max 30 points
  const satisfactionScore = Math.max(0, 1 - (satisfactionRate / 100)) * 30; // Max 30 points
  
  return Math.round(demandScore + supplyScore + satisfactionScore);
}

/**
 * Get demographic performance breakdown for a specific video
 */
export async function getVideoDemographicBreakdown(videoId: number) {
  try {
    const results = await db.execute(sql`
      SELECT 
        belt_level,
        body_type,
        training_style,
        success_rate,
        helpful_count,
        total_views
      FROM video_success_patterns
      WHERE video_id = ${videoId}
      ORDER BY total_views DESC
    `);
    
    return results.rows;
  } catch (error) {
    console.error('[VIDEO INTELLIGENCE] Error fetching demographic breakdown:', error);
    return [];
  }
}
