/**
 * Schedulers for BJJ OS Intelligence Systems
 * 
 * Runs daily/periodic tasks for:
 * - Combat Sports scraping
 * - Population intelligence aggregation
 * - Cognitive profile updates
 */

import cron from 'node-cron';
import { combatSportsScraper } from './combat-sports-scraper';
import { populationIntelligence } from './population-intelligence';
import { individualIntelligence } from './individual-intelligence';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { bjjUsers } from '@shared/schema';
import { withMemoryManagement, forceGC, shouldSkipDueToMemory } from './utils/memory-management';

export class IntelligenceSchedulers {
  private tasks: cron.ScheduledTask[] = [];

  /**
   * Start all schedulers
   */
  start() {
    console.log('[SCHEDULERS] Starting all intelligence schedulers...');

    // 1. Daily Combat Sports Scraping (2:00 PM EST) - moved from 6 AM to avoid overnight congestion
    const scrapeTask = cron.schedule('0 14 * * *', async () => {
      if (shouldSkipDueToMemory()) {
        console.log('[SCHEDULER] ⏸️ Skipping combat sports scrape due to memory pressure');
        return;
      }
      console.log('[SCHEDULER] Running daily combat sports scrape...');
      try {
        await withMemoryManagement('Combat Sports Scraping', async () => {
          await combatSportsScraper.scrapeAll();
        });
        console.log('[SCHEDULER] ✅ Combat sports scrape completed');
      } catch (error: any) {
        console.error('[SCHEDULER] ❌ Combat sports scrape failed:', error.message);
        forceGC('Combat Sports Error Recovery');
      }
    }, {
      timezone: 'America/New_York'
    });

    this.tasks.push(scrapeTask);

    // 2. Daily Population Intelligence Aggregation (11:00 AM EST) - moved from 7 AM to avoid overnight congestion
    const aggregateTask = cron.schedule('0 11 * * *', async () => {
      if (shouldSkipDueToMemory()) {
        console.log('[SCHEDULER] ⏸️ Skipping population aggregation due to memory pressure');
        return;
      }
      console.log('[SCHEDULER] Running daily population intelligence aggregation...');
      try {
        await withMemoryManagement('Population Intelligence', async () => {
          await populationIntelligence.runAllAggregations();
        });
        console.log('[SCHEDULER] ✅ Population intelligence aggregation completed');
      } catch (error: any) {
        console.error('[SCHEDULER] ❌ Population intelligence aggregation failed:', error.message);
        forceGC('Population Intelligence Error Recovery');
      }
    }, {
      timezone: 'America/New_York'
    });

    this.tasks.push(aggregateTask);

    // 3. Weekly Cognitive Profile Updates for Active Users (Sunday 8:00 AM EST)
    const cognitiveTask = cron.schedule('0 8 * * 0', async () => {
      if (shouldSkipDueToMemory()) {
        console.log('[SCHEDULER] ⏸️ Skipping cognitive profile updates due to memory pressure');
        return;
      }
      console.log('[SCHEDULER] Running weekly cognitive profile updates...');
      try {
        await withMemoryManagement('Cognitive Profile Updates', async () => {
          // Get active users (users with conversations in last 7 days)
          const activeUsers = await db.execute(sql`
            SELECT DISTINCT user_id 
            FROM ai_conversation_learning
            WHERE created_at >= NOW() - INTERVAL '7 days'
          `);

          let updated = 0;
          for (const user of activeUsers.rows as any[]) {
            try {
              await individualIntelligence.updateCognitiveProfile(user.user_id);
              updated++;
            } catch (error: any) {
              console.error(`[SCHEDULER] Failed to update cognitive profile for user ${user.user_id}:`, error.message);
            }
          }

          console.log(`[SCHEDULER] ✅ Updated cognitive profiles for ${updated} active users`);
        });
      } catch (error: any) {
        console.error('[SCHEDULER] ❌ Cognitive profile updates failed:', error.message);
        forceGC('Cognitive Profile Error Recovery');
      }
    }, {
      timezone: 'America/New_York'
    });

    this.tasks.push(cognitiveTask);

    // 4. Ecosystem Pattern Detection for Active Users (8:00 PM EST)
    // Detects recurring problems, injuries, fatigue, and breakthrough predictions
    const patternTask = cron.schedule('0 20 * * *', async () => {
      if (shouldSkipDueToMemory()) {
        console.log('[SCHEDULER] ⏸️ Skipping pattern detection due to memory pressure');
        return;
      }
      console.log('[SCHEDULER] Running ecosystem pattern detection...');
      try {
        await withMemoryManagement('Ecosystem Pattern Detection', async () => {
          const { runPatternDetection } = await import('./ecosystem-pattern-detection');
          await runPatternDetection();
        });
      } catch (error: any) {
        console.error('[SCHEDULER] ❌ Ecosystem pattern detection failed:', error.message);
        forceGC('Pattern Detection Error Recovery');
      }
    }, {
      timezone: 'America/New_York'
    });

    this.tasks.push(patternTask);

    // 5. Daily Data Aggregation Jobs (1:00 AM EST) - moved from 2 AM to give buffer before 3:15 AM curation
    // Aggregates technique journeys, learning profiles, ecosystem data
    const dataAggregationTask = cron.schedule('0 1 * * *', async () => {
      if (shouldSkipDueToMemory()) {
        console.log('[SCHEDULER] ⏸️ Skipping data aggregation due to memory pressure');
        return;
      }
      console.log('[SCHEDULER] Running daily data aggregation jobs...');
      try {
        await withMemoryManagement('Daily Data Aggregation', async () => {
          const { runAllDailyAggregations } = await import('./utils/data-aggregation');
          await runAllDailyAggregations();
        });
        console.log('[SCHEDULER] ✅ Daily data aggregation completed');
      } catch (error: any) {
        console.error('[SCHEDULER] ❌ Daily data aggregation failed:', error.message);
        forceGC('Data Aggregation Error Recovery');
      }
    }, {
      timezone: 'America/New_York'
    });

    this.tasks.push(dataAggregationTask);

    console.log(`[SCHEDULERS] ✅ Started ${this.tasks.length} schedulers`);
    console.log('[SCHEDULERS] Schedule (STAGGERED for stability):');
    console.log('  - 1:00 AM EST: Daily Data Aggregation (moved from 2 AM)');
    console.log('  - 11:00 AM EST: Daily Population Intelligence Aggregation (moved from 7 AM)');
    console.log('  - 2:00 PM EST: Daily Combat Sports Scraping (moved from 6 AM)');
    console.log('  - 8:00 AM EST (Sunday): Weekly Cognitive Profile Updates');
    console.log('  - 8:00 PM EST: Daily Pattern Detection');
  }

  /**
   * Stop all schedulers
   */
  stop() {
    console.log('[SCHEDULERS] Stopping all schedulers...');
    this.tasks.forEach(task => task.stop());
    this.tasks = [];
    console.log('[SCHEDULERS] ✅ All schedulers stopped');
  }

  /**
   * Manually trigger combat sports scrape (for testing/admin use)
   */
  async triggerScrape() {
    console.log('[SCHEDULERS] Manually triggering combat sports scrape...');
    await combatSportsScraper.scrapeAll();
  }

  /**
   * Manually trigger population aggregation (for testing/admin use)
   */
  async triggerAggregation() {
    console.log('[SCHEDULERS] Manually triggering population intelligence aggregation...');
    await populationIntelligence.runAllAggregations();
  }
}

export const schedulers = new IntelligenceSchedulers();

// Auto-start schedulers when module is imported
// Comment this out in development if you don't want auto-start
// schedulers.start();
