# Project Analysis Report

## Overall Status

The application will fail to start in its current state. The most critical issue is that the server never loads environment variables, which means the database connection will fail on every launch. Additionally, the instructor management interface uses incorrect API paths, making all course and quiz creation operations non-functional. Several other configuration and code quality issues exist but are secondary to these blockers.

## Critical Issues

- **Issue:** Server does not load environment variables
- **Cause:** `server.ts` never calls `dotenv.config()`, so `.env.local` is never read
- **Impact:** Database credentials are undefined, PostgreSQL pool creation fails, and every API route that touches the database returns an error. The application cannot function.

---

- **Issue:** Instructor course CRUD uses wrong API endpoints
- **Cause:** `InstructorLMS.tsx` sends requests to `/api/courses` but the server only registers these routes under `/api/instructor/courses`
- **Impact:** Instructors cannot create, edit, or delete courses. This completely breaks the instructor workflow.

---

- **Issue:** Quiz saving and MCQ injection use wrong API endpoints
- **Cause:** `InstructorLMS.tsx` sends quiz saves to `/api/quizzes` and MCQs to `/api/instructor/mcq`, neither of which exist on the server
- **Impact:** Instructors cannot create quizzes or add questions. Assessment features are non-functional from the instructor panel.

## High Priority Issues

- **Issue:** Utility scripts use `.js` import extensions for `.ts` files
- **Cause:** `promote.ts` and `db-test.ts` import `./src/db/index.js` instead of `./src/db/index.ts`
- **Impact:** These scripts may fail to resolve imports depending on the runtime environment, preventing database administration tasks.

- **Issue:** CSS class has a missing space causing an invalid Tailwind class
- **Cause:** `gap-1.5Last:border-none` should be `gap-1.5 last:border-none`
- **Impact:** Minor rendering issue in the instructor analytics panel.

## Medium Priority Issues

- `vite` is listed in both `dependencies` and `devDependencies` — duplicate but harmless.
- `@google/genai` is listed in `package.json` but never imported anywhere in the codebase.
- `autoprefixer` is listed as a devDependency but is not used by Tailwind CSS v4.
- `drizzle-kit` and `dotenv` are in `dependencies` but should be in `devDependencies`.
- `InstructorCMS.tsx` appears to be dead code — it is never imported by any file.

## Low Priority Issues

- `handleAddQuestion` in `InstructorLMS.tsx` does not validate that all option fields are filled before adding a question.
- The same function is typed as accepting a form event but is called from a button click event.

## Root Cause Summary

The two root causes behind all critical and high-priority failures are: the absence of environment variable loading at server startup, and inconsistent API route paths between the frontend components and the server routes. A single missing `dotenv.config()` call disables the entire database layer, while the `InstructorLMS` component uses generic `/api/courses` paths that do not match the server's scoped `/api/instructor/courses` routes. Fixing these two root causes will resolve four of the five critical and high-priority issues.

## Recommended Next Step

Fix the missing `dotenv.config()` call in `server.ts` so the database connection succeeds. Then correct all API endpoint paths in `InstructorLMS.tsx` to match the server's route definitions. After these two changes, test the application startup and the instructor course creation workflow to confirm functionality is restored.
