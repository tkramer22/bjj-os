import { Capacitor } from '@capacitor/core';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface SubscriptionStatus {
  isPro: boolean;
  provider: 'stripe' | 'apple' | null;
  status: string;
  expiresAt?: string;
  subscriptionType?: string;
}

export const useSubscription = () => {
  const isIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  const isWeb = !Capacitor.isNativePlatform();

  const statusQuery = useQuery<SubscriptionStatus>({
    queryKey: ['/api/user/subscription-status'],
    staleTime: 1000 * 60 * 5,
    retry: 1
  });

  const verifyAppleMutation = useMutation({
    mutationFn: async (receiptData: string) => {
      const response = await apiRequest('POST', '/api/subscriptions/apple/verify', { receiptData });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/subscription-status'] });
    }
  });

  const handleApplePurchase = async (): Promise<{ success: boolean; error?: string }> => {
    console.log('Apple purchase flow - to be implemented with Capacitor IAP plugin');
    return { success: false, error: 'Apple IAP not yet implemented' };
  };

  const handleStripeCheckout = async (): Promise<{ success: boolean }> => {
    window.location.href = '/api/stripe/create-checkout-session';
    return { success: true };
  };

  const subscribe = async () => {
    if (isIOS) {
      return await handleApplePurchase();
    } else {
      return await handleStripeCheckout();
    }
  };

  return { 
    subscribe, 
    isIOS, 
    isWeb,
    isPro: statusQuery.data?.isPro ?? false,
    provider: statusQuery.data?.provider,
    status: statusQuery.data?.status,
    expiresAt: statusQuery.data?.expiresAt,
    subscriptionType: statusQuery.data?.subscriptionType,
    isLoading: statusQuery.isLoading,
    verifyAppleReceipt: verifyAppleMutation.mutateAsync
  };
};
