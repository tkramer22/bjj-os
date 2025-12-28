import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Video, Star, TrendingUp, CheckCircle, XCircle, Eye, ThumbsUp, Bookmark, Play } from "lucide-react";
import { format } from "date-fns";
import { adminApiRequest } from "@/lib/adminApi";

export default function AdminTechniques() {
  const [searchQuery, setSearchQuery] = useState("");
  const [instructorFilter, setInstructorFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [scoreFilter, setScoreFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedVideo, setSelectedVideo] = useState<any>(null);

  // Fetch techniques/videos
  const { data: techniquesData, isLoading } = useQuery({
    queryKey: ['/api/admin/techniques', { instructorFilter, categoryFilter, scoreFilter, statusFilter }],
    queryFn: () => adminApiRequest(`/api/admin/techniques?instructor=${instructorFilter}&category=${categoryFilter}&score=${scoreFilter}&status=${statusFilter}`),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['/api/admin/techniques/stats'],
    queryFn: () => adminApiRequest('/api/admin/techniques/stats'),
  });

  // Fetch unique instructors for filter
  const { data: instructorsData } = useQuery({
    queryKey: ['/api/admin/techniques/instructors'],
    queryFn: () => adminApiRequest('/api/admin/techniques/instructors'),
  });

  const filteredTechniques = techniquesData?.techniques?.filter((technique: any) => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      technique.title?.toLowerCase().includes(search) ||
      technique.instructorName?.toLowerCase().includes(search) ||
      technique.position?.toLowerCase().includes(search)
    );
  }) || [];

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 70) return "secondary";
    return "destructive";
  };

  const getStatusBadgeVariant = (status: string) => {
    if (status === 'analyzed') return "default";
    if (status === 'pending') return "secondary";
    return "destructive";
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Techniques & Videos</h1>
            <p className="text-muted-foreground mt-1">Browse and manage analyzed BJJ technique videos</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-total-videos">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Videos</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total">{stats?.total || 0}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-avg-score">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
              <Star className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-avg-score">{stats?.avgScore?.toFixed(1) || 0}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-top-instructors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Instructors</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-instructors">{stats?.uniqueInstructors || 0}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-analyzed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Analyzed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-analyzed">{stats?.analyzed || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search techniques, instructors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>

            <Select value={instructorFilter} onValueChange={setInstructorFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-instructor">
                <SelectValue placeholder="All instructors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Instructors</SelectItem>
                {instructorsData?.instructors?.map((instructor: string) => (
                  <SelectItem key={instructor} value={instructor}>{instructor}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="submission">Submission</SelectItem>
                <SelectItem value="sweep">Sweep</SelectItem>
                <SelectItem value="pass">Pass</SelectItem>
                <SelectItem value="escape">Escape</SelectItem>
                <SelectItem value="takedown">Takedown</SelectItem>
              </SelectContent>
            </Select>

            <Select value={scoreFilter} onValueChange={setScoreFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-score">
                <SelectValue placeholder="Score range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scores</SelectItem>
                <SelectItem value="80+">80+ (Elite)</SelectItem>
                <SelectItem value="70-79">70-79 (Good)</SelectItem>
                <SelectItem value="60-69">60-69 (Fair)</SelectItem>
                <SelectItem value="0-59">Below 60</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="analyzed">Analyzed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Techniques Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Techniques</CardTitle>
            <CardDescription>View analyzed videos with detailed scoring</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : filteredTechniques.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No techniques found matching your filters.
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="max-w-[250px]">Title</TableHead>
                      <TableHead>Instructor</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Teaching</TableHead>
                      <TableHead>Production</TableHead>
                      <TableHead>Detail</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Helpful</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTechniques.map((technique: any) => {
                      const qualityScore = Number(technique.finalScore || 0);
                      const teachingScore = Number(technique.teachingClarity || 0);
                      const productionScore = Number(technique.productionQuality || 0);
                      const detailScore = Number(technique.keyDetailQuality || 0);
                      const views = technique.viewCount || 0;
                      const helpfulRatio = technique.helpfulRatio || 0;

                      return (
                        <TableRow key={technique.id} data-testid={`row-technique-${technique.id}`}>
                          <TableCell className="max-w-[250px] truncate font-medium">
                            {technique.title}
                          </TableCell>
                          <TableCell className="text-sm">{technique.instructorName || 'Unknown'}</TableCell>
                          <TableCell>
                            <Badge variant={getScoreBadgeVariant(qualityScore * 10)} data-testid={`badge-score-${technique.id}`}>
                              {qualityScore.toFixed(1)}/10
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {teachingScore > 0 ? teachingScore.toFixed(1) : '-'}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {productionScore > 0 ? productionScore.toFixed(1) : '-'}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {detailScore > 0 ? detailScore.toFixed(1) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {views > 0 ? views.toLocaleString() : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {helpfulRatio > 0 ? (
                              <span className="text-green-600">{helpfulRatio}%</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {technique.createdAt ? format(new Date(technique.createdAt), 'MMM dd') : 'N/A'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedVideo(technique)}
                              data-testid={`button-view-${technique.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Video Detail Dialog */}
        <Dialog open={!!selectedVideo} onOpenChange={(open) => !open && setSelectedVideo(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Technique Analysis Details</DialogTitle>
              <DialogDescription>{selectedVideo?.title}</DialogDescription>
            </DialogHeader>

            {selectedVideo && (
              <div className="space-y-4">
                {/* Video embed */}
                <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${selectedVideo.videoId}`}
                    title={selectedVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                {/* Quality Scores */}
                <div>
                  <h4 className="font-semibold mb-3">Quality Analysis</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                        <CardTitle className="text-sm font-medium">Overall</CardTitle>
                        <Star className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{Number(selectedVideo.finalScore || 0).toFixed(1)}/10</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                        <CardTitle className="text-sm font-medium">Teaching</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {Number(selectedVideo.teachingClarity || 0) > 0 
                            ? Number(selectedVideo.teachingClarity).toFixed(1) 
                            : '-'}/10
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                        <CardTitle className="text-sm font-medium">Production</CardTitle>
                        <Video className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {Number(selectedVideo.productionQuality || 0) > 0 
                            ? Number(selectedVideo.productionQuality).toFixed(1) 
                            : '-'}/10
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                        <CardTitle className="text-sm font-medium">Detail</CardTitle>
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {Number(selectedVideo.keyDetailQuality || 0) > 0 
                            ? Number(selectedVideo.keyDetailQuality).toFixed(1) 
                            : '-'}/10
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Engagement Metrics */}
                <div>
                  <h4 className="font-semibold mb-3">User Engagement</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                        <CardTitle className="text-sm font-medium">Views</CardTitle>
                        <Play className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {selectedVideo.viewCount > 0 
                            ? selectedVideo.viewCount.toLocaleString() 
                            : '-'}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                        <CardTitle className="text-sm font-medium">Helpful</CardTitle>
                        <ThumbsUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                          {selectedVideo.helpfulRatio > 0 
                            ? `${selectedVideo.helpfulRatio}%`
                            : '-'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedVideo.helpfulCount || 0} helpful votes
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                        <CardTitle className="text-sm font-medium">Likes</CardTitle>
                        <ThumbsUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {selectedVideo.likeCount > 0 
                            ? selectedVideo.likeCount.toLocaleString() 
                            : '-'}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                        <CardTitle className="text-sm font-medium">Bookmarks</CardTitle>
                        <Bookmark className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {selectedVideo.recommendationCount > 0 
                            ? selectedVideo.recommendationCount 
                            : '-'}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Additional details */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Instructor:</span>
                    <span className="font-medium">{selectedVideo.instructorName || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Position:</span>
                    <span className="font-medium capitalize">{selectedVideo.position || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Technique Type:</span>
                    <span className="font-medium capitalize">{selectedVideo.techniqueType || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Belt Appropriate:</span>
                    <span className="font-medium capitalize">{selectedVideo.beltAppropriate || 'All'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Content Level:</span>
                    <span className="font-medium">{selectedVideo.contentLevel || 'N/A'}</span>
                  </div>
                </div>

                {/* Key Details */}
                {selectedVideo.keyDetails && (
                  <div>
                    <h4 className="font-semibold mb-2">Key Details:</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedVideo.keyDetails}</p>
                  </div>
                )}

                {/* Video link */}
                <Button asChild className="w-full">
                  <a href={selectedVideo.videoUrl} target="_blank" rel="noopener noreferrer">
                    Watch on YouTube
                  </a>
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
