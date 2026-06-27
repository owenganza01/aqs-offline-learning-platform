// server.ts
import express, { Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { db } from "./src/db/index.ts";
import * as schema from "./src/db/schema.ts";
import { requireAuth, requireInstructor, AuthRequest } from "./src/middleware/auth.ts";
import { eq, and, desc } from "drizzle-orm";
import dotenv from "dotenv";

async function startServer() {
  dotenv.config({ path: ".env.local" });
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '10mb' }));

  // ==========================================
  // API ROUTES
  // ==========================================

  // Auth: Get current user profile and role
  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      res.json({
        user: req.user,
        dbUser: req.dbUser
      });
    } catch (error: any) {
      console.error("Error in /api/auth/me:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Auth: Set/Toggle user role (makes testing learner vs instructor extremely easy in AIS)
  app.put("/api/auth/role", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { role } = req.body;
      if (!role || !['learner', 'instructor', 'admin'].includes(role)) {
        return res.status(400).json({ error: "Invalid role specified." });
      }

      if (!req.dbUser) {
        return res.status(404).json({ error: "User profile not found." });
      }

      const updated = await db.update(schema.users)
        .set({ role })
        .where(eq(schema.users.id, req.dbUser.id))
        .returning();

      res.json({ success: true, dbUser: updated[0] });
    } catch (error: any) {
      console.error("Error in updating role:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Auth: Update user physical profile (avatar url and name)
  app.put("/api/auth/profile", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { avatarUrl, name } = req.body;
      if (!req.dbUser) {
        return res.status(404).json({ error: "User profile not found." });
      }

      const updateData: any = {};
      if (avatarUrl !== undefined) {
        updateData.avatarUrl = avatarUrl;
      }
      if (name !== undefined) {
        updateData.name = name;
      }

      const updated = await db.update(schema.users)
        .set(updateData)
        .where(eq(schema.users.id, req.dbUser.id))
        .returning();

      res.json({ success: true, dbUser: updated[0] });
    } catch (error: any) {
      console.error("Error in updating profile details:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Courses: List all courses for Learner Discovery, including lessons (without full detail) and quizzes
  app.get("/api/courses", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const allCourses = await db.select().from(schema.courses);
      const coursesWithDetails = [];

      for (const course of allCourses) {
        // Fetch lessons for course
        const courseLessons = await db.select({
          id: schema.lessons.id,
          title: schema.lessons.title,
          sortOrder: schema.lessons.sortOrder,
          videoUrl: schema.lessons.videoUrl,
          slidesUrl: schema.lessons.slidesUrl
        })
        .from(schema.lessons)
        .where(eq(schema.lessons.courseId, course.id))
        .orderBy(schema.lessons.sortOrder);

        // Fetch quiz for course (if exists)
        const courseQuizzes = await db.select({
          id: schema.quizzes.id,
          title: schema.quizzes.title
        })
        .from(schema.quizzes)
        .where(eq(schema.quizzes.courseId, course.id));

        const quiz = courseQuizzes[0] || null;

        coursesWithDetails.push({
          ...course,
          lessons: courseLessons,
          quiz
        });
      }

      res.json(coursesWithDetails);
    } catch (error: any) {
      console.error("Error fetching courses:", error);
      res.status(500).json({ error: "Failed to retrieve courses." });
    }
  });

  // Courses: Get detailed course info, lessons, and secure questions (NO correct answers sent to client!)
  app.get("/api/courses/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const courseId = parseInt(req.params.id);
      if (isNaN(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      const courseList = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
      if (courseList.length === 0) {
        return res.status(404).json({ error: "Course not found" });
      }

      const course = courseList[0];

      // Fetch lessons
      const courseLessons = await db.select()
        .from(schema.lessons)
        .where(eq(schema.lessons.courseId, courseId))
        .orderBy(schema.lessons.sortOrder);

      // Fetch general quiz info
      const courseQuizzes = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId));
      let quiz = null;

      if (courseQuizzes.length > 0) {
        const fullQuiz = courseQuizzes[0];
        // Fetch questions but OMIT correctOptionIndex for absolute secure assessment!
        const quizQuestionsRaw = await db.select({
          id: schema.questions.id,
          quizId: schema.questions.quizId,
          questionText: schema.questions.questionText,
          options: schema.questions.options,
        })
        .from(schema.questions)
        .where(eq(schema.questions.quizId, fullQuiz.id));

        quiz = {
          ...fullQuiz,
          questions: quizQuestionsRaw
        };
      }

      // Fetch learner's direct database progress for this course
      const completions = await db.select()
        .from(schema.lessonCompletions)
        .where(eq(schema.lessonCompletions.userId, req.dbUser!.id));

      const completionsIds = completions.map(c => c.lessonId);

      const quizAttemptsList = quiz 
        ? await db.select()
            .from(schema.quizAttempts)
            .where(
              and(
                eq(schema.quizAttempts.userId, req.dbUser!.id),
                eq(schema.quizAttempts.quizId, quiz.id)
              )
            )
            .orderBy(desc(schema.quizAttempts.attemptedAt))
        : [];

      res.json({
        course,
        lessons: courseLessons,
        quiz,
        completedLessonIds: completionsIds,
        quizAttempts: quizAttemptsList
      });
    } catch (error: any) {
      console.error("Error loading course details:", error);
      res.status(500).json({ error: "Failed to load course details." });
    }
  });

  // Lesson Completions: Mark a lesson complete (online)
  app.post("/api/lessons/:id/complete", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const lessonId = parseInt(req.params.id);
      if (isNaN(lessonId)) {
        return res.status(400).json({ error: "Invalid lesson ID" });
      }

      // Check if already completed
      const existing = await db.select()
        .from(schema.lessonCompletions)
        .where(
          and(
            eq(schema.lessonCompletions.userId, req.dbUser!.id),
            eq(schema.lessonCompletions.lessonId, lessonId)
          )
        );

      if (existing.length === 0) {
        await db.insert(schema.lessonCompletions)
          .values({
            userId: req.dbUser!.id,
            lessonId,
          });
      }

      res.json({ success: true, lessonId });
    } catch (error: any) {
      console.error("Error checking/creating lesson completion:", error);
      res.status(500).json({ error: "Failed to complete lesson." });
    }
  });

  // Quiz: Submit and score a quiz securely on server
  app.post("/api/quizzes/:id/submit", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const quizId = parseInt(req.params.id);
      const { answers } = req.body; // e.g. [0, 2, 1] representing chosen answer indices corresponding to questions

      if (isNaN(quizId) || !Array.isArray(answers)) {
        return res.status(400).json({ error: "Invalid quiz submission body" });
      }

      // Fetch questions with correct answers privately!
      const questionsList = await db.select()
        .from(schema.questions)
        .where(eq(schema.questions.quizId, quizId));

      if (questionsList.length === 0) {
        return res.status(404).json({ error: "No questions found for this quiz." });
      }

      let correctCount = 0;
      questionsList.forEach((q, idx) => {
        const submittedAnswer = answers[idx];
        if (submittedAnswer !== undefined && submittedAnswer === q.correctOptionIndex) {
          correctCount++;
        }
      });

      const totalQuestions = questionsList.length;
      const rawScore = (correctCount / totalQuestions) * 100;
      const score = Math.round(rawScore);
      const passed = score >= 70; // 70% passing grade requirement from FR-03

      // Save quiz attempt in database
      const attempt = await db.insert(schema.quizAttempts)
        .values({
          userId: req.dbUser!.id,
          quizId,
          score,
          passed,
        })
        .returning();

      res.json({
        success: true,
        score,
        passed,
        correctCount,
        totalQuestions,
        attempt: attempt[0]
      });
    } catch (error: any) {
      console.error("Error scoring quiz:", error);
      res.status(500).json({ error: "Failed to score and submit quiz." });
    }
  });

  // Sync: Connects the local offline queue (completions and quiz answers) with the production database
  app.post("/api/sync", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { lessonCompletions: localCompletions, quizSubmissions: localQuizzes } = req.body;

      if (!Array.isArray(localCompletions) || !Array.isArray(localQuizzes)) {
        return res.status(400).json({ error: "Invalid sync package." });
      }

      const userId = req.dbUser!.id;

      // 1. Process Lesson Completions
      for (const comp of localCompletions) {
        const lessonId = parseInt(comp.lessonId);
        if (isNaN(lessonId)) continue;

        // Check if DB already has it
        const existsList = await db.select()
          .from(schema.lessonCompletions)
          .where(and(eq(schema.lessonCompletions.userId, userId), eq(schema.lessonCompletions.lessonId, lessonId)));

        if (existsList.length === 0) {
          await db.insert(schema.lessonCompletions)
            .values({
              userId,
              lessonId,
              completedAt: comp.completedAt ? new Date(comp.completedAt) : new Date(),
            });
        }
      }

      // 2. Process Quiz Submissions offline scoring
      const processedQuizzes = [];
      for (const sub of localQuizzes) {
        const quizId = parseInt(sub.quizId);
        const answers = sub.answers;
        if (isNaN(quizId) || !Array.isArray(answers)) continue;

        // Score this quiz securely on server
        const questionsList = await db.select()
          .from(schema.questions)
          .where(eq(schema.questions.quizId, quizId));

        if (questionsList.length > 0) {
          let correctCount = 0;
          questionsList.forEach((q, idx) => {
            const val = answers[idx];
            if (val !== undefined && val === q.correctOptionIndex) {
              correctCount++;
            }
          });

          const totalQuestions = questionsList.length;
          const score = Math.round((correctCount / totalQuestions) * 100);
          const passed = score >= 70;

          // Insert quiz attempt
          const attempt = await db.insert(schema.quizAttempts)
            .values({
              userId,
              quizId,
              score,
              passed,
              attemptedAt: sub.attemptedAt ? new Date(sub.attemptedAt) : new Date(),
            })
            .returning();

          processedQuizzes.push({
            quizId,
            score,
            passed,
            attempt: attempt[0]
          });
        }
      }

      // 3. Fetch all current states for this user to return as truth
      const allCompletions = await db.select().from(schema.lessonCompletions).where(eq(schema.lessonCompletions.userId, userId));
      const allAttempts = await db.select().from(schema.quizAttempts).where(eq(schema.quizAttempts.userId, userId));

      res.json({
        success: true,
        syncedCompletions: allCompletions.map(c => c.lessonId),
        syncedAttempts: allAttempts,
        processedQuizzes
      });
    } catch (error: any) {
      console.error("Error in reconnect-sync engine:", error);
      res.status(500).json({ error: "Failed to synchronize progress data." });
    }
  });


  // ==========================================
  // INSTRUCTOR CMS ROUTES (Validated & Restricted via requireInstructor)
  // ==========================================

  // Course: Create
  app.post("/api/instructor/courses", requireAuth, requireInstructor, async (req: AuthRequest, res: Response) => {
    try {
      const { title, description, thumbnail } = req.body;
      if (!title || !description) {
        return res.status(400).json({ error: "Title and description are required." });
      }

      const result = await db.insert(schema.courses)
        .values({
          title,
          description,
          thumbnail: thumbnail || "teal"
        })
        .returning();

      res.status(201).json(result[0]);
    } catch (error: any) {
      console.error("CMS Course creation error:", error);
      res.status(500).json({ error: "Failed to create course." });
    }
  });

  // Course: Edit
  app.put("/api/instructor/courses/:id", requireAuth, requireInstructor, async (req: AuthRequest, res: Response) => {
    try {
      const courseId = parseInt(req.params.id);
      const { title, description, thumbnail } = req.body;

      if (isNaN(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      const updated = await db.update(schema.courses)
        .set({ title, description, thumbnail })
        .where(eq(schema.courses.id, courseId))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Course not found" });
      }

      res.json(updated[0]);
    } catch (error: any) {
      console.error("CMS Course edit error:", error);
      res.status(500).json({ error: "Failed to update course." });
    }
  });

  // Course: Delete
  app.delete("/api/instructor/courses/:id", requireAuth, requireInstructor, async (req: AuthRequest, res: Response) => {
    try {
      const courseId = parseInt(req.params.id);
      if (isNaN(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }

      const deleted = await db.delete(schema.courses)
        .where(eq(schema.courses.id, courseId))
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: "Course not found" });
      }

      res.json({ success: true, message: "Course deleted successfully", courseId });
    } catch (error: any) {
      console.error("CMS Course deletion error:", error);
      res.status(500).json({ error: "Failed to delete course." });
    }
  });

  // Lessons: Create
  app.post("/api/instructor/courses/:courseId/lessons", requireAuth, requireInstructor, async (req: AuthRequest, res: Response) => {
    try {
      const courseId = parseInt(req.params.courseId);
      const { title, content, videoUrl, slidesUrl, sortOrder } = req.body;

      if (isNaN(courseId) || !title || !content) {
        return res.status(400).json({ error: "Course ID, title and content are required." });
      }

      const result = await db.insert(schema.lessons)
        .values({
          courseId,
          title,
          content,
          videoUrl,
          slidesUrl,
          sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : 0
        })
        .returning();

      res.status(201).json(result[0]);
    } catch (error: any) {
      console.error("CMS Lesson creation error:", error);
      res.status(500).json({ error: "Failed to create lesson." });
    }
  });

  // Lessons: Edit
  app.put("/api/instructor/courses/:courseId/lessons/:id", requireAuth, requireInstructor, async (req: AuthRequest, res: Response) => {
    try {
      const lessonId = parseInt(req.params.id);
      const { title, content, videoUrl, slidesUrl, sortOrder } = req.body;

      if (isNaN(lessonId)) {
        return res.status(400).json({ error: "Invalid lesson ID" });
      }

      const updated = await db.update(schema.lessons)
        .set({ 
          title, 
          content, 
          videoUrl, 
          slidesUrl,
          sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : undefined 
        })
        .where(eq(schema.lessons.id, lessonId))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      res.json(updated[0]);
    } catch (error: any) {
      console.error("CMS Lesson edit error:", error);
      res.status(500).json({ error: "Failed to update lesson." });
    }
  });

  // Lessons: Reorder (Linear builder update)
  app.put("/api/instructor/courses/:courseId/lessons/reorder", requireAuth, requireInstructor, async (req: AuthRequest, res: Response) => {
    try {
      const { orderedIds } = req.body; // e.g. [5, 2, 4, 1] ordered list of IDs

      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: "orderedIds must be an array of numbers" });
      }

      for (let i = 0; i < orderedIds.length; i++) {
        const id = parseInt(orderedIds[i]);
        if (!isNaN(id)) {
          await db.update(schema.lessons)
            .set({ sortOrder: i })
            .where(eq(schema.lessons.id, id));
        }
      }

      res.json({ success: true, message: "Curriculum reordered successfully" });
    } catch (error: any) {
      console.error("CMS Reorder curriculum error:", error);
      res.status(500).json({ error: "Failed to reorder lessons." });
    }
  });

  // Lessons: Delete
  app.delete("/api/instructor/courses/:courseId/lessons/:id", requireAuth, requireInstructor, async (req: AuthRequest, res: Response) => {
    try {
      const lessonId = parseInt(req.params.id);
      if (isNaN(lessonId)) {
        return res.status(400).json({ error: "Invalid lesson ID" });
      }

      const deleted = await db.delete(schema.lessons)
        .where(eq(schema.lessons.id, lessonId))
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      res.json({ success: true, message: "Lesson deleted successfully" });
    } catch (error: any) {
      console.error("CMS Lesson deletion error:", error);
      res.status(500).json({ error: "Failed to delete lesson." });
    }
  });

  // Quiz: Create or fully replace a Quiz & Questions
  app.post("/api/instructor/courses/:courseId/quiz", requireAuth, requireInstructor, async (req: AuthRequest, res: Response) => {
    try {
      const courseId = parseInt(req.params.courseId);
      const { title, questions } = req.body; // questions: { questionText: string, options: string[], correctOptionIndex: number }[]

      if (isNaN(courseId) || !title || !Array.isArray(questions)) {
        return res.status(400).json({ error: "Course ID, quiz title, and questions array are required." });
      }

      // 1. Get or Create Quiz for this Course
      let quizId: number;
      const existingQuizzes = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId));

      if (existingQuizzes.length > 0) {
        quizId = existingQuizzes[0].id;
        await db.update(schema.quizzes).set({ title }).where(eq(schema.quizzes.id, quizId));
        // Delete all old questions to refresh them
        await db.delete(schema.questions).where(eq(schema.questions.quizId, quizId));
      } else {
        const newQuiz = await db.insert(schema.quizzes).values({ courseId, title }).returning();
        quizId = newQuiz[0].id;
      }

      // 2. Insert new questions
      const insertedQuestions = [];
      for (const q of questions) {
        if (!q.questionText || !Array.isArray(q.options) || q.correctOptionIndex === undefined) {
          continue;
        }

        const question = await db.insert(schema.questions)
          .values({
            quizId,
            questionText: q.questionText,
            options: q.options,
            correctOptionIndex: parseInt(q.correctOptionIndex),
          })
          .returning();

        insertedQuestions.push(question[0]);
      }

      res.json({
        success: true,
        quizId,
        uploadedQuestionsCount: insertedQuestions.length
      });
    } catch (error: any) {
      console.error("CMS Quiz synchronizing error:", error);
      res.status(500).json({ error: "Failed to save curriculum quiz." });
    }
  });

  // Quiz: Add a single multiple-choice question to an existing course's quiz
  app.post("/api/instructor/courses/:courseId/quiz/questions", requireAuth, requireInstructor, async (req: AuthRequest, res: Response) => {
    try {
      const courseId = parseInt(req.params.courseId);
      const { questionText, options, correctOptionIndex } = req.body;

      if (isNaN(courseId) || !questionText || !Array.isArray(options) || correctOptionIndex === undefined) {
        return res.status(400).json({ error: "Course ID, question text, options array, and correctOptionIndex are required." });
      }

      const trimmedOptions = options.map((opt: any) => typeof opt === "string" ? opt.trim() : "");
      if (trimmedOptions.some((opt: string) => !opt)) {
        return res.status(400).json({ error: "All of the 4 options must be non-empty strings." });
      }

      const parsedCorrectOptionIndex = parseInt(correctOptionIndex as any);
      if (isNaN(parsedCorrectOptionIndex) || parsedCorrectOptionIndex < 0 || parsedCorrectOptionIndex >= trimmedOptions.length) {
        return res.status(400).json({ error: "Invalid correct option index." });
      }

      // Check if course exists
      const courseExists = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
      if (courseExists.length === 0) {
        return res.status(404).json({ error: "Course not found." });
      }

      // 1. Get or Create Quiz for this Course
      let quizId: number;
      const existingQuizzes = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId));

      if (existingQuizzes.length > 0) {
        quizId = existingQuizzes[0].id;
      } else {
        const newQuiz = await db.insert(schema.quizzes).values({
          courseId,
          title: `${courseExists[0].title} Exam`
        }).returning();
        quizId = newQuiz[0].id;
      }

      // 2. Insert the single new question
      const question = await db.insert(schema.questions)
        .values({
          quizId,
          questionText: questionText.trim(),
          options: trimmedOptions,
          correctOptionIndex: parsedCorrectOptionIndex,
        })
        .returning();

      res.json({
        success: true,
        quizId,
        question: question[0]
      });
    } catch (error: any) {
      console.error("Error creating single quiz question:", error);
      res.status(500).json({ error: "Failed to create quiz question." });
    }
  });

  // CMS Analytics: Get all stats
  app.get("/api/instructor/analytics", requireAuth, requireInstructor, async (req: AuthRequest, res: Response) => {
    try {
      // 1. Total students enrolled
      const allUsers = await db.select().from(schema.users);
      const learners = allUsers.filter(u => u.role === 'learner');
      const totalLearnersCount = learners.length;

      // 2. Compute course-by-course analytics
      const courses = await db.select().from(schema.courses);
      const courseStats = [];

      for (const course of courses) {
        const courseLessons = await db.select().from(schema.lessons).where(eq(schema.lessons.courseId, course.id));
        const courseLessonsIds = courseLessons.map(l => l.id);

        // Fetch any completed lesson by learners
        let activeStudentsCount = 0;
        let completedCourseStudentsCount = 0;
        let passedQuizStudentsCount = 0;
        let sumScore = 0;
        let scoreAttemptsCount = 0;

        // Quiz for course
        const quizList = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, course.id));
        const quiz = quizList[0] || null;

        for (const learner of learners) {
          // Check completed lessons count for this learner
          if (courseLessonsIds.length > 0) {
            const learnerCompletions = await db.select()
              .from(schema.lessonCompletions)
              .where(
                and(
                  eq(schema.lessonCompletions.userId, learner.id),
                  eq(schema.lessonCompletions.userId, learner.id) // dummy redundant to verify
                )
              );

            // Filter completions belonging to this course
            const courseCompletions = learnerCompletions.filter(c => courseLessonsIds.includes(c.lessonId));
            if (courseCompletions.length > 0) {
              activeStudentsCount++;
              if (courseCompletions.length === courseLessonsIds.length) {
                completedCourseStudentsCount++;
              }
            }
          }

          // Check quiz pass
          if (quiz) {
            const quizAttemptsList = await db.select()
              .from(schema.quizAttempts)
              .where(
                and(
                  eq(schema.quizAttempts.userId, learner.id),
                  eq(schema.quizAttempts.quizId, quiz.id)
                )
              )
              .orderBy(desc(schema.quizAttempts.score));

            if (quizAttemptsList.length > 0) {
              if (quizAttemptsList.some(a => a.passed)) {
                passedQuizStudentsCount++;
              }
              const bestScore = quizAttemptsList[0].score;
              sumScore += bestScore;
              scoreAttemptsCount++;
            }
          }
        }

        const avgScore = scoreAttemptsCount > 0 ? Math.round(sumScore / scoreAttemptsCount) : null;
        const completionRate = activeStudentsCount > 0 
          ? Math.round((passedQuizStudentsCount / activeStudentsCount) * 100) 
          : 0;

        courseStats.push({
          id: course.id,
          title: course.title,
          lessonsCount: courseLessons.length,
          activeStudents: activeStudentsCount,
          completions: completedCourseStudentsCount,
          passedQuizzes: passedQuizStudentsCount,
          averageScore: avgScore,
          completionRate
        });
      }

      // 3. Recent activity list
      const allCompletions = await db.select().from(schema.lessonCompletions).orderBy(desc(schema.lessonCompletions.completedAt));
      const recentCompletions = [];

      for (const comp of allCompletions.slice(0, 8)) {
        const learner = allUsers.find(u => u.id === comp.userId);
        const lessonList = await db.select().from(schema.lessons).where(eq(schema.lessons.id, comp.lessonId));
        if (learner && lessonList.length > 0) {
          recentCompletions.push({
            studentName: learner.name || learner.email,
            lessonTitle: lessonList[0].title,
            completedAt: comp.completedAt,
            type: 'lesson'
          });
        }
      }

      const allAttempts = await db.select().from(schema.quizAttempts).orderBy(desc(schema.quizAttempts.attemptedAt));
      const recentAttempts = [];

      for (const att of allAttempts.slice(0, 8)) {
        const learner = allUsers.find(u => u.id === att.userId);
        const qList = await db.select().from(schema.quizzes).where(eq(schema.quizzes.id, att.quizId));
        if (learner && qList.length > 0) {
          recentAttempts.push({
            studentName: learner.name || learner.email,
            quizTitle: qList[0].title,
            score: att.score,
            passed: att.passed,
            attemptedAt: att.attemptedAt,
            type: 'quiz'
          });
        }
      }

      const recentActivity = [...recentCompletions, ...recentAttempts]
        .sort((a: any, b: any) => new Date(b.completedAt || b.attemptedAt).getTime() - new Date(a.completedAt || a.attemptedAt).getTime())
        .slice(0, 10);

      res.json({
        totalLearnersCount,
        courseStats,
        recentActivity
      });
    } catch (error: any) {
      console.error("CMS Analytics fetch error:", error);
      res.status(500).json({ error: "Failed to compile enrollment analytics." });
    }
  });


  // ==========================================
  // VITE SERVICE / STATIC ASSETS PIPELINE
  // ==========================================

  // Vite integration for dev vs prod as specified
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
