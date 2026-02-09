/**
 * ELITE INSTRUCTOR BATCH CURATION
 * Targeted curation for 16 specific elite instructors with 5 query patterns each
 * 
 * Rules:
 * - ONLY add videos from these instructors - reject all others
 * - Skip videos already in database (check by youtube_url)
 * - Add videos scoring 7.0+ quality
 * - Skip competition footage without instruction
 * - Skip podcasts/interviews
 * - Skip videos under 2 minutes
 */

import { runTargetedInstructorCuration } from './targeted-instructor-curation';
import { db } from './db';
import { aiVideoKnowledge } from '@shared/schema';
import { sql, ilike, or, eq, and } from 'drizzle-orm';

const ELITE_INSTRUCTORS = [
  "JT Torres",
  "Cobrinha",
  "Leandro Lo",
  "Gui Mendes",
  "Eduardo Telles",
  "Ethan Crelinsten",
  "Draculino",
  "Kaynan Duarte",
  "Lucas Leite",
  "Josh Barnett",
  "Josh Rich",
  "Roger Gracie",
  "Romulo Barral",
  "Rafael Mendes",
  "Rubens Charles",
  "Marcelo Garcia"
];

function generateQueries(instructorName: string): string[] {
  return [
    `${instructorName} jiu jitsu technique`,
    `${instructorName} BJJ instructional`,
    `${instructorName} guard pass`,
    `${instructorName} submission`,
    `${instructorName} tutorial`
  ];
}

interface InstructorReport {
  instructor: string;
  before: number;
  after: number;
  added: number;
  techniquesCovered: string[];
}

async function getInstructorCount(name: string): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(and(or(
      ilike(aiVideoKnowledge.instructorName, `%${name}%`),
      ilike(aiVideoKnowledge.instructorName, name)
    ), eq(aiVideoKnowledge.status, 'active')));
  return Number(result[0]?.count || 0);
}

async function getTotalLibraryCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.status, 'active'));
  return Number(result[0]?.count || 0);
}

export async function runEliteInstructorBatchCuration(): Promise<void> {
  const startTime = Date.now();
  
  console.log('\n' + '█'.repeat(70));
  console.log('█  ELITE INSTRUCTOR BATCH CURATION');
  console.log('█  ' + new Date().toISOString());
  console.log('█'.repeat(70));
  console.log(`\n📋 Instructors to process: ${ELITE_INSTRUCTORS.length}`);
  console.log(`🔍 Query patterns per instructor: 5`);
  console.log(`⚙️  Min quality: 7.0`);
  console.log(`⏱️  Min duration: 2 minutes`);
  
  const libraryBefore = await getTotalLibraryCount();
  console.log(`\n📚 LIBRARY BEFORE: ${libraryBefore} total videos\n`);
  
  const reports: InstructorReport[] = [];
  let totalNewVideos = 0;
  
  for (let i = 0; i < ELITE_INSTRUCTORS.length; i++) {
    const instructor = ELITE_INSTRUCTORS[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📍 [${i + 1}/${ELITE_INSTRUCTORS.length}] Processing: ${instructor}`);
    console.log(`${'─'.repeat(60)}`);
    
    const beforeCount = await getInstructorCount(instructor);
    console.log(`   Before: ${beforeCount} videos`);
    
    const queries = generateQueries(instructor);
    console.log(`   Queries: ${queries.length}`);
    
    try {
      const result = await runTargetedInstructorCuration(
        instructor,
        queries,
        7.0,
        120
      );
      
      const report: InstructorReport = {
        instructor,
        before: result.totalBefore,
        after: result.totalAfter,
        added: result.videosAdded,
        techniquesCovered: result.techniquesCovered
      };
      
      reports.push(report);
      totalNewVideos += result.videosAdded;
      
      console.log(`   ✅ Completed: +${result.videosAdded} new videos`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error: any) {
      console.error(`   ❌ Error processing ${instructor}: ${error.message}`);
      reports.push({
        instructor,
        before: beforeCount,
        after: beforeCount,
        added: 0,
        techniquesCovered: []
      });
    }
  }
  
  const libraryAfter = await getTotalLibraryCount();
  const duration = Math.floor((Date.now() - startTime) / 1000);
  
  console.log('\n' + '█'.repeat(70));
  console.log('█  FINAL REPORT');
  console.log('█'.repeat(70));
  
  console.log('\n📊 PER-INSTRUCTOR BREAKDOWN:');
  console.log('─'.repeat(60));
  console.log('Instructor'.padEnd(25) + 'Before'.padStart(8) + 'After'.padStart(8) + 'Added'.padStart(8));
  console.log('─'.repeat(60));
  
  for (const report of reports) {
    const added = report.added > 0 ? `+${report.added}` : '0';
    console.log(
      report.instructor.padEnd(25) +
      report.before.toString().padStart(8) +
      report.after.toString().padStart(8) +
      added.padStart(8)
    );
  }
  
  console.log('─'.repeat(60));
  
  console.log('\n📈 SUMMARY:');
  console.log(`   Library Before: ${libraryBefore} videos`);
  console.log(`   Library After:  ${libraryAfter} videos`);
  console.log(`   Total Added:    +${totalNewVideos} new videos`);
  console.log(`   Duration:       ${Math.floor(duration / 60)}m ${duration % 60}s`);
  
  console.log('\n' + '█'.repeat(70));
  console.log('█  CURATION COMPLETE');
  console.log('█'.repeat(70) + '\n');
}

// Auto-run when executed directly
const isMainModule = process.argv[1]?.includes('run-elite-instructor-batch');
if (isMainModule) {
  runEliteInstructorBatchCuration()
    .then(() => {
      console.log('Batch curation finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Batch curation failed:', error);
      process.exit(1);
    });
}
