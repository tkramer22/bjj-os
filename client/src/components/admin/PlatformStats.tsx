import { useQuery } from "@tanstack/react-query";
import { Smartphone, Globe, RefreshCw, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlatformStatsData {
  overall: {
    total_ios_users: number;
    total_web_users: number;
    both_platforms: number;
    active_ios: number;
    active_web: number;
    iphone_users: number;
    ipad_users: number;
  };
  subscribers: {
    ios_subscribers: number;
    web_subscribers: number;
    ios_active: number;
    web_active: number;
  };
  recentActivity: Array<{
    platform: string;
    login_count: number;
    unique_users: number;
  }>;
  dailyActive: Array<{
    date: string;
    ios_dau: number;
    web_dau: number;
  }>;
  recentLogins: Array<{
    id: number;
    user_id: string;
    platform: string;
    created_at: string;
    email: string | null;
    display_name: string | null;
  }>;
}

export function PlatformStats() {
  const { data, isLoading, isError, refetch, error } = useQuery<{ success: boolean; data: PlatformStatsData }>({
    queryKey: ['/api/admin/platform-stats'],
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        Loading platform stats...
      </div>
    );
  }

  if (isError || !data?.success) {
    return (
      <div className="text-center py-6 space-y-3">
        <p className="text-destructive">Failed to load platform stats</p>
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Unknown error'}</p>
        <Button onClick={() => refetch()} variant="outline" size="sm" data-testid="button-retry-platform">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const stats = data.data;
  const overall = stats.overall;
  const subscribers = stats.subscribers;

  return (
    <div className="space-y-6" data-testid="platform-stats-container">
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <div className="bg-card rounded-lg border p-4 text-center" data-testid="card-ios-users">
          <div className="flex justify-center mb-2">
            <Smartphone className="w-8 h-8 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">iOS App Users</p>
          <p className="text-2xl font-bold" data-testid="value-ios-users">
            {Number(overall.total_ios_users) || 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1" data-testid="text-ios-breakdown">
            {Number(overall.iphone_users) || 0} iPhone, {Number(overall.ipad_users) || 0} iPad
          </p>
        </div>

        <div className="bg-card rounded-lg border p-4 text-center" data-testid="card-web-users">
          <div className="flex justify-center mb-2">
            <Globe className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Web Users</p>
          <p className="text-2xl font-bold" data-testid="value-web-users">
            {Number(overall.total_web_users) || 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Desktop & Mobile Web
          </p>
        </div>

        <div className="bg-card rounded-lg border p-4 text-center" data-testid="card-multi-platform">
          <div className="flex justify-center mb-2">
            <div className="flex">
              <Smartphone className="w-6 h-6 text-purple-500" />
              <Globe className="w-6 h-6 text-purple-500 -ml-1" />
            </div>
          </div>
          <p className="text-sm font-medium text-muted-foreground">Multi-Platform</p>
          <p className="text-2xl font-bold" data-testid="value-both-platforms">
            {Number(overall.both_platforms) || 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Use both iOS & Web
          </p>
        </div>

        <div className="bg-card rounded-lg border p-4 text-center" data-testid="card-last-login-platform">
          <div className="flex justify-center mb-2">
            <RefreshCw className="w-8 h-8 text-orange-500" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Last Login Platform</p>
          <div className="flex justify-center gap-4 mt-1">
            <div>
              <p className="text-lg font-bold text-blue-500" data-testid="value-last-ios">
                {Number(overall.active_ios) || 0}
              </p>
              <p className="text-xs text-muted-foreground">iOS</p>
            </div>
            <div>
              <p className="text-lg font-bold text-green-500" data-testid="value-last-web">
                {Number(overall.active_web) || 0}
              </p>
              <p className="text-xs text-muted-foreground">Web</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-4" data-testid="section-subscribers">
        <h4 className="font-medium mb-3" data-testid="heading-subscribers">Active Subscribers by Platform</h4>
        <div className="grid gap-4 grid-cols-2">
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-blue-500" />
            <div>
              <p className="font-medium">{Number(subscribers.ios_subscribers) || 0} iOS subscribers</p>
              <p className="text-sm text-muted-foreground">{Number(subscribers.ios_active) || 0} active now</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-green-500" />
            <div>
              <p className="font-medium">{Number(subscribers.web_subscribers) || 0} Web subscribers</p>
              <p className="text-sm text-muted-foreground">{Number(subscribers.web_active) || 0} active now</p>
            </div>
          </div>
        </div>
      </div>

      {stats.recentActivity && stats.recentActivity.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-4" data-testid="section-login-activity">
          <h4 className="font-medium mb-3" data-testid="heading-login-activity">Login Activity (Last 30 Days)</h4>
          <div className="space-y-2">
            {stats.recentActivity.map((activity, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0" data-testid={`row-activity-${i}`}>
                <div className="flex items-center gap-2">
                  {activity.platform.includes('ios') ? (
                    <Smartphone className="w-4 h-4 text-blue-500" />
                  ) : (
                    <Globe className="w-4 h-4 text-green-500" />
                  )}
                  <span className="text-sm font-medium capitalize" data-testid={`text-activity-platform-${i}`}>{activity.platform.replace('_', ' ')}</span>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span data-testid={`text-activity-logins-${i}`}>{Number(activity.login_count)} logins</span>
                  <span data-testid={`text-activity-users-${i}`}>{Number(activity.unique_users)} users</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.recentLogins && stats.recentLogins.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-4" data-testid="section-recent-logins">
          <h4 className="font-medium mb-3" data-testid="heading-recent-logins">Recent Logins</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {stats.recentLogins.slice(0, 10).map((login, i) => (
              <div key={login.id} className="flex items-center justify-between py-2 border-b border-border last:border-0" data-testid={`row-login-${i}`}>
                <div className="flex items-center gap-2">
                  {login.platform.includes('ios') ? (
                    <Smartphone className="w-4 h-4 text-blue-500" />
                  ) : (
                    <Globe className="w-4 h-4 text-green-500" />
                  )}
                  <span className="text-sm" data-testid={`text-login-user-${i}`}>{login.display_name || login.email || login.user_id.slice(0, 8) + '...'}</span>
                </div>
                <div className="text-xs text-muted-foreground" data-testid={`text-login-time-${i}`}>
                  {new Date(login.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
