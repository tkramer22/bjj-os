import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminApiRequest } from "@/lib/adminApi";
import { 
  TrendingUp, 
  TrendingDown, 
  MessageSquare, 
  Trophy, 
  Target,
  Plus,
  AlertCircle,
  CheckCircle,
  Flame,
  Info
} from "lucide-react";

export default function MetaInsightsDashboard() {
  const { toast } = useToast();
  const [showAddCompetitionDialog, setShowAddCompetitionDialog] = useState(false);

  // Fetch meta summary
  const { data: summary } = useQuery({
    queryKey: ['/api/admin/meta/summary'],
    queryFn: () => adminApiRequest('/api/admin/meta/summary'),
  });

  // Fetch trending techniques
  const { data: trendingTechniques = [], isLoading: loadingTrending } = useQuery<any[]>({
    queryKey: ['/api/admin/meta/trending-techniques'],
    queryFn: () => adminApiRequest('/api/admin/meta/trending-techniques'),
  });

  // Fetch user requests
  const { data: userRequests = [], isLoading: loadingRequests } = useQuery<any[]>({
    queryKey: ['/api/admin/meta/user-requests'],
    queryFn: () => adminApiRequest('/api/admin/meta/user-requests'),
  });

  // Fetch competition meta data
  const { data: competitionData = [], isLoading: loadingCompetition } = useQuery<any[]>({
    queryKey: ['/api/admin/meta/competition'],
    queryFn: () => adminApiRequest('/api/admin/meta/competition'),
  });

  // Fetch technique status
  const { data: techniqueStatus = [], isLoading: loadingTechniqueStatus } = useQuery<any[]>({
    queryKey: ['/api/admin/meta/technique-status'],
    queryFn: () => adminApiRequest('/api/admin/meta/technique-status'),
  });

  // Add competition entry mutation
  const addCompetitionMutation = useMutation({
    mutationFn: async (data: any) => {
      return adminApiRequest('/api/admin/meta/competition', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/meta/competition'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/meta/summary'] });
      setShowAddCompetitionDialog(false);
      toast({
        title: "Competition entry added",
        description: "Competition meta data saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const handleAddCompetition = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      competition_name: formData.get('competition_name'),
      competition_date: formData.get('competition_date'),
      competition_category: formData.get('competition_category'),
      technique_name: formData.get('technique_name'),
      technique_category: formData.get('technique_category'),
      total_occurrences: parseInt(formData.get('total_occurrences') as string),
      wins_by_technique: parseInt(formData.get('wins_by_technique') as string),
      notable_athletes: (formData.get('notable_athletes') as string)?.split(',').map(s => s.trim()).filter(Boolean) || [],
      medal_count: parseInt(formData.get('medal_count') as string),
      trend_status: formData.get('trend_status'),
      notes: formData.get('notes'),
    };
    
    addCompetitionMutation.mutate(data);
  };

  const getTrendBadge = (status: string) => {
    const config: Record<string, { variant: any; label: string; icon: any }> = {
      hot: { variant: "destructive", label: "Hot", icon: Flame },
      rising: { variant: "default", label: "Rising", icon: TrendingUp },
      stable: { variant: "secondary", label: "Stable", icon: CheckCircle },
      cooling: { variant: "outline", label: "Cooling", icon: TrendingDown },
      declining: { variant: "outline", label: "Declining", icon: AlertCircle },
    };
    const { variant, label, icon: Icon } = config[status] || config.stable;
    return (
      <Badge variant={variant}>
        <Icon className="w-3 h-3 mr-1" />
        {label}
      </Badge>
    );
  };

  const getMetaStatusBadge = (status: string) => {
    const config: Record<string, { variant: any; label: string }> = {
      hot: { variant: "destructive", label: "Hot" },
      rising: { variant: "default", label: "Rising" },
      stable: { variant: "secondary", label: "Stable" },
      cooling: { variant: "outline", label: "Cooling" },
    };
    const { variant, label } = config[status] || config.stable;
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <AdminLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header with explanation */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Meta Insights Dashboard</h1>
          <Card className="bg-muted/50 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm">
                  <p className="font-medium">What is this dashboard?</p>
                  <p className="text-muted-foreground">
                    This dashboard tracks the BJJ meta game by analyzing user requests and competition trends. 
                    Prof. OS uses this data to prioritize content curation and ensure we have high-quality videos 
                    for techniques that users are actively asking about or seeing in competitions.
                  </p>
                  <div className="pt-2 space-y-1">
                    <p className="font-medium">How "Run Analysis" works:</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                      <li>User requests are auto-extracted from chat conversations</li>
                      <li>Competition data tracks which techniques are winning at major events</li>
                      <li>Trending techniques get higher curation priority</li>
                      <li>Gaps in video library coverage are automatically identified</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">User Requests</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-user-requests">{summary?.totalUserRequests || 0}</div>
              <p className="text-xs text-muted-foreground">Techniques requested by users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Competition Data</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-competition-entries">{summary?.totalCompetitionEntries || 0}</div>
              <p className="text-xs text-muted-foreground">Competition technique records</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Curation</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-needs-curation">{summary?.techniquesNeedingCuration || 0}</div>
              <p className="text-xs text-muted-foreground">Techniques needing more videos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hot Techniques</CardTitle>
              <Flame className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-hot-techniques">{summary?.hotTechniques || 0}</div>
              <p className="text-xs text-muted-foreground">Currently trending</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different insights */}
        <Tabs defaultValue="trending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trending" data-testid="tab-trending">Trending Techniques</TabsTrigger>
            <TabsTrigger value="requests" data-testid="tab-requests">User Requests</TabsTrigger>
            <TabsTrigger value="competition" data-testid="tab-competition">Competition Meta</TabsTrigger>
            <TabsTrigger value="status" data-testid="tab-status">Technique Status</TabsTrigger>
          </TabsList>

          {/* Trending Techniques Tab */}
          <TabsContent value="trending" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Trending Techniques (Last 30 Days)</CardTitle>
                <CardDescription>
                  Most requested techniques from user conversations, ranked by frequency
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTrending ? (
                  <p className="text-center text-muted-foreground py-8">Loading trending techniques...</p>
                ) : trendingTechniques.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No trending data available</p>
                ) : (
                  <div className="space-y-2">
                    {trendingTechniques.map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded hover-elevate">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="w-8 h-8 flex items-center justify-center">
                            #{index + 1}
                          </Badge>
                          <div>
                            <p className="font-medium">{item.technique}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.uniqueUsers} {item.uniqueUsers === 1 ? 'user' : 'users'} • {item.requestCount} {item.requestCount === 1 ? 'request' : 'requests'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="default">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            Trending
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Requests Tab */}
          <TabsContent value="requests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent User Technique Requests</CardTitle>
                <CardDescription>
                  Auto-extracted technique requests from user conversations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingRequests ? (
                  <p className="text-center text-muted-foreground py-8">Loading user requests...</p>
                ) : userRequests.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No user requests found</p>
                ) : (
                  <div className="space-y-3">
                    {userRequests.slice(0, 20).map((request: any) => (
                      <div key={request.id} className="p-3 border rounded space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium">{request.techniqueMentioned}</p>
                            <p className="text-sm text-muted-foreground line-clamp-2">{request.requestContext}</p>
                          </div>
                          <div className="flex flex-col gap-1 ml-2">
                            {request.requestType && (
                              <Badge variant="outline" className="text-xs">
                                {request.requestType.replace('_', ' ')}
                              </Badge>
                            )}
                            {request.beltLevel && (
                              <Badge variant="secondary" className="text-xs">
                                {request.beltLevel}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(request.requestedAt).toLocaleDateString()} • 
                          {request.giPreference && ` ${request.giPreference}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Competition Meta Tab */}
          <TabsContent value="competition" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Competition Meta Tracking</h2>
                <p className="text-sm text-muted-foreground">Techniques trending at major competitions</p>
              </div>
              <Button
                onClick={() => setShowAddCompetitionDialog(true)}
                data-testid="button-add-competition"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Entry
              </Button>
            </div>

            <Card>
              <CardContent className="pt-6">
                {loadingCompetition ? (
                  <p className="text-center text-muted-foreground py-8">Loading competition data...</p>
                ) : competitionData.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No competition data yet</p>
                    <p className="text-sm mt-1">Add competition technique data to track meta trends</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {competitionData.map((entry: any) => (
                      <div key={entry.id} className="p-4 border rounded space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{entry.techniqueName}</p>
                              {getTrendBadge(entry.trendStatus)}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {entry.competitionName} • {new Date(entry.competitionDate).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            {entry.verified && (
                              <Badge variant="default" className="mb-1">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Verified
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Total Uses</p>
                            <p className="font-medium">{entry.totalOccurrences}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Wins</p>
                            <p className="font-medium">{entry.winsByTechnique}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Win Rate</p>
                            <p className="font-medium">{entry.winRate}%</p>
                          </div>
                        </div>
                        {entry.notableAthletes && entry.notableAthletes.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-2">
                            {entry.notableAthletes.map((athlete: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {athlete}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Technique Status Tab */}
          <TabsContent value="status" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Technique Coverage Status</CardTitle>
                <CardDescription>
                  Aggregated analysis of video library coverage and curation priorities
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTechniqueStatus ? (
                  <p className="text-center text-muted-foreground py-8">Loading technique status...</p>
                ) : techniqueStatus.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No technique status data available</p>
                ) : (
                  <div className="space-y-2">
                    {techniqueStatus.map((tech: any) => (
                      <div key={tech.id} className="p-3 border rounded space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium">{tech.techniqueName}</p>
                              {getMetaStatusBadge(tech.metaStatus)}
                              {tech.needsCuration && (
                                <Badge variant="destructive">Needs Curation</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {tech.videosInLibrary} videos in library • 
                              Meta Score: {parseFloat(tech.overallMetaScore).toFixed(1)}
                            </p>
                          </div>
                          {tech.curationPriority > 0 && (
                            <Badge variant="outline">
                              Priority: {tech.curationPriority}/10
                            </Badge>
                          )}
                        </div>
                        {tech.suggestedSearches && tech.suggestedSearches.length > 0 && (
                          <div className="pt-2">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Searches:</p>
                            <div className="flex flex-wrap gap-1">
                              {tech.suggestedSearches.map((search: string, idx: number) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {search}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Competition Entry Dialog */}
        <Dialog open={showAddCompetitionDialog} onOpenChange={setShowAddCompetitionDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleAddCompetition}>
              <DialogHeader>
                <DialogTitle>Add Competition Meta Entry</DialogTitle>
                <DialogDescription>
                  Track technique usage and success rates from major competitions
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="competition_name">Competition Name *</Label>
                    <Input
                      id="competition_name"
                      name="competition_name"
                      placeholder="ADCC 2024"
                      required
                      data-testid="input-competition-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="competition_date">Date *</Label>
                    <Input
                      id="competition_date"
                      name="competition_date"
                      type="date"
                      required
                      data-testid="input-competition-date"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="competition_category">Category</Label>
                  <Select name="competition_category">
                    <SelectTrigger data-testid="select-competition-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gi">Gi</SelectItem>
                      <SelectItem value="no-gi">No-Gi</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="technique_name">Technique Name *</Label>
                    <Input
                      id="technique_name"
                      name="technique_name"
                      placeholder="Heel hook"
                      required
                      data-testid="input-technique-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="technique_category">Technique Category</Label>
                    <Select name="technique_category">
                      <SelectTrigger data-testid="select-technique-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="submission">Submission</SelectItem>
                        <SelectItem value="pass">Pass</SelectItem>
                        <SelectItem value="guard">Guard</SelectItem>
                        <SelectItem value="takedown">Takedown</SelectItem>
                        <SelectItem value="sweep">Sweep</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="total_occurrences">Total Uses *</Label>
                    <Input
                      id="total_occurrences"
                      name="total_occurrences"
                      type="number"
                      min="0"
                      defaultValue="0"
                      required
                      data-testid="input-total-occurrences"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wins_by_technique">Wins *</Label>
                    <Input
                      id="wins_by_technique"
                      name="wins_by_technique"
                      type="number"
                      min="0"
                      defaultValue="0"
                      required
                      data-testid="input-wins"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="medal_count">Medal Count</Label>
                    <Input
                      id="medal_count"
                      name="medal_count"
                      type="number"
                      min="0"
                      defaultValue="0"
                      data-testid="input-medal-count"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notable_athletes">Notable Athletes (comma-separated)</Label>
                  <Input
                    id="notable_athletes"
                    name="notable_athletes"
                    placeholder="Gordon Ryan, Lachlan Giles, Craig Jones"
                    data-testid="input-notable-athletes"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="trend_status">Trend Status</Label>
                  <Select name="trend_status" defaultValue="stable">
                    <SelectTrigger data-testid="select-trend-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hot">Hot</SelectItem>
                      <SelectItem value="rising">Rising</SelectItem>
                      <SelectItem value="stable">Stable</SelectItem>
                      <SelectItem value="cooling">Cooling</SelectItem>
                      <SelectItem value="declining">Declining</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    placeholder="Additional context about this technique's usage..."
                    data-testid="textarea-notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddCompetitionDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={addCompetitionMutation.isPending}
                  data-testid="button-save-competition"
                >
                  {addCompetitionMutation.isPending ? "Saving..." : "Add Entry"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
