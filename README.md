# AQS Offline Learning Platform

An offline-first learning platform for rural students, featuring course discovery, video lesson player, offline quiz engine with synced progress, and an instructor CMS with visual statistics.

Developed in **Google AI Studio** and aligned with local production-ready services (PostgreSQL, Drizzle ORM, Firebase).

---

## 🚀 Key Features

- **Student Study PWA (`/study`)**:
  - **Course Discovery Dashboard**: Browse catalog of analytical lectures.
  - **Interactive Video Player**: Read course materials and watch lessons offline.
  - **Offline Quiz Engine**: Attempt MCQs offline. Progress is synced automatically using a custom PouchDB caching layer when network connectivity is restored.
  - **Gamification**: Visual badge achievements, progress trees, and profile customizer.
- **Teacher LMS Dashboard (`/lms`)**:
  - **Course Creator**: Create, edit, and delete courses.
  - **Curriculum Manager**: Build/reorder lessons, edit Markdown course content, and upload lecture slides directly to Firebase Storage.
  - **Exam Builder**: Create secure multiple-choice quizzes per course.
  - **Analytics Center**: Visual statistics using Recharts (average quiz scores, progress tracking, and student enrollments).

---

## 🛠️ Tech Stack

- **Frontend**: React 19 + TailwindCSS v4 + Vite + Framer Motion
- **Backend**: Express + TypeScript (`tsx` runner)
- **Database**: PostgreSQL (relational storage) + Drizzle ORM (migrations & querying)
- **Auth & Storage**: Firebase Auth (Google Sign-In with Redirect Fallback) + Firebase Admin SDK + Firebase Storage (slides upload)
- **Offline Sync**: Custom PouchDB client-side database wrapper

---

## 📦 Getting Started

### 1. Prerequisites

- **Node.js** (v18 or higher)
- **PostgreSQL** (running locally on port `5432` or via Docker)

### 2. Environment Configurations

Create a `.env.local` file in the root directory:

```env
# PostgreSQL Database Connection
SQL_HOST=localhost
SQL_USER=aqs
SQL_PASSWORD=aqs123
SQL_DB_NAME=aqs_learning

# Admin Connection (For migrations)
SQL_ADMIN_USER=aqs
SQL_ADMIN_PASSWORD=aqs123

# Firebase Admin SDK Configuration
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

Ensure your Firebase credentials:

1. `firebase-applet-config.json` is correctly set up in the root directory.
2. `service-account.json` containing the Firebase service account private key is downloaded and placed in the root directory.

### 3. Installation & Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Push database schema to PostgreSQL:
   ```bash
   npx drizzle-kit push --config=./src/db/drizzle.config.ts
   ```
3. Run the development server (Frontend + Backend concurrent):
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the platform.

---

## 🧪 API Testing with Firebase Auth

The server uses **Firebase Auth** (Google Sign-In) — there is no email/password login endpoint. To test authenticated routes via `curl`, you need a Firebase ID token:

1. Open the app in a browser, sign in via Google, and open DevTools → Application → Local Storage → find the `firebase:authUser` key.
2. Extract the `stsTokenManager.accessToken` value (the ID token).
3. Use it in requests:
   ```bash
   curl http://localhost:3000/api/courses \
     -H "Authorization: Bearer <ID_TOKEN>"
   ```

Alternatively, generate a custom token via the Firebase Admin SDK for testing.

---

## 🔮 Future Enhancement: Offline Video Support

### Current Approach

The application currently uses embedded YouTube videos for lesson playback. This approach was chosen deliberately to reduce hosting and storage requirements during the initial development phase. PostgreSQL intentionally stores only lesson metadata and video URLs — not video files themselves.

### Known Limitation

Embedded YouTube videos require an active internet connection. When the Progressive Web App (PWA) is operating in offline mode, video content cannot be streamed, and the player displays an "Offline" placeholder. This limitation is known and accepted in the current version of the application.

### Planned Migration

A future version of the application will migrate lesson videos from YouTube embeds to dedicated object storage solutions such as:

- Firebase Storage
- Amazon S3
- Cloudflare R2
- Other suitable object storage providers

Once videos are hosted directly by the application, the PWA will be able to cache or download them for offline playback using the service worker and browser storage (IndexedDB). The goal is to support true offline learning without storing large video files inside PostgreSQL.

### Why This Approach?

- **PostgreSQL is designed for structured application data**, not large media files. Storing binary video data in a relational database would degrade query performance and increase backup complexity.
- **Object storage is the industry-standard solution** for storing video content. Services like S3 and Firebase Storage are optimized for high-throughput media delivery at scale.
- **Separating the database from media storage** improves scalability, maintainability, and overall system performance. Each layer handles what it does best.

---

## 🧭 Learner Experience & Course Authoring Updates

The following course-builder and learner-dashboard issues were addressed on the
`user-onboarding` branch. No database migration was required for any of them.

### DEF-010 — Drag-and-drop lesson reordering

The admin curriculum outline can now be reordered by dragging, using
`Reorder.Group` / `Reorder.Item` from the already-installed `motion/react`
(no new dependency). Each row is its own component so it can hold a
`useDragControls` instance, and dragging is bound to the grip handle only
(`dragListener={false}`) so dragging never triggers the row's "open editor"
click. The existing up/down buttons remain as a keyboard-accessible fallback and
drive the same persistence path.

Every reorder now sends the **complete** ordered id list and re-fetches from the
server if the request fails, so the UI can never display a sequence the backend
rejected. Previously a failure left the locally-swapped order on screen.

The underlying data bug was that `lessons.sort_order` is not unique and every
lesson defaults to `0`, so several lessons routinely share a value. Ordering by
`sort_order` alone let Postgres return tied rows in any order, which made a
saved curriculum sequence shuffle between refreshes. `course-list-service.ts` now
applies an `asc(lessons.id)` tiebreak.

### DEF-001 — Course descriptions on learner cards

Descriptions were not rendered on either learner card variant, so any course
whose description carried the real syllabus was unreadable from the dashboard.
Both "My courses" and "Explore" cards now show the description, clamped to three
lines, with a **Read more / Show less** toggle. The toggle stops click
propagation so it does not open the course underneath it.

### DEF-004 — Course cover images

Instructors can upload a cover image (JPG/PNG/WebP, max 5 MB) from the course
**Settings** tab. On the create form the field is present but disabled, with a
hint, because a cover is attached to an already-saved course id.

Covers are stored as a normal document row and referenced from the existing
`courses.thumbnail` TEXT column as `doc:<uuid>`, which avoids a schema
migration while keeping the value self-describing. `doc:` values are served by
`GET /api/courses/:courseId/cover`.

Design notes:

- **Covers are visible to any signed-in learner**, enrolled or not, with no
  enrollment check, because the Explore grid has to show them. The route accepts
  a `?token=` query parameter since `<img src>` cannot send an `Authorization`
  header — the same approach the lesson document endpoint uses.
- Cover access deliberately bypasses `checkDocumentAccess`, which requires a
  lesson and would reject every learner. Instead the document must be proven to
  be the current cover of the requested course, which is a stronger check than
  lesson ownership.
- The new `ALLOWED_IMAGE_MIME_TYPE_SET` is intentionally **not** folded into
  `ALL_MIME_TYPE_SET`. That set gates lesson slide/video uploads, and widening it
  would let an image be uploaded as a lesson "video" where it cannot render.

### DEF-007 — Leaving a course is a full, irreversible reset of _that course_

`DELETE /api/enrollments/:courseId` unenrolls the learner **and permanently
destroys their progress for that course only**. Re-joining that course later
starts it from the beginning. The confirmation dialog states exactly what is
deleted.

**Scope is strictly one course.** Every delete is filtered by the target
`courseId`, either directly or by resolving that course's own lesson and quiz
ids first. Leaving one course does not touch the learner's other courses, their
progress there, or their certificates. This is covered by regression tests in
`src/server/services/enrollment-service.test.ts`.

**Certificates are never destroyed.** A certificate is an earned credential, not
progress, and one is irreversible and publicly verifiable via
`/api/certificates/verify/:code`, so it must not be revoked as a side effect of
leaving a course. Leaving a course midway obviously yields no certificate for
that course to begin with; leaving one after completing it keeps the credential.

The accepted trade-off: `issued_certificates` is unique on `(user_id, course_id)`
and `issueCertificate` uses `ON CONFLICT DO NOTHING`, so a learner who resets a
course and later re-completes it is returned the certificate they earned the
first time rather than a freshly issued one. A stale issue date on an
already-earned credential is preferable to silently revoking it. If a genuinely
fresh certificate is ever required, the fix is to version the unique constraint
(or clear the row) at the moment of re-completion — not at the moment a learner
chooses to leave a course.

No progress table has a foreign key to `enrollments` — only
`enrollUserInCourse` ever wrote that row — so deleting the enrollment alone
would have left progress behind and silently restored it on re-enrolment. The
service therefore deletes four record types in a single transaction, in the same
order as the existing `wipe_user()` migration:

| #   | Table                | Predicate                            |
| --- | -------------------- | ------------------------------------ |
| 1   | `quiz_attempts`      | `user_id` + this course's quiz ids   |
| 2   | `lesson_completions` | `user_id` + this course's lesson ids |
| 3   | `course_completions` | `user_id` + this course's id         |
| 4   | `enrollments`        | `user_id` + this course's id         |

A course with no quiz or no lessons skips the corresponding delete rather than
issuing an empty `IN ()` clause.

Two further consequences worth knowing:

- **The purge must extend to the offline sync queue.** The server's
  `processLessonCompletions` and `reconcileCourseCompletions` do not check
  enrollment, so a queued completion surviving the client purge would be
  replayed on the next `/api/sync` and quietly re-create the rows the server just
  deleted. `PouchDBService.purgeCourseProgress()` therefore clears the enrollment
  id, this course's rows in the flat progress record, **and** its queued lesson
  completions, quiz submissions and pending enrollment. The cached course is
  kept — it is catalogue content the Explore grid still needs.
- **Leaving a course is online-only.** It is destructive and not queued for later
  sync, unlike enrolment and lesson completions. The UI explains this and
  offers no offline path.
- Messaging is affected, and the exact effect depends on state rather than being
  absolute. `messaging-service` treats any recorded participation as an
  alternative to enrollment for **send** permission, and read access is gated
  only on being a conversation participant, never on enrollment. So a learner who
  leaves keeps the full history and keeps reading it. They can keep posting only
  if something survives the purge: `hasActiveParticipation` still finds a
  certificate, a lesson completion, a quiz attempt, or a course completion. A
  learner who left mid-course has none of those and cannot post until they
  re-join; a learner who had already earned the certificate retains posting
  access. The dialog states the rule rather than promising a block that only
  holds in the mid-course case.

#### Cross-device propagation of a removal

`loadAppData` previously reconciled the local enrolled-course list as
`union(local, server)`. That is correct only while enrollment can never shrink,
and adding unenrollment made it wrong: once a course id was in local storage,
leaving that course on one device left it under "My courses" on every other
device permanently, because the server stopped listing it while the local copy
survived. A union cannot express a removal.

`reconcileEnrolledCourseIds` in `src/lib/enrollment-sync.ts` now treats the
server list as authoritative when — and only when — both hold:

- the `POST /api/sync` flush succeeded, and
- that flush had no queued offline enrollments to replay.

The second condition matters because the enrollments `GET` is issued in parallel
with the sync `POST`, so a course enrolled by that very flush may be missing from
the response. Trusting the server in that window would make a brand-new
enrollment flicker out of the dashboard until the next reload, so the code falls
back to the union instead. That defers the removal rather than losing it: on the
following sync, once the queue has drained, the server list wins and the course
disappears.

The alternative considered was a local tombstone set. It was rejected because
tombstones are device-local and therefore cannot propagate a removal to a second
device — which is the entire problem.

### Deferred: lesson durations (DEF-005 / DEF-006)

**Not implemented — requires a schema migration that was deliberately not run.**

There is no `duration_seconds` column anywhere in `lessons`, so the hardcoded
estimates that motivated DEF-005/DEF-006 are still in place. Before this work
can continue, someone needs to author and apply
`drizzle/0030_add_lesson_duration.sql` and register it in `run-migrations.mjs`.
Runtime code was intentionally not written against a column the database does
not yet have.

### Known issues noticed while working on the above

- The document stream endpoint sets no `Accept-Ranges`, so video seeking is not
  supported even when online.
- Lesson uploads are capped at 100 MB, but the upload error message tells the
  user "10MB".
- `ioredis` is not declared in `package.json`, so `src/middleware/redis-store.ts`
  has two pre-existing TypeScript errors. This predates the current work and is
  unrelated to it.
