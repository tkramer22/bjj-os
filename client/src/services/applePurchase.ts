import { Capacitor } from '@capacitor/core';

const PRODUCT_ID = 'bjjos_pro_monthly';

declare global {
  interface Window {
    CdvPurchase: any;
  }
}

export const ApplePurchaseService = {
  isIOS: () => {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  },

  async initialize() {
    if (!this.isIOS()) return;

    await new Promise<void>((resolve) => {
      document.addEventListener('deviceready', () => resolve(), false);
      if (window.CdvPurchase) resolve();
    });

    const { store, ProductType, Platform } = window.CdvPurchase;

    store.register({
      id: PRODUCT_ID,
      type: ProductType.PAID_SUBSCRIPTION,
      platform: Platform.APPLE_APPSTORE,
    });

    store.when()
      .productUpdated((product: any) => {
        console.log('Product updated:', product);
      })
      .approved((transaction: any) => {
        console.log('Purchase approved:', transaction);
        this.verifyPurchase(transaction);
      })
      .verified((receipt: any) => {
        console.log('Receipt verified:', receipt);
        receipt.finish();
      })
      .finished((transaction: any) => {
        console.log('Transaction finished:', transaction);
      });

    await store.initialize([Platform.APPLE_APPSTORE]);
    await store.update();
  },

  async getProduct() {
    if (!this.isIOS()) return null;
    
    const { store } = window.CdvPurchase;
    return store.get(PRODUCT_ID);
  },

  async purchase() {
    if (!this.isIOS()) {
      throw new Error('Apple purchase only available on iOS');
    }

    const { store } = window.CdvPurchase;
    const product = store.get(PRODUCT_ID);

    if (!product) {
      throw new Error('Product not found');
    }

    const offer = product.getOffer();
    if (!offer) {
      throw new Error('No offer available');
    }

    await offer.order();
  },

  async verifyPurchase(transaction: any) {
    try {
      const response = await fetch('/api/subscriptions/apple/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          receiptData: transaction.appStoreReceipt,
          transactionId: transaction.transactionId,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        transaction.finish();
        return { success: true };
      } else {
        throw new Error(result.error || 'Verification failed');
      }
    } catch (error) {
      console.error('Verification error:', error);
      throw error;
    }
  },

  async restorePurchases() {
    if (!this.isIOS()) return;
    
    const { store } = window.CdvPurchase;
    await store.restorePurchases();
  }
};
