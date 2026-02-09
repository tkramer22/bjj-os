/**
 * Quick stats script to check curation results
 */
import { db } from './db';
import { sql } from 'drizzle-orm';

async function getStats() {
  console.log('\n' + '═'.repeat(70));
  console.log('📊 VIDEO LIBRARY STATS');
  console.log('═'.repeat(70));
  
  // Total count
  const totalResult = await db.execute(sql`SELECT COUNT(*)::int as total FROM ai_video_knowledge WHERE status = 'active'`);
  const total = (totalResult as any)[0]?.total || 0;
  console.log(`\n📚 TOTAL VIDEOS: ${total}`);
  
  // Today's additions
  const todayResult = await db.execute(sql`
    SELECT COUNT(*)::int as today_count 
    FROM ai_video_knowledge 
    WHERE created_at > NOW() - INTERVAL '24 hours'
      AND status = 'active'
  `);
  const todayCount = (todayResult as any)[0]?.today_count || 0;
  console.log(`📈 ADDED LAST 24H: ${todayCount}`);
  
  // Pending Gemini processing
  try {
    const pendingResult = await db.execute(sql`
      SELECT COUNT(*)::int as pending 
      FROM video_watch_status 
      WHERE status = 'pending'
    `);
    const pending = (pendingResult as any)[0]?.pending || 0;
    console.log(`⏳ PENDING GEMINI: ${pending}`);
  } catch (e) {
    console.log(`⏳ PENDING GEMINI: (table not found)`);
  }
  
  // By instructor - top 25
  console.log('\n📋 TOP 25 INSTRUCTORS BY VIDEO COUNT:');
  console.log('─'.repeat(50));
  const byInstructorResult = await db.execute(sql`
    SELECT instructor_name, COUNT(*)::int as count 
    FROM ai_video_knowledge 
    WHERE instructor_name IS NOT NULL
      AND status = 'active'
    GROUP BY instructor_name 
    ORDER BY count DESC 
    LIMIT 25
  `);
  
  let rank = 1;
  for (const row of byInstructorResult as any[]) {
    console.log(`   ${rank}. ${row.instructor_name}: ${row.count} videos`);
    rank++;
  }
  
  // Recent additions by instructor
  console.log('\n🆕 ADDED LAST 24H BY INSTRUCTOR:');
  console.log('─'.repeat(50));
  const recentResult = await db.execute(sql`
    SELECT instructor_name, COUNT(*)::int as count 
    FROM ai_video_knowledge 
    WHERE created_at > NOW() - INTERVAL '24 hours'
    AND instructor_name IS NOT NULL
    AND status = 'active'
    GROUP BY instructor_name 
    ORDER BY count DESC 
    LIMIT 15
  `);
  
  rank = 1;
  for (const row of recentResult as any[]) {
    console.log(`   ${rank}. ${row.instructor_name}: +${row.count}`);
    rank++;
  }
  
  console.log('\n' + '═'.repeat(70) + '\n');
  
  process.exit(0);
}

getStats().catch(e => { 
  console.error('Error:', e.message); 
  process.exit(1); 
});
