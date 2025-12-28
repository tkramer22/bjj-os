import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { adminApiRequest } from "@/lib/adminApi";
import { AdminLayout } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Search, Star, Trophy, TrendingUp, Eye, Award, Edit, Sparkles, ShieldCheck, AlertCircle, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";

export default function AdminInstructors() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [showPromotionDialog, setShowPromotionDialog] = useState(false);
  const [selectedInstructor, setSelectedInstructor] = useState<any>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  
  // Promotion control state
  const [promotionData, setPromotionData] = useState({
    feature_level: 1,
    search_boost: 0,
    recommendation_boost: 0,
    homepage_featured: false,
    partnership_status: "regular",
  });

  // Fetch instructor stats
  const { data: stats } = useQuery({
    queryKey: ['/api/admin/instructors/stats'],
    queryFn: () => adminApiRequest('/api/admin/instructors/stats'),
  });

  // Fetch instructors with filters
  const { data: instructorsData, isLoading } = useQuery({
    queryKey: ['/api/admin/instructors', tierFilter, reviewFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tierFilter && tierFilter !== 'all') params.append('tier', tierFilter);
      if (reviewFilter === 'needs_review') params.append('needs_review', 'true');
      else if (reviewFilter === 'auto_discovered') params.append('auto_discovered', 'true');
      
      const url = `/api/admin/instructors?${params.toString()}`;
      return adminApiRequest(url);
    },
  });

  // Fetch balance report
  const { data: balanceReport } = useQuery({
    queryKey: ['/api/admin/instructors/balance-report'],
    queryFn: () => adminApiRequest('/api/admin/instructors/balance-report'),
  });

  // Update promotion controls mutation
  const updatePromotionMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!selectedInstructor) throw new Error('No instructor selected');
      return adminApiRequest(`/api/admin/instructors/${selectedInstructor.id}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/instructors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/instructors/stats'] });
      setShowPromotionDialog(false);
      toast({
        title: "Promotion updated",
        description: "Instructor promotion settings saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message,
      });
    },
  });

  // Review instructor mutation
  const reviewMutation = useMutation({
    mutationFn: async (data: { approved: boolean; notes: string; tier?: number }) => {
      if (!selectedInstructor) throw new Error('No instructor selected');
      return adminApiRequest(`/api/admin/instructors/${selectedInstructor.id}/review`, 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/instructors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/instructors/stats'] });
      setShowReviewDialog(false);
      toast({
        title: "Review completed",
        description: "Instructor review saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Review failed",
        description: error.message,
      });
    },
  });

  const handleOpenPromotionDialog = (instructor: any) => {
    setSelectedInstructor(instructor);
    setPromotionData({
      feature_level: instructor.featureLevel || instructor.feature_level || 1,
      search_boost: instructor.searchBoost || instructor.search_boost || 0,
      recommendation_boost: instructor.recommendationBoost || instructor.recommendation_boost || 0,
      homepage_featured: instructor.homepageFeatured || instructor.homepage_featured || false,
      partnership_status: instructor.partnershipStatus || instructor.partnership_status || "regular",
    });
    setShowPromotionDialog(true);
  };

  const handleSavePromotion = () => {
    updatePromotionMutation.mutate(promotionData);
  };

  const handleOpenReviewDialog = (instructor: any) => {
    setSelectedInstructor(instructor);
    setShowReviewDialog(true);
  };

  const handleApproveReview = (approved: boolean, notes: string, tier?: number) => {
    reviewMutation.mutate({ approved, notes, tier });
  };

  const instructors = instructorsData?.instructors || [];
  const balanceData = balanceReport?.instructors || [];

  const filteredInstructors = instructors.filter((i: any) => 
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  );

  const getTierBadge = (tier: number) => {
    const config: Record<number, { variant: any; label: string }> = {
      1: { variant: "default", label: "Tier 1 - Elite" },
      2: { variant: "secondary", label: "Tier 2 - Established" },
      3: { variant: "outline", label: "Tier 3 - Unknown" },
    };
    return config[tier] || config[3];
  };

  const getPartnershipBadge = (status: string) => {
    if (!status) return null;
    const config: Record<string, { variant: any; label: string; icon: any }> = {
      regular: { variant: "outline", label: "Regular", icon: null },
      affiliate: { variant: "secondary", label: "Affiliate", icon: Award },
      active_partner: { variant: "default", label: "Partner", icon: Star },
      featured_partner: { variant: "default", label: "Featured", icon: Sparkles },
      blacklisted: { variant: "destructive", label: "Blacklisted", icon: AlertCircle },
    };
    const { variant, label, icon: Icon } = config[status] || config.regular;
    return (
      <Badge variant={variant}>
        {Icon && <Icon className="w-3 h-3 mr-1" />}
        {label}
      </Badge>
    );
  };

  return (
    <AdminLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Instructor Management</h1>
            <p className="text-muted-foreground">Auto-discovery, promotion controls, and balanced curation</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Instructors</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total">{stats?.total || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Review</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-needs-review">{stats?.needsReview || stats?.needs_review || 0}</div>
              <p className="text-xs text-muted-foreground">Auto-discovered instructors</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Auto-Discovered</CardTitle>
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-auto-discovered">{stats?.autoDiscovered || stats?.auto_discovered || 0}</div>
              <p className="text-xs text-muted-foreground">Found during curation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Featured</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-featured">{stats?.featured || 0}</div>
              <p className="text-xs text-muted-foreground">Homepage featured</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">All Instructors</TabsTrigger>
            <TabsTrigger value="needs-review" data-testid="tab-needs-review">
              Needs Review {(stats?.needsReview || stats?.needs_review) > 0 && `(${stats?.needsReview || stats?.needs_review})`}
            </TabsTrigger>
            <TabsTrigger value="balance" data-testid="tab-balance">Balanced Curation</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search instructors..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>
                  <Select value={tierFilter} onValueChange={setTierFilter}>
                    <SelectTrigger data-testid="select-tier-filter">
                      <SelectValue placeholder="All Tiers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tiers</SelectItem>
                      <SelectItem value="1">Tier 1 - Elite</SelectItem>
                      <SelectItem value="2">Tier 2 - Established</SelectItem>
                      <SelectItem value="3">Tier 3 - Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={reviewFilter} onValueChange={setReviewFilter}>
                    <SelectTrigger data-testid="select-review-filter">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="needs_review">Needs Review</SelectItem>
                      <SelectItem value="auto_discovered">Auto-Discovered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Instructors Grid */}
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading instructors...</p>
              </div>
            ) : filteredInstructors.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <p className="text-muted-foreground">No instructors found</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredInstructors.map((instructor: any) => (
                  <Card key={instructor.id} className="hover-elevate" data-testid={`card-instructor-${instructor.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-lg">{instructor.name}</CardTitle>
                            {(instructor.autoDiscovered || instructor.auto_discovered) && (
                              <Badge variant="secondary" className="shrink-0">
                                <Sparkles className="w-3 h-3 mr-1" />
                                Auto
                              </Badge>
                            )}
                            {(instructor.needsAdminReview || instructor.needs_admin_review) && (
                              <Badge variant="destructive" className="shrink-0">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Review
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {getTierBadge(instructor.tier) && (
                              <Badge variant={getTierBadge(instructor.tier).variant}>
                                {getTierBadge(instructor.tier).label}
                              </Badge>
                            )}
                            {getPartnershipBadge(instructor.partnershipStatus || instructor.partnership_status)}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Auto-discovery info */}
                      {(instructor.autoDiscovered || instructor.auto_discovered) && (
                        <div className="p-2 bg-muted rounded-md text-sm">
                          <p className="font-medium">Discovery Info</p>
                          <p className="text-muted-foreground text-xs">
                            Source: {instructor.discoverySource || instructor.discovery_source || 'Unknown'}
                          </p>
                          {(instructor.autoTierAssignment || instructor.auto_tier_assignment) && (
                            <p className="text-muted-foreground text-xs">
                              AI Suggested: {instructor.autoTierAssignment || instructor.auto_tier_assignment}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Promotion stats */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Feature Level</p>
                          <p className="font-medium">{instructor.featureLevel || instructor.feature_level || 1}/5 ⭐</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Search Boost</p>
                          <p className="font-medium">{instructor.searchBoost || instructor.search_boost || 0}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Rec. Boost</p>
                          <p className="font-medium">{instructor.recommendationBoost || instructor.recommendation_boost || 0}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Homepage</p>
                          <p className="font-medium">{(instructor.homepageFeatured || instructor.homepage_featured) ? '✓' : '✗'}</p>
                        </div>
                      </div>

                      {/* Library stats */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Videos</p>
                          <p className="font-medium">{instructor.videosInLibrary || instructor.videos_in_library || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Recommendations</p>
                          <p className="font-medium">{instructor.totalRecommendations || instructor.total_recommendations || 0}</p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-2">
                        {(instructor.needsAdminReview || instructor.needs_admin_review) && (
                          <Button
                            size="sm"
                            variant="default"
                            className="flex-1"
                            onClick={() => handleOpenReviewDialog(instructor)}
                            data-testid={`button-review-${instructor.id}`}
                          >
                            <ShieldCheck className="w-4 h-4 mr-1" />
                            Review
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleOpenPromotionDialog(instructor)}
                          data-testid={`button-promote-${instructor.id}`}
                        >
                          <Settings className="w-4 h-4 mr-1" />
                          Promote
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="needs-review" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Instructors Pending Review</CardTitle>
                <CardDescription>
                  Auto-discovered instructors that need admin approval before being added to the library
                </CardDescription>
              </CardHeader>
              <CardContent>
                {instructors.filter((i: any) => i.needsAdminReview || i.needs_admin_review).length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No instructors pending review</p>
                ) : (
                  <div className="space-y-4">
                    {instructors.filter((i: any) => i.needsAdminReview || i.needs_admin_review).map((instructor: any) => (
                      <div key={instructor.id} className="p-4 border rounded-lg space-y-2" data-testid={`review-card-${instructor.id}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{instructor.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              Discovered via {instructor.discoverySource || instructor.discovery_source || 'Unknown'}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleOpenReviewDialog(instructor)}
                            data-testid={`button-review-${instructor.id}`}
                          >
                            <ShieldCheck className="w-4 h-4 mr-1" />
                            Review
                          </Button>
                        </div>
                        {(instructor.autoTierReason || instructor.auto_tier_reason) && (
                          <p className="text-sm bg-muted p-2 rounded">
                            <strong>AI Reasoning:</strong> {instructor.autoTierReason || instructor.auto_tier_reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="balance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Balanced Curation Report</CardTitle>
                <CardDescription>
                  Instructors sorted by representation ratio to ensure balanced recommendations across the library
                </CardDescription>
              </CardHeader>
              <CardContent>
                {balanceData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No balance data available</p>
                ) : (
                  <div className="space-y-2">
                    {balanceData.map((instructor: any) => {
                      const videosInLibrary = instructor.videosInLibrary || instructor.videos_in_library || 0;
                      const totalRecommendations = instructor.totalRecommendations || instructor.total_recommendations || 0;
                      const representationRatio = instructor.representationRatio || instructor.representation_ratio || 0;
                      
                      return (
                        <div key={instructor.id} className="flex items-center justify-between p-3 border rounded hover-elevate">
                          <div className="flex-1">
                            <p className="font-medium">{instructor.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Tier {instructor.tier} • {videosInLibrary} videos • {totalRecommendations} recommendations
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              Ratio: {representationRatio?.toFixed(2) || '0.00'}
                            </p>
                            <Badge variant={representationRatio < 1 ? "destructive" : representationRatio < 2 ? "secondary" : "default"}>
                              {representationRatio < 1 ? "Underrepresented" : representationRatio < 2 ? "Balanced" : "Overrepresented"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Promotion Controls Dialog */}
        <Dialog open={showPromotionDialog} onOpenChange={setShowPromotionDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Promotion Controls: {selectedInstructor?.name}</DialogTitle>
              <DialogDescription>
                Configure search boosts, recommendation priority, and homepage featuring
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Feature Level */}
              <div className="space-y-2">
                <Label>Feature Level (1-5 stars)</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[promotionData.feature_level]}
                    onValueChange={(value) => setPromotionData({ ...promotionData, feature_level: value[0] })}
                    min={1}
                    max={5}
                    step={1}
                    className="flex-1"
                    data-testid="slider-feature-level"
                  />
                  <span className="text-sm font-medium w-8">{promotionData.feature_level}/5</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Higher feature levels prioritize this instructor in recommendations
                </p>
              </div>

              {/* Search Boost */}
              <div className="space-y-2">
                <Label>Search Boost (0-100%)</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[promotionData.search_boost]}
                    onValueChange={(value) => setPromotionData({ ...promotionData, search_boost: value[0] })}
                    min={0}
                    max={100}
                    step={5}
                    className="flex-1"
                    data-testid="slider-search-boost"
                  />
                  <span className="text-sm font-medium w-12">{promotionData.search_boost}%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Percentage boost applied to search ranking scores
                </p>
              </div>

              {/* Recommendation Boost */}
              <div className="space-y-2">
                <Label>Recommendation Boost (0-100%)</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[promotionData.recommendation_boost]}
                    onValueChange={(value) => setPromotionData({ ...promotionData, recommendation_boost: value[0] })}
                    min={0}
                    max={100}
                    step={5}
                    className="flex-1"
                    data-testid="slider-recommendation-boost"
                  />
                  <span className="text-sm font-medium w-12">{promotionData.recommendation_boost}%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Percentage boost applied to recommendation algorithm
                </p>
              </div>

              {/* Homepage Featured */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="homepage_featured"
                  checked={promotionData.homepage_featured}
                  onCheckedChange={(checked) => setPromotionData({ ...promotionData, homepage_featured: checked as boolean })}
                  data-testid="checkbox-homepage-featured"
                />
                <Label htmlFor="homepage_featured" className="cursor-pointer">
                  Show in "Featured Instructors" section on homepage
                </Label>
              </div>

              {/* Partnership Status */}
              <div className="space-y-2">
                <Label>Partnership Status</Label>
                <Select
                  value={promotionData.partnership_status}
                  onValueChange={(value) => setPromotionData({ ...promotionData, partnership_status: value })}
                >
                  <SelectTrigger data-testid="select-partnership-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="affiliate">Affiliate</SelectItem>
                    <SelectItem value="active_partner">Active Partner</SelectItem>
                    <SelectItem value="featured_partner">Featured Partner</SelectItem>
                    <SelectItem value="blacklisted">Blacklisted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPromotionDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSavePromotion}
                disabled={updatePromotionMutation.isPending}
                data-testid="button-save-promotion"
              >
                {updatePromotionMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Review Dialog */}
        <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review Instructor: {selectedInstructor?.name}</DialogTitle>
              <DialogDescription>
                Approve or reject this auto-discovered instructor
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {(selectedInstructor?.autoTierAssignment || selectedInstructor?.auto_tier_assignment) && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">AI Suggested Tier</p>
                  <p className="text-sm">{selectedInstructor.autoTierAssignment || selectedInstructor.auto_tier_assignment}</p>
                  {(selectedInstructor.autoTierReason || selectedInstructor.auto_tier_reason) && (
                    <p className="text-xs text-muted-foreground mt-1">{selectedInstructor.autoTierReason || selectedInstructor.auto_tier_reason}</p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="review-notes">Review Notes</Label>
                <Textarea
                  id="review-notes"
                  placeholder="Add notes about this instructor..."
                  data-testid="textarea-review-notes"
                />
              </div>
              <div className="space-y-2">
                <Label>Assign Tier</Label>
                <Select defaultValue={selectedInstructor?.tier?.toString() || "2"}>
                  <SelectTrigger data-testid="select-review-tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Tier 1 - Elite</SelectItem>
                    <SelectItem value="2">Tier 2 - Established</SelectItem>
                    <SelectItem value="3">Tier 3 - Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const notes = (document.getElementById('review-notes') as HTMLTextAreaElement)?.value || '';
                  handleApproveReview(false, notes);
                }}
                data-testid="button-reject"
              >
                Reject
              </Button>
              <Button
                onClick={() => {
                  const notes = (document.getElementById('review-notes') as HTMLTextAreaElement)?.value || '';
                  const tierSelect = document.querySelector('[data-testid="select-review-tier"]');
                  const tier = parseInt((tierSelect as any)?.value || '2');
                  handleApproveReview(true, notes, tier);
                }}
                disabled={reviewMutation.isPending}
                data-testid="button-approve"
              >
                {reviewMutation.isPending ? "Approving..." : "Approve"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
