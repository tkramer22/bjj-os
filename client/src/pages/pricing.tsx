import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export default function PricingPage() {
  const [, setLocation] = useLocation();
  const [referralCode, setReferralCode] = useState("");
  const [referralMessage, setReferralMessage] = useState("");
  const [referralValid, setReferralValid] = useState(false);

  useEffect(() => {
    // Smooth scroll to top on page load
    window.scrollTo(0, 0);
  }, []);

  const handleReferralChange = (value: string) => {
    const upperValue = value.toUpperCase();
    setReferralCode(upperValue);
    setReferralMessage("");
    setReferralValid(false);
  };

  const handleApplyReferral = () => {
    if (!referralCode) {
      setReferralMessage("Please enter a referral code");
      setReferralValid(false);
      return;
    }

    // Basic validation: 4-12 alphanumeric characters
    const pattern = /^[A-Z0-9]{4,12}$/;
    if (!pattern.test(referralCode)) {
      setReferralMessage("Invalid code format");
      setReferralValid(false);
      return;
    }

    // For demo: all valid-format codes are accepted
    setReferralMessage(`Code ${referralCode} applied - Extra 30 days free trial!`);
    setReferralValid(true);
  };

  const handleStartTrial = () => {
    const params = new URLSearchParams();
    params.set("plan", "monthly");
    if (referralValid && referralCode) {
      params.set("ref", referralCode);
    }
    setLocation(`/signup?${params.toString()}`);
  };

  return (
    <div className="pricing-page page-container">
      {/* Navigation Bar */}
      <nav className="pricing-nav">
        <div className="pricing-nav-content">
          <div className="pricing-nav-left">
            <a href="/" className="pricing-logo-link" data-testid="link-home">
              <img src="/bjjos-logo.png" alt="BJJ OS" className="pricing-logo-img" />
            </a>
          </div>
          <div className="pricing-nav-right">
            <button 
              className="pricing-nav-login"
              onClick={() => setLocation('/login')}
              data-testid="button-login"
            >
              Login
            </button>
            <button 
              className="pricing-nav-signup"
              onClick={() => setLocation('/pricing')}
              data-testid="button-signup"
            >
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      <div className="pricing-container">
        {/* Page Header */}
        <div className="pricing-header">
          <h1 className="pricing-headline">BJJ OS</h1>
          <p className="pricing-subheadline">
            Your AI-powered BJJ training partner
          </p>
        </div>

        {/* Single Pricing Card */}
        <div className="pricing-single-card" data-testid="card-plan">
          <div className="plan-price-section">
            <div className="plan-price">$19.99</div>
            <div className="plan-period">/month</div>
          </div>
          
          <div className="trial-badge">7-day free trial</div>
          <p className="trial-note">Credit card required. Auto-charges after 7 days. Cancel anytime.</p>

          <div className="features-list">
            <div className="feature-item" data-testid="feature-coaching">
              <span className="feature-check">&#10003;</span>
              <span>Unlimited Professor OS coaching</span>
            </div>
            <div className="feature-item" data-testid="feature-videos">
              <span className="feature-check">&#10003;</span>
              <span>Full video library (thousands of curated techniques, adding more daily)</span>
            </div>
            <div className="feature-item" data-testid="feature-recommendations">
              <span className="feature-check">&#10003;</span>
              <span>Personalized recommendations</span>
            </div>
            <div className="feature-item" data-testid="feature-memory">
              <span className="feature-check">&#10003;</span>
              <span>Training memory that learns your game</span>
            </div>
            <div className="feature-item" data-testid="feature-support">
              <span className="feature-check">&#10003;</span>
              <span>Priority support</span>
            </div>
          </div>

          <button 
            className="start-trial-button"
            onClick={handleStartTrial}
            data-testid="button-start-trial"
          >
            Start 7-Day Free Trial
          </button>
        </div>

        {/* Referral Code Section */}
        <div className="referral-section">
          <div className="referral-header">Have a referral code?</div>
          <div className="referral-input-group">
            <input
              type="text"
              className={`referral-input ${referralValid ? 'valid' : ''} ${referralMessage && !referralValid ? 'invalid' : ''}`}
              placeholder="Enter code"
              value={referralCode}
              onChange={(e) => handleReferralChange(e.target.value)}
              maxLength={12}
              readOnly={referralValid}
              data-testid="input-referral"
            />
            <button 
              className="apply-button"
              onClick={handleApplyReferral}
              disabled={referralValid}
              data-testid="button-apply-referral"
            >
              Apply
            </button>
          </div>
          {referralMessage && (
            <div className={referralValid ? 'referral-success' : 'referral-error'} data-testid="text-referral-message">
              {referralValid && <span className="success-indicator">✓</span>}
              {referralMessage}
            </div>
          )}
        </div>

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
          --green-dim: rgba(34, 197, 94, 0.1);
          --green-glow: rgba(34, 197, 94, 0.3);
          --red: #EF4444;
          --font-mono: 'JetBrains Mono', monospace;
        }

        /* ==================== MOTION SYSTEM ==================== */
        
        /* Respect reduced motion preference */
        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }

        /* Smooth scroll */
        html {
          scroll-behavior: smooth;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
        }

        /* Gradient animation on buttons */
        .continue-button,
        .select-button.selected,
        .pricing-nav-signup {
          background-size: 200% 200%;
          animation: gradient-shift 8s ease infinite;
        }

        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        /* ==================== BASE STYLES ==================== */
        .pricing-page {
          font-family: var(--font-mono);
          background: var(--black);
          color: var(--white);
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
          font-feature-settings: "liga" 1, "kern" 1;
          position: relative;
        }

        /* Subtle grain texture overlay */
        .pricing-page::before {
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
          opacity: 1;
        }

        .pricing-page * {
          box-sizing: border-box;
        }

        /* ==================== NAVIGATION ==================== */
        .pricing-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: var(--black);
          height: 72px;
          z-index: 1000;
          border-bottom: 1px solid var(--gray-dark);
        }

        .pricing-nav-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 40px;
          height: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .pricing-nav-left {
          display: flex;
          align-items: center;
        }

        .pricing-logo-link {
          display: flex;
          align-items: center;
        }

        .pricing-logo-img {
          height: 36px;
          width: auto;
        }

        .pricing-nav-right {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .pricing-nav-login {
          background: none;
          border: none;
          font-family: var(--font-mono);
          font-size: 16px;
          color: var(--gray-light);
          cursor: pointer;
          transition: color 150ms ease;
          padding: 16px;
          user-select: none;
        }

        .pricing-nav-login:hover {
          color: var(--white);
        }

        .pricing-nav-signup {
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          border: none;
          border-radius: 0;
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 16px;
          color: var(--white);
          padding: 12px 24px;
          cursor: pointer;
          transition: background 150ms ease;
          user-select: none;
        }

        .pricing-nav-signup:hover {
          background: linear-gradient(135deg, var(--blue-hover-1) 0%, var(--purple-hover-1) 100%);
        }

        /* ==================== CONTAINER ==================== */
        .pricing-container {
          padding: calc(80px + 72px) 40px 80px; /* Top padding + nav height */
          max-width: 900px;
          margin: 0 auto;
        }

        /* ==================== HEADER ==================== */
        .pricing-header {
          text-align: center;
          margin-bottom: 48px;
        }

        .pricing-headline {
          font-size: 48px;
          font-weight: 700;
          color: var(--white);
          line-height: 1.1;
          letter-spacing: -0.01em;
          margin-bottom: 16px;
        }

        .pricing-subheadline {
          font-size: 16px;
          font-weight: 400;
          color: var(--gray-light);
          line-height: 1.6;
          max-width: 600px;
          margin: 0 auto;
        }

        /* ==================== SINGLE PRICING CARD ==================== */
        .pricing-single-card {
          background: var(--black-elevated);
          padding: 48px;
          max-width: 480px;
          margin: 48px auto;
          text-align: center;
          border: 1px solid var(--gray-dark);
        }

        .plan-price-section {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 4px;
          margin-bottom: 16px;
        }

        .plan-price {
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 56px;
          color: var(--white);
          line-height: 1;
        }

        .plan-period {
          font-family: var(--font-mono);
          font-weight: 400;
          font-size: 18px;
          color: var(--gray-medium);
        }

        .trial-badge {
          display: inline-block;
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          color: var(--white);
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 14px;
          padding: 8px 24px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        .trial-note {
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--gray-medium);
          margin: 0 0 32px;
        }

        .features-list {
          text-align: left;
          margin-bottom: 32px;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: var(--font-mono);
          font-size: 15px;
          color: var(--gray-light);
          padding: 12px 0;
          border-bottom: 1px solid var(--gray-dark);
        }

        .feature-item:last-child {
          border-bottom: none;
        }

        .feature-check {
          color: var(--green);
          font-size: 16px;
          font-weight: 700;
        }

        .start-trial-button {
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          border: none;
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 16px;
          color: var(--white);
          padding: 18px 48px;
          width: 100%;
          cursor: pointer;
          transition: all 150ms ease;
          background-size: 200% 200%;
          animation: gradient-shift 8s ease infinite;
        }

        .start-trial-button:hover {
          background: linear-gradient(135deg, var(--blue-hover-1) 0%, var(--purple-hover-1) 100%);
        }

        .start-trial-button:active {
          transform: translateY(1px);
        }

        /* ==================== REFERRAL SECTION ==================== */
        .referral-section {
          margin: 48px auto 0;
          max-width: 500px;
        }

        .referral-header {
          font-family: var(--font-mono);
          font-weight: 400;
          font-size: 16px;
          color: var(--white);
          margin-bottom: 16px;
          text-align: center;
        }

        .referral-input-group {
          display: flex;
          gap: 16px;
          margin-bottom: 8px;
        }

        /* Referral Input */
        .referral-input {
          background: var(--black-elevated);
          border: 1px solid var(--gray-dark);
          color: var(--white);
          font-family: var(--font-mono);
          font-weight: 400;
          font-size: 16px;
          padding: 12px 16px;
          border-radius: 0;
          flex: 1;
          transition: all 150ms ease;
        }

        .referral-input::placeholder {
          color: var(--gray-medium);
        }

        .referral-input:focus {
          outline: none;
          border: 1px solid var(--blue);
        }

        .referral-input.valid {
          border: 1px solid var(--green);
        }

        .referral-input.invalid {
          border: 1px solid var(--red);
          animation: shake 0.3s ease;
        }

        .referral-input:read-only {
          opacity: 0.7;
          cursor: not-allowed;
          border: 1px solid var(--green);
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }

        /* Apply Button */
        .apply-button {
          background: transparent;
          border: 1px solid var(--blue);
          color: var(--blue);
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 14px;
          padding: 12px 32px;
          border-radius: 0;
          cursor: pointer;
          transition: all 150ms ease;
        }

        .apply-button:hover:not(:disabled) {
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          border: none;
          color: var(--white);
        }

        .apply-button:active {
          transform: translateY(1px);
        }

        .apply-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Success/Error Messages */
        .referral-success {
          font-family: var(--font-mono);
          font-weight: 400;
          font-size: 14px;
          color: var(--green);
          text-shadow: 0 0 20px var(--green-glow);
          margin-top: 8px;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          animation: success-fade-in 0.3s ease;
        }

        @keyframes success-fade-in {
          from { 
            opacity: 0; 
            transform: translateY(-4px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }

        /* Success checkmark animation */
        .success-indicator {
          color: var(--green);
          font-size: 16px;
          animation: checkmark-pop 0.4s ease;
        }

        @keyframes checkmark-pop {
          0% { 
            transform: scale(0); 
            opacity: 0; 
          }
          50% { 
            transform: scale(1.2); 
          }
          100% { 
            transform: scale(1); 
            opacity: 1; 
          }
        }

        .referral-error {
          font-family: var(--font-mono);
          font-weight: 400;
          font-size: 14px;
          color: var(--red);
          margin-top: 8px;
          text-align: center;
        }

        /* ==================== CONTINUE SECTION ==================== */
        .continue-section {
          margin: 64px auto 0;
          max-width: 400px;
          text-align: center;
        }

        .continue-button {
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          border: none;
          border-radius: 0;
          box-shadow: none;
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 16px;
          color: var(--white);
          padding: 18px 48px;
          cursor: pointer;
          transition: all 150ms ease;
          width: 100%;
          max-width: 400px;
          display: block;
          margin: 0 auto 24px;
        }

        .continue-button:hover {
          background: linear-gradient(135deg, var(--blue-hover-1) 0%, var(--purple-hover-1) 100%);
        }

        .continue-button:active {
          background: linear-gradient(135deg, var(--blue-hover-2) 0%, var(--purple-hover-2) 100%);
          transform: translateY(1px);
        }

        .continue-button:disabled {
          background: var(--gray-dark);
          color: var(--gray-medium);
          cursor: not-allowed;
          opacity: 0.5;
        }

        .continue-button:focus {
          outline: 2px solid var(--blue);
          outline-offset: 2px;
        }

        .continue-footer-text {
          font-family: var(--font-mono);
          font-weight: 400;
          font-size: 14px;
          color: var(--gray-medium);
          line-height: 1.5;
        }

        /* ==================== MOBILE RESPONSIVE ==================== */
        @media (max-width: 768px) {
          .pricing-nav {
            height: 64px;
          }

          .pricing-nav-content {
            padding: 0 24px;
          }

          .pricing-container {
            padding: calc(60px + 64px) 24px 60px;
          }

          .pricing-headline {
            font-size: 36px;
          }

          .pricing-cards-grid {
            grid-template-columns: 1fr;
            gap: 24px;
          }

          .pricing-card {
            padding: 32px;
          }

          .referral-input-group {
            flex-direction: column;
            gap: 16px;
          }

          .referral-input,
          .apply-button {
            width: 100%;
          }

          .continue-button {
            width: 100%;
          }
        }

        /* Touch Targets (Mobile) */
        @media (max-width: 768px) {
          .pricing-nav-login,
          .pricing-nav-signup,
          .select-button,
          .apply-button,
          .continue-button {
            min-height: 44px;
            min-width: 44px;
          }
        }
      `}</style>
    </div>
  );
}
