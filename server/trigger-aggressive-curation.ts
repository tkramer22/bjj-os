/**
 * AGGRESSIVE VIDEO CURATION TRIGGER
 * 
 * Runs massive-scale video curation to populate the database fast:
 * - 58 technique categories
 * - 50 videos per category
 * - ~2,900 videos analyzed
 * - 400-600 videos expected to be added
 * - 30-45 minute runtime
 */

import 'dotenv/config';
import { runContentFirstCuration } from './content-first-curator';

async function runAggressiveCuration() {
  console.log("\n");
  console.log("🚀 ═══════════════════════════════════════════════════════════════");
  console.log("🚀 AGGRESSIVE VIDEO CURATION - MAXIMUM CONTENT LOADING");
  console.log("🚀 ═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("📊 CURATION PARAMETERS:");
  console.log("   • Techniques to search: 58");
  console.log("   • Videos per technique: 50");
  console.log("   • Total videos to analyze: ~2,900");
  console.log("   • Expected videos added: 400-600");
  console.log("   • Expected runtime: 30-45 minutes");
  console.log("");
  console.log("🎯 OBJECTIVES:");
  console.log("   ✓ Build massive video library immediately");
  console.log("   ✓ Stress-test AI analysis at scale");
  console.log("   ✓ Populate instructor credibility database");
  console.log("   ✓ Complete coverage of fundamental techniques");
  console.log("");
  console.log("⚙️  QUALITY THRESHOLDS:");
  console.log("   • Elite instructors (Danaher, Gordon, Lachlan): 6.5+");
  console.log("   • Established instructors: 7.0+");
  console.log("   • Unknown instructors: 7.5+");
  console.log("");
  console.log("🔥 Starting in 3 seconds...\n");
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const startTime = Date.now();
  
  try {
    console.log("🎬 CURATION STARTED\n");
    
    // Progress callback
    const onProgress = (update: any) => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      
      console.log(`⏱️  ${mins}m ${secs}s | Progress: ${update.progress}% | ` +
                  `Techniques: ${update.techniquesProcessed}/${update.techniquesTotal} | ` +
                  `Videos: ${update.videosAnalyzed} analyzed, ${update.videosSaved} saved | ` +
                  `Instructors: ${update.newInstructorsDiscovered} new`);
      
      if (update.currentTechnique) {
        console.log(`   📹 Current: "${update.currentTechnique}"`);
      }
    };
    
    const result = await runContentFirstCuration(
      58,  // maxTechniques - cover all major categories
      50,  // videosPerTechnique - aggressive search depth
      onProgress
    );
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    const totalMins = Math.floor(totalTime / 60);
    const totalSecs = totalTime % 60;
    
    console.log("\n");
    console.log("✅ ═══════════════════════════════════════════════════════════════");
    console.log("✅ AGGRESSIVE CURATION COMPLETE!");
    console.log("✅ ═══════════════════════════════════════════════════════════════");
    console.log("");
    console.log("📈 FINAL RESULTS:");
    console.log(`   • Total runtime: ${totalMins}m ${totalSecs}s`);
    console.log(`   • Videos analyzed: ${result.videosAnalyzed}`);
    console.log(`   • Videos saved to database: ${result.videosSaved}`);
    console.log(`   • Approval rate: ${Math.round((result.videosSaved / result.videosAnalyzed) * 100)}%`);
    console.log(`   • New instructors discovered: ${result.newInstructorsDiscovered}`);
    console.log(`   • Techniques covered: ${result.techniquesSearched}`);
    console.log("");
    console.log("🎯 DATABASE STATUS:");
    console.log(`   • Total videos in library: Ready for use`);
    console.log(`   • Quality score threshold met: ${result.videosSaved} videos`);
    console.log(`   • Content coverage: ${result.techniquesSearched} technique categories`);
    console.log("");
    console.log("✅ Your BJJ OS video library is now production-ready!");
    console.log("");
    
  } catch (error: any) {
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    const totalMins = Math.floor(totalTime / 60);
    const totalSecs = totalTime % 60;
    
    console.error("\n");
    console.error("❌ ═══════════════════════════════════════════════════════════════");
    console.error("❌ CURATION ERROR");
    console.error("❌ ═══════════════════════════════════════════════════════════════");
    console.error("");
    console.error(`   Error: ${error.message}`);
    console.error(`   Runtime before error: ${totalMins}m ${totalSecs}s`);
    console.error("");
    console.error("💡 Note: Partial results may have been saved to the database.");
    console.error("");
    
    throw error;
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAggressiveCuration()
    .then(() => {
      console.log("🎉 Script complete. Exiting...\n");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Fatal error:", error);
      process.exit(1);
    });
}

export { runAggressiveCuration };
