/**
 * Curation Progress Tracker - Real-time progress updates with SSE support
 * Stores progress in memory for live feedback during curation runs
 */

import { Response } from 'express';

export interface ProgressUpdate {
  time: string;
  icon: string;
  message: string;
  data?: string;
  type: 'info' | 'success' | 'error' | 'search' | 'analyze' | 'added' | 'skipped';
  videoTitle?: string;
  instructor?: string;
  reason?: string;
}

export interface CurationProgress {
  updates: ProgressUpdate[];
  status: 'running' | 'complete' | 'failed';
  summary?: {
    analyzed: number;
    approved: number;
    rejected: number;
    quotaUsed: number;
    newVideos?: Array<{ title: string; instructor: string }>;
  };
  error?: string;
}

const progressStore = new Map<string, CurationProgress>();
const sseClients = new Map<string, Response[]>();
const newVideosStore = new Map<string, Array<{ title: string; instructor: string }>>();

export function subscribeSSE(runId: string, res: Response): void {
  if (!sseClients.has(runId)) {
    sseClients.set(runId, []);
  }
  sseClients.get(runId)!.push(res);
  
  const progress = progressStore.get(runId);
  if (progress) {
    for (const update of progress.updates) {
      sendSSE(res, update);
    }
  }
  
  console.log(`[SSE] Client subscribed to run ${runId}`);
}

export function unsubscribeSSE(runId: string, res: Response): void {
  const clients = sseClients.get(runId);
  if (clients) {
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
    }
  }
}

function sendSSE(res: Response, update: ProgressUpdate): void {
  try {
    res.write(`data: ${JSON.stringify(update)}\n\n`);
  } catch (e) {}
}

function broadcastSSE(runId: string, update: ProgressUpdate): void {
  const clients = sseClients.get(runId);
  if (clients) {
    for (const client of clients) {
      sendSSE(client, update);
    }
  }
}

export function initProgress(runId: string): void {
  progressStore.set(runId, {
    updates: [],
    status: 'running'
  });
  newVideosStore.set(runId, []);
}

export function logProgress(
  runId: string, 
  message: string, 
  icon: string = '•',
  data?: string,
  type: 'info' | 'success' | 'error' | 'search' | 'analyze' | 'added' | 'skipped' = 'info',
  extra?: { videoTitle?: string; instructor?: string; reason?: string }
): void {
  const progress = progressStore.get(runId);
  if (!progress) {
    console.warn(`[PROGRESS] No progress found for run ${runId}`);
    return;
  }
  
  const update: ProgressUpdate = {
    time: new Date().toLocaleTimeString('en-US', { 
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }),
    icon,
    message,
    data,
    type,
    ...extra
  };
  
  progress.updates.push(update);
  progressStore.set(runId, progress);
  broadcastSSE(runId, update);
  
  console.log(`[PROGRESS] ${runId.substring(0, 8)}: ${icon} ${message}${data ? ` (${data})` : ''}`);
}

export function logSearch(runId: string, query: string): void {
  logProgress(runId, `Searching YouTube for: "${query}"`, '🔍', undefined, 'search');
}

export function logAnalyze(runId: string, videoTitle: string): void {
  logProgress(runId, `Analyzing: ${videoTitle.substring(0, 60)}...`, '🎬', undefined, 'analyze', { videoTitle });
}

export function logAdded(runId: string, videoTitle: string, instructor: string): void {
  const newVideos = newVideosStore.get(runId);
  if (newVideos) {
    newVideos.push({ title: videoTitle, instructor });
  }
  logProgress(runId, `Added: ${videoTitle.substring(0, 50)}...`, '✅', `by ${instructor}`, 'added', { videoTitle, instructor });
}

export function logSkipped(runId: string, videoTitle: string, reason: string): void {
  logProgress(runId, `Skipped: ${videoTitle.substring(0, 40)}...`, '⏭️', reason, 'skipped', { videoTitle, reason });
}

export function completeProgress(
  runId: string,
  summary: {
    analyzed: number;
    approved: number;
    rejected: number;
    quotaUsed: number;
  }
): void {
  const progress = progressStore.get(runId);
  if (!progress) return;
  
  const newVideos = newVideosStore.get(runId) || [];
  progress.status = 'complete';
  progress.summary = { ...summary, newVideos };
  progressStore.set(runId, progress);
  
  const doneUpdate: ProgressUpdate = {
    time: new Date().toLocaleTimeString('en-US', { 
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }),
    icon: '🎉',
    message: `Curation complete: ${summary.analyzed} analyzed, ${summary.approved} added, ${summary.rejected} skipped`,
    type: 'success',
    data: JSON.stringify({ analyzed: summary.analyzed, approved: summary.approved, rejected: summary.rejected, newVideos })
  };
  
  progress.updates.push(doneUpdate);
  broadcastSSE(runId, doneUpdate);
  
  console.log(`[PROGRESS] ${runId.substring(0, 8)}: 🎉 Curation complete - ${summary.approved} videos added`);
}

export function failProgress(runId: string, error: string): void {
  const progress = progressStore.get(runId);
  if (!progress) return;
  
  progress.status = 'failed';
  progress.error = error;
  progressStore.set(runId, progress);
  
  logProgress(runId, `Error: ${error}`, '❌', undefined, 'error');
}

export function getProgress(runId: string): CurationProgress | null {
  return progressStore.get(runId) || null;
}

export function cleanupOldProgress(): void {
  const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
  let cleaned = 0;
  
  for (const [runId, progress] of Array.from(progressStore.entries())) {
    if (progress.status !== 'running') {
      progressStore.delete(runId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[PROGRESS] Cleaned up ${cleaned} old progress entries`);
  }
}
