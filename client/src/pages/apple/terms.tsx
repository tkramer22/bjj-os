import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function AppleTerms() {
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
        <h1 className="apple-legal-title">TERMS OF USE</h1>
        <p className="apple-legal-updated">Last Updated: January 16, 2026</p>

        <p className="apple-legal-intro">
          Welcome to BJJ OS. By using our iOS application, you agree to these Terms of Use.
        </p>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">1. ACCEPTANCE OF TERMS</h2>
          <p className="apple-legal-text">
            By downloading, accessing, or using BJJ OS, you agree to be bound by these Terms and our Privacy Policy. If you do not agree, do not use the app.
          </p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">2. DESCRIPTION OF SERVICE</h2>
          <p className="apple-legal-text">BJJ OS provides:</p>
          <ul className="apple-legal-list">
            <li>AI-powered Brazilian Jiu-Jitsu coaching via Professor OS</li>
            <li>Curated instructional video recommendations</li>
            <li>Training session logging</li>
            <li>Personalized technique suggestions and progress tracking</li>
          </ul>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">3. ELIGIBILITY</h2>
          <p className="apple-legal-text">
            You must be at least 13 years old to use BJJ OS. By using the app, you represent that you meet this requirement.
          </p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">4. USER ACCOUNTS</h2>
          <ul className="apple-legal-list">
            <li>You must provide accurate information when creating an account</li>
            <li>You are responsible for maintaining account security</li>
            <li>You are responsible for all activity under your account</li>
            <li>One account per person</li>
          </ul>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">5. SUBSCRIPTION AND PAYMENT</h2>
          <p className="apple-legal-text">BJJ OS requires a paid subscription for full access.</p>
          
          <div className="apple-legal-subsection">
            <h3 className="apple-legal-subsection-title">Pricing:</h3>
            <p className="apple-legal-text">$19.99 per month</p>
          </div>

          <div className="apple-legal-subsection">
            <h3 className="apple-legal-subsection-title">Billing:</h3>
            <p className="apple-legal-text">Payment is charged to your Apple ID account at confirmation of purchase.</p>
          </div>

          <div className="apple-legal-subsection">
            <h3 className="apple-legal-subsection-title">Auto-Renewal:</h3>
            <p className="apple-legal-text">Your subscription automatically renews unless canceled at least 24 hours before the end of the current billing period.</p>
          </div>

          <div className="apple-legal-subsection">
            <h3 className="apple-legal-subsection-title">Cancellation:</h3>
            <p className="apple-legal-text">You can manage and cancel your subscription at any time through your iPhone Settings → Apple ID → Subscriptions.</p>
          </div>

          <div className="apple-legal-subsection">
            <h3 className="apple-legal-subsection-title">Refunds:</h3>
            <p className="apple-legal-text">Refund requests are handled by Apple according to their refund policy.</p>
          </div>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">6. ACCEPTABLE USE</h2>
          <p className="apple-legal-text">You agree NOT to:</p>
          <ul className="apple-legal-list">
            <li>Share your account credentials</li>
            <li>Reverse engineer or scrape the app</li>
            <li>Use the service for illegal purposes</li>
            <li>Harass other users</li>
            <li>Upload harmful or inappropriate content</li>
            <li>Misrepresent your identity</li>
            <li>Attempt to circumvent security measures</li>
          </ul>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">7. INTELLECTUAL PROPERTY</h2>
          <ul className="apple-legal-list">
            <li>BJJ OS content, including Professor OS responses and curation, is owned by BJJ OS</li>
            <li>Third-party instructional videos remain property of their respective creators</li>
            <li>Your training logs and personal data remain yours</li>
          </ul>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">8. DISCLAIMER</h2>
          <p className="apple-legal-text">BJJ OS is an AI-powered training companion. It is NOT a substitute for:</p>
          <ul className="apple-legal-list">
            <li>Qualified in-person instruction</li>
            <li>Medical advice</li>
            <li>Professional coaching</li>
          </ul>
          <p className="apple-legal-text">
            You train at your own risk. BJJ OS is not responsible for injuries sustained during training. Always consult qualified instructors and medical professionals.
          </p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">9. LIMITATION OF LIABILITY</h2>
          <p className="apple-legal-text">BJJ OS is provided "as is" without warranties. We are not liable for:</p>
          <ul className="apple-legal-list">
            <li>Training injuries</li>
            <li>Inaccurate AI responses</li>
            <li>Service interruptions</li>
            <li>Data loss</li>
          </ul>
          <p className="apple-legal-text">
            Our total liability is limited to the amount you paid for the service in the past 12 months.
          </p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">10. TERMINATION</h2>
          <p className="apple-legal-text">
            We may terminate or suspend your account if you violate these Terms. You may delete your account at any time through the app settings.
          </p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">11. CHANGES TO TERMS</h2>
          <p className="apple-legal-text">
            We may update these Terms. Continued use after changes constitutes acceptance. Material changes will be communicated via email or in-app notification.
          </p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">12. GOVERNING LAW</h2>
          <p className="apple-legal-text">
            These Terms are governed by the laws of the State of Delaware, USA.
          </p>
        </section>

        <section className="apple-legal-section">
          <h2 className="apple-legal-section-title">13. CONTACT</h2>
          <p className="apple-legal-text">
            Questions about these Terms?
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
          margin-bottom: 16px;
        }

        .apple-legal-subsection-title {
          font-size: 15px;
          font-weight: 500;
          color: #FFFFFF;
          margin-bottom: 4px;
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
