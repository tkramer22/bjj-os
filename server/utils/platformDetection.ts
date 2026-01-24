/**
 * Platform Detection Utility for iOS App vs Web Browser tracking
 * Detects whether requests come from iOS app (Capacitor) or web browsers
 */

export type Platform = 
  | 'ios_iphone' 
  | 'ios_ipad' 
  | 'ios_app' 
  | 'mobile_web' 
  | 'desktop_web' 
  | 'unknown';

/**
 * Detect the platform from User-Agent string
 * iOS app uses Capacitor which adds specific identifiers to User-Agent
 */
export function detectPlatform(userAgent: string | undefined): Platform {
  if (!userAgent) return 'unknown';
  
  const ua = userAgent.toLowerCase();
  
  // Check for iOS app (Capacitor sets specific user agent markers)
  // Capacitor typically includes: "Capacitor" or custom app identifier
  if (ua.includes('capacitor') || ua.includes('bjj-os-ios') || ua.includes('bjjos')) {
    if (ua.includes('ipad')) return 'ios_ipad';
    if (ua.includes('iphone')) return 'ios_iphone';
    return 'ios_app';
  }
  
  // Check for iOS Safari WebView (WKWebView) - native iOS app context
  // Native iOS apps using WKWebView have specific patterns
  if ((ua.includes('iphone') || ua.includes('ipad')) && !ua.includes('safari') && ua.includes('mobile')) {
    if (ua.includes('ipad')) return 'ios_ipad';
    return 'ios_iphone';
  }
  
  // Check for mobile web browsers
  if (ua.includes('mobile') || ua.includes('android')) {
    return 'mobile_web';
  }
  
  // Desktop web
  return 'desktop_web';
}

/**
 * Check if the request is from an iOS app
 */
export function isIOSApp(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  
  // Check for Capacitor/native iOS markers
  if (ua.includes('capacitor') || ua.includes('bjj-os-ios') || ua.includes('bjjos')) {
    return true;
  }
  
  // Check for iOS WKWebView pattern (native app)
  if ((ua.includes('iphone') || ua.includes('ipad')) && !ua.includes('safari') && ua.includes('mobile')) {
    return true;
  }
  
  return false;
}

/**
 * Check if platform is any iOS variant
 */
export function isIOSPlatform(platform: Platform): boolean {
  return platform === 'ios_iphone' || platform === 'ios_ipad' || platform === 'ios_app';
}

/**
 * Check if platform is any web variant
 */
export function isWebPlatform(platform: Platform): boolean {
  return platform === 'desktop_web' || platform === 'mobile_web';
}
