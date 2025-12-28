import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Search, Mail, AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw, Send, TrendingUp, MailWarning, MailCheck, MailX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface EmailLog {
  id: string;
  recipientEmail: string;
  emailType: string;
  subject: string;
  status: string;
  resendId: string | null;
  errorMessage: string | null;
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  metadata: Record<string, any> | null;
}

interface EmailStats {
  sentToday: number;
  total: number;
  delivered: number;
  failed: number;
  bounced: number;
  deliveryRate: string;
}

export default function AdminEmailsDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sendEmailTo, setSendEmailTo] = useState("");
  const { toast } = useToast();

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/admin/login", { password });
      return res.json();
    },
    onSuccess: () => {
      setIsAuthenticated(true);
      toast({ title: "Login successful" });
    },
    onError: () => {
      toast({ title: "Invalid password", variant: "destructive" });
    },
  });

  // Fetch email stats
  const { data: stats, isLoading: statsLoading } = useQuery<EmailStats>({
    queryKey: ["/api/admin/email-stats"],
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  // Fetch email logs with filters
  const { data: logsData, isLoading: logsLoading } = useQuery<{ logs: EmailLog[]; total: number }>({
    queryKey: ["/api/admin/email-logs", { search: searchQuery, type: typeFilter, status: statusFilter }],
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  // Fetch problem emails/users
  const { data: problems } = useQuery<{ unverifiedUsers: any[]; problemEmails: EmailLog[] }>({
    queryKey: ["/api/admin/email-problems"],
    enabled: isAuthenticated,
    refetchInterval: 60000,
  });

  // Resend email mutation
  const resendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/email-logs/${id}/resend`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-stats"] });
      toast({ title: "Email resent successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to resend email", description: error.message, variant: "destructive" });
    },
  });

  // Send verification email mutation
  const sendVerificationMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/admin/email/send-verification", { email });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-stats"] });
      toast({ 
        title: "Verification email sent", 
        description: `Code: ${data.code}` 
      });
      setSendEmailTo("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to send email", description: error.message, variant: "destructive" });
    },
  });

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
            <CardDescription>Enter admin password to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); loginMutation.mutate(password); }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  data-testid="input-admin-password"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loginMutation.isPending}
                data-testid="button-admin-login"
              >
                {loginMutation.isPending ? "Logging in..." : "Login"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Sent</Badge>;
      case 'delivered':
        return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" /> Delivered</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
      case 'bounced':
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Bounced</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      verification: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      welcome: 'bg-green-500/20 text-green-400 border-green-500/30',
      lifetime_access: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      lifetime_invite: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    };
    return (
      <Badge variant="outline" className={colors[type] || ''}>
        {type.replace(/_/g, ' ')}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-email-admin-title">Email Tracking Dashboard</h1>
            <p className="text-muted-foreground">Monitor email delivery and debug issues</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button data-testid="button-send-test-email">
                <Send className="h-4 w-4 mr-2" />
                Send Test Email
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send Verification Email</DialogTitle>
                <DialogDescription>
                  Send a verification email to any address for testing
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={sendEmailTo}
                    onChange={(e) => setSendEmailTo(e.target.value)}
                    placeholder="test@example.com"
                    data-testid="input-test-email"
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button 
                  onClick={() => sendVerificationMutation.mutate(sendEmailTo)}
                  disabled={!sendEmailTo || sendVerificationMutation.isPending}
                  data-testid="button-confirm-send"
                >
                  {sendVerificationMutation.isPending ? "Sending..." : "Send Email"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Sent Today</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-sent-today">
                {stats?.sentToday || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.total || 0} total emails tracked
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500" data-testid="text-delivery-rate">
                {stats?.deliveryRate || 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.delivered || 0} delivered
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <MailX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500" data-testid="text-failed-count">
                {stats?.failed || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Need attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Bounced</CardTitle>
              <MailWarning className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500" data-testid="text-bounced-count">
                {stats?.bounced || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Invalid addresses
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue="logs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="logs" data-testid="tab-logs">All Emails</TabsTrigger>
            <TabsTrigger value="problems" data-testid="tab-problems">
              Problems
              {((problems?.problemEmails?.length || 0) + (problems?.unverifiedUsers?.length || 0)) > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {(problems?.problemEmails?.length || 0) + (problems?.unverifiedUsers?.length || 0)}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="search">Search Email</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="search"
                        placeholder="Search by email address..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8"
                        data-testid="input-search-email"
                      />
                    </div>
                  </div>
                  <div className="w-[150px]">
                    <Label>Email Type</Label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger data-testid="select-type-filter">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="verification">Verification</SelectItem>
                        <SelectItem value="welcome">Welcome</SelectItem>
                        <SelectItem value="lifetime_access">Lifetime Access</SelectItem>
                        <SelectItem value="lifetime_invite">Lifetime Invite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[150px]">
                    <Label>Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger data-testid="select-status-filter">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="bounced">Bounced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSearchQuery("");
                      setTypeFilter("all");
                      setStatusFilter("all");
                    }}
                    data-testid="button-clear-filters"
                  >
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Email Logs Table */}
            <Card>
              <CardHeader>
                <CardTitle>Email Logs</CardTitle>
                <CardDescription>
                  {logsData?.total || 0} total emails found
                </CardDescription>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : logsData?.logs?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No emails found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logsData?.logs?.map((log) => (
                        <TableRow key={log.id} data-testid={`row-email-${log.id}`}>
                          <TableCell className="font-medium">{log.recipientEmail}</TableCell>
                          <TableCell>{getTypeBadge(log.emailType)}</TableCell>
                          <TableCell>{getStatusBadge(log.status)}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={log.subject}>
                            {log.subject}
                          </TableCell>
                          <TableCell>
                            {log.sentAt ? format(new Date(log.sentAt), 'MMM d, h:mm a') : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => resendMutation.mutate(log.id)}
                                disabled={resendMutation.isPending}
                                data-testid={`button-resend-${log.id}`}
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Resend
                              </Button>
                              {log.errorMessage && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="destructive">
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      Error
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Error Details</DialogTitle>
                                    </DialogHeader>
                                    <div className="p-4 bg-red-500/10 rounded-lg text-sm">
                                      <code>{log.errorMessage}</code>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="problems" className="space-y-4">
            {/* Problem Emails */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MailX className="h-5 w-5 text-red-500" />
                  Failed & Bounced Emails
                </CardTitle>
                <CardDescription>
                  Emails that need attention or resending
                </CardDescription>
              </CardHeader>
              <CardContent>
                {problems?.problemEmails?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
                    <MailCheck className="h-8 w-8 text-green-500" />
                    <p>No problem emails - all deliveries successful!</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {problems?.problemEmails?.map((log) => (
                        <TableRow key={log.id} data-testid={`row-problem-${log.id}`}>
                          <TableCell className="font-medium">{log.recipientEmail}</TableCell>
                          <TableCell>{getTypeBadge(log.emailType)}</TableCell>
                          <TableCell>{getStatusBadge(log.status)}</TableCell>
                          <TableCell className="max-w-[250px] truncate text-red-400">
                            {log.errorMessage || 'Bounced'}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resendMutation.mutate(log.id)}
                              disabled={resendMutation.isPending}
                              data-testid={`button-resend-problem-${log.id}`}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Retry
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Unverified Users */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Unverified Users (24h+)
                </CardTitle>
                <CardDescription>
                  Users who signed up but never verified their email
                </CardDescription>
              </CardHeader>
              <CardContent>
                {problems?.unverifiedUsers?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
                    <CheckCircle className="h-8 w-8 text-green-500" />
                    <p>All recent users have verified their emails!</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Signed Up</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {problems?.unverifiedUsers?.map((user) => (
                        <TableRow key={user.id} data-testid={`row-unverified-${user.id}`}>
                          <TableCell className="font-medium">{user.email}</TableCell>
                          <TableCell>
                            {user.createdAt ? format(new Date(user.createdAt), 'MMM d, h:mm a') : '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => sendVerificationMutation.mutate(user.email)}
                              disabled={sendVerificationMutation.isPending}
                              data-testid={`button-resend-verification-${user.id}`}
                            >
                              <Send className="h-3 w-3 mr-1" />
                              Send Verification
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
