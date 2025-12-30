import { useLocation } from "wouter";

export default function Terms() {
  const [, setLocation] = useLocation();

  return (
    <div className="legal-page">
      <nav className="legal-nav">
        <div className="legal-nav-content">
          <div className="legal-nav-left">
            <a href="/" className="legal-logo-link" data-testid="link-home">
              <img src="/bjjos-logo.png" alt="BJJ OS" className="legal-logo-img" />
            </a>
          </div>
          <div className="legal-nav-right">
            <button 
              className="legal-nav-button"
              onClick={() => setLocation('/pricing')}
              data-testid="button-signup"
            >
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      <main className="legal-content">
        <h1 className="legal-title">Terms of Service</h1>
        <p className="legal-updated">Last Updated: December 9, 2025</p>

        <p className="legal-intro">
          Welcome to BJJ OS. By using our platform, you agree to these Terms.
        </p>

        <section className="legal-section">
          <h2 className="legal-section-title">1. Acceptance of Terms</h2>
          <p className="legal-text">By creating an account or using BJJ OS (bjjos.app), you agree to these Terms and our Privacy Policy.</p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">2. Description of Service</h2>
          <p className="legal-text">BJJ OS provides:</p>
          <ul className="legal-list">
            <li>AI-powered BJJ coaching via Professor OS</li>
            <li>Curated instructional video recommendations</li>
            <li>Training session logging</li>
            <li>Personalized technique suggestions</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">3. Account Registration</h2>
          <p className="legal-text">You must:</p>
          <ul className="legal-list">
            <li>Be at least 13 years old</li>
            <li>Provide accurate information</li>
            <li>Maintain account security</li>
            <li>Notify us of unauthorized access</li>
          </ul>
          <p className="legal-text">You are responsible for all activity under your account.</p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">4. Subscription and Payment</h2>
          <div className="legal-subsection">
            <h3 className="legal-subsection-title">Pricing</h3>
            <p className="legal-text">$19.99/month with 7-day free trial</p>
          </div>
          <div className="legal-subsection">
            <h3 className="legal-subsection-title">Billing</h3>
            <ul className="legal-list">
              <li>Payments via Stripe</li>
              <li>Subscriptions auto-renew</li>
              <li>Cancel anytime in settings</li>
            </ul>
          </div>
          <div className="legal-subsection">
            <h3 className="legal-subsection-title">Refunds</h3>
            <ul className="legal-list">
              <li>No charge if cancelled within trial</li>
              <li>No refunds for partial months</li>
              <li>Billing errors refunded upon verification</li>
            </ul>
          </div>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">5. Acceptable Use</h2>
          <p className="legal-text">You agree NOT to:</p>
          <ul className="legal-list">
            <li>Share your account</li>
            <li>Reverse engineer the platform</li>
            <li>Scrape data</li>
            <li>Use for illegal purposes</li>
            <li>Harass others</li>
            <li>Upload harmful content</li>
            <li>Misrepresent identity</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">6. Intellectual Property</h2>
          <div className="legal-subsection">
            <h3 className="legal-subsection-title">Our Content</h3>
            <p className="legal-text">All BJJ OS content is owned by us and protected by intellectual property laws.</p>
          </div>
          <div className="legal-subsection">
            <h3 className="legal-subsection-title">Third-Party Content</h3>
            <p className="legal-text">Instructional videos curated from public sources. Instructors retain their rights.</p>
          </div>
          <div className="legal-subsection">
            <h3 className="legal-subsection-title">Your Content</h3>
            <p className="legal-text">You retain ownership of training logs and notes. You grant us license to use your data to improve services.</p>
          </div>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">7. Disclaimer</h2>
          <ul className="legal-list">
            <li>BJJ OS is a training companion, not a substitute for in-person instruction</li>
            <li>We are not responsible for training injuries</li>
            <li>Professor OS may contain errors - verify with qualified instructors</li>
            <li>We do not provide medical advice</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">8. Limitation of Liability</h2>
          <ul className="legal-list">
            <li>BJJ OS is provided "as is" without warranties</li>
            <li>We are not liable for indirect or consequential damages</li>
            <li>Total liability limited to amount paid in past 12 months</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">9. Indemnification</h2>
          <p className="legal-text">You agree to indemnify BJJ OS from claims arising from your use, violation of Terms, or violation of third-party rights.</p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">10. Termination</h2>
          <ul className="legal-list">
            <li>You may cancel and delete your account anytime</li>
            <li>We may suspend accounts that violate Terms</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">11. Changes to Terms</h2>
          <p className="legal-text">We may modify Terms anytime. Continued use constitutes acceptance.</p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">12. Governing Law</h2>
          <p className="legal-text">Terms governed by Delaware law.</p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">13. Dispute Resolution</h2>
          <p className="legal-text">Disputes resolved through binding arbitration per AAA rules.</p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">14. Contact</h2>
          <p className="legal-text"><a href="mailto:support@bjjos.app" className="legal-link" data-testid="link-support-contact">support@bjjos.app</a></p>
        </section>

        <p className="legal-agreement">By using BJJ OS, you agree to these Terms of Service.</p>
      </main>

      <footer className="legal-footer">
        <div className="legal-footer-content">
          <div className="legal-footer-links">
            <a href="mailto:support@bjjos.app" className="legal-footer-link" data-testid="link-footer-support">support@bjjos.app</a>
            <a href="/privacy" className="legal-footer-link" data-testid="link-footer-privacy">Privacy Policy</a>
            <a href="/terms" className="legal-footer-link legal-footer-link-active" data-testid="link-footer-terms">Terms of Service</a>
          </div>
          <p className="legal-footer-copyright">© 2025 BJJ OS</p>
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        
        :root {
          --black: #000000;
          --white: #FFFFFF;
          --gray-light: #A0A0A0;
          --gray-medium: #71717A;
          --gray-dark: #1A1A1A;
          --blue: #2563EB;
          --purple: #7C3AED;
          --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
        }

        .legal-page {
          font-family: var(--font-mono);
          background: var(--black);
          color: var(--white);
          min-height: 100vh;
          width: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .legal-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: var(--black);
          height: 72px;
          z-index: 1000;
          border-bottom: 1px solid var(--gray-dark);
        }

        .legal-nav-content {
          max-width: 800px;
          margin: 0 auto;
          padding: 0 24px;
          height: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .legal-nav-left {
          display: flex;
          align-items: center;
        }

        .legal-logo-link {
          display: flex;
          align-items: center;
        }

        .legal-logo-img {
          height: 36px;
          width: auto;
        }

        .legal-nav-right {
          display: flex;
          align-items: center;
        }

        .legal-nav-button {
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          border: none;
          border-radius: 4px;
          font-family: var(--font-mono);
          font-weight: 600;
          font-size: 14px;
          color: var(--white);
          padding: 10px 20px;
          cursor: pointer;
          transition: opacity 150ms ease;
        }

        .legal-nav-button:hover {
          opacity: 0.9;
        }

        .legal-content {
          max-width: 800px;
          width: 100%;
          margin: 0 auto;
          padding: calc(72px + 60px) 24px 80px;
        }

        .legal-title {
          font-family: var(--font-mono);
          font-size: 32px;
          font-weight: 700;
          color: var(--white);
          margin: 0 0 8px;
          letter-spacing: -0.02em;
        }

        .legal-updated {
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--gray-medium);
          margin: 0 0 32px;
        }

        .legal-intro {
          font-family: var(--font-mono);
          font-size: 16px;
          color: var(--gray-light);
          line-height: 1.7;
          margin: 0 0 40px;
        }

        .legal-section {
          margin-bottom: 40px;
          opacity: 1 !important;
          transform: none !important;
          transition: none !important;
        }

        .legal-page section {
          opacity: 1 !important;
          transform: none !important;
          transition: none !important;
        }

        .legal-section-title {
          font-family: var(--font-mono);
          font-size: 18px;
          font-weight: 700;
          color: var(--white);
          margin: 0 0 16px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .legal-subsection {
          margin-bottom: 16px;
        }

        .legal-subsection-title {
          font-family: var(--font-mono);
          font-size: 14px;
          font-weight: 600;
          color: var(--white);
          margin: 0 0 4px;
        }

        .legal-text {
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--gray-light);
          line-height: 1.7;
          margin: 0 0 12px;
        }

        .legal-text strong {
          color: var(--white);
          font-weight: 600;
        }

        .legal-list {
          list-style: none;
          padding: 0;
          margin: 0 0 12px;
        }

        .legal-list li {
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--gray-light);
          line-height: 1.7;
          padding-left: 20px;
          position: relative;
          margin-bottom: 8px;
        }

        .legal-list li::before {
          content: '•';
          position: absolute;
          left: 0;
          color: var(--gray-medium);
        }

        .legal-list li strong {
          color: var(--white);
          font-weight: 600;
        }

        .legal-link {
          color: var(--white);
          text-decoration: none;
          border-bottom: 1px solid var(--gray-medium);
          transition: border-color 150ms ease;
        }

        .legal-link:hover {
          border-color: var(--white);
        }

        .legal-agreement {
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--gray-medium);
          font-style: italic;
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid var(--gray-dark);
        }

        .legal-footer {
          background: var(--black);
          padding: 40px 24px;
          border-top: 1px solid var(--gray-dark);
        }

        .legal-footer-content {
          max-width: 800px;
          margin: 0 auto;
          text-align: center;
        }

        .legal-footer-links {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 24px;
          margin-bottom: 16px;
        }

        .legal-footer-link {
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--gray-light);
          text-decoration: none;
          transition: color 150ms ease;
        }

        .legal-footer-link:hover {
          color: var(--white);
        }

        .legal-footer-link-active {
          color: var(--white);
        }

        .legal-footer-copyright {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--gray-medium);
          margin: 0;
        }

        @media (max-width: 768px) {
          .legal-nav {
            height: 64px;
          }

          .legal-content {
            padding: calc(64px + 40px) 20px 40px;
          }

          .legal-title {
            font-size: 28px;
          }

          .legal-section-title {
            font-size: 16px;
          }
        }
      `}</style>
    </div>
  );
}
