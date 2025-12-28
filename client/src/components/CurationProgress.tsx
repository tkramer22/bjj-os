import { useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ProgressUpdate {
  time: string;
  icon: string;
  message: string;
  data?: string;
  type: 'info' | 'success' | 'error';
}

interface CurationProgressProps {
  isRunning: boolean;
  updates: ProgressUpdate[];
  runId?: string;
}

export function CurationProgress({ isRunning, updates, runId }: CurationProgressProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [updates]);
  
  if (!isRunning && updates.length === 0) return null;
  
  const estimatedTotal = 20;
  const progressPercent = Math.min((updates.length / estimatedTotal) * 100, 100);
  
  return (
    <Card className="mt-4 overflow-hidden border-purple-500/20 bg-card/50 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold">
            {isRunning ? '⏳ Curation Running...' : '✅ Curation Complete'}
          </h4>
          {runId && (
            <Badge variant="outline" className="text-xs font-mono">
              {runId.substring(0, 8)}
            </Badge>
          )}
        </div>
        {isRunning && (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-500" />
        )}
      </div>
      
      <div 
        ref={progressRef}
        className="max-h-[400px] overflow-y-auto p-4 font-mono text-xs leading-relaxed"
        data-testid="curation-progress-feed"
      >
        {updates.map((update, i) => (
          <div 
            key={i} 
            className={`
              grid grid-cols-[100px_30px_1fr_auto] gap-3 rounded px-3 py-2 transition-colors hover:bg-muted/30
              ${update.type === 'success' ? 'text-green-400' : ''}
              ${update.type === 'error' ? 'text-red-400' : ''}
              ${update.type === 'info' ? 'text-blue-400' : ''}
            `}
            data-testid={`progress-update-${i}`}
          >
            <span className="opacity-60">{update.time}</span>
            <span className="text-center">{update.icon}</span>
            <span className="text-foreground/90">{update.message}</span>
            {update.data && (
              <span className="text-yellow-400/80">{update.data}</span>
            )}
          </div>
        ))}
      </div>
      
      {isRunning && (
        <div className="border-t border-border/50 bg-muted/30 px-4 py-3">
          <div className="mb-2 h-1 overflow-hidden rounded-full bg-muted">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Step {updates.length} of ~{estimatedTotal}
          </p>
        </div>
      )}
    </Card>
  );
}
