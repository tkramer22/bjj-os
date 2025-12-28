import { useLocation } from "wouter";
import { Brain, Bookmark, Video, Settings, LogOut } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AdaptiveLayoutProps {
  children: React.ReactNode;
}

interface AuthUser {
  id: number;
  email?: string;
  name?: string;
  username?: string;
  beltLevel?: 'white' | 'blue' | 'purple' | 'brown' | 'black';
}

const navItems = [
  {
    id: 'chat',
    label: 'Chat',
    icon: Brain,
    path: '/chat',
  },
  {
    id: 'library',
    label: 'Videos',
    icon: Video,
    path: '/library',
  },
  {
    id: 'saved',
    label: 'Saved',
    icon: Bookmark,
    path: '/saved-videos',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    path: '/settings',
  },
];

const beltColors = {
  white: '#FFFFFF',
  blue: '#2563EB',
  purple: '#7C3AED',
  brown: '#92400E',
  black: '#000000',
};

export default function AdaptiveLayout({ children }: AdaptiveLayoutProps) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Get user data
  const { data: user } = useQuery<AuthUser>({
    queryKey: ['/api/auth/me'],
  });

  const handleLogout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
      // Clear auth from both web and native storage
      const { clearAuth } = await import('@/lib/capacitorAuth');
      await clearAuth();
      setLocation('/email-login');
      toast({
        title: "Logged out",
        description: "See you on the mat!",
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const isActive = (path: string) => location === path;

  const displayName = user?.name || user?.username || 'User';
  const beltLevel = user?.beltLevel || 'white';
  const beltColor = beltColors[beltLevel];

  return (
    <div className="adaptive-layout">
      {/* Desktop Sidebar */}
      <aside className="desktop-sidebar">
        <div className="sidebar-content">
          {/* Logo/Branding */}
          <div className="sidebar-header">
            <div className="logo">
              <Brain className="logo-icon" />
              <span className="logo-text">BJJ OS</span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="sidebar-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              
              return (
                <button
                  key={item.id}
                  onClick={() => setLocation(item.path)}
                  className={`nav-item ${active ? 'active' : ''}`}
                  data-testid={`nav-${item.id}`}
                >
                  <Icon className="nav-icon" />
                  <span className="nav-label">{item.label}</span>
                  {active && <div className="active-indicator" />}
                </button>
              );
            })}
          </nav>

          {/* User Profile */}
          <div className="sidebar-footer">
            <div className="user-profile">
              <div className="user-info">
                <span className="user-name">{displayName}</span>
                <Badge 
                  style={{ 
                    backgroundColor: beltColor,
                    color: beltLevel === 'white' ? '#000' : '#fff',
                  }}
                  className="belt-badge"
                >
                  {beltLevel.toUpperCase()}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="logout-btn"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <button
              key={item.id}
              onClick={() => setLocation(item.path)}
              className={`bottom-nav-item ${active ? 'active' : ''}`}
              data-testid={`mobile-nav-${item.id}`}
            >
              <Icon className="bottom-nav-icon" />
              <span className="bottom-nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <style>{`
        /* ==================== LAYOUT STRUCTURE ==================== */
        .adaptive-layout {
          display: flex;
          height: 100vh;
          width: 100%;
          background: #000;
          color: #fff;
          overflow: hidden;
        }

        .main-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding-bottom: 80px; /* Space for mobile bottom nav */
        }

        /* ==================== DESKTOP SIDEBAR ==================== */
        .desktop-sidebar {
          display: none;
        }

        @media (min-width: 768px) {
          .desktop-sidebar {
            display: flex;
            flex-direction: column;
            width: 240px;
            background: #0F0F0F;
            border-right: 1px solid rgba(255, 255, 255, 0.1);
          }

          .main-content {
            padding-bottom: 0;
          }
        }

        .sidebar-content {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 16px;
        }

        .sidebar-header {
          margin-bottom: 32px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px;
        }

        .logo-icon {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
          border-radius: 8px;
          padding: 6px;
        }

        .logo-text {
          font-size: 20px;
          font-weight: 700;
          background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .nav-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: transparent;
          border: none;
          border-radius: 8px;
          color: #A0A0A0;
          cursor: pointer;
          transition: all 150ms ease;
          font-size: 15px;
          font-weight: 500;
        }

        .nav-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
        }

        .nav-item.active {
          background: rgba(37, 99, 235, 0.1);
          color: #fff;
        }

        .nav-item.active .nav-icon {
          background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .nav-icon {
          width: 20px;
          height: 20px;
        }

        .nav-label {
          flex: 1;
          text-align: left;
        }

        .active-indicator {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 24px;
          background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
          border-radius: 0 2px 2px 0;
        }

        .sidebar-footer {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 16px;
        }

        .user-profile {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px;
        }

        .user-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .user-name {
          font-size: 14px;
          font-weight: 600;
          color: #fff;
        }

        .belt-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .logout-btn {
          opacity: 0.6;
        }

        .logout-btn:hover {
          opacity: 1;
        }

        /* ==================== MOBILE BOTTOM NAV ==================== */
        .mobile-bottom-nav {
          display: flex;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 64px;
          background: rgba(0, 0, 0, 0.95);
          backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          z-index: 1000;
          padding-bottom: env(safe-area-inset-bottom);
        }

        @media (min-width: 768px) {
          .mobile-bottom-nav {
            display: none;
          }
        }

        .bottom-nav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          background: transparent;
          border: none;
          color: #71717A;
          cursor: pointer;
          transition: all 150ms ease;
          padding: 8px;
        }

        .bottom-nav-item.active {
          color: #fff;
        }

        .bottom-nav-item.active .bottom-nav-icon {
          color: #7C3AED;
        }

        .bottom-nav-icon {
          width: 24px;
          height: 24px;
          stroke: currentColor;
        }

        .bottom-nav-label {
          font-size: 11px;
          font-weight: 600;
        }

        /* ==================== MOBILE OPTIMIZATIONS ==================== */
        @media (max-width: 767px) {
          .main-content {
            padding-bottom: calc(64px + env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </div>
  );
}
