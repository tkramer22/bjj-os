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
import { Search, Download, MessageSquare, Clock, Zap, AlertCircle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { adminApiRequest } from "@/lib/adminApi";

export default function AdminLogs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>('7d');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Fetch AI conversation logs
  const { data: logsData, isLoading } = useQuery({
    queryKey: ['/api/admin/ai-logs', { dateFilter, statusFilter, modelFilter, page }],
    queryFn: () => adminApiRequest(`/api/admin/ai-logs?dateFilter=${dateFilter}&statusFilter=${statusFilter}&modelFilter=${modelFilter}&page=${page}&pageSize=${pageSize}`),
  });

  // Fetch summary stats
  const { data: stats } = useQuery({
    queryKey: ['/api/admin/ai-logs/stats'],
    queryFn: () => adminApiRequest('/api/admin/ai-logs/stats'),
  });

  const filteredLogs = logsData?.logs?.filter((log: any) => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      log.userMessage?.toLowerCase().includes(search) ||
      log.aiResponse?.toLowerCase().includes(search) ||
      log.userPhone?.toLowerCase().includes(search)
    );
  }) || [];

  const handleExportCSV = () => {
    const csvContent = [
      ['Timestamp', 'User', 'User Message', 'AI Response', 'Response Time (ms)', 'Tokens', 'Model', 'Status'].join(','),
      ...filteredLogs.map((log: any) => [
        format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        log.userPhone || log.userEmail || 'Unknown',
        `"${log.userMessage?.replace(/"/g, '""') || ''}"`,
        `"${log.aiResponse?.replace(/"/g, '""') || ''}"`,
        log.responseTimeMs || 0,
        log.tokensUsed || 0,
        log.model || 'Claude Sonnet 4',
        log.status || 'success',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">AI Conversation Logs</h1>
            <p className="text-muted-foreground mt-1">Monitor Prof. OS conversations and performance</p>
          </div>
          <Button onClick={handleExportCSV} variant="outline" data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-total-conversations">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total">{stats?.total || 0}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-avg-response-time">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-avg-time">{stats?.avgResponseTime || 0}ms</div>
            </CardContent>
          </Card>

          <Card data-testid="card-total-tokens">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tokens Used</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-tokens">{stats?.totalTokens?.toLocaleString() || 0}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-success-rate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-success-rate">{stats?.successRate || 0}%</div>
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
                  placeholder="Search messages, users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>

            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-date-filter">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-model-filter">
                <SelectValue placeholder="AI Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                <SelectItem value="claude-sonnet-4">Claude Sonnet 4</SelectItem>
                <SelectItem value="gpt-4o-fallback">GPT-4o (Fallback)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No logs found</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="max-w-[300px]">User Message</TableHead>
                      <TableHead className="max-w-[300px]">Prof. OS Response</TableHead>
                      <TableHead>AI Model</TableHead>
                      <TableHead>Complexity</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log: any) => (
                      <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                        <TableCell className="text-sm">
                          {format(new Date(log.timestamp), 'MMM dd, HH:mm:ss')}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.userPhone || log.userEmail || 'Unknown'}
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate text-sm">
                          {log.userMessage}
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate text-sm">
                          {log.aiResponse}
                        </TableCell>
                        <TableCell>
                          {log.modelUsed === 'claude-sonnet-4' ? (
                            <Badge variant="default" data-testid={`badge-model-${log.id}`}>
                              Claude S4
                            </Badge>
                          ) : log.modelUsed === 'gpt-4o-fallback' ? (
                            <Badge variant="secondary" data-testid={`badge-model-${log.id}`}>
                              GPT-4o (FB)
                            </Badge>
                          ) : (
                            <Badge variant="outline" data-testid={`badge-model-${log.id}`}>
                              GPT-4o
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.complexityScore !== null && log.complexityScore !== undefined ? (
                            <span className={log.complexityScore > 7 ? 'text-orange-500 font-semibold' : 'text-muted-foreground'}>
                              {log.complexityScore}/10
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.responseTimeMs ? `${log.responseTimeMs}ms` : '-'}
                        </TableCell>
                        <TableCell>
                          {log.status === 'error' ? (
                            <Badge variant="destructive" data-testid={`badge-status-${log.id}`}>
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Error
                            </Badge>
                          ) : (
                            <Badge variant="default" data-testid={`badge-status-${log.id}`}>
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Success
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {logsData?.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {logsData.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(logsData.totalPages, p + 1))}
                  disabled={page === logsData.totalPages}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
