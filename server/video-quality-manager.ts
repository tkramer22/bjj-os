// Automated Video Quality Management
// Runs daily to manage video quality based on user feedback

import { db } from "./db";
import { aiVideoKnowledge } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function manageVideoQuality() {
  console.log('Starting video quality management...');
  
  try {
    // Get all videos with enough votes (50+) and their feedback breakdown
    const videosResult = await db.execute(sql`
      SELECT 
        v.id,
        v.title,
        v.total_votes,
        v.helpful_ratio,
        v.quality_score,
        v.belt_level,
        COUNT(*) FILTER (WHERE f.feedback_category = 'video_quality_poor') as quality_issues,
        COUNT(*) FILTER (WHERE f.feedback_category = 'wrong_recommendation') as context_issues,
        COUNT(*) FILTER (WHERE f.feedback_category = 'too_advanced') as too_advanced_count,
        COUNT(*) FILTER (WHERE f.feedback_category = 'too_basic') as too_basic_count
      FROM ai_video_knowledge v
      LEFT JOIN user_video_feedback f ON v.id = f.video_id
      WHERE v.total_votes >= 50 AND v.quality_tier != 'removed'
      GROUP BY v.id
    `);

    // Handle both Neon (result.rows) and postgres-js (result is array) formats
    const videos = Array.isArray(videosResult) ? videosResult : (videosResult as any).rows || [];
    let removedCount = 0;
    let flaggedCount = 0;
    let promotedCount = 0;
    let adjustedCount = 0;

    for (const video of videos) {
      const videoData = video as any;
      const totalVotes = parseInt(videoData.total_votes || '0');
      
      const qualityIssueRatio = totalVotes > 0 
        ? parseInt(videoData.quality_issues || '0') / totalVotes
        : 0;
      
      const tooAdvancedRatio = totalVotes > 0
        ? parseInt(videoData.too_advanced_count || '0') / totalVotes
        : 0;
      
      const helpfulRatio = parseFloat(videoData.helpful_ratio || '0');
      const qualityIssues = parseInt(videoData.quality_issues || '0');
      const contextIssues = parseInt(videoData.context_issues || '0');

      // REMOVE if video quality issues > 25%
      if (qualityIssueRatio > 0.25) {
        await db.execute(sql`
          UPDATE videos 
          SET quality_tier = 'removed'
          WHERE id = ${videoData.id}
        `);
        
        console.log(`❌ Removed video: "${videoData.title}" (${Math.round(qualityIssueRatio * 100)}% quality issues)`);
        removedCount++;
        continue;
      }

      // REMOVE if overall <40% helpful AND most complaints are quality
      if (helpfulRatio < 0.40 && qualityIssues > contextIssues) {
        await db.execute(sql`
          UPDATE videos 
          SET quality_tier = 'removed'
          WHERE id = ${videoData.id}
        `);
        
        console.log(`❌ Removed video: "${videoData.title}" (low helpful ratio ${Math.round(helpfulRatio * 100)}% + quality complaints)`);
        removedCount++;
        continue;
      }

      // FLAG for review if <50% helpful but context issues (not quality)
      if (helpfulRatio < 0.50 && contextIssues > qualityIssues) {
        await db.execute(sql`
          UPDATE videos 
          SET quality_tier = 'flagged'
          WHERE id = ${videoData.id}
        `);
        
        console.log(`⚠️  Flagged video: "${videoData.title}" (${Math.round(helpfulRatio * 100)}% helpful, context issues not video quality)`);
        flaggedCount++;
        continue;
      }

      // ADJUST targeting if >40% "too advanced"
      if (tooAdvancedRatio > 0.40) {
        await db.execute(sql`
          UPDATE videos 
          SET belt_level = ARRAY['purple', 'brown', 'black']::text[]
          WHERE id = ${videoData.id}
        `);
        
        console.log(`🎯 Adjusted targeting: "${videoData.title}" (${Math.round(tooAdvancedRatio * 100)}% too advanced - now purple+ only)`);
        adjustedCount++;
      }

      // PROMOTE if >85% helpful and 100+ votes
      if (totalVotes >= 100 && helpfulRatio >= 0.85) {
        await db.execute(sql`
          UPDATE videos 
          SET quality_tier = 'top_tier'
          WHERE id = ${videoData.id}
        `);
        
        console.log(`⭐ Promoted to top tier: "${videoData.title}" (${Math.round(helpfulRatio * 100)}% helpful, ${totalVotes} votes)`);
        promotedCount++;
      }
    }

    console.log('\n✅ Video quality management complete:');
    console.log(`   - Videos removed: ${removedCount}`);
    console.log(`   - Videos flagged: ${flaggedCount}`);
    console.log(`   - Videos promoted: ${promotedCount}`);
    console.log(`   - Targeting adjusted: ${adjustedCount}`);
    
    return {
      success: true,
      removed: removedCount,
      flagged: flaggedCount,
      promoted: promotedCount,
      adjusted: adjustedCount,
    };
  } catch (error) {
    console.error('❌ Video quality management error:', error);
    throw error;
  }
}
