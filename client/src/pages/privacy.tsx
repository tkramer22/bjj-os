import { useLocation } from "wouter";

export default function Privacy() {
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
        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-updated">Last Updated: December 9, 2025</p>

        <p className="legal-intro">
          BJJ OS ("we," "our," or "us") operates bjjos.app. This Privacy Policy explains how we collect, use, and safeguard your information.
        </p>

        <section className="legal-section">
          <h2 className="legal-section-title">Information We Collect</h2>
          <div className="legal-subsection">
            <h3 className="legal-subsection-title">Account Information</h3>
            <p className="legal-text">Email address, name, belt rank, training preferences, password (encrypted)</p>
          </div>
          <div className="legal-subsection">
            <h3 className="legal-subsection-title">Training Data</h3>
            <p className="legal-text">Session logs, technique preferences, training goals, conversations with Professor OS</p>
          </div>
          <div className="legal-subsection">
            <h3 className="legal-subsection-title">Payment Information</h3>
            <p className="legal-text">Billing details processed securely by Stripe. We do not store full credit card numbers.</p>
          </div>
          <div className="legal-subsection">
            <h3 className="legal-subsection-title">Usage Data</h3>
            <p className="legal-text">Device type, browser, pages visited, time on platform, feature usage patterns</p>
          </div>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">How We Use Your Information</h2>
          <ul className="legal-list">
            <li>Provide and personalize Professor OS coaching</li>
            <li>Process subscription payments</li>
            <li>Improve platform and features</li>
            <li>Send service-related communications</li>
            <li>Respond to support requests</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Data Sharing</h2>
          <p className="legal-text">We do not sell your personal information. We share data only with:</p>
          <ul className="legal-list">
            <li>Stripe (payment processing)</li>
            <li>Anthropic (AI coaching services - anonymized)</li>
            <li>Service providers (hosting and infrastructure)</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Data Security</h2>
          <p className="legal-text">We implement industry-standard security:</p>
          <ul className="legal-list">
            <li>Encrypted transmission (HTTPS)</li>
            <li>Secure password hashing</li>
            <li>Regular security audits</li>
            <li>Access controls and monitoring</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Your Rights</h2>
          <p className="legal-text">You may:</p>
          <ul className="legal-list">
            <li>Access your personal data</li>
            <li>Request data correction</li>
            <li>Request data deletion</li>
            <li>Export your training data</li>
            <li>Opt out of marketing emails</li>
          </ul>
          <p className="legal-text">To exercise these rights: <a href="mailto:support@bjjos.app" className="legal-link" data-testid="link-support-rights">support@bjjos.app</a></p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Data Retention</h2>
          <ul className="legal-list">
            <li><strong>Active accounts:</strong> Data retained while subscription active</li>
            <li><strong>Cancelled accounts:</strong> Data deleted within 90 days upon request</li>
            <li><strong>Training logs:</strong> Retained to improve coaching until deletion requested</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Children's Privacy</h2>
          <p className="legal-text">BJJ OS is not intended for users under 13. We do not knowingly collect information from children.</p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">California Privacy Rights (CCPA)</h2>
          <p className="legal-text">California residents may:</p>
          <ul className="legal-list">
            <li>Know what personal information is collected</li>
            <li>Request deletion</li>
            <li>Opt-out of sale (we do not sell data)</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">International Users (GDPR)</h2>
          <p className="legal-text">For EU/UK users:</p>
          <ul className="legal-list">
            <li>Legal basis is contract performance and legitimate interests</li>
            <li>Data transfers secured through standard contractual clauses</li>
            <li>Right to lodge complaints with supervisory authorities</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Changes to This Policy</h2>
          <p className="legal-text">We may update this policy periodically. Material changes communicated via email or in-app notification.</p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Contact</h2>
          <p className="legal-text"><a href="mailto:support@bjjos.app" className="legal-link" data-testid="link-support-contact">support@bjjos.app</a></p>
        </section>

        <p className="legal-agreement">By using BJJ OS, you agree to this Privacy Policy.</p>
      </main>

      <footer className="legal-footer">
        <div className="legal-footer-content">
          <div className="legal-footer-links">
            <a href="mailto:support@bjjos.app" className="legal-footer-link" data-testid="link-footer-support">support@bjjos.app</a>
            <a href="/privacy" className="legal-footer-link legal-footer-link-active" data-testid="link-footer-privacy">Privacy Policy</a>
            <a href="/terms" className="legal-footer-link" data-testid="link-footer-terms">Terms of Service</a>
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
