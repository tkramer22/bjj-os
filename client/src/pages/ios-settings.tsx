import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  ArrowLeft, Bell, Moon, Volume2, Vibrate, Mail,
  CreditCard, FileText, Shield, HelpCircle, LogOut, ChevronRight,
  ExternalLink, Loader2, Trash2, RotateCcw, Mic
} from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { clearAuth, isNativeApp, getApiUrl } from "@/lib/capacitorAuth";
import { Browser } from '@capacitor/browser';
import { useChatContext } from "@/contexts/ChatContext";

interface UserProfile {
  id: number;
  email: string;
  name?: string;
  displayName?: string;
  username?: string;
  beltLevel?: string;
  weight?: number | string;
  height?: string;
  style?: string;
  unitPreference?: string;
  injuries?: string | string[];
  isPro?: boolean;
  isLifetime?: boolean;
  subscriptionEndDate?: string;
}

interface SubscriptionDetails {
  type: 'lifetime' | 'referral' | 'paying' | 'trial' | 'none';
  status: string;
  tier: string;
  billingDate: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string | null;
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
  const queryClient = useQueryClient();
  const chatContext = useChatContext();
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [sound, setSound] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [voiceInput, setVoiceInput] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  
  const { data: user } = useQuery<UserProfile>({
    queryKey: ['/api/auth/me'],
  });

  const { data: subscription, isLoading: isLoadingSubscription } = useQuery<SubscriptionDetails>({
    queryKey: ['/api/subscription'],
  });

  const deleteChatHistory = useMutation({
    mutationFn: async () => {
      const sessionToken = localStorage.getItem('sessionToken') || localStorage.getItem('token');
      const response = await fetch(getApiUrl('/api/user/chat-history'), {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {}),
        },
      });
      if (!response.ok) throw new Error('Failed to delete chat history');
      return { success: true };
    },
    onSuccess: () => {
      chatContext.clearMessages();
      queryClient.invalidateQueries({ queryKey: ['/api/chat/history'] });
      setShowDeleteModal(false);
      triggerHaptic('success');
    },
  });

  const resetProfile = useMutation({
    mutationFn: async () => {
      const sessionToken = localStorage.getItem('sessionToken') || localStorage.getItem('token');
      const response = await fetch(getApiUrl('/api/user/reset-profile'), {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {}),
        },
      });
      if (!response.ok) throw new Error('Failed to reset profile');
      return { success: true };
    },
    onSuccess: () => {
      chatContext.clearMessages();
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chat/history'] });
      setShowResetModal(false);
      triggerHaptic('success');
      navigate('/ios-onboarding');
    },
  });

  const cancelSubscription = useMutation({
    mutationFn: async () => {
      const sessionToken = localStorage.getItem('sessionToken') || localStorage.getItem('token');
      const response = await fetch(getApiUrl('/api/subscription/cancel'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {}),
        },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cancel subscription');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setShowCancelModal(false);
      triggerHaptic('success');
    },
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
          {/* LOADING STATE */}
          {isLoadingSubscription && (
            <div style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CreditCard size={20} color="#71717A" />
                <span style={{ fontSize: '15px', color: '#71717A' }}>Plan</span>
              </div>
              <span style={{ fontSize: '15px', color: '#71717A' }}>Loading...</span>
            </div>
          )}

          {/* TYPE 1: LIFETIME MEMBER */}
          {!isLoadingSubscription && subscription?.type === 'lifetime' && (
            <>
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
                <span style={{ fontSize: '15px', color: '#FFFFFF', fontWeight: 600 }} data-testid="text-plan">
                  {isLoadingSubscription ? '...' : 'Lifetime Member'}
                </span>
              </div>
              <div style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: '15px', color: '#71717A' }}>Status</span>
                <span style={{ fontSize: '15px', color: '#FFFFFF' }}>No charge - Forever</span>
              </div>
            </>
          )}

          {/* TYPE 2: 7-DAY TRIAL */}
          {!isLoadingSubscription && subscription?.type === 'trial' && !subscription?.cancelAtPeriodEnd && (
            <>
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
                <span style={{ fontSize: '15px', color: '#FFFFFF', fontWeight: 600 }} data-testid="text-plan">
                  Monthly ($19.99/month)
                </span>
              </div>
              <div style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <span style={{ fontSize: '15px', color: '#71717A' }}>Status</span>
                <span style={{ fontSize: '15px', color: '#8B5CF6' }}>7-day free trial</span>
              </div>
              <div style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <span style={{ fontSize: '15px', color: '#71717A' }}>First billing</span>
                <span style={{ fontSize: '15px', color: '#FFFFFF' }} data-testid="text-billing-date">
                  {formatDate(subscription?.trialEnd || subscription?.billingDate)}
                </span>
              </div>
              <button
                onClick={() => { triggerHaptic('medium'); setShowCancelModal(true); }}
                data-testid="button-cancel-subscription"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderTop: '1px solid #2A2A2E',
                }}
              >
                <span style={{ fontSize: '15px', color: '#EF4444' }}>Cancel Subscription</span>
              </button>
            </>
          )}

          {/* TYPE 3: 30-DAY REFERRAL TRIAL */}
          {!isLoadingSubscription && subscription?.type === 'referral' && !subscription?.cancelAtPeriodEnd && (
            <>
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
                <span style={{ fontSize: '15px', color: '#FFFFFF', fontWeight: 600 }} data-testid="text-plan">
                  Monthly ($19.99/month)
                </span>
              </div>
              <div style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <span style={{ fontSize: '15px', color: '#71717A' }}>Status</span>
                <span style={{ fontSize: '15px', color: '#8B5CF6' }}>30-day free trial</span>
              </div>
              <div style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <span style={{ fontSize: '15px', color: '#71717A' }}>First billing</span>
                <span style={{ fontSize: '15px', color: '#FFFFFF' }} data-testid="text-billing-date">
                  {formatDate(subscription?.trialEnd || subscription?.billingDate)}
                </span>
              </div>
              <button
                onClick={() => { triggerHaptic('medium'); setShowCancelModal(true); }}
                data-testid="button-cancel-subscription"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderTop: '1px solid #2A2A2E',
                }}
              >
                <span style={{ fontSize: '15px', color: '#EF4444' }}>Cancel Subscription</span>
              </button>
            </>
          )}

          {/* TYPE 4: PAYING SUBSCRIBER */}
          {!isLoadingSubscription && subscription?.type === 'paying' && !subscription?.cancelAtPeriodEnd && (
            <>
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
                <span style={{ fontSize: '15px', color: '#FFFFFF', fontWeight: 600 }} data-testid="text-plan">
                  Monthly
                </span>
              </div>
              <div style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <span style={{ fontSize: '15px', color: '#71717A' }}>Price</span>
                <span style={{ fontSize: '15px', color: '#FFFFFF' }}>$19.99/month</span>
              </div>
              <div style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <span style={{ fontSize: '15px', color: '#71717A' }}>Next billing</span>
                <span style={{ fontSize: '15px', color: '#FFFFFF' }} data-testid="text-billing-date">
                  {formatDate(subscription?.billingDate)}
                </span>
              </div>
              <button
                onClick={() => { triggerHaptic('medium'); setShowCancelModal(true); }}
                data-testid="button-cancel-subscription"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderTop: '1px solid #2A2A2E',
                }}
              >
                <span style={{ fontSize: '15px', color: '#EF4444' }}>Cancel Subscription</span>
              </button>
            </>
          )}

          {/* TYPE 5: CANCELLED (still has access) */}
          {!isLoadingSubscription && subscription?.cancelAtPeriodEnd && subscription?.type !== 'lifetime' && (
            <>
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
                <span style={{ fontSize: '15px', color: '#F59E0B', fontWeight: 600 }} data-testid="text-plan">
                  Monthly (Cancelled)
                </span>
              </div>
              <div style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <span style={{ fontSize: '15px', color: '#71717A' }}>Access until</span>
                <span style={{ fontSize: '15px', color: '#F59E0B' }} data-testid="text-billing-date">
                  {formatDate(subscription?.billingDate)}
                </span>
              </div>
              <div style={{
                padding: '16px 20px',
                background: 'rgba(245, 158, 11, 0.1)',
              }}>
                <p style={{ fontSize: '14px', color: '#F59E0B', margin: 0 }}>
                  Your subscription has been cancelled.
                </p>
                <p style={{ fontSize: '14px', color: '#F59E0B', margin: '4px 0 0 0' }}>
                  You won't be charged again.
                </p>
              </div>
            </>
          )}

          {/* TYPE 6: NO SUBSCRIPTION or UNKNOWN (fallback) */}
          {!isLoadingSubscription && (subscription?.type === 'none' || (!subscription?.type && !subscription?.cancelAtPeriodEnd)) && (
            <>
              <div style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <CreditCard size={20} color="#71717A" />
                  <span style={{ fontSize: '15px', color: '#71717A' }}>Plan</span>
                </div>
                <span style={{ fontSize: '15px', color: '#FFFFFF', fontWeight: 600 }} data-testid="text-plan">
                  No active subscription
                </span>
              </div>
            </>
          )}

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
            borderBottom: '1px solid #2A2A2E',
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

          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Mic size={20} color="#71717A" />
              <div>
                <span style={{ fontSize: '15px' }}>Voice Input</span>
                <p style={{ fontSize: '12px', color: '#71717A', margin: '2px 0 0 0' }}>
                  Use microphone with Whisper AI
                </p>
              </div>
            </div>
            <ToggleSwitch 
              enabled={voiceInput} 
              onToggle={() => toggleSetting(setVoiceInput, voiceInput)}
              testId="toggle-voice-input"
            />
          </div>
        </div>

        {/* Data & Privacy Section */}
        <h2 style={{ 
          fontSize: '13px', 
          fontWeight: 600, 
          color: '#71717A', 
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '12px',
          paddingLeft: '8px'
        }}>
          Data & Privacy
        </h2>
        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #2A2A2E',
          marginBottom: '24px',
        }}>
          <button
            onClick={() => { triggerHaptic('light'); setShowDeleteModal(true); }}
            data-testid="button-delete-chat"
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
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Trash2 size={20} color="#71717A" />
                <span style={{ color: '#FFFFFF', fontSize: '15px' }}>Delete Chat History</span>
              </div>
              <p style={{ 
                fontSize: '13px', 
                color: '#71717A', 
                margin: '4px 0 0 32px',
                textAlign: 'left'
              }}>
                Removes all messages. Your profile stays intact.
              </p>
            </div>
            <ChevronRight size={20} color="#71717A" />
          </button>

          <button
            onClick={() => { triggerHaptic('light'); setShowResetModal(true); }}
            data-testid="button-reset-profile"
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
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <RotateCcw size={20} color="#71717A" />
                <span style={{ color: '#FFFFFF', fontSize: '15px' }}>Reset Professor OS Memory</span>
              </div>
              <p style={{ 
                fontSize: '13px', 
                color: '#71717A', 
                margin: '4px 0 0 32px',
                textAlign: 'left'
              }}>
                Start completely fresh. Removes conversations AND profile.
              </p>
            </div>
            <ChevronRight size={20} color="#71717A" />
          </button>
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

      {/* Delete Chat History Modal */}
      {showDeleteModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowDeleteModal(false)}
          data-testid="modal-delete-overlay"
        >
          <div 
            style={{
              background: '#1A1A1D',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '320px',
              width: '100%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              marginBottom: '12px',
              color: '#FFFFFF'
            }}>
              Delete Chat History?
            </h3>
            <p style={{ 
              fontSize: '14px', 
              color: '#A1A1AA', 
              lineHeight: 1.5,
              marginBottom: '24px'
            }}>
              This will permanently delete all your conversations with Professor OS. Your profile (belt rank, goals, preferences) will not be affected. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                data-testid="button-cancel-delete"
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#2A2A2E',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteChatHistory.mutate()}
                disabled={deleteChatHistory.isPending}
                data-testid="button-confirm-delete"
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#DC2626',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: deleteChatHistory.isPending ? 0.5 : 1,
                }}
              >
                {deleteChatHistory.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Profile Modal */}
      {showResetModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowResetModal(false)}
          data-testid="modal-reset-overlay"
        >
          <div 
            style={{
              background: '#1A1A1D',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '320px',
              width: '100%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              marginBottom: '12px',
              color: '#FFFFFF'
            }}>
              Reset Professor OS Memory?
            </h3>
            <p style={{ 
              fontSize: '14px', 
              color: '#A1A1AA', 
              lineHeight: 1.5,
              marginBottom: '24px'
            }}>
              Professor OS will forget everything about your training history, goals, and preferences. You'll start fresh like a new user. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowResetModal(false)}
                data-testid="button-cancel-reset"
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#2A2A2E',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => resetProfile.mutate()}
                disabled={resetProfile.isPending}
                data-testid="button-confirm-reset"
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#DC2626',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: resetProfile.isPending ? 0.5 : 1,
                }}
              >
                {resetProfile.isPending ? 'Resetting...' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Subscription Confirmation Modal */}
      {showCancelModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowCancelModal(false)}
          data-testid="modal-cancel-subscription-overlay"
        >
          <div 
            style={{
              background: '#1A1A1D',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '320px',
              width: '100%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              marginBottom: '12px',
              color: '#FFFFFF'
            }}>
              Cancel Subscription?
            </h3>
            <p style={{ 
              fontSize: '14px', 
              color: '#A1A1AA', 
              lineHeight: 1.5,
              marginBottom: '24px'
            }}>
              Are you sure you want to cancel? You'll retain access until {formatDate(subscription?.billingDate)}.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowCancelModal(false)}
                data-testid="button-keep-subscription"
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#8B5CF6',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Keep Subscription
              </button>
              <button
                onClick={() => cancelSubscription.mutate()}
                disabled={cancelSubscription.isPending}
                data-testid="button-confirm-cancel-subscription"
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#2A2A2E',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: cancelSubscription.isPending ? 0.5 : 1,
                }}
              >
                {cancelSubscription.isPending ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
