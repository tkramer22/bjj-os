import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from './dashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, AlertCircle, Activity, PlayCircle, Search } from 'lucide-react';
import { useState } from 'react';
import { adminApiRequest } from '@/lib/adminApi';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface MetaStats {
  totalTechniquesTracked: number;
  userRequestsLast7Days: number;
  techniquesNeedingCuration: number;
  totalVideosInLibrary: number;
}

interface TrendingTechnique {
  techniqueName: string;
  overallMetaScore: string;
  metaStatus: string;
  userRequestScore: string;
  competitionMetaScore: string;
  videosInLibrary: number;
  coverageAdequate: boolean;
}

interface CurationPriority {
  techniqueName: string;
  curationPriority: number;
  overallMetaScore: string;
  videosInLibrary: number;
  suggestedSearches: string[];
}

interface UserRequest {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  techniqueMentioned: string;
  requestContext: string;
  requestType: string | null;
  beltLevel: string | null;
  giPreference: string | null;
  hadVideoResult: boolean | null;
  videoCountReturned: number | null;
  requestedAt: Date;
}

interface VolumeStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  unmetRequests: number;
}

interface DemandCurationStatus {
  enabled: boolean;
  lastRunAt: string | null;
  lastResult: {
    success: boolean;
    techniquesAnalyzed: number;
    techniquesWithVideos: number;
    totalVideosAdded: number;
    stillUnmet: string[];
  } | null;
}

export default function MetaInsightsPage() {
  const { toast } = useToast();
  const [curating, setCurating] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [togglingDemand, setTogglingDemand] = useState(false);
  const [runningDemand, setRunningDemand] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<MetaStats>({
    queryKey: ['/api/admin/meta/stats'],
    queryFn: () => adminApiRequest('/api/admin/meta/stats'),
  });

  const { data: trendingData, isLoading: trendingLoading } = useQuery<{ techniques: TrendingTechnique[] }>({
    queryKey: ['/api/admin/meta/trending'],
    queryFn: () => adminApiRequest('/api/admin/meta/trending'),
  });

  const { data: prioritiesData, isLoading: prioritiesLoading, refetch: refetchPriorities } = useQuery<{ priorities: CurationPriority[] }>({
    queryKey: ['/api/admin/meta/priorities'],
    queryFn: () => adminApiRequest('/api/admin/meta/priorities'),
  });

  const { data: requestsData, isLoading: requestsLoading } = useQuery<{ requests: UserRequest[] }>({
    queryKey: ['/api/admin/meta/requests'],
    queryFn: () => adminApiRequest('/api/admin/meta/requests'),
  });

  const { data: volumeStats, isLoading: volumeLoading } = useQuery<VolumeStats>({
    queryKey: ['/api/admin/meta/volume-stats'],
    queryFn: () => adminApiRequest('/api/admin/meta/volume-stats'),
  });

  const { data: unmetData, isLoading: unmetLoading } = useQuery<{ requests: UserRequest[] }>({
    queryKey: ['/api/admin/meta/unmet-requests'],
    queryFn: () => adminApiRequest('/api/admin/meta/unmet-requests'),
  });

  const { data: demandStatus, isLoading: demandStatusLoading, refetch: refetchDemandStatus } = useQuery<DemandCurationStatus>({
    queryKey: ['/api/admin/demand-curation/status'],
    queryFn: () => adminApiRequest('/api/admin/demand-curation/status'),
  });

  const handleToggleDemandCuration = async () => {
    setTogglingDemand(true);
    try {
      const result = await adminApiRequest('/api/admin/demand-curation/toggle', 'POST', {
        enabled: !demandStatus?.enabled
      });
      
      if (result.success) {
        toast({
          title: result.enabled ? 'Demand Curation Enabled' : 'Demand Curation Disabled',
          description: result.enabled 
            ? 'Monday 3:15 AM runs will now use demand-driven curation'
            : 'Monday runs will use regular instructor-based curation',
        });
        refetchDemandStatus();
      }
    } catch (error: any) {
      toast({
        title: 'Toggle Failed',
        description: error.message || 'Failed to toggle demand curation',
        variant: 'destructive',
      });
    } finally {
      setTogglingDemand(false);
    }
  };

  const handleRunDemandCuration = async () => {
    setRunningDemand(true);
    try {
      const result = await adminApiRequest('/api/admin/demand-curation/run', 'POST', {});
      
      if (result.success) {
        toast({
          title: 'Demand Curation Started',
          description: 'Check email for results when complete',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Run Failed',
        description: error.message || 'Failed to start demand curation',
        variant: 'destructive',
      });
    } finally {
      setRunningDemand(false);
    }
  };

  const handleCurate = async (technique: string) => {
    setCurating(technique);
    try {
      const result = await adminApiRequest('/api/admin/meta/curate', 'POST', { technique, maxResults: 10 });
      
      if (result.success) {
        const searchInfo = result.searchesPerformed ? ` (${result.searchesPerformed} searches)` : '';
        toast({
          title: 'Curation Complete',
          description: `Added ${result.curatedCount} videos for "${technique.replace(/_/g, ' ')}"${searchInfo}`,
        });
        refetchPriorities();
      }
    } catch (error: any) {
      toast({
        title: 'Curation Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setCurating(null);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await adminApiRequest('/api/admin/meta/analyze', 'POST');
      toast({
        title: 'Analysis Started',
        description: 'Meta analysis running in background',
      });
    } catch (error: any) {
      toast({
        title: 'Analysis Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      hot: { variant: 'destructive' as const, icon: TrendingUp, label: 'HOT' },
      rising: { variant: 'default' as const, icon: TrendingUp, label: 'RISING' },
      cooling: { variant: 'secondary' as const, icon: TrendingDown, label: 'COOLING' },
      stable: { variant: 'outline' as const, icon: Activity, label: 'STABLE' },
    };

    const config = variants[status as keyof typeof variants] || variants.stable;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Meta Insights Dashboard</h1>
          <p className="text-muted-foreground">
            Automated technique trend tracking and curation prioritization
          </p>
        </div>
        <Button 
          onClick={handleAnalyze} 
          disabled={analyzing}
          data-testid="button-run-analysis"
        >
          <Activity className="mr-2 h-4 w-4" />
          {analyzing ? 'Analyzing...' : 'Run Analysis'}
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Techniques Tracked</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-techniques-tracked">
              {statsLoading ? '...' : stats?.totalTechniquesTracked || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">User Requests (7d)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-user-requests">
              {statsLoading ? '...' : stats?.userRequestsLast7Days || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Need Curation</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-needs-curation">
              {statsLoading ? '...' : stats?.techniquesNeedingCuration || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Videos in Library</CardTitle>
            <PlayCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-videos">
              {statsLoading ? '...' : stats?.totalVideosInLibrary || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Volume Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Requests Today</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-requests-today">
              {volumeLoading ? '...' : volumeStats?.today || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-requests-week">
              {volumeLoading ? '...' : volumeStats?.thisWeek || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-requests-month">
              {volumeLoading ? '...' : volumeStats?.thisMonth || 0}
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unmet Requests</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive" data-testid="text-unmet-requests">
              {volumeLoading ? '...' : volumeStats?.unmetRequests || 0}
            </div>
            <p className="text-xs text-muted-foreground">No videos returned</p>
          </CardContent>
        </Card>
      </div>

      {/* Demand-Driven Curation Controls */}
      <Card className="border-primary/30">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="text-xl">🎯</span>
              Weekly Demand-Driven Curation
            </CardTitle>
            <CardDescription>
              Runs every Monday at 3:15 AM EST to fill content gaps based on user requests
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={demandStatus?.enabled ? 'default' : 'outline'}
              size="sm"
              onClick={handleToggleDemandCuration}
              disabled={togglingDemand || demandStatusLoading}
              data-testid="button-toggle-demand-curation"
            >
              {togglingDemand ? 'Updating...' : demandStatus?.enabled ? 'Enabled' : 'Disabled'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunDemandCuration}
              disabled={runningDemand || !demandStatus?.enabled}
              data-testid="button-run-demand-curation"
            >
              {runningDemand ? 'Running...' : 'Run Now'}
            </Button>
          </div>
        </CardHeader>
        {demandStatus?.lastResult && (
          <CardContent className="pt-0">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Last run: {demandStatus.lastRunAt ? formatDistanceToNow(new Date(demandStatus.lastRunAt), { addSuffix: true }) : 'Never'}</span>
              <span>|</span>
              <span>Techniques: {demandStatus.lastResult.techniquesAnalyzed}</span>
              <span>|</span>
              <span className="text-green-500">Videos added: {demandStatus.lastResult.totalVideosAdded}</span>
              {demandStatus.lastResult.stillUnmet.length > 0 && (
                <>
                  <span>|</span>
                  <span className="text-amber-500">Still unmet: {demandStatus.lastResult.stillUnmet.length}</span>
                </>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="trending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trending" data-testid="tab-trending">Trending Techniques</TabsTrigger>
          <TabsTrigger value="priorities" data-testid="tab-priorities">Curation Priorities</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests">User Requests</TabsTrigger>
          <TabsTrigger value="unmet" data-testid="tab-unmet">Unmet Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="trending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trending Techniques</CardTitle>
              <CardDescription>
                Techniques with hot or rising meta status based on user requests and competition data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trendingLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (trendingData?.techniques.length || 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No trending techniques yet</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Technique</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Meta Score</TableHead>
                      <TableHead>User Score</TableHead>
                      <TableHead>Comp Score</TableHead>
                      <TableHead>Videos</TableHead>
                      <TableHead>Coverage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trendingData?.techniques.map((tech) => (
                      <TableRow key={tech.techniqueName}>
                        <TableCell className="font-medium capitalize">{tech.techniqueName}</TableCell>
                        <TableCell>{getStatusBadge(tech.metaStatus)}</TableCell>
                        <TableCell>{Number(tech.overallMetaScore).toFixed(1)}</TableCell>
                        <TableCell>{Number(tech.userRequestScore).toFixed(1)}</TableCell>
                        <TableCell>{Number(tech.competitionMetaScore).toFixed(1)}</TableCell>
                        <TableCell>{tech.videosInLibrary}</TableCell>
                        <TableCell>
                          {tech.coverageAdequate ? (
                            <Badge variant="outline">Adequate</Badge>
                          ) : (
                            <Badge variant="secondary">Needs More</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="priorities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Curation Priorities</CardTitle>
              <CardDescription>
                High-priority techniques needing video curation
              </CardDescription>
            </CardHeader>
            <CardContent>
              {prioritiesLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (prioritiesData?.priorities.length || 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No priorities at the moment</div>
              ) : (
                <div className="space-y-4">
                  {prioritiesData?.priorities.map((priority) => (
                    <div key={priority.techniqueName} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold capitalize text-lg">{priority.techniqueName}</h3>
                          <p className="text-sm text-muted-foreground">
                            Priority: {priority.curationPriority}/10 | Meta Score: {Number(priority.overallMetaScore).toFixed(1)} | Videos: {priority.videosInLibrary}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleCurate(priority.techniqueName)}
                          disabled={curating === priority.techniqueName}
                          data-testid={`button-curate-${priority.techniqueName}`}
                        >
                          {curating === priority.techniqueName ? 'Curating...' : 'Curate Now'}
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {priority.suggestedSearches?.map((search, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {search}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent User Technique Requests</CardTitle>
              <CardDescription>
                Techniques users are asking about in chat
              </CardDescription>
            </CardHeader>
            <CardContent>
              {requestsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (requestsData?.requests.length || 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No requests yet</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Technique</TableHead>
                      <TableHead>Belt</TableHead>
                      <TableHead>Gi/NoGi</TableHead>
                      <TableHead>Context</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestsData?.requests.slice(0, 20).map((request) => (
                      <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">
                              {request.userName || 'Unknown'}
                            </span>
                            <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {request.userEmail || request.userId}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium capitalize">{request.techniqueMentioned}</TableCell>
                        <TableCell>{request.beltLevel || '-'}</TableCell>
                        <TableCell>{request.giPreference || '-'}</TableCell>
                        <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                          {request.requestContext}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(request.requestedAt), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unmet" className="space-y-4">
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Unmet Requests - Content Gaps
              </CardTitle>
              <CardDescription>
                User questions where Professor OS had no video recommendations - immediate curation opportunities
              </CardDescription>
            </CardHeader>
            <CardContent>
              {unmetLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (unmetData?.requests.length || 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No unmet requests - all user questions have video coverage!
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Technique</TableHead>
                      <TableHead>Belt</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmetData?.requests.slice(0, 30).map((request) => (
                      <TableRow key={request.id} data-testid={`row-unmet-${request.id}`}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">
                              {request.userName || 'Unknown'}
                            </span>
                            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {request.userEmail || request.userId}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium capitalize">{request.techniqueMentioned}</TableCell>
                        <TableCell>{request.beltLevel || '-'}</TableCell>
                        <TableCell className="max-w-sm truncate text-sm text-muted-foreground">
                          {request.requestContext}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(request.requestedAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCurate(request.techniqueMentioned)}
                            disabled={curating === request.techniqueMentioned}
                            data-testid={`button-curate-unmet-${request.id}`}
                          >
                            {curating === request.techniqueMentioned ? 'Curating...' : 'Curate'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </AdminLayout>
  );
}
