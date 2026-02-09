import { db } from '../db';
import { aiVideoKnowledge } from '../../shared/schema';
import { eq, sql, and, or, isNull } from 'drizzle-orm';

const PARALLEL = 25;
const OFFSET = parseInt(process.argv[2] || '0');
const LIMIT = parseInt(process.argv[3] || '500');

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

async function main() {
  const allVideos = await db.select({
    id: aiVideoKnowledge.id,
    youtubeId: aiVideoKnowledge.youtubeId,
    title: aiVideoKnowledge.title,
    instructorName: aiVideoKnowledge.instructorName,
  })
    .from(aiVideoKnowledge)
    .where(and(
      eq(aiVideoKnowledge.status, 'active'),
      sql`${aiVideoKnowledge.youtubeId} IS NOT NULL AND ${aiVideoKnowledge.youtubeId} != ''`
    ))
    .orderBy(aiVideoKnowledge.id)
    .offset(OFFSET)
    .limit(LIMIT);

  console.log(`Checking videos ${OFFSET}-${OFFSET + allVideos.length} (${allVideos.length} videos)...`);

  const deadVideos: string[] = [];
  let checked = 0;
  const totalBatches = Math.ceil(allVideos.length / PARALLEL);

  for (let i = 0; i < totalBatches; i++) {
    const batch = allVideos.slice(i * PARALLEL, (i + 1) * PARALLEL);
    const results = await Promise.all(
      batch.map(async (v) => ({ v, alive: await checkVideoAvailability(v.youtubeId!) }))
    );
    for (const { v, alive } of results) {
      if (!alive) {
        deadVideos.push(`"${v.title}" by ${v.instructorName} [${v.youtubeId}]`);
        await db.update(aiVideoKnowledge).set({ status: 'unavailable' }).where(eq(aiVideoKnowledge.id, v.id));
      }
    }
    checked += batch.length;
    if (i % 5 === 0 || deadVideos.length > 0) {
      process.stdout.write(`  ${checked}/${allVideos.length}`);
      if (deadVideos.length > 0) process.stdout.write(` (${deadVideos.length} dead so far)`);
      process.stdout.write('\n');
    }
  }

  console.log(`Done: ${checked} checked, ${deadVideos.length} dead`);
  if (deadVideos.length > 0) {
    for (const d of deadVideos) console.log(`  DEAD: ${d}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
