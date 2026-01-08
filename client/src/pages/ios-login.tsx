import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { saveAuthToken, saveUserData, getApiUrl } from "@/lib/capacitorAuth";
import { triggerHaptic } from "@/lib/haptics";
import { Loader2, Eye, EyeOff, ArrowLeft, Mail, Lock, User } from "lucide-react";
import { Preferences } from '@capacitor/preferences';
import "@/styles/mobile.css";

type AuthMode = 'login' | 'register';

export default function IOSLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [showNoPasswordDialog, setShowNoPasswordDialog] = useState(false);

  const handleAppleSignIn = async () => {
    setError("");
    triggerHaptic('light');
    setIsAppleLoading(true);

    try {
      const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
      
      const result = await SignInWithApple.authorize({
        clientId: 'app.bjjos.ios',
        redirectURI: 'https://bjjos.app/auth/apple/callback',
        scopes: 'email name',
        state: 'bjjos-auth',
        nonce: Math.random().toString(36).substring(7),
      });

      console.log('[APPLE SIGN IN] Response:', result.response);

      const response = await fetch(getApiUrl('/api/auth/apple'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityToken: result.response.identityToken,
          user: result.response.user,
          email: result.response.email,
          fullName: result.response.givenName || result.response.familyName ? {
            givenName: result.response.givenName,
            familyName: result.response.familyName,
          } : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Apple sign in failed');
      }

      triggerHaptic('success');

      if (data.token) {
        await saveAuthToken(data.token);
      }

      if (data.user) {
        await saveUserData(data.user);
        localStorage.setItem('mobileUserId', data.user.id?.toString() || '1');
        await Preferences.set({ key: 'mobileUserId', value: data.user.id?.toString() || '1' });
        window.dispatchEvent(new Event('bjjos-auth-change'));
      }

      toast({
        title: data.isNewUser ? "Account created!" : "Welcome back!",
        description: data.isNewUser ? "Let's get you set up" : "You're now signed in",
      });

      if (data.user?.requiresSubscription) {
        setLocation("/ios-subscribe");
      } else if (!data.user?.onboardingCompleted) {
        setLocation("/ios-onboarding");
      } else {
        setLocation("/ios-chat");
      }

    } catch (err: any) {
      console.error('[APPLE SIGN IN] Error:', err);
      
      if (err.message?.includes('canceled') || err.message?.includes('cancelled')) {
        return;
      }
      
      setError(err.message || "Apple sign in failed. Please try again.");
      triggerHaptic('error');
    } finally {
      setIsAppleLoading(false);
    }
  };

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
        
        const errorLower = (data.error || '').toLowerCase();
        let userMessage = "Something went wrong. Please try again.";
        
        if (errorLower.includes('invalid') || errorLower.includes('credentials') || 
            errorLower.includes('password') || errorLower.includes('not found') ||
            errorLower.includes('incorrect') || errorLower.includes('wrong')) {
          userMessage = "Incorrect email or password";
        } else if (errorLower.includes('network') || errorLower.includes('fetch')) {
          userMessage = "Connection error. Please try again.";
        } else if (errorLower.includes('timeout')) {
          userMessage = "Connection timed out. Please try again.";
        } else if (errorLower.includes('too many') || errorLower.includes('rate limit')) {
          userMessage = "Too many attempts. Please try again later.";
        }
        
        setError(userMessage);
        triggerHaptic('error');
        return;
      }

      triggerHaptic('success');

      const authToken = data.token || data.sessionToken;
      if (authToken) {
        await saveAuthToken(authToken);
      }

      if (data.user) {
        await saveUserData(data.user);
        localStorage.setItem('mobileUserId', data.user.id?.toString() || '1');
        await Preferences.set({ key: 'mobileUserId', value: data.user.id?.toString() || '1' });
        window.dispatchEvent(new Event('bjjos-auth-change'));
      }

      toast({
        title: "Welcome back!",
        description: "You're now signed in",
      });

      if (!data.user?.onboardingCompleted) {
        setLocation("/ios-onboarding");
      } else {
        setLocation("/ios-chat");
      }
    } catch (err: any) {
      let userMessage = "Something went wrong. Please try again.";
      const errorMsg = (err.message || '').toLowerCase();
      
      if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('failed to fetch')) {
        userMessage = "Connection error. Please try again.";
      } else if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
        userMessage = "Connection timed out. Please try again.";
      }
      
      setError(userMessage);
      triggerHaptic('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    triggerHaptic('light');

    if (!email || !email.includes('@')) {
      setError("Please enter a valid email address");
      triggerHaptic('error');
      return;
    }

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters");
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
      const response = await fetch(getApiUrl('/api/auth/ios/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setIsLoading(false);
        const errorLower = (data.error || '').toLowerCase();
        let userMessage = data.error || "Something went wrong. Please try again.";
        
        if (errorLower.includes('already exists') || errorLower.includes('duplicate')) {
          userMessage = "An account with this email already exists. Please sign in.";
        }
        
        setError(userMessage);
        triggerHaptic('error');
        return;
      }

      triggerHaptic('success');

      if (data.token) {
        await saveAuthToken(data.token);
      }

      if (data.user) {
        await saveUserData(data.user);
        localStorage.setItem('mobileUserId', data.user.id?.toString() || '1');
        await Preferences.set({ key: 'mobileUserId', value: data.user.id?.toString() || '1' });
        window.dispatchEvent(new Event('bjjos-auth-change'));
      }

      toast({
        title: "Account created!",
        description: "Let's get you set up",
      });

      setLocation("/ios-subscribe");

    } catch (err: any) {
      let userMessage = "Something went wrong. Please try again.";
      const errorMsg = (err.message || '').toLowerCase();
      
      if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        userMessage = "Connection error. Please try again.";
      }
      
      setError(userMessage);
      triggerHaptic('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    triggerHaptic('light');
    setLocation('/ios-forgot-password');
  };

  const switchMode = (mode: AuthMode) => {
    triggerHaptic('light');
    setAuthMode(mode);
    setError("");
    setPassword("");
    setConfirmPassword("");
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
            Your account was created with email verification. To sign in on iOS, you'll need to set a password first.
          </p>
          
          <p className="text-gray-400 text-sm leading-relaxed">
            Use the "Forgot Password" option to set up your password.
          </p>
          
          <div className="space-y-3">
            <Button 
              onClick={() => {
                triggerHaptic('light');
                setShowNoPasswordDialog(false);
                handleForgotPassword();
              }}
              className="w-full bg-white text-black hover:bg-gray-200"
              data-testid="button-set-password"
            >
              Set Up Password
            </Button>
            <Button 
              onClick={() => {
                triggerHaptic('light');
                setShowNoPasswordDialog(false);
              }}
              variant="ghost"
              className="w-full text-gray-400"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-6 ios-safe-area">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src="/bjjos-logo.png" alt="BJJ OS" className="h-12 w-auto mx-auto mb-2" />
          <p className="text-gray-400 text-sm">Your AI BJJ Coach</p>
        </div>

        <Button
          type="button"
          onClick={handleAppleSignIn}
          disabled={isAppleLoading}
          className="w-full h-12 bg-white text-black font-semibold hover:bg-gray-200 rounded-lg flex items-center justify-center gap-3"
          data-testid="button-apple-sign-in"
        >
          {isAppleLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </>
          )}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#2A2A2B]"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#0A0A0B] px-2 text-gray-500">or</span>
          </div>
        </div>

        {authMode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input
                type="text"
                inputMode="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 pl-11 bg-[#1A1A1B] border-[#2A2A2B] text-white placeholder:text-gray-500 rounded-lg"
                autoComplete="email"
                autoCapitalize="none"
                data-testid="input-email"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pl-11 pr-12 bg-[#1A1A1B] border-[#2A2A2B] text-white placeholder:text-gray-500 rounded-lg"
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
              className="w-full h-12 bg-[#8B5CF6] text-white font-semibold hover:bg-[#7C3AED] rounded-lg"
              data-testid="button-sign-in"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Sign In"
              )}
            </Button>

            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full text-gray-400 text-sm hover:text-white transition-colors py-2"
              data-testid="link-forgot-password"
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input
                type="text"
                inputMode="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 pl-11 bg-[#1A1A1B] border-[#2A2A2B] text-white placeholder:text-gray-500 rounded-lg"
                autoComplete="email"
                autoCapitalize="none"
                data-testid="input-email"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pl-11 pr-12 bg-[#1A1A1B] border-[#2A2A2B] text-white placeholder:text-gray-500 rounded-lg"
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

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-12 pl-11 bg-[#1A1A1B] border-[#2A2A2B] text-white placeholder:text-gray-500 rounded-lg"
                autoComplete="new-password"
                data-testid="input-confirm-password"
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center" data-testid="text-error">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-[#8B5CF6] text-white font-semibold hover:bg-[#7C3AED] rounded-lg"
              data-testid="button-create-account"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Create Account"
              )}
            </Button>
          </form>
        )}

        <div className="text-center pt-4">
          {authMode === 'login' ? (
            <p className="text-gray-400 text-sm">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="text-[#8B5CF6] font-medium hover:text-[#A78BFA]"
                data-testid="link-create-account"
              >
                Create Account
              </button>
            </p>
          ) : (
            <p className="text-gray-400 text-sm">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-[#8B5CF6] font-medium hover:text-[#A78BFA]"
                data-testid="link-sign-in"
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
