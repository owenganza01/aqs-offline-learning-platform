# AQS Offline Learning Platform
### Technical Project Documentation & Team Handoff

**Project purpose:** Offline-first learning platform for rural students in Africa with unreliable connectivity.

**Document status:** Team-facing technical handoff draft based on the current project analysis.

**Last updated:** 11 August 2026

**Production URL:** https://aqs-learning.org

**Technology summary:** React 19.0.1, TypeScript 5.8.x, Vite 6.2.3, Express 4.21.2, PostgreSQL, Drizzle ORM, Firebase Authentication, Service Worker, localStorage, IndexedDB, Cloudflare R2 provider.

**Security note:** Credentials, API keys, service-account files, database passwords, and production secrets must be stored in environment variables and never committed to Git.

---

## 1. Executive Summary

AQS Offline Learning Platform is an offline-first learning application for rural students in Africa where network access can be unreliable. The learner experience supports course discovery, enrollment, lesson study, embedded YouTube video playback, slide/document viewing, quizzes, progress tracking, and gamification. The instructor/admin LMS supports course authoring, lesson management, quiz building, cohorts, users, analytics, and media/document management. Offline activity is cached locally, queued when the learner is offline, and synchronized through `/api/sync` when connectivity returns. The implementation is built with React, TypeScript, Express, PostgreSQL, Drizzle ORM, Firebase Authentication, localStorage, IndexedDB, a custom Service Worker, and a storage provider abstraction that includes database storage and Cloudflare R2.

## 2. What the Team Needs to Know

- The platform is a single React and TypeScript application serving the learner experience at `/study` and the LMS experience at `/lms`.
- The product is designed around offline-first learning for students with unreliable connectivity.
- Lesson completions and quiz submissions can be queued locally and synchronized through `/api/sync` when the connection is restored.
- YouTube-based video playback still requires internet connectivity.
- Firebase Authentication handles Google Sign-In and server-side token verification.
- PostgreSQL is the primary relational database, accessed through Drizzle ORM.
- Cloudflare R2 is available through the storage provider abstraction, but the active production provider must be confirmed.
- The deployment URL, CORS configuration, CI test coverage, and ownership assignments require team confirmation before final release.

## 3. Current Project Status

| Area | Status | Current State |
|---|---|---|
| Learner Experience | Implemented | Study PWA at `/study` with dashboard, course player, progress view, profile editing, quizzes, and offline-oriented workflows. |
| Instructor/Admin LMS | Implemented | LMS at `/lms` with course, lesson, quiz, cohort, user, analytics, and media/document management. |
| Authentication | Implemented | Firebase Authentication with Google Sign-In, redirect fallback, Firebase Admin verification, invite-code registration, role guards, and token refresh handling. |
| Offline Learning | Partial / Limitation | Course data, progress, enrollments, lesson completions, quiz submissions, and sync queue data are cached locally; YouTube videos require connectivity. |
| Offline Synchronization | Implemented | Offline lesson completions and quiz submissions are queued and synchronized through `POST /api/sync`. |
| Video / Media Storage | Partial / Limitation | Documents can use database storage or Cloudflare R2. Offline video remains limited by YouTube dependency. |
| Analytics | Implemented | Recharts analytics dashboard with scores, completion rates, enrollments, CSV export, and bulk analytics API optimization. |
| API | Implemented | REST API covering health, auth, courses, lessons, quizzes, sync, enrollments, admin, analytics, cohorts, users, and documents. |
| Database | Implemented | PostgreSQL with Drizzle ORM, schema constraints, indexes, and migration files. |
| Testing | Partial / Limitation | QA result: 39 passed, 0 failed, 4 blocked, 43 total. Blocked cases require interactive Google OAuth in headless mode. |
| CI/CD | Partial / Limitation | GitHub Actions runs lint and build; no CI test step is documented. |
| Deployment | Requires Verification | Production URL and CORS origin differ in the source and must be confirmed. |

## 4. Product Overview

**Learner Portal:** The learner experience includes a course dashboard, course discovery, enrollment through class/invite codes, a course player, lesson content, embedded YouTube videos, documents/slides, offline quiz interaction, progress tracking, and gamified achievements such as progress trees and badges. Local caching and a sync queue support continued learning when network access is unreliable.

**Instructor/Admin LMS:** The LMS includes course management, lesson management, quiz building, cohort management, user/role management, analytics dashboards, CSV export, and file/media management through a storage provider abstraction. Instructor and administrator capabilities are distinct where role management and admin-only operations are documented.

## 5. User Roles & Permissions

| Capability | Learner | Instructor | Administrator |
|---|---|---|---|
| Browse courses | ✓ | — | — |
| Enroll in courses | ✓ | — | — |
| Complete lessons | ✓ | — | — |
| Take quizzes | ✓ | — | — |
| View personal progress | ✓ | — | — |
| Create courses | — | ✓ | ✓ |
| Manage lessons | — | ✓ | ✓ |
| Build quizzes | — | ✓ | ✓ |
| Manage cohorts | — | ✓ | ✓ |
| View analytics | — | ✓ | ✓ |
| Manage users/roles | — | — | ✓ |

## 6. System Architecture

The system is a single React and TypeScript application serving both learner and instructor/admin experiences. The application uses Firebase Authentication for identity, localStorage and IndexedDB for offline data, and a custom Service Worker for app shell and cache behavior. The backend is an Express API organized into routes, controllers, services, middleware, and providers. Drizzle ORM connects the service layer to PostgreSQL. File and media storage is abstracted behind a provider interface with database storage and Cloudflare R2 implementations.

**Figure 1 — AQS Offline Learning Platform Architecture** (conceptual view of the learner and LMS application, offline layer, API, database, and storage provider paths):

```
Learner (/study)              Instructor/Admin (/lms)
        \                            /
         v                          v
          React + TypeScript PWA/SPA
                     |
                     v
             Firebase Authentication
                     |
                     v
   +-----------------------------------------+
   |               Offline Layer              |
   |  localStorage | IndexedDB | ServiceWorker |
   |                Sync Queue                 |
   +-----------------------------------------+
                     |         ^
                     v         |
              Express API   Storage Provider
                     |      /            \
                     v   PostgreSQL    Cloudflare R2
       Routes / Controllers / Services / Middleware
                     |
                     v
                Drizzle ORM
                     |
                     v
                 PostgreSQL
```

Second diagram view (Learner / Instructor-Admin flow through the application layers):

```
   Learner                         Instructor / Admin
      |                                    |
      +------------> React + TypeScript Application <------------+
                                |
   -----------------------------------------------------------------
   | Learner PWA | Instructor LMS | Firebase Auth | Service Worker |
   | Offline Storage (localStorage/IndexedDB) | Sync Queue          |
   -----------------------------------------------------------------
                                |
                                v
                          Express API  <----->  Cloudflare R2
                                |                (Object/Media Storage)
                                v
   Controllers -> Services -> Drizzle ORM -> Drizzle ORM -> PostgreSQL
```

## 7. Core System Flows

**Learner Authentication Flow:**
Google Sign-In → Firebase Authentication → ID token → API authentication middleware → user/role lookup → application access.

**Offline Learning Flow:**
Online course access → local cache → learner goes offline → lesson or quiz interaction stored locally → sync queue → connectivity restored → `POST /api/sync` → server/database.

**Quiz Submission Flow:**
Learner opens quiz → submits answers → API receives submission → server-side scoring → pass/fail calculated using 70% threshold → progress/completion updated.

**Course Management Flow:**
Instructor/Admin → LMS → Course Factory → Lesson Manager → Quiz Builder → database and storage provider.

## 8. Technology Stack

| Category | Technology | Version | Purpose |
|---|---|---|---|
| Frontend | React | 19.0.1 | UI framework |
| Frontend | TypeScript | 5.8.x | Type safety |
| Frontend | TailwindCSS | 4.1.14 | Styling and dual theme system |
| Frontend | Vite | 6.2.3 | Build tool and dev server |
| Backend | Express | 4.21.2 | HTTP server |
| Backend | Drizzle ORM | 0.45.2 | ORM and migrations |
| Backend | PostgreSQL (pg) | 8.22.x | Primary relational database |
| Auth | Firebase Admin SDK | 14.0.0 | Server-side token verification |
| Auth | Firebase Client SDK | 12.15.0 | Google Sign-In |
| Security | Helmet | 8.2.0 | Security headers and CSP |
| Storage | AWS SDK S3/R2 | 3.1095.x | Cloudflare R2 object storage |
| Build/Deploy | Docker | Needs Verification | Multi-stage container build |
| Build/Deploy | GitHub Actions | Needs Verification | Lint and build pipeline |

## 9. Project Structure

```
src/
├─ components/         — learner and LMS UI components
├─ components/admin/    — CourseFactory, LessonManager, QuizBuilder, AnalyticsDashboard, CohortManager, UserManagement
├─ db/                 — Drizzle schema, database initialization, Drizzle config
├─ server/             — Express bootstrap, app setup, routes, controllers, services, providers
├─ middleware/         — auth, validation, rate limiting, optional Redis store
├─ hooks/              — online/offline detection
└─ lib/                — API wrapper, Firebase config, Firebase Admin, offline data layer, scoring, MIME validation, logger, retry utilities
```

## 10. Database Architecture

| Table | Purpose |
|---|---|
| users | Firebase UID, email, role, cohort assignment. |
| cohorts | Instructor-owned class groups with invite codes. |
| courses | Course title, description, thumbnail. |
| lessons | Markdown content, YouTube video URL, slides URL, sort order. |
| quizzes | One quiz per course, enforced by unique constraint. |
| questions | Multiple-choice questions with JSONB options and server-side-only correct answer index. |
| lesson_completions | Per-user lesson completion tracking. |
| quiz_attempts | Score, pass/fail, 70% threshold, timestamp. |
| course_completions | Server-enforced completion when all lessons are done and quiz is passed. |
| documents | Uploaded files stored as base64 in DB or R2 metadata. |
| enrollments | User-course enrollment with unique constraint. |

**Schema note:** The source lists 11 table names while also referring to a 10-table schema. The final schema count is captured in the Verification Required section.

## 11. API Overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Database connectivity check. |
| POST | `/api/auth/register` | Cohort-based student registration. |
| GET | `/api/auth/me` | Return current user profile. |
| PUT | `/api/auth/profile` | Update name or avatar. |
| PUT | `/api/auth/role` | Admin role change. |
| GET | `/api/courses` | Browse courses with lessons and quiz data. |
| POST | `/api/lessons/:id/complete` | Mark a lesson complete. |
| POST | `/api/quizzes/:id/submit` | Submit quiz answers for server-side scoring. |
| POST | `/api/sync` | Batch synchronize offline completions and quiz submissions. |
| POST/GET | `/api/enrollments` | Create and list course enrollments. |
| POST/PUT/DELETE | `/api/admin/courses/*` | Course administration operations. |
| GET | `/api/admin/analytics` | Bulk analytics dashboard data. |
| POST | `/api/admin/users` | Create instructor accounts. |
| POST/DELETE | `/api/admin/cohorts` | Cohort administration. |
| POST/GET/DELETE | `/api/documents/*` | Document upload, retrieval, and deletion. |

**Authorization Notes:** The source confirms role-based access middleware and admin/user role concepts, but it does not provide complete route-by-route authorization rules for every endpoint shown above. Route middleware and role guards should be verified against the implementation before this table is used as a formal security reference.

## 12. Offline-First Architecture

The offline layer is built around local caching, queued learner activity, and deferred synchronization. localStorage is used as the primary cache for course data, progress, enrollments, and sync queue entries. IndexedDB, through the `idb` library, is used for document MIME cache and supports the documented migration path from localStorage. The custom Service Worker pre-caches the application shell, caches static assets, uses stale-while-revalidate for selected images, and uses network-first API GET caching with cache fallback. Lesson completions and quiz submissions can be completed offline, stored locally, and synchronized through `POST /api/sync` after connectivity returns. The system should be described as offline-first, not fully offline, because YouTube video playback still depends on internet access.

## 13. Authentication & Security

Authentication uses Firebase Authentication with Google Sign-In, popup flow, redirect fallback, and Firebase Admin SDK verification on the server. Invite-code registration supports cohort-based onboarding. Role-based access guards are implemented in middleware. Security patterns include Zod validation, custom rate limiting, Helmet/CSP, CORS, server-side quiz scoring, file MIME validation, API retry handling, token refresh on 401, and documented idempotent enrollment operations. Secrets must remain outside the repository and be supplied through environment variables such as `<YOUR_LOCAL_PASSWORD>` or platform-managed secret stores.

## 14. Testing & Quality

| Area | Status | Result |
|---|---|---|
| Unit Tests | Passed / Implemented | Vitest tests cover utilities, enrollment validation, and offline data layer components. |
| QA | Partially Blocked | 39 passed / 0 failed / 4 blocked / 43 total. Blocked cases require interactive Google OAuth in headless mode. |
| API Tests | Documented | Manual API, Firebase emulator, quiz, cohort, and Postman scripts are documented. |
| E2E | Documented | Manual/Puppeteer/Python video and debug screenshot scripts are documented. |
| TypeScript | Passed / Implemented | lint script runs `tsc --noEmit`. |
| ESLint | Passed / Implemented | ESLint is configured with TypeScript, React Hooks, and React Refresh plugins. |
| Build | Passed / Implemented | Build uses Vite and an esbuild server bundle. |
| CI | Not Fully Verified | GitHub Actions runs lint and build; no automated test step is documented. |

## 15. Development Setup

1. **Prerequisites.** Install Node.js v22 and PostgreSQL. PostgreSQL is expected on port 5432.
2. **Clone repository.**
   ```bash
   git clone <REPOSITORY_URL>
   cd <PROJECT_DIRECTORY>
   ```
3. **Install dependencies.**
   ```bash
   npm install
   ```
4. **Configure `.env`.** Create a local environment file using safe local values only.
   ```
   SQL_HOST=localhost
   SQL_USER=<YOUR_LOCAL_DB_USER>
   SQL_PASSWORD=<YOUR_LOCAL_PASSWORD>
   SQL_DB_NAME=aqs_learning
   SQL_ADMIN_USER=<YOUR_LOCAL_ADMIN_USER>
   SQL_ADMIN_PASSWORD=<YOUR_LOCAL_ADMIN_PASSWORD>
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
   STORAGE_PROVIDER=<database-or-r2>
   ```
5. **Configure PostgreSQL.** Create the local database and confirm the user credentials match the `.env` file.
6. **Configure Firebase.** Configure Firebase client settings and local service-account access using environment-managed secrets.
7. **Configure storage.** Set the storage provider to `database` or `r2` according to the environment being run.
8. **Run migrations.**
   ```bash
   npx drizzle-kit push --config=./src/db/drizzle.config.ts
   ```
9. **Start development server.**
   ```bash
   npm run dev
   ```
10. **Open the application.**
    ```
    http://localhost:3000/
    ```

**Security reminder:** Never commit `.env` files, service-account credentials, API keys, database passwords, or production secrets to Git. Use environment variables or platform-managed secret stores.

## 16. Deployment & Production

**Development:** Express and Vite run together on port 3000 with Vite middleware and HMR. Firebase Auth emulator configuration is documented on port 9099.

**Testing:** QA and API validation are documented through manual and script-based workflows. CI currently documents lint and build, but not automated test execution.

**Staging:** No staging environment is documented in the source material.

**Production:** Production build uses a multi-stage Docker setup with Node 22 Alpine, dependency installation, Vite build, esbuild server bundle, and a runtime container exposing port 3000. Production configuration includes Firebase Admin through environment-managed JSON, Helmet/CSP, CORS, compression, request timeout, body limits, file upload limits, storage provider configuration, and `/api/health`.

**Important deployment note:** The source lists `https://aqs-learning.org` as the production URL and also references `https://aqs-learning-platform.vercel.app` as the production CORS origin. The team should confirm the canonical production URL and allowed origins before publishing or deploying changes.

## 17. Known Limitations

| Limitation | Impact | Priority | Next Action |
|---|---|---|---|
| YouTube-based video playback requires internet connectivity. | Learners can use offline lessons, quizzes, and progress workflows, but embedded video playback is not fully offline. | High | Review offline media strategy and confirm whether R2/object storage will be used for supported media. |
| Production URL and CORS origin conflict in the source material. | Deployment and authentication behavior may vary if allowed origins are not aligned. | High | Confirm canonical production URL and allowed origins. |
| R2 provider configuration is not confirmed as the active production provider. | Storage behavior and migration readiness may differ by environment. | Medium | Confirm `STORAGE_PROVIDER` and current R2 readiness. |
| CI does not document automated test execution. | Build quality gates may miss regressions that are covered by local or manual tests. | Medium | Decide whether CI should run the documented test suite. |
| localStorage remains the primary offline cache with IndexedDB migration support documented. | Offline storage architecture may need further consolidation for scale and reliability. | Medium | Validate the current migration path and target storage model. |
| Schema table count is inconsistent in the source material. | Database documentation may not match the actual schema count. | Low | Confirm whether the schema contains 10 or 11 tables and update documentation accordingly. |

## 18. Next Steps

**Immediate**
- [ ] Confirm production URL and CORS origin.
- [ ] Confirm route-level authentication and role restrictions.
- [ ] Confirm the active production storage provider.

**Short Term**
- [ ] Decide whether CI should run automated tests in addition to lint and build.
- [ ] Validate Cloudflare R2 readiness and media migration state.

**Medium Term**
- [ ] Validate the localStorage-to-IndexedDB migration path.
- [ ] Review the offline media strategy for YouTube-dependent lessons.

**Future**
- [ ] Confirm whether object storage will be used to support stronger offline media playback.

## 19. Team Ownership

| Area | Owner | Backup | Status |
|---|---|---|---|
| Learner Frontend | | | Needs Assignment |
| LMS Frontend | | | Needs Assignment |
| Backend/API | | | Needs Assignment |
| Database | | | Needs Assignment |
| Authentication | | | Needs Assignment |
| Offline/Sync | | | Needs Assignment |
| Storage | | | Needs Assignment |
| Deployment | | | Needs Assignment |
| QA | | | Needs Assignment |

## 20. Troubleshooting

- **Database issues:** Confirm PostgreSQL is running on port 5432 and that local environment variables match the database.
- **Firebase issues:** Confirm client config, service-account configuration, and emulator settings where applicable.
- **Authentication issues:** Check Google Sign-In flow, redirect fallback, token refresh behavior, and role linkage for pending invite-code users.
- **Offline sync issues:** Inspect local cache state, queued completions/submissions, network restoration, and `POST /api/sync` behavior.
- **Storage/upload issues:** Verify `STORAGE_PROVIDER`, file MIME validation, upload limits, and R2 credentials if applicable.
- **Build issues:** Run lint, TypeScript checks, and the documented build command.

## Verification Required

| Item | Issue | What Needs Confirmation |
|---|---|---|
| Production URL | `https://aqs-learning.org` conflicts with production CORS origin `https://aqs-learning-platform.vercel.app`. | Confirm canonical production URL and allowed origins. |
| Database table count | Source says 10 tables but lists 11 table names. | Confirm current schema table count and whether `enrollments` is included in the count. |
| API auth requirements | Some endpoints are listed without explicit authentication and role rules. | Confirm route middleware and role guards from source code. |
| Storage provider state | Database and R2 implementations are documented, but active production provider is unclear. | Confirm `STORAGE_PROVIDER` and production R2 readiness. |
| Offline media | AQS is offline-first, but YouTube embeds require internet. | Confirm intended offline video/media strategy. |
| CI testing | CI runs lint and build, but no test step is documented. | Confirm whether automated tests should be added to CI. |
| Ownership | No team owner names appear in the source document. | Assign owners and backups for each technical area. |

---

## Appendices

### Appendix A — Complete Directory Structure

See source-derived directory structure:

```
public/
src/App.tsx
src/main.tsx
src/index.css
src/types.ts
src/components/
src/components/admin/
src/db/
src/server/
src/server/routes/
src/server/controllers/
src/server/services/
src/server/providers/
src/middleware/
src/hooks/
src/lib/
drizzle/
server.ts
index.html
vite.config.ts
tsconfig.json
eslint.config.js
.prettierrc
Dockerfile
firebase.json
.firebaserc
.github/workflows/ci.yml
.husky/pre-commit
.kiro/specs/
QA_REPORT.md
CONTEXT.md
README.md
test scripts, E2E scripts, and debug screenshots
```

### Appendix B — Complete API Reference

Full source-listed API routes include `/api/health`, `/api/auth/register`, `/api/auth/me`, `/api/auth/profile`, `/api/auth/role`, `/api/courses`, `/api/lessons/:id/complete`, `/api/quizzes/:id/submit`, `/api/sync`, `/api/enrollments`, `/api/admin/courses/*`, `/api/admin/analytics`, `/api/admin/users`, `/api/admin/cohorts`, and `/api/documents/*`. Authentication and role restrictions require implementation verification where not explicitly stated.

### Appendix C — Database Schema

Database schema details include `users`, `cohorts`, `courses`, `lessons`, `quizzes`, `questions`, `lesson_completions`, `quiz_attempts`, `course_completions`, `documents`, and `enrollments`. Explicit constraints include one quiz per course, unique enrollment, server-side course completion enforcement, role constraints, performance indexes, and foreign-key fixes through 19 migration files.

### Appendix D — Environment Variables

```
SQL_HOST=localhost
SQL_USER=<YOUR_LOCAL_DB_USER>
SQL_PASSWORD=<YOUR_LOCAL_PASSWORD>
SQL_DB_NAME=aqs_learning
SQL_ADMIN_USER=<YOUR_LOCAL_ADMIN_USER>
SQL_ADMIN_PASSWORD=<YOUR_LOCAL_ADMIN_PASSWORD>
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
FIREBASE_SERVICE_ACCOUNT_JSON=<YOUR_FIREBASE_SERVICE_ACCOUNT_JSON>
STORAGE_PROVIDER=<database-or-r2>
```

### Appendix E — Test Scripts and QA Details

Documented tests include Vitest unit tests for YouTube URL normalization, enrollment validation, IndexedDB migration, MIME cache, and localStorage polyfill; `QA_REPORT.md` with 43 total tests, 39 passed, 0 failed, 4 blocked; manual API scripts; Firebase emulator scripts; quiz and cohort scripts; Python/Puppeteer video E2E scripts; debug screenshot capture; and a Postman collection.

### Appendix F — Architecture / Engineering Decisions

Key engineering decisions include offline-first caching, server-side quiz scoring, dual-theme design system, custom rate limiting with optional Redis store, Firebase authentication with pending-user linking, storage provider abstraction, API retry/backoff behavior, single-server API and SPA deployment, production static serving from `/dist`, and graceful shutdown with database pool cleanup.

### Appendix G — Development Commands

| Script | Command |
|---|---|
| dev | `tsx server.ts` |
| build | `vite build && esbuild server.ts --bundle ...` |
| start | `node dist/server.cjs` |
| lint | `tsc --noEmit && eslint src/` |
| format | `prettier --write 'src/**/*.{ts,tsx,css}'` |
| db:generate | `drizzle-kit generate` |
| db:migrate | `drizzle-kit migrate` |
