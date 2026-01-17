import cron from "node-cron";
import { discoverNewInstructors } from "./instructor-discovery";
import { analyzeCompetitionMeta } from "./competition-meta-tracker";
import { batchQualityReview } from "./quality-decay-detector";
import { recalculateAllInstructorPriorities } from "./utils/instructorPriority";
import { withMemoryManagement, forceGC, shouldSkipDueToMemory } from "./utils/memory-management";

// Circuit breaker shared with main scheduler
let intelligenceFailures = 0;
const MAX_FAILURES = 3;
let intelligenceDisabled = false;

function recordIntelligenceFailure() {
  intelligenceFailures++;
  if (intelligenceFailures >= MAX_FAILURES && !intelligenceDisabled) {
    intelligenceDisabled = true;
    console.error('[INTELLIGENCE] ⚠️  Too many failures - disabling intelligence schedulers');
    console.error('[INTELLIGENCE] Fix missing API keys (ANTHROPIC_API_KEY, YOUTUBE_API_KEY) and restart');
  }
}

function recordIntelligenceSuccess() {
  if (intelligenceFailures > 0) {
    console.log('[INTELLIGENCE] ✅ Recovered from previous failures');
  }
  intelligenceFailures = 0;
  intelligenceDisabled = false;
}

// Schedule automated intelligence tasks
export function startIntelligenceScheduler() {
  console.log("🤖 Starting intelligence automation scheduler with circuit breaker...");

  // 1. Instructor Priority Recalculation - Nightly at 1 AM
  cron.schedule('0 1 * * *', async () => {
    if (intelligenceDisabled) return;
    
    console.log("📅 Running nightly instructor priority recalculation...");
    try {
      const result = await recalculateAllInstructorPriorities();
      console.log(`✅ Nightly priority recalculation complete: ${result.updated} instructors updated`);
      recordIntelligenceSuccess();
    } catch (error: any) {
      console.error("[INTELLIGENCE] Error in priority recalculation:", error.message || error);
      recordIntelligenceFailure();
    }
  });

  // 2. Instructor Discovery - Weekly on Sundays at 2 AM
  cron.schedule('0 2 * * 0', async () => {
    if (intelligenceDisabled) return;
    
    console.log("📅 Running weekly instructor discovery...");
    try {
      await discoverNewInstructors();
      recordIntelligenceSuccess();
    } catch (error: any) {
      console.error("[INTELLIGENCE] Error in instructor discovery:", error.message || error);
      recordIntelligenceFailure();
    }
  });

  // 3. Competition Meta Analysis - Monthly on 1st at 3 AM
  cron.schedule('0 3 1 * *', async () => {
    if (intelligenceDisabled) return;
    
    console.log("📅 Running monthly competition meta analysis...");
    try {
      await analyzeCompetitionMeta();
      recordIntelligenceSuccess();
    } catch (error: any) {
      console.error("[INTELLIGENCE] Error in competition meta:", error.message || error);
      recordIntelligenceFailure();
    }
  });

  // 4. Quality Decay Review - Quarterly (Jan 1, Apr 1, Jul 1, Oct 1) at 4 AM
  cron.schedule('0 4 1 1,4,7,10 *', async () => {
    if (intelligenceDisabled) return;
    
    console.log("📅 Running quarterly quality decay review...");
    try {
      await batchQualityReview();
      recordIntelligenceSuccess();
    } catch (error: any) {
      console.error("[INTELLIGENCE] Error in quality review:", error.message || error);
      recordIntelligenceFailure();
    }
  });

  // 5. Content-First Video Curation - Every 4 hours (QUOTA-SAFE MODE)
  cron.schedule('0 */4 * * *', async () => {
    if (intelligenceDisabled) return;
    
    // Skip if memory is critically low
    if (shouldSkipDueToMemory()) {
      console.log("⏸️ [INTELLIGENCE] Skipping content-first curation due to memory pressure");
      return;
    }
    
    console.log("📅 Running content-first video curation (QUOTA-SAFE)...");
    try {
      await withMemoryManagement('Content-First Curation', async () => {
        const { runContentFirstCuration } = await import('./content-first-curator');
        const result = await runContentFirstCuration(15, 10);
        console.log(`✅ Content-first curation complete: ${result.videosSaved} videos saved, ${result.newInstructorsDiscovered} new instructors`);
      });
      recordIntelligenceSuccess();
    } catch (error: any) {
      console.error("[INTELLIGENCE] Error in content-first curation:", error.message || error);
      recordIntelligenceFailure();
      forceGC('Content-First Error Recovery');
    }
  });

  // 6. EMERGENCY VIDEO CURATION - Daily at 2:00 PM EST (moved from 6 AM to avoid overnight congestion)
  // This bypasses normal controls when emergency_curation_override is TRUE
  cron.schedule('0 14 * * *', async () => {
    if (intelligenceDisabled) return;
    
    try {
      const { checkEmergencyOverride, emergencyCurationRun } = await import('./emergency-curation');
      const overrideEnabled = await checkEmergencyOverride();
      
      if (overrideEnabled) {
        console.log("🚨 EMERGENCY OVERRIDE ACTIVE - Running emergency curation at 2 PM EST");
        await emergencyCurationRun();
      } else {
        console.log("📅 2 PM EST check: Emergency override not active");
      }
    } catch (error: any) {
      console.error("[EMERGENCY CURATION] Error:", error.message || error);
    }
  }, {
    timezone: "America/New_York" // Automatic EST/EDT handling
  });

  console.log("✅ Intelligence scheduler started (STAGGERED for stability):");
  console.log("   - Instructor Priority Recalculation: Nightly at 1 AM");
  console.log("   - Instructor Discovery: Weekly (Sundays 2 AM)");
  console.log("   - Competition Meta: Monthly (1st at 3 AM)");
  console.log("   - Quality Review: Quarterly (Jan/Apr/Jul/Oct 1st at 4 AM)");
  console.log("   - ✅ Content-First QUOTA-SAFE Curation: Every 4 hours");
  console.log("   - 🚨 EMERGENCY CURATION: Daily at 2:00 PM EST (moved from 6 AM)");
}

// Manual trigger for instructor priority recalculation
export async function manualPriorityRecalculation() {
  console.log("🔧 Manual priority recalculation triggered");
  const result = await recalculateAllInstructorPriorities();
  console.log(`✅ Manual recalculation complete: ${result.updated} instructors updated`);
  return result;
}

// Manual triggers for testing/admin
export async function manualInstructorDiscovery() {
  console.log("🔧 Manual instructor discovery triggered");
  await discoverNewInstructors();
}

export async function manualCompetitionMeta() {
  console.log("🔧 Manual competition meta analysis triggered");
  await analyzeCompetitionMeta();
}

export async function manualQualityReview() {
  console.log("🔧 Manual quality review triggered");
  await batchQualityReview();
}
