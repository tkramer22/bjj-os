/**
 * BJJ OS - User Simulation Test Script (Phases 6-12 Only)
 */

import fs from 'fs';

const BASE_URL = process.env.APP_URL || 'http://localhost:5000';
const TEST_USER_ID = process.env.TEST_USER_ID || 'c2cfc0c7-96f2-4f02-8251-bf30b8f6860a';

const conversationLog = [];
let messageCount = 59; // Continue from where we left off

async function chat(userMessage, context = {}) {
  messageCount++;
  console.log(`\n[${messageCount}] 👤 USER: ${userMessage}\n`);
  conversationLog.push({ 
    role: 'user', 
    message: userMessage, 
    timestamp: new Date().toISOString(),
    phase: context.phase || 'unknown'
  });
  
  try {
    const response = await fetch(`${BASE_URL}/api/ai/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        message: userMessage
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ API Error: ${response.status} - ${errorText}\n`);
      conversationLog.push({ 
        role: 'error', 
        message: `API Error: ${response.status}`, 
        timestamp: new Date().toISOString() 
      });
      return null;
    }
    
    const data = await response.json();
    const aiResponse = data.content || data.response || data.message || JSON.stringify(data);
    
    console.log(`🤖 PROFESSOR OS: ${aiResponse}\n`);
    conversationLog.push({ 
      role: 'assistant', 
      message: aiResponse, 
      timestamp: new Date().toISOString(),
      videos: data.videos || [],
      responseTime: data.metadata?.responseTime || null
    });
    
    await sleep(1000);
    
    return aiResponse;
  } catch (error) {
    console.log(`❌ Request Error: ${error.message}\n`);
    conversationLog.push({ 
      role: 'error', 
      message: error.message, 
      timestamp: new Date().toISOString() 
    });
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function phase6_ExploringVideos() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 6: EXPLORING VIDEO LIBRARY');
  console.log('Testing: Video discovery, filtering, instructor exploration');
  console.log('='.repeat(60));
  
  await chat("I want to watch some instructional videos. What do you have?", { phase: 'video_library' });
  await chat("Who are the best instructors for guard passing?", { phase: 'video_library' });
  await chat("Show me something from Gordon Ryan", { phase: 'video_library' });
  await chat("What about John Danaher? I heard he's good", { phase: 'video_library' });
  await chat("Are there any Marcelo Garcia videos?", { phase: 'video_library' });
  await chat("What's a good video for a blue belt like me?", { phase: 'video_library' });
  await chat("I learn better from short clips than long instructionals", { phase: 'video_library' });
  await chat("What's the difference between an instructional and a technique video?", { phase: 'video_library' });
  await chat("Should I focus on modern jiu jitsu or traditional stuff?", { phase: 'video_library' });
  await chat("I mostly train gi but want to do some no-gi. What's different?", { phase: 'video_library' });
  await chat("What grips should I use in no-gi since I can't grab the collar?", { phase: 'video_library' });
}

async function phase7_DeepTechniqueDiscussion() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 7: DEEP TECHNIQUE DISCUSSION');
  console.log('Testing: Detailed explanations, mechanics understanding, drilling');
  console.log('='.repeat(60));
  
  await chat("I want to really understand the arm triangle. Like deeply understand it", { phase: 'deep_technique' });
  await chat("What makes it work? Like the actual mechanics", { phase: 'deep_technique' });
  await chat("How tight should my shoulder pressure be?", { phase: 'deep_technique' });
  await chat("Where should my head be during the squeeze?", { phase: 'deep_technique' });
  await chat("What are the most common mistakes people make?", { phase: 'deep_technique' });
  await chat("What's the best setup from side control?", { phase: 'deep_technique' });
  await chat("Can I get it from mount too?", { phase: 'deep_technique' });
  await chat("I always lose it when I go to finish. They escape when I switch to the other side", { phase: 'deep_technique' });
  await chat("How do I defend if someone's doing this to me?", { phase: 'deep_technique' });
  await chat("What if they already have it locked? Is it too late?", { phase: 'deep_technique' });
  await chat("How should I drill this to get better at finishing?", { phase: 'deep_technique' });
  await chat("Is the arm triangle a high percentage submission? Like in competition?", { phase: 'deep_technique' });
  await chat("What's the difference between arm triangle, darce, and anaconda?", { phase: 'deep_technique' });
}

async function phase8_InjuryDiscussion() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 8: INJURY DISCUSSION');
  console.log('Testing: Safety awareness, medical disclaimer, modified training');
  console.log('='.repeat(60));
  
  await chat("I think I hurt my knee at training yesterday", { phase: 'injury' });
  await chat("It's like on the inside of my knee. Hurts when I twist it", { phase: 'injury' });
  await chat("Someone was passing and my foot got stuck when they went around", { phase: 'injury' });
  await chat("Should I see a doctor?", { phase: 'injury' });
  await chat("Can I still train or should I rest?", { phase: 'injury' });
  await chat("What can I work on that doesn't use my knee much?", { phase: 'injury' });
  await chat("So like all upper body stuff?", { phase: 'injury' });
  await chat("What guard can I play that doesn't twist my knee?", { phase: 'injury' });
  await chat("How do I prevent this in the future?", { phase: 'injury' });
  await chat("How do I know when I'm ready to roll again?", { phase: 'injury' });
}

async function phase9_LearningConcepts() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 9: LEARNING CONCEPTS');
  console.log('Testing: Foundational teaching, principle-based instruction');
  console.log('='.repeat(60));
  
  await chat("Everyone talks about frames. What actually is a frame?", { phase: 'concepts' });
  await chat("When should I be framing?", { phase: 'concepts' });
  await chat("How do I frame in side control?", { phase: 'concepts' });
  await chat("What about hip escapes? I feel like I'm doing them wrong", { phase: 'concepts' });
  await chat("How far should I be moving with each shrimp?", { phase: 'concepts' });
  await chat("So frames plus hip escapes together?", { phase: 'concepts' });
  await chat("What does it mean to have good posture in guard?", { phase: 'concepts' });
  await chat("What about base? People say I have bad base", { phase: 'concepts' });
  await chat("How do I know if my base is good?", { phase: 'concepts' });
  await chat("How do I develop more pressure when I'm on top?", { phase: 'concepts' });
  await chat("Where should my weight be when I'm in side control?", { phase: 'concepts' });
  await chat("Someone told me to stay connected. What does that mean?", { phase: 'concepts' });
}

async function phase10_PostCompetition() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 10: POST-COMPETITION DEBRIEF');
  console.log('Testing: Debrief handling, learning from losses, celebrating wins');
  console.log('='.repeat(60));
  
  await chat("Just got back from the tournament", { phase: 'post_competition' });
  await chat("I went 1-2. Won my first match, lost the next two", { phase: 'post_competition' });
  await chat("First match I hit that hip bump to kimura chain you taught me! Got the tap", { phase: 'post_competition' });
  await chat("Second match I got taken down and couldn't get back up. Lost on points", { phase: 'post_competition' });
  await chat("Third match I was winning but got caught in a triangle at the end", { phase: 'post_competition' });
  await chat("I'm happy I won one but frustrated about the triangle", { phase: 'post_competition' });
  await chat("I was passing and got too low and he locked it up", { phase: 'post_competition' });
  await chat("How do I avoid that in the future?", { phase: 'post_competition' });
  await chat("Once he had it locked what should I have done?", { phase: 'post_competition' });
  await chat("The hip bump to kimura really worked though. I drilled it so much", { phase: 'post_competition' });
  await chat("What should I focus on for the next competition?", { phase: 'post_competition' });
  await chat("I need better takedown defense. I got taken down in both losses", { phase: 'post_competition' });
  await chat("Can you give me a training plan focused on takedown defense and passing?", { phase: 'post_competition' });
}

async function phase11_EdgeCases() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 11: EDGE CASES AND RANDOM QUESTIONS');
  console.log('Testing: Off-topic, multiple questions, emotional, knowledge limits');
  console.log('='.repeat(60));
  
  await chat("What do you think about the latest ADCC?", { phase: 'edge_cases' });
  await chat("What's the best submission?", { phase: 'edge_cases' });
  await chat("How long until I get my black belt?", { phase: 'edge_cases' });
  await chat("Is Gordon Ryan the GOAT?", { phase: 'edge_cases' });
  await chat("Should I train at a Gracie gym or 10th Planet?", { phase: 'edge_cases' });
  await chat("What gi should I buy?", { phase: 'edge_cases' });
  await chat("What supplements should I take for BJJ?", { phase: 'edge_cases' });
  await chat("Is the twister actually useful?", { phase: 'edge_cases' });
  await chat("Is pulling guard cheating?", { phase: 'edge_cases' });
  await chat("Does BJJ work in a street fight?", { phase: 'edge_cases' });
  await chat("What's the difference between a buggy choke and a tarikoplata?", { phase: 'edge_cases' });
  await chat("How do I get better at escaping mount, what's the best guard for my body type, and should I compete more?", { phase: 'edge_cases' });
  await chat("What do I do if someone has me in turtle and they're grabbing my belt with one hand and have an underhook with the other and they're trying to take my back but I have a whizzer?", { phase: 'edge_cases' });
  await chat("Sometimes I feel like I'll never be good at this. Everyone at my gym is better than me.", { phase: 'edge_cases' });
  await chat("Thanks for all the help. This is actually really useful.", { phase: 'edge_cases' });
}

async function phase12_LongTermUser() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 12: LONG-TERM USER BEHAVIOR');
  console.log('Testing: Memory/context, progress tracking, style development');
  console.log('='.repeat(60));
  
  await chat("Hey, been a while. Took a couple weeks off", { phase: 'long_term' });
  await chat("What were we working on before? I forgot", { phase: 'long_term' });
  await chat("My closed guard is actually way better now. Hit like 5 sweeps last week", { phase: 'long_term' });
  await chat("Now I want to work on my open guard. Where do I start?", { phase: 'long_term' });
  await chat("You mentioned something about concepts before. How does that apply to open guard?", { phase: 'long_term' });
  await chat("That Marcelo Garcia butterfly video you showed me was amazing. Got any more from him?", { phase: 'long_term' });
  await chat("I think I'm starting to develop my own style. Is that good at blue belt?", { phase: 'long_term' });
  await chat("Based on everything you know about me, what's my biggest weakness right now?", { phase: 'long_term' });
  await chat("You're right. I do rely too much on one sweep. What else should I add?", { phase: 'long_term' });
  await chat("I want to get my purple belt within 2 years. Is that realistic?", { phase: 'long_term' });
  await chat("Test me. Ask me something about arm triangles to see if I remember", { phase: 'long_term' });
  await chat("Alright I'm heading to training. Wish me luck!", { phase: 'long_term' });
}

async function runSimulation() {
  console.log('\n' + '='.repeat(70));
  console.log('  BJJ OS - USER SIMULATION TEST (PHASES 6-12)');
  console.log('  Continuing from Phase 5...');
  console.log('='.repeat(70));
  console.log(`\nBase URL: ${BASE_URL}`);
  console.log(`Test User ID: ${TEST_USER_ID}`);
  console.log(`Start Time: ${new Date().toISOString()}`);
  
  const startTime = new Date();
  
  try {
    await phase6_ExploringVideos();
    await phase7_DeepTechniqueDiscussion();
    await phase8_InjuryDiscussion();
    await phase9_LearningConcepts();
    await phase10_PostCompetition();
    await phase11_EdgeCases();
    await phase12_LongTermUser();
    
  } catch (error) {
    console.error('Simulation error:', error);
    conversationLog.push({ 
      role: 'system', 
      message: `FATAL ERROR: ${error.message}`, 
      timestamp: new Date().toISOString() 
    });
  }
  
  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / 1000 / 60);
  
  console.log('\n' + '='.repeat(70));
  console.log('  SIMULATION COMPLETE (PHASES 6-12)');
  console.log('='.repeat(70));
  console.log(`Duration: ${duration} minutes`);
  console.log(`Total messages: ${conversationLog.length}`);
  console.log(`User messages: ${conversationLog.filter(m => m.role === 'user').length}`);
  console.log(`AI responses: ${conversationLog.filter(m => m.role === 'assistant').length}`);
  console.log(`Errors: ${conversationLog.filter(m => m.role === 'error').length}`);
  console.log('='.repeat(70));
  
  // Save to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(`phases-6-12-log-${timestamp}.txt`, conversationLog.map((entry, i) => {
    const role = entry.role === 'user' ? '👤 USER' : entry.role === 'assistant' ? '🤖 PROFESSOR OS' : '❌ ERROR';
    return `[${60 + i}] ${role}: ${entry.message}\n`;
  }).join('\n'));
  
  console.log(`\n📝 Log saved to phases-6-12-log-${timestamp}.txt`);
  
  return conversationLog;
}

runSimulation().catch(console.error);
