import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="not-found-page page-container">
      <div className="not-found-container">
        {/* Logo */}
        <div className="not-found-logo">
          <div className="not-found-logo-mark">
            <div className="not-found-logo-line"></div>
            <div className="not-found-logo-line"></div>
            <div className="not-found-logo-line"></div>
            <div className="not-found-logo-line"></div>
          </div>
          <span className="not-found-logo-text">BJJ OS</span>
        </div>

        {/* 404 Content */}
        <div className="not-found-content">
          <h1 className="not-found-code">404</h1>
          <h2 className="not-found-title">Page Not Found</h2>
          <p className="not-found-description">
            The page you're looking for doesn't exist or has been moved.
          </p>

          {/* Action Buttons */}
          <div className="not-found-actions">
            <button
              className="not-found-button primary"
              onClick={() => setLocation('/')}
              data-testid="button-home"
            >
              Go Home
            </button>
            <button
              className="not-found-button secondary"
              onClick={() => setLocation('/login')}
              data-testid="button-login"
            >
              Login
            </button>
          </div>
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
          --font-mono: 'JetBrains Mono', monospace;
        }

        /* ==================== BASE STYLES ==================== */
        .not-found-page {
          font-family: var(--font-mono);
          background: radial-gradient(circle at 50% 0%, #0A0812 0%, #15111F 50%, #0A0812 100%);
          color: var(--white);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          position: relative;
          padding: 40px;
        }

        /* Subtle grain texture overlay */
        .not-found-page::before {
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
        }

        /* ==================== CONTAINER ==================== */
        .not-found-container {
          max-width: 600px;
          text-align: center;
          position: relative;
          z-index: 1;
        }

        /* ==================== LOGO ==================== */
        .not-found-logo {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 64px;
        }

        .not-found-logo-mark {
          display: flex;
          gap: 2px;
          height: 20px;
        }

        .not-found-logo-line {
          width: 1px;
          height: 20px;
          background: var(--white);
        }

        .not-found-logo-line:nth-child(2) {
          margin-right: 2px;
        }

        .not-found-logo-line:nth-child(3) {
          margin-left: 2px;
        }

        .not-found-logo-text {
          font-weight: 700;
          font-size: 16px;
          color: var(--white);
        }

        /* ==================== CONTENT ==================== */
        .not-found-content {
          background: var(--black-elevated);
          padding: 64px 48px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .not-found-code {
          font-size: 96px;
          font-weight: 700;
          color: var(--white);
          line-height: 1;
          margin-bottom: 24px;
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        @supports not (background-clip: text) {
          .not-found-code {
            color: var(--blue);
          }
        }

        .not-found-title {
          font-size: 32px;
          font-weight: 700;
          color: var(--white);
          margin-bottom: 16px;
        }

        .not-found-description {
          font-size: 16px;
          color: var(--gray-light);
          line-height: 1.6;
          margin-bottom: 48px;
        }

        /* ==================== ACTIONS ==================== */
        .not-found-actions {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .not-found-button {
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 16px;
          padding: 14px 32px;
          border: none;
          cursor: pointer;
          transition: all 150ms ease;
        }

        .not-found-button.primary {
          background: linear-gradient(135deg, var(--blue) 0%, var(--purple) 100%);
          background-size: 200% 200%;
          animation: gradient-shift 8s ease infinite;
          color: var(--white);
        }

        .not-found-button.primary:hover {
          background: linear-gradient(135deg, var(--blue-hover-1) 0%, var(--purple-hover-1) 100%);
        }

        .not-found-button.secondary {
          background: transparent;
          border: 1px solid var(--gray-dark);
          color: var(--gray-light);
        }

        .not-found-button.secondary:hover {
          border: 1px solid var(--blue);
          color: var(--blue);
        }

        .not-found-button:active {
          transform: translateY(1px);
        }

        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        /* ==================== MOBILE RESPONSIVE ==================== */
        @media (max-width: 768px) {
          .not-found-page {
            padding: 24px;
          }

          .not-found-content {
            padding: 48px 32px;
          }

          .not-found-code {
            font-size: 72px;
          }

          .not-found-title {
            font-size: 24px;
          }

          .not-found-actions {
            flex-direction: column;
          }

          .not-found-button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
