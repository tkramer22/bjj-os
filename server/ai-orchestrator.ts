import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { db } from "./db";
import { modelPerformance, abTestExperiments } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

// Initialize AI clients
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Model configurations
interface ModelConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  costPer1kTokens: number; // USD
  maxTokens: number;
  capabilities: string[]; // e.g., ['long_context', 'json_mode', 'vision']
}

const MODEL_REGISTRY: Record<string, ModelConfig> = {
  'gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o-2024-08-06',
    costPer1kTokens: 0.0025, // $2.50 per 1M input tokens
    maxTokens: 128000,
    capabilities: ['json_mode', 'vision', 'structured_outputs']
  },
  'gpt-4o-mini': {
    provider: 'openai',
    model: 'gpt-4o-mini',
    costPer1kTokens: 0.00015, // $0.15 per 1M input tokens
    maxTokens: 128000,
    capabilities: ['json_mode', 'structured_outputs']
  },
  'claude-sonnet-4': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    costPer1kTokens: 0.003, // $3 per 1M input tokens
    maxTokens: 200000,
    capabilities: ['long_context', 'json_mode']
  },
  'claude-3.5-sonnet': {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    costPer1kTokens: 0.003,
    maxTokens: 200000,
    capabilities: ['long_context', 'json_mode']
  }
};

// Task-to-model mapping (learned over time)
interface TaskMapping {
  taskType: string;
  primaryModel: string;
  fallbackModel: string;
  lastUpdated: Date;
}

const TASK_MAPPINGS: Record<string, TaskMapping> = {
  'quality_scoring': {
    taskType: 'quality_scoring',
    primaryModel: 'gpt-4o',
    fallbackModel: 'claude-3.5-sonnet',
    lastUpdated: new Date()
  },
  'timestamp_extraction': {
    taskType: 'timestamp_extraction',
    primaryModel: 'claude-sonnet-4',
    fallbackModel: 'gpt-4o',
    lastUpdated: new Date()
  },
  'query_understanding': {
    taskType: 'query_understanding',
    primaryModel: 'gpt-4o',
    fallbackModel: 'claude-3.5-sonnet',
    lastUpdated: new Date()
  },
  'technical_validation': {
    taskType: 'technical_validation',
    primaryModel: 'claude-3.5-sonnet',
    fallbackModel: 'gpt-4o',
    lastUpdated: new Date()
  },
  'recommendation_synthesis': {
    taskType: 'recommendation_synthesis',
    primaryModel: 'gpt-4o',
    fallbackModel: 'claude-3.5-sonnet',
    lastUpdated: new Date()
  },
  'curation_prediction': {
    taskType: 'curation_prediction',
    primaryModel: 'gpt-4o',
    fallbackModel: 'claude-3.5-sonnet',
    lastUpdated: new Date()
  }
};

// Response types
interface AIResponse {
  content: string;
  model: string;
  latency: number;
  tokensUsed: number;
  cost: number;
  success: boolean;
  error?: string;
}

// Model performance tracking
class ModelPerformanceTracker {
  async logPerformance(
    modelName: string,
    taskType: string,
    latency: number,
    success: boolean,
    tokensUsed: number
  ) {
    const config = MODEL_REGISTRY[modelName];
    if (!config) return;

    const costPerCall = (tokensUsed / 1000) * config.costPer1kTokens;

    // Check if we have a performance record for this period (today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    try {
      const existing = await db.select()
        .from(modelPerformance)
        .where(and(
          eq(modelPerformance.modelName, modelName),
          eq(modelPerformance.taskType, taskType),
          eq(modelPerformance.measurementPeriod, 'daily'),
          gte(modelPerformance.periodStart, today),
          lte(modelPerformance.periodEnd, tomorrow)
        ))
        .limit(1);

      if (existing.length > 0) {
        // Update existing record
        const current = existing[0];
        await db.update(modelPerformance)
          .set({
            callCount: (current.callCount || 0) + 1,
            successCount: (current.successCount || 0) + (success ? 1 : 0),
            errorCount: (current.errorCount || 0) + (success ? 0 : 1),
            latency: Math.round(((current.latency || 0) * (current.callCount || 1) + latency) / ((current.callCount || 0) + 1)),
            costPerCall: String(((parseFloat(String(current.costPerCall || 0)) * (current.callCount || 1) + costPerCall) / ((current.callCount || 0) + 1)).toFixed(6))
          })
          .where(eq(modelPerformance.id, current.id));
      } else {
        // Create new record
        await db.insert(modelPerformance).values({
          modelName,
          taskType,
          latency,
          costPerCall: String(costPerCall.toFixed(6)),
          callCount: 1,
          successCount: success ? 1 : 0,
          errorCount: success ? 0 : 1,
          measurementPeriod: 'daily',
          periodStart: today,
          periodEnd: tomorrow
        });
      }
    } catch (error) {
      console.error('Failed to log model performance:', error);
    }
  }

  async getBestModelForTask(taskType: string): Promise<string> {
    // Get performance data for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      const performances = await db.select()
        .from(modelPerformance)
        .where(and(
          eq(modelPerformance.taskType, taskType),
          gte(modelPerformance.periodStart, sevenDaysAgo)
        ));

      if (performances.length === 0) {
        // No data yet, use default mapping
        return TASK_MAPPINGS[taskType]?.primaryModel || 'gpt-4o';
      }

      // Calculate score: (successRate * 0.7) + (1 - normalizedCost * 0.2) + (1 - normalizedLatency * 0.1)
      const modelScores = performances.reduce((acc, perf) => {
        const modelName = perf.modelName;
        const successRate = (perf.successCount || 0) / Math.max(1, perf.callCount || 1);
        
        if (!acc[modelName]) {
          acc[modelName] = {
            totalCalls: 0,
            totalSuccess: 0,
            avgLatency: 0,
            avgCost: 0
          };
        }

        acc[modelName].totalCalls += perf.callCount || 0;
        acc[modelName].totalSuccess += perf.successCount || 0;
        acc[modelName].avgLatency = ((acc[modelName].avgLatency * acc[modelName].totalCalls) + (perf.latency || 0) * (perf.callCount || 0)) / (acc[modelName].totalCalls + (perf.callCount || 0));
        acc[modelName].avgCost = ((acc[modelName].avgCost * acc[modelName].totalCalls) + parseFloat(String(perf.costPerCall || 0)) * (perf.callCount || 0)) / (acc[modelName].totalCalls + (perf.callCount || 0));

        return acc;
      }, {} as Record<string, { totalCalls: number; totalSuccess: number; avgLatency: number; avgCost: number }>);

      // Find best model
      let bestModel = TASK_MAPPINGS[taskType]?.primaryModel || 'gpt-4o';
      let bestScore = -1;

      for (const [modelName, stats] of Object.entries(modelScores)) {
        if (stats.totalCalls < 10) continue; // Need minimum sample size

        const successRate = stats.totalSuccess / stats.totalCalls;
        const score = successRate * 0.7 + (1 - Math.min(1, stats.avgCost / 0.01)) * 0.2 + (1 - Math.min(1, stats.avgLatency / 5000)) * 0.1;

        if (score > bestScore) {
          bestScore = score;
          bestModel = modelName;
        }
      }

      return bestModel;
    } catch (error) {
      console.error('Failed to get best model:', error);
      return TASK_MAPPINGS[taskType]?.primaryModel || 'gpt-4o';
    }
  }
}

const performanceTracker = new ModelPerformanceTracker();

// Main AI Orchestrator class
export class AIOrchestrator {
  private abTestCache: Map<string, { controlModel: string; treatmentModel: string; split: number }> = new Map();

  constructor() {
    this.loadActiveABTests().catch(() => {});
  }

  private async loadActiveABTests() {
    try {
      const activeTests = await db.select()
        .from(abTestExperiments)
        .where(eq(abTestExperiments.status, 'active'));

      for (const test of activeTests) {
        // Map task type to experiment (assuming experimentName matches taskType)
        this.abTestCache.set(test.experimentName, {
          controlModel: test.controlAlgorithm,
          treatmentModel: test.treatmentAlgorithm,
          split: parseFloat(String(test.trafficSplit || 0.5))
        });
      }
    } catch (error: any) {
      // Table doesn't exist yet (multi-agent system not deployed)
      if (error.code === '42P01') {
        console.log('[AI ORCHESTRATOR] A/B test table not deployed yet - skipping');
        return;
      }
      console.error('Failed to load A/B tests:', error);
    }
  }

  /**
   * Main method: Call AI model with automatic routing and fallback
   */
  async call(
    taskType: string,
    prompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      forceModel?: string;
      jsonMode?: boolean;
    } = {}
  ): Promise<AIResponse> {
    const startTime = Date.now();

    // Check for A/B test
    const abTest = this.abTestCache.get(taskType);
    let selectedModel: string;

    if (abTest && !options.forceModel) {
      // A/B test active - randomly assign
      const rand = Math.random();
      selectedModel = rand < abTest.split ? abTest.controlModel : abTest.treatmentModel;
      console.log(`[A/B TEST] ${taskType}: Using ${selectedModel} (rand=${rand.toFixed(2)}, split=${abTest.split})`);
    } else if (options.forceModel) {
      selectedModel = options.forceModel;
    } else {
      // Use learned best model for this task
      selectedModel = await performanceTracker.getBestModelForTask(taskType);
    }

    try {
      const response = await this.callModel(selectedModel, prompt, options);
      
      // Log performance
      await performanceTracker.logPerformance(
        selectedModel,
        taskType,
        response.latency,
        response.success,
        response.tokensUsed
      );

      return response;
    } catch (error: any) {
      console.error(`[AI ORCHESTRATOR] ${selectedModel} failed, trying fallback:`, error.message);

      // Try fallback model
      const fallbackModel = TASK_MAPPINGS[taskType]?.fallbackModel || 'claude-3.5-sonnet';
      
      try {
        const response = await this.callModel(fallbackModel, prompt, options);
        
        await performanceTracker.logPerformance(
          fallbackModel,
          taskType,
          response.latency,
          response.success,
          response.tokensUsed
        );

        return response;
      } catch (fallbackError: any) {
        console.error(`[AI ORCHESTRATOR] Fallback ${fallbackModel} also failed:`, fallbackError.message);
        
        const latency = Date.now() - startTime;
        await performanceTracker.logPerformance(selectedModel, taskType, latency, false, 0);
        
        throw new Error(`All models failed for task ${taskType}: ${error.message}`);
      }
    }
  }

  /**
   * Call specific AI model
   */
  private async callModel(
    modelName: string,
    prompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      jsonMode?: boolean;
    } = {}
  ): Promise<AIResponse> {
    const config = MODEL_REGISTRY[modelName];
    if (!config) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    const startTime = Date.now();
    const maxTokens = options.maxTokens || 4000;
    const temperature = options.temperature ?? 1.0;

    if (config.provider === 'openai') {
      const response = await openai.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined
      });

      const latency = Date.now() - startTime;
      const content = response.choices[0].message.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;
      const cost = (tokensUsed / 1000) * config.costPer1kTokens;

      return {
        content,
        model: modelName,
        latency,
        tokensUsed,
        cost,
        success: true
      };
    } else if (config.provider === 'anthropic') {
      const response = await anthropic.messages.create({
        model: config.model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }]
      });

      const latency = Date.now() - startTime;
      const content = response.content[0].type === 'text' ? response.content[0].text : '';
      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
      const cost = (tokensUsed / 1000) * config.costPer1kTokens;

      return {
        content,
        model: modelName,
        latency,
        tokensUsed,
        cost,
        success: true
      };
    }

    throw new Error(`Unsupported provider: ${config.provider}`);
  }

  /**
   * Hot-swap model for a specific task
   */
  async hotSwapModel(taskType: string, newModel: string, startABTest: boolean = true) {
    const oldModel = TASK_MAPPINGS[taskType]?.primaryModel;
    
    if (startABTest && oldModel) {
      // Create A/B test to compare old vs new
      const experimentName = `${taskType}_${oldModel}_vs_${newModel}`;
      
      try {
        await db.insert(abTestExperiments).values({
          experimentName,
          description: `Testing ${newModel} against ${oldModel} for ${taskType}`,
          controlAlgorithm: oldModel,
          treatmentAlgorithm: newModel,
          trafficSplit: '0.50', // 50/50 split
          status: 'active',
          startedAt: new Date()
        });

        console.log(`[HOT SWAP] Started A/B test: ${experimentName}`);
        await this.loadActiveABTests();
      } catch (error) {
        console.error('Failed to create A/B test:', error);
      }
    } else {
      // Direct swap
      if (TASK_MAPPINGS[taskType]) {
        TASK_MAPPINGS[taskType].primaryModel = newModel;
        TASK_MAPPINGS[taskType].lastUpdated = new Date();
      }
      console.log(`[HOT SWAP] Directly swapped ${taskType} to ${newModel}`);
    }
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return Object.keys(MODEL_REGISTRY);
  }

  /**
   * Get model info
   */
  getModelInfo(modelName: string): ModelConfig | undefined {
    return MODEL_REGISTRY[modelName];
  }
}

// Export singleton instance
export const aiOrchestrator = new AIOrchestrator();
