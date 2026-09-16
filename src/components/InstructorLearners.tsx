// src/components/InstructorLearners.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { RefreshCw, GraduationCap, Search, Award, Users, MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface InstructorLearnersProps {
  token: string | null;
  onStartConversation?: (courseId: number, learnerId: number, learnerName?: string | null) => void;
}

interface LearnerRow {
  id: number;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  joinedAt: string;
  enrolledCourses: { id: number; title: string }[];
  lessonsCompleted: number;
  lessonsTotal: number;
  quizzesPassed: number;
  bestScore: number | null;
  courseCompletionsCount: number;
  certificatesCount: number;
  lastActive: string | null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const InstructorLearners: React.FC<InstructorLearnersProps> = ({ token, onStartConversation }) => {
  const [learners, setLearners] = useState<LearnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const res = await apiFetch<{ learners: LearnerRow[]; error?: string }>('/api/instructor/learners');
      if (res.ok && res.data) {
        setLearners(res.data.learners);
      } else {
        setError(res.data?.error || 'Failed to load learners.');
      }
    } catch (err) {
      console.error('Failed to load instructor learners:', err);
      setError('Something went wrong while loading your learners.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = learners.filter(
    (learner) =>
      normalizedQuery === '' ||
      (learner.name || '').toLowerCase().includes(normalizedQuery) ||
      learner.email.toLowerCase().includes(normalizedQuery) ||
      learner.enrolledCourses.some((c) => c.title.toLowerCase().includes(normalizedQuery)),
  );

  if (loading && learners.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-text-2 h-[30vh]">
        <RefreshCw className="w-10 h-10 animate-spin text-steel mb-4" />
        <p className="font-bold font-sans">Loading your learners...</p>
      </div>
    );
  }

  if (error && learners.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-text-2 h-[30vh]">
        <p className="font-bold font-sans text-error">{error}</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 font-sans"
      id="instructor-learners"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stroke pb-5">
        <div>
          <h3 className="text-lg font-display font-bold text-text tracking-tight flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-steel" />
            <span>Learners</span>
          </h3>
          <p className="text-xs text-text-3 mt-1 font-medium">
            Learners enrolled in your courses, with progress and assessment summaries.
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-text-3 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search learners or courses…"
            aria-label="Search learners"
            className="w-full sm:w-64 h-10 pl-9 pr-3 rounded-lg border border-stroke bg-white text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-steel/30"
          />
        </div>
      </div>

      {learners.length === 0 ? (
        <div className="bg-white border border-stroke rounded-xl p-10 text-center">
          <Users className="w-10 h-10 text-steel mx-auto mb-3" />
          <h4 className="text-base font-display font-bold text-text">No learners yet</h4>
          <p className="text-sm text-text-3 mt-1 max-w-md mx-auto">
            Learners must be enrolled in one of your courses to appear here. Enrollments are created by administrators
            on your behalf.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-stroke rounded-xl p-10 text-center">
          <p className="text-sm text-text-3">
            No learners match <span className="font-semibold text-text">&ldquo;{query}&rdquo;</span>.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-stroke rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse" id="instructor-learners-table">
            <thead>
              <tr className="border-b border-stroke text-[11px] uppercase tracking-[0.07em] text-text-3 font-semibold">
                <th className="py-2.5 px-4">Learner</th>
                <th className="py-2.5 px-4">Courses</th>
                <th className="py-2.5 px-4">Lesson progress</th>
                <th className="py-2.5 px-4">Quizzes passed</th>
                <th className="py-2.5 px-4">Best score</th>
                <th className="py-2.5 px-4">Courses completed</th>
                <th className="py-2.5 px-4">Certificates</th>
                <th className="py-2.5 px-4">Last active</th>
                {onStartConversation && <th className="py-2.5 px-4">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((learner) => {
                const progressPct =
                  learner.lessonsTotal > 0 ? Math.round((learner.lessonsCompleted / learner.lessonsTotal) * 100) : 0;
                return (
                  <tr key={learner.id} className="border-b border-stroke/70 last:border-0 hover:bg-canvas/60">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-steel-lt text-steel flex items-center justify-center font-bold text-[13px] shrink-0 border border-steel/20">
                          {learner.avatarUrl ? (
                            <img
                              src={learner.avatarUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            (learner.name || learner.email).slice(0, 1).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] text-text font-semibold truncate">
                            {learner.name || learner.email}
                          </div>
                          <div className="text-[11px] text-text-3 truncate">{learner.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="text-[13px] text-text-2 font-mono"
                        title={learner.enrolledCourses.map((c) => c.title).join(', ') || 'None'}
                      >
                        {learner.enrolledCourses.length}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <div className="h-2 flex-1 bg-[#eef1f6] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-steel rounded-full"
                            style={{ width: `${Math.max(0, progressPct)}%` }}
                          ></div>
                        </div>
                        <span className="text-[11px] text-text-3 font-mono whitespace-nowrap">
                          {learner.lessonsCompleted}/{learner.lessonsTotal}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[13px] text-text-2 font-mono">{learner.quizzesPassed}</td>
                    <td className="py-3 px-4 text-[13px] text-text-2 font-mono">
                      {learner.bestScore === null ? '—' : `${learner.bestScore}%`}
                    </td>
                    <td className="py-3 px-4 text-[13px] text-text-2 font-mono">{learner.courseCompletionsCount}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[12px] text-amber-700 font-semibold">
                        <Award className="w-3.5 h-3.5" />
                        {learner.certificatesCount}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[12px] text-text-3 font-mono whitespace-nowrap">
                      {formatDate(learner.lastActive)}
                    </td>
                    {onStartConversation && (
                      <td className="py-3 px-4">
                        {learner.enrolledCourses.length === 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              onStartConversation(
                                learner.enrolledCourses[0].id,
                                learner.id,
                                learner.name ?? learner.email,
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-steel text-white text-[12px] font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Message
                          </button>
                        ) : learner.enrolledCourses.length > 1 ? (
                          <select
                            aria-label={`Message ${learner.name ?? learner.email}`}
                            defaultValue=""
                            onChange={(e) => {
                              const courseId = e.target.value ? Number(e.target.value) : 0;
                              if (courseId) onStartConversation(courseId, learner.id, learner.name ?? learner.email);
                            }}
                            className="h-8 rounded-lg border border-stroke bg-white px-2 text-[12px] text-text font-medium focus:outline-none focus:ring-2 focus:ring-steel/30 cursor-pointer"
                          >
                            <option value="">Message…</option>
                            {learner.enrolledCourses.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.title}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[11px] text-text-3 font-mono">No course</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="text-xs text-error font-medium">{error}</p>}
    </motion.div>
  );
};

export default InstructorLearners;
