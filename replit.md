# BJJ OS - AI-Powered BJJ Training Platform

## Overview
"Prof. OS" is an AI-powered BJJ training platform delivered as a full-stack Node.js web application. It offers chat-based coaching, personalized video recommendations, and progress tracking for BJJ practitioners across web and mobile platforms. The project aims to become the leading AI-powered BJJ coaching platform, providing personalized training and leveraging significant market potential within the BJJ community through an AI-driven coaching and content curation system.

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

- **AI-Powered Curators**: Employs a Hybrid 3-Path + 9-Dimensional Evaluation System for video analysis and mandatory Stage 4 QC, including instructional vs entertainment detection, cross-channel instructor recognition, and content quality analysis. The system dynamically discovers and curates high-quality BJJ technique videos using AI analysis, targeting underrepresented instructors and utilizing a 5-step algorithm with multiple safeguards.
- **Professor OS Chat Engine**: Claude Sonnet 4.5 (claude-sonnet-4-5-20250929) with Anthropic prompt caching, structured output via forced tool calling, TRUE token streaming, and parallelized database queries. Prompt caching splits the system prompt at a `<!-- PROMPT_CACHE_BREAK -->` marker: static coaching rules/personality (cached, ~90% cost reduction on cache hits) vs dynamic per-message content (video search results, news, population insights). It incorporates a modular prompt builder, citations from elite instructors, diagnostic intelligence, and semantic video search. The AI personality is a "black belt best friend" training partner with a 15-section system prompt, multi-instructor synthesis, conversational tone, specific coaching methodology (diagnose before prescribing, one thing at a time, homework), and features like sparring debrief mode and celebrating wins.
- **User Technique Request Tracking**: System tracks technique mentions from user messages and feeds them to the Meta Analyzer for curation prioritization. Logs each technique request with user context for trend analysis. Tracks `hadVideoResult` and `videoCountReturned` for demand analysis.
- **Weekly Demand-Driven Curation**: Runs every Monday at 3:15 AM EST to fill content gaps. Queries top 10 unmet techniques (no videos returned), adds up to 3 videos per technique (max 30 total), applies same quality filters as regular curation. Toggleable via Meta dashboard. Tuesday-Sunday 3:15 AM runs continue using regular instructor-based curation.
- **Semantic Video Search**: Uses intelligent search to find videos matching the user's actual question context by extracting search intent, mapping BJJ terminology, and searching the video database. It includes retry logic, post-validation, and last-resort direct search to ensure accurate and relevant video recommendations.
- **Professor OS True Streaming**: Real-time token streaming with a robust state machine parser, complete escape handling, immediate SSE events, first-token metrics, and in-memory caching with automatic invalidation.
- **Personal Learning Loop**: Automatically analyzes conversations to extract topics, techniques, and sentiment for personalized coaching adaptation.
- **Personalization Engine**: Adapts AI coaching based on user profile data (belt level, style, injuries, focus areas, body type, training goals) collected during onboarding.
- **Admin Dashboards**: JWT-authenticated interfaces for managing users, referrals, AI monitoring, video library, and lifetime access invitations.
- **Persistent Login System**: "Keep me signed in for 30 days" functionality affecting JWT token expiry, cookie maxAge, and database session expiry across all authentication paths.
- **iOS Payment-First Authentication**: Native iOS app uses a payment-first subscription model where accounts are ONLY created after successful Apple IAP payment, ensuring the database contains only paying users from the iOS app.
- **Referral System**: Comprehensive affiliate program with admin-assigned codes, recurring lifetime commissions, and automated payouts.
- **Lifetime Access Invitation System**: Allows admins to grant lifetime subscriptions via secure email invitations.
- **Command Center**: Production-grade admin interface with full sidebar navigation, detailed command descriptions, in-page curation results display, configurable settings, and comprehensive execution logging.
- **Professor OS Automated QA Test Suite**: Comprehensive automated testing system for Professor OS quality assurance, including video relevance, video card data, personality, and coaching quality tests.
- **Video Knowledge System V2**: Professor OS "watches" every video using Gemini API to process YouTube videos natively and extract deeply structured BJJ knowledge for intelligent coaching.
- **Professor OS Knowledge Embodiment V1**: Enhances Professor OS to embody its knowledge through 5 layers: Knowledge Embodiment, Knowledge Synthesizer, Contextual Injection, Expert Reasoning Patterns, and Learning Loop, enabling the AI to synthesize information and apply expert coaching methodologies.
- **Professor OS Data Infrastructure**: A collection-only system that tracks user data asynchronously AFTER AI responses are delivered, including video recommendation tracking, engagement pattern tracking, and breakthrough detection, with daily aggregation jobs for analysis.

### System Design Choices
The architecture emphasizes full automation for user management, scheduled content delivery, and interactive onboarding. It uses a database-driven personalization approach, a 6-stage multi-stage analysis pipeline for content quality, and an adaptive learning system. The application employs a secure referral architecture and a multi-interface architecture with a unified Vite/React app serving public, admin, and mobile PWA experiences with route-based separation. Database connection pooling is managed via Neon.

### Server Stability (January 2026)
The server includes multiple stability safeguards to prevent crashes and resource issues:
- **Graceful Shutdown**: SIGTERM/SIGINT/SIGHUP handlers properly close the HTTP server and release port 5000 on exit
- **Memory Monitoring**: Logs heap usage every 5 minutes, warning at 70%, critical email alerts at 85%
- **Staggered Overnight Schedule**: Tasks are distributed to avoid resource spikes:
  - 1:00 AM EST: Data Aggregation
  - 3:05 AM EST: YouTube Quota Reset
  - 3:15 AM EST: Primary Auto-Curation (isolated window, demand-driven on Mondays)
  - 10:00 AM EST: Meta Analysis
  - 11:00 AM EST: Population Intelligence
  - 12:00 PM EST: User Profile Building
  - 2:00 PM EST: Combat Sports Scraping + Emergency Curation
- **Reduced Processing Frequency**: Video Knowledge Processing runs every 2 minutes (down from 30 seconds) to reduce memory churn

## External Dependencies
- **PostgreSQL**: Primary database (Neon-backed).
- **Claude AI (Anthropic)**: Powers Professor OS chat and intelligent BJJ technique curation (Sonnet 4.5).
- **Google Gemini API**: Powers Video Knowledge System for extracting structured BJJ technique knowledge from YouTube videos.
- **OpenAI Whisper API**: For voice-to-text transcription and video transcript generation.
- **ElevenLabs**: Text-to-speech API for AI voice output.
- **YouTube API**: Used for video discovery and analysis.
- **Stripe**: For subscription billing, payments, and referral payouts.
- **ytdl-core** (@distube/ytdl-core): Used for downloading audio from YouTube.
- **Web Push (VAPID)**: For web/mobile push notifications.
- **Resend**: For email delivery.