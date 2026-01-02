import { useState, useEffect } from "react";
import { MobileChat } from "@/components/mobile-chat";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { Keyboard } from "@capacitor/keyboard";
import { Capacitor } from "@capacitor/core";

console.log('✅ ios-chat.tsx LOADED');

export default function IOSChatPage() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Track keyboard visibility to hide bottom nav
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const showListener = Keyboard.addListener('keyboardWillShow', () => {
      console.log('[IOS-CHAT] Keyboard showing, hiding bottom nav');
      setIsKeyboardVisible(true);
    });

    const hideListener = Keyboard.addListener('keyboardWillHide', () => {
      console.log('[IOS-CHAT] Keyboard hiding, showing bottom nav');
      setIsKeyboardVisible(false);
    });

    return () => {
      showListener.then(l => l.remove());
      hideListener.then(l => l.remove());
    };
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
        paddingBottom: isKeyboardVisible ? 0 : '80px',
        overflow: 'hidden',
      }}>
        <MobileChat />
      </div>
      {!isKeyboardVisible && <IOSBottomNav />}
    </div>
  );
}
