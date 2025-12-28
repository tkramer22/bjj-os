import { db } from "./db";
import { activityLog, systemErrors } from "@shared/schema";

/**
 * Log activity for dashboard feed
 * @param eventType - Type of event (user_signup, payment_succeeded, trial_converted, payment_failed, ai_conversation, etc.)
 * @param userId - User ID (optional)
 * @param userEmail - User email (optional)
 * @param description - Human-readable description
 * @param metadata - Additional event metadata (optional)
 */
export async function logActivity(
  eventType: string,
  userId: string | null,
  userEmail: string | null,
  description: string,
  metadata: Record<string, any> | null = null
): Promise<void> {
  try {
    await db.insert(activityLog).values({
      eventType,
      userId: userId || undefined,
      userEmail: userEmail || undefined,
      description,
      metadata: metadata || undefined,
    });
  } catch (error) {
    console.error('[ACTIVITY LOG] Failed to log activity:', error);
  }
}

/**
 * Log system error for monitoring
 * @param errorType - Type of error (e.g., 'SMS', 'AI', 'VIDEO', 'DATABASE', 'AUTH', 'API')
 * @param errorMessage - Error message
 * @param context - Additional context (optional)
 * @param severity - Error severity: low, medium, high, critical
 */
export async function logSystemError(
  errorType: string,
  errorMessage: string,
  context: Record<string, any> | null = null,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): Promise<void> {
  try {
    await db.insert(systemErrors).values({
      errorType,
      errorMessage,
      stackTrace: context?.stack || undefined,
      userId: context?.userId || undefined,
      endpoint: context?.endpoint || undefined,
      method: context?.method || undefined,
      requestBody: context?.requestBody || undefined,
      severity,
      resolved: false,
    });
    
    // Log critical errors to console as well
    if (severity === 'critical' || severity === 'high') {
      console.error(`[SYSTEM ERROR - ${severity.toUpperCase()}] ${errorType}: ${errorMessage}`, context);
    }
  } catch (error) {
    console.error('[SYSTEM ERROR LOG] Failed to log system error:', error);
  }
}
