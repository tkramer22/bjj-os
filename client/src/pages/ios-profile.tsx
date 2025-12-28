import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { 
  User, Settings, Shield, HelpCircle, FileText, 
  LogOut, ChevronRight, Loader2, Mail, CreditCard, ExternalLink
} from "lucide-react";
import { clearAuth, isNativeApp } from "@/lib/capacitorAuth";
import { triggerHaptic } from "@/lib/haptics";
import { Browser } from '@capacitor/browser';

const APP_VERSION = "1.0.0";

interface UserProfile {
  id: number;
  username: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  beltLevel?: string;
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

export default function IOSProfilePage() {
  const [, navigate] = useLocation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { data: user, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/auth/me"],
  });

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

  const handleOpenSafari = async (url: string) => {
    triggerHaptic('light');
    if (isNativeApp()) {
      await Browser.open({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  const handleManageSubscription = async () => {
    triggerHaptic('light');
    await handleOpenSafari('https://bjjos.app/settings/subscription');
  };

  const getSubscriptionLabel = () => {
    if (user?.isLifetime) return 'Lifetime';
    if (user?.isPro) return 'Pro';
    return 'Free';
  };

  const getSubscriptionStatus = () => {
    if (user?.isLifetime) return 'Active Forever';
    if (user?.isPro) return 'Active';
    return 'Upgrade Available';
  };

  const getBeltColor = (belt?: string) => {
    const colors: Record<string, string> = {
      white: '#FFFFFF',
      blue: '#3B82F6',
      purple: '#8B5CF6',
      brown: '#92400E',
      black: '#1F2937'
    };
    return colors[belt || 'white'] || '#FFFFFF';
  };

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0A0A0B',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Loader2 className="animate-spin" size={32} color="#8B5CF6" />
      </div>
    );
  }

  return (
    <div 
      className="ios-page"
      style={{
        minHeight: '100vh',
        background: '#0A0A0B',
        color: '#FFFFFF',
        paddingBottom: '100px',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        borderBottom: '1px solid #2A2A2E',
      }}>
        <h1 style={{ 
          fontSize: '28px', 
          fontWeight: 700,
          margin: 0,
        }}>
          Profile
        </h1>
      </div>

      <div style={{ padding: '20px' }}>
        {/* User Card */}
        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '24px',
          border: '1px solid #2A2A2E',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}>
            {/* Avatar */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${getBeltColor(user?.beltLevel)} 0%, #8B5CF6 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <User size={28} color="#FFFFFF" />
            </div>
            
            <div>
              <div style={{ 
                fontSize: '18px', 
                fontWeight: 600,
                marginBottom: '4px',
              }} data-testid="text-username">
                {user?.displayName || user?.username || 'BJJ Practitioner'}
              </div>
              <div style={{ 
                fontSize: '14px', 
                color: '#71717A',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }} data-testid="text-email">
                <Mail size={14} />
                {user?.email || user?.phoneNumber || 'No email'}
              </div>
            </div>
          </div>
        </div>

        {/* Subscription Card */}
        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '24px',
          border: '1px solid #2A2A2E',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
          }}>
            <CreditCard size={20} color="#8B5CF6" />
            <span style={{ fontSize: '16px', fontWeight: 600 }}>
              Subscription
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '16px',
          }}>
            <div>
              <div style={{ 
                fontSize: '12px', 
                color: '#71717A',
                marginBottom: '4px',
              }}>
                Plan
              </div>
              <div style={{ 
                fontSize: '16px', 
                fontWeight: 600,
                color: user?.isPro || user?.isLifetime ? '#22C55E' : '#FFFFFF',
              }} data-testid="text-plan">
                {getSubscriptionLabel()}
              </div>
            </div>

            <div>
              <div style={{ 
                fontSize: '12px', 
                color: '#71717A',
                marginBottom: '4px',
              }}>
                Status
              </div>
              <div style={{ 
                fontSize: '16px', 
                fontWeight: 600,
              }} data-testid="text-status">
                {getSubscriptionStatus()}
              </div>
            </div>
          </div>

          {user?.subscriptionEndDate && !user?.isLifetime && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ 
                fontSize: '12px', 
                color: '#71717A',
                marginBottom: '4px',
              }}>
                Renews
              </div>
              <div style={{ 
                fontSize: '14px',
              }} data-testid="text-renews">
                {formatDate(user.subscriptionEndDate)}
              </div>
            </div>
          )}

          <button
            onClick={handleManageSubscription}
            onTouchEnd={handleManageSubscription}
            data-testid="button-manage-subscription"
            style={{
              width: '100%',
              background: '#8B5CF6',
              border: 'none',
              borderRadius: '12px',
              padding: '14px',
              color: '#FFFFFF',
              fontSize: '15px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}
          >
            Manage Subscription
            <ExternalLink size={16} />
          </button>
        </div>

        {/* Menu Items */}
        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          overflow: 'hidden',
          marginBottom: '24px',
          border: '1px solid #2A2A2E',
        }}>
          <button
            onClick={() => handleOpenSafari('https://bjjos.app/settings')}
            onTouchEnd={() => handleOpenSafari('https://bjjos.app/settings')}
            data-testid="button-settings"
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
              <Settings size={20} color="#71717A" />
              <span style={{ color: '#FFFFFF', fontSize: '15px' }}>Settings</span>
            </div>
            <ExternalLink size={16} color="#71717A" />
          </button>

          <button
            onClick={() => handleOpenSafari('https://bjjos.app/terms')}
            onTouchEnd={() => handleOpenSafari('https://bjjos.app/terms')}
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
            <ExternalLink size={16} color="#71717A" />
          </button>

          <button
            onClick={() => handleOpenSafari('https://bjjos.app/privacy')}
            onTouchEnd={() => handleOpenSafari('https://bjjos.app/privacy')}
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
            <ExternalLink size={16} color="#71717A" />
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              window.location.href = 'mailto:support@bjjos.app?subject=BJJ OS Support Request';
            }}
            onTouchEnd={() => {
              triggerHaptic('light');
              window.location.href = 'mailto:support@bjjos.app?subject=BJJ OS Support Request';
            }}
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
          onTouchEnd={handleLogout}
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

        {/* App Version */}
        <div style={{
          textAlign: 'center',
          marginTop: '24px',
          color: '#52525B',
          fontSize: '12px',
        }} data-testid="text-version">
          BJJ OS v{APP_VERSION}
        </div>
      </div>

      <IOSBottomNav />
    </div>
  );
}
