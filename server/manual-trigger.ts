#!/usr/bin/env tsx
/**
 * Manual trigger script for running scheduled jobs on demand
 */

import { recalculateAllInstructorPriorities } from './utils/instructorPriority';
import { metaAnalyzer } from './meta-analyzer';
import { curateVideosFromPriorities } from './auto-curator';

async function main() {
  console.log('🚀 Starting manual job triggers...\n');

  // 1. Scrape YouTube data for all instructors with channels
  console.log('📺 [1/3] Scraping YouTube subscriber counts...');
  try {
    const { db } = await import('./db');
    const { instructorCredibility } = await import('@shared/schema');
    const { fetchYouTubeChannelStats } = await import('./utils/youtubeApi');
    const { recalculateInstructorPriority } = await import('./utils/instructorPriority');
    const { or, isNotNull, eq } = await import('drizzle-orm');
    
    // Get all instructors with YouTube channel info
    const instructors = await db
      .select()
      .from(instructorCredibility)
      .where(
        or(
          isNotNull(instructorCredibility.youtubeChannelId),
          isNotNull(instructorCredibility.youtubeChannelHandle)
        )
      );
    
    console.log(`   Found ${instructors.length} instructors with YouTube channels`);
    
    let updated = 0;
    let failed = 0;
    
    // Process each instructor
    for (const instructor of instructors) {
      try {
        const youtubeInput = instructor.youtubeChannelHandle || instructor.youtubeChannelId;
        
        if (!youtubeInput) {
          failed++;
          continue;
        }
        
        // Fetch YouTube statistics
        const stats = await fetchYouTubeChannelStats(youtubeInput);
        
        // Update instructor record
        const [updatedInstructor] = await db
          .update(instructorCredibility)
          .set({
            youtubeChannelId: stats.channelId,
            youtubeSubscribers: stats.subscriberCount,
            youtubeVideoCount: stats.videoCount,
            youtubeLastScraped: stats.lastScraped,
            updatedAt: new Date(),
          })
          .where(eq(instructorCredibility.id, instructor.id))
          .returning();
        
        console.log(`   ✓ ${instructor.name}: ${stats.subscriberCount?.toLocaleString()} subscribers`);
        updated++;
        
        // Rate limiting: Wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error: any) {
        failed++;
        console.error(`   ✗ ${instructor.name}: ${error.message}`);
      }
    }
    
    console.log('✅ YouTube scraping complete!');
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Failed: ${failed}`);
  } catch (error: any) {
    console.error('❌ Error scraping YouTube:', error.message);
  }

  console.log('');

  // 2. Recalculate instructor priorities
  console.log('📊 [2/3] Recalculating instructor priorities for all 101 instructors...');
  try {
    const priorityResult = await recalculateAllInstructorPriorities();
    console.log('✅ Instructor priorities recalculated!');
    console.log(`   - Updated: ${priorityResult.updated}`);
    console.log(`   - Manual overrides preserved: ${priorityResult.manualOverridesPreserved}`);
    console.log(`   - Errors: ${priorityResult.errors}`);
  } catch (error: any) {
    console.error('❌ Error recalculating priorities:', error.message);
  }

  console.log('');

  // 3. Run content-first video curation (NEW STRATEGY)
  console.log('🎥 [3/4] Running CONTENT-FIRST video curation...');
  console.log('   Strategy: Search for techniques, AI identifies instructors from ANY source');
  try {
    const { runContentFirstCuration } = await import('./content-first-curator');
    const result = await runContentFirstCuration(5, 3); // 5 techniques, 3 videos each
    console.log('✅ Content-first curation complete!');
    console.log(`   - Techniques searched: ${result.techniquesSearched}`);
    console.log(`   - Videos analyzed: ${result.videosAnalyzed}`);
    console.log(`   - Videos saved: ${result.videosSaved}`);
    console.log(`   - New instructors discovered: ${result.newInstructorsDiscovered}`);
  } catch (error: any) {
    console.error('❌ Error in content-first curation:', error.message);
  }

  console.log('');

  // 4. Run legacy priority-based curation (backup)
  console.log('🎬 [4/4] Running legacy priority-based curation...');
  try {
    const priorities = await metaAnalyzer.getTopCurationPriorities(10);
    
    if (priorities.length > 0) {
      console.log(`   Found ${priorities.length} techniques needing curation:`);
      priorities.forEach(p => console.log(`      - ${p.techniqueName} (priority: ${p.curationPriority})`));
      
      await curateVideosFromPriorities(priorities);
      console.log('✅ Legacy curation complete!');
    } else {
      console.log('✅ No high-priority techniques need curation right now');
    }
  } catch (error: any) {
    console.error('❌ Error running legacy curation:', error.message);
  }

  console.log('\n✅ All jobs completed!');
  process.exit(0);
}

main();
