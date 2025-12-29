import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { MessageCircle, BookOpen, Trophy, Flame, TrendingUp } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface UserData {
  displayName?: string;
  beltLevel?: string;
}

interface StatsData {
  messagesCount?: number;
  savedVideos?: number;
  streak?: number;
  progressPercent?: number;
}

export default function IOSHomePage() {
  const [, navigate] = useLocation();

  const { data: user } = useQuery<UserData>({
    queryKey: ["/api/auth/me"],
  });

  const { data: stats } = useQuery<StatsData>({
    queryKey: ["/api/user/stats"],
    enabled: !!user,
  });

  const handleQuickAction = (path: string) => {
    triggerHaptic('light');
    navigate(path);
  };

  const getBeltEmoji = (belt?: string) => {
    const belts: Record<string, string> = {
      white: "White Belt",
      blue: "Blue Belt", 
      purple: "Purple Belt",
      brown: "Brown Belt",
      black: "Black Belt"
    };
    return belts[belt || 'white'] || "White Belt";
  };

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
          Welcome back{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
        </h1>
        <p style={{ 
          color: '#71717A', 
          fontSize: '14px',
          marginTop: '4px',
        }}>
          {getBeltEmoji(user?.beltLevel)}
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        padding: '20px',
      }}>
        <div 
          style={{
            background: '#1A1A1D',
            borderRadius: '16px',
            padding: '16px',
            border: '1px solid #2A2A2E',
          }}
          data-testid="stat-messages"
        >
          <MessageCircle size={24} color="#8B5CF6" />
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700 }}>
              {stats?.messagesCount || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#71717A' }}>
              Coaching Sessions
            </div>
          </div>
        </div>

        <div 
          style={{
            background: '#1A1A1D',
            borderRadius: '16px',
            padding: '16px',
            border: '1px solid #2A2A2E',
          }}
          data-testid="stat-videos"
        >
          <BookOpen size={24} color="#8B5CF6" />
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700 }}>
              {stats?.savedVideos || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#71717A' }}>
              Saved Techniques
            </div>
          </div>
        </div>

        <div 
          style={{
            background: '#1A1A1D',
            borderRadius: '16px',
            padding: '16px',
            border: '1px solid #2A2A2E',
          }}
          data-testid="stat-streak"
        >
          <Flame size={24} color="#F97316" />
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700 }}>
              {stats?.streak || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#71717A' }}>
              Day Streak
            </div>
          </div>
        </div>

        <div 
          style={{
            background: '#1A1A1D',
            borderRadius: '16px',
            padding: '16px',
            border: '1px solid #2A2A2E',
          }}
          data-testid="stat-progress"
        >
          <TrendingUp size={24} color="#22C55E" />
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700 }}>
              {stats?.progressPercent || 0}%
            </div>
            <div style={{ fontSize: '12px', color: '#71717A' }}>
              Weekly Progress
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ padding: '0 20px' }}>
        <h2 style={{ 
          fontSize: '18px', 
          fontWeight: 600,
          marginBottom: '16px',
        }}>
          Quick Actions
        </h2>

        <button
          onClick={() => handleQuickAction('/ios-chat')}
          onTouchEnd={() => handleQuickAction('/ios-chat')}
          data-testid="button-start-coaching"
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
            border: 'none',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            cursor: 'pointer',
          }}
        >
          <div style={{
            width: '48px',
            height: '48px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <MessageCircle size={24} color="#FFFFFF" />
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ 
              color: '#FFFFFF', 
              fontSize: '16px', 
              fontWeight: 600,
            }}>
              Start Coaching Session
            </div>
            <div style={{ 
              color: 'rgba(255,255,255,0.7)', 
              fontSize: '13px',
            }}>
              Chat with Professor OS
            </div>
          </div>
        </button>

        <button
          onClick={() => handleQuickAction('/ios-library')}
          onTouchEnd={() => handleQuickAction('/ios-library')}
          data-testid="button-browse-library"
          style={{
            width: '100%',
            background: '#1A1A1D',
            border: '1px solid #2A2A2E',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            cursor: 'pointer',
          }}
        >
          <div style={{
            width: '48px',
            height: '48px',
            background: '#2A2A2E',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <BookOpen size={24} color="#8B5CF6" />
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ 
              color: '#FFFFFF', 
              fontSize: '16px', 
              fontWeight: 600,
            }}>
              Browse Technique Library
            </div>
            <div style={{ 
              color: '#71717A', 
              fontSize: '13px',
            }}>
              2,000+ instructional videos
            </div>
          </div>
        </button>
      </div>

      <IOSBottomNav />
    </div>
  );
}
