import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  LayoutDashboard, Users, Gift, Star, 
  FileText, LogOut, Menu, X, MessageSquare,
  ThumbsUp, Award, Video, Link2, Shield, Calculator, RefreshCw, BarChart, Zap,
  ChevronDown, ChevronRight, Play, Smartphone, Globe, Brain
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { clearAdminAuth, getAdminToken } from "@/lib/adminApi";
import { ActivityDashboard } from "@/components/admin/ActivityDashboard";
import { PlatformStats } from "@/components/admin/PlatformStats";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = async () => {
    // Clear any local storage
    clearAdminAuth();
    
    // Call logout endpoint to clear cookie
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (e) {
      // Ignore errors - redirect anyway
    }
    
    toast({
      title: "Logged Out",
      description: "You have been securely logged out",
    });
    navigate('/admin/login');
  };

  const closeMenu = () => setIsSidebarOpen(false);

  return (
    <div className="flex h-screen bg-background page-container">
      {/* Floating Hamburger Button - Mobile Only */}
      <button
        className="fixed top-5 left-5 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-purple-600 text-white border-none shadow-lg z-[1000] flex items-center justify-center transition-transform active:scale-95 lg:hidden"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label="Menu"
        data-testid="button-floating-menu"
      >
        {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Menu Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[998] lg:hidden"
          onClick={closeMenu}
          data-testid="overlay-menu"
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-[999] w-[280px] bg-card border-r transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-6 border-b" style={{ marginTop: '80px' }}>
            <div className="flex flex-col items-start gap-2">
              <img src="/bjjos-logo.png" alt="BJJ/OS" className="h-8 w-auto" />
              <p className="text-sm text-muted-foreground font-medium">Admin Dashboard</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            <NavLink href="/admin/dashboard" icon={<LayoutDashboard />} label="Dashboard" onClick={closeMenu} />
            <NavLink href="/admin/command-center" icon={<Zap />} label="Command Center" onClick={closeMenu} />
            <NavLink href="/admin/videos" icon={<Video />} label="Videos" onClick={closeMenu} />
            <NavLink href="/admin/batch-analysis" icon={<Brain />} label="Batch Analysis" onClick={closeMenu} />
            <NavLink href="/admin/users" icon={<Users />} label="Users" onClick={closeMenu} />
            <NavLink href="/admin/analytics" icon={<BarChart />} label="Analytics" onClick={closeMenu} />
            <NavLink href="/admin/lifetime-access" icon={<Star />} label="Lifetime Access" onClick={closeMenu} />
            <NavLink href="/admin/referrals" icon={<Gift />} label="Referrals" onClick={closeMenu} />
            <NavLink href="/admin/feedback" icon={<ThumbsUp />} label="Feedback" onClick={closeMenu} />
            <NavLink href="/admin/chat" icon={<MessageSquare />} label="Chat" onClick={closeMenu} />
            <NavLink href="/admin/techniques" icon={<Award />} label="Techniques" onClick={closeMenu} />
            <NavLink href="/admin/chains" icon={<Link2 />} label="Chains" onClick={closeMenu} />
            <NavLink href="/admin/instructors" icon={<Users />} label="Instructors" onClick={closeMenu} />
            <NavLink href="/admin/partnerships" icon={<Calculator />} label="Partnerships" onClick={closeMenu} />
            <NavLink href="/admin/meta" icon={<FileText />} label="Meta" onClick={closeMenu} />
            <NavLink href="/admin/flagged-accounts" icon={<Shield />} label="Flagged Accounts" onClick={closeMenu} />
          </nav>

          {/* Logout */}
          <div className="p-4 border-t">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-5 h-5 mr-3" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Desktop Header Only */}
        <header className="hidden lg:flex items-center gap-4 p-4 border-b bg-card">
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Admin Dashboard</h1>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6" style={{ paddingTop: '80px' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

interface NavLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

function NavLink({ href, icon, label, onClick }: NavLinkProps) {
  const [location] = useLocation();
  const isActive = location === href;

  return (
    <Link 
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors min-h-[44px] ${
        isActive 
          ? 'bg-primary text-primary-foreground' 
          : 'hover:bg-muted text-muted-foreground hover:text-foreground active:bg-muted/80'
      }`}
      data-testid={`nav-${label.toLowerCase().replace(' ', '-')}`}
    >
      <span className="w-5 h-5">{icon}</span>
      <span className="font-medium text-base">{label}</span>
    </Link>
  );
}

interface QuickMetrics {
  curationRunning: boolean;
  curationStatus?: 'active' | 'scheduled' | 'paused_target_reached' | 'offline';
  targetReached?: boolean;
  minutesSinceRun: number;
  totalVideos: number;
  videosToday: number;
  totalUsers: number;
  signedUpToday: number;
  activeSubscriptions: number;
  mrr: string;
  geminiAnalyzed: number;
  curationEfficiency: {
    discovered: number;      // Videos found from YouTube
    analyzed: number;        // Videos that went through AI
    accepted: number;        // Videos added to library
    rejected: number;        // Videos rejected by AI
    skipped: number;         // Filtered before analysis
    acceptanceRate: number;  // % of analyzed that were accepted
    status: 'unknown' | 'too_strict' | 'strict' | 'optimal' | 'loose' | 'too_loose';
  };
}

// Helper to format curation status display
function getCurationStatusDisplay(metrics: QuickMetrics): { text: string; color: string } {
  if (metrics.curationStatus === 'active' || metrics.curationRunning) {
    return { text: '✅ Active', color: 'text-green-500' };
  }
  if (metrics.curationStatus === 'scheduled') {
    return { text: '🕐 Scheduled', color: 'text-yellow-500' };
  }
  if (metrics.curationStatus === 'paused_target_reached' || metrics.targetReached) {
    return { text: '⏸️ Target Reached', color: 'text-blue-500' };
  }
  return { text: '🔴 Offline', color: 'text-red-500' };
}

// Floating Action Button Component
function FloatingActionButton() {
  return (
    <Link
      href="/admin/command-center"
      className="fixed bottom-6 right-6 bg-gradient-to-br from-primary to-purple-600 text-white px-6 py-4 rounded-full shadow-lg z-[900] flex items-center gap-2 text-base font-semibold transition-transform active:scale-95 hover:shadow-xl"
      data-testid="fab-run-curation"
    >
      <Play className="w-5 h-5" />
      <span className="hidden sm:inline">Run Curation</span>
    </Link>
  );
}

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  icon: string | React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  testId?: string;
}

function CollapsibleSection({ title, icon, children, defaultExpanded = false, testId }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-card rounded-lg border overflow-hidden" data-testid={testId}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors active:bg-muted/70 min-h-[56px]"
        data-testid={`${testId}-toggle`}
      >
        <div className="flex items-center gap-3">
          {typeof icon === 'string' ? (
            <span className="text-2xl">{icon}</span>
          ) : (
            <span>{icon}</span>
          )}
          <h3 className="text-lg font-semibold text-left">{title}</h3>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        )}
      </button>
      {isExpanded && (
        <div className="p-6">
          {children}
        </div>
      )}
    </div>
  );
}

// Gemini Analysis Card with Analyze All button
interface GeminiAnalysisCardProps {
  metrics: QuickMetrics;
  onRefresh: () => void;
}

function GeminiAnalysisCard({ metrics, onRefresh }: GeminiAnalysisCardProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const percentComplete = metrics.totalVideos > 0 
    ? Math.round((metrics.geminiAnalyzed / metrics.totalVideos) * 100)
    : 0;
  const unanalyzedCount = metrics.totalVideos - metrics.geminiAnalyzed;

  const handleAnalyzeAll = async () => {
    if (isAnalyzing) return;
    
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/admin/analyze-all-videos', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to start analysis');
      }
      
      const data = await res.json();
      toast({
        title: "Gemini Analysis Started",
        description: `Analyzing ${unanalyzedCount} unanalyzed videos in background. This may take a while.`,
      });
      
      // Refresh after a short delay to show progress
      setTimeout(() => onRefresh(), 5000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to start analysis',
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="bg-card rounded-lg border p-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl">🧠</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">Gemini Analyzed</p>
          <p className="text-2xl font-bold" data-testid="value-gemini-analyzed">
            {metrics.geminiAnalyzed} / {metrics.totalVideos}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className={`text-sm ${percentComplete < 80 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
          {percentComplete}% complete
        </p>
        {unanalyzedCount > 0 && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleAnalyzeAll}
            disabled={isAnalyzing}
            className="h-7 text-xs"
            data-testid="button-analyze-all"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="w-3 h-3 mr-1" />
                Analyze All
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { data: metrics, isLoading, isError, error, refetch, fetchStatus } = useQuery<QuickMetrics & { _dbDown?: boolean; _cached?: boolean; _stale?: boolean; _error?: string }>({
    queryKey: ['/api/admin/quick-metrics'],
    queryFn: async ({ signal }) => {
      const token = getAdminToken();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      
      try {
        const res = await fetch('/api/admin/quick-metrics', {
          credentials: 'include',
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
        });

        if (res.status === 401) {
          clearAdminAuth();
          throw new Error('Session expired - redirecting to login');
        }

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to fetch metrics (${res.status})`);
        }

        return await res.json();
      } finally {
        clearTimeout(timeout);
      }
    },
    refetchInterval: 30000,
    retry: (failureCount, error) => {
      if (error?.message?.includes('Session expired')) {
        window.location.href = '/admin/login';
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: 1000
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isError && !metrics) {
    return (
      <AdminLayout>
        <div className="text-center py-12 space-y-4">
          <p className="text-destructive text-lg">Failed to load dashboard metrics</p>
          <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Unknown error'}</p>
          <Button onClick={() => refetch()} variant="outline" data-testid="button-retry-metrics">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </AdminLayout>
    );
  }

  if (isLoading || !metrics) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-muted-foreground">
          Loading metrics...
        </div>
      </AdminLayout>
    );
  }

  const isDbDegraded = metrics._dbDown || metrics._stale || metrics._cached;

  return (
    <AdminLayout>
      <div className="space-y-4 pb-24">
        {isDbDegraded && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 flex items-center gap-3" data-testid="banner-db-degraded">
            <span className="text-yellow-500 font-bold text-sm">DB</span>
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              {metrics._dbDown 
                ? 'Database is currently unavailable. Showing default values.' 
                : metrics._stale 
                  ? 'Database temporarily slow. Showing cached data.' 
                  : 'Showing cached data.'}
              {metrics._error && <span className="ml-1 text-xs text-muted-foreground">({metrics._error})</span>}
            </p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-auto" data-testid="button-retry-db">
              <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          </div>
        )}

        {/* Header - Mobile Optimized */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">BJJ OS Dashboard</h2>
            <p className="text-sm text-muted-foreground">Real-time curation efficiency metrics</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="self-start sm:self-auto"
            data-testid="button-refresh-dashboard"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Priority Metrics - Always Visible */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/videos" className="bg-card rounded-lg border p-5 hover-elevate cursor-pointer" data-testid="card-library">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">📚</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Library</p>
                <p className="text-2xl font-bold" data-testid="value-total-videos">{metrics.totalVideos}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">+{metrics.videosToday} today</p>
          </Link>

          <GeminiAnalysisCard metrics={metrics} onRefresh={handleRefresh} />

          <div className="bg-card rounded-lg border p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">🤖</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Curation</p>
                <p className={`text-2xl font-bold ${getCurationStatusDisplay(metrics).color}`} data-testid="value-curation-status">
                  {getCurationStatusDisplay(metrics).text}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {metrics.minutesSinceRun < 999 ? `${metrics.minutesSinceRun}m ago` : 'Never run'}
            </p>
          </div>

          <Link href="/admin/users" className="bg-card rounded-lg border p-5 hover-elevate cursor-pointer" data-testid="card-users">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">👥</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Users</p>
                <p className="text-2xl font-bold" data-testid="value-total-users">{metrics.totalUsers}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{metrics.activeSubscriptions} subscriptions</p>
          </Link>
        </div>

        {/* CURATION EFFICIENCY - Collapsible */}
        <CollapsibleSection 
          title="Curation Efficiency (Today)" 
          icon="📊" 
          defaultExpanded={true}
          testId="section-curation-efficiency"
        >
          <div className="space-y-6">
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                Today = {new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' })} EST
              </p>
            </div>

            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Discovered</p>
                <p className="text-2xl sm:text-3xl font-bold" data-testid="value-discovered">{metrics.curationEfficiency.discovered}</p>
                <p className="text-xs text-muted-foreground mt-1">From YouTube</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Analyzed</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-500" data-testid="value-analyzed">{metrics.curationEfficiency.analyzed}</p>
                <p className="text-xs text-muted-foreground mt-1">AI processed</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Accepted</p>
                <p className="text-2xl sm:text-3xl font-bold text-green-500" data-testid="value-accepted">{metrics.curationEfficiency.accepted}</p>
                <p className="text-xs text-muted-foreground mt-1">To library</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Rejected</p>
                <p className="text-2xl sm:text-3xl font-bold text-red-500" data-testid="value-rejected">{metrics.curationEfficiency.rejected}</p>
                <p className="text-xs text-muted-foreground mt-1">Quality check</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Skipped</p>
                <p className="text-2xl sm:text-3xl font-bold text-yellow-500" data-testid="value-skipped">{metrics.curationEfficiency.skipped}</p>
                <p className="text-xs text-muted-foreground mt-1">Pre-filtered</p>
              </div>
            </div>
            
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Acceptance Rate</p>
              <p className="text-xl sm:text-2xl font-bold text-primary" data-testid="value-acceptance-rate">
                {metrics.curationEfficiency.acceptanceRate.toFixed(1)}%
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Platform Usage - iOS vs Web - Collapsible */}
        <CollapsibleSection 
          title="Platform Usage (iOS vs Web)" 
          icon={<Smartphone className="w-5 h-5" />} 
          defaultExpanded={false}
          testId="section-platform-usage"
        >
          <PlatformStats />
        </CollapsibleSection>

        {/* System Overview - Collapsible */}
        <CollapsibleSection 
          title="System Overview" 
          icon="⚙️" 
          defaultExpanded={false}
          testId="section-system-overview"
        >
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Curation Pipeline</p>
              <p className={`font-medium text-lg ${getCurationStatusDisplay(metrics).color}`}>
                {getCurationStatusDisplay(metrics).text}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Monthly Revenue</p>
              <p className="font-medium text-lg">${metrics.mrr}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">New Users Today</p>
              <p className="font-medium text-lg">{metrics.signedUpToday}</p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Activity Dashboard - Collapsible (expanded by default for visibility) */}
        <CollapsibleSection 
          title="User Activity (24h)" 
          icon="📈" 
          defaultExpanded={true}
          testId="section-activity"
        >
          <ActivityDashboard />
        </CollapsibleSection>

        {/* Floating Action Button */}
        <FloatingActionButton />
      </div>
    </AdminLayout>
  );
}
