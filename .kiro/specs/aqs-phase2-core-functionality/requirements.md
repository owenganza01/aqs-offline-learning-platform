# Requirements Document

## Introduction

AQS Phase 2 Core Functionality delivers a set of targeted improvements to the AQS offline learning platform. The changes span four areas: server-side API hardening (health check, course completion enforcement, enrollment persistence), analytics query performance (eliminating N+1 loops and correcting the completion rate formula), frontend API hygiene (centralising all HTTP calls through the `apiFetch` wrapper with automatic auth-header injection), and cross-device enrollment sync (writing server enrollments into localStorage on startup). Together these make the platform production-ready for multi-device learners and administrators who need accurate, real-time analytics.

## Glossary

- **Server**: The Express/Drizzle backend defined in `server.ts`
- **apiFetch**: The centralised fetch wrapper in `src/lib/api.ts` that attaches `Authorization` headers and handles token refresh
- **withBackoff**: The generic exponential-backoff retry utility exported from `src/server/services/sync-service.ts`
- **completeCourse**: The server-side service function in `src/server/services/course-service.ts` that validates and records a course completion
- **requireAuth**: Express middleware in `src/middleware/auth.ts` that verifies Firebase ID tokens and populates `req.dbUser`
- **BannerOffline**: The React component at `src/components/BannerOffline.tsx` that displays offline sync status
- **LearnerCoursePlayer**: The React component at `src/components/LearnerCoursePlayer.tsx` that renders lessons and quizzes for a learner
- **CourseFactory**: The React component at `src/components/instructor/CourseFactory.tsx` used by admins to create/edit courses
- **AnalyticsDashboard**: The React component at `src/components/instructor/AnalyticsDashboard.tsx` that displays admin analytics
- **Enrollments_Table**: The `enrollments` database table tracking which users are enrolled in which courses
- **totalLearnersCount**: The count of all users with `role = 'learner'` in the `users` table

## Requirements

### Requirement 1: Health Check Endpoint

**User Story:** As a system operator, I want a health check endpoint, so that I can verify database connectivity and server liveness in monitoring dashboards.

#### Acceptance Criteria

1. THE Server SHALL expose a `GET /api/health` endpoint that requires no authentication.
2. WHEN the database is reachable, THE Server SHALL return HTTP 200 with JSON body `{ status: 'ok', db: 'connected', timestamp: <ISO string> }`.
3. WHEN the database is unreachable, THE Server SHALL return HTTP 503 with JSON body `{ status: 'error', db: 'disconnected' }`.
4. THE `GET /api/health` route SHALL be registered before all other routes in `server.ts`.

---

### Requirement 2: Course Completion Endpoint

**User Story:** As a learner, I want the server to record my course completion, so that my achievement is persisted and verifiable.

#### Acceptance Criteria

1. THE Server SHALL expose a `POST /api/courses/:id/complete` endpoint protected by `requireAuth`.
2. WHEN all lessons are completed and the quiz is passed, THE Server SHALL call `completeCourse(userId, courseId)` and return HTTP 200 with `{ success: true, completionId, completedAt }`.
3. WHEN the completion conditions are not met, THE Server SHALL return HTTP 422 with a descriptive error message explaining which conditions remain unmet.
4. WHEN `courseId` is not a valid integer, THE Server SHALL return HTTP 400 with an error message.

---

### Requirement 3: Analytics Bulk Query Optimisation

**User Story:** As an admin, I want analytics to load quickly regardless of learner count, so that I can review course performance without waiting for per-learner database loops.

#### Acceptance Criteria

1. THE Server SHALL compute `GET /api/admin/analytics` using exactly 4 bulk queries: all courses, all lessons, all completions, and all quiz attempts.
2. THE Server SHALL compute per-course statistics in memory after fetching bulk data, eliminating per-learner per-course database round-trips.
3. THE Server SHALL calculate `completionRate` as `Math.round((passedQuizzes / totalLearnersCount) * 100)` where `totalLearnersCount` is the total number of learners.
4. THE Server SHALL NOT change the shape of the `GET /api/admin/analytics` response object.

---

### Requirement 4: BannerOffline Exponential Backoff

**User Story:** As a learner, I want the offline sync banner to retry failed syncs with exponential backoff, so that transient network failures are handled gracefully without flooding the server.

#### Acceptance Criteria

1. THE BannerOffline component SHALL import and use `withBackoff` from `../server/services/sync-service.ts` when retrying the `/api/sync` call.
2. WHEN a sync attempt fails and a retry is scheduled, THE BannerOffline component SHALL update the displayed sync message with the current retry attempt number via the `onRetry` callback.
3. WHEN all retry attempts are exhausted, THE BannerOffline component SHALL display an error state to the user.
4. THE BannerOffline component SHALL replace its raw `fetch()` call to `/api/sync` with `apiFetch` from `src/lib/api.ts`.

---

### Requirement 5: Course Completion Banner in LearnerCoursePlayer

**User Story:** As a learner, I want to see a congratulations banner when I complete a course, so that I receive clear confirmation that my completion has been recorded.

#### Acceptance Criteria

1. WHEN all lessons are completed and the quiz is passed, THE LearnerCoursePlayer SHALL display a congratulations banner.
2. WHEN the congratulations banner is first shown, THE LearnerCoursePlayer SHALL call `POST /api/courses/:id/complete` using `apiFetch` and display the returned completion date.
3. THE LearnerCoursePlayer SHALL replace all raw `fetch()` calls with `apiFetch` from `src/lib/api.ts`.

---

### Requirement 6: Token Propagation in App.tsx

**User Story:** As a developer, I want `apiFetch` to automatically attach auth headers, so that all API calls from the frontend are authenticated without duplicating header logic.

#### Acceptance Criteria

1. THE App component SHALL call `setApiToken(token)` from `src/lib/api.ts` whenever the `token` state changes.
2. THE `setApiToken` call SHALL be made inside a `useEffect` that depends on `[token]`.

---

### Requirement 7: Migrate Raw fetch() to apiFetch

**User Story:** As a developer, I want all HTTP calls in the migrated components to go through `apiFetch`, so that auth headers and token refresh are handled consistently.

#### Acceptance Criteria

1. THE BannerOffline component SHALL replace all raw `fetch()` calls with `apiFetch` from `src/lib/api.ts`.
2. THE CourseFactory component SHALL replace all raw `fetch()` calls with `apiFetch` from `src/lib/api.ts`.
3. THE AnalyticsDashboard component SHALL replace all raw `fetch()` calls with `apiFetch` from `src/lib/api.ts`.
4. THE LearnerCoursePlayer component SHALL replace all raw `fetch()` calls with `apiFetch` from `src/lib/api.ts`.
5. THE `authHeaders` and `jsonHeaders` helpers in `src/lib/utils.ts` SHALL remain unchanged, as they are still used by LessonManager and QuizBuilder.

---

### Requirement 8: Enrollment API Endpoints

**User Story:** As a learner, I want my course enrollments persisted on the server, so that my enrolled courses are consistent across devices.

#### Acceptance Criteria

1. THE Server SHALL expose a `POST /api/enrollments` endpoint protected by `requireAuth` that enrolls the authenticated user in a course.
2. WHEN a user enrolls in a course they are already enrolled in, THE Server SHALL respond idempotently using `ON CONFLICT DO NOTHING` and return HTTP 200.
3. THE Server SHALL expose a `GET /api/enrollments` endpoint protected by `requireAuth` that returns an array of `courseId` integers for all courses the authenticated user is enrolled in.
4. WHEN `courseId` is missing or invalid in the `POST /api/enrollments` request, THE Server SHALL return HTTP 400 with an error message.

---

### Requirement 9: Enrollments Database Schema

**User Story:** As a developer, I want the enrollments table in the Drizzle schema, so that server-side enrollment records can be created and queried.

#### Acceptance Criteria

1. THE Enrollments_Table SHALL include columns: `id` (serial primary key), `userId` (integer, foreign key to `users.id` with cascade delete), `courseId` (integer, foreign key to `courses.id` with cascade delete), and `enrolledAt` (timestamp, default now).
2. THE Enrollments_Table SHALL have a unique constraint on `(userId, courseId)`.
3. THE `usersRelations` definition SHALL include `enrollments: many(enrollments)`.
4. THE `coursesRelations` definition SHALL include `enrollments: many(enrollments)`.

---

### Requirement 10: Enrollments SQL Migration

**User Story:** As a developer, I want a SQL migration file for the enrollments table, so that the database schema can be updated consistently across environments.

#### Acceptance Criteria

1. THE file `drizzle/0007_add_enrollments.sql` SHALL create a table named `enrollments` with `id SERIAL PRIMARY KEY`, `user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE`, `enrolled_at TIMESTAMP NOT NULL DEFAULT NOW()`, and `UNIQUE(user_id, course_id)`.

---

### Requirement 11: Enrollment Sync on App Startup

**User Story:** As a learner, I want my enrolled courses synced from the server when I go online, so that the dashboard shows the correct enrolled courses on any device.

#### Acceptance Criteria

1. THE App component SHALL define a `syncEnrollments()` function that calls `GET /api/enrollments` when the device is online.
2. WHEN the server returns enrollment data, THE App component SHALL merge the returned `courseId` values with any existing `courseId` values stored in localStorage under the key `'aqs_enrolled_courses'` and write the combined result back.
3. THE App component SHALL call `syncEnrollments()` after `loadAppData()` completes when the device is online.
