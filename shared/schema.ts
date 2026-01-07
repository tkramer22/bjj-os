import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, numeric, serial, jsonb, date, doublePrecision, index, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Recipients table
export const recipients = pgTable("recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  group: text("group"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRecipientSchema = createInsertSchema(recipients).omit({
  id: true,
  createdAt: true,
}).extend({
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"),
});

export type InsertRecipient = z.infer<typeof insertRecipientSchema>;
export type Recipient = typeof recipients.$inferSelect;

// SMS Schedules table
export const smsSchedules = pgTable("sms_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  message: text("message").notNull(),
  scheduleTime: text("schedule_time").notNull(), // e.g., "09:00" for 9 AM daily
  timezone: text("timezone").notNull().default("America/New_York"),
  active: boolean("active").notNull().default(true),
  recipientIds: text("recipient_ids").array().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSmsScheduleSchema = createInsertSchema(smsSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  message: z.string().min(1, "Message is required").max(1600, "Message too long"),
  scheduleTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"),
  recipientIds: z.array(z.string()).min(1, "At least one recipient required"),
});

export type InsertSmsSchedule = z.infer<typeof insertSmsScheduleSchema>;
export type SmsSchedule = typeof smsSchedules.$inferSelect;

// SMS History table
export const smsHistory = pgTable("sms_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: varchar("schedule_id"), // Nullable - test messages don't have a schedule
  recipientId: varchar("recipient_id").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull(), // 'queued', 'sent', 'delivered', 'failed', 'undelivered'
  twilioSid: text("twilio_sid"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSmsHistorySchema = createInsertSchema(smsHistory).omit({
  id: true,
  sentAt: true,
  updatedAt: true,
});

export type InsertSmsHistory = z.infer<typeof insertSmsHistorySchema>;
export type SmsHistory = typeof smsHistory.$inferSelect;

// Message Templates table
export const messageTemplates = pgTable("message_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMessageTemplateSchema = createInsertSchema(messageTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Template name is required").max(100, "Name too long"),
  content: z.string().min(1, "Template content is required").max(1600, "Content too long"),
  description: z.string().max(500, "Description too long").optional(),
});

export type InsertMessageTemplate = z.infer<typeof insertMessageTemplateSchema>;
export type MessageTemplate = typeof messageTemplates.$inferSelect;

// User Preferences table for personalization (legacy - linked to recipients)
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientId: varchar("recipient_id").notNull().unique(), // Link to recipient
  beltLevel: text("belt_level"), // white, blue, purple, brown, black
  preferredStyle: text("preferred_style"), // gi, nogi, both
  trainingGoals: text("training_goals").array(), // competition, self-defense, fitness, etc.
  favoriteInstructors: text("favorite_instructors").array(),
  contentPreference: text("content_preference"), // FUNDAMENTALS, MIXED, ADVANCED
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;

// BJJ Users table - main user/subscriber table for automated SMS service
export const bjjUsers = pgTable("bjj_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Email-Based Authentication (PRIMARY)
  email: text("email").unique(), // Primary identifier for login
  emailVerified: boolean("email_verified").default(false), // Email verification status
  lastLogin: timestamp("last_login"), // Track last login time
  
  // Phone-Based Authentication (LEGACY - kept for backward compatibility)
  phoneNumber: text("phone_number").unique(), // Legacy phone identifier
  passwordHash: text("password_hash"), // Optional password hash (not used with email verification)
  
  // Progress Tracking (NEW - Excellence Edition)
  totalLogins: integer("total_logins").default(0), // Total number of logins
  currentStreak: integer("current_streak").default(0), // Consecutive days logged in
  lastLoginDate: date("last_login_date"), // Date of last login (for streak calculation)
  
  // SMS Verification Tracking
  verificationAttempts: integer("verification_attempts").default(0), // Track failed verification attempts
  lastVerificationAttempt: timestamp("last_verification_attempt"), // Last verification attempt timestamp
  blockedUntil: timestamp("blocked_until"), // Block user if too many failed attempts
  
  // User Identity
  username: text("username").unique(), // lowercase, alphanumeric + underscores, 3-20 chars (optional at signup)
  displayName: text("display_name"), // Original input like "John Smith"
  name: text("name"), // Legacy field (kept for backward compatibility)
  avatarUrl: text("avatar_url"), // Profile picture URL
  adminNotes: text("admin_notes"), // Admin notes about this user
  beltLevel: text("belt_level"), // white, blue, purple, brown, black
  style: text("style").default("both"), // gi, nogi, both
  contentPreference: text("content_preference"), // FUNDAMENTALS, MIXED, ADVANCED
  focusAreas: text("focus_areas").array(), // guard, submissions, escapes, etc.
  injuries: text("injuries").array(), // Injury tracking for smart recommendations
  competeStatus: text("compete_status"), // active_competitor, hobbyist, preparing_for_comp
  trainingGoals: text("training_goals").array(), // competition, self-defense, fitness, etc.
  
  paused: boolean("paused").default(false),
  timezone: text("timezone").default("America/New_York"),
  sendTime: text("send_time").default("09:00"),
  competitionMode: boolean("competition_mode").default(false),
  compDate: timestamp("comp_date"),
  progressionLevel: text("progression_level").default("beginner"),
  lastTechniqueSent: text("last_technique_sent"),
  weeklyRecapEnabled: boolean("weekly_recap_enabled").default(true),
  
  subscriptionType: text("subscription_type").notNull().default("free_trial"), // free_trial, free_admin_grant, monthly, annual, lifetime
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").default("active"), // active, cancelled, past_due, etc.
  trialEndDate: timestamp("trial_end_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  
  // Apple In-App Purchase (iOS app subscriptions)
  paymentProvider: text("payment_provider").default("stripe"), // 'stripe' or 'apple'
  appleOriginalTransactionId: text("apple_original_transaction_id"), // Apple's unique transaction ID
  appleProductId: text("apple_product_id"), // e.g., 'bjjos_pro_monthly'
  appleReceipt: text("apple_receipt"), // Base64 encoded receipt for verification
  appleExpiresAt: timestamp("apple_expires_at"), // When Apple subscription expires
  appleEnvironment: text("apple_environment"), // 'sandbox' or 'production'
  
  // Activity tracking
  lastActiveAt: timestamp("last_active_at"), // Last time user sent a message to Professor OS
  
  onboardingStep: text("onboarding_step").default("belt"), // belt, content_preference, style, focus, referral, complete
  onboardingCompleted: boolean("onboarding_completed").default(false),
  
  referralCode: text("referral_code").unique(), // User's personal referral code (auto-generated)
  referredBy: text("referred_by"), // Referral code that referred this user
  invitedBy: integer("invited_by"), // Lifetime invitation ID that created this user
  
  // Enhanced Referral Tracking (NEW - Complete Referral System)
  referralCodeUsed: text("referral_code_used"), // The actual code they used at signup
  referredByInfluencer: text("referred_by_influencer"), // Influencer name who referred them
  referralSignupDate: timestamp("referral_signup_date"), // When they signed up with referral
  discountTypeReceived: text("discount_type_received"), // none, percentage, fixed, trial_extension, free_month, free_months
  discountValueReceived: numeric("discount_value_received", { precision: 10, scale: 2 }), // The discount value applied
  discountAmountSaved: numeric("discount_amount_saved", { precision: 10, scale: 2 }), // Actual dollar value saved
  stripeCouponApplied: text("stripe_coupon_applied"), // Stripe coupon ID that was applied
  
  // Smart Ranking Profile Data
  bodyType: text("body_type"), // 'stocky', 'average', 'tall', 'athletic'
  ageRange: text("age_range"), // '18-25', '26-35', '36-45', '46-55', '56+'
  trainingStylePreference: text("training_style_preference"), // 'technical', 'athletic', 'pressure', 'dynamic'
  learningStyle: text("learning_style"), // 'visual', 'detailed', 'conceptual', 'step-by-step'
  preferredInstructors: text("preferred_instructors").array(), // Array of instructor names
  preferredVideoLengthMin: integer("preferred_video_length_min").default(5),
  preferredVideoLengthMax: integer("preferred_video_length_max").default(20),
  
  // NEW: Enhanced Onboarding Data (Ultimate Personalization System)
  trainingFrequency: integer("training_frequency"), // Days per week: 1-2, 3-4, 5-6, 7+ (legacy integer)
  trainingFrequencyText: text("training_frequency_text"), // Button-based selection: "1-2x", "3-4x", "5+x" per week
  struggles: text("struggles").array(), // Array of struggle areas
  strengths: text("strengths").array(), // Array of strength areas (optional)
  trainingContext: text("training_context"), // gi, nogi, both, mma
  weakestArea: text("weakest_area"), // Single weakest area (REQUIRED in onboarding): escapes, passing, retention, submissions, takedowns, cardio, all, none
  struggleTechnique: text("struggle_technique"), // Open-text response: "What technique do you struggle with most?" (e.g., "triangle choke", "guard passing")
  struggleAreaCategory: text("struggle_area_category"), // Button-based category: guard_passing, guard_retention, takedowns, submissions, escapes, transitions, other
  yearsTraining: integer("years_training"), // Years of BJJ training (legacy integer)
  yearsTrainingRange: text("years_training_range"), // Button-based selection: "<6mo", "6mo-1yr", "1-2yr", "2-5yr", "5-10yr", "10+yr"
  goals: text("goals"), // Training goals as free text (optional, can override trainingGoals array)
  
  // Settings Page Profile Fields
  age: text("age"), // User's age (optional)
  height: text("height"), // User's height (optional)
  weight: text("weight"), // User's weight (optional)
  gym: text("gym"), // User's gym/academy name (optional)
  
  // NEW: Derived Personalization Metrics (calculated after onboarding)
  struggleDensity: doublePrecision("struggle_density"), // 0-1 score
  injuryRisk: text("injury_risk"), // VERY_HIGH, HIGH, MODERATE_HIGH, MODERATE, LOW
  experienceScore: integer("experience_score"), // 0-100
  learningVelocity: text("learning_velocity"), // FAST, FAST_ADVANCED, MEDIUM, SLOW_EXPERIENCED, SLOW_BEGINNER
  bodyTypeInferred: text("body_type_inferred"), // SMALLER, LARGER, AVERAGE_OR_UNKNOWN (from struggles)
  userState: text("user_state"), // OVERWHELMED, DEVELOPING, FOCUSED, CONFIDENT
  clusterAssignment: text("cluster_assignment"), // SURVIVAL_BEGINNER, COMPETITOR, TECHNICAL_STUDENT, etc.
  clusterConfidence: doublePrecision("cluster_confidence"), // 0-1 confidence score
  
  // Language Support
  preferredLanguage: text("preferred_language").default("en"), // en, pt, es
  languagePreferenceSet: boolean("language_preference_set").default(false),
  
  // Unit Preference (for international users - Brazil, Europe, etc.)
  unitPreference: text("unit_preference").default("imperial"), // imperial, metric
  
  // Voice Settings (ElevenLabs TTS)
  voiceEnabled: boolean("voice_enabled").default(false), // Toggle voice output ON/OFF
  voiceId: text("voice_id").default("ErXwobaYiN019PkySvjV"), // Antoni (friendly), Adam: pNInz6obpgDQGcFmaJgB
  voiceSpeed: doublePrecision("voice_speed").default(1.0), // 0.75x, 1.0x, 1.25x, 1.5x
  voiceAutoplay: boolean("voice_autoplay").default(true), // Auto-play voice responses
  
  // Theme Settings (IBJJF Belt Selector)
  themeBelt: text("theme_belt").default("blue"), // white, blue, purple, brown, black
  themeStripes: integer("theme_stripes").default(0), // 0-4 stripes on belt
  
  // Lifetime User Access (bypasses SMS verification with LIFETIME code)
  isLifetimeUser: boolean("is_lifetime_user").default(false), // Allows LIFETIME bypass in production
  
  // Admin Access
  isAdmin: boolean("is_admin").default(false), // Admin user flag
  maxDevices: integer("max_devices").default(2), // Max concurrent devices allowed
  
  // Video Tracking (Intelligent Recommendation System)
  videosWatchedCount: integer("videos_watched_count").default(0), // Total unique videos watched
  recommendationTier: text("recommendation_tier").default("new_user"), // new_user, established_user, power_user
  videosRecommendedCount: integer("videos_recommended_count").default(0), // Total recommendations given
  lastVideoWatchedAt: timestamp("last_video_watched_at"), // Last time user watched a video
  
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("bjj_users_email_idx").on(table.email),
  phoneIdx: index("bjj_users_phone_idx").on(table.phoneNumber),
}));

export const insertBjjUserSchema = createInsertSchema(bjjUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Username validation (optional at signup, required later in onboarding)
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be 20 characters or less")
    .regex(/^[a-z0-9_]+$/, "Username must be lowercase alphanumeric with underscores only")
    .refine(val => !val.includes(' '), "Username cannot contain spaces")
    .optional(),
  displayName: z.string().optional(),
  email: z.string().email("Invalid email address").optional(),
});

export type InsertBjjUser = z.infer<typeof insertBjjUserSchema>;
export type BjjUser = typeof bjjUsers.$inferSelect;

// Email Verification Codes - For email-based authentication
export const emailVerificationCodes = pgTable("email_verification_codes", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  used: boolean("used").default(false),
  attempts: integer("attempts").default(0).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
}, (table) => ({
  emailCodeIdx: index("email_verification_email_code_idx").on(table.email, table.code),
  expiresIdx: index("email_verification_expires_idx").on(table.expiresAt),
}));

export const insertEmailVerificationCodeSchema = createInsertSchema(emailVerificationCodes).omit({
  id: true,
  createdAt: true,
});

export type InsertEmailVerificationCode = z.infer<typeof insertEmailVerificationCodeSchema>;
export type EmailVerificationCode = typeof emailVerificationCodes.$inferSelect;

// Password Reset Codes - For forgot password flow
export const passwordResetCodes = pgTable("password_reset_codes", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  resetToken: varchar("reset_token", { length: 255 }), // Generated after code verification
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  used: boolean("used").default(false),
  attempts: integer("attempts").default(0).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
}, (table) => ({
  emailCodeIdx: index("password_reset_email_code_idx").on(table.email, table.code),
  resetTokenIdx: index("password_reset_token_idx").on(table.resetToken),
  expiresIdx: index("password_reset_expires_idx").on(table.expiresAt),
}));

export const insertPasswordResetCodeSchema = createInsertSchema(passwordResetCodes).omit({
  id: true,
  createdAt: true,
});

export type InsertPasswordResetCode = z.infer<typeof insertPasswordResetCodeSchema>;
export type PasswordResetCode = typeof passwordResetCodes.$inferSelect;

// User Sessions - 90-day sessions with device tracking
export const userSessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  token: text("token").notNull().unique(), // Changed from varchar(64) to text to support JWT tokens
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
  deviceName: varchar("device_name", { length: 100 }),
  deviceType: varchar("device_type", { length: 50 }), // mobile, tablet, desktop
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActivity: timestamp("last_activity").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
}, (table) => ({
  tokenIdx: index("user_sessions_token_idx").on(table.token),
  userIdx: index("user_sessions_user_idx").on(table.userId),
  userDeviceIdx: index("user_sessions_user_device_idx").on(table.userId, table.deviceFingerprint),
  expiresIdx: index("user_sessions_expires_idx").on(table.expiresAt),
}));

export const insertUserSessionSchema = createInsertSchema(userSessions).omit({
  id: true,
  createdAt: true,
});

export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type UserSession = typeof userSessions.$inferSelect;

// Referral Codes table - Two-tier referral system
export const referralCodes = pgTable("referral_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // The actual referral code
  codeType: text("code_type").notNull(), // 'user' or 'influencer'
  
  // User referrals
  userId: varchar("user_id"), // If type='user', links to bjj_users.id
  uses: text("uses"), // Legacy field for user referrals
  freeMonthsEarned: text("free_months_earned"), // Legacy field
  
  // Influencer referrals
  influencerName: text("influencer_name"), // If type='influencer'
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }), // e.g., 0.30 for 30%
  
  // User Benefit / Discount Configuration (NEW - Complete Referral System)
  discountType: text("discount_type").default("none"), // none, percentage, fixed, trial_extension, free_month, free_months
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }).default("0"), // Value based on discount type
  stripeCouponId: text("stripe_coupon_id"), // Stripe coupon ID linked to this code
  
  // Tracking
  totalSignups: integer("total_signups").default(0), // Total referral signups
  activeSubscribers: integer("active_subscribers").default(0), // Count of active paying subscribers
  totalRevenueGenerated: numeric("total_revenue_generated", { precision: 10, scale: 2 }).default("0"), // Total revenue generated
  commissionOwed: numeric("commission_owed", { precision: 10, scale: 2 }).default("0"), // Commission owed to influencer
  
  // Payout settings
  assignedToUserId: varchar("assigned_to_user_id"), // Links to bjj_users.id - code owner
  payoutMethod: varchar("payout_method", { length: 50 }).default("stripe"), // stripe, paypal, etc.
  stripeAccountId: varchar("stripe_account_id", { length: 255 }), // Stripe Connect account
  minimumPayout: numeric("minimum_payout", { precision: 10, scale: 2 }).default("10.00"), // Min for payout
  createdByAdmin: varchar("created_by_admin", { length: 255 }), // Admin email who created
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReferralCodeSchema = createInsertSchema(referralCodes).omit({
  id: true,
  createdAt: true,
});

export type InsertReferralCode = z.infer<typeof insertReferralCodeSchema>;
export type ReferralCode = typeof referralCodes.$inferSelect;

// Referral Commissions - Track every commission earned on recurring payments
export const referralCommissions = pgTable("referral_commissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referralCodeId: varchar("referral_code_id").notNull(), // Links to referral_codes.id
  codeOwnerUserId: varchar("code_owner_user_id").notNull(), // User earning commission
  referredUserId: varchar("referred_user_id").notNull(), // User who made payment
  paymentAmount: numeric("payment_amount", { precision: 10, scale: 2 }).notNull(),
  commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }).notNull(),
  commissionPercent: integer("commission_percent").notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  payoutEligibleDate: timestamp("payout_eligible_date").notNull(), // payment_date + 60 days
  stripePaymentId: varchar("stripe_payment_id", { length: 255 }),
  stripeChargeId: varchar("stripe_charge_id", { length: 255 }),
  subscriptionId: varchar("subscription_id", { length: 255 }),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, eligible, paid, cancelled
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  codeOwnerIdx: index("idx_commissions_code_owner").on(table.codeOwnerUserId),
  statusIdx: index("idx_commissions_status").on(table.status),
  payoutEligibleIdx: index("idx_commissions_payout_eligible").on(table.payoutEligibleDate, table.status),
  paymentDateIdx: index("idx_commissions_payment_date").on(table.paymentDate),
}));

export const insertReferralCommissionSchema = createInsertSchema(referralCommissions).omit({
  id: true,
  createdAt: true,
});

export type InsertReferralCommission = z.infer<typeof insertReferralCommissionSchema>;
export type ReferralCommission = typeof referralCommissions.$inferSelect;

// Referral Payouts - Track automated Stripe payouts
export const referralPayouts = pgTable("referral_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // User receiving payout
  referralCodeId: varchar("referral_code_id"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  commissionIds: text("commission_ids").array().notNull(), // Array of commission IDs
  paymentMethod: varchar("payment_method", { length: 50 }),
  stripePayoutId: varchar("stripe_payout_id", { length: 255 }),
  stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
  requestedAt: timestamp("requested_at"),
  paidAt: timestamp("paid_at"),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, processing, paid, failed
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_payouts_user").on(table.userId),
  statusIdx: index("idx_payouts_status").on(table.status),
}));

export const insertReferralPayoutSchema = createInsertSchema(referralPayouts).omit({
  id: true,
  createdAt: true,
});

export type InsertReferralPayout = z.infer<typeof insertReferralPayoutSchema>;
export type ReferralPayout = typeof referralPayouts.$inferSelect;

// Referral Milestones - Track achievements for weekly emails
export const referralMilestones = pgTable("referral_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // User who achieved milestone
  referralCodeId: varchar("referral_code_id").notNull(),
  milestoneType: varchar("milestone_type", { length: 100 }).notNull(), // signups, paid_subscribers, earnings
  milestoneValue: integer("milestone_value").notNull(), // e.g., 5, 10, 25, 50, 100
  achievedAt: timestamp("achieved_at").defaultNow().notNull(),
  notified: boolean("notified").default(false),
}, (table) => ({
  userIdx: index("idx_milestones_user").on(table.userId),
}));

export const insertReferralMilestoneSchema = createInsertSchema(referralMilestones).omit({
  id: true,
  achievedAt: true,
});

export type InsertReferralMilestone = z.infer<typeof insertReferralMilestoneSchema>;
export type ReferralMilestone = typeof referralMilestones.$inferSelect;

// Magic Links - Passwordless authentication tokens for beta access
export const magicLinks = pgTable("magic_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(), // Unique token for the link
  phoneNumber: text("phone_number").notNull(), // Phone number this link grants access to
  expiresAt: timestamp("expires_at").notNull(), // Link expiration (7 days)
  used: boolean("used").default(false), // Has this link been used?
  usedAt: timestamp("used_at"), // When was it used?
  createdBy: text("created_by"), // Admin who created it (for tracking)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMagicLinkSchema = createInsertSchema(magicLinks).omit({
  id: true,
  createdAt: true,
});

export type InsertMagicLink = z.infer<typeof insertMagicLinkSchema>;
export type MagicLink = typeof magicLinks.$inferSelect;

// Push Subscriptions - Web push notification subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Link to bjj_users.id
  endpoint: text("endpoint").notNull().unique(), // Push endpoint URL
  p256dh: text("p256dh").notNull(), // Encryption key
  auth: text("auth").notNull(), // Auth secret
  deviceType: text("device_type").default("web"), // web, android, ios
  userAgent: text("user_agent"), // Browser/device info
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// Account Sharing Prevention - Device management and fraud detection
export const authorizedDevices = pgTable("authorized_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Links to bjj_users.id
  fingerprint: text("fingerprint").notNull(), // Device fingerprint hash
  deviceName: text("device_name"), // "iPhone 15 - Safari"
  deviceType: text("device_type"), // 'mobile', 'tablet', 'desktop'
  browser: text("browser"), // Chrome, Safari, Firefox
  os: text("os"), // iOS, Android, Windows, macOS
  firstSeen: timestamp("first_seen").defaultNow().notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
  loginCount: integer("login_count").default(1),
  ipAddress: text("ip_address"),
  city: text("city"),
  country: text("country"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_user_devices").on(table.userId),
  uniqueDevice: index("idx_device_fingerprint").on(table.userId, table.fingerprint),
}));

export const insertAuthorizedDeviceSchema = createInsertSchema(authorizedDevices).omit({
  id: true,
  createdAt: true,
});

export type InsertAuthorizedDevice = z.infer<typeof insertAuthorizedDeviceSchema>;
export type AuthorizedDevice = typeof authorizedDevices.$inferSelect;

// Login Events - Track all login attempts for behavioral analysis
export const loginEvents = pgTable("login_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Links to bjj_users.id
  deviceFingerprint: text("device_fingerprint"),
  ipAddress: text("ip_address"),
  city: text("city"),
  country: text("country"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  loginTime: timestamp("login_time").defaultNow().notNull(),
  success: boolean("success").default(true),
  failureReason: text("failure_reason"), // "invalid_code", "device_limit", etc.
}, (table) => ({
  userTimeIdx: index("idx_login_events_user").on(table.userId, table.loginTime),
}));

export const insertLoginEventSchema = createInsertSchema(loginEvents).omit({
  id: true,
  loginTime: true,
});

export type InsertLoginEvent = z.infer<typeof insertLoginEventSchema>;
export type LoginEvent = typeof loginEvents.$inferSelect;

// Email Logs - Track all sent emails for admin visibility
export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientEmail: text("recipient_email").notNull(),
  emailType: text("email_type").notNull(), // 'verification', 'welcome', 'lifetime_invite', 'lifetime_access', 'password_reset', 'curation_report'
  subject: text("subject"),
  resendId: text("resend_id"), // Resend message ID for tracking
  status: text("status").notNull().default("sent"), // 'sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked'
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  metadata: jsonb("metadata"), // Additional context (userId, inviteToken, etc.)
}, (table) => ({
  recipientIdx: index("idx_email_logs_recipient").on(table.recipientEmail),
  typeIdx: index("idx_email_logs_type").on(table.emailType),
  statusIdx: index("idx_email_logs_status").on(table.status),
  sentAtIdx: index("idx_email_logs_sent_at").on(table.sentAt),
}));

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  sentAt: true,
});

export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;

// Flagged Accounts - Admin review queue for suspicious activity
export const flaggedAccounts = pgTable("flagged_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Links to bjj_users.id
  reason: text("reason").notNull(), // 'excessive_devices', 'impossible_travel', 'unusual_hours'
  data: jsonb("data"), // Additional context about the flag
  flaggedAt: timestamp("flagged_at").defaultNow().notNull(),
  reviewedBy: text("reviewed_by"), // Admin email/ID who reviewed
  reviewedAt: timestamp("reviewed_at"),
  status: text("status").default("pending").notNull(), // 'pending', 'false_positive', 'suspended', 'warned'
  notes: text("notes"), // Admin notes
}, (table) => ({
  statusIdx: index("idx_flagged_accounts_pending").on(table.status),
  userIdx: index("idx_flagged_accounts_user").on(table.userId),
}));

export const insertFlaggedAccountSchema = createInsertSchema(flaggedAccounts).omit({
  id: true,
  flaggedAt: true,
});

export type InsertFlaggedAccount = z.infer<typeof insertFlaggedAccountSchema>;
export type FlaggedAccount = typeof flaggedAccounts.$inferSelect;

// User Engagement - Tracks user interaction and engagement metrics
export const userEngagement = pgTable("user_engagement", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  lastClickDate: timestamp("last_click_date"),
  totalClicks: text("total_clicks").notNull().default("0"),
  streakDays: text("streak_days").notNull().default("0"),
  lastReplyDate: timestamp("last_reply_date"),
  progressionLevel: text("progression_level").notNull().default("beginner"),
  relatedTechniquesSentToday: boolean("related_techniques_sent_today").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserEngagementSchema = createInsertSchema(userEngagement).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserEngagement = z.infer<typeof insertUserEngagementSchema>;
export type UserEngagement = typeof userEngagement.$inferSelect;

// Sent Techniques - Tracks techniques sent to users
export const sentTechniques = pgTable("sent_techniques", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  techniqueName: text("technique_name").notNull(),
  videoUrl: text("video_url").notNull(),
  videoId: text("video_id").notNull(),
  instructor: text("instructor").notNull(),
  sentDate: timestamp("sent_date").notNull(),
  clicked: boolean("clicked").notNull().default(false),
  clickedAt: timestamp("clicked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSentTechniqueSchema = createInsertSchema(sentTechniques).omit({
  id: true,
  createdAt: true,
});

export type InsertSentTechnique = z.infer<typeof insertSentTechniqueSchema>;
export type SentTechnique = typeof sentTechniques.$inferSelect;

// Video Analyses - YouTube video analysis with 6-stage multi-stage analysis
export const videos = pgTable("videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoUrl: text("video_url").notNull().unique(),
  videoId: text("video_id").notNull(),
  title: text("title").notNull(),
  channel: text("channel").notNull(),
  channelId: text("channel_id"),
  
  // Stage 1: Quick Filter
  quickFilterPassed: boolean("quick_filter_passed").default(false),
  quickFilterReason: text("quick_filter_reason"),
  
  // Stage 2: Key Detail Extraction (MOST IMPORTANT - 40 points)
  keyDetailQuality: integer("key_detail_quality").default(0), // 0-40 points
  keyDetails: text("key_details"), // JSON string of key details
  timestampUrl: text("timestamp_url"), // Direct link to key detail moment
  
  // Comprehensive Timestamp System - Multiple timestamps per video
  timestamps: jsonb("timestamps"), // Detailed timestamp object with multiple key points
  timestampCount: integer("timestamp_count").default(0), // Number of timestamps extracted
  
  // Stage 3: Instructor Credibility (30 points)
  instructorCredibility: integer("instructor_credibility").default(0), // 0-30 points
  instructorName: text("instructor_name"),
  
  // Stage 4: Quality Control (A/B/C/D/F grade)
  qualityGrade: text("quality_grade"), // A, B, C, D, F
  teachingClarity: integer("teaching_clarity").default(0), // 0-20 points
  productionQuality: integer("production_quality").default(0), // 0-10 points
  
  // Stage 5: Personalization (belt + preference matching)
  beltAppropriate: text("belt_appropriate"), // white, blue, purple, brown, black, all
  contentLevel: text("content_level"), // FUNDAMENTALS, MIXED, ADVANCED
  
  // Stage 6: Final Score & Metadata
  finalScore: integer("final_score").default(0), // Total out of 100
  accepted: boolean("accepted").default(false), // Passed 70-point threshold?
  
  // Additional metadata
  position: text("position"), // guard, mount, side_control, etc.
  techniqueType: text("technique_type"), // submission, sweep, pass, escape, takedown
  publishedAt: timestamp("published_at"),
  contentFreshness: integer("content_freshness").default(0), // +10 <3mo, +5 <12mo, -5 >2yr
  
  // Teaching Style Profile (Enhancement 5)
  teachingStyleProfile: text("teaching_style_profile"), // JSON: {verbosity, approach, pacing, detailLevel, etc.}
  
  // User feedback tracking
  totalSent: integer("total_sent").default(0),
  totalClicks: integer("total_clicks").default(0),
  totalSkips: integer("total_skips").default(0),
  totalBadRatings: integer("total_bad_ratings").default(0),
  
  // Archive flag for quality decay
  archived: boolean("archived").default(false),
  archiveReason: text("archive_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videos.$inferSelect;

// User Feedback History
export const userFeedbackHistory = pgTable("user_feedback_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  videoId: varchar("video_id").notNull(),
  feedbackType: text("feedback_type").notNull(), // click, skip, bad, good
  beltLevel: text("belt_level"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserFeedbackHistorySchema = createInsertSchema(userFeedbackHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertUserFeedbackHistory = z.infer<typeof insertUserFeedbackHistorySchema>;
export type UserFeedbackHistory = typeof userFeedbackHistory.$inferSelect;

// User Learning Profile - personalization engine (matches existing database table)
export const userLearningProfile = pgTable("user_learning_profile", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  favoriteInstructors: text("favorite_instructors").array(),
  avoidInstructors: text("avoid_instructors").array(),
  preferredPositions: text("preferred_positions").array(),
  avoidPositions: text("avoid_positions").array(),
  learningStyle: text("learning_style"), // visual, verbal, hands-on
  videoLengthPreference: text("video_length_preference"), // short, medium, long
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserLearningProfileSchema = createInsertSchema(userLearningProfile).omit({
  id: true,
  updatedAt: true,
});

export type InsertUserLearningProfile = z.infer<typeof insertUserLearningProfileSchema>;
export type UserLearningProfile = typeof userLearningProfile.$inferSelect;

// Instructor Performance - feedback system
export const instructorPerformance = pgTable("instructor_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instructorName: text("instructor_name").notNull().unique(),
  videosSentTotal: integer("videos_sent_total").default(0),
  avgUserRating: numeric("avg_user_rating", { precision: 5, scale: 2 }).default("0"),
  skipRatePercentage: numeric("skip_rate_percentage", { precision: 5, scale: 2 }).default("0"),
  badRatePercentage: numeric("bad_rate_percentage", { precision: 5, scale: 2 }).default("0"),
  credibilityAdjustment: integer("credibility_adjustment").default(0),
  totalVideosSent: integer("total_videos_sent").default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInstructorPerformanceSchema = createInsertSchema(instructorPerformance).omit({
  id: true,
  updatedAt: true,
});

export type InsertInstructorPerformance = z.infer<typeof insertInstructorPerformanceSchema>;
export type InstructorPerformance = typeof instructorPerformance.$inferSelect;

// Daily AI Metrics - monitoring dashboard
export const dailyAiMetrics = pgTable("daily_ai_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull().unique(),
  videosAnalyzed: integer("videos_analyzed").default(0),
  videosScoring70Plus: integer("videos_scoring_70_plus").default(0),
  videosSent: integer("videos_sent").default(0),
  avgQualityScore: numeric("avg_quality_score", { precision: 5, scale: 2 }).default("0"),
  skipRatePercentage: numeric("skip_rate_percentage", { precision: 5, scale: 2 }).default("0"),
  badRatePercentage: numeric("bad_rate_percentage", { precision: 5, scale: 2 }).default("0"),
  topPerformingInstructor: text("top_performing_instructor"),
  failedAnalyses: integer("failed_analyses").default(0),
  duplicateViolations: integer("duplicate_violations").default(0),
  totalUsersSent: integer("total_users_sent").default(0),
});

export const insertDailyAiMetricSchema = createInsertSchema(dailyAiMetrics).omit({
  id: true,
});

export type InsertDailyAiMetric = z.infer<typeof insertDailyAiMetricSchema>;
export type DailyAiMetric = typeof dailyAiMetrics.$inferSelect;

// Emerging Instructors - instructor discovery system (Enhancement 1)
export const emergingInstructors = pgTable("emerging_instructors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instructorName: text("instructor_name").notNull(),
  channelId: text("channel_id").notNull().unique(),
  credibilityScore: integer("credibility_score").notNull(),
  specialty: text("specialty"),
  teachingStyle: text("teaching_style"), // JSON string
  approvalStatus: text("approval_status").default("pending"), // pending, approved, rejected
  videosAnalyzed: integer("videos_analyzed").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmergingInstructorSchema = createInsertSchema(emergingInstructors).omit({
  id: true,
  createdAt: true,
});

export type InsertEmergingInstructor = z.infer<typeof insertEmergingInstructorSchema>;
export type EmergingInstructor = typeof emergingInstructors.$inferSelect;

// Technique Relationships - knowledge graph (Enhancement 2)
export const techniqueRelationships = pgTable("technique_relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  techniqueA: text("technique_a").notNull(),
  techniqueB: text("technique_b").notNull(),
  relationshipType: text("relationship_type").notNull(), // prerequisite, counter, chain, variation
  strength: numeric("strength", { precision: 3, scale: 2 }).default("0.5"),
  explanation: text("explanation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTechniqueRelationshipSchema = createInsertSchema(techniqueRelationships).omit({
  id: true,
  createdAt: true,
});

export type InsertTechniqueRelationship = z.infer<typeof insertTechniqueRelationshipSchema>;
export type TechniqueRelationship = typeof techniqueRelationships.$inferSelect;

// Competition Meta - trending techniques (Enhancement 4)
export const competitionMeta = pgTable("competition_meta", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  analysisDate: timestamp("analysis_date").notNull().defaultNow(),
  hotTechniques: text("hot_techniques").notNull(), // JSON string
  coldTechniques: text("cold_techniques").notNull(), // JSON string
  metaSummary: text("meta_summary").notNull(),
  sourceVideosAnalyzed: text("source_videos_analyzed").array().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCompetitionMetaSchema = createInsertSchema(competitionMeta).omit({
  id: true,
  analysisDate: true,
  createdAt: true,
});

export type InsertCompetitionMeta = z.infer<typeof insertCompetitionMetaSchema>;
export type CompetitionMeta = typeof competitionMeta.$inferSelect;

// Technique Quality Reviews - decay detection
export const techniqueQualityReviews = pgTable("technique_quality_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").notNull(),
  reviewDate: timestamp("review_date").notNull().defaultNow(),
  originalScore: integer("original_score").notNull(),
  adjustedScore: integer("adjusted_score").notNull(),
  stillRelevant: boolean("still_relevant").notNull(),
  actionTaken: text("action_taken").notNull(), // keep/archive/replace
  replacementVideoId: varchar("replacement_video_id"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTechniqueQualityReviewSchema = createInsertSchema(techniqueQualityReviews).omit({
  id: true,
  reviewDate: true,
  createdAt: true,
});

export type InsertTechniqueQualityReview = z.infer<typeof insertTechniqueQualityReviewSchema>;
export type TechniqueQualityReview = typeof techniqueQualityReviews.$inferSelect;

// Video Transcripts - Cached transcripts from YouTube captions or Whisper API
export const videoTranscripts = pgTable("video_transcripts", {
  id: serial("id").primaryKey(),
  videoId: varchar("video_id", { length: 20 }).notNull().unique(), // YouTube video ID
  transcript: text("transcript").notNull(), // Full transcript text
  source: varchar("source", { length: 20 }).notNull(), // 'youtube' or 'whisper'
  cost: numeric("cost", { precision: 10, scale: 4 }).default('0').notNull(), // Whisper API cost ($0.006/min)
  segments: integer("segments").default(0), // Number of transcript segments
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVideoTranscriptSchema = createInsertSchema(videoTranscripts).omit({
  id: true,
  createdAt: true,
});

export type InsertVideoTranscript = z.infer<typeof insertVideoTranscriptSchema>;
export type VideoTranscript = typeof videoTranscripts.$inferSelect;

// Video Analyses - YouTube video analysis (legacy table - still in use)
export const videoAnalyses = pgTable("video_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: text("video_id").notNull(),
  title: text("title").notNull(),
  channelTitle: text("channel_title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  techniqueName: text("technique_name"),
  techniqueVariation: text("technique_variation"),
  instructorCredibility: text("instructor_credibility"),
  teachingStyle: text("teaching_style"),
  skillLevel: text("skill_level"),
  giApplicability: text("gi_applicability"),
  productionQuality: text("production_quality"),
  coversMistakes: boolean("covers_mistakes").default(false),
  includesDrilling: boolean("includes_drilling").default(false),
  showsLiveApplication: boolean("shows_live_application").default(false),
  qualityScore: text("quality_score"),
  keyDetails: text("key_details"),
  summary: text("summary"),
  publishedAt: text("published_at"),
  viewCount: text("view_count"),
  analyzedAt: timestamp("analyzed_at").defaultNow().notNull(),
  primaryProblem: text("primary_problem"),
  secondaryProblems: text("secondary_problems"),
  problemKeywords: text("problem_keywords"),
  userQueryMatches: text("user_query_matches"),
  teachingStyleProfile: text("teaching_style_profile"),
  competitionMetaScore: integer("competition_meta_score").default(0),
  archived: boolean("archived").default(false),
  lastReviewed: timestamp("last_reviewed"),
});

export const insertVideoAnalysisSchema = createInsertSchema(videoAnalyses).omit({
  id: true,
  analyzedAt: true,
});

export type InsertVideoAnalysis = z.infer<typeof insertVideoAnalysisSchema>;
export type VideoAnalysis = typeof videoAnalyses.$inferSelect;

// Recommendation History - tracks what was sent to users (legacy table - still in use)
export const recommendationHistory = pgTable("recommendation_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientId: varchar("recipient_id").notNull(),
  videoId: text("video_id").notNull(),
  technique: text("technique").notNull(),
  recommendedAt: timestamp("recommended_at").defaultNow().notNull(),
  wasClicked: boolean("was_clicked").default(false),
  wasHelpful: boolean("was_helpful"),
});

export const insertRecommendationHistorySchema = createInsertSchema(recommendationHistory).omit({
  id: true,
  recommendedAt: true,
});

export type InsertRecommendationHistory = z.infer<typeof insertRecommendationHistorySchema>;
export type RecommendationHistory = typeof recommendationHistory.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// 29 NEW AI INTELLIGENCE TABLES - Phase 2 Advanced Intelligence Layer
// ═══════════════════════════════════════════════════════════════════════════════

// TABLE 1: ai_video_knowledge - Accumulated knowledge from every video analyzed + Curation metadata
export const aiVideoKnowledge = pgTable("ai_video_knowledge", {
  id: serial("id").primaryKey(),
  youtubeId: varchar("youtube_id", { length: 50 }).unique(),
  videoUrl: text("video_url").notNull().unique(),
  title: text("title").notNull(),
  techniqueName: text("technique_name").notNull(),
  instructorName: text("instructor_name"),
  
  // YouTube metadata
  channelId: varchar("channel_id", { length: 100 }),
  channelName: varchar("channel_name", { length: 200 }),
  duration: integer("duration"), // seconds
  uploadDate: timestamp("upload_date"),
  viewCount: integer("view_count"),
  likeCount: integer("like_count"),
  thumbnailUrl: text("thumbnail_url"),
  
  // AI-extracted categorization
  positionCategory: text("position_category"),
  techniqueType: text("technique_type"),
  specificTechnique: varchar("specific_technique", { length: 200 }),
  beltLevel: text("belt_level").array(), // ['white', 'blue', 'purple', 'brown', 'black']
  difficultyScore: integer("difficulty_score"),
  giOrNogi: text("gi_or_nogi"),
  
  problemsSolved: jsonb("problems_solved"),
  prerequisites: jsonb("prerequisites"),
  
  keyDetails: jsonb("key_details"),
  commonMistakes: jsonb("common_mistakes"),
  counters: jsonb("counters"),
  
  relatedTechniques: jsonb("related_techniques"),
  progressionsTo: jsonb("progressions_to"),
  progressionsFrom: jsonb("progressions_from"),
  
  // AI analysis
  qualityScore: numeric("quality_score", { precision: 3, scale: 2 }), // 1.0-10.0
  instructorCredibility: varchar("instructor_credibility", { length: 20 }), // high, medium, low
  
  // NEW: Detailed AI Scoring Breakdown (Part 7 - Issue #4)
  teachingQualityScore: numeric("teaching_quality_score", { precision: 3, scale: 1 }), // 1.0-10.0
  productionQualityScore: numeric("production_quality_score", { precision: 3, scale: 1 }), // 1.0-10.0
  techniqueDetailScore: numeric("technique_detail_score", { precision: 3, scale: 1 }), // 1.0-10.0
  demonstrationScore: numeric("demonstration_score", { precision: 3, scale: 1 }), // 1.0-10.0
  
  // NEW: Enhanced Video Metadata (Part 3 - Issue #3)
  keyTimestamps: jsonb("key_timestamps"), // [{time: "2:35", description: "Hip escape detail", importance: "high"}]
  bestForLevel: text("best_for_level").array(), // ["white", "blue"]
  whenToWatch: text("when_to_watch"), // "before_drilling", "after_class", "pre_competition", "injury_recovery"
  prerequisiteTechniques: jsonb("prerequisite_techniques"), // Array of technique IDs
  followUpTechniques: jsonb("follow_up_techniques"), // Array of technique IDs
  commonMistakesTimestamp: text("common_mistakes_timestamp"), // "5:20"
  setupTimestamp: text("setup_timestamp"), // "0:45"
  executionTimestamp: text("execution_timestamp"), // "2:10"
  troubleshootingTimestamp: text("troubleshooting_timestamp"), // "6:30"
  
  // Performance metrics (from user feedback)
  recommendationCount: integer("recommendation_count").default(0),
  helpfulCount: integer("helpful_count").default(0),
  notHelpfulCount: integer("not_helpful_count").default(0),
  helpfulRatio: numeric("helpful_ratio", { precision: 3, scale: 2 }),
  totalVotes: integer("total_votes").default(0),
  qualityTier: text("quality_tier").default('unrated'), // unrated, flagged, standard, prioritized, top_tier, removed
  
  analyzedAt: timestamp("analyzed_at").defaultNow(),
  timesSentToUsers: integer("times_sent_to_users").default(0),
  avgUserRating: numeric("avg_user_rating", { precision: 3, scale: 2 }),
  totalRatings: integer("total_ratings").default(0),
  
  analysisConfidence: numeric("analysis_confidence", { precision: 3, scale: 2 }),
  needsReview: boolean("needs_review").default(false),
  
  // Status
  status: varchar("status", { length: 20 }).default('active'), // active, archived, removed
  lastRecommended: timestamp("last_recommended"),
  
  // Search optimization
  tags: text("tags").array(),
  
  // Language Support
  languages: text("languages").array().default(sql`'{en}'`), // Array of language codes: en, pt, es
  
  // Curation and partnership tracking (added for instructor partnership system)
  tier: text("tier").default("tier_2"), // tier_1, tier_2, tier_3 (based on instructor credibility)
  curationRunId: varchar("curation_run_id"), // Which curation run added this video
  autoPublished: boolean("auto_published").default(false), // Auto-added vs manual review
  featuredInstructorId: varchar("featured_instructor_id"), // If from a featured instructor
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  techniqueIdx: index("idx_video_technique").on(table.techniqueName),
  positionIdx: index("idx_video_position").on(table.positionCategory),
  difficultyIdx: index("idx_video_difficulty").on(table.difficultyScore),
  instructorIdx: index("idx_video_instructor").on(table.instructorName),
  statusIdx: index("idx_video_status").on(table.status),
  beltLevelIdx: index("idx_video_belt_level").on(table.beltLevel),
  qualityIdx: index("idx_video_quality").on(table.qualityScore),
  helpfulIdx: index("idx_video_helpful").on(table.helpfulRatio),
  curationRunIdx: index("idx_video_curation_run").on(table.curationRunId),
  featuredInstructorIdx: index("idx_video_featured_instructor").on(table.featuredInstructorId),
  languagesIdx: index("idx_video_languages").on(table.languages),
}));

export const insertAiVideoKnowledgeSchema = createInsertSchema(aiVideoKnowledge).omit({
  id: true,
  analyzedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiVideoKnowledge = z.infer<typeof insertAiVideoKnowledgeSchema>;
export type AiVideoKnowledge = typeof aiVideoKnowledge.$inferSelect;

// Saved Videos - User's personally saved/bookmarked videos (Excellence Edition)
export const savedVideos = pgTable("saved_videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id),
  videoUrl: text("video_url").notNull(),
  videoTitle: text("video_title").notNull(),
  instructorName: text("instructor_name").notNull(), // Standardized format
  category: text("category").notNull(), // Submissions/Passes/Sweeps/Escapes/Takedowns/Guard Retention/Position Control/Other
  thumbnailUrl: text("thumbnail_url"),
  notes: text("notes"), // User's personal notes
  savedAt: timestamp("saved_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_saved_vids_user").on(table.userId),
  categoryIdx: index("idx_saved_vids_category").on(table.category),
  instructorIdx: index("idx_saved_vids_instructor").on(table.instructorName),
}));

export const insertSavedVideoSchema = createInsertSchema(savedVideos).omit({
  id: true,
  savedAt: true,
}).extend({
  category: z.enum([
    "Submissions",
    "Passes",
    "Sweeps",
    "Escapes",
    "Takedowns",
    "Guard Retention",
    "Position Control",
    "Other"
  ]),
});

export type InsertSavedVideo = z.infer<typeof insertSavedVideoSchema>;
export type SavedVideo = typeof savedVideos.$inferSelect;

// Video Feedback - User feedback on recommended videos
export const videoFeedback = pgTable("video_feedback", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").references(() => aiVideoKnowledge.id),
  userId: varchar("user_id").references(() => bjjUsers.id),
  helpful: boolean("helpful").notNull(),
  userContext: jsonb("user_context"), // belt, gi_pref, etc. at time of feedback
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  videoIdx: index("idx_vfeedback_video").on(table.videoId),
  userIdx: index("idx_vfeedback_user").on(table.userId),
}));

export const insertVideoFeedbackSchema = createInsertSchema(videoFeedback).omit({
  id: true,
  createdAt: true,
});

export type InsertVideoFeedback = z.infer<typeof insertVideoFeedbackSchema>;
export type VideoFeedback = typeof videoFeedback.$inferSelect;

// Video Recommendations Log - Tracks what videos were recommended to users
export const videoRecommendations = pgTable("video_recommendations", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").references(() => aiVideoKnowledge.id),
  userId: varchar("user_id").references(() => bjjUsers.id),
  conversationId: integer("conversation_id"),
  recommendedAt: timestamp("recommended_at").defaultNow(),
  context: text("context"), // What question led to this recommendation
}, (table) => ({
  videoIdx: index("idx_recommendations_video").on(table.videoId),
  userIdx: index("idx_recommendations_user").on(table.userId),
}));

export const insertVideoRecommendationsSchema = createInsertSchema(videoRecommendations).omit({
  id: true,
  recommendedAt: true,
});

export type InsertVideoRecommendations = z.infer<typeof insertVideoRecommendationsSchema>;
export type VideoRecommendations = typeof videoRecommendations.$inferSelect;

// Video Views - Tracks individual video viewing sessions
export const videoViews = pgTable("video_views", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  videoId: integer("video_id").notNull().references(() => aiVideoKnowledge.id, { onDelete: 'cascade' }),
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  watchDuration: integer("watch_duration").default(0), // seconds watched
  completed: boolean("completed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_video_views_user").on(table.userId),
  videoIdx: index("idx_video_views_video").on(table.videoId),
  userVideoIdx: index("idx_video_views_user_video").on(table.userId, table.videoId),
  viewedAtIdx: index("idx_video_views_viewed_at").on(table.viewedAt),
}));

export const insertVideoViewsSchema = createInsertSchema(videoViews).omit({
  id: true,
  createdAt: true,
});

export type InsertVideoViews = z.infer<typeof insertVideoViewsSchema>;
export type VideoViews = typeof videoViews.$inferSelect;

// User Video Stats - Aggregated viewing statistics per user-video pair
export const userVideoStats = pgTable("user_video_stats", {
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  videoId: integer("video_id").notNull().references(() => aiVideoKnowledge.id, { onDelete: 'cascade' }),
  viewCount: integer("view_count").default(0).notNull(),
  firstViewedAt: timestamp("first_viewed_at"),
  lastViewedAt: timestamp("last_viewed_at"),
  totalWatchTime: integer("total_watch_time").default(0).notNull(), // total seconds watched
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.videoId] }), // Composite primary key prevents duplicates
  userIdx: index("idx_user_video_stats_user").on(table.userId),
}));

export const insertUserVideoStatsSchema = createInsertSchema(userVideoStats);

export type InsertUserVideoStats = z.infer<typeof insertUserVideoStatsSchema>;
export type UserVideoStats = typeof userVideoStats.$inferSelect;

// Video Curation Log - Activity log for curation runs
export const videoCurationLog = pgTable("video_curation_log", {
  id: serial("id").primaryKey(),
  searchQuery: text("search_query"),
  videosFound: integer("videos_found"),
  videosAnalyzed: integer("videos_analyzed"),
  videosAdded: integer("videos_added"),
  videosRejected: integer("videos_rejected"),
  runAt: timestamp("run_at").defaultNow(),
  durationSeconds: integer("duration_seconds"),
});

export const insertVideoCurationLogSchema = createInsertSchema(videoCurationLog).omit({
  id: true,
  runAt: true,
});

export type InsertVideoCurationLog = z.infer<typeof insertVideoCurationLogSchema>;
export type VideoCurationLog = typeof videoCurationLog.$inferSelect;

// Video Curation Config - Controls automated video curation behavior
export const videoCurationConfig = pgTable("video_curation_config", {
  id: serial("id").primaryKey(),
  automaticCurationEnabled: boolean("automatic_curation_enabled").default(true),
  manualReviewEnabled: boolean("manual_review_enabled").default(false),
  qualityThreshold: numeric("quality_threshold", { precision: 3, scale: 1 }).default("7.5"),
  lastRunAt: timestamp("last_run_at"),
  nextScheduledRun: timestamp("next_scheduled_run"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertVideoCurationConfigSchema = createInsertSchema(videoCurationConfig).omit({
  id: true,
  updatedAt: true,
});

export type InsertVideoCurationConfig = z.infer<typeof insertVideoCurationConfigSchema>;
export type VideoCurationConfig = typeof videoCurationConfig.$inferSelect;

// Video Review Queue - Videos pending manual review before being added to library
export const videoReviewQueue = pgTable("video_review_queue", {
  id: serial("id").primaryKey(),
  videoUrl: text("video_url").notNull(),
  title: text("title"),
  instructor: text("instructor"),
  qualityScore: numeric("quality_score", { precision: 3, scale: 1 }),
  analysisData: jsonb("analysis_data"),
  status: text("status").default("pending"), // pending, approved, rejected
  reviewedBy: varchar("reviewed_by").references(() => bjjUsers.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  statusIdx: index("idx_review_queue_status").on(table.status),
  createdIdx: index("idx_review_queue_created").on(table.createdAt),
}));

export const insertVideoReviewQueueSchema = createInsertSchema(videoReviewQueue).omit({
  id: true,
  createdAt: true,
});

export type InsertVideoReviewQueue = z.infer<typeof insertVideoReviewQueueSchema>;
export type VideoReviewQueue = typeof videoReviewQueue.$inferSelect;

// Elite Instructors - Proven high-quality instructors for targeted curation
export const eliteInstructors = pgTable("elite_instructors", {
  id: serial("id").primaryKey(),
  instructorName: text("instructor_name").notNull().unique(),
  videoCount: integer("video_count").default(0),
  avgQualityScore: numeric("avg_quality_score", { precision: 3, scale: 2 }),
  weightedScore: numeric("weighted_score", { precision: 5, scale: 2 }),
  tier: text("tier").default("high"), // highest, high, medium
  active: boolean("active").default(true),
  lastVideoAdded: timestamp("last_video_added"),
  totalSearches: integer("total_searches").default(0),
  successRate: numeric("success_rate", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  nameIdx: index("idx_elite_instructor_name").on(table.instructorName),
  tierIdx: index("idx_elite_instructor_tier").on(table.tier),
}));

export const insertEliteInstructorSchema = createInsertSchema(eliteInstructors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEliteInstructor = z.infer<typeof insertEliteInstructorSchema>;
export type EliteInstructor = typeof eliteInstructors.$inferSelect;

// Elite Curator Config - Controls elite-targeted curation behavior
export const eliteCuratorConfig = pgTable("elite_curator_config", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").default(false),
  maxDailySearches: integer("max_daily_searches").default(150),
  resultsPerSearch: integer("results_per_search").default(50),
  minQualityThreshold: numeric("min_quality_threshold", { precision: 3, scale: 1 }).default("7.0"),
  jtTorresPriority: numeric("jt_torres_priority", { precision: 3, scale: 2 }).default("0.20"), // 20% of searches
  targetTotalVideos: integer("target_total_videos").default(3000),
  minVideosPerTechnique: integer("min_videos_per_technique").default(50),
  lastRunAt: timestamp("last_run_at"),
  dailySearchesUsed: integer("daily_searches_used").default(0),
  lastResetAt: timestamp("last_reset_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEliteCuratorConfigSchema = createInsertSchema(eliteCuratorConfig).omit({
  id: true,
  updatedAt: true,
});

export type InsertEliteCuratorConfig = z.infer<typeof insertEliteCuratorConfigSchema>;
export type EliteCuratorConfig = typeof eliteCuratorConfig.$inferSelect;

// Elite Curation Log - Track elite curator performance
export const eliteCurationLog = pgTable("elite_curation_log", {
  id: serial("id").primaryKey(),
  runId: varchar("run_id", { length: 50 }).notNull(),
  instructor: text("instructor").notNull(),
  technique: text("technique").notNull(),
  searchQuery: text("search_query").notNull(),
  videosFound: integer("videos_found").default(0),
  videosApproved: integer("videos_approved").default(0),
  videosRejected: integer("videos_rejected").default(0),
  videosDuplicate: integer("videos_duplicate").default(0),
  approvalRate: numeric("approval_rate", { precision: 3, scale: 2 }),
  quotaUsed: integer("quota_used").default(0),
  runAt: timestamp("run_at").defaultNow(),
  durationMs: integer("duration_ms"),
}, (table) => ({
  runIdIdx: index("idx_elite_curation_run_id").on(table.runId),
  instructorIdx: index("idx_elite_curation_instructor").on(table.instructor),
  runAtIdx: index("idx_elite_curation_run_at").on(table.runAt),
}));

export const insertEliteCurationLogSchema = createInsertSchema(eliteCurationLog).omit({
  id: true,
  runAt: true,
});

export type InsertEliteCurationLog = z.infer<typeof insertEliteCurationLogSchema>;
export type EliteCurationLog = typeof eliteCurationLog.$inferSelect;

// TABLE 2: ai_user_feedback_signals - Captures ALL user interactions for learning
export const aiUserFeedbackSignals = pgTable("ai_user_feedback_signals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Matches bjjUsers.id (UUID)
  videoId: integer("video_id"),
  techniqueName: text("technique_name"),
  
  signalType: text("signal_type").notNull(),
  signalValue: text("signal_value"),
  
  userBeltLevel: text("user_belt_level"),
  daysSinceSignup: integer("days_since_signup"),
  timeOfDay: text("time_of_day"),
  
  sentiment: text("sentiment"),
  engagementScore: numeric("engagement_score", { precision: 3, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("idx_feedback_user").on(table.userId),
  videoIdx: index("idx_feedback_video").on(table.videoId),
  typeIdx: index("idx_feedback_type").on(table.signalType),
  createdIdx: index("idx_feedback_created").on(table.createdAt),
}));

export const insertAiUserFeedbackSignalSchema = createInsertSchema(aiUserFeedbackSignals).omit({
  id: true,
  createdAt: true,
});

export type InsertAiUserFeedbackSignal = z.infer<typeof insertAiUserFeedbackSignalSchema>;
export type AiUserFeedbackSignal = typeof aiUserFeedbackSignals.$inferSelect;

// TABLE 3: ai_problem_solution_map - Maps user problems to solutions
export const aiProblemSolutionMap = pgTable("ai_problem_solution_map", {
  id: serial("id").primaryKey(),
  
  problemStatement: text("problem_statement").notNull(),
  problemCategory: text("problem_category"),
  userBeltLevel: text("user_belt_level"),
  
  solutionVideoIds: jsonb("solution_video_ids"),
  solutionEffectiveness: jsonb("solution_effectiveness"),
  
  timesProblemMentioned: integer("times_problem_mentioned").default(0),
  usersWhoMentioned: jsonb("users_who_mentioned"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("idx_problem_category").on(table.problemCategory),
  statementIdx: index("idx_problem_statement").on(table.problemStatement),
}));

export const insertAiProblemSolutionMapSchema = createInsertSchema(aiProblemSolutionMap).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiProblemSolutionMap = z.infer<typeof insertAiProblemSolutionMapSchema>;
export type AiProblemSolutionMap = typeof aiProblemSolutionMap.$inferSelect;

// TABLE 4: ai_user_context - Complete user profile for context-aware recommendations
export const aiUserContext = pgTable("ai_user_context", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  
  beltLevel: text("belt_level"),
  yearsTraining: numeric("years_training", { precision: 3, scale: 1 }),
  trainingFrequency: text("training_frequency"),
  preferredPositions: jsonb("preferred_positions"),
  strugglingWith: jsonb("struggling_with"),
  
  primaryGoal: text("primary_goal"),
  competitionLevel: text("competition_level"),
  
  heightCm: integer("height_cm"),
  weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
  age: integer("age"),
  bodyType: text("body_type"),
  injuries: jsonb("injuries"),
  
  preferredInstructors: jsonb("preferred_instructors"),
  teachingStylePreference: text("teaching_style_preference"),
  videoLengthPreference: text("video_length_preference"),
  
  avgWatchTimeSeconds: integer("avg_watch_time_seconds"),
  favoriteTechniqueTypes: jsonb("favorite_technique_types"),
  skippedTechniqueTypes: jsonb("skipped_technique_types"),
  
  totalInteractions: integer("total_interactions").default(0),
  positiveSignals: integer("positive_signals").default(0),
  negativeSignals: integer("negative_signals").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("idx_user_context_user").on(table.userId),
  beltIdx: index("idx_user_context_belt").on(table.beltLevel),
}));

export const insertAiUserContextSchema = createInsertSchema(aiUserContext).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiUserContext = z.infer<typeof insertAiUserContextSchema>;
export type AiUserContext = typeof aiUserContext.$inferSelect;

// TABLE 5: ai_technique_relationships - Maps how techniques relate to each other
export const aiTechniqueRelationships = pgTable("ai_technique_relationships", {
  id: serial("id").primaryKey(),
  
  techniqueAId: integer("technique_a_id").notNull(),
  techniqueAName: text("technique_a_name"),
  
  techniqueBId: integer("technique_b_id").notNull(),
  techniqueBName: text("technique_b_name"),
  
  relationshipType: text("relationship_type").notNull(),
  relationshipStrength: numeric("relationship_strength", { precision: 3, scale: 2 }),
  
  isBidirectional: boolean("is_bidirectional").default(false),
  
  timesObserved: integer("times_observed").default(1),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  techniqueAIdx: index("idx_rel_technique_a").on(table.techniqueAId),
  techniqueBIdx: index("idx_rel_technique_b").on(table.techniqueBId),
  typeIdx: index("idx_rel_type").on(table.relationshipType),
}));

export const insertAiTechniqueRelationshipSchema = createInsertSchema(aiTechniqueRelationships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiTechniqueRelationship = z.infer<typeof insertAiTechniqueRelationshipSchema>;
export type AiTechniqueRelationship = typeof aiTechniqueRelationships.$inferSelect;

// TABLE 6: ai_confidence_tracking - Tracks AI's confidence in its own decisions
export const aiConfidenceTracking = pgTable("ai_confidence_tracking", {
  id: serial("id").primaryKey(),
  
  decisionType: text("decision_type").notNull(),
  decisionContext: jsonb("decision_context"),
  decisionMade: text("decision_made"),
  
  confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 }),
  dataPointsUsed: integer("data_points_used"),
  uncertaintyFactors: jsonb("uncertainty_factors"),
  
  userId: varchar("user_id"),
  wasCorrect: boolean("was_correct"),
  actualOutcome: text("actual_outcome"),
  
  shouldAdmitUncertainty: boolean("should_admit_uncertainty"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  typeIdx: index("idx_confidence_type").on(table.decisionType),
  userIdx: index("idx_confidence_user").on(table.userId),
}));

export const insertAiConfidenceTrackingSchema = createInsertSchema(aiConfidenceTracking).omit({
  id: true,
  createdAt: true,
});

export type InsertAiConfidenceTracking = z.infer<typeof insertAiConfidenceTrackingSchema>;
export type AiConfidenceTracking = typeof aiConfidenceTracking.$inferSelect;

// TABLE 7: ai_reasoning_traces - Transparent decision-making logs
export const aiReasoningTraces = pgTable("ai_reasoning_traces", {
  id: serial("id").primaryKey(),
  
  decisionId: text("decision_id").notNull(),
  decisionType: text("decision_type"),
  userId: varchar("user_id"),
  
  reasoningSteps: jsonb("reasoning_steps"),
  factorsConsidered: jsonb("factors_considered"),
  alternativesRejected: jsonb("alternatives_rejected"),
  
  finalDecision: text("final_decision"),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  
  showToUser: boolean("show_to_user").default(false),
  userFriendlyExplanation: text("user_friendly_explanation"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  decisionIdx: index("idx_reasoning_decision").on(table.decisionId),
  userIdx: index("idx_reasoning_user").on(table.userId),
}));

export const insertAiReasoningTraceSchema = createInsertSchema(aiReasoningTraces).omit({
  id: true,
  createdAt: true,
});

export type InsertAiReasoningTrace = z.infer<typeof insertAiReasoningTraceSchema>;
export type AiReasoningTrace = typeof aiReasoningTraces.$inferSelect;

// TABLE 8: ai_instructor_profiles - Learn teaching styles and match to users
export const aiInstructorProfiles = pgTable("ai_instructor_profiles", {
  id: serial("id").primaryKey(),
  instructorName: text("instructor_name").notNull().unique(),
  
  teachingStyle: text("teaching_style"),
  explanationDepth: text("explanation_depth"),
  videoLengthAvg: integer("video_length_avg"),
  pace: text("pace"),
  
  specialtyPositions: jsonb("specialty_positions"),
  beltLevelsTargeted: jsonb("belt_levels_targeted"),
  giNogiFocus: text("gi_nogi_focus"),
  
  usersWhoLove: jsonb("users_who_love"),
  usersWhoSkip: jsonb("users_who_skip"),
  avgRating: numeric("avg_rating", { precision: 3, scale: 2 }),
  totalRatings: integer("total_ratings").default(0),
  
  trainedUnder: text("trained_under"),
  notableStudents: jsonb("notable_students"),
  schoolAffiliation: text("school_affiliation"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  nameIdx: index("idx_instructor_name").on(table.instructorName),
}));

export const insertAiInstructorProfileSchema = createInsertSchema(aiInstructorProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiInstructorProfile = z.infer<typeof insertAiInstructorProfileSchema>;
export type AiInstructorProfile = typeof aiInstructorProfiles.$inferSelect;

// TABLE 9: ai_effectiveness_tracking - Track what ACTUALLY works in sparring
export const aiEffectivenessTracking = pgTable("ai_effectiveness_tracking", {
  id: serial("id").primaryKey(),
  
  videoId: integer("video_id"),
  techniqueName: text("technique_name"),
  
  userId: varchar("user_id"),
  userBeltLevel: text("user_belt_level"),
  
  attemptedDate: date("attempted_date"),
  result: text("result"),
  context: text("context"),
  opponentBeltLevel: text("opponent_belt_level"),
  
  userNotes: text("user_notes"),
  whatWorked: text("what_worked"),
  whatDidntWork: text("what_didnt_work"),
  
  effectivenessScore: numeric("effectiveness_score", { precision: 3, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  videoIdx: index("idx_effectiveness_video").on(table.videoId),
  userIdx: index("idx_effectiveness_user").on(table.userId),
  beltIdx: index("idx_effectiveness_belt").on(table.userBeltLevel),
}));

export const insertAiEffectivenessTrackingSchema = createInsertSchema(aiEffectivenessTracking).omit({
  id: true,
  createdAt: true,
});

export type InsertAiEffectivenessTracking = z.infer<typeof insertAiEffectivenessTrackingSchema>;
export type AiEffectivenessTracking = typeof aiEffectivenessTracking.$inferSelect;

// TABLE 10: ai_injury_awareness - Avoid techniques that could aggravate injuries
export const aiInjuryAwareness = pgTable("ai_injury_awareness", {
  id: serial("id").primaryKey(),
  
  injuryType: text("injury_type").notNull(),
  injurySeverity: text("injury_severity"),
  
  riskyTechniques: jsonb("risky_techniques"),
  riskLevel: jsonb("risk_level"),
  
  safeAlternatives: jsonb("safe_alternatives"),
  
  reportedByUsers: jsonb("reported_by_users"),
  timesAggravated: integer("times_aggravated").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  typeIdx: index("idx_injury_type").on(table.injuryType),
}));

export const insertAiInjuryAwarenessSchema = createInsertSchema(aiInjuryAwareness).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiInjuryAwareness = z.infer<typeof insertAiInjuryAwarenessSchema>;
export type AiInjuryAwareness = typeof aiInjuryAwareness.$inferSelect;

// TABLE 11: ai_semantic_embeddings - Vector embeddings for semantic search
export const aiSemanticEmbeddings = pgTable("ai_semantic_embeddings", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull(),
  
  embeddingVector: doublePrecision("embedding_vector").array(),
  embeddingModel: text("embedding_model").default("text-embedding-3-small"),
  
  embeddedText: text("embedded_text"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  videoIdx: index("idx_embedding_video").on(table.videoId),
}));

export const insertAiSemanticEmbeddingSchema = createInsertSchema(aiSemanticEmbeddings).omit({
  id: true,
  createdAt: true,
});

export type InsertAiSemanticEmbedding = z.infer<typeof insertAiSemanticEmbeddingSchema>;
export type AiSemanticEmbedding = typeof aiSemanticEmbeddings.$inferSelect;

// TABLE 12: ai_predictive_models - Anticipate user needs before they ask
export const aiPredictiveModels = pgTable("ai_predictive_models", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  
  predictedNextInterest: jsonb("predicted_next_interest"),
  predictedStruggleAreas: jsonb("predicted_struggle_areas"),
  predictedChurnRisk: numeric("predicted_churn_risk", { precision: 3, scale: 2 }),
  predictedUpgradeLikelihood: numeric("predicted_upgrade_likelihood", { precision: 3, scale: 2 }),
  
  bestSendTime: text("best_send_time"),
  engagementWindows: jsonb("engagement_windows"),
  
  modelVersion: text("model_version"),
  lastTrained: timestamp("last_trained"),
  predictionConfidence: numeric("prediction_confidence", { precision: 3, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("idx_predictive_user").on(table.userId),
}));

export const insertAiPredictiveModelSchema = createInsertSchema(aiPredictiveModels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiPredictiveModel = z.infer<typeof insertAiPredictiveModelSchema>;
export type AiPredictiveModel = typeof aiPredictiveModels.$inferSelect;

// TABLE 13: ai_competition_meta - Track what's working NOW in competitions
export const aiCompetitionMeta = pgTable("ai_competition_meta", {
  id: serial("id").primaryKey(),
  
  techniqueName: text("technique_name"),
  videoId: integer("video_id"),
  
  competitionName: text("competition_name"),
  competitionDate: date("competition_date"),
  ruleSet: text("rule_set"),
  
  timesSeenUsed: integer("times_seen_used").default(1),
  successRate: numeric("success_rate", { precision: 3, scale: 2 }),
  beltDivisions: jsonb("belt_divisions"),
  weightClasses: jsonb("weight_classes"),
  
  trendingUp: boolean("trending_up").default(false),
  trendScore: numeric("trend_score", { precision: 3, scale: 2 }),
  
  videoSource: text("video_source"),
  analyzedBy: text("analyzed_by"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  techniqueIdx: index("idx_meta_technique").on(table.techniqueName),
  dateIdx: index("idx_meta_date").on(table.competitionDate),
  rulesetIdx: index("idx_meta_ruleset").on(table.ruleSet),
}));

export const insertAiCompetitionMetaSchema = createInsertSchema(aiCompetitionMeta).omit({
  id: true,
  createdAt: true,
});

export type InsertAiCompetitionMeta = z.infer<typeof insertAiCompetitionMetaSchema>;
export type AiCompetitionMeta = typeof aiCompetitionMeta.$inferSelect;

// TABLE 14: ai_sentiment_analysis - Detect emotions and adjust communication
export const aiSentimentAnalysis = pgTable("ai_sentiment_analysis", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  
  messageText: text("message_text"),
  messageType: text("message_type"),
  
  sentiment: text("sentiment"),
  sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }),
  emotions: jsonb("emotions"),
  
  userBeltLevel: text("user_belt_level"),
  daysSinceSignup: integer("days_since_signup"),
  recentEngagement: text("recent_engagement"),
  
  aiResponseStrategy: text("ai_response_strategy"),
  shouldHumanReview: boolean("should_human_review").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("idx_sentiment_user").on(table.userId),
  scoreIdx: index("idx_sentiment_score").on(table.sentimentScore),
}));

export const insertAiSentimentAnalysisSchema = createInsertSchema(aiSentimentAnalysis).omit({
  id: true,
  createdAt: true,
});

export type InsertAiSentimentAnalysis = z.infer<typeof insertAiSentimentAnalysisSchema>;
export type AiSentimentAnalysis = typeof aiSentimentAnalysis.$inferSelect;

// TABLE 15: ai_technique_evolution - Track how techniques changed 2010-2025
export const aiTechniqueEvolution = pgTable("ai_technique_evolution", {
  id: serial("id").primaryKey(),
  techniqueName: text("technique_name").notNull(),
  
  year: integer("year").notNull(),
  era: text("era"),
  
  howItChanged: text("how_it_changed"),
  keyInnovators: jsonb("key_innovators"),
  videoExamples: jsonb("video_examples"),
  
  effectivenessThen: numeric("effectiveness_then", { precision: 3, scale: 2 }),
  effectivenessNow: numeric("effectiveness_now", { precision: 3, scale: 2 }),
  stillRelevant: boolean("still_relevant"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  techniqueIdx: index("idx_evolution_technique").on(table.techniqueName),
  yearIdx: index("idx_evolution_year").on(table.year),
}));

export const insertAiTechniqueEvolutionSchema = createInsertSchema(aiTechniqueEvolution).omit({
  id: true,
  createdAt: true,
});

export type InsertAiTechniqueEvolution = z.infer<typeof insertAiTechniqueEvolutionSchema>;
export type AiTechniqueEvolution = typeof aiTechniqueEvolution.$inferSelect;

// TABLE 16: ai_instructor_lineage - Map who trained under whom
export const aiInstructorLineage = pgTable("ai_instructor_lineage", {
  id: serial("id").primaryKey(),
  
  instructorName: text("instructor_name").notNull(),
  
  trainedUnder: text("trained_under"),
  generation: integer("generation"),
  lineagePath: jsonb("lineage_path"),
  
  teachingStyleInherited: text("teaching_style_inherited"),
  notableInnovations: jsonb("notable_innovations"),
  
  notableStudents: jsonb("notable_students"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  instructorIdx: index("idx_lineage_instructor").on(table.instructorName),
}));

export const insertAiInstructorLineageSchema = createInsertSchema(aiInstructorLineage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiInstructorLineage = z.infer<typeof insertAiInstructorLineageSchema>;
export type AiInstructorLineage = typeof aiInstructorLineage.$inferSelect;

// TABLE 17: ai_counter_chains - Complete counter → counter → counter sequences
export const aiCounterChains = pgTable("ai_counter_chains", {
  id: serial("id").primaryKey(),
  
  initialTechniqueId: integer("initial_technique_id").notNull(),
  initialTechniqueName: text("initial_technique_name"),
  
  counterChain: jsonb("counter_chain"),
  chainLength: integer("chain_length"),
  
  positionContext: text("position_context"),
  commonInBeltLevel: text("common_in_belt_level"),
  
  timesObserved: integer("times_observed").default(1),
  successRate: numeric("success_rate", { precision: 3, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  initialIdx: index("idx_counter_initial").on(table.initialTechniqueId),
}));

export const insertAiCounterChainSchema = createInsertSchema(aiCounterChains).omit({
  id: true,
  createdAt: true,
});

export type InsertAiCounterChain = z.infer<typeof insertAiCounterChainSchema>;
export type AiCounterChain = typeof aiCounterChains.$inferSelect;

// TABLE 18: ai_body_type_optimization - Track which techniques work for different body types
export const aiBodyTypeOptimization = pgTable("ai_body_type_optimization", {
  id: serial("id").primaryKey(),
  
  bodyType: text("body_type").notNull(),
  heightRange: text("height_range"),
  weightRange: text("weight_range"),
  
  effectiveTechniques: jsonb("effective_techniques"),
  effectivenessScores: jsonb("effectiveness_scores"),
  
  ineffectiveTechniques: jsonb("ineffective_techniques"),
  
  biomechanicalReasons: jsonb("biomechanical_reasons"),
  
  usersInThisCategory: integer("users_in_this_category").default(0),
  dataConfidence: numeric("data_confidence", { precision: 3, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  typeIdx: index("idx_bodytype_type").on(table.bodyType),
}));

export const insertAiBodyTypeOptimizationSchema = createInsertSchema(aiBodyTypeOptimization).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiBodyTypeOptimization = z.infer<typeof insertAiBodyTypeOptimizationSchema>;
export type AiBodyTypeOptimization = typeof aiBodyTypeOptimization.$inferSelect;

// TABLE 19: ai_gym_culture - Regional meta and gym-specific styles
export const aiGymCulture = pgTable("ai_gym_culture", {
  id: serial("id").primaryKey(),
  
  gymName: text("gym_name"),
  gymCity: text("gym_city"),
  gymRegion: text("gym_region"),
  
  primaryStyle: text("primary_style"),
  metaTechniques: jsonb("meta_techniques"),
  competitionFocus: boolean("competition_focus"),
  
  headInstructor: text("head_instructor"),
  lineage: text("lineage"),
  
  usersAtGym: jsonb("users_at_gym"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  nameIdx: index("idx_gym_name").on(table.gymName),
  regionIdx: index("idx_gym_region").on(table.gymRegion),
}));

export const insertAiGymCultureSchema = createInsertSchema(aiGymCulture).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiGymCulture = z.infer<typeof insertAiGymCultureSchema>;
export type AiGymCulture = typeof aiGymCulture.$inferSelect;

// TABLE 20: ai_terminology_mapping - Map alternative technique names
export const aiTerminologyMapping = pgTable("ai_terminology_mapping", {
  id: serial("id").primaryKey(),
  
  canonicalName: text("canonical_name").notNull().unique(),
  
  alternativeNames: jsonb("alternative_names"),
  regionalVariations: jsonb("regional_variations"),
  slangTerms: jsonb("slang_terms"),
  
  systemNames: jsonb("system_names"),
  
  videoIds: jsonb("video_ids"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  canonicalIdx: index("idx_terminology_canonical").on(table.canonicalName),
}));

export const insertAiTerminologyMappingSchema = createInsertSchema(aiTerminologyMapping).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiTerminologyMapping = z.infer<typeof insertAiTerminologyMappingSchema>;
export type AiTerminologyMapping = typeof aiTerminologyMapping.$inferSelect;

// TABLE 21: ai_competition_rules - Optimize for different rule sets
export const aiCompetitionRules = pgTable("ai_competition_rules", {
  id: serial("id").primaryKey(),
  
  ruleSetName: text("rule_set_name").notNull(),
  
  legalTechniques: jsonb("legal_techniques"),
  illegalTechniques: jsonb("illegal_techniques"),
  pointsSystem: jsonb("points_system"),
  
  highValueTechniques: jsonb("high_value_techniques"),
  lowRiskTechniques: jsonb("low_risk_techniques"),
  riskyTechniques: jsonb("risky_techniques"),
  
  currentMetaTechniques: jsonb("current_meta_techniques"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  nameIdx: index("idx_rules_name").on(table.ruleSetName),
}));

export const insertAiCompetitionRulesSchema = createInsertSchema(aiCompetitionRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiCompetitionRules = z.infer<typeof insertAiCompetitionRulesSchema>;
export type AiCompetitionRules = typeof aiCompetitionRules.$inferSelect;

// TABLE 22: ai_micro_details - Identify tiny details elite instructors all mention
export const aiMicroDetails = pgTable("ai_micro_details", {
  id: serial("id").primaryKey(),
  
  detailDescription: text("detail_description").notNull(),
  techniqueId: integer("technique_id"),
  techniqueName: text("technique_name"),
  
  criticalityScore: numeric("criticality_score", { precision: 3, scale: 2 }),
  mentionedByCount: integer("mentioned_by_count").default(1),
  eliteInstructorsMention: jsonb("elite_instructors_mention"),
  
  failureMode: text("failure_mode"),
  
  videoTimestamps: jsonb("video_timestamps"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  techniqueIdx: index("idx_microdetail_technique").on(table.techniqueId),
  criticalityIdx: index("idx_microdetail_criticality").on(table.criticalityScore),
}));

export const insertAiMicroDetailSchema = createInsertSchema(aiMicroDetails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiMicroDetail = z.infer<typeof insertAiMicroDetailSchema>;
export type AiMicroDetail = typeof aiMicroDetails.$inferSelect;

// TABLE 23: ai_failure_modes - Diagnose WHY techniques fail
export const aiFailureModes = pgTable("ai_failure_modes", {
  id: serial("id").primaryKey(),
  
  techniqueId: integer("technique_id").notNull(),
  techniqueName: text("technique_name"),
  
  failureType: text("failure_type"),
  failureDescription: text("failure_description"),
  
  rootCause: text("root_cause"),
  missingDetail: text("missing_detail"),
  
  solution: text("solution"),
  correctionVideoId: integer("correction_video_id"),
  
  timesReported: integer("times_reported").default(1),
  reportedByBeltLevels: jsonb("reported_by_belt_levels"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  techniqueIdx: index("idx_failure_technique").on(table.techniqueId),
  typeIdx: index("idx_failure_type").on(table.failureType),
}));

export const insertAiFailureModeSchema = createInsertSchema(aiFailureModes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiFailureMode = z.infer<typeof insertAiFailureModeSchema>;
export type AiFailureMode = typeof aiFailureModes.$inferSelect;

// TABLE 24: ai_learning_curves - Predict how long techniques take to learn
export const aiLearningCurves = pgTable("ai_learning_curves", {
  id: serial("id").primaryKey(),
  
  techniqueId: integer("technique_id").notNull(),
  techniqueName: text("technique_name"),
  
  avgTimeToProficiency: jsonb("avg_time_to_proficiency"),
  difficultyByBelt: jsonb("difficulty_by_belt"),
  
  learningStages: jsonb("learning_stages"),
  
  mustKnowFirst: jsonb("must_know_first"),
  acceleratesLearning: jsonb("accelerates_learning"),
  
  usersTracked: integer("users_tracked").default(0),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  techniqueIdx: index("idx_learning_technique").on(table.techniqueId),
}));

export const insertAiLearningCurveSchema = createInsertSchema(aiLearningCurves).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiLearningCurve = z.infer<typeof insertAiLearningCurveSchema>;
export type AiLearningCurve = typeof aiLearningCurves.$inferSelect;

// TABLE 25: ai_attribution - Who invented/popularized each technique
export const aiAttribution = pgTable("ai_attribution", {
  id: serial("id").primaryKey(),
  
  techniqueId: integer("technique_id").notNull(),
  techniqueName: text("technique_name"),
  
  inventor: text("inventor"),
  inventorYear: integer("inventor_year"),
  popularizedBy: text("popularized_by"),
  popularizedYear: integer("popularized_year"),
  
  originalForm: text("original_form"),
  modernVariations: jsonb("modern_variations"),
  
  originStory: text("origin_story"),
  culturalSignificance: text("cultural_significance"),
  
  sources: jsonb("sources"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  techniqueIdx: index("idx_attribution_technique").on(table.techniqueId),
  inventorIdx: index("idx_attribution_inventor").on(table.inventor),
}));

export const insertAiAttributionSchema = createInsertSchema(aiAttribution).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiAttribution = z.infer<typeof insertAiAttributionSchema>;
export type AiAttribution = typeof aiAttribution.$inferSelect;

// TABLE 26: ai_training_load - Detect overtraining and recommend recovery
export const aiTrainingLoad = pgTable("ai_training_load", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  
  weekStartDate: date("week_start_date").notNull(),
  sessionsThisWeek: integer("sessions_this_week").default(0),
  totalTrainingMinutes: integer("total_training_minutes").default(0),
  highIntensitySessions: integer("high_intensity_sessions").default(0),
  
  engagementScore: numeric("engagement_score", { precision: 3, scale: 2 }),
  messageResponseTime: integer("message_response_time"),
  enthusiasmScore: numeric("enthusiasm_score", { precision: 3, scale: 2 }),
  
  fatigueLevel: text("fatigue_level"),
  warningSigns: jsonb("warning_signs"),
  
  shouldRecommendRest: boolean("should_recommend_rest").default(false),
  recommendedActions: jsonb("recommended_actions"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("idx_training_load_user").on(table.userId),
  weekIdx: index("idx_training_load_week").on(table.weekStartDate),
}));

export const insertAiTrainingLoadSchema = createInsertSchema(aiTrainingLoad).omit({
  id: true,
  createdAt: true,
});

export type InsertAiTrainingLoad = z.infer<typeof insertAiTrainingLoadSchema>;
export type AiTrainingLoad = typeof aiTrainingLoad.$inferSelect;

// TABLE 27: ai_user_journey - Track white → black belt over 10 years
export const aiUserJourney = pgTable("ai_user_journey", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  
  signupDate: date("signup_date"),
  startingBelt: text("starting_belt"),
  currentBelt: text("current_belt"),
  beltPromotions: jsonb("belt_promotions"),
  
  techniquesMastered: jsonb("techniques_mastered"),
  positionExpertise: jsonb("position_expertise"),
  
  trainingFrequencyHistory: jsonb("training_frequency_history"),
  focusAreasOverTime: jsonb("focus_areas_over_time"),
  
  competitionsEntered: jsonb("competitions_entered"),
  
  totalTechniquesLearned: integer("total_techniques_learned").default(0),
  avgLearningSpeed: numeric("avg_learning_speed", { precision: 3, scale: 2 }),
  retentionRate: numeric("retention_rate", { precision: 3, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("idx_journey_user").on(table.userId),
  beltIdx: index("idx_journey_belt").on(table.currentBelt),
}));

export const insertAiUserJourneySchema = createInsertSchema(aiUserJourney).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiUserJourney = z.infer<typeof insertAiUserJourneySchema>;
export type AiUserJourney = typeof aiUserJourney.$inferSelect;

// TABLE 28: ai_conversation_learning - Extract valuable info from chats, ignore noise
export const aiConversationLearning = pgTable("ai_conversation_learning", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  
  messageText: text("message_text").notNull(),
  messageType: text("message_type"),
  conversationDate: timestamp("conversation_date").defaultNow(),
  
  containsValuableSignal: boolean("contains_valuable_signal").default(false),
  extractedInsights: jsonb("extracted_insights"),
  
  conversationTopic: text("conversation_topic"),
  sentiment: text("sentiment"),
  
  shouldUpdateProfile: boolean("should_update_profile").default(false),
  profileUpdates: jsonb("profile_updates"),
  
  isNoise: boolean("is_noise").default(false),
  noiseReason: text("noise_reason"),
  
  // Dual-model AI tracking
  modelUsed: text("model_used"), // 'gpt-4o', 'claude-sonnet-4', 'gpt-4o-fallback'
  complexityScore: integer("complexity_score"), // 0-10 complexity rating
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("idx_conversation_user").on(table.userId),
  signalIdx: index("idx_conversation_signal").on(table.containsValuableSignal),
  topicIdx: index("idx_conversation_topic").on(table.conversationTopic),
  modelIdx: index("idx_conversation_model").on(table.modelUsed),
}));

export const insertAiConversationLearningSchema = createInsertSchema(aiConversationLearning).omit({
  id: true,
  conversationDate: true,
  createdAt: true,
});

export type InsertAiConversationLearning = z.infer<typeof insertAiConversationLearningSchema>;
export type AiConversationLearning = typeof aiConversationLearning.$inferSelect;

// Admin Chat History table - For admin to test AI coach
export const adminChatHistory = pgTable("admin_chat_history", {
  id: serial("id").primaryKey(),
  adminId: varchar("admin_id").notNull(),
  sender: text("sender").notNull(), // 'user' or 'assistant'
  message: text("message").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertAdminChatHistorySchema = createInsertSchema(adminChatHistory).omit({
  id: true,
  timestamp: true,
});

export type InsertAdminChatHistory = z.infer<typeof insertAdminChatHistorySchema>;
export type AdminChatHistory = typeof adminChatHistory.$inferSelect;

// TABLE 29: ai_feature_flags - Control gradual rollout of all AI features
export const aiFeatureFlags = pgTable("ai_feature_flags", {
  id: serial("id").primaryKey(),
  
  featureName: text("feature_name").notNull().unique(),
  featureDescription: text("feature_description"),
  
  isEnabled: boolean("is_enabled").default(false),
  rolloutPercentage: integer("rollout_percentage").default(0),
  enabledForUsers: jsonb("enabled_for_users"),
  disabledForUsers: jsonb("disabled_for_users"),
  
  canRollback: boolean("can_rollback").default(true),
  rollbackReason: text("rollback_reason"),
  
  errorCount: integer("error_count").default(0),
  successCount: integer("success_count").default(0),
  lastErrorAt: timestamp("last_error_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  nameIdx: index("idx_feature_name").on(table.featureName),
}));

export const insertAiFeatureFlagSchema = createInsertSchema(aiFeatureFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiFeatureFlag = z.infer<typeof insertAiFeatureFlagSchema>;
export type AiFeatureFlag = typeof aiFeatureFlags.$inferSelect;

// User Saved Videos table - for mobile PWA saved videos
export const userSavedVideos = pgTable("user_saved_videos", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  videoId: integer("video_id").notNull(),
  note: text("note"),
  savedDate: timestamp("saved_date").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_saved_videos_user").on(table.userId),
  userVideoUnique: index("idx_user_video_unique").on(table.userId, table.videoId),
}));

export const insertUserSavedVideoSchema = createInsertSchema(userSavedVideos).omit({
  id: true,
  savedDate: true,
});

export type InsertUserSavedVideo = z.infer<typeof insertUserSavedVideoSchema>;
export type UserSavedVideo = typeof userSavedVideos.$inferSelect;

// Admin Users table - for admin dashboard authentication
export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("admin"), // admin, super_admin
  active: boolean("active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
});

export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsers.$inferSelect;

// Lifetime Memberships table - tracks who granted lifetime access
export const lifetimeMemberships = pgTable("lifetime_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(), // Links to bjj_users.id
  grantedBy: varchar("granted_by").notNull(), // Links to admin_users.id
  reason: text("reason").notNull(), // Why was this granted (beta tester, VIP, etc.)
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  notes: text("notes"), // Additional admin notes
});

export const insertLifetimeMembershipSchema = createInsertSchema(lifetimeMemberships).omit({
  id: true,
  grantedAt: true,
});

export type InsertLifetimeMembership = z.infer<typeof insertLifetimeMembershipSchema>;
export type LifetimeMembership = typeof lifetimeMemberships.$inferSelect;

// Admin Activity Log - tracks all admin actions for auditing
export const adminActivityLog = pgTable("admin_activity_log", {
  id: serial("id").primaryKey(),
  adminId: varchar("admin_id").notNull(), // Links to admin_users.id
  action: text("action").notNull(), // grant_lifetime, update_subscription, create_referral, etc.
  targetType: text("target_type"), // user, subscription, referral, etc.
  targetId: text("target_id"), // ID of the affected entity
  details: jsonb("details"), // Additional action details
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  adminIdx: index("idx_admin_activity_admin").on(table.adminId),
  actionIdx: index("idx_admin_activity_action").on(table.action),
}));

export const insertAdminActivityLogSchema = createInsertSchema(adminActivityLog).omit({
  id: true,
  createdAt: true,
});

export type InsertAdminActivityLog = z.infer<typeof insertAdminActivityLogSchema>;
export type AdminActivityLog = typeof adminActivityLog.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// USER FEEDBACK SYSTEM - Context-aware video feedback with Professor OS responses
// ═══════════════════════════════════════════════════════════════════════════════

// User Video Feedback - Detailed feedback with categories and context
export const userVideoFeedback = pgTable("user_video_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => bjjUsers.id, { onDelete: 'cascade' }),
  videoId: integer("video_id").notNull().references(() => aiVideoKnowledge.id, { onDelete: 'cascade' }),
  
  // Basic feedback
  helpful: boolean("helpful").notNull(),
  
  // Detailed category (when helpful = false)
  feedbackCategory: text("feedback_category"),
  // Options: 'video_quality_poor', 'wrong_recommendation', 'too_advanced', 'too_basic', 'wrong_style', 'other'
  
  feedbackText: text("feedback_text"), // Optional user comment
  
  // Context at time of recommendation
  userBeltLevel: text("user_belt_level"),
  userQuery: text("user_query"),
  techniqueSearched: text("technique_searched"),
  recommendationContext: jsonb("recommendation_context"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_user_vfeedback_user").on(table.userId),
  videoIdx: index("idx_user_vfeedback_video").on(table.videoId),
  categoryIdx: index("idx_user_vfeedback_category").on(table.feedbackCategory),
}));

export const insertUserVideoFeedbackSchema = createInsertSchema(userVideoFeedback).omit({
  id: true,
  createdAt: true,
});

export type InsertUserVideoFeedback = z.infer<typeof insertUserVideoFeedbackSchema>;
export type UserVideoFeedback = typeof userVideoFeedback.$inferSelect;

// User Feedback Statistics - Tracks user's feedback contributions
export const userFeedbackStats = pgTable("user_feedback_stats", {
  userId: varchar("user_id").primaryKey().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  totalFeedbackGiven: integer("total_feedback_given").default(0).notNull(),
  helpfulGiven: integer("helpful_given").default(0).notNull(),
  notHelpfulGiven: integer("not_helpful_given").default(0).notNull(),
  videosHelpedRemove: integer("videos_helped_remove").default(0).notNull(),
  videosHelpedImprove: integer("videos_helped_improve").default(0).notNull(),
  lastAppreciationShownAt: timestamp("last_appreciation_shown_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserFeedbackStatsSchema = createInsertSchema(userFeedbackStats).omit({
  updatedAt: true,
});

export type InsertUserFeedbackStats = z.infer<typeof insertUserFeedbackStatsSchema>;
export type UserFeedbackStats = typeof userFeedbackStats.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// SMART VIDEO RANKING SYSTEM - Personalized recommendations based on patterns
// ═══════════════════════════════════════════════════════════════════════════════

// Video Success Patterns - Track which videos work for which user types
export const videoSuccessPatterns = pgTable("video_success_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: integer("video_id").references(() => aiVideoKnowledge.id, { onDelete: 'cascade' }),
  
  // User profile that found it helpful
  beltLevel: text("belt_level"),
  bodyType: text("body_type"),
  ageRange: text("age_range"),
  trainingStyle: text("training_style"),
  
  // Success metrics
  helpfulCount: integer("helpful_count").default(0).notNull(),
  totalViews: integer("total_views").default(0).notNull(),
  successRate: numeric("success_rate", { precision: 5, scale: 2 }).default("0").notNull(),
  
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  beltIdx: index("idx_video_success_belt").on(table.beltLevel, table.successRate),
  bodyIdx: index("idx_video_success_body").on(table.bodyType, table.successRate),
  videoIdx: index("idx_video_success_video").on(table.videoId),
  uniquePattern: index("idx_unique_pattern").on(table.videoId, table.beltLevel, table.bodyType, table.ageRange, table.trainingStyle),
}));

export const insertVideoSuccessPatternSchema = createInsertSchema(videoSuccessPatterns).omit({
  id: true,
  updatedAt: true,
});

export type InsertVideoSuccessPattern = z.infer<typeof insertVideoSuccessPatternSchema>;
export type VideoSuccessPattern = typeof videoSuccessPatterns.$inferSelect;

// User Video Interactions - Track user's video interaction history
export const userVideoInteractions = pgTable("user_video_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => bjjUsers.id, { onDelete: 'cascade' }),
  videoId: integer("video_id").references(() => aiVideoKnowledge.id, { onDelete: 'cascade' }),
  
  // Interaction type
  viewed: boolean("viewed").default(false),
  watchedDurationSeconds: integer("watched_duration_seconds"),
  clickedKeyDetail: boolean("clicked_key_detail").default(false),
  
  // Outcome
  markedHelpful: boolean("marked_helpful"),
  appliedInTraining: boolean("applied_in_training").default(false),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_user_interactions_user").on(table.userId),
  videoIdx: index("idx_user_interactions_video").on(table.videoId),
  uniqueInteraction: index("idx_unique_interaction").on(table.userId, table.videoId),
}));

export const insertUserVideoInteractionSchema = createInsertSchema(userVideoInteractions).omit({
  id: true,
  createdAt: true,
});

export type InsertUserVideoInteraction = z.infer<typeof insertUserVideoInteractionSchema>;
export type UserVideoInteraction = typeof userVideoInteractions.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// META MONITORING SYSTEM - User Requests & Auto-Curation
// ═══════════════════════════════════════════════════════════════════════════════

// User Technique Requests - Track what users are asking about (auto-extracted from chat)
export const userTechniqueRequests = pgTable("user_technique_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  userId: varchar("user_id").references(() => bjjUsers.id, { onDelete: 'cascade' }),
  techniqueMentioned: text("technique_mentioned").notNull(),
  requestContext: text("request_context").notNull(), // Their actual question
  
  // Pattern detection
  requestType: text("request_type"), // "how_to_do", "how_to_defend", "drilling", "variations"
  beltLevel: text("belt_level"),
  giPreference: text("gi_preference"), // gi, nogi, both
  
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
}, (table) => ({
  techniqueIdx: index("idx_user_requests_technique").on(table.techniqueMentioned, table.requestedAt),
  userIdx: index("idx_user_requests_user").on(table.userId),
  typeIdx: index("idx_user_requests_type").on(table.requestType, table.techniqueMentioned),
}));

export const insertUserTechniqueRequestSchema = createInsertSchema(userTechniqueRequests).omit({
  id: true,
  requestedAt: true,
});

export type InsertUserTechniqueRequest = z.infer<typeof insertUserTechniqueRequestSchema>;
export type UserTechniqueRequest = typeof userTechniqueRequests.$inferSelect;

// Technique Meta Status - Aggregated meta insights and auto-curation priorities
export const techniqueMetaStatus = pgTable("technique_meta_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  techniqueName: text("technique_name").notNull().unique(),
  
  // Trend signals (0-10 scores)
  userRequestScore: numeric("user_request_score", { precision: 5, scale: 2 }).default("0").notNull(),
  competitionMetaScore: numeric("competition_meta_score", { precision: 5, scale: 2 }).default("0").notNull(),
  
  // Combined meta score (weighted average)
  overallMetaScore: numeric("overall_meta_score", { precision: 5, scale: 2 }).default("0").notNull(),
  metaStatus: text("meta_status").default("stable").notNull(), // "rising", "hot", "cooling", "stable"
  
  // Library coverage
  videosInLibrary: integer("videos_in_library").default(0).notNull(),
  highestQualityVideoScore: numeric("highest_quality_video_score", { precision: 5, scale: 2 }),
  coverageAdequate: boolean("coverage_adequate").default(false).notNull(),
  
  // Auto-curation
  needsCuration: boolean("needs_curation").default(false).notNull(),
  curationPriority: integer("curation_priority").default(0).notNull(), // 1-10
  suggestedSearches: text("suggested_searches").array(), // Auto-generated search queries
  
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
}, (table) => ({
  techniqueIdx: index("idx_meta_status_technique").on(table.techniqueName),
  metaScoreIdx: index("idx_meta_status_score").on(table.overallMetaScore),
  needsCurationIdx: index("idx_meta_status_curation").on(table.needsCuration, table.curationPriority),
  statusIdx: index("idx_meta_status_status").on(table.metaStatus, table.overallMetaScore),
}));

export const insertTechniqueMetaStatusSchema = createInsertSchema(techniqueMetaStatus).omit({
  id: true,
  lastUpdated: true,
});

export type InsertTechniqueMetaStatus = z.infer<typeof insertTechniqueMetaStatusSchema>;
export type TechniqueMetaStatus = typeof techniqueMetaStatus.$inferSelect;

// Competition Meta Tracking - Track techniques trending at major competitions (Issue #7)
export const competitionMetaTracking = pgTable("competition_meta_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Competition details
  competitionName: text("competition_name").notNull(), // "ADCC 2024", "IBJJF Worlds 2024"
  competitionDate: date("competition_date").notNull(),
  competitionCategory: text("competition_category"), // "gi", "no-gi", "both"
  
  // Technique tracking
  techniqueName: text("technique_name").notNull(),
  techniqueCategory: text("technique_category"), // "submission", "pass", "guard", "takedown"
  
  // Usage stats
  totalOccurrences: integer("total_occurrences").default(0), // How many times seen
  winsByTechnique: integer("wins_by_technique").default(0), // How many times it won
  winRate: numeric("win_rate", { precision: 5, scale: 2 }).default("0"), // % of time it resulted in a win
  
  // Notable users
  notableAthletes: text("notable_athletes").array(), // ["Gordon Ryan", "Lachlan Giles"]
  medalCount: integer("medal_count").default(0), // How many medal winners used it
  
  // Trend analysis
  trendStatus: text("trend_status").default("stable"), // "hot", "rising", "stable", "declining"
  previousYearOccurrences: integer("previous_year_occurrences").default(0),
  changePercentage: numeric("change_percentage", { precision: 5, scale: 2 }).default("0"),
  
  // Source and verification
  dataSource: text("data_source"), // "manual_entry", "video_analysis", "web_scraping"
  verified: boolean("verified").default(false),
  verifiedBy: text("verified_by"),
  
  // Notes
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  techniqueIdx: index("idx_comp_meta_technique").on(table.techniqueName, table.competitionDate),
  competitionIdx: index("idx_comp_meta_competition").on(table.competitionName, table.competitionDate),
  trendIdx: index("idx_comp_meta_trend").on(table.trendStatus, table.totalOccurrences),
  dateIdx: index("idx_comp_meta_date").on(table.competitionDate),
}));

export const insertCompetitionMetaTrackingSchema = createInsertSchema(competitionMetaTracking).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCompetitionMetaTracking = z.infer<typeof insertCompetitionMetaTrackingSchema>;
export type CompetitionMetaTracking = typeof competitionMetaTracking.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// INSTRUCTOR CREDIBILITY & PARTNERSHIP MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// Instructor Credibility - Tiered system for quality control
export const instructorCredibility = pgTable("instructor_credibility", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  tier: integer("tier").notNull(), // 1=elite, 2=established
  qualityThreshold: numeric("quality_threshold", { precision: 3, scale: 1 }).notNull(), // 6.5, 7.0, or 7.5
  
  // PRIORITY SYSTEM (CRITICAL - HANDLES AUTO + MANUAL)
  priorityMode: text("priority_mode").default("auto").notNull(), // 'auto' or 'manual' - LOCKS the mode
  autoCalculatedPriority: integer("auto_calculated_priority").default(0), // Always stores AI calculation
  manualOverridePriority: integer("manual_override_priority"), // NULL if auto, SET if manual
  recommendationPriority: integer("recommendation_priority").default(0).notNull(), // ACTUAL priority used
  
  // TRACKING & AUDIT
  lastAutoCalculation: timestamp("last_auto_calculation"),
  manualOverrideDate: timestamp("manual_override_date"), // When admin changed it
  manualOverrideBy: text("manual_override_by"), // Admin email/ID
  manualOverrideReason: text("manual_override_reason"), // "Featured for launch week"
  
  // AI CALCULATION INPUTS (SCRAPED DATA)
  achievements: jsonb("achievements").default([]), // ['IBJJF World Champion', ...]
  youtubeChannelId: text("youtube_channel_id"),
  youtubeChannelHandle: text("youtube_channel_handle"),
  youtubeSubscribers: integer("youtube_subscribers").default(0),
  youtubeVideoCount: integer("youtube_video_count").default(0),
  youtubeLastScraped: timestamp("youtube_last_scraped"),
  
  hasInstructionalSeries: boolean("has_instructional_series").default(false),
  instructionalPlatforms: jsonb("instructional_platforms").default([]), // ['BJJ Fanatics', ...]
  
  // USER FEEDBACK (AUTO-CALCULATED FROM video_feedback)
  totalVideos: integer("total_videos").default(0),
  helpfulCount: integer("helpful_count").default(0),
  notHelpfulCount: integer("not_helpful_count").default(0),
  helpfulRatio: numeric("helpful_ratio", { precision: 5, scale: 2 }).default("0"),
  
  // Credentials
  competitionRecord: text("competition_record"),
  beltRank: text("belt_rank").default("Black Belt"),
  academyAffiliation: text("academy_affiliation"),
  
  // Specialties
  specialties: text("specialties").array(), // ["pressure passing", "leg locks"]
  bestForBeltLevel: text("best_for_belt_level").array(), // ["white", "blue", "purple"]
  
  // Teaching style
  teachingLanguage: text("teaching_language").default("english"),
  instructionStyle: text("instruction_style"), // "systematic", "conceptual", "technical_detail"
  
  // Analytics (LEGACY - being replaced by new fields above)
  videosInLibrary: integer("videos_in_library").default(0),
  avgHelpfulRatio: numeric("avg_helpful_ratio", { precision: 5, scale: 2 }),
  totalRecommendations: integer("total_recommendations").default(0),
  
  // NEW: Manual Promotion Controls (Part 12 - Issue #5)
  featureLevel: integer("feature_level").default(1), // 1-5 stars (1=normal, 5=heavily featured)
  searchBoost: integer("search_boost").default(0), // 0-100% boost in search rankings
  recommendationBoost: integer("recommendation_boost").default(0), // 0-100% boost in recommendations (separate from priority)
  homepageFeatured: boolean("homepage_featured").default(false), // Show in "Featured Instructors" section
  partnershipStatus: text("partnership_status").default("regular"), // "regular", "affiliate", "active_partner", "featured_partner", "blacklisted"
  
  // AUTO-DISCOVERY SYSTEM (Issue #5 Part 1)
  autoDiscovered: boolean("auto_discovered").default(false), // Was this instructor auto-discovered during curation?
  discoverySource: text("discovery_source"), // "video_curation", "manual_addition", "youtube_search"
  discoveredAt: timestamp("discovered_at"), // When first discovered
  needsAdminReview: boolean("needs_admin_review").default(false), // Flag for admin to review new instructors
  adminReviewed: boolean("admin_reviewed").default(false), // Has admin reviewed this instructor?
  adminReviewedBy: text("admin_reviewed_by"), // Admin who reviewed
  adminReviewedAt: timestamp("admin_reviewed_at"), // When reviewed
  adminReviewNotes: text("admin_review_notes"), // Admin's notes from review
  
  // DISCOVERY METADATA
  firstVideoId: text("first_video_id"), // First video that led to discovery
  videosFoundDuringDiscovery: integer("videos_found_during_discovery").default(0), // How many videos found when discovered
  autoTierAssignment: text("auto_tier_assignment"), // AI's suggested tier: "elite", "established", "under_review"
  autoTierReason: text("auto_tier_reason"), // Why AI suggested this tier
  
  // Notes
  notes: text("notes"),
  isUserInstructor: boolean("is_user_instructor").default(false),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tierIdx: index("idx_instructor_tier").on(table.tier),
  nameIdx: index("idx_instructor_cred_name").on(table.name),
  userInstructorIdx: index("idx_user_instructor").on(table.isUserInstructor),
  priorityIdx: index("idx_instructor_priority").on(table.recommendationPriority),
  priorityModeIdx: index("idx_instructor_mode").on(table.priorityMode),
  activeIdx: index("idx_instructor_active").on(table.isActive),
}));

export const insertInstructorCredibilitySchema = createInsertSchema(instructorCredibility).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInstructorCredibility = z.infer<typeof insertInstructorCredibilitySchema>;
export type InstructorCredibility = typeof instructorCredibility.$inferSelect;

// Curation Search Queue - Queued searches for automated curation
export const curationSearchQueue = pgTable("curation_search_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Basic info
  searchQuery: text("search_query").notNull(),
  category: text("category"), // "submissions", "passing", "guards"
  priority: integer("priority").default(5).notNull(), // 1-10 (10 = highest)
  
  // Source tracking
  searchType: text("search_type").default("pre_written").notNull(), // "pre_written", "ai_generated", "manual"
  generatedReason: text("generated_reason"), // "user_gap", "youtube_trend", "coverage_gap"
  generatedBy: text("generated_by").default("system"),
  
  // Targeting
  instructorFocus: text("instructor_focus"), // "JT Torres", "Danaher", null
  beltLevelTarget: text("belt_level_target"), // "white/blue", "purple+", "all"
  techniqueFocus: text("technique_focus"),
  
  // Execution tracking
  executed: boolean("executed").default(false).notNull(),
  executedAt: timestamp("executed_at"),
  videosFound: integer("videos_found").default(0),
  videosAdded: integer("videos_added").default(0),
  acceptanceRate: numeric("acceptance_rate", { precision: 5, scale: 2 }),
  
  // Meta
  weekNumber: integer("week_number"), // 1, 2, 3...
  dayNumber: integer("day_number"), // 1-7 (for Week 1 structure)
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  executedIdx: index("idx_queue_executed").on(table.executed, table.priority),
  categoryIdx: index("idx_queue_category").on(table.category),
  priorityIdx: index("idx_queue_priority").on(table.priority),
}));

export const insertCurationSearchQueueSchema = createInsertSchema(curationSearchQueue).omit({
  id: true,
  createdAt: true,
});

export type InsertCurationSearchQueue = z.infer<typeof insertCurationSearchQueueSchema>;
export type CurationSearchQueue = typeof curationSearchQueue.$inferSelect;

// Curation Runs - Track automated curation execution
export const curationRuns = pgTable("curation_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runDate: timestamp("run_date").defaultNow().notNull(),
  runType: text("run_type").default("scheduled").notNull(), // "scheduled", "manual", "test"
  
  searchCategory: text("search_category"), // "Day 1: JT Torres + Meta", "Smart Searches"
  
  searchesPlanned: integer("searches_planned"),
  searchesCompleted: integer("searches_completed").default(0),
  searchesFailed: integer("searches_failed").default(0),
  
  // CURATION EFFICIENCY METRICS
  videosScreened: integer("videos_screened").default(0), // Total videos found from YouTube API
  videosAnalyzed: integer("videos_analyzed").default(0), // Videos sent through AI analysis
  videosAdded: integer("videos_added").default(0), // Videos accepted (passed quality threshold)
  videosRejected: integer("videos_rejected").default(0), // Videos rejected (didn't meet criteria)
  
  // SKIP REASON BREAKDOWN (videosScreened - videosAnalyzed)
  videosSkippedDuration: integer("videos_skipped_duration").default(0), // Filtered by 70s minimum
  videosSkippedDuplicates: integer("videos_skipped_duplicates").default(0), // Already in library
  videosSkippedQuota: integer("videos_skipped_quota").default(0), // Quota exhausted mid-run
  videosSkippedOther: integer("videos_skipped_other").default(0), // Other pre-analysis filters
  
  acceptanceRate: numeric("acceptance_rate", { precision: 5, scale: 2 }), // (videosAdded / videosAnalyzed) * 100
  guardrailStatus: text("guardrail_status"), // "ok", "low", "high", "critical" based on acceptance rate
  
  // API EFFICIENCY METRICS
  apiUnitsUsed: integer("api_units_used").default(0), // Total YouTube API quota units used
  costPerAcceptedVideo: numeric("cost_per_accepted_video", { precision: 8, scale: 4 }), // API cost per accepted video
  
  status: text("status").default("running").notNull(), // "running", "completed", "failed", "paused"
  errorMessage: text("error_message"),
  
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  runDateIdx: index("idx_runs_date").on(table.runDate),
  statusIdx: index("idx_runs_status").on(table.status),
  runTypeIdx: index("idx_runs_type").on(table.runType),
}));

export const insertCurationRunSchema = createInsertSchema(curationRuns).omit({
  id: true,
  startedAt: true,
  createdAt: true,
});

export type InsertCurationRun = z.infer<typeof insertCurationRunSchema>;
export type CurationRun = typeof curationRuns.$inferSelect;

// Fully Mined Instructors - Track instructors that have been exhausted for curation
export const fullyMinedInstructors = pgTable("fully_mined_instructors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instructorName: text("instructor_name").notNull().unique(),
  minedAt: timestamp("mined_at").defaultNow().notNull(),
  cooldownUntil: timestamp("cooldown_until").notNull(),
  consecutiveEmptyRuns: integer("consecutive_empty_runs").default(1),
  lastVideoCount: integer("last_video_count"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  instructorIdx: index("idx_mined_instructor").on(table.instructorName),
  cooldownIdx: index("idx_mined_cooldown").on(table.cooldownUntil),
}));

export const insertFullyMinedInstructorSchema = createInsertSchema(fullyMinedInstructors).omit({
  id: true,
  minedAt: true,
  createdAt: true,
});

export type InsertFullyMinedInstructor = z.infer<typeof insertFullyMinedInstructorSchema>;
export type FullyMinedInstructor = typeof fullyMinedInstructors.$inferSelect;

// Search Queries Log - Detailed log of each search executed
export const searchQueriesLog = pgTable("search_queries_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").references(() => curationRuns.id),
  searchQueueId: varchar("search_queue_id").references(() => curationSearchQueue.id),
  
  queryText: text("query_text").notNull(),
  resultsFound: integer("results_found").default(0),
  videosAnalyzed: integer("videos_analyzed").default(0),
  videosAdded: integer("videos_added").default(0),
  videosRejected: integer("videos_rejected").default(0),
  
  acceptanceRate: numeric("acceptance_rate", { precision: 5, scale: 2 }),
  errorMessage: text("error_message"),
  
  executedAt: timestamp("executed_at").defaultNow().notNull(),
}, (table) => ({
  runIdIdx: index("idx_queries_run").on(table.runId),
  queueIdIdx: index("idx_queries_queue").on(table.searchQueueId),
  executedIdx: index("idx_queries_executed").on(table.executedAt),
}));

export const insertSearchQueryLogSchema = createInsertSchema(searchQueriesLog).omit({
  id: true,
  executedAt: true,
});

export type InsertSearchQueryLog = z.infer<typeof insertSearchQueryLogSchema>;
export type SearchQueryLog = typeof searchQueriesLog.$inferSelect;

// Video Screening Log - Track every single video screening attempt
export const videoScreeningLog = pgTable("video_screening_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").references(() => curationRuns.id),
  queryId: varchar("query_id").references(() => searchQueriesLog.id),
  
  youtubeVideoId: text("youtube_video_id").notNull(),
  videoTitle: text("video_title").notNull(),
  channelName: text("channel_name").notNull(),
  searchQuery: text("search_query").notNull(),
  
  qualityScore: numeric("quality_score", { precision: 5, scale: 2 }),
  instructorCredibility: text("instructor_credibility"), // 'high', 'medium', 'low'
  
  accepted: boolean("accepted").notNull(),
  rejectionReason: text("rejection_reason"),
  
  screenedAt: timestamp("screened_at").defaultNow().notNull(),
}, (table) => ({
  runIdIdx: index("idx_screening_run").on(table.runId),
  queryIdIdx: index("idx_screening_query").on(table.queryId),
  acceptedIdx: index("idx_screening_accepted").on(table.accepted),
  screenedAtIdx: index("idx_screening_date").on(table.screenedAt),
  youtubeIdIdx: index("idx_screening_youtube").on(table.youtubeVideoId),
}));

export const insertVideoScreeningLogSchema = createInsertSchema(videoScreeningLog).omit({
  id: true,
  screenedAt: true,
});

export type InsertVideoScreeningLog = z.infer<typeof insertVideoScreeningLogSchema>;
export type VideoScreeningLog = typeof videoScreeningLog.$inferSelect;

// System Alerts - Proactive monitoring and notifications
export const systemAlerts = pgTable("system_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  severity: text("severity").notNull(), // 'critical', 'warning', 'info'
  title: text("title").notNull(),
  message: text("message").notNull(),
  
  dismissed: boolean("dismissed").default(false).notNull(),
  dismissedAt: timestamp("dismissed_at"),
  dismissedBy: varchar("dismissed_by"), // Admin user ID who dismissed
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  severityIdx: index("idx_alerts_severity").on(table.severity),
  dismissedIdx: index("idx_alerts_dismissed").on(table.dismissed),
  createdIdx: index("idx_alerts_created").on(table.createdAt),
}));

export const insertSystemAlertSchema = createInsertSchema(systemAlerts).omit({
  id: true,
  createdAt: true,
});

export type InsertSystemAlert = z.infer<typeof insertSystemAlertSchema>;
export type SystemAlert = typeof systemAlerts.$inferSelect;

// Featured Instructors - Partnership and promotional management
export const featuredInstructors = pgTable("featured_instructors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instructorId: varchar("instructor_id").references(() => instructorCredibility.id),
  
  // Feature settings
  featureLevel: text("feature_level").notNull(), // 'primary', 'secondary', 'spotlight'
  searchPriorityPercentage: integer("search_priority_percentage").notNull(), // 20, 10, 5
  recommendationBoostPercentage: integer("recommendation_boost_percentage").notNull(), // 50, 30, 15
  
  // Display settings
  showBadge: boolean("show_badge").default(true).notNull(),
  showNameCallout: boolean("show_name_callout").default(true).notNull(),
  customCalloutText: text("custom_callout_text"), // "Your instructor", "Elite competitor"
  
  // Duration
  startDate: date("start_date").defaultNow().notNull(),
  endDate: date("end_date"), // NULL = permanent
  isActive: boolean("is_active").default(true).notNull(),
  
  // Partnership details
  partnershipType: text("partnership_type"), // 'co_founder', 'promotional', 'standard'
  partnershipAgreement: text("partnership_agreement"),
  
  // Their commitment
  socialPostCompleted: boolean("social_post_completed").default(false),
  socialPostDate: date("social_post_date"),
  linkInBioUntil: date("link_in_bio_until"),
  
  // Tracking
  totalRecommendations: integer("total_recommendations").default(0),
  totalVideoViews: integer("total_video_views").default(0),
  monthlyRecommendationCount: integer("monthly_recommendation_count").default(0),
  
  // Notes
  partnershipNotes: text("partnership_notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  instructorIdx: index("idx_featured_instructor").on(table.instructorId),
  activeIdx: index("idx_featured_active").on(table.isActive, table.featureLevel),
  dateIdx: index("idx_featured_dates").on(table.startDate, table.endDate),
}));

export const insertFeaturedInstructorSchema = createInsertSchema(featuredInstructors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFeaturedInstructor = z.infer<typeof insertFeaturedInstructorSchema>;
export type FeaturedInstructor = typeof featuredInstructors.$inferSelect;

// Curation Settings - System-wide curation configuration
export const curationSettings = pgTable("curation_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingName: text("setting_name").notNull().unique(),
  settingValue: text("setting_value").notNull(),
  settingType: text("setting_type"), // "number", "boolean", "json", "text"
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  nameIdx: index("idx_settings_name").on(table.settingName),
}));

export const insertCurationSettingSchema = createInsertSchema(curationSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertCurationSetting = z.infer<typeof insertCurationSettingSchema>;
export type CurationSetting = typeof curationSettings.$inferSelect;

// Technique Chains - Pre-built and AI-generated BJJ technique sequences
export const techniqueChains = pgTable("technique_chains", {
  id: serial("id").primaryKey(),
  
  // Chain identity
  name: text("name").notNull(),
  description: text("description"),
  chainType: text("chain_type").default("pre_built").notNull(), // 'pre_built', 'ai_generated', 'user_custom'
  
  // Chain structure
  steps: jsonb("steps").notNull(), // Array of steps with video IDs and descriptions
  stepCount: integer("step_count").notNull(),
  
  // Classification
  positionStart: text("position_start"), // 'closed_guard', 'mount', 'back', etc.
  positionEnd: text("position_end"), // Where chain typically ends
  primaryCategory: text("primary_category"), // 'submissions', 'sweeps', 'passes', 'escapes'
  
  // Difficulty
  difficultyLevel: text("difficulty_level"), // 'beginner', 'intermediate', 'advanced'
  minBeltLevel: text("min_belt_level").default("white"), // 'white', 'blue', 'purple', 'brown', 'black'
  
  // Attributes
  giPreference: text("gi_preference").default("both"), // 'gi', 'nogi', 'both'
  requiresAthleticism: boolean("requires_athleticism").default(false),
  requiresFlexibility: boolean("requires_flexibility").default(false),
  technicalVsAthletic: text("technical_vs_athletic").default("balanced"), // 'technical', 'balanced', 'athletic'
  
  // Featured instructors
  featuredInstructorId: integer("featured_instructor_id"),
  usesMixedInstructors: boolean("uses_mixed_instructors").default(true),
  
  // Analytics
  timesRecommended: integer("times_recommended").default(0),
  timesSaved: integer("times_saved").default(0),
  helpfulCount: integer("helpful_count").default(0),
  notHelpfulCount: integer("not_helpful_count").default(0),
  helpfulRatio: numeric("helpful_ratio", { precision: 5, scale: 2 }),
  
  // Meta
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  positionStartIdx: index("idx_chains_position_start").on(table.positionStart),
  categoryIdx: index("idx_chains_category").on(table.primaryCategory),
  difficultyIdx: index("idx_chains_difficulty").on(table.difficultyLevel),
}));

export const insertTechniqueChainSchema = createInsertSchema(techniqueChains).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTechniqueChain = z.infer<typeof insertTechniqueChainSchema>;
export type TechniqueChain = typeof techniqueChains.$inferSelect;

// User Saved Chains - Tracks which chains users have saved for practice
export const userSavedChains = pgTable("user_saved_chains", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => bjjUsers.id).notNull(),
  chainId: integer("chain_id").references(() => techniqueChains.id).notNull(),
  
  // User notes
  personalNotes: text("personal_notes"),
  drillingCount: integer("drilling_count").default(0),
  lastDrilledDate: date("last_drilled_date"),
  
  // Success tracking
  successInRolling: boolean("success_in_rolling").default(false),
  successCount: integer("success_count").default(0),
  
  savedAt: timestamp("saved_at").defaultNow().notNull(),
}, (table) => ({
  userChainUnique: index("idx_user_chain_unique").on(table.userId, table.chainId),
}));

export const insertUserSavedChainSchema = createInsertSchema(userSavedChains).omit({
  id: true,
  savedAt: true,
});

export type InsertUserSavedChain = z.infer<typeof insertUserSavedChainSchema>;
export type UserSavedChain = typeof userSavedChains.$inferSelect;

// Chain Feedback - User feedback on technique chains
export const chainFeedback = pgTable("chain_feedback", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => bjjUsers.id).notNull(),
  chainId: integer("chain_id").references(() => techniqueChains.id).notNull(),
  
  feedbackType: text("feedback_type").notNull(), // 'helpful', 'not_helpful'
  feedbackComment: text("feedback_comment"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChainFeedbackSchema = createInsertSchema(chainFeedback).omit({
  id: true,
  createdAt: true,
});

export type InsertChainFeedback = z.infer<typeof insertChainFeedbackSchema>;
export type ChainFeedback = typeof chainFeedback.$inferSelect;

// App Waitlist - Collect emails/phones for native app launch notification
export const appWaitlist = pgTable("app_waitlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  source: varchar("source", { length: 50 }).default("waitlist_hero"),
  notified: boolean("notified").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAppWaitlistSchema = createInsertSchema(appWaitlist).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email("Invalid email address"),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format (use E.164 format)"),
});

export type InsertAppWaitlist = z.infer<typeof insertAppWaitlistSchema>;
export type AppWaitlist = typeof appWaitlist.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// URL SHORTENER - Short links for video sharing (bjjos.app/t/CODE)
// ═══════════════════════════════════════════════════════════════════════════════

// Short URLs - URL shortener for video links with rich link previews
export const shortUrls = pgTable("short_urls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shortCode: text("short_code").notNull().unique(), // e.g., "aB3x9"
  videoId: integer("video_id").references(() => aiVideoKnowledge.id, { onDelete: 'set null' }), // Can be null if video deleted
  youtubeUrl: text("youtube_url").notNull(), // Original YouTube URL
  youtubeId: text("youtube_id").notNull(), // For thumbnail generation
  
  // Video metadata for rich previews
  videoTitle: text("video_title"),
  instructorName: text("instructor_name"),
  techniqueName: text("technique_name"),
  keyDetail: text("key_detail"),
  duration: integer("duration"), // in seconds
  
  // Analytics
  clickCount: integer("click_count").default(0).notNull(),
  lastClicked: timestamp("last_clicked"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  codeIdx: index("idx_short_code").on(table.shortCode),
  videoIdx: index("idx_short_video").on(table.videoId),
  clicksIdx: index("idx_short_clicks").on(table.clickCount),
}));

export const insertShortUrlSchema = createInsertSchema(shortUrls).omit({
  id: true,
  createdAt: true,
});

export type InsertShortUrl = z.infer<typeof insertShortUrlSchema>;
export type ShortUrl = typeof shortUrls.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM ERROR LOGGING - For admin monitoring and debugging
// ═══════════════════════════════════════════════════════════════════════════════

export const systemErrors = pgTable("system_errors", {
  id: serial("id").primaryKey(),
  
  // Error categorization
  errorType: text("error_type").notNull(), // 'SMS', 'AI', 'VIDEO', 'DATABASE', 'AUTH', 'API', 'UNKNOWN'
  errorCode: text("error_code"), // HTTP status code or custom error code
  errorMessage: text("error_message").notNull(),
  stackTrace: text("stack_trace"),
  
  // Context
  userId: varchar("user_id"), // Optional - if error related to specific user
  endpoint: text("endpoint"), // API endpoint that failed
  method: text("method"), // HTTP method (GET, POST, etc.)
  requestBody: jsonb("request_body"), // Request data (sanitized)
  
  // Resolution
  resolved: boolean("resolved").default(false).notNull(),
  resolvedBy: text("resolved_by"), // Admin who marked as resolved
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  typeIdx: index("idx_errors_type").on(table.errorType),
  resolvedIdx: index("idx_errors_resolved").on(table.resolved),
  userIdx: index("idx_errors_user").on(table.userId),
  createdIdx: index("idx_errors_created").on(table.createdAt),
}));

export const insertSystemErrorSchema = createInsertSchema(systemErrors).omit({
  id: true,
  createdAt: true,
});

export type InsertSystemError = z.infer<typeof insertSystemErrorSchema>;
export type SystemError = typeof systemErrors.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY TRACKING - For comprehensive activity dashboard
// ═══════════════════════════════════════════════════════════════════════════════

// Activity Log - General activity feed for dashboard
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  
  // Event details
  eventType: text("event_type").notNull(), // 'user_signup', 'video_approved', 'video_rejected', 'prof_query', 'video_recommended', 'video_saved', 'referral', 'lifetime_access', 'subscription_change'
  userId: varchar("user_id"), // Optional - if event related to specific user
  videoId: integer("video_id"), // Optional - if event related to video
  
  // Event metadata
  metadata: jsonb("metadata"), // Flexible JSON for event-specific data
  description: text("description"), // Human-readable description for UI
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  typeIdx: index("idx_activity_type").on(table.eventType),
  userIdx: index("idx_activity_user").on(table.userId),
  videoIdx: index("idx_activity_video").on(table.videoId),
  createdIdx: index("idx_activity_created").on(table.createdAt),
}));

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({
  id: true,
  createdAt: true,
});

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLog.$inferSelect;

// Video Analysis Log - Track individual video AI analysis (GPT + Claude scores)
export const videoAnalysisLog = pgTable("video_analysis_log", {
  id: serial("id").primaryKey(),
  
  videoId: integer("video_id"), // May be null if video not yet created
  searchQuery: text("search_query"), // What search led to this video
  youtubeUrl: text("youtube_url").notNull(),
  youtubeId: text("youtube_id").notNull(),
  
  // AI Scores
  gptScore: numeric("gpt_score", { precision: 3, scale: 1 }),
  claudeScore: numeric("claude_score", { precision: 3, scale: 1 }),
  finalScore: numeric("final_score", { precision: 3, scale: 1 }),
  
  // Status
  approved: boolean("approved").notNull().default(false),
  rejectionReason: text("rejection_reason"), // Why it was rejected (if applicable)
  
  // Metadata
  videoTitle: text("video_title"),
  instructorName: text("instructor_name"),
  techniqueName: text("technique_name"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  videoIdx: index("idx_analysis_video").on(table.videoId),
  queryIdx: index("idx_analysis_query").on(table.searchQuery),
  approvedIdx: index("idx_analysis_approved").on(table.approved),
  scoreIdx: index("idx_analysis_score").on(table.finalScore),
  createdIdx: index("idx_analysis_created").on(table.createdAt),
}));

export const insertVideoAnalysisLogSchema = createInsertSchema(videoAnalysisLog).omit({
  id: true,
  createdAt: true,
});

export type InsertVideoAnalysisLog = z.infer<typeof insertVideoAnalysisLogSchema>;
export type VideoAnalysisLog = typeof videoAnalysisLog.$inferSelect;

// User Activity - Track user engagement metrics
export const userActivity = pgTable("user_activity", {
  id: serial("id").primaryKey(),
  
  userId: varchar("user_id").notNull(),
  actionType: text("action_type").notNull(), // 'prof_query', 'video_view', 'video_save', 'video_share', 'feedback_given', 'referral_made'
  
  // Action details
  details: jsonb("details"), // Flexible JSON for action-specific data
  videoId: integer("video_id"), // Optional - if action related to video
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_user_activity_user").on(table.userId),
  actionIdx: index("idx_user_activity_action").on(table.actionType),
  videoIdx: index("idx_user_activity_video").on(table.videoId),
  createdIdx: index("idx_user_activity_created").on(table.createdAt),
}));

export const insertUserActivitySchema = createInsertSchema(userActivity).omit({
  id: true,
  createdAt: true,
});

export type InsertUserActivity = z.infer<typeof insertUserActivitySchema>;
export type UserActivity = typeof userActivity.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-AGENT INTELLIGENCE SYSTEM - Engagement Tracking & Learning
// ═══════════════════════════════════════════════════════════════════════════════

// Prof Queries - Track all Prof. OS queries for analysis and dashboard metrics
export const profQueries = pgTable("prof_queries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  query: text("query").notNull(),
  userQuestion: text("user_question"), // Copy of query for dashboard display
  queryType: varchar("query_type").default('chat'), // 'chat', 'voice', 'search'
  
  // Analytics fields for dashboard
  responseTime: integer("response_time"), // Response time in milliseconds
  useMultiAgent: boolean("use_multi_agent").default(false),
  recommendedVideos: jsonb("recommended_videos"), // Array of recommended video objects
  error: text("error"), // Error message if request failed
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_prof_queries_user").on(table.userId),
  createdIdx: index("idx_prof_queries_created").on(table.createdAt),
}));

export const insertProfQuerySchema = createInsertSchema(profQueries).omit({
  id: true,
  createdAt: true,
});

export type InsertProfQuery = z.infer<typeof insertProfQuerySchema>;
export type ProfQuery = typeof profQueries.$inferSelect;

// Video Interactions - Comprehensive engagement tracking
export const videoInteractions = pgTable("video_interactions", {
  id: serial("id").primaryKey(),
  
  // Core identifiers
  userId: varchar("user_id").notNull(),
  videoId: integer("video_id"), // References videos table
  queryId: integer("query_id"), // References profQueries table if from chat
  
  // Interaction events
  clicked: boolean("clicked").notNull().default(false),
  clickedAt: timestamp("clicked_at"),
  watchDuration: integer("watch_duration"), // Seconds watched
  completed: boolean("completed").notNull().default(false), // Watched to timestamp end
  
  // User feedback
  savedToLibrary: boolean("saved_to_library").notNull().default(false),
  thumbsUp: boolean("thumbs_up"),
  thumbsDown: boolean("thumbs_down"),
  feedbackText: text("feedback_text"), // Optional written feedback
  
  // Learning signals
  rewatchCount: integer("rewatch_count").notNull().default(0),
  sharedWithOthers: boolean("shared_with_others").notNull().default(false),
  problemSolved: boolean("problem_solved"), // Did this solve their problem?
  
  // Metadata
  startTimestamp: integer("start_timestamp"), // Which timestamp they clicked (seconds)
  deviceType: text("device_type"), // mobile, desktop, tablet
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_video_interactions_user").on(table.userId),
  videoIdx: index("idx_video_interactions_video").on(table.videoId),
  queryIdx: index("idx_video_interactions_query").on(table.queryId),
  clickedIdx: index("idx_video_interactions_clicked").on(table.clicked),
  createdIdx: index("idx_video_interactions_created").on(table.createdAt),
}));

export const insertVideoInteractionSchema = createInsertSchema(videoInteractions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVideoInteraction = z.infer<typeof insertVideoInteractionSchema>;
export type VideoInteraction = typeof videoInteractions.$inferSelect;

// Recommendation Outcomes - Track recommendation quality
export const recommendationOutcomes = pgTable("recommendation_outcomes", {
  id: serial("id").primaryKey(),
  
  // Identifiers
  userId: varchar("user_id").notNull(),
  queryId: integer("query_id").notNull(), // Prof. OS query
  videoId: integer("video_id").notNull(),
  recommendationRank: integer("recommendation_rank").notNull(), // 1st, 2nd, 3rd recommendation
  
  // Recommendation strategy
  algorithm: text("algorithm").notNull(), // Which matching algorithm was used
  relevanceScore: numeric("relevance_score", { precision: 5, scale: 2 }),
  pedagogyScore: numeric("pedagogy_score", { precision: 5, scale: 2 }),
  engagementPrediction: numeric("engagement_prediction", { precision: 5, scale: 2 }),
  
  // Actual outcomes (filled in over time)
  actualEngagement: numeric("actual_engagement", { precision: 5, scale: 2 }), // 0-100
  actualLearningGain: numeric("actual_learning_gain", { precision: 5, scale: 2 }), // Measured later
  predictionAccuracy: numeric("prediction_accuracy", { precision: 5, scale: 2 }), // How accurate was prediction
  
  // Success metrics
  clicked: boolean("clicked").notNull().default(false),
  helpful: boolean("helpful"), // User marked as helpful
  solvedProblem: boolean("solved_problem"), // No follow-up query on same topic
  
  // Learning signals
  followUpQuerySentiment: text("follow_up_query_sentiment"), // positive, neutral, negative, frustrated
  askedSameProblemAgain: boolean("asked_same_problem_again").notNull().default(false),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  evaluatedAt: timestamp("evaluated_at"), // When outcome was measured
}, (table) => ({
  userIdx: index("idx_recommendation_user").on(table.userId),
  queryIdx: index("idx_recommendation_query").on(table.queryId),
  videoIdx: index("idx_recommendation_video").on(table.videoId),
  algorithmIdx: index("idx_recommendation_algorithm").on(table.algorithm),
  createdIdx: index("idx_recommendation_created").on(table.createdAt),
}));

export const insertRecommendationOutcomeSchema = createInsertSchema(recommendationOutcomes).omit({
  id: true,
  createdAt: true,
});

export type InsertRecommendationOutcome = z.infer<typeof insertRecommendationOutcomeSchema>;
export type RecommendationOutcome = typeof recommendationOutcomes.$inferSelect;

// Model Performance - Track AI model quality over time
export const modelPerformance = pgTable("model_performance", {
  id: serial("id").primaryKey(),
  
  // Model details
  modelName: text("model_name").notNull(), // gpt-4o, claude-3.5-sonnet, etc.
  taskType: text("task_type").notNull(), // quality_scoring, timestamp_extraction, query_understanding, etc.
  
  // Performance metrics
  accuracy: numeric("accuracy", { precision: 5, scale: 2 }), // % accurate
  latency: integer("latency"), // Response time in ms
  costPerCall: numeric("cost_per_call", { precision: 10, scale: 6 }), // USD
  
  // Usage stats
  callCount: integer("call_count").notNull().default(1),
  successCount: integer("success_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  
  // Quality metrics
  userSatisfaction: numeric("user_satisfaction", { precision: 5, scale: 2 }), // Derived from outcomes
  predictionAccuracy: numeric("prediction_accuracy", { precision: 5, scale: 2 }),
  
  // Time window
  measurementPeriod: text("measurement_period").notNull(), // daily, weekly, monthly
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  modelIdx: index("idx_model_performance_model").on(table.modelName),
  taskIdx: index("idx_model_performance_task").on(table.taskType),
  periodIdx: index("idx_model_performance_period").on(table.periodStart),
}));

export const insertModelPerformanceSchema = createInsertSchema(modelPerformance).omit({
  id: true,
  createdAt: true,
});

export type InsertModelPerformance = z.infer<typeof insertModelPerformanceSchema>;
export type ModelPerformance = typeof modelPerformance.$inferSelect;

// Query Analysis - Deep understanding of user queries
export const queryAnalysis = pgTable("query_analysis", {
  id: serial("id").primaryKey(),
  
  // Core identifiers
  userId: varchar("user_id").notNull(),
  queryId: integer("query_id").notNull(), // References profQueries
  rawQuery: text("raw_query").notNull(),
  
  // Layer 1: Linguistic Analysis
  explicitTechnique: text("explicit_technique"),
  explicitPosition: text("explicit_position"),
  questionType: text("question_type"), // how-to, troubleshooting, conceptual, comparison
  
  // Layer 2: Intent Inference
  inferredIntent: text("inferred_intent"), // learning_setup, improving_defense, understanding_concept, etc.
  rootProblem: text("root_problem"), // What they're REALLY asking about
  likelyMistakes: text("likely_mistakes").array(), // Common mistakes they might be making
  
  // Layer 3: User Profile Inference
  inferredSkillLevel: text("inferred_skill_level"), // beginner, intermediate, advanced
  inferredLearningStyle: text("inferred_learning_style"), // visual, step-by-step, conceptual, etc.
  emotionalState: text("emotional_state"), // curious, frustrated, confused, excited
  urgency: text("urgency"), // low, medium, high
  
  // Layer 4: Learning Path
  optimalLearningPath: jsonb("optimal_learning_path"), // Recommended sequence
  prerequisiteCheck: jsonb("prerequisite_check"), // What they should know first
  followUpConcepts: text("follow_up_concepts").array(),
  
  // Recommendation strategy
  recommendationStrategy: text("recommendation_strategy"), // empathetic, direct, foundational, advanced
  presentationStyle: text("presentation_style"), // encouraging, technical, casual, etc.
  
  // Model used
  analysisModel: text("analysis_model").notNull(), // Which AI model did the analysis
  confidence: numeric("confidence", { precision: 3, scale: 2 }), // 0-1 confidence score
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_query_analysis_user").on(table.userId),
  queryIdx: index("idx_query_analysis_query").on(table.queryId),
  intentIdx: index("idx_query_analysis_intent").on(table.inferredIntent),
  skillIdx: index("idx_query_analysis_skill").on(table.inferredSkillLevel),
}));

export const insertQueryAnalysisSchema = createInsertSchema(queryAnalysis).omit({
  id: true,
  createdAt: true,
});

export type InsertQueryAnalysis = z.infer<typeof insertQueryAnalysisSchema>;
export type QueryAnalysis = typeof queryAnalysis.$inferSelect;

// Learning Path Recommendations - Personalized multi-video sequences
export const learningPathRecommendations = pgTable("learning_path_recommendations", {
  id: serial("id").primaryKey(),
  
  // Core identifiers
  userId: varchar("user_id").notNull(),
  queryId: integer("query_id").notNull(),
  
  // Path structure
  primaryVideoId: integer("primary_video_id").notNull(), // Main recommendation
  foundationVideoIds: integer("foundation_video_ids").array(), // Build understanding
  troubleshootingVideoIds: integer("troubleshooting_video_ids").array(), // If primary doesn't work
  progressionVideoIds: integer("progression_video_ids").array(), // What's next after mastery
  
  // Pedagogical design
  conceptualFraming: text("conceptual_framing"), // Context to set before showing videos
  encouragement: text("encouragement"), // Motivational message
  metacognitiveGuidance: text("metacognitive_guidance"), // Help them learn how to learn
  
  // Effectiveness tracking
  pathCompleted: boolean("path_completed").notNull().default(false),
  videosWatched: integer("videos_watched").notNull().default(0),
  learningOutcome: text("learning_outcome"), // solved, partially_solved, not_solved, abandoned
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  userIdx: index("idx_learning_path_user").on(table.userId),
  queryIdx: index("idx_learning_path_query").on(table.queryId),
  outcomeIdx: index("idx_learning_path_outcome").on(table.learningOutcome),
}));

export const insertLearningPathRecommendationSchema = createInsertSchema(learningPathRecommendations).omit({
  id: true,
  createdAt: true,
});

export type InsertLearningPathRecommendation = z.infer<typeof insertLearningPathRecommendationSchema>;
export type LearningPathRecommendation = typeof learningPathRecommendations.$inferSelect;

// A/B Test Experiments - Test recommendation algorithms
export const abTestExperiments = pgTable("ab_test_experiments", {
  id: serial("id").primaryKey(),
  
  // Experiment details
  experimentName: text("experiment_name").notNull().unique(),
  description: text("description"),
  
  // Variants
  controlAlgorithm: text("control_algorithm").notNull(), // Current/baseline algorithm
  treatmentAlgorithm: text("treatment_algorithm").notNull(), // New algorithm to test
  
  // Assignment
  trafficSplit: numeric("traffic_split", { precision: 3, scale: 2 }).notNull().default('0.50'), // 50/50 by default
  
  // Status
  status: text("status").notNull().default('active'), // active, paused, completed
  
  // Results (populated over time)
  controlEngagement: numeric("control_engagement", { precision: 5, scale: 2 }),
  treatmentEngagement: numeric("treatment_engagement", { precision: 5, scale: 2 }),
  controlSatisfaction: numeric("control_satisfaction", { precision: 5, scale: 2 }),
  treatmentSatisfaction: numeric("treatment_satisfaction", { precision: 5, scale: 2 }),
  statisticalSignificance: numeric("statistical_significance", { precision: 5, scale: 4 }), // p-value
  
  // Conclusion
  winner: text("winner"), // control, treatment, inconclusive
  conclusion: text("conclusion"),
  
  // Time window
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("idx_ab_test_status").on(table.status),
  startedIdx: index("idx_ab_test_started").on(table.startedAt),
}));

export const insertAbTestExperimentSchema = createInsertSchema(abTestExperiments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAbTestExperiment = z.infer<typeof insertAbTestExperimentSchema>;
export type AbTestExperiment = typeof abTestExperiments.$inferSelect;

// Web Search Log - Track web searches performed by Prof. OS
export const webSearchLog = pgTable("web_search_log", {
  id: serial("id").primaryKey(),
  
  // Query context
  queryId: integer("query_id"), // References profQueries if from chat
  searchType: text("search_type").notNull(), // competition, instructor_update, news, medical, general
  searchQuery: text("search_query").notNull(),
  
  // Results
  resultsFound: boolean("results_found").notNull().default(false),
  resultSummary: text("result_summary"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  queryIdx: index("idx_web_search_query").on(table.queryId),
  typeIdx: index("idx_web_search_type").on(table.searchType),
  createdIdx: index("idx_web_search_created").on(table.createdAt),
}));

export const insertWebSearchLogSchema = createInsertSchema(webSearchLog).omit({
  id: true,
  createdAt: true,
});

export type InsertWebSearchLog = z.infer<typeof insertWebSearchLogSchema>;
export type WebSearchLog = typeof webSearchLog.$inferSelect;

// Curation Predictions - Track video curation quality predictions
export const curationPredictions = pgTable("curation_predictions", {
  id: serial("id").primaryKey(),
  
  // Video identifiers
  youtubeId: text("youtube_id").notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  videoId: integer("video_id"), // Null until curated
  
  // Prediction signals
  aiQualityScore: numeric("ai_quality_score", { precision: 3, scale: 1 }), // GPT + Claude average
  instructorTrackRecord: numeric("instructor_track_record", { precision: 5, scale: 2 }), // Historical performance
  metadataScore: numeric("metadata_score", { precision: 5, scale: 2 }), // Duration, views, likes, etc.
  contentCharacteristics: numeric("content_characteristics", { precision: 5, scale: 2 }), // Teaching clarity, depth
  patternMatchScore: numeric("pattern_match_score", { precision: 5, scale: 2 }), // Similarity to winners
  
  // Combined prediction
  predictedQuality: numeric("predicted_quality", { precision: 3, scale: 1 }).notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(), // 0-1
  
  // Decision
  curationDecision: text("curation_decision").notNull(), // CURATE_IMMEDIATELY, CURATE_STANDARD, CURATE_TEST, SKIP
  curationPriority: text("curation_priority"), // HIGH, MEDIUM, LOW
  reasoning: text("reasoning"),
  
  // Actual outcome (filled after 30 days)
  actualQuality: numeric("actual_quality", { precision: 5, scale: 2 }), // Measured engagement
  predictionAccuracy: numeric("prediction_accuracy", { precision: 5, scale: 2 }), // How accurate was prediction
  errorAnalysis: jsonb("error_analysis"), // Why prediction was wrong
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  evaluatedAt: timestamp("evaluated_at"), // When we measured actual quality
}, (table) => ({
  youtubeIdx: index("idx_curation_youtube").on(table.youtubeId),
  videoIdx: index("idx_curation_video").on(table.videoId),
  decisionIdx: index("idx_curation_decision").on(table.curationDecision),
  predictedIdx: index("idx_curation_predicted").on(table.predictedQuality),
}));

export const insertCurationPredictionSchema = createInsertSchema(curationPredictions).omit({
  id: true,
  createdAt: true,
});

export type InsertCurationPrediction = z.infer<typeof insertCurationPredictionSchema>;
export type CurationPrediction = typeof curationPredictions.$inferSelect;

// ===== COMBAT SPORTS INTELLIGENCE SYSTEM =====

// Combat Sports News - Main news table with vector embeddings
export const combatSportsNews = pgTable("combat_sports_news", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Content
  title: text("title").notNull(),
  summary: text("summary"), // AI-generated summary if full content too long
  fullContent: text("full_content"),
  url: text("url").unique(), // Prevent duplicates
  
  // Semantic search (embedding stored as JSONB since pgvector extension needs setup)
  embedding: jsonb("embedding"), // OpenAI embedding as JSON array for now
  
  // Classification
  sport: varchar("sport", { length: 20 }), // 'bjj', 'mma', 'ufc', 'grappling'
  contentType: varchar("content_type", { length: 50 }), // 'competition_result', 'news', 'technique_breakdown', 'athlete_interview'
  
  // Entities (extracted)
  athletes: text("athletes").array(), // ['Gordon Ryan', 'Felipe Pena']
  competitions: text("competitions").array(), // ['ADCC 2025', 'UFC 300']
  techniques: text("techniques").array(), // ['triangle', 'rear_naked_choke', 'heel_hook']
  gyms: text("gyms").array(), // ['AOJ', 'Atos', 'New Wave']
  
  // Source metadata
  sourceName: varchar("source_name", { length: 100 }),
  sourceType: varchar("source_type", { length: 50 }), // 'rss', 'html_scrape', 'api', 'manual'
  scrapedAt: timestamp("scraped_at"),
  
  // Temporal
  publishedDate: timestamp("published_date"), // When article was published
  eventDate: date("event_date"), // If about specific event/fight
  
  // Relevance scoring
  importanceScore: integer("importance_score"), // 1-10, algorithmic
  engagementScore: integer("engagement_score"), // Social engagement (upvotes, shares)
  recencyScore: numeric("recency_score", { precision: 5, scale: 2 }), // Decays over time
  
  // Smart Retention V2
  eventType: varchar("event_type", { length: 50 }), // 'tournament_result', 'ranking_change', 'technique_news', 'event_announcement', 'general'
  isPermanent: boolean("is_permanent").default(false), // Items with score 8+ are never deleted
  
  // Quality control
  isVerified: boolean("is_verified").default(false), // Manual verification
  isDuplicate: boolean("is_duplicate").default(false),
  duplicateOf: varchar("duplicate_of"),
  
  // Lifecycle
  expiresAt: timestamp("expires_at"), // Calculated based on importance score, null = never expires
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  publishedIdx: index("idx_news_published").on(table.publishedDate),
  sportIdx: index("idx_news_sport").on(table.sport),
  expiresIdx: index("idx_news_expires").on(table.expiresAt),
  urlIdx: index("idx_news_url").on(table.url),
  athletesIdx: index("idx_news_athletes").on(table.athletes),
  techniquesIdx: index("idx_news_techniques").on(table.techniques),
  competitionsIdx: index("idx_news_competitions").on(table.competitions),
}));

export const insertCombatSportsNewsSchema = createInsertSchema(combatSportsNews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCombatSportsNews = z.infer<typeof insertCombatSportsNewsSchema>;
export type CombatSportsNews = typeof combatSportsNews.$inferSelect;

// BJJ Reference Data - Permanent historical database for accurate competition answers
export const bjjReferenceData = pgTable("bjj_reference_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Reference type
  referenceType: varchar("reference_type", { length: 50 }).notNull(), // 'adcc_winner', 'ibjjf_champion', 'ranking', 'competitor_profile'
  
  // Competition context
  competitionName: varchar("competition_name", { length: 100 }), // 'ADCC', 'IBJJF Worlds', 'Pans', 'Euros'
  year: integer("year"),
  weightClass: varchar("weight_class", { length: 50 }), // '66kg', '77kg', '88kg', 'absolute', etc.
  beltLevel: varchar("belt_level", { length: 20 }), // 'black', 'brown', 'purple', etc (for IBJJF)
  division: varchar("division", { length: 50 }), // 'male', 'female', 'master'
  
  // Athlete info
  athleteName: text("athlete_name").notNull(),
  gym: text("gym"),
  country: varchar("country", { length: 50 }),
  
  // Result details
  placement: varchar("placement", { length: 20 }), // 'gold', 'silver', 'bronze', '1st', '2nd', '3rd'
  submissionType: text("submission_type"), // If won by submission
  opponent: text("opponent"), // Final opponent for gold/silver
  
  // Additional details as JSON
  details: jsonb("details"), // { matches_won: 5, submissions: 3, finals_score: "2-0" }
  
  // Source
  sourceUrl: text("source_url"),
  isVerified: boolean("is_verified").default(false),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  typeIdx: index("idx_ref_type").on(table.referenceType),
  competitionIdx: index("idx_ref_competition").on(table.competitionName),
  yearIdx: index("idx_ref_year").on(table.year),
  weightIdx: index("idx_ref_weight").on(table.weightClass),
  athleteIdx: index("idx_ref_athlete").on(table.athleteName),
}));

export const insertBjjReferenceDataSchema = createInsertSchema(bjjReferenceData).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBjjReferenceData = z.infer<typeof insertBjjReferenceDataSchema>;
export type BjjReferenceData = typeof bjjReferenceData.$inferSelect;

// ===== POPULATION INTELLIGENCE =====
// Aggregated technique success data across the BJJ community

export const populationIntelligence = pgTable("population_intelligence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  techniqueName: text("technique_name").notNull().unique(),
  positionCategory: text("position_category"),
  
  // Success rates by belt level (0.00 to 1.00)
  successRateWhite: numeric("success_rate_white", { precision: 3, scale: 2 }),
  successRateBlue: numeric("success_rate_blue", { precision: 3, scale: 2 }),
  successRatePurple: numeric("success_rate_purple", { precision: 3, scale: 2 }),
  successRateBrown: numeric("success_rate_brown", { precision: 3, scale: 2 }),
  successRateBlack: numeric("success_rate_black", { precision: 3, scale: 2 }),
  
  // Success rates by body type (0.00 to 1.00)
  successRateTallLanky: numeric("success_rate_tall_lanky", { precision: 3, scale: 2 }),
  successRateAverage: numeric("success_rate_average", { precision: 3, scale: 2 }),
  successRateShortStocky: numeric("success_rate_short_stocky", { precision: 3, scale: 2 }),
  
  // Learning curve data
  avgDaysToFirstSuccess: integer("avg_days_to_first_success"),
  
  // Common mistakes as JSON array of strings
  commonMistakes: jsonb("common_mistakes"),
  
  // Complementary techniques that work well with this one
  complementaryTechniques: text("complementary_techniques").array(),
  
  // Data reliability
  sampleSize: integer("sample_size").default(0),
  
  lastUpdated: timestamp("last_updated").defaultNow(),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (table) => ({
  techniqueIdx: index("idx_pop_intel_technique").on(table.techniqueName),
  positionIdx: index("idx_pop_intel_position").on(table.positionCategory),
}));

export const insertPopulationIntelligenceSchema = createInsertSchema(populationIntelligence).omit({
  id: true,
  lastUpdated: true,
  generatedAt: true,
});

export type InsertPopulationIntelligence = z.infer<typeof insertPopulationIntelligenceSchema>;
export type PopulationIntelligence = typeof populationIntelligence.$inferSelect;

// Scraper Health Monitoring
export const scraperHealth = pgTable("scraper_health", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceName: varchar("source_name", { length: 100 }).notNull().unique(),
  lastSuccessfulScrape: timestamp("last_successful_scrape"),
  lastFailedScrape: timestamp("last_failed_scrape"),
  failureCount: integer("failure_count").default(0),
  lastError: text("last_error"),
  articlesScrapedToday: integer("articles_scraped_today").default(0),
  isHealthy: boolean("is_healthy").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScraperHealthSchema = createInsertSchema(scraperHealth).omit({
  id: true,
  createdAt: true,
});

export type InsertScraperHealth = z.infer<typeof insertScraperHealthSchema>;
export type ScraperHealth = typeof scraperHealth.$inferSelect;

// ===== ADVANCED INTELLIGENCE: LAYER 1 - INDIVIDUAL INTELLIGENCE =====

// AI Model Usage Tracking
export const aiModelUsage = pgTable("ai_model_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  
  modelName: varchar("model_name", { length: 50 }), // 'claude-sonnet-4.5', 'gpt-4o', 'gpt-4o-mini'
  taskType: varchar("task_type", { length: 50 }), // 'coaching', 'extraction', 'embedding', 'vision'
  
  tokensInput: integer("tokens_input"),
  tokensOutput: integer("tokens_output"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
  
  responseTimeMs: integer("response_time_ms"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_model_usage_user").on(table.userId),
  createdIdx: index("idx_model_usage_created").on(table.createdAt),
}));

export const insertAiModelUsageSchema = createInsertSchema(aiModelUsage).omit({
  id: true,
  createdAt: true,
});

export type InsertAiModelUsage = z.infer<typeof insertAiModelUsageSchema>;
export type AiModelUsage = typeof aiModelUsage.$inferSelect;

// User Cognitive Profile - Learning and communication preferences
export const userCognitiveProfile = pgTable("user_cognitive_profile", {
  userId: varchar("user_id").primaryKey(),
  
  // Learning style (detected from conversation patterns)
  learningStyle: varchar("learning_style", { length: 50 }), // "visual", "kinesthetic", "conceptual", "repetition_based"
  learningStyleConfidence: numeric("learning_style_confidence", { precision: 3, scale: 2 }),
  
  // Communication preferences (detected)
  prefersBriefResponses: boolean("prefers_brief_responses").default(false),
  prefersDetailedExplanations: boolean("prefers_detailed_explanations").default(false),
  prefersQuestionsFirst: boolean("prefers_questions_first").default(false),
  prefersDirectAnswers: boolean("prefers_direct_answers").default(false),
  
  // Cognitive patterns
  asksWhyFrequently: boolean("asks_why_frequently").default(false),
  asksHowFrequently: boolean("asks_how_frequently").default(false),
  
  // Response to coaching
  respondsToEncouragement: boolean("responds_to_encouragement").default(false),
  respondsToDirectness: boolean("responds_to_directness").default(false),
  respondsToData: boolean("responds_to_data").default(false),
  
  // Meta-awareness
  selfAwareLevel: integer("self_aware_level"), // 1-10
  acceptsCriticismWell: boolean("accepts_criticism_well").default(true),
  
  // Sample size for confidence
  interactionsAnalyzed: integer("interactions_analyzed").default(0),
  
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const insertUserCognitiveProfileSchema = createInsertSchema(userCognitiveProfile).omit({
  lastUpdated: true,
});

export type InsertUserCognitiveProfile = z.infer<typeof insertUserCognitiveProfileSchema>;
export type UserCognitiveProfile = typeof userCognitiveProfile.$inferSelect;

// User Technique Ecosystem - Track technique relationships and success patterns
export const userTechniqueEcosystem = pgTable("user_technique_ecosystem", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  techniqueName: varchar("technique_name", { length: 100 }).notNull(),
  
  // Success metrics
  attempts: integer("attempts").default(0),
  successes: integer("successes").default(0),
  failures: integer("failures").default(0),
  successRate: numeric("success_rate", { precision: 4, scale: 2 }),
  
  // Context where it works
  worksBestFromPosition: varchar("works_best_from_position", { length: 100 }),
  worksBestAgainst: varchar("works_best_against", { length: 50 }), // "higher_belts", "same_belt", "lower_belts"
  worksBestGiOrNogi: varchar("works_best_gi_or_nogi", { length: 10 }),
  
  // Technique relationships (JSONB for flexibility)
  leadsToTechniques: jsonb("leads_to_techniques"), // [{"technique": "armbar", "frequency": 12, "success_rate": 0.75}]
  ledFromTechniques: jsonb("led_from_techniques"), // What creates this opportunity
  failsLeadsTo: jsonb("fails_leads_to"), // When this fails, what happens
  
  // Learning progression
  firstAttemptedDate: timestamp("first_attempted_date"),
  firstSuccessDate: timestamp("first_success_date"),
  attemptsToFirstSuccess: integer("attempts_to_first_success"),
  learningCurve: varchar("learning_curve", { length: 50 }), // "fast_learner", "slow_burn", "plateau", "abandoned"
  
  // User confidence
  userConfidenceLevel: integer("user_confidence_level"), // 1-10
  
  // Flags
  isSignatureMove: boolean("is_signature_move").default(false),
  isSetupMove: boolean("is_setup_move").default(false),
  isFinishingMove: boolean("is_finishing_move").default(false),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_technique_ecosystem_user").on(table.userId),
  signatureIdx: index("idx_technique_ecosystem_signature").on(table.userId, table.isSignatureMove),
  uniqueUserTechnique: index("idx_user_technique_unique").on(table.userId, table.techniqueName),
}));

export const insertUserTechniqueEcosystemSchema = createInsertSchema(userTechniqueEcosystem).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserTechniqueEcosystem = z.infer<typeof insertUserTechniqueEcosystemSchema>;
export type UserTechniqueEcosystem = typeof userTechniqueEcosystem.$inferSelect;

// User Temporal Patterns - Time-based performance patterns
export const userTemporalPatterns = pgTable("user_temporal_patterns", {
  userId: varchar("user_id").primaryKey(),
  
  // Time-based performance patterns
  performsBestTimeOfDay: varchar("performs_best_time_of_day", { length: 20 }),
  performsWorstTimeOfDay: varchar("performs_worst_time_of_day", { length: 20 }),
  
  optimalTrainingFrequency: numeric("optimal_training_frequency", { precision: 3, scale: 1 }),
  overtrainingThreshold: integer("overtraining_threshold"),
  
  // Recovery patterns
  optimalRestDaysBetweenSessions: numeric("optimal_rest_days_between_sessions", { precision: 3, scale: 1 }),
  injuryRiskIncreasesAfter: integer("injury_risk_increases_after"), // Consecutive days
  
  // Learning patterns
  breakthroughFrequencyDays: integer("breakthrough_frequency_days"),
  plateauCycleLengthDays: integer("plateau_cycle_length_days"),
  newTechniqueRetentionWindowDays: integer("new_technique_retention_window_days"),
  
  // Statistical confidence
  patternConfidence: numeric("pattern_confidence", { precision: 3, scale: 2 }),
  sampleSize: integer("sample_size"),
  
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const insertUserTemporalPatternsSchema = createInsertSchema(userTemporalPatterns).omit({
  lastUpdated: true,
});

export type InsertUserTemporalPatterns = z.infer<typeof insertUserTemporalPatternsSchema>;
export type UserTemporalPatterns = typeof userTemporalPatterns.$inferSelect;

// User Injury Profile - Injury tracking and prevention
export const userInjuryProfile = pgTable("user_injury_profile", {
  userId: varchar("user_id").primaryKey(),
  
  // Historical injuries (JSONB array)
  injuryHistory: jsonb("injury_history"), // [{"body_part": "shoulder", "severity": 7, "date": "2024-01-15", "recovery_days": 21}]
  
  // Patterns
  recurringInjuryAreas: text("recurring_injury_areas").array(),
  injuryTriggers: jsonb("injury_triggers"),
  
  // Current concerns
  activeInjuries: jsonb("active_injuries"),
  
  // Predictive intelligence
  highRiskTechniques: text("high_risk_techniques").array(),
  highRiskPositions: text("high_risk_positions").array(),
  
  // Recovery patterns
  typicalRecoveryTimeMinorDays: integer("typical_recovery_time_minor_days"),
  typicalRecoveryTimeModerateDays: integer("typical_recovery_time_moderate_days"),
  
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const insertUserInjuryProfileSchema = createInsertSchema(userInjuryProfile).omit({
  lastUpdated: true,
});

export type InsertUserInjuryProfile = z.infer<typeof insertUserInjuryProfileSchema>;
export type UserInjuryProfile = typeof userInjuryProfile.$inferSelect;

// User Psychological Profile - Motivation and resilience
export const userPsychologicalProfile = pgTable("user_psychological_profile", {
  userId: varchar("user_id").primaryKey(),
  
  // Motivation
  primaryMotivation: varchar("primary_motivation", { length: 50 }), // "competition", "self_defense", "fitness", "social", "mastery"
  
  // Response to setbacks
  resilienceScore: integer("resilience_score"), // 1-10
  typicalResponseToFailure: varchar("typical_response_to_failure", { length: 50 }),
  typicalResponseToSuccess: varchar("typical_response_to_success", { length: 50 }),
  
  // Imposter syndrome
  hasImposterSyndrome: boolean("has_imposter_syndrome").default(false),
  imposterSyndromeTriggers: text("imposter_syndrome_triggers").array(),
  
  // Communication style
  openlySharesStruggles: boolean("openly_shares_struggles").default(false),
  deflectsEmotionalTopics: boolean("deflects_emotional_topics").default(false),
  
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const insertUserPsychologicalProfileSchema = createInsertSchema(userPsychologicalProfile).omit({
  lastUpdated: true,
});

export type InsertUserPsychologicalProfile = z.infer<typeof insertUserPsychologicalProfileSchema>;
export type UserPsychologicalProfile = typeof userPsychologicalProfile.$inferSelect;

// User Memory Markers - Tiered memory system
export const userMemoryMarkers = pgTable("user_memory_markers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  
  memoryType: varchar("memory_type", { length: 50 }), // "breakthrough", "injury", "milestone", "struggle_pattern"
  significanceScore: integer("significance_score"), // 1-10
  
  summary: text("summary").notNull(),
  fullContext: jsonb("full_context"),
  relatedSessionIds: text("related_session_ids").array(),
  
  occurredAt: timestamp("occurred_at").notNull(),
  memoryTier: varchar("memory_tier", { length: 20 }), // "working" (7 days), "medium" (3 months), "long_term"
  
  lastReferencedAt: timestamp("last_referenced_at"),
  referenceCount: integer("reference_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_memory_user").on(table.userId),
  tierIdx: index("idx_memory_tier").on(table.userId, table.memoryTier),
  occurredIdx: index("idx_memory_occurred").on(table.occurredAt),
}));

export const insertUserMemoryMarkerSchema = createInsertSchema(userMemoryMarkers).omit({
  id: true,
  createdAt: true,
});

export type InsertUserMemoryMarker = z.infer<typeof insertUserMemoryMarkerSchema>;
export type UserMemoryMarker = typeof userMemoryMarkers.$inferSelect;

// Detected Patterns - Proactive coaching triggers
export const detectedPatterns = pgTable("detected_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  
  patternType: varchar("pattern_type", { length: 100 }), // "overtraining", "technique_plateau", "success_pattern", etc.
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  
  triggerData: jsonb("trigger_data"), // Evidence that triggered detection
  supportingSessionIds: text("supporting_session_ids").array(),
  
  interventionSuggested: text("intervention_suggested"),
  priority: varchar("priority", { length: 20 }), // "high", "medium", "low"
  
  status: varchar("status", { length: 20 }).default('detected'), // "detected", "addressed", "resolved", "ignored"
  addressedAt: timestamp("addressed_at"),
  resolvedAt: timestamp("resolved_at"),
  
  userAcknowledged: boolean("user_acknowledged").default(false),
  userResponse: text("user_response"),
}, (table) => ({
  userStatusIdx: index("idx_patterns_user_status").on(table.userId, table.status),
  priorityIdx: index("idx_patterns_priority").on(table.userId, table.priority),
}));

export const insertDetectedPatternSchema = createInsertSchema(detectedPatterns).omit({
  id: true,
  detectedAt: true,
});

export type InsertDetectedPattern = z.infer<typeof insertDetectedPatternSchema>;
export type DetectedPattern = typeof detectedPatterns.$inferSelect;

// ===== ADVANCED INTELLIGENCE: LAYER 2 - POPULATION INTELLIGENCE =====

// Technique Population Stats - Effectiveness across all users
export const techniquePopulationStats = pgTable("technique_population_stats", {
  techniqueName: varchar("technique_name", { length: 100 }).primaryKey(),
  
  totalUsersAttempted: integer("total_users_attempted").default(0),
  totalAttempts: integer("total_attempts").default(0),
  totalSuccesses: integer("total_successes").default(0),
  populationSuccessRate: numeric("population_success_rate", { precision: 4, scale: 2 }),
  
  // Segmented statistics (JSONB for flexibility)
  successByBeltLevel: jsonb("success_by_belt_level"), // {"white": 0.45, "blue": 0.62, "purple": 0.78}
  successByBodyType: jsonb("success_by_body_type"),
  successByAgeGroup: jsonb("success_by_age_group"),
  
  // Learning curves
  avgAttemptsToFirstSuccess: numeric("avg_attempts_to_first_success", { precision: 5, scale: 1 }),
  avgAttemptsToConsistency: numeric("avg_attempts_to_consistency", { precision: 5, scale: 1 }),
  
  abandonmentRate: numeric("abandonment_rate", { precision: 4, scale: 2 }),
  avgAttemptsBeforeAbandonment: integer("avg_attempts_before_abandonment"),
  
  difficultyScore: integer("difficulty_score"), // 1-10
  
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const insertTechniquePopulationStatsSchema = createInsertSchema(techniquePopulationStats).omit({
  lastUpdated: true,
});

export type InsertTechniquePopulationStats = z.infer<typeof insertTechniquePopulationStatsSchema>;
export type TechniquePopulationStats = typeof techniquePopulationStats.$inferSelect;

// Population Injury Patterns - Injury patterns across population
export const populationInjuryPatterns = pgTable("population_injury_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  injuryType: varchar("injury_type", { length: 100 }),
  bodyPart: varchar("body_part", { length: 50 }),
  
  commonCauses: jsonb("common_causes"), // [{"cause": "inverted_guard", "frequency": 234}]
  highRiskTechniques: text("high_risk_techniques").array(),
  
  totalReportedCases: integer("total_reported_cases").default(0),
  avgRecoveryTimeDays: integer("avg_recovery_time_days"),
  recurrenceRate: numeric("recurrence_rate", { precision: 4, scale: 2 }),
  
  mostCommonInBeltLevel: varchar("most_common_in_belt_level", { length: 20 }),
  mostCommonInAgeGroup: varchar("most_common_in_age_group", { length: 20 }),
  
  effectivePreventionStrategies: text("effective_prevention_strategies").array(),
  
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const insertPopulationInjuryPatternSchema = createInsertSchema(populationInjuryPatterns).omit({
  id: true,
  lastUpdated: true,
});

export type InsertPopulationInjuryPattern = z.infer<typeof insertPopulationInjuryPatternSchema>;
export type PopulationInjuryPattern = typeof populationInjuryPatterns.$inferSelect;

// Technique Progression Pathways - What leads to what
export const techniqueProgressionPathways = pgTable("technique_progression_pathways", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  foundationalTechnique: varchar("foundational_technique", { length: 100 }),
  leadsToTechnique: varchar("leads_to_technique", { length: 100 }),
  
  usersWhoLearnedBoth: integer("users_who_learned_both"),
  typicalTimeGapDays: integer("typical_time_gap_days"),
  
  successRateWithFoundation: numeric("success_rate_with_foundation", { precision: 4, scale: 2 }),
  successRateWithoutFoundation: numeric("success_rate_without_foundation", { precision: 4, scale: 2 }),
  efficiencyMultiplier: numeric("efficiency_multiplier", { precision: 4, scale: 1 }),
  
  pathwayStrength: varchar("pathway_strength", { length: 20 }), // "strong", "moderate", "weak"
  evidenceCount: integer("evidence_count"),
  
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
}, (table) => ({
  uniquePathway: index("idx_unique_pathway").on(table.foundationalTechnique, table.leadsToTechnique),
}));

export const insertTechniqueProgressionPathwaySchema = createInsertSchema(techniqueProgressionPathways).omit({
  id: true,
  lastUpdated: true,
});

export type InsertTechniqueProgressionPathway = z.infer<typeof insertTechniqueProgressionPathwaySchema>;
export type TechniqueProgressionPathway = typeof techniqueProgressionPathways.$inferSelect;

// Belt Promotion Indicators - Readiness indicators by belt level
export const beltPromotionIndicators = pgTable("belt_promotion_indicators", {
  beltLevel: varchar("belt_level", { length: 20 }).primaryKey(),
  nextBelt: varchar("next_belt", { length: 20 }),
  
  typicalTechniqueCount: integer("typical_technique_count"),
  typicalSuccessRate: numeric("typical_success_rate", { precision: 4, scale: 2 }),
  typicalPositionDiversity: integer("typical_position_diversity"),
  
  avgTimeAtBeltMonths: integer("avg_time_at_belt_months"),
  minTimeObservedMonths: integer("min_time_observed_months"),
  maxTimeObservedMonths: integer("max_time_observed_months"),
  
  typicalSparringPerformance: jsonb("typical_sparring_performance"),
  
  commonGaps: text("common_gaps").array(),
  commonStrengths: text("common_strengths").array(),
  
  readinessAlgorithm: jsonb("readiness_algorithm"),
  
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const insertBeltPromotionIndicatorSchema = createInsertSchema(beltPromotionIndicators).omit({
  lastUpdated: true,
});

export type InsertBeltPromotionIndicator = z.infer<typeof insertBeltPromotionIndicatorSchema>;
export type BeltPromotionIndicator = typeof beltPromotionIndicators.$inferSelect;

// ===== ADVANCED INTELLIGENCE: LAYER 3 - SELF-IMPROVEMENT =====

// Coaching Intervention Outcomes - Track coaching effectiveness
export const coachingInterventionOutcomes = pgTable("coaching_intervention_outcomes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  
  interventionDate: timestamp("intervention_date").defaultNow().notNull(),
  interventionType: varchar("intervention_type", { length: 50 }),
  interventionContent: text("intervention_content"),
  interventionContext: jsonb("intervention_context"),
  
  // User response
  userImmediateResponse: text("user_immediate_response"),
  userAcknowledged: boolean("user_acknowledged").default(false),
  userExpressedDoubt: boolean("user_expressed_doubt").default(false),
  
  // Follow-through
  userFollowedAdvice: boolean("user_followed_advice"),
  daysUntilAction: integer("days_until_action"),
  
  // Effectiveness
  interventionSuccessful: boolean("intervention_successful"),
  successIndicators: jsonb("success_indicators"),
  measuredImpact: jsonb("measured_impact"),
  
  // Long-term
  sustained30Days: boolean("sustained_30_days"),
  sustained90Days: boolean("sustained_90_days"),
  
  // ML features
  featuresAtIntervention: jsonb("features_at_intervention"),
  outcomeLabel: varchar("outcome_label", { length: 20 }), // "highly_effective", "somewhat_effective", "ineffective"
}, (table) => ({
  userIdx: index("idx_coaching_outcomes_user").on(table.userId),
  typeIdx: index("idx_coaching_outcomes_type").on(table.interventionType, table.outcomeLabel),
}));

export const insertCoachingInterventionOutcomeSchema = createInsertSchema(coachingInterventionOutcomes).omit({
  id: true,
  interventionDate: true,
});

export type InsertCoachingInterventionOutcome = z.infer<typeof insertCoachingInterventionOutcomeSchema>;
export type CoachingInterventionOutcome = typeof coachingInterventionOutcomes.$inferSelect;

// Coaching A/B Tests - A/B testing framework
export const coachingAbTests = pgTable("coaching_ab_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  testName: varchar("test_name", { length: 100 }).unique().notNull(),
  testDescription: text("test_description"),
  
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"),
  status: varchar("status", { length: 20 }).default('running'), // "running", "completed", "paused"
  
  variantA: jsonb("variant_a"),
  variantB: jsonb("variant_b"),
  
  appliesToUserTypes: text("applies_to_user_types").array(),
  
  // Results
  variantAResults: jsonb("variant_a_results"),
  variantBResults: jsonb("variant_b_results"),
  winningVariant: varchar("winning_variant", { length: 1 }), // 'A' or 'B'
  statisticalSignificance: numeric("statistical_significance", { precision: 5, scale: 4 }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("idx_coaching_ab_test_status").on(table.status),
  nameIdx: index("idx_coaching_ab_test_name").on(table.testName),
}));

export const insertCoachingAbTestSchema = createInsertSchema(coachingAbTests).omit({
  id: true,
  createdAt: true,
});

export type InsertCoachingAbTest = z.infer<typeof insertCoachingAbTestSchema>;
export type CoachingAbTest = typeof coachingAbTests.$inferSelect;

// ═════════════════════════════════════════════════════════════════════════════
// CORE INTELLIGENCE LAYER + POWER USER CONVERSION SYSTEM
// ═════════════════════════════════════════════════════════════════════════════

// Engagement Nudges - Gentle nudges to help users discover Prof. OS's power
export const engagementNudges = pgTable("engagement_nudges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  nudgeType: varchar("nudge_type", { length: 50 }), // "discover_session_logging", "discover_pattern_detection", "pre_training_focus"
  
  triggerReason: text("trigger_reason"), // Why this nudge was created
  content: text("content").notNull(), // What to show user
  
  optimalDeliveryTime: timestamp("optimal_delivery_time"), // When to show this
  priority: varchar("priority", { length: 20 }).default('low'), // "low", "medium", "high"
  
  // Delivery tracking
  deliveredAt: timestamp("delivered_at"),
  userAction: varchar("user_action", { length: 50 }), // "acted_on", "dismissed", "ignored"
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userPendingIdx: index("idx_nudges_user_pending").on(table.userId, table.deliveredAt),
  deliveryTimeIdx: index("idx_nudges_delivery_time").on(table.optimalDeliveryTime),
}));

export const insertEngagementNudgeSchema = createInsertSchema(engagementNudges).omit({
  id: true,
  createdAt: true,
});

export type InsertEngagementNudge = z.infer<typeof insertEngagementNudgeSchema>;
export type EngagementNudge = typeof engagementNudges.$inferSelect;

// User Engagement Profile - Track how user engages to help them discover features
export const userEngagementProfile = pgTable("user_engagement_profile", {
  userId: varchar("user_id").primaryKey().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  // Discovery journey
  hasLoggedSession: boolean("has_logged_session").default(false),
  firstSessionLoggedAt: timestamp("first_session_logged_at"),
  totalSessionsLogged: integer("total_sessions_logged").default(0),
  
  hasAskedForAdvice: boolean("has_asked_for_advice").default(false),
  firstAdviceAskedAt: timestamp("first_advice_asked_at"),
  
  hasReceivedPatternInsight: boolean("has_received_pattern_insight").default(false),
  firstPatternInsightAt: timestamp("first_pattern_insight_at"),
  
  // Usage patterns
  primaryUseCase: varchar("primary_use_case", { length: 50 }), // "video_search", "session_logging", "coaching", "mixed"
  lastVideoRequestAt: timestamp("last_video_request_at"),
  lastSessionLogAt: timestamp("last_session_log_at"),
  
  // Engagement stage
  engagementStage: varchar("engagement_stage", { length: 50 }).default('discovery'), // "discovery", "video_user", "light_logger", "power_user"
  stageUpdatedAt: timestamp("stage_updated_at").defaultNow(),
  
  // Profile completion (from conversational extraction)
  beltLevel: varchar("belt_level", { length: 20 }),
  trainingFrequency: numeric("training_frequency", { precision: 3, scale: 1 }),
  mainPosition: varchar("main_position", { length: 50 }),
  trainingGoals: text("training_goals"),
  
  profileCompletionScore: integer("profile_completion_score").default(0), // 0-100, higher = more complete
  
  lastPatternTeaserAt: timestamp("last_pattern_teaser_at"),
  patternTeasersShown: integer("pattern_teasers_shown").default(0),
  
  lastPowerUserExampleAt: timestamp("last_power_user_example_at"),
  powerUserExamplesShown: integer("power_user_examples_shown").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserEngagementProfileSchema = createInsertSchema(userEngagementProfile).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertUserEngagementProfile = z.infer<typeof insertUserEngagementProfileSchema>;
export type UserEngagementProfile = typeof userEngagementProfile.$inferSelect;

// Performance Metrics - Monitor endpoint performance
export const performanceMetrics = pgTable("performance_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  endpoint: varchar("endpoint", { length: 100 }),
  userId: varchar("user_id"),
  
  durationMs: integer("duration_ms"),
  cacheHit: boolean("cache_hit").default(false),
  
  dbQueriesCount: integer("db_queries_count").default(0),
  aiCallsCount: integer("ai_calls_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  endpointDateIdx: index("idx_perf_endpoint_date").on(table.endpoint, table.createdAt),
}));

export const insertPerformanceMetricSchema = createInsertSchema(performanceMetrics).omit({
  id: true,
  createdAt: true,
});

export type InsertPerformanceMetric = z.infer<typeof insertPerformanceMetricSchema>;
export type PerformanceMetric = typeof performanceMetrics.$inferSelect;

// Video Engagement - Track when users actually interact with recommended videos
export const videoEngagement = pgTable("video_engagement", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => bjjUsers.id, { onDelete: 'cascade' }),
  videoId: integer("video_id").references(() => aiVideoKnowledge.id),
  
  // When recommended and when clicked
  recommendedAt: timestamp("recommended_at").defaultNow().notNull(),
  clickedAt: timestamp("clicked_at"),
  
  // User feedback on video
  userFeedback: varchar("user_feedback", { length: 20 }), // 'helpful', 'not_helpful', null
  feedbackAt: timestamp("feedback_at"),
  
  // Context about recommendation
  recommendedForTechnique: varchar("recommended_for_technique", { length: 100 }),
  recommendationContext: jsonb("recommendation_context"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_video_engagement_user").on(table.userId, table.recommendedAt),
  clickedIdx: index("idx_video_engagement_clicked").on(table.userId, table.clickedAt),
}));

export const insertVideoEngagementSchema = createInsertSchema(videoEngagement).omit({
  id: true,
  createdAt: true,
  recommendedAt: true,
});

export type InsertVideoEngagement = z.infer<typeof insertVideoEngagementSchema>;
export type VideoEngagement = typeof videoEngagement.$inferSelect;

// Video Request History - Track all video requests to detect patterns
export const videoRequestHistory = pgTable("video_request_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  query: text("query").notNull(),
  extractedTopics: text("extracted_topics").array(), // ['triangle', 'closed_guard', etc.]
  
  videosRecommended: text("videos_recommended").array(), // Array of video IDs shown
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_video_requests_user").on(table.userId, table.createdAt),
}));

export const insertVideoRequestHistorySchema = createInsertSchema(videoRequestHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertVideoRequestHistory = z.infer<typeof insertVideoRequestHistorySchema>;
export type VideoRequestHistory = typeof videoRequestHistory.$inferSelect;

// Power User Examples - Library of real anonymized power user examples to showcase
export const powerUserExamples = pgTable("power_user_examples", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  exampleType: varchar("example_type", { length: 50 }), // 'pattern_detection', 'progress_tracking', 'breakthrough', etc.
  
  // The example content
  userQuestion: text("user_question").notNull(),
  profResponseSummary: text("prof_response_summary").notNull(),
  outcome: text("outcome").notNull(),
  
  // Meta
  effectivenessScore: integer("effectiveness_score"), // How compelling is this example (1-10)
  timesShown: integer("times_shown").default(0),
  conversionRate: numeric("conversion_rate", { precision: 4, scale: 2 }), // % of users who converted after seeing it
  
  active: boolean("active").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPowerUserExampleSchema = createInsertSchema(powerUserExamples).omit({
  id: true,
  createdAt: true,
});

export type InsertPowerUserExample = z.infer<typeof insertPowerUserExampleSchema>;
export type PowerUserExample = typeof powerUserExamples.$inferSelect;

// ============================================================================
// ADMIN SYSTEM TABLES - User Management & Monitoring
// ============================================================================

// Video Curation Batches - Track automated video curation runs
export const videoCurationBatches = pgTable("video_curation_batches", {
  id: serial("id").primaryKey(),
  batchTime: timestamp("batch_time").defaultNow().notNull(),
  videosScanned: integer("videos_scanned").default(0),
  videosApproved: integer("videos_approved").default(0),
  videosRejected: integer("videos_rejected").default(0),
  avgRating: numeric("avg_rating", { precision: 3, scale: 1 }),
  errorsCount: integer("errors_count").default(0),
  processingTimeMinutes: integer("processing_time_minutes"),
  apiCost: numeric("api_cost", { precision: 10, scale: 2 }),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  batchTimeIdx: index("video_curation_batches_time_idx").on(table.batchTime),
}));

export const insertVideoCurationBatchSchema = createInsertSchema(videoCurationBatches).omit({
  id: true,
});

export type InsertVideoCurationBatch = z.infer<typeof insertVideoCurationBatchSchema>;
export type VideoCurationBatch = typeof videoCurationBatches.$inferSelect;

// Video Curation Results - Individual video results from curation
export const videoCurationResults = pgTable("video_curation_results", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => videoCurationBatches.id, { onDelete: 'cascade' }),
  videoId: varchar("video_id", { length: 100 }),
  title: text("title"),
  instructor: varchar("instructor", { length: 255 }),
  rating: numeric("rating", { precision: 3, scale: 1 }),
  status: varchar("status", { length: 50 }), // approved, rejected, pending
  reason: text("reason"),
  category: varchar("category", { length: 100 }),
  technique: varchar("technique", { length: 255 }),
  tags: text("tags").array(),
  durationSeconds: integer("duration_seconds"),
  views: integer("views"),
  youtubeUrl: text("youtube_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  batchIdx: index("video_curation_results_batch_idx").on(table.batchId),
  statusIdx: index("video_curation_results_status_idx").on(table.status),
}));

export const insertVideoCurationResultSchema = createInsertSchema(videoCurationResults).omit({
  id: true,
  createdAt: true,
});

export type InsertVideoCurationResult = z.infer<typeof insertVideoCurationResultSchema>;
export type VideoCurationResult = typeof videoCurationResults.$inferSelect;

// Referral Redemptions - Track who redeemed what referral codes
export const referralRedemptions = pgTable("referral_redemptions", {
  id: serial("id").primaryKey(),
  codeId: varchar("code_id").references(() => referralCodes.id, { onDelete: 'cascade' }),
  redeemedByUserId: varchar("redeemed_by_user_id").references(() => bjjUsers.id, { onDelete: 'cascade' }),
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
  rewardApplied: text("reward_applied"),
}, (table) => ({
  userIdx: index("referral_redemptions_user_idx").on(table.redeemedByUserId),
}));

export const insertReferralRedemptionSchema = createInsertSchema(referralRedemptions).omit({
  id: true,
  redeemedAt: true,
});

export type InsertReferralRedemption = z.infer<typeof insertReferralRedemptionSchema>;
export type ReferralRedemption = typeof referralRedemptions.$inferSelect;

// Admin Actions Log - Track all admin actions for accountability
export const adminActions = pgTable("admin_actions", {
  id: serial("id").primaryKey(),
  adminEmail: varchar("admin_email", { length: 255 }).notNull(),
  actionType: varchar("action_type", { length: 100 }).notNull(), // grant_lifetime, revoke_access, create_user, etc.
  targetUserId: varchar("target_user_id").references(() => bjjUsers.id, { onDelete: 'set null' }),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  timeIdx: index("admin_actions_time_idx").on(table.createdAt),
  adminIdx: index("admin_actions_admin_idx").on(table.adminEmail),
}));

export const insertAdminActionSchema = createInsertSchema(adminActions).omit({
  id: true,
  createdAt: true,
});

export type InsertAdminAction = z.infer<typeof insertAdminActionSchema>;
export type AdminAction = typeof adminActions.$inferSelect;

// Admin Notes Table - Separate notes admins can add about users (multiple notes per user)
export const adminNotesTable = pgTable("admin_notes_table", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  adminEmail: varchar("admin_email", { length: 255 }).notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("admin_notes_table_user_id_idx").on(table.userId),
  createdAtIdx: index("admin_notes_table_created_at_idx").on(table.createdAt),
}));

export const insertAdminNoteTableSchema = createInsertSchema(adminNotesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAdminNoteTable = z.infer<typeof insertAdminNoteTableSchema>;
export type AdminNoteTable = typeof adminNotesTable.$inferSelect;

// ============================================================================
// AUTO-CURATION SYSTEM TABLES
// ============================================================================

// System Settings - Global system configuration
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  settingKey: varchar("setting_key", { length: 255 }).unique().notNull(),
  settingValue: text("setting_value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 255 }),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

// API Quota Usage - Daily API usage tracking for quota management
export const apiQuotaUsage = pgTable("api_quota_usage", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().default(sql`CURRENT_DATE`).unique(),
  youtubeQuotaUsed: integer("youtube_quota_used").default(0),
  youtubeQuotaLimit: integer("youtube_quota_limit").default(10000),
  openaiRequests: integer("openai_requests").default(0),
  openaiCostUsd: numeric("openai_cost_usd", { precision: 10, scale: 2 }).default('0'),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  dateIdx: index("api_quota_usage_date_idx").on(table.date.desc()),
}));

export const insertApiQuotaUsageSchema = createInsertSchema(apiQuotaUsage).omit({
  id: true,
  updatedAt: true,
});

export type InsertApiQuotaUsage = z.infer<typeof insertApiQuotaUsageSchema>;
export type ApiQuotaUsage = typeof apiQuotaUsage.$inferSelect;

// Page Views - Website analytics with USA state-level location tracking
export const pageViews = pgTable("page_views", {
  id: serial("id").primaryKey(),
  
  // Page info
  pagePath: text("page_path").notNull(),
  pageTitle: text("page_title"),
  
  // Visitor info (anonymous)
  visitorId: text("visitor_id").notNull(),
  sessionId: text("session_id"),
  
  // Traffic source
  referrer: text("referrer"),
  source: text("source"), // 'instagram', 'google', 'direct', etc.
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  
  // Device info
  deviceType: text("device_type"), // 'mobile', 'desktop', 'tablet'
  browser: text("browser"),
  os: text("os"),
  userAgent: text("user_agent"), // Full user agent string for bot detection
  
  // Bot detection
  isBot: boolean("is_bot").default(false), // Flagged as bot/crawler
  
  // Location (with USA state detail)
  countryCode: text("country_code"), // 'US', 'BR', 'AU', etc.
  countryName: text("country_name"), // 'United States', 'Brazil', etc.
  stateCode: text("state_code"), // 'CA', 'NY', 'TX', etc. (USA only)
  stateName: text("state_name"), // 'California', 'New York', etc.
  city: text("city"),
  ipHash: text("ip_hash"), // Hashed IP (not stored raw for privacy)
  
  // Timing
  createdAt: timestamp("created_at").defaultNow().notNull(),
  timeOnPage: integer("time_on_page"), // seconds
}, (table) => ({
  createdAtIdx: index("page_views_created_at_idx").on(table.createdAt.desc()),
  visitorIdx: index("page_views_visitor_idx").on(table.visitorId),
  sourceIdx: index("page_views_source_idx").on(table.source),
  pagePathIdx: index("page_views_page_path_idx").on(table.pagePath),
  countryIdx: index("page_views_country_idx").on(table.countryCode),
  stateIdx: index("page_views_state_idx").on(table.stateCode),
  botIdx: index("page_views_is_bot_idx").on(table.isBot),
}));

export const insertPageViewSchema = createInsertSchema(pageViews).omit({
  id: true,
  createdAt: true,
});

export type InsertPageView = z.infer<typeof insertPageViewSchema>;
export type PageView = typeof pageViews.$inferSelect;

// Lifetime Invitations - Admin invitation system for lifetime access
export const lifetimeInvitations = pgTable("lifetime_invitations", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  inviteToken: varchar("invite_token", { length: 255 }).notNull().unique(),
  personalMessage: text("personal_message"),
  invitedByAdminId: varchar("invited_by_admin_id"), // References bjj_users.id
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, completed, expired
  completedAt: timestamp("completed_at"),
  userId: varchar("user_id"), // References bjj_users.id when user signs up
  expiresAt: timestamp("expires_at").notNull().default(sql`NOW() + INTERVAL '30 days'`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  inviteTokenIdx: index("lifetime_invitations_token_idx").on(table.inviteToken),
  emailIdx: index("lifetime_invitations_email_idx").on(table.email),
  statusIdx: index("lifetime_invitations_status_idx").on(table.status),
  expiresIdx: index("lifetime_invitations_expires_idx").on(table.expiresAt),
}));

export const insertLifetimeInvitationSchema = createInsertSchema(lifetimeInvitations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLifetimeInvitation = z.infer<typeof insertLifetimeInvitationSchema>;
export type LifetimeInvitation = typeof lifetimeInvitations.$inferSelect;

// ============================================================================
// PROFESSOR OS ECOSYSTEM INTELLIGENCE SYSTEM
// ============================================================================

// Ecosystem Technique Effectiveness - Track what works across all users
export const ecosystemTechniqueEffectiveness = pgTable("ecosystem_technique_effectiveness", {
  id: serial("id").primaryKey(),
  techniqueName: text("technique_name").notNull(),
  category: text("category"), // guard_pass, submission, sweep, escape, etc.
  
  // User profile filters
  beltLevel: text("belt_level"), // white, blue, purple, brown, black, all
  bodyType: text("body_type"), // tall, short, heavy, athletic, flexible, all
  style: text("style"), // gi, nogi, both
  
  // Effectiveness metrics
  totalAttempts: integer("total_attempts").default(0),
  successfulAttempts: integer("successful_attempts").default(0),
  successRate: doublePrecision("success_rate").default(0), // percentage
  userCount: integer("user_count").default(0), // how many users tried this
  averageSessionsToLearn: doublePrecision("average_sessions_to_learn"),
  
  // Metadata
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  techniqueIdx: index("ecosystem_technique_name_idx").on(table.techniqueName),
  beltIdx: index("ecosystem_belt_idx").on(table.beltLevel),
  bodyTypeIdx: index("ecosystem_body_type_idx").on(table.bodyType),
  successRateIdx: index("ecosystem_success_rate_idx").on(table.successRate.desc()),
}));

export const insertEcosystemTechniqueEffectivenessSchema = createInsertSchema(ecosystemTechniqueEffectiveness).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export type InsertEcosystemTechniqueEffectiveness = z.infer<typeof insertEcosystemTechniqueEffectivenessSchema>;
export type EcosystemTechniqueEffectiveness = typeof ecosystemTechniqueEffectiveness.$inferSelect;

// Ecosystem Problem Solutions - Track proven solutions to common problems
export const ecosystemProblemSolutions = pgTable("ecosystem_problem_solutions", {
  id: serial("id").primaryKey(),
  problemDescription: text("problem_description").notNull(), // "can't pass closed guard"
  solutionTechnique: text("solution_technique").notNull(), // "knee slice pass"
  instructor: text("instructor"), // who teaches this best
  
  // Context
  beltLevel: text("belt_level"),
  bodyType: text("body_type"),
  style: text("style"),
  
  // Effectiveness
  usersSolved: integer("users_solved").default(0), // how many users this helped
  successRate: doublePrecision("success_rate").default(0),
  averageTimeToSolve: integer("average_time_to_solve"), // days
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
}, (table) => ({
  problemIdx: index("ecosystem_problem_idx").on(table.problemDescription),
  solutionIdx: index("ecosystem_solution_idx").on(table.solutionTechnique),
  successRateIdx: index("ecosystem_problem_success_idx").on(table.successRate.desc()),
}));

export const insertEcosystemProblemSolutionSchema = createInsertSchema(ecosystemProblemSolutions).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export type InsertEcosystemProblemSolution = z.infer<typeof insertEcosystemProblemSolutionSchema>;
export type EcosystemProblemSolution = typeof ecosystemProblemSolutions.$inferSelect;

// Collaborative Intelligence - Recent breakthroughs from similar users
export const collaborativeIntelligence = pgTable("collaborative_intelligence", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  // What breakthrough happened
  technique: text("technique").notNull(),
  problemSolved: text("problem_solved").notNull(),
  sessionsToSuccess: integer("sessions_to_success"),
  
  // User context (anonymized for privacy)
  userBelt: text("user_belt"),
  userBodyType: text("user_body_type"),
  userStyle: text("user_style"),
  
  // When it happened
  achievedAt: timestamp("achieved_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("collab_intel_user_idx").on(table.userId),
  techniqueIdx: index("collab_intel_technique_idx").on(table.technique),
  achievedIdx: index("collab_intel_achieved_idx").on(table.achievedAt.desc()),
}));

export const insertCollaborativeIntelligenceSchema = createInsertSchema(collaborativeIntelligence).omit({
  id: true,
  createdAt: true,
});

export type InsertCollaborativeIntelligence = z.infer<typeof insertCollaborativeIntelligenceSchema>;
export type CollaborativeIntelligence = typeof collaborativeIntelligence.$inferSelect;

// User Similarity Clusters - Group similar users for better recommendations
export const userSimilarityClusters = pgTable("user_similarity_clusters", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  // Cluster info
  clusterId: varchar("cluster_id").notNull(), // UUID for cluster group
  clusterProfile: text("cluster_profile"), // description of this cluster
  
  // Similarity factors
  beltLevel: text("belt_level"),
  bodyType: text("body_type"),
  style: text("style"),
  learningStyle: text("learning_style"),
  trainingFrequency: text("training_frequency"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("similarity_user_idx").on(table.userId),
  clusterIdx: index("similarity_cluster_idx").on(table.clusterId),
}));

export const insertUserSimilarityClusterSchema = createInsertSchema(userSimilarityClusters).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export type InsertUserSimilarityCluster = z.infer<typeof insertUserSimilarityClusterSchema>;
export type UserSimilarityCluster = typeof userSimilarityClusters.$inferSelect;

// Conversation Structured Data - Extract insights from every conversation
export const conversationStructuredData = pgTable("conversation_structured_data", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id"), // Link to chat_messages if needed
  
  // Extracted data
  techniquesMentioned: text("techniques_mentioned").array(),
  problemsMentioned: text("problems_mentioned").array(),
  successesMentioned: text("successes_mentioned").array(),
  injuriesPainMentioned: text("injuries_pain_mentioned").array(),
  opponentsMentioned: text("opponents_mentioned").array(),
  
  // Sentiment & emotion
  emotionalTone: text("emotional_tone"), // frustrated, excited, confused, confident
  frustrationLevel: integer("frustration_level"), // 1-10
  confidenceLevel: integer("confidence_level"), // 1-10
  
  // Context
  extractedAt: timestamp("extracted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("conv_data_user_idx").on(table.userId),
  extractedIdx: index("conv_data_extracted_idx").on(table.extractedAt.desc()),
}));

export const insertConversationStructuredDataSchema = createInsertSchema(conversationStructuredData).omit({
  id: true,
  createdAt: true,
  extractedAt: true,
});

export type InsertConversationStructuredData = z.infer<typeof insertConversationStructuredDataSchema>;
export type ConversationStructuredData = typeof conversationStructuredData.$inferSelect;

// User Technique Attempts - Track every technique attempt with outcomes
export const userTechniqueAttempts = pgTable("user_technique_attempts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  // Technique info
  techniqueName: text("technique_name").notNull(),
  category: text("category"), // guard_pass, submission, sweep, escape
  
  // Attempt outcome
  successful: boolean("successful"),
  context: text("context"), // "drilling", "rolling", "competition"
  opponentBelt: text("opponent_belt"),
  notes: text("notes"),
  
  // Learning stage
  learningStage: text("learning_stage"), // discovery, practice, refinement, mastery
  
  // Metadata
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("tech_attempts_user_idx").on(table.userId),
  techniqueIdx: index("tech_attempts_technique_idx").on(table.techniqueName),
  attemptedIdx: index("tech_attempts_attempted_idx").on(table.attemptedAt.desc()),
}));

export const insertUserTechniqueAttemptSchema = createInsertSchema(userTechniqueAttempts).omit({
  id: true,
  createdAt: true,
});

export type InsertUserTechniqueAttempt = z.infer<typeof insertUserTechniqueAttemptSchema>;
export type UserTechniqueAttempt = typeof userTechniqueAttempts.$inferSelect;

// User Pattern Interventions - Track recurring problems, injuries, fatigue
export const userPatternInterventions = pgTable("user_pattern_interventions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  // Pattern type
  patternType: text("pattern_type").notNull(), // recurring_problem, injury_concern, fatigue, plateau
  description: text("description").notNull(),
  
  // Detection metrics
  occurrenceCount: integer("occurrence_count").default(1),
  firstDetected: timestamp("first_detected").defaultNow().notNull(),
  lastOccurrence: timestamp("last_occurrence").defaultNow().notNull(),
  daysSinceFirst: integer("days_since_first"),
  
  // Intervention status
  urgency: text("urgency"), // low, medium, high, critical
  addressed: boolean("addressed").default(false),
  addressedAt: timestamp("addressed_at"),
  resolution: text("resolution"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("pattern_interventions_user_idx").on(table.userId),
  typeIdx: index("pattern_interventions_type_idx").on(table.patternType),
  urgencyIdx: index("pattern_interventions_urgency_idx").on(table.urgency),
  addressedIdx: index("pattern_interventions_addressed_idx").on(table.addressed),
}));

export const insertUserPatternInterventionSchema = createInsertSchema(userPatternInterventions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserPatternIntervention = z.infer<typeof insertUserPatternInterventionSchema>;
export type UserPatternIntervention = typeof userPatternInterventions.$inferSelect;

// User Conceptual Understanding - Track understanding of fundamental concepts
export const userConceptualUnderstanding = pgTable("user_conceptual_understanding", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  // Concept info
  concept: text("concept").notNull(), // "base", "pressure", "frames", "hip_escape", etc.
  category: text("category"), // position, movement, principle, technique_family
  
  // Understanding level
  understandingLevel: integer("understanding_level"), // 1-10
  demonstratedInPractice: boolean("demonstrated_in_practice").default(false),
  needsReinforcement: boolean("needs_reinforcement").default(false),
  
  // Evidence
  lastDemonstrated: timestamp("last_demonstrated"),
  timesApplied: integer("times_applied").default(0),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("conceptual_user_idx").on(table.userId),
  conceptIdx: index("conceptual_concept_idx").on(table.concept),
  levelIdx: index("conceptual_level_idx").on(table.understandingLevel.desc()),
}));

export const insertUserConceptualUnderstandingSchema = createInsertSchema(userConceptualUnderstanding).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserConceptualUnderstanding = z.infer<typeof insertUserConceptualUnderstandingSchema>;
export type UserConceptualUnderstanding = typeof userConceptualUnderstanding.$inferSelect;

// User Learning Analytics - Track learning style, retention, progress trends
export const userLearningAnalytics = pgTable("user_learning_analytics", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  // Learning profile
  learningStyle: text("learning_style"), // visual, verbal, kinesthetic, mixed
  instructionDepth: text("instruction_depth"), // brief, detailed, step-by-step
  retentionRate: doublePrecision("retention_rate"), // percentage
  optimalReviewDays: integer("optimal_review_days"), // days between reviews
  
  // Progress metrics
  progressTrend: text("progress_trend"), // accelerating, steady, plateauing, declining
  averageSessionsToGraspTechnique: doublePrecision("average_sessions_to_grasp"),
  techniqueSuccessRate: doublePrecision("technique_success_rate"),
  
  // Engagement
  conversationCount: integer("conversation_count").default(0),
  averageConversationLength: doublePrecision("average_conversation_length"), // messages
  lastActiveAt: timestamp("last_active_at"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("learning_analytics_user_idx").on(table.userId),
  styleIdx: index("learning_analytics_style_idx").on(table.learningStyle),
  trendIdx: index("learning_analytics_trend_idx").on(table.progressTrend),
}));

export const insertUserLearningAnalyticsSchema = createInsertSchema(userLearningAnalytics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserLearningAnalytics = z.infer<typeof insertUserLearningAnalyticsSchema>;
export type UserLearningAnalytics = typeof userLearningAnalytics.$inferSelect;

// User Breakthrough Predictions - Predict when breakthroughs will happen
export const userBreakthroughPredictions = pgTable("user_breakthrough_predictions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  // Prediction info
  technique: text("technique").notNull(),
  predictedWindow: text("predicted_window"), // "next 1-2 sessions", "within a week"
  confidence: text("confidence"), // low, medium, high
  
  // Signals that led to prediction
  signals: text("signals").array(), // ["drilling frequency increased", "asking detailed questions"]
  currentStage: text("current_stage"), // discovery, practice, refinement
  
  // Outcome tracking
  breakthroughAchieved: boolean("breakthrough_achieved").default(false),
  achievedAt: timestamp("achieved_at"),
  predictionAccurate: boolean("prediction_accurate"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("breakthrough_pred_user_idx").on(table.userId),
  techniqueIdx: index("breakthrough_pred_technique_idx").on(table.technique),
  achievedIdx: index("breakthrough_pred_achieved_idx").on(table.breakthroughAchieved),
}));

export const insertUserBreakthroughPredictionSchema = createInsertSchema(userBreakthroughPredictions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserBreakthroughPrediction = z.infer<typeof insertUserBreakthroughPredictionSchema>;
export type UserBreakthroughPrediction = typeof userBreakthroughPredictions.$inferSelect;

// Training Partners - Track people user trains with
export const trainingPartners = pgTable("training_partners", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  // Partner info
  name: text("name").notNull(),
  beltLevel: text("belt_level"),
  style: text("style"), // pressure, speed, technical, scramble
  
  // Tracking metrics
  timesMentioned: integer("times_mentioned").default(1),
  firstMentioned: timestamp("first_mentioned").defaultNow().notNull(),
  lastMentioned: timestamp("last_mentioned").defaultNow().notNull(),
  
  // Performance tracking
  successRateVsUser: text("success_rate_vs_user"), // high, medium, low, improving, declining
  notes: text("notes"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("training_partners_user_idx").on(table.userId),
  userNameUnique: index("training_partners_user_name_idx").on(table.userId, table.name),
}));

export const insertTrainingPartnerSchema = createInsertSchema(trainingPartners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrainingPartner = z.infer<typeof insertTrainingPartnerSchema>;
export type TrainingPartner = typeof trainingPartners.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSOR OS INTELLIGENCE SYSTEM - PHASE 1 DATABASE TABLES
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Technique Knowledge Base - Extracted knowledge from videos
export const techniqueKnowledgeBase = pgTable("technique_knowledge_base", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id"), // Reference to ai_video_knowledge
  technique: text("technique").notNull(),
  techniqueCategory: text("technique_category"),
  
  // Extracted knowledge
  fundamentalConcept: text("fundamental_concept"),
  keySteps: text("key_steps").array(),
  criticalDetails: text("critical_details").array(),
  commonMistakes: text("common_mistakes").array(),
  troubleshooting: jsonb("troubleshooting"),
  instructorPrinciples: jsonb("instructor_principles"),
  prerequisites: text("prerequisites").array(),
  leadsTo: text("leads_to").array(),
  worksBestFor: jsonb("works_best_for"),
  
  // Metadata
  extractionMethod: text("extraction_method"), // metadata, transcript, hybrid
  confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 }),
  extractedBy: text("extracted_by"), // claude-haiku, claude-sonnet, gpt-4o
  extractionCost: numeric("extraction_cost", { precision: 5, scale: 3 }), // USD
  needsReview: boolean("needs_review").default(false),
  
  extractedAt: timestamp("extracted_at").defaultNow().notNull(),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
}, (table) => ({
  techniqueIdx: index("tkb_technique_idx").on(table.technique),
  confidenceIdx: index("tkb_confidence_idx").on(table.confidenceScore),
  extractedAtIdx: index("tkb_extracted_at_idx").on(table.extractedAt),
}));

export const insertTechniqueKnowledgeBaseSchema = createInsertSchema(techniqueKnowledgeBase).omit({
  id: true,
  extractedAt: true,
  lastUpdated: true,
});

export type InsertTechniqueKnowledgeBase = z.infer<typeof insertTechniqueKnowledgeBaseSchema>;
export type TechniqueKnowledgeBase = typeof techniqueKnowledgeBase.$inferSelect;

// 2. Consolidated Technique Knowledge - Aggregated from multiple sources
export const consolidatedTechniqueKnowledge = pgTable("consolidated_technique_knowledge", {
  id: serial("id").primaryKey(),
  technique: text("technique").unique().notNull(),
  masterConcept: text("master_concept"),
  consensusSteps: text("consensus_steps").array(),
  allCriticalDetails: text("all_critical_details").array(),
  comprehensiveTroubleshooting: jsonb("comprehensive_troubleshooting"),
  instructorPerspectives: jsonb("instructor_perspectives"),
  totalSources: integer("total_sources").default(0),
  sourceVideoIds: integer("source_video_ids").array(),
  avgConfidenceScore: numeric("avg_confidence_score", { precision: 3, scale: 2 }),
  knowledgeDepth: text("knowledge_depth"), // shallow, moderate, deep, comprehensive
  needsMoreSources: boolean("needs_more_sources").default(false),
  lastConsolidated: timestamp("last_consolidated").defaultNow().notNull(),
}, (table) => ({
  techniqueIdx: index("ctk_technique_idx").on(table.technique),
  depthIdx: index("ctk_depth_idx").on(table.knowledgeDepth),
  consolidatedIdx: index("ctk_consolidated_idx").on(table.lastConsolidated),
}));

export const insertConsolidatedTechniqueKnowledgeSchema = createInsertSchema(consolidatedTechniqueKnowledge).omit({
  id: true,
  lastConsolidated: true,
});

export type InsertConsolidatedTechniqueKnowledge = z.infer<typeof insertConsolidatedTechniqueKnowledgeSchema>;
export type ConsolidatedTechniqueKnowledge = typeof consolidatedTechniqueKnowledge.$inferSelect;

// 3. Knowledge Extraction Log - Track extraction jobs
export const knowledgeExtractionLog = pgTable("knowledge_extraction_log", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id"),
  technique: text("technique"),
  extractionType: text("extraction_type"), // demand_driven, scheduled, backfill
  status: text("status").default('pending'), // pending, in_progress, completed, failed
  confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 }),
  extractionCost: numeric("extraction_cost", { precision: 5, scale: 3 }), // USD
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  processingTimeMs: integer("processing_time_ms"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
}, (table) => ({
  statusIdx: index("kel_status_idx").on(table.status),
  startedIdx: index("kel_started_idx").on(table.startedAt),
  techniqueIdx: index("kel_technique_idx").on(table.technique),
}));

export const insertKnowledgeExtractionLogSchema = createInsertSchema(knowledgeExtractionLog).omit({
  id: true,
});

export type InsertKnowledgeExtractionLog = z.infer<typeof insertKnowledgeExtractionLogSchema>;
export type KnowledgeExtractionLog = typeof knowledgeExtractionLog.$inferSelect;

// 4. Answer Quality Log - Track response quality and user satisfaction
export const answerQualityLog = pgTable("answer_quality_log", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id"),
  userId: varchar("user_id"),
  question: text("question"),
  detectedTechnique: text("detected_technique"),
  questionType: text("question_type"), // how_to, troubleshoot, comparison, general
  usedKnowledgeBase: boolean("used_knowledge_base").default(false),
  knowledgeSourcesUsed: integer("knowledge_sources_used").array(),
  citedSources: integer("cited_sources").default(0),
  responseLength: integer("response_length"),
  specificityScore: numeric("specificity_score", { precision: 3, scale: 2 }),
  userThumbsUp: boolean("user_thumbs_up"),
  userFeedback: text("user_feedback"),
  userFollowedUp: boolean("user_followed_up").default(false),
  answeredAt: timestamp("answered_at").defaultNow().notNull(),
  feedbackReceivedAt: timestamp("feedback_received_at"),
}, (table) => ({
  conversationIdx: index("aql_conversation_idx").on(table.conversationId),
  techniqueIdx: index("aql_technique_idx").on(table.detectedTechnique),
  answeredAtIdx: index("aql_answered_at_idx").on(table.answeredAt),
  usedKbIdx: index("aql_used_kb_idx").on(table.usedKnowledgeBase),
}));

export const insertAnswerQualityLogSchema = createInsertSchema(answerQualityLog).omit({
  id: true,
  answeredAt: true,
});

export type InsertAnswerQualityLog = z.infer<typeof insertAnswerQualityLogSchema>;
export type AnswerQualityLog = typeof answerQualityLog.$inferSelect;

// 5. Intelligence Cost Tracking - Daily cost aggregation
export const intelligenceCostTracking = pgTable("intelligence_cost_tracking", {
  id: serial("id").primaryKey(),
  trackingDate: date("tracking_date").notNull().unique(),
  knowledgeExtractionCost: numeric("knowledge_extraction_cost", { precision: 10, scale: 2 }).default('0.00'),
  competitionScrapingCost: numeric("competition_scraping_cost", { precision: 10, scale: 2 }).default('0.00'),
  metaAnalysisCost: numeric("meta_analysis_cost", { precision: 10, scale: 2 }).default('0.00'),
  answerGenerationCost: numeric("answer_generation_cost", { precision: 10, scale: 2 }).default('0.00'),
  videosExtracted: integer("videos_extracted").default(0),
  competitionsScraped: integer("competitions_scraped").default(0),
  queriesAnswered: integer("queries_answered").default(0),
  totalDailyCost: numeric("total_daily_cost", { precision: 10, scale: 2 }).default('0.00'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  dateIdx: index("ict_date_idx").on(table.trackingDate),
}));

export const insertIntelligenceCostTrackingSchema = createInsertSchema(intelligenceCostTracking).omit({
  id: true,
  createdAt: true,
});

export type InsertIntelligenceCostTracking = z.infer<typeof insertIntelligenceCostTrackingSchema>;
export type IntelligenceCostTracking = typeof intelligenceCostTracking.$inferSelect;

// ============================================================================
// DEV OS INTELLIGENCE SYSTEM TABLES
// ============================================================================

// 1. Adaptive Thresholds - Self-calibrating alert system
export const devOsThresholds = pgTable("dev_os_thresholds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull(),
  metricName: text("metric_name").notNull(), // signups, active_users, mrr, retention_7day, etc.
  thresholdValue: numeric("threshold_value", { precision: 10, scale: 2 }),
  thresholdType: text("threshold_type").default('absolute'), // absolute, percentage, stddev
  confidenceLevel: text("confidence_level").default('low'), // low, medium, high
  learningPeriodDays: integer("learning_period_days").default(90),
  lastAdjusted: timestamp("last_adjusted").defaultNow().notNull(),
  adjustmentReason: text("adjustment_reason"),
}, (table) => ({
  adminMetricIdx: index("dev_os_admin_metric_idx").on(table.adminUserId, table.metricName),
  adjustedIdx: index("dev_os_adjusted_idx").on(table.lastAdjusted),
}));

export const insertDevOsThresholdSchema = createInsertSchema(devOsThresholds).omit({
  id: true,
  lastAdjusted: true,
});

export type InsertDevOsThreshold = z.infer<typeof insertDevOsThresholdSchema>;
export type DevOsThreshold = typeof devOsThresholds.$inferSelect;

// 2. Behavioral Interactions - Learn from admin actions
export const devOsInteractions = pgTable("dev_os_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull(),
  alertType: text("alert_type"), // critical, warning, insight
  metricName: text("metric_name"),
  changeSize: numeric("change_size", { precision: 10, scale: 2 }),
  changePercent: numeric("change_percent", { precision: 5, scale: 2 }),
  userClicked: boolean("user_clicked").default(false),
  userAskedFollowup: boolean("user_asked_followup").default(false),
  hoursUntilAction: integer("hours_until_action"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  adminIdx: index("dev_os_int_admin_idx").on(table.adminUserId),
  metricIdx: index("dev_os_int_metric_idx").on(table.metricName),
  createdIdx: index("dev_os_int_created_idx").on(table.createdAt),
}));

export const insertDevOsInteractionSchema = createInsertSchema(devOsInteractions).omit({
  id: true,
  createdAt: true,
});

export type InsertDevOsInteraction = z.infer<typeof insertDevOsInteractionSchema>;
export type DevOsInteraction = typeof devOsInteractions.$inferSelect;

// 3. Alert History - Track alerts for learning and transparency
export const devOsAlerts = pgTable("dev_os_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull(),
  alertType: text("alert_type"), // critical, warning, insight
  metricName: text("metric_name"),
  alertMessage: text("alert_message"),
  thresholdUsed: numeric("threshold_used", { precision: 10, scale: 2 }),
  shown: boolean("shown").default(false),
  dismissed: boolean("dismissed").default(false),
  actedUpon: boolean("acted_upon").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  adminCreatedIdx: index("dev_os_alerts_admin_idx").on(table.adminUserId, table.createdAt),
  shownIdx: index("dev_os_alerts_shown_idx").on(table.shown),
}));

export const insertDevOsAlertSchema = createInsertSchema(devOsAlerts).omit({
  id: true,
  createdAt: true,
});

export type InsertDevOsAlert = z.infer<typeof insertDevOsAlertSchema>;
export type DevOsAlert = typeof devOsAlerts.$inferSelect;

// 4. System Snapshots - Daily system state for temporal analysis
export const devOsSnapshots = pgTable("dev_os_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotDate: date("snapshot_date").notNull(),
  activeUsers: integer("active_users"),
  dailySignups: integer("daily_signups"),
  mrr: numeric("mrr", { precision: 10, scale: 2 }),
  totalVideos: integer("total_videos"),
  avgSessionLength: numeric("avg_session_length", { precision: 10, scale: 2 }),
  retention7day: numeric("retention_7day", { precision: 5, scale: 2 }),
  churnCount: integer("churn_count"),
  messagesSent: integer("messages_sent"),
  apiQuotaUsed: integer("api_quota_used"),
  systemErrors: integer("system_errors"),
  metadata: jsonb("metadata"), // Additional custom metrics
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  dateIdx: index("dev_os_snapshots_date_idx").on(table.snapshotDate),
  createdIdx: index("dev_os_snapshots_created_idx").on(table.createdAt),
}));

export const insertDevOsSnapshotSchema = createInsertSchema(devOsSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertDevOsSnapshot = z.infer<typeof insertDevOsSnapshotSchema>;
export type DevOsSnapshot = typeof devOsSnapshots.$inferSelect;

// 5. Action Execution Log - Audit trail for Dev OS actions
export const devOsActions = pgTable("dev_os_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull(),
  actionType: text("action_type").notNull(), // tier1_auto, tier2_approved, tier3_guided
  actionDescription: text("action_description"),
  parameters: jsonb("parameters"),
  result: text("result"),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
}, (table) => ({
  adminIdx: index("dev_os_actions_admin_idx").on(table.adminUserId),
  executedIdx: index("dev_os_actions_executed_idx").on(table.executedAt),
  typeIdx: index("dev_os_actions_type_idx").on(table.actionType),
}));

export const insertDevOsActionSchema = createInsertSchema(devOsActions).omit({
  id: true,
  executedAt: true,
});

export type InsertDevOsAction = z.infer<typeof insertDevOsActionSchema>;
export type DevOsAction = typeof devOsActions.$inferSelect;

// 6. Dev OS Messages - Persistent chat history with 48-hour retention
export const devOsMessages = pgTable("dev_os_messages", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Admin user ID
  role: varchar("role", { length: 20 }).notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(),
  messageType: varchar("message_type", { length: 50 }).default("chat"), // 'chat', 'report', 'alert', 'system'
  isRead: boolean("is_read").default(false),
  metadata: jsonb("metadata"), // Store report data, alert types, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userCreatedIdx: index("dev_os_msg_user_created_idx").on(table.userId, table.createdAt),
  unreadIdx: index("dev_os_msg_unread_idx").on(table.userId, table.isRead),
}));

export const insertDevOsMessageSchema = createInsertSchema(devOsMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertDevOsMessage = z.infer<typeof insertDevOsMessageSchema>;
export type DevOsMessage = typeof devOsMessages.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// 7-DIMENSIONAL CURATION ALGORITHM - Phase 2 Advanced Quality System
// ═══════════════════════════════════════════════════════════════════════════════

// TABLE 1: BJJ Instructors - Authority and credibility tracking
export const instructors = pgTable("instructors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).unique().notNull(),
  channelId: varchar("channel_id", { length: 100 }),
  
  // Tier classification: elite, high_quality, emerging, unknown
  tier: varchar("tier", { length: 20 }).default('unknown'),
  credibilityScore: integer("credibility_score").default(50), // 0-100
  
  // Achievements and specialties
  adccAchievements: jsonb("adcc_achievements"), // ["Gold 2019", "Bronze 2022"]
  ibjjfAchievements: jsonb("ibjjf_achievements"), // ["World Champion 2018"]
  specialties: jsonb("specialties"), // ["passing", "back_attacks", "no_gi"]
  teachingStyle: varchar("teaching_style", { length: 100 }), // conceptual, step_by_step, drilling_focused
  
  // Lineage and affiliation
  gymAffiliation: varchar("gym_affiliation", { length: 255 }),
  lineage: text("lineage"), // Full lineage tree
  beltRank: varchar("belt_rank", { length: 20 }), // black_belt_4th_degree, black_belt_coral
  
  // Curation automation
  autoAccept: boolean("auto_accept").default(false), // Elite instructors bypass quality checks
  boostMultiplier: numeric("boost_multiplier", { precision: 3, scale: 2 }).default('1.0'), // 1.0 = normal, 1.5 = 50% boost
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  nameIdx: index("idx_instructors_name").on(table.name),
  tierIdx: index("idx_instructors_tier").on(table.tier),
  channelIdx: index("idx_instructors_channel").on(table.channelId),
}));

export const insertInstructorSchema = createInsertSchema(instructors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInstructor = z.infer<typeof insertInstructorSchema>;
export type Instructor = typeof instructors.$inferSelect;

// TABLE 2: Technique Taxonomy - Complete BJJ technique classification
export const techniqueTaxonomy = pgTable("technique_taxonomy", {
  id: serial("id").primaryKey(),
  techniqueName: varchar("technique_name", { length: 255 }).unique().notNull(),
  
  // Classification
  category: varchar("category", { length: 100 }), // submission, sweep, pass, escape, takedown, transition
  parentTechnique: varchar("parent_technique", { length: 255 }), // References another technique
  
  // Curation targeting
  targetVideoCount: integer("target_video_count").default(50), // How many videos we want for this technique
  priority: integer("priority").default(5), // 1-10, higher = more important
  
  // Characteristics
  difficultyLevel: varchar("difficulty_level", { length: 20 }), // beginner, intermediate, advanced, expert
  giApplicability: varchar("gi_applicability", { length: 20 }), // gi_only, nogi_only, both
  aliases: jsonb("aliases"), // ["rear_choke", "RNC", "mata_leão"]
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  techniqueIdx: index("idx_taxonomy_technique").on(table.techniqueName),
  categoryIdx: index("idx_taxonomy_category").on(table.category),
  priorityIdx: index("idx_taxonomy_priority").on(table.priority),
}));

export const insertTechniqueTaxonomySchema = createInsertSchema(techniqueTaxonomy).omit({
  id: true,
  createdAt: true,
});

export type InsertTechniqueTaxonomy = z.infer<typeof insertTechniqueTaxonomySchema>;
export type TechniqueTaxonomy = typeof techniqueTaxonomy.$inferSelect;

// TABLE 3: Video Performance - User engagement and feedback tracking
export const videoPerformance = pgTable("video_performance", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull().unique(), // References aiVideoKnowledge.id
  
  // View metrics
  totalViews: integer("total_views").default(0),
  watchCompletionRate: numeric("watch_completion_rate", { precision: 4, scale: 2 }), // 0.00-1.00
  avgWatchTimeSeconds: integer("avg_watch_time_seconds"),
  rewatchCount: integer("rewatch_count").default(0),
  
  // User actions
  savedToLibraryCount: integer("saved_to_library_count").default(0),
  sharedCount: integer("shared_count").default(0),
  notedHelpfulCount: integer("noted_helpful_count").default(0),
  notedUnhelpfulCount: integer("noted_unhelpful_count").default(0),
  
  // Recommendation performance
  recommendedByOsCount: integer("recommended_by_os_count").default(0),
  recommendationAcceptedCount: integer("recommendation_accepted_count").default(0),
  recommendationSuccessRate: numeric("recommendation_success_rate", { precision: 4, scale: 2 }),
  
  // Growth tracking
  recentGrowthRate: numeric("recent_growth_rate", { precision: 4, scale: 2 }), // Percentage growth in last 7 days
  
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  videoIdx: index("idx_performance_video").on(table.videoId),
  successIdx: index("idx_performance_success").on(table.recommendationSuccessRate),
}));

export const insertVideoPerformanceSchema = createInsertSchema(videoPerformance).omit({
  id: true,
  updatedAt: true,
});

export type InsertVideoPerformance = z.infer<typeof insertVideoPerformanceSchema>;
export type VideoPerformance = typeof videoPerformance.$inferSelect;

// TABLE 4: Coverage Status - Track video library completeness per technique
export const coverageStatus = pgTable("coverage_status", {
  id: serial("id").primaryKey(),
  techniqueName: varchar("technique_name", { length: 255 }).unique().notNull(),
  
  // Coverage metrics
  currentCount: integer("current_count").default(0),
  targetCount: integer("target_count").default(50),
  coverageRatio: numeric("coverage_ratio", { precision: 4, scale: 2 }), // 0.00-1.00
  
  // Skill level distribution
  beginnerCount: integer("beginner_count").default(0),
  intermediateCount: integer("intermediate_count").default(0),
  advancedCount: integer("advanced_count").default(0),
  expertCount: integer("expert_count").default(0),
  
  lastAdded: timestamp("last_added"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  techniqueIdx: index("idx_coverage_technique").on(table.techniqueName),
  ratioIdx: index("idx_coverage_ratio").on(table.coverageRatio),
}));

export const insertCoverageStatusSchema = createInsertSchema(coverageStatus).omit({
  id: true,
  updatedAt: true,
});

export type InsertCoverageStatus = z.infer<typeof insertCoverageStatusSchema>;
export type CoverageStatus = typeof coverageStatus.$inferSelect;

// TABLE 5: Emerging Techniques - Detection of new/trending techniques
export const emergingTechniques = pgTable("emerging_techniques", {
  id: serial("id").primaryKey(),
  techniqueName: varchar("technique_name", { length: 255 }).unique().notNull(),
  
  // Detection tracking
  firstDetected: timestamp("first_detected").defaultNow().notNull(),
  videoCount: integer("video_count").default(1),
  instructorCount: integer("instructor_count").default(1),
  
  // Validation
  usedInCompetitions: jsonb("used_in_competitions"), // ["ADCC 2022", "Worlds 2023"]
  status: varchar("status", { length: 20 }).default('monitoring'), // monitoring, validated, added_to_taxonomy, false_positive
  confidenceScore: integer("confidence_score").default(50), // 0-100
  
  // Growth tracking
  weeklyVideoCount: jsonb("weekly_video_count"), // {week1: 2, week2: 5, week3: 8}
  
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  techniqueIdx: index("idx_emerging_technique").on(table.techniqueName),
  statusIdx: index("idx_emerging_status").on(table.status),
  confidenceIdx: index("idx_emerging_confidence").on(table.confidenceScore),
}));

export const insertEmergingTechniqueSchema = createInsertSchema(emergingTechniques).omit({
  id: true,
  firstDetected: true,
  updatedAt: true,
});

export type InsertEmergingTechnique = z.infer<typeof insertEmergingTechniqueSchema>;
export type EmergingTechnique = typeof emergingTechniques.$inferSelect;

// TABLE 6: 7D Algorithm Metadata - Extended to aiVideoKnowledge table
// Add metadata field to aiVideoKnowledge for 7-dimensional scoring
// Structure: {
//   "dimension_scores": {
//     "instructor_authority": 98,
//     "content_quality": 92,
//     "unique_value": 85,
//     "coverage_balance": 65,
//     "emerging_detection": 0,
//     "progression_fit": 88,
//     "user_feedback": 90
//   },
//   "final_score": 89,
//   "unique_value_reason": "Shows 2-on-1 grip to prevent defense",
//   "good_because": ["Elite instructor", "Addresses specific counter"],
//   "acceptance_reason": "Elite instructor auto-accept"
// }

// ═══════════════════════════════════════════════════════════════
// PROFESSOR OS INSIGHTS - Personal Learning Loop (Phase 3)
// ═══════════════════════════════════════════════════════════════

export const professorOsInsights = pgTable("professor_os_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  
  // Insight metadata
  insightType: varchar("insight_type", { length: 50 }).notNull(), 
  // Types: 'topic_focus', 'breakthrough', 'recurring_struggle', 'technique_mention', 'pattern_detected'
  
  // Core insight data
  topic: text("topic"), // e.g., "half guard escapes", "triangle setups"
  concept: text("concept"), // Specific concept within topic
  sentiment: varchar("sentiment", { length: 20 }), // 'struggling', 'improving', 'breakthrough', 'neutral'
  
  // Quantitative tracking
  mentionCount: integer("mention_count").default(1).notNull(), // How many times mentioned
  confidenceScore: integer("confidence_score").default(50).notNull(), // 0-100 confidence in pattern
  
  // Rich insight data (JSONB for flexibility)
  metadata: jsonb("metadata"), 
  // Examples:
  // - For technique_mention: { technique: "armbar", position: "mount", success_rate: "low" }
  // - For breakthrough: { previous_struggle: "...", resolution: "...", conversation_ids: [...] }
  // - For pattern: { frequency: "3x/week", trend: "increasing", related_topics: [...] }
  
  // Temporal tracking
  firstDetected: timestamp("first_detected").defaultNow().notNull(),
  lastMentioned: timestamp("last_mentioned").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("idx_insights_user_id").on(table.userId),
  typeIdx: index("idx_insights_type").on(table.insightType),
  topicIdx: index("idx_insights_topic").on(table.topic),
  lastMentionedIdx: index("idx_insights_last_mentioned").on(table.lastMentioned),
  // Composite unique constraint for deduplication (userId + type + topic + concept)
  uniqueInsight: index("idx_unique_insight").on(table.userId, table.insightType, table.topic, table.concept),
}));

export const insertProfessorOsInsightSchema = createInsertSchema(professorOsInsights).omit({
  id: true,
  firstDetected: true,
  updatedAt: true,
});

export type InsertProfessorOsInsight = z.infer<typeof insertProfessorOsInsightSchema>;
export type ProfessorOsInsight = typeof professorOsInsights.$inferSelect;

// ═══════════════════════════════════════════════════════════════
// SYSTEM SNAPSHOTS - Command Center Intelligence (Nov 18, 2025)
// ═══════════════════════════════════════════════════════════════

export const systemSnapshots = pgTable("system_snapshots", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  
  // Raw Metrics (subscription/MRR data tracked separately in Stripe)
  videoCount: integer("video_count"),
  videosAddedToday: integer("videos_added_today"),
  userCount: integer("user_count"),
  curationRunsToday: integer("curation_runs_today"),
  approvalRate: numeric("approval_rate", { precision: 5, scale: 2 }),
  apiQuotaUsed: integer("api_quota_used"),
  
  // AI-Generated Insights
  insights: jsonb("insights"), // { insights: [], summary: "" }
  anomalies: text("anomalies").array(),
  recommendations: text("recommendations").array(),
  
  // Status Flags
  healthStatus: varchar("health_status", { length: 20 }), // 'healthy', 'warning', 'critical'
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  timestampIdx: index("idx_snapshots_timestamp").on(table.timestamp),
  healthIdx: index("idx_snapshots_health").on(table.healthStatus),
}));

export const insertSystemSnapshotSchema = createInsertSchema(systemSnapshots).omit({
  id: true,
  timestamp: true,
  createdAt: true,
});

export type InsertSystemSnapshot = z.infer<typeof insertSystemSnapshotSchema>;
export type SystemSnapshot = typeof systemSnapshots.$inferSelect;

// ═══════════════════════════════════════════════════════════════
// COMMAND LOG - Track admin command executions (Nov 18, 2025)
// ═══════════════════════════════════════════════════════════════

export const commandLog = pgTable("command_log", {
  id: serial("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull(), // Admin who executed the command
  command: varchar("command", { length: 100 }).notNull(),
  parameters: jsonb("parameters"), // Command parameters
  
  // Execution results
  success: boolean("success").notNull(),
  message: text("message"),
  executionTimeMs: integer("execution_time_ms"),
  
  // Metadata
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  commandIdx: index("idx_command_log_command").on(table.command),
  timestampIdx: index("idx_command_log_timestamp").on(table.timestamp),
  adminIdx: index("idx_command_log_admin").on(table.adminUserId),
}));

export const insertCommandLogSchema = createInsertSchema(commandLog).omit({
  id: true,
  timestamp: true,
});

export type InsertCommandLog = z.infer<typeof insertCommandLogSchema>;
export type CommandLog = typeof commandLog.$inferSelect;

// ═══════════════════════════════════════════════════════════════
// CURATION V2 - Intelligent Video Curation Expansion (Nov 26, 2025)
// ═══════════════════════════════════════════════════════════════

// Curation state tracking - query rotation, quota management
export const curationState = pgTable("curation_state", {
  id: integer("id").primaryKey().default(1),
  lastQueryIndex: integer("last_query_index").default(0),
  quotaUsed: integer("quota_used").default(0),
  quotaResetAt: timestamp("quota_reset_at"),
  lastRunAt: timestamp("last_run_at"),
  totalQueriesGenerated: integer("total_queries_generated").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CurationState = typeof curationState.$inferSelect;

// Query progress tracking - for deep discovery (100 videos per query)
export const queryProgress = pgTable("query_progress", {
  queryHash: varchar("query_hash", { length: 64 }).primaryKey(),
  query: text("query").notNull(),
  queryType: varchar("query_type", { length: 50 }), // 'instructor_technique', 'technique', 'variation', 'concept'
  pageOffset: integer("page_offset").default(0),
  lastRun: timestamp("last_run"),
  videosFound: integer("videos_found").default(0),
  videosApproved: integer("videos_approved").default(0),
  timesSearched: integer("times_searched").default(0),
  lastPageToken: text("last_page_token"),
  exhausted: boolean("exhausted").default(false), // True if no more results
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  typeIdx: index("idx_query_progress_type").on(table.queryType),
  lastRunIdx: index("idx_query_progress_last_run").on(table.lastRun),
}));

export type QueryProgress = typeof queryProgress.$inferSelect;

// Dynamic technique pool - core + discovered techniques
export const techniquePool = pgTable("technique_pool", {
  name: varchar("name", { length: 200 }).primaryKey(),
  isCore: boolean("is_core").default(false), // True if part of initial hardcoded list
  discoveredAt: timestamp("discovered_at").defaultNow(),
  videoCount: integer("video_count").default(0),
  lastSearched: timestamp("last_searched"),
  priority: integer("priority").default(5), // 1-10, higher = search more often
  category: varchar("category", { length: 100 }), // 'submission', 'position', 'action', 'concept'
});

export type TechniquePool = typeof techniquePool.$inferSelect;

// Instructor expansion queue - auto-expand for high-credibility new instructors
export const instructorExpansionQueue = pgTable("instructor_expansion_queue", {
  instructor: varchar("instructor", { length: 200 }).primaryKey(),
  credibility: integer("credibility").default(0),
  discoveredAt: timestamp("discovered_at").defaultNow(),
  discoveredFromVideoId: integer("discovered_from_video_id"),
  processed: boolean("processed").default(false),
  processedAt: timestamp("processed_at"),
  queriesGenerated: integer("queries_generated").default(0),
  videosFound: integer("videos_found").default(0),
});

export type InstructorExpansionQueue = typeof instructorExpansionQueue.$inferSelect;

// ═══════════════════════════════════════════════════════════════
// PROFESSOR OS DIAGNOSTICS - Intelligence System Logging (Nov 26, 2025)
// ═══════════════════════════════════════════════════════════════

export const professorOsDiagnostics = pgTable("professor_os_diagnostics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => bjjUsers.id),
  userMessage: text("user_message"),
  modelUsed: varchar("model_used", { length: 100 }),
  responseTimeMs: integer("response_time_ms"),
  diagnostics: jsonb("diagnostics"), // Full diagnostic JSON object
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_professor_os_diagnostics_user").on(table.userId),
  timestampIdx: index("idx_professor_os_diagnostics_timestamp").on(table.timestamp),
}));

export const insertProfessorOsDiagnosticsSchema = createInsertSchema(professorOsDiagnostics).omit({
  id: true,
  timestamp: true,
});

export type InsertProfessorOsDiagnostics = z.infer<typeof insertProfessorOsDiagnosticsSchema>;
export type ProfessorOsDiagnostics = typeof professorOsDiagnostics.$inferSelect;

// ═══════════════════════════════════════════════════════════════
// CURATION ROTATION TRACKING - Track last curated instructors (Dec 2025)
// ═══════════════════════════════════════════════════════════════

export const curationRotation = pgTable("curation_rotation", {
  id: serial("id").primaryKey(),
  instructorName: text("instructor_name").notNull().unique(),
  lastCuratedAt: timestamp("last_curated_at").defaultNow().notNull(),
  videosBefore: integer("videos_before").default(0),
  videosAfter: integer("videos_after").default(0),
  videosAdded: integer("videos_added").default(0),
  rotationCycle: integer("rotation_cycle").default(1), // Increments when full rotation completes
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  lastCuratedIdx: index("idx_rotation_last_curated").on(table.lastCuratedAt),
  cycleIdx: index("idx_rotation_cycle").on(table.rotationCycle),
}));

export const insertCurationRotationSchema = createInsertSchema(curationRotation).omit({
  id: true,
  createdAt: true,
});

export type InsertCurationRotation = z.infer<typeof insertCurationRotationSchema>;
export type CurationRotation = typeof curationRotation.$inferSelect;

// ═══════════════════════════════════════════════════════════════
// VIDEO KNOWLEDGE SYSTEM - Professor OS Video Understanding (Dec 16, 2025)
// ENHANCED: Comprehensive extraction with relationships and physical considerations
// ═══════════════════════════════════════════════════════════════

// TABLE 1: video_knowledge - Comprehensive extracted knowledge from videos
export const videoKnowledge = pgTable("video_knowledge", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").references(() => aiVideoKnowledge.id).notNull(),
  
  // PRIMARY TECHNIQUE INFO
  techniqueName: text("technique_name").notNull(), // exact name of technique
  positionContext: text("position_context"), // e.g., "closed guard", "mount", "side control"
  techniqueType: text("technique_type"), // submission, sweep, pass, escape, control, transition, takedown, defense
  giOrNogi: text("gi_or_nogi"), // "gi" | "nogi" | "both"
  skillLevel: text("skill_level"), // "beginner" | "intermediate" | "advanced"
  competitionLegal: boolean("competition_legal"), // IBJJF legal at all belt levels?
  
  // DETAIL TYPE - For granular knowledge
  detailType: text("detail_type"), // concept, counter, mechanical, setup, entry, finish, grip, weight_distribution, timing, mistake, tip, defense, chain, backup_option
  detailDescription: text("detail_description"), // what the detail is about
  
  // INSTRUCTOR QUOTES AND TEACHING
  instructorQuote: text("instructor_quote"), // word-for-word what instructor says
  keyConcepts: text("key_concepts").array(), // main teaching points
  instructorTips: text("instructor_tips").array(), // specific advice/cues
  commonMistakes: text("common_mistakes").array(), // what to avoid
  whyItMatters: text("why_it_matters"), // why this detail is important
  problemSolved: text("problem_solved"), // what problem does this fix?
  
  // TIMESTAMPS
  timestampStart: text("timestamp_start"), // MM:SS when technique starts
  timestampEnd: text("timestamp_end"), // MM:SS when it ends
  
  // TECHNIQUE RELATIONSHIPS
  setupsFrom: text("setups_from").array(), // what leads into this?
  chainsTo: text("chains_to").array(), // what can you transition to?
  counters: text("counters").array(), // common defense and how to beat it
  counterTo: text("counter_to").array(), // what techniques does THIS counter?
  
  // PHYSICAL CONSIDERATIONS
  bodyTypeNotes: text("body_type_notes"), // "if you're tall", "for shorter grapplers", etc.
  strengthRequired: text("strength_required"), // Low/Medium/High
  flexibilityRequired: text("flexibility_required"), // Low/Medium/High
  athleticDemand: text("athletic_demand"), // Low/Medium/High
  
  // VIDEO METADATA (denormalized for query speed)
  instructorName: text("instructor_name"),
  instructorCredentials: text("instructor_credentials"), // titles/achievements
  prerequisites: text("prerequisites").array(), // what you should know first
  nextToLearn: text("next_to_learn").array(), // what to learn after
  bestFor: text("best_for"), // "competition" | "self_defense" | "hobbyist" | "all"
  
  // SUMMARY
  fullSummary: text("full_summary"), // 2-3 sentence summary
  extractedAt: timestamp("extracted_at").defaultNow().notNull(),
}, (table) => ({
  videoIdx: index("idx_video_knowledge_video").on(table.videoId),
  techniqueIdx: index("idx_video_knowledge_technique").on(table.techniqueName),
  positionIdx: index("idx_video_knowledge_position").on(table.positionContext),
  typeIdx: index("idx_video_knowledge_type").on(table.techniqueType),
  detailIdx: index("idx_video_knowledge_detail").on(table.detailType),
  instructorIdx: index("idx_video_knowledge_instructor").on(table.instructorName),
  skillIdx: index("idx_video_knowledge_skill").on(table.skillLevel),
}));

export const insertVideoKnowledgeSchema = createInsertSchema(videoKnowledge).omit({
  id: true,
  extractedAt: true,
});

export type InsertVideoKnowledge = z.infer<typeof insertVideoKnowledgeSchema>;
export type VideoKnowledge = typeof videoKnowledge.$inferSelect;

// TABLE 3: knowledge_effectiveness - Track what works for continuous learning
export const knowledgeEffectiveness = pgTable("knowledge_effectiveness", {
  id: serial("id").primaryKey(),
  videoKnowledgeId: integer("video_knowledge_id").references(() => videoKnowledge.id),
  timesRecommended: integer("times_recommended").default(0),
  thumbsUpCount: integer("thumbs_up_count").default(0),
  thumbsDownCount: integer("thumbs_down_count").default(0),
  userFeedback: text("user_feedback"), // free text feedback
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  knowledgeIdx: index("idx_effectiveness_knowledge").on(table.videoKnowledgeId),
}));

export const insertKnowledgeEffectivenessSchema = createInsertSchema(knowledgeEffectiveness).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertKnowledgeEffectiveness = z.infer<typeof insertKnowledgeEffectivenessSchema>;
export type KnowledgeEffectiveness = typeof knowledgeEffectiveness.$inferSelect;

// TABLE 2: video_watch_status - Tracking what's been processed
export const videoWatchStatus = pgTable("video_watch_status", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").references(() => aiVideoKnowledge.id).notNull().unique(),
  hasTranscript: boolean("has_transcript").default(false),
  transcriptSource: text("transcript_source"), // 'youtube' or 'whisper'
  transcriptText: text("transcript_text"), // the raw transcript
  processed: boolean("processed").default(false),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"), // if processing failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  processedIdx: index("idx_video_watch_processed").on(table.processed),
  hasTranscriptIdx: index("idx_video_watch_transcript").on(table.hasTranscript),
}));

export const insertVideoWatchStatusSchema = createInsertSchema(videoWatchStatus).omit({
  id: true,
  createdAt: true,
});

export type InsertVideoWatchStatus = z.infer<typeof insertVideoWatchStatusSchema>;
export type VideoWatchStatus = typeof videoWatchStatus.$inferSelect;

// TABLE 4: technique_synthesis - Aggregated knowledge across all instructors per technique
export const techniqueSynthesis = pgTable("technique_synthesis", {
  id: serial("id").primaryKey(),
  techniqueName: text("technique_name").notNull().unique(), // e.g., "mount retention", "armbar"
  relatedTechniques: text("related_techniques").array(), // ["mount attacks", "side control transition"]
  allVideoIds: integer("all_video_ids").array(), // [12, 34, 56, ...] all videos covering this
  allInstructors: text("all_instructors").array(), // ["Roger Gracie", "Danaher", ...]
  keyPrinciples: text("key_principles").array(), // Synthesized principles from all instructors
  principleSources: jsonb("principle_sources"), // {"hip_pressure": {video_id: 12, timestamp: "2:30", instructor: "Roger"}}
  totalVideos: integer("total_videos").default(0),
  totalTechniques: integer("total_techniques").default(0), // distinct techniques extracted
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  techniqueNameIdx: index("idx_synthesis_technique").on(table.techniqueName),
}));

export const insertTechniqueSynthesisSchema = createInsertSchema(techniqueSynthesis).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTechniqueSynthesis = z.infer<typeof insertTechniqueSynthesisSchema>;
export type TechniqueSynthesis = typeof techniqueSynthesis.$inferSelect;

// TABLE 5: overnight_progress - Track overnight processing runs
export const overnightProgress = pgTable("overnight_progress", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  videosProcessed: integer("videos_processed").default(0),
  videosRemaining: integer("videos_remaining").default(0),
  videosFailed: integer("videos_failed").default(0),
  failedVideoIds: integer("failed_video_ids").array(),
  techniquesExtracted: integer("techniques_extracted").default(0),
  uniqueTechniques: integer("unique_techniques").default(0),
  lastBatchAt: timestamp("last_batch_at"),
  estimatedCompletion: timestamp("estimated_completion"),
  status: text("status").default("running"), // running, completed, paused, error
  logEntries: jsonb("log_entries"), // Array of log entries
  completedAt: timestamp("completed_at"),
});

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFIED COMPETITION RESULTS TABLES
// ═══════════════════════════════════════════════════════════════════════════════

// ADCC Results (Historical)
export const adccResults = pgTable("adcc_results", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  weightClass: text("weight_class").notNull(),
  gender: text("gender").default("male"),
  place: integer("place").notNull(), // 1 = gold, 2 = silver, 3 = bronze
  athleteName: text("athlete_name").notNull(),
  athleteNameNormalized: text("athlete_name_normalized").notNull(), // lowercase for matching
  submissionWins: integer("submission_wins").default(0),
  totalMatches: integer("total_matches").default(0),
  notableWins: text("notable_wins").array(), // notable opponents defeated
  createdAt: timestamp("created_at").defaultNow().notNull(),
  verified: boolean("verified").default(true),
  source: text("source").default("manual_entry"),
}, (table) => ({
  athleteIdx: index("idx_adcc_athlete").on(table.athleteNameNormalized),
  yearIdx: index("idx_adcc_year").on(table.year),
}));

export const insertAdccResultsSchema = createInsertSchema(adccResults).omit({
  id: true,
  createdAt: true,
});

export type InsertAdccResults = z.infer<typeof insertAdccResultsSchema>;
export type AdccResults = typeof adccResults.$inferSelect;

// IBJJF World Championship Results
export const ibjjfWorldsResults = pgTable("ibjjf_worlds_results", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  weightClass: text("weight_class").notNull(),
  belt: text("belt").notNull(), // 'black', 'brown', 'purple', 'blue', 'white'
  gender: text("gender").default("male"),
  giOrNogi: text("gi_or_nogi").default("gi"),
  place: integer("place").notNull(),
  athleteName: text("athlete_name").notNull(),
  athleteNameNormalized: text("athlete_name_normalized").notNull(),
  team: text("team"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  verified: boolean("verified").default(true),
  source: text("source").default("manual_entry"),
}, (table) => ({
  athleteIdx: index("idx_ibjjf_worlds_athlete").on(table.athleteNameNormalized),
  yearIdx: index("idx_ibjjf_worlds_year").on(table.year),
}));

export const insertIbjjfWorldsResultsSchema = createInsertSchema(ibjjfWorldsResults).omit({
  id: true,
  createdAt: true,
});

export type InsertIbjjfWorldsResults = z.infer<typeof insertIbjjfWorldsResultsSchema>;
export type IbjjfWorldsResults = typeof ibjjfWorldsResults.$inferSelect;

// IBJJF Pans Results
export const ibjjfPansResults = pgTable("ibjjf_pans_results", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  weightClass: text("weight_class").notNull(),
  belt: text("belt").notNull(),
  gender: text("gender").default("male"),
  giOrNogi: text("gi_or_nogi").default("gi"),
  place: integer("place").notNull(),
  athleteName: text("athlete_name").notNull(),
  athleteNameNormalized: text("athlete_name_normalized").notNull(),
  team: text("team"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  verified: boolean("verified").default(true),
  source: text("source").default("manual_entry"),
}, (table) => ({
  athleteIdx: index("idx_ibjjf_pans_athlete").on(table.athleteNameNormalized),
  yearIdx: index("idx_ibjjf_pans_year").on(table.year),
}));

export const insertIbjjfPansResultsSchema = createInsertSchema(ibjjfPansResults).omit({
  id: true,
  createdAt: true,
});

export type InsertIbjjfPansResults = z.infer<typeof insertIbjjfPansResultsSchema>;
export type IbjjfPansResults = typeof ibjjfPansResults.$inferSelect;

// Instructor Credentials Summary (aggregated view for quick lookup)
export const instructorVerifiedCredentials = pgTable("instructor_verified_credentials", {
  id: serial("id").primaryKey(),
  instructorName: text("instructor_name").notNull(),
  instructorNameNormalized: text("instructor_name_normalized").notNull().unique(),
  
  // ADCC achievements
  adccGold: integer("adcc_gold").default(0),
  adccSilver: integer("adcc_silver").default(0),
  adccBronze: integer("adcc_bronze").default(0),
  adccYearsWon: text("adcc_years_won").array(), // ['2019', '2022']
  
  // IBJJF Worlds achievements
  ibjjfWorldsGold: integer("ibjjf_worlds_gold").default(0),
  ibjjfWorldsSilver: integer("ibjjf_worlds_silver").default(0),
  ibjjfWorldsBronze: integer("ibjjf_worlds_bronze").default(0),
  
  // IBJJF Pans achievements
  ibjjfPansGold: integer("ibjjf_pans_gold").default(0),
  ibjjfPansSilver: integer("ibjjf_pans_silver").default(0),
  ibjjfPansBronze: integer("ibjjf_pans_bronze").default(0),
  
  // Other verified info
  beltRank: text("belt_rank"), // 'black', 'coral', 'red'
  team: text("team"),
  knownFor: text("known_for").array(), // ['pressure passing', 'leg locks']
  teachingStyle: text("teaching_style"),
  
  // Metadata
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  verified: boolean("verified").default(true),
}, (table) => ({
  nameIdx: index("idx_credentials_name").on(table.instructorNameNormalized),
}));

export const insertInstructorVerifiedCredentialsSchema = createInsertSchema(instructorVerifiedCredentials).omit({
  id: true,
  lastUpdated: true,
});

export type InsertInstructorVerifiedCredentials = z.infer<typeof insertInstructorVerifiedCredentialsSchema>;
export type InstructorVerifiedCredentials = typeof instructorVerifiedCredentials.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSOR OS DATA INFRASTRUCTURE - COLLECTION ONLY (January 2026)
// ═══════════════════════════════════════════════════════════════════════════════

// Video Recommendation Log - Track every video recommendation and outcome
export const videoRecommendationLog = pgTable("video_recommendation_log", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id"),
  videoId: integer("video_id"),
  videoTitle: text("video_title").notNull(),
  instructorName: text("instructor_name"),
  timestampGiven: text("timestamp_given"),
  problemItSolved: text("problem_it_solved"),
  recommendedAt: timestamp("recommended_at").defaultNow().notNull(),
  userResponse: text("user_response").default("unknown"),
  userWatched: boolean("user_watched"),
  followUpSuccess: boolean("follow_up_success"),
  daysToOutcome: integer("days_to_outcome"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("video_rec_log_user_idx").on(table.userId),
  videoIdx: index("video_rec_log_video_idx").on(table.videoId),
  recommendedIdx: index("video_rec_log_recommended_idx").on(table.recommendedAt.desc()),
}));

export const insertVideoRecommendationLogSchema = createInsertSchema(videoRecommendationLog).omit({
  id: true,
  createdAt: true,
  recommendedAt: true,
});

export type InsertVideoRecommendationLog = z.infer<typeof insertVideoRecommendationLogSchema>;
export type VideoRecommendationLog = typeof videoRecommendationLog.$inferSelect;

// User Engagement Patterns - Daily engagement metrics
export const userEngagementPatterns = pgTable("user_engagement_patterns", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  date: date("date").notNull(),
  messagesSent: integer("messages_sent").default(0),
  totalWordsSent: integer("total_words_sent").default(0),
  averageMessageLength: integer("average_message_length"),
  hoursActive: jsonb("hours_active"),
  daysSincePrevious: integer("days_since_previous"),
  sessionDurationSeconds: integer("session_duration_seconds"),
  emotionalTrend: text("emotional_trend"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("user_engagement_user_idx").on(table.userId),
  dateIdx: index("user_engagement_date_idx").on(table.date.desc()),
  userDateUnique: index("user_engagement_user_date_idx").on(table.userId, table.date),
}));

export const insertUserEngagementPatternsSchema = createInsertSchema(userEngagementPatterns).omit({
  id: true,
  createdAt: true,
});

export type InsertUserEngagementPatterns = z.infer<typeof insertUserEngagementPatternsSchema>;
export type UserEngagementPatterns = typeof userEngagementPatterns.$inferSelect;

// Breakthrough Tracking - Track technique breakthroughs
export const breakthroughTracking = pgTable("breakthrough_tracking", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => bjjUsers.id, { onDelete: 'cascade' }),
  techniqueName: text("technique_name").notNull(),
  struggleStarted: timestamp("struggle_started"),
  breakthroughDate: timestamp("breakthrough_date").notNull(),
  daysToBreakthrough: integer("days_to_breakthrough"),
  whatHelped: jsonb("what_helped"),
  userProfileAtBreakthrough: jsonb("user_profile_at_breakthrough"),
  signalsBeforeBreakthrough: jsonb("signals_before_breakthrough"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("breakthrough_user_idx").on(table.userId),
  techniqueIdx: index("breakthrough_technique_idx").on(table.techniqueName),
  dateIdx: index("breakthrough_date_idx").on(table.breakthroughDate.desc()),
}));

export const insertBreakthroughTrackingSchema = createInsertSchema(breakthroughTracking).omit({
  id: true,
  createdAt: true,
});

export type InsertBreakthroughTracking = z.infer<typeof insertBreakthroughTrackingSchema>;
export type BreakthroughTracking = typeof breakthroughTracking.$inferSelect;

