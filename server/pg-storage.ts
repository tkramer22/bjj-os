import { db } from "./db";
import { 
  recipients, 
  smsSchedules, 
  smsHistory,
  messageTemplates,
  userPreferences,
  videoAnalyses,
  recommendationHistory,
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
  appWaitlist,
  type AppWaitlist,
  type InsertAppWaitlist
} from "@shared/schema";
import { eq, desc, getTableColumns } from "drizzle-orm";
import type { IStorage } from "./storage";

export class PgStorage implements IStorage {
  // Recipients
  async getRecipients(): Promise<Recipient[]> {
    return await db.select(getTableColumns(recipients)).from(recipients);
  }

  async getRecipient(id: string): Promise<Recipient | undefined> {
    const result = await db.select(getTableColumns(recipients)).from(recipients).where(eq(recipients.id, id));
    return result[0];
  }

  async createRecipient(insertRecipient: InsertRecipient): Promise<Recipient> {
    const result = await db.insert(recipients).values(insertRecipient).returning();
    return result[0];
  }

  async updateRecipient(id: string, update: Partial<InsertRecipient>): Promise<Recipient | undefined> {
    const result = await db
      .update(recipients)
      .set(update)
      .where(eq(recipients.id, id))
      .returning();
    return result[0];
  }

  async deleteRecipient(id: string): Promise<boolean> {
    const result = await db.delete(recipients).where(eq(recipients.id, id)).returning();
    return result.length > 0;
  }

  // SMS Schedules
  async getSmsSchedules(): Promise<SmsSchedule[]> {
    return await db.select(getTableColumns(smsSchedules)).from(smsSchedules);
  }

  async getSmsSchedule(id: string): Promise<SmsSchedule | undefined> {
    const result = await db.select(getTableColumns(smsSchedules)).from(smsSchedules).where(eq(smsSchedules.id, id));
    return result[0];
  }

  async getActiveSmsSchedules(): Promise<SmsSchedule[]> {
    return await db.select(getTableColumns(smsSchedules)).from(smsSchedules).where(eq(smsSchedules.active, true));
  }

  async createSmsSchedule(insertSchedule: InsertSmsSchedule): Promise<SmsSchedule> {
    const result = await db.insert(smsSchedules).values(insertSchedule).returning();
    return result[0];
  }

  async updateSmsSchedule(id: string, update: Partial<InsertSmsSchedule>): Promise<SmsSchedule | undefined> {
    const result = await db
      .update(smsSchedules)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(smsSchedules.id, id))
      .returning();
    return result[0];
  }

  async deleteSmsSchedule(id: string): Promise<boolean> {
    const result = await db.delete(smsSchedules).where(eq(smsSchedules.id, id)).returning();
    return result.length > 0;
  }

  // SMS History
  async getSmsHistory(limit: number = 100): Promise<SmsHistory[]> {
    return await db
      .select()
      .from(smsHistory)
      .orderBy(desc(smsHistory.sentAt))
      .limit(limit);
  }

  async getSmsHistoryBySchedule(scheduleId: string): Promise<SmsHistory[]> {
    return await db
      .select()
      .from(smsHistory)
      .where(eq(smsHistory.scheduleId, scheduleId))
      .orderBy(desc(smsHistory.sentAt));
  }

  async createSmsHistory(insertHistory: InsertSmsHistory): Promise<SmsHistory> {
    const result = await db.insert(smsHistory).values(insertHistory).returning();
    return result[0];
  }

  async getSmsHistoryByTwilioSid(twilioSid: string): Promise<SmsHistory | undefined> {
    const result = await db
      .select()
      .from(smsHistory)
      .where(eq(smsHistory.twilioSid, twilioSid));
    return result[0];
  }

  async updateSmsHistoryStatus(
    twilioSid: string, 
    status: string, 
    deliveredAt?: Date,
    errorMessage?: string
  ): Promise<SmsHistory | undefined> {
    const updateData: any = { 
      status, 
      updatedAt: new Date() 
    };
    if (deliveredAt) updateData.deliveredAt = deliveredAt;
    if (errorMessage) updateData.errorMessage = errorMessage;

    const result = await db
      .update(smsHistory)
      .set(updateData)
      .where(eq(smsHistory.twilioSid, twilioSid))
      .returning();
    return result[0];
  }

  // Stats
  async getStats(): Promise<{
    totalSent: number;
    totalScheduled: number;
    successRate: number;
    totalFailed: number;
  }> {
    const history = await db.select(getTableColumns(smsHistory)).from(smsHistory);
    const schedules = await db.select(getTableColumns(smsSchedules)).from(smsSchedules).where(eq(smsSchedules.active, true));
    
    const totalSent = history.filter(h => h.status === 'sent' || h.status === 'delivered' || h.status === 'queued').length;
    const totalFailed = history.filter(h => h.status === 'failed' || h.status === 'undelivered').length;
    const total = totalSent + totalFailed;
    const successRate = total > 0 ? (totalSent / total) * 100 : 0;

    return {
      totalSent,
      totalScheduled: schedules.length,
      successRate,
      totalFailed
    };
  }

  // Message Templates
  async getMessageTemplates(): Promise<MessageTemplate[]> {
    return await db.select(getTableColumns(messageTemplates)).from(messageTemplates);
  }

  async getMessageTemplate(id: string): Promise<MessageTemplate | undefined> {
    const result = await db.select(getTableColumns(messageTemplates)).from(messageTemplates).where(eq(messageTemplates.id, id));
    return result[0];
  }

  async createMessageTemplate(insertTemplate: InsertMessageTemplate): Promise<MessageTemplate> {
    const result = await db.insert(messageTemplates).values(insertTemplate).returning();
    return result[0];
  }

  async updateMessageTemplate(id: string, update: Partial<InsertMessageTemplate>): Promise<MessageTemplate | undefined> {
    const result = await db
      .update(messageTemplates)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(messageTemplates.id, id))
      .returning();
    return result[0];
  }

  async deleteMessageTemplate(id: string): Promise<boolean> {
    const result = await db.delete(messageTemplates).where(eq(messageTemplates.id, id)).returning();
    return result.length > 0;
  }

  // User Preferences
  async getUserPreferences(recipientId: string): Promise<UserPreferences | undefined> {
    const result = await db.select(getTableColumns(userPreferences)).from(userPreferences).where(eq(userPreferences.recipientId, recipientId));
    return result[0];
  }

  async createUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences> {
    const result = await db.insert(userPreferences).values(preferences).returning();
    return result[0];
  }

  async updateUserPreferences(recipientId: string, preferences: Partial<InsertUserPreferences>): Promise<UserPreferences | undefined> {
    const result = await db
      .update(userPreferences)
      .set({ ...preferences, updatedAt: new Date() })
      .where(eq(userPreferences.recipientId, recipientId))
      .returning();
    return result[0];
  }

  // Video Analysis Cache
  async getVideoAnalysis(videoId: string): Promise<VideoAnalysis | undefined> {
    const result = await db.select(getTableColumns(videoAnalyses)).from(videoAnalyses).where(eq(videoAnalyses.videoId, videoId));
    return result[0];
  }

  async createVideoAnalysis(analysis: InsertVideoAnalysis): Promise<VideoAnalysis> {
    const result = await db.insert(videoAnalyses).values(analysis).returning();
    return result[0];
  }

  // Recommendation History
  async getRecommendationHistory(recipientId: string, limit: number = 100): Promise<RecommendationHistory[]> {
    return await db
      .select()
      .from(recommendationHistory)
      .where(eq(recommendationHistory.recipientId, recipientId))
      .orderBy(desc(recommendationHistory.recommendedAt))
      .limit(limit);
  }

  async createRecommendationHistory(history: InsertRecommendationHistory): Promise<RecommendationHistory> {
    const result = await db.insert(recommendationHistory).values(history).returning();
    return result[0];
  }

  // App Waitlist
  async createWaitlistEntry(entry: InsertAppWaitlist): Promise<AppWaitlist> {
    const result = await db.insert(appWaitlist).values(entry).returning();
    return result[0];
  }

  async getWaitlistEntries(): Promise<AppWaitlist[]> {
    return await db.select(getTableColumns(appWaitlist)).from(appWaitlist).orderBy(desc(appWaitlist.createdAt));
  }

  // Push Subscriptions (stub implementation to satisfy interface)
  async getPushSubscriptionsByUser(userId: string): Promise<any[]> {
    return [];
  }

  async createPushSubscription(subscription: any): Promise<any> {
    return subscription;
  }

  async deactivatePushSubscription(endpoint: string): Promise<boolean> {
    return true;
  }

  async getActivePushSubscriptions(userId?: string): Promise<any[]> {
    return [];
  }
}
