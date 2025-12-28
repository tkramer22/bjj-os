import { db } from "./db";
import { 
  userTechniqueRequests, 
  techniqueMetaStatus,
  competitionMeta,
  aiVideoKnowledge 
} from "@shared/schema";
import { eq, sql, and, desc, gte } from "drizzle-orm";

interface TrendSignals {
  techniqueName: string;
  userRequestScore: number;
  competitionMetaScore: number;
  overallMetaScore: number;
  metaStatus: "rising" | "hot" | "cooling" | "stable";
}

interface LibraryCoverage {
  techniqueName: string;
  videosInLibrary: number;
  highestQualityScore: number | null;
  coverageAdequate: boolean;
}

interface CurationPriority {
  techniqueName: string;
  priority: number;
  suggestedSearches: string[];
  needsCuration: boolean;
}

export class MetaAnalyzer {
  
  /**
   * Calculate user request score for a technique (0-10 scale)
   * Based on frequency and recency of user requests
   */
  private async calculateUserRequestScore(techniqueName: string): Promise<number> {
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Count requests in different time windows
    const [recentRequests] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userTechniqueRequests)
      .where(
        and(
          sql`LOWER(${userTechniqueRequests.techniqueMentioned}) LIKE LOWER(${`%${techniqueName}%`})`,
          gte(userTechniqueRequests.requestedAt, last7Days)
        )
      );
    
    const [monthlyRequests] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userTechniqueRequests)
      .where(
        and(
          sql`LOWER(${userTechniqueRequests.techniqueMentioned}) LIKE LOWER(${`%${techniqueName}%`})`,
          gte(userTechniqueRequests.requestedAt, last30Days)
        )
      );
    
    const recent7DayCount = recentRequests?.count || 0;
    const monthly30DayCount = monthlyRequests?.count || 0;
    
    // Weight recent requests more heavily
    // 1-2 requests in last 7 days = ~3-5 score
    // 3-5 requests in last 7 days = ~6-8 score
    // 6+ requests in last 7 days = ~9-10 score
    const recentWeight = Math.min(recent7DayCount * 1.5, 7);
    const monthlyWeight = Math.min(monthly30DayCount * 0.3, 3);
    
    return Math.min(recentWeight + monthlyWeight, 10);
  }
  
  /**
   * Calculate competition meta score from existing competitionMeta data
   */
  private async calculateCompetitionMetaScore(techniqueName: string): Promise<number> {
    // Get recent competition meta entries
    const recentMeta = await db
      .select()
      .from(competitionMeta)
      .orderBy(desc(competitionMeta.analysisDate))
      .limit(5);
    
    if (recentMeta.length === 0) return 0;
    
    let score = 0;
    
    // Parse hot techniques from JSON strings
    for (const meta of recentMeta) {
      try {
        const hotTechniques = JSON.parse(meta.hotTechniques) as string[];
        if (hotTechniques.some(t => t.toLowerCase().includes(techniqueName.toLowerCase()))) {
          score += 2; // Each mention in hot techniques adds 2 points
        }
      } catch (e) {
        console.error("Error parsing hot techniques:", e);
      }
    }
    
    return Math.min(score, 10);
  }
  
  /**
   * Determine meta status based on score changes over time
   */
  private determineMetaStatus(
    currentScore: number,
    previousScore: number
  ): "rising" | "hot" | "cooling" | "stable" {
    const change = currentScore - previousScore;
    
    if (currentScore >= 8) return "hot";
    if (change >= 2) return "rising";
    if (change <= -2) return "cooling";
    return "stable";
  }
  
  /**
   * Analyze library coverage for a technique
   * AGGRESSIVE GROWTH MODE: Target 3,000 total videos (~130 per technique)
   */
  private async analyzeLibraryCoverage(techniqueName: string): Promise<LibraryCoverage> {
    const videos = await db
      .select({
        id: aiVideoKnowledge.id,
        qualityScore: aiVideoKnowledge.qualityScore,
      })
      .from(aiVideoKnowledge)
      .where(
        and(
          sql`LOWER(${aiVideoKnowledge.techniqueName}) LIKE LOWER(${`%${techniqueName}%`})`,
          eq(aiVideoKnowledge.status, 'active')
        )
      );
    
    const videosInLibrary = videos.length;
    const highestQualityScore = videos.length > 0 
      ? Math.max(...videos.map(v => Number(v.qualityScore || 0))) 
      : null;
    
    // AGGRESSIVE GROWTH MODE - Target 3,000 total videos
    // 3,000 videos ÷ 23 techniques = ~130 videos per technique
    // Coverage is adequate only if: >= 100 videos AND quality >= 7.5
    const TARGET_VIDEOS_PER_TECHNIQUE = 100;
    const MIN_QUALITY_THRESHOLD = 7.5;
    
    const coverageAdequate = videosInLibrary >= TARGET_VIDEOS_PER_TECHNIQUE 
      && (highestQualityScore || 0) >= MIN_QUALITY_THRESHOLD;
    
    return {
      techniqueName,
      videosInLibrary,
      highestQualityScore,
      coverageAdequate,
    };
  }
  
  /**
   * Calculate curation priority (1-10) based on meta signals and coverage
   * AGGRESSIVE GROWTH MODE: Target 100+ videos per technique
   */
  private calculateCurationPriority(
    metaScore: number,
    coverage: LibraryCoverage
  ): CurationPriority {
    let priority = 0;
    let needsCuration = false;
    
    const TARGET_VIDEOS = 100;
    const videosNeeded = Math.max(0, TARGET_VIDEOS - coverage.videosInLibrary);
    
    // AGGRESSIVE GROWTH MODE: All techniques under 100 videos need curation
    if (!coverage.coverageAdequate) {
      needsCuration = true;
      
      // Priority based on how far from target + meta score
      // More videos needed = higher priority
      const gapScore = Math.min(10, (videosNeeded / 10)); // 0-100 videos needed → 0-10 score
      const metaBonus = Math.min(5, metaScore / 2); // Meta score adds up to 5 bonus
      
      priority = Math.min(10, Math.round(gapScore + metaBonus));
      
      // Ensure minimum priority of 3 for any technique needing curation
      if (priority < 3) priority = 3;
      
      // Boost priority for techniques with very few videos
      if (coverage.videosInLibrary < 20) {
        priority = Math.min(10, priority + 2);
      }
      if (coverage.videosInLibrary === 0) {
        priority = 10; // Empty techniques always max priority
      }
    }
    
    // Generate search queries
    const suggestedSearches = this.generateSearchQueries(
      coverage.techniqueName,
      coverage.videosInLibrary
    );
    
    return {
      techniqueName: coverage.techniqueName,
      priority,
      suggestedSearches,
      needsCuration,
    };
  }
  
  /**
   * Generate smart search queries for a technique
   */
  private generateSearchQueries(techniqueName: string, existingVideoCount: number): string[] {
    const queries: string[] = [];
    
    // Base technique search
    queries.push(`${techniqueName} bjj technique`);
    
    // If we have few videos, cast a wider net
    if (existingVideoCount < 2) {
      queries.push(`${techniqueName} tutorial`);
      queries.push(`how to do ${techniqueName}`);
      queries.push(`${techniqueName} step by step`);
    }
    
    // Add advanced variations if we already have basics covered
    if (existingVideoCount >= 2) {
      queries.push(`${techniqueName} advanced details`);
      queries.push(`${techniqueName} common mistakes`);
      queries.push(`${techniqueName} variations`);
    }
    
    // Add gi/nogi specific searches
    queries.push(`${techniqueName} gi`);
    queries.push(`${techniqueName} no gi`);
    
    return queries;
  }
  
  /**
   * Main analysis function: Update meta status for all techniques with signals
   */
  async analyzeTechniqueMetaStatus(): Promise<void> {
    console.log("[META ANALYZER] Starting technique meta analysis...");
    
    // Get all unique technique mentions from user requests
    const userRequestedTechniques = await db
      .selectDistinct({ techniqueName: userTechniqueRequests.techniqueMentioned })
      .from(userTechniqueRequests);
    
    // Get all unique techniques from competition meta
    const competitionTechniques = await db
      .selectDistinct({ techniqueName: sql<string>`jsonb_array_elements_text(hot_techniques::jsonb)` })
      .from(competitionMeta);
    
    // Combine all unique techniques
    const allTechniques = new Set<string>();
    userRequestedTechniques.forEach((t: any) => allTechniques.add(t.techniqueName));
    competitionTechniques.forEach((t: any) => allTechniques.add(t.techniqueName));
    
    const techniquesArray = Array.from(allTechniques);
    console.log(`[META ANALYZER] Analyzing ${techniquesArray.length} unique techniques...`);
    
    for (const technique of techniquesArray) {
      // Calculate trend scores
      const userRequestScore = await this.calculateUserRequestScore(technique);
      const competitionMetaScore = await this.calculateCompetitionMetaScore(technique);
      
      // Overall meta score (weighted average: 60% user requests, 40% competition meta)
      const overallMetaScore = (userRequestScore * 0.6) + (competitionMetaScore * 0.4);
      
      // Get previous status to determine trend direction
      const [previousStatus] = await db
        .select()
        .from(techniqueMetaStatus)
        .where(eq(techniqueMetaStatus.techniqueName, technique))
        .limit(1);
      
      const previousScore = previousStatus ? Number(previousStatus.overallMetaScore) : 0;
      const metaStatus = this.determineMetaStatus(overallMetaScore, previousScore);
      
      // Analyze library coverage
      const coverage = await this.analyzeLibraryCoverage(technique);
      
      // Calculate curation priority
      const curationInfo = this.calculateCurationPriority(overallMetaScore, coverage);
      
      // Upsert technique meta status
      await db
        .insert(techniqueMetaStatus)
        .values({
          techniqueName: technique,
          userRequestScore: userRequestScore.toFixed(2),
          competitionMetaScore: competitionMetaScore.toFixed(2),
          overallMetaScore: overallMetaScore.toFixed(2),
          metaStatus,
          videosInLibrary: coverage.videosInLibrary,
          highestQualityVideoScore: coverage.highestQualityScore?.toFixed(2) || null,
          coverageAdequate: coverage.coverageAdequate,
          needsCuration: curationInfo.needsCuration,
          curationPriority: curationInfo.priority,
          suggestedSearches: curationInfo.suggestedSearches,
        })
        .onConflictDoUpdate({
          target: techniqueMetaStatus.techniqueName,
          set: {
            userRequestScore: userRequestScore.toFixed(2),
            competitionMetaScore: competitionMetaScore.toFixed(2),
            overallMetaScore: overallMetaScore.toFixed(2),
            metaStatus,
            videosInLibrary: coverage.videosInLibrary,
            highestQualityVideoScore: coverage.highestQualityScore?.toFixed(2) || null,
            coverageAdequate: coverage.coverageAdequate,
            needsCuration: curationInfo.needsCuration,
            curationPriority: curationInfo.priority,
            suggestedSearches: curationInfo.suggestedSearches,
            lastUpdated: sql`NOW()`,
          },
        });
      
      console.log(`[META ANALYZER] ${technique}: score=${overallMetaScore.toFixed(1)}, status=${metaStatus}, priority=${curationInfo.priority}`);
    }
    
    console.log("[META ANALYZER] Analysis complete!");
  }
  
  /**
   * Get top techniques that need curation (sorted by priority)
   */
  async getTopCurationPriorities(limit: number = 10): Promise<any[]> {
    return await db
      .select()
      .from(techniqueMetaStatus)
      .where(eq(techniqueMetaStatus.needsCuration, true))
      .orderBy(desc(techniqueMetaStatus.curationPriority), desc(techniqueMetaStatus.overallMetaScore))
      .limit(limit);
  }
  
  /**
   * Get trending techniques (hot or rising status)
   */
  async getTrendingTechniques(limit: number = 20): Promise<any[]> {
    return await db
      .select()
      .from(techniqueMetaStatus)
      .where(
        sql`${techniqueMetaStatus.metaStatus} IN ('hot', 'rising')`
      )
      .orderBy(desc(techniqueMetaStatus.overallMetaScore))
      .limit(limit);
  }
}

export const metaAnalyzer = new MetaAnalyzer();
