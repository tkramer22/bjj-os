import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, CreditCard, Tag, X, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PaymentPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("monthly");
  const [referralCode, setReferralCode] = useState("");
  const [referralValidating, setReferralValidating] = useState(false);
  const [referralApplied, setReferralApplied] = useState<{
    code: string;
    discountDescription: string;
  } | null>(null);
  const [referralError, setReferralError] = useState("");

  // Get user info
  const { data: user, isLoading: userLoading } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Redirect to chat if user is already subscribed or lifetime
  useEffect(() => {
    if (user) {
      if (user.subscriptionType === 'lifetime' || user.subscriptionType === 'free_admin_grant') {
        console.log('[PAYMENT] User has lifetime/admin access, redirecting to /chat');
        setLocation("/chat");
      }
      if (user.subscriptionStatus === 'trialing' || user.subscriptionStatus === 'active') {
        console.log('[PAYMENT] User already has active subscription, redirecting to /chat');
        setLocation("/chat");
      }
    }
  }, [user, setLocation]);

  const handleValidateReferral = async () => {
    if (!referralCode.trim()) return;
    
    setReferralValidating(true);
    setReferralError("");
    
    try {
      const response = await apiRequest("POST", "/api/validate-referral", {
        code: referralCode.trim()
      });
      
      const data = await response.json();
      
      if (data.valid) {
        setReferralApplied({
          code: data.code,
          discountDescription: data.discountDescription || "Valid referral code"
        });
        toast({
          title: "Referral code applied!",
          description: data.discountDescription || "Your discount will be applied at checkout.",
        });
      } else {
        setReferralError(data.error || "Invalid referral code");
      }
    } catch (error: any) {
      setReferralError("Failed to validate referral code");
    } finally {
      setReferralValidating(false);
    }
  };

  const handleRemoveReferral = () => {
    setReferralApplied(null);
    setReferralCode("");
    setReferralError("");
  };

  const handleStartTrial = async () => {
    setIsLoading(true);

    try {
      console.log(`[PAYMENT] Creating checkout session for ${selectedPlan} plan`);

      const response = await apiRequest("POST", "/api/create-checkout-session", {
        priceId: selectedPlan,
        referralCode: referralApplied?.code || null,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      console.log('[PAYMENT] Checkout session created:', data);

      if (data.devBypass) {
        // Development mode - redirect directly to success page
        toast({
          title: "Trial Started!",
          description: "Your 7-day trial is now active (dev mode)",
        });
        setLocation(data.url);
      } else {
        // Production mode - redirect to Stripe
        window.location.href = data.url;
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start trial",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  if (userLoading) {
    return (
      <div className="payment-page page-container">
        <div className="payment-loading">
          <Loader2 className="w-8 h-8 animate-spin text-white/60" />
          <p className="text-white/60 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  const monthlyPrice = "$19.99";
  const annualPrice = "$179.88";
  const monthlySavings = "$0";
  const annualSavings = "$0";

  const trialEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const formattedTrialEnd = trialEndDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="payment-page page-container">
      <div className="payment-container">
        {/* Header */}
        <div className="payment-header">
          <h1 className="payment-headline">Complete Your Setup</h1>
          <p className="payment-subheadline">
            Choose your plan and start your 7-day free trial
          </p>
        </div>

        {/* Plan Selection */}
        <div className="plan-selector">
          <button
            onClick={() => setSelectedPlan("monthly")}
            className={`plan-card ${selectedPlan === "monthly" ? "plan-card-selected" : ""}`}
            data-testid="button-plan-monthly"
          >
            <div className="plan-card-header">
              <div className="plan-card-title">Monthly</div>
              {selectedPlan === "monthly" && (
                <div className="plan-card-badge">
                  <Check className="w-4 h-4" />
                </div>
              )}
            </div>
            <div className="plan-card-price">
              {monthlyPrice}<span className="plan-card-period">/month</span>
            </div>
            <div className="plan-card-description">
              Billed monthly, cancel anytime
            </div>
          </button>

          <button
            onClick={() => setSelectedPlan("annual")}
            className={`plan-card ${selectedPlan === "annual" ? "plan-card-selected" : ""}`}
            data-testid="button-plan-annual"
          >
            <div className="plan-card-header">
              <div className="plan-card-title">Annual</div>
              {selectedPlan === "annual" && (
                <div className="plan-card-badge">
                  <Check className="w-4 h-4" />
                </div>
              )}
            </div>
            <div className="plan-card-price">
              {annualPrice}<span className="plan-card-period">/year</span>
            </div>
            <div className="plan-card-description">
              Save 17% with annual billing
            </div>
          </button>
        </div>

        {/* Trial Info */}
        <div className="trial-info">
          <div className="trial-info-badge">7-Day Free Trial</div>
          <p className="trial-info-text">
            You won't be charged until <strong>{formattedTrialEnd}</strong>
          </p>
          <p className="trial-info-subtext">
            Cancel anytime before {formattedTrialEnd} - no charge
          </p>
        </div>

        {/* Referral Code Section */}
        <div className="referral-section">
          <div className="referral-header">
            <Tag className="w-4 h-4" />
            <span>Have a referral code?</span>
          </div>
          
          {referralApplied ? (
            <div className="referral-applied" data-testid="referral-applied">
              <div className="referral-applied-content">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div className="referral-applied-text">
                  <span className="referral-code-display">{referralApplied.code}</span>
                  <span className="referral-discount">{referralApplied.discountDescription}</span>
                </div>
              </div>
              <button 
                onClick={handleRemoveReferral}
                className="referral-remove"
                data-testid="button-remove-referral"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="referral-input-container">
              <Input
                type="text"
                placeholder="Enter referral code"
                value={referralCode}
                onChange={(e) => {
                  setReferralCode(e.target.value.toUpperCase());
                  setReferralError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleValidateReferral();
                  }
                }}
                className="referral-input"
                data-testid="input-referral-code"
              />
              <Button
                onClick={handleValidateReferral}
                disabled={!referralCode.trim() || referralValidating}
                variant="outline"
                className="referral-apply-btn"
                data-testid="button-apply-referral"
              >
                {referralValidating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Apply"
                )}
              </Button>
            </div>
          )}
          
          {referralError && (
            <p className="referral-error" data-testid="referral-error">{referralError}</p>
          )}
        </div>

        {/* Features List */}
        <div className="features-list">
          <h3 className="features-title">What's Included</h3>
          <div className="features-grid">
            <div className="feature-item">
              <Check className="feature-icon" />
              <span>AI-powered BJJ coaching with Professor OS</span>
            </div>
            <div className="feature-item">
              <Check className="feature-icon" />
              <span>Personalized video recommendations</span>
            </div>
            <div className="feature-item">
              <Check className="feature-icon" />
              <span>3-brain memory system that remembers you</span>
            </div>
            <div className="feature-item">
              <Check className="feature-icon" />
              <span>Daily technique drills tailored to your level</span>
            </div>
            <div className="feature-item">
              <Check className="feature-icon" />
              <span>Progress tracking and performance analytics</span>
            </div>
            <div className="feature-item">
              <Check className="feature-icon" />
              <span>Access to 300+ curated BJJ technique videos</span>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <Button
          onClick={handleStartTrial}
          disabled={isLoading}
          className="payment-cta"
          data-testid="button-start-trial"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Starting Trial...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5 mr-2" />
              Start 7-Day Free Trial
            </>
          )}
        </Button>

        {/* Trust Signals */}
        <div className="trust-signals">
          <p className="trust-text">🔒 Secure payment powered by Stripe</p>
          <p className="trust-text">✓ Cancel anytime, no questions asked</p>
        </div>
      </div>

      <style>{`
        /* ==================== VARIABLES ==================== */
        :root {
          --black: #000000;
          --black-elevated: #0F0F0F;
          --white: #FFFFFF;
          --gray-light: #A0A0A0;
          --gray-medium: #71717A;
          --gray-dark: #1A1A1A;
          --blue: #2563EB;
          --purple: #7C3AED;
        }

        /* ==================== BASE STYLES ==================== */
        .payment-page {
          background: radial-gradient(circle at 50% 0%, #0A0812 0%, #15111F 50%, #0A0812 100%);
          color: var(--white);
          min-height: 100vh;
          padding: 80px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .payment-container {
          width: 100%;
          max-width: 700px;
        }

        .payment-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
        }

        /* ==================== HEADER ==================== */
        .payment-header {
          text-align: center;
          margin-bottom: 48px;
        }

        .payment-headline {
          font-size: 48px;
          font-weight: 700;
          color: var(--white);
          line-height: 1.1;
          letter-spacing: -0.01em;
          margin-bottom: 16px;
        }

        .payment-subheadline {
          font-size: 18px;
          font-weight: 400;
          color: var(--gray-light);
          line-height: 1.6;
        }

        /* ==================== PLAN SELECTOR ==================== */
        .plan-selector {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 32px;
        }

        .plan-card {
          background: var(--black-elevated);
          border: 2px solid rgba(255, 255, 255, 0.1);
          padding: 24px;
          cursor: pointer;
          transition: all 150ms ease;
          text-align: left;
        }

        .plan-card:hover {
          border-color: rgba(255, 255, 255, 0.2);
        }

        .plan-card-selected {
          border-color: var(--purple);
          background: rgba(124, 58, 237, 0.1);
        }

        .plan-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .plan-card-title {
          font-size: 20px;
          font-weight: 700;
          color: var(--white);
        }

        .plan-card-badge {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--purple);
          color: var(--white);
          display: flex;
          align-items: center;
          justify-center;
        }

        .plan-card-price {
          font-size: 32px;
          font-weight: 700;
          color: var(--white);
          margin-bottom: 8px;
        }

        .plan-card-period {
          font-size: 16px;
          font-weight: 400;
          color: var(--gray-light);
        }

        .plan-card-description {
          font-size: 14px;
          color: var(--gray-light);
        }

        /* ==================== TRIAL INFO ==================== */
        .trial-info {
          background: rgba(124, 58, 237, 0.1);
          border: 1px solid rgba(124, 58, 237, 0.3);
          padding: 24px;
          text-align: center;
          margin-bottom: 32px;
        }

        .trial-info-badge {
          font-size: 18px;
          font-weight: 700;
          color: var(--white);
          margin-bottom: 12px;
        }

        .trial-info-text {
          font-size: 16px;
          color: var(--white);
          margin-bottom: 8px;
        }

        .trial-info-subtext {
          font-size: 14px;
          color: var(--gray-light);
        }

        /* ==================== REFERRAL CODE ==================== */
        .referral-section {
          background: var(--black-elevated);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 20px;
          margin-bottom: 32px;
        }

        .referral-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--gray-light);
          font-size: 14px;
          margin-bottom: 12px;
        }

        .referral-input-container {
          display: flex;
          gap: 8px;
        }

        .referral-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: var(--white);
          text-transform: uppercase;
        }

        .referral-input::placeholder {
          color: var(--gray-medium);
          text-transform: none;
        }

        .referral-apply-btn {
          min-width: 80px;
          border-color: rgba(255, 255, 255, 0.2);
          color: var(--white);
        }

        .referral-applied {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          padding: 12px 16px;
        }

        .referral-applied-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .referral-applied-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .referral-code-display {
          font-weight: 700;
          color: var(--white);
          font-size: 14px;
        }

        .referral-discount {
          font-size: 13px;
          color: rgb(34, 197, 94);
        }

        .referral-remove {
          background: transparent;
          border: none;
          color: var(--gray-light);
          cursor: pointer;
          padding: 4px;
          transition: color 150ms ease;
        }

        .referral-remove:hover {
          color: var(--white);
        }

        .referral-error {
          color: rgb(239, 68, 68);
          font-size: 13px;
          margin-top: 8px;
        }

        /* ==================== FEATURES ==================== */
        .features-list {
          margin-bottom: 32px;
        }

        .features-title {
          font-size: 20px;
          font-weight: 700;
          color: var(--white);
          margin-bottom: 16px;
        }

        .features-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 16px;
          color: var(--white);
        }

        .feature-icon {
          width: 20px;
          height: 20px;
          color: var(--purple);
          flex-shrink: 0;
        }

        /* ==================== CTA BUTTON ==================== */
        .payment-cta {
          width: 100%;
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          border: none;
          font-weight: 700;
          font-size: 18px;
          color: var(--white);
          padding: 20px 48px;
          cursor: pointer;
          transition: all 150ms ease;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
          min-height: 60px;
        }

        .payment-cta:hover:not(:disabled) {
          background: linear-gradient(135deg, #1D4ED8 0%, #6D28D9 100%);
        }

        .payment-cta:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* ==================== TRUST SIGNALS ==================== */
        .trust-signals {
          text-align: center;
        }

        .trust-text {
          font-size: 14px;
          color: var(--gray-light);
          margin-bottom: 8px;
        }

        /* ==================== MOBILE RESPONSIVE ==================== */
        @media (max-width: 768px) {
          .payment-page {
            padding: 60px 20px;
          }

          .payment-headline {
            font-size: 36px;
          }

          .plan-selector {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
