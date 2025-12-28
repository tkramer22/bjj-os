/**
 * Shared TypeScript types for Content-First Curator
 * Used by both backend and frontend for type safety
 */

export interface CuratorProgressUpdate {
  techniquesProcessed: number;
  videosAnalyzed: number;
  videosSaved: number;
  newInstructorsDiscovered: number;
  currentTechnique: string | null;
}

export interface CuratorJobStatus {
  running: boolean;
  progress: number;
  result: CuratorResult | null;
  startTime?: number;
  techniquesTotal?: number;
  techniquesProcessed?: number;
  videosAnalyzed?: number;
  videosSaved?: number;
  newInstructorsDiscovered?: number;
  currentTechnique?: string | null;
  elapsedTime?: number;
}

export interface CuratorResult {
  success: boolean;
  techniquesSearched?: number;
  videosAnalyzed?: number;
  videosSaved?: number;
  newInstructorsDiscovered?: number;
  error?: string;
}
