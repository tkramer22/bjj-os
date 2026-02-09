import { db } from '../db';
import { videos, aiVideoKnowledge } from '../../shared/schema';
import { eq, sql, and, or, isNull } from 'drizzle-orm';

const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES_MS = 2000;
const DELAY_BETWEEN_REQUESTS_MS = 100;

async function checkVideoAvailability(youtubeId: string): Promise<boolean> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });
    return response.status === 200;
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      console.log(`  ⏱️  Timeout for ${youtubeId} - treating as alive (network issue)`);
      return true;
    }
    console.log(`  ⚠️  Network error for ${youtubeId}: ${error?.message} - treating as alive`);
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 DEAD VIDEO CHECKER - Finding unavailable YouTube videos');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('⚠️  NO VIDEOS WILL BE DELETED. Only status will be updated.');
  console.log('');

  const allVideos = await db.select({
    id: videos.id,
    videoId: videos.videoId,
    title: videos.title,
    channel: videos.channel,
    status: videos.status,
  })
    .from(videos)
    .where(
      or(
        isNull(videos.status),
        eq(videos.status, 'active')
      )
    );

  console.log(`📊 Total videos to check: ${allVideos.length}`);
  console.log('');

  const deadVideos: { id: string; videoId: string; title: string; channel: string; reason: string }[] = [];
  const nullIdVideos: { id: string; title: string; channel: string }[] = [];
  let checkedCount = 0;

  for (const video of allVideos) {
    if (!video.videoId || video.videoId.trim() === '') {
      nullIdVideos.push({ id: video.id, title: video.title, channel: video.channel });
      continue;
    }
  }

  if (nullIdVideos.length > 0) {
    console.log(`⚠️  Found ${nullIdVideos.length} videos with NULL/empty youtube_id:`);
    for (const v of nullIdVideos) {
      console.log(`   - [${v.id}] "${v.title}" by ${v.channel}`);
    }
    console.log('');

    for (const v of nullIdVideos) {
      await db.update(videos)
        .set({ status: 'unavailable' })
        .where(eq(videos.id, v.id));
    }
    console.log(`✅ Marked ${nullIdVideos.length} NULL-ID videos as unavailable`);
    console.log('');
  }

  const videosToCheck = allVideos.filter(v => v.videoId && v.videoId.trim() !== '');
  console.log(`🔍 Checking ${videosToCheck.length} videos via YouTube oEmbed...`);
  console.log('');

  const totalBatches = Math.ceil(videosToCheck.length / BATCH_SIZE);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * BATCH_SIZE;
    const batch = videosToCheck.slice(batchStart, batchStart + BATCH_SIZE);

    process.stdout.write(`  Batch ${batchIdx + 1}/${totalBatches} (videos ${batchStart + 1}-${batchStart + batch.length})... `);

    let batchDead = 0;
    for (const video of batch) {
      const isAlive = await checkVideoAvailability(video.videoId);
      checkedCount++;

      if (!isAlive) {
        batchDead++;
        deadVideos.push({
          id: video.id,
          videoId: video.videoId,
          title: video.title,
          channel: video.channel,
          reason: 'YouTube returned 401/403/404'
        });

        await db.update(videos)
          .set({ status: 'unavailable' })
          .where(eq(videos.id, video.id));

        await db.update(aiVideoKnowledge)
          .set({ status: 'unavailable' })
          .where(eq(aiVideoKnowledge.youtubeId, video.videoId));
      }

      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }

    console.log(`${batchDead > 0 ? `💀 ${batchDead} dead` : '✅ all alive'} (${checkedCount}/${videosToCheck.length} total)`);

    if (batchIdx < totalBatches - 1) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total videos checked: ${checkedCount + nullIdVideos.length}`);
  console.log(`  Videos with NULL/empty ID: ${nullIdVideos.length}`);
  console.log(`  Dead videos (YouTube unavailable): ${deadVideos.length}`);
  console.log(`  Total marked unavailable: ${deadVideos.length + nullIdVideos.length}`);
  console.log(`  ⚠️  ZERO videos deleted from database`);
  console.log('');

  if (deadVideos.length > 0) {
    console.log('💀 DEAD VIDEOS:');
    for (const v of deadVideos) {
      console.log(`  - "${v.title}" by ${v.channel} [${v.videoId}] - ${v.reason}`);
    }
  }

  const activeCount = await db.select({ count: sql<number>`COUNT(*)` })
    .from(videos)
    .where(eq(videos.status, 'active'));
  const unavailableCount = await db.select({ count: sql<number>`COUNT(*)` })
    .from(videos)
    .where(eq(videos.status, 'unavailable'));
  const activeAICount = await db.select({ count: sql<number>`COUNT(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'active'));
  const unavailableAICount = await db.select({ count: sql<number>`COUNT(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'unavailable'));

  console.log('');
  console.log('📊 DATABASE STATUS:');
  console.log(`  videos table:            ${activeCount[0]?.count || 0} active, ${unavailableCount[0]?.count || 0} unavailable`);
  console.log(`  ai_video_knowledge table: ${activeAICount[0]?.count || 0} active, ${unavailableAICount[0]?.count || 0} unavailable`);
  console.log('');
  console.log('✅ Dead video check complete. No videos were deleted.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
