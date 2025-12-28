import { useQuery } from "@tanstack/react-query";
import { BeltIcon } from "@/components/BeltIcon";
import { Calendar, TrendingUp, Flame } from "lucide-react";
import { format } from "date-fns";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

export default function MobileProgressPage() {
  const userId = localStorage.getItem('mobileUserId') || '1';
  
  const { data: user, isLoading } = useQuery<any>({
    queryKey: ["/api/users", userId],
  });

  if (isLoading) {
    return (
      <div className="mobile-app">
        <div className="mobile-container">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: 'calc(100vh - 60px)',
            background: 'var(--mobile-bg-primary)'
          }}>
            <div style={{ fontSize: '1.5rem', color: 'var(--mobile-text-primary)' }}>Loading...</div>
          </div>
          <MobileBottomNav />
        </div>
      </div>
    );
  }

  const memberSince = user?.createdAt ? format(new Date(user.createdAt), 'MMMM d, yyyy') : 'Unknown';
  const totalLogins = user?.totalLogins || 0;
  const currentStreak = user?.currentStreak || 0;
  const beltLevel = user?.beltLevel || 'blue';

  return (
    <div className="mobile-app">
      <div className="mobile-container">
        <div style={{ 
          minHeight: 'calc(100vh - 60px)',
          background: 'var(--mobile-bg-primary)',
          overflowY: 'auto'
        }}>
      <div className="mobile-safe-area-top" style={{ padding: '1.5rem' }}>
        {/* Header with Belt */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: 'bold', 
            marginBottom: '1.5rem',
            color: 'var(--mobile-text-primary)'
          }}>
            Your Progress
          </h1>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <BeltIcon rank={beltLevel as any} size="large" />
          </div>
          <p style={{ 
            color: 'var(--mobile-text-secondary)',
            fontSize: '1.125rem'
          }}>
            {beltLevel.charAt(0).toUpperCase() + beltLevel.slice(1)} Belt
          </p>
        </div>

        {/* Stats Grid */}
        <div style={{ 
          display: 'grid', 
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          {/* Member Since */}
          <div style={{
            background: 'var(--mobile-surface)',
            border: '1px solid var(--mobile-border)',
            borderRadius: '0.75rem',
            padding: '1rem'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '0.5rem'
            }}>
              <span style={{ 
                fontSize: '0.875rem', 
                fontWeight: '500',
                color: 'var(--mobile-text-secondary)'
              }}>
                Member Since
              </span>
              <Calendar size={16} style={{ color: 'var(--mobile-text-secondary)' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--mobile-text-primary)' }}>
              {memberSince}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--mobile-text-secondary)', marginTop: '0.25rem' }}>
              Your journey began
            </p>
          </div>

          {/* Total Logins */}
          <div style={{
            background: 'var(--mobile-surface)',
            border: '1px solid var(--mobile-border)',
            borderRadius: '0.75rem',
            padding: '1rem'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '0.5rem'
            }}>
              <span style={{ 
                fontSize: '0.875rem', 
                fontWeight: '500',
                color: 'var(--mobile-text-secondary)'
              }}>
                Total Logins
              </span>
              <TrendingUp size={16} style={{ color: 'var(--mobile-text-secondary)' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--mobile-text-primary)' }}>
              {totalLogins}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--mobile-text-secondary)', marginTop: '0.25rem' }}>
              Training sessions
            </p>
          </div>

          {/* Current Streak */}
          <div style={{
            background: 'var(--mobile-surface)',
            border: '1px solid var(--mobile-border)',
            borderRadius: '0.75rem',
            padding: '1rem'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '0.5rem'
            }}>
              <span style={{ 
                fontSize: '0.875rem', 
                fontWeight: '500',
                color: 'var(--mobile-text-secondary)'
              }}>
                Current Streak
              </span>
              <Flame size={16} style={{ color: '#f59e0b' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--mobile-text-primary)' }}>
              {currentStreak}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--mobile-text-secondary)', marginTop: '0.25rem' }}>
              {currentStreak === 1 ? 'day' : 'days'} in a row
            </p>
          </div>
        </div>

        {/* Training Profile */}
        <div style={{
          background: 'var(--mobile-surface)',
          border: '1px solid var(--mobile-border)',
          borderRadius: '0.75rem',
          padding: '1rem'
        }}>
          <h3 style={{ 
            fontSize: '1.125rem', 
            fontWeight: 'bold',
            marginBottom: '1rem',
            color: 'var(--mobile-text-primary)'
          }}>
            Training Profile
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--mobile-text-secondary)' }}>Training Style:</span>
              <span style={{ fontWeight: '500', textTransform: 'capitalize', color: 'var(--mobile-text-primary)' }}>
                {user?.style || 'Not set'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--mobile-text-secondary)' }}>Training Frequency:</span>
              <span style={{ fontWeight: '500', color: 'var(--mobile-text-primary)' }}>
                {user?.trainingFrequency || 0} days/week
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--mobile-text-secondary)' }}>Subscription:</span>
              <span style={{ fontWeight: '500', textTransform: 'capitalize', color: 'var(--mobile-text-primary)' }}>
                {user?.subscriptionType?.replace('_', ' ') || 'Free Trial'}
              </span>
            </div>
          </div>
        </div>
      </div>
        </div>
        <MobileBottomNav />
      </div>
    </div>
  );
}
