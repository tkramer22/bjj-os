import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function AIMonitoring() {
  const { data: metrics } = useQuery({
    queryKey: ["/api/admin/ai-metrics"],
  });

  const { data: instructors } = useQuery({
    queryKey: ["/api/admin/instructor-performance"],
  });

  const { data: alerts } = useQuery({
    queryKey: ["/api/admin/ai-alerts"],
  });

  const dailyMetrics = (metrics as any)?.[0] || {};
  const instructorPerf = (instructors as any) || [];
  const alertData = (alerts as any) || {};

  const skipRateHigh = parseFloat(dailyMetrics.skipRatePercentage || '0') > 15;
  const badRateHigh = parseFloat(dailyMetrics.badRatePercentage || '0') > 5;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-monitoring-title">AI Performance Monitoring</h1>
        <p className="text-muted-foreground">Real-time AI curator performance metrics and quality control</p>
      </div>

      {/* Alert Section */}
      {alertData.alerts && alertData.alerts.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alertData.alerts.map((alert: string, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  <span data-testid={`text-alert-${idx}`}>{alert}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Videos Analyzed Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-videos-analyzed">
              {dailyMetrics.videosAnalyzed || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dailyMetrics.videosScoring70Plus || 0} scored 70+
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Quality Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-quality">
              {parseFloat(dailyMetrics.avgQualityScore || '0').toFixed(1)}/100
            </div>
            <p className="text-xs text-muted-foreground mt-1">World-class threshold: 70+</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Skip Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold flex items-center gap-2 ${skipRateHigh ? 'text-destructive' : 'text-green-600'}`}>
              {parseFloat(dailyMetrics.skipRatePercentage || '0').toFixed(1)}%
              {skipRateHigh ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-skip-rate">
              Target: &lt;15%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">BAD Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold flex items-center gap-2 ${badRateHigh ? 'text-destructive' : 'text-green-600'}`}>
              {parseFloat(dailyMetrics.badRatePercentage || '0').toFixed(1)}%
              {badRateHigh ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-bad-rate">
              Target: &lt;5%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Videos Sent Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-videos-sent">
              {dailyMetrics.videosSent || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Failed Analyses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-failed-analyses">
              {dailyMetrics.failedAnalyses || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Duplicate Violations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-duplicate-violations">
              {dailyMetrics.duplicateViolations || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Instructor */}
      {dailyMetrics.topPerformingInstructor && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Top Performing Instructor Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold" data-testid="text-top-instructor">
              {dailyMetrics.topPerformingInstructor}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructor Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Instructor Performance Tracking</CardTitle>
          <CardDescription>Aggregate feedback across all users</CardDescription>
        </CardHeader>
        <CardContent>
          {instructorPerf.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No instructor data yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Videos Sent</TableHead>
                  <TableHead>Skip Rate</TableHead>
                  <TableHead>BAD Rate</TableHead>
                  <TableHead>Credibility Adj</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instructorPerf.map((inst: any) => {
                  const skipRate = parseFloat(inst.skipRatePercentage || '0');
                  const badRate = parseFloat(inst.badRatePercentage || '0');
                  const adj = inst.credibilityAdjustment || 0;

                  return (
                    <TableRow key={inst.id} data-testid={`row-instructor-${inst.instructorName}`}>
                      <TableCell className="font-medium">{inst.instructorName}</TableCell>
                      <TableCell>{inst.videosSentTotal}</TableCell>
                      <TableCell>
                        <Badge variant={skipRate > 20 ? "destructive" : "secondary"}>
                          {skipRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={badRate > 10 ? "destructive" : "secondary"}>
                          {badRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={adj > 0 ? 'text-green-600' : adj < 0 ? 'text-destructive' : ''}>
                          {adj > 0 ? '+' : ''}{adj}
                        </span>
                      </TableCell>
                      <TableCell>
                        {skipRate > 20 || badRate > 10 ? (
                          <Badge variant="destructive">⚠️ Underperforming</Badge>
                        ) : (
                          <Badge variant="default">✅ Good</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
