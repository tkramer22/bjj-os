/**
 * TARGETED INSTRUCTOR CURATION SCRIPT
 * Run targeted curation for instructors with low video counts
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
    name: "Craig Jones",
    searchQueries: [
      "Craig Jones jiu jitsu technique",
      "Craig Jones BJJ instructional",
      "Craig Jones heel hook",
      "Craig Jones leg lock",
      "Craig Jones tutorial"
    ]
  },
  {
    name: "Keenan Cornelius",
    searchQueries: [
      "Keenan Cornelius jiu jitsu technique",
      "Keenan Cornelius BJJ instructional",
      "Keenan Cornelius guard",
      "Keenan Cornelius worm guard",
      "Keenan Cornelius tutorial"
    ]
  },
  {
    name: "Jordan Teaches Jiujitsu",
    searchQueries: [
      "Jordan Teaches Jiujitsu technique",
      "Jordan Teaches Jiujitsu instructional",
      "Jordan Teaches Jiujitsu guard pass",
      "Jordan Teaches Jiujitsu submission",
      "Jordan Teaches Jiujitsu tutorial"
    ]
  },
  {
    name: "Cobrinha",
    searchQueries: [
      "Cobrinha jiu jitsu technique",
      "Cobrinha BJJ instructional",
      "Cobrinha guard",
      "Cobrinha berimbolo",
      "Cobrinha tutorial"
    ]
  },
  {
    name: "Leandro Lo",
    searchQueries: [
      "Leandro Lo jiu jitsu technique",
      "Leandro Lo BJJ instructional",
      "Leandro Lo guard pass",
      "Leandro Lo spider guard",
      "Leandro Lo tutorial"
    ]
  },
  {
    name: "Gui Mendes",
    searchQueries: [
      "Gui Mendes jiu jitsu technique",
      "Gui Mendes BJJ instructional",
      "Gui Mendes berimbolo",
      "Gui Mendes guard",
      "Gui Mendes tutorial"
    ]
  },
  {
    name: "Eduardo Telles",
    searchQueries: [
      "Eduardo Telles jiu jitsu technique",
      "Eduardo Telles BJJ instructional",
      "Eduardo Telles turtle guard",
      "Eduardo Telles octopus guard",
      "Eduardo Telles tutorial"
    ]
  },
  {
    name: "Ethan Crelinsten",
    searchQueries: [
      "Ethan Crelinsten jiu jitsu technique",
      "Ethan Crelinsten BJJ instructional",
      "Ethan Crelinsten leg lock",
      "Ethan Crelinsten submission",
      "Ethan Crelinsten tutorial"
    ]
  },
  {
    name: "Draculino",
    searchQueries: [
      "Draculino jiu jitsu technique",
      "Draculino BJJ instructional",
      "Draculino guard pass",
      "Draculino fundamentals",
      "Draculino tutorial"
    ]
  },
  {
    name: "Kaynan Duarte",
    searchQueries: [
      "Kaynan Duarte jiu jitsu technique",
      "Kaynan Duarte BJJ instructional",
      "Kaynan Duarte guard pass",
      "Kaynan Duarte submission",
      "Kaynan Duarte tutorial"
    ]
  },
  {
    name: "Lucas Leite",
    searchQueries: [
      "Lucas Leite jiu jitsu technique",
      "Lucas Leite BJJ instructional",
      "Lucas Leite half guard",
      "Lucas Leite coyote guard",
      "Lucas Leite tutorial"
    ]
  }
];

async function runAllTargetedCuration() {
  console.log('\n' + '═'.repeat(70));
  console.log('🎯 TARGETED INSTRUCTOR CURATION - BATCH RUN');
  console.log('═'.repeat(70));
  console.log(`Instructors to curate: ${INSTRUCTORS_TO_TARGET.length}`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('═'.repeat(70) + '\n');

  // Get starting total
  const startTotal = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge);
  const startingVideos = Number(startTotal[0]?.count || 0);
  console.log(`📊 Starting library size: ${startingVideos} videos\n`);

  const results: {
    instructor: string;
    before: number;
    after: number;
    added: number;
    techniques: string[];
  }[] = [];

  for (const instructor of INSTRUCTORS_TO_TARGET) {
    try {
      const result = await runTargetedInstructorCuration(
        instructor.name,
        instructor.searchQueries,
        7.0,  // minQuality
        120   // minDuration (2 minutes)
      );

      results.push({
        instructor: instructor.name,
        before: result.totalBefore,
        after: result.totalAfter,
        added: result.videosAdded,
        techniques: result.techniquesCovered
      });

      console.log(`\n⏳ Waiting 2 seconds before next instructor...\n`);
      await new Promise(r => setTimeout(r, 2000));

    } catch (error: any) {
      console.error(`❌ Error curating ${instructor.name}:`, error.message);
      results.push({
        instructor: instructor.name,
        before: 0,
        after: 0,
        added: 0,
        techniques: []
      });
    }
  }

  // Get final total
  const endTotal = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge);
  const endingVideos = Number(endTotal[0]?.count || 0);

  // Print summary
  console.log('\n' + '═'.repeat(70));
  console.log('📊 TARGETED CURATION COMPLETE - SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Completed: ${new Date().toISOString()}`);
  console.log(`\nLIBRARY TOTALS:`);
  console.log(`  Before: ${startingVideos} videos`);
  console.log(`  After:  ${endingVideos} videos`);
  console.log(`  Added:  ${endingVideos - startingVideos} new videos`);
  console.log(`\nBREAKDOWN BY INSTRUCTOR:`);
  
  for (const r of results) {
    const status = r.added > 0 ? '✅' : '⏭️';
    console.log(`  ${status} ${r.instructor}: ${r.before} → ${r.after} (+${r.added})`);
    if (r.techniques.length > 0) {
      console.log(`     Techniques: ${r.techniques.slice(0, 5).join(', ')}${r.techniques.length > 5 ? '...' : ''}`);
    }
  }

  const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
  console.log(`\n🎯 TOTAL NEW VIDEOS ADDED: ${totalAdded}`);
  console.log('═'.repeat(70) + '\n');

  return {
    startingVideos,
    endingVideos,
    totalAdded,
    results
  };
}

// Run if executed directly
runAllTargetedCuration()
  .then(result => {
    console.log('✅ Targeted curation completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Targeted curation failed:', error);
    process.exit(1);
  });
