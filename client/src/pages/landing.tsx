import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { SiInstagram } from "react-icons/si";
import { ChevronDown, X, Star, Smartphone, Award, Check } from "lucide-react";

const APP_STORE_URL = "https://apps.apple.com/us/app/bjj-os/id6757207452";

// Mobile-optimized App Store navigation
const openAppStore = () => {
  window.location.href = APP_STORE_URL;
};

interface ReferralInfo {
  code: string;
  influencerName: string;
  trialDays: number;
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const [showMobileBanner, setShowMobileBanner] = useState(false);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [showCodeField, setShowCodeField] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [codeValidating, setCodeValidating] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [codeApplied, setCodeApplied] = useState(false);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const wasDismissed = localStorage.getItem('appBannerDismissed');
    if (isMobile && !wasDismissed) {
      setShowMobileBanner(true);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      validateReferralCode(refCode);
    }
  }, []);

  const validateReferralCode = async (code: string) => {
    try {
      const response = await fetch(`/api/referral-codes/validate?code=${encodeURIComponent(code)}`);
      const data = await response.json();
      if (data.valid) {
        setReferralInfo({
          code: data.code,
          influencerName: data.influencerName,
          trialDays: data.trialDays,
        });
        sessionStorage.setItem('referralCode', data.code);
        sessionStorage.setItem('trialDays', String(data.trialDays));
      }
    } catch (error) {
      // Silent fail - show standard landing
    }
  };

  const handleApplyManualCode = async () => {
    const code = manualCode.trim().toUpperCase();
    if (!code) return;

    setCodeValidating(true);
    setCodeError("");

    try {
      const response = await fetch(`/api/referral-codes/validate?code=${encodeURIComponent(code)}`);
      const data = await response.json();

      if (data.valid) {
        setReferralInfo({
          code: data.code,
          influencerName: data.influencerName,
          trialDays: data.trialDays,
        });
        setCodeApplied(true);
        setShowCodeField(false);
        sessionStorage.setItem('referralCode', data.code);
        sessionStorage.setItem('trialDays', String(data.trialDays));
      } else {
        setCodeError("Invalid referral code");
      }
    } catch (error) {
      setCodeError("Failed to validate code");
    } finally {
      setCodeValidating(false);
    }
  };

  const handleStartTrial = () => {
    const storedCode = sessionStorage.getItem('referralCode');
    if (storedCode) {
      setLocation(`/signup?ref=${storedCode}`);
    } else {
      setLocation('/signup');
    }
  };

  const defaultTrialDays = 3;
  const trialDays = referralInfo?.trialDays || defaultTrialDays;
  const isReferral = !!referralInfo;

  const dismissBanner = () => {
    setShowMobileBanner(false);
    localStorage.setItem('appBannerDismissed', 'true');
  };

  useEffect(() => {
    const sections = document.querySelectorAll('section:not(.landing-hero)');
    
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };
    
    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    };
    
    const observer = new IntersectionObserver(observerCallback, observerOptions);
    
    sections.forEach(section => {
      observer.observe(section);
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="landing-page page-container">
      {/* Mobile App Store Banner */}
      {showMobileBanner && (
        <div className="app-store-banner" data-testid="banner-app-store-mobile">
          <div className="banner-content">
            <img 
              src="/bjjos-logo.png" 
              alt="BJJ OS" 
              className="banner-app-icon"
            />
            <div className="banner-text">
              <strong>BJJ OS</strong>
              <span>Get the app for the best experience</span>
            </div>
            <button 
              onClick={openAppStore}
              className="banner-cta"
              data-testid="link-app-store-banner"
            >
              GET
            </button>
            <button 
              onClick={dismissBanner}
              className="banner-close"
              aria-label="Close"
              data-testid="button-close-banner"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Navigation Bar */}
      <nav className="landing-nav">
        <div className="landing-nav-content">
          <div className="landing-nav-left">
            <a href="/" className="landing-logo-link" data-testid="link-home">
              <img src="/bjjos-logo.png" alt="BJJ OS" className="landing-logo-img" />
            </a>
          </div>
          <div className="landing-nav-right">
            <button 
              className="landing-nav-login"
              onClick={() => setLocation('/login')}
              data-testid="button-login"
            >
              Login
            </button>
            <button 
              className="landing-nav-signup"
              onClick={() => setLocation('/pricing')}
              data-testid="button-signup"
            >
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      {/* Referral banner at top */}
      {isReferral && (
        <div className="referral-banner" data-testid="banner-referral">
          <span>Referred by {referralInfo.code} — Extended trial activated</span>
        </div>
      )}

      {/* Hero Section - Screen 1 */}
      <section className="landing-hero hero-section">
        <div className="landing-hero-content">
          <h1 className="landing-hero-headline" data-testid="text-hero-heading">
            The smartest Jiu-Jitsu training partner ever built.
            <br />
            5,000+ instructionals studied & analyzed.
            <br />
            Perfect memory.
          </h1>
          <p className="landing-hero-subhead" data-testid="text-hero-subhead">
            You train. It remembers.
            <br />
            You ask. It knows.
          </p>
          
          <div className="hero-ctas">
            <button 
              className="landing-cta-button cta-button"
              onClick={handleStartTrial}
              data-testid="button-start-trial"
            >
              {isReferral ? `Start Your ${trialDays}-Day Free Trial` : 'Start Your Free Trial'}
            </button>
            
            <div 
              onClick={openAppStore}
              className="app-store-link"
              data-testid="link-app-store-hero"
              style={{ cursor: 'pointer', WebkitTapHighlightColor: 'rgba(124, 77, 255, 0.2)', touchAction: 'manipulation' }}
            >
              <img 
                src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us"
                alt="Download on the App Store"
                className="app-store-badge"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              />
            </div>
          </div>
          
          {/* Referral code applied confirmation */}
          {isReferral && (
            <p className="referral-applied-text" data-testid="text-referral-applied">
              Code {referralInfo.code} applied - Extended {trialDays}-day trial!
            </p>
          )}

          {/* Manual referral code entry - only shown for non-referral visitors */}
          {!isReferral && (
            <div className="referral-code-section" data-testid="section-referral-code">
              {!showCodeField ? (
                <p className="referral-toggle-text">
                  <span 
                    className="referral-toggle-link"
                    onClick={() => setShowCodeField(true)}
                    data-testid="link-enter-referral"
                  >
                    Have a referral code?
                  </span>
                </p>
              ) : (
                <div className="referral-code-field" data-testid="div-referral-field">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => { setManualCode(e.target.value.toUpperCase()); setCodeError(""); }}
                    placeholder="Enter code"
                    maxLength={20}
                    className="referral-code-input"
                    data-testid="input-referral-code"
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyManualCode()}
                  />
                  <button
                    onClick={handleApplyManualCode}
                    disabled={codeValidating || !manualCode.trim()}
                    className="referral-apply-button"
                    data-testid="button-apply-referral"
                  >
                    {codeValidating ? '...' : 'Apply'}
                  </button>
                  {codeError && (
                    <p className="referral-error" data-testid="text-referral-error">{codeError}</p>
                  )}
                </div>
              )}
            </div>
          )}
          
          <p className="landing-price-note">
            {isReferral 
              ? `${trialDays}-day free trial. Credit card required. Cancel anytime.`
              : '3-day free trial. Credit card required. Cancel anytime.'}
          </p>
        </div>
        
        {/* Scroll indicator */}
        <div className="landing-scroll-indicator">
          <ChevronDown className="landing-scroll-icon" />
        </div>
      </section>

      {/* Screen 2: The Intelligence - PRIMARY VISUAL WEIGHT */}
      <section className="landing-intelligence intelligence-section">
        <div className="landing-intelligence-content">
          <h2 className="landing-section-header">NOT A SEARCH ENGINE.</h2>
          
          <p className="landing-intelligence-body">
            Prof. OS has analyzed every video—techniques, timestamps, key details.
          </p>
          
          <div className="landing-conversation-snippet">
            <p className="landing-conversation-quote">
              "Why do I keep losing the underhook?"
            </p>
          </div>
          
          <p className="landing-intelligence-body">
            Get breakdowns from multiple world-class coaches—each linked to the exact timestamp you need.
          </p>
        </div>
      </section>

      {/* Screen 3: The Library - SECONDARY VISUAL WEIGHT */}
      <section className="landing-library library-section">
        <div className="landing-library-content">
          <h2 className="landing-section-header">YOUR VIDEO LIBRARY</h2>
          
          <p className="landing-library-body">
            5,000+ videos searchable by technique, position, or instructor. Save what matters. Build your collection.
          </p>
          
          <p className="landing-library-note">
            Growing daily.
          </p>
        </div>
      </section>

      {/* Screen 4: Proof + Final CTA */}
      <section className="landing-proof proof-section">
        <div className="landing-proof-content">
          <div className="landing-checklist">
            <div className="landing-check-item">
              <span className="landing-check-icon">✓</span>
              <span>5,000+ videos analyzed</span>
            </div>
            <div className="landing-check-item">
              <span className="landing-check-icon">✓</span>
              <span>200+ elite instructors</span>
            </div>
            <div className="landing-check-item">
              <span className="landing-check-icon">✓</span>
              <span>New content added daily</span>
            </div>
            <div className="landing-check-item">
              <span className="landing-check-icon">✓</span>
              <span>Every session remembered</span>
            </div>
            <div className="landing-check-item">
              <span className="landing-check-icon">✓</span>
              <span>Your library, your way</span>
            </div>
          </div>
          
          <button 
            className="landing-cta-button cta-button"
            onClick={handleStartTrial}
            data-testid="button-start-trial-footer"
          >
            Start Your {trialDays}-Day Free Trial
          </button>
        </div>
      </section>

      {/* Download Section */}
      <section className="landing-download download-section">
        <div className="landing-download-content">
          <h2 className="landing-download-title">Train Smarter. Grow Faster.</h2>
          <p className="landing-download-subtitle">
            Join elite practitioners using BJJ OS to accelerate their progress
          </p>
          
          <div className="download-options">
            <div 
              onClick={openAppStore}
              className="download-badge-link"
              data-testid="link-app-store-download-section"
              style={{ cursor: 'pointer', WebkitTapHighlightColor: 'rgba(124, 77, 255, 0.2)', touchAction: 'manipulation' }}
            >
              <img 
                src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us"
                alt="Download on the App Store"
                className="download-app-store-badge"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              />
            </div>
            
            <button 
              className="download-web-button"
              onClick={() => setLocation('/pricing')}
              data-testid="button-try-web"
            >
              Try Web Version
            </button>
          </div>
          
          <div className="trust-indicators">
            <div className="trust-indicator">
              <Star className="trust-icon-svg" />
              <span>5.0/5 Rating</span>
            </div>
            <div className="trust-indicator">
              <Smartphone className="trust-icon-svg" />
              <span>iOS & Web</span>
            </div>
            <div className="trust-indicator">
              <Award className="trust-icon-svg" />
              <span>Trusted by Elite Grapplers</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-content">
          <div className="footer-downloads">
            <h4 className="footer-downloads-title">Download the App</h4>
            <div 
              onClick={openAppStore}
              data-testid="link-app-store-footer"
              style={{ cursor: 'pointer', WebkitTapHighlightColor: 'rgba(124, 77, 255, 0.2)', touchAction: 'manipulation' }}
            >
              <img 
                src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us"
                alt="Download on the App Store"
                className="footer-app-store-badge"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              />
            </div>
            <p className="coming-soon">Android coming soon</p>
          </div>
          
          <div className="landing-footer-links">
            <a href="/privacy" className="landing-footer-link footer-link" data-testid="link-privacy">Privacy Policy</a>
            <span className="landing-footer-separator">·</span>
            <a href="/terms" className="landing-footer-link footer-link" data-testid="link-terms">Terms of Service</a>
            <span className="landing-footer-separator">·</span>
            <a href="mailto:support@bjjos.app" className="landing-footer-link footer-link" data-testid="link-support">support@bjjos.app</a>
          </div>
          <a 
            href="https://instagram.com/bjjosapp" 
            target="_blank" 
            rel="noopener noreferrer"
            className="landing-footer-instagram"
            data-testid="link-instagram"
            aria-label="Follow us on Instagram"
          >
            <SiInstagram />
          </a>
          <p className="landing-footer-copyright footer-copyright">© 2025 BJJ OS</p>
        </div>
      </footer>

      <style>{`
        /* ==================== GLOBAL VARIABLES ==================== */
        :root {
          --black: #000000;
          --black-elevated: #0A0A0A;
          --white: #FFFFFF;
          --gray-light: #B0B0B0;
          --gray-medium: #71717A;
          --gray-dim: #52525B;
          --gray-dark: #1A1A1A;
          --blue: #2563EB;
          --purple: #7C3AED;
          --blue-hover-1: #1D4ED8;
          --purple-hover-1: #6D28D9;
          --blue-hover-2: #1E40AF;
          --purple-hover-2: #5B21B6;
          --green: #22C55E;
          --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
          --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          
          /* Typography Scale */
          --text-hero: clamp(36px, 7vw, 56px);
          --text-section: clamp(20px, 4vw, 28px);
          --text-subhead: clamp(18px, 3vw, 24px);
          --text-body: clamp(16px, 2vw, 18px);
          --text-small: clamp(13px, 1.5vw, 15px);
        }

        /* ==================== MOTION SYSTEM ==================== */
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

        html {
          scroll-behavior: smooth;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
        }

        section {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }

        .hero-section {
          opacity: 1 !important;
          transform: translateY(0) !important;
          transition: none !important;
        }

        section.visible {
          opacity: 1;
          transform: translateY(0);
          will-change: auto;
        }

        .cta-button {
          background-size: 200% 200%;
          animation: gradient-shift 8s ease infinite;
        }

        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        /* ==================== BASE STYLES ==================== */
        .landing-page {
          font-family: var(--font-sans);
          background: var(--black);
          color: var(--white);
          min-height: 100vh;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
          position: relative;
        }

        .landing-page::before {
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

        .landing-page * {
          box-sizing: border-box;
        }

        /* ==================== NAVIGATION ==================== */
        .landing-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: var(--black);
          height: 72px;
          z-index: 1000;
          border-bottom: 1px solid var(--gray-dark);
        }

        .landing-nav-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px;
          height: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .landing-nav-left {
          display: flex;
          align-items: center;
        }

        .landing-logo-link {
          display: flex;
          align-items: center;
        }

        .landing-logo-img {
          height: 32px;
          width: auto;
        }

        .landing-nav-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .landing-nav-login {
          background: none;
          border: none;
          font-family: var(--font-sans);
          font-size: 15px;
          font-weight: 500;
          color: var(--gray-light);
          cursor: pointer;
          transition: color 150ms ease;
          padding: 12px;
          user-select: none;
        }

        .landing-nav-login:hover {
          color: var(--white);
        }

        .landing-nav-signup {
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          border: none;
          border-radius: 0;
          font-family: var(--font-sans);
          font-weight: 600;
          font-size: 14px;
          color: var(--white);
          padding: 10px 20px;
          cursor: pointer;
          transition: background 150ms ease;
          user-select: none;
          background-size: 200% 200%;
          animation: gradient-shift 8s ease infinite;
        }

        .landing-nav-signup:hover {
          background: linear-gradient(135deg, var(--blue-hover-1) 0%, var(--purple-hover-1) 100%);
        }

        .landing-nav-signup:active {
          background: linear-gradient(135deg, var(--blue-hover-2) 0%, var(--purple-hover-2) 100%);
          transform: translateY(1px);
        }

        /* ==================== HERO SECTION ==================== */
        .landing-hero {
          background: var(--black);
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 100px 24px 60px;
          position: relative;
          text-align: center;
        }

        .landing-hero-content {
          max-width: 800px;
          margin: 0 auto;
        }

        .landing-hero-headline {
          font-family: var(--font-mono);
          font-size: var(--text-hero);
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.02em;
          color: var(--white);
          margin: 0 0 32px;
          user-select: text;
        }

        .landing-hero-subhead {
          font-family: var(--font-sans);
          font-size: var(--text-subhead);
          font-weight: 400;
          line-height: 1.6;
          color: var(--gray-light);
          margin: 0 0 48px;
          user-select: text;
        }

        .landing-cta-button {
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          border: none;
          border-radius: 0;
          box-shadow: none;
          font-family: var(--font-sans);
          font-weight: 600;
          font-size: 16px;
          color: var(--white);
          padding: 18px 48px;
          cursor: pointer;
          transition: background 150ms ease;
          margin: 0 auto 16px;
          display: block;
          user-select: none;
          will-change: transform;
          transform: translateZ(0);
          backface-visibility: hidden;
        }

        .landing-cta-button:hover {
          background: linear-gradient(135deg, var(--blue-hover-1) 0%, var(--purple-hover-1) 100%);
        }

        .landing-cta-button:active {
          background: linear-gradient(135deg, var(--blue-hover-2) 0%, var(--purple-hover-2) 100%);
          transform: translateY(1px);
        }

        .referral-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          background: linear-gradient(90deg, #7c3aed, #6d28d9);
          padding: 10px 16px;
          text-align: center;
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 500;
          color: white;
          letter-spacing: 0.3px;
        }

        .referral-applied-text {
          font-family: var(--font-sans);
          font-size: var(--text-small);
          font-weight: 500;
          color: #22c55e;
          margin: 12px 0 0 0;
          text-align: center;
        }

        .referral-code-section {
          text-align: center;
          margin-top: 16px;
        }

        .referral-toggle-text {
          font-family: var(--font-sans);
          font-size: var(--text-small);
          color: var(--gray-medium);
          margin: 0;
        }

        .referral-toggle-link {
          color: var(--gray-light);
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
          transition: color 0.2s;
        }

        .referral-toggle-link:hover {
          color: var(--white);
        }

        .referral-code-field {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .referral-code-input {
          font-family: var(--font-mono);
          font-size: 14px;
          padding: 8px 12px;
          border: 1px solid var(--gray-dim);
          border-radius: 6px;
          background: var(--black-elevated);
          color: var(--white);
          width: 160px;
          outline: none;
          text-transform: uppercase;
          letter-spacing: 1px;
          transition: border-color 0.2s;
        }

        .referral-code-input:focus {
          border-color: var(--purple);
        }

        .referral-code-input::placeholder {
          color: var(--gray-dim);
          text-transform: none;
          letter-spacing: normal;
        }

        .referral-apply-button {
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 500;
          padding: 8px 16px;
          border: 1px solid var(--purple);
          border-radius: 6px;
          background: transparent;
          color: var(--purple);
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }

        .referral-apply-button:hover:not(:disabled) {
          background: var(--purple);
          color: var(--white);
        }

        .referral-apply-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .referral-error {
          font-family: var(--font-sans);
          font-size: 12px;
          color: #ef4444;
          margin: 4px 0 0 0;
          width: 100%;
          text-align: center;
        }

        .landing-price-note {
          font-family: var(--font-sans);
          font-size: var(--text-small);
          font-weight: 400;
          color: var(--gray-medium);
          line-height: 1.5;
          text-align: center;
          margin: 0;
        }

        /* Scroll indicator */
        .landing-scroll-indicator {
          position: absolute;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          animation: bounce 2s infinite;
        }

        .landing-scroll-icon {
          width: 24px;
          height: 24px;
          color: var(--gray-dim);
          opacity: 0.6;
        }

        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% {
            transform: translateX(-50%) translateY(0);
          }
          40% {
            transform: translateX(-50%) translateY(-8px);
          }
          60% {
            transform: translateX(-50%) translateY(-4px);
          }
        }

        /* ==================== INTELLIGENCE SECTION (Screen 2) ==================== */
        .landing-intelligence {
          background: var(--black);
          padding: 100px 24px;
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .landing-intelligence-content {
          max-width: 700px;
          margin: 0 auto;
          text-align: center;
        }

        .landing-section-header {
          font-family: var(--font-mono);
          font-size: var(--text-section);
          font-weight: 700;
          color: var(--white);
          letter-spacing: -0.01em;
          margin: 0 0 40px;
          text-transform: uppercase;
        }

        .landing-intelligence-body {
          font-family: var(--font-sans);
          font-size: var(--text-body);
          font-weight: 400;
          line-height: 1.75;
          color: var(--gray-light);
          margin: 0 0 32px;
        }

        .landing-conversation-snippet {
          background: var(--black-elevated);
          border-left: 3px solid var(--purple);
          padding: 24px 32px;
          margin: 40px 0;
        }

        .landing-conversation-quote {
          font-family: var(--font-sans);
          font-size: var(--text-subhead);
          font-weight: 400;
          font-style: italic;
          color: var(--white);
          margin: 0;
          line-height: 1.5;
        }

        /* ==================== LIBRARY SECTION (Screen 3) ==================== */
        .landing-library {
          background: var(--black);
          padding: 80px 24px;
          min-height: 60vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .landing-library-content {
          max-width: 600px;
          margin: 0 auto;
          text-align: center;
        }

        .landing-library-body {
          font-family: var(--font-sans);
          font-size: var(--text-body);
          font-weight: 400;
          line-height: 1.7;
          color: var(--gray-light);
          margin: 0 0 16px;
        }

        .landing-library-note {
          font-family: var(--font-sans);
          font-size: var(--text-small);
          font-weight: 400;
          color: var(--gray-medium);
          margin: 0;
        }

        /* ==================== PROOF SECTION (Screen 4) ==================== */
        .landing-proof {
          background: var(--black);
          padding: 80px 24px 100px;
          min-height: 60vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .landing-proof-content {
          max-width: 500px;
          margin: 0 auto;
          text-align: center;
        }

        .landing-checklist {
          margin-bottom: 48px;
        }

        .landing-check-item {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 16px;
          font-family: var(--font-sans);
          font-size: var(--text-body);
          color: var(--gray-light);
          padding: 12px 0;
          text-align: left;
        }

        .landing-check-icon {
          color: var(--green);
          font-size: 18px;
          font-weight: 700;
          flex-shrink: 0;
        }

        /* ==================== MOBILE APP STORE BANNER ==================== */
        .app-store-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border-bottom: 1px solid rgba(124, 77, 255, 0.3);
          padding: 0.75rem 1rem;
          z-index: 1001;
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from {
            transform: translateY(-100%);
          }
          to {
            transform: translateY(0);
          }
        }

        .banner-content {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .banner-app-icon {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          flex-shrink: 0;
        }

        .banner-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .banner-text strong {
          color: #ffffff;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .banner-text span {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.75rem;
        }

        .banner-cta {
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          color: white;
          padding: 0.5rem 1.5rem;
          border-radius: 20px;
          text-decoration: none;
          font-weight: 600;
          font-size: 0.875rem;
          transition: all 0.2s ease;
        }

        .banner-cta:hover {
          transform: scale(1.05);
        }

        .banner-close {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          padding: 0.25rem;
          transition: color 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .banner-close:hover {
          color: white;
        }

        /* Hide mobile banner on desktop */
        @media (min-width: 769px) {
          .app-store-banner {
            display: none;
          }
        }

        /* ==================== HERO CTAs ==================== */
        .hero-ctas {
          display: flex;
          gap: 1.5rem;
          align-items: center;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 16px;
        }

        .hero-ctas .landing-cta-button {
          margin: 0;
        }

        .app-store-link {
          display: inline-block;
          transition: transform 0.2s ease;
        }

        .app-store-link:hover {
          transform: scale(1.05);
        }

        .app-store-badge {
          height: 52px;
          width: auto;
        }

        @media (max-width: 768px) {
          .hero-ctas {
            flex-direction: column;
            gap: 1rem;
          }
          
          .app-store-badge {
            height: 48px;
          }
        }

        /* ==================== DOWNLOAD SECTION ==================== */
        .landing-download {
          background: linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 100%);
          padding: 80px 24px;
          text-align: center;
          border-top: 1px solid var(--gray-dark);
          border-bottom: 1px solid var(--gray-dark);
        }

        .landing-download-content {
          max-width: 800px;
          margin: 0 auto;
        }

        .landing-download-title {
          font-family: var(--font-mono);
          font-size: clamp(24px, 5vw, 36px);
          font-weight: 700;
          color: var(--white);
          margin: 0 0 16px;
        }

        .landing-download-subtitle {
          font-family: var(--font-sans);
          font-size: var(--text-body);
          color: var(--gray-light);
          margin: 0 0 40px;
        }

        .download-options {
          display: flex;
          gap: 1.5rem;
          justify-content: center;
          align-items: center;
          margin-bottom: 48px;
        }

        .download-badge-link {
          display: inline-block;
          transition: transform 0.2s ease;
        }

        .download-badge-link:hover {
          transform: scale(1.05);
        }

        .download-app-store-badge {
          height: 56px;
        }

        .download-web-button {
          background: transparent;
          border: 2px solid var(--gray-medium);
          border-radius: 0;
          font-family: var(--font-sans);
          font-weight: 600;
          font-size: 15px;
          color: var(--white);
          padding: 14px 28px;
          cursor: pointer;
          transition: all 150ms ease;
        }

        .download-web-button:hover {
          border-color: var(--white);
          background: rgba(255, 255, 255, 0.05);
        }

        .trust-indicators {
          display: flex;
          gap: 3rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .trust-indicator {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--gray-light);
          font-family: var(--font-sans);
          font-size: 0.875rem;
        }

        .trust-icon-svg {
          width: 20px;
          height: 20px;
          color: var(--purple);
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .landing-download {
            padding: 60px 20px;
          }
          
          .download-options {
            flex-direction: column;
            gap: 1rem;
          }
          
          .download-web-button {
            width: 100%;
            max-width: 300px;
          }
          
          .trust-indicators {
            gap: 1.5rem;
          }
        }

        /* ==================== FOOTER DOWNLOADS ==================== */
        .footer-downloads {
          text-align: center;
          margin-bottom: 24px;
        }

        .footer-downloads-title {
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 600;
          color: var(--white);
          margin: 0 0 12px;
        }

        .footer-app-store-badge {
          height: 40px;
          transition: transform 0.2s ease;
        }

        .footer-app-store-badge:hover {
          transform: scale(1.05);
        }

        .coming-soon {
          font-family: var(--font-sans);
          font-size: 12px;
          color: var(--gray-dim);
          margin: 8px 0 0;
        }

        /* ==================== FOOTER ==================== */
        .landing-footer {
          background: var(--black);
          padding: 40px 24px;
          border-top: 1px solid var(--gray-dark);
        }

        .landing-footer-content {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .landing-footer-links {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .landing-footer-link {
          font-family: var(--font-sans);
          font-size: 14px;
          color: var(--gray-medium);
          text-decoration: none;
          transition: color 150ms ease;
        }

        .landing-footer-link:hover {
          color: var(--white);
        }

        .landing-footer-separator {
          color: var(--gray-dim);
        }

        .landing-footer-instagram {
          color: var(--gray-medium);
          font-size: 20px;
          transition: color 150ms ease;
        }

        .landing-footer-instagram:hover {
          color: var(--white);
        }

        .landing-footer-copyright {
          font-family: var(--font-sans);
          font-size: 13px;
          color: var(--gray-dim);
          margin: 0;
        }

        /* ==================== MOBILE RESPONSIVE ==================== */
        @media (max-width: 768px) {
          .landing-nav {
            height: 64px;
          }

          .landing-hero {
            padding: 80px 20px 50px;
            min-height: 100vh;
            min-height: 100dvh;
          }

          .landing-hero-headline {
            font-size: clamp(28px, 8vw, 40px);
            margin-bottom: 24px;
          }

          .landing-hero-subhead {
            font-size: clamp(16px, 4vw, 20px);
            margin-bottom: 40px;
          }

          .landing-cta-button {
            width: 100%;
            max-width: 300px;
            padding: 16px 32px;
          }

          .landing-intelligence {
            padding: 80px 20px;
            min-height: auto;
          }

          .landing-conversation-snippet {
            padding: 20px 24px;
            margin: 32px 0;
          }

          .landing-library {
            padding: 60px 20px;
            min-height: auto;
          }

          .landing-proof {
            padding: 60px 20px 80px;
            min-height: auto;
          }

          .landing-checklist {
            text-align: left;
          }

          .landing-scroll-indicator {
            bottom: 24px;
          }
        }

        /* Touch Targets */
        @media (max-width: 768px) {
          .landing-nav-login,
          .landing-nav-signup,
          .landing-cta-button {
            min-height: 44px;
          }
        }
      `}</style>
    </div>
  );
}
