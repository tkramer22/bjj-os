import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { setAdminAuth } from "@/lib/adminApi";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async (credentials: { password: string; rememberMe: boolean }) => {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: allows cookies to be set
        body: JSON.stringify(credentials)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      console.log('✅ [ADMIN LOGIN] Login successful, session cookie set');
      
      // Store token for auth guard checks (cookie handles actual authentication)
      if (data.token) {
        setAdminAuth(data.token, data.expiresIn || '24h');
      }
      
      if (data.admin) {
        localStorage.setItem('adminUser', JSON.stringify(data.admin));
      }
      
      toast({
        title: "Login Successful",
        description: `Welcome back! Session valid for 24 hours.`,
      });
      
      console.log('🔄 [ADMIN LOGIN] Redirecting to /admin/dashboard...');
      navigate('/admin/dashboard');
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast({
        title: "Missing Information",
        description: "Please enter your admin password",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate({ password, rememberMe });
  };

  return (
    <div className="page-container min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)' }}>
            <Shield className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-center">BJJ OS Admin</CardTitle>
          <CardDescription className="text-center">
            Sign in to access the admin dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Admin Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                data-testid="input-admin-password"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                data-testid="checkbox-remember-me"
              />
              <Label
                htmlFor="rememberMe"
                className="text-sm font-normal cursor-pointer"
              >
                Remember me for 30 days
              </Label>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
              data-testid="button-admin-login"
            >
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Lock className="w-4 h-4" />
            <span>Admin access only • All actions are logged</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
