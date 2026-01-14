import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/capacitorAuth";
import { triggerHaptic } from "@/lib/haptics";
import { Loader2, Check, Star, Sparkles } from "lucide-react";
import "@/styles/mobile.css";

console.log("✅ iOS SUBSCRIBE loaded");

export default function IOSSubscribePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [storeReady, setStoreReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    initializeStore();
  }, []);

  const initializeStore = async () => {
    try {
      const { initApplePurchase, registerProducts, isStoreReady } = await import('@/services/applePurchase');
      
      await initApplePurchase();
      await registerProducts();
      
      const checkReady = setInterval(() => {
        if (isStoreReady()) {
          setStoreReady(true);
          clearInterval(checkReady);
        }
      }, 500);

      setTimeout(() => clearInterval(checkReady), 10000);
      
    } catch (err) {
      console.error('[SUBSCRIBE] Store init error:', err);
      setStoreReady(true);
    }
  };

  const handleSubscribe = async () => {
    setError("");
    triggerHaptic('light');
    setIsPurchasing(true);

    try {
      const { purchaseProduct, restorePurchases } = await import('@/services/applePurchase');
      
      const result = await purchaseProduct('bjjos_monthly');

      if (result.success) {
        triggerHaptic('success');
        
        toast({
          title: "Subscription activated!",
          description: "Welcome to BJJ OS",
        });

        setLocation("/ios-onboarding");
      } else {
        throw new Error(result.error || 'Purchase failed');
      }

    } catch (err: any) {
      console.error('[SUBSCRIBE] Purchase error:', err);
      
      if (err.message?.includes('cancel')) {
        setIsPurchasing(false);
        return;
      }
      
      setError(err.message || "Purchase failed. Please try again.");
      triggerHaptic('error');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setError("");
    triggerHaptic('light');
    setIsLoading(true);

    try {
      const { restorePurchases } = await import('@/services/applePurchase');
      
      const result = await restorePurchases();

      if (result.success && result.hasActiveSubscription) {
        triggerHaptic('success');
        
        toast({
          title: "Subscription restored!",
          description: "Welcome back to BJJ OS",
        });

        setLocation("/ios-chat");
      } else {
        toast({
          title: "No subscription found",
          description: "No active subscription to restore",
          variant: "destructive",
        });
      }

    } catch (err: any) {
      console.error('[SUBSCRIBE] Restore error:', err);
      setError(err.message || "Restore failed. Please try again.");
      triggerHaptic('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    triggerHaptic('light');
    toast({
      title: "Free trial started",
      description: "Enjoy limited access to BJJ OS",
    });
    setLocation("/ios-onboarding");
  };

  const features = [
    "Unlimited AI coaching with Professor OS",
    "3,000+ curated BJJ technique videos",
    "Personalized training recommendations",
    "Progress tracking & insights",
    "New videos added daily",
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col ios-safe-area">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] rounded-2xl flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Unlock BJJ OS</h1>
            <p className="text-gray-400">Your personal AI BJJ coach awaits</p>
          </div>

          <div className="bg-[#1A1A1B] rounded-2xl p-5 space-y-4 border border-[#2A2A2B]">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">Monthly</span>
              <div className="text-right">
                <span className="text-2xl font-bold text-white">$19.99</span>
                <span className="text-gray-400 text-sm">/month</span>
              </div>
            </div>

            <div className="space-y-3">
              {features.map((feature, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#8B5CF6]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-[#8B5CF6]" />
                  </div>
                  <span className="text-gray-300 text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center" data-testid="text-error">
              {error}
            </p>
          )}

          <Button
            onClick={handleSubscribe}
            disabled={isPurchasing || !storeReady}
            className="w-full h-14 bg-[#8B5CF6] text-white font-semibold hover:bg-[#7C3AED] rounded-xl text-lg"
            data-testid="button-subscribe"
          >
            {isPurchasing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : !storeReady ? (
              "Loading..."
            ) : (
              "Subscribe Now"
            )}
          </Button>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleRestore}
              disabled={isLoading}
              className="text-[#8B5CF6] text-sm font-medium hover:text-[#A78BFA] transition-colors py-2"
              data-testid="button-restore"
            >
              {isLoading ? "Restoring..." : "Restore Purchases"}
            </button>

            <button
              onClick={handleSkip}
              className="text-gray-500 text-sm hover:text-gray-400 transition-colors py-2"
              data-testid="button-skip"
            >
              Continue with limited access
            </button>
          </div>

          <p className="text-gray-500 text-xs text-center leading-relaxed">
            Subscription automatically renews monthly. Cancel anytime in Settings → Apple ID → Subscriptions.
          </p>
        </div>
      </div>
    </div>
  );
}
