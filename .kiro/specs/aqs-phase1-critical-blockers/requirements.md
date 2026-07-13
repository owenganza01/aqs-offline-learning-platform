# Requirements Document

## Introduction

This document captures the Phase 1 critical blocker fixes for the AQS Digital Classroom platform. These requirements address security vulnerabilities, schema mismatches, broken authentication flows, dead code, and UI/configuration gaps that must be resolved before the platform can be considered production-ready.

## Glossary

- **AQS**: The AQS Digital Classroom offline learning platform
- **System**: The full-stack application comprising the Express server, React frontend, Firebase Auth integration, and Drizzle/SQLite database
- **Server**: The Express backend (server.ts and src/server/)
- **Client**: The React frontend (src/)
- **Drizzle**: The ORM and schema layer used for SQLite database access
- **Firebase Auth**: The authentication provider used for user identity and token management
- **Learner**: A standard user role with access to learning content
- **Admin**: An elevated user role with access to content management and analytics
- **PWA**: Progressive Web App — a web app installable on devices with offline support
- **ErrorBoundary**: A React class component that catches render-time JavaScript errors
- **Tailwind**: The utility-first CSS framework (v4) used for styling
- **Token Refresh**: The process of obtaining a new Firebase ID token when the current one expires

## Requirements

### Requirement 1: Correct HTML Document Metadata

**User Story:** As a user installing the app as a PWA, I want the HTML document to have the correct title, manifest link, theme color, and service worker registration, so that the app installs correctly and displays proper branding.

#### Acceptance Criteria

1. THE System SHALL set the HTML document title to "AQS Digital Classroom"
2. THE System SHALL include a `<link rel="manifest">` tag pointing to the PWA manifest file
3. THE System SHALL include a `<meta name="theme-color">` tag in the HTML head
4. THE System SHALL include a service worker registration script in index.html

---

### Requirement 2: Remove Role Escalation Vulnerability

**User Story:** As a security-conscious administrator, I want the role self-assignment endpoint removed, so that no authenticated user can escalate their own privileges.

#### Acceptance Criteria

1. THE Server SHALL NOT expose a PUT /api/auth/role endpoint
2. WHEN any authenticated user attempts to change their own role via the API, THE Server SHALL return a 404 response

---

### Requirement 3: Two-Role System (Learner and Admin Only)

**User Story:** As a system maintainer, I want the platform to support exactly two roles — learner and admin — so that the codebase is consistent and the removed instructor role cannot be accidentally used.

#### Acceptance Criteria

1. THE System SHALL define the user role type as a union of exactly "learner" and "admin"
2. THE Server SHALL enforce admin-only routes using a middleware named requireAdmin
3. THE Server SHALL rename all /api/instructor/ route prefixes to /api/admin/
4. THE System SHALL remove all references to the instructor role from middleware, services, and UI components
5. THE Client SHALL display role-appropriate UI based solely on the learner and admin roles

---

### Requirement 4: Database Role Migration

**User Story:** As a database administrator, I want existing instructor-role rows updated to admin, so that the database is consistent with the two-role schema.

#### Acceptance Criteria

1. THE System SHALL provide a SQL migration file drizzle/0006_normalize_roles.sql
2. WHEN the migration runs, THE System SHALL update all rows in the users table where role = 'instructor' to role = 'admin'

---

### Requirement 5: Drizzle Schema Matches SQL Migrations

**User Story:** As a developer, I want the Drizzle schema to match the applied SQL migrations, so that ORM queries reflect the actual database structure without runtime errors.

#### Acceptance Criteria

1. THE Drizzle schema SHALL include a submissionId column on the quizAttempts table
2. THE Drizzle schema SHALL include a lessonCompletionId column on the lessonCompletions table
3. THE Drizzle schema SHALL include a courseCompletions table with appropriate columns and relations

---

### Requirement 6: Fix Broken Token Refresh

**User Story:** As a learner, I want my session to stay active when my token expires, so that I am not incorrectly logged out in the middle of a learning session.

#### Acceptance Criteria

1. WHEN a Firebase ID token expires, THE Client SHALL call auth.currentUser.getIdToken(true) to force-refresh the token
2. WHEN the force-refresh succeeds, THE Client SHALL retry the original failed API request
3. IF the force-refresh also fails, THEN THE Client SHALL dispatch a session-expired event and log the user out
4. THE Client SHALL NOT call the POST /api/auth/refresh endpoint for token renewal

---

### Requirement 7: Define Custom Tailwind Color Tokens

**User Story:** As a frontend developer, I want all non-standard color tokens used in the UI to be defined as custom Tailwind theme tokens, so that the build does not silently drop styles for undefined colors.

#### Acceptance Criteria

1. THE System SHALL define the following custom color tokens in src/index.css using a @theme block: emerald-650, indigo-650, slate-505, slate-550, slate-805, pink-450, amber-805
2. WHEN Tailwind compiles the CSS, THE System SHALL resolve all seven custom tokens to valid CSS color values

---

### Requirement 8: Install and Configure @tailwindcss/typography

**User Story:** As a frontend developer, I want the @tailwindcss/typography plugin installed and configured, so that prose content is styled correctly.

#### Acceptance Criteria

1. THE System SHALL have @tailwindcss/typography listed as a dependency in package.json
2. THE System SHALL add a @plugin "@tailwindcss/typography" directive to src/index.css

---

### Requirement 9: React ErrorBoundary Component

**User Story:** As a user, I want render errors to show a friendly fallback screen instead of a blank page, so that I understand something went wrong and can take action.

#### Acceptance Criteria

1. THE Client SHALL include a class-based React ErrorBoundary component in src/components/ErrorBoundary.tsx
2. WHEN a render error occurs inside the component tree, THE ErrorBoundary SHALL display a user-friendly fallback UI
3. THE Client SHALL wrap the root <App /> component with <ErrorBoundary> in src/main.tsx

---

### Requirement 10: Global Express Error Handler

**User Story:** As a system operator, I want unhandled server errors to return structured JSON responses instead of crashing or returning HTML stack traces, so that API consumers receive predictable error payloads.

#### Acceptance Criteria

1. THE Server SHALL register a four-argument Express error-handling middleware in server.ts
2. THE error handler SHALL be registered after all routes and before app.listen
3. WHEN an unhandled error reaches the error handler, THE Server SHALL return a JSON response with an appropriate HTTP status code

---

### Requirement 11: Remove Dead PouchDB Code and Dependency

**User Story:** As a developer, I want dead code and unused dependencies removed, so that the codebase is clean and bundle size is not inflated.

#### Acceptance Criteria

1. THE System SHALL delete the file src/lib/pouchdb.ts
2. THE System SHALL remove the pouchdb-browser package from package.json dependencies

---

### Requirement 12: Update CONTEXT.md to Reflect Two-Role System

**User Story:** As a developer onboarding to the project, I want CONTEXT.md to accurately describe the two-role system, so that I have a correct mental model of the platform.

#### Acceptance Criteria

1. THE System SHALL remove the Instructor role row from the roles table in CONTEXT.md
2. THE System SHALL add an Admin role row describing admin capabilities in CONTEXT.md
3. THE System SHALL update Course Factory and Analytics descriptions in CONTEXT.md to reference the admin role instead of instructor
