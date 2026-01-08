import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { MobileChat } from "@/components/mobile-chat";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { clearAuth } from "@/lib/capacitorAuth";

console.log('✅ ios-chat.tsx LOADED');

export default function IOSChatPage() {
  const [, setLocation] = useLocation();
  const [authValid, setAuthValid] = useState(false);
  
  useEffect(() => {
    const mobileUserId = localStorage.getItem('mobileUserId');
    const token = localStorage.getItem('sessionToken') || localStorage.getItem('token');
    console.log('[IOS-CHAT] Auth check - mobileUserId:', mobileUserId, 'hasToken:', !!token);
    
    if (!mobileUserId || !token) {
      console.log('[IOS-CHAT] Missing auth (userId or token), clearing and redirecting to login');
      clearAuth().then(() => {
        setLocation('/ios-login');
      });
      return;
    }
    
    setAuthValid(true);
  }, [setLocation]);
  
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
      }}
    >
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <MobileChat />
      </div>
      <IOSBottomNav />
    </div>
  );
}
