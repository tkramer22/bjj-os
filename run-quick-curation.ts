/**
 * Quick targeted instructor curation - limited set for faster results
 */
import { runTargetedInstructorCuration } from './server/instructor-curation';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

// Start with the instructors with lowest video counts
const TARGET_INSTRUCTORS = [
  "Josh Rich",       // 1 video
  "Rafael Mendes",   // 3 videos
  "Rubens Charles",  // 3 videos
  "Josh Barnett",    // 5 videos
  "Leandro Lo"       // 7 videos
];

async function main() {
  console.log('\n========================================');
  console.log('QUICK TARGETED CURATION (5 instructors)');
  console.log('========================================\n');
  
  const beforeTotal = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
  const totalBefore = parseInt((beforeTotal.rows[0] as any)?.count || '0');
  console.log(`Library size before: ${totalBefore} videos\n`);
  
  const result = await runTargetedInstructorCuration(TARGET_INSTRUCTORS);
  
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
