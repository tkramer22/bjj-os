import { useState } from "react";
import { ArrowLeft, Mail, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "How does Professor OS work?",
    answer: "Professor OS is your AI coach with perfect memory. It learns your game - your strengths, struggles, and goals. The more you share about your training, the smarter it gets. It draws from over 2,500 analyzed technique videos to give you personalized recommendations with exact timestamps."
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer: "Yes. Cancel anytime with no questions asked. Your subscription stays active until the end of your billing period."
  },
  {
    question: "Is my data private?",
    answer: "Yes. Your conversations are private and only used to improve your coaching experience. You can delete your chat history or reset Professor OS memory anytime in Settings."
  },
];

export default function IOSHelpPage() {
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);

  const handleBack = () => {
    triggerHaptic('light');
    window.history.back();
  };

  const toggleFAQ = (index: number) => {
    triggerHaptic('light');
    setExpandedFAQ(expandedFAQ === index ? null : index);
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
          Help & Support
        </h1>
      </div>

      <div style={{ 
        padding: '20px',
        paddingBottom: '100px',
      }}>
        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '24px',
          border: '1px solid #2A2A2E',
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
            Contact Support
          </h2>
          
          <a 
            href="mailto:support@bjjos.app"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              background: '#2A2A2E',
              borderRadius: '12px',
              textDecoration: 'none',
              marginBottom: '12px',
            }}
            data-testid="link-email-support"
          >
            <Mail size={20} color="#8B5CF6" />
            <div>
              <div style={{ color: '#FFFFFF', fontSize: '15px', fontWeight: 500 }}>
                Email Support
              </div>
              <div style={{ color: '#71717A', fontSize: '13px' }}>
                support@bjjos.app
              </div>
            </div>
          </a>

          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              background: '#2A2A2E',
              borderRadius: '12px',
            }}
          >
            <MessageCircle size={20} color="#8B5CF6" />
            <div>
              <div style={{ color: '#FFFFFF', fontSize: '15px', fontWeight: 500 }}>
                Response Time
              </div>
              <div style={{ color: '#71717A', fontSize: '13px' }}>
                Usually within 24 hours
              </div>
            </div>
          </div>
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
          Frequently Asked Questions
        </h2>

        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #2A2A2E',
        }}>
          {faqs.map((faq, index) => (
            <div 
              key={index}
              style={{
                borderBottom: index < faqs.length - 1 ? '1px solid #2A2A2E' : 'none',
              }}
            >
              <button
                onClick={() => toggleFAQ(index)}
                data-testid={`faq-${index}`}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  background: 'transparent',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ 
                  color: '#FFFFFF', 
                  fontSize: '15px',
                  fontWeight: 500,
                  flex: 1,
                  paddingRight: '12px',
                }}>
                  {faq.question}
                </span>
                {expandedFAQ === index ? (
                  <ChevronUp size={20} color="#71717A" />
                ) : (
                  <ChevronDown size={20} color="#71717A" />
                )}
              </button>
              
              {expandedFAQ === index && (
                <div style={{
                  padding: '0 20px 16px 20px',
                  color: '#A1A1AA',
                  fontSize: '14px',
                  lineHeight: 1.6,
                }}>
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>

        <p style={{
          marginTop: '24px',
          textAlign: 'center',
          color: '#71717A',
          fontSize: '13px',
        }}>
          Can't find what you're looking for? Email us anytime.
        </p>
      </div>
    </div>
  );
}
