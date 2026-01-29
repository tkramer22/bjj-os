import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AdminLayout } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Search, PlayCircle, Users, Dumbbell, TrendingUp, Star, AlertCircle, Loader2, CheckCircle, Clock, Circle, Brain, Pause, Play, Square, Eye } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface Video {
  id: number;
  youtube_id: string;
  title: string;
  instructor_name: string;
  technique_name: string;
  thumbnail_url: string;
  quality_score: number;
  duration: number;
  created_at: string;
  knowledge_status?: 'watched' | 'pending' | 'failed';
  knowledge_processed_at?: string;
  techniques_count?: number;
}

interface Stats {
  total_videos: number;
  unique_instructors: number;
  unique_techniques: number;
  avg_quality: number;
}

interface KnowledgeStatus {
  totalVideos: number;
  processed: number;
  pending: number;
  withTranscript: number;
  withoutTranscript: number;
  totalTechniques: number;
  percentComplete: number;
}

interface BulkStatus {
  isActive: boolean;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentBatch: number;
  totalBatches: number;
  isPaused: boolean;
  estimatedTimeRemaining: string | null;
}

interface VideoKnowledge {
  videoId: number;
  watchStatus: any;
  techniques: Array<{
    id: number;
    techniqueName: string;
    positionContext: string;
    keyConcepts: string[];
    instructorTips: string[];
    commonMistakes: string[];
    timestampStart: string;
    timestampEnd: string;
    fullSummary: string;
  }>;
}

async function fetchWithAuth(url: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  
  if (response.status === 401 || response.status === 403) {
    throw new Error('AUTH_REQUIRED');
  }
  
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${response.status}`);
  }
  
  return response.json();
}

async function postWithAuth(url: string, body?: any) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${response.status}`);
  }
  
  return response.json();
}

export default function AdminVideos() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedInstructor, setSelectedInstructor] = useState<string>("all");
  const [selectedTechnique, setSelectedTechnique] = useState<string>("all");
  const [knowledgeFilter, setKnowledgeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "quality">("newest");
  const [authError, setAuthError] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const [selectedVideoKnowledge, setSelectedVideoKnowledge] = useState<VideoKnowledge | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: statsData, isLoading: statsLoading, error: statsError } = useQuery<Stats>({
    queryKey: ['/api/admin/videos/stats'],
    queryFn: () => fetchWithAuth('/api/admin/videos/stats'),
    staleTime: 30000,
    retry: false,
  });

  const { data: knowledgeStatusData, isLoading: knowledgeLoading } = useQuery<KnowledgeStatus>({
    queryKey: ['/api/admin/videos/knowledge-status'],
    queryFn: () => fetchWithAuth('/api/admin/videos/knowledge-status'),
    staleTime: 10000,
    refetchInterval: 30000,
    retry: false,
    enabled: !authError,
  });

  const { data: bulkStatusData } = useQuery<BulkStatus>({
    queryKey: ['/api/admin/videos/bulk-status'],
    queryFn: () => fetchWithAuth('/api/admin/videos/bulk-status'),
    staleTime: 5000,
    refetchInterval: (query) => query.state.data?.isActive ? 3000 : 30000,
    retry: false,
    enabled: !authError,
  });

  const { data: allVideosData } = useQuery<{ videos: Video[]; total: number }>({
    queryKey: ['/api/admin/videos/all-for-filters'],
    queryFn: () => fetchWithAuth('/api/admin/videos/list?limit=2000'),
    staleTime: 60000,
    retry: false,
    enabled: !authError,
  });

  const { data: videosData, isLoading, error: videosError } = useQuery<{ videos: Video[]; total: number }>({
    queryKey: ['/api/admin/videos/list', debouncedSearch, selectedInstructor, selectedTechnique, knowledgeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('q', debouncedSearch);
      if (selectedInstructor && selectedInstructor !== 'all') params.append('instructor', selectedInstructor);
      if (selectedTechnique && selectedTechnique !== 'all') params.append('technique', selectedTechnique);
      if (knowledgeFilter && knowledgeFilter !== 'all') params.append('knowledgeFilter', knowledgeFilter);
      params.append('limit', '50');
      return fetchWithAuth(`/api/admin/videos/list?${params.toString()}`);
    },
    staleTime: 10000,
    retry: false,
    enabled: !authError,
  });

  const processAllMutation = useMutation({
    mutationFn: () => postWithAuth('/api/admin/videos/process-all', { batchSize: 10, delayBetweenBatches: 30000 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/videos/bulk-status'] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => postWithAuth('/api/admin/videos/bulk-pause'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/videos/bulk-status'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => postWithAuth('/api/admin/videos/bulk-stop'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/videos/bulk-status'] });
    },
  });

  const processVideoMutation = useMutation({
    mutationFn: (videoId: number) => postWithAuth(`/api/admin/videos/${videoId}/process`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/videos/list'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/videos/knowledge-status'] });
    },
  });

  // Analysis gaps query - find videos missing Gemini analysis
  const { data: analysisGapsData, isLoading: gapsLoading, refetch: refetchGaps } = useQuery<{
    totalVideos: number;
    withCompleteAnalysis: number;
    totalGaps: number;
    coverageRate: string;
    gapBreakdown: { noAnalysis: number; incomplete: number };
    missingVideos: Array<{
      id: number;
      youtubeId: string;
      title: string;
      instructor: string;
      channel: string;
      gapType: 'NO_ANALYSIS' | 'INCOMPLETE';
    }>;
  }>({
    queryKey: ['/api/admin/videos/analysis-gaps'],
    queryFn: () => fetchWithAuth('/api/admin/videos/analysis-gaps'),
    staleTime: 30000,
    retry: false,
    enabled: !authError,
  });

  // Bulk reanalyze mutation
  const [bulkReanalyzeStatus, setBulkReanalyzeStatus] = useState<{
    isRunning: boolean;
    jobId: string | null;
    processed: number;
    total: number;
    successful: number;
    failed: number;
  } | null>(null);

  const bulkReanalyzeMutation = useMutation({
    mutationFn: (limit: number) => postWithAuth('/api/admin/videos/bulk-reanalyze', { limit }),
    onSuccess: (data: any) => {
      if (data.jobId) {
        setBulkReanalyzeStatus({
          isRunning: true,
          jobId: data.jobId,
          processed: 0,
          total: data.totalToProcess || 0,
          successful: 0,
          failed: 0,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/admin/videos/analysis-gaps'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/videos/knowledge-status'] });
    },
  });

  // Poll for bulk reanalyze status
  const { data: bulkReanalyzeJobStatus } = useQuery<{
    status: 'running' | 'completed' | 'failed' | 'not_found';
    processed: number;
    total: number;
    successful: number;
    failed: number;
  }>({
    queryKey: ['/api/admin/videos/bulk-reanalyze/status', bulkReanalyzeStatus?.jobId],
    queryFn: () => fetchWithAuth(`/api/admin/videos/bulk-reanalyze/status/${bulkReanalyzeStatus?.jobId}`),
    enabled: !!bulkReanalyzeStatus?.jobId && bulkReanalyzeStatus?.isRunning,
    refetchInterval: 5000,
  });

  // Update status when job completes
  useEffect(() => {
    if (bulkReanalyzeJobStatus) {
      if (bulkReanalyzeJobStatus.status === 'completed' || bulkReanalyzeJobStatus.status === 'failed') {
        setBulkReanalyzeStatus(prev => prev ? { ...prev, isRunning: false, ...bulkReanalyzeJobStatus } : null);
        refetchGaps();
      } else if (bulkReanalyzeJobStatus.status === 'running') {
        setBulkReanalyzeStatus(prev => prev ? { ...prev, ...bulkReanalyzeJobStatus } : null);
      }
    }
  }, [bulkReanalyzeJobStatus, refetchGaps]);

  // Single video reanalyze mutation
  const reanalyzeVideoMutation = useMutation({
    mutationFn: (videoId: number) => postWithAuth(`/api/admin/videos/${videoId}/reanalyze`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/videos/list'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/videos/knowledge-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/videos/analysis-gaps'] });
    },
  });

  const { instructorToTechniques, techniqueToInstructors, allInstructors, allTechniques } = useMemo(() => {
    const allVideos = allVideosData?.videos || [];
    
    const instructorToTechniques = new Map<string, Set<string>>();
    const techniqueToInstructors = new Map<string, Set<string>>();
    const instructorSet = new Set<string>();
    const techniqueSet = new Set<string>();
    
    for (const video of allVideos) {
      const instructor = video.instructor_name;
      const technique = video.technique_name;
      
      if (instructor) {
        instructorSet.add(instructor);
        if (!instructorToTechniques.has(instructor)) {
          instructorToTechniques.set(instructor, new Set());
        }
        if (technique) {
          instructorToTechniques.get(instructor)!.add(technique);
        }
      }
      
      if (technique) {
        techniqueSet.add(technique);
        if (!techniqueToInstructors.has(technique)) {
          techniqueToInstructors.set(technique, new Set());
        }
        if (instructor) {
          techniqueToInstructors.get(technique)!.add(instructor);
        }
      }
    }
    
    return {
      instructorToTechniques,
      techniqueToInstructors,
      allInstructors: Array.from(instructorSet).sort((a, b) => a.localeCompare(b)),
      allTechniques: Array.from(techniqueSet).sort((a, b) => a.localeCompare(b)),
    };
  }, [allVideosData]);

  const filteredInstructors = useMemo(() => {
    if (selectedTechnique === 'all') {
      return allInstructors;
    }
    const instructorsForTechnique = techniqueToInstructors.get(selectedTechnique);
    if (!instructorsForTechnique) return allInstructors;
    return allInstructors.filter(i => instructorsForTechnique.has(i));
  }, [selectedTechnique, allInstructors, techniqueToInstructors]);

  const filteredTechniques = useMemo(() => {
    if (selectedInstructor === 'all') {
      return allTechniques;
    }
    const techniquesForInstructor = instructorToTechniques.get(selectedInstructor);
    if (!techniquesForInstructor) return allTechniques;
    return allTechniques.filter(t => techniquesForInstructor.has(t));
  }, [selectedInstructor, allTechniques, instructorToTechniques]);

  const handleInstructorChange = (newInstructor: string) => {
    setSelectedInstructor(newInstructor);
    
    if (newInstructor !== 'all' && selectedTechnique !== 'all') {
      const techniquesForInstructor = instructorToTechniques.get(newInstructor);
      if (!techniquesForInstructor || !techniquesForInstructor.has(selectedTechnique)) {
        setSelectedTechnique('all');
      }
    }
  };

  const handleTechniqueChange = (newTechnique: string) => {
    setSelectedTechnique(newTechnique);
    
    if (newTechnique !== 'all' && selectedInstructor !== 'all') {
      const instructorsForTechnique = techniqueToInstructors.get(newTechnique);
      if (!instructorsForTechnique || !instructorsForTechnique.has(selectedInstructor)) {
        setSelectedInstructor('all');
      }
    }
  };

  const handleViewKnowledge = async (video: Video) => {
    try {
      const knowledge = await fetchWithAuth(`/api/admin/videos/${video.id}/knowledge`);
      setSelectedVideoKnowledge(knowledge);
      setShowKnowledgeModal(true);
    } catch (error) {
      console.error('Failed to fetch knowledge:', error);
    }
  };

  useEffect(() => {
    const error = statsError || videosError;
    if (error && (error as Error).message === 'AUTH_REQUIRED') {
      setAuthError(true);
      navigate('/admin/login');
    }
  }, [statsError, videosError, navigate]);

  if (authError) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground mb-4">Please log in to access the video library.</p>
          <Button onClick={() => navigate('/admin/login')} data-testid="button-login">Go to Login</Button>
        </div>
      </AdminLayout>
    );
  }

  const stats = statsData || { total_videos: 0, unique_instructors: 0, unique_techniques: 0, avg_quality: 0 };
  const rawVideos = videosData?.videos || [];
  
  // Apply sorting to videos
  const videos = useMemo(() => {
    const sorted = [...rawVideos];
    if (sortBy === "newest") {
      return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "oldest") {
      return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === "quality") {
      return sorted.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));
    }
    return sorted;
  }, [rawVideos, sortBy]);
  
  const knowledgeStatus = knowledgeStatusData || { totalVideos: 0, processed: 0, pending: 0, withTranscript: 0, totalTechniques: 0, percentComplete: 0 };
  const bulkStatus = bulkStatusData || { isActive: false, total: 0, processed: 0, succeeded: 0, failed: 0, currentBatch: 0, totalBatches: 0, isPaused: false, estimatedTimeRemaining: null };

  const getThumbnailUrl = (video: Video): string => {
    if (video.thumbnail_url) return video.thumbnail_url;
    if (video.youtube_id) return `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`;
    return '';
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getInstructorVideoCount = (instructor: string): number => {
    if (selectedTechnique === 'all') {
      const allVideos = allVideosData?.videos || [];
      return allVideos.filter(v => v.instructor_name === instructor).length;
    }
    const allVideos = allVideosData?.videos || [];
    return allVideos.filter(v => v.instructor_name === instructor && v.technique_name === selectedTechnique).length;
  };

  const getTechniqueVideoCount = (technique: string): number => {
    if (selectedInstructor === 'all') {
      const allVideos = allVideosData?.videos || [];
      return allVideos.filter(v => v.technique_name === technique).length;
    }
    const allVideos = allVideosData?.videos || [];
    return allVideos.filter(v => v.technique_name === technique && v.instructor_name === selectedInstructor).length;
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'watched':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'watched':
        return 'Watched';
      case 'failed':
        return 'Failed';
      default:
        return 'Pending';
    }
  };

  return (
    <AdminLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Video Library</h1>
          <p className="text-muted-foreground">Manage curated BJJ technique videos</p>
        </div>

        <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Brain className="h-8 w-8 text-purple-500" />
                <div>
                  <h3 className="font-semibold text-lg">Video Knowledge System</h3>
                  <p className="text-sm text-muted-foreground">
                    {knowledgeStatus.totalVideos.toLocaleString()} total | {' '}
                    <span className="text-green-500">{knowledgeStatus.withTranscript.toLocaleString()} watched</span> | {' '}
                    <span className="text-yellow-500">{knowledgeStatus.pending.toLocaleString()} pending</span> | {' '}
                    {knowledgeStatus.percentComplete.toFixed(1)}% complete
                  </p>
                  {knowledgeStatus.totalTechniques > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {knowledgeStatus.totalTechniques.toLocaleString()} techniques extracted
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {bulkStatus.isActive ? (
                  <>
                    <div className="text-sm text-muted-foreground mr-2">
                      Batch {bulkStatus.currentBatch}/{bulkStatus.totalBatches}
                      {bulkStatus.estimatedTimeRemaining && ` • ~${bulkStatus.estimatedTimeRemaining}`}
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => pauseMutation.mutate()}
                      disabled={pauseMutation.isPending}
                      data-testid="button-pause"
                    >
                      {bulkStatus.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => stopMutation.mutate()}
                      disabled={stopMutation.isPending}
                      data-testid="button-stop"
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button 
                    onClick={() => processAllMutation.mutate()}
                    disabled={processAllMutation.isPending || knowledgeStatus.pending === 0}
                    data-testid="button-process-all"
                  >
                    {processAllMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    Process All Pending ({knowledgeStatus.pending.toLocaleString()})
                  </Button>
                )}
              </div>
            </div>
            
            {bulkStatus.isActive && (
              <div className="mt-4 space-y-2">
                <Progress 
                  value={(bulkStatus.processed / bulkStatus.total) * 100} 
                  className="h-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{bulkStatus.processed.toLocaleString()} / {bulkStatus.total.toLocaleString()} processed</span>
                  <span className="text-green-500">{bulkStatus.succeeded} succeeded</span>
                  {bulkStatus.failed > 0 && <span className="text-red-500">{bulkStatus.failed} failed</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analysis Gaps Section - Rerun Failed Gemini Analysis */}
        {analysisGapsData && (
          <Card className={analysisGapsData.totalGaps > 0 
            ? "bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/20" 
            : "bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20"
          }>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {analysisGapsData.totalGaps > 0 ? (
                    <AlertCircle className="h-8 w-8 text-orange-500" />
                  ) : (
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  )}
                  <div>
                    <h3 className="font-semibold text-lg">
                      {analysisGapsData.totalGaps > 0 ? 'Analysis Gaps Detected' : 'Analysis Complete'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {analysisGapsData.totalGaps > 0 ? (
                        <><span className="text-orange-500 font-medium">{analysisGapsData.totalGaps.toLocaleString()}</span> videos missing complete Gemini analysis</>
                      ) : (
                        <><span className="text-green-500 font-medium">{analysisGapsData.totalVideos.toLocaleString()}</span> videos fully analyzed</>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className={analysisGapsData.gapBreakdown.noAnalysis > 0 ? "text-red-400" : "text-muted-foreground"}>{analysisGapsData.gapBreakdown.noAnalysis}</span> no analysis | {' '}
                      <span className={analysisGapsData.gapBreakdown.incomplete > 0 ? "text-yellow-400" : "text-muted-foreground"}>{analysisGapsData.gapBreakdown.incomplete}</span> incomplete | {' '}
                      Coverage: <span className="text-green-400">{analysisGapsData.coverageRate}%</span>
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {bulkReanalyzeStatus?.isRunning ? (
                    <div className="flex items-center gap-3">
                      <div className="text-sm text-muted-foreground">
                        {bulkReanalyzeStatus.processed}/{bulkReanalyzeStatus.total} processed
                      </div>
                      <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                    </div>
                  ) : analysisGapsData.totalGaps > 0 ? (
                    <>
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => bulkReanalyzeMutation.mutate(10)}
                        disabled={bulkReanalyzeMutation.isPending}
                        data-testid="button-reanalyze-10"
                      >
                        {bulkReanalyzeMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>Reanalyze 10</>
                        )}
                      </Button>
                      <Button 
                        onClick={() => bulkReanalyzeMutation.mutate(50)}
                        disabled={bulkReanalyzeMutation.isPending}
                        className="bg-orange-600 hover:bg-orange-700"
                        data-testid="button-reanalyze-50"
                      >
                        {bulkReanalyzeMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Brain className="h-4 w-4 mr-2" />
                        )}
                        Reanalyze 50 Videos
                      </Button>
                    </>
                  ) : (
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => refetchGaps()}
                      data-testid="button-refresh-gaps"
                    >
                      Refresh Status
                    </Button>
                  )}
                </div>
              </div>
              
              {bulkReanalyzeStatus && (
                <div className="mt-4 space-y-2">
                  <Progress 
                    value={bulkReanalyzeStatus.total > 0 ? (bulkReanalyzeStatus.processed / bulkReanalyzeStatus.total) * 100 : 0} 
                    className="h-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{bulkReanalyzeStatus.processed} / {bulkReanalyzeStatus.total} processed</span>
                    <span className="text-green-500">{bulkReanalyzeStatus.successful} succeeded</span>
                    {bulkReanalyzeStatus.failed > 0 && <span className="text-red-500">{bulkReanalyzeStatus.failed} failed</span>}
                    {!bulkReanalyzeStatus.isRunning && <span className="text-muted-foreground">Complete</span>}
                  </div>
                </div>
              )}
              
              {/* Show sample missing videos */}
              {analysisGapsData.missingVideos.length > 0 && !bulkReanalyzeStatus?.isRunning && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">Sample videos missing analysis:</p>
                  <div className="flex flex-wrap gap-2">
                    {analysisGapsData.missingVideos.slice(0, 5).map((video) => (
                      <Badge 
                        key={video.id} 
                        variant="outline" 
                        className={video.gapType === 'NO_ANALYSIS' ? 'border-red-500/50 text-red-400' : 'border-yellow-500/50 text-yellow-400'}
                      >
                        {video.title?.substring(0, 30)}...
                      </Badge>
                    ))}
                    {analysisGapsData.missingVideos.length > 5 && (
                      <Badge variant="outline" className="text-muted-foreground">
                        +{analysisGapsData.missingVideos.length - 5} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Videos</CardTitle>
              <PlayCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-videos">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (stats.total_videos?.toLocaleString() || '0')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Instructors</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-instructors">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (stats.unique_instructors?.toLocaleString() || '0')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Techniques</CardTitle>
              <Dumbbell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-techniques">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (stats.unique_techniques?.toLocaleString() || '0')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Quality</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-avg-quality">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (stats.avg_quality ? Number(stats.avg_quality).toFixed(1) : '0.0')}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title or instructor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
              
              <Select value={selectedInstructor} onValueChange={handleInstructorChange}>
                <SelectTrigger className="w-[200px]" data-testid="select-instructor">
                  <SelectValue placeholder="All Instructors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Instructors ({filteredInstructors.length})</SelectItem>
                  {filteredInstructors.map((instructor) => (
                    <SelectItem key={instructor} value={instructor}>
                      {instructor} ({getInstructorVideoCount(instructor)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedTechnique} onValueChange={handleTechniqueChange}>
                <SelectTrigger className="w-[200px]" data-testid="select-technique">
                  <SelectValue placeholder="All Techniques" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Techniques ({filteredTechniques.length})</SelectItem>
                  {filteredTechniques.map((technique) => (
                    <SelectItem key={technique} value={technique}>
                      {technique} ({getTechniqueVideoCount(technique)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={knowledgeFilter} onValueChange={setKnowledgeFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-knowledge-filter">
                  <SelectValue placeholder="Knowledge Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="watched">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      Watched
                    </div>
                  </SelectItem>
                  <SelectItem value="pending">
                    <div className="flex items-center gap-2">
                      <Circle className="h-3 w-3 text-muted-foreground" />
                      Pending
                    </div>
                  </SelectItem>
                  <SelectItem value="failed">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3 w-3 text-yellow-500" />
                      Failed
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(value: "newest" | "oldest" | "quality") => setSortBy(value)}>
                <SelectTrigger className="w-[140px]" data-testid="select-sort">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="quality">Highest Quality</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading videos...</p>
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No videos found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {videos.map((video) => (
                <Card 
                  key={video.id} 
                  className="overflow-hidden cursor-pointer hover-elevate transition-all" 
                  data-testid={`card-video-${video.id}`}
                  onClick={() => setSelectedVideo(video)}
                >
                  <div className="relative aspect-video bg-muted">
                    <img
                      src={getThumbnailUrl(video)}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`;
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors">
                      <PlayCircle className="h-12 w-12 text-white opacity-0 hover:opacity-100 transition-opacity" />
                    </div>
                    {video.duration && (
                      <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                        {formatDuration(video.duration)}
                      </span>
                    )}
                    <div 
                      className="absolute top-2 left-2 bg-black/70 rounded-full p-1"
                      title={`Knowledge: ${getStatusLabel(video.knowledge_status)}${video.techniques_count ? ` (${video.techniques_count} techniques)` : ''}`}
                    >
                      {getStatusIcon(video.knowledge_status)}
                    </div>
                    {video.knowledge_status === 'watched' && video.techniques_count && video.techniques_count > 0 && (
                      <Badge 
                        className="absolute top-2 right-2 bg-green-500/90 hover:bg-green-600 text-white text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewKnowledge(video);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        {video.techniques_count}
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-3 space-y-2">
                    <h3 className="font-medium text-sm line-clamp-2" title={video.title}>
                      {video.title}
                    </h3>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate max-w-[120px]" title={video.instructor_name}>
                        {video.instructor_name || 'Unknown'}
                      </span>
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-yellow-500" />
                        <span>{video.quality_score ? Number(video.quality_score).toFixed(1) : '-'}</span>
                      </div>
                    </div>
                    {video.technique_name && (
                      <Badge variant="secondary" className="text-xs truncate max-w-full">
                        {video.technique_name}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!selectedVideo} onOpenChange={(open) => !open && setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="pr-8 line-clamp-2">{selectedVideo?.title}</DialogTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <span>{selectedVideo?.instructor_name}</span>
              {selectedVideo?.technique_name && (
                <>
                  <span>•</span>
                  <Badge variant="secondary" className="text-xs">{selectedVideo?.technique_name}</Badge>
                </>
              )}
              {selectedVideo?.quality_score && (
                <>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-yellow-500" />
                    <span>{Number(selectedVideo.quality_score).toFixed(1)}</span>
                  </div>
                </>
              )}
              <span>•</span>
              <div className="flex items-center gap-1">
                {getStatusIcon(selectedVideo?.knowledge_status)}
                <span>{getStatusLabel(selectedVideo?.knowledge_status)}</span>
              </div>
              {selectedVideo?.knowledge_status === 'pending' && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => selectedVideo && processVideoMutation.mutate(selectedVideo.id)}
                  disabled={processVideoMutation.isPending}
                  data-testid="button-process-video"
                >
                  {processVideoMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Brain className="h-3 w-3" />
                  )}
                  <span className="ml-1">Process</span>
                </Button>
              )}
              {selectedVideo?.knowledge_status === 'watched' && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => selectedVideo && handleViewKnowledge(selectedVideo)}
                  data-testid="button-view-knowledge"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Knowledge
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="aspect-video w-full">
            {selectedVideo && (
              <iframe
                src={`https://www.youtube.com/embed/${selectedVideo.youtube_id}?autoplay=1&rel=0`}
                title={selectedVideo.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showKnowledgeModal} onOpenChange={setShowKnowledgeModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-500" />
              Extracted Knowledge
            </DialogTitle>
          </DialogHeader>
          {selectedVideoKnowledge && selectedVideoKnowledge.techniques.length > 0 ? (
            <div className="space-y-6">
              {selectedVideoKnowledge.techniques.map((tech, idx) => (
                <Card key={idx}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{tech.techniqueName}</CardTitle>
                    {tech.positionContext && (
                      <Badge variant="outline">{tech.positionContext}</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {tech.timestampStart && (
                      <div className="text-sm text-muted-foreground">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {tech.timestampStart}{tech.timestampEnd ? ` - ${tech.timestampEnd}` : ''}
                      </div>
                    )}
                    
                    {tech.keyConcepts && tech.keyConcepts.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Key Concepts</h4>
                        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                          {tech.keyConcepts.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                    )}
                    
                    {tech.instructorTips && tech.instructorTips.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2 text-green-600">Instructor Tips</h4>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {tech.instructorTips.map((t, i) => <li key={i} className="text-green-600/80">"{t}"</li>)}
                        </ul>
                      </div>
                    )}
                    
                    {tech.commonMistakes && tech.commonMistakes.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2 text-red-500">Common Mistakes</h4>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {tech.commonMistakes.map((m, i) => <li key={i} className="text-red-500/80">{m}</li>)}
                        </ul>
                      </div>
                    )}
                    
                    {tech.fullSummary && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground italic">{tech.fullSummary}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No knowledge extracted yet</p>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
