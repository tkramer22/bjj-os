import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { bjjUsers, userLearningProfile, userFeedbackHistory } from "@shared/schema";
import { eq } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

interface UserContext {
  belt: string;
  contentPreference: string;
  style: string;
  focusAreas: string[];
  injuries: string[] | null;
  trainingGoals: string[] | null;
  compete: boolean;
  recentFeedback: any[];
}

// Build comprehensive user context for AI decisions
export async function buildUserContext(phoneNumber: string): Promise<UserContext | null> {
  try {
    // Get user profile
    const user = await db
      .select()
      .from(bjjUsers)
      .where(eq(bjjUsers.phoneNumber, phoneNumber))
      .limit(1)
      .execute();

    if (user.length === 0) return null;

    // Get learning profile
    const profile = await db
      .select()
      .from(userLearningProfile)
      .where(eq(userLearningProfile.userId, user[0].id))
      .limit(1)
      .execute();

    // Get recent feedback (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const feedback = await db
      .select()
      .from(userFeedbackHistory)
      .where(eq(userFeedbackHistory.userId, user[0].id))
      .execute();

    const recentFeedback = feedback.filter(f => 
      new Date(f.createdAt) >= thirtyDaysAgo
    );

    return {
      belt: user[0].beltLevel || 'white',
      contentPreference: user[0].contentPreference || 'MIXED',
      style: user[0].style || 'gi',
      focusAreas: user[0].focusAreas || [],
      injuries: user[0].injuries || null,
      trainingGoals: user[0].trainingGoals || null,
      compete: user[0].competeStatus === 'active_competitor',
      recentFeedback: recentFeedback
    };
  } catch (error: any) {
    console.error("Error building user context:", error.message);
    return null;
  }
}

// Generate context-aware response using Claude
export async function generateContextAwareResponse(
  userContext: UserContext,
  userMessage: string
): Promise<string> {
  const prompt = `You are a BJJ coaching assistant. Respond to this user with full context awareness:

USER CONTEXT:
- Belt: ${userContext.belt}
- Content preference: ${userContext.contentPreference}
- Style: ${userContext.style}
- Focus areas: ${userContext.focusAreas.join(', ')}
${userContext.injuries ? `- Injuries: ${userContext.injuries.join(', ')}` : ''}
${userContext.trainingGoals ? `- Goals: ${userContext.trainingGoals.join(', ')}` : ''}
${userContext.compete ? '- Trains for competition' : '- Trains recreationally'}

RECENT FEEDBACK:
${userContext.recentFeedback.slice(0, 5).map(f => 
  `- ${f.feedbackType}: ${f.videoId}`
).join('\n')}

USER MESSAGE: "${userMessage}"

Generate a personalized response that:
1. Respects their belt level
2. Accounts for injuries (if any)
3. Aligns with their goals
4. Matches their content preference (${userContext.contentPreference})

Keep it concise (2-3 sentences). Be helpful and specific.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const content = message.content[0];
    return content.type === 'text' ? content.text : "I understand. Let me find the right technique for you.";
  } catch (error: any) {
    console.error("Error generating context-aware response:", error.message);
    return "Thanks for your feedback. I'll adjust future recommendations.";
  }
}

// Context-aware technique filtering
export function filterTechniquesForUser(
  techniques: any[],
  userContext: UserContext
): any[] {
  return techniques.filter(tech => {
    // Filter by injuries
    if (userContext.injuries) {
      const injuryKeywords = userContext.injuries.map(i => i.toLowerCase());
      const techLower = tech.title?.toLowerCase() || '';
      
      // Avoid techniques that stress injured areas
      if (injuryKeywords.includes('knee') && techLower.includes('knee')) return false;
      if (injuryKeywords.includes('shoulder') && techLower.includes('shoulder')) return false;
      if (injuryKeywords.includes('neck') && techLower.includes('neck')) return false;
    }

    // Match style preference
    if (userContext.style === 'gi' && tech.title?.toLowerCase().includes('no-gi')) return false;
    if (userContext.style === 'nogi' && tech.title?.toLowerCase().includes('collar')) return false;

    return true;
  });
}
