import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AdminLayout } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderTree, ChevronDown, ChevronRight, Loader2, RefreshCw, Zap, Hash, Video, Tag, BarChart, Trophy } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

interface TaxonomyNode {
  id: number;
  name: string;
  slug: string;
  level: number;
  videoCount: number;
  children?: TaxonomyNode[];
}

function TaxonomyTreeNode({ node, depth = 0 }: { node: TaxonomyNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children && node.children.length > 0;

  const levelColors: Record<number, string> = {
    1: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    2: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    3: "bg-green-500/20 text-green-300 border-green-500/30",
  };

  const levelLabels: Record<number, string> = {
    1: "Category",
    2: "Position",
    3: "Technique",
  };

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer hover-elevate transition-colors"
        style={{ marginLeft: depth * 16 }}
        onClick={() => hasChildren && setExpanded(!expanded)}
        data-testid={`tree-node-${node.id}`}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )
        ) : (
          <div className="w-4 shrink-0" />
        )}
        <FolderTree className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium flex-1 truncate">{node.name}</span>
        <Badge variant="outline" className={`text-xs shrink-0 ${levelColors[node.level] || ''}`}>
          {levelLabels[node.level] || `L${node.level}`}
        </Badge>
        {node.videoCount > 0 && (
          <Badge variant="secondary" className="text-xs shrink-0">
            {node.videoCount} videos
          </Badge>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TaxonomyTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminTaxonomy() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [authError, setAuthError] = useState(false);

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/taxonomy/stats'],
    queryFn: () => fetchWithAuth('/api/taxonomy/stats'),
    staleTime: 30000,
    retry: false,
  });

  const { data: treeData, isLoading: treeLoading } = useQuery<{ taxonomy: TaxonomyNode[]; totalNodes: number }>({
    queryKey: ['/api/taxonomy/tree'],
    queryFn: () => fetch('/api/taxonomy/tree').then(r => r.json()),
    staleTime: 120000,
  });

  const backfillMutation = useMutation({
    mutationFn: () => postWithAuth('/api/taxonomy/auto-tag-backfill'),
    onSuccess: (data) => {
      toast({
        title: "Backfill Complete",
        description: `Tagged ${data.newTags || 0} new videos. Total tags: ${data.totalTagsAfter || 'unknown'}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/taxonomy/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/taxonomy/tree'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Backfill Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateCountsMutation = useMutation({
    mutationFn: () => postWithAuth('/api/taxonomy/update-counts'),
    onSuccess: () => {
      toast({
        title: "Counts Updated",
        description: "Video counts have been recalculated for all taxonomy nodes.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/taxonomy/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/taxonomy/tree'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const stats = statsData || { nodeCounts: [], tagStats: {}, topNodes: [], unmappedVideos: 0 };
  const totalNodes = stats.nodeCounts?.reduce((sum: number, n: any) => sum + parseInt(n.count || '0'), 0) || 0;
  const taggedVideos = parseInt(stats.tagStats?.mapped_videos || '0');
  const untaggedVideos = parseInt(stats.unmappedVideos || '0');
  const avgTagsPerVideo = parseFloat(stats.tagStats?.avg_tags_per_video || '0');

  if (authError) {
    navigate('/admin/login');
    return null;
  }

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FolderTree className="h-6 w-6 text-purple-500" />
              Taxonomy Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Organize BJJ techniques into categories, positions, and specific techniques
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => updateCountsMutation.mutate()}
              disabled={updateCountsMutation.isPending}
              data-testid="button-update-counts"
            >
              {updateCountsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Update Counts
            </Button>
            <Button
              onClick={() => backfillMutation.mutate()}
              disabled={backfillMutation.isPending}
              variant="default"
              data-testid="button-backfill"
            >
              {backfillMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Backfill Untagged
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-total-nodes">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Nodes</CardTitle>
              <Hash className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-2xl font-bold">{totalNodes}</div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="card-tagged-videos">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tagged Videos</CardTitle>
              <Video className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-2xl font-bold text-green-500">{taggedVideos}</div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="card-untagged-videos">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Untagged Videos</CardTitle>
              <Tag className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-2xl font-bold text-yellow-500">{untaggedVideos}</div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="card-avg-tags">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Tags/Video</CardTitle>
              <BarChart className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-2xl font-bold">{avgTagsPerVideo.toFixed(1)}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2" data-testid="card-taxonomy-tree">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5 text-purple-500" />
                Taxonomy Tree
              </CardTitle>
            </CardHeader>
            <CardContent>
              {treeLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Loading taxonomy tree...</p>
                </div>
              ) : treeData?.taxonomy && treeData.taxonomy.length > 0 ? (
                <div className="space-y-1 max-h-[600px] overflow-y-auto">
                  {treeData.taxonomy.map((node) => (
                    <TaxonomyTreeNode key={node.id} node={node} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No taxonomy nodes found</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-top-techniques">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Top 10 Techniques
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : stats.topNodes && stats.topNodes.length > 0 ? (
                <div className="space-y-3">
                  {stats.topNodes.map((node: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3" data-testid={`top-technique-${idx}`}>
                      <span className="text-sm font-bold text-muted-foreground w-6 text-right shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{node.name}</p>
                        <Badge variant="outline" className="text-xs mt-1">
                          {node.level === 2 ? 'Position' : 'Technique'}
                        </Badge>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {node.video_count} videos
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground text-sm">No data yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {stats.nodeCounts && stats.nodeCounts.length > 0 && (
          <Card data-testid="card-level-breakdown">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Level Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 flex-wrap">
                {stats.nodeCounts.map((level: any) => {
                  const labels: Record<string, string> = { '1': 'Categories', '2': 'Positions', '3': 'Techniques' };
                  const colors: Record<string, string> = { '1': 'text-purple-400', '2': 'text-blue-400', '3': 'text-green-400' };
                  return (
                    <div key={level.level} className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${colors[level.level] || ''}`}>{level.count}</span>
                      <span className="text-sm text-muted-foreground">{labels[level.level] || `Level ${level.level}`}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
