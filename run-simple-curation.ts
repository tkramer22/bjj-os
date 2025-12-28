/**
 * Run Simple Instructor Curation
 * Uses the EXACT same approach that added 197 videos
 */
import { runSimpleInstructorCuration } from './server/simple-instructor-curation';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

// Target instructors from user request
const TARGET_INSTRUCTORS = [
  "JT Torres",
  "Cobrinha",
  "Leandro Lo",
  "Gui Mendes",
  "Eduardo Telles",
  "Ethan Crelinsten",
  "Draculino",
  "Kaynan Duarte",
  "Roger Gracie",
  "Romulo Barral",
  "Rafael Mendes",
  "Marcelo Garcia"
];

async function main() {
  console.log('\n========================================');
  console.log('SIMPLE INSTRUCTOR CURATION');
  console.log('========================================\n');
  
  // Get library size before
  const beforeTotal = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
  const totalBefore = parseInt((beforeTotal.rows[0] as any)?.count || '0');
  console.log(`Library size before: ${totalBefore} videos\n`);
  
  // Run simple curation
  const result = await runSimpleInstructorCuration(TARGET_INSTRUCTORS);
  
  // Get library size after
  const afterTotal = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
  const totalAfter = parseInt((afterTotal.rows[0] as any)?.count || '0');
  
  console.log('\n========================================');
  console.log('FINAL SUMMARY');
  console.log('========================================');
  console.log(`\nBefore/After by Instructor:`);
  for (const [instructor, counts] of Object.entries(result.instructorResults)) {
    console.log(`  ${instructor}: ${counts.before} -> ${counts.after} (+${counts.added})`);
  }
  console.log(`\nTotal Videos Added: ${result.totalAdded}`);
  console.log(`Library Before: ${totalBefore}`);
  console.log(`Library After: ${totalAfter}`);
  console.log(`Net Change: +${totalAfter - totalBefore}`);
  console.log('========================================\n');
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
