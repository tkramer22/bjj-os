import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ChatProvider } from "@/contexts/ChatContext";
import { checkVersion } from "@/lib/version";
import { useEffect, useState } from "react";
import { restoreAuthFromNative, isNativeApp } from "@/lib/capacitorAuth";
import "./analytics"; // Initialize analytics tracking
import Landing from "@/pages/landing";
import Pricing from "@/pages/pricing";
import Success from "@/pages/success";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import Refund from "@/pages/refund";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import EmailSignup from "@/pages/email-signup";
import EmailLogin from "@/pages/email-login";
import ForgotPassword from "@/pages/forgot-password";
import IOSLogin from "@/pages/ios-login";
import IOSForgotPassword from "@/pages/ios-forgot-password";
import IOSVerifyReset from "@/pages/ios-verify-reset";
import IOSResetPassword from "@/pages/ios-reset-password";
import LifetimeSignup from "@/pages/lifetime-signup";
import WelcomeLifetime from "@/pages/WelcomeLifetime";
import OnboardingPage from "@/pages/onboarding";
import OnboardingFlow from "@/pages/OnboardingFlow";
import AuthMagic from "@/pages/auth-magic";
import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import LaunchDayAdmin from "@/pages/admin-launch";
import AdminUsers from "@/pages/admin/users";
import AdminReferrals from "@/pages/admin/referrals";
import AdminLifetime from "@/pages/admin/lifetime";
import AdminVideos from "@/pages/admin/videos";
import AdminFeedback from "@/pages/admin/feedback";
import AdminMeta from "@/pages/admin/meta";
import AdminMagicLinks from "@/pages/admin/magic-links";
import AdminInstructors from "@/pages/admin/instructors";
import AdminPartnerships from "@/pages/admin/partnerships";
import AdminChains from "@/pages/admin/chains";
import AdminLogs from "@/pages/admin/logs";
import AdminSchedules from "@/pages/admin/schedules";
import AdminTechniques from "@/pages/admin/techniques";
import AdminFlaggedAccounts from "@/pages/admin/flagged-accounts";
import AdminInstructorPriority from "@/pages/admin/instructor-priority";
import AdminActivity from "@/pages/admin/activity";
import AdminAutoCuration from "@/pages/admin/auto-curation";
import AdminCuration from "@/pages/admin/curation";
import AdminAnalytics from "@/pages/admin/analytics";
import AdminChat from "@/pages/admin/chat";
import AdminCommandCenter from "@/pages/admin/command-center";
import AdminUsersDashboard from "@/pages/admin-users";
import AdminEmails from "@/pages/admin-emails";
import AddFreeUser from "@/pages/add-free-user";
import AIMonitoring from "@/pages/ai-monitoring";
import AIIntelligence from "@/pages/ai-intelligence";
import AdminDevOS from "@/pages/admin-dev-os";
import NotFound from "@/pages/not-found";

// Web Chat
import ChatPage from "@/pages/chat";

// Settings Pages
import ProfileSettings from "@/pages/settings/profile";
import SecuritySettings from "@/pages/settings/security";
import SubscriptionSettings from "@/pages/settings/subscription";
import ReferralsSettings from "@/pages/settings/referrals";
import Settings from "@/pages/settings-mobile";

// Progress Page
import ProgressPage from "@/pages/progress";

// Saved Videos Page (with technique and instructor filters)
import SavedVideosPage from "@/pages/saved-videos";
import PaymentPage from "@/pages/payment";
import LibraryPage from "@/pages/library";

// Mobile PWA Pages
import MobileCoachPage from "@/pages/mobile-coach";
import MobileSavedPage from "@/pages/mobile-saved";
import MobileSettingsPage from "@/pages/mobile-settings";
import MobileProgressPage from "@/pages/mobile-progress";
import MobileOnboardingPage from "@/pages/mobile-onboarding";
import MobileProfilePage from "@/pages/mobile-profile";
import ThemeSettings from "@/pages/theme-settings";

// iOS Native App Pages
import IOSHomePage from "@/pages/ios-home";
import IOSChatPage from "@/pages/ios-chat";
import IOSLibraryPage from "@/pages/ios-library";
import IOSSavedPage from "@/pages/ios-saved";
import IOSProfilePage from "@/pages/ios-profile";
import IOSSettingsPage from "@/pages/ios-settings";
import IOSTermsPage from "@/pages/ios-terms";
import IOSPrivacyPage from "@/pages/ios-privacy";
import IOSHelpPage from "@/pages/ios-help";
import IOSSubscribePage from "@/pages/ios-subscribe";

// Native app landing redirect component
function NativeAwareHome({ isAuthenticated, authRestored }: { isAuthenticated: boolean; authRestored: boolean }) {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    // Wait for auth to be restored before making routing decisions
    if (!authRestored) {
      console.log('[NATIVE HOME] Waiting for auth restoration...');
      return;
    }
    
    if (isNativeApp()) {
      console.log('[NATIVE HOME] Auth restored, isAuthenticated:', isAuthenticated);
      // Native iOS app: use iOS-specific routes for consistent navigation
      if (isAuthenticated) {
        console.log('[NATIVE HOME] Redirecting to /ios-chat');
        setLocation("/ios-chat"); // Use iOS chat page with IOSBottomNav
      } else {
        console.log('[NATIVE HOME] Redirecting to /ios-login');
        // Use ios-login for App Store compliant login (email+password, no signup)
        setLocation("/ios-login");
      }
    }
  }, [isAuthenticated, authRestored, setLocation]);
  
  // Only show landing page for web visitors
  if (isNativeApp()) {
    return null; // Will redirect
  }
  
  return <Landing />;
}

export default function App() {
  const [authRestored, setAuthRestored] = useState(!isNativeApp());
  const [isNativeAuthenticated, setIsNativeAuthenticated] = useState(false);

  // Restore auth from Capacitor Preferences on native app startup
  useEffect(() => {
    async function initAuth() {
      if (isNativeApp()) {
        const restored = await restoreAuthFromNative();
        console.log('[AUTH] Native auth restored from Preferences:', restored);
        console.log('[AUTH] mobileUserId after restore:', localStorage.getItem('mobileUserId'));
        console.log('[AUTH] token after restore:', localStorage.getItem('sessionToken')?.substring(0, 20) || 'none');
        
        // CRITICAL: Validate restored auth with server before trusting it
        if (restored) {
          try {
            const token = localStorage.getItem('sessionToken') || localStorage.getItem('token');
            // Import getApiUrl and clearAuth directly - they're already exported from capacitorAuth
            const capacitorModule = await import('@/lib/capacitorAuth');
            const apiUrl = capacitorModule.getApiUrl('/api/auth/me');
            console.log('[AUTH] Validating token with:', apiUrl);
            
            const response = await fetch(apiUrl, {
              headers: token ? { 'Authorization': `Bearer ${token}` } : {},
              credentials: 'include'
            });
            
            if (response.ok) {
              console.log('[AUTH] Token validated with server - auth is valid');
              setIsNativeAuthenticated(true);
            } else {
              console.log('[AUTH] Token validation failed (status:', response.status, ') - clearing invalid auth');
              await capacitorModule.clearAuth();
              setIsNativeAuthenticated(false);
            }
          } catch (error) {
            console.error('[AUTH] Token validation error:', error);
            // On network error, still use local auth but mark for re-validation
            const hasAuth = localStorage.getItem('mobileUserId') !== null;
            setIsNativeAuthenticated(hasAuth);
          }
        } else {
          setIsNativeAuthenticated(false);
        }
        
        setAuthRestored(true);
      }
    }
    initAuth();
  }, []);
  
  // For web, compute auth from localStorage directly
  const isAuthenticated = isNativeApp() ? isNativeAuthenticated : localStorage.getItem('mobileUserId') !== null;

  // Listen for storage changes (login/logout from other components)
  useEffect(() => {
    const handleStorageChange = () => {
      if (isNativeApp()) {
        const hasAuth = localStorage.getItem('mobileUserId') !== null;
        console.log('[AUTH] Storage changed, updating isNativeAuthenticated:', hasAuth);
        setIsNativeAuthenticated(hasAuth);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom auth change events (same-window updates)
    const handleAuthChange = () => {
      if (isNativeApp()) {
        const hasAuth = localStorage.getItem('mobileUserId') !== null;
        console.log('[AUTH] Auth change event, updating isNativeAuthenticated:', hasAuth);
        setIsNativeAuthenticated(hasAuth);
      }
    };
    window.addEventListener('bjjos-auth-change', handleAuthChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('bjjos-auth-change', handleAuthChange);
    };
  }, []);

  // Check version on app load and force reload if changed
  useEffect(() => {
    checkVersion();
  }, []);

  // Show loading splash while restoring auth on native
  if (!authRestored) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center">
        <img src="/bjjos-logo.png" alt="BJJ OS" className="h-8 w-auto mb-4" />
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ChatProvider>
        <TooltipProvider>
          <ThemeProvider defaultTheme="dark">
            <Switch>
            {/* Public pages - Native app skips landing page */}
            <Route path="/">
              <NativeAwareHome isAuthenticated={isAuthenticated} authRestored={authRestored} />
            </Route>
            <Route path="/pricing" component={Pricing} />
            <Route path="/success" component={Success} />
            <Route path="/terms" component={Terms} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/refund" component={Refund} />
            
            {/* User Authentication */}
            <Route path="/login" component={Login} />
            <Route path="/signup" component={Signup} />
            <Route path="/email-signup" component={EmailSignup} />
            <Route path="/email-login" component={EmailLogin} />
            <Route path="/ios-login" component={IOSLogin} />
            <Route path="/ios-forgot-password" component={IOSForgotPassword} />
            <Route path="/ios-verify-reset" component={IOSVerifyReset} />
            <Route path="/ios-reset-password" component={IOSResetPassword} />
            <Route path="/forgot-password" component={ForgotPassword} />
            <Route path="/lifetime-signup" component={LifetimeSignup} />
            <Route path="/welcome/lifetime" component={WelcomeLifetime} />
            <Route path="/auth/magic" component={AuthMagic} />
            
            {/* iOS Native App Routes */}
            <Route path="/ios-home" component={IOSHomePage} />
            <Route path="/ios-chat" component={IOSChatPage} />
            <Route path="/ios-library" component={IOSLibraryPage} />
            <Route path="/ios-saved" component={IOSSavedPage} />
            <Route path="/ios-profile" component={IOSProfilePage} />
            <Route path="/ios-settings" component={IOSSettingsPage} />
            <Route path="/ios-terms" component={IOSTermsPage} />
            <Route path="/ios-privacy" component={IOSPrivacyPage} />
            <Route path="/ios-help" component={IOSHelpPage} />
            <Route path="/ios-onboarding" component={MobileOnboardingPage} />
            <Route path="/ios-subscribe" component={IOSSubscribePage} />
            
            {/* Web Chat */}
            <Route path="/chat" component={ChatPage} />
            
            {/* Dashboard redirect (legacy - redirects to /chat) */}
            <Route path="/dashboard">
              {() => {
                const [, setLocation] = useLocation();
                useEffect(() => {
                  setLocation("/chat");
                }, [setLocation]);
                return null;
              }}
            </Route>
            
            {/* Settings Pages */}
            <Route path="/settings" component={Settings} />
            <Route path="/settings/profile" component={ProfileSettings} />
            <Route path="/settings/security" component={SecuritySettings} />
            <Route path="/settings/subscription" component={SubscriptionSettings} />
            <Route path="/settings/referrals" component={ReferralsSettings} />
            <Route path="/mobile-settings" component={MobileSettingsPage} />
            
            {/* Progress Page */}
            <Route path="/progress" component={ProgressPage} />
            
            {/* Saved Videos Page */}
            <Route path="/saved-videos" component={SavedVideosPage} />
            <Route path="/saved" component={SavedVideosPage} />
            
            {/* Video Library Page */}
            <Route path="/library" component={LibraryPage} />
            
            {/* Onboarding */}
            <Route path="/onboarding" component={OnboardingFlow} />
            <Route path="/onboarding/full" component={OnboardingPage} />
            
            {/* Payment */}
            <Route path="/payment" component={PaymentPage} />
            <Route path="/payment/success" component={Success} />
            
            {/* Theme Settings */}
            <Route path="/theme-settings" component={ThemeSettings} />
            
            {/* Mobile PWA Routes - NOT for native iOS app (uses /ios-* routes instead) */}
            <Route path="/mobile-onboarding" component={MobileOnboardingPage} />
            <Route path="/app">
              {() => {
                if (isNativeApp()) return null; // Native uses /ios-chat instead
                return isAuthenticated ? <MobileCoachPage /> : <MobileOnboardingPage />;
              }}
            </Route>
            <Route path="/app/chat">
              {() => {
                if (isNativeApp()) return null; // Native uses /ios-chat instead
                return isAuthenticated ? <MobileCoachPage /> : <MobileOnboardingPage />;
              }}
            </Route>
            <Route path="/app/saved">
              {isAuthenticated ? <MobileSavedPage /> : <MobileOnboardingPage />}
            </Route>
            <Route path="/app/progress">
              {isAuthenticated ? <MobileProgressPage /> : <MobileOnboardingPage />}
            </Route>
            <Route path="/app/settings">
              {isAuthenticated ? <MobileSettingsPage /> : <MobileOnboardingPage />}
            </Route>
            <Route path="/app/profile">
              {isAuthenticated ? <MobileProfilePage /> : <MobileOnboardingPage />}
            </Route>
            
            {/* Launch Day Admin (Simple) */}
            <Route path="/launch-admin" component={LaunchDayAdmin} />
            
            {/* Admin Routes */}
            <Route path="/admin/login" component={AdminLogin} />
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/admin/dashboard" component={AdminDashboard} />
            <Route path="/admin/chat" component={AdminChat} />
            <Route path="/admin/command-center" component={AdminCommandCenter} />
            <Route path="/admin/videos" component={AdminVideos} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route path="/admin/users-management" component={AdminUsersDashboard} />
            <Route path="/admin/referrals" component={AdminReferrals} />
            <Route path="/admin/lifetime" component={AdminLifetime} />
            <Route path="/admin/lifetime-access" component={AdminLifetime} />
            <Route path="/admin/feedback" component={AdminFeedback} />
            <Route path="/admin/meta" component={AdminMeta} />
            <Route path="/admin/instructors" component={AdminInstructors} />
            <Route path="/admin/partnerships" component={AdminPartnerships} />
            <Route path="/admin/chains" component={AdminChains} />
            <Route path="/admin/logs" component={AdminLogs} />
            <Route path="/admin/schedules" component={AdminSchedules} />
            <Route path="/admin/techniques" component={AdminTechniques} />
            <Route path="/admin/flagged-accounts" component={AdminFlaggedAccounts} />
            <Route path="/admin/instructor-priority" component={AdminInstructorPriority} />
            <Route path="/admin/activity" component={AdminActivity} />
            <Route path="/admin/magic-links" component={AdminMagicLinks} />
            <Route path="/admin/auto-curation" component={AdminAutoCuration} />
            <Route path="/admin/curation" component={AdminCuration} />
            <Route path="/admin/dev-os" component={AdminDevOS} />
            <Route path="/admin/analytics" component={AdminAnalytics} />
            <Route path="/admin/emails" component={AdminEmails} />
            
            <Route component={NotFound} />
            </Switch>
            <Toaster />
          </ThemeProvider>
        </TooltipProvider>
      </ChatProvider>
    </QueryClientProvider>
  );
}
