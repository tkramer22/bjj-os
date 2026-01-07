import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { ApplePurchaseService } from '../services/applePurchase';

interface SubscriptionStatus {
  isPro: boolean;
  provider: 'stripe' | 'apple' | null;
  status: string;
  expiresAt?: string;
  subscriptionType?: string;
}

export const useSubscription = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<any>(null);

  const isIOS = ApplePurchaseService.isIOS();
  const isWeb = !Capacitor.isNativePlatform();

  const statusQuery = useQuery<SubscriptionStatus>({
    queryKey: ['/api/user/subscription-status'],
    staleTime: 1000 * 60 * 5,
    retry: 1
  });

  useEffect(() => {
    if (isIOS) {
      ApplePurchaseService.initialize().then(() => {
        ApplePurchaseService.getProduct().then(setProduct);
      });
    }
  }, [isIOS]);

  const verifyAppleMutation = useMutation({
    mutationFn: async (receiptData: string) => {
      const response = await apiRequest('POST', '/api/subscriptions/apple/verify', { receiptData });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/subscription-status'] });
    }
  });

  const subscribe = async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setError(null);

    try {
      if (isIOS) {
        await ApplePurchaseService.purchase();
        return { success: true };
      } else {
        window.location.href = '/api/stripe/create-checkout-session';
        return { success: true };
      }
    } catch (err: any) {
      setError(err.message || 'Purchase failed');
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  const restorePurchases = async () => {
    if (!isIOS) return;
    
    setIsLoading(true);
    try {
      await ApplePurchaseService.restorePurchases();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return { 
    subscribe, 
    restorePurchases,
    isIOS, 
    isWeb,
    isPro: statusQuery.data?.isPro ?? false,
    provider: statusQuery.data?.provider,
    status: statusQuery.data?.status,
    expiresAt: statusQuery.data?.expiresAt,
    subscriptionType: statusQuery.data?.subscriptionType,
    isLoading: isLoading || statusQuery.isLoading,
    error,
    product,
    price: product?.pricing?.price || '$19.99',
    verifyAppleReceipt: verifyAppleMutation.mutateAsync
  };
};
