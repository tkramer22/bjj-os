import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { db } from './db';
import { aiModelUsage } from '../shared/schema';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model costs per 1M tokens (as of 2025)
const MODEL_COSTS = {
  'claude-sonnet-4-5': { input: 3.00, output: 15.00 },  // Claude Sonnet 4.5: $3/$15 per 1M tokens
  'gpt-4o': { input: 2.50, output: 10.00 },                      // GPT-4o: $2.50/$10 per 1M tokens
  'gpt-4o-mini': { input: 0.15, output: 0.60 }                   // GPT-4o-mini: $0.15/$0.60 per 1M tokens
};

export interface ModelRequest {
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json' | 'text';
}

export interface ModelResponse {
  content: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  responseTimeMs: number;
}

export class MultiModelRouter {

  // Main routing decision logic
  async route(taskType: string, request: ModelRequest, userId?: string): Promise<ModelResponse> {
    const startTime = Date.now();
    let modelName: string;
    let response: ModelResponse;

    // Route based on task type
    switch (taskType) {
      case 'coaching':
        // Use Claude Sonnet 4.5 for main coaching (best reasoning and empathy)
        modelName = 'claude-sonnet-4-5';
        response = await this.callClaude(request);
        break;

      case 'extraction':
        // Use GPT-4o-mini for entity extraction (fast and cheap)
        modelName = 'gpt-4o-mini';
        response = await this.callOpenAI(request, modelName);
        break;

      case 'embedding':
        // Use OpenAI embedding model (industry standard)
        response = await this.generateEmbedding(request.messages[0].content);
        modelName = 'text-embedding-3-small';
        break;

      case 'vision':
        // Use GPT-4o for vision tasks (best vision model)
        modelName = 'gpt-4o';
        response = await this.callOpenAI(request, modelName);
        break;

      case 'analysis':
        // Use Claude Sonnet 4.5 for complex analysis
        modelName = 'claude-sonnet-4-5';
        response = await this.callClaude(request);
        break;

      default:
        // Default to GPT-4o for general tasks
        modelName = 'gpt-4o';
        response = await this.callOpenAI(request, modelName);
    }

    // Track usage
    await this.trackUsage(userId, modelName, taskType, response.tokensInput, response.tokensOutput, response.costUsd, Date.now() - startTime);

    return response;
  }

  // Call Claude Sonnet 4
  private async callClaude(request: ModelRequest): Promise<ModelResponse> {
    const startTime = Date.now();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: request.maxTokens || 2048,
      temperature: request.temperature || 0.7,
      messages: request.messages as any
    });

    const tokensInput = response.usage.input_tokens;
    const tokensOutput = response.usage.output_tokens;
    const costUsd = this.calculateCost('claude-sonnet-4-5', tokensInput, tokensOutput);
    const responseTimeMs = Date.now() - startTime;

    const content = response.content[0].type === 'text' ? response.content[0].text : '';

    return {
      content,
      model: 'claude-sonnet-4-5',
      tokensInput,
      tokensOutput,
      costUsd,
      responseTimeMs
    };
  }

  // Call OpenAI models (GPT-4o, GPT-4o-mini)
  private async callOpenAI(request: ModelRequest, model: string): Promise<ModelResponse> {
    const startTime = Date.now();

    const completion = await openai.chat.completions.create({
      model: model === 'gpt-4o-mini' ? 'gpt-4o-mini' : 'gpt-4o',
      messages: request.messages as any,
      max_tokens: request.maxTokens || 2048,
      temperature: request.temperature || 0.7,
      response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined
    });

    const tokensInput = completion.usage?.prompt_tokens || 0;
    const tokensOutput = completion.usage?.completion_tokens || 0;
    const costUsd = this.calculateCost(model, tokensInput, tokensOutput);
    const responseTimeMs = Date.now() - startTime;

    const content = completion.choices[0]?.message?.content || '';

    return {
      content,
      model,
      tokensInput,
      tokensOutput,
      costUsd,
      responseTimeMs
    };
  }

  // Generate embeddings
  private async generateEmbedding(text: string): Promise<ModelResponse> {
    const startTime = Date.now();

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000)
    });

    const tokensInput = response.usage.prompt_tokens;
    const costUsd = (tokensInput / 1000000) * 0.02; // $0.02 per 1M tokens

    return {
      content: JSON.stringify(response.data[0].embedding),
      model: 'text-embedding-3-small',
      tokensInput,
      tokensOutput: 0,
      costUsd,
      responseTimeMs: Date.now() - startTime
    };
  }

  // Calculate cost based on model and token usage
  private calculateCost(model: string, tokensInput: number, tokensOutput: number): number {
    const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
    if (!costs) return 0;

    const inputCost = (tokensInput / 1000000) * costs.input;
    const outputCost = (tokensOutput / 1000000) * costs.output;

    return inputCost + outputCost;
  }

  // Track AI model usage for analytics and cost monitoring
  private async trackUsage(
    userId: string | undefined,
    modelName: string,
    taskType: string,
    tokensInput: number,
    tokensOutput: number,
    costUsd: number,
    responseTimeMs: number
  ) {
    try {
      await db.insert(aiModelUsage).values({
        userId: userId || null,
        modelName,
        taskType,
        tokensInput,
        tokensOutput,
        costUsd,
        responseTimeMs,
        createdAt: new Date()
      });
    } catch (error: any) {
      console.error('[ROUTER] Error tracking usage:', error.message);
    }
  }

  // Get usage statistics for a user
  async getUserUsageStats(userId: string): Promise<any> {
    const results = await db.execute(sql`
      SELECT 
        model_name,
        task_type,
        COUNT(*) as request_count,
        SUM(tokens_input) as total_tokens_input,
        SUM(tokens_output) as total_tokens_output,
        SUM(cost_usd) as total_cost_usd,
        AVG(response_time_ms) as avg_response_time_ms
      FROM ai_model_usage
      WHERE user_id = ${userId}
      GROUP BY model_name, task_type
      ORDER BY total_cost_usd DESC
    `);

    return results.rows;
  }

  // Get total platform usage statistics
  async getPlatformUsageStats(): Promise<any> {
    const results = await db.execute(sql`
      SELECT 
        model_name,
        task_type,
        COUNT(*) as request_count,
        SUM(tokens_input) as total_tokens_input,
        SUM(tokens_output) as total_tokens_output,
        SUM(cost_usd) as total_cost_usd,
        AVG(response_time_ms) as avg_response_time_ms,
        DATE(created_at) as date
      FROM ai_model_usage
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY model_name, task_type, DATE(created_at)
      ORDER BY date DESC, total_cost_usd DESC
    `);

    return results.rows;
  }
}

export const multiModelRouter = new MultiModelRouter();

// Helper function for easy usage throughout the codebase
export async function routeAIRequest(
  taskType: 'coaching' | 'extraction' | 'embedding' | 'vision' | 'analysis',
  request: ModelRequest,
  userId?: string
): Promise<ModelResponse> {
  return await multiModelRouter.route(taskType, request, userId);
}
