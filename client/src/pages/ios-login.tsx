import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { saveAuthToken, saveUserData, getApiUrl } from "@/lib/capacitorAuth";
import { triggerHaptic } from "@/lib/haptics";
import { Loader2, Eye, EyeOff, ArrowLeft, Mail, Lock, User } from "lucide-react";
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import "@/styles/mobile.css";

// Platform detection
const platform = Capacitor.getPlatform();
const isAndroid = platform === 'android';
const isIOS = platform === 'ios';

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
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showNoPasswordDialog, setShowNoPasswordDialog] = useState(false);

  // Payment-first Apple Sign In flow
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

      // Step 1: Prepare (check if existing user or new user)
      const prepResponse = await fetch(getApiUrl('/api/auth/ios/prepare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authType: 'apple',
          appleIdentityToken: result.response.identityToken,
          appleUserId: result.response.user,
          email: result.response.email,
          displayName: result.response.givenName || result.response.familyName ? 
            `${result.response.givenName || ''} ${result.response.familyName || ''}`.trim() : null,
        }),
      });

      const prepData = await prepResponse.json();

      if (!prepResponse.ok) {
        throw new Error(prepData.error || 'Apple sign in failed');
      }

      // If existing user, sign them in directly
      if (prepData.existingUser) {
        triggerHaptic('success');

        if (prepData.token) {
          await saveAuthToken(prepData.token);
        }

        if (prepData.user) {
          await saveUserData(prepData.user);
          localStorage.setItem('mobileUserId', prepData.user.id?.toString() || '1');
          await Preferences.set({ key: 'mobileUserId', value: prepData.user.id?.toString() || '1' });
          window.dispatchEvent(new Event('bjjos-auth-change'));
        }

        toast({
          title: "Welcome back!",
          description: "You're now signed in",
        });

        if (!prepData.user?.onboardingCompleted) {
          setLocation("/ios-onboarding");
        } else {
          setLocation("/ios-chat");
        }
        return;
      }

      // Step 2: New user - trigger Apple IAP payment
      if (prepData.requiresPayment) {
        console.log('[APPLE SIGN IN] New user - triggering Apple IAP payment...');
        
        try {
          const { ApplePurchaseService } = await import('@/services/applePurchase');
          
          // Initialize the store if needed
          await ApplePurchaseService.initialize();
          
          // Wrap callback-based purchase in a Promise
          const purchaseResult = await new Promise<{ success: boolean; receipt?: string; transactionId?: string; error?: string }>((resolve) => {
            ApplePurchaseService.purchase((result) => {
              resolve({
                success: result.success,
                receipt: result.receiptData,
                transactionId: result.transactionId,
                error: result.error,
              });
            });
          });
          
          if (!purchaseResult.success || !purchaseResult.receipt) {
            setIsAppleLoading(false);
            setError(purchaseResult.error || "Payment was not completed. Please try again.");
            triggerHaptic('error');
            return;
          }

          console.log('[APPLE SIGN IN] Payment successful, completing account creation...');

          // Step 3: Complete account creation with receipt
          const completeResponse = await fetch(getApiUrl('/api/auth/ios/complete'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prepToken: prepData.prepToken,
              receipt: purchaseResult.receipt,
              transactionId: purchaseResult.transactionId,
              productId: 'bjjos',
            }),
          });

          const completeData = await completeResponse.json();

          if (!completeResponse.ok) {
            setIsAppleLoading(false);
            setError(completeData.error || "Account creation failed. Please contact support.");
            triggerHaptic('error');
            return;
          }

          // Success! Save auth and navigate
          triggerHaptic('success');

          if (completeData.token) {
            await saveAuthToken(completeData.token);
          }

          if (completeData.user) {
            await saveUserData(completeData.user);
            localStorage.setItem('mobileUserId', completeData.user.id?.toString() || '1');
            await Preferences.set({ key: 'mobileUserId', value: completeData.user.id?.toString() || '1' });
            window.dispatchEvent(new Event('bjjos-auth-change'));
          }

          toast({
            title: "Welcome to Prof. OS!",
            description: "Your subscription is now active",
          });

          setLocation("/ios-onboarding");

        } catch (purchaseErr: any) {
          console.error('[APPLE SIGN IN] Purchase error:', purchaseErr);
          setIsAppleLoading(false);
          
          if (purchaseErr.message?.includes('cancel')) {
            setError("Payment was cancelled. No account was created.");
          } else {
            setError("Payment failed. Please try again.");
          }
          triggerHaptic('error');
          return;
        }
      }

    } catch (err: any) {
      console.error('[APPLE SIGN IN] Error:', err);
      
      // Handle user cancellation gracefully - no error message
      // Error code 1000 = ASAuthorizationError.canceled (user tapped Cancel)
      // Error code 1001 = ASAuthorizationError.invalidResponse
      // Also check for common cancel-related strings
      const errorMessage = err.message || '';
      if (
        errorMessage.includes('canceled') || 
        errorMessage.includes('cancelled') ||
        errorMessage.includes('error 1000') ||
        errorMessage.includes('AuthorizationError error 1000')
      ) {
        // User cancelled - just dismiss, no error
        setIsAppleLoading(false);
        return;
      }
      
      setError("Apple sign in failed. Please try again.");
      triggerHaptic('error');
    } finally {
      setIsAppleLoading(false);
    }
  };

  // Google Sign In flow (Android only)
  const handleGoogleSignIn = async () => {
    setError("");
    triggerHaptic('light');
    setIsGoogleLoading(true);

    try {
      const { GoogleAuthService } = await import('@/services/googleAuth');
      
      const result = await GoogleAuthService.signIn();
      console.log('[GOOGLE SIGN IN] Response:', result);

      // Send to backend to create/login user
      const response = await fetch(getApiUrl('/api/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: result.email,
          name: result.name,
          googleId: result.id,
          idToken: result.authentication.idToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Google sign in failed');
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
        title: data.isNewUser ? "Welcome to Prof. OS!" : "Welcome back!",
        description: data.isNewUser ? "Your account has been created" : "You're now signed in",
      });

      if (!data.user?.onboardingCompleted) {
        setLocation("/ios-onboarding");
      } else {
        setLocation("/ios-chat");
      }

    } catch (err: any) {
      console.error('[GOOGLE SIGN IN] Error:', err);
      
      // Handle user cancellation gracefully
      const errorMessage = err.message || '';
      if (
        errorMessage.includes('canceled') || 
        errorMessage.includes('cancelled') ||
        errorMessage.includes('popup_closed') ||
        errorMessage.includes('12501') // Google Sign In cancel code
      ) {
        setIsGoogleLoading(false);
        return;
      }
      
      setError("Google sign in failed. Please try again.");
      triggerHaptic('error');
    } finally {
      setIsGoogleLoading(false);
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

  // Payment-first registration flow
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
      // Step 1: Prepare credentials (no account created yet)
      const prepResponse = await fetch(getApiUrl('/api/auth/ios/prepare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, authType: 'email' }),
      });

      const prepData = await prepResponse.json();

      if (!prepResponse.ok) {
        setIsLoading(false);
        const errorLower = (prepData.error || '').toLowerCase();
        let userMessage = prepData.error || "Something went wrong. Please try again.";
        
        if (errorLower.includes('already exists') || errorLower.includes('duplicate')) {
          userMessage = "An account with this email already exists. Please sign in.";
        }
        
        setError(userMessage);
        triggerHaptic('error');
        return;
      }

      // Step 2: Trigger Apple IAP payment
      if (prepData.requiresPayment) {
        console.log('[REGISTER] Triggering Apple IAP payment...');
        
        try {
          const { ApplePurchaseService } = await import('@/services/applePurchase');
          
          // Initialize the store if needed
          await ApplePurchaseService.initialize();
          
          // Wrap callback-based purchase in a Promise
          const purchaseResult = await new Promise<{ success: boolean; receipt?: string; transactionId?: string; error?: string }>((resolve) => {
            ApplePurchaseService.purchase((result) => {
              resolve({
                success: result.success,
                receipt: result.receiptData,
                transactionId: result.transactionId,
                error: result.error,
              });
            });
          });
          
          if (!purchaseResult.success || !purchaseResult.receipt) {
            setIsLoading(false);
            setError(purchaseResult.error || "Payment was not completed. Please try again.");
            triggerHaptic('error');
            return;
          }

          console.log('[REGISTER] Payment successful, completing account creation...');

          // Step 3: Complete account creation with receipt
          const completeResponse = await fetch(getApiUrl('/api/auth/ios/complete'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prepToken: prepData.prepToken,
              receipt: purchaseResult.receipt,
              transactionId: purchaseResult.transactionId,
              productId: 'bjjos',
            }),
          });

          const completeData = await completeResponse.json();

          if (!completeResponse.ok) {
            setIsLoading(false);
            setError(completeData.error || "Account creation failed. Please contact support.");
            triggerHaptic('error');
            return;
          }

          // Success! Save auth and navigate
          triggerHaptic('success');

          if (completeData.token) {
            await saveAuthToken(completeData.token);
          }

          if (completeData.user) {
            await saveUserData(completeData.user);
            localStorage.setItem('mobileUserId', completeData.user.id?.toString() || '1');
            await Preferences.set({ key: 'mobileUserId', value: completeData.user.id?.toString() || '1' });
            window.dispatchEvent(new Event('bjjos-auth-change'));
          }

          toast({
            title: "Welcome to Prof. OS!",
            description: "Your subscription is now active",
          });

          setLocation("/ios-onboarding");

        } catch (purchaseErr: any) {
          console.error('[REGISTER] Purchase error:', purchaseErr);
          setIsLoading(false);
          
          if (purchaseErr.message?.includes('cancel')) {
            setError("Payment was cancelled. No account was created.");
          } else {
            setError("Payment failed. Please try again.");
          }
          triggerHaptic('error');
          return;
        }
      }

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
          <img src="/bjjos-logo.png" alt="BJJ OS" className="h-12 w-auto mx-auto mb-3" />
          <p className="text-gray-400 text-sm leading-relaxed">Thousands of techniques analyzed.</p>
          <p className="text-gray-400 text-sm leading-relaxed">One coach who never forgets.</p>
        </div>

        {/* iOS: Apple Sign In */}
        {isIOS && (
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
        )}

        {/* Android: Google Sign In */}
        {isAndroid && (
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full h-12 bg-white text-black font-semibold hover:bg-gray-200 rounded-lg flex items-center justify-center gap-3"
            data-testid="button-google-sign-in"
          >
            {isGoogleLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </>
            )}
          </Button>
        )}

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

            <p className="text-xs text-zinc-500 text-center mt-6">
              BJJ OS: $19.99/month. Auto-renews monthly. Cancel anytime.
            </p>
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

            <div className="text-center my-6 p-4 bg-zinc-900 rounded-lg">
              <p className="text-sm text-zinc-300">BJJ OS Subscription</p>
              <p className="text-2xl text-white font-bold">$19.99/month</p>
              <p className="text-xs text-zinc-400 mt-1">Auto-renews monthly. Cancel anytime.</p>
            </div>

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
