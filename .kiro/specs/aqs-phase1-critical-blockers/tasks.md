# Implementation Plan: AQS Phase 1 Critical Blockers

## Overview

Twelve targeted fixes applied in dependency order. Each task maps to a specific file or small set of files. No new architecture is introduced — these are correctness, security, and consistency repairs.

## Tasks

- [x] 1. Fix index.html PWA metadata
  - Update the `<title>` element to "AQS Digital Classroom"
  - Add `<link rel="manifest" href="/manifest.json" />` in `<head>`
  - Add `<meta name="theme-color" content="#1e293b" />` in `<head>`
  - Add a service worker registration `<script>` block that calls `navigator.serviceWorker.register('/sw.js')` on window load, guarded by `'serviceWorker' in navigator`
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Remove PUT /api/auth/role endpoint
  - Delete the entire `PUT /api/auth/role` route handler from `server.ts`
  - Verify no other code calls this endpoint
  - _Requirements: 2.1, 2.2_

- [x] 3. Normalise roles to learner | admin across all files
  - In `src/types.ts`: change the role union type to `'learner' | 'admin'`
  - In `src/middleware/auth.ts`: rename `requireInstructor` to `requireAdmin` and update the role check to compare against `'admin'`
  - In `src/server/services/authorization-service.ts`: remove `'instructor'` from the role hierarchy; hierarchy becomes `admin > learner`
  - In `server.ts`: replace all uses of `requireInstructor` with `requireAdmin`; rename all `/api/instructor/` route prefixes to `/api/admin/`
  - In `src/components/InstructorLMS.tsx`: update displayed text referencing "Instructor" to "Admin"
  - In `src/App.tsx`: replace `role === 'instructor'` checks with `role === 'admin'`; remove any role-toggle debug UI; update labels to reflect admin/learner only
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Add SQL migration to normalize instructor rows to admin
  - Create `drizzle/0006_normalize_roles.sql` with the statement: `UPDATE users SET role = 'admin' WHERE role = 'instructor';`
  - _Requirements: 4.1, 4.2_

- [x] 5. Fix Drizzle schema to match applied SQL migrations
  - In `src/db/schema.ts`, add `submissionId: text('submission_id')` to the `quizAttempts` table definition
  - In `src/db/schema.ts`, add `lessonCompletionId: text('lesson_completion_id')` to the `lessonCompletions` table definition
  - In `src/db/schema.ts`, add a `courseCompletions` table matching the structure in `drizzle/0003_add_course_completions.sql`, including any relations
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 6. Fix broken token refresh in src/lib/api.ts
  - Remove the `POST /api/auth/refresh` call from the 401 error handling path
  - Import `auth` from `./firebase`
  - On a 401 response, call `auth.currentUser.getIdToken(true)` to force-refresh the Firebase token
  - Retry the original request with the new token in the `Authorization: Bearer <token>` header
  - If `getIdToken(true)` throws or `auth.currentUser` is null, dispatch the existing session-expired event to trigger logout
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 7. Define custom Tailwind color tokens in src/index.css
  - Add a `@theme` block to `src/index.css` defining all seven missing tokens: `--color-emerald-650`, `--color-indigo-650`, `--color-slate-505`, `--color-slate-550`, `--color-slate-805`, `--color-pink-450`, `--color-amber-805`
  - Choose color values that fit between the adjacent standard Tailwind palette steps (e.g., emerald-650 between emerald-600 and emerald-700)
  - Use oklch or hex values consistent with the Tailwind v4 palette format
  - _Requirements: 7.1, 7.2_

- [x] 8. Install and configure @tailwindcss/typography
  - Run `npm install @tailwindcss/typography` to add the package to `package.json`
  - Add `@plugin "@tailwindcss/typography";` to `src/index.css` (Tailwind v4 plugin syntax)
  - _Requirements: 8.1, 8.2_

- [x] 9. Create React ErrorBoundary and wrap App
  - Create `src/components/ErrorBoundary.tsx` as a class-based React component implementing `getDerivedStateFromError` and `componentDidCatch`
  - The fallback UI should include a heading, a short message, and a "Refresh" button that calls `window.location.reload()`
  - In `src/main.tsx`, import `ErrorBoundary` and wrap `<App />` with `<ErrorBoundary>`
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 10. Add global Express error handler in server.ts
  - After all route registrations and before `app.listen`, register a four-argument middleware `(err, req, res, next) => { ... }`
  - The handler should log the error and return `res.status(500).json({ error: 'Internal server error' })`
  - In development (`NODE_ENV === 'development'`), include `err.message` in the JSON response
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 11. Remove dead PouchDB code and dependency
  - Delete the file `src/lib/pouchdb.ts`
  - Remove `pouchdb-browser` from the `dependencies` section of `package.json`
  - Check `src/lib/pouchdb-service.ts` and `src/lib/pouchdb-migration.ts` for any imports from `./pouchdb` and update or stub them so the project still compiles
  - Run `npm install` to update `package-lock.json`
  - _Requirements: 11.1, 11.2_

- [x] 12. Update CONTEXT.md to reflect two-role system
  - Remove the Instructor role row from the roles/personas table
  - Add an Admin role row describing: content management (Course Factory), analytics access, and user administration
  - Update any mentions of "Instructor" in feature descriptions (Course Factory, Analytics Dashboard) to reference "Admin" instead
  - _Requirements: 12.1, 12.2, 12.3_

- [x] 13. Final checkpoint
  - Ensure TypeScript compilation passes with no errors (`npx tsc --noEmit`)
  - Verify no remaining references to `requireInstructor`, the instructor role, or `pouchdb-browser` exist in the codebase
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks 3 and 4 must follow Task 2 (route removal)
- Task 10 must follow Task 2 (to avoid registering the error handler before routes are finalized)
- Task 12 depends on Task 3 for accurate role descriptions
- All other tasks are independent and can be applied in any order
- No property-based tests are included — these fixes are deterministic configuration and code corrections best validated by example-based unit tests and TypeScript compilation
