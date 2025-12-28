# Video Library Architecture

## Overview
BJJ OS has **TWO separate video library interfaces** to maintain clean separation between user experience and administrative functionality.

---

## 🎯 USER-FACING VIDEO LIBRARY

### Location
- **Route**: `/library`
- **Component**: `client/src/pages/library.tsx`
- **API Endpoint**: `GET /api/ai/videos`

### Purpose
Clean, user-focused interface for browsing and discovering high-quality BJJ technique videos curated by the AI system.

### Features
✅ **Simple & Clean Interface**
- Search bar for finding techniques
- Filter by belt level (White, Blue, Purple, Brown, Black)
- Filter by technique type (Guard, Guard Pass, Submission, Sweep, Escape)
- Filter by Gi/No-Gi preference
- Video grid with thumbnails, titles, instructors, quality scores
- Save/unsave videos to personal collection
- Video player modal for watching videos

✅ **NO Admin Controls Visible**
- No curation settings
- No quality threshold sliders
- No "Run Curation Now" buttons
- No internal metrics (videos screened, acceptance rates, etc.)
- No manual add/delete functionality

### Backend API: `/api/ai/videos`

**Returns**: Array of videos sorted by quality score (highest first)

**Fields**:
```typescript
{
  id: number;
  videoId: string;           // YouTube video ID
  title: string;
  techniqueName: string;
  instructorName: string;
  techniqueType: string;     // guard, pass, submission, sweep, escape
  beltLevel: string;         // white, blue, purple, brown, black
  giOrNogi: string;          // gi, nogi, both
  qualityScore: number;      // 0.0-10.0
  duration: string;          // "12:34" format
}
```

**Performance**: 
- Returns up to 500 videos
- Sorted by qualityScore DESC, then createdAt DESC
- All filtering happens client-side for instant response

---

## 🔧 ADMIN VIDEO MANAGEMENT

### Location
- **Route**: `/admin/videos`
- **Component**: `client/src/pages/admin/videos.tsx`
- **API Endpoint**: `GET /api/admin/techniques` (admin-authenticated)

### Purpose
Comprehensive administrative interface for managing video curation, quality control, and library maintenance.

### Features
✅ **Admin-Only Functionality**
- View detailed video statistics and analytics
- Manually trigger AI curation runs
- Add videos manually via YouTube URL
- Delete videos from library
- View curation history and progress
- Adjust quality thresholds and curation settings
- Monitor Content-First Curator and AI Intelligent Curator
- Track videos screened vs. videos accepted (acceptance rate)

✅ **Curation Controls**
- Automatic curation toggle (enable/disable scheduled runs)
- Manual review mode
- Quality threshold slider (6.0-10.0 range)
- Manual curation trigger button
- Real-time curation progress tracking
- Curation history with timestamps

✅ **Advanced Stats**
- Total videos in library
- Videos added today/this week
- Curation batch runs
- Average quality scores
- Elite vs. Verified vs. Acceptable video counts
- Top instructors by video count
- Videos screened vs. accepted ratios

### Access Control
- **Authentication**: Requires admin_session cookie with valid JWT
- **Middleware**: `checkAdminAuth` validates admin role
- **Redirect**: Regular users attempting to access are redirected to login

---

## 📊 Data Flow

### User Library Flow
```
User visits /library
  ↓
Frontend queries GET /api/ai/videos (no auth required)
  ↓
Backend fetches from ai_video_knowledge table
  ↓
Transforms data (extract videoId, format duration, etc.)
  ↓
Returns 500 highest-quality videos
  ↓
Frontend displays in grid with client-side filtering
```

### Admin Management Flow
```
Admin visits /admin/videos
  ↓
checkAdminAuth middleware validates admin_session cookie
  ↓
Frontend queries GET /api/admin/techniques (admin auth required)
  ↓
Backend returns comprehensive video data + admin metadata
  ↓
Admin can view stats, trigger curation, manage videos
```

---

## 🎨 User Experience Differences

### User Library (`/library`)
**Goal**: Help users discover and watch high-quality technique videos

**Design Philosophy**: 
- Minimal, distraction-free browsing
- Focus on technique names, instructors, and quality
- Easy filtering by personal preferences (belt, gi/no-gi, technique type)
- Instant search and filter results
- Mobile-optimized grid layout
- Simple save/unsave functionality

**Stats Shown**:
- Result count ("36 videos")
- Video quality scores (⭐ 8.5)
- Instructor names
- Video durations

### Admin Videos (`/admin/videos`)
**Goal**: Manage video library curation and quality control

**Design Philosophy**:
- Comprehensive data visibility
- Control over curation settings
- Manual intervention capabilities
- Performance monitoring
- Quality assurance tools

**Stats Shown**:
- Total videos: 350
- Videos screened: 2,847
- Acceptance rate: 12.3%
- Added today: 2
- Added this week: 88
- Avg quality: 8.2/10
- Elite videos (7.5+): 135
- Curation run status and history
- Content-First Curator: 20x5 videos/day
- Last run timestamps

---

## 🔒 Security & Access Control

### User Library
- **Public Access**: Any authenticated user can view
- **Rate Limiting**: Standard API rate limits apply
- **Data Exposure**: Only curated, high-quality videos shown
- **No Sensitive Data**: Internal metrics, curation details hidden

### Admin Videos
- **Admin-Only Access**: Requires admin role in JWT
- **Cookie Authentication**: admin_session cookie with SESSION_SECRET signing
- **Middleware Protection**: checkAdminAuth validates all admin routes
- **Token Expiry**: 24-hour session timeout
- **Redirect on Unauthorized**: Non-admins redirected to /admin/login

---

## 🚀 Future Enhancements

### User Library
- [ ] Instructor-based filtering
- [ ] Belt-specific recommendations
- [ ] Personal video history tracking
- [ ] Watch later queue
- [ ] Video progress tracking (watched/unwatched)
- [ ] Related videos suggestions

### Admin Videos
- [ ] Bulk video operations (approve/delete multiple)
- [ ] Advanced analytics dashboard
- [ ] Curation performance trends
- [ ] Instructor credibility management
- [ ] Manual quality score overrides
- [ ] Video tagging and categorization
- [ ] Scheduled curation runs customization

---

## 📝 Notes for Developers

### Adding New Video Fields
1. Add to `shared/schema.ts` in `aiVideoKnowledge` table
2. Update `GET /api/ai/videos` endpoint to select new field
3. Add to transformation layer in `/api/ai/videos`
4. Update TypeScript interface in `library.tsx`
5. Run `npm run db:push --force` to sync database schema

### Modifying Filters
- User library filters are **client-side** for instant response
- Add new filter states in `library.tsx`
- Update `filteredVideos` filter logic
- Add new Select dropdown in UI

### Curation Settings
- Stored in backend state (not in database yet)
- Fetched via `GET /api/admin/curation/settings`
- Updated via `PATCH /api/admin/curation/settings`
- Manual runs triggered via `POST /api/admin/curation/run`

---

## ✅ Architecture Validation

### Separation of Concerns
✅ User and admin interfaces completely separated
✅ Different routes, components, and API endpoints
✅ Admin controls never exposed to regular users
✅ Clean, simple user experience maintained

### Security
✅ Admin routes protected by authentication middleware
✅ JWT-based session management
✅ httpOnly cookies for security
✅ 24-hour token expiry

### Performance
✅ User library fetches 500 videos (fast, no pagination needed yet)
✅ Client-side filtering for instant results
✅ Videos pre-sorted by quality score
✅ Efficient database queries with proper indexing

### User Experience
✅ No confusing admin metrics in user view
✅ Simple, intuitive filters
✅ Quality scores visible for informed decisions
✅ Mobile-responsive design
✅ Video player modal for seamless viewing

---

**Last Updated**: November 1, 2025  
**Status**: ✅ Production-Ready
