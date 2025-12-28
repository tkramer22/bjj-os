import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Users, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LaunchDayAdmin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [bulkPhones, setBulkPhones] = useState("");
  const { toast } = useToast();

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/admin/login", { password });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('adminToken', data.token);
      }
      return data;
    },
    onSuccess: () => {
      setIsAuthenticated(true);
      toast({ title: "Login successful" });
    },
    onError: () => {
      toast({ title: "Invalid password", variant: "destructive" });
    },
  });

  // Get all users
  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/users?timeFilter=all&planFilter=all&statusFilter=all&beltFilter=all', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
    enabled: isAuthenticated,
  });

  // Bulk grant lifetime access
  const bulkGrantMutation = useMutation({
    mutationFn: async (phoneNumbers: string[]) => {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/lifetime/grant-bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          phoneNumbers,
          reason: 'Beta Tester',
          notes: 'Launch day beta test access',
        }),
      });
      if (!res.ok) throw new Error('Failed to grant access');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setBulkPhones("");
      toast({ 
        title: "Success!", 
        description: `Granted lifetime access to ${data.granted} users`,
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Handle login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(password);
  };

  // Handle bulk grant
  const handleBulkGrant = () => {
    const phones = bulkPhones
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    if (phones.length === 0) {
      toast({ 
        title: "Error", 
        description: "Please enter at least one phone number", 
        variant: "destructive" 
      });
      return;
    }

    bulkGrantMutation.mutate(phones);
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>🚀 Launch Day Admin</CardTitle>
            <CardDescription>BJJ OS Beta Testing Dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Admin Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter ADMIN_PASSWORD"
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

  // Calculate stats
  const totalUsers = users?.length || 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const signupsToday = users?.filter((u: any) => new Date(u.createdAt) >= today).length || 0;
  const lifetimeUsers = users?.filter((u: any) => u.subscriptionTier === 'lifetime').length || 0;
  const activeUsers = users?.filter((u: any) => u.onboardingCompleted).length || 0;

  // Recent signups (last 20)
  const recentSignups = users?.slice(0, 20) || [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">🚀 Launch Day Dashboard</h1>
            <p className="text-muted-foreground">BJJ OS Beta Testing - Manual Admin</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Total Signups
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-users">
                {totalUsers}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Signups Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-signups-today">
                {signupsToday}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Completed Onboarding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-active-users">
                {activeUsers}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Lifetime Access</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-lifetime-users">
                {lifetimeUsers}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bulk Grant Access */}
        <Card>
          <CardHeader>
            <CardTitle>Bulk Grant Lifetime Access</CardTitle>
            <CardDescription>
              Paste phone numbers (one per line) to grant lifetime access to all beta testers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-phones">Phone Numbers (E.164 format: +1XXXXXXXXXX)</Label>
              <Textarea
                id="bulk-phones"
                value={bulkPhones}
                onChange={(e) => setBulkPhones(e.target.value)}
                placeholder={`+15551234567\n+15559876543\n+15555555555`}
                className="h-32 font-mono text-sm"
                data-testid="textarea-bulk-phones"
              />
            </div>
            <Button
              onClick={handleBulkGrant}
              disabled={bulkGrantMutation.isPending || !bulkPhones.trim()}
              data-testid="button-bulk-grant"
            >
              {bulkGrantMutation.isPending 
                ? "Granting Access..." 
                : "Grant All Lifetime Access"}
            </Button>
          </CardContent>
        </Card>

        {/* Recent Signups */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Signups (Last 20)</CardTitle>
            <CardDescription>Most recent users, newest first</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Signup Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Belt</TableHead>
                      <TableHead>Access</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentSignups.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No signups yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      recentSignups.map((user: any) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-mono text-sm">
                            {user.phoneNumber}
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(user.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.onboardingCompleted ? "default" : "secondary"}>
                              {user.onboardingCompleted ? "Completed" : "Pending"}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize">
                            {user.beltLevel || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={user.subscriptionTier === 'lifetime' ? "default" : "outline"}
                            >
                              {user.subscriptionTier === 'lifetime' ? "Lifetime" : user.subscriptionStatus}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick SQL Reference */}
        <Card>
          <CardHeader>
            <CardTitle>Quick SQL Queries</CardTitle>
            <CardDescription>Copy these to Replit Database → Query tab</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted p-3 rounded-md font-mono text-xs">
              <p className="text-muted-foreground mb-1">-- Grant lifetime access to one user</p>
              <code>UPDATE bjj_users SET subscription_tier = 'lifetime', subscription_status = 'active' WHERE phone_number = '+15551234567';</code>
            </div>
            <div className="bg-muted p-3 rounded-md font-mono text-xs">
              <p className="text-muted-foreground mb-1">-- View signups today</p>
              <code>SELECT COUNT(*) FROM bjj_users WHERE created_at &gt;= CURRENT_DATE;</code>
            </div>
            <div className="bg-muted p-3 rounded-md font-mono text-xs">
              <p className="text-muted-foreground mb-1">-- Check active users (sent messages)</p>
              <code>SELECT COUNT(DISTINCT user_id) FROM conversations WHERE created_at &gt;= CURRENT_DATE;</code>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
