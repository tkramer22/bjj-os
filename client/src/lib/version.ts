// Application version for cache busting
// Fetched from server for accurate version checking
export const FALLBACK_VERSION = "6.0.5";

interface VersionInfo {
  version: string;
  buildTime: string;
  features: string[];
}

// Check version from server and handle updates
export async function checkVersion(): Promise<void> {
  try {
    const response = await fetch('/api/version');
    if (!response.ok) {
      console.log('[VERSION] Server version check failed, using fallback');
      return;
    }
    
    const serverVersion: VersionInfo = await response.json();
    const storedVersion = localStorage.getItem("app_version");
    
    if (storedVersion && storedVersion !== serverVersion.version) {
      console.log(`[VERSION] Detected version change: ${storedVersion} → ${serverVersion.version}`);
      
      // Unregister service workers for clean update
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(registration => {
            registration.unregister();
          });
        });
      }
      
      // Clear caches for fresh content
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            caches.delete(name);
          });
        });
      }
      
      // Store new version and reload
      localStorage.setItem("app_version", serverVersion.version);
      console.log('[VERSION] Forcing reload for new version...');
      window.location.reload();
      return;
    }
    
    // Store current version
    localStorage.setItem("app_version", serverVersion.version);
    console.log(`[VERSION] Current version: ${serverVersion.version}`);
  } catch (error) {
    console.log('[VERSION] Version check skipped:', error);
  }
}

// Add version to all API requests as query param (cache bust)
export function addVersionParam(url: string): string {
  const storedVersion = localStorage.getItem("app_version") || FALLBACK_VERSION;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_v=${storedVersion}&_t=${Date.now()}`;
}
