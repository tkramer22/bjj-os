import { db } from './db';
import {
  techniquePopulationStats,
  populationInjuryPatterns,
  techniqueProgressionPathways,
  beltPromotionIndicators,
  userTechniqueEcosystem,
  userInjuryProfile,
  bjjUsers
} from '../shared/schema';
import { eq, sql, and } from 'drizzle-orm';

export class PopulationIntelligenceService {
  
  // Aggregate technique success rates across all users
  async aggregateTechniqueStats() {
    try {
      console.log(`[POPULATION] Aggregating technique statistics...`);
      
      // Get all unique techniques
      const techniques = await db.execute(sql`
        SELECT DISTINCT technique_name 
        FROM user_technique_ecosystem
      `);

      for (const tech of techniques.rows as any[]) {
        const techniqueName = tech.technique_name;
        
        // Get stats for this technique
        const stats = await db.execute(sql`
          SELECT 
            COUNT(DISTINCT user_id) as total_users,
            SUM(attempts) as total_attempts,
            SUM(successes) as total_successes,
            AVG(success_rate) as avg_success_rate,
            AVG(attempts_to_first_success) as avg_attempts_to_first_success
          FROM user_technique_ecosystem
          WHERE technique_name = ${techniqueName}
        `);

        const statRow = stats.rows[0] as any;
        
        // Calculate population success rate
        const populationSuccessRate = statRow.total_successes / (statRow.total_attempts || 1) * 100;

        // Get success rates by belt level
        const beltStats = await this.getTechniqueSuccessByBelt(techniqueName);
        
        // Get success rates by body type
        const bodyTypeStats = await this.getTechniqueSuccessByBodyType(techniqueName);

        // Calculate difficulty score (1-10, based on success rate and abandonment)
        const difficultyScore = this.calculateDifficultyScore(populationSuccessRate);

        // Upsert technique population stats
        const existing = await db.select()
          .from(techniquePopulationStats)
          .where(eq(techniquePopulationStats.techniqueName, techniqueName))
          .limit(1);

        if (existing.length > 0) {
          await db.update(techniquePopulationStats)
            .set({
              totalUsersAttempted: parseInt(statRow.total_users),
              totalAttempts: parseInt(statRow.total_attempts),
              totalSuccesses: parseInt(statRow.total_successes),
              populationSuccessRate: parseFloat(populationSuccessRate.toFixed(2)),
              successByBeltLevel: beltStats,
              successByBodyType: bodyTypeStats,
              avgAttemptsToFirstSuccess: parseFloat(statRow.avg_attempts_to_first_success || 0),
              difficultyScore,
              lastUpdated: new Date()
            })
            .where(eq(techniquePopulationStats.techniqueName, techniqueName));
        } else {
          await db.insert(techniquePopulationStats).values({
            techniqueName,
            totalUsersAttempted: parseInt(statRow.total_users),
            totalAttempts: parseInt(statRow.total_attempts),
            totalSuccesses: parseInt(statRow.total_successes),
            populationSuccessRate: parseFloat(populationSuccessRate.toFixed(2)),
            successByBeltLevel: beltStats,
            successByBodyType: bodyTypeStats,
            avgAttemptsToFirstSuccess: parseFloat(statRow.avg_attempts_to_first_success || 0),
            difficultyScore,
            lastUpdated: new Date()
          });
        }
      }

      console.log(`[POPULATION] ✅ Aggregated stats for ${techniques.rows.length} techniques`);
    } catch (error: any) {
      console.error(`[POPULATION] Error aggregating technique stats:`, error.message);
    }
  }

  // Get technique success rates by belt level
  private async getTechniqueSuccessByBelt(techniqueName: string): Promise<any> {
    const results = await db.execute(sql`
      SELECT 
        u.belt_level,
        AVG(te.success_rate) as avg_success_rate
      FROM user_technique_ecosystem te
      JOIN bjj_users u ON te.user_id = u.id
      WHERE te.technique_name = ${techniqueName}
      AND u.belt_level IS NOT NULL
      GROUP BY u.belt_level
    `);

    const beltStats: any = {};
    for (const row of results.rows as any[]) {
      beltStats[row.belt_level] = parseFloat(row.avg_success_rate || 0);
    }
    return beltStats;
  }

  // Get technique success rates by body type
  private async getTechniqueSuccessByBodyType(techniqueName: string): Promise<any> {
    const results = await db.execute(sql`
      SELECT 
        u.body_type,
        AVG(te.success_rate) as avg_success_rate
      FROM user_technique_ecosystem te
      JOIN bjj_users u ON te.user_id = u.id
      WHERE te.technique_name = ${techniqueName}
      AND u.body_type IS NOT NULL
      GROUP BY u.body_type
    `);

    const bodyTypeStats: any = {};
    for (const row of results.rows as any[]) {
      bodyTypeStats[row.body_type] = parseFloat(row.avg_success_rate || 0);
    }
    return bodyTypeStats;
  }

  // Calculate difficulty score (1-10)
  private calculateDifficultyScore(successRate: number): number {
    if (successRate >= 80) return 2; // Very easy
    if (successRate >= 70) return 3; // Easy
    if (successRate >= 60) return 4; // Moderate-easy
    if (successRate >= 50) return 5; // Moderate
    if (successRate >= 40) return 6; // Moderate-hard
    if (successRate >= 30) return 7; // Hard
    if (successRate >= 20) return 8; // Very hard
    if (successRate >= 10) return 9; // Extremely hard
    return 10; // Nearly impossible
  }

  // Analyze technique progression pathways
  async analyzeTechniquePathways() {
    try {
      console.log(`[POPULATION] Analyzing technique progression pathways...`);
      
      // Get all user technique sequences
      const sequences = await db.execute(sql`
        SELECT 
          te1.technique_name as foundational,
          te2.technique_name as leads_to,
          COUNT(DISTINCT te1.user_id) as users_count,
          AVG(EXTRACT(DAY FROM (te2.first_success_date - te1.first_success_date))) as avg_days_gap
        FROM user_technique_ecosystem te1
        JOIN user_technique_ecosystem te2 ON te1.user_id = te2.user_id
        WHERE te1.first_success_date IS NOT NULL
        AND te2.first_success_date IS NOT NULL
        AND te2.first_success_date > te1.first_success_date
        AND te1.technique_name != te2.technique_name
        GROUP BY te1.technique_name, te2.technique_name
        HAVING COUNT(DISTINCT te1.user_id) >= 3
      `);

      for (const seq of sequences.rows as any[]) {
        // Calculate pathway strength based on user count
        let pathwayStrength = 'weak';
        if (seq.users_count >= 10) pathwayStrength = 'strong';
        else if (seq.users_count >= 5) pathwayStrength = 'moderate';

        // Upsert pathway
        const existing = await db.select()
          .from(techniqueProgressionPathways)
          .where(and(
            eq(techniqueProgressionPathways.foundationalTechnique, seq.foundational),
            eq(techniqueProgressionPathways.leadsToTechnique, seq.leads_to)
          ))
          .limit(1);

        if (existing.length > 0) {
          await db.update(techniqueProgressionPathways)
            .set({
              usersWhoLearnedBoth: parseInt(seq.users_count),
              typicalTimeGapDays: parseInt(seq.avg_days_gap || 0),
              pathwayStrength,
              evidenceCount: parseInt(seq.users_count),
              lastUpdated: new Date()
            })
            .where(eq(techniqueProgressionPathways.id, existing[0].id));
        } else {
          await db.insert(techniqueProgressionPathways).values({
            foundationalTechnique: seq.foundational,
            leadsToTechnique: seq.leads_to,
            usersWhoLearnedBoth: parseInt(seq.users_count),
            typicalTimeGapDays: parseInt(seq.avg_days_gap || 0),
            pathwayStrength,
            evidenceCount: parseInt(seq.users_count),
            lastUpdated: new Date()
          });
        }
      }

      console.log(`[POPULATION] ✅ Analyzed ${sequences.rows.length} technique pathways`);
    } catch (error: any) {
      console.error(`[POPULATION] Error analyzing technique pathways:`, error.message);
    }
  }

  // Analyze belt promotion indicators
  async analyzeBeltPromotionIndicators() {
    try {
      console.log(`[POPULATION] Analyzing belt promotion indicators...`);
      
      const belts = ['white', 'blue', 'purple', 'brown'];
      
      for (const belt of belts) {
        // Get stats for users at this belt level
        const stats = await db.execute(sql`
          SELECT 
            COUNT(DISTINCT te.technique_name) as avg_technique_count,
            AVG(te.success_rate) as avg_success_rate,
            COUNT(DISTINCT te.works_best_from_position) as avg_position_diversity
          FROM user_technique_ecosystem te
          JOIN bjj_users u ON te.user_id = u.id
          WHERE u.belt_level = ${belt}
          AND te.attempts >= 5
        `);

        const statRow = stats.rows[0] as any;

        const nextBelt = this.getNextBelt(belt);

        // Upsert belt promotion indicators
        const existing = await db.select()
          .from(beltPromotionIndicators)
          .where(eq(beltPromotionIndicators.beltLevel, belt))
          .limit(1);

        if (existing.length > 0) {
          await db.update(beltPromotionIndicators)
            .set({
              nextBelt,
              typicalTechniqueCount: parseInt(statRow.avg_technique_count || 0),
              typicalSuccessRate: parseFloat(statRow.avg_success_rate || 0),
              typicalPositionDiversity: parseInt(statRow.avg_position_diversity || 0),
              lastUpdated: new Date()
            })
            .where(eq(beltPromotionIndicators.beltLevel, belt));
        } else {
          await db.insert(beltPromotionIndicators).values({
            beltLevel: belt,
            nextBelt,
            typicalTechniqueCount: parseInt(statRow.avg_technique_count || 0),
            typicalSuccessRate: parseFloat(statRow.avg_success_rate || 0),
            typicalPositionDiversity: parseInt(statRow.avg_position_diversity || 0),
            lastUpdated: new Date()
          });
        }
      }

      console.log(`[POPULATION] ✅ Analyzed belt promotion indicators`);
    } catch (error: any) {
      console.error(`[POPULATION] Error analyzing belt promotion indicators:`, error.message);
    }
  }

  private getNextBelt(currentBelt: string): string {
    const beltProgression: any = {
      'white': 'blue',
      'blue': 'purple',
      'purple': 'brown',
      'brown': 'black'
    };
    return beltProgression[currentBelt] || 'black';
  }

  // Get technique recommendations based on population data
  async getTechniqueRecommendations(userId: string): Promise<string[]> {
    try {
      // Get user's current techniques
      const userTechniques = await db.select()
        .from(userTechniqueEcosystem)
        .where(eq(userTechniqueEcosystem.userId, userId));

      const userTechniqueNames = userTechniques.map(t => t.techniqueName);

      // Find techniques that commonly follow what the user already knows
      const recommendations = await db.execute(sql`
        SELECT DISTINCT tpp.leads_to_technique, tpp.pathway_strength
        FROM technique_progression_pathways tpp
        WHERE tpp.foundational_technique IN (${sql.join(userTechniqueNames.map(t => sql`${t}`), sql`, `)})
        AND tpp.leads_to_technique NOT IN (${sql.join(userTechniqueNames.map(t => sql`${t}`), sql`, `)})
        AND tpp.pathway_strength IN ('strong', 'moderate')
        ORDER BY 
          CASE tpp.pathway_strength 
            WHEN 'strong' THEN 1 
            WHEN 'moderate' THEN 2 
            ELSE 3 
          END
        LIMIT 5
      `);

      return (recommendations.rows as any[]).map(r => r.leads_to_technique);
    } catch (error: any) {
      console.error(`[POPULATION] Error getting technique recommendations:`, error.message);
      return [];
    }
  }

  // Run all population intelligence aggregations
  async runAllAggregations() {
    console.log(`[POPULATION] Starting population intelligence aggregations...`);
    
    await this.aggregateTechniqueStats();
    await this.analyzeTechniquePathways();
    await this.analyzeBeltPromotionIndicators();
    
    console.log(`[POPULATION] ✅ All population intelligence aggregations complete`);
  }
}

export const populationIntelligence = new PopulationIntelligenceService();
