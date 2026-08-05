// src/components/LearnerProgress.tsx
import React, { useState, useEffect } from 'react';
import { Course, QuizAttempt } from '../types.ts';
import { PouchDBService } from '../lib/pouchdb-service.ts';
import { ProgressTree } from './ProgressTree.tsx';
import { ArrowRight, Inbox, TrendingUp } from 'lucide-react';

interface LearnerProgressProps {
  courses: Course[];
  completedLessonIds: number[];
  quizAttempts: QuizAttempt[];
  onSelectCourse: (courseId: number) => void;
  onGoDiscover?: () => void;
}

export const LearnerProgress: React.FC<LearnerProgressProps> = ({
  courses,
  completedLessonIds,
  quizAttempts,
  onSelectCourse,
  onGoDiscover,
}) => {
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    PouchDBService.getEnrolledCourseIds().then((ids) => {
      if (!cancelled) setEnrolledCourseIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enrolledCourses = courses.filter((c) => enrolledCourseIds.includes(c.id));

  const quizPassedFor = (course: Course): boolean => quizAttempts.some((a) => a.quizId === course.quiz?.id && a.passed);

  const totalLessons = enrolledCourses.reduce((sum, c) => sum + (c.lessons || []).length, 0);
  const totalCompleted = enrolledCourses.reduce(
    (sum, c) => sum + (c.lessons || []).filter((l) => completedLessonIds.includes(l.id)).length,
    0,
  );
  const overallPct = totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0;
  const coursesPassed = enrolledCourses.filter(quizPassedFor).length;

  if (enrolledCourses.length === 0) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-4" id="learner-progress-view">
        <h2 className="font-display text-2xl font-bold text-ink tracking-tight leading-snug mb-1">Your Progress</h2>
        <p className="text-sm text-ink-2 mb-6">Your learning growth will appear here once you choose a course.</p>

        <div className="bg-paper-2 border border-dashed border-rule p-10 text-center rounded-xl" id="empty-progress">
          <Inbox className="w-10 h-10 text-ink-3 mx-auto mb-2" />
          <p className="text-sm font-bold text-ink">You haven't chosen any courses yet.</p>
          <p className="text-xs text-ink-3 mt-1 max-w-sm mx-auto">
            Select courses from Discover, then your progress tree will grow here as you complete lessons.
          </p>
          {onGoDiscover && (
            <button
              onClick={onGoDiscover}
              className="mt-4 px-4 py-2 bg-accent hover:opacity-90 text-white font-bold text-xs rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 mx-auto"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Discover Courses</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-4" id="learner-progress-view">
      <div className="mb-5">
        <h2 className="font-display text-2xl font-bold text-ink tracking-tight leading-snug">Your Progress</h2>
        <p className="text-sm text-ink-2 mt-1">
          {totalCompleted} of {totalLessons} lessons completed across {enrolledCourses.length} course
          {enrolledCourses.length > 1 ? 's' : ''}.
        </p>
      </div>

      {/* Summary stats */}
      <div className="bg-paper border border-rule rounded-2xl p-5 shadow-sm mb-6" id="progress-summary">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1 font-mono">Lessons</div>
            <div className="font-display text-xl font-bold text-ink">
              {totalCompleted}
              <span className="text-ink-3 text-sm font-medium">/{totalLessons}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1 font-mono">Courses passed</div>
            <div className="font-display text-xl font-bold text-ink">
              {coursesPassed}
              <span className="text-ink-3 text-sm font-medium">/{enrolledCourses.length}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1 font-mono">Overall</div>
            <div className="font-display text-xl font-bold text-ochre">{overallPct}%</div>
          </div>
        </div>
        <div className="flex justify-between items-center text-xs font-mono font-bold text-ink-2 mb-1.5">
          <span>OVERALL PROGRESS</span>
          <span>{overallPct}%</span>
        </div>
        <div className="w-full bg-rule rounded-full h-2 overflow-hidden">
          <div
            className="bg-ochre h-full rounded-full transition-all duration-300"
            style={{ width: `${overallPct}%` }}
          ></div>
        </div>
      </div>

      {/* Progress trees per enrolled course */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {enrolledCourses.map((course) => (
          <div key={course.id} className="flex flex-col" id={`progress-course-${course.id}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-display text-[15px] font-bold text-ink tracking-tight truncate">{course.title}</h3>
              <button
                onClick={() => onSelectCourse(course.id)}
                className="shrink-0 h-8 px-3 bg-navy hover:bg-navy-2 text-white text-[11px] font-semibold rounded-lg flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
              >
                Open <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <ProgressTree
              lessons={course.lessons || []}
              completedLessonIds={completedLessonIds}
              quizPassed={quizPassedFor(course)}
              courseTitle={course.title}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
