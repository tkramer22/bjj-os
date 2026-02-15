import { Capacitor } from '@capacitor/core';
import { InAppReview } from '@capacitor-community/in-app-review';

const STORAGE_KEYS = {
  MESSAGE_COUNT: 'chat_message_count',
  APP_OPEN_COUNT: 'app_open_count',
  LAST_REVIEW_PROMPT: 'last_review_prompt',
};

class ReviewManager {
  private isNativeIOS: boolean;

  constructor() {
    this.isNativeIOS = Capacitor.getPlatform() === 'ios' && Capacitor.isNativePlatform();
  }

  private getStorageValue(key: string, defaultValue: number = 0): number {
    try {
      const value = localStorage.getItem(key);
      return value ? parseInt(value, 10) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private setStorageValue(key: string, value: number | string): void {
    try {
      localStorage.setItem(key, value.toString());
    } catch (e) {
      console.warn('[ReviewManager] Failed to save to localStorage:', e);
    }
  }

  trackAppOpen(): void {
    const count = this.getStorageValue(STORAGE_KEYS.APP_OPEN_COUNT) + 1;
    this.setStorageValue(STORAGE_KEYS.APP_OPEN_COUNT, count);
    console.log(`[ReviewManager] App opens: ${count}`);
  }

  trackMessageSent(): void {
    const count = this.getStorageValue(STORAGE_KEYS.MESSAGE_COUNT) + 1;
    this.setStorageValue(STORAGE_KEYS.MESSAGE_COUNT, count);
    console.log(`[ReviewManager] Messages sent: ${count}`);
  }

  async maybeRequestReview(): Promise<boolean> {
    if (!this.isNativeIOS) return false;

    const messageCount = this.getStorageValue(STORAGE_KEYS.MESSAGE_COUNT);
    const appOpenCount = this.getStorageValue(STORAGE_KEYS.APP_OPEN_COUNT);
    const lastPrompt = this.getStorageValue(STORAGE_KEYS.LAST_REVIEW_PROMPT);
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    console.log(`[ReviewManager] Check: messages=${messageCount}/3, appOpens=${appOpenCount}/2, lastPrompt=${lastPrompt ? new Date(lastPrompt).toISOString() : 'never'}`);

    if (messageCount < 3 || appOpenCount < 2 || lastPrompt > thirtyDaysAgo) {
      return false;
    }

    try {
      console.log('[ReviewManager] Requesting native app store review...');
      await InAppReview.requestReview();
      this.setStorageValue(STORAGE_KEYS.LAST_REVIEW_PROMPT, Date.now());
      console.log('[ReviewManager] Review prompt shown successfully');
      return true;
    } catch (error) {
      console.error('[ReviewManager] Failed to request review:', error);
      return false;
    }
  }

  getStats(): { messageCount: number; appOpenCount: number; lastPrompt: number } {
    return {
      messageCount: this.getStorageValue(STORAGE_KEYS.MESSAGE_COUNT),
      appOpenCount: this.getStorageValue(STORAGE_KEYS.APP_OPEN_COUNT),
      lastPrompt: this.getStorageValue(STORAGE_KEYS.LAST_REVIEW_PROMPT),
    };
  }
}

export const reviewManager = new ReviewManager();
