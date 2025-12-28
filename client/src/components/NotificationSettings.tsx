import { useState, useEffect } from 'react';
import { Bell, BellOff, Smartphone, CheckCircle, AlertCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface NotificationSettingsProps {
  userId: string;
}

export function NotificationSettings({ userId }: NotificationSettingsProps) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  useEffect(() => {
    checkSubscriptionStatus();
  }, [userId]);

  const checkSubscriptionStatus = async () => {
    try {
      // Check if push notifications are supported
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setError('Push notifications are not supported on this device');
        setIsLoading(false);
        return;
      }

      // Get auth token
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to manage notifications');
        setIsLoading(false);
        return;
      }

      // Check server subscription status
      const response = await fetch(`/api/push/status/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      
      // Check local subscription
      const registration = await navigator.serviceWorker.ready;
      const existingSub = await registration.pushManager.getSubscription();
      
      setIsSubscribed(!!existingSub && data.subscribed);
      setSubscription(existingSub);
    } catch (err) {
      console.error('Failed to check subscription status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeToPush = async () => {
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        setError('Notification permission denied');
        setIsLoading(false);
        return;
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Get VAPID public key from environment
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      
      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured');
      }

      // Subscribe to push notifications
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      // Get auth token
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required');
      }

      // Send subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId,
          subscription: sub.toJSON(),
          deviceType: /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' : 
                      /Android/.test(navigator.userAgent) ? 'android' : 'web'
        })
      });

      if (!response.ok) {
        // Rollback browser subscription if server rejects
        await sub.unsubscribe();
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save subscription');
      }

      setIsSubscribed(true);
      setSubscription(sub);
      setSuccess('🥋 Push notifications enabled! You\'ll receive daily techniques from Prof. OS.');
    } catch (err: any) {
      console.error('Failed to subscribe to push:', err);
      setError(err.message || 'Failed to enable notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribeFromPush = async () => {
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      if (subscription) {
        // Get auth token
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Authentication required');
        }

        // Notify server first
        const response = await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to unsubscribe');
        }

        // Then unsubscribe browser
        await subscription.unsubscribe();

        setIsSubscribed(false);
        setSubscription(null);
        setSuccess('Push notifications disabled');
      }
    } catch (err: any) {
      console.error('Failed to unsubscribe from push:', err);
      setError(err.message || 'Failed to disable notifications');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      background: "var(--mobile-dark-gray)",
      borderRadius: "var(--mobile-radius-lg)",
      padding: "1.5rem"
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "1rem"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {isSubscribed ? (
            <Bell size={20} style={{ color: "var(--mobile-primary-purple)" }} />
          ) : (
            <BellOff size={20} style={{ color: "var(--mobile-text-tertiary)" }} />
          )}
          <div>
            <div style={{ 
              fontSize: "1rem", 
              fontWeight: "500",
              color: "var(--mobile-text-primary)",
              marginBottom: "0.25rem"
            }}>
              Push Notifications
            </div>
            <div style={{ 
              fontSize: "0.875rem", 
              color: "var(--mobile-text-secondary)"
            }}>
              {isSubscribed ? 'Receiving daily techniques' : 'Get daily BJJ technique updates'}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem",
          background: "rgba(239, 68, 68, 0.1)",
          borderRadius: "var(--mobile-radius-md)",
          marginBottom: "1rem"
        }}>
          <AlertCircle size={16} style={{ color: "#ef4444" }} />
          <span style={{ fontSize: "0.875rem", color: "#ef4444" }}>{error}</span>
        </div>
      )}

      {success && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem",
          background: "rgba(34, 197, 94, 0.1)",
          borderRadius: "var(--mobile-radius-md)",
          marginBottom: "1rem"
        }}>
          <CheckCircle size={16} style={{ color: "#22c55e" }} />
          <span style={{ fontSize: "0.875rem", color: "#22c55e" }}>{success}</span>
        </div>
      )}

      <button
        onClick={isSubscribed ? unsubscribeFromPush : subscribeToPush}
        disabled={isLoading}
        data-testid={isSubscribed ? "button-disable-notifications" : "button-enable-notifications"}
        style={{
          width: "100%",
          padding: "0.875rem",
          background: isSubscribed 
            ? "var(--mobile-medium-gray)" 
            : "var(--mobile-primary-purple)",
          border: "none",
          borderRadius: "var(--mobile-radius-md)",
          color: "var(--mobile-text-primary)",
          fontSize: "1rem",
          fontWeight: "500",
          cursor: isLoading ? "not-allowed" : "pointer",
          opacity: isLoading ? 0.6 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem"
        }}
      >
        {isLoading ? (
          <>
            <div style={{ 
              width: "16px", 
              height: "16px", 
              border: "2px solid var(--mobile-text-tertiary)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite"
            }} />
            <span>Processing...</span>
          </>
        ) : isSubscribed ? (
          <>
            <BellOff size={18} />
            <span>Disable Notifications</span>
          </>
        ) : (
          <>
            <Bell size={18} />
            <span>Enable Notifications</span>
          </>
        )}
      </button>

      {!('serviceWorker' in navigator) && (
        <div style={{
          marginTop: "0.75rem",
          padding: "0.75rem",
          background: "rgba(251, 191, 36, 0.1)",
          borderRadius: "var(--mobile-radius-md)",
          fontSize: "0.75rem",
          color: "#fbbf24"
        }}>
          <Smartphone size={14} style={{ display: "inline", marginRight: "0.5rem" }} />
          Note: Push notifications work best on Android. iOS users can add BJJ OS to their home screen for a better experience.
        </div>
      )}
    </div>
  );
}
