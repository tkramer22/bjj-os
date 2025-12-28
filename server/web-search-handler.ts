/**
 * Web Search Handler for Prof. OS
 * 
 * Handles real-time information retrieval for:
 * - Competition results (IBJJF, ADCC, FloGrappling)
 * - Recent instructor releases (BJJ Fanatics, etc.)
 * - Current BJJ news and trends
 * - Safety/medical information
 */

export interface WebSearchContext {
  query: string;
  searchType: 'competition' | 'instructor_update' | 'news' | 'medical' | 'general';
  allowedDomains?: string[];
}

export interface WebSearchResult {
  shouldSearch: boolean;
  searchType?: string;
  results?: string;
  error?: string;
}

export class WebSearchHandler {
  /**
   * Determine if query needs web search
   */
  shouldUseWebSearch(query: string): WebSearchContext | null {
    const lowerQuery = query.toLowerCase();

    // Competition results
    if (this.isCompetitionQuery(lowerQuery)) {
      return {
        query,
        searchType: 'competition',
        allowedDomains: ['flograppling.com', 'ibjjf.com', 'adcc.com', 'bjjheroes.com']
      };
    }

    // Instructor updates
    if (this.isInstructorUpdateQuery(lowerQuery)) {
      return {
        query,
        searchType: 'instructor_update',
        allowedDomains: ['bjjfanatics.com', 'grapplearts.com']
      };
    }

    // News/trends
    if (this.isNewsQuery(lowerQuery)) {
      return {
        query,
        searchType: 'news',
        allowedDomains: ['flograppling.com', 'bjjee.com', 'bjjheroes.com']
      };
    }

    // Medical/safety (IMPORTANT: Don't give medical advice from ai_video_knowledge alone)
    if (this.isMedicalQuery(lowerQuery)) {
      return {
        query,
        searchType: 'medical',
        allowedDomains: ['mayoclinic.org', 'webmd.com', 'nih.gov']
      };
    }

    return null; // No web search needed
  }

  /**
   * Perform web search (uses Replit's web_search tool)
   */
  async performSearch(context: WebSearchContext): Promise<WebSearchResult> {
    try {
      console.log(`[WEB SEARCH] Searching for: ${context.query} (type: ${context.searchType})`);

      // Build search query with domain focus
      const searchQuery = this.buildSearchQuery(context);

      // Note: In actual implementation, this would call the web_search tool
      // For now, returning placeholder that will be replaced with actual search
      
      return {
        shouldSearch: true,
        searchType: context.searchType,
        results: `Web search would be performed for: "${searchQuery}"`
      };
    } catch (error: any) {
      console.error('[WEB SEARCH] Search failed:', error);
      return {
        shouldSearch: false,
        error: error.message
      };
    }
  }

  /**
   * Build optimized search query
   */
  private buildSearchQuery(context: WebSearchContext): string {
    const { query, searchType, allowedDomains } = context;

    switch (searchType) {
      case 'competition':
        return `${query} ${new Date().getFullYear()} results`;
      
      case 'instructor_update':
        return `${query} new instructional ${new Date().getFullYear()}`;
      
      case 'news':
        return `${query} bjj ${new Date().getFullYear()}`;
      
      case 'medical':
        return `${query} sports injury treatment`;
      
      default:
        return query;
    }
  }

  /**
   * Check if query is about competitions
   */
  private isCompetitionQuery(query: string): boolean {
    const competitionKeywords = [
      'ibjjf', 'adcc', 'worlds', 'pans', 'europeans', 'nogi worlds',
      'who won', 'winner', 'champion', 'tournament results',
      'competition', 'match result'
    ];

    return competitionKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is about instructor updates
   */
  private isInstructorUpdateQuery(query: string): boolean {
    const updateKeywords = [
      'latest instructional', 'new dvd', 'new release',
      'what\'s new from', 'latest from',
      'danaher new', 'gordon ryan new', 'lachlan giles new'
    ];

    return updateKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is about BJJ news
   */
  private isNewsQuery(query: string): boolean {
    const newsKeywords = [
      'trending', 'popular', 'hot topic',
      'what\'s new', 'latest news', 'bjj news',
      'recent', 'this week', 'this month'
    ];

    return newsKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is medical/safety related
   */
  private isMedicalQuery(query: string): boolean {
    const medicalKeywords = [
      'injury', 'hurt', 'pain', 'doctor', 'medical',
      'injured', 'recovering', 'rehab', 'treatment',
      'sprained', 'torn', 'broken'
    ];

    return medicalKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Format web search results for Prof. OS response
   */
  formatSearchResults(context: WebSearchContext, results: string): string {
    switch (context.searchType) {
      case 'competition':
        return `📰 COMPETITION UPDATE:\n${results}\n\nFor technique analysis of what worked in this competition, let me search my video library...`;
      
      case 'instructor_update':
        return `📚 INSTRUCTOR UPDATE:\n${results}\n\nI don't have this in my library yet, but here's what I do have from this instructor...`;
      
      case 'news':
        return `📢 BJJ NEWS:\n${results}\n\nWant to learn the techniques everyone's talking about? Here's what I recommend...`;
      
      case 'medical':
        return `⚠️ IMPORTANT - MEDICAL ADVICE:\n\n${results}\n\n**Please see a sports medicine doctor or physical therapist for proper diagnosis and treatment.**\n\nFor PREVENTION in the future, here are some technique videos that might help...`;
      
      default:
        return results;
    }
  }
}

// Export singleton
export const webSearchHandler = new WebSearchHandler();
