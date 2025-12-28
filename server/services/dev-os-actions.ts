import { db } from '../db';
import { eq, desc } from 'drizzle-orm';
import { devOsActions } from '@shared/schema';

// ============================================================================
// ACTION EXTRACTION - Parse Dev OS responses for executable actions
// ============================================================================

export interface DevOsAction {
  type: 'tier1_auto' | 'tier2_approved' | 'tier3_guided';
  action: string;
  description: string;
  parameters?: Record<string, any>;
}

export function extractActions(devOsResponse: string): DevOsAction[] {
  const actions: DevOsAction[] = [];
  
  // Pattern 1: Tier 1 auto-execute actions
  // Look for "🔧 AUTO-RESOLVED ISSUE" pattern
  const tier1Pattern = /🔧 AUTO-RESOLVED ISSUE[\s\S]*?Action taken: ([^\n]+)/g;
  let match;
  
  while ((match = tier1Pattern.exec(devOsResponse)) !== null) {
    actions.push({
      type: 'tier1_auto',
      action: 'auto_resolved',
      description: match[1].trim(),
      parameters: {}
    });
  }
  
  // Pattern 2: Tier 2 proposed actions
  // Look for "PROPOSED CHANGE (Requires approval)" pattern
  if (devOsResponse.includes('PROPOSED CHANGE (Requires approval)')) {
    actions.push({
      type: 'tier2_approved',
      action: 'proposal',
      description: 'User approval needed for proposed change',
      parameters: {}
    });
  }
  
  // Pattern 3: Tier 3 guidance (no execution)
  if (devOsResponse.includes("That's a Tier 3 change")) {
    actions.push({
      type: 'tier3_guided',
      action: 'guidance',
      description: 'Tier 3 guidance provided - admin execution required',
      parameters: {}
    });
  }
  
  return actions;
}

// ============================================================================
// ACTION EXECUTION - Execute Tier 1 actions automatically
// ============================================================================

export async function executeAuthorizedActions(
  actions: DevOsAction[],
  adminUserId: string
): Promise<string[]> {
  const results: string[] = [];
  
  for (const action of actions) {
    if (action.type === 'tier1_auto') {
      // Only execute Tier 1 (auto-approved) actions
      const result = await executeTier1Action(action, adminUserId);
      results.push(result);
      
      // Log action execution
      await logAction(adminUserId, action, result);
    }
    // Tier 2 and 3 actions are not auto-executed
  }
  
  return results;
}

async function executeTier1Action(
  action: DevOsAction,
  adminUserId: string
): Promise<string> {
  try {
    // Tier 1 actions that are safe to auto-execute
    switch (action.action) {
      case 'rotate_queries':
        return await rotateSearchQueries();
      
      case 'pause_curation':
        return await pauseCuration();
      
      case 'adjust_rate_limit':
        return await adjustRateLimit(action.parameters);
      
      case 'auto_resolved':
        // Generic auto-resolved action (already executed by Dev OS logic)
        return `Auto-resolved: ${action.description}`;
      
      default:
        return `Unknown Tier 1 action: ${action.action}`;
    }
  } catch (error: any) {
    return `Tier 1 action failed: ${error.message}`;
  }
}

// ============================================================================
// SPECIFIC TIER 1 ACTIONS
// ============================================================================

async function rotateSearchQueries(): Promise<string> {
  // Rotate curation search queries to find different content
  // This would integrate with your auto-curation system
  console.log('[DEV OS] Rotating search queries...');
  return 'Search queries rotated successfully';
}

async function pauseCuration(): Promise<string> {
  // Pause auto-curation if API quota is critical
  // This would integrate with your emergency curation system
  console.log('[DEV OS] Pausing curation due to API quota concerns...');
  return 'Auto-curation paused';
}

async function adjustRateLimit(parameters?: Record<string, any>): Promise<string> {
  // Adjust API rate limits to prevent quota exhaustion
  const newLimit = parameters?.limit || 50;
  console.log(`[DEV OS] Adjusting rate limit to ${newLimit} requests/minute...`);
  return `Rate limit adjusted to ${newLimit} req/min`;
}

// ============================================================================
// ACTION LOGGING - Audit trail for all actions
// ============================================================================

async function logAction(
  adminUserId: string,
  action: DevOsAction,
  result: string
): Promise<void> {
  await db.insert(devOsActions).values({
    adminUserId,
    actionType: action.type,
    actionDescription: action.description,
    parameters: action.parameters || {},
    result,
    executedAt: new Date()
  });
}

// ============================================================================
// ACTION HISTORY - Retrieve past actions
// ============================================================================

export async function getActionHistory(adminUserId: string, limit: number = 50) {
  return await db.select()
    .from(devOsActions)
    .where(eq(devOsActions.adminUserId, adminUserId))
    .orderBy(desc(devOsActions.executedAt))
    .limit(limit);
}
