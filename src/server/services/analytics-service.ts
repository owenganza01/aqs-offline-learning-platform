import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export type InstructorScopeData = Awaited<ReturnType<typeof getInstructorScopeData>>;

export async function getInstructorScopeData(instructorId: number) {
  const ownedCourses = await db.select().from(schema.courses).where(eq(schema.courses.createdBy, instructorId));
  const ownedCourseIds = ownedCourses.map((c) => c.id);

  if (ownedCourseIds.length === 0) {
    return {
      ownedCourses,
      ownedCourseIds,
      lessons: [] as (typeof schema.lessons.$inferSelect)[],
      lessonsByCourse: {} as Record<number, (typeof schema.lessons.$inferSelect)[]>,
      enrollments: [] as (typeof schema.enrollments.$inferSelect)[],
      enrollmentsByCourse: {} as Record<number, (typeof schema.enrollments.$inferSelect)[]>,
      enrolledUserIds: new Set<number>(),
      courseIdsByLearner: {} as Record<number, number[]>,
      completions: [] as { lesson_completions: typeof schema.lessonCompletions.$inferSelect }[],
      quizzes: [] as (typeof schema.quizzes.$inferSelect)[],
      quizByCourse: {} as Record<number, typeof schema.quizzes.$inferSelect>,
      quizIds: [] as number[],
      attempts: [] as (typeof schema.quizAttempts.$inferSelect)[],
      attemptsByUser: {} as Record<number, (typeof schema.quizAttempts.$inferSelect)[]>,
      courseCompletions: [] as (typeof schema.courseCompletions.$inferSelect)[],
      completionsCountByCourse: {} as Record<number, number>,
      issuedCertificates: [] as (typeof schema.issuedCertificates.$inferSelect)[],
      certificatesCountByCourse: {} as Record<number, number>,
    };
  }

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
  for (const e of allEnrollments) {
    if (!enrollmentsByCourse[e.courseId]) enrollmentsByCourse[e.courseId] = [];
    enrollmentsByCourse[e.courseId].push(e);
  }

  const allCompletions = await db
    .select()
    .from(schema.lessonCompletions)
    .innerJoin(schema.lessons, eq(schema.lessonCompletions.lessonId, schema.lessons.id))
    .where(
      sql`${schema.lessons.courseId} IN ${sql`(${sql.join(
        ownedCourseIds.map((id) => sql`${id}`),
        sql`, `,
      )})`}`,
    );

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
  for (const a of allAttempts) {
    if (!attemptsByUser[a.userId]) attemptsByUser[a.userId] = [];
    attemptsByUser[a.userId].push(a);
  }

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

  const allIssuedCertificates = await db
    .select()
    .from(schema.issuedCertificates)
    .where(
      sql`${schema.issuedCertificates.courseId} IN ${sql`(${sql.join(
        ownedCourseIds.map((id) => sql`${id}`),
        sql`, `,
      )})`}`,
    );
  const certificatesCountByCourse: Record<number, number> = {};
  for (const cert of allIssuedCertificates) {
    const cid = cert.courseId!;
    certificatesCountByCourse[cid] = (certificatesCountByCourse[cid] || 0) + 1;
  }

  // The roster is a union of every learner who has ANY participation in the
  // instructor's owned courses: formal enrollments plus lesson completions,
  // quiz attempts, course completions and issued certificates. This recovers
  // learners whose enrollment row was never created (e.g. offline enrollment
  // that predates enrollment syncing) and excludes admins/instructors.
  const participationUserIds = new Set<number>();
  for (const e of allEnrollments) participationUserIds.add(e.userId);
  for (const c of allCompletions) participationUserIds.add(c.lesson_completions.userId);
  for (const a of allAttempts) participationUserIds.add(a.userId);
  for (const cc of allCourseCompletions) participationUserIds.add(cc.userId);
  for (const cert of allIssuedCertificates) if (cert.userId !== null) participationUserIds.add(cert.userId);

  const learnerSet = new Set<number>();
  if (participationUserIds.size > 0) {
    const participantRows = await db
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(
        sql`${schema.users.id} IN ${sql`(${sql.join(
          [...participationUserIds].map((id) => sql`${id}`),
          sql`, `,
        )})`}`,
      );
    for (const row of participantRows) {
      if (row.role === 'learner') learnerSet.add(row.id);
    }
  }
  const enrolledUserIds = learnerSet;

  // Course roots per learner: union of enrollment rows and participation
  // evidence. A participation-only learner (no enrollment row) still gets a
  // resolvable course list for the roster's enrolledCourses / Message action.
  const courseIdsByLearner: Record<number, number[]> = {};
  const addCourseRoot = (userId: number, courseId: number) => {
    const existing = courseIdsByLearner[userId] || [];
    if (!existing.includes(courseId)) courseIdsByLearner[userId] = [...existing, courseId];
  };
  for (const e of allEnrollments) addCourseRoot(e.userId, e.courseId);
  for (const c of allCompletions) addCourseRoot(c.lesson_completions.userId, c.lessons.courseId);
  for (const a of allAttempts) {
    const course = quizByCourse[a.quizId];
    if (course) addCourseRoot(a.userId, course.courseId);
  }
  for (const cc of allCourseCompletions) addCourseRoot(cc.userId, cc.courseId);
  for (const cert of allIssuedCertificates) {
    if (cert.userId !== null && cert.courseId != null) addCourseRoot(cert.userId, cert.courseId);
  }

  return {
    ownedCourses,
    ownedCourseIds,
    lessons: allLessons,
    lessonsByCourse,
    enrollments: allEnrollments,
    enrollmentsByCourse,
    enrolledUserIds,
    courseIdsByLearner,
    completions: allCompletions,
    quizzes: allQuizzes,
    quizByCourse,
    quizIds,
    attempts: allAttempts,
    attemptsByUser,
    courseCompletions: allCourseCompletions,
    completionsCountByCourse,
    issuedCertificates: allIssuedCertificates,
    certificatesCountByCourse,
  };
}

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

  return { totalLearnersCount, lessonCompletions: allCompletions.length, courseStats, recentActivity };
}

// Instructor-scoped analytics — only includes courses owned by the logged-in instructor
export async function getInstructorAnalytics(instructorId: number) {
  const scope = await getInstructorScopeData(instructorId);

  if (scope.ownedCourses.length === 0) {
    return {
      totalCourses: 0,
      totalLearners: 0,
      totalEnrollments: 0,
      activeLearners: 0,
      averageProgress: 0,
      lessonCompletions: 0,
      courseCompletions: 0,
      certificatesIssued: 0,
      assessmentAttempts: 0,
      averageAssessmentScore: null,
      assessmentPassRate: 0,
      courseStats: [],
      recentActivity: [],
    };
  }

  const {
    ownedCourses,
    lessonsByCourse,
    enrollmentsByCourse,
    enrolledUserIds,
    completions,
    quizByCourse,
    attemptsByUser,
    courseCompletions,
    completionsCountByCourse,
    certificatesCountByCourse,
  } = scope;

  const completionsByUser: Record<number, Set<number>> = {};
  let totalLessonCompletions = 0;
  for (const c of completions) {
    if (!completionsByUser[c.lesson_completions.userId]) completionsByUser[c.lesson_completions.userId] = new Set();
    completionsByUser[c.lesson_completions.userId].add(c.lesson_completions.lessonId);
    totalLessonCompletions++;
  }

  let totalAssessmentAttempts = 0;
  let sumScores = 0;
  let passedAttempts = 0;
  const attemptsByUserArr = scope.attemptsByUser;
  for (const attempts of Object.values(attemptsByUserArr)) {
    for (const a of attempts) {
      totalAssessmentAttempts++;
      sumScores += a.score;
      if (a.passed) passedAttempts++;
    }
  }

  const totalCourses = ownedCourses.length;
  const totalLearners = enrolledUserIds.size;
  const totalEnrollments = scope.enrollments.length;

  const activeLearnerIds = new Set<number>();
  for (const comp of completions) {
    activeLearnerIds.add(comp.lesson_completions.userId);
  }
  const activeLearners = activeLearnerIds.size;

  const totalCourseCompletions = courseCompletions.length;
  const totalCertificatesIssued = scope.issuedCertificates.length;

  const averageAssessmentScore = totalAssessmentAttempts > 0 ? Math.round(sumScores / totalAssessmentAttempts) : null;
  const assessmentPassRate =
    totalAssessmentAttempts > 0 ? Math.round((passedAttempts / totalAssessmentAttempts) * 100) : 0;

  let totalPossibleLessonSlots = 0;
  let totalCompletedLessonSlots = 0;
  for (const course of ownedCourses) {
    const lessonCount = (lessonsByCourse[course.id] || []).length;
    const enrollmentCount = (enrollmentsByCourse[course.id] || []).length;
    totalPossibleLessonSlots += lessonCount * enrollmentCount;
  }
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

  const courseStats = [];
  for (const course of ownedCourses) {
    const courseLessons = lessonsByCourse[course.id] || [];
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
        const attempts = attemptsByUserArr[learnerId] || [];
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
    const enrollCount = (enrollmentsByCourse[course.id] || []).length;
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
      certificatesIssued: certificatesCountByCourse[course.id] || 0,
    });
  }

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
  const lessonMap = new Map(scope.lessons.map((l) => [l.id, l]));
  const quizMap = new Map(scope.quizzes.map((q) => [q.id, q]));

  const recentCompletions = completions
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

  const recentAttempts = scope.attempts
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
    courseCompletions: totalCourseCompletions,
    certificatesIssued: totalCertificatesIssued,
    assessmentAttempts: totalAssessmentAttempts,
    averageAssessmentScore,
    assessmentPassRate,
    courseStats,
    recentActivity,
  };
}

// Instructor-scoped course roster — only courses owned by the logged-in instructor
export async function getInstructorCourses(instructorId: number) {
  const scope = await getInstructorScopeData(instructorId);

  const courses = scope.ownedCourses.map((course) => {
    const lessonsCount = (scope.lessonsByCourse[course.id] || []).length;
    const enrollmentsCount = (scope.enrollmentsByCourse[course.id] || []).length;
    const completionsCount = scope.completionsCountByCourse[course.id] || 0;
    const certificatesIssued = scope.certificatesCountByCourse[course.id] || 0;
    const quiz = scope.quizByCourse[course.id] || null;
    const attempts = quiz ? scope.attempts.filter((a) => a.quizId === quiz.id) : [];
    const passedAttempts = attempts.filter((a) => a.passed).length;
    const passRate = attempts.length > 0 ? Math.round((passedAttempts / attempts.length) * 100) : 0;
    const averageScore =
      attempts.length > 0 ? Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length) : null;

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnail: course.thumbnail,
      createdAt: course.createdAt,
      createdBy: course.createdBy,
      createdByName: course.createdByName,
      isArchived: course.isArchived,
      lessonsCount,
      enrollmentsCount,
      completionsCount,
      certificatesIssued,
      hasQuiz: Boolean(quiz),
      passRate,
      averageScore,
    };
  });

  return { courses };
}

// Instructor-scoped learner roster — learners enrolled in any course owned by the instructor
export async function getInstructorLearners(instructorId: number) {
  const scope = await getInstructorScopeData(instructorId);

  if (scope.enrolledUserIds.size === 0) {
    return { learners: [] };
  }

  const userRows = (
    await db
      .select()
      .from(schema.users)
      .where(
        sql`${schema.users.id} IN ${sql`(${sql.join(
          [...scope.enrolledUserIds].map((id) => sql`${id}`),
          sql`, `,
        )})`}`,
      )
  ).filter((u) => u.role === 'learner');

  const lessonIdsByCourse: Record<number, number[]> = {};
  for (const course of scope.ownedCourses) {
    lessonIdsByCourse[course.id] = (scope.lessonsByCourse[course.id] || []).map((l) => l.id);
  }

  const learners = userRows.map((user) => {
    // Course roots: union of formal enrollment rows and participation evidence
    // (completions, attempts, course completion, certificate) within the owned
    // courses — so participation-only learners still get enrolledCourses.
    const userCourseRoots = new Set<number>();
    for (const e of scope.enrollments) {
      if (e.userId === user.id) userCourseRoots.add(e.courseId);
    }
    for (const courseId of scope.courseIdsByLearner[user.id] || []) {
      userCourseRoots.add(courseId);
    }
    const enrolledCourses = [...userCourseRoots]
      .map((courseId) => {
        const course = scope.ownedCourses.find((c) => c.id === courseId);
        return course ? { id: course.id, title: course.title } : null;
      })
      .filter((c): c is { id: number; title: string } => c !== null);

    const completedLessonIds = new Set(
      scope.completions
        .filter((cmp) => cmp.lesson_completions.userId === user.id)
        .map((cmp) => cmp.lesson_completions.lessonId),
    );

    let lessonsCompleted = 0;
    let lessonsTotal = 0;
    for (const course of scope.ownedCourses) {
      const ids = lessonIdsByCourse[course.id] || [];
      lessonsTotal += ids.length;
      lessonsCompleted += ids.filter((lid) => completedLessonIds.has(lid)).length;
    }

    const attempts = scope.attemptsByUser[user.id] || [];
    const quizzesPassed = attempts.filter((a) => a.passed).length;
    const bestScore = attempts.length > 0 ? Math.max(...attempts.map((a) => a.score)) : null;

    const certificatesCount = scope.issuedCertificates.filter(
      (cert) => cert.userId === user.id && cert.courseId != null,
    ).length;
    const courseCompletionsCount = scope.courseCompletions.filter((cc) => cc.userId === user.id).length;

    let lastActive: string | null = null;
    for (const cmp of scope.completions) {
      if (cmp.lesson_completions.userId === user.id) {
        const time = new Date(cmp.lesson_completions.completedAt).getTime();
        if (lastActive === null || time > new Date(lastActive).getTime()) {
          lastActive = new Date(cmp.lesson_completions.completedAt).toISOString();
        }
      }
    }
    for (const attempt of attempts) {
      const time = new Date(attempt.attemptedAt).getTime();
      if (lastActive === null || time > new Date(lastActive).getTime()) {
        lastActive = new Date(attempt.attemptedAt).toISOString();
      }
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      joinedAt: user.createdAt,
      enrolledCourses,
      lessonsCompleted,
      lessonsTotal,
      quizzesPassed,
      bestScore,
      courseCompletionsCount,
      certificatesCount,
      lastActive,
    };
  });

  return { learners };
}
