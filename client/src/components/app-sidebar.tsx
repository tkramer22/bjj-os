import { Home, Calendar, Users, Settings, MessageSquare, FileText, BarChart3, Brain, Sparkles } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    testId: "link-dashboard",
  },
  {
    title: "Schedules",
    url: "/schedules",
    icon: Calendar,
    testId: "link-schedules",
  },
  {
    title: "Recipients",
    url: "/recipients",
    icon: Users,
    testId: "link-recipients",
  },
  {
    title: "Templates",
    url: "/templates",
    icon: FileText,
    testId: "link-templates",
  },
  {
    title: "Analytics",
    url: "/admin/analytics",
    icon: BarChart3,
    testId: "link-analytics",
  },
  {
    title: "History",
    url: "/admin/history",
    icon: MessageSquare,
    testId: "link-history",
  },
  {
    title: "AI Monitoring",
    url: "/admin/ai-monitoring",
    icon: Brain,
    testId: "link-ai-monitoring",
  },
  {
    title: "AI Intelligence",
    url: "/admin/ai-intelligence",
    icon: Sparkles,
    testId: "link-ai-intelligence",
  },
  {
    title: "Settings",
    url: "/admin/settings",
    icon: Settings,
    testId: "link-settings",
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                <MessageSquare className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">SMS Scheduler</span>
                <span className="text-xs text-muted-foreground">Twilio Integration</span>
              </div>
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-4">
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url} data-testid={item.testId}>
                        <item.icon className="h-4 w-4" />
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
      <SidebarFooter className="p-4">
        <div className="rounded-md border border-sidebar-border bg-sidebar p-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-chart-2" />
            <span className="text-xs font-medium">Twilio Connected</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Ready to send messages
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
