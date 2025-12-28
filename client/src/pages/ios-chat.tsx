import { MobileChat } from "@/components/mobile-chat";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { useEffect } from "react";

export default function IOSChatPage() {
  useEffect(() => {
    console.log('✅ iOS CHAT loaded');
  }, []);

  return (
    <div 
      className="ios-page"
      style={{
        minHeight: '100vh',
        background: '#0A0A0B',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        flex: 1,
        paddingBottom: '80px',
        overflow: 'hidden',
      }}>
        <MobileChat />
      </div>
      <IOSBottomNav />
    </div>
  );
}
