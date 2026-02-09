/**
 * LEARNING ENGINE - Extracts insights from conversations and builds user intelligence
 * 
 * This is the core of the competitive moat:
 * - Individual user learning (remembers everything about each user)
 * - Pattern detection (recurring struggles, improvements, plateaus)
 * - Success correlation (saved videos → technique success) ✅ PHASE 3C
 * - Global aggregate intelligence (community data)
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { aiConversationLearning, bjjUsers, userSavedVideos, aiVideoKnowledge } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Extracted insights from a conversation message
 */
export interface ConversationInsights {
  // Techniques mentioned
  techniques: {
    name: string;
    context: 'asking_about' | 'struggling_with' | 'succeeded_with' | 'wants_to_learn';
    sentiment: 'positive' | 'negative' | 'neutral';
  }[];
  
  // Struggles identified
  struggles: {
    area: string; // e.g., "half guard retention", "triangle finish"
    severity: 'minor' | 'moderate' | 'major';
    recurring: boolean; // Is this mentioned before?
  }[];
  
  // Successes reported
  successes: {
    achievement: string; // e.g., "hit first triangle in sparring"
    technique: string;
    significance: 'small_win' | 'milestone' | 'major_breakthrough';
  }[];
  
  // Injuries mentioned
  injuries: {
    type: string;
    severity: 'minor' | 'moderate' | 'serious';
    status: 'new' | 'ongoing' | 'recovering';
  }[];
  
  // Training context
  trainingContext: {
    frequency?: number; // days per week
    lastTraining?: string; // e.g., "yesterday", "this morning"
    nextCompetition?: string;
    trainingPartners?: string[];
  };
  
  // Emotional state
  emotionalState: 'frustrated' | 'excited' | 'confused' | 'motivated' | 'discouraged' | 'neutral';
  
  // Topic classification
  topic: 'technique_question' | 'progress_update' | 'problem_solving' | 'general_chat' | 'feedback';
  
  // Should we update user profile?
  shouldUpdateProfile: boolean;
  profileUpdates: {
    weakestArea?: string;
    strengths?: string[];
    struggles?: string[];
    goals?: string;
  };
}

/**
 * Pattern detection across conversations
 */
export interface UserPatterns {
  // Recurring struggles (mentioned 3+ times)
  recurringStruggles: {
    issue: string;
    mentionCount: number;
    firstMentioned: Date;
    lastMentioned: Date;
    severity: 'minor' | 'moderate' | 'major';
  }[];
  
  // Improving areas (was struggle, now success)
  improvingAreas: {
    area: string;
    progressIndicator: string;
    timeline: string;
  }[];
  
  // Plateaus (no progress for 4+ weeks)
  plateaus: {
    area: string;
    weeksSinceProgress: number;
  }[];
  
  // Resolved issues (not mentioned in 4+ weeks)
  resolvedIssues: {
    issue: string;
    weeksSinceLastMention: number;
  }[];
  
  // Favorite techniques/positions
  favoritePositions: string[];
  
  // Success rate tracking
  successRates: {
    [technique: string]: {
      attempts: number;
      successes: number;
      rate: number;
    };
  };
}

/**
 * Extract insights from a single message using Claude
 */
export async function extractInsightsFromMessage(
  userId: string,
  messageText: string,
  messageType: 'user_sent' | 'ai_sent'
): Promise<ConversationInsights | null> {
  // Only extract insights from user messages (their input is what reveals learning)
  if (messageType !== 'user_sent') {
    return null;
  }
  
  try {
    console.log(`[LEARNING ENGINE] Extracting insights from user message`);
    
    // Get user profile for context
    const [user] = await db.select({
      beltLevel: bjjUsers.beltLevel,
      style: bjjUsers.style,
      weakestArea: bjjUsers.weakestArea
    })
    .from(bjjUsers)
    .where(eq(bjjUsers.id, userId))
    .limit(1);
    
    // Build prompt for Claude to extract insights
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      temperature: 0.3, // Lower temp for more consistent extraction
      system: `You are an expert at analyzing BJJ conversations to extract learning insights.

Given a user message, extract structured insights about:
1. Techniques mentioned (name, context, sentiment)
2. Struggles identified (area, severity, recurring)
3. Successes reported (achievement, technique, significance)
4. Injuries mentioned (type, severity, status)
5. Training context (frequency, timing, competitions, partners)
6. Emotional state (frustrated, excited, confused, etc.)
7. Topic classification
8. Profile updates needed (weakest area, strengths, struggles, goals)

User context:
- Belt Level: ${user?.beltLevel || 'unknown'}
- Style: ${user?.style || 'unknown'}
- Current weakest area: ${user?.weakestArea || 'unknown'}

Return ONLY a JSON object with this exact structure (no markdown, no explanations):
{
  "techniques": [{"name": "triangle", "context": "asking_about", "sentiment": "neutral"}],
  "struggles": [{"area": "half guard retention", "severity": "moderate", "recurring": false}],
  "successes": [{"achievement": "hit first triangle", "technique": "triangle", "significance": "milestone"}],
  "injuries": [{"type": "sore shoulder", "severity": "minor", "status": "ongoing"}],
  "trainingContext": {"frequency": 3, "lastTraining": "yesterday"},
  "emotionalState": "frustrated",
  "topic": "problem_solving",
  "shouldUpdateProfile": false,
  "profileUpdates": {}
}

If none found for a category, use empty array []. Be conservative - only extract what's explicitly mentioned.`,
      messages: [{
        role: "user",
        content: `Extract insights from this message:\n\n"${messageText}"`
      }]
    });
    
    // Parse Claude's JSON response
    const content = response.content[0];
    if (content.type === 'text') {
      const insights = JSON.parse(content.text);
      console.log(`[LEARNING ENGINE] ✅ Extracted ${insights.techniques?.length || 0} techniques, ${insights.struggles?.length || 0} struggles`);
      return insights;
    }
    
    return null;
  } catch (error: any) {
    console.error('[LEARNING ENGINE] Failed to extract insights:', error.message);
    return null;
  }
}

/**
 * Detect patterns across all user conversations
 */
export async function detectUserPatterns(userId: string): Promise<UserPatterns> {
  console.log(`[LEARNING ENGINE] Detecting patterns for user ${userId}`);
  
  try {
    // Get all conversations with extracted insights
    const conversations = await db.select({
      messageText: aiConversationLearning.messageText,
      extractedInsights: aiConversationLearning.extractedInsights,
      createdAt: aiConversationLearning.createdAt
    })
    .from(aiConversationLearning)
    .where(and(
      eq(aiConversationLearning.userId, userId),
      eq(aiConversationLearning.messageType, 'user_sent'),
      sql`${aiConversationLearning.extractedInsights} IS NOT NULL`
    ))
    .orderBy(desc(aiConversationLearning.createdAt));
    
    // Aggregate struggle mentions
    const struggleCounts: Record<string, { count: number; first: Date; last: Date; severity: string }> = {};
    const successes: string[] = [];
    const techniques: string[] = [];
    
    for (const conv of conversations) {
      const insights = conv.extractedInsights as ConversationInsights;
      
      // Track struggles
      for (const struggle of insights.struggles || []) {
        if (!struggleCounts[struggle.area]) {
          struggleCounts[struggle.area] = {
            count: 0,
            first: conv.createdAt!,
            last: conv.createdAt!,
            severity: struggle.severity
          };
        }
        struggleCounts[struggle.area].count++;
        struggleCounts[struggle.area].last = conv.createdAt!;
      }
      
      // Track successes
      for (const success of insights.successes || []) {
        successes.push(success.technique);
      }
      
      // Track techniques mentioned
      for (const tech of insights.techniques || []) {
        techniques.push(tech.name);
      }
    }
    
    // Build recurring struggles (3+ mentions)
    const recurringStruggles = Object.entries(struggleCounts)
      .filter(([_, data]) => data.count >= 3)
      .map(([issue, data]) => ({
        issue,
        mentionCount: data.count,
        firstMentioned: data.first,
        lastMentioned: data.last,
        severity: data.severity as 'minor' | 'moderate' | 'major'
      }))
      .sort((a, b) => b.mentionCount - a.mentionCount);
    
    // Detect improving areas (mentioned as struggle before, now as success)
    const improvingAreas = successes
      .filter(tech => Object.keys(struggleCounts).some(struggle => struggle.includes(tech)))
      .map(tech => ({
        area: tech,
        progressIndicator: `Was struggling, now succeeding`,
        timeline: 'Recent improvement'
      }));
    
    // Detect plateaus (struggles with no resolution for 4+ weeks)
    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const plateaus = Object.entries(struggleCounts)
      .filter(([issue, data]) => {
        const weeksSince = (now.getTime() - data.last.getTime()) / (7 * 24 * 60 * 60 * 1000);
        return weeksSince >= 4 && !successes.some(s => issue.includes(s));
      })
      .map(([area, data]) => ({
        area,
        weeksSinceProgress: Math.floor((now.getTime() - data.last.getTime()) / (7 * 24 * 60 * 60 * 1000))
      }));
    
    // Detect resolved issues (not mentioned in 4+ weeks)
    const resolvedIssues = Object.entries(struggleCounts)
      .filter(([_, data]) => {
        const weeksSince = (now.getTime() - data.last.getTime()) / (7 * 24 * 60 * 60 * 1000);
        return weeksSince >= 4;
      })
      .map(([issue, data]) => ({
        issue,
        weeksSinceLastMention: Math.floor((now.getTime() - data.last.getTime()) / (7 * 24 * 60 * 60 * 1000))
      }));
    
    // Find favorite positions (most mentioned techniques)
    const techCounts: Record<string, number> = {};
    for (const tech of techniques) {
      techCounts[tech] = (techCounts[tech] || 0) + 1;
    }
    const favoritePositions = Object.entries(techCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tech, _]) => tech);
    
    return {
      recurringStruggles,
      improvingAreas,
      plateaus,
      resolvedIssues,
      favoritePositions,
      successRates: {} // TODO: Implement success rate tracking
    };
  } catch (error: any) {
    console.error('[LEARNING ENGINE] Failed to detect patterns:', error.message);
    return {
      recurringStruggles: [],
      improvingAreas: [],
      plateaus: [],
      resolvedIssues: [],
      favoritePositions: [],
      successRates: {}
    };
  }
}

/**
 * Build comprehensive user context for Professor OS
 * This includes EVERYTHING the AI should know about the user
 */
export async function buildComprehensiveUserContext(userId: string): Promise<string> {
  console.log(`[LEARNING ENGINE] Building comprehensive context for user ${userId}`);
  
  try {
    // 1. Get user profile
    const [user] = await db.select()
      .from(bjjUsers)
      .where(eq(bjjUsers.id, userId))
      .limit(1);
    
    if (!user) {
      return "No user profile found.";
    }
    
    // 2. Get conversation patterns
    const patterns = await detectUserPatterns(userId);
    
    // 3. Get recent conversations (last 20 for deeper context)
    const recentConversations = await db.select({
      messageText: aiConversationLearning.messageText,
      messageType: aiConversationLearning.messageType,
      extractedInsights: aiConversationLearning.extractedInsights,
      createdAt: aiConversationLearning.createdAt
    })
    .from(aiConversationLearning)
    .where(eq(aiConversationLearning.userId, userId))
    .orderBy(desc(aiConversationLearning.createdAt))
    .limit(20);
    
    // 4. Get saved videos
    const savedVideos = await db.select({
      videoId: userSavedVideos.videoId,
      technique: aiVideoKnowledge.techniqueName,
      instructor: aiVideoKnowledge.instructorName,
      savedDate: userSavedVideos.savedDate
    })
    .from(userSavedVideos)
    .innerJoin(aiVideoKnowledge, eq(userSavedVideos.videoId, aiVideoKnowledge.id))
    .where(and(eq(userSavedVideos.userId, userId), eq(aiVideoKnowledge.status, 'active')))
    .orderBy(desc(userSavedVideos.savedDate))
    .limit(10);
    
    // 5. Build context string
    let context = `# USER PROFILE
Username: @${user.username}
Belt Level: ${user.beltLevel?.toUpperCase() || 'UNKNOWN'}
Training Style: ${user.style || 'unknown'}
⚠️ WEAKEST AREA: ${user.weakestArea?.toUpperCase() || 'UNKNOWN'}

# RECURRING PATTERNS (${patterns.recurringStruggles.length} detected)
`;
    
    if (patterns.recurringStruggles.length > 0) {
      for (const struggle of patterns.recurringStruggles.slice(0, 5)) {
        context += `- "${struggle.issue}" (mentioned ${struggle.mentionCount}x, severity: ${struggle.severity})\n`;
      }
    } else {
      context += "No recurring struggles detected yet.\n";
    }
    
    context += `\n# IMPROVING AREAS (${patterns.improvingAreas.length} detected)\n`;
    if (patterns.improvingAreas.length > 0) {
      for (const area of patterns.improvingAreas) {
        context += `- ${area.area}: ${area.progressIndicator}\n`;
      }
    } else {
      context += "No improvement patterns detected yet.\n";
    }
    
    context += `\n# PLATEAUS (${patterns.plateaus.length} detected)\n`;
    if (patterns.plateaus.length > 0) {
      for (const plateau of patterns.plateaus) {
        context += `- ${plateau.area} (${plateau.weeksSinceProgress} weeks without progress)\n`;
      }
    } else {
      context += "No plateaus detected.\n";
    }
    
    context += `\n# FAVORITE POSITIONS\n`;
    if (patterns.favoritePositions.length > 0) {
      context += patterns.favoritePositions.join(', ') + '\n';
    } else {
      context += "Not enough data yet.\n";
    }
    
    context += `\n# SAVED VIDEOS (${savedVideos.length})\n`;
    if (savedVideos.length > 0) {
      for (const video of savedVideos.slice(0, 5)) {
        context += `- ${video.technique} by ${video.instructor}\n`;
      }
    } else {
      context += "No videos saved yet.\n";
    }
    
    context += `\n# CONVERSATION HISTORY SUMMARY\n`;
    context += `Total conversations: ${recentConversations.length}\n`;
    
    // Add last few key moments
    const keyMoments = recentConversations
      .filter(c => c.extractedInsights)
      .slice(0, 3);
    
    if (keyMoments.length > 0) {
      context += `\nRecent key moments:\n`;
      for (const moment of keyMoments) {
        const insights = moment.extractedInsights as ConversationInsights;
        const daysAgo = Math.floor((Date.now() - moment.createdAt!.getTime()) / (24 * 60 * 60 * 1000));
        const timeStr = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
        
        if (insights.successes && insights.successes.length > 0) {
          context += `- ${timeStr}: ${insights.successes[0].achievement}\n`;
        } else if (insights.struggles && insights.struggles.length > 0) {
          context += `- ${timeStr}: Asked about ${insights.struggles[0].area}\n`;
        }
      }
    }
    
    context += `\n# INSTRUCTIONS FOR PROFESSOR OS
1. Reference specific past conversations when relevant ("Remember when you asked about...")
2. Track progress on recurring struggles
3. Celebrate improvements and milestones
4. Prioritize their weakest area in recommendations
5. Use their saved videos as context for what teaching styles work for them
6. Be specific and personal - you know their full training history
`;
    
    return context;
  } catch (error: any) {
    console.error('[LEARNING ENGINE] Failed to build context:', error.message);
    return "Error loading user context.";
  }
}

/**
 * PHASE 3C: SUCCESS CORRELATION
 * Track when users save videos and later mention success with those techniques
 * This creates a powerful feedback loop for video quality
 */
async function detectSuccessCorrelation(userId: string): Promise<{
  correlations: Array<{
    videoId: number;
    videoTitle: string;
    savedDate: Date;
    successMention: string;
    daysBetween: number;
    confidence: 'high' | 'medium' | 'low';
  }>;
  summary: string;
}> {
  try {
    // Get all saved videos for this user
    const savedVideos = await db.select({
      videoId: userSavedVideos.videoId,
      savedDate: userSavedVideos.savedDate,
      technique: aiVideoKnowledge.techniqueName,
      instructor: aiVideoKnowledge.instructorName,
      videoTitle: sql<string>`${aiVideoKnowledge.techniqueName} || ' by ' || ${aiVideoKnowledge.instructorName}`
    })
    .from(userSavedVideos)
    .innerJoin(aiVideoKnowledge, eq(userSavedVideos.videoId, aiVideoKnowledge.id))
    .where(and(eq(userSavedVideos.userId, userId), eq(aiVideoKnowledge.status, 'active')))
    .orderBy(desc(userSavedVideos.savedDate));
    
    if (savedVideos.length === 0) {
      return { correlations: [], summary: "No saved videos yet" };
    }
    
    // Get conversations AFTER each video was saved
    const correlations = [];
    
    for (const video of savedVideos) {
      // Get conversations after this video was saved
      const conversationsAfter = await db.select()
        .from(aiConversationLearning)
        .where(
          and(
            eq(aiConversationLearning.userId, userId),
            sql`${aiConversationLearning.createdAt} > ${video.savedDate}`
          )
        )
        .orderBy(aiConversationLearning.createdAt)
        .limit(50); // Look at next 50 messages
      
      // Check if any success mentions relate to this video's technique
      for (const conv of conversationsAfter) {
        if (!conv.extractedInsights) continue;
        
        const insights = conv.extractedInsights as ConversationInsights;
        
        // Check successes
        for (const success of insights.successes || []) {
          // CRITICAL FIX: Skip if no technique name to avoid false positives
          if (!success.technique || success.technique.trim().length === 0) {
            continue;
          }
          
          const successTechnique = success.technique.toLowerCase();
          const videoTechnique = video.technique.toLowerCase();
          
          // Simple technique name matching (can be improved with fuzzy matching)
          const techniqueMatch = 
            successTechnique.includes(videoTechnique) ||
            videoTechnique.includes(successTechnique);
          
          if (techniqueMatch) {
            const daysBetween = Math.floor(
              (conv.createdAt!.getTime() - video.savedDate.getTime()) / (24 * 60 * 60 * 1000)
            );
            
            // Confidence based on time gap and technique match quality
            let confidence: 'high' | 'medium' | 'low' = 'medium';
            if (daysBetween <= 14 && techniqueMatch) confidence = 'high';
            if (daysBetween > 30) confidence = 'low';
            
            correlations.push({
              videoId: video.videoId,
              videoTitle: video.videoTitle,
              savedDate: video.savedDate,
              successMention: success.achievement,
              daysBetween,
              confidence
            });
          }
        }
      }
    }
    
    // Generate summary
    let summary = '';
    if (correlations.length > 0) {
      const highConfidence = correlations.filter(c => c.confidence === 'high').length;
      summary = `Found ${correlations.length} success correlations (${highConfidence} high confidence). `;
      summary += `Recent example: "${correlations[0].successMention}" after saving "${correlations[0].videoTitle}"`;
    } else {
      summary = `No success correlations detected yet. User has ${savedVideos.length} saved videos.`;
    }
    
    return { correlations, summary };
  } catch (error: any) {
    console.error('[LEARNING ENGINE] Success correlation error:', error.message);
    return { correlations: [], summary: 'Error detecting correlations' };
  }
}

/**
 * PHASE 4A: PLATEAU DETECTION
 * Identify when users are stuck on the same issue for 4+ weeks without progress
 * This enables proactive coaching interventions
 */
async function detectPlateaus(userId: string): Promise<{
  plateaus: Array<{
    issue: string;
    firstMention: Date;
    lastMention: Date;
    weeksDuration: number;
    severity: 'mild' | 'moderate' | 'severe';
    suggestedAction: string;
  }>;
  needsIntervention: boolean;
  interventionMessage?: string;
}> {
  try {
    const patterns = await detectUserPatterns(userId);
    
    const now = new Date();
    const plateaus = [];
    
    // Check recurring struggles that haven't improved
    for (const struggle of patterns.recurringStruggles) {
      const weeksDuration = struggle.weeksSinceFirst;
      
      // Plateau = stuck for 4+ weeks
      if (weeksDuration >= 4) {
        let severity: 'mild' | 'moderate' | 'severe' = 'mild';
        if (weeksDuration >= 8) severity = 'moderate';
        if (weeksDuration >= 12) severity = 'severe';
        
        // Check if there's been ANY success with this
        const hasProgress = patterns.improving.some(imp => 
          imp.area.toLowerCase().includes(struggle.area.toLowerCase())
        );
        
        if (!hasProgress) {
          plateaus.push({
            issue: struggle.area,
            firstMention: struggle.firstMention,
            lastMention: struggle.lastMention,
            weeksDuration,
            severity,
            suggestedAction: getSuggestedAction(struggle.area, weeksDuration)
          });
        }
      }
    }
    
    // Determine if intervention needed
    const needsIntervention = plateaus.some(p => p.severity === 'severe') || 
                             plateaus.filter(p => p.severity === 'moderate').length >= 2;
    
    let interventionMessage = '';
    if (needsIntervention && plateaus.length > 0) {
      const worstPlateau = plateaus.sort((a, b) => b.weeksDuration - a.weeksDuration)[0];
      interventionMessage = `Detected ${plateaus.length} plateau(s). ` +
        `Focus area: "${worstPlateau.issue}" (${worstPlateau.weeksDuration} weeks). ` +
        `Suggestion: ${worstPlateau.suggestedAction}`;
    }
    
    return { plateaus, needsIntervention, interventionMessage };
  } catch (error: any) {
    console.error('[LEARNING ENGINE] Plateau detection error:', error.message);
    return { plateaus: [], needsIntervention: false };
  }
}

function getSuggestedAction(issue: string, weeks: number): string {
  if (weeks >= 12) {
    return `Consider private lesson or workshop on "${issue}" - this has been challenging for 3+ months`;
  } else if (weeks >= 8) {
    return `Try a different approach or instructor for "${issue}" - current method isn't working`;
  } else {
    return `Let's find 2-3 new videos on "${issue}" from different instructors to get fresh perspectives`;
  }
}

/**
 * PHASE 4C: MILESTONE DETECTION
 * Detect and celebrate user achievements (first submission, belt mentions, breakthroughs)
 */
async function detectMilestones(userId: string): Promise<{
  milestones: Array<{
    type: 'first_submission' | 'first_sweep' | 'belt_promotion' | 'competition' | 'breakthrough';
    achievement: string;
    date: Date;
    significance: 'small' | 'medium' | 'major';
  }>;
  recentMilestone?: {
    achievement: string;
    daysAgo: number;
    celebrationSent: boolean;
  };
}> {
  try {
    // Get all conversations with successes
    const conversations = await db.select()
      .from(aiConversationLearning)
      .where(eq(aiConversationLearning.userId, userId))
      .orderBy(aiConversationLearning.createdAt);
    
    const milestones = [];
    const seenTechniques = new Set<string>();
    
    for (const conv of conversations) {
      if (!conv.extractedInsights) continue;
      const insights = conv.extractedInsights as ConversationInsights;
      
      for (const success of insights.successes || []) {
        let milestoneType: 'first_submission' | 'first_sweep' | 'belt_promotion' | 'competition' | 'breakthrough' | null = null;
        let significance = success.significance;
        
        // Detect milestone types
        if (success.achievement.toLowerCase().includes('first') && 
            success.achievement.toLowerCase().includes('submit')) {
          milestoneType = 'first_submission';
          significance = 'major';
        } else if (success.achievement.toLowerCase().includes('first') && 
                   success.achievement.toLowerCase().includes('sweep')) {
          milestoneType = 'first_sweep';
          significance = 'medium';
        } else if (success.achievement.toLowerCase().match(/belt|stripe|promotion/)) {
          milestoneType = 'belt_promotion';
          significance = 'major';
        } else if (success.achievement.toLowerCase().match(/competition|tournament|match/)) {
          milestoneType = 'competition';
          significance = 'major';
        } else if (success.significance === 'major_breakthrough') {
          milestoneType = 'breakthrough';
        }
        
        // Track first-time technique successes
        if (!seenTechniques.has(success.technique.toLowerCase())) {
          seenTechniques.add(success.technique.toLowerCase());
          if (!milestoneType) {
            milestoneType = 'first_submission'; // Default for first-time technique
            significance = 'medium';
          }
        }
        
        if (milestoneType) {
          milestones.push({
            type: milestoneType,
            achievement: success.achievement,
            date: conv.createdAt!,
            significance
          });
        }
      }
    }
    
    // Check most recent milestone
    let recentMilestone = undefined;
    if (milestones.length > 0) {
      const latest = milestones[milestones.length - 1];
      const daysAgo = Math.floor((Date.now() - latest.date.getTime()) / (24 * 60 * 60 * 1000));
      
      if (daysAgo <= 7) { // Within last week
        recentMilestone = {
          achievement: latest.achievement,
          daysAgo,
          celebrationSent: false // TODO: Track this in DB
        };
      }
    }
    
    return { milestones, recentMilestone };
  } catch (error: any) {
    console.error('[LEARNING ENGINE] Milestone detection error:', error.message);
    return { milestones: [] };
  }
}

/**
 * Export singleton instance
 */
export const learningEngine = {
  extractInsights: extractInsightsFromMessage,
  detectPatterns: detectUserPatterns,
  buildContext: buildComprehensiveUserContext,
  detectSuccessCorrelation: detectSuccessCorrelation, // Phase 3C
  detectPlateaus: detectPlateaus, // Phase 4A
  detectMilestones: detectMilestones // Phase 4C
};
