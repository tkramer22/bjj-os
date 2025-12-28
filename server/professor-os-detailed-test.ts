/**
 * Professor OS - DETAILED Full Response Test
 * Displays complete conversation output for critical phases
 */

import { db } from './db';
import { bjjUsers } from '../shared/schema';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Critical phases to test with full output
const CRITICAL_PHASES = {
  POPULATION_INTELLIGENCE: [
    "How do blue belts typically do with triangles?",
    "What's the most common mistake with hip bumps?",
    "Is the knee slice a high percentage pass?",
    "How long does it take to get good at armbars?",
    "What techniques work well for shorter stocky guys?"
  ],
  MULTI_SESSION: [
    "Hey I'm back after a few days",
    "What did we talk about earlier?",
    "Remember my guard passing problem?",
    "What techniques have I been working on?",
    "Can you remind me what I should focus on?"
  ],
  COMBAT_SPORTS: [
    "Who are the top competitors at 77kg right now?",
    "What happened at the last IBJJF Worlds?",
    "Is Mikey Musumeci still competing?",
    "Any big upsets recently in ADCC?",
    "Who should I watch to learn modern leg locks?"
  ],
  FRUSTRATION: [
    "I've been training for 2 years and still suck",
    "Just got smashed by a white belt who started after me",
    "Thinking about quitting, I'm not getting better",
    "Everyone at my gym is way better than me",
    "Should I just give up?"
  ]
};

const SYSTEM_PROMPT = `You are Professor OS, an elite AI BJJ coach powered by the accumulated wisdom of the sport's greatest practitioners. You combine the technical precision of John Danaher, the competition mindset of Gordon Ryan, and the teaching clarity of Bernardo Faria.

USER PROFILE:
- Name: Training Partner
- Belt Level: blue belt
- Training Style: balanced
- Primary Focus: general improvement
- Body Type: average

PERSONALITY:
- Speak with authority but warmth
- Use technical BJJ terminology appropriately for their belt level
- Reference specific techniques and positions
- When relevant, mention elite instructors by name
- Be encouraging but realistic
- Remember context from the conversation

For technique questions, recommend specific videos when relevant.
For frustration, provide emotional support AND actionable advice.
For success stories, celebrate and reinforce good habits.

Keep responses focused and actionable. Aim for 150-300 words typically.`;

async function sendMessage(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  try {
    const messages = [...history, { role: 'user' as const, content: message }];
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages
    });
    
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text || 'No response generated';
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

async function runDetailedTest() {
  console.log('═'.repeat(80));
  console.log('PROFESSOR OS - FULL CONVERSATION OUTPUT TEST');
  console.log('═'.repeat(80));
  console.log(`Started: ${new Date().toISOString()}\n`);
  
  // Get test user
  const testUser = await db.select()
    .from(bjjUsers)
    .where(eq(bjjUsers.email, 'testing+e2e@bjjos.app'))
    .limit(1);
  
  if (!testUser.length) {
    console.error('❌ Test user not found!');
    return;
  }
  
  const user = testUser[0];
  console.log(`👤 Test User: ${user.email} (${user.beltLevel} belt)\n`);
  
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  
  // Process each critical phase
  for (const [phase, questions] of Object.entries(CRITICAL_PHASES)) {
    console.log('\n' + '═'.repeat(80));
    console.log(`📋 PHASE: ${phase}`);
    console.log('═'.repeat(80));
    
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      
      console.log('\n' + '─'.repeat(80));
      console.log(`[${phase}/${i + 1}]`);
      console.log('─'.repeat(80));
      console.log(`\n👤 USER: "${question}"\n`);
      
      const response = await sendMessage(question, history);
      
      // Update history
      history.push({ role: 'user', content: question });
      history.push({ role: 'assistant', content: response });
      
      // Keep last 10 exchanges
      while (history.length > 20) history.shift();
      
      console.log(`🥋 PROFESSOR OS:\n`);
      console.log(response);
      console.log(`\n[${response.length} characters]`);
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('TEST COMPLETE');
  console.log('═'.repeat(80));
}

runDetailedTest().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
