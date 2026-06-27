# AQS Offline Learning Platform — Implementation Gap Plan

**Document Version:** 1.0
**Date:** 27 June 2026
**Purpose:** Step-by-step remediation plan for every missing or incomplete SRS requirement

---

## Priority Legend

- **P0** — Critical: Blocks core SRS compliance; must fix before launch
- **P1** — High: Significant SRS deviation; fix within first sprint
- **P2** — Medium: Compliance gap; fix within 2 weeks
- **P3** — Low: Enhancement; address in future iterations

---

## Gap #1: PWA Manifest (manifest.json)

**Requirement:** SRS §4.3 — PWA must install via Add to Home Screen on Android and iOS
**Priority:** P0
**Estimated Complexity:** Low (1-2 hours)
**Status:** ❌ Not Implemented

### Files to Modify
- **Create:** `/manifest.json` (project root)
- **Edit:** `/index.html` — add `<link rel="manifest">` and meta tags

### Suggested Implementation
1. Create `manifest.json` with:
   ```json
   {
     "name": "AQS Learning Platform",
     "short_name": "AQS Learning",
     "start_url": "/study",
     "display": "standalone",
     "background_color": "#f8fafc",
     "theme_color": "#059669",
     "icons": [
       { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
       { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
     ]
   }
   ```
2. Add to `index.html` `<head>`:
   ```html
   <link rel="manifest" href="/manifest.json">
   <meta name="theme-color" content="#059669">
   <meta name="apple-mobile-web-app-capable" content="yes">
   <meta name="apple-mobile-web-app-title" content="AQS Learning">
   ```
3. Create icon assets (192x192 and 512x512 PNG)

### Dependencies
- Icon assets (can be generated from existing branding)

### Risks
- Low risk; standard PWA addition

### Testing Strategy
- Open Chrome DevTools > Application > Manifest — verify detected
- Use Lighthouse PWA audit — verify installability
- Test "Add to Home Screen" on Android Chrome and iOS Safari

---

## Gap #2: Service Worker

**Requirement:** SRS §4.3 — Service worker must cache static assets and API responses; cache invalidation uses manifest hash
**Priority:** P0
**Estimated Complexity:** Medium (4-8 hours)
**Status:** ❌ Not Implemented

### Files to Modify
- **Create:** `/public/sw.js` (service worker)
- **Edit:** `/src/main.tsx` — register service worker
- **Edit:** `/vite.config.ts` — configure build to include service worker

### Suggested Implementation
1. Create `sw.js` with:
   - Cache-first strategy for static assets (JS, CSS, images)
   - Network-first strategy for API calls (`/api/*`)
   - Cache invalidation via manifest hash comparison
   - Offline fallback page
2. Register in `main.tsx`:
   ```typescript
   if ('serviceWorker' in navigator) {
     navigator.serviceWorker.register('/sw.js');
   }
   ```
3. Handle service worker updates and cache versioning

### Dependencies
- Gap #1 (manifest.json) should be done first

### Risks
- Medium risk; caching strategies can cause stale data if not carefully managed
- Must not cache authenticated API responses without proper headers

### Testing Strategy
- Verify assets cached after first load
- Go offline — verify static assets still load
- Verify API calls fall back to cache when offline
- Test cache invalidation on new deployment

---

## Gap #3: Replace localStorage with PouchDB/IndexedDB

**Requirement:** SRS §2.3, §4.3 — "PouchDB (IndexedDB) for offline course data, lesson progress, quiz answers, and sync queue"
**Priority:** P0
**Estimated Complexity:** Medium (6-10 hours)
**Status:** ❌ Not Implemented (uses localStorage despite class name)

### Files to Modify
- **Edit:** `/src/lib/pouchdb-service.ts` — rewrite to use actual PouchDB or IndexedDB
- **Edit:** `/package.json` — add `pouchdb-browser` dependency (already listed but unused)
- **Edit:** All components importing `PouchDBService` (API is compatible, minimal changes)

### Suggested Implementation
1. Install and import `pouchdb-browser` (already in `package.json` dependencies)
2. Rewrite `PouchDBService` to use PouchDB databases:
   ```typescript
   import PouchDB from 'pouchdb-browser';
   const coursesDB = new PouchDB('aqs_courses');
   const progressDB = new PouchDB('aqs_progress');
   const syncQueueDB = new PouchDB('aqs_sync_queue');
   ```
3. Implement PouchDB's built-in sync with the server
4. Migrate existing localStorage data if present

### Dependencies
- PouchDB is already in `package.json` — just needs actual import and usage

### Risks
- Medium risk; localStorage key migration needed for existing users
- PouchDB sync with server requires careful conflict resolution design

### Testing Strategy
- Verify courses cached in IndexedDB (DevTools > Application > IndexedDB)
- Test offline course viewing
- Test offline quiz submission and sync
- Verify data persists across browser restarts

---

## Gap #4: Exponential Backoff Sync Retry

**Requirement:** SRS §4.3 — "Sync engine must use exponential backoff (1s, 2s, 4s; max 60s) and retry up to 3 times before alerting user"
**Priority:** P0
**Estimated Complexity:** Medium (3-5 hours)
**Status:** ❌ Not Implemented (single attempt only)

### Files to Modify
- **Edit:** `/src/components/BannerOffline.tsx` — add retry logic
- **Create:** `/src/lib/sync-engine.ts` — extract sync logic with backoff

### Suggested Implementation
1. Create a `SyncEngine` class with:
   ```typescript
   class SyncEngine {
     private retryCount = 0;
     private maxRetries = 3;
     private baseDelay = 1000; // 1s
     
     async sync(queue: SyncQueue, token: string): Promise<SyncResult> {
       while (this.retryCount < this.maxRetries) {
         try {
           const result = await fetch('/api/sync', { ... });
           if (result.ok) return { success: true, data: await result.json() };
         } catch (err) {
           this.retryCount++;
           const delay = Math.min(this.baseDelay * Math.pow(2, this.retryCount - 1), 60000);
           await new Promise(r => setTimeout(r, delay));
         }
       }
       return { success: false, error: 'Max retries exceeded' };
     }
   }
   ```
2. Update `BannerOffline.tsx` to use `SyncEngine` and display retry status
3. Alert user after 3 failed retries

### Dependencies
- None (standalone change)

### Risks
- Low risk; additive change

### Testing Strategy
- Mock network failures; verify 3 retries with increasing delays
- Verify user alert after max retries
- Verify sync succeeds on retry when network restores

---

## Gap #5: Fix Text Sizes (WCAG)

**Requirement:** SRS §4.4 — "All text: 16px body, 18px headings, line-height ≥ 1.6"
**Priority:** P1
**Estimated Complexity:** Low (2-3 hours)
**Status:** ❌ Not Implemented (most text is 9-14px)

### Files to Modify
- **Edit:** `/src/index.css` — add global typography rules
- **Edit:** Multiple component files — update text size classes

### Suggested Implementation
1. Add to `index.css`:
   ```css
   html { font-size: 16px; line-height: 1.6; }
   body { font-size: 16px; line-height: 1.6; }
   h1, h2, h3, h4, h5, h6 { line-height: 1.6; }
   ```
2. Replace `text-xs` (12px) with `text-sm` (14px) minimum for body text
3. Replace `text-[10px]` and `text-[9px]` micro-labels with `text-xs` (12px) minimum
4. Ensure headings use `text-xl` (20px) or larger
5. Add `leading-relaxed` (line-height: 1.625) to body text containers

### Dependencies
- None

### Risks
- Low risk; visual layout may need minor adjustments for larger text
- May increase vertical scrolling on mobile

### Testing Strategy
- Verify text sizes with browser DevTools computed styles
- Visual review on mobile viewport
- WCAG contrast/text size checker tools

---

## Gap #6: Breadcrumb Navigation

**Requirement:** SRS §4.4 — "Navigation linear and simple; no dropdowns, modals, or complex menus; breadcrumbs on each screen"
**Priority:** P1
**Estimated Complexity:** Low (2-4 hours)
**Status:** ❌ Not Implemented

### Files to Modify
- **Create:** `/src/components/Breadcrumbs.tsx`
- **Edit:** `/src/components/LearnerCoursePlayer.tsx` — add breadcrumbs
- **Edit:** `/src/components/InstructorLMS.tsx` — add breadcrumbs

### Suggested Implementation
1. Create a `Breadcrumbs` component:
   ```tsx
   <nav aria-label="Breadcrumb">
     <ol className="flex items-center gap-2 text-sm">
       <li><a href="/study">Home</a></li>
       <li aria-hidden="true">/</li>
       <li><a href="/study">My Courses</a></li>
       <li aria-hidden="true">/</li>
       <li aria-current="page">Course Title</li>
     </ol>
   </nav>
   ```
2. Add breadcrumbs to:
   - Learner Dashboard: `Home > My Courses`
   - Course Player: `Home > My Courses > {Course Title}`
   - Course Player (lesson): `Home > My Courses > {Course Title} > Lesson {n}`
   - Instructor LMS: `Home > Instructor CMS`
   - Instructor Course: `Home > Instructor CMS > {Course Title}`

### Dependencies
- None

### Risks
- Low risk

### Testing Strategy
- Verify breadcrumbs appear on every screen
- Verify breadcrumb links navigate correctly
- Test screen reader announces breadcrumb structure

---

## Gap #7: Remove Modal Pattern (FR-08)

**Requirement:** SRS FR-08 — "no dropdowns or modals"
**Priority:** P1
**Estimated Complexity:** Low (2-3 hours)
**Status:** ❌ Not Implemented (`ProfileEditModal.tsx` is a modal)

### Files to Modify
- **Edit:** `/src/components/ProfileEditModal.tsx` — convert to inline panel or separate page
- **Edit:** `/src/App.tsx` — update rendering logic

### Suggested Implementation
1. Convert `ProfileEditModal` to an inline slide-out panel or dedicated `/profile` page
2. Remove backdrop overlay and modal z-index layering
3. Use a slide-in panel from the right side with `position: fixed` but no backdrop blocking the main content

### Dependencies
- None

### Risks
- Low risk; UX improvement

### Testing Strategy
- Verify profile editing works without modal overlay
- Verify main content is still interactive while editing profile

---

## Gap #8: ARIA Labels & Semantic HTML

**Requirement:** SRS §4.4 — "Screen reader compatible (TalkBack, VoiceOver) with ARIA labels and semantic HTML"
**Priority:** P1
**Estimated Complexity:** Medium (4-6 hours)
**Status:** ❌ Not Implemented

### Files to Modify
- **All component files** — add ARIA attributes and semantic elements

### Suggested Implementation
1. Replace `<div>` wrappers with semantic elements:
   - Navigation: `<nav>`, `<aside>`
   - Main content: `<main>`
   - Lists: `<ul>`, `<ol>`
   - Articles: `<article>`
2. Add `aria-label` to all interactive elements:
   ```html
   <button aria-label="Mark lesson as complete">
   <button aria-label="Submit quiz examination">
   ```
3. Add `aria-live="polite"` to status banners (sync, progress updates)
4. Add `role="status"` to loading indicators
5. Add skip-to-content link:
   ```html
   <a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>
   ```
6. Add `aria-current="page"` to active breadcrumbs

### Dependencies
- None

### Risks
- Low risk; purely additive

### Testing Strategy
- Test with Chrome Vox or NVDA screen reader
- Verify all interactive elements are focusable and announced
- Run axe-core accessibility audit

---

## Gap #9: Role Self-Switching Restriction

**Requirement:** SRS FR-05 — Role isolation; learners cannot access instructor content
**Priority:** P1
**Estimated Complexity:** Low (1-2 hours)
**Status:** 🟡 Partially Implemented (server returns 403, but any user can self-promote)

### Files to Modify
- **Edit:** `/server.ts` — restrict `PUT /api/auth/role` to admin-only or remove it

### Suggested Implementation
1. Option A: Remove the `PUT /api/auth/role` endpoint entirely; roles assigned by admin only
2. Option B: Restrict to admin-only:
   ```typescript
   app.put("/api/auth/role", requireAuth, requireInstructor, async (req, res) => {
     // Only admins can change roles
     if (req.dbUser.role !== 'admin') {
       return res.status(403).json({ error: 'Only admins can change roles' });
     }
     // ... existing logic
   });
   ```
3. Remove the client-side role toggle button in `App.tsx`

### Dependencies
- None

### Risks
- Low risk; improves security

### Testing Strategy
- Verify learner cannot call `PUT /api/auth/role`
- Verify only admins can change roles
- Verify UI no longer shows role toggle for non-admins

---

## Gap #10: Admin Panel

**Requirement:** SRS §2.1 — "Administrator: Manages system configuration, user permissions, and instructor access"
**Priority:** P2
**Estimated Complexity:** High (8-16 hours)
**Status:** ❌ Not Implemented (admin role exists but has no dedicated UI)

### Files to Modify
- **Create:** `/src/components/AdminPanel.tsx`
- **Edit:** `/src/App.tsx` — add `/admin` route
- **Edit:** `/server.ts` — add admin API endpoints

### Suggested Implementation
1. Create admin-only routes:
   - `GET /api/admin/users` — list all users
   - `PUT /api/admin/users/:id/role` — change user role
   - `DELETE /api/admin/users/:id` — deactivate user
   - `GET /api/admin/system` — system health stats
2. Create `AdminPanel.tsx` with:
   - User management table (search, filter, role change)
   - Instructor approval queue
   - System configuration panel
3. Add `/admin` route guarded by `role === 'admin'`

### Dependencies
- Gap #9 (role restriction) should be done first

### Risks
- Medium risk; complex feature

### Testing Strategy
- Verify only admins can access `/admin`
- Test user role management
- Test instructor approval workflow

---

## Gap #11: Server-Side Course Completion Validation

**Requirement:** SRS FR-03 — "Learner cannot mark course 100% complete until linked quiz is passed; 70%. Enforced server-side."
**Priority:** P2
**Estimated Complexity:** Low (2-3 hours)
**Status:** 🟡 Partially Implemented (quiz scored server-side, but course completion not gated)

### Files to Modify
- **Edit:** `/server.ts` — add course completion status endpoint
- **Edit:** `/src/components/LearnerDashboard.tsx` — use server-side completion status

### Suggested Implementation
1. Add `GET /api/courses/:id/completion` endpoint that returns:
   ```json
   {
     "lessonsCompleted": 5,
     "totalLessons": 5,
     "quizPassed": false,
     "isFullyComplete": false  // false until quizPassed === true
   }
   ```
2. Use this in `LearnerDashboard` to show accurate completion status
3. Prevent the progress bar from reaching 100% unless quiz is passed

### Dependencies
- None

### Risks
- Low risk

### Testing Strategy
- Complete all lessons but don't pass quiz — verify 100% not shown
- Pass quiz — verify 100% shown

---

## Gap #12: Monitoring & Health Checks

**Requirement:** SRS §4.6 — "Production system must maintain 99.9% uptime; monitored via Vercel Analytics and API health checks"
**Priority:** P2
**Estimated Complexity:** Low (2-3 hours)
**Status:** ❌ Not Implemented

### Files to Modify
- **Edit:** `/server.ts` — add health check endpoint
- **Create:** `/src/lib/monitoring.ts` — basic uptime tracking

### Suggested Implementation
1. Add health check endpoint:
   ```typescript
   app.get("/api/health", async (req, res) => {
     try {
       await db.execute(sql`SELECT 1`);
       res.json({ status: "healthy", timestamp: new Date().toISOString() });
     } catch (err) {
       res.status(503).json({ status: "unhealthy", error: err.message });
     }
   });
   ```
2. Add basic request logging middleware
3. Consider Vercel Analytics integration if deploying to Vercel

### Dependencies
- None

### Risks
- Low risk

### Testing Strategy
- Verify `/api/health` returns 200 when DB is up
- Verify returns 503 when DB is down

---

## Gap #13: Automated Database Backups

**Requirement:** SRS §4.6 — "Database automated backups daily; point-in-time recovery within 24 hours"
**Priority:** P2
**Estimated Complexity:** Low (2-3 hours for script; infrastructure depends on hosting)
**Status:** ❌ Not Implemented

### Files to Modify
- **Create:** `/scripts/backup-db.sh` — backup script
- **Create:** `/scripts/restore-db.sh` — restore script

### Suggested Implementation
1. Create backup script:
   ```bash
   #!/bin/bash
   pg_dump -h $SQL_HOST -U $SQL_USER $SQL_DB_NAME > "backups/aqs_$(date +%Y%m%d_%H%M%S).sql"
   ```
2. Create restore script:
   ```bash
   #!/bin/bash
   psql -h $SQL_HOST -U $SQL_USER $SQL_DB_NAME < "$1"
   ```
3. Document cron job setup for daily backups:
   ```cron
   0 2 * * * /path/to/backup-db.sh
   ```

### Dependencies
- None (infrastructure setup required)

### Risks
- Low risk; operational concern

### Testing Strategy
- Test backup creation
- Test restore from backup
- Verify backup rotation (keep last 7 days)

---

## Gap #14: Line Height ≥1.6

**Requirement:** SRS §4.4 — "line-height ≥ 1.6"
**Priority:** P2
**Estimated Complexity:** Trivial (30 minutes)
**Status:** ❌ Not Implemented

### Files to Modify
- **Edit:** `/src/index.css` — add global line-height

### Suggested Implementation
```css
body { line-height: 1.6; }
```
Or add `leading-relaxed` (Tailwind's 1.625) to all text containers.

### Dependencies
- None

### Risks
- None

### Testing Strategy
- Verify computed line-height in DevTools

---

## Gap #15: Change Page Title

**Requirement:** SRS branding
**Priority:** P3
**Estimated Complexity:** Trivial (5 minutes)
**Status:** ❌ Title reads "My Google AI Studio App"

### Files to Modify
- **Edit:** `/index.html` — change `<title>` tag

### Suggested Implementation
```html
<title>AQS Learning Platform</title>
```

### Dependencies
- None

### Risks
- None

---

## Gap #16: Touch Target Universality

**Requirement:** SRS §4.4 — "Touch targets: 56px (minimum Apple HIG standard)"
**Priority:** P2
**Estimated Complexity:** Low (2-3 hours)
**Status:** 🟡 Partially Implemented (primary buttons 56px, secondary 44px)

### Files to Modify
- **Edit:** All component files — ensure all interactive elements have `minHeight: 56px`

### Suggested Implementation
1. Search for `h-11` (44px) and replace with `h-14` (56px) or add `style={{ minHeight: '56px' }}`
2. Ensure all `<button>` elements have minimum 56px touch target
3. Add a global CSS rule:
   ```css
   button, a[role="button"], [role="button"] {
     min-height: 56px;
   }
   ```

### Dependencies
- None

### Risks
- Low risk; may need layout adjustments for larger buttons

### Testing Strategy
- Measure all interactive elements with DevTools
- Test on mobile devices

---

## Implementation Order

| Phase | Gaps | Estimated Time |
|-------|------|----------------|
| **Phase 1 (Critical)** | #1, #2, #3, #4 | 14-25 hours |
| **Phase 2 (High Priority)** | #5, #6, #7, #8, #9 | 11-18 hours |
| **Phase 3 (Medium Priority)** | #10, #11, #12, #13, #14, #16 | 12-22 hours |
| **Phase 4 (Low Priority)** | #15 | 5 minutes |
| **Total** | 16 gaps | 37-65 hours |

---

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| localStorage data loss on quota exceeded | High | Migrate to PouchDB/IndexedDB (Gap #3) |
| No offline capability without service worker | High | Implement service worker (Gap #2) |
| Cannot install as PWA | High | Add manifest (Gap #1) |
| Stale sync without retry logic | Medium | Add exponential backoff (Gap #4) |
| Accessibility lawsuits / exclusion | Medium | Add ARIA, fix text sizes (Gaps #5, #8) |
| Security bypass via role self-switching | Medium | Restrict role endpoint (Gap #9) |
| No disaster recovery | Medium | Add backups (Gap #13) |
