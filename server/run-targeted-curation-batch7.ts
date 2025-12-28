/**
 * TARGETED INSTRUCTOR CURATION SCRIPT - BATCH 7
 * Remaining instructors: Garry Tonon, Rafael Mendes, Nicholas Meregali, 
 * Romulo Barral, Ffion Davies, Robert Degle, Mikey Musumeci
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
    name: "Garry Tonon",
    searchQueries: [
      "Garry Tonon technique",
      "Garry Tonon instructional",
      "Garry Tonon leg lock",
      "Garry Tonon heel hook",
      "Garry Tonon submission grappling",
      "Gary Tonon BJJ"
    ]
  },
  {
    name: "Rafael Mendes",
    searchQueries: [
      "Rafael Mendes technique",
      "Rafael Mendes instructional",
      "Rafael Mendes berimbolo",
      "Rafael Mendes guard",
      "Rafa Mendes BJJ",
      "Art of Jiu Jitsu Mendes"
    ]
  },
  {
    name: "Nicholas Meregali",
    searchQueries: [
      "Nicholas Meregali technique",
      "Nicholas Meregali instructional",
      "Nicholas Meregali guard pass",
      "Meregali BJJ tutorial",
      "Nick Meregali grappling"
    ]
  },
  {
    name: "Romulo Barral",
    searchQueries: [
      "Romulo Barral technique",
      "Romulo Barral instructional",
      "Romulo Barral spider guard",
      "Romulo Barral sweep",
      "Romulo Barral BJJ"
    ]
  },
  {
    name: "Ffion Davies",
    searchQueries: [
      "Ffion Davies technique",
      "Ffion Davies instructional",
      "Ffion Davies BJJ",
      "Ffion Davies guard",
      "Ffion Davies grappling"
    ]
  },
  {
    name: "Robert Degle",
    searchQueries: [
      "Robert Degle technique",
      "Robert Degle instructional",
      "Robert Degle wrestling",
      "Robert Degle takedown",
      "Robert Degle BJJ"
    ]
  },
  {
    name: "Mikey Musumeci",
    searchQueries: [
      "Mikey Musumeci technique",
      "Mikey Musumeci instructional",
      "Mikey Musumeci guard",
      "Mikey Musumeci sweep",
      "Musumeci BJJ tutorial"
    ]
  }
];

async function runBatch7Curation() {
  console.log('\n' + '═'.repeat(70));
  console.log('🎯 TARGETED INSTRUCTOR CURATION - BATCH 7');
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
  console.log('📊 BATCH 7 COMPLETE - SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Before: ${startingVideos} | After: ${endingVideos} | Added: ${endingVideos - startingVideos}`);
  
  for (const r of results) {
    console.log(`  ${r.added > 0 ? '✅' : '⏭️'} ${r.instructor}: ${r.before} → ${r.after} (+${r.added})`);
  }
  console.log('═'.repeat(70) + '\n');

  return { startingVideos, endingVideos, results };
}

runBatch7Curation()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
