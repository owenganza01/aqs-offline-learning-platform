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
