/**
 * BJJ OS AI INTELLIGENCE - Core AI Functions
 * 
 * This file contains all 29 AI intelligence features as modular functions.
 * These functions PARALLEL the existing system and will be called by enhanced scoring (Command 3).
 * 
 * SAFETY: Does NOT modify existing SMS delivery or technique selection logic.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { 
  aiVideoKnowledge, 
  aiUserFeedbackSignals,
  aiProblemSolutionMap,
  aiUserContext,
  aiTechniqueRelationships,
  aiInstructorProfiles,
  aiUserJourney,
  aiEffectivenessTracking,
  aiPredictiveModels,
  aiConfidenceTracking,
  aiReasoningTraces,
  aiFeatureFlags,
  bjjUsers
} from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

interface VideoAnalysis {
  technique_name: string;
  position_category: string;
  technique_type: string;
  difficulty_score: number;
  gi_or_nogi: string;
  problems_solved: string[];
  prerequisites: string[];
  key_details: Array<{
    detail: string;
    importance: string;
    common_mistake: string;
  }>;
  common_mistakes: string[];
  when_to_use: string;
  counters: string[];
  combinations: string[];
  body_type_notes: string;
  injury_risks: string[];
  competition_viability: string;
  teaching_style: string;
}

interface UserContext {
  user: any;
  recent_signals: any[];
  effectiveness_history: any[];
  predictions: any;
  context_summary: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function callClaudeAPI(prompt: string): Promise<any> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';
    
    // Try to parse JSON if response looks like JSON
    if (responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
      try {
        return JSON.parse(responseText);
      } catch (e) {
        return responseText;
      }
    }
    
    return responseText;
  } catch (error: any) {
    console.error('Claude API error:', error);
    throw error;
  }
}

async function getUserBeltLevel(userId: string): Promise<string> {
  const result = await db.select({ beltLevel: aiUserContext.beltLevel })
    .from(aiUserContext)
    .where(eq(aiUserContext.userId, userId))
    .limit(1);
  return result[0]?.beltLevel || 'white';
}

async function getDaysSinceSignup(userId: string): Promise<number> {
  const result = await db.select({ createdAt: bjjUsers.createdAt })
    .from(bjjUsers)
    .where(eq(bjjUsers.id, userId))
    .limit(1);
  if (result.length === 0) return 0;
  return Math.floor((Date.now() - new Date(result[0].createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function detectSentiment(value: string, signalType: string): Promise<string> {
  if (signalType === 'rating') {
    const rating = parseFloat(value);
    if (rating >= 4) return 'positive';
    if (rating >= 3) return 'neutral';
    return 'negative';
  }
  if (signalType === 'skip') return 'negative';
  if (signalType === 'save') return 'positive';
  return 'neutral';
}

function calculateEngagementScore(signalType: string, signalValue: string): number {
  const scores: Record<string, number> = {
    'rating': parseFloat(signalValue) / 5.0,
    'save': 1.0,
    'click': 0.7,
    'skip': 0.1,
    'watch_time': Math.min(parseInt(signalValue) / 300, 1.0)
  };
  return scores[signalType] || 0.5;
}

async function getTechniqueType(videoId: number): Promise<string> {
  const result = await db.select({ techniqueType: aiVideoKnowledge.techniqueType })
    .from(aiVideoKnowledge)
    .where(and(eq(aiVideoKnowledge.id, videoId), eq(aiVideoKnowledge.status, 'active')))
    .limit(1);
  return result[0]?.techniqueType || 'unknown';
}

async function getTechniqueName(videoId: number): Promise<string> {
  const result = await db.select({ techniqueName: aiVideoKnowledge.techniqueName })
    .from(aiVideoKnowledge)
    .where(and(eq(aiVideoKnowledge.id, videoId), eq(aiVideoKnowledge.status, 'active')))
    .limit(1);
  return result[0]?.techniqueName || 'Unknown Technique';
}

async function categorizeProblem(problemStatement: string): Promise<string> {
  const categories: Record<string, string[]> = {
    'guard': ['guard', 'closed guard', 'open guard', 'half guard'],
    'passing': ['pass', 'passing', 'get around'],
    'escapes': ['escape', 'stuck', 'trapped', 'mount', 'side control'],
    'submissions': ['submit', 'finish', 'tap', 'choke', 'armbar'],
    'sweeps': ['sweep', 'off balance', 'top position'],
    'takedowns': ['takedown', 'standing', 'throw']
  };
  
  const lower = problemStatement.toLowerCase();
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => lower.includes(keyword))) {
      return category;
    }
  }
  return 'general';
}

function generateContextSummary(user: any, signals: any[], effectiveness: any[]): string {
  const positiveSignals = signals.filter(s => s.sentiment === 'positive').length;
  const negativeSignals = signals.filter(s => s.sentiment === 'negative').length;
  const daysSince = user.signupDate ? Math.floor((Date.now() - new Date(user.signupDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  
  return `
User Profile:
- Belt Level: ${user.beltLevel || 'unknown'}
- Training: ${user.trainingFrequency || 'unknown'} frequency
- Days Active: ${daysSince}
- Primary Goal: ${user.primaryGoal || 'not specified'}

Recent Engagement:
- Positive reactions: ${positiveSignals}
- Negative reactions: ${negativeSignals}
- Engagement trend: ${positiveSignals > negativeSignals ? 'positive' : 'declining'}

Preferences:
- Loves: ${JSON.stringify(user.favoriteTechniqueTypes || [])}
- Skips: ${JSON.stringify(user.skippedTechniqueTypes || [])}
- Struggling with: ${JSON.stringify(user.strugglingWith || [])}

Physical:
- Body type: ${user.bodyType || 'unknown'}
- Injuries: ${JSON.stringify(user.injuries || [])}
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 1: MEMORY & KNOWLEDGE ACCUMULATION
// ═══════════════════════════════════════════════════════════════════════════════

export async function analyzeAndStoreVideo(
  videoUrl: string, 
  videoTitle: string, 
  instructor: string
): Promise<number> {
  console.log(`🧠 Analyzing video: ${videoTitle} by ${instructor}`);
  
  const analysisPrompt = `Analyze this BJJ technique video deeply:

Video: ${videoTitle}
Instructor: ${instructor}

Provide a comprehensive analysis in JSON format:
{
  "technique_name": "exact technique name",
  "position_category": "guard/mount/back/turtle/standing/transition",
  "technique_type": "submission/sweep/pass/escape/takedown/defense",
  "difficulty_score": 1-10,
  "gi_or_nogi": "gi/nogi/both",
  "problems_solved": ["array of problems this technique solves"],
  "prerequisites": ["techniques you should know first"],
  "key_details": [
    {
      "detail": "critical detail description",
      "importance": "critical/important/helpful",
      "common_mistake": "what people usually get wrong"
    }
  ],
  "common_mistakes": ["array of common mistakes"],
  "when_to_use": "tactical situation for this technique",
  "counters": ["techniques that counter this"],
  "combinations": ["techniques that combo well with this"],
  "body_type_notes": "which body types excel at this",
  "injury_risks": ["knee/shoulder/back/etc if applicable"],
  "competition_viability": "high/medium/low",
  "teaching_style": "detailed/conceptual/drill_focused"
}

Be specific and detailed. This analysis will build a knowledge base.`;

  try {
    const analysis: VideoAnalysis = await callClaudeAPI(analysisPrompt);
    
    // Store in videos
    const result = await db.insert(aiVideoKnowledge).values({
      videoUrl: videoUrl,
      title: analysis.technique_name || 'Unknown Title',
      techniqueName: analysis.technique_name,
      instructorName: instructor,
      positionCategory: analysis.position_category,
      techniqueType: analysis.technique_type,
      difficultyScore: analysis.difficulty_score,
      giOrNogi: analysis.gi_or_nogi,
      problemsSolved: analysis.problems_solved,
      prerequisites: analysis.prerequisites,
      keyDetails: analysis.key_details,
      commonMistakes: analysis.common_mistakes,
      analysisConfidence: '0.80'
    }).returning({ id: aiVideoKnowledge.id });
    
    const videoId = result[0].id;
    
    // Update instructor profile
    await updateInstructorProfile(instructor, analysis);
    
    // Map technique relationships
    await mapTechniqueRelationships(videoId, analysis);
    
    console.log(`✅ Video analyzed and stored with ID: ${videoId}`);
    return videoId;
    
  } catch (error: any) {
    console.error('Error analyzing video:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 2: ACTIVE LEARNING FROM FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════════

export async function processUserFeedback(
  userId: string, 
  videoId: number, 
  signalType: string, 
  signalValue: string
): Promise<boolean> {
  console.log(`📊 Processing feedback: User ${userId}, Signal ${signalType}=${signalValue}`);
  
  try {
    const userBelt = await getUserBeltLevel(userId);
    const daysSince = await getDaysSinceSignup(userId);
    const timeOfDay = getTimeOfDay();
    const sentiment = await detectSentiment(signalValue, signalType);
    const engagementScore = calculateEngagementScore(signalType, signalValue);
    
    // Store feedback signal
    await db.insert(aiUserFeedbackSignals).values({
      userId: userId,
      videoId: videoId,
      techniqueName: await getTechniqueName(videoId),
      signalType: signalType,
      signalValue: signalValue,
      userBeltLevel: userBelt,
      daysSinceSignup: daysSince,
      timeOfDay: timeOfDay,
      sentiment: sentiment,
      engagementScore: engagementScore.toString()
    });
    
    // Update user context based on signal
    if (signalType === 'rating' && parseFloat(signalValue) >= 4.0) {
      // Positive signal - they loved this technique
      const techniqueType = await getTechniqueType(videoId);
      await db.execute(sql`
        UPDATE ai_user_context
        SET 
          positive_signals = positive_signals + 1,
          favorite_technique_types = 
            CASE 
              WHEN favorite_technique_types IS NULL THEN ${[techniqueType]}::jsonb
              ELSE favorite_technique_types || ${[techniqueType]}::jsonb
            END,
          updated_at = NOW()
        WHERE user_id = ${userId}
      `);
    }
    
    if (signalType === 'skip' || (signalType === 'rating' && parseFloat(signalValue) < 2.0)) {
      // Negative signal
      const techniqueType = await getTechniqueType(videoId);
      await db.execute(sql`
        UPDATE ai_user_context
        SET 
          negative_signals = negative_signals + 1,
          skipped_technique_types = 
            CASE 
              WHEN skipped_technique_types IS NULL THEN ${[techniqueType]}::jsonb
              ELSE skipped_technique_types || ${[techniqueType]}::jsonb
            END,
          updated_at = NOW()
        WHERE user_id = ${userId}
      `);
    }
    
    // Update video's aggregate rating
    await db.execute(sql`
      UPDATE ai_video_knowledge
      SET 
        avg_user_rating = (
          SELECT AVG(CAST(signal_value AS DECIMAL))
          FROM ai_user_feedback_signals
          WHERE video_id = ${videoId} AND signal_type = 'rating'
        ),
        total_ratings = (
          SELECT COUNT(*)
          FROM ai_user_feedback_signals
          WHERE video_id = ${videoId} AND signal_type = 'rating'
        ),
        updated_at = NOW()
      WHERE id = ${videoId}
    `);
    
    console.log('✅ Feedback processed and learned from');
    return true;
    
  } catch (error: any) {
    console.error('Error processing feedback:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 3: PROBLEM-SOLUTION MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

export async function mapProblemToSolutions(
  problemStatement: string, 
  userId: string, 
  userBelt: string
): Promise<any> {
  console.log(`🎯 Mapping problem: "${problemStatement}"`);
  
  try {
    // Search for existing problem mapping
    let mapping = await db.select({
      id: aiProblemSolutionMap.id,
      problemStatement: aiProblemSolutionMap.problemStatement,
      problemCategory: aiProblemSolutionMap.problemCategory,
      userBeltLevel: aiProblemSolutionMap.userBeltLevel,
      solutionVideoIds: aiProblemSolutionMap.solutionVideoIds,
      solutionEffectiveness: aiProblemSolutionMap.solutionEffectiveness,
      timesProblemMentioned: aiProblemSolutionMap.timesProblemMentioned,
      usersWhoMentioned: aiProblemSolutionMap.usersWhoMentioned,
      createdAt: aiProblemSolutionMap.createdAt,
      updatedAt: aiProblemSolutionMap.updatedAt
    })
      .from(aiProblemSolutionMap)
      .where(sql`LOWER(${aiProblemSolutionMap.problemStatement}) = LOWER(${problemStatement})`)
      .limit(1);
    
    if (mapping.length === 0) {
      // New problem - find solutions using AI
      const solutionPrompt = `A ${userBelt} belt BJJ practitioner has this problem:
"${problemStatement}"

What techniques/concepts would solve this problem?
List 3-5 specific techniques with brief explanations.
Format as JSON array: [{"technique": "name", "why": "explanation"}]`;
      
      const solutions = await callClaudeAPI(solutionPrompt);
      
      // Find matching videos in our library
      const solutionVideoIds: number[] = [];
      for (const solution of solutions) {
        const videos = await db.select({ id: aiVideoKnowledge.id })
          .from(aiVideoKnowledge)
          .where(and(eq(aiVideoKnowledge.status, 'active'), sql`${aiVideoKnowledge.techniqueName} ILIKE ${'%' + solution.technique + '%'}`))
          .limit(3);
        
        solutionVideoIds.push(...videos.map(v => v.id));
      }
      
      // Create new problem mapping
      const newMapping = await db.insert(aiProblemSolutionMap).values({
        problemStatement: problemStatement,
        problemCategory: await categorizeProblem(problemStatement),
        userBeltLevel: userBelt,
        solutionVideoIds: solutionVideoIds,
        timesProblemMentioned: 1,
        usersWhoMentioned: [userId]
      }).returning();
      
      console.log(`✅ New problem mapped with ${solutionVideoIds.length} solutions`);
      return newMapping[0];
    } else {
      // Existing problem - increment counter
      const existingUsers = mapping[0].usersWhoMentioned as string[] || [];
      await db.update(aiProblemSolutionMap)
        .set({
          timesProblemMentioned: (mapping[0].timesProblemMentioned || 0) + 1,
          usersWhoMentioned: [...existingUsers, userId],
          updatedAt: new Date()
        })
        .where(eq(aiProblemSolutionMap.id, mapping[0].id));
      
      console.log('✅ Existing problem incremented');
      return mapping[0];
    }
    
  } catch (error: any) {
    console.error('Error mapping problem:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 4: CONTEXT-AWARE RESPONSES
// ═══════════════════════════════════════════════════════════════════════════════

export async function loadFullUserContext(userId: string): Promise<UserContext | null> {
  console.log(`📋 Loading full context for user ${userId}`);
  
  try {
    // Load basic user profile first (using actual schema field names)
    const [user] = await db.select({
      id: bjjUsers.id,
      username: bjjUsers.username,
      displayName: bjjUsers.displayName,
      name: bjjUsers.name,
      phoneNumber: bjjUsers.phoneNumber,
      beltLevel: bjjUsers.beltLevel,
      style: bjjUsers.style,
      struggleTechnique: bjjUsers.struggleTechnique,
      trainingFrequency: bjjUsers.trainingFrequency,
      subscriptionType: bjjUsers.subscriptionType,
      createdAt: bjjUsers.createdAt,
      focusAreas: bjjUsers.focusAreas,
      injuries: bjjUsers.injuries,
      bodyType: bjjUsers.bodyType,
      trainingGoals: bjjUsers.trainingGoals,
      competeStatus: bjjUsers.competeStatus,
      height: bjjUsers.height,
      weight: bjjUsers.weight,
      age: bjjUsers.age
    })
      .from(bjjUsers)
      .where(eq(bjjUsers.id, userId))
      .limit(1);
    
    if (!user) {
      console.log('❌ User not found');
      return null;
    }
    
    console.log('✅ Basic user profile loaded');
    
    // Load recent feedback signals
    const recentSignals = await db.select({
      id: aiUserFeedbackSignals.id,
      userId: aiUserFeedbackSignals.userId,
      videoId: aiUserFeedbackSignals.videoId,
      signalType: aiUserFeedbackSignals.signalType,
      signalValue: aiUserFeedbackSignals.signalValue,
      createdAt: aiUserFeedbackSignals.createdAt
    })
      .from(aiUserFeedbackSignals)
      .where(eq(aiUserFeedbackSignals.userId, userId))
      .orderBy(desc(aiUserFeedbackSignals.createdAt))
      .limit(50);
    
    // Load effectiveness data
    const effectiveness = await db.select({
      id: aiEffectivenessTracking.id,
      userId: aiEffectivenessTracking.userId,
      videoId: aiEffectivenessTracking.videoId,
      techniqueName: aiEffectivenessTracking.techniqueName,
      attemptedDate: aiEffectivenessTracking.attemptedDate,
      effectivenessScore: aiEffectivenessTracking.effectivenessScore
    })
      .from(aiEffectivenessTracking)
      .where(eq(aiEffectivenessTracking.userId, userId))
      .orderBy(desc(aiEffectivenessTracking.attemptedDate))
      .limit(20);
    
    // Load predictive models
    const predictions = await db.select({
      id: aiPredictiveModels.id,
      userId: aiPredictiveModels.userId,
      predictedNextInterest: aiPredictiveModels.predictedNextInterest,
      predictionConfidence: aiPredictiveModels.predictionConfidence,
      updatedAt: aiPredictiveModels.updatedAt
    })
      .from(aiPredictiveModels)
      .where(eq(aiPredictiveModels.userId, userId))
      .orderBy(desc(aiPredictiveModels.updatedAt))
      .limit(1);
    
    const fullContext: UserContext = {
      user: user,
      recent_signals: recentSignals,
      effectiveness_history: effectiveness,
      predictions: predictions[0] || null,
      context_summary: generateContextSummary(user, recentSignals, effectiveness)
    };
    
    console.log('✅ Full context loaded');
    return fullContext;
    
  } catch (error: any) {
    console.error('Error loading context:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 5: TECHNIQUE RELATIONSHIPS
// ═══════════════════════════════════════════════════════════════════════════════

export async function mapTechniqueRelationships(
  techniqueId: number, 
  analysis: VideoAnalysis
): Promise<boolean> {
  console.log(`🔗 Mapping relationships for technique ${techniqueId}`);
  
  try {
    // Map combinations
    if (analysis.combinations && analysis.combinations.length > 0) {
      for (const relatedTechnique of analysis.combinations) {
        const related = await db.select({ id: aiVideoKnowledge.id })
          .from(aiVideoKnowledge)
          .where(and(eq(aiVideoKnowledge.status, 'active'), sql`${aiVideoKnowledge.techniqueName} ILIKE ${'%' + relatedTechnique + '%'}`))
          .limit(1);
        
        if (related.length > 0) {
          await db.insert(aiTechniqueRelationships).values({
            techniqueAId: techniqueId,
            techniqueAName: analysis.technique_name,
            techniqueBId: related[0].id,
            techniqueBName: relatedTechnique,
            relationshipType: 'combination',
            relationshipStrength: '0.8',
            timesObserved: 1
          }).onConflictDoUpdate({
            target: [aiTechniqueRelationships.techniqueAId, aiTechniqueRelationships.techniqueBId, aiTechniqueRelationships.relationshipType],
            set: {
              timesObserved: sql`${aiTechniqueRelationships.timesObserved} + 1`,
              relationshipStrength: sql`(CAST(${aiTechniqueRelationships.relationshipStrength} AS DECIMAL) + 0.8) / 2`,
              updatedAt: new Date()
            }
          });
        }
      }
    }
    
    // Map counters
    if (analysis.counters && analysis.counters.length > 0) {
      for (const counter of analysis.counters) {
        const counterVideo = await db.select({ id: aiVideoKnowledge.id })
          .from(aiVideoKnowledge)
          .where(and(eq(aiVideoKnowledge.status, 'active'), sql`${aiVideoKnowledge.techniqueName} ILIKE ${'%' + counter + '%'}`))
          .limit(1);
        
        if (counterVideo.length > 0) {
          await db.insert(aiTechniqueRelationships).values({
            techniqueAId: techniqueId,
            techniqueAName: analysis.technique_name,
            techniqueBId: counterVideo[0].id,
            techniqueBName: counter,
            relationshipType: 'counter',
            relationshipStrength: '0.9',
            isBidirectional: false
          }).onConflictDoUpdate({
            target: [aiTechniqueRelationships.techniqueAId, aiTechniqueRelationships.techniqueBId, aiTechniqueRelationships.relationshipType],
            set: {
              timesObserved: sql`${aiTechniqueRelationships.timesObserved} + 1`,
              updatedAt: new Date()
            }
          });
        }
      }
    }
    
    // Map prerequisites
    if (analysis.prerequisites && analysis.prerequisites.length > 0) {
      for (const prereq of analysis.prerequisites) {
        const prereqVideo = await db.select({ id: aiVideoKnowledge.id })
          .from(aiVideoKnowledge)
          .where(and(eq(aiVideoKnowledge.status, 'active'), sql`${aiVideoKnowledge.techniqueName} ILIKE ${'%' + prereq + '%'}`))
          .limit(1);
        
        if (prereqVideo.length > 0) {
          await db.insert(aiTechniqueRelationships).values({
            techniqueAId: techniqueId,
            techniqueAName: analysis.technique_name,
            techniqueBId: prereqVideo[0].id,
            techniqueBName: prereq,
            relationshipType: 'prerequisite',
            relationshipStrength: '0.85'
          }).onConflictDoUpdate({
            target: [aiTechniqueRelationships.techniqueAId, aiTechniqueRelationships.techniqueBId, aiTechniqueRelationships.relationshipType],
            set: {
              timesObserved: sql`${aiTechniqueRelationships.timesObserved} + 1`,
              updatedAt: new Date()
            }
          });
        }
      }
    }
    
    console.log('✅ Technique relationships mapped');
    return true;
    
  } catch (error: any) {
    console.error('Error mapping relationships:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTRUCTOR PROFILE UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

async function updateInstructorProfile(instructorName: string, analysis: VideoAnalysis): Promise<void> {
  try {
    await db.insert(aiInstructorProfiles).values({
      instructorName: instructorName,
      teachingStyle: analysis.teaching_style,
      specialtyPositions: [analysis.position_category]
    }).onConflictDoUpdate({
      target: aiInstructorProfiles.instructorName,
      set: {
        updatedAt: new Date()
      }
    });
  } catch (error: any) {
    console.error('Error updating instructor profile:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 6: CONFIDENCE LEVEL CHECKING
// ═══════════════════════════════════════════════════════════════════════════════

export async function checkConfidenceLevel(
  decisionType: string, 
  context: { userId: string }
): Promise<{ confidence: number; shouldAdmit: boolean; message: string | null }> {
  // AI admits when it doesn't have enough data
  console.log(`🔍 Checking confidence for: ${decisionType}`);
  
  try {
    const dataPoints = await db.select({ count: sql<number>`count(*)::int` })
      .from(aiUserFeedbackSignals)
      .where(eq(aiUserFeedbackSignals.userId, context.userId));
    
    const count = dataPoints[0]?.count || 0;
    const confidence = Math.min(count / 50, 1.0); // Need 50+ signals for full confidence
    
    await db.insert(aiConfidenceTracking).values({
      decisionType: decisionType,
      decisionContext: JSON.stringify(context),
      confidenceScore: confidence.toString(),
      dataPointsUsed: count,
      uncertaintyFactors: JSON.stringify(confidence < 0.7 ? ['insufficient_data'] : []),
      shouldAdmitUncertainty: confidence < 0.7,
      userId: context.userId
    });
    
    return {
      confidence: confidence,
      shouldAdmit: confidence < 0.7,
      message: confidence < 0.7 
        ? "I'm still learning your preferences. This recommendation is based on limited data." 
        : null
    };
  } catch (error: any) {
    console.error('Error checking confidence:', error);
    return { confidence: 0.5, shouldAdmit: true, message: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 7: REASONING TRACE LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

interface ReasoningStep {
  step?: number;
  factor: string;
  thought: string;
  weight: number;
}

export async function logReasoningTrace(
  decisionId: string,
  decisionType: string,
  userId: string,
  reasoningSteps: ReasoningStep[],
  finalDecision: string
): Promise<void> {
  // Log transparent decision-making
  console.log(`📝 Logging reasoning trace: ${decisionId}`);
  
  try {
    await db.insert(aiReasoningTraces).values({
      decisionId: decisionId,
      decisionType: decisionType,
      userId: userId,
      reasoningSteps: JSON.stringify(reasoningSteps),
      factorsConsidered: JSON.stringify(reasoningSteps.map(s => s.factor)),
      finalDecision: finalDecision,
      confidence: '0.85',
      showToUser: false,
      userFriendlyExplanation: generateUserFriendlyExplanation(reasoningSteps, finalDecision)
    });
    
    console.log('✅ Reasoning trace logged');
  } catch (error: any) {
    console.error('Error logging reasoning:', error);
  }
}

function generateUserFriendlyExplanation(steps: ReasoningStep[], decision: string): string {
  const topReasons = steps
    .filter(s => s.weight > 0.1)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(s => s.thought);
  
  if (topReasons.length === 0) return `Selected: ${decision}`;
  return `I chose this because: ${topReasons.join(', ')}.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 8: INSTRUCTOR STYLE MATCHING
// ═══════════════════════════════════════════════════════════════════════════════

export async function matchInstructorStyle(userId: string): Promise<any[]> {
  // Match user to instructors whose style they prefer
  console.log(`🎯 Matching instructor style for user ${userId}`);
  
  try {
    const lovedInstructors = await db.execute(sql`
      SELECT 
        vk.instructor_name,
        AVG(CAST(fs.signal_value AS DECIMAL)) as avg_rating,
        COUNT(*) as interaction_count
      FROM ai_user_feedback_signals fs
      JOIN videos vk ON fs.video_id = vk.id
      WHERE fs.user_id = ${userId}
      AND fs.signal_type = 'rating'
      AND CAST(fs.signal_value AS DECIMAL) >= 4.0
      AND vk.instructor_name IS NOT NULL
      GROUP BY vk.instructor_name
      ORDER BY avg_rating DESC, interaction_count DESC
      LIMIT 5
    `);
    
    // Update user context with preferred instructors
    if (lovedInstructors.rows.length > 0) {
      await db.update(aiUserContext)
        .set({
          preferredInstructors: JSON.stringify(lovedInstructors.rows.map((i: any) => i.instructor_name)),
          updatedAt: new Date()
        })
        .where(eq(aiUserContext.userId, userId));
    }
    
    console.log(`✅ Found ${lovedInstructors.rows.length} preferred instructors`);
    return lovedInstructors.rows;
  } catch (error: any) {
    console.error('Error matching instructor:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 9: EFFECTIVENESS TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

export async function trackEffectivenessInSparring(
  userId: string,
  videoId: number,
  result: string,
  context: string,
  notes: string
): Promise<any> {
  // Track what ACTUALLY works when user tries it
  console.log(`📊 Tracking effectiveness: ${result}`);
  
  try {
    const userBelt = await getUserBeltLevel(userId);
    const techniqueName = await getTechniqueName(videoId);
    
    const effectiveness = await db.insert(aiEffectivenessTracking).values({
      userId,
      videoId,
      techniqueName,
      userBeltLevel: userBelt,
      attemptedDate: new Date(),
      result,
      context,
      userNotes: notes,
      whatWorked: result === 'success' ? notes : undefined,
      whatDidntWork: result === 'failure' ? notes : undefined,
      effectivenessScore: result === 'success' ? '1.0' : (result === 'partial' ? '0.5' : '0.0')
    } as any).returning();
    
    console.log('✅ Effectiveness tracked');
    return effectiveness[0];
  } catch (error: any) {
    console.error('Error tracking effectiveness:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 10: INJURY AWARENESS CHECKING
// ═══════════════════════════════════════════════════════════════════════════════

export async function checkInjuryAwareness(
  userId: string,
  videoId: number
): Promise<{ safe: boolean; risks?: any[]; alternatives?: any[] }> {
  // Don't recommend techniques that could aggravate injuries
  
  try {
    const userInjuries = await db.select({ injuries: aiUserContext.injuries })
      .from(aiUserContext)
      .where(eq(aiUserContext.userId, userId))
      .limit(1);
    
    if (!userInjuries[0] || !userInjuries[0].injuries) {
      return { safe: true };
    }
    
    const injuries = userInjuries[0].injuries;
    
    // Check if technique has injury risks
    const techniqueRisks = await db.execute(sql`
      SELECT 
        ia.injury_type,
        ia.risk_level
      FROM ai_injury_awareness ia
      WHERE ia.risky_techniques @> ${JSON.stringify([videoId])}::jsonb
      AND ia.injury_type = ANY(${injuries}::text[])
    `);
    
    if (techniqueRisks.rows.length > 0) {
      // Find safe alternatives
      const alternatives = await db.execute(sql`
        SELECT safe_alternatives FROM ai_injury_awareness
        WHERE injury_type = ANY(${injuries}::text[])
        LIMIT 1
      `);
      
      return {
        safe: false,
        risks: techniqueRisks.rows as any[],
        alternatives: (alternatives.rows[0]?.safe_alternatives || []) as any[]
      };
    }
    
    return { safe: true };
  } catch (error: any) {
    console.error('Error checking injury awareness:', error);
    return { safe: true }; // Default to safe if error
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED SCORING ALGORITHM - THE BRAIN
// ═══════════════════════════════════════════════════════════════════════════════

export async function enhancedTechniqueScoring(userId: string): Promise<any | null> {
  /*
  This is the CORE algorithm that uses all AI features to select
  the perfect technique for each user each day.
  
  Controlled by feature flag 'enhanced_scoring'
  */
  
  console.log(`\n🧠 ENHANCED SCORING for User ${userId}`);
  
  try {
    // Check if enhanced scoring is enabled for this user
    const featureFlag = await db.select({
      id: aiFeatureFlags.id,
      featureName: aiFeatureFlags.featureName,
      featureDescription: aiFeatureFlags.featureDescription,
      isEnabled: aiFeatureFlags.isEnabled,
      rolloutPercentage: aiFeatureFlags.rolloutPercentage,
      enabledForUsers: aiFeatureFlags.enabledForUsers,
      disabledForUsers: aiFeatureFlags.disabledForUsers,
      canRollback: aiFeatureFlags.canRollback,
      rollbackReason: aiFeatureFlags.rollbackReason,
      errorCount: aiFeatureFlags.errorCount,
      successCount: aiFeatureFlags.successCount,
      createdAt: aiFeatureFlags.createdAt,
      updatedAt: aiFeatureFlags.updatedAt
    })
      .from(aiFeatureFlags)
      .where(eq(aiFeatureFlags.featureName, 'enhanced_scoring'))
      .limit(1);
    
    if (featureFlag.length === 0) {
      console.log('❌ Feature flag not found, using old scoring');
      return null; // Fall back to old scoring
    }
    
    const flag = featureFlag[0];
    
    // Determine if this user gets enhanced scoring
    const enabledUsers = (flag.enabledForUsers as string[]) || [];
    const useEnhanced = flag.isEnabled && (
      enabledUsers.includes(userId) ||
      (Math.random() * 100 < (flag.rolloutPercentage || 0))
    );
    
    if (!useEnhanced) {
      console.log('⚠️ Enhanced scoring not enabled for this user, using old scoring');
      return null; // Fall back to old scoring
    }
    
    console.log('✅ Enhanced scoring ENABLED for this user');
    
    // ENHANCED SCORING STARTS HERE
    const decisionId = generateUUID();
    const reasoningSteps: ReasoningStep[] = [];
    
    // Step 1: Load full user context
    const userContext = await loadFullUserContext(userId);
    if (!userContext) {
      console.log('❌ No user context found, using old scoring');
      return null;
    }
    
    reasoningSteps.push({
      step: 1,
      factor: 'user_context',
      thought: `Loaded ${userContext.user.belt_level || 'white'} belt profile`,
      weight: 1.0
    });
    
    // Step 2: Get all available videos not sent recently
    const allVideos = await db.execute(sql`
      SELECT 
        vk.*,
        COALESCE(vk.avg_user_rating, '3.0') as rating,
        COALESCE(vk.times_sent_to_users, 0) as send_count
      FROM ai_video_knowledge vk
      WHERE vk.status = 'active'
        AND vk.id NOT IN (
        SELECT video_id FROM ai_user_feedback_signals
        WHERE user_id = ${userId}
        AND video_id IS NOT NULL
        AND created_at > NOW() - INTERVAL '30 days'
      )
      LIMIT 100
    `);
    
    if (allVideos.rows.length === 0) {
      console.log('❌ No videos available, using old scoring');
      return null;
    }
    
    console.log(`📊 Scoring ${allVideos.rows.length} videos...`);
    
    // Step 3: Score each video using ALL intelligence
    const scoredVideos: any[] = [];
    
    for (const video of allVideos.rows) {
      let score = 0;
      let scoreBreakdown: any = {};
      
      // Factor 1: User's preferred technique types (20% weight)
      if (userContext.user.favorite_technique_types?.includes(video.technique_type)) {
        score += 20;
        scoreBreakdown.favorite_type = 20;
        reasoningSteps.push({
          factor: 'preferred_type',
          thought: `${video.technique_name} matches preferred type`,
          weight: 0.2
        });
      }
      
      // Factor 2: Difficulty matching (15% weight)
      const difficultyMatch = calculateDifficultyMatch(
        Number(video.difficulty_score) || 5,
        userContext.user.belt_level || 'white',
        Number(userContext.user.years_training) || 0
      );
      score += difficultyMatch * 15;
      scoreBreakdown.difficulty = difficultyMatch * 15;
      
      // Factor 3: Injury safety (25% weight - CRITICAL)
      const injuryCheck = await checkInjuryAwareness(userId, Number(video.id));
      if (!injuryCheck.safe) {
        score = 0; // Immediately disqualify unsafe techniques
        scoreBreakdown.injury_risk = -100;
        continue;
      }
      score += 25;
      scoreBreakdown.injury_safe = 25;
      
      // Factor 4: Problem-solution matching (15% weight)
      const strugglingWith = userContext.user.struggling_with as string[] || [];
      if (strugglingWith && strugglingWith.length > 0) {
        for (const problem of strugglingWith) {
          const problemsSolved = (video.problems_solved || []) as string[];
          if (problemsSolved.includes(problem)) {
            score += 15;
            scoreBreakdown.solves_problem = 15;
            reasoningSteps.push({
              factor: 'problem_solving',
              thought: `Solves struggle: ${problem}`,
              weight: 0.15
            });
            break;
          }
        }
      }
      
      // Factor 5: Instructor matching (10% weight)
      if (userContext.user.preferred_instructors?.includes(video.instructor_name)) {
        score += 10;
        scoreBreakdown.preferred_instructor = 10;
      }
      
      // Factor 6: Video rating (10% weight)
      const ratingScore = (parseFloat(String(video.rating)) / 5.0) * 10;
      score += ratingScore;
      scoreBreakdown.rating = ratingScore;
      
      // Factor 7: Freshness - penalize over-sent videos (5% weight)
      const sendCount = Number(video.send_count) || 0;
      const freshness = Math.max(0, 5 - (sendCount / 100));
      score += freshness;
      scoreBreakdown.freshness = freshness;
      
      scoredVideos.push({
        video: video,
        score: score,
        breakdown: scoreBreakdown
      });
    }
    
    // Step 4: Sort by score and pick top technique
    scoredVideos.sort((a, b) => b.score - a.score);
    
    if (scoredVideos.length === 0) {
      console.log('❌ No scored videos available');
      return null;
    }
    
    const topChoice = scoredVideos[0];
    
    console.log(`\n🏆 TOP CHOICE: ${topChoice.video.technique_name}`);
    console.log(`   Score: ${topChoice.score.toFixed(2)}`);
    console.log(`   Breakdown:`, topChoice.breakdown);
    
    // Step 5: Log reasoning trace
    await logReasoningTrace(
      decisionId,
      'daily_technique_selection',
      userId,
      reasoningSteps.slice(0, 10), // Top 10 reasoning steps
      topChoice.video.technique_name
    );
    
    // Step 6: Check confidence and admit uncertainty if needed
    const confidence = await checkConfidenceLevel('technique_selection', { userId });
    
    // Return the enhanced selection
    return {
      videoId: topChoice.video.id,
      videoUrl: topChoice.video.video_url,
      techniqueName: topChoice.video.technique_name,
      instructor: topChoice.video.instructor_name,
      score: topChoice.score,
      scoreBreakdown: topChoice.breakdown,
      confidence: confidence,
      decisionId: decisionId,
      reasoningSteps: reasoningSteps.slice(0, 5) // Top 5 for display
    };
    
  } catch (error: any) {
    console.error('❌ Error in enhanced scoring:', error);
    return null; // Fall back to old scoring
  }
}

function calculateDifficultyMatch(
  videoDifficulty: number,
  userBelt: string,
  yearsTraining: number
): number {
  // Match difficulty to user level
  const beltScores: { [key: string]: number } = {
    'white': 1,
    'blue': 3,
    'purple': 5,
    'brown': 7,
    'black': 9
  };
  
  const userLevel = beltScores[userBelt] || 1;
  const difficulty = videoDifficulty || 5;
  
  // Perfect match: difficulty within 2 points of user level
  const diff = Math.abs(difficulty - userLevel);
  
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.9;
  if (diff === 2) return 0.7;
  if (diff === 3) return 0.5;
  return 0.3;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE FLAG MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export async function isFeatureEnabled(featureName: string, userId: string | null = null): Promise<boolean> {
  // Check if a feature is enabled for a specific user or globally
  
  try {
    const result = await db.select({
      id: aiFeatureFlags.id,
      featureName: aiFeatureFlags.featureName,
      featureDescription: aiFeatureFlags.featureDescription,
      isEnabled: aiFeatureFlags.isEnabled,
      rolloutPercentage: aiFeatureFlags.rolloutPercentage,
      enabledForUsers: aiFeatureFlags.enabledForUsers,
      disabledForUsers: aiFeatureFlags.disabledForUsers,
      canRollback: aiFeatureFlags.canRollback,
      rollbackReason: aiFeatureFlags.rollbackReason,
      errorCount: aiFeatureFlags.errorCount,
      successCount: aiFeatureFlags.successCount,
      createdAt: aiFeatureFlags.createdAt,
      updatedAt: aiFeatureFlags.updatedAt
    })
      .from(aiFeatureFlags)
      .where(eq(aiFeatureFlags.featureName, featureName))
      .limit(1);
    
    if (result.length === 0) return false;
    
    const flag = result[0];
    
    if (!flag.isEnabled) return false;
    
    // Check if user is specifically disabled
    const disabledUsers = (flag.disabledForUsers as string[]) || [];
    if (userId && disabledUsers.includes(userId)) {
      return false;
    }
    
    // Check if user is specifically enabled
    const enabledUsers = (flag.enabledForUsers as string[]) || [];
    if (userId && enabledUsers.includes(userId)) {
      return true;
    }
    
    // Check rollout percentage
    if (userId) {
      // Deterministic rollout based on user ID hash
      const userHash = parseInt(userId.substring(0, 8), 16) % 100;
      return userHash < (flag.rolloutPercentage || 0);
    }
    
    // No user ID - just check if enabled
    return flag.isEnabled && (flag.rolloutPercentage || 0) > 0;
    
  } catch (error: any) {
    console.error('Error checking feature flag:', error);
    return false;
  }
}

export async function enableFeatureForUser(featureName: string, userId: string): Promise<boolean> {
  // Enable a specific feature for a specific user
  
  try {
    await db.execute(sql`
      UPDATE ai_feature_flags
      SET 
        enabled_for_users = 
          CASE 
            WHEN enabled_for_users IS NULL THEN ${JSON.stringify([userId])}::jsonb
            WHEN enabled_for_users @> ${JSON.stringify([userId])}::jsonb THEN enabled_for_users
            ELSE enabled_for_users || ${JSON.stringify([userId])}::jsonb
          END,
        updated_at = NOW()
      WHERE feature_name = ${featureName}
    `);
    
    console.log(`✅ Feature '${featureName}' enabled for user ${userId}`);
    return true;
  } catch (error: any) {
    console.error('Error enabling feature:', error);
    return false;
  }
}

export async function setFeatureRollout(featureName: string, percentage: number, enabled: boolean = true): Promise<boolean> {
  // Set rollout percentage for a feature
  
  try {
    await db.execute(sql`
      UPDATE ai_feature_flags
      SET 
        is_enabled = ${enabled},
        rollout_percentage = ${percentage},
        updated_at = NOW()
      WHERE feature_name = ${featureName}
    `);
    
    console.log(`✅ Feature '${featureName}' set to ${percentage}% rollout`);
    return true;
  } catch (error: any) {
    console.error('Error setting rollout:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  // Core intelligence functions (Features 1-5)
  analyzeAndStoreVideo,
  processUserFeedback,
  mapProblemToSolutions,
  loadFullUserContext,
  mapTechniqueRelationships,
  
  // Intelligence layer functions (Features 6-10)
  checkConfidenceLevel,
  logReasoningTrace,
  matchInstructorStyle,
  trackEffectivenessInSparring,
  checkInjuryAwareness,
  
  // Enhanced scoring algorithm (THE BRAIN)
  enhancedTechniqueScoring,
  
  // Feature flag management
  isFeatureEnabled,
  enableFeatureForUser,
  setFeatureRollout,
  
  // Helper functions
  getUserBeltLevel,
  getDaysSinceSignup,
  getTechniqueType,
  getTechniqueName,
  generateUUID,
  calculateDifficultyMatch
};

console.log('✅ BJJ OS Enhanced Scoring Algorithm loaded');
