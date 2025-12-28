import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { saveAuthToken, saveUserData, getApiUrl } from "@/lib/capacitorAuth";
import { triggerHaptic } from "@/lib/haptics";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Preferences } from '@capacitor/preferences';
import "@/styles/mobile.css";

export default function IOSLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showNoPasswordDialog, setShowNoPasswordDialog] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    triggerHaptic('light');

    if (!email || !email.includes('@')) {
      setError("Please enter a valid email address");
      triggerHaptic('error');
      return;
    }

    if (!password || password.length < 1) {
      setError("Please enter your password");
      triggerHaptic('error');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setIsLoading(false);
        if (data.error === 'NO_PASSWORD_SET') {
          setShowNoPasswordDialog(true);
          triggerHaptic('warning');
          return;
        }
        setError(data.error || "Invalid email or password");
        triggerHaptic('error');
        return;
      }

      triggerHaptic('success');

      if (data.sessionToken) {
        await saveAuthToken(data.sessionToken);
      }

      if (data.user) {
        await saveUserData(data.user);
        localStorage.setItem('mobileUserId', data.user.id?.toString() || '1');
        await Preferences.set({ key: 'mobileUserId', value: data.user.id?.toString() || '1' });
      }

      toast({
        title: "Welcome back!",
        description: "You're now signed in",
      });

      if (!data.user?.onboardingCompleted) {
        setLocation("/ios-onboarding");
      } else {
        // Redirect to iOS chat page
        setLocation("/ios-chat");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      triggerHaptic('error');
      toast({
        title: "Error",
        description: err.message || "Failed to sign in",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    triggerHaptic('light');
    setLocation('/ios-forgot-password');
  };

  if (showNoPasswordDialog) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-6 ios-safe-area">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="w-16 h-16 mx-auto bg-yellow-500/20 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          
          <h2 className="text-xl font-bold text-white">Password Not Set Up</h2>
          
          <p className="text-gray-400 text-sm leading-relaxed">
            Your account uses email verification codes. To use the iOS app, you need to set up a password first.
          </p>
          
          <p className="text-gray-400 text-sm leading-relaxed">
            Visit bjjos.app/settings to set up your password, then return here to sign in.
          </p>
          
          <Button 
            onClick={() => {
              triggerHaptic('light');
              setShowNoPasswordDialog(false);
            }}
            className="w-full bg-white text-black hover:bg-gray-200"
            data-testid="button-ok"
          >
            OK
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-6 ios-safe-area">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <img src="/bjjos-logo.png" alt="BJJ OS" className="h-12 w-auto mx-auto" />
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 bg-[#1A1A1B] border-[#2A2A2B] text-white placeholder:text-gray-500 rounded-lg"
              autoComplete="email"
              autoCapitalize="none"
              data-testid="input-email"
            />
          </div>

          <div className="space-y-2 relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 bg-[#1A1A1B] border-[#2A2A2B] text-white placeholder:text-gray-500 rounded-lg pr-12"
              autoComplete="current-password"
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

          {error && (
            <p className="text-red-500 text-sm text-center" data-testid="text-error">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-white text-black font-semibold hover:bg-gray-200 rounded-lg"
            data-testid="button-sign-in"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={handleForgotPassword}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleForgotPassword();
            }}
            className="text-gray-400 text-sm hover:text-white transition-colors py-2 px-4"
            data-testid="link-forgot-password"
          >
            Forgot password?
          </button>
        </div>

        <div className="border-t border-[#2A2A2B] pt-6">
          <div className="text-center space-y-2">
            <p className="text-gray-400 text-sm">Don't have an account?</p>
            <p className="text-gray-500 text-sm">Visit bjjos.app to get started</p>
          </div>
        </div>
      </div>
    </div>
  );
}
