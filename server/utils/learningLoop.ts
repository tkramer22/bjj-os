// ═══════════════════════════════════════════════════════════════
// LEARNING LOOP - Phase 3C
// ═══════════════════════════════════════════════════════════════
// Processes Professor OS conversations and stores insights in database
// for personalized learning and pattern recognition

import { db } from '../db';
import { professorOsInsights } from '@shared/schema';
import type { InsertProfessorOsInsight, ProfessorOsInsight } from '@shared/schema';
import { learningAnalyzer, type ConversationMessage, type AnalysisResult } from './learningAnalyzer';
import { eq, and, desc, sql } from 'drizzle-orm';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ProcessConversationOptions {
  userId: string;
  messages: ConversationMessage[];
  conversationId?: string;
}

export interface InsightSummary {
  topTopics: ProfessorOsInsight[];
  recentBreakthroughs: ProfessorOsInsight[];
  currentStruggles: ProfessorOsInsight[];
  totalInsights: number;
}

// ═══════════════════════════════════════════════════════════════
// MAIN PROCESSING FUNCTION
// ═══════════════════════════════════════════════════════════════

export async function processConversation(
  options: ProcessConversationOptions
): Promise<AnalysisResult> {
  const { userId, messages } = options;
  
  console.log(`[LEARNING LOOP] Processing conversation for user ${userId} (${messages.length} messages)`);
  
  // Analyze conversation
  const analysis = learningAnalyzer.analyzeConversation(messages);
  
  console.log(`[LEARNING LOOP] Analysis complete: ${analysis.topics.length} topics, ${analysis.techniques.length} techniques, sentiment: ${analysis.sentiment.overall}`);
  
  // Store topic insights
  for (const topic of analysis.topics) {
    await upsertTopicInsight(userId, topic.topic, topic.concept, analysis.confidenceScore);
  }
  
  // Store technique insights
  for (const technique of analysis.techniques) {
    await upsertTechniqueInsight(
      userId,
      technique.technique,
      technique.sentiment,
      analysis.confidenceScore
    );
  }
  
  // Store sentiment-based insights
  if (analysis.sentiment.overall !== 'neutral') {
    await upsertSentimentInsight(
      userId,
      analysis.sentiment.overall,
      analysis.sentiment.indicators,
      analysis.confidenceScore
    );
  }
  
  // Store pattern insights
  for (const pattern of analysis.patterns) {
    await upsertPatternInsight(userId, pattern.type, pattern.description, pattern.confidence);
  }
  
  console.log(`[LEARNING LOOP] Insights stored successfully`);
  
  return analysis;
}

// ═══════════════════════════════════════════════════════════════
// UPSERT FUNCTIONS (Create or Update Insights)
// ═══════════════════════════════════════════════════════════════

async function upsertTopicInsight(
  userId: string,
  topic: string,
  concept: string | undefined,
  confidenceScore: number
): Promise<void> {
  try {
    // Check if insight already exists
    const existing = await db
      .select()
      .from(professorOsInsights)
      .where(
        and(
          eq(professorOsInsights.userId, userId),
          eq(professorOsInsights.insightType, 'topic_focus'),
          eq(professorOsInsights.topic, topic)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing insight
      const insight = existing[0];
      await db
        .update(professorOsInsights)
        .set({
          mentionCount: (insight.mentionCount || 0) + 1,
          confidenceScore: Math.min(95, confidenceScore + 5), // Increase confidence
          lastMentioned: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(professorOsInsights.id, insight.id));
      
      console.log(`[LEARNING LOOP] Updated topic insight: ${topic} (count: ${insight.mentionCount! + 1})`);
    } else {
      // Create new insight
      await db.insert(professorOsInsights).values({
        userId,
        insightType: 'topic_focus',
        topic,
        concept: concept || null,
        sentiment: 'neutral',
        mentionCount: 1,
        confidenceScore,
        metadata: { source: 'conversation_analysis' },
        lastMentioned: new Date(),
      });
      
      console.log(`[LEARNING LOOP] Created topic insight: ${topic}`);
    }
  } catch (error) {
    console.error(`[LEARNING LOOP] Error upserting topic insight:`, error);
  }
}

async function upsertTechniqueInsight(
  userId: string,
  technique: string,
  sentiment: 'struggling' | 'neutral' | 'improving',
  confidenceScore: number
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(professorOsInsights)
      .where(
        and(
          eq(professorOsInsights.userId, userId),
          eq(professorOsInsights.insightType, 'technique_mention'),
          eq(professorOsInsights.topic, technique)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      const insight = existing[0];
      await db
        .update(professorOsInsights)
        .set({
          mentionCount: (insight.mentionCount || 0) + 1,
          sentiment, // Update to latest sentiment
          confidenceScore: Math.min(95, confidenceScore + 3),
          lastMentioned: new Date(),
          updatedAt: new Date(),
          metadata: {
            ...insight.metadata as object,
            lastSentiment: sentiment,
            sentimentHistory: [
              ...((insight.metadata as any)?.sentimentHistory || []),
              { sentiment, timestamp: new Date().toISOString() }
            ].slice(-10), // Keep last 10 sentiment records
          },
        })
        .where(eq(professorOsInsights.id, insight.id));
      
      console.log(`[LEARNING LOOP] Updated technique insight: ${technique} (${sentiment})`);
    } else {
      await db.insert(professorOsInsights).values({
        userId,
        insightType: 'technique_mention',
        topic: technique,
        sentiment,
        mentionCount: 1,
        confidenceScore,
        metadata: { 
          source: 'technique_analysis',
          sentimentHistory: [{ sentiment, timestamp: new Date().toISOString() }]
        },
        lastMentioned: new Date(),
      });
      
      console.log(`[LEARNING LOOP] Created technique insight: ${technique}`);
    }
  } catch (error) {
    console.error(`[LEARNING LOOP] Error upserting technique insight:`, error);
  }
}

async function upsertSentimentInsight(
  userId: string,
  sentiment: 'struggling' | 'improving' | 'breakthrough',
  indicators: string[],
  confidenceScore: number
): Promise<void> {
  try {
    const insightType = sentiment === 'breakthrough' ? 'breakthrough' : 'recurring_struggle';
    const topic = sentiment === 'breakthrough' ? 'breakthrough_detected' : 'general_struggle';
    
    // For breakthroughs and struggles, always create new records to track progression
    await db.insert(professorOsInsights).values({
      userId,
      insightType,
      topic,
      sentiment,
      mentionCount: 1,
      confidenceScore,
      metadata: {
        source: 'sentiment_analysis',
        indicators,
        timestamp: new Date().toISOString(),
      },
      lastMentioned: new Date(),
    });
    
    console.log(`[LEARNING LOOP] Created sentiment insight: ${sentiment}`);
  } catch (error) {
    console.error(`[LEARNING LOOP] Error creating sentiment insight:`, error);
  }
}

async function upsertPatternInsight(
  userId: string,
  patternType: string,
  description: string,
  confidence: number
): Promise<void> {
  try {
    await db.insert(professorOsInsights).values({
      userId,
      insightType: 'pattern_detected',
      topic: patternType,
      concept: description,
      sentiment: 'neutral',
      mentionCount: 1,
      confidenceScore: confidence,
      metadata: {
        source: 'pattern_detection',
        description,
        timestamp: new Date().toISOString(),
      },
      lastMentioned: new Date(),
    });
    
    console.log(`[LEARNING LOOP] Created pattern insight: ${patternType}`);
  } catch (error) {
    console.error(`[LEARNING LOOP] Error creating pattern insight:`, error);
  }
}

// ═══════════════════════════════════════════════════════════════
// RETRIEVAL FUNCTIONS (For Prompt Builder)
// ═══════════════════════════════════════════════════════════════

export async function getUserInsightSummary(userId: string): Promise<InsightSummary> {
  try {
    // Get top topics by mention count
    const topTopics = await db
      .select()
      .from(professorOsInsights)
      .where(
        and(
          eq(professorOsInsights.userId, userId),
          eq(professorOsInsights.insightType, 'topic_focus')
        )
      )
      .orderBy(desc(professorOsInsights.mentionCount))
      .limit(5);
    
    // Get recent breakthroughs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentBreakthroughs = await db
      .select()
      .from(professorOsInsights)
      .where(
        and(
          eq(professorOsInsights.userId, userId),
          eq(professorOsInsights.insightType, 'breakthrough'),
          sql`${professorOsInsights.lastMentioned} >= ${thirtyDaysAgo}`
        )
      )
      .orderBy(desc(professorOsInsights.lastMentioned))
      .limit(3);
    
    // Get current struggles (techniques with 'struggling' sentiment)
    const currentStruggles = await db
      .select()
      .from(professorOsInsights)
      .where(
        and(
          eq(professorOsInsights.userId, userId),
          eq(professorOsInsights.insightType, 'technique_mention'),
          eq(professorOsInsights.sentiment, 'struggling')
        )
      )
      .orderBy(desc(professorOsInsights.lastMentioned))
      .limit(3);
    
    // Get total insight count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(professorOsInsights)
      .where(eq(professorOsInsights.userId, userId));
    
    const totalInsights = Number(totalResult[0]?.count || 0);
    
    return {
      topTopics,
      recentBreakthroughs,
      currentStruggles,
      totalInsights,
    };
  } catch (error) {
    console.error(`[LEARNING LOOP] Error getting insight summary:`, error);
    return {
      topTopics: [],
      recentBreakthroughs: [],
      currentStruggles: [],
      totalInsights: 0,
    };
  }
}

export async function getRecentInsights(
  userId: string,
  limit: number = 10
): Promise<ProfessorOsInsight[]> {
  try {
    return await db
      .select()
      .from(professorOsInsights)
      .where(eq(professorOsInsights.userId, userId))
      .orderBy(desc(professorOsInsights.lastMentioned))
      .limit(limit);
  } catch (error) {
    console.error(`[LEARNING LOOP] Error getting recent insights:`, error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

export const learningLoop = {
  processConversation,
  getUserInsightSummary,
  getRecentInsights,
};
