import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Video, Activity, Gift, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";

interface ActivityStats {
  timeRange: string;
  newUsers: number;
  curation: {
    totalVideos: number;
    videosAnalyzed: number;
    videosApproved: number;
    videosRejected: number;
    approvalRate: number;
  };
  engagement: {
    profQueries: number;
    videosSaved: number;
    activeUsers: number;
  };
  referrals: {
    newReferrals: number;
    uniqueReferrers: number;
  };
}

interface ActivityEvent {
  id: number;
  event_type: string;
  description: string;
  created_at: string;
  metadata: any;
}

interface ActivityMetrics {
  curationPerformance: any[];
  topVideos: any[];
  userGrowth: any[];
  referralPerformance: any[];
}

export default function ActivityDashboard() {
  const [timeRange, setTimeRange] = useState<string>("24");

  // Fetch 24-hour summary stats (auto-refresh every 30 seconds)
  const { data: statsData, isLoading: statsLoading, error: statsError } = useQuery<{ success: boolean; stats: ActivityStats }>({
    queryKey: [`/api/admin/activity/stats?hours=${timeRange}`],
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false, // Pause when tab not visible
  });

  // Fetch activity feed (auto-refresh every 30 seconds)
  const { data: feedData, isLoading: feedLoading, error: feedError } = useQuery<{ success: boolean; feed: ActivityEvent[] }>({
    queryKey: ["/api/admin/activity/feed?limit=100"],
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false, // Pause when tab not visible
  });

  // Fetch detailed metrics (auto-refresh every 30 seconds)
  const { data: metricsData, isLoading: metricsLoading, error: metricsError } = useQuery<{ success: boolean; metrics: ActivityMetrics }>({
    queryKey: [`/api/admin/activity/metrics?hours=${timeRange}`],
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false, // Pause when tab not visible
  });

  const stats = statsData?.stats;
  const feed = feedData?.feed || [];
  const metrics = metricsData?.metrics;

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'user_signup':
        return '🟢';
      case 'video_approved':
        return '🎥';
      case 'video_rejected':
        return '❌';
      case 'prof_query':
        return '💬';
      case 'video_recommended':
        return '📺';
      case 'video_saved':
        return '💾';
      case 'referral':
        return '🎁';
      case 'lifetime_access':
        return '✅';
      default:
        return '📌';
    }
  };

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (current < previous) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Activity Dashboard</h1>
          <p className="text-muted-foreground">System health and activity monitoring</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={timeRange === "1" ? "default" : "outline"}
            onClick={() => setTimeRange("1")}
            data-testid="button-filter-1h"
          >
            Last Hour
          </Button>
          <Button
            variant={timeRange === "6" ? "default" : "outline"}
            onClick={() => setTimeRange("6")}
            data-testid="button-filter-6h"
          >
            6 Hours
          </Button>
          <Button
            variant={timeRange === "24" ? "default" : "outline"}
            onClick={() => setTimeRange("24")}
            data-testid="button-filter-24h"
          >
            24 Hours
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {(statsError || feedError || metricsError) && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {statsError && "Failed to load stats. "}
              {feedError && "Failed to load activity feed. "}
              {metricsError && "Failed to load metrics. "}
              Please refresh the page.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 24-Hour Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* New Users Card */}
        <Card data-testid="card-new-users">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-new-users-count">
              {statsLoading ? "..." : stats?.newUsers || 0}
            </div>
            <p className="text-xs text-muted-foreground">Last {timeRange} hours</p>
          </CardContent>
        </Card>

        {/* Video Curation Card */}
        <Card data-testid="card-video-curation">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">📹 Video Curation</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-muted-foreground">Total Videos</div>
                <div className="text-2xl font-bold" data-testid="text-total-videos">
                  {statsLoading ? "..." : stats?.curation?.totalVideos || 0}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">TODAY'S ACTIVITY:</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">• Videos Saved:</span>
                    <span className="font-mono text-green-600" data-testid="text-videos-saved">
                      {stats?.curation?.videosApproved || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">• Videos Searched:</span>
                    <span className="font-mono" data-testid="text-videos-searched">
                      {stats?.curation?.videosAnalyzed || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">• Videos Rejected:</span>
                    <span className="font-mono text-red-600" data-testid="text-videos-rejected">
                      {stats?.curation?.videosRejected || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Engagement Card */}
        <Card data-testid="card-engagement">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Engagement</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-users">
              {statsLoading ? "..." : stats?.engagement?.activeUsers || 0}
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground mt-1">
              <span>💬 {stats?.engagement?.profQueries || 0} queries</span>
              <span>💾 {stats?.engagement?.videosSaved || 0} saves</span>
            </div>
          </CardContent>
        </Card>

        {/* Referrals Card */}
        <Card data-testid="card-referrals">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Referrals</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-new-referrals">
              {statsLoading ? "..." : stats?.referrals?.newReferrals || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              From {stats?.referrals?.uniqueReferrers || 0} referrers
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <Card className="lg:col-span-2" data-testid="card-activity-feed">
          <CardHeader>
            <CardTitle>Live Activity Feed</CardTitle>
            <CardDescription>Recent system events and user actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {feedLoading ? (
                <p className="text-muted-foreground">Loading activity...</p>
              ) : feed.length === 0 ? (
                <p className="text-muted-foreground">No recent activity</p>
              ) : (
                feed.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-3 rounded-lg hover-elevate"
                    data-testid={`activity-event-${event.id}`}
                  >
                    <span className="text-2xl">{getEventIcon(event.event_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{event.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(event.created_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {event.event_type.replace('_', ' ')}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card data-testid="card-quick-stats">
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
            <CardDescription>System health indicators</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">Approval Rate</span>
                <span className="text-sm font-bold">{stats?.curation?.approvalRate || 0}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${stats?.curation?.approvalRate || 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">User Engagement</span>
                <span className="text-sm font-bold">
                  {stats?.engagement?.activeUsers || 0} active
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Avg {Math.round((stats?.engagement?.profQueries || 0) / Math.max(stats?.engagement?.activeUsers || 1, 1))} queries/user
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">Video Library</span>
                <span className="text-sm font-bold">Growing</span>
              </div>
              <p className="text-xs text-muted-foreground">
                +{stats?.curation?.videosApproved || 0} videos today
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Video Curation Performance */}
        <Card data-testid="card-curation-performance">
          <CardHeader>
            <CardTitle>Curation Performance</CardTitle>
            <CardDescription>Success rates by search query</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metricsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : !metrics?.curationPerformance || metrics.curationPerformance.length === 0 ? (
                <p className="text-muted-foreground">No curation data available</p>
              ) : (
                metrics.curationPerformance.slice(0, 5).map((item: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium truncate">{item.search_query}</span>
                      <Badge variant={parseFloat(item.success_rate) >= 30 ? "default" : "secondary"}>
                        {item.success_rate}%
                      </Badge>
                    </div>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>Found: {item.videos_found}</span>
                      <span className="text-green-600">✓ {item.approved}</span>
                      <span className="text-red-600">✗ {item.rejected}</span>
                      <span>Avg: {item.avg_score}/10</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Performing Videos */}
        <Card data-testid="card-top-videos">
          <CardHeader>
            <CardTitle>Top Performing Videos</CardTitle>
            <CardDescription>Most saved and recommended</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metricsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : !metrics?.topVideos || metrics.topVideos.length === 0 ? (
                <p className="text-muted-foreground">No video data available</p>
              ) : (
                metrics.topVideos.slice(0, 5).map((video: any, idx: number) => (
                  <div key={video.id} className="flex items-start gap-3">
                    <Badge variant="outline" className="text-xs">#{idx + 1}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{video.technique_name}</p>
                      <p className="text-xs text-muted-foreground">{video.instructor_name}</p>
                      <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                        <span>💾 {video.times_saved} saves</span>
                        <span>👍 {video.helpful_count} helpful</span>
                        <span>⭐ {video.quality_score}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* User Growth by Hour */}
        <Card data-testid="card-user-growth">
          <CardHeader>
            <CardTitle>User Growth Trend</CardTitle>
            <CardDescription>Signups by hour</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metricsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : !metrics?.userGrowth || metrics.userGrowth.length === 0 ? (
                <p className="text-muted-foreground">No growth data available</p>
              ) : (
                metrics.userGrowth.slice(0, 8).map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-sm font-medium w-16">
                      {Math.floor(parseFloat(item.hour))}:00
                    </span>
                    <div className="flex-1 bg-secondary rounded-full h-6 overflow-hidden">
                      <div
                        className="bg-primary h-full flex items-center px-2"
                        style={{
                          width: `${Math.min(100, (parseInt(item.new_users) / Math.max(...metrics.userGrowth.map((g: any) => parseInt(g.new_users)))) * 100)}%`
                        }}
                      >
                        <span className="text-xs font-medium text-primary-foreground">
                          {item.new_users}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Referral Performance */}
        <Card data-testid="card-referral-performance">
          <CardHeader>
            <CardTitle>Top Referrers</CardTitle>
            <CardDescription>Highest conversion rates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metricsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : !metrics?.referralPerformance || metrics.referralPerformance.length === 0 ? (
                <p className="text-muted-foreground">No referral data available</p>
              ) : (
                metrics.referralPerformance.slice(0, 5).map((referral: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">{referral.referral_code}</span>
                      <Badge variant="default">{referral.conversion_rate}% conversion</Badge>
                    </div>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>👤 {referral.referrer_phone}</span>
                      <span>🎁 {referral.new_signups} referrals</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
