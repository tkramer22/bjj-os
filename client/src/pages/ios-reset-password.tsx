import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/capacitorAuth";
import { triggerHaptic } from "@/lib/haptics";
import { Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import "@/styles/mobile.css";

export default function IOSResetPasswordPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  
  const params = new URLSearchParams(search);
  const email = params.get('email') || '';
  const code = params.get('code') || '';
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!email || !code) {
      setLocation('/ios-forgot-password');
    }
  }, [email, code, setLocation]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    triggerHaptic('light');

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      triggerHaptic('error');
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      triggerHaptic('error');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code, newPassword: password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to reset password");
        triggerHaptic('error');
        return;
      }

      triggerHaptic('success');
      setSuccess(true);
      
      toast({
        title: "Password reset!",
        description: "You can now sign in with your new password",
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      triggerHaptic('error');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-6 ios-safe-area">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          
          <h1 className="text-2xl font-bold text-white">Success!</h1>
          
          <p className="text-gray-400 text-sm">
            Your password has been reset. You can now sign in with your new password.
          </p>
          
          <Button 
            onClick={() => {
              triggerHaptic('light');
              setLocation('/ios-login');
            }}
            className="w-full h-12 bg-white text-black font-semibold hover:bg-gray-200 rounded-lg"
            data-testid="button-back-to-login"
          >
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-6 ios-safe-area">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <img src="/bjjos-logo.png" alt="BJJ OS" className="h-12 w-auto mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-2">Set New Password</h1>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-2 relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="New Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 bg-[#1A1A1B] border-[#2A2A2B] text-white placeholder:text-gray-500 rounded-lg pr-12"
              autoComplete="new-password"
              data-testid="input-password"
            />
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowPassword(!showPassword);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              data-testid="button-toggle-password"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div className="space-y-2 relative">
            <Input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-12 bg-[#1A1A1B] border-[#2A2A2B] text-white placeholder:text-gray-500 rounded-lg pr-12"
              autoComplete="new-password"
              data-testid="input-confirm-password"
            />
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowConfirmPassword(!showConfirmPassword);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              data-testid="button-toggle-confirm-password"
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <p className="text-gray-500 text-xs">Password must be at least 8 characters</p>

          {error && (
            <p className="text-red-500 text-sm text-center" data-testid="text-error">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-white text-black font-semibold hover:bg-gray-200 rounded-lg"
            data-testid="button-save-password"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Save Password"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
