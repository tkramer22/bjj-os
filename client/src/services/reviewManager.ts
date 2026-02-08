import { Capacitor } from '@capacitor/core';
import { InAppReview } from '@capacitor-community/in-app-review';

const STORAGE_KEYS = {
  VIDEOS_SAVED: 'review_videos_saved',
  CHAT_MESSAGES: 'review_chat_messages',
  DAYS_ACTIVE: 'review_days_active',
  LAST_ACTIVE_DATE: 'review_last_active_date',
  LAST_PROMPT_DATE: 'review_last_prompt_date',
  HAS_PROMPTED: 'review_has_prompted',
};

const TRIGGERS = {
  VIDEOS_SAVED: 5,
  CHAT_MESSAGES: 10,
  DAYS_ACTIVE: 7,
  MIN_DAYS_BETWEEN_PROMPTS: 180,
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

  private daysSinceLastPrompt(): number {
    const lastPromptDate = localStorage.getItem(STORAGE_KEYS.LAST_PROMPT_DATE);
    if (!lastPromptDate) return Infinity;
    
    const last = new Date(lastPromptDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - last.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  private canPrompt(): boolean {
    if (!this.isNativeIOS) {
      console.log('[ReviewManager] Not on native iOS, skipping review prompt');
      return false;
    }

    const daysSince = this.daysSinceLastPrompt();
    if (daysSince < TRIGGERS.MIN_DAYS_BETWEEN_PROMPTS) {
      console.log(`[ReviewManager] Only ${daysSince} days since last prompt, need ${TRIGGERS.MIN_DAYS_BETWEEN_PROMPTS}`);
      return false;
    }

    return true;
  }

  async requestReview(): Promise<boolean> {
    if (!this.canPrompt()) {
      return false;
    }

    try {
      console.log('[ReviewManager] Requesting native app store review via SKStoreReviewController...');
      
      await InAppReview.requestReview();
      console.log('[ReviewManager] Review prompt shown successfully');
      
      this.setStorageValue(STORAGE_KEYS.LAST_PROMPT_DATE, new Date().toISOString());
      this.setStorageValue(STORAGE_KEYS.HAS_PROMPTED, 1);
      
      return true;
    } catch (error) {
      console.error('[ReviewManager] Failed to request review:', error);
      return false;
    }
  }

  async trackVideoSaved(): Promise<void> {
    const count = this.getStorageValue(STORAGE_KEYS.VIDEOS_SAVED) + 1;
    this.setStorageValue(STORAGE_KEYS.VIDEOS_SAVED, count);
    
    console.log(`[ReviewManager] Videos saved: ${count}/${TRIGGERS.VIDEOS_SAVED}`);
    
    if (count === TRIGGERS.VIDEOS_SAVED) {
      console.log('[ReviewManager] Trigger: 5 videos saved!');
      await this.requestReview();
    }
  }

  async trackChatMessage(): Promise<void> {
    const count = this.getStorageValue(STORAGE_KEYS.CHAT_MESSAGES) + 1;
    this.setStorageValue(STORAGE_KEYS.CHAT_MESSAGES, count);
    
    console.log(`[ReviewManager] Chat messages: ${count}/${TRIGGERS.CHAT_MESSAGES}`);
    
    if (count === TRIGGERS.CHAT_MESSAGES) {
      console.log('[ReviewManager] Trigger: 10 meaningful chat exchanges!');
      await this.requestReview();
    }
  }

  async trackDayActive(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const lastActiveDate = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_DATE);
    
    if (lastActiveDate === today) {
      return;
    }
    
    this.setStorageValue(STORAGE_KEYS.LAST_ACTIVE_DATE, today);
    
    const count = this.getStorageValue(STORAGE_KEYS.DAYS_ACTIVE) + 1;
    this.setStorageValue(STORAGE_KEYS.DAYS_ACTIVE, count);
    
    console.log(`[ReviewManager] Days active: ${count}/${TRIGGERS.DAYS_ACTIVE}`);
    
    if (count === TRIGGERS.DAYS_ACTIVE) {
      console.log('[ReviewManager] Trigger: 7 days active!');
      await this.requestReview();
    }
  }

  getStats(): { videosSaved: number; chatMessages: number; daysActive: number; lastPromptDate: string | null } {
    return {
      videosSaved: this.getStorageValue(STORAGE_KEYS.VIDEOS_SAVED),
      chatMessages: this.getStorageValue(STORAGE_KEYS.CHAT_MESSAGES),
      daysActive: this.getStorageValue(STORAGE_KEYS.DAYS_ACTIVE),
      lastPromptDate: localStorage.getItem(STORAGE_KEYS.LAST_PROMPT_DATE),
    };
  }

  resetStats(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    console.log('[ReviewManager] Stats reset');
  }
}

export const reviewManager = new ReviewManager();
