# CONTEXT.md — AQS Offline Learning Platform

## Domain Glossary

| Term | Definition |
|------|-----------|
| **Learner** | A student who enrolls in courses, consumes lessons, takes quizzes, and tracks progress. Works offline; syncs when reconnected. |
| **Instructor** | A teacher who creates and edits courses/quizzes, views enrollment and completion analytics. Works online only. |
| **Administrator** | A system manager who controls user permissions, instructor access, and system configuration. |
| **Course** | A structured learning unit containing lessons and a quiz. Has title, description, and thumbnail. |
| **Lesson** | A single learning unit within a course. Contains text content, optional YouTube video, and optional slides. |
| **Quiz** | An assessment tied to exactly one course. Contains multiple-choice questions with 4 options. 70% pass threshold. |
| **Question** | A single MCQ within a quiz. Has question text, 4 options (JSONB array), and a server-side correct answer index. |
| **Progress** | A learner's completion state: which lessons are done and quiz attempt history. |
| **Sync Queue** | A local-first write buffer storing offline lesson completions and quiz submissions until network restores. |
| **Progress Tree** | An SVG-based visual metaphor showing growth as a learner completes lessons (branches/leaves) and passes quizzes (golden flower). |
| **Badge** | A gamification achievement unlocked by reaching milestones (enrolled, lessons completed, quiz passed, etc.). |
| **Course Factory** | The instructor CMS module for creating, editing, and managing courses, lessons, and quizzes. |
| **Analytics Command Center** | The instructor view showing enrollment stats, completion rates, quiz scores, and activity feed. |
| **Offline-first** | Architecture where all data is cached locally (localStorage) first, then upgraded from server when online. |
| **Server-side scoring** | Quiz answers are never sent to the client; scoring happens exclusively on the server using `correctOptionIndex`. |
