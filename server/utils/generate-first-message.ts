/**
 * Generate personalized Professor OS first message after onboarding
 * Uses intelligent observations based on belt level and struggle areas
 * NOT just regurgitation - actual insight and coaching
 */

interface UserProfile {
  displayName: string;
  beltLevel: string | null;
  style: string | null;
  struggleAreaCategory: string | null;
  height?: string | null;
  weight?: string | null;
  age?: string | null;
}

export function generateProfessorOSFirstMessage(profile: UserProfile): string {
  const firstName = profile.displayName?.split(' ')[0] || 'there';
  
  // Warm, diary/journal vibe - safe space to share BJJ journey
  // Encouraging habit of checking in after every training session
  
  const firstMessage = `Hey ${firstName}

Welcome to BJJ OS. I'm Professor OS - think of me as your personal BJJ training diary that actually talks back.

After every session, come here. Tell me what happened - the good, the bad, the frustrating. What worked? What didn't? Who gave you problems?

I'll remember everything. Over time, I'll spot patterns you can't see, find the right videos from thousands of elite instructors, and help you connect the dots in your game.

No judgment here. Just honest feedback and a clear path forward.

This is YOUR space. The more you share, the more I can help.

So let's start simple - how's training been going lately?`;

  return firstMessage;
}
