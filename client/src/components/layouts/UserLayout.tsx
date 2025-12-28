import { useLocation, Link } from "wouter";
import { MessageSquare, Heart, Settings, BookOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface AuthUser {
  id: number;
  username?: string;
  displayName?: string;
  beltLevel?: string;
}

interface UserLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: "/chat", icon: MessageSquare, label: "Chat", testId: "nav-chat" },
  { path: "/library", icon: BookOpen, label: "Videos", testId: "nav-library" },
  { path: "/saved-videos", icon: Heart, label: "Saved", testId: "nav-saved" },
  { path: "/settings", icon: Settings, label: "Settings", testId: "nav-settings" },
];

export default function UserLayout({ children }: UserLayoutProps) {
  const [location] = useLocation();
  
  const { data: currentUser } = useQuery<AuthUser>({
    queryKey: ['/api/auth/me'],
  });

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Desktop Sidebar - Always visible on screens > 768px */}
      <aside className="hidden md:flex md:w-64 flex-col border-r bg-card">
        {/* Header */}
        <div className="p-6 border-b">
          <a href="/" data-testid="link-home">
            <img src="/bjjos-logo.png" alt="BJJ OS" className="h-8 w-auto" />
          </a>
          {currentUser?.displayName && (
            <p className="text-sm text-muted-foreground mt-1">
              {currentUser.displayName}
            </p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            
            return (
              <Link key={item.path} href={item.path}>
                <a
                  data-testid={item.testId}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-md
                    transition-colors hover-elevate active-elevate-2 cursor-pointer
                    ${isActive 
                      ? 'bg-primary text-primary-foreground' 
                      : 'text-foreground hover:bg-accent'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </a>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area with proper mobile spacing */}
      <main className="flex-1 overflow-auto flex flex-col pb-16 md:pb-0">
        {children}
      </main>

      {/* Mobile Bottom Navigation - Always visible on screens ≤ 768px */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-card border-t"
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            
            return (
              <Link key={item.path} href={item.path}>
                <a
                  data-testid={`${item.testId}-mobile`}
                  className={`
                    flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-md
                    transition-colors min-w-[60px] cursor-pointer
                    ${isActive 
                      ? 'text-primary' 
                      : 'text-muted-foreground hover:text-foreground'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'fill-primary' : ''}`} />
                  <span className="text-xs font-medium">{item.label}</span>
                </a>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
