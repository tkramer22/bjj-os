import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, ArrowLeft, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { saveAuthToken, saveUserData } from "@/lib/capacitorAuth";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showNoPasswordDialog, setShowNoPasswordDialog] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Email is required");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (!password) {
      setError("Password is required");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.toLowerCase().trim(), 
          password,
          rememberMe 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'NO_PASSWORD_SET') {
          setShowNoPasswordDialog(true);
          return;
        }
        throw new Error(data.error || 'Invalid email or password');
      }

      if (data.sessionToken) {
        await saveAuthToken(data.sessionToken);
      }
      if (data.user) {
        await saveUserData(data.user);
      }

      toast({
        title: "Welcome Back!",
        description: "Successfully logged in",
      });

      if (data.redirect) {
        setLocation(data.redirect);
      } else if (data.user?.onboardingCompleted) {
        setLocation("/chat");
      } else {
        setLocation("/onboarding");
      }

    } catch (err: any) {
      setError(err.message || "Invalid email or password. Please try again.");
      toast({
        title: "Login Failed",
        description: err.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestCode = async () => {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/email/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      if (data.isAdmin) {
        setIsAdmin(true);
      }

      toast({
        title: "Code Sent!",
        description: "Check your email for the 6-digit verification code",
      });

      setStep('code');
    } catch (err: any) {
      setError(err.message || "Failed to send code. Please try again.");
      toast({
        title: "Error",
        description: err.message || "Failed to send verification code",
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
        body: JSON.stringify({ 
          email: email.toLowerCase().trim(), 
          code,
          rememberMe
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.subscriptionExpired) {
          toast({
            title: "Subscription Expired",
            description: "Your subscription has expired. Please resubscribe to continue.",
            variant: "destructive",
          });
          setLocation('/pricing');
          return;
        }
        throw new Error(data.error || 'Invalid verification code');
      }

      if (data.requiresPayment) {
        toast({
          title: "Email Verified!",
          description: "Redirecting to checkout...",
        });
        
        try {
          const checkoutResponse = await fetch('/api/signup/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              email: email.toLowerCase().trim(),
              priceId: 'monthly'
            }),
          });
          
          const checkoutData = await checkoutResponse.json();
          
          if (!checkoutResponse.ok) {
            throw new Error(checkoutData.error || 'Failed to create checkout session');
          }
          
          if (checkoutData.devBypass && checkoutData.token && checkoutData.user) {
            await saveAuthToken(checkoutData.token);
            await saveUserData(checkoutData.user);
            setLocation('/onboarding');
            return;
          }
          
          if (checkoutData.url) {
            window.location.href = checkoutData.url;
          } else {
            throw new Error('No checkout URL received');
          }
        } catch (checkoutErr: any) {
          setError(checkoutErr.message || 'Failed to start checkout');
        }
        return;
      }

      if (!data.token || !data.user) {
        throw new Error('Login failed - no session token received');
      }

      await saveAuthToken(data.token);
      await saveUserData(data.user);

      toast({
        title: "Welcome Back!",
        description: "Successfully logged in",
      });

      if (data.redirect) {
        setLocation(data.redirect);
      } else if (data.user.onboardingCompleted) {
        setLocation("/chat");
      } else {
        setLocation("/onboarding");
      }

    } catch (err: any) {
      setError(err.message || "Invalid code. Please try again.");
      toast({
        title: "Verification Failed",
        description: err.message || "Invalid code",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (showNoPasswordDialog) {
    return (
      <div className="login-page page-container">
        <nav className="login-nav">
          <div className="login-nav-content">
            <div className="login-nav-left">
              <a href="/" className="login-logo-link" data-testid="link-home">
                <img src="/bjjos-logo.png" alt="BJJ OS" className="login-logo-img" />
              </a>
            </div>
          </div>
        </nav>
        <div className="login-container" style={{ textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', margin: '0 auto 24px', background: 'rgba(234, 179, 8, 0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock className="w-8 h-8" style={{ color: '#EAB308' }} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'white', marginBottom: '16px' }}>Password Not Set Up</h2>
          <p style={{ color: '#A0A0A0', marginBottom: '24px', lineHeight: 1.6 }}>
            Your account uses email verification codes. You can either use a verification code to log in, or visit Settings to set up a password.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={() => {
                setShowNoPasswordDialog(false);
                handleRequestCode();
              }}
              className="login-button"
              disabled={isLoading}
              data-testid="button-use-code"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in with verification code'}
            </button>
            <button
              onClick={() => setShowNoPasswordDialog(false)}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '14px 24px', cursor: 'pointer', fontSize: '16px' }}
              data-testid="button-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
        <style>{loginStyles}</style>
      </div>
    );
  }

  return (
    <div className="login-page page-container">
      <nav className="login-nav">
        <div className="login-nav-content">
          <div className="login-nav-left">
            <a href="/" className="login-logo-link" data-testid="link-home">
              <img src="/bjjos-logo.png" alt="BJJ OS" className="login-logo-img" />
            </a>
          </div>
          <div className="login-nav-right">
            <button 
              className="login-nav-signup"
              onClick={() => setLocation('/pricing')}
              data-testid="button-signup"
            >
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      <div className="login-container">
        {step === 'code' && (
          <Button
            variant="ghost"
            onClick={() => setStep('password')}
            className="mb-8 text-white hover:text-white/80"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        )}

        <div className="login-header">
          <h1 className="login-headline">
            {step === 'password' ? 'Welcome Back' : 'Enter Code'}
          </h1>
          <p className="login-subheadline">
            {step === 'password' 
              ? 'Sign in to continue training'
              : isAdmin
                ? 'Use your admin bypass code'
                : `We sent a 6-digit code to ${email}`
            }
          </p>
        </div>

        {step === 'password' && (
          <form onSubmit={handlePasswordLogin} className="login-form">
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  className={`form-input pl-11 ${error ? 'error' : ''}`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-email"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className={`form-input pl-11 pr-11 ${error ? 'error' : ''}`}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-white"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="form-error" data-testid="text-error">
                {error}
              </div>
            )}

            <div className="remember-me-container">
              <label className="remember-me-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="remember-me-checkbox"
                  data-testid="checkbox-remember-me"
                />
                <span className="remember-me-text">Keep me signed in</span>
              </label>
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={isLoading}
              data-testid="button-sign-in"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing In...
                </>
              ) : (
                "Sign In"
              )}
            </button>

            <div className="signup-link">
              <button
                type="button"
                onClick={() => setLocation('/forgot-password')}
                className="signup-link-button"
                data-testid="link-forgot-password"
              >
                Forgot password?
              </button>
            </div>

            <div className="divider">
              <span>OR</span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!email || !email.includes('@')) {
                  setError("Please enter your email first");
                  return;
                }
                handleRequestCode();
              }}
              className="secondary-button"
              disabled={isLoading}
              data-testid="button-use-code"
            >
              Sign in with verification code
            </button>

            <div className="signup-link">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => setLocation('/pricing')}
                className="signup-link-button"
                data-testid="link-signup"
              >
                Sign Up
              </button>
            </div>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleVerifyCode} className="login-form">
            <div className="form-group">
              <label className="form-label text-center block mb-6">
                Enter 6-Digit Code
              </label>
              <div className="flex justify-center mb-4">
                <InputOTP
                  value={code}
                  onChange={setCode}
                  maxLength={6}
                  data-testid="input-code"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error && (
                <div className="form-error text-center" data-testid="text-code-error">
                  {error}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={isLoading || code.length !== 6}
              data-testid="button-verify-code"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify Code"
              )}
            </button>

            <div className="signup-link">
              Didn't receive the code?{" "}
              <button
                type="button"
                onClick={handleRequestCode}
                className="signup-link-button"
                disabled={isLoading}
                data-testid="button-resend"
              >
                Resend Code
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{loginStyles}</style>
    </div>
  );
}

const loginStyles = `
  :root {
    --black: #000000;
    --black-elevated: #0F0F0F;
    --white: #FFFFFF;
    --gray-light: #A0A0A0;
    --gray-medium: #71717A;
    --gray-dark: #1A1A1A;
    --blue: #2563EB;
    --purple: #7C3AED;
    --blue-hover-1: #1D4ED8;
    --purple-hover-1: #6D28D9;
    --red: #EF4444;
  }

  .login-page {
    background: radial-gradient(circle at 50% 0%, #0A0812 0%, #15111F 50%, #0A0812 100%);
    color: var(--white);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    position: relative;
  }

  .login-page::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: 
      url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 9999;
    mix-blend-mode: overlay;
  }

  .login-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: rgba(10, 8, 18, 0.8);
    backdrop-filter: blur(12px);
    height: 72px;
    z-index: 1000;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .login-nav-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 40px;
    height: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .login-nav-left {
    display: flex;
    align-items: center;
  }

  .login-logo-link {
    display: flex;
    align-items: center;
  }

  .login-logo-img {
    height: 36px;
    width: auto;
  }

  .login-nav-right {
    display: flex;
    align-items: center;
  }

  .login-nav-signup {
    background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
    border: none;
    font-weight: 700;
    font-size: 16px;
    color: var(--white);
    padding: 12px 24px;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .login-nav-signup:hover {
    background: linear-gradient(135deg, var(--blue-hover-1) 0%, var(--purple-hover-1) 100%);
  }

  .login-container {
    padding: calc(80px + 72px) 40px 80px;
    max-width: 500px;
    margin: 0 auto;
  }

  .login-header {
    text-align: center;
    margin-bottom: 48px;
  }

  .login-headline {
    font-size: 48px;
    font-weight: 700;
    color: var(--white);
    line-height: 1.1;
    letter-spacing: -0.01em;
    margin-bottom: 16px;
  }

  .login-subheadline {
    font-size: 18px;
    color: var(--gray-light);
    line-height: 1.5;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--gray-light);
  }

  .form-input {
    width: 100%;
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--white);
    font-size: 16px;
    transition: all 200ms ease;
  }

  .form-input:focus {
    outline: none;
    border-color: var(--purple);
    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15);
  }

  .form-input.error {
    border-color: var(--red);
  }

  .form-input::placeholder {
    color: var(--gray-medium);
  }

  .form-error {
    color: var(--red);
    font-size: 14px;
    margin-top: 4px;
  }

  .remember-me-container {
    display: flex;
    align-items: center;
  }

  .remember-me-label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .remember-me-checkbox {
    width: 18px;
    height: 18px;
    accent-color: var(--purple);
    cursor: pointer;
  }

  .remember-me-text {
    font-size: 14px;
    color: var(--gray-light);
  }

  .login-button {
    width: 100%;
    padding: 16px 24px;
    background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
    border: none;
    color: var(--white);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 200ms ease;
  }

  .login-button:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--blue-hover-1) 0%, var(--purple-hover-1) 100%);
  }

  .login-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .secondary-button {
    width: 100%;
    padding: 16px 24px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: var(--white);
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 200ms ease;
  }

  .secondary-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .secondary-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 16px;
    color: var(--gray-medium);
    font-size: 14px;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
  }

  .signup-link {
    text-align: center;
    font-size: 14px;
    color: var(--gray-light);
  }

  .signup-link-button {
    background: none;
    border: none;
    color: var(--purple);
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: color 200ms ease;
  }

  .signup-link-button:hover {
    color: var(--white);
  }

  @media (max-width: 640px) {
    .login-nav-content {
      padding: 0 20px;
    }

    .login-container {
      padding: calc(60px + 72px) 20px 60px;
    }

    .login-headline {
      font-size: 32px;
    }

    .login-subheadline {
      font-size: 16px;
    }
  }
`;
