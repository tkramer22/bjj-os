import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input} from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BeltIcon } from "@/components/BeltIcon";
import { saveAuthToken, saveUserData, isNativeApp } from "@/lib/capacitorAuth";
import { Preferences } from '@capacitor/preferences';

export default function EmailLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !email.includes('@')) {
      setError("Please enter a valid email address");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/email/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to send verification code");
        return;
      }

      // Check if admin account
      if (data.isAdmin) {
        setIsAdmin(true);
        toast({
          title: "Admin Account",
          description: "Please use your admin bypass code",
        });
      } else {
        toast({
          title: "Code Sent!",
          description: "Check your email for the verification code",
        });
      }

      setStep('code');
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      toast({
        title: "Error",
        description: err.message || "Failed to send code",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!code || code.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/email/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, rememberMe }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid verification code");
        return;
      }

      // Save session token and user data (works for both web and native)
      await saveAuthToken(data.token);
      await saveUserData(data.user);
      
      // Set mobileUserId for auth state detection
      const userId = data.user.id?.toString() || '1';
      localStorage.setItem('mobileUserId', userId);
      
      // On native, also save mobileUserId to Preferences for persistent auth
      if (isNativeApp()) {
        await Preferences.set({ key: 'mobileUserId', value: userId });
      }

      toast({
        title: data.isNewUser ? "Welcome!" : "Welcome Back!",
        description: data.isNewUser ? "Your account has been created" : "Successfully logged in",
      });

      // Check if backend provided a redirect URL (e.g., for first-time lifetime users)
      if (data.redirect) {
        setLocation(data.redirect);
      } else if (data.user.onboardingCompleted) {
        // Native app goes to /chat, web goes to /app/chat
        setLocation(isNativeApp() ? "/chat" : "/app/chat");
      } else {
        setLocation("/mobile-onboarding");
      }

    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      toast({
        title: "Verification Failed",
        description: err.message || "Invalid code",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-purple-950/20 to-black flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Back Button */}
        {/* Only show back button on web (native app doesn't need it) */}
        {!isNativeApp() && (
          <Button
            variant="outline"
            onClick={() => step === 'code' ? setStep('email') : setLocation("/")}
            className="mb-8 bg-white/5 border-white/10 hover:bg-white/10"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {step === 'code' ? 'Back' : 'Back to Home'}
          </Button>
        )}
        {isNativeApp() && step === 'code' && (
          <Button
            variant="outline"
            onClick={() => setStep('email')}
            className="mb-8 bg-white/5 border-white/10 hover:bg-white/10"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        )}

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-6">
              <BeltIcon className="w-16 h-16" />
            </div>
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              {step === 'email' ? 'Sign In' : 'Enter Code'}
            </h1>
            <p className="text-gray-400">
              {step === 'email' 
                ? 'Enter your email to get started'
                : isAdmin 
                  ? 'Use your admin bypass code'
                  : 'We sent a 6-digit code to your email'
              }
            </p>
          </div>

          {/* Email Step */}
          {step === 'email' && (
            <form onSubmit={handleRequestCode} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                    data-testid="input-email"
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400" data-testid="text-error">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700"
                disabled={isLoading || !email}
                data-testid="button-continue"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending Code...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          )}

          {/* Code Step */}
          {step === 'code' && (
            <form onSubmit={handleVerifyCode} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="code" className="text-white">
                  {isAdmin ? 'Admin Bypass Code' : 'Verification Code'}
                </Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={isLoading}
                  className="text-center text-2xl tracking-widest bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  data-testid="input-code"
                  autoFocus
                  maxLength={6}
                />
              </div>

              {error && (
                <p className="text-sm text-red-400" data-testid="text-error">{error}</p>
              )}

              {/* Remember Me Checkbox */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 accent-purple-600 cursor-pointer"
                  data-testid="checkbox-remember-me"
                />
                <label htmlFor="rememberMe" className="text-sm text-gray-400 cursor-pointer">
                  Keep me signed in for 30 days
                </label>
              </div>

              <Button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700"
                disabled={isLoading || code.length !== 6}
                data-testid="button-verify"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Continue"
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setCode('');
                    setError('');
                  }}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                  data-testid="button-resend"
                >
                  Didn't receive it? Try again
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Alternative Login & Forgot Password */}
        <div className="mt-6 text-center text-sm text-gray-400 space-y-2">
          <div>
            <Link 
              href="/forgot-password" 
              className="hover:text-white transition-colors" 
              data-testid="link-forgot-password"
            >
              Forgot your password?
            </Link>
          </div>
          <div>
            <Link 
              href="/login" 
              className="hover:text-white transition-colors" 
              data-testid="link-phone-login"
            >
              Use phone number instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
