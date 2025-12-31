import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { adminApiRequest } from "@/lib/adminApi";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, Edit, Eye, UserPlus, Users as UsersIcon, Key, Star, XCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

type TimeFilter = '24h' | '7d' | '30d' | '90d' | 'all';

export default function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [beltFilter, setBeltFilter] = useState<string>('all');
  const { toast } = useToast();

  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ['/api/admin/users', { timeFilter, planFilter, statusFilter, beltFilter }],
    queryFn: () => adminApiRequest(`/api/admin/users?timeFilter=${timeFilter}&planFilter=${planFilter}&statusFilter=${statusFilter}&beltFilter=${beltFilter}`),
  });

  // Create test user mutation
  const createTestUserMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/create-test-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to create test user');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test User Created",
        description: "A demo user has been created for testing",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create test user",
        variant: "destructive",
      });
    },
  });

  // Toggle lifetime bypass mutation
  const toggleLifetimeBypassMutation = useMutation({
    mutationFn: async ({ userId, enable }: { userId: string; enable: boolean }) => {
      const response = await fetch(`/api/admin/users/${userId}/toggle-lifetime-bypass`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
        },
        body: JSON.stringify({ enable }),
      });
      if (!response.ok) throw new Error('Failed to toggle lifetime bypass');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Lifetime Bypass Updated",
        description: `LIFETIME code ${data.isLifetimeUser ? 'enabled' : 'disabled'} for ${data.phoneNumber}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to toggle lifetime bypass",
        variant: "destructive",
      });
    },
  });

  // Grant lifetime access mutation
  const grantLifetimeMutation = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      return await adminApiRequest('/api/admin/lifetime/grant-instant', 'POST', { 
        email, 
        sendEmail: false 
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Lifetime Access Granted",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to grant lifetime access",
        variant: "destructive",
      });
    },
  });

  // Revoke lifetime access mutation
  const revokeLifetimeMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      return await adminApiRequest(`/api/admin/users/${userId}/revoke-lifetime`, 'POST', {});
    },
    onSuccess: () => {
      toast({
        title: "Lifetime Access Revoked",
        description: "User subscription changed to free tier",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to revoke lifetime access",
        variant: "destructive",
      });
    },
  });

  const filteredUsers = users?.filter((user: any) => 
    user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.phoneNumber?.includes(searchQuery)
  ) || [];

  // Count users by time period
  const getUserCount = (period: TimeFilter) => {
    if (!users) return 0;
    const now = new Date();
    
    return users.filter((user: any) => {
      const userDate = new Date(user.createdAt);
      switch (period) {
        case '24h':
          return (now.getTime() - userDate.getTime()) <= 24 * 60 * 60 * 1000;
        case '7d':
          return (now.getTime() - userDate.getTime()) <= 7 * 24 * 60 * 60 * 1000;
        case '30d':
          return (now.getTime() - userDate.getTime()) <= 30 * 24 * 60 * 60 * 1000;
        case '90d':
          return (now.getTime() - userDate.getTime()) <= 90 * 24 * 60 * 60 * 1000;
        case 'all':
          return true;
        default:
          return true;
      }
    }).length;
  };

  const isNewUser = (createdAt: string) => {
    const userDate = new Date(createdAt);
    const now = new Date();
    return (now.getTime() - userDate.getTime()) <= 24 * 60 * 60 * 1000;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">User Management</h2>
            <p className="text-muted-foreground mt-1">Manage and monitor your users</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            data-testid="button-refresh-users"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Time Filter Tabs */}
        <Card className="p-1">
          <div className="flex gap-1">
            {(['24h', '7d', '30d', '90d', 'all'] as TimeFilter[]).map((filter) => (
              <Button
                key={filter}
                variant={timeFilter === filter ? "default" : "ghost"}
                onClick={() => setTimeFilter(filter)}
                className="flex-1"
                data-testid={`filter-time-${filter}`}
              >
                <span className="font-medium">
                  {filter === '24h' ? 'Last 24 Hours' :
                   filter === '7d' ? 'Last 7 Days' :
                   filter === '30d' ? 'Last 30 Days' :
                   filter === '90d' ? 'Last 90 Days' : 'All Time'}
                </span>
                <Badge variant="secondary" className="ml-2">
                  {getUserCount(filter)}
                </Badge>
              </Button>
            ))}
          </div>
        </Card>

        {/* Filters and Search */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search by name, email, or phone..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-user-search"
            />
          </div>

          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-plan-filter">
              <SelectValue placeholder="Plan Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              <SelectItem value="sms">SMS Only</SelectItem>
              <SelectItem value="full">Full AI Package</SelectItem>
              <SelectItem value="lifetime">Lifetime</SelectItem>
              <SelectItem value="free">Free</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={beltFilter} onValueChange={setBeltFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-belt-filter">
              <SelectValue placeholder="Belt Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Belts</SelectItem>
              <SelectItem value="white">White Belt</SelectItem>
              <SelectItem value="blue">Blue Belt</SelectItem>
              <SelectItem value="purple">Purple Belt</SelectItem>
              <SelectItem value="brown">Brown Belt</SelectItem>
              <SelectItem value="black">Black Belt</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Users Table or Empty State */}
        {!isLoading && filteredUsers.length === 0 && !searchQuery ? (
          <Card className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <UsersIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">No users yet</h3>
                <p className="text-muted-foreground mb-6">
                  Your first user will appear here when they sign up.
                </p>
              </div>
              <Button
                onClick={() => createTestUserMutation.mutate()}
                disabled={createTestUserMutation.isPending}
                data-testid="button-create-test-user"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Create Test User
              </Button>
            </div>
          </Card>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Belt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>LIFETIME Bypass</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Loading users...
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No users found matching your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user: any) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {user.name || 'Unnamed'}
                          {isNewUser(user.createdAt) && (
                            <Badge variant="default" className="text-xs">NEW</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{user.email || 'No email'}</TableCell>
                      <TableCell>{user.phoneNumber}</TableCell>
                      <TableCell>
                        <Badge variant={user.subscriptionType === 'lifetime' ? 'default' : 'secondary'}>
                          {user.subscriptionType || 'free'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.beltLevel ? (
                          <Badge variant="outline">{user.beltLevel}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={user.subscriptionStatus === 'active' ? 'default' : 'secondary'}
                        >
                          {user.subscriptionStatus || 'inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={user.subscriptionType === 'lifetime'}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                grantLifetimeMutation.mutate({ email: user.email });
                              } else {
                                revokeLifetimeMutation.mutate({ userId: user.id });
                              }
                            }}
                            disabled={grantLifetimeMutation.isPending || revokeLifetimeMutation.isPending}
                            data-testid={`toggle-lifetime-bypass-${user.id}`}
                          />
                          {user.subscriptionType === 'lifetime' && (
                            <Badge variant="default" className="text-xs">
                              <Star className="w-3 h-3 mr-1 text-yellow-500" />
                              LIFETIME
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {user.subscriptionType !== 'lifetime' ? (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => grantLifetimeMutation.mutate({ email: user.email })}
                              disabled={!user.email || grantLifetimeMutation.isPending}
                              title="Grant Lifetime Access"
                              data-testid={`button-grant-lifetime-${user.id}`}
                            >
                              <Star className="w-4 h-4 text-yellow-500" />
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => revokeLifetimeMutation.mutate({ userId: user.id })}
                              disabled={revokeLifetimeMutation.isPending}
                              title="Revoke Lifetime Access"
                              data-testid={`button-revoke-lifetime-${user.id}`}
                            >
                              <XCircle className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" data-testid={`button-view-user-${user.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" data-testid={`button-edit-user-${user.id}`}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
