import { ArrowLeft } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

export default function IOSTermsPage() {
  const handleBack = () => {
    triggerHaptic('light');
    window.history.back();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0B',
      color: '#FFFFFF',
    }}>
      <div style={{
        padding: '16px 20px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        borderBottom: '1px solid #2A2A2E',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        position: 'sticky',
        top: 0,
        background: '#0A0A0B',
        zIndex: 10,
      }}>
        <button
          onClick={handleBack}
          data-testid="button-back"
          style={{
            background: 'transparent',
            border: 'none',
            padding: '8px',
            marginLeft: '-8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowLeft size={24} color="#8B5CF6" />
        </button>
        <h1 style={{ 
          fontSize: '20px', 
          fontWeight: 600,
          margin: 0,
        }}>
          Terms of Service
        </h1>
      </div>

      <div style={{ 
        padding: '20px',
        paddingBottom: '100px',
        lineHeight: 1.7,
      }}>
        <p style={{ color: '#71717A', fontSize: '13px', marginBottom: '24px' }}>
          Last updated: December 2024
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          1. Acceptance of Terms
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          By accessing and using BJJ OS ("the App"), you accept and agree to be bound by these Terms of Service. 
          If you do not agree to these terms, please do not use the App.
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          2. Description of Service
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          BJJ OS is an AI-powered training platform for Brazilian Jiu-Jitsu practitioners. The App provides 
          personalized coaching advice, video recommendations, and training resources. The App is intended 
          for educational and informational purposes only.
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          3. User Accounts
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          You are responsible for maintaining the confidentiality of your account credentials. You agree to 
          provide accurate information when creating your account and to update your information as needed.
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          4. Subscription and Payments
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          Some features of BJJ OS require a paid subscription. Subscription fees are billed in advance on a 
          monthly or annual basis. You may cancel your subscription at any time, but no refunds will be 
          provided for partial billing periods.
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          5. Disclaimer
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          BJJ OS provides training advice for educational purposes only. The App is not a substitute for 
          professional instruction. Always train under qualified supervision and consult a physician before 
          beginning any exercise program. We are not liable for any injuries resulting from training activities.
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          6. Intellectual Property
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          All content in the App, including text, graphics, logos, and software, is the property of BJJ OS 
          or its licensors and is protected by intellectual property laws. You may not reproduce, distribute, 
          or create derivative works without our express permission.
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          7. Changes to Terms
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          We reserve the right to modify these Terms at any time. We will notify users of significant changes 
          via the App or email. Continued use of the App after changes constitutes acceptance of the new Terms.
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          8. Contact
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          For questions about these Terms, please contact us at support@bjjos.app
        </p>
      </div>
    </div>
  );
}
