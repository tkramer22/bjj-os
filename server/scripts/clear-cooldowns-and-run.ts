/**
 * STEP 3-5: Clear cooldowns, run curation, report results
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { runPermanentAutoCuration } from '../permanent-auto-curation';

async function clearCooldownsAndRunCuration() {
  console.log('\n' + '═'.repeat(70));
  console.log('🔓 STEP 3: CHECKING & CLEARING COOLDOWNS');
  console.log('═'.repeat(70) + '\n');
  
  try {
    // Check what columns exist
    const cooldowns = await db.execute(sql`
      SELECT instructor_name, cooldown_until
      FROM fully_mined_instructors
      WHERE cooldown_until > NOW()
      ORDER BY cooldown_until DESC
    `);
    const cooldownRows = (cooldowns as any).rows || cooldowns;
    
    if ((cooldownRows as any[]).length === 0) {
      console.log('   ✅ No instructors on cooldown - all eligible for curation');
    } else {
      console.log(`   Found ${(cooldownRows as any[]).length} instructors on cooldown:`);
      for (const row of cooldownRows as any[]) {
        console.log(`   🚫 ${row.instructor_name}: until ${new Date(row.cooldown_until).toLocaleDateString()}`);
      }
      
      // Clear all cooldowns
      console.log('\n   Clearing all cooldowns...');
      const clearResult = await db.execute(sql`
        UPDATE fully_mined_instructors 
        SET cooldown_until = NOW() - INTERVAL '1 day'
        WHERE cooldown_until > NOW()
        RETURNING instructor_name
      `);
      const clearedRows = (clearResult as any).rows || clearResult;
      console.log(`   ✅ Cleared ${(clearedRows as any[]).length} cooldowns`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: RUN MANUAL CURATION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('🚀 STEP 4: RUNNING MANUAL CURATION');
    console.log('═'.repeat(70) + '\n');
    
    const result = await runPermanentAutoCuration();
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: REPORT RESULTS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('📊 STEP 5: CURATION RESULTS');
    console.log('═'.repeat(70) + '\n');
    
    console.log('📋 SUMMARY:');
    console.log(`   ✅ Success: ${result.success}`);
    console.log(`   📹 Videos Analyzed: ${result.videosAnalyzed}`);
    console.log(`   ➕ Videos Added: ${result.videosAdded}`);
    console.log(`   ⏭️ Videos Skipped: ${result.videosSkipped}`);
    console.log(`   👨‍🏫 Instructors Processed: ${result.instructorsProcessed.length}`);
    console.log(`   ⚠️ Quota Exhausted: ${result.quotaExhausted}`);
    
    if (result.instructorsProcessed.length > 0) {
      console.log('\n👨‍🏫 INSTRUCTORS PROCESSED:');
      for (const name of result.instructorsProcessed) {
        const counts = result.instructorResults[name];
        if (counts) {
          console.log(`   ${name}: ${counts.before} → ${counts.after} (+${counts.added})`);
        } else {
          console.log(`   ${name}`);
        }
      }
    }
    
    if (Object.keys(result.skippedReasons).length > 0) {
      console.log('\n⏭️ SKIP REASONS:');
      for (const [reason, count] of Object.entries(result.skippedReasons)) {
        console.log(`   ${reason}: ${count}`);
      }
    }
    
    if (result.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      for (const error of result.errors.slice(0, 10)) {
        console.log(`   ${error}`);
      }
    }
    
    // Get updated library count
    const finalCount = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM ai_video_knowledge`);
    const total = (finalCount as any).rows?.[0]?.cnt || (finalCount as any)[0]?.cnt || 0;
    
    console.log('\n' + '═'.repeat(70));
    console.log('✅ CURATION COMPLETE');
    console.log('═'.repeat(70));
    console.log(`\n📚 FINAL LIBRARY SIZE: ${total} videos`);
    console.log(`➕ NEW VIDEOS ADDED: ${result.videosAdded}`);
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

clearCooldownsAndRunCuration();
