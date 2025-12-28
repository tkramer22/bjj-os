/**
 * BJJ OS - User Simulation Test Script
 * 
 * Simulates a realistic new user journey with Professor OS
 * from onboarding through multiple training sessions.
 * 
 * Usage: node test-user-simulation.js
 */

import fs from 'fs';

const BASE_URL = process.env.APP_URL || 'http://localhost:5000';
const TEST_USER_ID = process.env.TEST_USER_ID || 'c2cfc0c7-96f2-4f02-8251-bf30b8f6860a';

const conversationLog = [];
let totalTokens = 0;
let messageCount = 0;

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
    
    console.log(`🤖 PROFESSOR OS: ${aiResponse.substring(0, 500)}${aiResponse.length > 500 ? '...' : ''}\n`);
    conversationLog.push({ 
      role: 'assistant', 
      message: aiResponse, 
      timestamp: new Date().toISOString(),
      videos: data.videos || [],
      responseTime: data.responseTime || null
    });
    
    await sleep(1500);
    
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

async function createTestUser() {
  console.log('\n' + '='.repeat(60));
  console.log('CREATING TEST USER: Marcus Thompson');
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(`${BASE_URL}/api/user/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test-marcus@bjjos-test.com',
        password: 'TestSimulation123!',
        name: 'Marcus Thompson'
      })
    });
    
    const data = await response.json();
    
    if (data.user?.id) {
      console.log(`✅ Test user created/found with ID: ${data.user.id}`);
      return data.user.id;
    } else {
      console.log('⚠️ Using default test user ID');
      return TEST_USER_ID;
    }
  } catch (error) {
    console.log(`⚠️ User creation skipped: ${error.message}`);
    return TEST_USER_ID;
  }
}

async function phase1_Onboarding() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 1: INITIAL ONBOARDING');
  console.log('Testing: First contact, information gathering, first impression');
  console.log('='.repeat(60));
  
  await chat("Hey", { phase: 'onboarding' });
  await chat("So what exactly is this? My friend told me to check it out", { phase: 'onboarding' });
  await chat("I'm a blue belt, been training about 2 years", { phase: 'onboarding' });
  await chat("I train at a small gym in Ohio. Nothing fancy, just a purple belt instructor", { phase: 'onboarding' });
  await chat("Usually 4 times a week, sometimes 5 if I can make open mat on Sunday", { phase: 'onboarding' });
  await chat("I just want to get better honestly", { phase: 'onboarding' });
  await chat("I guess my guard sucks. I keep getting passed and it's frustrating", { phase: 'onboarding' });
  await chat("Yeah I want to compete. There's a local tournament in about 2 months", { phase: 'onboarding' });
  await chat("I'm 5'10, about 175. Pretty average build I guess", { phase: 'onboarding' });
  await chat("Not super flexible, my hips are pretty tight actually", { phase: 'onboarding' });
  await chat("When I'm on top I feel okay, decent pressure. But on bottom I just get smashed", { phase: 'onboarding' });
  await chat("Closed guard especially. I can never keep anyone in my guard, they just stand up and pass", { phase: 'onboarding' });
}

async function phase2_FirstTechniqueRequest() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 2: FIRST TECHNIQUE REQUEST');
  console.log('Testing: Video recommendations, technique explanations, drilling advice');
  console.log('='.repeat(60));
  
  await chat("So can you help me with my closed guard?", { phase: 'technique_request' });
  await chat("What should I focus on first?", { phase: 'technique_request' });
  await chat("What about the hip bump sweep? I've seen that but I can never hit it", { phase: 'technique_request' });
  await chat("When should I go for it? Like what's the setup?", { phase: 'technique_request' });
  await chat("What if they have really good posture and I can't break it down?", { phase: 'technique_request' });
  await chat("Do you have any videos on this?", { phase: 'technique_request' });
  await chat("Okay I watched that. The grip he uses is different than what I've been doing", { phase: 'technique_request' });
  await chat("Should I be gripping the sleeve or the wrist?", { phase: 'technique_request' });
  await chat("How should I drill this? Like how many reps?", { phase: 'technique_request' });
  await chat("What if I don't have a drilling partner? Can I solo drill any of this?", { phase: 'technique_request' });
}

async function phase3_PostTrainingCheckin() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 3: POST-TRAINING CHECK-IN');
  console.log('Testing: Check-in behavior, troubleshooting, teaching chains');
  console.log('='.repeat(60));
  
  await chat("Hey just got back from training", { phase: 'post_training' });
  await chat("It was okay I guess. Tried the hip bump a few times", { phase: 'post_training' });
  await chat("Hit it once on a white belt but the blue belts all blocked it", { phase: 'post_training' });
  await chat("They kept posting their hand on the mat before I could come up", { phase: 'post_training' });
  await chat("What am I doing wrong?", { phase: 'post_training' });
  await chat("So I'm going too slow?", { phase: 'post_training' });
  await chat("What if they post and I can't finish the sweep? Is there something else I can go to?", { phase: 'post_training' });
  await chat("Oh so it chains to kimura? I didn't know that", { phase: 'post_training' });
  await chat("Can you show me that? The hip bump to kimura?", { phase: 'post_training' });
  await chat("This is actually really helpful. I've never thought about techniques as chains before", { phase: 'post_training' });
  await chat("So for my next training, should I focus on just these two things?", { phase: 'post_training' });
}

async function phase4_DealingWithFrustration() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 4: DEALING WITH FRUSTRATION');
  console.log('Testing: Emotional support, bad day handling, mindset advice');
  console.log('='.repeat(60));
  
  await chat("Dude I had the worst training session", { phase: 'frustration' });
  await chat("Got smashed by everyone. Even the new white belt caught me in something", { phase: 'frustration' });
  await chat("I don't know what's wrong with me. I feel like I'm getting worse", { phase: 'frustration' });
  await chat("Is this normal? Like do people actually go backwards?", { phase: 'frustration' });
  await chat("I keep getting caught in the same stuff. Guillotine every time I shoot", { phase: 'frustration' });
  await chat("How do I stop getting guillotined on my shots?", { phase: 'frustration' });
  await chat("I'm shooting single legs mostly", { phase: 'frustration' });
  await chat("Where should my head be?", { phase: 'frustration' });
  await chat("What if they already have the guillotine locked? How do I escape?", { phase: 'frustration' });
  await chat("Show me the escape", { phase: 'frustration' });
  await chat("That von flue thing looks cool. Does that actually work?", { phase: 'frustration' });
  await chat("How do you deal with bad training days mentally? I was so frustrated I almost left early", { phase: 'frustration' });
}

async function phase5_CompetitionPrep() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 5: COMPETITION PREP');
  console.log('Testing: Game planning, rules explanation, week-by-week planning');
  console.log('='.repeat(60));
  
  await chat("So my competition is in 6 weeks now. Getting nervous", { phase: 'competition' });
  await chat("What should my game plan be?", { phase: 'competition' });
  await chat("It's IBJJF rules. Blue belt medium heavy", { phase: 'competition' });
  await chat("Should I pull guard or try to take them down?", { phase: 'competition' });
  await chat("But you know my guard sucks. Should I still pull guard?", { phase: 'competition' });
  await chat("What about if I end up on top? What's a good passing strategy?", { phase: 'competition' });
  await chat("I like pressure passing. Is that good for competition?", { phase: 'competition' });
  await chat("What passes should I drill the most?", { phase: 'competition' });
  await chat("Once I pass, what should I go for?", { phase: 'competition' });
  await chat("How do I manage the clock? I always feel rushed", { phase: 'competition' });
  await chat("Can you explain the points real quick? I always forget", { phase: 'competition' });
  await chat("What about advantages? How do those work?", { phase: 'competition' });
  await chat("Can you give me like a 6 week training plan for the competition?", { phase: 'competition' });
  await chat("Should I cut weight? I walk around at 180", { phase: 'competition' });
  await chat("What should I do the day before the tournament?", { phase: 'competition' });
  await chat("What about morning of? When should I eat?", { phase: 'competition' });
}

async function phase6_ExploringVideos() {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 6: EXPLORING VIDEO LIBRARY');
  console.log('Testing: Search functionality, instructor recommendations, personalization');
  console.log('='.repeat(60));
  
  await chat("What videos do you have on leg locks?", { phase: 'video_library' });
  await chat("Show me heel hook defense. I keep getting caught", { phase: 'video_library' });
  await chat("Do you have anything from Lachlan Giles? I like how he teaches", { phase: 'video_library' });
  await chat("What about Lachlan Giles half guard stuff?", { phase: 'video_library' });
  await chat("Who teaches the best closed guard in your library?", { phase: 'video_library' });
  await chat("If I only had time to watch 3 videos this week, what should they be?", { phase: 'video_library' });
  await chat("What's the best way to learn the berimbolo? Is it worth learning at blue belt?", { phase: 'video_library' });
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
  console.log('  BJJ OS - USER SIMULATION TEST');
  console.log('  Comprehensive test of Professor OS AI coaching system');
  console.log('='.repeat(70));
  console.log(`\nBase URL: ${BASE_URL}`);
  console.log(`Test User ID: ${TEST_USER_ID}`);
  console.log(`Start Time: ${new Date().toISOString()}`);
  
  const startTime = new Date();
  
  try {
    await phase1_Onboarding();
    await phase2_FirstTechniqueRequest();
    await phase3_PostTrainingCheckin();
    await phase4_DealingWithFrustration();
    await phase5_CompetitionPrep();
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
  console.log('  SIMULATION COMPLETE');
  console.log('='.repeat(70));
  console.log(`Duration: ${duration} minutes`);
  console.log(`Total messages: ${conversationLog.length}`);
  console.log(`User messages: ${conversationLog.filter(m => m.role === 'user').length}`);
  console.log(`AI responses: ${conversationLog.filter(m => m.role === 'assistant').length}`);
  console.log(`Errors: ${conversationLog.filter(m => m.role === 'error').length}`);
  console.log('='.repeat(70));
  
  await saveConversationLog(conversationLog);
  
  return conversationLog;
}

async function saveConversationLog(log) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  const jsonFilename = `simulation-log-${timestamp}.json`;
  fs.writeFileSync(jsonFilename, JSON.stringify({
    metadata: {
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
      testUserId: TEST_USER_ID,
      totalMessages: log.length,
      userMessages: log.filter(m => m.role === 'user').length,
      aiResponses: log.filter(m => m.role === 'assistant').length,
      errors: log.filter(m => m.role === 'error').length,
      phases: [...new Set(log.filter(m => m.phase).map(m => m.phase))]
    },
    conversation: log
  }, null, 2));
  
  console.log(`\n📄 JSON log saved: ${jsonFilename}`);
  
  const textFilename = `simulation-log-${timestamp}.txt`;
  let textContent = 'BJJ OS - USER SIMULATION TEST LOG\n';
  textContent += '='.repeat(60) + '\n';
  textContent += `Generated: ${new Date().toISOString()}\n`;
  textContent += `Total Messages: ${log.length}\n`;
  textContent += '='.repeat(60) + '\n\n';
  
  let currentPhase = '';
  log.forEach((entry, index) => {
    if (entry.phase && entry.phase !== currentPhase) {
      currentPhase = entry.phase;
      textContent += '\n' + '─'.repeat(50) + '\n';
      textContent += `PHASE: ${currentPhase.toUpperCase().replace(/_/g, ' ')}\n`;
      textContent += '─'.repeat(50) + '\n\n';
    }
    
    let role;
    if (entry.role === 'user') {
      role = '👤 USER';
    } else if (entry.role === 'assistant') {
      role = '🤖 PROFESSOR OS';
    } else if (entry.role === 'error') {
      role = '❌ ERROR';
    } else {
      role = '📋 SYSTEM';
    }
    
    textContent += `[${index + 1}] ${role}:\n`;
    textContent += entry.message + '\n\n';
    
    if (entry.videos && entry.videos.length > 0) {
      textContent += `📹 Videos recommended: ${entry.videos.length}\n\n`;
    }
    
    textContent += '-'.repeat(40) + '\n\n';
  });
  
  textContent += '\n' + '='.repeat(60) + '\n';
  textContent += 'END OF SIMULATION LOG\n';
  textContent += '='.repeat(60) + '\n';
  
  fs.writeFileSync(textFilename, textContent);
  console.log(`📝 Text log saved: ${textFilename}`);
  
  console.log('\n📊 SUMMARY BY PHASE:');
  const phaseStats = {};
  log.forEach(entry => {
    if (entry.phase) {
      if (!phaseStats[entry.phase]) {
        phaseStats[entry.phase] = { user: 0, assistant: 0, error: 0 };
      }
      phaseStats[entry.phase][entry.role]++;
    }
  });
  
  Object.entries(phaseStats).forEach(([phase, stats]) => {
    console.log(`  ${phase}: ${stats.user || 0} user, ${stats.assistant || 0} AI, ${stats.error || 0} errors`);
  });
}

runSimulation().catch(console.error);
