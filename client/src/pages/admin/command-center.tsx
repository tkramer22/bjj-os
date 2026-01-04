import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Pause, RefreshCw, Trash2, Activity, Mail, TestTube, Camera, AlertTriangle, Settings, ChevronDown, ChevronUp, ExternalLink, Radio, CheckCircle, XCircle, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { AdminLayout } from "./dashboard";

interface QATestResult {
  id: string;
  category: string;
  name: string;
  question: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
  duration?: number;
}

interface QATestReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  passPercentage: number;
  results: QATestResult[];
  warnings: string[];
}

interface DataQualityReport {
  totalVideos: number;
  issues: {
    missingThumbnails: number;
    genericInstructors: number;
    missingYoutubeIds: number;
  };
  healthPercentage: number;
  summary: string;
}

interface CommandResult {
  status: 'success' | 'error';
  title: string;
  timestamp: string;
  actions: string[];
  metrics?: Record<string, string | number>;
  changes?: Array<{ before: string; after: string }>;
  viewLink?: string;
  duration?: string;
}

interface CommandLog {
  id: number;
  command: string;
  success: boolean;
  message: string;
  executionTimeMs: number;
  timestamp: string;
}

interface CurationSettings {
  qualityThreshold: number;
  videosPerRun: number;
  focusInstructors: string;
}

interface ProgressEvent {
  id: string;
  timestamp: string;
  message: string;
  icon: string;
  detail?: string;
}

export default function CommandCenter() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, CommandResult>>({});
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [curationStatus, setCurationStatus] = useState<'idle' | 'running'>('idle');
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [settings, setSettings] = useState<CurationSettings>({
    qualityThreshold: 7.0,
    videosPerRun: 20,
    focusInstructors: ''
  });
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const progressEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // QA Test State
  const [qaTestRunning, setQaTestRunning] = useState(false);
  const [qaTestReport, setQaTestReport] = useState<QATestReport | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQualityReport | null>(null);
  const [dataQualityLoading, setDataQualityLoading] = useState(false);
  
  // Quick Curation Presets State
  const [selectedInstructor, setSelectedInstructor] = useState('');
  const [customInstructor, setCustomInstructor] = useState('');
  const [techniqueSearch, setTechniqueSearch] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedGiNogi, setSelectedGiNogi] = useState('');
  const [customSearch, setCustomSearch] = useState('');
  const [quickCurationRunning, setQuickCurationRunning] = useState<string | null>(null);
  
  // ISSUE 1: Auto Curation Toggle State
  const [autoCurationEnabled, setAutoCurationEnabled] = useState(true);
  const [lastRunStats, setLastRunStats] = useState<{
    discovered: number;
    analyzed: number;
    accepted: number;
    rejected: number;
    timestamp: string;
  } | null>(null);
  
  // ISSUE 2: Dynamic Instructor List with loading/error states
  const [instructorList, setInstructorList] = useState<string[]>([]);
  const [instructorListLoading, setInstructorListLoading] = useState(true);
  const [instructorListError, setInstructorListError] = useState<string | null>(null);
  
  // ISSUE 3: Dynamic Position List with loading/error states
  const [positionList, setPositionList] = useState<string[]>([]);
  const [positionListLoading, setPositionListLoading] = useState(true);
  const [positionListError, setPositionListError] = useState<string | null>(null);

  useEffect(() => {
    loadCommandLog();
    loadSettings();
    loadAutoCurationStatus();
    loadInstructors();
    loadPositions();
  }, []);
  
  // ISSUE 1: Load auto curation status
  const loadAutoCurationStatus = async () => {
    try {
      const res = await fetch('/api/admin/curation/auto-status');
      const data = await res.json();
      if (data) {
        setAutoCurationEnabled(data.enabled);
        setLastRunStats(data.lastRun);
      }
    } catch (error) {
      console.error('Failed to load auto curation status:', error);
    }
  };
  
  const toggleAutoCuration = async () => {
    try {
      const res = await fetch('/api/admin/curation/auto-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !autoCurationEnabled })
      });
      if (res.ok) {
        setAutoCurationEnabled(!autoCurationEnabled);
        toast({
          title: autoCurationEnabled ? 'Auto Curation Disabled' : 'Auto Curation Enabled',
          description: autoCurationEnabled ? 'Automatic curation paused' : 'Automatic curation will resume on schedule',
        });
      }
    } catch (error) {
      console.error('Failed to toggle auto curation:', error);
      toast({
        title: 'Error',
        description: 'Failed to toggle auto curation',
        variant: 'destructive',
      });
    }
  };
  
  // ISSUE 2: Load instructors from database
  const loadInstructors = async () => {
    setInstructorListLoading(true);
    setInstructorListError(null);
    try {
      const res = await fetch('/api/admin/instructors/all');
      if (!res.ok) throw new Error('Failed to fetch instructors');
      const data = await res.json();
      if (data.instructors) {
        setInstructorList(data.instructors);
      }
    } catch (error: any) {
      console.error('Failed to load instructors:', error);
      setInstructorListError(error.message || 'Failed to load instructors');
    } finally {
      setInstructorListLoading(false);
    }
  };
  
  // ISSUE 3: Load positions
  const loadPositions = async () => {
    setPositionListLoading(true);
    setPositionListError(null);
    try {
      const res = await fetch('/api/admin/positions/all');
      if (!res.ok) throw new Error('Failed to fetch positions');
      const data = await res.json();
      if (data.positions) {
        setPositionList(data.positions);
      }
    } catch (error: any) {
      console.error('Failed to load positions:', error);
      setPositionListError(error.message || 'Failed to load positions');
    } finally {
      setPositionListLoading(false);
    }
  };

  // Auto-scroll to bottom of progress feed
  useEffect(() => {
    if (progressEndRef.current && progressEvents.length > 0) {
      progressEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progressEvents]);

  // Subscribe to SSE progress stream
  const subscribeToProgress = (runId: string) => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setCurrentRunId(runId);
    setProgressEvents([]);

    const eventSource = new EventSource(`/api/admin/curation/stream?runId=${runId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle all progress types from the backend
        if (data.type === 'success' && data.message.includes('complete')) {
          // Completion event
          setProgressEvents(prev => [...prev, {
            id: crypto.randomUUID(),
            timestamp: data.time || new Date().toISOString(),
            message: data.message,
            icon: data.icon || '✅'
          }]);
          setCurationStatus('idle');
          loadCommandLog();
          eventSource.close();
        } else if (data.type === 'error') {
          // Error event
          setProgressEvents(prev => [...prev, {
            id: crypto.randomUUID(),
            timestamp: data.time || new Date().toISOString(),
            message: data.message,
            icon: data.icon || '❌'
          }]);
          setCurationStatus('idle');
          eventSource.close();
        } else {
          // Regular progress events (info, search, analyze, added, skipped)
          setProgressEvents(prev => [...prev, {
            id: crypto.randomUUID(),
            timestamp: data.time || new Date().toISOString(),
            message: data.message,
            icon: data.icon || '•',
            detail: data.data
          }]);
        }
      } catch (e) {
        console.error('Failed to parse SSE event:', e);
      }
    };

    eventSource.onerror = () => {
      console.log('SSE connection closed or error');
      eventSource.close();
      
      // Reset status and notify user
      setCurationStatus('idle');
      setProgressEvents(prev => [...prev, {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        message: 'Connection lost - check logs for final results',
        icon: '⚠️'
      }]);
      
      // Refresh command log to get latest status
      loadCommandLog();
    };
  };

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const loadCommandLog = async () => {
    try {
      const res = await fetch('/api/admin/command/log?limit=20');
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to load command log:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/admin/curation/settings');
      const data = await res.json();
      if (data) {
        setSettings({
          qualityThreshold: data.qualityThreshold || 7.0,
          videosPerRun: data.videosPerRun || 20,
          focusInstructors: data.focusInstructors?.join(', ') || ''
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      const res = await fetch('/api/admin/curation/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qualityThreshold: settings.qualityThreshold,
          videosPerRun: settings.videosPerRun,
          focusInstructors: settings.focusInstructors.split(',').map(s => s.trim()).filter(Boolean)
        })
      });

      if (res.ok) {
        toast({
          title: "✅ Settings Saved",
          description: "Changes will apply to next curation run",
        });
      }
    } catch (error: any) {
      toast({
        title: "❌ Failed to Save",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // Quick Curation - Run targeted curation with specific filters
  const runQuickCuration = async (type: string, query?: string, clearFn?: () => void) => {
    // Capture the query value before any async operations
    const queryValue = query?.trim();
    
    if (!queryValue && type !== 'meta') {
      toast({
        title: "Missing Query",
        description: "Please enter a search term",
        variant: "destructive"
      });
      return;
    }
    
    setQuickCurationRunning(type);
    try {
      const res = await fetch('/api/admin/curation/quick-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, query: queryValue })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        toast({
          title: "🚀 Quick Curation Started",
          description: `${type}: "${queryValue || 'meta techniques'}" - Results in 5-10 minutes`,
        });
        // Only clear input after successful request
        if (clearFn) clearFn();
      } else {
        toast({
          title: "❌ Curation Failed",
          description: data.error || 'Unknown error',
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: "❌ Request Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setQuickCurationRunning(null);
    }
  };

  // Run QA Tests
  const runQATests = async (categories: string[] = ['all']) => {
    setQaTestRunning(true);
    setQaTestReport(null);
    
    toast({
      title: "🧪 Running QA Tests",
      description: "This may take 2-5 minutes depending on test categories...",
    });
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout
    
    try {
      const res = await fetch('/api/admin/test-professor-os', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const report = await res.json();
      
      // Validate report structure
      if (report.error) {
        throw new Error(report.error);
      }
      
      if (typeof report.passPercentage !== 'number') {
        console.error('Invalid report structure:', report);
        throw new Error('Invalid test report format');
      }
      
      setQaTestReport(report);
      
      toast({
        title: report.passPercentage >= 80 ? "✅ QA Tests Complete" : "⚠️ QA Tests Complete",
        description: `${report.passed}/${report.totalTests} passed (${report.passPercentage}%)`,
        variant: report.passPercentage >= 80 ? "default" : "destructive"
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      const message = error.name === 'AbortError' 
        ? 'Test timed out after 10 minutes'
        : error.message;
      
      toast({
        title: "❌ QA Test Failed",
        description: message,
        variant: "destructive"
      });
    } finally {
      setQaTestRunning(false);
    }
  };
  
  // Check Data Quality
  const checkDataQuality = async () => {
    setDataQualityLoading(true);
    try {
      const res = await fetch('/api/admin/test-professor-os/data-quality');
      const data = await res.json();
      setDataQuality(data);
      
      toast({
        title: data.healthPercentage >= 95 ? "✅ Data Quality Good" : "⚠️ Data Issues Found",
        description: data.summary,
        variant: data.healthPercentage >= 95 ? "default" : "destructive"
      });
    } catch (error: any) {
      toast({
        title: "❌ Data Quality Check Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setDataQualityLoading(false);
    }
  };

  const executeCommand = async (command: string, params: any = {}) => {
    setLoading(prev => ({ ...prev, [command]: true }));

    try {
      const res = await fetch('/api/admin/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, params })
      });

      const result = await res.json();

      // Store rich result data if provided
      if (result.result) {
        setResults(prev => ({ ...prev, [command]: result.result }));
      }

      // Special handling for run_curation command
      const runId = result.runId || result.data?.runId;
      if (command === 'run_curation' && result.success && runId) {
        setCurationStatus('running');
        subscribeToProgress(runId);
        toast({
          title: "🚀 Curation Started",
          description: "Watch live progress below!",
        });
      } else if (command === 'run_curation' && result.success) {
        setCurationStatus('running');
        toast({
          title: "🚀 Curation Started",
          description: "Running in background. You'll receive an email in 5-10 minutes with results.",
        });
        setTimeout(() => setCurationStatus('idle'), 30000);
      } else {
        toast({
          title: result.success ? "✅ Command Executed" : "❌ Command Failed",
          description: result.message,
          variant: result.success ? "default" : "destructive"
        });
      }

      // Refresh command log
      await loadCommandLog();
      
      setLoading(prev => ({ ...prev, [command]: false }));

    } catch (error: any) {
      const errorMessage = error.message || 'Failed to execute command';
      
      setResults(prev => ({
        ...prev,
        [command]: {
          status: 'error',
          title: 'Command Failed',
          timestamp: new Date().toISOString(),
          actions: [errorMessage]
        }
      }));

      toast({
        title: "❌ Command Failed",
        description: errorMessage,
        variant: "destructive"
      });
      
      setLoading(prev => ({ ...prev, [command]: false }));
    }
  };

  // Result display component
  const ResultDisplay = ({ result }: { result: CommandResult }) => {
    return (
      <div className={`mt-3 rounded-lg border ${result.status === 'success' ? 'border-green-500/50 bg-green-500/5' : 'border-destructive/50 bg-destructive/5'}`}>
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{result.status === 'success' ? '✅' : '❌'}</span>
              <span className="font-semibold">{result.title}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(result.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {/* What Happened */}
          <div>
            <h4 className="text-sm font-semibold mb-1.5">What Happened:</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {result.actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Metrics */}
          {result.metrics && Object.keys(result.metrics).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Results:</h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(result.metrics).map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{key}</span>
                    <span className="text-sm font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Changes */}
          {result.changes && result.changes.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-1.5">Changes Made:</h4>
              <ul className="space-y-1 text-sm">
                {result.changes.map((change, i) => (
                  <li key={i} className="flex items-center gap-2 text-muted-foreground">
                    <span>{change.before}</span>
                    <span className="text-primary">→</span>
                    <span className="font-medium text-foreground">{change.after}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* View Link */}
          {result.viewLink && (
            <a 
              href={result.viewLink} 
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View Details <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    );
  };

  // Simplified command button
  const CommandButton = ({ 
    icon: Icon, 
    title, 
    duration,
    command, 
    danger = false
  }: { 
    icon: any; 
    title: string; 
    duration: string;
    command: string; 
    danger?: boolean;
  }) => {
    const isLoading = loading[command];
    const result = results[command];
    const isCurationRunning = command === 'run_curation' && curationStatus === 'running';

    return (
      <Card className={`${danger ? 'border-destructive/50' : ''} hover-elevate`}>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${danger ? 'text-destructive' : 'text-primary'}`} />
                <h3 className="font-semibold">{title}</h3>
              </div>
              <Badge variant="outline" className="text-xs">
                {isLoading || isCurationRunning ? '⏳ Running...' : duration}
              </Badge>
            </div>

            {/* Execute Button */}
            <Button
              onClick={() => executeCommand(command)}
              disabled={isLoading || isCurationRunning}
              variant={danger ? "destructive" : "default"}
              className="w-full"
              data-testid={`button-${command}`}
            >
              {isCurationRunning ? 'Running...' : 'Execute'}
            </Button>
            
            {/* Curation Live Progress */}
            {command === 'run_curation' && isCurationRunning && progressEvents.length > 0 && (
              <div className="bg-background border border-primary/30 rounded-md overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/20">
                  <Radio className="h-3 w-3 text-primary animate-pulse" />
                  <span className="text-xs font-medium text-primary">Live Progress</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    {progressEvents.length} events
                  </Badge>
                </div>
                <ScrollArea className="h-48">
                  <div className="p-2 space-y-1 text-xs font-mono">
                    {progressEvents.map((event) => (
                      <div key={event.id} className="flex items-start gap-2 py-0.5">
                        <span className="w-4 text-center flex-shrink-0">{event.icon}</span>
                        <span className="text-muted-foreground flex-shrink-0">
                          {new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-foreground">{event.message}</span>
                          {event.detail && (
                            <span className="text-muted-foreground ml-1">({event.detail})</span>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={progressEndRef} />
                  </div>
                </ScrollArea>
              </div>
            )}
            
            {/* Curation Status Message (no live progress) */}
            {command === 'run_curation' && isCurationRunning && progressEvents.length === 0 && (
              <div className="bg-muted/50 border border-border rounded-md p-3 text-sm space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>Curation running in background</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  You'll receive an email in 5-10 minutes with:
                  <ul className="list-disc list-inside mt-1 ml-2">
                    <li>Videos analyzed</li>
                    <li>Videos added to library</li>
                    <li>API quota used</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Result */}
            {result && <ResultDisplay result={result} />}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AdminLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">⚡ Command Center</h1>
            <p className="text-muted-foreground">Execute system commands and operations</p>
          </div>
          <Button 
            variant="outline" 
            onClick={loadCommandLog}
            data-testid="button-refresh-logs"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Logs
          </Button>
        </div>

        {/* ISSUE 1: AUTO CURATION MASTER TOGGLE */}
        <Card className="border-2">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-4 h-4 rounded-full ${autoCurationEnabled ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                <div>
                  <h3 className="text-lg font-bold">AUTO CURATION</h3>
                  <p className="text-sm text-muted-foreground">
                    {autoCurationEnabled ? 'Running 4x daily (3:15am, 9am, 3pm, 9pm EST)' : 'Paused - no automatic curation'}
                  </p>
                </div>
              </div>
              
              <Button
                onClick={toggleAutoCuration}
                variant={autoCurationEnabled ? "destructive" : "default"}
                className="px-6"
                data-testid="button-toggle-auto-curation"
              >
                {autoCurationEnabled ? 'TURN OFF' : 'TURN ON'}
              </Button>
            </div>
            
            {lastRunStats && (
              <div className="mt-4 pt-4 border-t grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-400">{lastRunStats.discovered}</div>
                  <div className="text-xs text-muted-foreground">Discovered</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-400">{lastRunStats.analyzed}</div>
                  <div className="text-xs text-muted-foreground">Analyzed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">{lastRunStats.accepted}</div>
                  <div className="text-xs text-muted-foreground">Added</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-zinc-400">{lastRunStats.rejected}</div>
                  <div className="text-xs text-muted-foreground">Rejected</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Curation Commands */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">🎯 Curation Controls</h2>
            <Badge variant="outline">System Operations</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CommandButton
              icon={Play}
              title="▶️ Run Curation"
              duration="5-10 min"
              command="run_curation"
            />
            <CommandButton
              icon={Camera}
              title="📸 Take Snapshot"
              duration="~30 sec"
              command="take_snapshot"
            />
            <CommandButton
              icon={Trash2}
              title="🗑️ Flush Cache"
              duration="Instant"
              command="flush_cache"
            />
        </div>

        {/* Curation Settings */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setSettingsExpanded(!settingsExpanded)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                <CardTitle className="text-base">⚙️ Curation Settings</CardTitle>
              </div>
              {settingsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
            <CardDescription className="text-xs">Customize curation parameters</CardDescription>
          </CardHeader>

          {settingsExpanded && (
            <CardContent className="space-y-4">
              {/* Quality Threshold */}
              <div className="space-y-2">
                <Label htmlFor="quality-threshold" className="text-sm flex justify-between">
                  <span>Quality Threshold</span>
                  <span className="font-bold">{settings.qualityThreshold}</span>
                </Label>
                <Slider
                  id="quality-threshold"
                  min={5}
                  max={9}
                  step={0.5}
                  value={[settings.qualityThreshold]}
                  onValueChange={(value) => setSettings({ ...settings, qualityThreshold: value[0] })}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">Minimum quality score for videos (5-9)</p>
              </div>

              {/* Videos Per Run */}
              <div className="space-y-2">
                <Label htmlFor="videos-per-run" className="text-sm">Videos to Analyze Per Run</Label>
                <select
                  id="videos-per-run"
                  value={settings.videosPerRun}
                  onChange={(e) => setSettings({ ...settings, videosPerRun: parseInt(e.target.value) })}
                  className="w-full p-2 border rounded bg-background"
                >
                  <option value="10">10 (Fast - 3 min)</option>
                  <option value="20">20 (Normal - 5 min)</option>
                  <option value="30">30 (Thorough - 8 min)</option>
                  <option value="50">50 (Maximum - 12 min)</option>
                </select>
                <p className="text-xs text-muted-foreground">More videos = longer runtime, more results</p>
              </div>

              {/* Focus Instructors */}
              <div className="space-y-2">
                <Label htmlFor="focus-instructors" className="text-sm">Priority Instructors</Label>
                <Input
                  id="focus-instructors"
                  type="text"
                  placeholder="e.g., John Danaher, Gordon Ryan"
                  value={settings.focusInstructors}
                  onChange={(e) => setSettings({ ...settings, focusInstructors: e.target.value })}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">Comma-separated list of instructors to prioritize</p>
              </div>

              {/* Save Button */}
              <Button 
                onClick={saveSettings}
                className="w-full"
                variant="default"
              >
                💾 Save Settings
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Settings apply to next curation run
              </p>
            </CardContent>
          )}
        </Card>

        {/* Quick Curation Presets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🎯 Quick Curation Presets
            </CardTitle>
            <CardDescription>Run targeted curation by instructor, technique, position, or custom search</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              {/* INSTRUCTOR - ISSUE 2: Dynamic from database with loading/error states */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-blue-400">👤</span>
                  <span className="font-semibold">
                    Instructor {instructorListLoading ? '(Loading...)' : `(${instructorList.length})`}
                  </span>
                </div>
                {instructorListError ? (
                  <div className="text-destructive text-sm">
                    Failed to load instructors
                    <Button variant="link" size="sm" onClick={loadInstructors} className="ml-2" data-testid="button-retry-instructors">
                      Retry
                    </Button>
                  </div>
                ) : (
                  <select 
                    value={selectedInstructor}
                    onChange={(e) => setSelectedInstructor(e.target.value)}
                    className="w-full bg-background border rounded px-3 py-2"
                    data-testid="select-instructor"
                    disabled={instructorListLoading}
                  >
                    <option value="">{instructorListLoading ? 'Loading...' : 'Select instructor...'}</option>
                    {instructorList.map(instructor => (
                      <option key={instructor} value={instructor}>{instructor}</option>
                    ))}
                  </select>
                )}
                <Input 
                  value={customInstructor}
                  onChange={(e) => setCustomInstructor(e.target.value)}
                  placeholder="Or type custom..."
                  data-testid="input-custom-instructor"
                />
                <Button 
                  onClick={() => runQuickCuration('instructor', customInstructor || selectedInstructor)}
                  disabled={(!selectedInstructor && !customInstructor) || quickCurationRunning === 'instructor'}
                  className="w-full"
                  data-testid="button-curate-instructor"
                >
                  {quickCurationRunning === 'instructor' ? 'Running...' : 'Run Now'}
                </Button>
              </div>
              
              {/* TECHNIQUE */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">🎯</span>
                  <span className="font-semibold">Technique</span>
                </div>
                <Input 
                  value={techniqueSearch}
                  onChange={(e) => setTechniqueSearch(e.target.value)}
                  placeholder='e.g. "guillotine"'
                  data-testid="input-technique-search"
                />
                <Button 
                  onClick={() => runQuickCuration('technique', techniqueSearch, () => setTechniqueSearch(''))}
                  disabled={!techniqueSearch || quickCurationRunning === 'technique'}
                  className="w-full"
                  data-testid="button-curate-technique"
                >
                  {quickCurationRunning === 'technique' ? 'Running...' : 'Run Now'}
                </Button>
              </div>
              
              {/* POSITION - ISSUE 3: Expanded comprehensive list with loading/error states */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400">📐</span>
                  <span className="font-semibold">
                    Position {positionListLoading ? '(Loading...)' : `(${positionList.length})`}
                  </span>
                </div>
                {positionListError ? (
                  <div className="text-destructive text-sm">
                    Failed to load positions
                    <Button variant="link" size="sm" onClick={loadPositions} className="ml-2" data-testid="button-retry-positions">
                      Retry
                    </Button>
                  </div>
                ) : (
                  <select 
                    value={selectedPosition}
                    onChange={(e) => setSelectedPosition(e.target.value)}
                    className="w-full bg-background border rounded px-3 py-2"
                    data-testid="select-position"
                    disabled={positionListLoading}
                  >
                    <option value="">{positionListLoading ? 'Loading...' : 'Select position...'}</option>
                    {positionList.map(position => (
                      <option key={position} value={position}>{position}</option>
                    ))}
                  </select>
                )}
                <Button 
                  onClick={() => runQuickCuration('position', selectedPosition, () => setSelectedPosition(''))}
                  disabled={!selectedPosition || quickCurationRunning === 'position'}
                  className="w-full"
                  data-testid="button-curate-position"
                >
                  {quickCurationRunning === 'position' ? 'Running...' : 'Run Now'}
                </Button>
              </div>
              
              {/* GI/NOGI */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-red-400">🥋</span>
                  <span className="font-semibold">Gi/NoGi Balance</span>
                </div>
                <select 
                  value={selectedGiNogi}
                  onChange={(e) => setSelectedGiNogi(e.target.value)}
                  className="w-full bg-background border rounded px-3 py-2"
                  data-testid="select-gi-nogi"
                >
                  <option value="">Select type...</option>
                  <option value="gi">Gi Only</option>
                  <option value="nogi">No-Gi Only</option>
                </select>
                <Button 
                  onClick={() => runQuickCuration('gi-nogi', selectedGiNogi, () => setSelectedGiNogi(''))}
                  disabled={!selectedGiNogi || quickCurationRunning === 'gi-nogi'}
                  className="w-full"
                  data-testid="button-curate-gi-nogi"
                >
                  {quickCurationRunning === 'gi-nogi' ? 'Running...' : 'Run Now'}
                </Button>
              </div>
              
              {/* CUSTOM SEARCH */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">🔍</span>
                  <span className="font-semibold">Custom Search</span>
                </div>
                <Input 
                  value={customSearch}
                  onChange={(e) => setCustomSearch(e.target.value)}
                  placeholder="Any YouTube query..."
                  data-testid="input-custom-search"
                />
                <Button 
                  onClick={() => runQuickCuration('custom', customSearch, () => setCustomSearch(''))}
                  disabled={!customSearch || quickCurationRunning === 'custom'}
                  className="w-full"
                  data-testid="button-curate-custom"
                >
                  {quickCurationRunning === 'custom' ? 'Running...' : 'Run Now'}
                </Button>
              </div>
              
              {/* META TECHNIQUES */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-purple-400">🧠</span>
                  <span className="font-semibold">Meta Techniques</span>
                </div>
                <p className="text-sm text-muted-foreground">Curate high-priority trending techniques</p>
                <Button 
                  onClick={() => runQuickCuration('meta')}
                  disabled={quickCurationRunning === 'meta'}
                  className="w-full"
                  data-testid="button-curate-meta"
                >
                  {quickCurationRunning === 'meta' ? 'Running...' : 'Run Now'}
                </Button>
              </div>
              
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Commands */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">⚙️ System Maintenance</h2>
          <Badge variant="outline">API Testing</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CommandButton
            icon={TestTube}
            title="🔌 Test APIs"
            duration="~10 sec"
            command="test_apis"
          />
        </div>
      </div>
      
      {/* Professor OS QA Testing */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">🧪 Professor OS QA</h2>
          <Badge variant="outline">Quality Assurance</Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Run Full QA Tests */}
          <Card className="hover-elevate">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TestTube className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Run Full QA Suite</h3>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {qaTestRunning ? '⏳ Running...' : '~5 min'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tests video relevance, personality, and coaching quality
                </p>
                <Button
                  onClick={() => runQATests(['all'])}
                  disabled={qaTestRunning}
                  className="w-full"
                  data-testid="button-run-qa-tests"
                >
                  {qaTestRunning ? 'Running Tests...' : 'Run All Tests'}
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* Data Quality Check */}
          <Card className="hover-elevate">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Video Data Quality</h3>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {dataQualityLoading ? '⏳ Checking...' : 'Instant'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Check for missing thumbnails, instructors, YouTube IDs
                </p>
                <Button
                  onClick={checkDataQuality}
                  disabled={dataQualityLoading}
                  variant="outline"
                  className="w-full"
                  data-testid="button-check-data-quality"
                >
                  {dataQualityLoading ? 'Checking...' : 'Check Data Quality'}
                </Button>
                
                {dataQuality && (
                  <div className="mt-3 p-3 rounded border bg-muted/30 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Total Videos:</span>
                      <span className="font-medium">{dataQuality.totalVideos.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Missing Thumbnails:</span>
                      <span className={dataQuality.issues.missingThumbnails > 0 ? 'text-destructive font-medium' : 'text-green-500'}>
                        {dataQuality.issues.missingThumbnails}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Generic Instructors:</span>
                      <span className={dataQuality.issues.genericInstructors > 0 ? 'text-destructive font-medium' : 'text-green-500'}>
                        {dataQuality.issues.genericInstructors}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Missing YouTube IDs:</span>
                      <span className={dataQuality.issues.missingYoutubeIds > 0 ? 'text-destructive font-medium' : 'text-green-500'}>
                        {dataQuality.issues.missingYoutubeIds}
                      </span>
                    </div>
                    <div className="pt-2 border-t text-xs">
                      <Badge variant={dataQuality.healthPercentage >= 95 ? 'default' : 'destructive'}>
                        {dataQuality.healthPercentage}% Healthy
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* QA Test Results */}
        {qaTestReport && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {qaTestReport.passPercentage >= 80 ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  QA Test Results
                </CardTitle>
                <Badge variant={qaTestReport.passPercentage >= 80 ? 'default' : 'destructive'}>
                  {qaTestReport.passed}/{qaTestReport.totalTests} Passed ({qaTestReport.passPercentage}%)
                </Badge>
              </div>
              <CardDescription>
                Run at {new Date(qaTestReport.timestamp).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80">
                <div className="space-y-2">
                  {qaTestReport.results.map((result) => (
                    <div
                      key={result.id}
                      className={`p-3 rounded border ${result.passed ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{result.passed ? '✅' : '❌'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{result.category}</Badge>
                            <span className="font-medium text-sm">{result.id}: {result.name}</span>
                          </div>
                          {!result.passed && (
                            <div className="mt-2 text-xs space-y-1">
                              <div className="text-muted-foreground">
                                <span className="font-medium">Expected:</span> {result.expected}
                              </div>
                              <div className="text-destructive">
                                <span className="font-medium">Got:</span> {result.actual}
                              </div>
                            </div>
                          )}
                          {result.details && (
                            <div className="mt-1 text-xs text-amber-500">{result.details}</div>
                          )}
                        </div>
                        {result.duration && (
                          <span className="text-[10px] text-muted-foreground">{result.duration}ms</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              {qaTestReport.warnings.length > 0 && (
                <div className="mt-4 p-3 rounded border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-2 text-amber-500 font-medium text-sm mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    Warnings
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {qaTestReport.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Command Log */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">📋 Recent Commands</h2>
        <Card>
          <CardHeader>
            <CardTitle>Execution Log</CardTitle>
            <CardDescription>Last {logs.length} commands executed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No commands executed yet
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded border bg-card hover-elevate"
                    data-testid={`log-entry-${log.id}`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <Badge variant={log.success ? "default" : "destructive"}>
                        {log.success ? '✅' : '❌'}
                      </Badge>
                      <div className="flex-1">
                        <div className="font-medium">{log.command}</div>
                        <div className="text-xs text-muted-foreground">{log.message}</div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                      <div>{new Date(log.timestamp).toLocaleString()}</div>
                      <div className="text-[10px]">{log.executionTimeMs}ms</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </AdminLayout>
  );
}
