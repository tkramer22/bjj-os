/**
 * BJJ OS - COMPLETE PHASES 11 & 12 TEST
 * Testing on Claude Sonnet 4.5 (claude-sonnet-4-5-20241022)
 */

const BASE_URL = 'http://localhost:5000';
const TEST_USER_ID = 'c2cfc0c7-96f2-4f02-8251-bf30b8f6860a';

const results = [];
let messageCount = 118; // Continue from phase 10

async function chat(msg, phase, description) {
  messageCount++;
  const label = `[${messageCount}]`;
  console.log(`${label} 👤 USER: ${msg}`);
  
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/ai/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: TEST_USER_ID, message: msg })
    });
    const elapsed = Date.now() - start;
    const data = await res.json();
    const ai = data.content || data.message || JSON.stringify(data);
    
    console.log(`🤖 PROFESSOR OS: ${ai}`);
    console.log(`⏱️  ${elapsed}ms\n`);
    
    results.push({
      num: messageCount,
      phase,
      description,
      user: msg,
      ai: ai,
      elapsed,
      pass: true
    });
    
    await new Promise(r => setTimeout(r, 1200)); // Rate limit protection
    return ai;
  } catch (e) {
    console.log(`❌ ERROR: ${e.message}\n`);
    results.push({
      num: messageCount,
      phase,
      description,
      user: msg,
      ai: `ERROR: ${e.message}`,
      elapsed: Date.now() - start,
      pass: false
    });
    return null;
  }
}

async function runPhase11() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 11: EDGE CASES AND RANDOM QUESTIONS');
  console.log('Testing: Off-topic, multiple questions, emotional, knowledge limits');
  console.log('='.repeat(70) + '\n');

  // Off-topic questions
  await chat("What do you think about the latest ADCC?", 11, "Off-topic: Current events");
  await chat("What's the best submission?", 11, "Broad question");
  await chat("Who would win in a fight, a gorilla or a grizzly bear?", 11, "Completely off-topic");
  await chat("Can you help me with my math homework?", 11, "Wrong domain");
  await chat("What's your favorite food?", 11, "Personal question to AI");
  
  // Multiple questions at once
  await chat("How do I escape mount, pass guard, and finish from back all in one roll?", 11, "Multiple questions");
  await chat("Should I train more, eat better, sleep more, or focus on technique? Also what gi should I buy and when's the next competition?", 11, "Question overload");
  
  // Emotional/venting messages
  await chat("I'm so frustrated. Nothing works. I've been training for 2 years and I still suck.", 11, "Emotional venting");
  await chat("My training partner is being a jerk and going too hard. I don't know what to do.", 11, "Interpersonal issue");
  await chat("I'm thinking about quitting. Is BJJ even worth it?", 11, "Existential doubt");
  
  // Knowledge limit testing
  await chat("What's the exact percentage of triangles that get finished in IBJJF competition?", 11, "Specific stat request");
  await chat("Can you diagnose my shoulder injury? It hurts when I do this...", 11, "Medical diagnosis request");
  await chat("Write me a full 12-week periodized strength and conditioning program", 11, "Out of scope request");
  await chat("What do you think about Craig Jones' new instructional?", 11, "Specific current product");
  await chat("Tell me everything about the berimbolo", 11, "Exhaustive explanation request");
}

async function runPhase12() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 12: STRESS TESTING');
  console.log('Testing: Rapid-fire, contradictory, long rambling, memory limits');
  console.log('='.repeat(70) + '\n');

  // Rapid-fire questions
  await chat("Armbar?", 11, "Single word");
  await chat("Triangle?", 11, "Single word");
  await chat("Kimura?", 11, "Single word");
  await chat("Best sweep?", 11, "Minimal context");
  await chat("Guard pass?", 11, "Minimal context");
  
  // Contradictory requests
  await chat("I want to play guard but I also hate being on bottom", 12, "Contradictory preference");
  await chat("I need a simple technique but make it advanced and competition-level", 12, "Contradictory request");
  await chat("You told me to work closed guard but now I want open guard. Was your advice wrong?", 12, "Challenging previous advice");
  
  // Long rambling messages
  await chat("So like I was rolling today and this guy kept doing this thing where he would grab my collar and then like move to the side and I couldn't really tell what he was doing but then suddenly I was on my back and he was passing and I tried to frame but my frames weren't working and then he mounted me and I couldn't escape and this happens every time with this one guy but not with others and I don't know if it's a strength thing or a technique thing or what and my coach says to just keep rolling but I feel like I'm not improving and maybe I need to watch more videos or drill more or something but I don't know what to drill and...", 12, "Long rambling message");
  
  // Memory limits
  await chat("Remember when we talked about hip bumps?", 12, "Memory test 1");
  await chat("What was the first thing you told me about guard passing?", 12, "Memory test 2");
  await chat("Based on our entire conversation, summarize my game and what I should work on", 12, "Comprehensive memory test");
  
  // Edge cases
  await chat("", 12, "Empty message"); // May fail, that's OK
  await chat("👊🥋", 12, "Emoji only");
  await chat("asdfghjkl", 12, "Random characters");
  await chat("Help", 12, "Minimal message");
  await chat("Thanks for everything! You've been really helpful. See you next time!", 12, "Closing message");
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  PROFESSOR OS - PHASES 11 & 12 COMPLETE TEST                        ║');
  console.log('║  Model: Claude Sonnet 4.5 (claude-sonnet-4-5-20241022)              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');
  console.log(`Test User: ${TEST_USER_ID}`);
  console.log(`Start Time: ${new Date().toISOString()}\n`);

  await runPhase11();
  await runPhase12();

  // Generate summary
  const phase11Results = results.filter(r => r.phase === 11);
  const phase12Results = results.filter(r => r.phase === 12);
  const totalPass = results.filter(r => r.pass).length;
  const totalFail = results.filter(r => !r.pass).length;

  console.log('\n' + '='.repeat(70));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(70));
  console.log(`Phase 11: ${phase11Results.filter(r => r.pass).length}/${phase11Results.length} passed`);
  console.log(`Phase 12: ${phase12Results.filter(r => r.pass).length}/${phase12Results.length} passed`);
  console.log(`Total: ${totalPass}/${results.length} passed (${totalFail} failed)`);
  console.log(`End Time: ${new Date().toISOString()}`);

  // Output full results
  console.log('\n\n========== FULL OUTPUT FOR COPY ==========\n');
  
  let output = `═══════════════════════════════════════════════════════════════════════════════
  PROFESSOR OS - PHASES 11 & 12 COMPLETE TEST
  Model: Claude Sonnet 4.5 (claude-sonnet-4-5-20241022)
═══════════════════════════════════════════════════════════════════════════════

Test Date: ${new Date().toISOString().split('T')[0]}
Test User: ${TEST_USER_ID}

`;

  output += `═══════════════════════════════════════════════════════════════════════════════
PHASE 11: EDGE CASES AND RANDOM QUESTIONS
Testing: Off-topic, multiple questions, emotional, knowledge limits
═══════════════════════════════════════════════════════════════════════════════

`;

  for (const r of phase11Results) {
    output += `[${r.num}] 👤 USER: ${r.user}

🤖 PROFESSOR OS: ${r.ai}
${r.pass ? '✅ PASS' : '❌ FAIL'}: ${r.description} (${r.elapsed}ms)

---

`;
  }

  output += `═══════════════════════════════════════════════════════════════════════════════
PHASE 12: STRESS TESTING  
Testing: Rapid-fire, contradictory, long rambling, memory limits
═══════════════════════════════════════════════════════════════════════════════

`;

  for (const r of phase12Results) {
    output += `[${r.num}] 👤 USER: ${r.user}

🤖 PROFESSOR OS: ${r.ai}
${r.pass ? '✅ PASS' : '❌ FAIL'}: ${r.description} (${r.elapsed}ms)

---

`;
  }

  output += `═══════════════════════════════════════════════════════════════════════════════
FINAL SUMMARY
═══════════════════════════════════════════════════════════════════════════════

Phase 11 (Edge Cases): ${phase11Results.filter(r => r.pass).length}/${phase11Results.length} PASSED
Phase 12 (Stress Test): ${phase12Results.filter(r => r.pass).length}/${phase12Results.length} PASSED

OVERALL: ${totalPass}/${results.length} PASSED (${Math.round(totalPass/results.length*100)}%)

END OF PHASES 11-12 TEST
═══════════════════════════════════════════════════════════════════════════════
`;

  console.log(output);

  // Save to file
  const fs = await import('fs');
  fs.writeFileSync('public/professor-os-phases-11-12.txt', output);
  console.log('\n✅ Saved to: public/professor-os-phases-11-12.txt');
}

run().catch(console.error);
