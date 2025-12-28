# BJJ OS - COMPLETE SYSTEM MAP

**Generated:** January 18, 2025  
**Version:** 1.0  
**Status:** Production Ready

---

## PART 1: PROJECT STRUCTURE & TECHNOLOGY STACK

### 1.1 DIRECTORY STRUCTURE

```
BJJ-OS/
├── client/                      # Frontend React Application
│   ├── src/
│   │   ├── pages/              # 44 pages (public, admin, mobile PWA)
│   │   │   ├── admin/          # 17 admin dashboard pages
│   │   │   ├── landing.tsx     # Public SaaS landing page
│   │   │   ├── chat.tsx        # Web chat interface
│   │   │   ├── mobile-*.tsx    # 4 mobile PWA pages
│   │   │   └── *.tsx           # Auth, onboarding, settings pages
│   │   ├── components/
│   │   │   ├── ui/             # 50+ Shadcn UI components
│   │   │   ├── mobile-*.tsx    # Mobile-specific components
│   │   │   ├── VideoCard.tsx   # Video display component
│   │   │   ├── VoiceInput.tsx  # Whisper voice transcription
│   │   │   └── VoicePlayer.tsx # ElevenLabs TTS playback
│   │   ├── lib/                # Utilities & API clients
│   │   ├── hooks/              # React hooks
│   │   └── styles/             # CSS (Tailwind + mobile styles)
│   ├── public/                 # Static assets + PWA files
│   └── vite.config.ts          # Vite build configuration
│
├── server/                     # Backend Express.js Application
│   ├── routes.ts               # API routes (141 endpoints)
│   ├── db.ts                   # Drizzle ORM database connection
│   ├── scheduler.ts            # Cron job scheduler
│   ├── intelligence-scheduler.ts  # AI automation scheduler
│   ├── ai-agent.ts             # Prof. OS AI agent
│   ├── content-first-curator.ts   # Content-first video curation
│   ├── intelligent-curator.ts     # Multi-stage video analyzer
│   ├── ranking/
│   │   ├── ranker.ts          # Smart video ranking algorithm
│   │   └── pattern-tracker.ts  # User success pattern tracking
│   ├── utils/
│   │   ├── instructorPriority.ts  # Auto-calc instructor scores
│   │   ├── languageDetection.ts   # Multi-language support
│   │   └── deviceFingerprint.ts   # Account sharing prevention
│   ├── twilio.ts               # SMS notifications
│   ├── twilio-verify.ts        # Phone verification
│   ├── whisper.ts              # OpenAI Whisper API
│   ├── elevenlabs.ts           # Text-to-speech
│   └── youtube-service.ts      # YouTube API integration
│
├── shared/                     # Shared TypeScript types
│   ├── schema.ts               # Drizzle ORM schema (75+ tables)
│   └── curator-types.ts        # Video curation types
│
├── migrations/                 # Database migrations
├── attached_assets/            # User-uploaded assets
└── scripts/                    # Utility scripts

```

### 1.2 FILE INVENTORY

**Total Files:** ~250+ files

**Client Pages (44):**
- **Admin Pages (17):** dashboard, chat, videos, users, referrals, lifetime, feedback, meta, instructors, partnerships, chains, logs, schedules, techniques, flagged-accounts, instructor-priority, login
- **Public Pages (12):** landing, login, signup, onboarding, chat, settings, success, privacy, terms, refund, theme-settings, not-found
- **Mobile PWA (4):** mobile-coach, mobile-saved, mobile-settings, mobile-onboarding
- **Other (11):** email-login, email-signup, dashboard, analytics, recipients, templates, schedules, history, admin, ai-monitoring, ai-intelligence

**Server Files (50+):**
- `routes.ts` (6,587 lines) - All API endpoints
- `content-first-curator.ts` (470 lines) - Revolutionary content-first curation
- `intelligent-curator.ts` - Multi-stage video analysis
- `ai-agent.ts` (205 lines) - Prof. OS AI brain
- `ranking/ranker.ts` - Smart video ranking with 6 factors
- `utils/instructorPriority.ts` - Auto-calculated instructor credibility
- `scheduler.ts` - Automated cron jobs
- `intelligence-scheduler.ts` - AI automation tasks

**Status:**
- ✅ ACTIVE: 95% of files
- ⚠️ EXPERIMENTAL: 3% (competition meta tracking, emerging instructors)
- 🗄️ ARCHIVED: 2% (sms-archive/ folder - old SMS reply handler)

### 1.3 TECHNOLOGY STACK

**Frontend:**
- **Framework:** React 18.3.1 + TypeScript 5.6.3
- **Build Tool:** Vite 5.4.20
- **Routing:** Wouter 3.3.5 (lightweight React Router alternative)
- **State Management:** TanStack Query 5.60.5 (React Query)
- **UI Library:** Shadcn UI (50+ Radix UI components)
- **Styling:** Tailwind CSS 3.4.17 + Tailwind CSS v4
- **Icons:** Lucide React + React Icons
- **Forms:** React Hook Form + Zod validation
- **Animations:** Framer Motion 11.13.1
- **PWA:** Service Worker + Web Push notifications

**Backend:**
- **Framework:** Express.js 4.21.2
- **Runtime:** Node.js (tsx for TypeScript execution)
- **Language:** TypeScript 5.6.3
- **Database ORM:** Drizzle ORM 0.39.1
- **Database:** PostgreSQL (Neon-backed, serverless)
- **Authentication:** JWT (jsonwebtoken 9.0.2) + Twilio Verify
- **Job Scheduler:** node-cron 4.2.1

**AI/ML Services:**
- **Primary AI:** Anthropic Claude Sonnet 4 (claude-sonnet-4-20250514)
- **Secondary AI:** OpenAI GPT-4o (dual-model system)
- **Voice Input:** OpenAI Whisper API
- **Voice Output:** ElevenLabs (eleven_turbo_v2_5 model)

**Third-Party Integrations:**
- **Payments:** Stripe 16.12.0
- **SMS:** Twilio 5.10.2 (SMS + Verify API)
- **YouTube:** YouTube Data API v3 (googleapis 144.0.0)
- **Push Notifications:** web-push 3.6.7 (VAPID)

**Hosting & Deployment:**
- **Platform:** Replit (primary) + Vercel (alternative)
- **Environment:** Node.js serverless
- **Port:** 5000 (single port for API + frontend)
- **SSL:** Automatic HTTPS
- **Domain:** bjjos.app

**Development Tools:**
- **Package Manager:** npm
- **Bundler:** Vite (frontend) + esbuild (backend)
- **TypeScript:** tsc for type checking
- **Database Migrations:** Drizzle Kit 0.31.4

---

## KEY STATISTICS (CURRENT STATE)

**Database:**
- Total Tables: 75
- Total Users: 12
- Curated Videos: 189
- Instructors: 122
- AI Conversations: 68
- Referral Codes: 2

**Codebase:**
- API Endpoints: 141
- React Pages: 44
- Server Files: 50+
- Shadcn Components: 50+
- Total Lines of Code: ~15,000+

**Features Status:**
- ✅ Fully Working: 85%
- ⚠️ Partially Working: 10%
- ❌ Blocked: 5% (SMS verification - Twilio setup issue)

---

## DEPLOYMENT ARCHITECTURE

```
┌─────────────────────────────────────────────────┐
│           bjjos.app (Public Domain)             │
└─────────────────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
    ┌────▼────┐              ┌─────▼──────┐
    │ Replit  │              │   Vercel   │
    │ (Main)  │              │  (Mirror)  │
    └────┬────┘              └─────┬──────┘
         │                         │
    ┌────▼─────────────────────────▼────┐
    │   Express.js Server (Port 5000)   │
    │   • Serves API + Static Frontend  │
    │   • Single-port architecture      │
    └────┬─────────────────────────┬────┘
         │                         │
    ┌────▼────┐              ┌─────▼──────┐
    │Neon DB  │              │ Twilio SMS │
    │(Postgres)│              │  + Verify  │
    └─────────┘              └────────────┘
         │
    ┌────▼────────────────────────────┐
    │  External AI Services:          │
    │  • Claude Sonnet 4 (Anthropic)  │
    │  • GPT-4o (OpenAI)              │
    │  • Whisper (OpenAI)             │
    │  • ElevenLabs TTS               │
    │  • YouTube Data API             │
    │  • Stripe Payments              │
    └─────────────────────────────────┘
```

---

## ENVIRONMENT VARIABLES (REQUIRED)

```bash
# Database
DATABASE_URL=postgresql://...
PGHOST=...
PGPORT=5432
PGUSER=...
PGPASSWORD=...
PGDATABASE=...

# AI Services
ANTHROPIC_API_KEY=sk-ant-...      # Claude Sonnet 4
OPENAI_API_KEY=sk-...             # GPT-4o + Whisper
ELEVENLABS_API_KEY=...            # Text-to-speech
YOUTUBE_API_KEY=...               # Video discovery

# Payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_MONTHLY=price_...
STRIPE_PRICE_ID_ANNUAL=price_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...

# SMS & Phone Auth
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
TWILIO_VERIFY_SERVICE_SID=VA...   # ⚠️ CURRENTLY INCORRECT

# Admin
ADMIN_PASSWORD=...                # Admin login password
ADMIN_PHONE_NUMBER=+1914...       # SMS notification recipient

# Security
SESSION_SECRET=...                # JWT signing secret

# Push Notifications
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:...
VITE_VAPID_PUBLIC_KEY=...        # Frontend env var
```

**Status:**
- ✅ All configured except TWILIO_VERIFY_SERVICE_SID
- ⚠️ Twilio Verify blocked - prevents SMS authentication

