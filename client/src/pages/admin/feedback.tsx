import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ThumbsUp, 
  ThumbsDown, 
  AlertTriangle, 
  Trophy, 
  Trash2,
  CheckCircle,
  XCircle,
  TrendingUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminApiRequest } from "@/lib/adminApi";
import { VideoPlayer } from "@/components/VideoPlayer";

export default function AdminFeedback() {
  const { toast } = useToast();
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [showPlayer, setShowPlayer] = useState(false);

  // Fetch feedback stats
  const { data: stats } = useQuery<{
    totalFeedback: number;
    avgHelpfulRatio: number;
    videosRemoved: number;
    topTierVideos: number;
  }>({
    queryKey: ['/api/admin/feedback/stats'],
    queryFn: () => adminApiRequest('/api/admin/feedback/stats'),
  });

  // Fetch flagged videos
  const { data: flaggedVideos = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/feedback/flagged'],
    queryFn: () => adminApiRequest('/api/admin/feedback/flagged'),
  });

  // Fetch top tier videos
  const { data: topTierVideos = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/feedback/top-tier'],
    queryFn: () => adminApiRequest('/api/admin/feedback/top-tier'),
  });

  // Remove video mutation
  const removeVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      return adminApiRequest(`/api/admin/feedback/remove-video/${videoId}`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/feedback/flagged'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/feedback/stats'] });
      toast({
        title: "Video removed",
        description: "Video has been removed from the library",
      });
    },
  });

  // Approve video mutation
  const approveVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      return adminApiRequest(`/api/admin/feedback/approve-video/${videoId}`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/feedback/flagged'] });
      toast({
        title: "Video approved",
        description: "Video has been approved and returned to active status",
      });
    },
  });

  const handlePlayVideo = (video: any) => {
    setSelectedVideo(video);
    setShowPlayer(true);
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Feedback Analytics</h1>
        <p className="text-muted-foreground">
          Monitor user feedback and manage video quality
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-feedback">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Feedback</CardTitle>
            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalFeedback || 0}</div>
            <p className="text-xs text-muted-foreground">
              All time user feedback
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-helpful-ratio">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Helpful Ratio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.avgHelpfulRatio ? `${Math.round(stats.avgHelpfulRatio * 100)}%` : '0%'}
            </div>
            <p className="text-xs text-muted-foreground">
              Videos with 50+ votes
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-videos-removed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Videos Removed</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.videosRemoved || 0}</div>
            <p className="text-xs text-muted-foreground">
              Due to quality issues
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-top-tier">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Tier Videos</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.topTierVideos || 0}</div>
            <p className="text-xs text-muted-foreground">
              85%+ helpful, 100+ votes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Flagged and Top Tier Videos */}
      <Tabs defaultValue="flagged" className="space-y-4">
        <TabsList>
          <TabsTrigger value="flagged" data-testid="tab-flagged">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Flagged Videos ({flaggedVideos.length})
          </TabsTrigger>
          <TabsTrigger value="top-tier" data-testid="tab-top-tier">
            <Trophy className="h-4 w-4 mr-2" />
            Top Tier ({topTierVideos.length})
          </TabsTrigger>
        </TabsList>

        {/* Flagged Videos Tab */}
        <TabsContent value="flagged">
          <Card>
            <CardHeader>
              <CardTitle>Flagged for Review</CardTitle>
              <CardDescription>
                Videos with context issues (wrong recommendation, too advanced/basic) - Review and take action
              </CardDescription>
            </CardHeader>
            <CardContent>
              {flaggedVideos.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No flagged videos - all content looks good!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {flaggedVideos.map((video: any) => (
                    <div 
                      key={video.id} 
                      className="flex items-start gap-4 p-4 border rounded-lg"
                      data-testid={`flagged-video-${video.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold">{video.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {video.instructor} • {video.technique_name}
                            </p>
                          </div>
                          <Badge variant="outline" className="ml-2">
                            {Math.round((video.helpful_ratio || 0) * 100)}% helpful
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="h-3 w-3" />
                            {video.total_votes || 0} votes
                          </span>
                          <span>Quality: {video.quality_score || 0}/10</span>
                        </div>

                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handlePlayVideo(video)}
                            data-testid={`button-play-${video.id}`}
                          >
                            Play Video
                          </Button>
                          <Button 
                            size="sm" 
                            variant="default"
                            onClick={() => approveVideoMutation.mutate(video.id)}
                            disabled={approveVideoMutation.isPending}
                            data-testid={`button-approve-${video.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => {
                              if (confirm(`Remove "${video.title}" from library?`)) {
                                removeVideoMutation.mutate(video.id);
                              }
                            }}
                            disabled={removeVideoMutation.isPending}
                            data-testid={`button-remove-${video.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Tier Videos Tab */}
        <TabsContent value="top-tier">
          <Card>
            <CardHeader>
              <CardTitle>Top Tier Videos</CardTitle>
              <CardDescription>
                Highest quality content (85%+ helpful ratio, 100+ votes)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topTierVideos.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No top tier videos yet - need 100+ votes and 85%+ helpful ratio</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {topTierVideos.map((video: any) => (
                    <div 
                      key={video.id} 
                      className="flex items-start gap-4 p-4 border rounded-lg bg-accent/10"
                      data-testid={`top-tier-video-${video.id}`}
                    >
                      <Trophy className="h-6 w-6 text-primary mt-1" />
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold">{video.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {video.instructor} • {video.technique_name}
                            </p>
                          </div>
                          <Badge variant="default" className="ml-2">
                            {Math.round((video.helpful_ratio || 0) * 100)}% helpful
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="h-3 w-3" />
                            {video.total_votes || 0} votes
                          </span>
                          <span>Quality: {video.quality_score || 0}/10</span>
                        </div>

                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handlePlayVideo(video)}
                          data-testid={`button-play-top-${video.id}`}
                        >
                          Play Video
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Video Player Modal */}
      {showPlayer && selectedVideo && (
        <VideoPlayer
          videoId={selectedVideo.youtube_video_id}
          startTime={selectedVideo.key_detail_timestamp}
          title={selectedVideo.title || selectedVideo.technique_name}
          instructor={selectedVideo.instructor}
          onClose={() => {
            setShowPlayer(false);
            setSelectedVideo(null);
          }}
        />
      )}
      </div>
    </AdminLayout>
  );
}
