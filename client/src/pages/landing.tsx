import { useEffect } from "react";
import { useLocation } from "wouter";
import { SiInstagram } from "react-icons/si";

export default function Landing() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Intersection Observer for scroll fade-ins
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

    // Mouse tracking for cursor glow (comparison section)
    const comparisonSection = document.querySelector('.landing-comparison');
    
    if (comparisonSection) {
      const handleMouseMove = (e: Event) => {
        const mouseEvent = e as unknown as MouseEvent;
        const rect = comparisonSection.getBoundingClientRect();
        const x = ((mouseEvent.clientX - rect.left) / rect.width) * 100;
        const y = ((mouseEvent.clientY - rect.top) / rect.height) * 100;
        
        (comparisonSection as HTMLElement).style.setProperty('--mouse-x', `${x}%`);
        (comparisonSection as HTMLElement).style.setProperty('--mouse-y', `${y}%`);
      };
      
      const handleMouseLeave = () => {
        (comparisonSection as HTMLElement).style.setProperty('--mouse-x', '50%');
        (comparisonSection as HTMLElement).style.setProperty('--mouse-y', '50%');
      };
      
      comparisonSection.addEventListener('mousemove', handleMouseMove as EventListener);
      comparisonSection.addEventListener('mouseleave', handleMouseLeave as EventListener);
      
      return () => {
        observer.disconnect();
        comparisonSection.removeEventListener('mousemove', handleMouseMove as EventListener);
        comparisonSection.removeEventListener('mouseleave', handleMouseLeave as EventListener);
      };
    }

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

      {/* Hero Section - ELEVATED */}
      <section className="landing-hero hero-section">
        <div className="landing-hero-content">
          <h1 className="landing-hero-headline">
            Stop training blindly.
            <br />
            Start training with intelligence.
          </h1>
          
          <p className="landing-hero-paragraph">
            Prof. OS autonomously searches and analyzes BJJ instructional content every day—finding videos buried deep in YouTube you'd never discover, rating quality, verifying instructor credentials, timestamping the exact moments that matter. The database grows continuously, learning which instruction actually works. No more 20-minute tutorials. No more sifting through beginners teaching beginners. Just the best instruction, curated and ready.
          </p>
          
          <p className="landing-hero-paragraph">
            It learns your game at every level. Beginners discover why they keep getting caught in the same submissions. Intermediates identify which techniques work for their body type and which don't. Advanced players track success rates across hundreds of positions, spot subtle patterns in their competition footage, and compare their game against population data from thousands of grapplers—insights no single coach could provide. The intelligence scales with you.
          </p>
          
          <button 
            className="landing-cta-button cta-button"
            onClick={() => setLocation('/pricing')}
            data-testid="button-start-trial"
          >
            Start 7-Day Trial
          </button>
          
          <p className="landing-trust-line">
            Used by white belts learning fundamentals to black belts preparing for Worlds
          </p>
        </div>
      </section>

      {/* With/Without Comparison */}
      <section className="landing-comparison comparison-section">
        <div className="landing-comparison-content">
          <div className="landing-comparison-grid">
            <div className="landing-comparison-column landing-without-column">
              <h3 className="landing-comparison-header">WITHOUT PROF. OS</h3>
              <div className="landing-comparison-items">
                <p className="landing-without-item"><span className="landing-without-indicator">—</span> Forget techniques from class by next session</p>
                <p className="landing-without-item"><span className="landing-without-indicator">—</span> Watch random YouTube for hours hoping something sticks</p>
                <p className="landing-without-item"><span className="landing-without-indicator">—</span> Wonder if you're actually improving</p>
                <p className="landing-without-item"><span className="landing-without-indicator">—</span> Repeat the same mistakes for months</p>
              </div>
            </div>
            
            <div className="landing-comparison-column landing-with-column">
              <h3 className="landing-comparison-header landing-with-header">WITH PROF. OS</h3>
              <div className="landing-comparison-items">
                <p className="landing-with-item"><span className="landing-with-indicator">✓</span> Remember every technique, tracked with full context</p>
                <p className="landing-with-item"><span className="landing-with-indicator">✓</span> Get the exact video you need—saved and organized by technique and instructor</p>
                <p className="landing-with-item"><span className="landing-with-indicator">✓</span> Know exactly what to drill next session</p>
                <p className="landing-with-item"><span className="landing-with-indicator">✓</span> Build a complete model of your game over time</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="landing-how-it-works how-it-works-section">
        <div className="landing-how-content">
          <h2 className="landing-section-header">THREE STEPS TO SMARTER TRAINING</h2>
          
          <div className="landing-steps-grid">
            <div className="landing-step step-card">
              <div className="landing-step-number">1.</div>
              <h3 className="landing-step-title">LOG YOUR SESSIONS</h3>
              <p className="landing-step-subtitle">(30 seconds)</p>
              <p className="landing-step-description">
                Voice or text. "Drilled triangles, got swept from half guard twice."
              </p>
            </div>
            
            <div className="landing-step step-card">
              <div className="landing-step-number">2.</div>
              <h3 className="landing-step-title">GET PERSONALIZED COACHING</h3>
              <p className="landing-step-description">
                Prof. OS analyzes your patterns, recommends what to work on, suggests specific videos.
              </p>
            </div>
            
            <div className="landing-step step-card">
              <div className="landing-step-number">3.</div>
              <h3 className="landing-step-title">WATCH IT GET SMARTER</h3>
              <p className="landing-step-description">
                The more you use it, the better it understands your game. Intelligence that compounds.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Video Library Callout */}
      <section className="landing-video-library video-library-section">
        <div className="landing-video-content">
          <h2 className="landing-video-library-header">YOUR PERSONAL VIDEO LIBRARY</h2>
          <p className="landing-video-description">
            Save any video Prof. OS recommends. They're automatically organized by technique and instructor—not a messy pile of bookmarks. Curated, timestamped, ready when you need them.
          </p>
        </div>
      </section>

      {/* Final CTA - ELEVATED */}
      <section className="landing-final-cta final-cta-section">
        <div className="landing-final-content">
          <h2 className="landing-final-headline">
            Start your 7-day trial.
          </h2>
          <p className="landing-final-subheadline">
            No commitment. Cancel anytime.
          </p>
          
          <button 
            className="landing-cta-button cta-button"
            onClick={() => setLocation('/pricing')}
            data-testid="button-start-trial-footer"
          >
            Start 7-Day Trial
          </button>
          
          <p className="landing-final-footer">
            You'll log your first session in under 60 seconds.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-content">
          <div className="landing-footer-links">
            <span className="landing-footer-coming-soon">
              Mobile App <span className="landing-coming-soon-label">(Coming Soon)</span>
            </span>
            <a href="mailto:support@bjjos.app" className="landing-footer-link footer-link" data-testid="link-support">support@bjjos.app</a>
            <a href="/privacy" className="landing-footer-link footer-link" data-testid="link-privacy">Privacy Policy</a>
            <a href="/terms" className="landing-footer-link footer-link" data-testid="link-terms">Terms of Service</a>
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
          --green-dim: rgba(34, 197, 94, 0.1);
          --green-glow: rgba(34, 197, 94, 0.3);
          --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
          --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          
          /* Typography Scale - 5 Levels */
          --text-hero: clamp(48px, 8vw, 72px);
          --text-section: clamp(24px, 4vw, 36px);
          --text-subhead: clamp(16px, 2.5vw, 20px);
          --text-body: clamp(16px, 2vw, 18px);
          --text-small: clamp(12px, 1.5vw, 14px);
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

        /* Sections start invisible and below */
        section {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }

        /* Hero is immediately visible */
        .hero-section {
          opacity: 1 !important;
          transform: translateY(0) !important;
          transition: none !important;
        }

        /* Visible state (triggered by Intersection Observer) */
        section.visible {
          opacity: 1;
          transform: translateY(0);
          will-change: auto;
        }

        /* Gradient animation on buttons */
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
          font-feature-settings: "liga" 1, "kern" 1;
          position: relative;
        }

        /* Subtle grain texture overlay */
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
          padding: 0 40px;
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
          height: 36px;
          width: auto;
        }

        .landing-nav-right {
          display: flex;
          align-items: center;
          gap: 24px;
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
          padding: 16px;
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
          font-size: 15px;
          color: var(--white);
          padding: 12px 24px;
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

        /* ==================== HERO SECTION (ELEVATED) ==================== */
        .landing-hero {
          background: var(--black-elevated);
          padding: calc(140px + 72px) 40px 140px;
          position: relative;
        }

        .landing-hero-content {
          max-width: 1200px;
          margin: 0 auto;
        }

        /* LEVEL 1: Hero - Largest */
        .landing-hero-headline {
          font-family: var(--font-mono);
          font-size: var(--text-hero);
          font-weight: 700;
          line-height: 1.05;
          letter-spacing: -0.03em;
          color: var(--white);
          max-width: 900px;
          margin: 0 auto 48px;
          user-select: text;
        }

        /* LEVEL 4: Body - Comfortable reading */
        .landing-hero-paragraph {
          font-family: var(--font-sans);
          font-size: var(--text-body);
          font-weight: 400;
          line-height: 1.75;
          color: var(--gray-light);
          max-width: 720px;
          margin: 0 auto 28px;
          user-select: text;
        }

        .landing-hero-paragraph:last-of-type {
          margin-bottom: 72px;
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
          margin: 0 auto 20px;
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

        .landing-cta-button:focus-visible {
          box-shadow: 
            0 0 0 2px var(--black),
            0 0 0 4px var(--blue),
            0 0 0 6px var(--purple);
          outline: none;
        }

        /* LEVEL 5: Small - Captions */
        .landing-trust-line {
          font-family: var(--font-sans);
          font-size: var(--text-small);
          font-weight: 400;
          color: var(--gray-medium);
          line-height: 1.5;
          text-align: center;
          max-width: 600px;
          margin: 0 auto;
          user-select: text;
        }

        /* ==================== COMPARISON SECTION ==================== */
        .landing-comparison {
          background: var(--black);
          padding: 120px 40px;
          margin-top: 0;
          position: relative;
          overflow: hidden;
        }

        /* Cursor glow effect */
        .landing-comparison::before {
          content: '';
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
          background: radial-gradient(
            circle 200px at var(--mouse-x, 50%) var(--mouse-y, 50%),
            rgba(37, 99, 235, 0.03),
            transparent 80%
          );
          pointer-events: none;
          transition: opacity 0.3s ease;
          opacity: 0;
          z-index: 0;
        }

        .landing-comparison:hover::before {
          opacity: 1;
        }

        .landing-comparison-content {
          max-width: 1000px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        .landing-comparison-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 100px;
          position: relative;
        }

        /* Vertical divider line (desktop only) */
        .landing-comparison-grid::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 60px;
          bottom: 0;
          width: 1px;
          background: var(--gray-dark);
          transform: translateX(-50%);
        }

        /* LEVEL 3: Sub-headlines */
        .landing-comparison-header {
          font-family: var(--font-mono);
          font-size: var(--text-subhead);
          font-weight: 700;
          color: var(--gray-dim);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin: 0 0 40px;
        }

        .landing-with-header {
          color: var(--white);
        }

        .landing-comparison-items {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .landing-comparison-items p {
          font-family: var(--font-sans);
          font-size: var(--text-body);
          line-height: 1.6;
          margin: 0;
          user-select: text;
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        /* WITHOUT items - Dimmed but readable */
        .landing-without-item {
          color: var(--gray-medium);
        }

        .landing-without-indicator {
          color: var(--gray-medium);
          font-size: 16px;
          font-weight: 400;
          flex-shrink: 0;
          margin-top: 2px;
        }

        /* WITH items - Bright */
        .landing-with-item {
          color: var(--white);
        }

        .landing-with-indicator {
          color: var(--purple);
          font-size: 16px;
          font-weight: 700;
          flex-shrink: 0;
          margin-top: 1px;
        }

        /* ==================== HOW IT WORKS ==================== */
        .landing-how-it-works {
          background: var(--black);
          padding: 120px 40px;
          margin-top: 0;
        }

        .landing-how-content {
          max-width: 1100px;
          margin: 0 auto;
        }

        /* LEVEL 2: Section Titles */
        .landing-section-header {
          font-family: var(--font-mono);
          font-size: var(--text-section);
          font-weight: 700;
          color: var(--white);
          text-align: center;
          letter-spacing: 0.04em;
          margin: 0 0 72px;
          user-select: text;
        }

        .landing-steps-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 48px;
        }

        .landing-step {
          background: transparent;
          padding: 32px 24px;
          text-align: center;
        }

        .landing-step-number {
          font-family: var(--font-mono);
          font-size: 56px;
          font-weight: 700;
          color: var(--white);
          line-height: 1;
          margin-bottom: 20px;
        }

        /* LEVEL 3: Sub-headlines */
        .landing-step-title {
          font-family: var(--font-mono);
          font-size: var(--text-subhead);
          font-weight: 700;
          color: var(--white);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          line-height: 1.3;
          margin-bottom: 8px;
          user-select: text;
        }

        /* LEVEL 5: Small */
        .landing-step-subtitle {
          font-family: var(--font-sans);
          font-size: var(--text-small);
          font-weight: 400;
          color: var(--gray-medium);
          margin-bottom: 20px;
        }

        /* LEVEL 4: Body */
        .landing-step-description {
          font-family: var(--font-sans);
          font-size: var(--text-body);
          font-weight: 400;
          color: var(--gray-light);
          line-height: 1.7;
          max-width: 280px;
          margin: 0 auto;
          user-select: text;
        }

        /* ==================== VIDEO LIBRARY ==================== */
        .landing-video-library {
          background: var(--black);
          padding: 100px 40px;
          margin-top: 0;
        }

        .landing-video-content {
          max-width: 680px;
          margin: 0 auto;
          text-align: center;
        }

        /* LEVEL 2: Section Titles */
        .landing-video-library-header {
          font-family: var(--font-mono);
          font-size: var(--text-section);
          font-weight: 700;
          color: var(--white);
          letter-spacing: 0.02em;
          margin-bottom: 28px;
          user-select: text;
        }

        /* LEVEL 4: Body */
        .landing-video-description {
          font-family: var(--font-sans);
          font-size: var(--text-body);
          font-weight: 400;
          color: var(--gray-light);
          line-height: 1.75;
          user-select: text;
        }

        /* ==================== FINAL CTA (ELEVATED) ==================== */
        .landing-final-cta {
          background: var(--black-elevated);
          padding: 120px 40px;
          margin-top: 0;
          position: relative;
        }

        .landing-final-content {
          max-width: 600px;
          margin: 0 auto;
          text-align: center;
        }

        .landing-final-headline {
          font-family: var(--font-mono);
          font-size: clamp(36px, 6vw, 52px);
          font-weight: 700;
          color: var(--white);
          line-height: 1.15;
          margin-bottom: 12px;
          user-select: text;
        }

        /* LEVEL 5: Small */
        .landing-final-subheadline {
          font-family: var(--font-sans);
          font-size: var(--text-small);
          font-weight: 400;
          color: var(--gray-medium);
          line-height: 1.6;
          margin-bottom: 56px;
          user-select: text;
        }

        /* LEVEL 5: Small - Visible subtext */
        .landing-final-footer {
          font-family: var(--font-sans);
          font-size: var(--text-small);
          font-weight: 400;
          color: var(--gray-light);
          margin-top: 36px;
          user-select: text;
        }

        /* ==================== FOOTER ==================== */
        .landing-footer {
          background: var(--black);
          padding: 56px 24px;
        }

        .landing-footer-content {
          max-width: 1200px;
          margin: 0 auto;
          text-align: center;
        }

        .landing-footer-links {
          display: flex;
          flex-direction: column;
          gap: 24px;
          margin-bottom: 32px;
        }

        .landing-footer-link,
        .landing-footer-coming-soon {
          font-family: var(--font-sans);
          font-size: 15px;
          font-weight: 400;
          color: var(--gray-light);
          text-decoration: none;
          padding: 12px 0;
          transition: color 150ms ease;
        }

        .landing-footer-link:hover {
          color: var(--white);
        }

        .landing-footer-link:focus-visible {
          box-shadow: 0 0 0 2px var(--black), 0 0 0 4px var(--blue);
          outline: none;
        }

        .landing-coming-soon-label {
          font-size: 12px;
          color: var(--gray-medium);
          font-weight: 400;
          letter-spacing: 0.05em;
        }

        .landing-footer-copyright {
          font-family: var(--font-sans);
          font-size: var(--text-small);
          color: var(--gray-medium);
          border-top: 1px solid var(--gray-dark);
          padding-top: 32px;
          margin-top: 32px;
        }

        .landing-footer-instagram {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 24px;
          color: var(--gray-medium);
          font-size: 20px;
          transition: all 200ms ease;
        }

        .landing-footer-instagram:hover {
          color: var(--white);
          transform: scale(1.1);
        }

        .landing-footer-instagram:focus-visible {
          box-shadow: 0 0 0 2px var(--black), 0 0 0 4px var(--purple);
          outline: none;
          border-radius: 4px;
        }

        /* ==================== MOBILE RESPONSIVE ==================== */
        @media (max-width: 768px) {
          .landing-nav {
            height: 64px;
          }

          .landing-nav-content {
            padding: 0 24px;
          }

          .landing-hero {
            padding: calc(100px + 64px) 24px 100px;
          }

          .landing-hero-headline {
            margin-bottom: 36px;
          }

          .landing-hero-paragraph {
            margin-bottom: 24px;
          }

          .landing-hero-paragraph:last-of-type {
            margin-bottom: 56px;
          }

          .landing-comparison {
            padding: 80px 24px;
          }

          /* Hide cursor glow on mobile */
          .landing-comparison::before {
            display: none;
          }

          .landing-comparison-grid {
            grid-template-columns: 1fr;
            gap: 56px;
          }

          .landing-comparison-grid::before {
            display: none;
          }

          .landing-without-column::after {
            content: '';
            display: block;
            width: 100%;
            height: 1px;
            background: var(--gray-dark);
            margin-top: 48px;
          }

          .landing-how-it-works {
            padding: 80px 24px;
          }

          .landing-section-header {
            margin-bottom: 56px;
          }

          .landing-steps-grid {
            grid-template-columns: 1fr;
            gap: 56px;
          }

          .landing-video-library {
            padding: 80px 24px;
          }

          .landing-final-cta {
            padding: 80px 24px;
          }

          .landing-footer {
            padding: 48px 24px;
          }

          .landing-footer-links {
            flex-direction: column;
            gap: 24px;
          }

          .landing-footer-copyright {
            border-top: 1px solid var(--gray-dark);
            padding-top: 32px;
            margin-top: 32px;
          }
        }

        /* Desktop footer with bullets */
        @media (min-width: 769px) {
          .landing-footer-links {
            flex-direction: row;
            justify-content: center;
            gap: 32px;
            margin-bottom: 16px;
          }

          .landing-footer-link:not(:last-child)::after,
          .landing-footer-coming-soon::after {
            content: '•';
            margin-left: 32px;
            color: var(--gray-dark);
          }

          .landing-footer-copyright {
            border-top: none;
            padding-top: 0;
            margin-top: 0;
          }
        }

        /* Touch Targets (Mobile) */
        @media (max-width: 768px) {
          .landing-nav-login,
          .landing-nav-signup,
          .landing-cta-button {
            min-height: 44px;
            min-width: 44px;
          }
        }

        /* GPU Acceleration for performance */
        section,
        .landing-cta-button,
        .landing-comparison::before {
          will-change: transform, opacity;
          transform: translateZ(0);
          backface-visibility: hidden;
          perspective: 1000px;
        }
      `}</style>
    </div>
  );
}
