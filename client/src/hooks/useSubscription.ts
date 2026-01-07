import { useState, useEffect, useCallback } from 'react';
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
  const [price, setPrice] = useState('$19.99');
  const [isReady, setIsReady] = useState(false);

  const isIOS = ApplePurchaseService.isIOS();
  const isWeb = !Capacitor.isNativePlatform();

  const statusQuery = useQuery<SubscriptionStatus>({
    queryKey: ['/api/user/subscription-status'],
    staleTime: 1000 * 60 * 5,
    retry: 1
  });

  const verifyAppleMutation = useMutation({
    mutationFn: async (data: { receiptData: string; transactionId?: string }) => {
      const response = await apiRequest('POST', '/api/subscriptions/apple/verify', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/subscription-status'] });
    }
  });

  useEffect(() => {
    if (isIOS) {
      ApplePurchaseService.initialize().then(() => {
        const productPrice = ApplePurchaseService.getPrice();
        setPrice(productPrice);
        setIsReady(ApplePurchaseService.isReady());
      });
    } else {
      setIsReady(true);
    }
  }, [isIOS]);

  const subscribe = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setError(null);

    try {
      if (isIOS) {
        return new Promise((resolve) => {
          ApplePurchaseService.purchase(async (result) => {
            if (result.success && result.receiptData) {
              try {
                await verifyAppleMutation.mutateAsync({
                  receiptData: result.receiptData,
                  transactionId: result.transactionId
                });
                setIsLoading(false);
                resolve({ success: true });
              } catch (verifyError: any) {
                setIsLoading(false);
                setError(verifyError.message || 'Verification failed');
                resolve({ success: false, error: verifyError.message });
              }
            } else {
              setIsLoading(false);
              setError(result.error || 'Purchase failed');
              resolve({ success: false, error: result.error });
            }
          });
        });
      } else {
        window.location.href = '/api/stripe/create-checkout-session';
        return { success: true };
      }
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || 'Purchase failed');
      return { success: false, error: err.message };
    }
  }, [isIOS, verifyAppleMutation]);

  const restorePurchases = useCallback(async (): Promise<{ success: boolean; restored: number; error?: string }> => {
    if (!isIOS) {
      return { success: false, restored: 0, error: 'Only available on iOS' };
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await ApplePurchaseService.restorePurchases();
      
      if (result.success && result.restored > 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/user/subscription-status'] });
      }
      
      setIsLoading(false);
      return result;
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message);
      return { success: false, restored: 0, error: err.message };
    }
  }, [isIOS]);

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
    isLoading: isLoading || statusQuery.isLoading || verifyAppleMutation.isPending,
    error,
    price,
    isReady
  };
};
