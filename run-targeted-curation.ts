/**
 * Run targeted instructor curation for specified instructors
 */
import { runTargetedInstructorCuration } from './server/instructor-curation';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const TARGET_INSTRUCTORS = [
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

async function main() {
  console.log('\n========================================');
  console.log('TARGETED INSTRUCTOR CURATION');
  console.log('========================================\n');
  
  // Get total video count before
  const beforeTotal = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
  const totalBefore = parseInt((beforeTotal.rows[0] as any)?.count || '0');
  console.log(`Library size before: ${totalBefore} videos\n`);
  
  // Run targeted curation
  const result = await runTargetedInstructorCuration(TARGET_INSTRUCTORS);
  
  // Get total video count after
  const afterTotal = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
  const totalAfter = parseInt((afterTotal.rows[0] as any)?.count || '0');
  
  console.log('\n========================================');
  console.log('FINAL SUMMARY');
  console.log('========================================');
  console.log(`\nBefore/After by Instructor:`);
  for (const [instructor, counts] of Object.entries(result.instructorResults)) {
    console.log(`  ${instructor}: ${counts.before} -> ${counts.after} (+${counts.after - counts.before})`);
  }
  console.log(`\nTotal Videos Added: ${result.videosAdded}`);
  console.log(`New Library Size: ${totalAfter}`);
  console.log(`Net Change: +${totalAfter - totalBefore}`);
  console.log('========================================\n');
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
