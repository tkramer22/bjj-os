#!/bin/bash
# Autonomous Elite Curator - Runs until quota maxed
# Usage: nohup bash scripts/autonomous-elite-curator.sh &

cd /home/runner/workspace

LOG_FILE="/tmp/elite-curator-autonomous.log"
echo "🎯 AUTONOMOUS ELITE CURATOR" | tee -a $LOG_FILE
echo "Started at: $(date)" | tee -a $LOG_FILE
echo "Target: 150 searches" | tee -a $LOG_FILE
echo "═══════════════════════════════════════════════" | tee -a $LOG_FILE

RUN_NUM=1

while [ $RUN_NUM -le 15 ]; do
  echo "" | tee -a $LOG_FILE
  echo "🚀 Run #$RUN_NUM/15 - $(date)" | tee -a $LOG_FILE
  echo "───────────────────────────────────────────────" | tee -a $LOG_FILE
  
  # Run one batch (10 searches)
  npx tsx << 'SCRIPT' 2>&1 | tee -a $LOG_FILE
import { runEliteCuration, getEliteCuratorStats } from './server/elite-curator';

(async () => {
  try {
    const result = await runEliteCuration();
    
    if (result.success) {
      console.log(`✅ Searches: ${result.searchesPerformed}, Approved: ${result.videosApproved}, Rate: ${result.approvalRate?.toFixed(1)}%`);
      
      const stats = await getEliteCuratorStats();
      console.log(`📊 Quota: ${stats.dailySearchesUsed}/${stats.maxDailySearches}`);
      
      if (stats.dailySearchesUsed >= stats.maxDailySearches) {
        console.log('🎯 QUOTA MAXED!');
        process.exit(2); // Special exit code for quota maxed
      }
      
      process.exit(0);
    } else {
      console.log(`❌ Failed: ${result.message}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
})();
SCRIPT
  
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -eq 2 ]; then
    echo "✅ QUOTA MAXED - Mission Complete!" | tee -a $LOG_FILE
    break
  elif [ $EXIT_CODE -ne 0 ]; then
    echo "⚠️  Run failed - retrying in 30 seconds..." | tee -a $LOG_FILE
    sleep 30
    continue
  fi
  
  RUN_NUM=$((RUN_NUM + 1))
  echo "⏱️  Waiting 5 seconds before next run..." | tee -a $LOG_FILE
  sleep 5
done

echo "" | tee -a $LOG_FILE
echo "═══════════════════════════════════════════════" | tee -a $LOG_FILE
echo "✅ AUTONOMOUS ELITE CURATOR COMPLETE" | tee -a $LOG_FILE
echo "Finished at: $(date)" | tee -a $LOG_FILE
echo "Check database for approved videos!" | tee -a $LOG_FILE
echo "═══════════════════════════════════════════════" | tee -a $LOG_FILE

# Final stats
npx tsx << 'STATS' | tee -a $LOG_FILE
import { db } from './server/db';
import { sql } from 'drizzle-orm';

(async () => {
  const result = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM ai_video_knowledge 
    WHERE DATE(created_at) = CURRENT_DATE
  `);
  console.log(`\n📚 Total videos added today: ${result.rows[0].count}`);
})();
STATS
