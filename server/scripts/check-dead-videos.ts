import { db } from '../db';
import { aiVideoKnowledge } from '../../shared/schema';
import { eq, sql, and, or, isNull } from 'drizzle-orm';

const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES_MS = 1000;

async function checkVideoAvailability(youtubeId: string): Promise<boolean> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response.status === 200;
  } catch {
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('DEAD VIDEO CHECKER - Finding unavailable YouTube videos');
  console.log('═══════════════════════════════════════════════════════════════');

  const allVideos = await db.select({
    id: aiVideoKnowledge.id,
    youtubeId: aiVideoKnowledge.youtubeId,
    title: aiVideoKnowledge.title,
    instructorName: aiVideoKnowledge.instructorName,
    status: aiVideoKnowledge.status,
  })
    .from(aiVideoKnowledge)
    .where(
      or(
        isNull(aiVideoKnowledge.status),
        eq(aiVideoKnowledge.status, 'active')
      )
    );

  console.log(`Total active videos: ${allVideos.length}`);

  const nullIdVideos = allVideos.filter(v => !v.youtubeId || v.youtubeId.trim() === '');
  const videosToCheck = allVideos.filter(v => v.youtubeId && v.youtubeId.trim() !== '');

  if (nullIdVideos.length > 0) {
    console.log(`Marking ${nullIdVideos.length} NULL-ID videos as unavailable...`);
    for (const v of nullIdVideos) {
      await db.update(aiVideoKnowledge)
        .set({ status: 'unavailable' })
        .where(eq(aiVideoKnowledge.id, v.id));
    }
    console.log(`Done marking NULL-ID videos.`);
  }

  console.log(`Checking ${videosToCheck.length} videos via YouTube oEmbed (parallel batches of ${BATCH_SIZE})...`);

  const deadVideos: { id: number; youtubeId: string; title: string; instructor: string }[] = [];
  let checkedCount = 0;
  const totalBatches = Math.ceil(videosToCheck.length / BATCH_SIZE);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * BATCH_SIZE;
    const batch = videosToCheck.slice(batchStart, batchStart + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (video) => {
        const isAlive = await checkVideoAvailability(video.youtubeId!);
        return { video, isAlive };
      })
    );

    let batchDead = 0;
    for (const { video, isAlive } of results) {
      if (!isAlive) {
        batchDead++;
        deadVideos.push({
          id: video.id,
          youtubeId: video.youtubeId!,
          title: video.title,
          instructor: video.instructorName || 'Unknown',
        });
        await db.update(aiVideoKnowledge)
          .set({ status: 'unavailable' })
          .where(eq(aiVideoKnowledge.id, video.id));
      }
    }

    checkedCount += batch.length;
    const pct = ((checkedCount / videosToCheck.length) * 100).toFixed(1);
    console.log(`Batch ${batchIdx + 1}/${totalBatches}: ${batchDead > 0 ? batchDead + ' dead' : 'all alive'} (${checkedCount}/${videosToCheck.length} = ${pct}%)`);

    if (batchIdx < totalBatches - 1) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log('');
  console.log('RESULTS');
  console.log(`Total checked: ${checkedCount + nullIdVideos.length}`);
  console.log(`NULL/empty youtube_id: ${nullIdVideos.length}`);
  console.log(`Dead (YouTube unavailable): ${deadVideos.length}`);
  console.log(`Total marked unavailable: ${deadVideos.length + nullIdVideos.length}`);
  console.log(`ZERO videos deleted`);

  if (deadVideos.length > 0) {
    console.log('');
    console.log('DEAD VIDEOS:');
    for (const v of deadVideos) {
      console.log(`  - "${v.title}" by ${v.instructor} [${v.youtubeId}]`);
    }
  }

  const activeCount = await db.select({ count: sql<number>`COUNT(*)` }).from(aiVideoKnowledge).where(eq(aiVideoKnowledge.status, 'active'));
  const unavailableCount = await db.select({ count: sql<number>`COUNT(*)` }).from(aiVideoKnowledge).where(eq(aiVideoKnowledge.status, 'unavailable'));

  console.log('');
  console.log('DATABASE STATUS:');
  console.log(`  Active: ${activeCount[0]?.count || 0}`);
  console.log(`  Unavailable: ${unavailableCount[0]?.count || 0}`);
  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
