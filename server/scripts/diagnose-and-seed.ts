/**
 * CURATION DIAGNOSTIC + SEEDING SCRIPT
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { aiVideoKnowledge, fullyMinedInstructors } from '@shared/schema';

async function runDiagnosticsAndSeed() {
  console.log('\n' + '═'.repeat(70));
  console.log('🔍 STEP 1: CURATION DIAGNOSTIC REPORT');
  console.log('═'.repeat(70) + '\n');
  
  try {
    // 1. Total videos in library
    const videoCount = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM ai_video_knowledge WHERE status = 'active'`);
    const totalVideos = (videoCount as any).rows?.[0]?.cnt || (videoCount as any)[0]?.cnt || 0;
    console.log(`📚 Total Videos in Library: ${totalVideos}`);
    
    // 2. Videos added in last 7 days
    const recentVideos = await db.execute(sql`
      SELECT COUNT(*)::int as cnt FROM ai_video_knowledge 
      WHERE created_at >= NOW() - INTERVAL '7 days' AND status = 'active'
    `);
    const recent7d = (recentVideos as any).rows?.[0]?.cnt || (recentVideos as any)[0]?.cnt || 0;
    console.log(`📅 Videos Added (Last 7 Days): ${recent7d}`);
    
    // 3. Top instructors by video count
    console.log('\n📋 TOP 20 INSTRUCTORS BY VIDEO COUNT:');
    const topInstructors = await db.execute(sql`
      SELECT instructor_name, COUNT(*)::int as video_count
      FROM ai_video_knowledge
      WHERE instructor_name IS NOT NULL AND instructor_name != '' AND status = 'active'
      GROUP BY instructor_name
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `);
    const instructorRows = (topInstructors as any).rows || topInstructors;
    for (const row of instructorRows as any[]) {
      console.log(`   ${row.instructor_name}: ${row.video_count} videos`);
    }
    
    // 4. Check for elite instructors specifically
    const eliteNames = [
      'John Danaher', 'Lachlan Giles', 'Gordon Ryan', 'Craig Jones',
      'Mikey Musumeci', 'Marcelo Garcia', 'Keenan Cornelius', 'Bernardo Faria',
      'Andre Galvao', 'Tom DeBlass', 'Gui Mendes', 'Rafa Mendes',
      'Garry Tonon', 'Ffion Davies', 'Giancarlo Bodoni'
    ];
    
    console.log('\n🏆 ELITE INSTRUCTOR CHECK:');
    const missingElites: string[] = [];
    for (const name of eliteNames) {
      const result = await db.execute(sql`
        SELECT COUNT(*)::int as cnt FROM ai_video_knowledge
        WHERE LOWER(instructor_name) LIKE LOWER(${`%${name}%`}) AND status = 'active'
      `);
      const count = (result as any).rows?.[0]?.cnt || (result as any)[0]?.cnt || 0;
      const status = count > 0 ? `✅ ${count} videos` : '❌ NOT FOUND';
      console.log(`   ${name}: ${status}`);
      if (count === 0) missingElites.push(name);
    }
    
    // 5. Check cooldown list
    console.log('\n🚫 INSTRUCTORS ON COOLDOWN:');
    const cooldowns = await db.execute(sql`
      SELECT instructor_name, cooldown_until, consecutive_empty_runs
      FROM fully_mined_instructors
      WHERE cooldown_until > NOW()
      ORDER BY cooldown_until DESC
    `);
    const cooldownRows = (cooldowns as any).rows || cooldowns;
    if ((cooldownRows as any[]).length === 0) {
      console.log('   None - all instructors are eligible');
    } else {
      for (const row of cooldownRows as any[]) {
        console.log(`   ${row.instructor_name}: until ${new Date(row.cooldown_until).toLocaleDateString()} (${row.consecutive_empty_runs} empty runs)`);
      }
    }
    
    // 6. Recent curation runs
    console.log('\n📊 RECENT CURATION RUNS:');
    const runs = await db.execute(sql`
      SELECT id, run_type, status, videos_analyzed, videos_added, videos_rejected, 
             started_at, error_message
      FROM curation_runs
      ORDER BY started_at DESC
      LIMIT 5
    `);
    const runRows = (runs as any).rows || runs;
    if ((runRows as any[]).length === 0) {
      console.log('   No curation runs recorded');
    } else {
      for (const run of runRows as any[]) {
        const date = new Date(run.started_at).toLocaleString();
        console.log(`   ${date} | ${run.run_type} | ${run.status}`);
        console.log(`      Analyzed: ${run.videos_analyzed || 0}, Added: ${run.videos_added || 0}, Rejected: ${run.videos_rejected || 0}`);
        if (run.error_message) console.log(`      Error: ${run.error_message}`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: SEED MISSING ELITE INSTRUCTORS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('🌱 STEP 2: SEEDING ELITE INSTRUCTORS');
    console.log('═'.repeat(70) + '\n');
    
    // We need to insert a placeholder video for each missing elite instructor
    // This will make them appear in the instructor pool for curation
    let seeded = 0;
    for (const name of eliteNames) {
      // Check if already exists
      const existing = await db.execute(sql`
        SELECT COUNT(*)::int as cnt FROM ai_video_knowledge
        WHERE LOWER(instructor_name) LIKE LOWER(${`%${name}%`}) AND status = 'active'
      `);
      const existingCount = (existing as any).rows?.[0]?.cnt || (existing as any)[0]?.cnt || 0;
      
      if (existingCount === 0) {
        // Insert a seed entry for this instructor
        try {
          await db.execute(sql`
            INSERT INTO ai_video_knowledge (
              video_url, youtube_id, title, technique_name, instructor_name,
              technique_type, position_category, gi_or_nogi, quality_score,
              source, created_at
            ) VALUES (
              ${'https://youtube.com/watch?v=seed_' + name.toLowerCase().replace(/\s/g, '_')},
              ${'seed_' + name.toLowerCase().replace(/\s/g, '_')},
              ${name + ' - Elite Instructor Seed'},
              ${'BJJ Technique'},
              ${name},
              'technique',
              'universal',
              'both',
              '8.0',
              'elite_seed',
              NOW()
            )
          `);
          console.log(`   ✅ Seeded: ${name}`);
          seeded++;
        } catch (e: any) {
          if (e.code === '23505') {
            console.log(`   ⏭️ Already exists: ${name}`);
          } else {
            console.log(`   ❌ Error seeding ${name}: ${e.message}`);
          }
        }
      } else {
        console.log(`   ⏭️ Already has ${existingCount} videos: ${name}`);
      }
    }
    console.log(`\n   Total seeded: ${seeded} instructors`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: CLEAR COOLDOWNS FOR ELITE INSTRUCTORS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('🔓 STEP 3: CLEARING COOLDOWNS');
    console.log('═'.repeat(70) + '\n');
    
    // Clear all cooldowns (set cooldown_until to past date)
    const clearResult = await db.execute(sql`
      UPDATE fully_mined_instructors 
      SET cooldown_until = NOW() - INTERVAL '1 day'
      WHERE cooldown_until > NOW()
      RETURNING instructor_name
    `);
    const clearedRows = (clearResult as any).rows || clearResult;
    
    if ((clearedRows as any[]).length === 0) {
      console.log('   No cooldowns to clear');
    } else {
      console.log(`   Cleared ${(clearedRows as any[]).length} cooldowns:`);
      for (const row of clearedRows as any[]) {
        console.log(`   ✅ ${row.instructor_name}`);
      }
    }
    
    console.log('\n' + '═'.repeat(70));
    console.log('✅ DIAGNOSTIC AND SEEDING COMPLETE');
    console.log('═'.repeat(70) + '\n');
    
    console.log('📋 SUMMARY:');
    console.log(`   - Total videos in library: ${totalVideos}`);
    console.log(`   - Elite instructors seeded: ${seeded}`);
    console.log(`   - Cooldowns cleared: ${(clearedRows as any[]).length}`);
    console.log('\n🚀 Ready for manual curation run!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

runDiagnosticsAndSeed();
