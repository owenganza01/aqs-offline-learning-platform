# Design Document: AQS Phase 1 Critical Blockers

## Overview

This document describes the implementation design for twelve targeted fixes to the AQS Digital Classroom platform. These are not new features — they are correctness, security, and consistency repairs that must be in place before the platform can be considered production-ready.

The stack is unchanged: Express + Drizzle + SQLite + Firebase Auth + React + Tailwind v4. The only new dependency introduced is `@tailwindcss/typography`.

Each fix is scoped to specific files, and the changes are designed to be applied incrementally without breaking the running application between steps.

---

## Architecture

The platform follows a standard full-stack layout:

```
index.html              ← PWA entry point (Task 1)
server.ts               ← Express app entry (Tasks 2, 10)
src/
  types.ts              ← Shared type definitions (Task 3)
  App.tsx               ← Root React component (Task 3)
  main.tsx              ← React entry point (Task 9)
  index.css             ← Tailwind v4 CSS entry (Tasks 7, 8)
  components/
    ErrorBoundary.tsx   ← New component (Task 9)
    InstructorLMS.tsx   ← Renamed/updated for admin (Task 3)
  db/
    schema.ts           ← Drizzle schema (Task 5)
  lib/
    api.ts              ← HTTP client with auth (Task 6)
    pouchdb.ts          ← DELETE (Task 11)
  middleware/
    auth.ts             ← Auth middleware (Task 3)
  server/services/
    authorization-service.ts  ← Role hierarchy (Task 3)
drizzle/
  0006_normalize_roles.sql    ← New migration (Task 4)
CONTEXT.md              ← Developer documentation (Task 12)
package.json            ← Dependencies (Tasks 8, 11)
```

No new routes, no new database tables beyond what already exists in migrations, and no changes to the Firebase Auth configuration.

---

## Components and Interfaces

### Task 1: index.html Metadata

The current `index.html` is missing PWA-required metadata. The fix adds four elements inside `<head>`:

```html
<title>AQS Digital Classroom</title>
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1e293b" />
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js');
    });
  }
</script>
```

The manifest file already exists at `public/manifest.json` and the service worker at `public/sw.js`, so no new files are needed.

---

### Task 2: Remove PUT /api/auth/role

The endpoint `PUT /api/auth/role` allows any authenticated user to modify their own role — a clear privilege escalation vulnerability. The fix is to delete the route handler entirely from `server.ts`. No replacement is needed; role assignment is an admin-only operation that should be done out-of-band (e.g., directly in the database or via Firebase custom claims).

---

### Task 3: Two-Role System

The instructor role is removed system-wide. The changes span six files:

**src/types.ts** — Role union type:

```typescript
export type UserRole = 'learner' | 'admin';
```

**src/middleware/auth.ts** — Rename and fix middleware:

- `requireInstructor` → `requireAdmin`
- Role check must compare against `'admin'` only

**src/server/services/authorization-service.ts** — Role hierarchy:

- Remove `'instructor'` from any role arrays or permission maps
- Hierarchy becomes: `admin > learner`

**server.ts** — Route updates:

- Replace all uses of `requireInstructor` with `requireAdmin`
- Rename route prefixes: `/api/instructor/` → `/api/admin/`

**src/components/InstructorLMS.tsx** — UI copy:

- Update any displayed text referencing "Instructor" to "Admin"

**src/App.tsx** — Role-based rendering:

- Replace `role === 'instructor'` checks with `role === 'admin'`
- Remove any role-toggle UI that was used for testing
- Update labels

---

### Task 4: SQL Migration 0006_normalize_roles.sql

```sql
-- Normalize instructor role to admin
UPDATE users SET role = 'admin' WHERE role = 'instructor';
```

This migration is applied via the existing Drizzle migration runner. It is safe to run multiple times (idempotent for rows already updated).

---

### Task 5: Drizzle Schema Fixes

The SQL migrations at `drizzle/0000` through `drizzle/0003` already added these columns and tables to the database, but `src/db/schema.ts` was never updated to match.

**quizAttempts** — add column:

```typescript
submissionId: text('submission_id'),
```

**lessonCompletions** — add column:

```typescript
lessonCompletionId: text('lesson_completion_id'),
```

**courseCompletions** — add table (matching `drizzle/0003_add_course_completions.sql`):

```typescript
export const courseCompletions = sqliteTable('course_completions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  courseId: text('course_id').notNull(),
  completedAt: text('completed_at').notNull(),
  // add any additional columns present in the migration
});
```

Relations must also be defined if other tables reference `courseCompletions`.

---

### Task 6: Firebase Token Refresh Fix

The current `src/lib/api.ts` calls `POST /api/auth/refresh` on a 401 response. This endpoint either doesn't work reliably or doesn't exist, causing users to be incorrectly logged out.

The correct approach is to use the Firebase client SDK's built-in token refresh:

```typescript
import { auth } from './firebase';

// In the 401 interceptor / retry logic:
async function refreshAndRetry(originalRequest: RequestInit, url: string) {
  const user = auth.currentUser;
  if (!user) {
    dispatchSessionExpired();
    return;
  }
  try {
    const newToken = await user.getIdToken(/* forceRefresh */ true);
    // Retry original request with new token in Authorization header
    return fetch(url, {
      ...originalRequest,
      headers: {
        ...originalRequest.headers,
        Authorization: `Bearer ${newToken}`,
      },
    });
  } catch {
    dispatchSessionExpired();
  }
}
```

The `dispatchSessionExpired` function dispatches a custom DOM event (or Redux action, depending on how the app currently handles it) that triggers logout.

The old `POST /api/auth/refresh` call is removed entirely.

---

### Task 7: Custom Tailwind Color Tokens

Tailwind v4 uses a `@theme` block in the main CSS file for custom tokens. The following tokens are used in the UI but are not part of Tailwind's default palette and must be defined:

```css
@theme {
  --color-emerald-650: oklch(52% 0.15 162);
  --color-indigo-650: oklch(48% 0.19 264);
  --color-slate-505: oklch(56% 0.014 250);
  --color-slate-550: oklch(53% 0.014 250);
  --color-slate-805: oklch(26% 0.014 250);
  --color-pink-450: oklch(66% 0.22 0);
  --color-amber-805: oklch(32% 0.1 74);
}
```

Color values are chosen to fit naturally between the adjacent standard Tailwind palette steps (e.g., emerald-600 and emerald-700 bracket emerald-650).

---

### Task 8: @tailwindcss/typography

Install the package:

```
npm install @tailwindcss/typography
```

Add to `src/index.css` (Tailwind v4 plugin syntax):

```css
@plugin "@tailwindcss/typography";
```

---

### Task 9: React ErrorBoundary

A class component is required because React's error boundary API (`componentDidCatch`, `getDerivedStateFromError`) is only available on class components.

**src/components/ErrorBoundary.tsx**:

```tsx
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold text-slate-800 mb-2">Something went wrong</h1>
            <p className="text-slate-500 mb-4">An unexpected error occurred. Please refresh the page.</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**src/main.tsx** — wrap the app:

```tsx
import { ErrorBoundary } from './components/ErrorBoundary';

root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
```

---

### Task 10: Global Express Error Handler

A four-argument Express middleware is the standard pattern for error handling. It must be registered after all routes.

```typescript
// In server.ts, after all route registrations, before app.listen:
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[GlobalErrorHandler]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});
```

This depends on Task 2 (route removal) being done first to avoid conflicts.

---

### Task 11: Remove PouchDB Dead Code

- Delete `src/lib/pouchdb.ts`
- Remove `pouchdb-browser` from the `dependencies` section of `package.json`

After removal, run `npm install` to update `package-lock.json`. Verify no remaining imports of `pouchdb.ts` or `pouchdb-browser` exist (there is a `pouchdb-service.ts` and `pouchdb-migration.ts` — check whether these also import from `pouchdb.ts` and update accordingly, but do not delete them unless confirmed unused).

---

### Task 12: Update CONTEXT.md

The CONTEXT.md roles table currently lists Learner, Instructor, and possibly Admin. The update:

- Remove the Instructor row
- Add/update the Admin row describing: content management, analytics access, user administration
- Update any references to "Instructor" in feature descriptions (Course Factory, Analytics) to "Admin"

---

## Data Models

No new data models are introduced. The schema changes in Task 5 bring the Drizzle type layer in sync with the already-migrated SQLite database.

After Task 5, the TypeScript types inferred from the schema will include:

```typescript
// quizAttempts
{
  submissionId: string | null; /* existing columns */
}

// lessonCompletions
{
  lessonCompletionId: string | null; /* existing columns */
}

// courseCompletions (new table in schema)
{
  id: number;
  userId: string;
  courseId: string;
  completedAt: string;
}
```

---

## Error Handling

| Layer            | Error Handling                                                             |
| ---------------- | -------------------------------------------------------------------------- |
| React render     | ErrorBoundary catches errors, shows fallback UI (Task 9)                   |
| Express routes   | Global 4-argument error handler returns JSON (Task 10)                     |
| Token refresh    | getIdToken(true) failure dispatches session-expired (Task 6)               |
| Role check       | requireAdmin middleware returns 401/403 for unauthorized requests (Task 3) |
| Removed endpoint | PUT /api/auth/role returns 404 (Task 2)                                    |

---

## Testing Strategy

Property-based testing is not applicable to this feature. Every change is a targeted fix — a configuration correction, a file deletion, a type update, or a security patch. The behaviors are deterministic and do not vary meaningfully across a wide input space.

The appropriate testing approach for each change is:

**Unit / example tests:**

- ErrorBoundary: render a throwing child, verify fallback UI appears (React Testing Library)
- Token refresh: mock `auth.currentUser.getIdToken`, verify retry logic and session-expired dispatch path (Jest/Vitest with mocks)
- Authorization middleware: pass learner-role and admin-role tokens, verify correct accept/reject behavior

**Integration tests:**

- PUT /api/auth/role returns 404
- /api/admin/ routes require admin role, reject learner tokens
- Global error handler returns `application/json` on thrown errors
- SQL migration: seed instructor rows, run migration, verify all rows are now admin

**Static / build checks:**

- Verify `pouchdb-browser` is absent from `package.json`
- Verify `src/lib/pouchdb.ts` does not exist
- Verify Tailwind build output includes custom color tokens
- Verify `@tailwindcss/typography` plugin is present in CSS
- TypeScript compilation passes with updated role union and schema types
