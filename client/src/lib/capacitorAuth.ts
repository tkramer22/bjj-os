import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const AUTH_TOKEN_KEY = 'authToken';
const USER_DATA_KEY = 'userData';
const MOBILE_USER_ID_KEY = 'mobileUserId';

// API Base URL for native apps running in bundled mode
// In bundled mode, API calls need to hit the remote server
const API_BASE_URL = 'https://bjjos.app';

/**
 * Get the full API URL for a given path.
 * In native bundled mode, prefixes with remote server URL.
 * In web mode, uses relative paths.
 */
export function getApiUrl(path: string): string {
  // If running as native app (bundled mode), use full URL
  if (Capacitor.isNativePlatform()) {
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE_URL}${normalizedPath}`;
  }
  // In web mode, use relative path
  return path;
}

export function isNativeApp(): boolean {
  // Primary check: Capacitor native platform API
  if (Capacitor.isNativePlatform()) {
    return true;
  }
  
  // Secondary check: Look for Capacitor in window object
  // This helps when Capacitor bridge is injected but not fully initialized
  if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
    return true;
  }
  
  // Fallback: Check for iOS routes BUT only if Capacitor object exists
  // This prevents false positives in regular browsers viewing /ios-* routes
  if (typeof window !== 'undefined' && 
      window.location.pathname.startsWith('/ios-') &&
      (window as any).Capacitor !== undefined) {
    return true;
  }
  
  return false;
}

export function isIOSApp(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

export function isAndroidApp(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export async function saveAuthToken(token: string): Promise<void> {
  if (isNativeApp()) {
    await Preferences.set({ key: AUTH_TOKEN_KEY, value: token });
  }
  localStorage.setItem('sessionToken', token);
  localStorage.setItem('token', token);
}

export async function saveUserData(userData: any): Promise<void> {
  const userDataString = JSON.stringify(userData);
  if (isNativeApp()) {
    await Preferences.set({ key: USER_DATA_KEY, value: userDataString });
  }
  localStorage.setItem('user', userDataString);
}

export async function getAuthToken(): Promise<string | null> {
  if (isNativeApp()) {
    const { value } = await Preferences.get({ key: AUTH_TOKEN_KEY });
    if (value) {
      localStorage.setItem('sessionToken', value);
      localStorage.setItem('token', value);
      return value;
    }
  }
  return localStorage.getItem('sessionToken') || localStorage.getItem('token');
}

export async function getUserData(): Promise<any | null> {
  if (isNativeApp()) {
    const { value } = await Preferences.get({ key: USER_DATA_KEY });
    if (value) {
      localStorage.setItem('user', value);
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
  }
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
}

export async function clearAuth(): Promise<void> {
  if (isNativeApp()) {
    await Preferences.remove({ key: AUTH_TOKEN_KEY });
    await Preferences.remove({ key: USER_DATA_KEY });
    await Preferences.remove({ key: MOBILE_USER_ID_KEY });
  }
  localStorage.removeItem('sessionToken');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('mobileUserId');
}

export async function restoreAuthFromNative(): Promise<boolean> {
  if (!isNativeApp()) {
    return false;
  }
  
  try {
    const { value: token } = await Preferences.get({ key: AUTH_TOKEN_KEY });
    const { value: userData } = await Preferences.get({ key: USER_DATA_KEY });
    const { value: mobileUserId } = await Preferences.get({ key: MOBILE_USER_ID_KEY });
    
    if (token) {
      localStorage.setItem('sessionToken', token);
      localStorage.setItem('token', token);
      
      if (userData) {
        localStorage.setItem('user', userData);
        
        // Derive mobileUserId from user data if not stored separately
        try {
          const user = JSON.parse(userData);
          const userId = mobileUserId || user?.id?.toString() || '1';
          localStorage.setItem('mobileUserId', userId);
          
          // Also save derived mobileUserId to Preferences for future
          if (!mobileUserId && user?.id) {
            await Preferences.set({ key: MOBILE_USER_ID_KEY, value: userId });
          }
        } catch {
          // If parsing fails, use stored mobileUserId or default
          if (mobileUserId) {
            localStorage.setItem('mobileUserId', mobileUserId);
          }
        }
      } else if (mobileUserId) {
        // Restore mobileUserId even without user data
        localStorage.setItem('mobileUserId', mobileUserId);
      }
      
      return true;
    }
  } catch (error) {
    console.error('Error restoring auth from native storage:', error);
  }
  
  return false;
}

export async function hasStoredAuth(): Promise<boolean> {
  if (isNativeApp()) {
    const { value } = await Preferences.get({ key: AUTH_TOKEN_KEY });
    return !!value;
  }
  return !!(localStorage.getItem('sessionToken') || localStorage.getItem('token'));
}
