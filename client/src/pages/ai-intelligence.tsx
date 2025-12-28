import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Brain, TrendingUp, Users, Network, MapPin, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

export default function AIIntelligence() {
  const { toast } = useToast();

  const { data: statsData } = useQuery({
    queryKey: ["/api/ai/stats"],
  });

  const { data: featuresData } = useQuery({
    queryKey: ["/api/ai/features"],
  });

  const { data: videosData } = useQuery({
    queryKey: ["/api/ai/videos"],
  });

  const { data: reasoningData } = useQuery({
    queryKey: ["/api/ai/reasoning"],
  });

  const stats = (statsData as any)?.stats || {};
  const features = (featuresData as any)?.features || [];
  const videos = (videosData as any)?.videos || [];
  const reasoning = (reasoningData as any)?.traces || [];

  // Track rollout and enabled state locally to keep controls synchronized
  const [rolloutInputs, setRolloutInputs] = useState<Record<string, number>>({});
  const [enabledInputs, setEnabledInputs] = useState<Record<string, boolean>>({});

  // Sync local state with server data on initial load and refetches
  useEffect(() => {
    if (features.length > 0) {
      const serverRollouts: Record<string, number> = {};
      const serverEnabled: Record<string, boolean> = {};
      features.forEach((feature: any) => {
        serverRollouts[feature.featureName] = feature.rolloutPercentage || 0;
        serverEnabled[feature.featureName] = feature.isEnabled || false;
      });
      setRolloutInputs(serverRollouts);
      setEnabledInputs(serverEnabled);
    }
  }, [features]);

  const updateFeatureMutation = useMutation({
    mutationFn: async ({ featureName, isEnabled, rolloutPercentage, previousRollout }: any) => {
      const response = await fetch(`/api/ai/features/${featureName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled, rolloutPercentage }),
      });
      if (!response.ok) throw new Error(await response.text());
      return { data: await response.json(), featureName, previousRollout };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/features"] });
      toast({
        title: "Feature updated",
        description: "Feature flag settings have been updated successfully.",
      });
    },
    onError: (error: any, variables: any) => {
      // Restore previous values on error
      if (variables.featureName) {
        if (variables.previousRollout !== undefined) {
          setRolloutInputs((prev) => ({ ...prev, [variables.featureName]: variables.previousRollout }));
        }
        if (variables.previousEnabled !== undefined) {
          setEnabledInputs((prev) => ({ ...prev, [variables.featureName]: variables.previousEnabled }));
        }
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggle = (featureName: string, enabled: boolean, currentRollout: number, previousEnabled: boolean, previousRollout: number) => {
    // Update local state immediately for optimistic UI
    setEnabledInputs((prev) => ({ ...prev, [featureName]: enabled }));
    
    updateFeatureMutation.mutate({
      featureName,
      isEnabled: enabled,
      rolloutPercentage: currentRollout,
      previousEnabled,
      previousRollout,
    });
  };

  const handleRolloutChange = (featureName: string, value: string) => {
    const numValue = parseInt(value);
    
    // Update local state immediately for controlled input
    if (!isNaN(numValue)) {
      setRolloutInputs((prev) => ({ ...prev, [featureName]: numValue }));
    }
  };

  const handleRolloutBlur = (featureName: string, value: string, currentEnabled: boolean, originalValue: number) => {
    // Validate and clamp the input value
    const numValue = parseInt(value);
    
    // Guard against NaN and invalid values
    if (isNaN(numValue)) {
      // Restore original value in UI and show error
      setRolloutInputs((prev) => ({ ...prev, [featureName]: originalValue }));
      toast({
        title: "Invalid input",
        description: "Rollout percentage must be a number",
        variant: "destructive",
      });
      return;
    }
    
    // Clamp to 0-100 range
    const clampedValue = Math.max(0, Math.min(100, numValue));
    
    // Update UI to show clamped value
    setRolloutInputs((prev) => ({ ...prev, [featureName]: clampedValue }));
    
    updateFeatureMutation.mutate({
      featureName,
      isEnabled: currentEnabled,
      rolloutPercentage: clampedValue,
      previousRollout: originalValue,
    });
  };

  const avgConfidence = stats.avg_confidence 
    ? (parseFloat(stats.avg_confidence) * 100).toFixed(0) + '%'
    : 'N/A';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-ai-intelligence-title">
          <Brain className="w-8 h-8 text-primary" />
          AI Intelligence Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">Monitor and control the BJJ OS AI intelligence system</p>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Videos Analyzed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary" data-testid="text-total-videos">
              {stats.total_videos || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">User Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary" data-testid="text-total-signals">
              {stats.total_signals || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Users w/ Context</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary" data-testid="text-users-context">
              {stats.users_with_context || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Relationships</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary" data-testid="text-relationships">
              {stats.relationships_mapped || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Problems Mapped</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary" data-testid="text-problems">
              {stats.problems_mapped || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary" data-testid="text-confidence">
              {avgConfidence}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feature Flags Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Feature Flags
          </CardTitle>
          <CardDescription>Control AI intelligence feature rollout and A/B testing</CardDescription>
        </CardHeader>
        <CardContent>
          {features.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No feature flags configured</div>
          ) : (
            <div className="space-y-4">
              {features.map((feature: any) => {
                const currentRollout = rolloutInputs[feature.featureName] ?? feature.rolloutPercentage ?? 0;
                const currentEnabled = enabledInputs[feature.featureName] ?? feature.isEnabled ?? false;
                return (
                  <div 
                    key={feature.featureName} 
                    className="flex items-center justify-between p-4 border rounded-lg"
                    data-testid={`feature-${feature.featureName}`}
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold">{feature.featureName}</h3>
                      <p className="text-sm text-muted-foreground">{feature.featureDescription}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`rollout-${feature.featureName}`} className="text-sm">
                          Rollout:
                        </Label>
                        <Input
                          id={`rollout-${feature.featureName}`}
                          type="number"
                          min="0"
                          max="100"
                          value={currentRollout}
                          onChange={(e) => handleRolloutChange(feature.featureName, e.target.value)}
                          onBlur={(e) => handleRolloutBlur(feature.featureName, e.target.value, currentEnabled, feature.rolloutPercentage || 0)}
                          className="w-20"
                          data-testid={`input-rollout-${feature.featureName}`}
                        />
                        <span className="text-sm">%</span>
                      </div>
                      <Switch
                        checked={currentEnabled}
                        onCheckedChange={(checked) => handleToggle(feature.featureName, checked, currentRollout, feature.isEnabled || false, feature.rolloutPercentage || 0)}
                        data-testid={`switch-${feature.featureName}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Reasoning Traces */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Recent AI Decisions
          </CardTitle>
          <CardDescription>Transparent reasoning from the enhanced scoring algorithm</CardDescription>
        </CardHeader>
        <CardContent>
          {reasoning.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No reasoning traces yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Decision ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Explanation</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reasoning.map((trace: any) => (
                  <TableRow key={trace.decisionId} data-testid={`trace-${trace.decisionId}`}>
                    <TableCell className="font-mono text-xs">{trace.decisionId?.substring(0, 8)}...</TableCell>
                    <TableCell>
                      <Badge variant="outline">{trace.decisionType}</Badge>
                    </TableCell>
                    <TableCell>{trace.userId || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={parseFloat(trace.confidence || '0') >= 0.7 ? "default" : "secondary"}>
                        {(parseFloat(trace.confidence || '0') * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate">{trace.userFriendlyExplanation}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {trace.createdAt ? formatDistanceToNow(new Date(trace.createdAt), { addSuffix: true }) : 'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Video Knowledge Base */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5" />
            Video Knowledge Base
          </CardTitle>
          <CardDescription>Recently analyzed BJJ technique videos</CardDescription>
        </CardHeader>
        <CardContent>
          {videos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No videos analyzed yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technique</TableHead>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Times Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videos.slice(0, 10).map((video: any) => (
                  <TableRow key={video.id} data-testid={`video-${video.id}`}>
                    <TableCell className="font-medium">{video.techniqueName || 'N/A'}</TableCell>
                    <TableCell>{video.instructorName || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{video.positionCategory || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{video.techniqueType || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell>{video.difficultyScore || 'N/A'}</TableCell>
                    <TableCell>
                      <span className="text-primary font-semibold">
                        {video.avgUserRating ? parseFloat(video.avgUserRating).toFixed(1) : 'N/A'}
                      </span>
                      <span className="text-muted-foreground text-sm ml-1">
                        ({video.totalRatings || 0})
                      </span>
                    </TableCell>
                    <TableCell>{video.timesSentToUsers || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
