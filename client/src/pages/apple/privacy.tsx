import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function ApplePrivacy() {
  const [, setLocation] = useLocation();

  return (
    <div className="apple-legal-page">
      <nav className="apple-legal-nav">
        <div className="apple-legal-nav-content">
          <button 
            className="apple-back-button"
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ArrowLeft size={20} />
            <span>Back</span>
          </button>
        </div>
      </nav>

      <main className="apple-legal-content">
        <h1 className="apple-legal-title">PRIVACY POLICY</h1>
        <p className="apple-legal-updated">Last Updated: January 16, 2026</p>

        <p className="apple-legal-intro">
          BJJ OS ("we", "our", "us") operates the BJJ OS mobile application. This Privacy Policy explains how we collect, use, and safeguard your information when you use our iOS app.
        </p>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">INFORMATION WE COLLECT</h2>
          
          <div className="apple-legal-subsection">
            <h3 className="apple-legal-subsection-title">Account Information:</h3>
            <ul className="apple-legal-list">
              <li>Name and email address (via Sign in with Apple)</li>
              <li>Belt rank and training preferences</li>
              <li>Training goals</li>
            </ul>
          </div>

          <div className="apple-legal-subsection">
            <h3 className="apple-legal-subsection-title">Training Data:</h3>
            <ul className="apple-legal-list">
              <li>Session logs you create</li>
              <li>Conversations with Professor OS</li>
              <li>Technique preferences and saved videos</li>
            </ul>
          </div>

          <div className="apple-legal-subsection">
            <h3 className="apple-legal-subsection-title">Payment Information:</h3>
            <ul className="apple-legal-list">
              <li>Subscriptions are processed by Apple through In-App Purchase</li>
              <li>We do not collect or store your payment card information</li>
              <li>Apple handles all billing securely</li>
            </ul>
          </div>

          <div className="apple-legal-subsection">
            <h3 className="apple-legal-subsection-title">Usage Data:</h3>
            <ul className="apple-legal-list">
              <li>Device type and operating system</li>
              <li>App usage patterns</li>
              <li>Crash logs and performance data</li>
            </ul>
          </div>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">HOW WE USE YOUR INFORMATION</h2>
          <ul className="apple-legal-list">
            <li>Provide personalized AI coaching through Professor OS</li>
            <li>Recommend relevant technique videos</li>
            <li>Improve our service and AI responses</li>
            <li>Respond to support requests</li>
            <li>Send service-related communications</li>
          </ul>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">DATA SHARING</h2>
          <p className="apple-legal-text">We do not sell your personal information.</p>
          <p className="apple-legal-text">We share data only with:</p>
          <ul className="apple-legal-list">
            <li>Anthropic (AI processing for Professor OS - anonymized conversation data)</li>
            <li>Service providers (hosting, analytics)</li>
            <li>As required by law</li>
          </ul>
          <p className="apple-legal-text">We do NOT share your data with advertisers.</p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">DATA SECURITY</h2>
          <ul className="apple-legal-list">
            <li>All data transmitted via HTTPS encryption</li>
            <li>Secure password hashing</li>
            <li>Regular security audits</li>
            <li>Access controls and monitoring</li>
          </ul>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">YOUR RIGHTS</h2>
          <p className="apple-legal-text">You may:</p>
          <ul className="apple-legal-list">
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Delete your account and data</li>
            <li>Export your data</li>
            <li>Opt out of non-essential communications</li>
          </ul>
          <p className="apple-legal-text">
            To exercise these rights, contact: <a href="mailto:support@bjjos.app" className="apple-legal-link" data-testid="link-support">support@bjjos.app</a>
          </p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">DATA RETENTION</h2>
          <ul className="apple-legal-list">
            <li><strong>Active accounts:</strong> Data retained while your account is active</li>
            <li><strong>Deleted accounts:</strong> Data removed within 30 days of deletion request</li>
          </ul>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">CHILDREN'S PRIVACY</h2>
          <p className="apple-legal-text">
            BJJ OS is not intended for children under 13. We do not knowingly collect data from children under 13.
          </p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">CALIFORNIA RESIDENTS (CCPA)</h2>
          <p className="apple-legal-text">California residents have the right to:</p>
          <ul className="apple-legal-list">
            <li>Know what personal information is collected</li>
            <li>Request deletion of personal information</li>
            <li>Opt-out of sale of personal information (we do not sell data)</li>
            <li>Non-discrimination for exercising privacy rights</li>
          </ul>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">EU/UK RESIDENTS (GDPR)</h2>
          <p className="apple-legal-text">
            If you are in the EU or UK, you have rights under GDPR including access, rectification, erasure, and data portability. Contact <a href="mailto:support@bjjos.app" className="apple-legal-link" data-testid="link-support-gdpr">support@bjjos.app</a> for requests.
          </p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">CHANGES TO THIS POLICY</h2>
          <p className="apple-legal-text">
            We may update this Privacy Policy. Material changes will be communicated via email or in-app notification.
          </p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">CONTACT US</h2>
          <p className="apple-legal-text">
            Questions about this Privacy Policy?
          </p>
          <p className="apple-legal-text">
            Email: <a href="mailto:support@bjjos.app" className="apple-legal-link" data-testid="link-support-contact">support@bjjos.app</a>
          </p>
        </section>
      </main>

      <style>{`
        .apple-legal-page {
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
          background: #000000;
          color: #FFFFFF;
          min-height: 100vh;
          width: 100%;
          -webkit-font-smoothing: antialiased;
        }

        .apple-legal-nav {
          position: sticky;
          top: 0;
          background: #000000;
          border-bottom: 1px solid #1A1A1A;
          padding: 16px 24px;
          z-index: 100;
        }

        .apple-legal-nav-content {
          max-width: 720px;
          margin: 0 auto;
        }

        .apple-back-button {
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: #8B5CF6;
          font-size: 16px;
          cursor: pointer;
          padding: 8px 0;
        }

        .apple-back-button:hover {
          opacity: 0.8;
        }

        .apple-legal-content {
          max-width: 720px;
          margin: 0 auto;
          padding: 40px 24px 80px;
        }

        .apple-legal-title {
          font-size: 32px;
          font-weight: 700;
          color: #FFFFFF;
          margin-bottom: 8px;
        }

        .apple-legal-updated {
          color: #71717A;
          font-size: 14px;
          margin-bottom: 32px;
        }

        .apple-legal-intro {
          color: #A0A0A0;
          font-size: 16px;
          line-height: 1.7;
          margin-bottom: 40px;
        }

        .apple-legal-section {
          margin-bottom: 32px;
        }

        .apple-legal-section-title {
          font-size: 18px;
          font-weight: 600;
          color: #FFFFFF;
          margin-bottom: 16px;
          letter-spacing: 0.5px;
        }

        .apple-legal-subsection {
          margin-bottom: 20px;
        }

        .apple-legal-subsection-title {
          font-size: 15px;
          font-weight: 500;
          color: #FFFFFF;
          margin-bottom: 8px;
        }

        .apple-legal-text {
          color: #A0A0A0;
          font-size: 15px;
          line-height: 1.7;
          margin-bottom: 12px;
        }

        .apple-legal-list {
          color: #A0A0A0;
          font-size: 15px;
          line-height: 1.8;
          padding-left: 24px;
          margin-bottom: 12px;
        }

        .apple-legal-list li {
          margin-bottom: 8px;
        }

        .apple-legal-list strong {
          color: #FFFFFF;
        }

        .apple-legal-link {
          color: #8B5CF6;
          text-decoration: none;
        }

        .apple-legal-link:hover {
          text-decoration: underline;
        }

        @media (max-width: 640px) {
          .apple-legal-content {
            padding: 24px 16px 60px;
          }

          .apple-legal-title {
            font-size: 24px;
          }

          .apple-legal-section-title {
            font-size: 16px;
          }

          .apple-legal-text,
          .apple-legal-list {
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}
