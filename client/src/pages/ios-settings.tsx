import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  ArrowLeft, Bell, Moon, Volume2, Vibrate, User, Award, Scale, Mail,
  CreditCard, FileText, Shield, HelpCircle, LogOut, ChevronRight,
  ExternalLink, Loader2
} from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { clearAuth, isNativeApp } from "@/lib/capacitorAuth";
import { Browser } from '@capacitor/browser';

interface UserProfile {
  id: number;
  email: string;
  name?: string;
  username?: string;
  beltLevel?: string;
  weight?: number | string;
  style?: string;
  isPro?: boolean;
  isLifetime?: boolean;
  subscriptionEndDate?: string;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  } catch {
    return 'N/A';
  }
}

export default function IOSSettingsPage() {
  const [, navigate] = useLocation();
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [sound, setSound] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const { data: user } = useQuery<UserProfile>({
    queryKey: ['/api/auth/me'],
  });

  const handleBack = () => {
    triggerHaptic('light');
    navigate('/ios-profile');
  };

  const handleLogout = async () => {
    triggerHaptic('medium');
    setIsLoggingOut(true);
    
    try {
      await clearAuth();
      navigate("/ios-login");
    } catch (error) {
      console.error('Logout error:', error);
      setIsLoggingOut(false);
    }
  };

  const handleNavigate = (path: string) => {
    triggerHaptic('light');
    navigate(path);
  };

  const handleOpenExternal = async (url: string) => {
    triggerHaptic('light');
    if (isNativeApp()) {
      await Browser.open({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  const toggleSetting = (setter: (v: boolean) => void, currentValue: boolean) => {
    triggerHaptic('light');
    setter(!currentValue);
  };

  const getSubscriptionLabel = () => {
    if (user?.isLifetime) return 'Lifetime';
    if (user?.isPro) return 'Pro';
    return 'Free';
  };

  const ToggleSwitch = ({ 
    enabled, 
    onToggle,
    testId
  }: { 
    enabled: boolean; 
    onToggle: () => void;
    testId: string;
  }) => (
    <button
      onClick={onToggle}
      style={{
        width: '51px',
        height: '31px',
        borderRadius: '15.5px',
        background: enabled ? '#8B5CF6' : '#3A3A3C',
        border: 'none',
        padding: '2px',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
      }}
      data-testid={testId}
    >
      <div style={{
        width: '27px',
        height: '27px',
        borderRadius: '50%',
        background: '#FFFFFF',
        transition: 'transform 0.2s ease',
        transform: enabled ? 'translateX(20px)' : 'translateX(0)',
      }} />
    </button>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0B',
      color: '#FFFFFF',
      paddingBottom: '40px',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        borderBottom: '1px solid #2A2A2E',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
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
          Settings
        </h1>
      </div>

      <div style={{ padding: '20px' }}>
        {/* Subscription Section */}
        <h2 style={{ 
          fontSize: '13px', 
          fontWeight: 600, 
          color: '#71717A', 
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '12px',
          paddingLeft: '8px'
        }}>
          Subscription
        </h2>
        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #2A2A2E',
          marginBottom: '24px',
        }}>
          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #2A2A2E',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CreditCard size={20} color="#71717A" />
              <span style={{ fontSize: '15px', color: '#71717A' }}>Plan</span>
            </div>
            <span style={{ 
              fontSize: '15px', 
              color: user?.isPro || user?.isLifetime ? '#22C55E' : '#FFFFFF',
              fontWeight: 600
            }} data-testid="text-plan">
              {getSubscriptionLabel()}
            </span>
          </div>

          {user?.subscriptionEndDate && !user?.isLifetime && (
            <div style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #2A2A2E',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CreditCard size={20} color="#71717A" />
                <span style={{ fontSize: '15px', color: '#71717A' }}>Renews</span>
              </div>
              <span style={{ fontSize: '15px', color: '#FFFFFF' }} data-testid="text-renews">
                {formatDate(user.subscriptionEndDate)}
              </span>
            </div>
          )}

          <button
            onClick={() => handleOpenExternal('https://bjjos.app/settings/subscription')}
            data-testid="button-manage-subscription"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ExternalLink size={20} color="#8B5CF6" />
              <span style={{ fontSize: '15px', color: '#8B5CF6' }}>Manage Subscription</span>
            </div>
            <ChevronRight size={20} color="#8B5CF6" />
          </button>
        </div>

        {/* Account Section - Email (read-only) */}
        {user && (
          <>
            <h2 style={{ 
              fontSize: '13px', 
              fontWeight: 600, 
              color: '#71717A', 
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '12px',
              paddingLeft: '8px'
            }}>
              Account
            </h2>
            <div style={{
              background: '#1A1A1D',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid #2A2A2E',
              marginBottom: '24px',
            }}>
              <div style={{
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Mail size={18} color="#71717A" />
                  <span style={{ fontSize: '15px', color: '#71717A' }}>Email</span>
                </div>
                <span style={{ fontSize: '15px', color: '#FFFFFF' }} data-testid="text-user-email">
                  {user.email || 'Not set'}
                </span>
              </div>
            </div>
          </>
        )}

        {/* App Settings Section */}
        <h2 style={{ 
          fontSize: '13px', 
          fontWeight: 600, 
          color: '#71717A', 
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '12px',
          paddingLeft: '8px'
        }}>
          App Settings
        </h2>
        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #2A2A2E',
          marginBottom: '24px',
        }}>
          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #2A2A2E',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Bell size={20} color="#71717A" />
              <span style={{ fontSize: '15px' }}>Push Notifications</span>
            </div>
            <ToggleSwitch 
              enabled={notifications} 
              onToggle={() => toggleSetting(setNotifications, notifications)}
              testId="toggle-notifications"
            />
          </div>

          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #2A2A2E',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Moon size={20} color="#71717A" />
              <span style={{ fontSize: '15px' }}>Dark Mode</span>
            </div>
            <ToggleSwitch 
              enabled={darkMode} 
              onToggle={() => toggleSetting(setDarkMode, darkMode)}
              testId="toggle-dark-mode"
            />
          </div>

          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #2A2A2E',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Volume2 size={20} color="#71717A" />
              <span style={{ fontSize: '15px' }}>Sound Effects</span>
            </div>
            <ToggleSwitch 
              enabled={sound} 
              onToggle={() => toggleSetting(setSound, sound)}
              testId="toggle-sound"
            />
          </div>

          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Vibrate size={20} color="#71717A" />
              <span style={{ fontSize: '15px' }}>Haptic Feedback</span>
            </div>
            <ToggleSwitch 
              enabled={haptics} 
              onToggle={() => toggleSetting(setHaptics, haptics)}
              testId="toggle-haptics"
            />
          </div>
        </div>

        {/* Legal Section */}
        <h2 style={{ 
          fontSize: '13px', 
          fontWeight: 600, 
          color: '#71717A', 
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '12px',
          paddingLeft: '8px'
        }}>
          Legal & Support
        </h2>
        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #2A2A2E',
          marginBottom: '24px',
        }}>
          <button
            onClick={() => handleNavigate('/ios-terms')}
            data-testid="button-terms"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #2A2A2E',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FileText size={20} color="#71717A" />
              <span style={{ color: '#FFFFFF', fontSize: '15px' }}>Terms of Service</span>
            </div>
            <ChevronRight size={20} color="#71717A" />
          </button>

          <button
            onClick={() => handleNavigate('/ios-privacy')}
            data-testid="button-privacy"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #2A2A2E',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Shield size={20} color="#71717A" />
              <span style={{ color: '#FFFFFF', fontSize: '15px' }}>Privacy Policy</span>
            </div>
            <ChevronRight size={20} color="#71717A" />
          </button>

          <button
            onClick={() => handleNavigate('/ios-help')}
            data-testid="button-help"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <HelpCircle size={20} color="#71717A" />
              <span style={{ color: '#FFFFFF', fontSize: '15px' }}>Help & Support</span>
            </div>
            <ChevronRight size={20} color="#71717A" />
          </button>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          data-testid="button-logout"
          style={{
            width: '100%',
            background: '#1A1A1D',
            border: '1px solid #DC2626',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: isLoggingOut ? 'not-allowed' : 'pointer',
            opacity: isLoggingOut ? 0.5 : 1,
          }}
        >
          {isLoggingOut ? (
            <Loader2 className="animate-spin" size={20} color="#DC2626" />
          ) : (
            <LogOut size={20} color="#DC2626" />
          )}
          <span style={{ color: '#DC2626', fontSize: '15px', fontWeight: 600 }}>
            {isLoggingOut ? 'Logging out...' : 'Log Out'}
          </span>
        </button>

        <p style={{
          marginTop: '16px',
          padding: '0 8px',
          fontSize: '13px',
          color: '#71717A',
          lineHeight: 1.5,
          textAlign: 'center',
        }}>
          BJJ OS v1.0.0
        </p>
      </div>
    </div>
  );
}
