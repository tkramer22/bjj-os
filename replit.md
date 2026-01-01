# BJJ OS - AI-Powered BJJ Training Platform

## Overview
"Prof. OS" is an AI-powered BJJ training platform delivered as a full-stack Node.js web application. It offers chat-based coaching, personalized video recommendations, and progress tracking for BJJ practitioners across web and mobile platforms. The project's vision is to become the leading AI-powered BJJ coaching platform, providing personalized training and leveraging significant market potential within the BJJ community through an AI-driven coaching and content curation system.

## User Preferences
- Default theme: Dark mode
- Timezone: America/New_York (configurable per schedule)
- Design: Linear/Notion-inspired productivity tool aesthetic
- Color scheme: Purple primary (#8B5CF6) with professional dark mode

## System Architecture

### UI/UX Decisions
The application features a public SaaS landing page with a brutal minimalist aesthetic and sophisticated motion system. It includes email-based authentication with a mandatory onboarding flow and a special 5-step onboarding wizard for lifetime users. An Admin Dashboard utilizes Shadcn UI components and Tailwind CSS with a professional dark mode and purple primary color. A Mobile PWA is optimized for smartphone interactions with an isolated dark-themed design system.

### Technical Implementations
The application uses a React TypeScript frontend and an Express.js backend with PostgreSQL via Drizzle ORM.

- **AI-Powered Curators**: Employs a Hybrid 3-Path + 9-Dimensional Evaluation System for video analysis and mandatory Stage 4 QC, including instructional vs entertainment detection, cross-channel instructor recognition, and content quality analysis.
- **Professor OS Chat Engine**: Claude Sonnet 4.5-powered implementation using structured output, TRUE token streaming, forced tool calling, and parallelized database queries. It incorporates a modular prompt builder, citations from elite instructors, diagnostic intelligence, and semantic video search. The AI personality is a "black belt best friend" training partner with a 15-section system prompt, multi-instructor synthesis, conversational tone, specific coaching methodology (diagnose before prescribing, one thing at a time, homework), and features like sparring debrief mode and celebrating wins. **Personality v1.2** includes memory guidelines (reference past convos when useful), video recommendation rules (never repeat same video twice), respect for user's coach (never contradict their instruction), and emotional context handling (validate first when user is venting).
- **User Technique Request Tracking**: System tracks technique mentions from user messages via `server/technique-extractor.ts` and feeds them to the Meta Analyzer for curation prioritization. Logs each technique request with user context (belt level, style, gi preference) for trend analysis.
- **Semantic Video Search**: Professor OS uses intelligent search to find videos matching the user's actual question context. The system extracts search intent (position, technique type, specific intent like escape/sweep/pass) from user messages, maps BJJ terminology (e.g., "knee shield" → half_guard), and searches the video database for relevant content. Search context is injected into the AI prompt to ensure recommendations match user queries. Includes **perspective detection** to differentiate TOP (passer) vs BOTTOM (guard player) intent based on specific BJJ terminology. Falls back to top-quality videos when semantic search returns no results.
- **Version Cache Busting System**: Server-side `/api/version` endpoint provides version info (v6.0.4+). Frontend fetches version on load and auto-reloads with cache/service worker clearing when version mismatch detected.
- **Professor OS True Streaming**: Real-time token streaming with a robust state machine parser, complete escape handling, immediate SSE events, first-token metrics, and in-memory caching with automatic invalidation.
- **Personal Learning Loop**: Automatically analyzes conversations to extract topics, techniques, and sentiment for personalized coaching adaptation.
- **Combat Sports News Integration**: Dynamically includes recent BJJ news from multiple sources with OpenAI embeddings for AI entity extraction and semantic search.
- **Personalization Engine**: Adapts AI coaching based on user profile data (belt level, style, injuries, focus areas, body type, training goals) collected during onboarding.
- **Admin Dashboards**: JWT-authenticated interfaces for managing users, referrals, AI monitoring, video library, and lifetime access invitations.
- **Persistent Login System**: "Keep me signed in for 30 days" functionality affecting JWT token expiry, cookie maxAge, and database session expiry across all authentication paths.
- **Referral System**: Comprehensive affiliate program with admin-assigned codes, recurring lifetime commissions, and automated payouts.
- **Lifetime Access Invitation System**: Allows admins to grant lifetime subscriptions via secure email invitations.
- **Auto-Curation System**: Dynamically discovers and curates high-quality BJJ technique videos using AI analysis, including robust YouTube API quota safeguards.
- **Command Center**: Production-grade admin interface with full sidebar navigation, detailed command descriptions, in-page curation results display, configurable settings, and comprehensive execution logging. Features automated operational intelligence and one-click controls for various operations.
- **Intelligent Curator V2**: Major upgrade to the video curation system with dynamic discovery capabilities, including a dynamic instructor pool, technique pool, over 800 query combinations, query rotation, deep discovery, intent-based sorting, smart duplicate handling, and auto-expansion for new instructors.
- **Smart Video Search (Admin Dashboard)**: Dynamic instructor/technique dropdowns with video counts, fuzzy search, and quality/date range filters.
- **Unified Curation System V3**: Simplified, search-based curation system with AI analysis for instructional content detection, a quality threshold of 7.0+, daily scheduled curation, rotation tracking, and Command Center integration with status-based email reports.
- **Permanent Auto-Curation System**: "Set and forget" automated video discovery targeting underrepresented instructors (< 50 videos). Features:
  - **5-Step Algorithm**: Get targets → 5 search patterns per instructor → Duplicate check before API → Quality filter (6.5+ for known instructors, 7.0+ for new) → Save & queue for Gemini
  - **4 Safeguards**: (1) fully_mined instructor cooldown (30 days), (2) technique fallback after 3 empty instructors, (3) quota exhaustion handling (403 detection), (4) low-yield email alerts (< 5 videos)
  - **Self-Expanding Discovery**: New instructors found during Gemini processing automatically added to the curation pool
  - **Schedule**: 4x daily (3:15am, 9am, 3pm, 9pm America/New_York timezone)
  - **Notifications**: Email reports to todd@bjjos.app after each run, dedicated low-yield alerts when < 5 videos added
- **Video Knowledge System V2**: Professor OS now "watches" every video using Gemini API to process YouTube videos natively and extract deeply structured BJJ knowledge for intelligent coaching. This includes comprehensive knowledge extraction (30+ fields covering categorization, instructor wisdom, problem-solving, technique chains, physical considerations, training context), intelligent knowledge retrieval, and integration into Professor OS recommendations.
- **Professor OS Knowledge Embodiment V1**: Major enhancement to make Professor OS EMBODY its knowledge rather than just ACCESS it. Includes 5 layers:
  - **Layer 1 (Knowledge Embodiment)**: Reframes video knowledge from "database to search" to "knowledge I possess" - Claude believes it HAS the knowledge, not just access to it.
  - **Layer 2 (Knowledge Synthesizer)**: `server/utils/knowledge-synthesizer.ts` - Groups extracted knowledge by topic across multiple instructors, synthesizing approaches, common mistakes, prerequisites, and technique chains.
  - **Layer 3 (Contextual Injection)**: Detects BJJ topics from user messages and injects ONLY relevant synthesized knowledge into the prompt (instead of generic video lists).
  - **Layer 4 (Expert Reasoning Patterns)**: Teaches Claude the 5-step reasoning process of an expert coach: Diagnose → Strategic Context → Personalize → Synthesize → Actionable Specifics.
  - **Layer 5 (Learning Loop)**: `server/utils/coaching-learning-loop.ts` - Tracks coaching outcomes, analyzes user response sentiment, detects success reports, and builds aggregate insights for population-level learning.
- **Professor OS Data Infrastructure (January 2026)**: Collection-only system that tracks user data asynchronously AFTER AI responses are delivered. Does NOT modify Professor OS responses. Includes:
  - **Video Recommendation Tracking**: Parses [VIDEO: Title by Instructor] and [VIDEO: Title | START: 4:32] tokens from AI responses, logs to `videoRecommendationLog` with problem context.
  - **Engagement Pattern Tracking**: Tracks daily metrics per user (messages sent, word count, hours active, emotional trend, days since previous session) in `userEngagementPatterns`.
  - **Breakthrough Detection**: When user reports success with a technique they previously struggled with, logs breakthrough with days-to-success metric in `breakthroughTracking`.
  - **5 Daily Aggregation Jobs** (2:00 AM EST): (1) Aggregate technique journeys and update learning curves, (2) Update user learning profiles (vocabulary level, churn risk), (3) Aggregate ecosystem technique data across all users, (4) Aggregate problem→solution mappings, (5) Update video recommendation outcomes.
  - **Async Integration**: Uses dynamic import in `server/routes/ai-chat-claude.ts` (Phase 3D) to run after [DONE] is sent - completely non-blocking.

### System Design Choices
The architecture emphasizes full automation for user management, scheduled content delivery, and interactive onboarding. It uses a database-driven personalization approach, a 6-stage multi-stage analysis pipeline for content quality, and an adaptive learning system. The application employs a secure referral architecture and a multi-interface architecture with a unified Vite/React app serving public, admin, and mobile PWA experiences with route-based separation. Database connection pooling is managed via Neon.

## External Dependencies
- **PostgreSQL**: Primary database (Neon-backed).
- **Claude AI (Anthropic)**: Powers Professor OS chat and intelligent BJJ technique curation (Sonnet 4.5).
- **Google Gemini API**: Powers Video Knowledge System - processes YouTube videos natively to extract structured BJJ technique knowledge.
- **OpenAI Whisper API**: For voice-to-text transcription and video transcript generation.
- **ElevenLabs**: Text-to-speech API for AI voice output.
- **YouTube API**: Used for video discovery and analysis.
- **Stripe**: For subscription billing, payments, and referral payouts.
- **ytdl-core** (@distube/ytdl-core): Used for downloading audio from YouTube.
- **Web Push (VAPID)**: For web/mobile push notifications.
- **Resend**: For email delivery.