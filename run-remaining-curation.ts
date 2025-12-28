/**
 * Run Simple Curation for remaining instructors
 */
import { runSimpleInstructorCuration } from './server/simple-instructor-curation';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

// Remaining instructors that haven't been fully processed
const TARGET_INSTRUCTORS = [
  "Leandro Lo",        // 7 videos
  "Gui Mendes",        // 24 videos
  "Eduardo Telles",    // 14 videos
  "Ethan Crelinsten",  // 9 videos
  "Draculino",         // 31 videos
  "Kaynan Duarte",     // 17 videos
  "Roger Gracie",      // 15 videos
  "Romulo Barral",     // 25 videos
  "Rafael Mendes",     // 3 videos
  "Marcelo Garcia"     // 39 videos
];

async function main() {
  console.log('\n========================================');
  console.log('REMAINING INSTRUCTOR CURATION');
  console.log('========================================\n');
  
  const beforeTotal = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
  const totalBefore = parseInt((beforeTotal.rows[0] as any)?.count || '0');
  console.log(`Library size before: ${totalBefore} videos\n`);
  
  const result = await runSimpleInstructorCuration(TARGET_INSTRUCTORS);
  
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
