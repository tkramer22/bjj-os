import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import "./admin-dev-os-mobile.css";
import DevOSChat from "@/components/DevOS/DevOSChat";

interface SystemAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  createdAt: string;
  dismissedAt?: string;
}

interface QuickMetrics {
  curationRunning: boolean;
  minutesSinceRun: number;
  totalVideos: number;
  videosToday: number;
  totalUsers: number;
  signedUpToday: number;
  activeSubscriptions: number;
  mrr: string;
  curationEfficiency: {
    screened: number;
    accepted: number;
    rejected: number;
    acceptanceRate: number;
    status: 'unknown' | 'too_strict' | 'strict' | 'optimal' | 'loose' | 'too_loose';
  };
}

interface SystemHealth {
  curation: {
    isRunning: boolean;
    minutesSinceLastRun: number;
    lastHour: {
      screened: number;
      accepted: number;
      acceptanceRate: number;
    };
    apiQuota: {
      percentUsed: number;
    };
  };
  videos: {
    total: number;
    elite: number;
    elitePercent: number;
    addedToday: number;
  };
  stripe: {
    mrr: number;
    activeSubscriptions: number;
    trialUsers: number;
  };
  users: {
    total: number;
    signedUpToday: number;
    lifetimeAccess: number;
  };
}

interface EliteCuratorStats {
  enabled: boolean;
  maxDailySearches: number;
  dailySearchesUsed: number;
  remainingToday: number;
  eliteInstructorCount: number;
  topInstructors: Array<{
    name: string;
    videos: number;
    quality: string;
    tier: string;
  }>;
  today: {
    searches: number;
    found: number;
    approved: number;
    approvalRate: string;
  };
  library: {
    current: number;
    target: number;
    remaining: number;
    progress: string;
  };
}

export default function AdminDevOS() {
  const [activeView, setActiveView] = useState<'overview' | 'stats' | 'actions' | 'chat'>('overview');
  const [executing, setExecuting] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: metrics, isLoading, isError, error, refetch } = useQuery<QuickMetrics>({
    queryKey: ['/api/admin/quick-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/admin/quick-metrics', {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      
      // Handle 401 auth failures by redirecting to login
      if (res.status === 401) {
        window.location.href = '/admin/login';
        throw new Error('Authentication required');
      }
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      
      return res.json();
    },
    refetchInterval: 30000, // 30 seconds
    retry: 1
  });

  const { data: health } = useQuery<SystemHealth>({
    queryKey: ['/api/admin/system-health'],
    refetchInterval: 30000,
    retry: 1,
    enabled: !!metrics // Only fetch health after metrics load
  });

  const { data: alertsData } = useQuery<{ alerts: SystemAlert[] }>({
    queryKey: ['/api/admin/alerts'],
    queryFn: async () => {
      const res = await fetch('/api/admin/alerts', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch alerts');
      return res.json();
    },
    refetchInterval: 30000,
    retry: 1,
    enabled: !!metrics
  });

  const { data: eliteCuratorStats, refetch: refetchEliteStats } = useQuery<EliteCuratorStats>({
    queryKey: ['/api/admin/elite-curator/stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/elite-curator/stats', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch elite curator stats');
      return res.json();
    },
    refetchInterval: 30000,
    retry: 1,
    enabled: !!metrics
  });

  const dismissAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`/api/admin/alerts/${alertId}/dismiss`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to dismiss alert');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/alerts'] });
    }
  });

  const alerts = alertsData?.alerts?.filter(a => !a.dismissedAt) || [];

  async function executeAction(action: string, params?: any) {
    setExecuting(action);
    
    try {
      const response = await fetch(`/api/admin/actions/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params || {})
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ ${result.message || 'Action completed'}`);
        setTimeout(() => refetch(), 2000);
      } else {
        alert(`❌ ${result.error || 'Action failed'}`);
      }
    } catch (error: any) {
      console.error('Action failed:', error);
      alert(`❌ ${error.message}`);
    } finally {
      setExecuting(null);
    }
  }

  if (isLoading) {
    return (
      <div className="dev-os-mobile loading-state">
        <div className="loading-spinner">Loading Dev OS...</div>
      </div>
    );
  }

  if (isError || !metrics) {
    return (
      <div className="dev-os-mobile loading-state">
        <div className="error-state">
          <p>❌ Failed to load Dev OS</p>
          <p className="error-message">{error?.toString() || 'Unknown error'}</p>
          <button 
            onClick={() => refetch()}
            className="action-chip primary"
            style={{ marginTop: '1rem' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dev-os-mobile">
      {/* Sticky Top Bar - Minimal */}
      <header className="top-bar" data-testid="devos-top-bar">
        <div className="top-bar-content">
          <h1 className="top-bar-title">Dev OS 2.0</h1>
          <button 
            onClick={() => refetch()} 
            className="refresh-btn"
            data-testid="button-refresh-metrics"
          >
            🔄
          </button>
        </div>
      </header>

      {/* Quick Actions - Horizontal Scroll */}
      <div className="quick-actions-strip">
        <div className="actions-scroll">
          <button 
            onClick={() => executeAction('restart-curation')}
            className="action-chip primary"
            disabled={!!executing}
            data-testid="action-chip-restart"
          >
            ▶️ Restart
          </button>
          <button 
            onClick={() => executeAction('view-logs', { service: 'curation' })}
            className="action-chip"
            disabled={!!executing}
            data-testid="action-chip-logs"
          >
            📋 Logs
          </button>
          <button 
            onClick={() => executeAction('diagnose-curation')}
            className="action-chip"
            disabled={!!executing}
            data-testid="action-chip-diagnose"
          >
            🔍 Diagnose
          </button>
          <button 
            onClick={() => {
              const threshold = prompt('Enter threshold (0-10):', '7.0');
              if (threshold) {
                fetch('/api/admin/execute/curation/adjust-threshold', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ threshold: parseFloat(threshold) })
                }).then(r => r.json()).then(result => {
                  alert(result.success ? `✅ ${result.message}` : `❌ ${result.error}`);
                });
              }
            }}
            className="action-chip"
            disabled={!!executing}
            data-testid="action-chip-threshold"
          >
            ⚙️ Threshold
          </button>
          <button 
            onClick={() => {
              fetch('/api/admin/execute/system/check-resources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              }).then(r => r.json()).then(result => {
                if (result.success) {
                  alert(`📊 Resources:\n\nMemory: ${result.memory.heapUsed}\nUptime: ${result.uptime}\nNode: ${result.nodeVersion}`);
                }
              });
            }}
            className="action-chip"
            disabled={!!executing}
            data-testid="action-chip-resources"
          >
            💻 Resources
          </button>
        </div>
      </div>

      {/* CURATION EFFICIENCY - CORE BUSINESS METRIC */}
      <div className="efficiency-hero" data-testid="efficiency-metrics">
        <div className="efficiency-header">
          <h2 className="efficiency-title">📊 Curation Efficiency (Today)</h2>
          <span className={`efficiency-status status-${metrics.curationEfficiency.status}`}>
            {metrics.curationEfficiency.status === 'optimal' && '🟢 OPTIMAL'}
            {metrics.curationEfficiency.status === 'strict' && '🟡 STRICT'}
            {metrics.curationEfficiency.status === 'too_strict' && '🔴 TOO STRICT'}
            {metrics.curationEfficiency.status === 'loose' && '🟡 LOOSE'}
            {metrics.curationEfficiency.status === 'too_loose' && '🔴 TOO LOOSE'}
            {metrics.curationEfficiency.status === 'unknown' && '⚪ NO DATA'}
          </span>
        </div>
        <div className="efficiency-stats">
          <div className="efficiency-stat">
            <div className="efficiency-label">Screened</div>
            <div className="efficiency-value">{metrics.curationEfficiency.screened}</div>
          </div>
          <div className="efficiency-stat success">
            <div className="efficiency-label">Accepted</div>
            <div className="efficiency-value">{metrics.curationEfficiency.accepted}</div>
          </div>
          <div className="efficiency-stat danger">
            <div className="efficiency-label">Rejected</div>
            <div className="efficiency-value">{metrics.curationEfficiency.rejected}</div>
          </div>
          <div className="efficiency-stat primary">
            <div className="efficiency-label">Acceptance Rate</div>
            <div className="efficiency-value">{metrics.curationEfficiency.acceptanceRate.toFixed(1)}%</div>
          </div>
        </div>
        <div className="efficiency-guide">
          <small>
            Target: 2-5% (elite curation) • 
            {metrics.curationEfficiency.acceptanceRate < 0.5 && ' ⚠️ Too strict - might miss good content'}
            {metrics.curationEfficiency.acceptanceRate >= 0.5 && metrics.curationEfficiency.acceptanceRate <= 2 && ' ✅ High quality bar'}
            {metrics.curationEfficiency.acceptanceRate > 2 && metrics.curationEfficiency.acceptanceRate <= 5 && ' ✅ Optimal elite curation'}
            {metrics.curationEfficiency.acceptanceRate > 5 && metrics.curationEfficiency.acceptanceRate <= 15 && ' ⚠️ Quality may be diluting'}
            {metrics.curationEfficiency.acceptanceRate > 15 && ' 🚨 Accepting too much'}
          </small>
        </div>
      </div>

      {/* SYSTEM ALERTS */}
      {alerts.length > 0 && (
        <div className="alerts-container" data-testid="alerts-container">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`alert alert-${alert.severity}`}
              data-testid={`alert-${alert.severity}`}
            >
              <div className="alert-content">
                <div className="alert-header">
                  <span className="alert-icon">
                    {alert.severity === 'critical' && '🔴'}
                    {alert.severity === 'warning' && '⚠️'}
                    {alert.severity === 'info' && 'ℹ️'}
                  </span>
                  <span className="alert-title">{alert.title}</span>
                </div>
                <p className="alert-message">{alert.message}</p>
              </div>
              <button
                className="alert-dismiss"
                onClick={() => dismissAlertMutation.mutate(alert.id)}
                disabled={dismissAlertMutation.isPending}
                data-testid="button-dismiss-alert"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CRITICAL STATUS - 2x2 GRID (PHASE 2 REDESIGN) */}
      <div className="metrics-compact">
        <div className="metric-row">
          <MetricCard
            icon="🤖"
            label="Curation"
            value={metrics.curationRunning ? '✅ Active' : '🔴 Offline'}
            subtitle={metrics.minutesSinceRun < 999 ? `${metrics.minutesSinceRun}m ago` : 'Never'}
            status={metrics.curationRunning ? 'good' : 'critical'}
            data-testid="metric-curation"
          />
          <MetricCard
            icon="📹"
            label="Library"
            value={metrics.totalVideos}
            subtitle={`+${metrics.videosToday} today`}
            data-testid="metric-videos"
          />
        </div>
        <div className="metric-row">
          <MetricCard
            icon="🔑"
            label="API Quota"
            value="N/A"
            subtitle="Check system"
            data-testid="metric-quota"
          />
          <MetricCard
            icon="👥"
            label="Users"
            value={metrics.totalUsers}
            subtitle={`${metrics.activeSubscriptions} active`}
            data-testid="metric-users"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        {activeView === 'overview' && (
          <div className="overview-section">
            <h2 className="section-title">System Status</h2>
            <p className="section-description">
              Core metrics and operational status at a glance
            </p>
            
            {/* System Health Summary */}
            <div className="status-summary">
              <div className="status-item">
                <span className="status-label">Curation Pipeline</span>
                <span className={`status-badge ${metrics.curationRunning ? 'running' : 'stopped'}`}>
                  {metrics.curationRunning ? '✅ Active' : '🔴 Offline'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Last Curation Run</span>
                <span className="status-value">
                  {metrics.minutesSinceRun < 999 ? `${metrics.minutesSinceRun} minutes ago` : 'Never'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Efficiency Status</span>
                <span className={`status-badge ${
                  metrics.curationEfficiency.status === 'optimal' ? 'running' : 
                  metrics.curationEfficiency.status === 'strict' ? 'warning' :
                  metrics.curationEfficiency.status === 'unknown' ? 'neutral' : 'stopped'
                }`}>
                  {metrics.curationEfficiency.status === 'optimal' && '🟢 Optimal (2-5%)'}
                  {metrics.curationEfficiency.status === 'strict' && '🟡 Strict (<2%)'}
                  {metrics.curationEfficiency.status === 'too_strict' && '🔴 Too Strict'}
                  {metrics.curationEfficiency.status === 'loose' && '🟡 Loose (>5%)'}
                  {metrics.curationEfficiency.status === 'too_loose' && '🔴 Too Loose'}
                  {metrics.curationEfficiency.status === 'unknown' && '⚪ No Data'}
                </span>
              </div>
            </div>
          </div>
        )}

        {activeView === 'stats' && health && (
          <div className="stats-section">
            <h2 className="section-title">Detailed Statistics</h2>
            
            <ExpandableSection title="⚙️ Curation Pipeline" defaultOpen>
              <StatRow label="Status" value={health.curation.isRunning ? '✅ RUNNING' : '🔴 OFFLINE'} />
              <StatRow label="Last Run" value={`${health.curation.minutesSinceLastRun} min ago`} />
              <StatRow label="Screened (Hour)" value={health.curation.lastHour.screened} />
              <StatRow label="Accepted (Hour)" value={health.curation.lastHour.accepted} />
              <StatRow label="Acceptance Rate" value={`${health.curation.lastHour.acceptanceRate}%`} />
              <StatRow label="API Quota" value={`${health.curation.apiQuota.percentUsed}%`} />
            </ExpandableSection>

            <ExpandableSection title="📹 Video Library">
              <StatRow label="Total Videos" value={health.videos.total} />
              <StatRow label="Elite Tier" value={`${health.videos.elite} (${health.videos.elitePercent}%)`} />
              <StatRow label="Added Today" value={health.videos.addedToday} />
            </ExpandableSection>

            <ExpandableSection title="💰 Revenue & Subscriptions">
              <StatRow label="MRR" value={`$${health.stripe.mrr}`} />
              <StatRow label="Active Subscriptions" value={health.stripe.activeSubscriptions} />
              <StatRow label="Trial Users" value={health.stripe.trialUsers} />
            </ExpandableSection>

            <ExpandableSection title="👥 User Metrics">
              <StatRow label="Total Users" value={health.users.total} />
              <StatRow label="Signed Up Today" value={health.users.signedUpToday} />
              <StatRow label="Lifetime Access" value={health.users.lifetimeAccess} />
            </ExpandableSection>
          </div>
        )}

        {activeView === 'actions' && (
          <div className="actions-section">
            <h2 className="section-title">System Operations</h2>
            
            <div className="action-category">
              <h3 className="category-title">Curation Control</h3>
              <div className="action-buttons-grid">
                <ActionButton
                  icon="▶️"
                  label="Restart Curation"
                  onClick={() => executeAction('restart-curation')}
                  variant="primary"
                  data-testid="button-action-restart"
                />
                <ActionButton
                  icon="📋"
                  label="View Logs"
                  onClick={() => executeAction('view-logs')}
                  data-testid="button-action-logs"
                />
                <ActionButton
                  icon="🔍"
                  label="Diagnose"
                  onClick={() => executeAction('diagnose-curation')}
                  data-testid="button-action-diagnose"
                />
              </div>
            </div>

            <div className="action-category">
              <h3 className="category-title">Video Management</h3>
              <div className="action-buttons-grid">
                <ActionButton
                  icon="➕"
                  label="Add Video"
                  onClick={() => {
                    const url = prompt('Enter YouTube URL:');
                    if (url) {
                      fetch('/api/admin/execute/video/add-manual', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url })
                      }).then(r => r.json()).then(result => {
                        alert(result.success ? `✅ ${result.message}` : `❌ ${result.error}`);
                        if (result.success) refetch();
                      });
                    }
                  }}
                  variant="primary"
                  data-testid="button-action-add-video"
                />
                <ActionButton
                  icon="🗑️"
                  label="Delete Video"
                  onClick={() => {
                    const videoId = prompt('Enter video ID:');
                    if (videoId && confirm('Delete this video?')) {
                      fetch('/api/admin/execute/video/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ videoId })
                      }).then(r => r.json()).then(result => {
                        alert(result.success ? `✅ ${result.message}` : `❌ ${result.error}`);
                        if (result.success) refetch();
                      });
                    }
                  }}
                  data-testid="button-action-delete-video"
                />
              </div>
            </div>

            <div className="action-category">
              <h3 className="category-title">🎯 Elite Curator</h3>
              {eliteCuratorStats ? (
                <>
                  <div className="efficiency-stats" style={{ marginBottom: '1rem' }}>
                    <div className="efficiency-stat">
                      <div className="efficiency-label">Status</div>
                      <div className="efficiency-value">{eliteCuratorStats.enabled ? '✅ ON' : '🔴 OFF'}</div>
                    </div>
                    <div className="efficiency-stat">
                      <div className="efficiency-label">Searches Today</div>
                      <div className="efficiency-value">{eliteCuratorStats.dailySearchesUsed}/{eliteCuratorStats.maxDailySearches}</div>
                    </div>
                    <div className="efficiency-stat success">
                      <div className="efficiency-label">Approval Rate</div>
                      <div className="efficiency-value">{eliteCuratorStats.today.approvalRate}%</div>
                    </div>
                    <div className="efficiency-stat primary">
                      <div className="efficiency-label">Library Progress</div>
                      <div className="efficiency-value">{eliteCuratorStats.library.progress}%</div>
                    </div>
                  </div>
                  <div className="action-buttons-grid">
                    <ActionButton
                      icon={eliteCuratorStats.enabled ? "⏸️" : "▶️"}
                      label={eliteCuratorStats.enabled ? "Disable" : "Enable"}
                      onClick={() => {
                        fetch('/api/admin/elite-curator/toggle', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ enabled: !eliteCuratorStats.enabled })
                        }).then(r => r.json()).then(result => {
                          alert(result.success ? `✅ ${result.message}` : `❌ ${result.error}`);
                          if (result.success) {
                            refetchEliteStats();
                            refetch();
                          }
                        });
                      }}
                      variant={eliteCuratorStats.enabled ? "default" : "primary"}
                      data-testid="button-elite-curator-toggle"
                    />
                    <ActionButton
                      icon="🚀"
                      label="Run Now"
                      onClick={() => {
                        if (confirm('Start elite curator run? This will use YouTube API quota.')) {
                          setExecuting('elite-curator');
                          fetch('/api/admin/elite-curator/run', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                          }).then(r => r.json()).then(result => {
                            alert(result.success 
                              ? `✅ ${result.message}\n\nApproved: ${result.videosApproved}\nApproval Rate: ${result.approvalRate.toFixed(1)}%`
                              : `❌ ${result.message}`);
                            if (result.success) {
                              refetchEliteStats();
                              refetch();
                            }
                          }).finally(() => setExecuting(null));
                        }
                      }}
                      variant="primary"
                      disabled={!!executing || !eliteCuratorStats.enabled}
                      data-testid="button-elite-curator-run"
                    />
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>
                    <div>Elite Instructors: {eliteCuratorStats.eliteInstructorCount}</div>
                    <div>Library: {eliteCuratorStats.library.current}/{eliteCuratorStats.library.target} ({eliteCuratorStats.library.remaining} remaining)</div>
                    <div>Today: {eliteCuratorStats.today.searches} searches, {eliteCuratorStats.today.approved} approved</div>
                  </div>
                </>
              ) : (
                <div style={{ padding: '1rem', textAlign: 'center', opacity: 0.5 }}>
                  Loading elite curator stats...
                </div>
              )}
            </div>

            <div className="action-category">
              <h3 className="category-title">User Management</h3>
              <div className="action-buttons-grid">
                <ActionButton
                  icon="👑"
                  label="Grant Lifetime"
                  onClick={() => {
                    const email = prompt('Enter email:');
                    if (email) {
                      fetch('/api/admin/execute/user/create-lifetime', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                      }).then(r => r.json()).then(result => {
                        alert(result.success ? `✅ ${result.message}` : `❌ ${result.error}`);
                        if (result.success) refetch();
                      });
                    }
                  }}
                  variant="primary"
                  data-testid="button-action-lifetime"
                />
                <ActionButton
                  icon="❌"
                  label="Cancel Sub"
                  onClick={() => {
                    const userId = prompt('Enter user ID:');
                    if (userId && confirm('Cancel subscription?')) {
                      fetch('/api/admin/execute/user/cancel-subscription', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId })
                      }).then(r => r.json()).then(result => {
                        alert(result.success ? `✅ ${result.message}` : `❌ ${result.error}`);
                        if (result.success) refetch();
                      });
                    }
                  }}
                  data-testid="button-action-cancel-sub"
                />
              </div>
            </div>

            <div className="action-category">
              <h3 className="category-title">System</h3>
              <div className="action-buttons-grid">
                <ActionButton
                  icon="🗑️"
                  label="Clear Cache"
                  onClick={() => {
                    if (confirm('Clear cache?')) {
                      fetch('/api/admin/execute/system/clear-cache', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      }).then(r => r.json()).then(result => {
                        alert(result.success ? `✅ ${result.message}` : `❌ ${result.error}`);
                      });
                    }
                  }}
                  data-testid="button-action-clear-cache"
                />
                <ActionButton
                  icon="📊"
                  label="Resources"
                  onClick={() => {
                    fetch('/api/admin/execute/system/check-resources', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' }
                    }).then(r => r.json()).then(result => {
                      if (result.success) {
                        alert(`📊 Resources:\n\nMemory: ${result.memory.heapUsed}\nUptime: ${result.uptime}\nNode: ${result.nodeVersion}`);
                      }
                    });
                  }}
                  data-testid="button-action-resources"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat View - Dev OS Intelligence */}
      {activeView === 'chat' && (
        <div className="view-content">
          <DevOSChat />
        </div>
      )}

      {/* Bottom Navigation - Thumb Zone */}
      <nav className="bottom-nav">
        <button
          onClick={() => setActiveView('overview')}
          className={`nav-btn ${activeView === 'overview' ? 'active' : ''}`}
          data-testid="nav-overview"
        >
          <span className="nav-icon">📊</span>
          <span className="nav-label">Overview</span>
        </button>
        <button
          onClick={() => setActiveView('stats')}
          className={`nav-btn ${activeView === 'stats' ? 'active' : ''}`}
          data-testid="nav-stats"
        >
          <span className="nav-icon">📈</span>
          <span className="nav-label">Stats</span>
        </button>
        <button
          onClick={() => setActiveView('actions')}
          className={`nav-btn ${activeView === 'actions' ? 'active' : ''}`}
          data-testid="nav-actions"
        >
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">Actions</span>
        </button>
        <button
          onClick={() => setActiveView('chat')}
          className={`nav-btn ${activeView === 'chat' ? 'active' : ''}`}
          data-testid="nav-chat"
        >
          <span className="nav-icon">🤖</span>
          <span className="nav-label">Chat</span>
        </button>
      </nav>
    </div>
  );
}

function MetricCard({ 
  icon, 
  label, 
  value, 
  subtitle, 
  status 
}: { 
  icon: string; 
  label: string; 
  value: string | number; 
  subtitle?: string; 
  status?: 'good' | 'warning' | 'critical';
  'data-testid'?: string;
}) {
  const statusColor = {
    good: '#4ade80',
    warning: '#fbbf24',
    critical: '#ef4444'
  }[status || 'good'];

  return (
    <div className="metric-card-compact">
      <div className="metric-header">
        <span className="metric-icon">{icon}</span>
        <span className="metric-label">{label}</span>
      </div>
      <div className="metric-value" style={status ? { color: statusColor } : {}}>
        {value}
      </div>
      {subtitle && <div className="metric-subtitle">{subtitle}</div>}
    </div>
  );
}

function ExpandableSection({ 
  title, 
  children, 
  defaultOpen = false 
}: { 
  title: string; 
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div className="expandable-section">
      <button
        onClick={() => setExpanded(!expanded)}
        className="section-header"
        data-testid={`expand-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <span>{title}</span>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="section-content">
          {children}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function ActionButton({ 
  icon, 
  label, 
  onClick, 
  variant = 'default' 
}: { 
  icon: string; 
  label: string; 
  onClick: () => void; 
  variant?: 'default' | 'primary';
  'data-testid'?: string;
}) {
  return (
    <button 
      onClick={onClick} 
      className={`action-button ${variant}`}
    >
      <span className="action-icon">{icon}</span>
      <span className="action-label">{label}</span>
    </button>
  );
}
