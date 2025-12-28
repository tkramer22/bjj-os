/**
 * BJJ OS - Phase 12 Only
 */
import fs from 'fs';

const BASE_URL = 'http://localhost:5000';
const TEST_USER_ID = 'c2cfc0c7-96f2-4f02-8251-bf30b8f6860a';

const log = [];
let count = 120;

async function chat(msg, phase) {
  count++;
  console.log(`[${count}] 👤 USER: ${msg}`);
  log.push({ role: 'user', msg, phase });
  
  try {
    const res = await fetch(`${BASE_URL}/api/ai/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: TEST_USER_ID, message: msg })
    });
    const data = await res.json();
    const ai = data.content || data.message || '';
    console.log(`🤖 PROFESSOR OS: ${ai}\n`);
    log.push({ role: 'assistant', msg: ai, phase });
    await new Promise(r => setTimeout(r, 800));
    return ai;
  } catch (e) {
    console.log(`❌ ERROR: ${e.message}\n`);
    log.push({ role: 'error', msg: e.message, phase });
    return null;
  }
}

async function run() {
  console.log('\n============================================================');
  console.log('PHASE 12: LONG-TERM USER BEHAVIOR');
  console.log('Testing: Memory/context, progress tracking, style development');
  console.log('============================================================\n');
  
  await chat("Hey, been a while. Took a couple weeks off", 'long_term');
  await chat("What were we working on before? I forgot", 'long_term');
  await chat("My closed guard is actually way better now. Hit like 5 sweeps last week", 'long_term');
  await chat("Now I want to work on my open guard. Where do I start?", 'long_term');
  await chat("You mentioned something about concepts before. How does that apply to open guard?", 'long_term');
  await chat("That Marcelo Garcia butterfly video you showed me was amazing. Got any more from him?", 'long_term');
  await chat("I think I'm starting to develop my own style. Is that good at blue belt?", 'long_term');
  await chat("Based on everything you know about me, what's my biggest weakness right now?", 'long_term');
  await chat("You're right. I do rely too much on one sweep. What else should I add?", 'long_term');
  await chat("I want to get my purple belt within 2 years. Is that realistic?", 'long_term');
  await chat("Test me. Ask me something about arm triangles to see if I remember", 'long_term');
  await chat("Alright I'm heading to training. Wish me luck!", 'long_term');
  
  console.log('\n============================================================');
  console.log('PHASE 12 COMPLETE');
  console.log('============================================================');
  
  // Save output
  const output = log.map((e, i) => {
    const role = e.role === 'user' ? '👤 USER' : e.role === 'assistant' ? '🤖 PROFESSOR OS' : '❌ ERROR';
    return `[${121 + i}] ${role}: ${e.msg}\n`;
  }).join('\n');
  
  fs.writeFileSync('phase-12-output.txt', output);
  console.log('\nSaved to phase-12-output.txt');
}

run().catch(console.error);
