import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Eye, EyeOff, ChevronRight, Circle, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

type SignupStep = "email" | "verify" | "checkout" | "password" | "onboarding";
type OnboardingStep = 1 | 2 | 3 | 4;

export default function SignupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const params = new URLSearchParams(window.location.search);
  const urlStep = params.get("step") as SignupStep | null;
  const urlEmail = params.get("email") || "";
  const initialReferralCode = params.get("ref") || sessionStorage.getItem("referralCode") || "";
  const inviteToken = params.get("invite") || "";
  const signupToken = params.get("token") || "";

  const [step, setStep] = useState<SignupStep>(urlStep === "password" && urlEmail && signupToken ? "password" : "email");
  const [email, setEmail] = useState(urlEmail || "");
  const [emailError, setEmailError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [showReferralField, setShowReferralField] = useState(false);
  const [manualReferralCode, setManualReferralCode] = useState("");
  const [referralValidating, setReferralValidating] = useState(false);
  const [referralError, setReferralError] = useState("");
  const [referralTrialDays, setReferralTrialDays] = useState(0);

  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""]);
  const [codeError, setCodeError] = useState("");
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendTimer, setResendTimer] = useState(0);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(1);
  const [onboardingData, setOnboardingData] = useState({
    name: "",
    beltLevel: "",
    style: "",
    heightFeet: 5,
    heightInches: 9,
    heightCm: 175,
    weight: 170,
    useMetric: false,
  });

  const [inviteValid, setInviteValid] = useState(false);
  const [inviteChecked, setInviteChecked] = useState(false);

  const beltLevels = [
    { value: "white", label: "White Belt", color: "#ffffff" },
    { value: "blue", label: "Blue Belt", color: "#3b82f6" },
    { value: "purple", label: "Purple Belt", color: "#a855f7" },
    { value: "brown", label: "Brown Belt", color: "#92400e" },
    { value: "black", label: "Black Belt", color: "#1a1a1a" },
  ];

  const styles = [
    { value: "gi", label: "Gi" },
    { value: "nogi", label: "No-Gi" },
    { value: "both", label: "Both" },
  ];

  useEffect(() => {
    window.scrollTo(0, 0);
    if (signupToken) {
      sessionStorage.setItem("signupToken", signupToken);
    }
    if (inviteToken && !inviteChecked) {
      validateInviteToken();
    }
    if (initialReferralCode) {
      fetchReferralTrialDays(initialReferralCode);
    }
  }, []);

  const fetchReferralTrialDays = async (code: string) => {
    try {
      const response = await fetch(`/api/referral-codes/validate?code=${encodeURIComponent(code)}`);
      const data = await response.json();
      if (data.valid) {
        setReferralTrialDays(data.trialDays || 14);
      }
    } catch {}
  };

  const handleApplyReferralCode = async () => {
    const code = manualReferralCode.trim().toUpperCase();
    if (!code) return;
    setReferralValidating(true);
    setReferralError("");
    try {
      const response = await fetch(`/api/referral-codes/validate?code=${encodeURIComponent(code)}`);
      const data = await response.json();
      if (data.valid) {
        setReferralCode(data.code);
        setReferralTrialDays(data.trialDays || 14);
        setShowReferralField(false);
        sessionStorage.setItem("referralCode", data.code);
        sessionStorage.setItem("trialDays", String(data.trialDays || 14));
      } else {
        setReferralError("Invalid referral code");
      }
    } catch {
      setReferralError("Failed to validate code");
    } finally {
      setReferralValidating(false);
    }
  };

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const validateInviteToken = async () => {
    try {
      const response = await apiRequest("GET", `/api/auth/validate-invite?token=${inviteToken}`);
      const data = await response.json();
      if (data.valid) {
        setInviteValid(true);
        setEmail(data.email || "");
      } else {
        toast({ variant: "destructive", title: "Invalid Invitation", description: data.error || "This invitation link is invalid or has expired." });
        window.history.replaceState({}, "", "/signup");
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to validate invitation link" });
    } finally {
      setInviteChecked(true);
    }
  };

  const handleEmailSubmit = async () => {
    setEmailError("");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) { setEmailError("Email is required"); return; }
    if (!emailRegex.test(email)) { setEmailError("Please enter a valid email address"); return; }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/email/request-code", { email: email.toLowerCase().trim() });
      const data = await response.json();
      if (data.success) {
        setStep("verify");
        setResendTimer(60);
        toast({ title: "Code Sent", description: "Check your email for the 6-digit code" });
      } else if (data.existingAccount) {
        setEmailError("Account already exists. Please log in instead.");
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error || "Failed to send code" });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to send verification code" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...verificationCode];
    newCode[index] = value.slice(-1);
    setVerificationCode(newCode);
    setCodeError("");
    if (value && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }
    const fullCode = newCode.join("");
    if (fullCode.length === 6) {
      verifyCode(fullCode);
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !verificationCode[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setVerificationCode(pasted.split(""));
      verifyCode(pasted);
    }
  };

  const verifyCode = async (code: string) => {
    setIsLoading(true);
    setCodeError("");
    try {
      const response = await apiRequest("POST", "/api/auth/email/verify-code", {
        email: email.toLowerCase().trim(),
        code,
      });
      const data = await response.json();
      if (data.verified || data.success) {
        if (inviteValid && inviteToken) {
          await handleInviteSignup(code);
          return;
        }
        sessionStorage.setItem("signupEmail", email.toLowerCase().trim());
        if (referralCode) sessionStorage.setItem("referralCode", referralCode);
        await startCheckout();
      } else {
        setCodeError(data.error || "Invalid code. Please try again.");
        setVerificationCode(["", "", "", "", "", ""]);
        codeRefs.current[0]?.focus();
      }
    } catch (error: any) {
      let errorMsg = "Verification failed";
      try {
        const parsed = JSON.parse(error.message?.replace(/^\d+:\s*/, "") || "{}");
        if (parsed.error) errorMsg = parsed.error;
      } catch {
        if (error.message) errorMsg = error.message;
      }
      setCodeError(errorMsg);
      setVerificationCode(["", "", "", "", "", ""]);
      codeRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteSignup = async (code: string) => {
    try {
      const response = await apiRequest("POST", "/api/auth/signup-with-invite", {
        email,
        verificationCode: code,
        inviteToken,
      });
      const data = await response.json();
      if (data.success && data.token) {
        localStorage.setItem("sessionToken", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        toast({ title: "Welcome to BJJ OS!", description: "Your lifetime access account has been created" });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setStep("password");
      } else {
        toast({ variant: "destructive", title: "Signup Failed", description: data.error || "Failed to create account" });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create account" });
    }
  };

  const startCheckout = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/signup/checkout", {
        email: email.toLowerCase().trim(),
        referralCode: referralCode || undefined,
      });
      const data = await response.json();
      if (data.existingAccount) {
        toast({ variant: "destructive", title: "Account Exists", description: "This email already has an account. Please log in." });
        setStep("email");
        return;
      }
      if (data.devBypass) {
        localStorage.setItem("sessionToken", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        if (data.signupToken) sessionStorage.setItem("signupToken", data.signupToken);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setStep("password");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error || "Failed to start checkout" });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to start checkout" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0) return;
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/email/request-code", { email: email.toLowerCase().trim() });
      setResendTimer(60);
      toast({ title: "Code Resent", description: "Check your email for the new code" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to resend code" });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
    setPasswordError("");
    if (!password || password.length < 8) { setPasswordError("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { setPasswordError("Passwords do not match"); return; }

    setIsLoading(true);
    const targetEmail = email || urlEmail;
    const pwToken = signupToken || sessionStorage.getItem("signupToken") || "";
    try {
      const response = await apiRequest("POST", "/api/signup/set-password", {
        email: targetEmail.toLowerCase().trim(),
        password,
        token: pwToken,
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem("sessionToken", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setStep("onboarding");
        toast({ title: "Password Set", description: "Now let's set up your profile" });
      } else {
        setPasswordError(data.error || "Failed to set password");
      }
    } catch (error: any) {
      setPasswordError(error.message || "Failed to set password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnitToggle = (toMetric: boolean) => {
    if (toMetric && !onboardingData.useMetric) {
      const totalInches = onboardingData.heightFeet * 12 + onboardingData.heightInches;
      const cm = Math.round(totalInches * 2.54);
      setOnboardingData({ ...onboardingData, heightCm: cm, weight: Math.round(onboardingData.weight / 2.205), useMetric: true });
    } else if (!toMetric && onboardingData.useMetric) {
      const totalInches = Math.round(onboardingData.heightCm / 2.54);
      setOnboardingData({ ...onboardingData, heightFeet: Math.floor(totalInches / 12), heightInches: totalInches % 12, weight: Math.round(onboardingData.weight * 2.205), useMetric: false });
    }
  };

  const handleOnboardingComplete = async () => {
    setIsLoading(true);
    const heightString = onboardingData.useMetric
      ? `${onboardingData.heightCm}cm`
      : `${onboardingData.heightFeet}'${onboardingData.heightInches}"`;

    try {
      await apiRequest("PATCH", "/api/auth/profile", {
        displayName: onboardingData.name.trim(),
        beltLevel: onboardingData.beltLevel,
        style: onboardingData.style,
        height: heightString,
        weight: onboardingData.weight,
        unitPreference: onboardingData.useMetric ? "metric" : "imperial",
        onboardingCompleted: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      window.location.href = "/chat";
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to save profile" });
      setIsLoading(false);
    }
  };

  const visibleSteps: { key: SignupStep; label: string }[] = [
    { key: "email", label: "Email" },
    { key: "verify", label: "Verify" },
    { key: "password", label: "Password" },
    { key: "onboarding", label: "Profile" },
  ];
  const stepOrder: SignupStep[] = visibleSteps.map(s => s.key);
  const currentStepIndex = stepOrder.indexOf(step);

  return (
    <div className="signup-page">
      <nav className="signup-nav">
        <div className="signup-nav-content">
          <a href="/" className="signup-logo-link" data-testid="link-home">
            <img src="/bjjos-logo.png" alt="BJJ OS" className="signup-logo-img" />
          </a>
          <button className="signup-nav-login" onClick={() => setLocation("/login")} data-testid="button-login">
            Log In
          </button>
        </div>
      </nav>

      <div className="signup-container">
        {step !== "onboarding" && (
          <div className="signup-progress" data-testid="div-progress">
            {visibleSteps.map((s, i) => (
              <div key={s.key} className={`progress-step ${i <= currentStepIndex ? "active" : ""} ${i < currentStepIndex ? "completed" : ""}`}>
                <div className="progress-dot">
                  {i < currentStepIndex ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                </div>
                <span className="progress-label">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {step === "email" && (
          <div className="signup-step" data-testid="step-email">
            <h1 className="signup-headline">Start Your Free Trial</h1>
            <p className="signup-subtext">
              {referralCode
                ? `${referralTrialDays || 14}-day free trial. Credit card required. Cancel anytime.`
                : "3-day free trial. Credit card required. Cancel anytime."}
            </p>
            {referralCode && (
              <div className="signup-referral-applied" data-testid="text-referral-applied">
                <Check className="w-4 h-4" />
                <span>Referral code applied — {referralTrialDays || 14}-day trial</span>
              </div>
            )}
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className={`form-input ${emailError ? "error" : ""}`}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                disabled={isLoading}
                autoFocus
                data-testid="input-email"
              />
              {emailError && <div className="form-error" data-testid="text-email-error">{emailError}</div>}
            </div>
            <button className="signup-button" onClick={handleEmailSubmit} disabled={isLoading || !email.trim()} data-testid="button-continue">
              {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</> : "Continue"}
            </button>

            {!referralCode && (
              <div className="signup-referral-section" data-testid="section-referral-code">
                {!showReferralField ? (
                  <p className="referral-toggle-text">
                    <span 
                      className="referral-toggle-link"
                      onClick={() => setShowReferralField(true)}
                      data-testid="link-enter-referral"
                    >
                      Have a referral code?
                    </span>
                  </p>
                ) : (
                  <div className="signup-referral-field" data-testid="div-referral-field">
                    <div className="signup-referral-input-row">
                      <input
                        type="text"
                        value={manualReferralCode}
                        onChange={(e) => { setManualReferralCode(e.target.value.toUpperCase()); setReferralError(""); }}
                        placeholder="Enter code"
                        maxLength={20}
                        className="signup-referral-input"
                        data-testid="input-referral-code"
                        onKeyDown={(e) => e.key === "Enter" && handleApplyReferralCode()}
                        autoFocus
                      />
                      <button
                        onClick={handleApplyReferralCode}
                        disabled={referralValidating || !manualReferralCode.trim()}
                        className="signup-referral-apply"
                        data-testid="button-apply-referral"
                      >
                        {referralValidating ? "..." : "Apply"}
                      </button>
                    </div>
                    {referralError && (
                      <p className="signup-referral-error" data-testid="text-referral-error">{referralError}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="login-link">
              Already have an account?{" "}
              <button type="button" onClick={() => setLocation("/login")} className="login-link-button" data-testid="link-login">
                Log In
              </button>
            </div>
          </div>
        )}

        {step === "verify" && (
          <div className="signup-step" data-testid="step-verify">
            <button className="back-button" onClick={() => setStep("email")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="signup-headline">Check your email</h1>
            <p className="signup-subtext">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>
            <div className="code-input-group" data-testid="div-code-inputs">
              {verificationCode.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { codeRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  className={`code-input ${codeError ? "error" : ""}`}
                  value={digit}
                  onChange={(e) => handleCodeInput(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  onPaste={i === 0 ? handleCodePaste : undefined}
                  disabled={isLoading}
                  autoFocus={i === 0}
                  data-testid={`input-code-${i}`}
                />
              ))}
            </div>
            {codeError && <div className="form-error code-error" data-testid="text-code-error">{codeError}</div>}
            {isLoading && (
              <div className="verify-loading">
                <Loader2 className="w-5 h-5 animate-spin" /> Verifying...
              </div>
            )}
            <div className="resend-section">
              <span className="resend-text">Didn't receive it?</span>
              <button
                className="resend-button"
                onClick={handleResendCode}
                disabled={resendTimer > 0 || isLoading}
                data-testid="button-resend"
              >
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend Code"}
              </button>
            </div>
          </div>
        )}

        {step === "password" && (
          <div className="signup-step" data-testid="step-password">
            <h1 className="signup-headline">Create your password</h1>
            <p className="signup-subtext">Set a password to secure your account</p>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <div className="password-wrapper">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className={`form-input ${passwordError ? "error" : ""}`}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                  disabled={isLoading}
                  autoFocus
                  data-testid="input-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                className={`form-input ${passwordError ? "error" : ""}`}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                disabled={isLoading}
                data-testid="input-confirm-password"
              />
            </div>
            {passwordError && <div className="form-error" data-testid="text-password-error">{passwordError}</div>}
            <button className="signup-button" onClick={handlePasswordSubmit} disabled={isLoading || !password || !confirmPassword} data-testid="button-set-password">
              {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Setting password...</> : "Continue"}
            </button>
          </div>
        )}

        {step === "onboarding" && (
          <div className="signup-step onboarding-step" data-testid="step-onboarding">
            <div className="onboarding-progress">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className={`onboarding-bar ${s <= onboardingStep ? "active" : ""}`} />
              ))}
            </div>
            <p className="onboarding-counter">Step {onboardingStep} of 4</p>

            {onboardingStep === 1 && (
              <div className="onboarding-content" data-testid="onboarding-name">
                <h1 className="signup-headline">Welcome to BJJ OS</h1>
                <p className="signup-subtext">What's your name?</p>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter your first name"
                  value={onboardingData.name}
                  onChange={(e) => setOnboardingData({ ...onboardingData, name: e.target.value })}
                  autoFocus
                  data-testid="input-name"
                />
                <button
                  className="signup-button"
                  onClick={() => onboardingData.name.trim() && setOnboardingStep(2)}
                  disabled={!onboardingData.name.trim()}
                  data-testid="button-next"
                >
                  Continue
                </button>
              </div>
            )}

            {onboardingStep === 2 && (
              <div className="onboarding-content" data-testid="onboarding-belt">
                <h1 className="signup-headline">What's your belt?</h1>
                <p className="signup-subtext">Select your current rank</p>
                <div className="belt-options">
                  {beltLevels.map((belt) => (
                    <button
                      key={belt.value}
                      className={`belt-option ${onboardingData.beltLevel === belt.value ? "selected" : ""}`}
                      onClick={() => {
                        setOnboardingData({ ...onboardingData, beltLevel: belt.value });
                        setOnboardingStep(3);
                      }}
                      data-testid={`belt-${belt.value}`}
                    >
                      <span className="belt-label">
                        <Circle size={20} fill={belt.color} color={belt.value === "white" ? "#666" : belt.color} style={{ flexShrink: 0 }} />
                        <span>{belt.label}</span>
                      </span>
                      <ChevronRight className="w-4 h-4" style={{ opacity: 0.5 }} />
                    </button>
                  ))}
                </div>
                <button className="back-link" onClick={() => setOnboardingStep(1)} data-testid="button-back-belt">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              </div>
            )}

            {onboardingStep === 3 && (
              <div className="onboarding-content" data-testid="onboarding-style">
                <h1 className="signup-headline">What's your style?</h1>
                <p className="signup-subtext">What do you primarily train?</p>
                <div className="style-options">
                  {styles.map((s) => (
                    <button
                      key={s.value}
                      className={`style-option ${onboardingData.style === s.value ? "selected" : ""}`}
                      onClick={() => {
                        setOnboardingData({ ...onboardingData, style: s.value });
                        setOnboardingStep(4);
                      }}
                      data-testid={`style-${s.value}`}
                    >
                      <span>{s.label}</span>
                      <ChevronRight className="w-4 h-4" style={{ opacity: 0.5 }} />
                    </button>
                  ))}
                </div>
                <button className="back-link" onClick={() => setOnboardingStep(2)} data-testid="button-back-style">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              </div>
            )}

            {onboardingStep === 4 && (
              <div className="onboarding-content" data-testid="onboarding-body">
                <h1 className="signup-headline">Height & Weight</h1>
                <p className="signup-subtext">This helps personalize technique suggestions</p>

                <div className="unit-toggle">
                  <button
                    className={`unit-btn ${!onboardingData.useMetric ? "active" : ""}`}
                    onClick={() => handleUnitToggle(false)}
                    data-testid="button-imperial"
                  >
                    Imperial
                  </button>
                  <button
                    className={`unit-btn ${onboardingData.useMetric ? "active" : ""}`}
                    onClick={() => handleUnitToggle(true)}
                    data-testid="button-metric"
                  >
                    Metric
                  </button>
                </div>

                <div className="body-fields">
                  {onboardingData.useMetric ? (
                    <div className="form-group">
                      <label className="form-label">Height (cm)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={onboardingData.heightCm}
                        onChange={(e) => setOnboardingData({ ...onboardingData, heightCm: parseInt(e.target.value) || 0 })}
                        data-testid="input-height-cm"
                      />
                    </div>
                  ) : (
                    <div className="height-imperial">
                      <div className="form-group">
                        <label className="form-label">Feet</label>
                        <input
                          type="number"
                          className="form-input"
                          value={onboardingData.heightFeet}
                          onChange={(e) => setOnboardingData({ ...onboardingData, heightFeet: parseInt(e.target.value) || 0 })}
                          min={3}
                          max={7}
                          data-testid="input-height-feet"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Inches</label>
                        <input
                          type="number"
                          className="form-input"
                          value={onboardingData.heightInches}
                          onChange={(e) => setOnboardingData({ ...onboardingData, heightInches: parseInt(e.target.value) || 0 })}
                          min={0}
                          max={11}
                          data-testid="input-height-inches"
                        />
                      </div>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Weight ({onboardingData.useMetric ? "kg" : "lbs"})</label>
                    <input
                      type="number"
                      className="form-input"
                      value={onboardingData.weight}
                      onChange={(e) => setOnboardingData({ ...onboardingData, weight: parseInt(e.target.value) || 0 })}
                      data-testid="input-weight"
                    />
                  </div>
                </div>

                <button
                  className="signup-button"
                  onClick={handleOnboardingComplete}
                  disabled={isLoading}
                  data-testid="button-finish"
                >
                  {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finishing...</> : "Start Training"}
                </button>
                <button className="back-link" onClick={() => setOnboardingStep(3)} data-testid="button-back-body">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              </div>
            )}

            <button
              className="skip-button"
              onClick={async () => {
                setIsLoading(true);
                try {
                  await apiRequest("PATCH", "/api/auth/profile", { onboardingCompleted: true });
                  await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
                  window.location.href = "/chat";
                } catch (error: any) {
                  toast({ variant: "destructive", title: "Error", description: error.message || "Failed to skip" });
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
              data-testid="button-skip"
            >
              Skip for now
            </button>
          </div>
        )}
      </div>

      <style>{`
        :root {
          --black: #000000;
          --black-elevated: #0F0F0F;
          --white: #FFFFFF;
          --gray-light: #A0A0A0;
          --gray-medium: #71717A;
          --gray-dark: #1A1A1A;
          --blue: #2563EB;
          --purple: #7C3AED;
          --green: #22C55E;
          --red: #EF4444;
          --font-mono: 'JetBrains Mono', monospace;
        }

        .signup-page {
          font-family: var(--font-mono);
          background: radial-gradient(circle at 50% 0%, #0A0812 0%, #15111F 50%, #0A0812 100%);
          color: var(--white);
          min-height: 100vh;
          min-height: 100dvh;
        }

        .signup-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 16px 24px;
          background: rgba(10, 8, 18, 0.85);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(124, 58, 237, 0.1);
        }
        .signup-nav-content {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        .signup-logo-link { display: flex; align-items: center; text-decoration: none; }
        .signup-logo-img { height: 32px; width: auto; }
        .signup-nav-login {
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--gray-light);
          background: transparent;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          padding: 8px 20px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .signup-nav-login:hover { color: var(--white); border-color: rgba(255,255,255,0.3); }

        .signup-container {
          max-width: 440px;
          margin: 0 auto;
          padding: 100px 24px 60px;
        }

        .signup-progress {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          margin-bottom: 40px;
        }
        .progress-step {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .progress-step:not(:last-child)::after {
          content: '';
          display: block;
          width: 32px;
          height: 1px;
          background: rgba(255,255,255,0.1);
          margin: 0 4px;
        }
        .progress-step.active:not(:last-child)::after { background: rgba(124, 58, 237, 0.3); }
        .progress-step.completed:not(:last-child)::after { background: var(--purple); }
        .progress-dot {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
          background: rgba(255,255,255,0.06);
          color: var(--gray-medium);
          border: 1px solid rgba(255,255,255,0.1);
          flex-shrink: 0;
        }
        .progress-step.active .progress-dot {
          background: rgba(124, 58, 237, 0.2);
          color: var(--white);
          border-color: var(--purple);
        }
        .progress-step.completed .progress-dot {
          background: var(--purple);
          color: var(--white);
          border-color: var(--purple);
        }
        .progress-label {
          font-size: 11px;
          color: var(--gray-medium);
          display: none;
        }
        @media (min-width: 480px) {
          .progress-label { display: block; }
        }

        .signup-step { animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .signup-headline {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 8px;
          line-height: 1.2;
        }
        .signup-subtext {
          font-size: 14px;
          color: var(--gray-light);
          margin-bottom: 32px;
          line-height: 1.5;
        }
        .signup-subtext strong { color: var(--white); }

        .signup-referral-applied {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #4ade80;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 24px;
        }

        .signup-referral-section {
          margin-top: 16px;
          margin-bottom: 8px;
          text-align: center;
        }
        .signup-referral-section .referral-toggle-text {
          margin: 0;
        }
        .signup-referral-section .referral-toggle-link {
          color: var(--gray-light);
          font-size: 13px;
          cursor: pointer;
          text-decoration: underline;
          text-decoration-color: rgba(255,255,255,0.2);
          transition: color 0.2s;
        }
        .signup-referral-section .referral-toggle-link:hover {
          color: var(--white);
        }

        .signup-referral-field {
          margin-top: 8px;
        }
        .signup-referral-input-row {
          display: flex;
          gap: 8px;
        }
        .signup-referral-input {
          flex: 1;
          padding: 10px 14px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: var(--white);
          font-family: var(--font-mono);
          font-size: 14px;
          outline: none;
          text-transform: uppercase;
        }
        .signup-referral-input:focus {
          border-color: var(--purple);
        }
        .signup-referral-apply {
          padding: 10px 20px;
          background: var(--purple);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .signup-referral-apply:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .signup-referral-error {
          color: #ef4444;
          font-size: 13px;
          margin-top: 8px;
          text-align: left;
        }

        .form-group { margin-bottom: 20px; }
        .form-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--gray-light);
          margin-bottom: 8px;
        }
        .form-input {
          width: 100%;
          padding: 14px 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          color: var(--white);
          font-family: var(--font-mono);
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .form-input:focus { border-color: var(--purple); }
        .form-input.error { border-color: var(--red); }
        .form-input::placeholder { color: var(--gray-medium); }

        .form-error {
          font-size: 13px;
          color: var(--red);
          margin-top: 6px;
        }

        .password-wrapper { position: relative; }
        .password-toggle {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--gray-medium);
          cursor: pointer;
          padding: 4px;
        }
        .password-toggle:hover { color: var(--white); }

        .signup-button {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          border: none;
          border-radius: 10px;
          color: var(--white);
          font-family: var(--font-mono);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 8px;
        }
        .signup-button:hover:not(:disabled) { opacity: 0.9; }
        .signup-button:active:not(:disabled) { transform: translateY(1px); }
        .signup-button:disabled { opacity: 0.4; cursor: not-allowed; }

        .back-button {
          display: flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: var(--gray-light);
          font-family: var(--font-mono);
          font-size: 13px;
          cursor: pointer;
          padding: 0;
          margin-bottom: 24px;
        }
        .back-button:hover { color: var(--white); }

        .login-link {
          text-align: center;
          margin-top: 24px;
          font-size: 13px;
          color: var(--gray-medium);
        }
        .login-link-button {
          background: none;
          border: none;
          color: var(--purple);
          font-family: var(--font-mono);
          font-size: 13px;
          cursor: pointer;
          text-decoration: underline;
        }

        .code-input-group {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-bottom: 16px;
        }
        .code-input {
          width: 48px;
          height: 56px;
          text-align: center;
          font-size: 22px;
          font-weight: 700;
          font-family: var(--font-mono);
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 10px;
          color: var(--white);
          outline: none;
          transition: border-color 0.2s;
        }
        .code-input:focus { border-color: var(--purple); }
        .code-input.error { border-color: var(--red); }
        .code-error { text-align: center; }

        .verify-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: var(--gray-light);
          font-size: 14px;
          margin: 16px 0;
        }

        .resend-section {
          text-align: center;
          margin-top: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .resend-text { font-size: 13px; color: var(--gray-medium); }
        .resend-button {
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--purple);
          background: none;
          border: none;
          cursor: pointer;
          text-decoration: underline;
        }
        .resend-button:disabled { color: var(--gray-medium); text-decoration: none; cursor: not-allowed; }

        .onboarding-progress {
          display: flex;
          gap: 6px;
          margin-bottom: 8px;
        }
        .onboarding-bar {
          flex: 1;
          height: 4px;
          border-radius: 2px;
          background: rgba(255,255,255,0.08);
          transition: background 0.3s;
        }
        .onboarding-bar.active { background: var(--purple); }
        .onboarding-counter {
          font-size: 13px;
          color: var(--gray-medium);
          margin-bottom: 32px;
        }

        .onboarding-content { animation: fadeIn 0.3s ease; }

        .belt-options, .style-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .belt-option, .style-option {
          padding: 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: var(--white);
          font-family: var(--font-mono);
          font-size: 15px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .belt-option:hover, .style-option:hover {
          border-color: rgba(124, 58, 237, 0.3);
          background: rgba(124, 58, 237, 0.08);
        }
        .belt-option.selected, .style-option.selected {
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(124, 58, 237, 0.2));
          border-color: var(--purple);
        }
        .belt-label {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .back-link {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: none;
          border: none;
          color: var(--gray-medium);
          font-family: var(--font-mono);
          font-size: 13px;
          cursor: pointer;
          margin-top: 16px;
          width: 100%;
          padding: 8px;
        }
        .back-link:hover { color: var(--white); }

        .unit-toggle {
          display: flex;
          background: rgba(255,255,255,0.04);
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 20px;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .unit-btn {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 8px;
          font-family: var(--font-mono);
          font-size: 13px;
          font-weight: 500;
          color: var(--gray-medium);
          background: transparent;
          cursor: pointer;
          transition: all 0.2s;
        }
        .unit-btn.active {
          background: var(--purple);
          color: var(--white);
        }

        .body-fields { margin-bottom: 12px; }
        .height-imperial {
          display: flex;
          gap: 12px;
        }
        .height-imperial .form-group { flex: 1; }

        .skip-button {
          display: block;
          margin: 24px auto 0;
          background: none;
          border: none;
          color: var(--gray-medium);
          font-family: var(--font-mono);
          font-size: 13px;
          cursor: pointer;
          padding: 8px;
        }
        .skip-button:hover { color: var(--purple); }

        @media (max-width: 480px) {
          .signup-container { padding: 80px 16px 40px; }
          .signup-headline { font-size: 24px; }
          .code-input { width: 42px; height: 50px; font-size: 20px; }
          .progress-step:not(:last-child)::after { width: 16px; }
        }
      `}</style>
    </div>
  );
}
