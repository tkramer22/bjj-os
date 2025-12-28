/**
 * TARGETED INSTRUCTOR CURATION SCRIPT - BATCH 2
 * Continue with remaining instructors
 */

import { runTargetedInstructorCuration } from './targeted-instructor-curation';
import { db } from './db';
import { aiVideoKnowledge } from '@shared/schema';
import { sql } from 'drizzle-orm';

interface InstructorTarget {
  name: string;
  searchQueries: string[];
}

const INSTRUCTORS_TO_TARGET: InstructorTarget[] = [
  {
    name: "Cobrinha",
    searchQueries: [
      "Cobrinha jiu jitsu technique",
      "Cobrinha BJJ instructional",
      "Cobrinha berimbolo",
      "Cobrinha x guard"
    ]
  },
  {
    name: "Leandro Lo",
    searchQueries: [
      "Leandro Lo jiu jitsu technique",
      "Leandro Lo BJJ instructional",
      "Leandro Lo guard pass",
      "Leandro Lo spider guard"
    ]
  },
  {
    name: "Gui Mendes",
    searchQueries: [
      "Gui Mendes jiu jitsu technique",
      "Gui Mendes BJJ instructional",
      "Gui Mendes berimbolo"
    ]
  },
  {
    name: "Eduardo Telles",
    searchQueries: [
      "Eduardo Telles jiu jitsu technique",
      "Eduardo Telles turtle guard",
      "Eduardo Telles octopus guard"
    ]
  },
  {
    name: "Ethan Crelinsten",
    searchQueries: [
      "Ethan Crelinsten jiu jitsu technique",
      "Ethan Crelinsten leg lock",
      "Ethan Crelinsten submission"
    ]
  },
  {
    name: "Draculino",
    searchQueries: [
      "Draculino jiu jitsu technique",
      "Draculino BJJ fundamentals",
      "Draculino guard pass"
    ]
  },
  {
    name: "Kaynan Duarte",
    searchQueries: [
      "Kaynan Duarte jiu jitsu technique",
      "Kaynan Duarte guard pass",
      "Kaynan Duarte pressure passing"
    ]
  },
  {
    name: "Lucas Leite",
    searchQueries: [
      "Lucas Leite jiu jitsu technique",
      "Lucas Leite half guard",
      "Lucas Leite coyote guard"
    ]
  }
];

async function runBatch2Curation() {
  console.log('\n' + '═'.repeat(70));
  console.log('🎯 TARGETED INSTRUCTOR CURATION - BATCH 2');
  console.log('═'.repeat(70));
  console.log(`Instructors to curate: ${INSTRUCTORS_TO_TARGET.length}`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('═'.repeat(70) + '\n');

  const startTotal = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge);
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
    .from(aiVideoKnowledge);
  const endingVideos = Number(endTotal[0]?.count || 0);

  console.log('\n' + '═'.repeat(70));
  console.log('📊 BATCH 2 COMPLETE - SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Before: ${startingVideos} | After: ${endingVideos} | Added: ${endingVideos - startingVideos}`);
  
  for (const r of results) {
    console.log(`  ${r.added > 0 ? '✅' : '⏭️'} ${r.instructor}: ${r.before} → ${r.after} (+${r.added})`);
  }
  console.log('═'.repeat(70) + '\n');

  return { startingVideos, endingVideos, results };
}

runBatch2Curation()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
