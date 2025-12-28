import { 
  type Recipient, 
  type InsertRecipient,
  type SmsSchedule,
  type InsertSmsSchedule,
  type SmsHistory,
  type InsertSmsHistory,
  type MessageTemplate,
  type InsertMessageTemplate,
  type UserPreferences,
  type InsertUserPreferences,
  type VideoAnalysis,
  type InsertVideoAnalysis,
  type RecommendationHistory,
  type InsertRecommendationHistory,
  type PushSubscription,
  type InsertPushSubscription,
  type AppWaitlist,
  type InsertAppWaitlist
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Recipients
  getRecipients(): Promise<Recipient[]>;
  getRecipient(id: string): Promise<Recipient | undefined>;
  createRecipient(recipient: InsertRecipient): Promise<Recipient>;
  updateRecipient(id: string, recipient: Partial<InsertRecipient>): Promise<Recipient | undefined>;
  deleteRecipient(id: string): Promise<boolean>;
  
  // SMS Schedules
  getSmsSchedules(): Promise<SmsSchedule[]>;
  getSmsSchedule(id: string): Promise<SmsSchedule | undefined>;
  getActiveSmsSchedules(): Promise<SmsSchedule[]>;
  createSmsSchedule(schedule: InsertSmsSchedule): Promise<SmsSchedule>;
  updateSmsSchedule(id: string, schedule: Partial<InsertSmsSchedule>): Promise<SmsSchedule | undefined>;
  deleteSmsSchedule(id: string): Promise<boolean>;
  
  // SMS History
  getSmsHistory(limit?: number): Promise<SmsHistory[]>;
  getSmsHistoryBySchedule(scheduleId: string): Promise<SmsHistory[]>;
  getSmsHistoryByTwilioSid(twilioSid: string): Promise<SmsHistory | undefined>;
  createSmsHistory(history: InsertSmsHistory): Promise<SmsHistory>;
  updateSmsHistoryStatus(twilioSid: string, status: string, deliveredAt?: Date, errorMessage?: string): Promise<SmsHistory | undefined>;
  
  // Stats
  getStats(): Promise<{
    totalSent: number;
    totalScheduled: number;
    successRate: number;
    totalFailed: number;
  }>;

  // Message Templates
  getMessageTemplates(): Promise<MessageTemplate[]>;
  getMessageTemplate(id: string): Promise<MessageTemplate | undefined>;
  createMessageTemplate(template: InsertMessageTemplate): Promise<MessageTemplate>;
  updateMessageTemplate(id: string, template: Partial<InsertMessageTemplate>): Promise<MessageTemplate | undefined>;
  deleteMessageTemplate(id: string): Promise<boolean>;

  // User Preferences
  getUserPreferences(recipientId: string): Promise<UserPreferences | undefined>;
  createUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences>;
  updateUserPreferences(recipientId: string, preferences: Partial<InsertUserPreferences>): Promise<UserPreferences | undefined>;

  // Video Analysis Cache
  getVideoAnalysis(videoId: string): Promise<VideoAnalysis | undefined>;
  createVideoAnalysis(analysis: InsertVideoAnalysis): Promise<VideoAnalysis>;

  // Recommendation History
  getRecommendationHistory(recipientId: string, limit?: number): Promise<RecommendationHistory[]>;
  createRecommendationHistory(history: InsertRecommendationHistory): Promise<RecommendationHistory>;

  // Push Subscriptions
  getPushSubscriptionsByUser(userId: string): Promise<PushSubscription[]>;
  createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription>;
  deactivatePushSubscription(endpoint: string): Promise<boolean>;
  getActivePushSubscriptions(userId?: string): Promise<PushSubscription[]>;

  // App Waitlist
  createWaitlistEntry(entry: InsertAppWaitlist): Promise<AppWaitlist>;
  getWaitlistEntries(): Promise<AppWaitlist[]>;
}

export class MemStorage implements IStorage {
  private recipients: Map<string, Recipient>;
  private smsSchedules: Map<string, SmsSchedule>;
  private smsHistory: Map<string, SmsHistory>;
  private messageTemplates: Map<string, MessageTemplate>;

  constructor() {
    this.recipients = new Map();
    this.smsSchedules = new Map();
    this.smsHistory = new Map();
    this.messageTemplates = new Map();
  }

  // Recipients
  async getRecipients(): Promise<Recipient[]> {
    return Array.from(this.recipients.values());
  }

  async getRecipient(id: string): Promise<Recipient | undefined> {
    return this.recipients.get(id);
  }

  async createRecipient(insertRecipient: InsertRecipient): Promise<Recipient> {
    const id = randomUUID();
    const recipient: Recipient = { 
      ...insertRecipient,
      group: insertRecipient.group || null,
      id,
      createdAt: new Date()
    };
    this.recipients.set(id, recipient);
    return recipient;
  }

  async updateRecipient(id: string, update: Partial<InsertRecipient>): Promise<Recipient | undefined> {
    const recipient = this.recipients.get(id);
    if (!recipient) return undefined;
    
    const updated = { ...recipient, ...update };
    this.recipients.set(id, updated);
    return updated;
  }

  async deleteRecipient(id: string): Promise<boolean> {
    return this.recipients.delete(id);
  }

  // SMS Schedules
  async getSmsSchedules(): Promise<SmsSchedule[]> {
    return Array.from(this.smsSchedules.values());
  }

  async getSmsSchedule(id: string): Promise<SmsSchedule | undefined> {
    return this.smsSchedules.get(id);
  }

  async getActiveSmsSchedules(): Promise<SmsSchedule[]> {
    return Array.from(this.smsSchedules.values()).filter(s => s.active);
  }

  async createSmsSchedule(insertSchedule: InsertSmsSchedule): Promise<SmsSchedule> {
    const id = randomUUID();
    const schedule: SmsSchedule = {
      ...insertSchedule,
      timezone: insertSchedule.timezone || "America/New_York",
      active: insertSchedule.active ?? true,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.smsSchedules.set(id, schedule);
    return schedule;
  }

  async updateSmsSchedule(id: string, update: Partial<InsertSmsSchedule>): Promise<SmsSchedule | undefined> {
    const schedule = this.smsSchedules.get(id);
    if (!schedule) return undefined;
    
    const updated = { 
      ...schedule, 
      ...update,
      updatedAt: new Date()
    };
    this.smsSchedules.set(id, updated);
    return updated;
  }

  async deleteSmsSchedule(id: string): Promise<boolean> {
    return this.smsSchedules.delete(id);
  }

  // SMS History
  async getSmsHistory(limit: number = 100): Promise<SmsHistory[]> {
    const history = Array.from(this.smsHistory.values());
    return history
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
      .slice(0, limit);
  }

  async getSmsHistoryBySchedule(scheduleId: string): Promise<SmsHistory[]> {
    return Array.from(this.smsHistory.values())
      .filter(h => h.scheduleId === scheduleId)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }

  async createSmsHistory(insertHistory: InsertSmsHistory): Promise<SmsHistory> {
    const id = randomUUID();
    const history: SmsHistory = {
      ...insertHistory,
      scheduleId: insertHistory.scheduleId ?? null,
      twilioSid: insertHistory.twilioSid || null,
      errorMessage: insertHistory.errorMessage || null,
      deliveredAt: insertHistory.deliveredAt || null,
      id,
      sentAt: new Date(),
      updatedAt: new Date()
    };
    this.smsHistory.set(id, history);
    return history;
  }

  async getSmsHistoryByTwilioSid(twilioSid: string): Promise<SmsHistory | undefined> {
    return Array.from(this.smsHistory.values()).find(h => h.twilioSid === twilioSid);
  }

  async updateSmsHistoryStatus(
    twilioSid: string, 
    status: string, 
    deliveredAt?: Date,
    errorMessage?: string
  ): Promise<SmsHistory | undefined> {
    const history = await this.getSmsHistoryByTwilioSid(twilioSid);
    if (!history) return undefined;

    const updated: SmsHistory = {
      ...history,
      status,
      deliveredAt: deliveredAt || history.deliveredAt,
      errorMessage: errorMessage || history.errorMessage,
      updatedAt: new Date()
    };
    this.smsHistory.set(history.id, updated);
    return updated;
  }

  // Stats
  async getStats(): Promise<{
    totalSent: number;
    totalScheduled: number;
    successRate: number;
    totalFailed: number;
  }> {
    const history = Array.from(this.smsHistory.values());
    const totalSent = history.filter(h => h.status === 'sent').length;
    const totalFailed = history.filter(h => h.status === 'failed').length;
    const total = totalSent + totalFailed;
    const successRate = total > 0 ? (totalSent / total) * 100 : 0;
    const totalScheduled = Array.from(this.smsSchedules.values()).filter(s => s.active).length;

    return {
      totalSent,
      totalScheduled,
      successRate,
      totalFailed
    };
  }

  // Message Templates
  async getMessageTemplates(): Promise<MessageTemplate[]> {
    return Array.from(this.messageTemplates.values());
  }

  async getMessageTemplate(id: string): Promise<MessageTemplate | undefined> {
    return this.messageTemplates.get(id);
  }

  async createMessageTemplate(insertTemplate: InsertMessageTemplate): Promise<MessageTemplate> {
    const id = randomUUID();
    const template: MessageTemplate = {
      ...insertTemplate,
      description: insertTemplate.description || null,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.messageTemplates.set(id, template);
    return template;
  }

  async updateMessageTemplate(id: string, update: Partial<InsertMessageTemplate>): Promise<MessageTemplate | undefined> {
    const template = this.messageTemplates.get(id);
    if (!template) return undefined;

    const updated: MessageTemplate = {
      ...template,
      ...update,
      updatedAt: new Date()
    };
    this.messageTemplates.set(id, updated);
    return updated;
  }

  async deleteMessageTemplate(id: string): Promise<boolean> {
    return this.messageTemplates.delete(id);
  }

  // User Preferences (not implemented in MemStorage - use PgStorage)
  async getUserPreferences(_recipientId: string): Promise<UserPreferences | undefined> {
    throw new Error("Not implemented in MemStorage - use PgStorage");
  }

  async createUserPreferences(_preferences: InsertUserPreferences): Promise<UserPreferences> {
    throw new Error("Not implemented in MemStorage - use PgStorage");
  }

  async updateUserPreferences(_recipientId: string, _preferences: Partial<InsertUserPreferences>): Promise<UserPreferences | undefined> {
    throw new Error("Not implemented in MemStorage - use PgStorage");
  }

  // Video Analysis Cache (not implemented in MemStorage - use PgStorage)
  async getVideoAnalysis(_videoId: string): Promise<VideoAnalysis | undefined> {
    throw new Error("Not implemented in MemStorage - use PgStorage");
  }

  async createVideoAnalysis(_analysis: InsertVideoAnalysis): Promise<VideoAnalysis> {
    throw new Error("Not implemented in MemStorage - use PgStorage");
  }

  // Recommendation History (not implemented in MemStorage - use PgStorage)
  async getRecommendationHistory(_recipientId: string, _limit?: number): Promise<RecommendationHistory[]> {
    throw new Error("Not implemented in MemStorage - use PgStorage");
  }

  async createRecommendationHistory(_history: InsertRecommendationHistory): Promise<RecommendationHistory> {
    throw new Error("Not implemented in MemStorage - use PgStorage");
  }
}

import { PgStorage } from "./pg-storage";

export const storage = new PgStorage();
