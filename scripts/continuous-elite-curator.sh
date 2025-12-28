#!/bin/bash
# Continuously run Elite Curator until daily quota is maxed

cd /home/runner/workspace

echo "🎯 Starting continuous Elite Curator runs"
echo "Goal: Max out daily quota (150 searches)"
echo ""

RUN_NUM=1

while true; do
  echo "═══════════════════════════════════════════════"
  echo "Run #$RUN_NUM - $(date)"
  echo "═══════════════════════════════════════════════"
  
  # Run one iteration
  npx tsx -e "
    import { runEliteCuration } from './server/elite-curator.js';
    (async () => {
      try {
        const result = await runEliteCuration();
        console.log(JSON.stringify(result));
        process.exit(result.success ? 0 : 1);
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
    })();
  " 2>&1 | tee -a /tmp/elite-curator-continuous.log
  
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Run #$RUN_NUM completed successfully"
  else
    echo "❌ Run #$RUN_NUM failed - checking if quota maxed..."
    # Check if it's a quota error
    if grep -q "quota" /tmp/elite-curator-continuous.log; then
      echo "✅ QUOTA MAXED - Stopping"
      break
    fi
  fi
  
  # Brief delay between runs
  sleep 3
  RUN_NUM=$((RUN_NUM + 1))
  
  # Safety limit: Stop after 20 runs (should hit quota before this)
  if [ $RUN_NUM -gt 20 ]; then
    echo "⚠️  Reached 20 runs - stopping for safety"
    break
  fi
done

echo ""
echo "═══════════════════════════════════════════════"
echo "✅ Elite Curator Session Complete"
echo "═══════════════════════════════════════════════"
