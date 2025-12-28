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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, UserPlus, Crown, Ban, Eye, TrendingUp, Users, Activity, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

export default function AdminUsersDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
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

  // Fetch dashboard stats
  const { data: stats } = useQuery({
    queryKey: ["/api/admin/dashboard/stats"],
    enabled: isAuthenticated,
  });

  // Fetch users list
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated,
  });

  // Fetch referral redemptions
  const { data: redemptions } = useQuery({
    queryKey: ["/api/admin/referrals/redemptions"],
    enabled: isAuthenticated,
  });

  // Fetch admin actions log
  const { data: adminActions } = useQuery({
    queryKey: ["/api/admin/actions-log"],
    enabled: isAuthenticated,
  });

  // Fetch video curation batches
  const { data: curationBatches } = useQuery({
    queryKey: ["/api/admin/curation/batches"],
    enabled: isAuthenticated,
  });

  // Grant lifetime access mutation
  const grantLifetimeMutation = useMutation({
    mutationFn: async (data: { email: string; reason: string }) => {
      const res = await apiRequest("POST", "/api/admin/grant-lifetime-access", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Lifetime access granted successfully" });
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast({ title: "Error granting lifetime access", description: error.message, variant: "destructive" });
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
                <Label htmlFor="password" data-testid="label-password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  data-testid="input-password"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? "Logging in..." : "Login"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter users based on search query
  const filteredUsers = (users as any[])?.filter((user: any) => {
    const query = searchQuery.toLowerCase();
    return (
      user.email?.toLowerCase().includes(query) ||
      user.username?.toLowerCase().includes(query)
    );
  }) || [];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-admin-title">BJJ OS Admin Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive system management and monitoring</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-users">
                {stats?.stats?.users?.totalUsers || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                +{stats?.stats?.users?.newToday || 0} today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-subs">
                {stats?.stats?.subscriptions?.active || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.stats?.subscriptions?.trialing || 0} trialing
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Messages Today</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-ai-messages">
                {stats?.stats?.ai?.messagesToday || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.stats?.ai?.uniqueUsersToday || 0} unique users
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Video Library</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-video-library">
                {stats?.stats?.videoLibrary?.totalVideos || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Avg rating: {stats?.stats?.videoLibrary?.avgVideoRating?.toFixed(1) || 'N/A'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Interface */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" data-testid="tab-users">User Management</TabsTrigger>
            <TabsTrigger value="referrals" data-testid="tab-referrals">Referral Redemptions</TabsTrigger>
            <TabsTrigger value="curation" data-testid="tab-curation">Video Curation</TabsTrigger>
            <TabsTrigger value="logs" data-testid="tab-logs">Admin Actions</TabsTrigger>
          </TabsList>

          {/* User Management Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Manage users, grant lifetime access, and view user details</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search Bar */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by email, username, or phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                      data-testid="input-search-users"
                    />
                  </div>
                </div>

                {/* Users Table */}
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Belt Rank</TableHead>
                        <TableHead>Subscription</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center">Loading users...</TableCell>
                        </TableRow>
                      ) : filteredUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center">No users found</TableCell>
                        </TableRow>
                      ) : (
                        filteredUsers.map((user: any) => (
                          <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                            <TableCell className="font-medium">{user.email}</TableCell>
                            <TableCell>{user.username || '-'}</TableCell>
                            <TableCell>{user.beltRank || '-'}</TableCell>
                            <TableCell>
                              {user.hasLifetimeAccess ? (
                                <Badge variant="default">
                                  <Crown className="w-3 h-3 mr-1" />
                                  Lifetime
                                </Badge>
                              ) : user.subscriptionStatus === 'active' ? (
                                <Badge variant="default">Active</Badge>
                              ) : user.subscriptionStatus === 'trialing' ? (
                                <Badge variant="secondary">Trial</Badge>
                              ) : (
                                <Badge variant="outline">None</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {user.isActive ? (
                                <Badge variant="default">Active</Badge>
                              ) : (
                                <Badge variant="destructive">Inactive</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setSelectedUser(user)}
                                      data-testid={`button-view-${user.id}`}
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl">
                                    <DialogHeader>
                                      <DialogTitle>User Details</DialogTitle>
                                      <DialogDescription>View and manage user information</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <Label>Email</Label>
                                          <p className="text-sm text-muted-foreground">{selectedUser?.email}</p>
                                        </div>
                                        <div>
                                          <Label>Username</Label>
                                          <p className="text-sm text-muted-foreground">{selectedUser?.username || 'Not set'}</p>
                                        </div>
                                        <div>
                                          <Label>Belt Rank</Label>
                                          <p className="text-sm text-muted-foreground">{selectedUser?.beltRank || 'Not set'}</p>
                                        </div>
                                        <div>
                                          <Label>Total Sessions</Label>
                                          <p className="text-sm text-muted-foreground">{selectedUser?.totalSessions || 0}</p>
                                        </div>
                                        <div>
                                          <Label>Total Hours</Label>
                                          <p className="text-sm text-muted-foreground">{selectedUser?.totalHours || 0}</p>
                                        </div>
                                      </div>

                                      {!selectedUser?.hasLifetimeAccess && (
                                        <div className="space-y-2">
                                          <Label>Grant Lifetime Access</Label>
                                          <form
                                            onSubmit={(e) => {
                                              e.preventDefault();
                                              const formData = new FormData(e.currentTarget);
                                              const reason = formData.get('reason') as string;
                                              grantLifetimeMutation.mutate({
                                                email: selectedUser.email,
                                                reason,
                                              });
                                            }}
                                            className="space-y-2"
                                          >
                                            <Textarea
                                              name="reason"
                                              placeholder="Reason for granting lifetime access..."
                                              required
                                              data-testid="input-lifetime-reason"
                                            />
                                            <Button
                                              type="submit"
                                              disabled={grantLifetimeMutation.isPending}
                                              data-testid="button-grant-lifetime"
                                            >
                                              <Crown className="w-4 h-4 mr-2" />
                                              {grantLifetimeMutation.isPending ? "Granting..." : "Grant Lifetime Access"}
                                            </Button>
                                          </form>
                                        </div>
                                      )}

                                      {selectedUser?.hasLifetimeAccess && (
                                        <div className="p-4 bg-muted rounded-lg">
                                          <p className="text-sm font-medium">Lifetime Access Granted</p>
                                          <p className="text-sm text-muted-foreground">
                                            By: {selectedUser.grantedLifetimeBy || 'Unknown'}
                                          </p>
                                          {selectedUser.grantedLifetimeReason && (
                                            <p className="text-sm text-muted-foreground mt-1">
                                              Reason: {selectedUser.grantedLifetimeReason}
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Referral Redemptions Tab */}
          <TabsContent value="referrals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Referral Redemptions</CardTitle>
                <CardDescription>Track referral code usage and rewards</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Creator</TableHead>
                        <TableHead>Redeemed By</TableHead>
                        <TableHead>Reward</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(redemptions?.redemptions as any[])?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center">No redemptions found</TableCell>
                        </TableRow>
                      ) : (
                        (redemptions?.redemptions as any[])?.map((redemption: any) => (
                          <TableRow key={redemption.id}>
                            <TableCell className="font-medium">{redemption.code}</TableCell>
                            <TableCell>{redemption.creatorEmail}</TableCell>
                            <TableCell>{redemption.redeemerEmail}</TableCell>
                            <TableCell>{redemption.rewardApplied || '1 month free'}</TableCell>
                            <TableCell>{new Date(redemption.redeemedAt).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Video Curation Tab */}
          <TabsContent value="curation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Video Curation Batches</CardTitle>
                <CardDescription>Monitor automated video curation performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Batch Time</TableHead>
                        <TableHead>Videos Scanned</TableHead>
                        <TableHead>Approved</TableHead>
                        <TableHead>Rejected</TableHead>
                        <TableHead>Avg Rating</TableHead>
                        <TableHead>API Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(curationBatches?.batches as any[])?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center">No curation batches found</TableCell>
                        </TableRow>
                      ) : (
                        (curationBatches?.batches as any[])?.map((batch: any) => (
                          <TableRow key={batch.id}>
                            <TableCell>{new Date(batch.batchTime).toLocaleString()}</TableCell>
                            <TableCell>{batch.videosScanned || 0}</TableCell>
                            <TableCell>
                              <Badge variant="default">{batch.videosApproved || 0}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="destructive">{batch.videosRejected || 0}</Badge>
                            </TableCell>
                            <TableCell>{batch.avgRating?.toFixed(1) || 'N/A'}</TableCell>
                            <TableCell>${batch.apiCost?.toFixed(2) || '0.00'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Admin Actions Log Tab */}
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Admin Actions Log</CardTitle>
                <CardDescription>Track all admin actions for accountability</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Admin</TableHead>
                        <TableHead>Action Type</TableHead>
                        <TableHead>Target User</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(adminActions?.actions as any[])?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center">No admin actions found</TableCell>
                        </TableRow>
                      ) : (
                        (adminActions?.actions as any[])?.map((action: any) => (
                          <TableRow key={action.id}>
                            <TableCell className="font-medium">{action.adminEmail}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{action.actionType}</Badge>
                            </TableCell>
                            <TableCell>{action.targetUserEmail || action.targetUsername || '-'}</TableCell>
                            <TableCell>{new Date(action.createdAt).toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
