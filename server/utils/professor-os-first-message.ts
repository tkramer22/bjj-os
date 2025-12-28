import { db } from '../db';
import { bjjUsers, aiConversationLearning } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { generateProfessorOSFirstMessage } from './generate-first-message';

/**
 * LAYER 1: FIRST MESSAGE MAGIC
 * Generates a personalized welcome message from Professor OS when user completes onboarding
 * Uses templated intelligent observations - NOT AI generation for consistency and cost
 */

export async function generateFirstMessage(userId: string): Promise<string> {
  // Fetch user's onboarding data
  const user = await db.query.bjjUsers.findFirst({
    where: eq(bjjUsers.id, userId)
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Use templated intelligent observation generator
  const firstMessage = generateProfessorOSFirstMessage({
    displayName: user.displayName || 'there',
    beltLevel: user.beltLevel,
    style: user.style,
    struggleAreaCategory: user.struggleAreaCategory,
    height: user.height,
    weight: user.weight,
    age: user.age
  });
  
  return firstMessage;
}

/**
 * Saves the first message to the conversation history
 */
export async function saveFirstMessage(userId: string, message: string): Promise<void> {
  await db.insert(aiConversationLearning).values({
    userId,
    messageText: message,
    messageType: 'coach_sent',
    containsValuableSignal: false,
    isNoise: false,
    modelUsed: 'claude-sonnet-4',
    conversationTopic: 'first_message_magic'
  });
}

/**
 * Main function: Generate and save first message
 */
export async function triggerFirstMessageMagic(userId: string): Promise<string> {
  console.log(`🎯 [FIRST MESSAGE MAGIC] Generating personalized greeting for user ${userId}`);
  
  const message = await generateFirstMessage(userId);
  await saveFirstMessage(userId, message);
  
  console.log(`✅ [FIRST MESSAGE MAGIC] First message saved to conversation history`);
  return message;
}
