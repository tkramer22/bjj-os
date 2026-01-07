import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Capacitor } from "@capacitor/core";

export default function SignupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  
  // Parse URL params for plan, referral code, and invite token
  const params = new URLSearchParams(window.location.search);
  const selectedPlan = params.get('plan') || 'monthly';
  const referralCode = isIOS ? '' : (params.get('ref') || '');
  const inviteToken = params.get('invite') || '';
  
  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  
  // Invite state
  const [inviteValid, setInviteValid] = useState(false);
  const [inviteChecked, setInviteChecked] = useState(false);
  
  // Validation state
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [isValidatingUsername, setIsValidatingUsername] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    
    // Validate invite token if present
    if (inviteToken && !inviteChecked) {
      validateInviteToken();
    }
  }, []);

  const validateInviteToken = async () => {
    try {
      const response = await apiRequest("GET", `/api/auth/validate-invite?token=${inviteToken}`);
      const data = await response.json();
      
      if (data.valid) {
        setInviteValid(true);
        setEmail(data.email || "");
        toast({
          title: "Lifetime Access Invitation",
          description: "You've been invited to BJJ OS with lifetime access!",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Invalid Invitation",
          description: data.error || "This invitation link is invalid or has expired.",
        });
        // Clear the invite param from URL
        window.history.replaceState({}, '', '/signup');
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to validate invitation link",
      });
    } finally {
      setInviteChecked(true);
    }
  };

  const requestVerificationCode = async () => {
    if (!email) {
      setEmailError("Email is required");
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }
    
    setSendingCode(true);
    try {
      const response = await apiRequest("POST", "/api/auth/email/request-code", { email });
      const data = await response.json();
      
      if (data.success) {
        setCodeSent(true);
        toast({
          title: "Code Sent!",
          description: "Check your email for the verification code",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Send Code",
          description: data.error || "Please try again",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to send verification code",
      });
    } finally {
      setSendingCode(false);
    }
  };

  // Username validation with debouncing
  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      setUsernameSuggestions([]);
      setUsernameError("");
      return;
    }

    const validateUsername = async () => {
      setIsValidatingUsername(true);
      setUsernameError("");

      try {
        const response = await apiRequest("POST", "/api/validate-username", { username });
        const data = await response.json();

        if (data.available) {
          setUsernameAvailable(true);
          setUsernameSuggestions([]);
        } else {
          setUsernameAvailable(false);
          setUsernameSuggestions(data.suggestions || []);
          if (data.error) {
            setUsernameError(data.error);
          }
        }
      } catch (error) {
        setUsernameError("Failed to check username availability");
      } finally {
        setIsValidatingUsername(false);
      }
    };

    const debounceTimer = setTimeout(validateUsername, 500);
    return () => clearTimeout(debounceTimer);
  }, [username]);

  const validateForm = () => {
    let isValid = true;

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setEmailError("Email is required");
      isValid = false;
    } else if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address");
      isValid = false;
    } else {
      setEmailError("");
    }

    // Password validation
    if (!password) {
      setPasswordError("Password is required");
      isValid = false;
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      isValid = false;
    } else {
      setPasswordError("");
    }

    // Confirm password validation
    if (!confirmPassword) {
      setConfirmPasswordError("Please confirm your password");
      isValid = false;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match");
      isValid = false;
    } else {
      setConfirmPasswordError("");
    }

    // Username validation
    if (!username) {
      setUsernameError("Username is required");
      isValid = false;
    } else if (username.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      isValid = false;
    } else if (isValidatingUsername || usernameAvailable === null) {
      setUsernameError("Checking username availability...");
      isValid = false;
    } else if (usernameAvailable === false) {
      setUsernameError("Username is not available");
      isValid = false;
    } else {
      setUsernameError("");
    }

    return isValid;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    // If invite token present, use invite-based signup
    if (inviteToken && inviteValid) {
      if (!verificationCode) {
        toast({
          variant: "destructive",
          title: "Verification Code Required",
          description: "Please enter the verification code sent to your email",
        });
        return;
      }

      setIsLoading(true);
      try {
        const response = await apiRequest("POST", "/api/auth/signup-with-invite", {
          email,
          username: username || undefined,
          verificationCode,
          inviteToken,
        });

        const data = await response.json();

        if (data.success && data.token) {
          // Store session token
          localStorage.setItem('sessionToken', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          
          toast({
            title: "Welcome to BJJ OS!",
            description: "Your lifetime access account has been created",
          });
          
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          setLocation("/onboarding");
        } else {
          toast({
            variant: "destructive",
            title: "Signup Failed",
            description: data.error || "Failed to create account",
          });
        }
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Signup Failed",
          description: error.message || "An error occurred during signup",
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Regular password-based signup - Payment required first
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Validate email and get password hash
      const signupResponse = await apiRequest("POST", "/api/auth/signup", {
        email,
        password,
        referralCode: referralCode || undefined
      });

      const signupData = await signupResponse.json();

      // Check if payment is required (expected for new users)
      if (signupData.requiresPayment) {
        // Store password hash temporarily for after payment
        if (signupData.passwordHash) {
          sessionStorage.setItem('pendingPasswordHash', signupData.passwordHash);
        }
        sessionStorage.setItem('pendingEmail', email);
        
        toast({
          title: "Redirecting to Payment",
          description: "You'll be redirected to complete your subscription...",
        });
        
        // Step 2: Create Stripe checkout session
        const checkoutResponse = await apiRequest("POST", "/api/signup/checkout", {
          email: signupData.email || email,
          priceId: selectedPlan || 'monthly',
          referralCode: referralCode || undefined
        });

        const checkoutData = await checkoutResponse.json();

        if (checkoutData.url) {
          // Redirect to Stripe Checkout
          window.location.href = checkoutData.url;
          return;
        } else if (checkoutData.devBypass) {
          // Dev mode: account created directly
          toast({
            title: "Account Created!",
            description: "Welcome to BJJ OS (Dev Mode)",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          setLocation("/onboarding");
          return;
        } else {
          throw new Error(checkoutData.error || 'Failed to create checkout session');
        }
      }

      // Handle existing account error
      if (signupData.error) {
        toast({
          variant: "destructive",
          title: "Signup Failed",
          description: signupData.error,
        });
        return;
      }

      // Fallback for legacy flow (shouldn't happen now)
      if (signupData.sessionToken && signupData.user) {
        toast({
          title: "Account Created!",
          description: "Welcome to BJJ OS",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation("/onboarding");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Signup Failed",
        description: error.message || "An error occurred during signup",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getPlanDisplay = () => {
    if (selectedPlan === "annual") return "Annual ($149.88/year)";
    if (selectedPlan === "monthly") return "Monthly ($19.99/month)";
    return "Free Preview";
  };

  return (
    <div className="signup-page page-container">
      {/* Navigation Bar */}
      <nav className="signup-nav">
        <div className="signup-nav-content">
          <div className="signup-nav-left">
            <a href="/" className="signup-logo-link" data-testid="link-home">
              <img src="/bjjos-logo.png" alt="BJJ OS" className="signup-logo-img" />
            </a>
          </div>
          <div className="signup-nav-right">
            <button 
              className="signup-nav-login"
              onClick={() => setLocation('/login')}
              data-testid="button-login"
            >
              Login
            </button>
          </div>
        </div>
      </nav>

      <div className="signup-container">
        {/* Page Header */}
        <div className="signup-header">
          <h1 className="signup-headline">
            {inviteValid ? "Accept Your Invitation" : "Create Your Account"}
          </h1>
          <p className="signup-subheadline">
            {inviteValid 
              ? "You've been invited to BJJ OS with lifetime access" 
              : "Start your 7-day free trial today • $19.99/month after trial"
            }
          </p>

          {/* Lifetime Access Badge */}
          {inviteValid && (
            <div className="selected-plan-badge" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)', color: 'white' }} data-testid="badge-lifetime-access">
              🎉 Lifetime Access Invitation
            </div>
          )}
          

          {/* Selected Plan Badge */}
          {!inviteValid && selectedPlan && (
            <div className="selected-plan-badge" data-testid="badge-selected-plan">
              Selected: {getPlanDisplay()}
            </div>
          )}
          {!inviteValid && referralCode && !isIOS && (
            <div className="referral-applied" data-testid="text-referral-applied">
              ✓ Referral code "{referralCode}" will be applied
            </div>
          )}
        </div>

        {/* Signup Form */}
        <form onSubmit={handleSignup} className="signup-form">
          {/* Email */}
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className={`form-input ${emailError ? 'error' : ''}`}
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading || inviteValid}
              readOnly={inviteValid}
              data-testid="input-email"
            />
            {emailError && (
              <div className="form-error" data-testid="text-email-error">
                {emailError}
              </div>
            )}
            {inviteValid && !codeSent && (
              <p className="form-hint">
                Request a verification code to continue
              </p>
            )}
          </div>

          {/* Verification Code (for invite flow) */}
          {inviteValid && (
            <>
              {!codeSent ? (
                <button
                  type="button"
                  onClick={requestVerificationCode}
                  disabled={sendingCode || !email}
                  className="signup-button"
                  style={{ marginBottom: '20px' }}
                  data-testid="button-request-code"
                >
                  {sendingCode ? "Sending Code..." : "Request Verification Code"}
                </button>
              ) : (
                <div className="form-group">
                  <label className="form-label" htmlFor="verificationCode">Verification Code</label>
                  <input
                    id="verificationCode"
                    type="text"
                    className="form-input"
                    placeholder="Enter 6-digit code"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    maxLength={6}
                    disabled={isLoading}
                    data-testid="input-verification-code"
                  />
                  <p className="form-hint">
                    Check your email for the verification code
                  </p>
                </div>
              )}
            </>
          )}

          {/* Password (hidden for invite flow) */}
          {!inviteValid && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  className={`form-input ${passwordError ? 'error' : ''}`}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-password"
                />
                {passwordError && (
                  <div className="form-error" data-testid="text-password-error">
                    {passwordError}
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="form-group">
                <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  className={`form-input ${confirmPasswordError ? 'error' : ''}`}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-confirm-password"
                />
                {confirmPasswordError && (
                  <div className="form-error" data-testid="text-confirm-password-error">
                    {confirmPasswordError}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Username (optional for invite flow, required for regular signup) */}
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Username {inviteValid && <span style={{ opacity: 0.6 }}>(Optional)</span>}
            </label>
            <div className="username-input-wrapper">
              <input
                id="username"
                type="text"
                className={`form-input ${usernameError ? 'error' : ''} ${usernameAvailable ? 'success' : ''}`}
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                disabled={isLoading}
                data-testid="input-username"
              />
              {!inviteValid && (
                <div className="username-status">
                  {isValidatingUsername && (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  )}
                  {!isValidatingUsername && usernameAvailable === true && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" data-testid="icon-available" />
                  )}
                  {!isValidatingUsername && usernameAvailable === false && (
                    <AlertCircle className="w-4 h-4 text-red-500" data-testid="icon-unavailable" />
                  )}
                </div>
              )}
            </div>

            {!inviteValid && usernameAvailable === true && (
              <div className="form-success" data-testid="text-username-available">
                @{username} is available!
              </div>
            )}

            {!inviteValid && usernameError && (
              <div className="form-error" data-testid="text-username-error">
                {usernameError}
              </div>
            )}

            {!inviteValid && usernameAvailable === false && usernameSuggestions.length > 0 && (
              <div className="username-suggestions" data-testid="div-suggestions">
                <p className="suggestions-label">Username taken. Try these:</p>
                <div className="suggestions-list">
                  {usernameSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="suggestion-badge"
                      onClick={() => setUsername(suggestion)}
                      data-testid={`badge-suggestion-${suggestion}`}
                    >
                      @{suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="form-hint">
              {inviteValid 
                ? "Optional - you can add this later in settings" 
                : "3-20 characters, lowercase letters, numbers, and underscores only"
              }
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="signup-button"
            disabled={isLoading || (inviteValid && (!codeSent || !verificationCode))}
            data-testid="button-signup"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating Account...
              </>
            ) : inviteValid ? (
              "Create Account with Lifetime Access"
            ) : (
              "Create Account"
            )}
          </button>

          {/* Login Link */}
          <div className="login-link">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setLocation('/login')}
              className="login-link-button"
              data-testid="link-login"
            >
              Log In
            </button>
          </div>
        </form>
      </div>

      <style>{`
        /* ==================== GLOBAL VARIABLES ==================== */
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
          --blue-hover-2: #1E40AF;
          --purple-hover-2: #5B21B6;
          --green: #22C55E;
          --green-glow: rgba(34, 197, 94, 0.3);
          --red: #EF4444;
          --font-mono: 'JetBrains Mono', monospace;
        }

        /* ==================== BASE STYLES ==================== */
        .signup-page {
          font-family: var(--font-mono);
          background: radial-gradient(circle at 50% 0%, #0A0812 0%, #15111F 50%, #0A0812 100%);
          color: var(--white);
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          position: relative;
        }

        /* Subtle grain texture overlay */
        .signup-page::before {
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

        /* ==================== NAVIGATION ==================== */
        .signup-nav {
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

        .signup-nav-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 40px;
          height: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .signup-nav-left {
          display: flex;
          align-items: center;
        }

        .signup-logo-link {
          display: flex;
          align-items: center;
        }

        .signup-logo-img {
          height: 36px;
          width: auto;
        }

        .signup-nav-right {
          display: flex;
          align-items: center;
        }

        .signup-nav-login {
          background: none;
          border: none;
          font-family: var(--font-mono);
          font-size: 16px;
          color: var(--gray-light);
          cursor: pointer;
          transition: color 150ms ease;
          padding: 16px;
        }

        .signup-nav-login:hover {
          color: var(--white);
        }

        /* ==================== CONTAINER ==================== */
        .signup-container {
          padding: calc(80px + 72px) 40px 80px;
          max-width: 500px;
          margin: 0 auto;
        }

        /* ==================== HEADER ==================== */
        .signup-header {
          text-align: center;
          margin-bottom: 48px;
        }

        .signup-headline {
          font-size: 48px;
          font-weight: 700;
          color: var(--white);
          line-height: 1.1;
          letter-spacing: -0.01em;
          margin-bottom: 16px;
        }

        .signup-subheadline {
          font-size: 16px;
          font-weight: 400;
          color: var(--gray-light);
          line-height: 1.6;
          margin-bottom: 24px;
        }

        .selected-plan-badge {
          display: inline-block;
          font-size: 14px;
          font-weight: 600;
          color: var(--white);
          padding: 8px 16px;
          background: rgba(37, 99, 235, 0.1);
          border: 1px solid rgba(37, 99, 235, 0.3);
          margin-bottom: 8px;
        }

        .referral-applied {
          font-size: 14px;
          color: var(--green);
          text-shadow: 0 0 20px var(--green-glow);
        }

        /* ==================== FORM STYLES ==================== */
        .signup-form {
          background: var(--black-elevated);
          padding: 48px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-label {
          display: block;
          font-family: var(--font-mono);
          font-weight: 600;
          font-size: 14px;
          color: var(--white);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .form-input {
          width: 100%;
          background: var(--black);
          border: 1px solid var(--gray-dark);
          color: var(--white);
          font-family: var(--font-mono);
          font-size: 16px;
          padding: 12px 16px;
          transition: all 150ms ease;
        }

        .form-input::placeholder {
          color: var(--gray-medium);
        }

        .form-input:focus {
          outline: none;
          border: 1px solid var(--blue);
        }

        .form-input.error {
          border: 1px solid var(--red);
        }

        .form-input.success {
          border: 1px solid var(--green);
        }

        .form-error {
          font-size: 14px;
          color: var(--red);
          margin-top: 8px;
        }

        .form-success {
          font-size: 14px;
          color: var(--green);
          text-shadow: 0 0 20px var(--green-glow);
          margin-top: 8px;
        }

        .form-hint {
          font-size: 12px;
          color: var(--gray-medium);
          margin-top: 8px;
        }

        /* Username Input */
        .username-input-wrapper {
          position: relative;
        }

        .username-status {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
        }

        .username-suggestions {
          margin-top: 12px;
        }

        .suggestions-label {
          font-size: 14px;
          color: var(--gray-light);
          margin-bottom: 8px;
        }

        .suggestions-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .suggestion-badge {
          background: transparent;
          border: 1px solid var(--gray-dark);
          color: var(--gray-light);
          font-family: var(--font-mono);
          font-size: 14px;
          padding: 6px 12px;
          cursor: pointer;
          transition: all 150ms ease;
        }

        .suggestion-badge:hover {
          border: 1px solid var(--blue);
          color: var(--blue);
        }

        /* Submit Button */
        .signup-button {
          width: 100%;
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          background-size: 200% 200%;
          animation: gradient-shift 8s ease infinite;
          border: none;
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 16px;
          color: var(--white);
          padding: 18px 48px;
          cursor: pointer;
          transition: all 150ms ease;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 32px;
        }

        .signup-button:hover {
          background: linear-gradient(135deg, var(--blue-hover-1) 0%, var(--purple-hover-1) 100%);
        }

        .signup-button:active {
          transform: translateY(1px);
        }

        .signup-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        /* Login Link */
        .login-link {
          text-align: center;
          font-size: 14px;
          color: var(--gray-light);
          margin-top: 24px;
        }

        .login-link-button {
          background: none;
          border: none;
          color: var(--blue);
          font-family: var(--font-mono);
          font-weight: 600;
          cursor: pointer;
          transition: color 150ms ease;
        }

        .login-link-button:hover {
          color: var(--purple);
          text-decoration: underline;
        }

        /* ==================== MOBILE RESPONSIVE ==================== */
        @media (max-width: 768px) {
          .signup-nav {
            height: 64px;
          }

          .signup-nav-content {
            padding: 0 24px;
          }

          .signup-container {
            padding: calc(60px + 64px) 24px 60px;
          }

          .signup-headline {
            font-size: 36px;
          }

          .signup-form {
            padding: 32px;
          }
        }
      `}</style>
    </div>
  );
}
