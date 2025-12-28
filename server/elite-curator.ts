/**
 * ELITE CURATOR - Targeted video curation using proven elite instructors
 * 
 * Strategy: Target 75+ elite instructors with proven quality (avg 7.5+, 3+ videos)
 * Expected: 60-80% approval rate vs 20-30% random curation
 * Goal: Build to 3,000 videos in ~3-4 weeks
 */

import { db } from './db';
import { eliteInstructors, eliteCuratorConfig, eliteCurationLog, aiVideoKnowledge } from '@shared/schema';
import { eq, sql, desc, and, lt } from 'drizzle-orm';
import { searchYouTubeVideosExtended } from './intelligent-curator';
import { nanoid } from 'nanoid';

interface EliteInstructor {
  id: number;
  instructorName: string;
  videoCount: number | null;
  avgQualityScore: string | null;
  tier: string | null;
}

interface TechniqueGap {
  techniqueName: string;
  currentCount: number;
  videosNeeded: number;
}

interface SearchPlan {
  instructor: string;
  technique: string;
  searchQuery: string;
  template: string;
  priority: 'HIGHEST' | 'HIGH' | 'MEDIUM';
}

// Search templates optimized for high-quality instructional content
const SEARCH_TEMPLATES = {
  fundamental: '{instructor} {technique} fundamental BJJ',
  advanced: '{instructor} {technique} advanced details BJJ',
  drilling: '{instructor} {technique} drilling BJJ',
  competition: '{instructor} {technique} competition BJJ',
  troubleshooting: '{instructor} {technique} common mistakes BJJ',
  system: '{instructor} {technique} system BJJ',
};

/**
 * Load active elite instructors ordered by weighted score
 */
async function loadEliteInstructors(): Promise<EliteInstructor[]> {
  const instructors = await db
    .select()
    .from(eliteInstructors)
    .where(eq(eliteInstructors.active, true))
    .orderBy(desc(eliteInstructors.weightedScore))
    .limit(75);
  
  return instructors;
}

/**
 * Identify technique gaps - techniques with < 50 videos
 * Returns all techniques needing more coverage (no artificial limit)
 */
async function identifyTechniqueGaps(): Promise<TechniqueGap[]> {
  const result = await db.execute(sql`
    WITH technique_counts AS (
      SELECT 
        technique_name,
        COUNT(*) as current_count
      FROM ai_video_knowledge
      WHERE quality_score >= 7.0
      GROUP BY technique_name
    )
    SELECT 
      tc.technique_name,
      tc.current_count,
      50 - tc.current_count as videos_needed
    FROM technique_counts tc
    WHERE tc.current_count < 50
      AND (50 - tc.current_count) > 0
    ORDER BY videos_needed DESC, tc.current_count ASC
  `);
  
  return (result.rows as any[]).map(row => ({
    techniqueName: row.technique_name,
    currentCount: parseInt(row.current_count),
    videosNeeded: parseInt(row.videos_needed)
  }));
}

/**
 * Build optimal search plan
 * - Prioritize JT Torres (20% of searches, minimum 1)
 * - Distribute remaining searches across other elite instructors
 * - Target technique gaps
 */
function buildSearchPlan(
  instructors: EliteInstructor[],
  gaps: TechniqueGap[],
  maxSearches: number
): SearchPlan[] {
  const plan: SearchPlan[] = [];
  
  // Safety checks
  if (instructors.length === 0 || gaps.length === 0 || maxSearches <= 0) {
    console.warn('[ELITE CURATOR] Cannot build search plan - missing instructors or gaps');
    return plan;
  }
  
  // Find JT Torres (founder's coach - maximum credibility)
  const jtTorres = instructors.find(i => 
    i.instructorName.toLowerCase().includes('jt torres') || 
    i.instructorName.toLowerCase().includes('torres')
  );
  
  if (jtTorres) {
    // Give JT Torres 20% of searches, minimum 1 if maxSearches > 0
    const jtSearchCount = maxSearches > 0 
      ? Math.min(maxSearches, Math.max(1, Math.ceil(maxSearches * 0.2)))
      : 0;
    const templates = Object.keys(SEARCH_TEMPLATES);
    
    for (let i = 0; i < Math.min(jtSearchCount, gaps.length); i++) {
      const gap = gaps[i];
      const template = templates[i % templates.length];
      const templateString = SEARCH_TEMPLATES[template as keyof typeof SEARCH_TEMPLATES];
      
      plan.push({
        instructor: jtTorres.instructorName,
        technique: gap.techniqueName,
        searchQuery: templateString
          .replace('{instructor}', jtTorres.instructorName)
          .replace('{technique}', gap.techniqueName),
        template,
        priority: 'HIGHEST'
      });
    }
  }
  
  // Distribute remaining searches across other elite instructors
  const otherInstructors = instructors.filter(i => i !== jtTorres);
  
  // Safety check: ensure we have other instructors
  if (otherInstructors.length === 0) {
    console.warn('[ELITE CURATOR] No instructors besides JT Torres - using all instructors');
    // If JT is the only one, use all instructors (including JT) for remaining searches
    otherInstructors.push(...instructors);
  }
  
  const remainingSearches = maxSearches - plan.length;
  const templates = Object.keys(SEARCH_TEMPLATES);
  
  // Track used combinations globally
  const usedCombinations = new Set<string>();
  plan.forEach(p => usedCombinations.add(`${p.instructor}|${p.technique}|${p.template}`));
  
  // Generate all possible combinations and select up to remainingSearches
  const allCombinations: SearchPlan[] = [];
  
  for (const gap of gaps) {
    for (const instructor of otherInstructors) {
      for (const templateKey of templates) {
        const combo = `${instructor.instructorName}|${gap.techniqueName}|${templateKey}`;
        
        if (!usedCombinations.has(combo)) {
          const templateString = SEARCH_TEMPLATES[templateKey as keyof typeof SEARCH_TEMPLATES];
          
          allCombinations.push({
            instructor: instructor.instructorName,
            technique: gap.techniqueName,
            searchQuery: templateString
              .replace('{instructor}', instructor.instructorName)
              .replace('{technique}', gap.techniqueName),
            template: templateKey,
            priority: instructor.tier === 'highest' ? 'HIGH' : 'MEDIUM'
          });
          
          usedCombinations.add(combo);
        }
      }
    }
  }
  
  // Take the first remainingSearches combinations
  plan.push(...allCombinations.slice(0, remainingSearches));
  
  return plan;
}

/**
 * Main elite curator execution
 */
export async function runEliteCuration(): Promise<{
  success: boolean;
  searchesPerformed: number;
  videosFound: number;
  videosApproved: number;
  videosRejected: number;
  videosDuplicate: number;
  approvalRate: number;
  quotaUsed: number;
  message: string;
}> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🎯 ELITE CURATOR - Starting targeted curation run');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    // Check if enabled
    const config = await db.select().from(eliteCuratorConfig).limit(1);
    if (!config[0] || !config[0].enabled) {
      return {
        success: false,
        searchesPerformed: 0,
        videosFound: 0,
        videosApproved: 0,
        videosRejected: 0,
        videosDuplicate: 0,
        approvalRate: 0,
        quotaUsed: 0,
        message: 'Elite curator is disabled. Enable in Dev OS dashboard.'
      };
    }
    
    const settings = config[0];
    
    // Check daily search quota
    const lastReset = settings.lastResetAt ? new Date(settings.lastResetAt) : new Date();
    const now = new Date();
    const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);
    
    // Reset daily counter if >24 hours
    if (hoursSinceReset >= 24) {
      await db.update(eliteCuratorConfig)
        .set({
          dailySearchesUsed: 0,
          lastResetAt: now,
          updatedAt: now
        })
        .where(eq(eliteCuratorConfig.id, settings.id));
      settings.dailySearchesUsed = 0;
    }
    
    // Check if quota exceeded
    const remainingSearches = (settings.maxDailySearches || 150) - (settings.dailySearchesUsed || 0);
    if (remainingSearches <= 0) {
      console.log('⚠️  Daily search quota exceeded');
      console.log(`   Used: ${settings.dailySearchesUsed}/${settings.maxDailySearches}`);
      console.log('   Quota resets in ~24 hours');
      return {
        success: false,
        searchesPerformed: 0,
        videosFound: 0,
        videosApproved: 0,
        videosRejected: 0,
        videosDuplicate: 0,
        approvalRate: 0,
        quotaUsed: 0,
        message: `Daily quota exceeded (${settings.dailySearchesUsed}/${settings.maxDailySearches})`
      };
    }
    
    // Load elite instructors
    const instructors = await loadEliteInstructors();
    console.log(`✅ Loaded ${instructors.length} elite instructors`);
    
    // Identify technique gaps
    const gaps = await identifyTechniqueGaps();
    console.log(`📊 Found ${gaps.length} techniques needing more coverage`);
    
    // Build search plan
    const searchesToPerform = Math.min(remainingSearches, 150); // 150 searches in one batch to max daily quota
    const searchPlan = buildSearchPlan(instructors, gaps, searchesToPerform);
    console.log(`📋 Generated ${searchPlan.length} targeted searches`);
    console.log(`🎯 Estimated approval rate: 60-80% (vs random 20-30%)\n`);
    
    // Execute searches
    const runId = nanoid(10);
    let searchesPerformed = 0;
    let videosFound = 0;
    let videosApproved = 0;
    let videosRejected = 0;
    let videosDuplicate = 0;
    
    for (const search of searchPlan) {
      const searchStart = Date.now();
      
      try {
        console.log(`[${searchesPerformed + 1}/${searchPlan.length}] ${search.instructor} → ${search.technique}`);
        console.log(`   Query: "${search.searchQuery}"`);
        
        // Use existing intelligent curator for search + analysis
        // It will handle duplicate video_id checking internally
        const videos = await searchYouTubeVideosExtended(
          search.searchQuery,
          undefined,
          settings.resultsPerSearch || 50,
          undefined,
          runId
        );
        
        videosFound += videos.length;
        videosApproved += videos.length; // searchYouTubeVideosExtended only returns approved
        
        console.log(`   ✅ Found ${videos.length} quality videos\n`);
        
        // Log search result
        const searchDuration = Date.now() - searchStart;
        await db.insert(eliteCurationLog).values({
          runId,
          instructor: search.instructor,
          technique: search.technique,
          searchQuery: search.searchQuery,
          videosFound: videos.length,
          videosApproved: videos.length,
          videosRejected: 0,
          videosDuplicate: 0,
          approvalRate: videos.length > 0 ? '1.00' : '0.00',
          quotaUsed: 100, // Approximate YouTube API cost
          durationMs: searchDuration
        });
        
        searchesPerformed++;
        
        // Update instructor stats
        if (videos.length > 0) {
          await db.execute(sql`
            UPDATE elite_instructors
            SET 
              total_searches = total_searches + 1,
              last_video_added = NOW(),
              updated_at = NOW()
            WHERE instructor_name = ${search.instructor}
          `);
        }
        
        // Delay between searches to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
        videosRejected++;
        
        // Log failed search
        await db.insert(eliteCurationLog).values({
          runId,
          instructor: search.instructor,
          technique: search.technique,
          searchQuery: search.searchQuery,
          videosFound: 0,
          videosApproved: 0,
          videosRejected: 1,
          videosDuplicate: 0,
          approvalRate: '0.00',
          quotaUsed: 0,
          durationMs: Date.now() - searchStart
        });
        
        // Stop if quota exceeded
        if (error.message?.includes('QUOTA_EXCEEDED')) {
          console.log('🚨 YouTube API quota exceeded - stopping');
          break;
        }
      }
    }
    
    // Update config with searches used
    await db.update(eliteCuratorConfig)
      .set({
        dailySearchesUsed: (settings.dailySearchesUsed || 0) + searchesPerformed,
        lastRunAt: now,
        updatedAt: now
      })
      .where(eq(eliteCuratorConfig.id, settings.id));
    
    // Calculate stats
    const approvalRate = searchesPerformed > 0 
      ? (videosApproved / (videosApproved + videosRejected)) * 100 
      : 0;
    const quotaUsed = searchesPerformed * 100;
    
    // Get current library size
    const librarySize = await db.execute(sql`
      SELECT COUNT(*) as total FROM ai_video_knowledge WHERE quality_score >= 7.0
    `);
    const currentTotal = parseInt((librarySize.rows[0] as any).total);
    const remaining = (settings.targetTotalVideos || 3000) - currentTotal;
    const etaDays = Math.ceil(remaining / (videosApproved > 0 ? videosApproved : 1));
    
    // Final summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🎯 ELITE CURATOR - RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Searches: ${searchesPerformed}/${searchPlan.length}`);
    console.log(`Videos found: ${videosFound}`);
    console.log(`Videos approved: ${videosApproved}`);
    console.log(`Videos rejected: ${videosRejected}`);
    console.log(`Duplicates skipped: ${videosDuplicate}`);
    console.log(`Approval rate: ${approvalRate.toFixed(1)}%`);
    console.log(`Quota used: ${quotaUsed} units`);
    console.log(`\n📊 Library: ${currentTotal}/3000 (${remaining} remaining)`);
    console.log(`📅 ETA to 3,000: ~${etaDays} days at current rate`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    return {
      success: true,
      searchesPerformed,
      videosFound,
      videosApproved,
      videosRejected,
      videosDuplicate,
      approvalRate,
      quotaUsed,
      message: `Added ${videosApproved} videos. ${remaining} remaining to reach 3,000.`
    };
    
  } catch (error: any) {
    console.error('❌ Elite curator failed:', error);
    return {
      success: false,
      searchesPerformed: 0,
      videosFound: 0,
      videosApproved: 0,
      videosRejected: 0,
      videosDuplicate: 0,
      approvalRate: 0,
      quotaUsed: 0,
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Get elite curator statistics
 */
export async function getEliteCuratorStats() {
  const config = await db.select().from(eliteCuratorConfig).limit(1);
  const instructors = await db.select().from(eliteInstructors)
    .where(eq(eliteInstructors.active, true))
    .orderBy(desc(eliteInstructors.weightedScore));
  
  // Get today's results
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayLogs = await db.select().from(eliteCurationLog)
    .where(sql`run_at >= ${todayStart}`);
  
  const todayStats = todayLogs.reduce((acc, log) => ({
    searches: acc.searches + 1,
    found: acc.found + (log.videosFound || 0),
    approved: acc.approved + (log.videosApproved || 0),
    rejected: acc.rejected + (log.videosRejected || 0)
  }), { searches: 0, found: 0, approved: 0, rejected: 0 });
  
  // Library progress
  const librarySize = await db.execute(sql`
    SELECT COUNT(*) as total FROM ai_video_knowledge WHERE quality_score >= 7.0
  `);
  const currentTotal = parseInt((librarySize.rows[0] as any)?.total || '0');
  const targetTotal = config[0]?.targetTotalVideos || 3000;
  const remaining = Math.max(0, targetTotal - currentTotal);
  
  // Safe approval rate calculation (avoid division by zero)
  const totalProcessed = todayStats.approved + todayStats.rejected;
  const approvalRate = totalProcessed > 0
    ? ((todayStats.approved / totalProcessed) * 100).toFixed(1)
    : '0';
  
  // Safe progress calculation
  const progress = targetTotal > 0
    ? ((currentTotal / targetTotal) * 100).toFixed(1)
    : '0';
  
  return {
    enabled: config[0]?.enabled || false,
    maxDailySearches: config[0]?.maxDailySearches || 150,
    dailySearchesUsed: config[0]?.dailySearchesUsed || 0,
    remainingToday: Math.max(0, (config[0]?.maxDailySearches || 150) - (config[0]?.dailySearchesUsed || 0)),
    eliteInstructorCount: instructors.length,
    topInstructors: instructors.slice(0, 10).map(i => ({
      name: i.instructorName,
      videos: i.videoCount || 0,
      quality: parseFloat(i.avgQualityScore || '0').toFixed(2),
      tier: i.tier || 'medium'
    })),
    today: {
      searches: todayStats.searches,
      found: todayStats.found,
      approved: todayStats.approved,
      approvalRate
    },
    library: {
      current: currentTotal,
      target: targetTotal,
      remaining,
      progress
    }
  };
}
