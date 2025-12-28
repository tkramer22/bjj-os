// Enhanced analytics with geolocation
class BJJAnalytics {
  visitorId: string;
  sessionId: string;
  pageLoadTime: number;
  
  constructor() {
    this.visitorId = this.getOrCreateVisitorId();
    this.sessionId = this.getOrCreateSessionId();
    this.pageLoadTime = Date.now();
  }
  
  getOrCreateVisitorId(): string {
    let id = localStorage.getItem('bjj_visitor_id');
    if (!id) {
      id = 'v_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      localStorage.setItem('bjj_visitor_id', id);
    }
    return id;
  }
  
  getOrCreateSessionId(): string {
    let id = sessionStorage.getItem('bjj_session_id');
    if (!id) {
      id = 's_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      sessionStorage.setItem('bjj_session_id', id);
    }
    return id;
  }
  
  getTrafficSource() {
    const referrer = document.referrer;
    const urlParams = new URLSearchParams(window.location.search);
    
    const utmSource = urlParams.get('utm_source');
    if (utmSource) {
      return {
        source: utmSource,
        utmMedium: urlParams.get('utm_medium'),
        utmCampaign: urlParams.get('utm_campaign'),
        referrer: referrer
      };
    }
    
    if (!referrer) return { source: 'direct', referrer: '' };
    
    if (referrer.includes('instagram.com')) return { source: 'instagram', referrer };
    if (referrer.includes('google.com')) return { source: 'google', referrer };
    if (referrer.includes('facebook.com')) return { source: 'facebook', referrer };
    if (referrer.includes('twitter.com') || referrer.includes('t.co')) return { source: 'twitter', referrer };
    if (referrer.includes('youtube.com')) return { source: 'youtube', referrer };
    if (referrer.includes('reddit.com')) return { source: 'reddit', referrer };
    if (referrer.includes('tiktok.com')) return { source: 'tiktok', referrer };
    
    return { source: 'referral', referrer };
  }
  
  getDeviceInfo() {
    const ua = navigator.userAgent;
    
    let deviceType = 'desktop';
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      deviceType = 'tablet';
    } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      deviceType = 'mobile';
    }
    
    let browser = 'unknown';
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edge')) browser = 'Edge';
    
    let os = 'unknown';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Linux')) os = 'Linux';
    
    return { deviceType, browser, os };
  }
  
  async trackPageView() {
    try {
      const sourceInfo = this.getTrafficSource();
      const deviceInfo = this.getDeviceInfo();
      
      const data = {
        pagePath: window.location.pathname,
        pageTitle: document.title,
        visitorId: this.visitorId,
        sessionId: this.sessionId,
        referrer: sourceInfo.referrer,
        source: sourceInfo.source,
        utmSource: 'utmMedium' in sourceInfo ? sourceInfo.source : null,
        utmMedium: 'utmMedium' in sourceInfo ? sourceInfo.utmMedium : null,
        utmCampaign: 'utmCampaign' in sourceInfo ? sourceInfo.utmCampaign : null,
        deviceType: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        os: deviceInfo.os
        // Location will be determined server-side from IP
      };
      
      await fetch('/api/analytics/pageview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      this.trackTimeOnPage();
      
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }
  
  trackTimeOnPage() {
    window.addEventListener('beforeunload', () => {
      const timeOnPage = Math.round((Date.now() - this.pageLoadTime) / 1000);
      navigator.sendBeacon('/api/analytics/time-on-page', JSON.stringify({
        visitorId: this.visitorId,
        sessionId: this.sessionId,
        pagePath: window.location.pathname,
        timeOnPage: timeOnPage
      }));
    });
  }
}

// Initialize analytics on public pages only (not /app, /admin, etc.)
if (window.location.pathname === '/' || window.location.pathname.startsWith('/pricing')) {
  const analytics = new BJJAnalytics();
  analytics.trackPageView();
  (window as any).bjjAnalytics = analytics;
}

export default BJJAnalytics;
