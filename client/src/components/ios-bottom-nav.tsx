import { Link, useLocation } from "wouter";
import { MessageCircle, BookOpen, User, Bookmark } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

export function IOSBottomNav() {
  const [location] = useLocation();

  // iOS app uses iOS-specific routes for consistent navigation experience
  const navItems = [
    { path: "/ios-chat", icon: MessageCircle, label: "Chat" },
    { path: "/ios-library", icon: BookOpen, label: "Videos" },
    { path: "/ios-saved", icon: Bookmark, label: "Saved" },
    { path: "/ios-profile", icon: User, label: "Profile" },
  ];

  const handleNavClick = () => {
    triggerHaptic('light');
  };

  return (
    <nav 
      className="ios-bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#121214',
        borderTop: '1px solid #2A2A2E',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '8px 0',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        zIndex: 9999,
      }}
      data-testid="ios-bottom-nav"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.path || location.startsWith(item.path + '/');
        
        return (
          <Link
            key={item.path}
            href={item.path}
            onClick={handleNavClick}
            data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              color: isActive ? '#8B5CF6' : '#71717A',
              textDecoration: 'none',
              padding: '8px 16px',
              fontSize: '11px',
              fontWeight: isActive ? 600 : 400,
              WebkitTapHighlightColor: 'rgba(139, 92, 246, 0.3)',
              background: isActive ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              borderRadius: '12px',
            }}
          >
            <Icon 
              size={24} 
              strokeWidth={isActive ? 2.5 : 2}
              fill={isActive ? '#8B5CF6' : 'none'}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
