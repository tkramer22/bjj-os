#!/bin/bash

# 🧪 COMPREHENSIVE PERFORMANCE TESTING SCRIPT
# Tests Claude endpoint with timing telemetry

USER_ID="ae9891bc-d0ff-422b-9b0e-f8aedd05cd17"
ENDPOINT="http://localhost:5000/api/ai/chat/claude/stream"

# Create JWT token for auth
JWT_SECRET=${JWT_SECRET:-"your-secret-key-here-change-in-production-xyz789"}
PAYLOAD=$(cat <<EOF
{
  "userId": "$USER_ID",
  "exp": $(($(date +%s) + 3600))
}
EOF
)

# For simplicity, we'll use curl directly
echo "========================================================================"
echo "🧪 COMPREHENSIVE PERFORMANCE & TIMING TEST SUITE"
echo "========================================================================"
echo "Testing Claude endpoint with user: $USER_ID"
echo "Target: < 2000ms average, < 3000ms max"
echo ""

TEST_MESSAGES=(
  "I struggle with triangle chokes"
  "My guard keeps getting passed"
  "Help me with armbar setups"
  "Show me videos about deep half guard"
  "Teach me about kimura from closed guard"
)

RESULTS_FILE="/tmp/performance-test-results.txt"
> $RESULTS_FILE  # Clear file

TOTAL_TIME=0
TEST_COUNT=0
PASSED_2000=0
PASSED_3000=0

for MESSAGE in "${TEST_MESSAGES[@]}"; do
  TEST_COUNT=$((TEST_COUNT + 1))
  echo "========================================================================"
  echo "🧪 TEST $TEST_COUNT: \"$MESSAGE\""
  echo "========================================================================"
  
  START_TIME=$(date +%s%3N)
  
  # Make request and measure time
  RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}" \
    -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Cookie: sessionToken=test_session_token" \
    -d "{\"message\": \"$MESSAGE\"}")
  
  END_TIME=$(date +%s%3N)
  ELAPSED_MS=$((END_TIME - START_TIME))
  TOTAL_TIME=$((TOTAL_TIME + ELAPSED_MS))
  
  echo "⏱️  Response time: ${ELAPSED_MS}ms"
  
  if [ $ELAPSED_MS -lt 2000 ]; then
    PASSED_2000=$((PASSED_2000 + 1))
    echo "   ✅ Under 2000ms"
  else
    echo "   ⚠️  Over 2000ms"
  fi
  
  if [ $ELAPSED_MS -lt 3000 ]; then
    PASSED_3000=$((PASSED_3000 + 1))
    echo "   ✅ Under 3000ms"
  else
    echo "   ❌ Over 3000ms - FAIL"
  fi
  
  # Save result
  echo "Test $TEST_COUNT: $MESSAGE - ${ELAPSED_MS}ms" >> $RESULTS_FILE
  
  echo ""
  sleep 1
done

# Calculate statistics
AVG_TIME=$((TOTAL_TIME / TEST_COUNT))
PERCENT_2000=$((PASSED_2000 * 100 / TEST_COUNT))
PERCENT_3000=$((PASSED_3000 * 100 / TEST_COUNT))

echo "========================================================================"
echo "📊 FINAL RESULTS"
echo "========================================================================"
echo ""
echo "⏱️  TIMING METRICS:"
echo "   Average response time: ${AVG_TIME}ms"
echo "   Tests under 2000ms: $PASSED_2000/$TEST_COUNT ($PERCENT_2000%)"
echo "   Tests under 3000ms: $PASSED_3000/$TEST_COUNT ($PERCENT_3000%)"
echo ""
echo "✅ PASS CRITERIA:"

if [ $PERCENT_2000 -ge 90 ]; then
  echo "   90% under 2000ms: ✅ PASS ($PERCENT_2000%)"
else
  echo "   90% under 2000ms: ❌ FAIL ($PERCENT_2000%)"
fi

if [ $PERCENT_3000 -eq 100 ]; then
  echo "   100% under 3000ms: ✅ PASS"
else
  echo "   100% under 3000ms: ❌ FAIL ($PERCENT_3000%)"
fi

echo ""
echo "========================================================================"
if [ $PERCENT_2000 -ge 90 ] && [ $PERCENT_3000 -eq 100 ]; then
  echo "   OVERALL: ✅ PASS"
  echo "========================================================================"
  exit 0
else
  echo "   OVERALL: ❌ FAIL"
  echo "========================================================================"
  exit 1
fi
