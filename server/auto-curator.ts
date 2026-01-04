import { TechniqueMetaStatus, techniqueMetaStatus } from '@shared/schema';
import { searchYouTubeVideosExtended } from './intelligent-curator';
import { db } from './db';
import { eq } from 'drizzle-orm';

/**
 * Sanitize technique name for YouTube search
 * Replaces underscores with spaces and normalizes the query
 */
function sanitizeSearchQuery(query: string): string {
  return query
    .replace(/_/g, ' ')  // Replace underscores with spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .trim();
}

/**
 * Quick curation with a custom search query
 * Used by Command Center for targeted curation runs
 */
export async function runAutoCurationManually(
  searchQuery: string,
  maxResults: number = 20
): Promise<{ success: boolean; videosAdded: number; error?: string }> {
  try {
    console.log(`[QUICK CURATION] Running manual curation for: "${searchQuery}"`);
    
    const sanitized = sanitizeSearchQuery(searchQuery);
    const videos = await searchYouTubeVideosExtended(sanitized, undefined, maxResults);
    
    console.log(`[QUICK CURATION] Complete: ${videos.length} videos added for "${searchQuery}"`);
    
    return {
      success: true,
      videosAdded: videos.length
    };
  } catch (error: any) {
    console.error('[QUICK CURATION] Error:', error.message);
    return {
      success: false,
      videosAdded: 0,
      error: error.message
    };
  }
}

/**
 * Curate videos based on meta analysis priorities
 * This function automatically searches and curates videos for high-priority techniques
 */
export async function curateVideosFromPriorities(
  priorities: TechniqueMetaStatus[],
  runId?: string
): Promise<{
  searchesPerformed: number;
  videosScreened: number;
  videosAdded: number;
  quotaUsed: number;
}> {
  console.log(`[AUTO CURATOR] PERMANENT AGGRESSIVE MODE: 500 videos per run`);
  console.log(`[AUTO CURATOR] Processing ${priorities.length} priority techniques (10 searches × 50 results)`);
  
  // Import progress logging
  const { logProgress } = await import('./curation-progress');
  
  // PERMANENT: Always use 50 results per search for aggressive mode
  const RESULTS_PER_SEARCH = 50;
  const MAX_SEARCHES = 10;
  const QUOTA_PER_SEARCH = 100; // YouTube API cost per search
  
  let totalSearchesPerformed = 0;
  let totalVideosScreened = 0;
  let totalVideosAdded = 0;
  
  for (const priority of priorities) {
    // Stop if we've already performed 10 searches
    if (totalSearchesPerformed >= MAX_SEARCHES) {
      console.log(`[AUTO CURATOR] Reached maximum of ${MAX_SEARCHES} searches - batch complete`);
      break;
    }
    
    const { techniqueName, suggestedSearches, curationPriority } = priority;
    
    console.log(
      `[AUTO CURATOR] Curating: ${techniqueName} (priority: ${curationPriority})`
    );
    
    // Log progress for this technique
    if (runId) {
      logProgress(runId, `Processing: ${techniqueName}`, '🔄', `Priority: ${curationPriority}`);
    }
    
    // Use suggested searches to find and curate videos
    if (suggestedSearches && suggestedSearches.length > 0) {
      // PERMANENT: For aggressive mode, use all suggested searches up to MAX_SEARCHES limit
      const remainingSearches = MAX_SEARCHES - totalSearchesPerformed;
      const searchLimit = Math.min(suggestedSearches.length, remainingSearches);
      
      for (let i = 0; i < searchLimit; i++) {
        const rawQuery = suggestedSearches[i];
        const searchQuery = sanitizeSearchQuery(rawQuery); // Fix underscore queries for YouTube
        
        try {
          totalSearchesPerformed++;
          console.log(
            `[AUTO CURATOR] Search ${totalSearchesPerformed}/${MAX_SEARCHES}: "${searchQuery}" (${RESULTS_PER_SEARCH} results)`
          );
          
          // Log search progress
          if (runId) {
            logProgress(runId, `Searching YouTube: "${searchQuery}"`, '🔍', `Search ${totalSearchesPerformed}/${MAX_SEARCHES}`);
          }
          
          // PERMANENT: Always use 50 results per search in aggressive mode
          const videos = await searchYouTubeVideosExtended(searchQuery, undefined, RESULTS_PER_SEARCH, undefined, runId);
          
          totalVideosScreened += videos.length;
          totalVideosAdded += videos.length; // searchYouTubeVideosExtended only returns approved videos
          
          console.log(
            `[AUTO CURATOR] Curated ${videos.length} videos for "${searchQuery}"`
          );
          
          // Log results
          if (runId) {
            logProgress(runId, `Found ${videos.length} quality videos`, '✅', `Total added: ${totalVideosAdded}`);
          }
          
          // Add delay between searches to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error: any) {
          // If quota exceeded, stop curation immediately
          if (error.message?.includes('QUOTA_EXCEEDED')) {
            console.error('[AUTO CURATOR] YouTube API quota exceeded - stopping curation batch');
            console.error('[AUTO CURATOR] Quota resets at midnight Pacific Time');
            if (runId) {
              logProgress(runId, 'YouTube API quota exceeded', '⚠️', 'Stopping - quota resets at midnight Pacific');
            }
            break; // Stop searches but return metrics
          }
          
          console.error(
            `[AUTO CURATOR] Error curating "${searchQuery}":`,
            error.message
          );
          
          if (runId) {
            logProgress(runId, `Error: ${error.message}`, '❌', searchQuery);
          }
        }
        
        // Stop if we've reached the search limit
        if (totalSearchesPerformed >= MAX_SEARCHES) {
          break;
        }
      }
    }
  }
  
  const quotaUsed = totalSearchesPerformed * QUOTA_PER_SEARCH;
  
  console.log(`[AUTO CURATOR] Batch complete:`);
  console.log(`  • Searches: ${totalSearchesPerformed}/${MAX_SEARCHES}`);
  console.log(`  • Videos screened: ${totalVideosScreened}`);
  console.log(`  • Videos added: ${totalVideosAdded}`);
  console.log(`  • Quota used: ${quotaUsed} units`);
  
  return {
    searchesPerformed: totalSearchesPerformed,
    videosScreened: totalVideosScreened,
    videosAdded: totalVideosAdded,
    quotaUsed
  };
}

/**
 * Manually trigger curation for a specific technique
 * Fetches suggested searches from meta analyzer and curates using those specific terms
 */
export async function manualCurateTechnique(
  techniqueName: string,
  maxResults: number = 10
): Promise<{ success: boolean; curatedCount: number; searchesPerformed: number; error?: string }> {
  try {
    // Look up the technique to get suggested searches
    const [technique] = await db.select({
      suggestedSearches: techniqueMetaStatus.suggestedSearches,
    })
    .from(techniqueMetaStatus)
    .where(eq(techniqueMetaStatus.techniqueName, techniqueName))
    .limit(1);
    
    let searchTerms: string[] = [];
    
    if (technique && technique.suggestedSearches && technique.suggestedSearches.length > 0) {
      // Use the specific suggested searches from meta analyzer
      searchTerms = technique.suggestedSearches;
    } else {
      // Fallback: Generate basic search terms if no meta data exists
      const sanitizedName = sanitizeSearchQuery(techniqueName);
      searchTerms = [
        `${sanitizedName} bjj technique`,
        `${sanitizedName} jiu jitsu tutorial`,
        `${sanitizedName} instructional`,
      ];
    }
    
    console.log(`[MANUAL CURATE] Starting targeted curation for "${techniqueName}"`);
    console.log(`[MANUAL CURATE] Using ${searchTerms.length} search terms:`, searchTerms);
    
    let totalVideosAdded = 0;
    let searchesPerformed = 0;
    
    // Run each suggested search through the full curation pipeline
    for (const rawQuery of searchTerms) {
      const searchQuery = sanitizeSearchQuery(rawQuery);
      
      try {
        searchesPerformed++;
        console.log(`[MANUAL CURATE] Search ${searchesPerformed}/${searchTerms.length}: "${searchQuery}"`);
        
        // searchYouTubeVideosExtended handles: search → duplicate check → Gemini analysis → add to library
        const videos = await searchYouTubeVideosExtended(searchQuery, undefined, maxResults);
        
        totalVideosAdded += videos.length;
        console.log(`[MANUAL CURATE] Found ${videos.length} qualifying videos for "${searchQuery}"`);
        
        // Brief delay between searches to avoid rate limits
        if (searchesPerformed < searchTerms.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error: any) {
        // If quota exceeded, stop but return partial results
        if (error.message?.includes('QUOTA_EXCEEDED')) {
          console.error('[MANUAL CURATE] YouTube API quota exceeded - stopping');
          break;
        }
        console.error(`[MANUAL CURATE] Error for "${searchQuery}":`, error.message);
      }
    }
    
    console.log(`[MANUAL CURATE] Complete: ${totalVideosAdded} videos added from ${searchesPerformed} searches`);
    
    return {
      success: true,
      curatedCount: totalVideosAdded,
      searchesPerformed,
    };
  } catch (error: any) {
    console.error('[MANUAL CURATE] Error:', error.message);
    return {
      success: false,
      curatedCount: 0,
      searchesPerformed: 0,
      error: error.message,
    };
  }
}
