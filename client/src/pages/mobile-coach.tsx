import { MobileChat } from "@/components/mobile-chat";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

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
