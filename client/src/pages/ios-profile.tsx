import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { User, Settings, ChevronRight, Loader2, Mail } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

console.log('✅ iOS PROFILE loaded');

interface UserProfile {
  id: number;
  username?: string;
  name?: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  beltLevel?: string;
  style?: string;
  weight?: number | string;
}

export default function IOSProfilePage() {
  const [, navigate] = useLocation();

  const { data: user, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/auth/me"],
  });

  const handleNavigate = (path: string) => {
    triggerHaptic('light');
    navigate(path);
  };

  const getBeltColor = (belt?: string) => {
    const colors: Record<string, string> = {
      white: '#FFFFFF',
      blue: '#3B82F6',
      purple: '#8B5CF6',
      brown: '#92400E',
      black: '#1F2937'
    };
    return colors[belt?.toLowerCase() || 'white'] || '#FFFFFF';
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
        {/* User Card - Simplified */}
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
                {user?.name || user?.displayName || user?.username || 'BJJ Practitioner'}
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
          
          {/* Training Stats - Only Belt, Style, Weight */}
          <div style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid #2A2A2E',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  fontSize: '14px', 
                  fontWeight: 600, 
                  color: getBeltColor(user?.beltLevel),
                  textTransform: 'capitalize'
                }} data-testid="text-belt-level">
                  {user?.beltLevel || 'N/A'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717A' }}>Belt</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }} data-testid="text-weight">
                  {user?.weight ? `${user.weight} lbs` : 'N/A'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717A' }}>Weight</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  fontSize: '14px', 
                  fontWeight: 600,
                  textTransform: 'capitalize'
                }} data-testid="text-style">
                  {user?.style || 'N/A'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717A' }}>Style</div>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Link Only */}
        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #2A2A2E',
        }}>
          <button
            onClick={() => handleNavigate('/ios-settings')}
            data-testid="button-settings"
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
              <Settings size={20} color="#71717A" />
              <span style={{ color: '#FFFFFF', fontSize: '15px' }}>Settings</span>
            </div>
            <ChevronRight size={20} color="#71717A" />
          </button>
        </div>
      </div>

      <IOSBottomNav />
    </div>
  );
}
