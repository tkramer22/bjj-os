import { useQuery } from "@tanstack/react-query";
import { adminApiRequest } from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  MessageSquare, 
  Video, 
  Clock, 
  ThumbsUp, 
  ThumbsDown,
  TrendingUp,
  Activity,
  Zap,
  AlertCircle
} from "lucide-react";
import { useEffect, useState } from "react";

interface Activity24hData {
  userActivity: {
    totalQueries: number;
    uniqueUsers: number;
    newSignups: number;
    returningUsers: number;
  };
  engagement: {
    videosClicked: number;
    videosWatched: number;
    avgWatchDuration: number;
    completionRate: number;
  };
  contentPerformance: {
    mostRecommendedVideos: Array<{
      videoId: string;
      title: string;
      instructor: string;
      recommendCount: number;
    }>;
  };
  systemHealth: {
    totalQueries: number;
    multiAgentQueries: number;
    basicQueries: number;
    multiAgentPercentage: number;
    avgResponseTime: number;
    errorRate: number;
  };
  userFeedback: {
    thumbsUp: number;
    thumbsDown: number;
    satisfactionRate: number;
    totalFeedback: number;
  };
  recentActivity: Array<{
    timestamp: string;
    userAnonymized: string;
    question: string;
    videosRecommended: number;
    multiAgent: boolean;
    responseTime: number | null;
  }>;
}

export function ActivityDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch activity data with auto-refresh
  const { data, isLoading, isError, error, refetch } = useQuery<Activity24hData>({
    queryKey: ['/api/admin/activity-24h'],
    queryFn: async () => {
      return await adminApiRequest<Activity24hData>('/api/admin/activity-24h', 'GET');
    },
    refetchInterval: autoRefresh ? 60000 : false, // Auto-refresh every 60 seconds
  });

  // Manual refresh on mount
  useEffect(() => {
    refetch();
  }, [refetch]);

  if (isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to Load Activity Data</h3>
          <p className="text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'Unknown error occurred'}
          </p>
          <Button onClick={() => refetch()} variant="outline">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">📊 Last 24 Hours Activity</h2>
          <Badge variant="secondary">Loading...</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-muted rounded w-24"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-16"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No activity data available</p>
        </CardContent>
      </Card>
    );
  }

  const MetricCard = ({ 
    title, 
    value, 
    icon: Icon, 
    trend, 
    subtitle 
  }: { 
    title: string; 
    value: string | number; 
    icon: any; 
    trend?: { value: number; isPositive: boolean }; 
    subtitle?: string;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {trend && (
          <div className={`flex items-center text-xs mt-1 ${trend.isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-activity-dashboard-title">📊 Last 24 Hours Activity</h2>
          <p className="text-muted-foreground text-sm">Real-time monitoring for beta launch</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge 
            variant={autoRefresh ? "default" : "secondary"}
            className="cursor-pointer"
            onClick={() => setAutoRefresh(!autoRefresh)}
            data-testid="badge-auto-refresh"
          >
            {autoRefresh ? '🔄 Auto-refresh ON' : '⏸️ Auto-refresh OFF'}
          </Badge>
          <Badge variant="outline" data-testid="badge-last-updated">
            Updated {new Date().toLocaleTimeString()}
          </Badge>
        </div>
      </div>

      {/* USER ACTIVITY */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Users className="w-5 h-5" />
          User Activity
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Queries"
            value={data.userActivity.totalQueries}
            icon={MessageSquare}
            subtitle="Questions asked"
          />
          <MetricCard
            title="Unique Users"
            value={data.userActivity.uniqueUsers}
            icon={Users}
            subtitle="Active users"
          />
          <MetricCard
            title="New Signups"
            value={data.userActivity.newSignups}
            icon={TrendingUp}
            subtitle="First-time users"
          />
          <MetricCard
            title="Returning Users"
            value={data.userActivity.returningUsers}
            icon={Activity}
            subtitle="Came back"
          />
        </div>
      </div>

      {/* ENGAGEMENT METRICS */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Video className="w-5 h-5" />
          Engagement
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Videos Clicked"
            value={data.engagement.videosClicked}
            icon={Video}
            subtitle="Recommendations clicked"
          />
          <MetricCard
            title="Videos Watched"
            value={data.engagement.videosWatched}
            icon={Video}
            subtitle=">30 seconds"
          />
          <MetricCard
            title="Avg Watch Time"
            value={`${data.engagement.avgWatchDuration}s`}
            icon={Clock}
            subtitle="Per video"
          />
          <MetricCard
            title="Completion Rate"
            value={`${data.engagement.completionRate}%`}
            icon={TrendingUp}
            subtitle="Clicked → Watched"
          />
        </div>
      </div>

      {/* SYSTEM HEALTH & FEEDBACK */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            System Health
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              title="Multi-Agent"
              value={`${data.systemHealth.multiAgentPercentage}%`}
              icon={Zap}
              subtitle={`${data.systemHealth.multiAgentQueries} queries`}
            />
            <MetricCard
              title="Avg Response"
              value={`${data.systemHealth.avgResponseTime}ms`}
              icon={Clock}
              subtitle="AI response time"
            />
            <MetricCard
              title="Error Rate"
              value={`${data.systemHealth.errorRate}%`}
              icon={AlertCircle}
              subtitle="Failed queries"
            />
            <MetricCard
              title="Basic Algorithm"
              value={data.systemHealth.basicQueries}
              icon={Activity}
              subtitle="Legacy queries"
            />
          </div>
        </div>

        {/* User Feedback */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <ThumbsUp className="w-5 h-5" />
            User Feedback
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              title="Satisfaction"
              value={`${data.userFeedback.satisfactionRate}%`}
              icon={ThumbsUp}
              subtitle={`${data.userFeedback.totalFeedback} ratings`}
            />
            <MetricCard
              title="Thumbs Up"
              value={data.userFeedback.thumbsUp}
              icon={ThumbsUp}
              subtitle="Positive feedback"
            />
            <MetricCard
              title="Thumbs Down"
              value={data.userFeedback.thumbsDown}
              icon={ThumbsDown}
              subtitle="Negative feedback"
            />
            <MetricCard
              title="Total Feedback"
              value={data.userFeedback.totalFeedback}
              icon={MessageSquare}
              subtitle="All ratings"
            />
          </div>
        </div>
      </div>

      {/* MOST RECOMMENDED VIDEOS */}
      {data.contentPerformance.mostRecommendedVideos.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">🏆 Most Recommended Videos (Top 5)</h3>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {data.contentPerformance.mostRecommendedVideos.map((video, idx) => (
                  <div key={video.videoId} className="p-4 flex items-center justify-between hover-elevate">
                    <div className="flex items-center gap-3 flex-1">
                      <Badge variant="secondary" className="font-bold">
                        #{idx + 1}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{video.title}</p>
                        <p className="text-sm text-muted-foreground">{video.instructor}</p>
                      </div>
                    </div>
                    <Badge variant="default">
                      {video.recommendCount} recommendations
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* RECENT ACTIVITY LOG */}
      <div>
        <h3 className="text-lg font-semibold mb-3">📋 Recent Activity (Last 20 Queries)</h3>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="text-left text-sm">
                    <th className="p-3 font-medium">Time</th>
                    <th className="p-3 font-medium">User</th>
                    <th className="p-3 font-medium">Question</th>
                    <th className="p-3 font-medium text-center">Videos</th>
                    <th className="p-3 font-medium text-center">System</th>
                    <th className="p-3 font-medium text-center">Response</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.recentActivity.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        No recent activity
                      </td>
                    </tr>
                  ) : (
                    data.recentActivity.map((activity, idx) => (
                      <tr key={idx} className="hover-elevate">
                        <td className="p-3 text-sm">
                          {new Date(activity.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3 text-sm font-mono">
                          {activity.userAnonymized}
                        </td>
                        <td className="p-3 text-sm max-w-md truncate" title={activity.question}>
                          {activity.question}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="secondary">{activity.videosRecommended}</Badge>
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant={activity.multiAgent ? "default" : "outline"}>
                            {activity.multiAgent ? "🤖 Multi" : "Basic"}
                          </Badge>
                        </td>
                        <td className="p-3 text-center text-sm">
                          {activity.responseTime ? `${activity.responseTime}ms` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
