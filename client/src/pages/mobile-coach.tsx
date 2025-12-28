import { MobileChat } from "@/components/mobile-chat";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

console.log('❌ MOBILE coach loaded - WRONG if you see this in iOS app');

export default function MobileCoachPage() {
  return (
    <div className="mobile-app">
      <div className="mobile-container">
        <MobileChat />
        <MobileBottomNav />
      </div>
    </div>
  );
}
