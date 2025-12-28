import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminApiRequest } from "@/lib/adminApi";
import { Plus, Pencil, Trash2, TrendingUp, Award, Star } from "lucide-react";

type FeaturedInstructor = {
  id: string;
  instructorId: string;
  instructorName?: string;
  featureLevel: string;
  searchPriorityPercentage: number;
  recommendationBoostPercentage: number;
  showBadge: boolean;
  showNameCallout: boolean;
  customCalloutText: string | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  partnershipType: string | null;
  partnershipAgreement: string | null;
  socialPostCompleted: boolean;
  socialPostDate: string | null;
  linkInBioUntil: string | null;
  totalRecommendations: number;
  totalVideoViews: number;
  monthlyRecommendationCount: number;
  partnershipNotes: string | null;
  createdAt: string;
};

type Instructor = {
  id: string;
  name: string;
  tier: number;
};

export default function Partnerships() {
  const { toast } = useToast();
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingPartnership, setEditingPartnership] = useState<FeaturedInstructor | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [partnershipToDelete, setPartnershipToDelete] = useState<string | null>(null);

  // Fetch partnerships
  const { data: partnerships = [], isLoading } = useQuery<FeaturedInstructor[]>({
    queryKey: ["/api/admin/partnerships", filterLevel, filterActive],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterLevel !== "all") params.append("feature_level", filterLevel);
      if (filterActive !== "all") params.append("is_active", filterActive);
      
      return adminApiRequest(`/api/admin/partnerships?${params}`);
    },
  });

  // Fetch instructors for dropdown
  const { data: instructors = [] } = useQuery<Instructor[]>({
    queryKey: ["/api/admin/instructors/all"],
    queryFn: async () => {
      const data = await adminApiRequest("/api/admin/instructors");
      return data.instructors || [];
    },
  });

  // Fetch stats
  const { data: stats } = useQuery<{
    total: number;
    active: number;
    primaryCount: number;
    socialPostsCompleted: number;
  }>({
    queryKey: ["/api/admin/partnerships/stats"],
    queryFn: () => adminApiRequest("/api/admin/partnerships/stats"),
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingPartnership) {
        return adminApiRequest(`/api/admin/partnerships/${editingPartnership.id}`, "PATCH", data);
      }
      return adminApiRequest("/api/admin/partnerships", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partnerships"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partnerships/stats"] });
      setShowDialog(false);
      setEditingPartnership(null);
      toast({
        title: editingPartnership ? "Partnership updated" : "Partnership created",
        description: "Changes saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save partnership",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApiRequest(`/api/admin/partnerships/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partnerships"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partnerships/stats"] });
      setShowDeleteDialog(false);
      setPartnershipToDelete(null);
      toast({
        title: "Partnership deleted",
        description: "Partnership removed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete partnership",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      instructor_id: formData.get("instructor_id") as string,
      feature_level: formData.get("feature_level") as string,
      search_priority_percentage: parseInt(formData.get("search_priority_percentage") as string),
      recommendation_boost_percentage: parseInt(formData.get("recommendation_boost_percentage") as string),
      show_badge: formData.get("show_badge") === "on",
      show_name_callout: formData.get("show_name_callout") === "on",
      custom_callout_text: formData.get("custom_callout_text") as string || null,
      start_date: formData.get("start_date") as string,
      end_date: formData.get("end_date") as string || null,
      is_active: formData.get("is_active") === "on",
      partnership_type: formData.get("partnership_type") as string || null,
      partnership_agreement: formData.get("partnership_agreement") as string || null,
      social_post_completed: formData.get("social_post_completed") === "on",
      social_post_date: formData.get("social_post_date") as string || null,
      link_in_bio_until: formData.get("link_in_bio_until") as string || null,
      partnership_notes: formData.get("partnership_notes") as string || null,
    };

    saveMutation.mutate(data);
  };

  const filteredPartnerships = partnerships.filter((p) => {
    if (searchTerm && !p.instructorName?.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

  const getFeatureLevelBadge = (level: string) => {
    const config = {
      primary: { variant: "default" as const, icon: Star, label: "Primary" },
      secondary: { variant: "secondary" as const, icon: Award, label: "Secondary" },
      spotlight: { variant: "outline" as const, icon: TrendingUp, label: "Spotlight" },
    };
    const { variant, icon: Icon, label } = config[level as keyof typeof config] || config.secondary;
    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Instructor Partnerships</h1>
          <p className="text-muted-foreground mt-1">
            Manage featured instructor partnerships and promotional agreements
          </p>
        </div>
        <Button 
          onClick={() => {
            setEditingPartnership(null);
            setShowDialog(true);
          }}
          data-testid="button-create-partnership"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Partnership
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Partnerships</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total">{stats.total || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Partnerships</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-active">{stats.active || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Primary Features</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-primary">{stats.primaryCount || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Social Posts</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-social">{stats.socialPostsCompleted || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <Label>Search</Label>
            <Input
              placeholder="Search instructor name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <div className="w-48">
            <Label>Feature Level</Label>
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger data-testid="select-filter-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
                <SelectItem value="spotlight">Spotlight</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <Label>Status</Label>
            <Select value={filterActive} onValueChange={setFilterActive}>
              <SelectTrigger data-testid="select-filter-active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Partnerships Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instructor</TableHead>
                <TableHead>Feature Level</TableHead>
                <TableHead>Search Boost</TableHead>
                <TableHead>Rec. Boost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Partnership Type</TableHead>
                <TableHead>Social Post</TableHead>
                <TableHead>Recommendations</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">Loading...</TableCell>
                </TableRow>
              ) : filteredPartnerships.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">No partnerships found</TableCell>
                </TableRow>
              ) : (
                filteredPartnerships.map((partnership) => (
                  <TableRow key={partnership.id} data-testid={`row-partnership-${partnership.id}`}>
                    <TableCell className="font-medium">{partnership.instructorName || "Unknown"}</TableCell>
                    <TableCell>{getFeatureLevelBadge(partnership.featureLevel)}</TableCell>
                    <TableCell>{partnership.searchPriorityPercentage}%</TableCell>
                    <TableCell>{partnership.recommendationBoostPercentage}%</TableCell>
                    <TableCell>
                      <Badge variant={partnership.isActive ? "default" : "secondary"}>
                        {partnership.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {partnership.partnershipType ? (
                        <Badge variant="outline">{partnership.partnershipType}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {partnership.socialPostCompleted ? (
                        <Badge variant="default">✓ Done</Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>{partnership.totalRecommendations.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingPartnership(partnership);
                            setShowDialog(true);
                          }}
                          data-testid={`button-edit-${partnership.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setPartnershipToDelete(partnership.id);
                            setShowDeleteDialog(true);
                          }}
                          data-testid={`button-delete-${partnership.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingPartnership ? "Edit Partnership" : "Create Partnership"}
              </DialogTitle>
              <DialogDescription>
                Configure featured instructor partnership settings
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              {/* Instructor Selection */}
              <div className="grid gap-2">
                <Label htmlFor="instructor_id">Instructor *</Label>
                <Select
                  name="instructor_id"
                  defaultValue={editingPartnership?.instructorId}
                  required
                  disabled={!!editingPartnership}
                >
                  <SelectTrigger data-testid="input-instructor">
                    <SelectValue placeholder="Select instructor" />
                  </SelectTrigger>
                  <SelectContent>
                    {instructors.map((instructor) => (
                      <SelectItem key={instructor.id} value={instructor.id}>
                        {instructor.name} (Tier {instructor.tier})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Feature Settings */}
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="feature_level">Feature Level *</Label>
                  <Select
                    name="feature_level"
                    defaultValue={editingPartnership?.featureLevel || "secondary"}
                    required
                  >
                    <SelectTrigger data-testid="input-feature-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">Primary</SelectItem>
                      <SelectItem value="secondary">Secondary</SelectItem>
                      <SelectItem value="spotlight">Spotlight</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="search_priority_percentage">Search Priority %</Label>
                  <Input
                    id="search_priority_percentage"
                    name="search_priority_percentage"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={editingPartnership?.searchPriorityPercentage || 10}
                    required
                    data-testid="input-search-priority"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="recommendation_boost_percentage">Rec. Boost %</Label>
                  <Input
                    id="recommendation_boost_percentage"
                    name="recommendation_boost_percentage"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={editingPartnership?.recommendationBoostPercentage || 30}
                    required
                    data-testid="input-recommendation-boost"
                  />
                </div>
              </div>

              {/* Display Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show_badge"
                    name="show_badge"
                    defaultChecked={editingPartnership?.showBadge ?? true}
                    data-testid="input-show-badge"
                  />
                  <Label htmlFor="show_badge">Show Badge</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show_name_callout"
                    name="show_name_callout"
                    defaultChecked={editingPartnership?.showNameCallout ?? true}
                    data-testid="input-show-callout"
                  />
                  <Label htmlFor="show_name_callout">Show Name Callout</Label>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="custom_callout_text">Custom Callout Text</Label>
                <Input
                  id="custom_callout_text"
                  name="custom_callout_text"
                  placeholder="e.g., 'Your instructor' or 'Elite competitor'"
                  defaultValue={editingPartnership?.customCalloutText || ""}
                  data-testid="input-callout-text"
                />
              </div>

              {/* Duration */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    name="start_date"
                    type="date"
                    defaultValue={editingPartnership?.startDate || new Date().toISOString().split('T')[0]}
                    required
                    data-testid="input-start-date"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end_date">End Date (optional)</Label>
                  <Input
                    id="end_date"
                    name="end_date"
                    type="date"
                    defaultValue={editingPartnership?.endDate || ""}
                    data-testid="input-end-date"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  name="is_active"
                  defaultChecked={editingPartnership?.isActive ?? true}
                  data-testid="input-is-active"
                />
                <Label htmlFor="is_active">Active</Label>
              </div>

              {/* Partnership Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="partnership_type">Partnership Type</Label>
                  <Select
                    name="partnership_type"
                    defaultValue={editingPartnership?.partnershipType || ""}
                  >
                    <SelectTrigger data-testid="input-partnership-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      <SelectItem value="co_founder">Co-Founder</SelectItem>
                      <SelectItem value="promotional">Promotional</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="social_post_date">Social Post Date</Label>
                  <Input
                    id="social_post_date"
                    name="social_post_date"
                    type="date"
                    defaultValue={editingPartnership?.socialPostDate || ""}
                    data-testid="input-social-post-date"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="social_post_completed"
                    name="social_post_completed"
                    defaultChecked={editingPartnership?.socialPostCompleted || false}
                    data-testid="input-social-completed"
                  />
                  <Label htmlFor="social_post_completed">Social Post Completed</Label>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="link_in_bio_until">Link in Bio Until</Label>
                  <Input
                    id="link_in_bio_until"
                    name="link_in_bio_until"
                    type="date"
                    defaultValue={editingPartnership?.linkInBioUntil || ""}
                    data-testid="input-link-bio-until"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="partnership_agreement">Partnership Agreement</Label>
                <Textarea
                  id="partnership_agreement"
                  name="partnership_agreement"
                  placeholder="Partnership agreement details..."
                  defaultValue={editingPartnership?.partnershipAgreement || ""}
                  data-testid="input-agreement"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="partnership_notes">Notes</Label>
                <Textarea
                  id="partnership_notes"
                  name="partnership_notes"
                  placeholder="Additional notes..."
                  defaultValue={editingPartnership?.partnershipNotes || ""}
                  data-testid="input-notes"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDialog(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save">
                {saveMutation.isPending ? "Saving..." : "Save Partnership"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Partnership</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this partnership? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => partnershipToDelete && deleteMutation.mutate(partnershipToDelete)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </AdminLayout>
  );
}
