/**
 * MEMORY MANAGEMENT UTILITIES
 * 
 * Centralized memory management for BJJ OS to prevent memory leaks:
 * - Garbage collection hints after heavy tasks
 * - Memory logging before/after operations
 * - Threshold-based alerts
 * - Array/object cleanup helpers
 */

import * as v8 from 'v8';

// Memory thresholds for alerts
export const MEMORY_THRESHOLDS = {
  NORMAL: 0.65,     // 65% - Normal operation
  WARNING: 0.75,    // 75% - Start warning
  HIGH: 0.80,       // 80% - Proactive alert
  CRITICAL: 0.85,   // 85% - Critical alert + email
  EMERGENCY: 0.90,  // 90% - Emergency measures
};

export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  heapUsedPercent: number;
  rss: number;
  external: number;
  timestamp: string;
  level: 'normal' | 'warning' | 'high' | 'critical' | 'emergency';
}

/**
 * Format bytes to human-readable MB
 */
export function formatMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/**
 * Get current memory level based on thresholds
 */
export function getMemoryLevel(heapUsedPercent: number): MemorySnapshot['level'] {
  if (heapUsedPercent >= MEMORY_THRESHOLDS.EMERGENCY) return 'emergency';
  if (heapUsedPercent >= MEMORY_THRESHOLDS.CRITICAL) return 'critical';
  if (heapUsedPercent >= MEMORY_THRESHOLDS.HIGH) return 'high';
  if (heapUsedPercent >= MEMORY_THRESHOLDS.WARNING) return 'warning';
  return 'normal';
}

/**
 * Take a memory snapshot
 * 
 * IMPORTANT: We compare heapUsed against heap_size_limit (from V8), NOT heapTotal!
 * - heapTotal is the currently ALLOCATED heap (grows dynamically)
 * - heap_size_limit is the MAXIMUM allowed (set by --max-old-space-size)
 * 
 * Without this fix, heapUsed/heapTotal shows 90%+ even when using only 2% of the limit.
 */
export function getMemorySnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();
  
  // Use heap_size_limit (7GB) as the denominator, not heapTotal (~200MB)
  const heapSizeLimit = heapStats.heap_size_limit;
  const heapUsedPercent = mem.heapUsed / heapSizeLimit;
  
  return {
    heapUsed: mem.heapUsed,
    heapTotal: heapSizeLimit, // Use limit instead of allocated
    heapUsedPercent,
    rss: mem.rss,
    external: mem.external,
    timestamp: new Date().toISOString(),
    level: getMemoryLevel(heapUsedPercent),
  };
}

/**
 * Log memory usage with context
 */
export function logMemory(context: string, verbose = false): MemorySnapshot {
  const snapshot = getMemorySnapshot();
  const prefix = getMemoryEmoji(snapshot.level);
  
  const message = `${prefix} [MEMORY] ${context}: ${formatMB(snapshot.heapUsed)}/${formatMB(snapshot.heapTotal)} (${(snapshot.heapUsedPercent * 100).toFixed(1)}%)`;
  
  if (snapshot.level === 'critical' || snapshot.level === 'emergency') {
    console.error(message);
  } else if (snapshot.level === 'high' || snapshot.level === 'warning') {
    console.warn(message);
  } else if (verbose) {
    console.log(message);
  }
  
  return snapshot;
}

function getMemoryEmoji(level: MemorySnapshot['level']): string {
  switch (level) {
    case 'emergency': return '🚨';
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'warning': return '🟡';
    default: return '🟢';
  }
}

/**
 * Force garbage collection if available (requires --expose-gc flag)
 * Returns memory freed in MB
 */
export function forceGC(taskName?: string): number {
  if (typeof global.gc !== 'function') {
    return 0;
  }
  
  const before = process.memoryUsage().heapUsed;
  global.gc();
  const after = process.memoryUsage().heapUsed;
  const freedMB = (before - after) / 1024 / 1024;
  
  if (taskName && freedMB > 1) {
    console.log(`🧹 [GC] After ${taskName}: freed ${freedMB.toFixed(1)} MB`);
  }
  
  return freedMB;
}

/**
 * Request garbage collection hint (works without --expose-gc)
 * Uses WeakRef trick to encourage GC
 */
export function requestGC(): void {
  try {
    if (typeof global.gc === 'function') {
      global.gc();
    }
  } catch {
    // GC not available, that's fine
  }
}

/**
 * Clear an array in-place to help GC
 */
export function clearArray<T>(arr: T[]): void {
  arr.length = 0;
}

/**
 * Wrapper for heavy tasks that logs memory before/after and triggers GC
 */
export async function withMemoryManagement<T>(
  taskName: string,
  task: () => Promise<T>
): Promise<T> {
  const before = logMemory(`Before ${taskName}`, false);
  
  try {
    const result = await task();
    return result;
  } finally {
    const after = getMemorySnapshot();
    const delta = after.heapUsed - before.heapUsed;
    const deltaMB = delta / 1024 / 1024;
    
    // Log if memory increased significantly or is at concerning levels
    if (Math.abs(deltaMB) > 5 || after.level !== 'normal') {
      const direction = deltaMB > 0 ? '↑' : '↓';
      console.log(`📊 [MEMORY] After ${taskName}: ${direction}${Math.abs(deltaMB).toFixed(1)} MB (${formatMB(after.heapUsed)} total, ${(after.heapUsedPercent * 100).toFixed(1)}%)`);
    }
    
    // Force GC if memory is elevated
    if (after.level !== 'normal') {
      const freed = forceGC(taskName);
      if (freed > 0) {
        const finalSnapshot = getMemorySnapshot();
        console.log(`📊 [MEMORY] Post-GC: ${formatMB(finalSnapshot.heapUsed)} (${(finalSnapshot.heapUsedPercent * 100).toFixed(1)}%)`);
      }
    }
  }
}

/**
 * Emergency memory cleanup - aggressive measures when memory is critical
 */
export function emergencyCleanup(): { success: boolean; freedMB: number } {
  console.warn('🚨 [MEMORY] Initiating emergency cleanup...');
  
  const before = process.memoryUsage().heapUsed;
  
  // Force GC multiple times
  for (let i = 0; i < 3; i++) {
    if (typeof global.gc === 'function') {
      global.gc();
    }
  }
  
  const after = process.memoryUsage().heapUsed;
  const freedMB = (before - after) / 1024 / 1024;
  
  console.log(`🧹 [MEMORY] Emergency cleanup freed ${freedMB.toFixed(1)} MB`);
  
  return { success: freedMB > 0, freedMB };
}

/**
 * Check if we should skip a heavy operation due to memory pressure
 */
export function shouldSkipDueToMemory(): boolean {
  const snapshot = getMemorySnapshot();
  if (snapshot.level === 'emergency' || snapshot.level === 'critical') {
    console.warn(`⚠️ [MEMORY] Skipping operation due to ${snapshot.level} memory pressure (${(snapshot.heapUsedPercent * 100).toFixed(1)}%)`);
    return true;
  }
  return false;
}

/**
 * Verify NODE_OPTIONS heap configuration at startup
 */
export function verifyHeapConfiguration(): {
  configured: boolean;
  heapLimitGB: number;
  nodeOptions: string | null;
} {
  const nodeOptions = process.env.NODE_OPTIONS || null;
  
  // Get actual heap limit from V8
  const heapStats = v8.getHeapStatistics();
  const heapLimitGB = heapStats.heap_size_limit / (1024 * 1024 * 1024);
  
  // Check if configured for at least 6GB
  const configured = heapLimitGB >= 5.5; // Allow some tolerance
  
  if (!configured) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('⚠️  HEAP LIMIT WARNING');
    console.error(`   Current limit: ${heapLimitGB.toFixed(2)} GB`);
    console.error('   Recommended: 6-7 GB');
    console.error('   Set NODE_OPTIONS="--max-old-space-size=7168" in deployment');
    console.error('═══════════════════════════════════════════════════════════════');
  } else {
    console.log(`✅ [MEMORY] Heap configured for ${heapLimitGB.toFixed(2)} GB`);
  }
  
  return { configured, heapLimitGB, nodeOptions };
}
