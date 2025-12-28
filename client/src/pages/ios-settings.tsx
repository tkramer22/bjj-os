import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, Moon, Volume2, Vibrate, User, Award, Scale, Ruler, Calendar } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface UserProfile {
  id: number;
  email: string;
  name?: string;
  username?: string;
  beltLevel?: string;
  weight?: number;
  height?: number;
  trainingFrequency?: string;
  style?: string;
  age?: number;
  struggleTechnique?: string;
  injuries?: string;
}

export default function IOSSettingsPage() {
  const [, navigate] = useLocation();
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [sound, setSound] = useState(true);
  const [haptics, setHaptics] = useState(true);
  
  // Fetch user profile data
  const { data: user } = useQuery<UserProfile>({
    queryKey: ['/api/auth/me'],
  });

  const handleBack = () => {
    triggerHaptic('light');
    navigate('/ios-profile');
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
    }}>
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
        {/* Profile Section */}
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
              Profile
            </h2>
            <div style={{
              background: '#1A1A1D',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid #2A2A2E',
              marginBottom: '24px',
            }}>
              {/* Name */}
              <div style={{
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <User size={18} color="#71717A" />
                  <span style={{ fontSize: '15px', color: '#71717A' }}>Name</span>
                </div>
                <span style={{ fontSize: '15px', color: '#FFFFFF' }} data-testid="text-user-name">
                  {user.name || user.username || 'Not set'}
                </span>
              </div>

              {/* Belt Level */}
              <div style={{
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Award size={18} color="#71717A" />
                  <span style={{ fontSize: '15px', color: '#71717A' }}>Belt</span>
                </div>
                <span style={{ fontSize: '15px', color: '#8B5CF6' }} data-testid="text-user-belt">
                  {user.beltLevel || 'Not set'}
                </span>
              </div>

              {/* Style */}
              <div style={{
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <User size={18} color="#71717A" />
                  <span style={{ fontSize: '15px', color: '#71717A' }}>Style</span>
                </div>
                <span style={{ fontSize: '15px', color: '#FFFFFF' }} data-testid="text-user-style">
                  {user.style || 'Not set'}
                </span>
              </div>

              {/* Weight */}
              <div style={{
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Scale size={18} color="#71717A" />
                  <span style={{ fontSize: '15px', color: '#71717A' }}>Weight</span>
                </div>
                <span style={{ fontSize: '15px', color: '#FFFFFF' }} data-testid="text-user-weight">
                  {user.weight ? `${user.weight} lbs` : 'Not set'}
                </span>
              </div>

              {/* Height */}
              <div style={{
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #2A2A2E',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Ruler size={18} color="#71717A" />
                  <span style={{ fontSize: '15px', color: '#71717A' }}>Height</span>
                </div>
                <span style={{ fontSize: '15px', color: '#FFFFFF' }} data-testid="text-user-height">
                  {user.height ? `${Math.floor(user.height / 12)}'${user.height % 12}"` : 'Not set'}
                </span>
              </div>

              {/* Training Frequency */}
              <div style={{
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Calendar size={18} color="#71717A" />
                  <span style={{ fontSize: '15px', color: '#71717A' }}>Training</span>
                </div>
                <span style={{ fontSize: '15px', color: '#FFFFFF' }} data-testid="text-user-training">
                  {user.trainingFrequency || 'Not set'}
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

        <p style={{
          marginTop: '16px',
          padding: '0 8px',
          fontSize: '13px',
          color: '#71717A',
          lineHeight: 1.5,
        }}>
          Settings are stored locally on your device. Some features may require app restart to take effect.
        </p>
      </div>
    </div>
  );
}
