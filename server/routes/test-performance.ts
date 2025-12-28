/**
 * 🧪 PERFORMANCE TESTING ENDPOINT
 * Internal endpoint for running comprehensive performance tests
 */

import type { Express } from "express";
import { storage } from "../storage";
import Anthropic from '@anthropic-ai/sdk';
import { buildProfessorOSPrompt } from "../utils/professorOSPrompt";
import { validateProfessorOSResponse } from "../utils/validateResponse";
import { composeResponseText } from "../utils/composeResponse";

const TEST_QUERIES = [
  "I struggle with triangle chokes",
  "My guard keeps getting passed and I don't know why. I'm a blue belt training 5x per week",
  "That helped! What should I work on next?",
  "Show me videos about deep half guard",
  "What's my belt level?",
  "Help me with armbar setups from guard",
  "My half guard retention needs work",
  "I keep getting stuck in mount",
  "How do I escape back control?",
  "Teach me about kimura from closed guard"
];

interface TimingBreakdown {
  parallelDataLoad: number;
  systemPromptBuild: number;
  claudeAPI: number;
  composition: number;
  total: number;
}

interface TestResult {
  testNumber: number;
  message: string;
  timing: TimingBreakdown;
  passed: boolean;
  anticipatoryDiagnosis: boolean;
  returnLoop: boolean;
  videoRecommendation: boolean;
  response: string;
}

export function registerTestRoutes(app: Express) {
  app.post('/api/test/performance', async (req, res) => {
    try {
      const { userId, testCount = 10 } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'userId required' });
      }
      
      console.log('\n' + '='.repeat(70));
      console.log('🧪 COMPREHENSIVE PERFORMANCE & TIMING TEST SUITE');
      console.log('='.repeat(70));
      console.log(`Testing with user: ${userId}`);
      console.log(`Target: 90% under 2000ms, 100% under 3000ms\n`);
      
      const results: TestResult[] = [];
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      
      // Run tests
      for (let i = 0; i < Math.min(testCount, TEST_QUERIES.length); i++) {
        const message = TEST_QUERIES[i];
        console.log(`\n${'='.repeat(70)}`);
        console.log(`🧪 TEST ${i + 1}: "${message}"`);
        console.log('='.repeat(70));
        
        const startTotal = Date.now();
        
        // PHASE 1: Parallel data loading
        const t1 = Date.now();
        const [userProfile, allVideos, history, recentNews] = await Promise.all([
          storage.getUserById(userId),
          storage.getAIVideoKnowledge(100),
          storage.getConversationHistory(userId, 20),
          storage.loadRecentCombatNews(5)
        ]);
        const parallelDataLoad = Date.now() - t1;
        console.log(`⏱️  Parallel data load: ${parallelDataLoad}ms`);
        
        if (!userProfile) {
          return res.status(404).json({ error: 'User not found' });
        }
        
        // PHASE 2: Build system prompt
        const t2 = Date.now();
        const struggleAreaBoost = userProfile.biggestStruggle || userProfile.struggleAreaCategory;
        const systemPrompt = await buildProfessorOSPrompt(userId, struggleAreaBoost, {
          includeLearningInsights: true,
          newsItems: recentNews
        });
        const systemPromptBuild = Date.now() - t2;
        console.log(`⏱️  System prompt built: ${systemPromptBuild}ms`);
        
        // PHASE 3: Build conversation messages
        const conversationMessages = history.map(h => ({
          role: h.role,
          content: h.message
        }));
        
        conversationMessages.push({
          role: 'user',
          content: message
        });
        
        // PHASE 4: Call Claude API
        const t3 = Date.now();
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 4000,
          temperature: 0.7,
          system: systemPrompt,
          messages: conversationMessages as any,
          tools: [{
            name: 'respond_with_coaching',
            description: 'Respond to user with personalized BJJ coaching',
            input_schema: {
              type: 'object',
              properties: {
                anticipatoryDiagnosis: {
                  type: 'string',
                  description: 'Opening hook that shows you understand their problem'
                },
                mainCoaching: {
                  type: 'string',
                  description: 'Main coaching guidance'
                },
                returnLoop: {
                  type: 'string',
                  description: 'Question or suggestion that creates anticipation'
                },
                patternObservation: {
                  type: 'string',
                  description: 'Pattern observation from conversation history'
                },
                trialUrgency: {
                  type: 'string',
                  description: 'Optional trial urgency message'
                }
              },
              required: ['anticipatoryDiagnosis', 'mainCoaching', 'returnLoop']
            }
          }],
          tool_choice: { type: 'tool', name: 'respond_with_coaching' }
        });
        const claudeAPI = Date.now() - t3;
        console.log(`⏱️  Claude API call: ${claudeAPI}ms`);
        
        // PHASE 5: Parse and compose response
        const t4 = Date.now();
        const toolUse = response.content.find((c: any) => c.type === 'tool_use');
        const coaching = toolUse?.input || {};
        
        // Validate response
        const validation = validateProfessorOSResponse(coaching);
        
        // Compose final text
        const composedText = composeResponseText(coaching);
        const composition = Date.now() - t4;
        
        const total = Date.now() - startTotal;
        
        // Analyze response
        const anticipatoryDiagnosis = validation.hasAnticipatory;
        const returnLoop = validation.hasReturnLoop;
        const videoRecommendation = composedText.includes('[VIDEO:');
        
        const passed = total < 3000;
        
        console.log(`\n📊 TIMING BREAKDOWN:`);
        console.log(`   Parallel data load: ${parallelDataLoad}ms`);
        console.log(`   System prompt build: ${systemPromptBuild}ms`);
        console.log(`   Claude API call: ${claudeAPI}ms`);
        console.log(`   Composition: ${composition}ms`);
        console.log(`   ──────────────────────────`);
        console.log(`   TOTAL: ${total}ms ${passed ? '✅' : '❌'}`);
        
        console.log(`\n📋 ENGAGEMENT HOOKS:`);
        console.log(`   Anticipatory diagnosis: ${anticipatoryDiagnosis ? '✅' : '❌'}`);
        console.log(`   Return loop: ${returnLoop ? '✅' : '❌'}`);
        console.log(`   Video recommendation: ${videoRecommendation ? '✅' : '❌'}`);
        
        if (anticipatoryDiagnosis && coaching.anticipatoryDiagnosis) {
          console.log(`   → "${coaching.anticipatoryDiagnosis.substring(0, 60)}..."`);
        }
        
        results.push({
          testNumber: i + 1,
          message,
          timing: {
            parallelDataLoad,
            systemPromptBuild,
            claudeAPI,
            composition,
            total
          },
          passed,
          anticipatoryDiagnosis,
          returnLoop,
          videoRecommendation,
          response: composedText
        });
        
        // Brief pause between tests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Calculate statistics
      console.log('\n' + '='.repeat(70));
      console.log('📊 FINAL RESULTS');
      console.log('='.repeat(70));
      
      const under2000 = results.filter(r => r.timing.total < 2000).length;
      const under3000 = results.filter(r => r.timing.total < 3000).length;
      const avgTime = results.reduce((sum, r) => sum + r.timing.total, 0) / results.length;
      const avgDataLoad = results.reduce((sum, r) => sum + r.timing.parallelDataLoad, 0) / results.length;
      const avgPromptBuild = results.reduce((sum, r) => sum + r.timing.systemPromptBuild, 0) / results.length;
      const avgClaudeAPI = results.reduce((sum, r) => sum + r.timing.claudeAPI, 0) / results.length;
      
      const anticipatoryCount = results.filter(r => r.anticipatoryDiagnosis).length;
      const returnLoopCount = results.filter(r => r.returnLoop).length;
      const videoCount = results.filter(r => r.videoRecommendation).length;
      
      console.log(`\n⏱️  TIMING METRICS:`);
      console.log(`   Average total time: ${avgTime.toFixed(0)}ms`);
      console.log(`   Average data load: ${avgDataLoad.toFixed(0)}ms`);
      console.log(`   Average prompt build: ${avgPromptBuild.toFixed(0)}ms`);
      console.log(`   Average Claude API: ${avgClaudeAPI.toFixed(0)}ms`);
      console.log(`   Under 2000ms: ${under2000}/${results.length} (${(under2000/results.length*100).toFixed(0)}%)`);
      console.log(`   Under 3000ms: ${under3000}/${results.length} (${(under3000/results.length*100).toFixed(0)}%)`);
      
      console.log(`\n🎯 ENGAGEMENT METRICS:`);
      console.log(`   Anticipatory diagnosis: ${anticipatoryCount}/${results.length} (${(anticipatoryCount/results.length*100).toFixed(0)}%)`);
      console.log(`   Return loops: ${returnLoopCount}/${results.length} (${(returnLoopCount/results.length*100).toFixed(0)}%)`);
      console.log(`   Video recommendations: ${videoCount}/${results.length} (${(videoCount/results.length*100).toFixed(0)}%)`);
      
      console.log(`\n✅ PASS CRITERIA:`);
      const timing90Pass = (under2000 / results.length) >= 0.9;
      const timing100Pass = (under3000 / results.length) >= 1.0;
      const engagementPass = (anticipatoryCount / results.length) >= 0.95;
      
      console.log(`   90% under 2000ms: ${timing90Pass ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   100% under 3000ms: ${timing100Pass ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   95% engagement hooks: ${engagementPass ? '✅ PASS' : '❌ FAIL'}`);
      
      const overallPass = timing90Pass && timing100Pass && engagementPass;
      console.log(`\n${'='.repeat(70)}`);
      console.log(`   OVERALL: ${overallPass ? '✅ PASS' : '❌ FAIL'}`);
      console.log('='.repeat(70) + '\n');
      
      return res.json({
        success: true,
        passed: overallPass,
        results,
        stats: {
          avgTime,
          avgDataLoad,
          avgPromptBuild,
          avgClaudeAPI,
          under2000Percent: under2000/results.length,
          under3000Percent: under3000/results.length,
          anticipatoryPercent: anticipatoryCount/results.length,
          returnLoopPercent: returnLoopCount/results.length,
          videoPercent: videoCount/results.length
        }
      });
      
    } catch (error: any) {
      console.error('❌ Test suite failed:', error);
      return res.status(500).json({ 
        error: 'Test failed', 
        message: error.message 
      });
    }
  });
}
