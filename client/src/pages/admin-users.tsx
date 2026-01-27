import { useState, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface User {
  id: string;
  username?: string;
  name?: string;
  email: string;
  belt_rank?: string;
  subscription_status: string;
  subscription_tier?: string;
  subscription_platform?: string;
  lifetime_access?: boolean;
  created_at: string;
  last_login?: string;
}

export default function AdminUsersDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  // Check if authenticated on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('adminAuthenticated');
    console.log('🔐 [ADMIN] Initial auth check:', stored);
    if (stored === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch users when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
    }
  }, [isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🔐 [ADMIN] Attempting login...');
    
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include'
      });

      if (response.ok) {
        console.log('✅ [ADMIN] Login successful');
        sessionStorage.setItem('adminAuthenticated', 'true');
        setIsAuthenticated(true);
        toast({ title: "Login successful" });
      } else {
        console.error('❌ [ADMIN] Login failed');
        toast({ title: "Invalid password", variant: "destructive" });
      }
    } catch (err) {
      console.error('❌ [ADMIN] Login error:', err);
      toast({ title: "Login error", variant: "destructive" });
    }
  };

  const fetchUsers = async () => {
    console.log('📊 [ADMIN] Fetching users...');
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      console.log('📡 [ADMIN] Response status:', response.status);

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ [ADMIN] Data received:', data);

      // CRITICAL: Ensure users is always an array
      let userArray: User[] = [];
      if (data && Array.isArray(data.users)) {
        userArray = data.users;
      } else if (Array.isArray(data)) {
        userArray = data;
      }

      console.log('👥 [ADMIN] Users count:', userArray.length);
      setUsers(userArray);
    } catch (err) {
      console.error('❌ [ADMIN] Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // Safe filtering - always check if users is an array
  const filteredUsers = Array.isArray(users) ? users.filter(user => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      user.email?.toLowerCase().includes(term) ||
      user.name?.toLowerCase().includes(term) ||
      user.username?.toLowerCase().includes(term)
    );
  }) : [];

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
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  data-testid="input-password"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-login">
                Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-lg">Loading users...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{error}</p>
            <Button onClick={fetchUsers}>Retry</Button>
            <Button variant="outline" onClick={() => {
              sessionStorage.removeItem('adminAuthenticated');
              setIsAuthenticated(false);
            }}>Logout</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main dashboard
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">BJJ OS Admin Dashboard</h1>
            <p className="text-muted-foreground">Total Users: {users.length} | Showing: {filteredUsers.length}</p>
          </div>
          <Button variant="outline" onClick={() => {
            sessionStorage.removeItem('adminAuthenticated');
            setIsAuthenticated(false);
          }}>Logout</Button>
        </div>

        {/* Search */}
        <div className="flex gap-4">
          <Input
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
            data-testid="input-search"
          />
          <Button onClick={fetchUsers} variant="outline">Refresh</Button>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        {users.length === 0 ? 'No users found' : 'No users match your search'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{user.name || user.username || 'Unnamed'}</div>
                            <div className="text-sm text-muted-foreground">{user.email}</div>
                            {user.belt_rank && (
                              <Badge variant="outline" className="mt-1">{user.belt_rank}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant={user.subscription_status === 'active' ? 'default' : 'secondary'}>
                              {user.subscription_status}
                            </Badge>
                            {user.lifetime_access && (
                              <Badge className="ml-1 bg-yellow-500">LIFETIME</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {user.subscription_platform === 'ios' ? '🍎 iOS' : '💳 Web'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
