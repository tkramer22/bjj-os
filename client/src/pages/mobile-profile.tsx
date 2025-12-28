import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { 
  User, Settings, Shield, HelpCircle, FileText, Lock, 
  LogOut, ChevronRight, Loader2, Mail, CreditCard, Package
} from "lucide-react";
import { clearAuth, isNativeApp } from "@/lib/capacitorAuth";
import { triggerHaptic } from "@/lib/haptics";
import { Browser } from '@capacitor/browser';
import { useState } from "react";

const APP_VERSION = "1.0.0";

function formatSubscriptionDate(dateString: string | null | undefined): string {
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

export default function MobileProfilePage() {
  const [, navigate] = useLocation();
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  const { data: profile } = useQuery({
    queryKey: ["/api/auth/profile"],
    enabled: !!user,
  });

  const handleLogout = async () => {
    triggerHaptic('medium');
    setIsLoggingOut(true);
    
    try {
      await clearAuth();
      
      if (isNativeApp()) {
        navigate("/ios-login");
      } else {
        navigate("/");
      }
    } catch (error) {
      console.error('Logout error:', error);
      setIsLoggingOut(false);
    }
  };

  const handleNavigate = (path: string) => {
    triggerHaptic('light');
    navigate(path);
  };

  const handleOpenSafari = async (url: string) => {
    triggerHaptic('light');
    if (isNativeApp()) {
      await Browser.open({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  const handleEmailSupport = async () => {
    triggerHaptic('light');
    window.location.href = 'mailto:support@bjjos.app?subject=BJJ OS Support Request';
  };

  const handleSecurityTap = () => {
    triggerHaptic('light');
    setShowSecurityInfo(true);
  };

  const getBeltColor = (belt: string) => {
    const colors: Record<string, string> = {
      white: '#FFFFFF',
      blue: '#3B82F6',
      purple: '#8B5CF6',
      brown: '#92400E',
      black: '#1F2937'
    };
    return colors[belt] || '#FFFFFF';
  };

  const getSubscriptionLabel = (user: any) => {
    if (user?.isLifetime) return 'Lifetime';
    if (user?.isPro) return 'Pro';
    return 'Free';
  };

  if (isLoading) {
    return (
      <div className="mobile-app">
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--mobile-dark-bg)"
        }}>
          <Loader2 className="w-8 h-8 animate-spin" color="var(--mobile-text-primary)" />
        </div>
      </div>
    );
  }

  const menuItemStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1rem",
    background: "transparent",
    border: "none",
    width: "100%",
    cursor: "pointer",
    borderBottom: "1px solid var(--mobile-border-gray)"
  };

  const menuItemContentStyle = {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem"
  };

  return (
    <div className="mobile-app">
      <div style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--mobile-dark-bg)",
        color: "var(--mobile-text-primary)",
        paddingBottom: "var(--mobile-bottom-nav-height)",
        overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--mobile-dark-bg)",
          borderBottom: "1px solid var(--mobile-border-gray)",
          padding: "1rem"
        }}>
          <h1 style={{ 
            fontSize: "1.5rem", 
            fontWeight: "700",
            color: "var(--mobile-text-primary)"
          }}>
            Profile
          </h1>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem"
        }}>
          {/* Account Card */}
          <div style={{
            background: "var(--mobile-medium-gray)",
            borderRadius: "var(--mobile-radius-lg)",
            padding: "1.25rem",
            marginBottom: "1.5rem"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem"
            }}>
              <div style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "var(--mobile-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                <User size={28} color="white" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  color: "var(--mobile-text-primary)",
                  marginBottom: "0.25rem"
                }}>
                  {profile?.displayName || profile?.username || user?.email?.split('@')[0] || 'User'}
                </div>
                <div style={{
                  fontSize: "0.875rem",
                  color: "var(--mobile-text-secondary)",
                  marginBottom: "0.5rem"
                }}>
                  {user?.email || 'No email set'}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span style={{
                    fontSize: "0.75rem",
                    padding: "0.25rem 0.5rem",
                    background: "var(--mobile-primary)",
                    color: "white",
                    borderRadius: "var(--mobile-radius-sm)"
                  }}>
                    {getSubscriptionLabel(user)}
                  </span>
                  {profile?.beltLevel && (
                    <span style={{
                      fontSize: "0.75rem",
                      padding: "0.25rem 0.5rem",
                      background: getBeltColor(profile.beltLevel),
                      color: profile.beltLevel === 'white' ? '#000' : '#FFF',
                      borderRadius: "var(--mobile-radius-sm)",
                      border: profile.beltLevel === 'white' ? '1px solid #666' : 'none'
                    }}>
                      {profile.beltLevel.charAt(0).toUpperCase() + profile.beltLevel.slice(1)} Belt
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Card - App Store Compliant */}
          <div style={{
            background: "var(--mobile-medium-gray)",
            borderRadius: "var(--mobile-radius-lg)",
            padding: "1.25rem",
            marginBottom: "1.5rem"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "1rem"
            }}>
              <Package size={20} color="var(--mobile-primary)" />
              <span style={{
                fontSize: "1rem",
                fontWeight: "600",
                color: "var(--mobile-text-primary)"
              }}>
                Subscription
              </span>
            </div>
            
            <div style={{ marginBottom: "1rem" }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5rem"
              }}>
                <span style={{ color: "var(--mobile-text-secondary)", fontSize: "0.875rem" }}>Plan</span>
                <span style={{ color: "var(--mobile-text-primary)", fontSize: "0.875rem", fontWeight: "500" }}>
                  {(user as any)?.isLifetime ? 'BJJ OS Lifetime' : (user as any)?.isPro ? 'BJJ OS Pro' : 'Free'}
                </span>
              </div>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5rem"
              }}>
                <span style={{ color: "var(--mobile-text-secondary)", fontSize: "0.875rem" }}>Status</span>
                <span style={{ 
                  color: (user as any)?.isPro || (user as any)?.isLifetime ? "#22C55E" : "var(--mobile-text-tertiary)", 
                  fontSize: "0.875rem", 
                  fontWeight: "500" 
                }}>
                  {(user as any)?.isLifetime ? 'Lifetime Access' : (user as any)?.isPro ? 'Active' : 'Inactive'}
                </span>
              </div>
              {(user as any)?.isPro && !(user as any)?.isLifetime && (user as any)?.subscriptionEndDate && (
                <div style={{
                  display: "flex",
                  justifyContent: "space-between"
                }}>
                  <span style={{ color: "var(--mobile-text-secondary)", fontSize: "0.875rem" }}>Renews</span>
                  <span style={{ color: "var(--mobile-text-primary)", fontSize: "0.875rem" }}>
                    {formatSubscriptionDate((user as any)?.subscriptionEndDate)}
                  </span>
                </div>
              )}
            </div>

            {/* Manage Subscription - Opens Safari (App Store Compliant) */}
            {((user as any)?.isPro || (user as any)?.isLifetime) && (
              <button
                onClick={() => handleOpenSafari('https://bjjos.app/settings/subscription')}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "var(--mobile-dark-bg)",
                  border: "1px solid var(--mobile-border-gray)",
                  borderRadius: "var(--mobile-radius-md)",
                  color: "var(--mobile-text-primary)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem"
                }}
                data-testid="button-manage-subscription"
              >
                <CreditCard size={16} />
                Manage Subscription
              </button>
            )}

            {/* Not subscribed message - Plain text, NOT clickable (App Store Compliant) */}
            {!(user as any)?.isPro && !(user as any)?.isLifetime && (
              <div style={{
                textAlign: "center",
                color: "var(--mobile-text-tertiary)",
                fontSize: "0.8125rem",
                lineHeight: "1.5"
              }}>
                Visit bjjos.app to subscribe
              </div>
            )}
          </div>

          {/* Menu Items */}
          <div style={{
            background: "var(--mobile-medium-gray)",
            borderRadius: "var(--mobile-radius-lg)",
            overflow: "hidden",
            marginBottom: "1.5rem"
          }}>
            {/* Settings */}
            <button
              onClick={() => handleNavigate('/app/settings')}
              style={menuItemStyle}
              data-testid="button-settings"
            >
              <div style={menuItemContentStyle}>
                <Settings size={20} color="var(--mobile-text-secondary)" />
                <span style={{ color: "var(--mobile-text-primary)", fontSize: "0.9375rem" }}>
                  Settings
                </span>
              </div>
              <ChevronRight size={20} color="var(--mobile-text-tertiary)" />
            </button>

            {/* Security */}
            <button
              onClick={handleSecurityTap}
              style={menuItemStyle}
              data-testid="button-security"
            >
              <div style={menuItemContentStyle}>
                <Shield size={20} color="var(--mobile-text-secondary)" />
                <div>
                  <span style={{ color: "var(--mobile-text-primary)", fontSize: "0.9375rem", display: "block" }}>
                    Security
                  </span>
                  <span style={{ color: "var(--mobile-text-tertiary)", fontSize: "0.75rem" }}>
                    Change password on web
                  </span>
                </div>
              </div>
              <ChevronRight size={20} color="var(--mobile-text-tertiary)" />
            </button>

            {/* Help & Support */}
            <button
              onClick={handleEmailSupport}
              style={{...menuItemStyle, borderBottom: "none"}}
              data-testid="button-support"
            >
              <div style={menuItemContentStyle}>
                <HelpCircle size={20} color="var(--mobile-text-secondary)" />
                <div>
                  <span style={{ color: "var(--mobile-text-primary)", fontSize: "0.9375rem", display: "block" }}>
                    Help & Support
                  </span>
                  <span style={{ color: "var(--mobile-text-tertiary)", fontSize: "0.75rem" }}>
                    support@bjjos.app
                  </span>
                </div>
              </div>
              <Mail size={20} color="var(--mobile-text-tertiary)" />
            </button>
          </div>

          {/* Legal Section */}
          <div style={{
            background: "var(--mobile-medium-gray)",
            borderRadius: "var(--mobile-radius-lg)",
            overflow: "hidden",
            marginBottom: "1.5rem"
          }}>
            {/* Terms of Service */}
            <button
              onClick={() => handleOpenSafari('https://bjjos.app/terms')}
              style={menuItemStyle}
              data-testid="button-terms"
            >
              <div style={menuItemContentStyle}>
                <FileText size={20} color="var(--mobile-text-secondary)" />
                <span style={{ color: "var(--mobile-text-primary)", fontSize: "0.9375rem" }}>
                  Terms of Service
                </span>
              </div>
              <ChevronRight size={20} color="var(--mobile-text-tertiary)" />
            </button>

            {/* Privacy Policy */}
            <button
              onClick={() => handleOpenSafari('https://bjjos.app/privacy')}
              style={{...menuItemStyle, borderBottom: "none"}}
              data-testid="button-privacy"
            >
              <div style={menuItemContentStyle}>
                <Lock size={20} color="var(--mobile-text-secondary)" />
                <span style={{ color: "var(--mobile-text-primary)", fontSize: "0.9375rem" }}>
                  Privacy Policy
                </span>
              </div>
              <ChevronRight size={20} color="var(--mobile-text-tertiary)" />
            </button>
          </div>

          {/* Log Out Button */}
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              width: "100%",
              padding: "1rem",
              background: "transparent",
              border: "1px solid #EF4444",
              borderRadius: "var(--mobile-radius-lg)",
              color: "#EF4444",
              fontSize: "1rem",
              fontWeight: "600",
              cursor: isLoggingOut ? "not-allowed" : "pointer",
              opacity: isLoggingOut ? 0.6 : 1,
              marginBottom: "1.5rem"
            }}
            data-testid="button-logout"
          >
            {isLoggingOut ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <LogOut size={20} />
            )}
            {isLoggingOut ? 'Logging out...' : 'Log Out'}
          </button>

          {/* App Version */}
          <div style={{
            textAlign: "center",
            color: "var(--mobile-text-tertiary)",
            fontSize: "0.75rem",
            paddingBottom: "2rem"
          }}>
            BJJ OS v{APP_VERSION}
          </div>
        </div>

        <MobileBottomNav />
      </div>

      {/* Security Info Modal */}
      {showSecurityInfo && (
        <div 
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "1rem"
          }}
          onClick={() => {
            triggerHaptic('light');
            setShowSecurityInfo(false);
          }}
        >
          <div 
            style={{
              background: "var(--mobile-medium-gray)",
              borderRadius: "var(--mobile-radius-lg)",
              padding: "1.5rem",
              maxWidth: "320px",
              width: "100%"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "1rem"
            }}>
              <Shield size={24} color="var(--mobile-primary)" />
              <h3 style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--mobile-text-primary)"
              }}>
                Security Settings
              </h3>
            </div>
            <p style={{
              color: "var(--mobile-text-secondary)",
              fontSize: "0.9375rem",
              lineHeight: "1.5",
              marginBottom: "1.5rem"
            }}>
              To change your password or manage security settings, please visit:
            </p>
            <div style={{
              background: "var(--mobile-dark-bg)",
              padding: "0.75rem",
              borderRadius: "var(--mobile-radius-md)",
              textAlign: "center",
              marginBottom: "1.5rem"
            }}>
              <span style={{
                color: "var(--mobile-primary)",
                fontSize: "0.9375rem",
                fontWeight: "500"
              }}>
                bjjos.app/settings
              </span>
            </div>
            <button
              onClick={() => {
                triggerHaptic('light');
                setShowSecurityInfo(false);
              }}
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "var(--mobile-primary)",
                border: "none",
                borderRadius: "var(--mobile-radius-md)",
                color: "white",
                fontSize: "0.9375rem",
                fontWeight: "600",
                cursor: "pointer"
              }}
              data-testid="button-close-security"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
