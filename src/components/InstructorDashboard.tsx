// src/components/InstructorDashboard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import {
  RefreshCw,
  LayoutDashboard,
  Users,
  Layout,
  Award,
  Sparkles,
  Activity,
  BookOpen,
  GraduationCap,
} from 'lucide-react';
import { motion } from 'motion/react';

interface InstructorDashboardProps {
  token: string | null;
}

interface InstructorCourse {
  id: number;
  title: string;
  description: string;
  thumbnail: string | null;
  createdAt: string;
  lessonsCount: number;
  enrollmentsCount: number;
  completionsCount: number;
  certificatesIssued: number;
  hasQuiz: boolean;
  passRate: number;
  averageScore: number | null;
}

interface InstructorAnalytics {
  totalCourses: number;
  totalLearners: number;
  activeLearners: number;
  lessonCompletions: number;
  courseCompletions: number;
  certificatesIssued: number;
  assessmentAttempts: number;
  averageAssessmentScore: number | null;
  assessmentPassRate: number;
  recentActivity: {
    studentName: string;
    lessonTitle?: string;
    quizTitle?: string;
    score?: number;
    passed?: boolean;
    completedAt?: string;
    attemptedAt?: string;
    type: 'lesson' | 'quiz';
  }[];
}

function formatActivityTime(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const InstructorDashboard: React.FC<InstructorDashboardProps> = ({ token }) => {
  const [analytics, setAnalytics] = useState<InstructorAnalytics | null>(null);
  const [instructorCourses, setInstructorCourses] = useState<InstructorCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const [analyticsRes, coursesRes] = await Promise.all([
        apiFetch<InstructorAnalytics & { error?: string }>('/api/instructor/analytics'),
        apiFetch<{ courses: InstructorCourse[] }>('/api/instructor/courses'),
      ]);
      if (analyticsRes.ok && analyticsRes.data) {
        setAnalytics(analyticsRes.data);
      } else {
        setError(analyticsRes.data?.error || 'Failed to load dashboard analytics.');
      }
      if (coursesRes.ok && coursesRes.data) {
        setInstructorCourses(coursesRes.data.courses);
      }
    } catch (err) {
      console.error('Failed to load instructor dashboard:', err);
      setError('Something went wrong while loading your dashboard.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading && !analytics) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-text-2 h-[30vh]">
        <RefreshCw className="w-10 h-10 animate-spin text-steel mb-4" />
        <p className="font-bold font-sans">Compiling instructor overview...</p>
      </div>
    );
  }

  if (error && !analytics) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-text-2 h-[30vh]">
        <p className="font-bold font-sans text-error">{error}</p>
      </div>
    );
  }

  if (analytics && analytics.totalCourses === 0 && instructorCourses.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8 font-sans"
        id="instructor-dashboard"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stroke pb-5">
          <div>
            <h3 className="text-lg font-display font-bold text-text tracking-tight flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-steel" />
              <span>Dashboard</span>
            </h3>
            <p className="text-xs text-text-3 mt-1 font-medium">Overview of your courses, learners, and activity.</p>
          </div>
        </div>
        <div className="bg-white border border-stroke rounded-xl p-10 text-center">
          <BookOpen className="w-10 h-10 text-steel mx-auto mb-3" />
          <h4 className="text-base font-display font-bold text-text">No courses yet</h4>
          <p className="text-sm text-text-3 mt-1 max-w-md mx-auto">
            You have not created any courses. Head to the <span className="font-semibold text-steel">Courses</span> tab
            to build your first course — its learners, completions, and certificates will appear here.
          </p>
        </div>
      </motion.div>
    );
  }

  const overview = analytics!;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 font-sans"
      id="instructor-dashboard"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stroke pb-5">
        <div>
          <h3 className="text-lg font-display font-bold text-text tracking-tight flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-steel" />
            <span>Dashboard</span>
          </h3>
          <p className="text-xs text-text-3 mt-1 font-medium">Overview of your courses, learners, and activity.</p>
        </div>
        <button
          onClick={() => load()}
          className="flex items-center gap-2 px-4 py-2.5 bg-steel hover:bg-[#2d4a70] text-white font-semibold text-xs rounded-lg shadow-md transition-all hover:shadow-lg active:scale-95 border border-steel cursor-pointer"
          title="Refresh dashboard"
        >
          <RefreshCw className="w-4 h-4" />
          <span>REFRESH</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white border border-stroke rounded-lg px-[18px] py-4 relative overflow-hidden">
          <p className="font-display text-[28px] text-text leading-none mb-1.5">{overview.totalCourses}</p>
          <p className="text-[12px] text-text-3 font-medium">Courses</p>
          <p className="font-mono text-[11px] text-success mt-2">
            <BookOpen className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Owned by you
          </p>
        </div>
        <div className="bg-white border border-stroke rounded-lg px-[18px] py-4 relative overflow-hidden">
          <p className="font-display text-[28px] text-text leading-none mb-1.5">{overview.totalLearners}</p>
          <p className="text-[12px] text-text-3 font-medium">Total learners</p>
          <p className="font-mono text-[11px] text-success mt-2">
            <Users className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            {overview.activeLearners} active
          </p>
        </div>
        <div className="bg-white border border-stroke rounded-lg px-[18px] py-4 relative overflow-hidden">
          <p className="font-display text-[28px] text-text leading-none mb-1.5">{overview.lessonCompletions}</p>
          <p className="text-[12px] text-text-3 font-medium">Lessons completed</p>
          <p className="font-mono text-[11px] text-success mt-2">
            <Layout className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Across all courses
          </p>
        </div>
        <div className="bg-white border border-stroke rounded-lg px-[18px] py-4 relative overflow-hidden">
          <p className="font-display text-[28px] text-text leading-none mb-1.5">{overview.certificatesIssued}</p>
          <p className="text-[12px] text-text-3 font-medium">Certificates issued</p>
          <p className="font-mono text-[11px] text-success mt-2">
            <Award className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Graduated learners
          </p>
        </div>
        <div className="bg-white border border-stroke rounded-lg px-[18px] py-4 relative overflow-hidden">
          <p className="font-display text-[28px] text-text leading-none mb-1.5">
            {overview.averageAssessmentScore === null ? '—' : `${overview.averageAssessmentScore}%`}
          </p>
          <p className="text-[12px] text-text-3 font-medium">Avg. quiz score</p>
          <p className="font-mono text-[11px] text-success mt-2">
            <Sparkles className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            {overview.assessmentAttempts} attempts
          </p>
        </div>
        <div className="bg-white border border-stroke rounded-lg px-[18px] py-4 relative overflow-hidden">
          <p className="font-display text-[28px] text-text leading-none mb-1.5">{overview.assessmentPassRate}%</p>
          <p className="text-[12px] text-text-3 font-medium">Quiz pass rate</p>
          <p className="font-mono text-[11px] text-success mt-2">
            <Activity className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Score &gt;= 70%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white border border-stroke p-5 rounded-lg">
          <h4 className="text-sm font-display font-bold text-text mb-1 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-steel" />
            <span>My courses</span>
          </h4>
          <p className="text-xs text-text-3 mb-5 font-medium">
            Enrollment, completion, and certificate counts per course.
          </p>

          {instructorCourses.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-stroke rounded-lg bg-white/60">
              <p className="text-sm text-text-3">No courses to show yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="instructor-courses-table">
                <thead>
                  <tr className="border-b border-stroke text-[11px] uppercase tracking-[0.07em] text-text-3 font-semibold">
                    <th className="py-2 pr-3">Course</th>
                    <th className="py-2 pr-3">Lessons</th>
                    <th className="py-2 pr-3">Learners</th>
                    <th className="py-2 pr-3">Completed</th>
                    <th className="py-2 pr-3">Certificates</th>
                    <th className="py-2 pr-3">Avg score</th>
                    <th className="py-2">Pass rate</th>
                  </tr>
                </thead>
                <tbody>
                  {instructorCourses.map((course) => (
                    <tr key={course.id} className="border-b border-stroke/70 last:border-0 hover:bg-canvas/60">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-[13px]"
                            style={{
                              background:
                                course.thumbnail && course.thumbnail.startsWith('#') ? course.thumbnail : '#33455f',
                            }}
                          >
                            <GraduationCap className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] text-text font-semibold truncate">{course.title}</div>
                            <div className="text-[11px] text-text-3">ID #{course.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-[13px] text-text-2 font-mono">{course.lessonsCount}</td>
                      <td className="py-3 pr-3 text-[13px] text-text-2 font-mono">{course.enrollmentsCount}</td>
                      <td className="py-3 pr-3 text-[13px] text-text-2 font-mono">{course.completionsCount}</td>
                      <td className="py-3 pr-3 text-[13px] text-text-2 font-mono">{course.certificatesIssued}</td>
                      <td className="py-3 pr-3 text-[13px] text-text-2 font-mono">
                        {course.averageScore === null ? '—' : `${course.averageScore}%`}
                      </td>
                      <td className="py-3 text-[13px] text-text-2 font-mono">{course.passRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-stroke p-5 rounded-lg">
          <h4 className="text-sm font-display font-bold text-text mb-1 flex items-center gap-2">
            <Activity className="w-4 h-4 text-steel" />
            <span>Recent activity</span>
          </h4>
          <p className="text-xs text-text-3 mb-5 font-medium">Latest lesson completions and quiz attempts.</p>

          {(overview.recentActivity || []).length === 0 ? (
            <div className="text-center py-12 border border-dashed border-stroke rounded-lg bg-white/60">
              <p className="text-sm text-text-3">No learner activity yet.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {overview.recentActivity.map((act, index) => {
                const isQuiz = act.type === 'quiz';
                return (
                  <div
                    key={`${act.type}-${index}`}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-canvas/50 border border-stroke/60"
                  >
                    <div
                      className={`w-8 h-8 rounded-md shrink-0 flex items-center justify-center ${
                        isQuiz ? 'bg-steel/10 text-steel' : 'bg-success/10 text-success'
                      }`}
                    >
                      {isQuiz ? <Sparkles className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-text font-medium leading-snug">
                        {act.studentName}{' '}
                        <span className="text-text-3 font-normal">
                          {isQuiz ? 'scored' : 'completed'}{' '}
                          <span className="font-semibold text-text">
                            {isQuiz ? `${act.score}% on ${act.quizTitle || 'a quiz'}` : act.lessonTitle || 'a lesson'}
                          </span>
                        </span>
                      </div>
                      <div className="text-[11px] text-text-3 mt-0.5 font-mono">
                        {formatActivityTime(isQuiz ? act.attemptedAt : act.completedAt)}
                        {isQuiz && ` · ${act.passed ? 'passed' : 'attempt'}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-error font-medium">{error}</p>}
    </motion.div>
  );
};

export default InstructorDashboard;
