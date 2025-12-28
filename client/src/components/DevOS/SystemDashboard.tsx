import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import './SystemDashboard.css';

interface StatusCardProps {
  title: string;
  status: 'healthy' | 'warning' | 'critical';
  icon: string;
  children: React.ReactNode;
}

interface MetricProps {
  label: string;
  sublabel?: string;
  value: string | number;
  status?: 'good' | 'warning' | 'critical';
}

export function SystemDashboard() {
  const [executing, setExecuting] = useState<string | null>(null);
  
  // Fetch system health every 30 seconds
  const { data: health, refetch } = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const response = await fetch('/api/admin/system-health');
      if (!response.ok) throw new Error('Failed to fetch system health');
      return response.json();
    },
    refetchInterval: 30000 // 30 seconds
  });
  
  async function handleAction(action: string, params?: any) {
    setExecuting(action);
    
    try {
      const response = await fetch(`/api/admin/actions/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params || {})
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Refetch health after action
        setTimeout(() => refetch(), 2000);
      }
      
      return result;
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setExecuting(null);
    }
  }

  async function executeOperation(endpoint: string, params?: any) {
    setExecuting(endpoint);
    
    try {
      const response = await fetch(`/api/admin/execute/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params || {})
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ ${result.message}`);
        setTimeout(() => refetch(), 2000);
      } else {
        alert(`❌ ${result.error}`);
      }
      
      return result;
    } catch (error: any) {
      console.error('Operation failed:', error);
      alert(`❌ Operation failed: ${error.message}`);
    } finally {
      setExecuting(null);
    }
  }

  function handleAdjustThreshold() {
    const threshold = prompt('Enter new quality threshold (0-10):', '7.0');
    if (threshold === null) return;
    const value = parseFloat(threshold);
    if (isNaN(value) || value < 0 || value > 10) {
      alert('Invalid threshold. Must be 0-10.');
      return;
    }
    executeOperation('curation/adjust-threshold', { threshold: value });
  }

  function handleClearCache() {
    if (confirm('Clear all cache? This will temporarily slow down responses.')) {
      executeOperation('system/clear-cache');
    }
  }

  function handleCheckResources() {
    executeOperation('system/check-resources');
  }

  function handleManualAddVideo() {
    const url = prompt('Enter YouTube video URL:');
    if (!url) return;
    executeOperation('video/add-manual', { url });
  }

  function handleDeleteVideo() {
    const videoId = prompt('Enter video ID to delete:');
    if (!videoId) return;
    if (confirm(`Delete video ${videoId}? This cannot be undone.`)) {
      executeOperation('video/delete', { videoId });
    }
  }

  function handleCreateLifetime() {
    const email = prompt('Enter email for lifetime access:');
    if (!email) return;
    const firstName = prompt('Enter first name (optional):') || undefined;
    executeOperation('user/create-lifetime', { email, firstName });
  }

  function handleCancelSubscription() {
    const userId = prompt('Enter user ID to cancel subscription:');
    if (!userId) return;
    if (confirm(`Cancel subscription for user ${userId}? This will cancel in Stripe and mark as canceled in database.`)) {
      executeOperation('user/cancel-subscription', { userId });
    }
  }
  
  if (!health) return <div className="loading">Loading system status...</div>;
  
  return (
    <div className="system-dashboard">
      {/* Curation Pipeline Status */}
      <StatusCard
        title="⚙️ Curation Pipeline"
        status={health.curation.isRunning ? 'healthy' : 'critical'}
        icon="⚙️"
      >
        <div className="status-section">
          <div className="status-label">Status</div>
          <div className={`status-value ${health.curation.isRunning ? 'green' : 'red'}`}>
            {health.curation.isRunning ? '✅ RUNNING' : '🔴 OFFLINE'}
            {!health.curation.isRunning && (
              <span className="offline-duration">
                ({health.curation.minutesSinceLastRun} min)
              </span>
            )}
          </div>
        </div>
        
        <div className="metrics-grid">
          <Metric 
            label="Last Hour" 
            sublabel="Screened"
            value={health.curation.lastHour.screened}
          />
          <Metric 
            label="Accepted" 
            sublabel={`${health.curation.lastHour.acceptanceRate}%`}
            value={health.curation.lastHour.accepted}
            status={
              health.curation.lastHour.acceptanceRate >= 2 &&
              health.curation.lastHour.acceptanceRate <= 5
                ? 'good' : 'warning'
            }
          />
          <Metric 
            label="Rejected" 
            value={health.curation.lastHour.rejected}
          />
        </div>
        
        <div className="metrics-grid">
          <Metric 
            label="Today" 
            sublabel="Screened"
            value={health.curation.today.screened}
          />
          <Metric 
            label="Accepted" 
            sublabel={`${health.curation.today.acceptanceRate}%`}
            value={health.curation.today.accepted}
          />
          <Metric 
            label="API Quota" 
            sublabel={`${health.curation.apiQuota.percentUsed}%`}
            value={`${Number(health.curation.apiQuota.used).toLocaleString()}/${Number(health.curation.apiQuota.limit).toLocaleString()}`}
            status={
              health.curation.apiQuota.percentUsed > 90 ? 'critical' :
              health.curation.apiQuota.percentUsed > 70 ? 'warning' : 'good'
            }
          />
        </div>
        
        <div className="action-buttons">
          <button 
            onClick={() => handleAction('restart-curation')}
            disabled={executing === 'restart-curation'}
            className="action-btn primary"
            data-testid="button-restart-curation"
          >
            {executing === 'restart-curation' ? '🔄 Restarting...' : '🔄 Restart'}
          </button>
          <button 
            onClick={() => handleAction('view-logs', { service: 'curation' })}
            className="action-btn secondary"
            data-testid="button-view-logs"
          >
            📋 Logs
          </button>
          <button 
            onClick={() => handleAction('diagnose-curation')}
            disabled={executing === 'diagnose-curation'}
            className="action-btn secondary"
            data-testid="button-diagnose-curation"
          >
            {executing === 'diagnose-curation' ? '🔍 Checking...' : '🔍 Diagnose'}
          </button>
          <button 
            onClick={handleAdjustThreshold}
            disabled={!!executing}
            className="action-btn secondary"
            data-testid="button-adjust-threshold"
          >
            ⚙️ Threshold
          </button>
        </div>
      </StatusCard>
      
      {/* Video Library Status */}
      <StatusCard
        title="📹 Video Library"
        status="healthy"
        icon="📹"
      >
        <div className="metrics-grid">
          <Metric 
            label="Total Videos" 
            value={health.videos.total}
          />
          <Metric 
            label="Elite Tier" 
            sublabel={`${health.videos.elitePercent}%`}
            value={health.videos.elite}
          />
          <Metric 
            label="Added Today" 
            value={health.videos.addedToday}
          />
        </div>
        
        <div className="action-buttons">
          <button 
            onClick={handleManualAddVideo}
            disabled={!!executing}
            className="action-btn primary"
            data-testid="button-manual-add-video"
          >
            ➕ Add Video
          </button>
          <button 
            onClick={handleDeleteVideo}
            disabled={!!executing}
            className="action-btn secondary"
            data-testid="button-delete-video"
          >
            🗑️ Delete
          </button>
        </div>
      </StatusCard>
      
      {/* Stripe Status */}
      <StatusCard
        title="💳 Stripe"
        status={health.stripe.healthy ? 'healthy' : 'warning'}
        icon="💳"
      >
        <div className="metrics-grid">
          <Metric 
            label="MRR" 
            value={`$${health.stripe.mrr}`}
          />
          <Metric 
            label="Active Subs" 
            value={health.stripe.activeSubscriptions}
          />
          <Metric 
            label="Trial Users" 
            value={health.stripe.trialUsers}
          />
        </div>
      </StatusCard>
      
      {/* Users Status */}
      <StatusCard
        title="👥 Users"
        status="healthy"
        icon="👥"
      >
        <div className="metrics-grid">
          <Metric 
            label="Total" 
            value={health.users.total}
          />
          <Metric 
            label="Today" 
            value={health.users.signedUpToday}
          />
          <Metric 
            label="Lifetime" 
            value={health.users.lifetimeAccess}
          />
        </div>
        
        <div className="action-buttons">
          <button 
            onClick={handleCreateLifetime}
            disabled={!!executing}
            className="action-btn primary"
            data-testid="button-create-lifetime"
          >
            👑 Grant Lifetime
          </button>
          <button 
            onClick={handleCancelSubscription}
            disabled={!!executing}
            className="action-btn secondary"
            data-testid="button-cancel-subscription"
          >
            ❌ Cancel Sub
          </button>
        </div>
      </StatusCard>
      
      {/* System Operations */}
      <StatusCard
        title="🖥️ System"
        status="healthy"
        icon="🖥️"
      >
        <div className="action-buttons">
          <button 
            onClick={handleCheckResources}
            disabled={!!executing}
            className="action-btn primary"
            data-testid="button-check-resources"
          >
            📊 Resources
          </button>
          <button 
            onClick={handleClearCache}
            disabled={!!executing}
            className="action-btn secondary"
            data-testid="button-clear-cache"
          >
            🗑️ Clear Cache
          </button>
        </div>
      </StatusCard>
    </div>
  );
}

function StatusCard({ title, status, icon, children }: StatusCardProps) {
  const statusColors = {
    healthy: '#4ade80',
    warning: '#fbbf24',
    critical: '#ef4444'
  };
  
  return (
    <div className="status-card">
      <div className="card-header">
        <div className="card-title">
          <span className="card-icon">{icon}</span>
          <h3>{title}</h3>
        </div>
        <div 
          className="status-indicator"
          style={{ backgroundColor: statusColors[status] }}
        />
      </div>
      <div className="card-content">
        {children}
      </div>
    </div>
  );
}

function Metric({ label, sublabel, value, status }: MetricProps) {
  const statusColors = {
    good: '#4ade80',
    warning: '#fbbf24',
    critical: '#ef4444'
  };
  
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      {sublabel && <div className="metric-sublabel">{sublabel}</div>}
      <div 
        className="metric-value"
        style={status ? { color: statusColors[status] } : {}}
      >
        {value}
      </div>
    </div>
  );
}
