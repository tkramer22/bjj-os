/**
 * TARGETED INSTRUCTOR CURATION SCRIPT - BATCH 6
 * High-value instructors: Marcelo Garcia, Andre Galvao, Mikey Musumeci, 
 * Ffion Davies, Romulo Barral, Rafael Mendes, Ryan Hall, Garry Tonon, 
 * Robert Degle, Nicholas Meregali
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
    name: "Marcelo Garcia",
    searchQueries: [
      "Marcelo Garcia technique",
      "Marcelo Garcia instructional",
      "Marcelo Garcia BJJ tutorial",
      "Marcelo Garcia x guard",
      "Marcelo Garcia guillotine"
    ]
  },
  {
    name: "Andre Galvao",
    searchQueries: [
      "Andre Galvao technique",
      "Andre Galvao instructional",
      "Andre Galvao BJJ tutorial",
      "Andre Galvao guard pass"
    ]
  },
  {
    name: "Mikey Musumeci",
    searchQueries: [
      "Mikey Musumeci technique",
      "Mikey Musumeci instructional",
      "Mikey Musumeci BJJ tutorial",
      "Mikey Musumeci leg lock"
    ]
  },
  {
    name: "Ffion Davies",
    searchQueries: [
      "Ffion Davies technique",
      "Ffion Davies instructional",
      "Ffion Davies BJJ tutorial",
      "Ffion Davies guard"
    ]
  },
  {
    name: "Romulo Barral",
    searchQueries: [
      "Romulo Barral technique",
      "Romulo Barral instructional",
      "Romulo Barral BJJ tutorial",
      "Romulo Barral spider guard"
    ]
  },
  {
    name: "Rafael Mendes",
    searchQueries: [
      "Rafael Mendes technique",
      "Rafael Mendes instructional",
      "Rafael Mendes BJJ tutorial",
      "Rafael Mendes berimbolo"
    ]
  },
  {
    name: "Ryan Hall",
    searchQueries: [
      "Ryan Hall technique",
      "Ryan Hall instructional",
      "Ryan Hall BJJ tutorial",
      "Ryan Hall 50/50"
    ]
  },
  {
    name: "Garry Tonon",
    searchQueries: [
      "Garry Tonon technique",
      "Garry Tonon instructional",
      "Garry Tonon BJJ tutorial",
      "Garry Tonon leg lock"
    ]
  },
  {
    name: "Robert Degle",
    searchQueries: [
      "Robert Degle technique",
      "Robert Degle instructional",
      "Robert Degle BJJ tutorial",
      "Robert Degle guard"
    ]
  },
  {
    name: "Nicholas Meregali",
    searchQueries: [
      "Nicholas Meregali technique",
      "Nicholas Meregali instructional",
      "Nicholas Meregali BJJ tutorial",
      "Nicholas Meregali guard pass"
    ]
  }
];

async function runBatch6Curation() {
  console.log('\n' + '═'.repeat(70));
  console.log('🎯 TARGETED INSTRUCTOR CURATION - BATCH 6');
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
  console.log('📊 BATCH 6 COMPLETE - SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Before: ${startingVideos} | After: ${endingVideos} | Added: ${endingVideos - startingVideos}`);
  
  for (const r of results) {
    console.log(`  ${r.added > 0 ? '✅' : '⏭️'} ${r.instructor}: ${r.before} → ${r.after} (+${r.added})`);
  }
  console.log('═'.repeat(70) + '\n');

  return { startingVideos, endingVideos, results };
}

runBatch6Curation()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
