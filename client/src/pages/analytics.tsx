import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, CheckCircle2, XCircle, Clock } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AnalyticsSummary {
  period: string;
  total: number;
  delivered: number;
  failed: number;
  queued: number;
  successRate: number;
}

interface TrendData {
  date: string;
  delivered: number;
  failed: number;
  total: number;
}

interface ScheduleAnalytics {
  scheduleId: string;
  scheduleName: string;
  total: number;
  delivered: number;
  failed: number;
  successRate: number;
}

export default function Analytics() {
  const [timeRange, setTimeRange] = useState("7");

  const { data: summary, isLoading: summaryLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/analytics/summary", timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/summary?days=${timeRange}`);
      return response.json();
    },
  });

  const { data: trends, isLoading: trendsLoading } = useQuery<TrendData[]>({
    queryKey: ["/api/analytics/trends", timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/trends?days=${timeRange}`);
      return response.json();
    },
  });

  const { data: scheduleAnalytics, isLoading: scheduleLoading } = useQuery<ScheduleAnalytics[]>({
    queryKey: ["/api/analytics/by-schedule", timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/by-schedule?days=${timeRange}`);
      return response.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Delivery performance and insights
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]" data-testid="select-time-range">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-sent">{summary.total}</div>
              <p className="text-xs text-muted-foreground">
                In the last {timeRange} days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-delivered">{summary.delivered}</div>
              <p className="text-xs text-muted-foreground">
                {summary.total > 0 ? Math.round((summary.delivered / summary.total) * 100) : 0}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600" data-testid="text-failed">{summary.failed}</div>
              <p className="text-xs text-muted-foreground">
                {summary.total > 0 ? Math.round((summary.failed / summary.total) * 100) : 0}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-success-rate">{summary.successRate}%</div>
              <p className="text-xs text-muted-foreground">
                Delivery success rate
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Delivery Trends</CardTitle>
        </CardHeader>
        <CardContent>
          {trendsLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : trends && trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis className="text-xs" />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="delivered" 
                  stroke="hsl(142, 76%, 36%)" 
                  strokeWidth={2}
                  name="Delivered"
                />
                <Line 
                  type="monotone" 
                  dataKey="failed" 
                  stroke="hsl(0, 84%, 60%)" 
                  strokeWidth={2}
                  name="Failed"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              No delivery data available for the selected period
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {scheduleLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : scheduleAnalytics && scheduleAnalytics.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={scheduleAnalytics}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="scheduleName" 
                  className="text-xs"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
                <Legend />
                <Bar dataKey="delivered" fill="hsl(142, 76%, 36%)" name="Delivered" />
                <Bar dataKey="failed" fill="hsl(0, 84%, 60%)" name="Failed" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              No schedule data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule Table */}
      {scheduleAnalytics && scheduleAnalytics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Schedule Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {scheduleAnalytics.map((schedule) => (
                <div 
                  key={schedule.scheduleId} 
                  className="flex items-center justify-between border-b pb-3 last:border-0"
                  data-testid={`schedule-analytics-${schedule.scheduleId}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{schedule.scheduleName}</p>
                    <p className="text-sm text-muted-foreground">
                      {schedule.total} total messages
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">
                        {schedule.delivered} delivered
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {schedule.successRate}% success
                      </p>
                    </div>
                    {schedule.failed > 0 && (
                      <div className="text-right">
                        <p className="text-sm font-medium text-red-600">
                          {schedule.failed} failed
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
