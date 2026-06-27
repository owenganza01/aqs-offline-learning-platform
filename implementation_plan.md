# Implementation Plan

## Phase 1 — Critical Blockers

### 1.1 Add `dotenv.config()` to server.ts

- **Objective:** Load environment variables before the database pool and Firebase Admin SDK initialize
- **Files to modify:** `server.ts`
- **Exact problem:** `server.ts` never calls `dotenv.config()`, so `process.env.SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`, and `GOOGLE_APPLICATION_CREDENTIALS` are all `undefined`. The PostgreSQL pool fails to connect, and Firebase Admin SDK cannot locate the service account file for token verification.
- **Implementation approach:** Add `import dotenv from 'dotenv';` at the top of `server.ts`, then call `dotenv.config({ path: '.env.local' })` as the first statement inside `startServer()`, before any other logic.
- **Dependencies:** The `dotenv` package is already listed in `package.json` — no install needed.
- **Risks:** Low. If `.env.local` is missing, `dotenv.config()` silently returns without error. Consider adding a guard that throws if `SQL_HOST` is not set after loading.
- **Validation steps:**
  1. Run `npm run dev`
  2. Confirm no "undefined host" error from the PostgreSQL pool
  3. Confirm the server starts and listens on port 3000
  4. Confirm Firebase authentication works (Google Sign-In)

### 1.2 Fix all incorrect API endpoint paths in InstructorLMS.tsx

- **Objective:** Make course CRUD, quiz save, and direct MCQ injection work from the Instructor LMS panel
- **Files to modify:** `src/components/InstructorLMS.tsx`
- **Exact problem:** Three sets of fetch calls in this component use API paths that do not exist on the server:
  - `handleSaveCourse` sends POST to `/api/courses` and PUT to `/api/courses/:id` — server expects `POST /api/instructor/courses` and `PUT /api/instructor/courses/:id`
  - `handleDeleteCourse` sends DELETE to `/api/courses/:id` — server expects `DELETE /api/instructor/courses/:id`
  - `handleSaveQuiz` sends POST to `/api/quizzes` — server expects `POST /api/instructor/courses/:courseId/quiz`
  - `handleSaveDirectQuestion` sends POST to `/api/instructor/mcq` — server expects `POST /api/instructor/courses/:courseId/quiz/questions`
- **Implementation approach:** Change the URL in each fetch call to match the server's route definitions. All four fixes are in the same file and can be applied together.
- **Dependencies:** Phase 1.1 must be done first — the server needs a working database for these endpoints.
- **Risks:** Low. The server routes already exist and are verified to accept the exact payloads being sent.
- **Validation steps:**
  1. Log in as an instructor
  2. Create a new course — confirm success
  3. Edit the course — confirm changes persist
  4. Delete the course — confirm it is removed
  5. Create a quiz with multiple questions — confirm success
  6. Inject a single MCQ — confirm success message
  7. Verify the course list refreshes after each operation

---

## Phase 2 — High Priority

### 2.1 Fix `.js` import extensions in promote.ts and db-test.ts

- **Objective:** Ensure utility scripts resolve imports consistently
- **Files to modify:** `promote.ts`, `db-test.ts`
- **Exact problem:** Both files import `'./src/db/index.js'` and `'./src/db/schema.js'` but the actual files use `.ts` extensions. While `tsx` may resolve `.js` → `.ts` in some environments, this is inconsistent with the rest of the codebase (which uses `.ts` extensions) and may fail depending on the runtime.
- **Implementation approach:** Change all `.js` extensions to `.ts` in both files.
- **Dependencies:** Phase 1.1 must be done first — these scripts need the database connection to work.
- **Risks:** Low. Matches the pattern used by `server.ts` and aligns with `tsconfig.json` setting `allowImportingTsExtensions: true`.
- **Validation steps:**
  1. Run `npx tsx promote.ts` — confirm no import resolution errors
  2. Run `npx tsx db-test.ts` — confirm it connects and prints the user count

### 2.2 Fix CSS class typo in InstructorCMS.tsx

- **Objective:** Correct an invalid Tailwind utility class
- **Files to modify:** `src/components/InstructorCMS.tsx`
- **Exact problem:** Line 1142 has `gap-1.5Last:border-none` which is parsed as a single class name due to a missing space. Should be `gap-1.5 last:border-none`.
- **Implementation approach:** Insert a space between the two class names.
- **Dependencies:** None.
- **Risks:** Minimal. The component is currently dead code (not imported by `App.tsx`), so this only matters if `InstructorCMS` is ever activated.
- **Validation steps:**
  1. Confirm the analytics page renders without Tailwind "unknown class" warnings

---

## Phase 3 — Medium Priority

### 3.1 Clean up package.json

- **Objective:** Remove duplicate, unused, and misclassified dependencies
- **Files to modify:** `package.json`
- **Exact problem:** Four issues in one file:
  - `vite` appears in both `dependencies` and `devDependencies` (duplicate)
  - `@google/genai` is listed but never imported anywhere in the codebase
  - `autoprefixer` is listed as a devDependency but is not used by Tailwind CSS v4
  - `drizzle-kit` is in `dependencies` but is a CLI migration tool and should be in `devDependencies`
- **Implementation approach:** Remove the `vite` entry from `dependencies` (keep in `devDependencies`). Remove `@google/genai` from `dependencies`. Remove `autoprefixer` from `devDependencies`. Move `drizzle-kit` from `dependencies` to `devDependencies`.
- **Dependencies:** None.
- **Risks:** Low. None of these changes affect runtime imports.
- **Validation steps:**
  1. Run `npm install`
  2. Run `npm run build` — confirm no missing module errors
  3. Run `npx drizzle-kit --help` — confirm the CLI tool is still accessible

### 3.2 Remove dead code file InstructorCMS.tsx

- **Objective:** Eliminate an unused component to reduce maintenance overhead
- **Files to modify:** Delete `src/components/InstructorCMS.tsx`
- **Exact problem:** `InstructorCMS.tsx` is never imported by any file. The active instructor component is `InstructorLMS.tsx` (imported by `App.tsx`).
- **Implementation approach:** Delete the file. No imports reference it, so no other files need updating.
- **Dependencies:** Phase 1.2 must be done first — if `InstructorLMS` API paths remain broken, `InstructorCMS` could serve as a fallback.
- **Risks:** Low. Confirmed via grep that no file imports `InstructorCMS`.
- **Validation steps:**
  1. Run `npm run build` — confirm no import errors
  2. Run `npm run dev` — confirm the app loads without 404s

---

## Phase 4 — Low Priority

### 4.1 Add option validation and fix event type in handleAddQuestion

- **Objective:** Prevent empty quiz options and correct a TypeScript type mismatch
- **Files to modify:** `src/components/InstructorLMS.tsx`
- **Exact problem:** Two issues in `handleAddQuestion`:
  - The function only checks `questionText` — empty option fields are accepted silently
  - The function is typed as `(e: React.FormEvent)` but bound to `onClick`, which passes `React.MouseEvent`
- **Implementation approach:** Add an options validation check matching the pattern in `InstructorCMS.tsx`. Remove the unused event parameter entirely.
- **Dependencies:** None.
- **Risks:** None.
- **Validation steps:**
  1. Attempt to add a question with empty option fields — confirm an alert is shown
  2. Run `npx tsc --noEmit` — confirm no type errors

---

## Testing Checklist

- [ ] Server starts without database connection errors
- [ ] All SQL environment variables are correctly loaded
- [ ] Firebase authentication works (Google Sign-In popup completes)
- [ ] Learner dashboard loads courses from the server
- [ ] Instructor panel loads and displays courses
- [ ] Instructor can create a new course
- [ ] Instructor can edit an existing course
- [ ] Instructor can delete a course
- [ ] Instructor can add a lesson to a course
- [ ] Instructor can edit and delete lessons
- [ ] Instructor can reorder lessons
- [ ] Instructor can create a quiz with multiple questions
- [ ] Instructor can inject a single MCQ directly to a course
- [ ] Learner can browse and enroll in courses
- [ ] Learner can view lesson content (video + text)
- [ ] Learner can mark a lesson complete
- [ ] Learner can take a quiz and receive a score
- [ ] Offline lesson completion queues correctly
- [ ] Offline quiz submission queues correctly
- [ ] Sync banner appears and syncs queued data when back online
- [ ] Analytics page loads with real course stats
- [ ] CSV export produces valid output
- [ ] Profile editing (name + avatar upload) works
- [ ] Role switching between learner and instructor works
- [ ] `npx tsx promote.ts` runs without errors
- [ ] `npx tsx db-test.ts` runs without errors
- [ ] `npm run build` produces a valid production build
- [ ] `npm run start` serves the production app correctly
- [ ] `npm run lint` (`tsc --noEmit`) passes with zero errors

## Definition of Done

1. `npm run dev` starts the server, the database connects, and the app is accessible at `http://localhost:3000` without console errors.
2. Google Sign-In completes without errors, and the user profile is created in PostgreSQL.
3. Instructors can fully manage courses, lessons, and quizzes through the Instructor LMS panel.
4. Learners can browse, enroll, study lessons, take quizzes, and see their progress — both online and offline.
5. Offline progress is queued locally and syncs when the network is restored.
6. The analytics dashboard loads and displays real data.
7. `npm run build && npm run start` produces and serves a working production build.
8. `npm run lint` passes with zero TypeScript errors.
9. All utility scripts (`promote.ts`, `db-test.ts`) run without import issues.
10. No duplicate, unused, or misclassified dependencies remain in `package.json`.
