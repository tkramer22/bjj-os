/**
 * Intelligence Enhancer - Injects Combat Sports Intelligence + Advanced Intelligence into Prof. OS
 * 
 * Combines:
 * 1. Combat Sports Intelligence (news, competitions, trending topics)
 * 2. Individual Intelligence (cognitive profiles, technique ecosystems, memory markers)
 * 3. Population Intelligence (technique recommendations, learning pathways)
 */

import { combatSportsScraper } from './combat-sports-scraper';
import { individualIntelligence } from './individual-intelligence';
import { populationIntelligence } from './population-intelligence';
import { db } from './db';
import { sql } from 'drizzle-orm';

export class IntelligenceEnhancer {
  
  /**
   * Build enhanced context for Professor OS chat responses
   * Injects real-time combat sports news + personalized intelligence
   */
  async buildEnhancedContext(userId: string, userMessage: string): Promise<string> {
    let enhancedContext = '';

    try {
      // 1. COMBAT SPORTS INTELLIGENCE
      // Check if user message relates to current events, competitions, or athletes
      const combatSportsContext = await this.getCombatSportsContext(userMessage);
      if (combatSportsContext) {
        enhancedContext += `\n\n**COMBAT SPORTS INTELLIGENCE (Latest News & Competitions):**\n${combatSportsContext}`;
      }

      // 2. INDIVIDUAL INTELLIGENCE
      // Get user's cognitive profile, technique ecosystem, and memory markers
      const individualContext = await individualIntelligence.buildUserContext(userId);
      if (individualContext) {
        enhancedContext += `\n\n**INDIVIDUAL INTELLIGENCE (Personalized Context):**${individualContext}`;
      }

      // 3. POPULATION INTELLIGENCE
      // Get technique recommendations based on population data
      const populationContext = await this.getPopulationContext(userId);
      if (populationContext) {
        enhancedContext += `\n\n**POPULATION INTELLIGENCE (Cross-User Insights):**\n${populationContext}`;
      }

      // 4. SELF-IMPROVEMENT INTELLIGENCE
      // Get coaching intervention outcomes and A/B test insights
      const selfImprovementContext = await this.getSelfImprovementContext(userId);
      if (selfImprovementContext) {
        enhancedContext += `\n\n**SELF-IMPROVEMENT INTELLIGENCE (System Learning):**\n${selfImprovementContext}`;
      }

      return enhancedContext;
    } catch (error: any) {
      console.error('[INTELLIGENCE ENHANCER] Error building enhanced context:', error.message);
      return '';
    }
  }

  /**
   * Get relevant combat sports news based on user message
   */
  private async getCombatSportsContext(userMessage: string): Promise<string> {
    try {
      // Check if message contains athlete names, competition names, or current events keywords
      const keywords = ['adcc', 'ibjjf', 'worlds', 'ufc', 'championship', 'tournament', 'competition'];
      const isRelevant = keywords.some(keyword => userMessage.toLowerCase().includes(keyword));

      if (!isRelevant) {
        return ''; // Don't inject news unless relevant
      }

      // Search for relevant news
      const relevantNews = await combatSportsScraper.searchNews(userMessage, 3);

      if (relevantNews.length === 0) {
        return '';
      }

      // Format news for injection
      let newsContext = '';
      relevantNews.forEach((news, index) => {
        newsContext += `${index + 1}. **${news.title}** (${news.sport.toUpperCase()}, ${this.formatDate(news.publishedDate)})\n`;
        newsContext += `   Summary: ${news.summary}\n`;
        if (news.athletes && news.athletes.length > 0) {
          newsContext += `   Athletes: ${news.athletes.join(', ')}\n`;
        }
        if (news.competitions && news.competitions.length > 0) {
          newsContext += `   Competitions: ${news.competitions.join(', ')}\n`;
        }
        newsContext += `   Source: ${news.sourceName}\n\n`;
      });

      return newsContext;
    } catch (error: any) {
      console.error('[INTELLIGENCE ENHANCER] Error getting combat sports context:', error.message);
      return '';
    }
  }

  /**
   * Get population intelligence recommendations
   */
  private async getPopulationContext(userId: string): Promise<string> {
    try {
      const recommendations = await populationIntelligence.getTechniqueRecommendations(userId);

      if (recommendations.length === 0) {
        return '';
      }

      let context = 'Based on cross-user learning patterns, consider exploring these techniques:\n';
      recommendations.forEach((technique, index) => {
        context += `${index + 1}. ${technique} (commonly learned by users with similar progress)\n`;
      });

      return context;
    } catch (error: any) {
      console.error('[INTELLIGENCE ENHANCER] Error getting population context:', error.message);
      return '';
    }
  }

  /**
   * Get self-improvement intelligence (coaching outcomes and A/B test insights)
   */
  private async getSelfImprovementContext(userId: string): Promise<string> {
    try {
      // Get recent coaching intervention outcomes for this user
      const outcomes = await db.execute(sql`
        SELECT intervention_type, outcome_rating, notes
        FROM coaching_intervention_outcomes
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 5
      `);

      // Get active A/B test variant for this user (if any)
      const abTests = await db.execute(sql`
        SELECT test_name, variant_name, metric_value
        FROM ab_test_assignments
        WHERE user_id = ${userId}
        AND test_active = true
        LIMIT 3
      `);

      if (outcomes.rows.length === 0 && abTests.rows.length === 0) {
        return '';
      }

      let context = '';

      // Add coaching outcomes context
      if (outcomes.rows.length > 0) {
        context += 'Recent coaching intervention effectiveness:\n';
        outcomes.rows.forEach((outcome: any, index: number) => {
          context += `${index + 1}. ${outcome.intervention_type}: ${outcome.outcome_rating}/5`;
          if (outcome.notes) {
            context += ` - ${outcome.notes}`;
          }
          context += '\n';
        });
      }

      // Add A/B test context (if user is in active tests)
      if (abTests.rows.length > 0) {
        if (context) context += '\n';
        context += 'Active optimization tests (for internal tracking only):\n';
        abTests.rows.forEach((test: any, index: number) => {
          context += `${index + 1}. ${test.test_name} - Variant: ${test.variant_name}\n`;
        });
      }

      return context;
    } catch (error: any) {
      console.error('[INTELLIGENCE ENHANCER] Error getting self-improvement context:', error.message);
      return '';
    }
  }

  /**
   * Extract technique mentions and update user's technique ecosystem
   */
  async extractAndTrackTechniques(userId: string, userMessage: string, professorResponse: string) {
    try {
      // Extract technique success/failure mentions
      const successKeywords = ['landed', 'got', 'submitted', 'swept', 'succeeded', 'worked', 'nailed'];
      const failureKeywords = ['failed', 'couldn\'t', 'didn\'t work', 'struggled', 'can\'t get'];

      const messageText = userMessage.toLowerCase();
      
      // Check for success patterns
      for (const keyword of successKeywords) {
        if (messageText.includes(keyword)) {
          // Extract technique name (simple heuristic - would be better with NLP)
          const techniques = this.extractTechniqueNames(userMessage);
          for (const technique of techniques) {
            await individualIntelligence.updateTechniqueEcosystem(userId, technique, true);
          }
          break;
        }
      }

      // Check for failure patterns
      for (const keyword of failureKeywords) {
        if (messageText.includes(keyword)) {
          const techniques = this.extractTechniqueNames(userMessage);
          for (const technique of techniques) {
            await individualIntelligence.updateTechniqueEcosystem(userId, technique, false);
          }
          break;
        }
      }
    } catch (error: any) {
      console.error('[INTELLIGENCE ENHANCER] Error tracking techniques:', error.message);
    }
  }

  /**
   * Simple technique name extraction (heuristic-based)
   * In production, this would use NLP or LLM extraction
   */
  private extractTechniqueNames(text: string): string[] {
    const commonTechniques = [
      'armbar', 'triangle', 'kimura', 'omoplata', 'guillotine',
      'rear naked choke', 'bow and arrow', 'darce', 'anaconda',
      'heel hook', 'kneebar', 'ankle lock', 'toe hold',
      'sweep', 'berimbolo', 'x-guard', 'de la riva',
      'butterfly guard', 'spider guard', 'half guard',
      'mount', 'side control', 'back control', 'knee on belly'
    ];

    const found: string[] = [];
    const lowerText = text.toLowerCase();

    for (const technique of commonTechniques) {
      if (lowerText.includes(technique)) {
        found.push(technique);
      }
    }

    return found;
  }

  /**
   * Trigger pattern detection after conversation
   */
  async triggerPatternDetection(userId: string) {
    try {
      // Run pattern detection asynchronously (don't block response)
      setImmediate(async () => {
        await individualIntelligence.detectPatterns(userId);
      });
    } catch (error: any) {
      console.error('[INTELLIGENCE ENHANCER] Error triggering pattern detection:', error.message);
    }
  }

  /**
   * Update cognitive profile periodically
   */
  async updateCognitiveProfile(userId: string) {
    try {
      // Run cognitive profiling asynchronously (don't block response)
      setImmediate(async () => {
        await individualIntelligence.updateCognitiveProfile(userId);
      });
    } catch (error: any) {
      console.error('[INTELLIGENCE ENHANCER] Error updating cognitive profile:', error.message);
    }
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date | null): string {
    if (!date) return 'Unknown date';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  }
}

export const intelligenceEnhancer = new IntelligenceEnhancer();
