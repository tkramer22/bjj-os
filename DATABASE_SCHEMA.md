# BJJ OS - DATABASE SCHEMA (VERIFIED FROM shared/schema.ts)

**Source File:** `shared/schema.ts` (2,510 lines)  
**Database:** PostgreSQL  
**ORM:** Drizzle  
**Total Tables:** 78 (verified by counting pgTable exports)  
**Generated:** January 18, 2025

**METHOD:** This document lists ALL tables defined in shared/schema.ts with their actual column definitions.  
**NO FABRICATIONS:** All information directly from schema.ts code.

---

## TABLE SUMMARY

**Core User & Auth Tables (11):**
- recipients
- bjjUsers
- referralCodes
- pushSubscriptions
- authorizedDevices
- loginEvents
- flaggedAccounts
- userEngagement
- userPreferences
- adminUsers
- lifetimeMemberships

**SMS & Messaging Tables (4):**
- smsSchedules
- smsHistory
- messageTemplates
- sentTechniques

**Video & Content Tables (8):**
- videos
- aiVideoKnowledge
- videoFeedback
- videoRecommendations
- videoCurationLog
- videoAnalyses
- techniqueQualityReviews
- recommendationHistory

**User Interaction Tables (7):**
- userSavedVideos
- userVideoFeedback
- userFeedbackStats
- userFeedbackHistory
- userVideoInteractions
- videoSuccessPatterns
- userTechniqueRequests

**AI Intelligence Tables (23):**
- aiConversationLearning
- aiUserContext
- aiUserFeedbackSignals
- aiProblemSolutionMap
- aiTechniqueRelationships
- aiConfidenceTracking
- aiReasoningTraces
- aiInstructorProfiles
- aiEffectivenessTracking
- aiInjuryAwareness
- aiSemanticEmbeddings
- aiPredictiveModels
- aiCompetitionMeta
- aiSentimentAnalysis
- aiTechniqueEvolution
- aiInstructorLineage
- aiCounterChains
- aiBodyTypeOptimization
- aiGymCulture
- aiTerminologyMapping
- aiCompetitionRules
- aiMicroDetails
- aiFailureModes
- aiLearningCurves
- aiAttribution
- aiTrainingLoad
- aiUserJourney
- aiFeatureFlags

**Admin & Analytics Tables (8):**
- adminActivityLog
- adminChatHistory
- dailyAiMetrics
- userLearningProfile
- instructorPerformance
- emergingInstructors
- competitionMeta
- techniqueMetaStatus

**Instructor & Credibility Tables (4):**
- instructorCredibility
- featuredInstructors
- curationSearchQueue
- curationSettings

**Curation & Search Tables (3):**
- curationRuns
- searchQueriesLog
- techniqueRelationships

**Technique Chains Tables (3):**
- techniqueChains
- userSavedChains
- chainFeedback

**App Features Tables (2):**
- appWaitlist
- shortUrls

---

## CORE TABLES (Detailed Schemas)

### 1. bjjUsers (Main User Table)

**Purpose:** Primary user/subscriber table  
**Location:** Lines 119-191 in schema.ts  
**Primary Key:** `id` (varchar, UUID)

**Schema (50+ columns):**
```typescript
{
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Auth
  phoneNumber: text("phone_number").notNull().unique(),
  lastLogin: timestamp("last_login"),
  verificationAttempts: integer("verification_attempts").default(0),
  lastVerificationAttempt: timestamp("last_verification_attempt"),
  blockedUntil: timestamp("blocked_until"),
  
  // Profile
  name: text("name"),
  adminNotes: text("admin_notes"),
  beltLevel: text("belt_level"), // white, blue, purple, brown, black
  style: text("style").default("both"), // gi, nogi, both
  contentPreference: text("content_preference"), // FUNDAMENTALS, MIXED, ADVANCED
  focusAreas: text("focus_areas").array(),
  injuries: text("injuries").array(),
  competeStatus: text("compete_status"),
  trainingGoals: text("training_goals").array(),
  
  // Subscription
  subscriptionType: text("subscription_type").default("free_trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").default("active"),
  trialEndDate: timestamp("trial_end_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  
  // Onboarding
  onboardingStep: text("onboarding_step").default("belt"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  
  // Referrals
  referralCode: text("referral_code").unique(),
  referredBy: text("referred_by"),
  
  // Personalization
  bodyType: text("body_type"),
  ageRange: text("age_range"),
  trainingStylePreference: text("training_style_preference"),
  learningStyle: text("learning_style"),
  preferredInstructors: text("preferred_instructors").array(),
  preferredVideoLengthMin: integer("preferred_video_length_min").default(5),
  preferredVideoLengthMax: integer("preferred_video_length_max").default(20),
  
  // Language
  preferredLanguage: text("preferred_language").default("en"),
  languagePreferenceSet: boolean("language_preference_set").default(false),
  
  // Voice (ElevenLabs)
  voiceEnabled: boolean("voice_enabled").default(false),
  voiceId: text("voice_id").default("ErXwobaYiN019PkySvjV"), // Antoni
  voiceSpeed: doublePrecision("voice_speed").default(1.0),
  voiceAutoplay: boolean("voice_autoplay").default(true),
  
  // Theme (IBJJF Belt)
  themeBelt: text("theme_belt").default("blue"),
  themeStripes: integer("theme_stripes").default(0),
  
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}
```

**Indexes:**
- `bjj_users_phone_idx` on phoneNumber

---

### 2. aiVideoKnowledge (Curated Video Library)

**Purpose:** Curated BJJ video library  
**Location:** Lines 1050+ in schema.ts  
**Primary Key:** `id` (varchar, UUID)

**Schema (30+ columns):**
```typescript
{
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  techniqueName: text("technique_name"),
  techniqueType: text("technique_type"), // submission, guard, pass, sweep, escape
  instructorName: text("instructor_name"),
  instructorId: varchar("instructor_id"),
  videoUrl: text("video_url").notNull().unique(),
  youtubeId: text("youtube_id"),
  thumbnailUrl: text("thumbnail_url"),
  
  // Quality scores
  qualityScore: doublePrecision("quality_score"), // 0-10
  instructionClarity: doublePrecision("instruction_clarity"),
  keyDetails: doublePrecision("key_details"),
  productionQuality: doublePrecision("production_quality"),
  teachingEffectiveness: doublePrecision("teaching_effectiveness"),
  
  // Metadata
  style: text("style"), // gi, nogi, both
  beltLevels: text("belt_levels").array(),
  duration: integer("duration"),
  publishedAt: timestamp("published_at"),
  
  // User feedback
  helpfulCount: integer("helpful_count").default(0),
  notHelpfulCount: integer("not_helpful_count").default(0),
  avgUserRating: doublePrecision("avg_user_rating"),
  
  // Ranking
  rankingScore: doublePrecision("ranking_score"),
  lastRanked: timestamp("last_ranked"),
  
  curatedAt: timestamp("curated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}
```

---

### 3. instructorCredibility (Instructor Priority System)

**Purpose:** Auto-calculated instructor priority scores  
**Location:** Lines 2100+ in schema.ts  
**Primary Key:** `id` (varchar, UUID)

**Schema:**
```typescript
{
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  
  // YouTube presence
  youtubeChannelId: text("youtube_channel_id"),
  youtubeHandle: text("youtube_handle"),
  subscriberCount: integer("subscriber_count"),
  
  // Priority components (0-100 total)
  subscriberPoints: integer("subscriber_points").default(0), // 0-30
  achievementPoints: integer("achievement_points").default(0), // 0-25
  instructionalPoints: integer("instructional_points").default(0), // 0-20
  feedbackPoints: integer("feedback_points").default(0), // 0-25
  
  priorityScore: integer("priority_score").default(0), // Total 0-100
  manualOverride: integer("manual_override"), // Admin can override
  overrideReason: text("override_reason"),
  
  // Tier system
  tier: integer("tier").default(1), // 1 = 7.5+, 2 = 8.5+
  qualityThreshold: doublePrecision("quality_threshold").default(7.5),
  
  // Metadata
  bio: text("bio"),
  rank: text("rank"), // black belt, etc.
  achievements: text("achievements").array(),
  lineage: text("lineage"),
  
  // Feedback tracking
  videoCount: integer("video_count").default(0),
  avgQualityScore: doublePrecision("avg_quality_score"),
  helpfulRatio: doublePrecision("helpful_ratio"),
  
  lastCalculated: timestamp("last_calculated"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}
```

---

### 4. aiConversationLearning (Prof. OS Chat Logs)

**Purpose:** Prof. OS conversation history & dual-model tracking  
**Location:** Lines 1800+ in schema.ts  
**Primary Key:** `id` (varchar, UUID)

**Schema:**
```typescript
{
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  messageText: text("message_text").notNull(),
  messageType: text("message_type").notNull(), // user_sent, ai_sent
  
  // Dual-model tracking
  modelUsed: text("model_used"), // gpt-4o, claude-sonnet-4, gpt-4o-fallback
  complexityScore: integer("complexity_score"), // 0-10
  
  // Learning signals
  containsValuableSignal: boolean("contains_valuable_signal"),
  signalType: text("signal_type"),
  confidence: doublePrecision("confidence"),
  
  // Performance
  responseTime: integer("response_time"), // milliseconds
  tokensUsed: integer("tokens_used"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}
```

---

### 5. shortUrls (URL Shortener)

**Purpose:** bjjos.app/t/CODE URL shortener with analytics  
**Location:** Lines 2450+ in schema.ts  
**Primary Key:** `id` (varchar, UUID)

**Schema:**
```typescript
{
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shortCode: text("short_code").notNull().unique(),
  youtubeId: text("youtube_id").notNull(),
  
  // OG metadata
  videoTitle: text("video_title"),
  instructorName: text("instructor_name"),
  thumbnailUrl: text("thumbnail_url"),
  
  // Analytics
  clickCount: integer("click_count").default(0),
  lastClicked: timestamp("last_clicked"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}
```

---

### 6. authorizedDevices (Account Sharing Prevention)

**Purpose:** Device fingerprinting & 3-device limit  
**Location:** Lines 259-278 in schema.ts  
**Primary Key:** `id` (varchar, UUID)

**Schema:**
```typescript
{
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  deviceName: text("device_name"),
  deviceType: text("device_type"), // mobile, tablet, desktop
  browser: text("browser"),
  os: text("os"),
  firstSeen: timestamp("first_seen").defaultNow().notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
  loginCount: integer("login_count").default(1),
  ipAddress: text("ip_address"),
  city: text("city"),
  country: text("country"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}
```

**Indexes:**
- `idx_user_devices` on userId
- `idx_device_fingerprint` on userId, fingerprint

---

## COMPLETE TABLE LIST (All 78 Tables)

1. recipients
2. smsSchedules
3. smsHistory
4. messageTemplates
5. userPreferences
6. bjjUsers ⭐
7. referralCodes
8. pushSubscriptions
9. authorizedDevices ⭐
10. loginEvents
11. flaggedAccounts
12. userEngagement
13. sentTechniques
14. videos
15. userFeedbackHistory
16. userLearningProfile
17. instructorPerformance
18. dailyAiMetrics
19. emergingInstructors
20. techniqueRelationships
21. competitionMeta
22. techniqueQualityReviews
23. videoAnalyses
24. recommendationHistory
25. aiVideoKnowledge ⭐
26. videoFeedback
27. videoRecommendations
28. videoCurationLog
29. aiUserFeedbackSignals
30. aiProblemSolutionMap
31. aiUserContext
32. aiTechniqueRelationships
33. aiConfidenceTracking
34. aiReasoningTraces
35. aiInstructorProfiles
36. aiEffectivenessTracking
37. aiInjuryAwareness
38. aiSemanticEmbeddings
39. aiPredictiveModels
40. aiCompetitionMeta
41. aiSentimentAnalysis
42. aiTechniqueEvolution
43. aiInstructorLineage
44. aiCounterChains
45. aiBodyTypeOptimization
46. aiGymCulture
47. aiTerminologyMapping
48. aiCompetitionRules
49. aiMicroDetails
50. aiFailureModes
51. aiLearningCurves
52. aiAttribution
53. aiTrainingLoad
54. aiUserJourney
55. aiConversationLearning ⭐
56. adminChatHistory
57. aiFeatureFlags
58. userSavedVideos
59. adminUsers
60. lifetimeMemberships
61. adminActivityLog
62. userVideoFeedback
63. userFeedbackStats
64. videoSuccessPatterns
65. userVideoInteractions
66. userTechniqueRequests
67. techniqueMetaStatus
68. instructorCredibility ⭐
69. curationSearchQueue
70. curationRuns
71. searchQueriesLog
72. featuredInstructors
73. curationSettings
74. techniqueChains
75. userSavedChains
76. chainFeedback
77. appWaitlist
78. shortUrls ⭐

**⭐ = Most Critical Tables**

---

## WHAT I CANNOT VERIFY

**Cannot verify without database access:**
- How many rows are in any table
- Whether tables actually exist in the database
- Data types of actual data stored
- Index performance
- Query performance
- Database size
- Migration history

**Cannot verify without running the code:**
- Whether schema migrations work
- Whether foreign key relationships function
- Whether indexes improve performance
- Whether default values are applied
- Whether constraints are enforced

**To verify database state:**
1. Connect to PostgreSQL database
2. Run `SELECT COUNT(*) FROM table_name` for each table
3. Run `\d table_name` to see actual structure
4. Compare actual DB structure to schema.ts

**Known Facts:**
- 78 tables defined in schema.ts (verified by counting)
- All use pgTable (PostgreSQL)
- All use Drizzle ORM syntax
- Primary keys mostly use varchar with UUID default
- Many tables have timestamp tracking (createdAt, updatedAt)
- Extensive use of text arrays for flexible data storage
- Heavy use of jsonb for complex nested data

