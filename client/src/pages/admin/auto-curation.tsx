import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Play, CheckCircle2, XCircle, Clock, TrendingUp, Video, Star, AlertTriangle, AlertCircle, Shield, MinusCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { adminApiRequest } from "@/lib/adminApi";
import { queryClient } from "@/lib/queryClient";

export default function AdminAutoCuration() {
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/admin/curation-status'],
    queryFn: () => adminApiRequest('/api/admin/curation-status'),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const { data: runsData } = useQuery({
    queryKey: ['/api/admin/curation-runs'],
    queryFn: () => adminApiRequest('/api/admin/curation-runs?limit=20'),
    refetchInterval: 10000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return await adminApiRequest('/api/admin/toggle-curation', 'POST', {
        enabled
      });
    },
    onSuccess: (data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/curation-status'] });
      toast({
        title: enabled ? "Auto-Curation Enabled" : "Auto-Curation Disabled",
        description: enabled 
          ? "Automatic video curation is now running on schedule" 
          : "Automatic video curation has been paused",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: async () => {
      return await adminApiRequest('/api/admin/run-curation', 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/curation-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/curation-runs'] });
      toast({
        title: "Curation Started",
        description: "Manual curation run started successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start curation",
        variant: "destructive",
      });
    },
  });

  const formatDuration = (startTime: string, endTime: string | null) => {
    if (!endTime) return "In progress...";
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const durationMs = end - start;
    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'running':
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const getGuardrailBadge = (guardrailStatus: string | null) => {
    if (!guardrailStatus) return <Badge variant="outline">-</Badge>;
    
    switch (guardrailStatus) {
      case 'ok':
        return <Badge variant="default" className="bg-green-600 dark:bg-green-700"><Shield className="w-3 h-3 mr-1" />OK</Badge>;
      case 'low':
        return <Badge variant="secondary" className="bg-yellow-600 dark:bg-yellow-700 text-white dark:text-white"><AlertTriangle className="w-3 h-3 mr-1" />Low</Badge>;
      case 'high':
        return <Badge variant="secondary" className="bg-orange-600 dark:bg-orange-700 text-white dark:text-white"><AlertTriangle className="w-3 h-3 mr-1" />High</Badge>;
      case 'critical':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Critical</Badge>;
      case 'no-data':
        return <Badge variant="outline"><MinusCircle className="w-3 h-3 mr-1" />No Data</Badge>;
      default:
        return <Badge variant="outline">{guardrailStatus}</Badge>;
    }
  };

  if (statsLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const enabled = stats?.enabled || false;
  const today = stats?.today || {};
  const quota = stats?.quota || {};
  const capacity = stats?.capacity || {};
  const lastRun = stats?.lastRun;
  const recentRuns = runsData?.runs || [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-3xl font-bold">Video Library Auto-Curation</h2>
            <p className="text-muted-foreground mt-1">
              Automated discovery and quality control for BJJ technique videos
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 px-4 py-2 bg-muted rounded-lg">
              <Label htmlFor="auto-curation-toggle" className="cursor-pointer font-medium">
                Auto-Curation
              </Label>
              <Switch
                id="auto-curation-toggle"
                checked={enabled}
                onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                disabled={toggleMutation.isPending}
                data-testid="toggle-auto-curation"
              />
              {enabled ? (
                <Badge variant="default" className="bg-green-600">ON</Badge>
              ) : (
                <Badge variant="secondary">OFF</Badge>
              )}
            </div>
            <Button
              onClick={() => runNowMutation.mutate()}
              disabled={runNowMutation.isPending}
              data-testid="button-run-now"
            >
              {runNowMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Now
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
              <CardTitle className="text-sm font-medium">Today's Runs</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-today-runs">
                {today.runs || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {today.videosApproved || 0} videos added
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
              <CardTitle className="text-sm font-medium">Quota Used</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-quota-used">
                {quota.percentUsed || '0'}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {quota.used || 0} / {quota.limit || 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
              <CardTitle className="text-sm font-medium">Quota Remaining</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-quota-remaining">
                {quota.remaining?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                API calls left
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
              <CardTitle className="text-sm font-medium">Batch Size</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-batch-size">
                {capacity.batchSize || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {capacity.runsPerDay || 0}x per day
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Recent Curation Runs</CardTitle>
                <CardDescription>
                  Latest automated video discovery sessions
                </CardDescription>
              </div>
              {lastRun && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  Last run: {formatDate(lastRun.runDate)}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {recentRuns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No curation runs yet. Click "Run Now" to start the first run.
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Guardrail</TableHead>
                      <TableHead className="text-right">Reviewed</TableHead>
                      <TableHead className="text-right">Added</TableHead>
                      <TableHead className="text-right">Rejected</TableHead>
                      <TableHead className="text-right">Skipped</TableHead>
                      <TableHead className="text-right">Accept Rate</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentRuns.map((run: any, idx: number) => (
                      <TableRow key={run.id || idx} data-testid={`row-run-${idx}`}>
                        <TableCell className="text-sm">
                          {formatDate(run.runDate || run.startedAt)}
                        </TableCell>
                        <TableCell>{getStatusBadge(run.status)}</TableCell>
                        <TableCell>{getGuardrailBadge(run.guardrailStatus)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {run.videosAnalyzed || 0}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600">
                          {run.videosAdded || 0}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {run.videosRejected || 0}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  {(run.videosSkippedDuration || 0) + (run.videosSkippedDuplicates || 0) + (run.videosSkippedQuota || 0) + (run.videosSkippedOther || 0)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs space-y-1">
                                  <div>Duration: {run.videosSkippedDuration || 0}</div>
                                  <div>Duplicates: {run.videosSkippedDuplicates || 0}</div>
                                  <div>Quota: {run.videosSkippedQuota || 0}</div>
                                  <div>Other: {run.videosSkippedOther || 0}</div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {run.acceptanceRate 
                            ? `${Math.round(parseFloat(run.acceptanceRate))}%`
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatDuration(run.startedAt, run.completedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How Auto-Curation Works</CardTitle>
            <CardDescription>
              Fully automated video discovery and quality control system
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                1
              </div>
              <div>
                <div className="font-medium">YouTube Discovery</div>
                <div className="text-sm text-muted-foreground">
                  Searches YouTube for BJJ techniques using targeted queries
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                2
              </div>
              <div>
                <div className="font-medium">AI Quality Analysis</div>
                <div className="text-sm text-muted-foreground">
                  Claude analyzes teaching quality, instructor credibility, and content value
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                3
              </div>
              <div>
                <div className="font-medium">Metadata Extraction</div>
                <div className="text-sm text-muted-foreground">
                  Extracts technique details, timestamps, prerequisites, and skill levels
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                4
              </div>
              <div>
                <div className="font-medium">Auto-Accept or Reject</div>
                <div className="text-sm text-muted-foreground">
                  Videos scoring above threshold are automatically added to library
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
