/**
 * SYSTEMATIC INSTRUCTOR CURATION
 * Mine existing instructors with < 20 videos before adding new ones
 * 5-query pattern per instructor
 */

import { runTargetedInstructorCuration } from './targeted-instructor-curation';
import { db } from './db';
import { aiVideoKnowledge } from '@shared/schema';
import { sql, asc } from 'drizzle-orm';

interface InstructorToMine {
  name: string;
  currentCount: number;
}

// Priority instructors to mine (elite instructors with low counts)
const PRIORITY_INSTRUCTORS: string[] = [
  "Romulo Barral",
  "Xande Ribeiro",
  "Demian Maia",
  "Buchecha",
  "Rickson Gracie",
  "Mica Galvao",
  "Caio Terra",
  "Garry Tonon",
  "Tainan Dalpra",
  "Mikey Musumeci",
  "Lucas Lepri",
  "Dean Lister",
  "Victor Hugo",
  "Rodolfo Vieira",
  "Gianni Grippo",
  "Rafael Lovato Jr.",
  "Paul Schreiner",
  "Matheus Diniz",
  "JT Torres"
];

function generateSearchQueries(instructorName: string): string[] {
  const baseName = instructorName.replace(/['"]/g, '');
  return [
    `${baseName} technique`,
    `${baseName} instructional`,
    `${baseName} BJJ tutorial`,
    `${baseName} guard`,
    `${baseName} submission`
  ];
}

async function runSystematicCuration() {
  console.log('\n' + '═'.repeat(70));
  console.log('🎯 SYSTEMATIC INSTRUCTOR CURATION');
  console.log('Mining existing instructors before expanding');
  console.log('═'.repeat(70));
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('═'.repeat(70) + '\n');

  // Get current counts for priority instructors
  const instructorsToMine: InstructorToMine[] = [];
  
  for (const name of PRIORITY_INSTRUCTORS) {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(aiVideoKnowledge)
      .where(sql`instructor_name ILIKE ${`%${name}%`}`);
    
    const count = Number(result[0]?.count || 0);
    if (count < 30) {
      instructorsToMine.push({ name, currentCount: count });
    }
  }

  // Sort by count ascending (mine lowest first)
  instructorsToMine.sort((a, b) => a.currentCount - b.currentCount);

  console.log(`📊 Instructors to mine (< 30 videos):`);
  for (const inst of instructorsToMine) {
    console.log(`   ${inst.name}: ${inst.currentCount} videos`);
  }
  console.log('');

  const startTotal = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge);
  const startingVideos = Number(startTotal[0]?.count || 0);
  console.log(`📦 Starting library size: ${startingVideos} videos\n`);

  const results: {
    instructor: string;
    before: number;
    after: number;
    added: number;
  }[] = [];

  // Process first 10 instructors
  const batch = instructorsToMine.slice(0, 10);
  
  for (const instructor of batch) {
    try {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🎯 Mining: ${instructor.name} (current: ${instructor.currentCount})`);
      console.log('═'.repeat(60));

      const queries = generateSearchQueries(instructor.name);
      
      const result = await runTargetedInstructorCuration(
        instructor.name,
        queries,
        7.0,
        120
      );

      results.push({
        instructor: instructor.name,
        before: instructor.currentCount,
        after: result.totalAfter,
        added: result.videosAdded
      });

      // Wait between instructors
      await new Promise(r => setTimeout(r, 2000));

    } catch (error: any) {
      console.error(`❌ Error mining ${instructor.name}:`, error.message);
      results.push({
        instructor: instructor.name,
        before: instructor.currentCount,
        after: instructor.currentCount,
        added: 0
      });
    }
  }

  const endTotal = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge);
  const endingVideos = Number(endTotal[0]?.count || 0);

  console.log('\n' + '═'.repeat(70));
  console.log('📊 SYSTEMATIC CURATION COMPLETE');
  console.log('═'.repeat(70));
  console.log(`Library: ${startingVideos} → ${endingVideos} (+${endingVideos - startingVideos})`);
  console.log('');
  console.log('Results by instructor:');
  
  for (const r of results) {
    const emoji = r.added > 0 ? '✅' : '⏭️';
    console.log(`  ${emoji} ${r.instructor}: ${r.before} → ${r.after} (+${r.added})`);
  }
  console.log('═'.repeat(70) + '\n');

  return { startingVideos, endingVideos, results };
}

runSystematicCuration()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
