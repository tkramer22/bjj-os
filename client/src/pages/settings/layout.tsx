import { useLocation, Link, useRoute } from "wouter";
import { User, CreditCard, Users, LogOut, ArrowLeft, Shield } from "lucide-react";
import { BeltIcon } from "@/components/BeltIcon";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const settingsNav = [
  {
    title: "Profile",
    path: "/settings/profile",
    icon: User,
  },
  {
    title: "Security",
    path: "/settings/security",
    icon: Shield,
  },
  {
    title: "Subscription",
    path: "/settings/subscription",
    icon: CreditCard,
  },
  {
    title: "Referrals",
    path: "/settings/referrals",
    icon: Users,
  },
];

function SettingsSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2 mb-4">
            <BeltIcon className="w-4 h-4 text-primary" />
            <span className="text-base font-semibold">BJJ OS Settings</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsNav.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.path} data-testid={`link-${item.title.toLowerCase()}`}>
                        <Icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  
  const handleLogout = async () => {
    // Clear auth from both web and native storage
    const { clearAuth } = await import('@/lib/capacitorAuth');
    await clearAuth();
    // Use navigate instead of window.location for consistent routing
    navigate("/");
  };

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <SettingsSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <Link href="/chat">
              <Button variant="ghost" size="sm" data-testid="button-back-chat">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Chat
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
