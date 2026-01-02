import { MobileChat } from "@/components/mobile-chat";
import { IOSBottomNav } from "@/components/ios-bottom-nav";

console.log('✅ ios-chat.tsx LOADED');

export default function IOSChatPage() {
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
