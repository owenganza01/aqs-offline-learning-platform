# Implementation Plan: AQS Phase 2 Core Functionality

## Overview

Incremental implementation of Phase 2 changes: server API additions, analytics N+1 fix, frontend `apiFetch` migration, offline sync reliability, and enrollment persistence. Each task builds on the previous and ends with all code wired together.

## Tasks

- [x] 1. Add GET /api/health endpoint to server.ts
  - Register the route as the **first** API route in `server.ts`, before all other routes
  - Execute `sql\`SELECT 1\``via the Drizzle`db` instance to probe connectivity
  - Return HTTP 200 `{ status: 'ok', db: 'connected', timestamp: new Date().toISOString() }` on success
  - Return HTTP 503 `{ status: 'error', db: 'disconnected' }` on any database error
  - No authentication required
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Add POST /api/courses/:id/complete route to server.ts
  - Import `completeCourse` from `./src/server/services/course-service.ts`
  - Parse and validate `courseId` from `req.params.id`; return 400 if not a valid integer
  - Call `completeCourse(req.dbUser!.id, courseId)` inside a try/catch
  - On success return HTTP 200 `{ success: true, completionId, completedAt }`
  - On `completeCourse` throw return HTTP 422 `{ error: err.message }`
  - Protect with `requireAuth`
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Fix analytics N+1 queries and completion rate formula in server.ts
  - Rewrite `GET /api/admin/analytics` to use 4 bulk queries: all users, all courses, all lessons, all lesson completions, and all quiz attempts (fetched together, not per-learner)
  - Build lookup maps in memory: `lessonsByCourse`, `completionsByUser`, `attemptsByUser`
  - For each course compute `activeStudents`, `completions`, `passedQuizzes`, `averageScore`, `completionRate` using in-memory iteration only
  - Fix `completionRate` formula to `Math.round((passedQuizzes / totalLearnersCount) * 100)` where `totalLearnersCount` = total learner count, not active students
  - Keep the `recentActivity` section and the response shape **identical** to the current implementation
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Wire withBackoff into BannerOffline.tsx sync retry
  - Import `withBackoff` from `../server/services/sync-service.ts`
  - Import `apiFetch` from `../lib/api.ts`
  - Wrap the `/api/sync` call in `withBackoff(...)` with an `onRetry` callback that updates the displayed sync message: `Retrying sync… attempt ${attempt + 1}`
  - Replace the raw `fetch('/api/sync', ...)` call with `apiFetch('/api/sync', ...)`
  - Catch the final error after all retries and set an error state shown in the banner UI
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Add course completion banner to LearnerCoursePlayer.tsx
  - Compute `showCompletionBanner = allLessonsCompleted && isQuizPassed` (use existing local boolean flags)
  - Add `completedAt` state (string | null) initialised to `null`
  - Add a `useEffect` keyed on `[showCompletionBanner]` that fires when it becomes `true`: calls `POST /api/courses/${courseId}/complete` via `apiFetch`, then sets `completedAt` from the response
  - Render a congratulations banner when `showCompletionBanner` is true, displaying `completedAt` once available
  - _Requirements: 5.1, 5.2_
  - _Depends on Task 2_

- [x] 6. Call setApiToken in App.tsx
  - Import `setApiToken` from `./lib/api.ts`
  - Add `useEffect(() => { setApiToken(token); }, [token]);` in `App.tsx`
  - _Requirements: 6.1, 6.2_

- [x] 7. Migrate raw fetch() to apiFetch in BannerOffline.tsx, CourseFactory.tsx, AnalyticsDashboard.tsx, and LearnerCoursePlayer.tsx
  - In each file, replace every `fetch(url, { headers: { Authorization: ... }, ... })` call with `apiFetch(url, { ... })` — remove manual header construction
  - Do **not** modify `src/lib/utils.ts`; `authHeaders`/`jsonHeaders` remain for LessonManager and QuizBuilder
  - Files: `src/components/BannerOffline.tsx`, `src/components/instructor/CourseFactory.tsx`, `src/components/instructor/AnalyticsDashboard.tsx`, `src/components/LearnerCoursePlayer.tsx`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - _Depends on Task 6_

- [x] 8. Add enrollments table to Drizzle schema
  - In `src/db/schema.ts` add the `enrollments` table using `pgTable` with columns: `id` (serial PK), `userId` (integer FK → users.id cascade), `courseId` (integer FK → courses.id cascade), `enrolledAt` (timestamp default now)
  - Add a unique constraint on `(userId, courseId)` using the Drizzle `unique()` helper in the table's third argument
  - Add `enrollmentsRelations` relation definition
  - Add `enrollments: many(enrollments)` to both `usersRelations` and `coursesRelations`
  - File: `src/db/schema.ts`
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 9. Create drizzle/0007_add_enrollments.sql migration
  - Create file `drizzle/0007_add_enrollments.sql`
  - Contents:
    ```sql
    CREATE TABLE enrollments (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      enrolled_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, course_id)
    );
    ```
  - _Requirements: 10.1_
  - _Depends on Task 8_

- [x] 10. Add POST /api/enrollments and GET /api/enrollments routes to server.ts
  - Import `enrollments` table from schema
  - **POST /api/enrollments**: parse `courseId` from body; return 400 if missing or NaN; insert with `onConflictDoNothing()` (Drizzle's idempotent upsert); return `{ success: true, courseId }`
  - **GET /api/enrollments**: query `SELECT course_id FROM enrollments WHERE user_id = req.dbUser!.id`; return `{ courseIds: [...] }`
  - Both routes require `requireAuth`
  - File: `server.ts`
  - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - _Depends on Task 8_

- [x] 11. Update App.tsx to sync server enrollments on startup
  - Add `syncEnrollments()` async function that calls `apiFetch<{ courseIds: number[] }>('/api/enrollments')` when `navigator.onLine && token`
  - On success, read existing `aqs_enrolled_courses` from localStorage (default `[]`), compute `Array.from(new Set([...existing, ...result.data.courseIds]))`, and write back to `localStorage.setItem('aqs_enrolled_courses', JSON.stringify(merged))`
  - Call `syncEnrollments()` inside `loadAppData()` after the remote fetch block executes (i.e., when `navigator.onLine && token`)
  - File: `src/App.tsx`
  - _Requirements: 11.1, 11.2, 11.3_
  - _Depends on Task 10_

- [x] 12. Final TypeScript check and verification
  - Run `npm run lint` (`tsc --noEmit`) and fix any TypeScript errors introduced by Phase 2 changes
  - Verify no raw `fetch(` calls remain in BannerOffline.tsx, CourseFactory.tsx, AnalyticsDashboard.tsx, or LearnerCoursePlayer.tsx
  - Verify `/api/health` route is defined before all other routes in `server.ts`
  - Verify `enrollments` table is present in `src/db/schema.ts` and in `drizzle/0007_add_enrollments.sql`
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 1.1, 3.3, 7.1, 7.2, 7.3, 7.4, 9.1_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "3", "4", "6", "8"] },
    { "wave": 2, "tasks": ["5", "7", "9", "10"] },
    { "wave": 3, "tasks": ["11"] },
    { "wave": 4, "tasks": ["12"] }
  ]
}
```

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Tasks must be executed in order where dependencies are stated
- Task 6 must be complete before Task 7 (apiFetch requires the token to be set)
- Tasks 8 and 9 should be applied together before Task 10
- The analytics response shape must remain identical — do not rename any keys in the courseStats objects
- `authHeaders` and `jsonHeaders` in `src/lib/utils.ts` must not be removed
