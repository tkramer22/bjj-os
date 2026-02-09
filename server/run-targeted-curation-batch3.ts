/**
 * TARGETED INSTRUCTOR CURATION SCRIPT - BATCH 3
 * Final batch: Gui Mendes, Eduardo Telles, Kaynan, Lucas Leite, Draculino
 */

import { runTargetedInstructorCuration } from './targeted-instructor-curation';
import { db } from './db';
import { aiVideoKnowledge } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';

interface InstructorTarget {
  name: string;
  searchQueries: string[];
}

const INSTRUCTORS_TO_TARGET: InstructorTarget[] = [
  {
    name: "Gui Mendes",
    searchQueries: [
      "Gui Mendes jiu jitsu technique",
      "Gui Mendes BJJ instructional",
      "Gui Mendes berimbolo",
      "Gui Mendes back take",
      "Guilherme Mendes BJJ"
    ]
  },
  {
    name: "Eduardo Telles",
    searchQueries: [
      "Eduardo Telles jiu jitsu technique",
      "Eduardo Telles turtle guard",
      "Eduardo Telles octopus guard",
      "Eduardo Telles sweep"
    ]
  },
  {
    name: "Kaynan Duarte",
    searchQueries: [
      "Kaynan Duarte jiu jitsu technique",
      "Kaynan Duarte guard pass",
      "Kaynan Duarte pressure passing",
      "Kaynan Duarte BJJ instructional"
    ]
  },
  {
    name: "Lucas Leite",
    searchQueries: [
      "Lucas Leite jiu jitsu technique",
      "Lucas Leite half guard",
      "Lucas Leite coyote guard",
      "Lucas Leite knee shield",
      "Lucas Leite BJJ instructional"
    ]
  },
  {
    name: "Draculino",
    searchQueries: [
      "Draculino jiu jitsu technique",
      "Draculino BJJ fundamentals",
      "Draculino guard pass",
      "Draculino sweep",
      "Vinicius Draculino"
    ]
  },
  {
    name: "Ethan Crelinsten",
    searchQueries: [
      "Ethan Crelinsten jiu jitsu technique",
      "Ethan Crelinsten leg lock",
      "Ethan Crelinsten submission",
      "Ethan Crelinsten heel hook"
    ]
  }
];

async function runBatch3Curation() {
  console.log('\n' + '═'.repeat(70));
  console.log('🎯 TARGETED INSTRUCTOR CURATION - BATCH 3 (FINAL)');
  console.log('═'.repeat(70));
  console.log(`Instructors to curate: ${INSTRUCTORS_TO_TARGET.length}`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('═'.repeat(70) + '\n');

  const startTotal = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'active'));
  const startingVideos = Number(startTotal[0]?.count || 0);
  console.log(`📊 Starting library size: ${startingVideos} videos\n`);

  const results: {
    instructor: string;
    before: number;
    after: number;
    added: number;
  }[] = [];

  for (const instructor of INSTRUCTORS_TO_TARGET) {
    try {
      const result = await runTargetedInstructorCuration(
        instructor.name,
        instructor.searchQueries,
        7.0,
        120
      );

      results.push({
        instructor: instructor.name,
        before: result.totalBefore,
        after: result.totalAfter,
        added: result.videosAdded
      });

      await new Promise(r => setTimeout(r, 1500));

    } catch (error: any) {
      console.error(`❌ Error curating ${instructor.name}:`, error.message);
      results.push({
        instructor: instructor.name,
        before: 0,
        after: 0,
        added: 0
      });
    }
  }

  const endTotal = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'active'));
  const endingVideos = Number(endTotal[0]?.count || 0);

  console.log('\n' + '═'.repeat(70));
  console.log('📊 BATCH 3 COMPLETE - FINAL SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Before: ${startingVideos} | After: ${endingVideos} | Added: ${endingVideos - startingVideos}`);
  
  for (const r of results) {
    console.log(`  ${r.added > 0 ? '✅' : '⏭️'} ${r.instructor}: ${r.before} → ${r.after} (+${r.added})`);
  }
  console.log('═'.repeat(70) + '\n');

  return { startingVideos, endingVideos, results };
}

runBatch3Curation()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
