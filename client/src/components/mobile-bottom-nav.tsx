import { Link, useLocation } from "wouter";
import { MessageCircle, BookOpen, Bookmark, User } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

export function MobileBottomNav() {
  const [location] = useLocation();

  // Consistent labels across all pages: Chat, Videos, Saved, Settings
  const navItems = [
    { path: "/chat", icon: MessageCircle, label: "Chat" },
    { path: "/library", icon: BookOpen, label: "Videos" },
    { path: "/saved-videos", icon: Bookmark, label: "Saved" },
    { path: "/settings", icon: User, label: "Settings" },
  ];

  const handleNavClick = () => {
    triggerHaptic('light');
  };

  return (
    <nav className="mobile-bottom-nav mobile-safe-area-bottom">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.path;
        
        return (
          <Link
            key={item.path}
            href={item.path}
            className={`mobile-bottom-nav-item ${isActive ? "active" : ""}`}
            data-testid={`nav-${item.label.toLowerCase()}`}
            onClick={handleNavClick}
          >
            <Icon className="w-6 h-6" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
