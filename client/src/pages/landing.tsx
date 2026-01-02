import { useEffect } from "react";
import { useLocation } from "wouter";
import { SiInstagram } from "react-icons/si";
import { ChevronDown } from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();

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

      {/* Hero Section - Screen 1 */}
      <section className="landing-hero hero-section">
        <div className="landing-hero-content">
          <h1 className="landing-hero-headline">
            A training partner who's studied
            <br />
            2,700+ instructionals.
          </h1>
          
          <p className="landing-hero-subhead">
            You train. It remembers.
            <br />
            You ask. It knows.
          </p>
          
          <button 
            className="landing-cta-button cta-button"
            onClick={() => setLocation('/pricing')}
            data-testid="button-start-trial"
          >
            Start 7-Day Free Trial
          </button>
          
          <p className="landing-price-note">
            $19.99/month · Cancel anytime
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
            2,700+ videos searchable by technique, position, or instructor. Save what matters. Build your collection.
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
              <span>2,700+ videos analyzed</span>
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
            onClick={() => setLocation('/pricing')}
            data-testid="button-start-trial-footer"
          >
            Start 7-Day Free Trial
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-content">
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
