import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';

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
