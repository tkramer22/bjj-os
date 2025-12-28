import { startCurationRun } from './server/curation-controller';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function monitorCuration() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 MANUAL TEST CURATION - MONITORING MODE');
  console.log('═══════════════════════════════════════════════════════════');
  
  const startTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log('⏰ Start Time (EST):', startTime);
  console.log('📍 Mode: One-time test (won\'t interfere with scheduled runs)');
  console.log('🎯 Target: Process ~20-50 videos for verification\n');
  
  // Get library status before
  const beforeStats = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
  const videosBefore = parseInt((beforeStats.rows[0] as any).count);
  
  console.log('📊 BEFORE TEST:');
  console.log(`   Current Library: ${videosBefore} videos`);
  console.log(`   Target: 2,000 videos (${Math.round(videosBefore/2000*100)}% complete)\n`);
  
  // Start curation run
  console.log('🚀 Starting curation run...\n');
  const result = await startCurationRun('manual', 'live-test-monitoring');
  
  if (!result.success) {
    console.log('❌ Failed to start:', result.reason);
    process.exit(1);
  }
  
  console.log('✅ Curation run started!');
  console.log('📝 Run ID:', result.runId);
  console.log('\n⏳ Monitoring progress (will check every 10 seconds)...\n');
  
  // Monitor progress
  let lastStatus = '';
  let attempts = 0;
  const maxAttempts = 60; // 10 minutes max
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    
    const statusQuery = await db.execute(sql`
      SELECT 
        status,
        videos_screened,
        videos_analyzed,
        videos_added,
        videos_rejected,
        error_message,
        EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) as duration
      FROM curation_runs
      WHERE id = ${result.runId}
    `);
    
    const status = statusQuery.rows[0] as any;
    
    if (status.status !== lastStatus || status.videos_analyzed > 0) {
      console.log(`[${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}] Status: ${status.status.toUpperCase()}`);
      console.log(`   Screened: ${status.videos_screened || 0} | Analyzed: ${status.videos_analyzed || 0} | Approved: ${status.videos_added || 0} | Rejected: ${status.videos_rejected || 0}`);
      console.log(`   Duration: ${Math.round(status.duration || 0)}s`);
      lastStatus = status.status;
    }
    
    if (status.status === 'completed' || status.status === 'failed') {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('📊 FINAL RESULTS:');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`Status: ${status.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
      console.log(`Videos Screened: ${status.videos_screened || 0}`);
      console.log(`Videos Analyzed: ${status.videos_analyzed || 0}`);
      console.log(`Videos Approved: ${status.videos_added || 0}`);
      console.log(`Videos Rejected: ${status.videos_rejected || 0}`);
      
      if (status.videos_analyzed > 0) {
        const approvalRate = Math.round((status.videos_added / status.videos_analyzed) * 100);
        console.log(`Approval Rate: ${approvalRate}%`);
      }
      
      console.log(`Duration: ${Math.round(status.duration)}s (${(status.duration / 60).toFixed(1)} minutes)`);
      
      if (status.error_message) {
        console.log(`\n❌ Error: ${status.error_message}`);
      }
      
      // Get library status after
      const afterStats = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge`);
      const videosAfter = parseInt((afterStats.rows[0] as any).count);
      
      console.log('\n📈 LIBRARY GROWTH:');
      console.log(`   Before: ${videosBefore} videos`);
      console.log(`   After: ${videosAfter} videos`);
      console.log(`   Added: +${videosAfter - videosBefore} videos`);
      console.log(`   Progress: ${Math.round(videosAfter/2000*100)}% to 2,000 target`);
      
      if (status.videos_added > 0) {
        // Show top videos added
        const topVideos = await db.execute(sql`
          SELECT title, instructor_name, quality_score
          FROM ai_video_knowledge
          ORDER BY created_at DESC
          LIMIT 5
        `);
        
        console.log('\n🌟 TOP VIDEOS ADDED:');
        topVideos.rows.forEach((v: any, i: number) => {
          console.log(`   ${i+1}. ${v.title}`);
          console.log(`      Instructor: ${v.instructor_name}`);
          console.log(`      Quality: ${v.quality_score}/10`);
        });
      }
      
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('🎯 NEXT SCHEDULED RUN: 4:00 PM EST');
      console.log('═══════════════════════════════════════════════════════════\n');
      
      break;
    }
    
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    console.log('\n⚠️  Monitoring timeout after 10 minutes');
    console.log('The curation run may still be processing in the background');
  }
  
  process.exit(0);
}

monitorCuration();
