import { useLocation } from "wouter";
import { MobileChat } from "@/components/mobile-chat";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { clearAuth } from "@/lib/capacitorAuth";
import { useState, useEffect, lazy, Suspense } from "react";

const IOSLibraryPage = lazy(() => import("@/pages/ios-library"));
const IOSSavedPage = lazy(() => import("@/pages/ios-saved"));
const IOSProfilePage = lazy(() => import("@/pages/ios-profile"));

const tabPaths = ["/ios-chat", "/ios-library", "/ios-saved", "/ios-profile"] as const;
type TabPath = typeof tabPaths[number];

function LoadingFallback() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0A0A0B',
    }}>
      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function IOSTabContainer() {
  const [location] = useLocation();
  const [, setLocationFn] = useLocation();
  const [authValid, setAuthValid] = useState(false);
  const [mountedTabs, setMountedTabs] = useState<Set<TabPath>>(new Set(["/ios-chat"]));

  const activeTab: TabPath = tabPaths.includes(location as TabPath)
    ? (location as TabPath)
    : "/ios-chat";

  useEffect(() => {
    const mobileUserId = localStorage.getItem('mobileUserId');
    const token = localStorage.getItem('sessionToken') || localStorage.getItem('token');

    if (!mobileUserId || !token) {
      clearAuth().then(() => {
        setLocationFn('/ios-login');
      });
      return;
    }

    setAuthValid(true);
  }, [setLocationFn]);

  useEffect(() => {
    if (authValid && !mountedTabs.has(activeTab)) {
      setMountedTabs(prev => new Set(prev).add(activeTab));
    }
  }, [activeTab, authValid]);

  if (!authValid) {
    return (
      <div className="ios-page" style={{ height: '100vh', background: '#0A0A0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="ios-page"
      style={{
        height: '100vh',
        background: '#0A0A0B',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            display: activeTab === '/ios-chat' ? 'flex' : 'none',
            flexDirection: 'column',
            height: '100%',
          }}
          data-testid="tab-panel-chat"
        >
          <MobileChat />
        </div>

        <div
          style={{
            display: activeTab === '/ios-library' ? 'block' : 'none',
            height: '100%',
            overflow: 'auto',
          }}
          data-testid="tab-panel-library"
        >
          {mountedTabs.has('/ios-library') && (
            <Suspense fallback={<LoadingFallback />}>
              <IOSLibraryPage hideBottomNav />
            </Suspense>
          )}
        </div>

        <div
          style={{
            display: activeTab === '/ios-saved' ? 'block' : 'none',
            height: '100%',
            overflow: 'auto',
          }}
          data-testid="tab-panel-saved"
        >
          {mountedTabs.has('/ios-saved') && (
            <Suspense fallback={<LoadingFallback />}>
              <IOSSavedPage hideBottomNav />
            </Suspense>
          )}
        </div>

        <div
          style={{
            display: activeTab === '/ios-profile' ? 'block' : 'none',
            height: '100%',
            overflow: 'auto',
          }}
          data-testid="tab-panel-profile"
        >
          {mountedTabs.has('/ios-profile') && (
            <Suspense fallback={<LoadingFallback />}>
              <IOSProfilePage hideBottomNav />
            </Suspense>
          )}
        </div>
      </div>

      <IOSBottomNav />
    </div>
  );
}
