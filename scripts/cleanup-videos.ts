import { db } from '../server/db';
import { aiVideoKnowledge, videoKnowledge, videoWatchStatus, userVideoStats } from '../shared/schema';
import { inArray, sql } from 'drizzle-orm';

async function cleanupUnscannedVideos() {
  console.log('Starting Gemini video cleanup...');
  
  const unscannedVideos = await db.select({ id: aiVideoKnowledge.id })
    .from(aiVideoKnowledge)
    .where(
      sql`NOT EXISTS (
        SELECT 1 FROM ${videoKnowledge}
        WHERE ${videoKnowledge.videoId} = ${aiVideoKnowledge.id}
      )`
    );
  
  console.log(`Found ${unscannedVideos.length} videos without Gemini analysis`);
  
  if (unscannedVideos.length > 0) {
    const ids = unscannedVideos.map(v => v.id);
    
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      
      // Delete from ALL possible dependent tables
      try {
        await db.execute(sql`DELETE FROM video_watch_status WHERE video_id IN (${sql.join(batch, sql`, `)})`);
        await db.execute(sql`DELETE FROM video_engagement WHERE video_id IN (${sql.join(batch, sql`, `)})`);
        await db.execute(sql`DELETE FROM user_video_stats WHERE video_id IN (${sql.join(batch, sql`, `)})`);
        await db.execute(sql`DELETE FROM ai_video_knowledge WHERE id IN (${sql.join(batch, sql`, `)})`);
        console.log(`Deleted batch of ${batch.length} videos`);
      } catch (e) {
        console.error('Batch delete failed, skipping:', e.message);
      }
    }
  }
  
  console.log('Video cleanup complete');
  process.exit(0);
}

cleanupUnscannedVideos().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
