import { db } from '../server/db';
import { aiVideoKnowledge, videoKnowledge } from '../shared/schema';
import { eq, isNull, exists, sql, inArray } from 'drizzle-orm';

async function cleanupUnscannedVideos() {
  console.log('Starting Gemini video cleanup...');
  
  // Find videos without Gemini data
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
    
    // Delete in batches of 50
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await db.delete(aiVideoKnowledge)
        .where(inArray(aiVideoKnowledge.id, batch));
      console.log(`Deleted batch of ${batch.length} videos`);
    }
  }
  
  console.log('Video cleanup complete');
  process.exit(0);
}

cleanupUnscannedVideos().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
