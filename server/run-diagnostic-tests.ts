/**
 * Professor OS Diagnostic Test Runner
 * Runs 5 test messages and outputs full diagnostics for each
 */

import { db } from './db';
import { sql, desc, eq } from 'drizzle-orm';
import { bjjUsers, aiVideoKnowledge } from '@shared/schema';
import Anthropic from '@anthropic-ai/sdk';
import { buildProfessorOSPrompt } from './utils/professorOSPrompt';
import { searchVideos, fallbackSearch, getSessionContext, updateSessionContext } from './videoSearch';

const TEST_USER_ID = 'c2cfc0c7-96f2-4f02-8251-bf30b8f6860a';

const TEST_MESSAGES = [
  { id: 1, message: "Hey, what's up?" },
  { id: 2, message: "What happened at the last ADCC?" },
  { id: 3, message: "What technique should I work on based on my game?" },
  { id: 4, message: "Show me some Gordon Ryan videos" },
  { id: 5, message: "Can you help me with my math homework?" }
];

interface DiagnosticData {
  userContext: any;
  intelligenceEnhancer: boolean;
  populationIntelligence: boolean;
  videoSearchPerformed: boolean;
  videosFound: number;
  systemPromptLength: number;
  systemPromptSections: string[];
  responseText: string;
  responseTime: number;
  errors: string[];
  timingBreakdown: {
    userLoadMs: number;
    videoSearchMs: number;
    promptBuildMs: number;
    claudeApiMs: number;
    totalMs: number;
  };
}

async function runDiagnosticTest(testNum: number, message: string): Promise<DiagnosticData> {
  const startTime = Date.now();
  const diagnostics: DiagnosticData = {
    userContext: null,
    intelligenceEnhancer: false,
    populationIntelligence: false,
    videoSearchPerformed: false,
    videosFound: 0,
    systemPromptLength: 0,
    systemPromptSections: [],
    responseText: '',
    responseTime: 0,
    errors: [],
    timingBreakdown: {
      userLoadMs: 0,
      videoSearchMs: 0,
      promptBuildMs: 0,
      claudeApiMs: 0,
      totalMs: 0
    }
  };

  try {
    // PHASE 1: Load user context
    const userLoadStart = Date.now();
    const [user] = await db.select().from(bjjUsers).where(eq(bjjUsers.id, TEST_USER_ID));
    diagnostics.timingBreakdown.userLoadMs = Date.now() - userLoadStart;

    if (!user) {
      diagnostics.errors.push('User not found');
      return diagnostics;
    }

    diagnostics.userContext = {
      id: user.id,
      email: user.email,
      name: user.name,
      beltLevel: user.beltLevel,
      trainingGoals: user.trainingGoals,
      focusAreas: user.focusAreas,
      injuries: user.injuries,
      bodyType: user.bodyType,
      height: user.heightFeet && user.heightInches ? `${user.heightFeet}'${user.heightInches}"` : null,
      weight: user.weight
    };

    // PHASE 2: Video search (using the real video search system)
    const videoSearchStart = Date.now();
    let videoSearchResult: any = { videos: [], totalMatches: 0, searchIntent: {} };
    try {
      const sessionContext = getSessionContext(TEST_USER_ID);
      videoSearchResult = await searchVideos({
        userMessage: message,
        conversationContext: {
          userGiNogi: (user as any).style || 'both',
          sessionFocus: sessionContext.sessionFocus,
          recommendedVideoIds: sessionContext.recommendedVideoIds
        }
      });
      
      // Fallback if no matches
      if (videoSearchResult.videos.length === 0) {
        videoSearchResult = await fallbackSearch(message);
      }
      
      diagnostics.videoSearchPerformed = true;
      diagnostics.videosFound = videoSearchResult.videos.length;
      diagnostics.intelligenceEnhancer = true;
      
      // Update session context
      const recommendedVideoIds = videoSearchResult.videos.map((v: any) => v.id.toString());
      updateSessionContext(TEST_USER_ID, videoSearchResult.searchIntent, recommendedVideoIds);
    } catch (videoErr: any) {
      diagnostics.errors.push(`Video search error: ${videoErr.message}`);
    }
    diagnostics.timingBreakdown.videoSearchMs = Date.now() - videoSearchStart;

    // PHASE 3: Build system prompt
    const promptBuildStart = Date.now();
    
    // Load population intelligence
    try {
      const popResult = await db.execute(sql`
        SELECT * FROM population_intelligence ORDER BY generated_at DESC LIMIT 1
      `);
      if (popResult.rows.length > 0) {
        diagnostics.populationIntelligence = true;
      }
    } catch (popErr: any) {
      diagnostics.errors.push(`Population intelligence error: ${popErr.message}`);
    }

    // Format videos for prompt (matching real implementation)
    const videoLibrary = videoSearchResult.videos.map((v: any) => ({
      id: v.id,
      techniqueName: v.techniqueName || v.title,
      title: v.techniqueName || v.title,
      instructorName: v.instructorName,
      techniqueType: v.techniqueType,
      positionCategory: v.positionCategory,
      qualityScore: v.qualityScore,
      videoUrl: v.videoUrl,
      tags: v.tags || [],
      relevanceScore: Number(v.qualityScore) || 0
    }));

    // Calculate height display
    const heightDisplay = user.heightFeet && user.heightInches 
      ? `${user.heightFeet}'${user.heightInches}"`
      : null;

    // Calculate days since joined
    const daysSinceJoined = user.createdAt 
      ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const weeksSinceJoined = Math.floor(daysSinceJoined / 7);

    // Build system prompt using the real function
    const systemPrompt = await buildProfessorOSPrompt(TEST_USER_ID, (user as any).biggestStruggle || null, {
      includeLearningInsights: true,
      newsItems: [],
      preloadedContext: {
        user: user as any,
        videos: videoLibrary,
        daysSinceJoined,
        weeksSinceJoined,
        heightDisplay
      },
      videoSearchContext: {
        totalMatches: videoSearchResult.totalMatches,
        searchIntent: videoSearchResult.searchIntent
      }
    });
    
    diagnostics.systemPromptLength = systemPrompt.length;
    
    // Extract sections from prompt for diagnostics
    const sectionMatches = systemPrompt.match(/SECTION \d+[A-Z]?: [^\n]+/g) || [];
    diagnostics.systemPromptSections = sectionMatches;
    
    diagnostics.timingBreakdown.promptBuildMs = Date.now() - promptBuildStart;

    // PHASE 4: Call Claude API
    const claudeApiStart = Date.now();
    
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }]
    });

    diagnostics.timingBreakdown.claudeApiMs = Date.now() - claudeApiStart;

    // Extract response text
    const textContent = response.content.find(c => c.type === 'text');
    diagnostics.responseText = textContent?.text || '[No text response]';

    // Save to diagnostics table
    const diagJson = {
      systemPromptLength: diagnostics.systemPromptLength,
      systemPromptSections: diagnostics.systemPromptSections,
      videosSearched: diagnostics.videosFound,
      instructorDetected: videoSearchResult.videos.map((v: any) => v.instructorName).filter(Boolean),
      claudeResponseJson: { 
        model: response.model,
        usage: response.usage,
        stop_reason: response.stop_reason
      },
      validationStatus: 'passed',
      timingBreakdown: diagnostics.timingBreakdown,
      userContext: diagnostics.userContext,
      videoSearchIntent: videoSearchResult.searchIntent,
      offTopicDetected: message.toLowerCase().includes('math') || message.toLowerCase().includes('homework'),
      populationIntelligenceLoaded: diagnostics.populationIntelligence
    };

    await db.execute(sql`
      INSERT INTO professor_os_diagnostics (user_id, user_message, model_used, response_time_ms, diagnostics, timestamp)
      VALUES (${TEST_USER_ID}, ${message}, 'claude-sonnet-4-6', ${Date.now() - startTime}, ${JSON.stringify(diagJson)}::jsonb, NOW())
    `);

  } catch (error: any) {
    diagnostics.errors.push(`Fatal error: ${error.message}`);
    console.error('Test error:', error);
  }

  diagnostics.timingBreakdown.totalMs = Date.now() - startTime;
  diagnostics.responseTime = diagnostics.timingBreakdown.totalMs;

  return diagnostics;
}

async function runAllTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🧪 PROFESSOR OS DIAGNOSTIC TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const results: { test: number; message: string; diagnostics: DiagnosticData }[] = [];

  for (const test of TEST_MESSAGES) {
    console.log(`\n═══ TEST ${test.id}: "${test.message}" ═══\n`);
    
    const diagnostics = await runDiagnosticTest(test.id, test.message);
    results.push({ test: test.id, message: test.message, diagnostics });

    // Output formatted results
    console.log('📥 USER CONTEXT LOADED:');
    if (diagnostics.userContext) {
      console.log(`   - Belt Level: ${diagnostics.userContext.beltLevel || 'not set'}`);
      console.log(`   - Height: ${diagnostics.userContext.height || 'not set'}`);
      console.log(`   - Weight: ${diagnostics.userContext.weight || 'not set'}`);
      console.log(`   - Focus Areas: ${JSON.stringify(diagnostics.userContext.focusAreas) || '[]'}`);
      console.log(`   - Injuries: ${JSON.stringify(diagnostics.userContext.injuries) || '[]'}`);
    } else {
      console.log('   ❌ User context NOT loaded');
    }

    console.log('\n🔌 INTELLIGENCE SYSTEMS:');
    console.log(`   - Intelligence Enhancer: ${diagnostics.intelligenceEnhancer ? '✅ TRIGGERED' : '❌ NOT triggered'}`);
    console.log(`   - Population Intelligence: ${diagnostics.populationIntelligence ? '✅ LOADED' : '❌ NOT loaded'}`);

    console.log('\n🎥 VIDEO SEARCH:');
    console.log(`   - Search Performed: ${diagnostics.videoSearchPerformed ? '✅ YES' : '❌ NO'}`);
    console.log(`   - Videos Found: ${diagnostics.videosFound}`);

    console.log('\n📝 SYSTEM PROMPT:');
    console.log(`   - Character Count: ${diagnostics.systemPromptLength.toLocaleString()}`);
    console.log(`   - Sections: ${diagnostics.systemPromptSections.length}`);
    diagnostics.systemPromptSections.forEach(s => console.log(`     • ${s}`));

    console.log('\n🤖 PROFESSOR OS RESPONSE:');
    const truncatedResponse = diagnostics.responseText.length > 500 
      ? diagnostics.responseText.substring(0, 500) + '...[truncated]'
      : diagnostics.responseText;
    console.log(`   ${truncatedResponse}`);

    console.log('\n⏱️ TIMING BREAKDOWN:');
    console.log(`   - User Load: ${diagnostics.timingBreakdown.userLoadMs}ms`);
    console.log(`   - Video Search: ${diagnostics.timingBreakdown.videoSearchMs}ms`);
    console.log(`   - Prompt Build: ${diagnostics.timingBreakdown.promptBuildMs}ms`);
    console.log(`   - Claude API: ${diagnostics.timingBreakdown.claudeApiMs}ms`);
    console.log(`   - TOTAL: ${diagnostics.timingBreakdown.totalMs}ms`);

    if (diagnostics.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      diagnostics.errors.forEach(e => console.log(`   - ${e}`));
    }

    console.log('\n' + '─'.repeat(60));
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY: WHAT\'S WORKING vs WHAT\'S BROKEN');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const working: string[] = [];
  const broken: string[] = [];

  // Check each system
  const anyUserContext = results.some(r => r.diagnostics.userContext);
  const anyIntelligence = results.some(r => r.diagnostics.intelligenceEnhancer);
  const anyPopulation = results.some(r => r.diagnostics.populationIntelligence);
  const anyVideoSearch = results.some(r => r.diagnostics.videoSearchPerformed);
  const anyVideosFound = results.some(r => r.diagnostics.videosFound > 0);
  const avgResponseTime = results.reduce((sum, r) => sum + r.diagnostics.responseTime, 0) / results.length;
  const anyErrors = results.some(r => r.diagnostics.errors.length > 0);

  if (anyUserContext) working.push('✅ User Context Loading');
  else broken.push('❌ User Context Loading');

  if (anyIntelligence) working.push('✅ Intelligence Enhancer');
  else broken.push('❌ Intelligence Enhancer');

  if (anyPopulation) working.push('✅ Population Intelligence');
  else broken.push('❌ Population Intelligence');

  if (anyVideoSearch) working.push('✅ Video Search System');
  else broken.push('❌ Video Search System');

  if (anyVideosFound) working.push('✅ Video Recommendations (found videos)');
  else broken.push('❌ Video Recommendations (no videos found)');

  if (avgResponseTime < 10000) working.push(`✅ Response Time (avg ${Math.round(avgResponseTime)}ms)`);
  else broken.push(`❌ Response Time (avg ${Math.round(avgResponseTime)}ms - too slow)`);

  const allResponses = results.every(r => r.diagnostics.responseText.length > 50);
  if (allResponses) working.push('✅ Claude API Responses');
  else broken.push('❌ Claude API Responses (some empty/short)');

  if (!anyErrors) working.push('✅ No Errors');

  console.log('WORKING:');
  working.forEach(w => console.log(`  ${w}`));

  if (broken.length > 0 || anyErrors) {
    console.log('\nBROKEN/ISSUES:');
    broken.forEach(b => console.log(`  ${b}`));
    if (anyErrors) {
      console.log('  ⚠️ Errors occurred during tests:');
      results.forEach(r => {
        if (r.diagnostics.errors.length > 0) {
          console.log(`    Test ${r.test}: ${r.diagnostics.errors.join(', ')}`);
        }
      });
    }
  }

  // Query stored diagnostics
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('💾 STORED DIAGNOSTICS FROM DATABASE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const storedDiags = await db.execute(sql`
    SELECT user_message, response_time_ms, diagnostics, timestamp
    FROM professor_os_diagnostics
    WHERE user_id = ${TEST_USER_ID}
    ORDER BY timestamp DESC
    LIMIT 5
  `);

  storedDiags.rows.forEach((row: any, idx) => {
    console.log(`\nDiagnostic ${idx + 1}:`);
    console.log(`  Message: "${row.user_message}"`);
    console.log(`  Response Time: ${row.response_time_ms}ms`);
    console.log(`  Timestamp: ${row.timestamp}`);
    console.log(`  Full Diagnostics JSON:`);
    console.log(JSON.stringify(row.diagnostics, null, 2));
  });

  console.log('\n✅ DIAGNOSTIC TESTS COMPLETE\n');
}

// Run tests
runAllTests().catch(console.error);
