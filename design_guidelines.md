# Design Guidelines: Japanese Minimalist BJJ OS Platform

## Design Approach
**Selected Approach:** Reference-Based - Japanese Minimalism + Brutalist Design  
**Primary References:** Muji's digital presence, Arc browser marketing, Linear's restraint  
**Rationale:** BJJ OS requires a design that embodies discipline, clarity, and focus - core BJJ principles. The brutal minimalism creates instant visual impact while ensuring dashboard efficiency for gym management.

## Core Design Principles
- **Absolute Simplicity:** Every pixel must justify its existence
- **Monochrome Authority:** Black, white, and a single gray - nothing more
- **Generous Space:** Whitespace as a primary design element, not afterthought
- **Typographic Dominance:** Headlines command attention, hierarchy through size alone
- **Functional Brutality:** No decorative elements, pure utility meets aesthetic

## Color Palette

### Universal Colors (Both Modes)
- **Pure Black:** 0 0% 0% (backgrounds, primary text)
- **Pure White:** 0 0% 100% (backgrounds, inverse text)
- **Subtle Gray:** 0 0% 63% (#A0A0A0 - secondary text only)
- **Dark Border:** 0 0% 10% (#1A1A1A - all borders, dividers)

### Mode Implementation
- **Dark Mode (Primary):** Black backgrounds, white text, dark borders
- **Light Mode:** White backgrounds, black text, maintain dark borders for contrast

**Status Colors:** Use opacity variations of black/white
- Success: Black at 100% with checkmark
- Warning: Black at 70% with alert icon
- Error: Inverted (white on black) pill

## Typography
**Font Family:** Inter (Google Fonts CDN) - weights 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold)

### Type Scale
- **Hero Headlines:** text-[96px]/[0.9] font-bold (mobile: text-[56px]/[1])
- **Page Titles:** text-6xl font-bold tracking-tight
- **Section Headers:** text-4xl font-semibold
- **Subsections:** text-2xl font-medium
- **Body Text:** text-base font-normal leading-relaxed
- **Captions:** text-sm font-medium tracking-wide uppercase
- **Micro Copy:** text-xs font-normal

**Alignment:** Left-aligned for reading content, centered for marketing impact (hero, CTAs)

## Layout System
**Container:** max-w-[1200px] mx-auto px-6 lg:px-8  
**Grid Alignment:** Everything snaps to 8px grid (spacing-2, 4, 6, 8, 12, 16, 24, 32)  
**Section Spacing:** py-24 desktop, py-16 mobile between major sections

### Layout Patterns
- **Hero:** Full-width with centered content, min-h-[85vh]
- **Feature Sections:** Alternating single-column and 2-column layouts
- **Dashboard:** Sidebar (280px) + main content area with 24px gap
- **Cards:** Always full-bleed within containers, 1px border, no radius, p-8 internal

## Component Library

### Navigation
- **Header:** Sticky top-0, backdrop-blur-none, border-b border-[#1A1A1A], h-20
- **Nav Items:** text-sm font-medium, hover:opacity-60 transition
- **Mobile Menu:** Full-screen overlay, no hamburger - use "Menu" text button
- **Dashboard Sidebar:** Fixed, vertical stack of nav items with 4px left border on active

### Landing Page Components
- **Hero Section:** Massive headline, 1-sentence subhead (text-xl), single CTA button below
- **Feature Cards:** Thin border cards (border-[#1A1A1A]), p-8, title + 2-3 line description
- **Stat Blocks:** Large number (text-6xl font-bold), label below (text-sm uppercase)
- **FAQ Accordion:** Question in text-xl font-semibold, answer in text-base, border-b dividers
- **CTA Section:** Black background section with white text, single focused action

### Dashboard Components
- **Data Tables:** Striped rows (subtle opacity difference), monospace numbers, sortable headers
- **Status Badges:** Text-only with symbols (●/○/◆), no backgrounds
- **Action Buttons:** Primary (black bg, white text), Secondary (white bg, black text, 1px border)
- **Input Fields:** border-[#1A1A1A], focus:border-black, no shadows, h-12
- **Cards:** White bg (dark mode: black), 1px border, no shadow, no radius
- **Modals:** Full-screen overlay on mobile, centered max-w-2xl on desktop, same border treatment

### Feedback Elements
- **Loading States:** Simple black spinner on white (or inverse)
- **Empty States:** Large icon (Heroicons), headline, description, CTA - all centered
- **Notifications:** Top-right toast, border-l-4 border-black, auto-dismiss 4s
- **Error States:** Red borders not allowed - use inverted color treatment (white on black pill)

## Images

**Hero Image:** Full-bleed black and white photograph of BJJ training action
- Placement: Background with overlay gradient (black 0% to 80% opacity)
- Style: High contrast, grainy texture acceptable, action-focused
- Format: 2400x1400px minimum, WebP format
- Position: Cover, center focus on athletes

**Feature Images:** Optional small accent photos (400x300px)
- Style: Same B&W treatment, used sparingly (max 2-3 on landing page)
- Placement: Inline with feature descriptions, right-aligned on desktop

**Dashboard:** No images - icon-only interface using Heroicons via CDN

## Key Page Layouts

### Landing Page Flow
1. **Hero:** Full-width image background, massive centered headline "BJJ OS", subhead, primary CTA
2. **Features Grid:** 2-column on desktop (single column mobile), 4-6 feature cards
3. **Stats Section:** 3-column metrics (Members, Gyms, Sessions), centered
4. **Testimonial:** Single centered quote, large text (text-2xl), attribution below
5. **FAQ:** Full-width accordion, 8-12 questions with expand/collapse
6. **Final CTA:** Black background section, white text, headline + button

### Dashboard Home
- **Top Bar:** Stats overview (4 metrics in row), each with number + label
- **Main Grid:** 2-column layout - left: recent activity list, right: upcoming classes calendar
- **Quick Actions:** Floating bottom-right button cluster (black circles, white icons)

### Schedule Management
- **Calendar View:** Week grid, minimal styling, time slots as rows
- **Class Cards:** Thin border, instructor name + time + capacity meter (simple progress bar)
- **Filter Bar:** Top-aligned, text-only filters with underline on active

### Member Management  
- **List View:** Table with avatar (initials only), name, belt rank (text), attendance %
- **Detail Panel:** Slideout from right, full member info, attendance heatmap
- **Bulk Actions:** Toolbar appears on selection, text-only action buttons

## Animations
**Strictly Minimal:**
- Page transitions: Instant (0ms)
- Hover states: opacity-60 (150ms)
- Accordion expand: max-height transition (200ms ease-in-out)
- Modal entry: Fade only (150ms)
- **Forbidden:** Scroll animations, parallax, decorative motion

## Performance Standards
- Lighthouse Performance: 95+
- First Contentful Paint: <1.2s
- Time to Interactive: <2.5s
- Cumulative Layout Shift: <0.1
- Font loading: Use `font-display: swap` for Inter
- Images: WebP with fallback, lazy loading below fold
- CSS: Inline critical styles, defer non-essential

## Accessibility
- Contrast ratios: AAA standard (black on white = 21:1)
- Focus indicators: 2px black outline, 4px offset
- Keyboard nav: All interactive elements accessible
- ARIA labels: All icon buttons and status indicators
- Screen reader: Descriptive text for all imagery
- Motion: Respect `prefers-reduced-motion`