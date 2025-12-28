import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Eye, Users, Globe, MapPin, RefreshCcw, Calendar, Smartphone, Monitor, Bot, Radio, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Stats {
  totalViews: number;
  uniqueVisitors: number;
  sessions: number;
}

interface TopPage {
  pagePath: string;
  views: number;
}

interface TrafficSource {
  source: string | null;
  views: number;
}

interface UsaState {
  stateCode: string | null;
  stateName: string | null;
  views: number;
  uniqueVisitors: number;
}

interface Country {
  countryCode: string | null;
  countryName: string | null;
  views: number;
  uniqueVisitors: number;
}

interface DeviceBreakdown {
  deviceType: string | null;
  views: number;
  uniqueVisitors: number;
}

type TimeRange = 'today' | '7d' | '30d' | 'all';

interface AnalyticsStats {
  range: TimeRange;
  liveVisitors: number;
  botCount: number;
  deviceBreakdown: DeviceBreakdown[];
  stats: Stats;
  topPages: TopPage[];
  sources: TrafficSource[];
  usaStates: UsaState[];
  countries: Country[];
}

interface RawVisitor {
  visitorId: string;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  isBot: boolean;
  location: string;
  firstSeen: string;
  lastSeen: string;
  pageViews: number;
  pages: string[];
}

interface RawPageView {
  id: number;
  pagePath: string;
  visitorId: string;
  deviceType: string | null;
  browser: string | null;
  userAgent: string | null;
  isBot: boolean;
  source: string | null;
  countryCode: string | null;
  stateCode: string | null;
  createdAt: string;
}

interface RawVisitorData {
  range: string;
  totalRawViews: number;
  uniqueVisitors: number;
  visitors: RawVisitor[];
  rawPageViews: RawPageView[];
}

export default function AdminAnalytics() {
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [countdown, setCountdown] = useState(30);
  const [showRawData, setShowRawData] = useState(false);
  
  const { data: stats, isLoading, refetch, dataUpdatedAt } = useQuery<AnalyticsStats>({
    queryKey: ["/api/analytics/stats", timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/stats?range=${timeRange}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    refetchInterval: 30000,
  });
  
  const { data: rawData, refetch: refetchRaw } = useQuery<RawVisitorData>({
    queryKey: ["/api/analytics/raw-visitors", timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/raw-visitors?range=${timeRange}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch raw data');
      return res.json();
    },
    enabled: showRawData,
    refetchInterval: 30000,
  });
  
  // Countdown timer for auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Reset countdown when data updates
  useEffect(() => {
    setCountdown(30);
  }, [dataUpdatedAt]);
  
  const handleRangeChange = (newRange: TimeRange) => {
    setTimeRange(newRange);
  };

  const handleManualRefresh = () => {
    refetch();
    if (showRawData) refetchRaw();
    setCountdown(30);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading || !stats) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-analytics-title">Website Analytics</h1>
              <p className="text-muted-foreground mt-1">Track visitor stats, geographic breakdown, and top pages</p>
            </div>
          </div>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading analytics...</div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header with Live Indicator */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-analytics-title">Website Analytics</h1>
            <p className="text-muted-foreground mt-1">Track visitor stats, geographic breakdown, and top pages</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Live Visitors Indicator */}
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 px-3 py-2 rounded-lg" data-testid="live-visitors-indicator">
              <div className="relative">
                <Radio className="w-4 h-4 text-green-500" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </div>
              <span className="text-green-500 font-semibold">{stats.liveVisitors} live</span>
            </div>
            
            {/* Countdown Timer */}
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm" data-testid="refresh-countdown">
              <Clock className="w-3.5 h-3.5" />
              <span>Refreshing in {countdown}s</span>
            </div>
            
            <Select value={timeRange} onValueChange={(v) => handleRangeChange(v as TimeRange)}>
              <SelectTrigger className="w-[160px]" data-testid="select-time-range">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today" data-testid="option-today">Today</SelectItem>
                <SelectItem value="7d" data-testid="option-7d">Last 7 Days</SelectItem>
                <SelectItem value="30d" data-testid="option-30d">Last 30 Days</SelectItem>
                <SelectItem value="all" data-testid="option-all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleManualRefresh}
              data-testid="button-refresh-analytics"
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Views</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-views">
                {stats?.stats?.totalViews ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {timeRange === 'today' && 'Page views in the last 24 hours'}
                {timeRange === '7d' && 'Page views in the last 7 days'}
                {timeRange === '30d' && 'Page views in the last 30 days'}
                {timeRange === 'all' && 'Total page views all time'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-unique-visitors">
                {stats?.stats?.uniqueVisitors ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Real humans (bots filtered)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sessions</CardTitle>
              <BarChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-sessions">
                {stats?.stats?.sessions ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Active browsing sessions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bots Filtered</CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500" data-testid="text-bot-count">
                {stats?.botCount ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Crawlers, scrapers, bots excluded
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Device Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Device Breakdown
            </CardTitle>
            <CardDescription>
              Mobile vs Desktop visitors (bots excluded)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.deviceBreakdown && stats.deviceBreakdown.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-3">
                {stats.deviceBreakdown.map((device, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 border rounded-lg" data-testid={`device-${device.deviceType || 'unknown'}`}>
                    {device.deviceType === 'mobile' ? (
                      <Smartphone className="w-8 h-8 text-blue-500" />
                    ) : device.deviceType === 'tablet' ? (
                      <Smartphone className="w-8 h-8 text-purple-500" />
                    ) : (
                      <Monitor className="w-8 h-8 text-green-500" />
                    )}
                    <div>
                      <p className="font-semibold capitalize">{device.deviceType || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">
                        {device.views} views ({device.uniqueVisitors} unique)
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                No device data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs for different data views */}
        <Tabs defaultValue="pages" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pages">Top Pages</TabsTrigger>
            <TabsTrigger value="sources">Traffic Sources</TabsTrigger>
            <TabsTrigger value="raw" onClick={() => setShowRawData(true)}>Raw Visitor Data</TabsTrigger>
          </TabsList>

          <TabsContent value="pages">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart className="w-5 h-5" />
                    Top Pages
                  </CardTitle>
                  <CardDescription>
                    Most visited pages (bots excluded)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.topPages && stats.topPages.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Page Path</TableHead>
                          <TableHead className="text-right">Views</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.topPages.map((page, idx) => (
                          <TableRow key={idx} data-testid={`row-top-page-${idx}`}>
                            <TableCell className="font-mono text-sm">{page.pagePath}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{page.views}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No page views recorded
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Traffic Sources
                  </CardTitle>
                  <CardDescription>
                    Where visitors came from
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.sources && stats.sources.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Views</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.sources.map((source, idx) => (
                          <TableRow key={idx} data-testid={`row-source-${idx}`}>
                            <TableCell>{source.source ?? 'Direct'}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{source.views}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No traffic source data
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sources">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    USA States Breakdown
                  </CardTitle>
                  <CardDescription>
                    Top 20 US states by visitor count
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.usaStates && stats.usaStates.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>State</TableHead>
                          <TableHead className="text-right">Views</TableHead>
                          <TableHead className="text-right">Visitors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.usaStates.map((state, idx) => (
                          <TableRow key={idx} data-testid={`row-state-${state.stateCode ?? idx}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono">
                                  {state.stateCode ?? 'Unknown'}
                                </Badge>
                                <span>{state.stateName ?? 'Unknown'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{state.views}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{state.uniqueVisitors}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No US state data available
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Countries Breakdown
                  </CardTitle>
                  <CardDescription>
                    Top 20 countries by visitor count
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.countries && stats.countries.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Country</TableHead>
                          <TableHead className="text-right">Views</TableHead>
                          <TableHead className="text-right">Visitors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.countries.map((country, idx) => (
                          <TableRow key={idx} data-testid={`row-country-${country.countryCode ?? idx}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono">
                                  {country.countryCode ?? 'Unknown'}
                                </Badge>
                                <span>{country.countryName ?? 'Unknown'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{country.views}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{country.uniqueVisitors}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No country data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="raw">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Raw Visitor Data
                </CardTitle>
                <CardDescription>
                  Detailed visitor information for verification ({rawData?.uniqueVisitors ?? 0} unique visitors today)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {rawData?.visitors && rawData.visitors.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Visitor ID</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Browser/OS</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Pages</TableHead>
                        <TableHead>First Seen</TableHead>
                        <TableHead>Last Seen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rawData.visitors.map((visitor, idx) => (
                        <TableRow key={idx} data-testid={`row-visitor-${idx}`}>
                          <TableCell className="font-mono text-xs">
                            {visitor.visitorId.slice(0, 8)}...
                          </TableCell>
                          <TableCell>
                            {visitor.deviceType === 'mobile' ? (
                              <Badge variant="outline" className="gap-1">
                                <Smartphone className="w-3 h-3" /> Mobile
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                <Monitor className="w-3 h-3" /> Desktop
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {visitor.browser || 'Unknown'} / {visitor.os || 'Unknown'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{visitor.location || 'Unknown'}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge>{visitor.pageViews} pages</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{formatTime(visitor.firstSeen)}</TableCell>
                          <TableCell className="text-sm">{formatTime(visitor.lastSeen)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {showRawData ? 'No visitor data for today' : 'Click to load raw visitor data'}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
