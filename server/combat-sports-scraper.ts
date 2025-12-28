import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import snoowrap from 'snoowrap';
import { OpenAI } from 'openai';
import { db } from './db';
import { combatSportsNews, scraperHealth, bjjReferenceData } from '../shared/schema';
import { eq, and, lt, gt, desc, sql } from 'drizzle-orm';

const rssParser = new Parser();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// BJJ Sources Configuration - Verified working RSS feeds + Official sources
const BJJ_SOURCES = {
  rss: [
    {
      name: 'BJJ Heroes News',
      url: 'https://www.bjjheroes.com/feed',
      sport: 'bjj',
      priority: 'high'
    },
    {
      name: 'BJJEE',
      url: 'https://www.bjjee.com/feed/',
      sport: 'bjj',
      priority: 'high'
    },
    {
      name: 'Grappling Insider',
      url: 'https://grapplinginsider.com/feed/',
      sport: 'bjj',
      priority: 'high'
    },
    {
      name: 'Jits Magazine',
      url: 'https://jitsmagazine.com/feed/',
      sport: 'bjj',
      priority: 'medium'
    }
  ],
  // Official competition sources (HTML scraping)
  html: [
    {
      name: 'IBJJF News',
      url: 'https://ibjjf.com/news',
      sport: 'bjj',
      priority: 'high',
      scrapeMethod: 'ibjjf'
    },
    {
      name: 'ADCC News',
      url: 'https://adcombat.com/news/',
      sport: 'bjj', 
      priority: 'high',
      scrapeMethod: 'adcc'
    }
  ]
};

// MMA/UFC Sources Configuration - Verified working RSS feeds
const MMA_SOURCES = {
  rss: [
    {
      name: 'UFC News',
      url: 'https://www.ufc.com/rss/news',
      sport: 'mma',
      priority: 'high'
    },
    {
      name: 'MMA Fighting',
      url: 'https://www.mmafighting.com/rss/index.xml',
      sport: 'mma',
      priority: 'high'
    },
    {
      name: 'MMA News',
      url: 'https://www.mmanews.com/feed',
      sport: 'mma',
      priority: 'medium'
    }
  ]
};

export class CombatSportsScraper {
  private scrapedToday: number = 0;
  private errors: string[] = [];

  // Main scraping orchestrator
  async scrapeAll() {
    console.log('🔍 [SCRAPER] Starting daily combat sports scrape...');
    
    const results = {
      success: [] as string[],
      failed: [] as { name: string; error: string }[],
      totalArticles: 0
    };

    // Scrape BJJ RSS feeds
    for (const source of BJJ_SOURCES.rss) {
      try {
        console.log(`[SCRAPER] Scraping RSS: ${source.name}`);
        const articles = await this.scrapeRSS(source);
        
        for (const article of articles) {
          await this.processArticle(article, source.name, 'rss', source.sport);
        }
        
        results.success.push(source.name);
        results.totalArticles += articles.length;
        
        await this.updateScraperHealth(source.name, true, articles.length);
      } catch (error: any) {
        console.error(`[SCRAPER] Failed to scrape ${source.name}:`, error.message);
        results.failed.push({ name: source.name, error: error.message });
        await this.updateScraperHealth(source.name, false, 0, error.message);
      }
      
      // Rate limiting (be nice to servers)
      await this.sleep(2000);
    }

    // Scrape MMA RSS feeds
    for (const source of MMA_SOURCES.rss) {
      try {
        console.log(`[SCRAPER] Scraping RSS: ${source.name}`);
        const articles = await this.scrapeRSS(source);
        
        for (const article of articles) {
          await this.processArticle(article, source.name, 'rss', source.sport);
        }
        
        results.success.push(source.name);
        results.totalArticles += articles.length;
        
        await this.updateScraperHealth(source.name, true, articles.length);
      } catch (error: any) {
        console.error(`[SCRAPER] Failed to scrape ${source.name}:`, error.message);
        results.failed.push({ name: source.name, error: error.message });
        await this.updateScraperHealth(source.name, false, 0, error.message);
      }
      
      await this.sleep(2000);
    }

    // Scrape official BJJ competition sources (IBJJF, ADCC)
    for (const source of BJJ_SOURCES.html) {
      try {
        console.log(`[SCRAPER] Scraping HTML: ${source.name}`);
        const articles = await this.scrapeOfficialSource(source);
        
        for (const article of articles) {
          await this.processArticle(article, source.name, 'html_scrape', source.sport);
        }
        
        results.success.push(source.name);
        results.totalArticles += articles.length;
        
        await this.updateScraperHealth(source.name, true, articles.length);
      } catch (error: any) {
        console.error(`[SCRAPER] Failed to scrape ${source.name}:`, error.message);
        results.failed.push({ name: source.name, error: error.message });
        await this.updateScraperHealth(source.name, false, 0, error.message);
      }
      
      await this.sleep(3000); // Be extra nice to official sites
    }

    // Run smart retention cleanup
    await this.runSmartRetentionCleanup();

    console.log(`✅ [SCRAPER] Scrape complete. Success: ${results.success.length}, Failed: ${results.failed.length}, Total articles: ${results.totalArticles}`);
    
    return results;
  }

  // Scrape RSS feeds
  private async scrapeRSS(source: any): Promise<any[]> {
    const feed = await rssParser.parseURL(source.url);
    const articles: any[] = [];

    for (const item of feed.items.slice(0, 10)) { // Get latest 10 items
      articles.push({
        title: item.title || '',
        summary: item.contentSnippet || item.content || '',
        fullContent: item.content || item.contentSnippet || '',
        url: item.link || '',
        publishedDate: item.pubDate ? new Date(item.pubDate) : new Date()
      });
    }

    return articles;
  }

  // Scrape HTML websites (generic)
  private async scrapeHTML(source: any): Promise<any[]> {
    const response = await fetch(source.url);
    const html = await response.text();
    const $ = cheerio.load(html);
    const articles: any[] = [];

    $(source.selectors.events).each((index, element) => {
      const title = $(element).find(source.selectors.title).text().trim();
      const date = $(element).find(source.selectors.date).text().trim();
      
      if (title) {
        articles.push({
          title,
          summary: `Event on ${date}`,
          url: source.url,
          publishedDate: new Date()
        });
      }
    });

    return articles;
  }

  // Scrape official BJJ competition sources (IBJJF, ADCC)
  private async scrapeOfficialSource(source: any): Promise<any[]> {
    try {
      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BJJNewsBot/1.0)'
        }
      });
      
      if (!response.ok) {
        console.log(`[SCRAPER] ${source.name} returned ${response.status}, skipping`);
        return [];
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      const articles: any[] = [];

      if (source.scrapeMethod === 'ibjjf') {
        // IBJJF news page structure - look for news items/articles
        $('article, .news-item, .post, [class*="news"]').each((_, el) => {
          const title = $(el).find('h2, h3, .title, a').first().text().trim();
          const link = $(el).find('a').first().attr('href');
          const summary = $(el).find('p, .excerpt, .summary').first().text().trim();
          
          if (title && title.length > 10) {
            const fullUrl = link?.startsWith('http') ? link : `https://ibjjf.com${link}`;
            articles.push({
              title,
              summary: summary || title,
              fullContent: summary,
              url: fullUrl || source.url,
              publishedDate: new Date()
            });
          }
        });
      } else if (source.scrapeMethod === 'adcc') {
        // ADCC news page structure
        $('article, .news-item, .post, [class*="news"], .entry').each((_, el) => {
          const title = $(el).find('h2, h3, .entry-title, a').first().text().trim();
          const link = $(el).find('a').first().attr('href');
          const summary = $(el).find('p, .excerpt, .entry-content').first().text().trim();
          
          if (title && title.length > 10) {
            const fullUrl = link?.startsWith('http') ? link : `https://adcombat.com${link}`;
            articles.push({
              title,
              summary: summary || title,
              fullContent: summary,
              url: fullUrl || source.url,
              publishedDate: new Date()
            });
          }
        });
      }

      console.log(`[SCRAPER] Found ${articles.length} articles from ${source.name}`);
      return articles.slice(0, 10); // Limit to 10 most recent
    } catch (error: any) {
      console.error(`[SCRAPER] Error scraping ${source.name}:`, error.message);
      return [];
    }
  }

  // Smart retention cleanup - expire items based on importance score
  private async runSmartRetentionCleanup(): Promise<void> {
    console.log('[SCRAPER] Running smart retention cleanup...');
    
    try {
      const now = new Date();
      
      // Delete expired non-permanent items
      const deleted = await db.delete(combatSportsNews)
        .where(
          and(
            eq(combatSportsNews.isPermanent, false),
            lt(combatSportsNews.expiresAt, now)
          )
        );
      
      // Count remaining items by category
      const stats = await db.select({
        isPermanent: combatSportsNews.isPermanent,
        count: sql<number>`count(*)::int`
      })
        .from(combatSportsNews)
        .groupBy(combatSportsNews.isPermanent);
      
      const permanent = stats.find(s => s.isPermanent)?.count || 0;
      const temporary = stats.find(s => !s.isPermanent)?.count || 0;
      
      console.log(`[SCRAPER] Cleanup complete. Permanent: ${permanent}, Temporary: ${temporary}`);
    } catch (error: any) {
      console.error('[SCRAPER] Cleanup error:', error.message);
    }
  }

  // Process and store article
  private async processArticle(article: any, sourceName: string, sourceType: string, sport: string) {
    try {
      // Check if article already exists
      const existing = await db.select().from(combatSportsNews).where(eq(combatSportsNews.url, article.url)).limit(1);
      
      if (existing.length > 0) {
        console.log(`[SCRAPER] Skipping duplicate article: ${article.title}`);
        return;
      }

      // Generate embedding using OpenAI
      const embedding = await this.generateEmbedding(article.title + ' ' + article.summary);

      // Extract entities using AI (enhanced with event type classification)
      const entities = await this.extractEntities(article.title + ' ' + article.summary, sport);

      // Calculate importance score with smart retention
      const { score: importanceScore, isPermanent, expiresAt } = this.calculateImportanceScore(article, entities);
      const recencyScore = this.calculateRecencyScore(article.publishedDate);

      // Store in database with smart retention fields
      await db.insert(combatSportsNews).values({
        title: article.title,
        summary: article.summary?.substring(0, 500), // Limit summary length
        fullContent: article.fullContent,
        url: article.url,
        embedding: embedding as any,
        sport,
        contentType: this.classifyContentType(article.title, article.summary),
        athletes: entities.athletes,
        competitions: entities.competitions,
        techniques: entities.techniques,
        gyms: entities.gyms,
        sourceName,
        sourceType,
        scrapedAt: new Date(),
        publishedDate: article.publishedDate,
        importanceScore,
        recencyScore,
        // Smart Retention V2 fields
        eventType: entities.eventType,
        isPermanent,
        expiresAt,
        isVerified: false,
        isDuplicate: false
      });

      console.log(`[SCRAPER] ✅ Stored article: ${article.title}`);
      this.scrapedToday++;
    } catch (error: any) {
      console.error(`[SCRAPER] Error processing article:`, error.message);
      this.errors.push(error.message);
    }
  }

  // Generate OpenAI embedding for semantic search
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.substring(0, 8000) // Limit input length
      });

      return response.data[0].embedding;
    } catch (error: any) {
      console.error(`[SCRAPER] Embedding error:`, error.message);
      return [];
    }
  }

  // Extract entities (athletes, techniques, competitions) using AI - Enhanced with event type classification
  private async extractEntities(text: string, sport: string): Promise<any> {
    try {
      const prompt = `Extract entities and classify this ${sport} news article. Return JSON with these keys:
- athletes: array of athlete names
- competitions: array of competition names like "ADCC 2024", "IBJJF Worlds 2024", "UFC 300"
- techniques: array of BJJ/MMA techniques mentioned
- gyms: array of gym/team names
- event_type: one of "tournament_result" (winners, medals, match results), "event_announcement" (upcoming events), "ranking_change" (ranking updates), "technique_news" (technique analysis/breakdowns), "general" (other news)
- is_major_result: boolean, true if this is about a major competition result (ADCC, IBJJF Worlds/Pans/Euros, major MMA title fight)

Article: ${text.substring(0, 1000)}

Return only valid JSON, no other text.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });

      const content = response.choices[0].message.content || '{}';
      const entities = JSON.parse(content);

      return {
        athletes: entities.athletes || [],
        competitions: entities.competitions || [],
        techniques: entities.techniques || [],
        gyms: entities.gyms || [],
        eventType: entities.event_type || 'general',
        isMajorResult: entities.is_major_result || false
      };
    } catch (error: any) {
      console.error(`[SCRAPER] Entity extraction error:`, error.message);
      return { athletes: [], competitions: [], techniques: [], gyms: [], eventType: 'general', isMajorResult: false };
    }
  }

  // Classify content type
  private classifyContentType(title: string, summary: string): string {
    const text = (title + ' ' + summary).toLowerCase();
    
    if (text.includes('championship') || text.includes('tournament') || text.includes('won') || text.includes('defeated')) {
      return 'competition_result';
    } else if (text.includes('interview') || text.includes('talks about') || text.includes('discusses')) {
      return 'athlete_interview';
    } else if (text.includes('technique') || text.includes('breakdown') || text.includes('how to')) {
      return 'technique_breakdown';
    } else {
      return 'news';
    }
  }

  // Calculate importance score (1-10) with smart retention logic
  private calculateImportanceScore(article: any, entities: any): { score: number; isPermanent: boolean; expiresAt: Date | null } {
    let score = 3; // Base score for general news

    // Major athletes list
    const majorAthletes = ['Gordon Ryan', 'Roger Gracie', 'Marcelo Garcia', 'John Danaher', 'Rickson Gracie', 
      'Andre Galvao', 'Felipe Pena', 'Marcus Buchecha', 'Kaynan Duarte', 'Nicholas Meregali', 
      'Mikey Musumeci', 'Mica Galvao', 'Kade Ruotolo', 'Tye Ruotolo', 'Giancarlo Bodoni',
      'Craig Jones', 'Nicky Ryan', 'Garry Tonon', 'Lachlan Giles', 'Ffion Davies'];
    
    // Major competitions
    const majorCompetitions = ['ADCC', 'IBJJF Worlds', 'World Championship', 'Pans', 'Pan American', 
      'European', 'Euros', 'UFC Championship', 'WNO Championship'];

    // EVENT TYPE SCORING
    if (entities.eventType === 'tournament_result') {
      score = 7; // Tournament results start at 7
      
      // Major competition results = 10 (permanent)
      if (entities.isMajorResult || entities.competitions.some((comp: string) => 
          majorCompetitions.some(major => comp.toLowerCase().includes(major.toLowerCase())))) {
        score = 10;
      }
    } else if (entities.eventType === 'event_announcement') {
      score = 6;
      // Major event announcements = 8 (permanent)
      if (entities.competitions.some((comp: string) => 
          majorCompetitions.some(major => comp.toLowerCase().includes(major.toLowerCase())))) {
        score = 8;
      }
    } else if (entities.eventType === 'ranking_change') {
      score = 7;
    } else if (entities.eventType === 'technique_news') {
      score = 5;
    }

    // ATHLETE BOOST
    if (entities.athletes.some((athlete: string) => 
        majorAthletes.some(major => athlete.toLowerCase().includes(major.toLowerCase())))) {
      score = Math.min(score + 1, 10);
    }

    // TITLE KEYWORDS BOOST
    const title = article.title.toLowerCase();
    if (title.includes('champion') || title.includes('gold medal') || title.includes('wins adcc') || title.includes('wins worlds')) {
      score = Math.min(score + 1, 10);
    }

    // DETERMINE PERMANENCE AND EXPIRY
    let isPermanent = false;
    let expiresAt: Date | null = null;

    if (score >= 8) {
      // Score 8-10: Permanent - NEVER expires
      isPermanent = true;
      expiresAt = null;
    } else if (score === 7) {
      // Score 7: Keep 90 days
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);
    } else if (score >= 5) {
      // Score 5-6: Keep 60 days
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);
    } else {
      // Score 3-4: Keep 30 days
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
    }

    return { score, isPermanent, expiresAt };
  }

  // Calculate recency score (decays over time)
  private calculateRecencyScore(publishedDate: Date): number {
    const now = new Date();
    const ageInDays = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (ageInDays < 1) return 100;
    if (ageInDays < 7) return 90;
    if (ageInDays < 14) return 70;
    if (ageInDays < 30) return 50;
    if (ageInDays < 60) return 30;
    return 10;
  }

  // Update scraper health monitoring
  private async updateScraperHealth(sourceName: string, success: boolean, articlesScraped: number, error?: string) {
    try {
      const existing = await db.select().from(scraperHealth).where(eq(scraperHealth.sourceName, sourceName)).limit(1);

      if (existing.length > 0) {
        await db.update(scraperHealth)
          .set({
            lastSuccessfulScrape: success ? new Date() : existing[0].lastSuccessfulScrape,
            lastFailedScrape: success ? existing[0].lastFailedScrape : new Date(),
            failureCount: success ? 0 : (existing[0].failureCount || 0) + 1,
            lastError: error || existing[0].lastError,
            articlesScrapedToday: (existing[0].articlesScrapedToday || 0) + articlesScraped,
            isHealthy: success && ((existing[0].failureCount || 0) < 5)
          })
          .where(eq(scraperHealth.sourceName, sourceName));
      } else {
        await db.insert(scraperHealth).values({
          sourceName,
          lastSuccessfulScrape: success ? new Date() : null,
          lastFailedScrape: success ? null : new Date(),
          failureCount: success ? 0 : 1,
          lastError: error,
          articlesScrapedToday: articlesScraped,
          isHealthy: success
        });
      }
    } catch (error: any) {
      console.error(`[SCRAPER] Error updating scraper health:`, error.message);
    }
  }

  // Helper: Sleep function for rate limiting
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Search combat sports news by semantic similarity
  async searchNews(query: string, limit: number = 5): Promise<any[]> {
    try {
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Get all news with embeddings
      const allNews = await db.select().from(combatSportsNews)
        .where(eq(combatSportsNews.isVerified, false)) // Get both verified and unverified
        .limit(100);

      // Calculate cosine similarity manually (since we're using JSONB not pgvector)
      const newsWithScores = allNews
        .filter(news => news.embedding)
        .map(news => {
          const embedding = Array.isArray(news.embedding) ? news.embedding : [];
          const similarity = this.cosineSimilarity(queryEmbedding, embedding);
          return { ...news, similarity };
        })
        .filter(news => news.similarity > 0.7) // High relevance threshold
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      return newsWithScores;
    } catch (error: any) {
      console.error(`[SCRAPER] Search error:`, error.message);
      return [];
    }
  }

  // Calculate cosine similarity between two vectors
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const combatSportsScraper = new CombatSportsScraper();
