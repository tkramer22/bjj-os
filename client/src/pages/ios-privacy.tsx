import { ArrowLeft } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

export default function IOSPrivacyPage() {
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
          Privacy Policy
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
          1. Information We Collect
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '16px' }}>
          We collect information you provide directly, including:
        </p>
        <ul style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px', paddingLeft: '20px' }}>
          <li style={{ marginBottom: '8px' }}>Account information (email, name, belt level)</li>
          <li style={{ marginBottom: '8px' }}>Training preferences and goals</li>
          <li style={{ marginBottom: '8px' }}>Chat conversations with Professor OS</li>
          <li style={{ marginBottom: '8px' }}>Video viewing history and saved content</li>
        </ul>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          2. How We Use Your Information
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '16px' }}>
          We use your information to:
        </p>
        <ul style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px', paddingLeft: '20px' }}>
          <li style={{ marginBottom: '8px' }}>Provide personalized training recommendations</li>
          <li style={{ marginBottom: '8px' }}>Improve our AI coaching capabilities</li>
          <li style={{ marginBottom: '8px' }}>Send you relevant training content and updates</li>
          <li style={{ marginBottom: '8px' }}>Process payments and manage subscriptions</li>
        </ul>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          3. Data Storage and Security
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          Your data is stored securely using industry-standard encryption. We use secure cloud infrastructure 
          to protect your information. We retain your data for as long as your account is active or as needed 
          to provide services.
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          4. AI and Chat Data
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          Conversations with Professor OS are used to improve coaching quality and personalize your experience. 
          Chat data may be analyzed to enhance our AI models. We do not share individual conversations with 
          third parties.
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          5. Third-Party Services
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          We use trusted third-party services for payments, analytics, and AI processing. These 
          services have their own privacy policies. We only share the minimum data necessary to provide 
          our services.
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          6. Your Rights
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '16px' }}>
          You have the right to:
        </p>
        <ul style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px', paddingLeft: '20px' }}>
          <li style={{ marginBottom: '8px' }}>Access your personal data</li>
          <li style={{ marginBottom: '8px' }}>Request correction of inaccurate data</li>
          <li style={{ marginBottom: '8px' }}>Delete your account and associated data</li>
          <li style={{ marginBottom: '8px' }}>Export your data in a portable format</li>
        </ul>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          7. Children's Privacy
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          BJJ OS is not intended for children under 13. We do not knowingly collect information from 
          children under 13. If you believe we have collected such information, please contact us immediately.
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          8. Contact Us
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '15px', marginBottom: '24px' }}>
          For privacy-related inquiries, please contact us at privacy@bjjos.app
        </p>
      </div>
    </div>
  );
}
