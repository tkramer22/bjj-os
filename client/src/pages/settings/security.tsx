import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SettingsLayout } from "./layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Shield, Eye, EyeOff } from "lucide-react";

export default function SecuritySettings() {
  const { toast } = useToast();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const { data, isLoading } = useQuery<{ email?: string; hasPassword?: boolean }>({
    queryKey: ["/api/auth/me"],
  });

  const setPasswordMutation = useMutation({
    mutationFn: async (data: { newPassword: string; currentPassword?: string }) => {
      return await apiRequest("POST", "/api/auth/set-password", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Password Updated",
        description: "Your password has been set successfully. You can now use it to log in faster.",
      });
      setFormData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Set Password",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSetPassword = () => {
    if (formData.newPassword.length < 8) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure your passwords match",
        variant: "destructive",
      });
      return;
    }

    setPasswordMutation.mutate({
      newPassword: formData.newPassword,
      currentPassword: data?.hasPassword ? formData.currentPassword : undefined,
    });
  };

  if (isLoading) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </SettingsLayout>
    );
  }

  const user = data;
  const hasPassword = user?.hasPassword;

  return (
    <SettingsLayout>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold mb-2">Security Settings</h1>
        <p className="text-muted-foreground mb-6">
          Manage your password and account security
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              {hasPassword ? "Change Password" : "Set Password (Optional)"}
            </CardTitle>
            <CardDescription>
              {hasPassword 
                ? "Update your password to keep your account secure"
                : "Add a password to log in faster. You can always use email verification instead."
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    value={formData.currentPassword}
                    onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                    placeholder="Enter current password"
                    data-testid="input-current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    data-testid="button-toggle-current-password"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={formData.newPassword}
                  onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                  placeholder="Enter new password (min 8 characters)"
                  data-testid="input-new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  data-testid="button-toggle-new-password"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Confirm new password"
                  data-testid="input-confirm-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  data-testid="button-toggle-confirm-password"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <Button 
              onClick={handleSetPassword}
              disabled={setPasswordMutation.isPending || !formData.newPassword || !formData.confirmPassword}
              data-testid="button-set-password"
            >
              {setPasswordMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {hasPassword ? "Update Password" : "Set Password"}
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Login Methods
            </CardTitle>
            <CardDescription>
              Ways you can sign in to your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium">Email Verification</p>
                <p className="text-sm text-muted-foreground">
                  Sign in with a code sent to {user?.email || "your email"}
                </p>
              </div>
              <span className="text-sm text-green-600 dark:text-green-400 font-medium">Always Available</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">
                  {hasPassword 
                    ? "Sign in with your password for faster access"
                    : "Set a password for faster login (optional)"
                  }
                </p>
              </div>
              <span className={`text-sm font-medium ${hasPassword ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                {hasPassword ? "Enabled" : "Not Set"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}
