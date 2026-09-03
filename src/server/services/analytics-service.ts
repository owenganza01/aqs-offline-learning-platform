import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

export async function getAnalytics() {
  const allUsers = await db.select().from(schema.users);
  const learners = allUsers.filter((u) => u.role === 'learner');
  const learnerIds = new Set(learners.map((l) => l.id));
  const totalLearnersCount = learners.length;

  const courses = await db.select().from(schema.courses);
  const allLessons = await db.select().from(schema.lessons);
  const allQuizzes = await db.select().from(schema.quizzes);
  const allCompletions = await db.select().from(schema.lessonCompletions);
  const allAttempts = await db.select().from(schema.quizAttempts);

  const lessonsByCourse: Record<number, typeof allLessons> = {};
  for (const lesson of allLessons) {
    if (!lessonsByCourse[lesson.courseId]) lessonsByCourse[lesson.courseId] = [];
    lessonsByCourse[lesson.courseId].push(lesson);
  }

  const quizByCourse: Record<number, (typeof allQuizzes)[0]> = {};
  for (const q of allQuizzes) {
    quizByCourse[q.courseId] = q;
  }

  const completionsByUser: Record<number, Set<number>> = {};
  for (const c of allCompletions) {
    if (!completionsByUser[c.userId]) completionsByUser[c.userId] = new Set();
    completionsByUser[c.userId].add(c.lessonId);
  }

  const attemptsByKey: Record<string, typeof allAttempts> = {};
  for (const a of allAttempts) {
    const key = `${a.userId}:${a.quizId}`;
    if (!attemptsByKey[key]) attemptsByKey[key] = [];
    attemptsByKey[key].push(a);
  }

  const courseStats = [];
  for (const course of courses) {
    const courseLessons = lessonsByCourse[course.id] || [];
    const courseLessonIds = new Set(courseLessons.map((l) => l.id));
    const quiz = quizByCourse[course.id] || null;

    let activeStudentsCount = 0;
    let completedCourseStudentsCount = 0;
    let passedQuizStudentsCount = 0;
    let sumScore = 0;
    let scoreAttemptsCount = 0;

    for (const learner of learners) {
      const userCompletions = completionsByUser[learner.id];
      if (userCompletions) {
        const courseCompletionsCount = [...userCompletions].filter((id) => courseLessonIds.has(id)).length;
        if (courseCompletionsCount > 0) {
          activeStudentsCount++;
          if (courseLessons.length > 0 && courseCompletionsCount >= courseLessons.length) {
            completedCourseStudentsCount++;
          }
        }
      }

      if (quiz) {
        const key = `${learner.id}:${quiz.id}`;
        const attempts = attemptsByKey[key] || [];
        if (attempts.length > 0) {
          const bestAttempt = [...attempts].sort((a, b) => b.score - a.score)[0];
          if (attempts.some((a) => a.passed)) {
            passedQuizStudentsCount++;
          }
          sumScore += bestAttempt.score;
          scoreAttemptsCount++;
        }
      }
    }

    const avgScore = scoreAttemptsCount > 0 ? Math.round(sumScore / scoreAttemptsCount) : null;
    const completionRate =
      totalLearnersCount > 0 ? Math.round((passedQuizStudentsCount / totalLearnersCount) * 100) : 0;

    courseStats.push({
      id: course.id,
      title: course.title,
      lessonsCount: courseLessons.length,
      activeStudents: activeStudentsCount,
      completions: completedCourseStudentsCount,
      passedQuizzes: passedQuizStudentsCount,
      averageScore: avgScore,
      completionRate,
    });
  }

  const userMap = new Map(allUsers.map((u) => [u.id, u]));
  const lessonMap = new Map(allLessons.map((l) => [l.id, l]));
  const quizMap = new Map(allQuizzes.map((q) => [q.id, q]));

  const recentCompletions = allCompletions
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, 8)
    .map((comp) => {
      const learner = userMap.get(comp.userId);
      const lesson = lessonMap.get(comp.lessonId);
      if (!learner || !lesson) return null;
      return {
        studentName: learner.name || learner.email,
        lessonTitle: lesson.title,
        completedAt: comp.completedAt,
        type: 'lesson' as const,
      };
    })
    .filter(Boolean);

  const recentAttempts = allAttempts
    .sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime())
    .slice(0, 8)
    .map((att) => {
      const learner = userMap.get(att.userId);
      const q = quizMap.get(att.quizId);
      if (!learner || !q) return null;
      return {
        studentName: learner.name || learner.email,
        quizTitle: q.title,
        score: att.score,
        passed: att.passed,
        attemptedAt: att.attemptedAt,
        type: 'quiz' as const,
      };
    })
    .filter(Boolean);

  const recentActivity = [...recentCompletions, ...recentAttempts]
    .sort(
      (a: any, b: any) =>
        new Date(b.completedAt || b.attemptedAt).getTime() - new Date(a.completedAt || a.attemptedAt).getTime(),
    )
    .slice(0, 10);

  return { totalLearnersCount, courseStats, recentActivity };
}

// Instructor-scoped analytics — only includes courses owned by the logged-in instructor
export async function getInstructorAnalytics(instructorId: number) {
  // 1. Get courses owned by this instructor
  const ownedCourses = await db.select().from(schema.courses).where(eq(schema.courses.createdBy, instructorId));

  if (ownedCourses.length === 0) {
    return {
      totalCourses: 0,
      totalLearners: 0,
      totalEnrollments: 0,
      activeLearners: 0,
      averageProgress: 0,
      lessonCompletions: 0,
      courseCompletions: 0,
      assessmentAttempts: 0,
      averageAssessmentScore: null,
      assessmentPassRate: 0,
      courseStats: [],
      recentActivity: [],
    };
  }

  const ownedCourseIds = ownedCourses.map((c) => c.id);
  const courseIdsSet = new Set(ownedCourseIds);

  // 2. Get all lessons for owned courses
  const allLessons = await db
    .select()
    .from(schema.lessons)
    .where(
      sql`${schema.lessons.courseId} IN ${sql`(${sql.join(
        ownedCourseIds.map((id) => sql`${id}`),
        sql`, `,
      )})`}`,
    );
  const lessonsByCourse: Record<number, typeof allLessons> = {};
  for (const lesson of allLessons) {
    if (!lessonsByCourse[lesson.courseId]) lessonsByCourse[lesson.courseId] = [];
    lessonsByCourse[lesson.courseId].push(lesson);
  }

  // 3. Get enrollments for owned courses
  const allEnrollments = await db
    .select()
    .from(schema.enrollments)
    .where(
      sql`${schema.enrollments.courseId} IN ${sql`(${sql.join(
        ownedCourseIds.map((id) => sql`${id}`),
        sql`, `,
      )})`}`,
    );

  const enrollmentsByCourse: Record<number, typeof allEnrollments> = {};
  const enrolledUserIds = new Set<number>();
  for (const e of allEnrollments) {
    if (!enrollmentsByCourse[e.courseId]) enrollmentsByCourse[e.courseId] = [];
    enrollmentsByCourse[e.courseId].push(e);
    enrolledUserIds.add(e.userId);
  }

  // 4. Get lesson completions for enrolled users in owned courses
  const allCompletions =
    enrolledUserIds.size > 0
      ? await db
          .select()
          .from(schema.lessonCompletions)
          .innerJoin(schema.lessons, eq(schema.lessonCompletions.lessonId, schema.lessons.id))
          .where(
            and(
              sql`${schema.lessons.courseId} IN ${sql`(${sql.join(
                ownedCourseIds.map((id) => sql`${id}`),
                sql`, `,
              )})`}`,
            ),
          )
      : [];

  const completionsByUser: Record<number, Set<number>> = {};
  const completionsByCourse: Record<number, number> = {};
  let totalLessonCompletions = 0;
  for (const c of allCompletions) {
    if (!completionsByUser[c.lesson_completions.userId]) completionsByUser[c.lesson_completions.userId] = new Set();
    completionsByUser[c.lesson_completions.userId].add(c.lesson_completions.lessonId);
    totalLessonCompletions++;
  }

  // 5. Get quizzes for owned courses
  const allQuizzes = await db
    .select()
    .from(schema.quizzes)
    .where(
      sql`${schema.quizzes.courseId} IN ${sql`(${sql.join(
        ownedCourseIds.map((id) => sql`${id}`),
        sql`, `,
      )})`}`,
    );

  const quizByCourse: Record<number, (typeof allQuizzes)[0]> = {};
  const quizIds = allQuizzes.map((q) => q.id);
  for (const q of allQuizzes) {
    quizByCourse[q.courseId] = q;
  }

  // 6. Get quiz attempts for enrolled users in owned courses
  const allAttempts =
    quizIds.length > 0
      ? await db
          .select()
          .from(schema.quizAttempts)
          .where(
            sql`${schema.quizAttempts.quizId} IN ${sql`(${sql.join(
              quizIds.map((id) => sql`${id}`),
              sql`, `,
            )})`}`,
          )
      : [];

  const attemptsByUser: Record<number, typeof allAttempts> = {};
  let totalAssessmentAttempts = 0;
  let sumScores = 0;
  let passedAttempts = 0;
  for (const a of allAttempts) {
    if (!attemptsByUser[a.userId]) attemptsByUser[a.userId] = [];
    attemptsByUser[a.userId].push(a);
    totalAssessmentAttempts++;
    sumScores += a.score;
    if (a.passed) passedAttempts++;
  }

  // 7. Get course completions for owned courses
  const allCourseCompletions = await db
    .select()
    .from(schema.courseCompletions)
    .where(
      sql`${schema.courseCompletions.courseId} IN ${sql`(${sql.join(
        ownedCourseIds.map((id) => sql`${id}`),
        sql`, `,
      )})`}`,
    );

  const completionsCountByCourse: Record<number, number> = {};
  for (const cc of allCourseCompletions) {
    completionsCountByCourse[cc.courseId] = (completionsCountByCourse[cc.courseId] || 0) + 1;
  }

  // 8. Calculate metrics
  const totalCourses = ownedCourses.length;
  const totalLearners = enrolledUserIds.size;
  const totalEnrollments = allEnrollments.length;

  // Active learners: users with at least one lesson completion in owned courses
  const activeLearnerIds = new Set<number>();
  for (const comp of allCompletions) {
    activeLearnerIds.add(comp.lesson_completions.userId);
  }
  const activeLearners = activeLearnerIds.size;

  // Course completions
  const courseCompletions = allCourseCompletions.length;

  // Average assessment score
  const averageAssessmentScore = totalAssessmentAttempts > 0 ? Math.round(sumScores / totalAssessmentAttempts) : null;

  // Assessment pass rate
  const assessmentPassRate =
    totalAssessmentAttempts > 0 ? Math.round((passedAttempts / totalAssessmentAttempts) * 100) : 0;

  // Average progress: completed lessons / total possible lesson slots
  // total possible = sum(lessonCount per course * enrollmentCount per course)
  let totalPossibleLessonSlots = 0;
  let totalCompletedLessonSlots = 0;
  for (const course of ownedCourses) {
    const lessonCount = (lessonsByCourse[course.id] || []).length;
    const enrollmentCount = (enrollmentsByCourse[course.id] || []).length;
    totalPossibleLessonSlots += lessonCount * enrollmentCount;
  }
  // Count completed slots per user per course
  for (const [userId, completedSet] of Object.entries(completionsByUser)) {
    const uid = parseInt(userId);
    for (const course of ownedCourses) {
      const courseLessons = lessonsByCourse[course.id] || [];
      const courseLessonIds = courseLessons.map((l) => l.id);
      const completedInCourse = [...completedSet].filter((lid) => courseLessonIds.includes(lid)).length;
      totalCompletedLessonSlots += completedInCourse;
    }
  }
  const averageProgress =
    totalPossibleLessonSlots > 0 ? Math.round((totalCompletedLessonSlots / totalPossibleLessonSlots) * 100) : 0;

  // 9. Per-course stats
  const courseStats = [];
  for (const course of ownedCourses) {
    const courseLessons = lessonsByCourse[course.id] || [];
    const courseEnrollments = enrollmentsByCourse[course.id] || [];
    const quiz = quizByCourse[course.id] || null;

    let courseActiveStudents = 0;
    let coursePassedQuizzes = 0;
    let courseSumScore = 0;
    let courseScoreAttempts = 0;

    for (const learnerId of enrolledUserIds) {
      const userCompletions = completionsByUser[learnerId];
      if (userCompletions) {
        const lessonIds = courseLessons.map((l) => l.id);
        const completedCount = [...userCompletions].filter((id) => lessonIds.includes(id)).length;
        if (completedCount > 0) courseActiveStudents++;
      }

      if (quiz) {
        const attempts = attemptsByUser[learnerId] || [];
        const quizAttempts = attempts.filter((a) => a.quizId === quiz.id);
        if (quizAttempts.length > 0) {
          const bestAttempt = [...quizAttempts].sort((a, b) => b.score - a.score)[0];
          if (quizAttempts.some((a) => a.passed)) coursePassedQuizzes++;
          courseSumScore += bestAttempt.score;
          courseScoreAttempts++;
        }
      }
    }

    const avgScore = courseScoreAttempts > 0 ? Math.round(courseSumScore / courseScoreAttempts) : null;
    const enrollCount = courseEnrollments.length;
    const completionCount = completionsCountByCourse[course.id] || 0;
    const completionRate = enrollCount > 0 ? Math.round((completionCount / enrollCount) * 100) : 0;

    courseStats.push({
      id: course.id,
      title: course.title,
      lessonsCount: courseLessons.length,
      activeStudents: courseActiveStudents,
      completions: completionCount,
      passedQuizzes: coursePassedQuizzes,
      averageScore: avgScore,
      completionRate,
    });
  }

  // 10. Recent activity
  const userMap = new Map(
    (
      await db
        .select()
        .from(schema.users)
        .where(
          sql`${schema.users.id} IN ${sql`(${sql.join(
            [...enrolledUserIds].map((id) => sql`${id}`),
            sql`, `,
          )})`}`,
        )
    ).map((u) => [u.id, u]),
  );
  const lessonMap = new Map(allLessons.map((l) => [l.id, l]));
  const quizMap = new Map(allQuizzes.map((q) => [q.id, q]));

  const recentCompletions = allCompletions
    .sort(
      (a: any, b: any) =>
        new Date(b.lesson_completions.completedAt).getTime() - new Date(a.lesson_completions.completedAt).getTime(),
    )
    .slice(0, 8)
    .map((comp: any) => {
      const learner = userMap.get(comp.lesson_completions.userId);
      const lesson = lessonMap.get(comp.lesson_completions.lessonId);
      if (!learner || !lesson) return null;
      return {
        studentName: learner.name || learner.email,
        lessonTitle: lesson.title,
        completedAt: comp.lesson_completions.completedAt,
        type: 'lesson' as const,
      };
    })
    .filter(Boolean);

  const recentAttempts = allAttempts
    .sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime())
    .slice(0, 8)
    .map((att) => {
      const learner = userMap.get(att.userId);
      const q = quizMap.get(att.quizId);
      if (!learner || !q) return null;
      return {
        studentName: learner.name || learner.email,
        quizTitle: q.title,
        score: att.score,
        passed: att.passed,
        attemptedAt: att.attemptedAt,
        type: 'quiz' as const,
      };
    })
    .filter(Boolean);

  const recentActivity = [...recentCompletions, ...recentAttempts]
    .sort(
      (a: any, b: any) =>
        new Date(b.completedAt || b.attemptedAt).getTime() - new Date(a.completedAt || a.attemptedAt).getTime(),
    )
    .slice(0, 10);

  return {
    totalCourses,
    totalLearners,
    totalEnrollments,
    activeLearners,
    averageProgress,
    lessonCompletions: totalLessonCompletions,
    courseCompletions,
    assessmentAttempts: totalAssessmentAttempts,
    averageAssessmentScore,
    assessmentPassRate,
    courseStats,
    recentActivity,
  };
}
