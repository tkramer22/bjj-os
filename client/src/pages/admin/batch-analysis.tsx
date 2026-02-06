import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  ArrowLeft, Play, RotateCcw, Loader2, CheckCircle, XCircle, 
  Brain, Database, Clock, Zap, AlertTriangle, Activity, CalendarPlus, ChevronDown
} from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface KnowledgeStatus {
  totalVideos: number;
  processed: number;
  pending: number;
  missingAnalysis: number;
  withTranscript: number;
  withoutTranscript: number;
  totalTechniques: number;
  recentlyProcessed: { title: string; techniquesExtracted: number; processedAt: string }[];
}

interface BatchProgress {
  isRunning: boolean;
  startedAt: string | null;
  totalProcessed: number;
  totalSucceeded: number;
  totalFailed: number;
  totalTechniques: number;
  currentBatch: number;
  lastMessage: string;
  completedAt: string | null;
  errors: string[];
  knowledgeStatus?: KnowledgeStatus;
}

async function adminApiRequest(url: string, method: string = 'GET', body?: unknown) {
  const token = localStorage.getItem('adminToken');
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Authentication required');
    }
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || error.error || 'Request failed');
  }
  return res.json();
}

function formatDuration(startIso: string): string {
  const start = new Date(startIso).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - start) / 1000);
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

export default function BatchAnalysis() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [elapsedTime, setElapsedTime] = useState('');
  const [justStarted, setJustStarted] = useState(false);
  const [daysBack, setDaysBack] = useState('7');

  const { data: newVideosData } = useQuery<{ totalNew: number; needingAnalysis: number; days: number }>({
    queryKey: ['/api/admin/new-videos-count', daysBack],
    queryFn: () => adminApiRequest(`/api/admin/new-videos-count?days=${daysBack}`),
    refetchInterval: 30000,
  });

  const analyzeNewMutation = useMutation({
    mutationFn: () => adminApiRequest('/api/admin/analyze-new-videos', 'POST', { daysBack: parseInt(daysBack) }),
    onSuccess: () => {
      setJustStarted(true);
      toast({ title: "New Videos Analysis Started", description: `Processing new videos from last ${daysBack} days in the background.` });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/batch-analysis-progress'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/new-videos-count', daysBack] });
    },
    onError: (error: Error) => {
      setJustStarted(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: progress, isLoading } = useQuery<BatchProgress>({
    queryKey: ['/api/admin/batch-analysis-progress'],
    queryFn: () => adminApiRequest('/api/admin/batch-analysis-progress'),
    refetchInterval: (query) => {
      const data = query.state.data as BatchProgress | undefined;
      if (justStarted || data?.isRunning) return 2000;
      return 15000;
    },
  });

  useEffect(() => {
    if (justStarted && progress?.isRunning) {
      setJustStarted(false);
    }
  }, [justStarted, progress?.isRunning]);

  useEffect(() => {
    if (!justStarted) return;
    const timeout = setTimeout(() => {
      setJustStarted(false);
    }, 15000);
    return () => clearTimeout(timeout);
  }, [justStarted]);

  const startMutation = useMutation({
    mutationFn: () => adminApiRequest('/api/admin/analyze-all-videos', 'POST'),
    onSuccess: () => {
      setJustStarted(true);
      toast({ title: "Analysis Started", description: "Processing all missing videos in the background. Progress will update automatically." });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/batch-analysis-progress'] });
    },
    onError: (error: Error) => {
      setJustStarted(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => adminApiRequest('/api/admin/reset-failed-videos', 'POST'),
    onSuccess: (data: any) => {
      toast({ title: "Reset Complete", description: `Reset ${data.reset} failed videos for retry.` });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/batch-analysis-progress'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!progress?.isRunning || !progress?.startedAt) {
      setElapsedTime('');
      return;
    }
    const interval = setInterval(() => {
      setElapsedTime(formatDuration(progress.startedAt!));
    }, 1000);
    return () => clearInterval(interval);
  }, [progress?.isRunning, progress?.startedAt]);

  const status = progress?.knowledgeStatus;
  const missingAnalysis = status ? status.missingAnalysis : 0;
  const total = status ? status.totalVideos : 0;
  const processed = status ? status.processed : 0;
  const analyzed = total - missingAnalysis;
  const percentComplete = total > 0 ? Math.round((analyzed / total) * 100) : 0;
  const costLow = (missingAnalysis * 0.025).toFixed(2);
  const costHigh = (missingAnalysis * 0.05).toFixed(2);
  const estTimeMins = Math.ceil(missingAnalysis * 0.5 / 60);
  const estTimeHours = Math.ceil(missingAnalysis / 60);
  const isRunningOrStarting = progress?.isRunning || justStarted || startMutation.isPending;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#e2e8f0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <Link href="/admin/command-center">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft />
            </Button>
          </Link>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#f1f5f9' }} data-testid="text-page-title">
              Gemini Batch Analysis
            </h1>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
              Process all missing video knowledge with AI
            </p>
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <Loader2 style={{ width: 32, height: 32, animation: 'spin 1s linear infinite', color: '#8B5CF6' }} />
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <Card>
                <CardContent style={{ padding: '1rem', textAlign: 'center' }}>
                  <Database style={{ width: 20, height: 20, margin: '0 auto 0.4rem', color: '#8B5CF6' }} />
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' }} data-testid="text-total-videos">{total.toLocaleString()}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Total Videos</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent style={{ padding: '1rem', textAlign: 'center' }}>
                  <CheckCircle style={{ width: 20, height: 20, margin: '0 auto 0.4rem', color: '#22c55e' }} />
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }} data-testid="text-processed-videos">{analyzed.toLocaleString()}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>With Analysis</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent style={{ padding: '1rem', textAlign: 'center' }}>
                  <AlertTriangle style={{ width: 20, height: 20, margin: '0 auto 0.4rem', color: '#f59e0b' }} />
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }} data-testid="text-pending-videos">{missingAnalysis.toLocaleString()}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Missing Analysis</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent style={{ padding: '1rem', textAlign: 'center' }}>
                  <Brain style={{ width: 20, height: 20, margin: '0 auto 0.4rem', color: '#a78bfa' }} />
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#a78bfa' }} data-testid="text-total-techniques">{(status?.totalTechniques || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Techniques</div>
                </CardContent>
              </Card>
            </div>

            <Card style={{ marginBottom: '1.5rem' }}>
              <CardContent style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9' }}>Overall Coverage</span>
                  <Badge variant={percentComplete === 100 ? 'default' : 'secondary'}>
                    {percentComplete}%
                  </Badge>
                </div>
                <Progress value={percentComplete} style={{ height: 8 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: '#64748b' }}>
                  <span>{analyzed.toLocaleString()} analyzed</span>
                  <span>{missingAnalysis.toLocaleString()} remaining</span>
                </div>
              </CardContent>
            </Card>

            <Card style={{ marginBottom: '1.5rem', borderColor: '#22c55e30' }}>
              <CardHeader style={{ padding: '1rem 1.25rem 0.75rem' }}>
                <CardTitle style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CalendarPlus style={{ width: 16, height: 16, color: '#22c55e' }} />
                  Analyze Recently Added Videos
                </CardTitle>
              </CardHeader>
              <CardContent style={{ padding: '0 1.25rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Videos added in last:</span>
                  <Select value={daysBack} onValueChange={setDaysBack}>
                    <SelectTrigger style={{ width: 140 }} data-testid="select-days-back">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">24 hours</SelectItem>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.2rem' }}>New Videos</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9' }} data-testid="text-new-total">
                      {(newVideosData?.totalNew ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Need Analysis</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: (newVideosData?.needingAnalysis ?? 0) > 0 ? '#f59e0b' : '#22c55e' }} data-testid="text-new-needing">
                      {(newVideosData?.needingAnalysis ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Est. Cost</div>
                    <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>
                      ${((newVideosData?.needingAnalysis ?? 0) * 0.025).toFixed(2)} - ${((newVideosData?.needingAnalysis ?? 0) * 0.05).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Est. Time</div>
                    <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>
                      {Math.max(1, Math.ceil((newVideosData?.needingAnalysis ?? 0) * 0.5 / 60))}-{Math.max(1, Math.ceil((newVideosData?.needingAnalysis ?? 0) / 60))} min
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => {
                    const needing = newVideosData?.needingAnalysis ?? 0;
                    if (isRunningOrStarting || needing === 0) return;
                    const costLowNew = (needing * 0.025).toFixed(2);
                    const costHighNew = (needing * 0.05).toFixed(2);
                    if (confirm(`Analyze ${needing} new videos from the last ${daysBack} day(s)?\n\nEstimated cost: $${costLowNew} - $${costHighNew}\n\nContinue?`)) {
                      analyzeNewMutation.mutate();
                    }
                  }}
                  disabled={isRunningOrStarting || (newVideosData?.needingAnalysis ?? 0) === 0 || analyzeNewMutation.isPending}
                  style={{
                    width: '100%',
                    background: isRunningOrStarting ? '#374151' : (newVideosData?.needingAnalysis ?? 0) === 0 ? '#1e293b' : '#22c55e',
                    border: 'none',
                    color: '#fff',
                  }}
                  data-testid="button-analyze-new"
                >
                  {analyzeNewMutation.isPending ? (
                    <>
                      <Loader2 style={{ width: 16, height: 16, marginRight: 6, animation: 'spin 1s linear infinite' }} />
                      Starting...
                    </>
                  ) : (newVideosData?.needingAnalysis ?? 0) === 0 ? (
                    <>
                      <CheckCircle style={{ width: 16, height: 16, marginRight: 6 }} />
                      All New Videos Analyzed
                    </>
                  ) : (
                    <>
                      <Play style={{ width: 16, height: 16, marginRight: 6 }} />
                      Analyze New Videos ({(newVideosData?.needingAnalysis ?? 0).toLocaleString()})
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {missingAnalysis > 0 && (
              <Card style={{ marginBottom: '1.5rem', borderColor: '#8B5CF620' }}>
                <CardHeader style={{ padding: '1rem 1.25rem 0.5rem' }}>
                  <CardTitle style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Zap style={{ width: 16, height: 16, color: '#f59e0b' }} />
                    Estimated Cost & Time
                  </CardTitle>
                </CardHeader>
                <CardContent style={{ padding: '0.5rem 1.25rem 1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Cost Range</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9' }} data-testid="text-cost-estimate">
                        ${costLow} - ${costHigh}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Est. Duration</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9' }} data-testid="text-time-estimate">
                        {estTimeMins}-{estTimeHours} min
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Rate</div>
                      <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>~120 videos/min (dual key)</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Batch Size</div>
                      <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>20 videos per batch</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {isRunningOrStarting && (
              <Card style={{ marginBottom: '1.5rem', borderColor: '#8B5CF650' }}>
                <CardContent style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: '#22c55e',
                      boxShadow: '0 0 8px #22c55e80',
                      animation: 'pulse 2s ease-in-out infinite',
                    }} />
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#22c55e' }} data-testid="text-running-status">
                      {justStarted && !progress?.isRunning ? 'Starting Analysis...' : 'Analysis Running'}
                    </span>
                    {elapsedTime && (
                      <Badge variant="outline" style={{ marginLeft: 'auto' }}>
                        <Clock style={{ width: 12, height: 12, marginRight: 4 }} />
                        {elapsedTime}
                      </Badge>
                    )}
                  </div>

                  {progress?.isRunning ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#22c55e' }}>{progress.totalSucceeded}</div>
                          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Succeeded</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#ef4444' }}>{progress.totalFailed}</div>
                          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Failed</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#a78bfa' }}>{progress.totalTechniques}</div>
                          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Techniques</div>
                        </div>
                      </div>

                      <div style={{
                        background: '#1e1b2e',
                        borderRadius: 6,
                        padding: '0.6rem 0.75rem',
                        fontSize: '0.75rem',
                        color: '#a78bfa',
                        fontFamily: 'monospace',
                      }} data-testid="text-last-message">
                        <Activity style={{ width: 12, height: 12, display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                        Batch {progress.currentBatch} | {progress.lastMessage}
                      </div>
                    </>
                  ) : (
                    <div style={{
                      background: '#1e1b2e',
                      borderRadius: 6,
                      padding: '0.75rem',
                      fontSize: '0.8rem',
                      color: '#94a3b8',
                      textAlign: 'center',
                    }}>
                      <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite', display: 'inline', verticalAlign: 'middle', marginRight: 6, color: '#8B5CF6' }} />
                      Initializing batch processing... Progress will appear shortly.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {progress?.completedAt && !isRunningOrStarting && (
              <Card style={{ marginBottom: '1.5rem', borderColor: '#22c55e40' }}>
                <CardContent style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <CheckCircle style={{ width: 18, height: 18, color: '#22c55e' }} />
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#22c55e' }}>
                      Last Run Complete
                    </span>
                    <Badge variant="outline" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>
                      {formatTimeAgo(progress.completedAt)}
                    </Badge>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#22c55e' }}>{progress.totalSucceeded}</div>
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Succeeded</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ef4444' }}>{progress.totalFailed}</div>
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Failed</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#a78bfa' }}>{progress.totalTechniques}</div>
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Techniques</div>
                    </div>
                  </div>
                  {progress.errors.length > 0 && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444', marginBottom: '0.4rem' }}>
                        <XCircle style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                        Errors ({progress.errors.length})
                      </div>
                      <div style={{
                        background: '#1a1520',
                        borderRadius: 6,
                        padding: '0.5rem',
                        maxHeight: 120,
                        overflow: 'auto',
                        fontSize: '0.65rem',
                        color: '#94a3b8',
                        fontFamily: 'monospace',
                      }}>
                        {progress.errors.slice(0, 10).map((e, i) => (
                          <div key={i} style={{ marginBottom: 2 }}>{e}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <Button
                onClick={() => {
                  if (isRunningOrStarting) return;
                  if (confirm(`This will analyze ALL ${missingAnalysis} missing videos.\n\nEstimated cost: $${costLow} - $${costHigh}\nEstimated time: ${estTimeMins}-${estTimeHours} minutes\n\nContinue?`)) {
                    startMutation.mutate();
                  }
                }}
                disabled={isRunningOrStarting || missingAnalysis === 0}
                style={{
                  flex: 1,
                  background: isRunningOrStarting ? '#374151' : missingAnalysis === 0 ? '#1e293b' : '#8B5CF6',
                  border: 'none',
                  cursor: isRunningOrStarting ? 'not-allowed' : undefined,
                  opacity: isRunningOrStarting ? 0.8 : 1,
                }}
                data-testid="button-start-analysis"
              >
                {progress?.isRunning ? (
                  <>
                    <Loader2 style={{ width: 16, height: 16, marginRight: 6, animation: 'spin 1s linear infinite' }} />
                    Analysis Running... (check progress above)
                  </>
                ) : justStarted || startMutation.isPending ? (
                  <>
                    <Loader2 style={{ width: 16, height: 16, marginRight: 6, animation: 'spin 1s linear infinite' }} />
                    Starting Analysis...
                  </>
                ) : missingAnalysis === 0 ? (
                  <>
                    <CheckCircle style={{ width: 16, height: 16, marginRight: 6 }} />
                    All Videos Analyzed
                  </>
                ) : (
                  <>
                    <Play style={{ width: 16, height: 16, marginRight: 6 }} />
                    Start Full Analysis ({missingAnalysis.toLocaleString()} videos)
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending || isRunningOrStarting}
                data-testid="button-reset-failed"
              >
                {resetMutation.isPending ? (
                  <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                ) : (
                  <RotateCcw style={{ width: 16, height: 16 }} />
                )}
              </Button>
            </div>

            {status?.recentlyProcessed && status.recentlyProcessed.length > 0 && (
              <Card>
                <CardHeader style={{ padding: '1rem 1.25rem 0.5rem' }}>
                  <CardTitle style={{ fontSize: '0.95rem' }}>Recently Processed</CardTitle>
                </CardHeader>
                <CardContent style={{ padding: '0 1.25rem 1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {status.recentlyProcessed.map((v, i) => (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        padding: '0.4rem 0',
                        borderBottom: i < status.recentlyProcessed.length - 1 ? '1px solid #1e293b' : 'none',
                      }}>
                        <span style={{
                          fontSize: '0.75rem',
                          color: '#cbd5e1',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }} data-testid={`text-recent-video-${i}`}>
                          {v.title}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          <Badge variant="secondary" style={{ fontSize: '0.6rem' }}>
                            {v.techniquesExtracted} tech
                          </Badge>
                          <span style={{ fontSize: '0.6rem', color: '#64748b' }}>
                            {formatTimeAgo(v.processedAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
