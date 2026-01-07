import { Capacitor } from '@capacitor/core';

const PRODUCT_ID = 'bjjos_pro_monthly';

declare global {
  interface Window {
    CdvPurchase: any;
  }
}

type PurchaseCallback = (result: { success: boolean; receiptData?: string; transactionId?: string; error?: string }) => void;

let purchaseCallback: PurchaseCallback | null = null;
let isInitialized = false;
let currentProduct: any = null;

export const ApplePurchaseService = {
  isIOS: () => {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  },

  async initialize() {
    if (!this.isIOS() || isInitialized) return;

    await new Promise<void>((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        document.addEventListener('deviceready', () => resolve(), false);
      }
    });

    if (!window.CdvPurchase) {
      console.error('CdvPurchase not available');
      return;
    }

    const { store, ProductType, Platform, LogLevel } = window.CdvPurchase;

    store.verbosity = LogLevel.DEBUG;

    store.register([{
      id: PRODUCT_ID,
      type: ProductType.PAID_SUBSCRIPTION,
      platform: Platform.APPLE_APPSTORE,
    }]);

    store.when()
      .approved((transaction: any) => {
        console.log('[IAP] Purchase approved:', transaction.transactionId);
        
        if (purchaseCallback) {
          const receipt = store.localReceipts.find((r: any) => 
            r.transactions.some((t: any) => t.transactionId === transaction.transactionId)
          );
          
          purchaseCallback({
            success: true,
            receiptData: receipt?.nativeData?.appStoreReceipt || transaction.nativeData?.appStoreReceipt,
            transactionId: transaction.transactionId
          });
        }
        
        transaction.verify();
      })
      .verified((receipt: any) => {
        console.log('[IAP] Receipt verified locally');
        receipt.finish();
      })
      .finished((transaction: any) => {
        console.log('[IAP] Transaction finished:', transaction.transactionId);
      })
      .unverified((receipt: any) => {
        console.error('[IAP] Receipt verification failed:', receipt.reason);
        if (purchaseCallback) {
          purchaseCallback({
            success: false,
            error: 'Receipt verification failed'
          });
        }
      });

    store.error((error: any) => {
      console.error('[IAP] Store error:', error);
      if (purchaseCallback) {
        purchaseCallback({
          success: false,
          error: error.message || 'Purchase failed'
        });
      }
    });

    await store.initialize([Platform.APPLE_APPSTORE]);
    await store.update();
    
    currentProduct = store.get(PRODUCT_ID, Platform.APPLE_APPSTORE);
    isInitialized = true;
    
    console.log('[IAP] Initialized. Product:', currentProduct);
  },

  getProduct() {
    return currentProduct;
  },

  getPrice(): string {
    if (currentProduct?.pricing?.price) {
      return currentProduct.pricing.price;
    }
    return '$19.99';
  },

  isReady(): boolean {
    return isInitialized && currentProduct !== null;
  },

  async purchase(callback: PurchaseCallback) {
    if (!this.isIOS()) {
      callback({ success: false, error: 'Apple purchase only available on iOS' });
      return;
    }

    if (!isInitialized) {
      await this.initialize();
    }

    if (!currentProduct) {
      callback({ success: false, error: 'Product not available' });
      return;
    }

    purchaseCallback = callback;

    const offer = currentProduct.getOffer?.() || currentProduct.offers?.[0];
    if (!offer) {
      callback({ success: false, error: 'No offer available for this product' });
      return;
    }

    try {
      await offer.order();
    } catch (error: any) {
      console.error('[IAP] Order error:', error);
      callback({ success: false, error: error.message || 'Failed to start purchase' });
    }
  },

  async restorePurchases(): Promise<{ success: boolean; restored: number; error?: string }> {
    if (!this.isIOS()) {
      return { success: false, restored: 0, error: 'Only available on iOS' };
    }

    if (!window.CdvPurchase) {
      return { success: false, restored: 0, error: 'Store not available' };
    }

    const { store, Platform } = window.CdvPurchase;
    
    try {
      await store.restorePurchases();
      
      const owned = store.owned(PRODUCT_ID, Platform.APPLE_APPSTORE);
      
      return { 
        success: true, 
        restored: owned ? 1 : 0 
      };
    } catch (error: any) {
      return { 
        success: false, 
        restored: 0, 
        error: error.message || 'Failed to restore purchases' 
      };
    }
  }
};
