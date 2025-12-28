/**
 * Run Simple Curation - All remaining instructors
 */
import { runSimpleInstructorCuration } from './server/simple-instructor-curation';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

// All target instructors
const TARGET_INSTRUCTORS = [
  "Draculino",         
  "Kaynan Duarte",     
  "Roger Gracie",      
  "Romulo Barral",     
  "Rafael Mendes",     
  "Marcelo Garcia"     
];

async function main() {
  console.log('\n========================================');
  console.log('FINAL INSTRUCTOR CURATION');
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
  for (const [instructor, counts] of Object.entries(result.instructorResults)) {
    console.log(`  ${instructor}: ${counts.before} -> ${counts.after} (+${counts.added})`);
  }
  console.log(`\nTotal Videos Added: ${result.totalAdded}`);
  console.log(`Library: ${totalBefore} -> ${totalAfter} (+${totalAfter - totalBefore})`);
  console.log('========================================\n');
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
