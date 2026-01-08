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
let storeRef: any = null;

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
    storeRef = store;

    store.verbosity = LogLevel.DEBUG;

    store.register([{
      id: PRODUCT_ID,
      type: ProductType.PAID_SUBSCRIPTION,
      platform: Platform.APPLE_APPSTORE,
    }]);

    store.when()
      .productUpdated((product: any) => {
        if (product.id === PRODUCT_ID) {
          console.log('[IAP] Product updated:', product.id, product.canPurchase);
          currentProduct = product;
        }
      })
      .approved((transaction: any) => {
        console.log('[IAP] Transaction approved:', transaction.transactionId);
        
        const receipt = transaction.parentReceipt;
        const receiptData = receipt?.nativeData?.appStoreReceipt;
        
        if (purchaseCallback) {
          const callback = purchaseCallback;
          purchaseCallback = null;
          
          callback({
            success: true,
            receiptData: receiptData,
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
          const callback = purchaseCallback;
          purchaseCallback = null;
          callback({
            success: false,
            error: 'Receipt verification failed'
          });
        }
      });

    store.error((error: any) => {
      console.error('[IAP] Store error:', error);
      if (purchaseCallback) {
        const callback = purchaseCallback;
        purchaseCallback = null;
        callback({
          success: false,
          error: error.message || 'Purchase failed'
        });
      }
    });

    await store.initialize([Platform.APPLE_APPSTORE]);
    await store.update();
    
    currentProduct = store.get(PRODUCT_ID, Platform.APPLE_APPSTORE);
    isInitialized = true;
    
    console.log('[IAP] Initialized. Product:', currentProduct?.id, 'canPurchase:', currentProduct?.canPurchase);
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
      console.log('[IAP] Not initialized, initializing now...');
      await this.initialize();
    }

    // Try to refresh product if not available
    if (!currentProduct && storeRef) {
      console.log('[IAP] Product not available, trying to refresh...');
      try {
        await storeRef.update();
        const { Platform } = window.CdvPurchase;
        currentProduct = storeRef.get(PRODUCT_ID, Platform.APPLE_APPSTORE);
        console.log('[IAP] After refresh - Product:', currentProduct?.id, 'canPurchase:', currentProduct?.canPurchase);
      } catch (refreshError) {
        console.error('[IAP] Failed to refresh product:', refreshError);
      }
    }

    if (!currentProduct) {
      console.error('[IAP] Product still not available after refresh. PRODUCT_ID:', PRODUCT_ID);
      callback({ 
        success: false, 
        error: 'Product not available. Please check your internet connection and try again.' 
      });
      return;
    }

    purchaseCallback = callback;

    const offer = currentProduct.getOffer?.() || currentProduct.offers?.[0];
    if (!offer) {
      purchaseCallback = null;
      callback({ success: false, error: 'No offer available for this product' });
      return;
    }

    try {
      console.log('[IAP] Starting purchase for offer:', offer.id);
      await offer.order();
    } catch (error: any) {
      console.error('[IAP] Order error:', error);
      purchaseCallback = null;
      callback({ success: false, error: error.message || 'Failed to start purchase' });
    }
  },

  async restorePurchases(): Promise<{ success: boolean; restored: number; error?: string }> {
    if (!this.isIOS()) {
      return { success: false, restored: 0, error: 'Only available on iOS' };
    }

    if (!isInitialized) {
      await this.initialize();
    }

    if (!storeRef) {
      return { success: false, restored: 0, error: 'Store not available' };
    }

    const { Platform } = window.CdvPurchase;
    
    try {
      await storeRef.restorePurchases();
      
      const product = storeRef.get(PRODUCT_ID, Platform.APPLE_APPSTORE);
      const owned = product?.owned || false;
      
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
