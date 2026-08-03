// src/components/admin/CourseFactory.tsx
import React, { useState, useEffect } from 'react';
import { Course } from '../../types.ts';
import { apiFetch } from '../../lib/api.ts';
import { BookOpen, Plus, Trash2, Edit3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CourseFactoryProps {
  token: string | null;
  courses: Course[];
  selectedCourse: Course | null;
  setSelectedCourse: (course: Course | null) => void;
  onRefreshCourses: () => void;
  loadCourseFullDetails: (id: number) => Promise<void>;
  courseSubTab: string;
  setCourseSubTab: (tab: string) => void;
}

interface CourseStat {
  activeStudents?: number;
  averageScore?: number | null;
}

const LMS_SWATCH_TINTS: { bg: string; fg: string }[] = [
  { bg: '#E8EFF7', fg: '#3D5A80' },
  { bg: '#E8F4EC', fg: '#1D6B45' },
  { bg: '#F3ECDC', fg: '#7B4F0A' },
  { bg: '#EBE7F4', fg: '#5A4A7A' },
];

const courseInitials = (title: string): string =>
  title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const COL_GRID = '1fr 96px 96px 80px 112px 104px';

export const CourseFactory: React.FC<CourseFactoryProps> = ({
  token,
  courses,
  selectedCourse,
  setSelectedCourse,
  onRefreshCourses,
  loadCourseFullDetails,
  courseSubTab,
}) => {
  const [showAddCourse, setShowAddCourse] = useState<boolean>(false);
  const [editingCourse, setEditingCourse] = useState<boolean>(false);
  const [courseForm, setCourseForm] = useState({ title: '', description: '', thumbnail: 'teal' });
  const [courseStats, setCourseStats] = useState<Record<number, CourseStat>>({});

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    apiFetch<{ courseStats?: (CourseStat & { id: number })[] }>('/api/admin/analytics')
      .then(({ ok, data }) => {
        if (ok && data?.courseStats && !cancelled) {
          const map: Record<number, CourseStat> = {};
          data.courseStats.forEach((s) => {
            map[s.id] = { activeStudents: s.activeStudents, averageScore: s.averageScore };
          });
          setCourseStats(map);
        }
      })
      .catch(() => {
        // Non-critical — table falls back to dash placeholders.
      });
    return () => {
      cancelled = true;
    };
  }, [token, courses]);

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const payload = {
      title: courseForm.title,
      description: courseForm.description,
      thumbnail: courseForm.thumbnail,
    };

    try {
      const url = editingCourse && selectedCourse ? `/api/admin/courses/${selectedCourse.id}` : '/api/admin/courses';
      const method = editingCourse && selectedCourse ? 'PUT' : 'POST';

      const { ok, data } = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (ok) {
        onRefreshCourses();
        setShowAddCourse(false);
        setEditingCourse(false);
        setCourseForm({ title: '', description: '', thumbnail: 'teal' });

        if (method === 'PUT') {
          await loadCourseFullDetails(selectedCourse!.id);
        } else {
          setSelectedCourse(data);
        }
      }
    } catch (error) {
      console.error('Failed to save course:', error);
    }
  };

  const handleDeleteCourse = async (courseId: number) => {
    if (!token) return;
    if (
      !confirm(
        'Are you absolutely certain you want to delete this course, along with ALL its curriculum chapters, lessons, and exam quiz sheets? This action is irreversible.',
      )
    ) {
      return;
    }

    try {
      const { ok } = await apiFetch(`/api/admin/courses/${courseId}`, {
        method: 'DELETE',
      });
      if (ok) {
        setSelectedCourse(null);
        onRefreshCourses();
      }
    } catch (e) {
      console.error('Failed to delete course:', e);
    }
  };

  if (!selectedCourse) {
    return (
      <div className="space-y-6" id="course-factory-catalog-grid">
        {/* Page header */}
        <div>
          <h3 className="font-display text-[22px] text-text tracking-tight flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-steel" />
            <span>Your courses</span>
          </h3>
          <p className="text-[13px] text-text-2 mt-1">Manage and publish your course content.</p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <h4 className="text-sm font-semibold text-text">
            All courses <span className="font-normal text-text-3">{courses.length}</span>
          </h4>
          <button
            onClick={() => {
              setEditingCourse(false);
              setCourseForm({ title: '', description: '', thumbnail: 'teal' });
              setShowAddCourse(true);
            }}
            className="h-10 bg-steel hover:bg-[#2d4a70] text-white font-semibold text-[13px] px-4 rounded-lg border border-steel flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New course</span>
          </button>
        </div>

        <AnimatePresence>
          {showAddCourse && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white border border-stroke p-6 rounded-xl shadow-sm font-sans"
            >
              <h4 className="font-semibold text-text text-sm mb-4 border-b border-stroke pb-2">
                {editingCourse ? '✏️ Modify Course' : '✨ Create New Course'}
              </h4>
              <form onSubmit={handleSaveCourse} className="space-y-4">
                <div>
                  <label className="field-label block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                    Course Title:
                  </label>
                  <input
                    type="text"
                    required
                    value={courseForm.title}
                    onChange={(e) => setCourseForm((c) => ({ ...c, title: e.target.value }))}
                    className="w-full p-3 border-[1.5px] border-stroke rounded-lg text-sm text-text outline-none focus:border-steel focus:ring-2 focus:ring-steel/10 transition-all font-medium bg-white"
                    placeholder="e.g. Statistical Inference & Regression"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                    Short Description / Summary:
                  </label>
                  <textarea
                    required
                    value={courseForm.description}
                    onChange={(e) => setCourseForm((c) => ({ ...c, description: e.target.value }))}
                    className="w-full p-3 border-[1.5px] border-stroke rounded-lg text-sm text-text h-24 outline-none focus:border-steel focus:ring-2 focus:ring-steel/10 transition-all text-text-2 leading-relaxed"
                    placeholder="Explain the quantitative metrics students will learn in simple terms..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-grow h-11 bg-steel hover:bg-[#2d4a70] font-semibold text-white text-[13px] rounded-lg transition-all shadow-sm active:scale-95 border border-steel cursor-pointer"
                  >
                    SAVE COURSE
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddCourse(false)}
                    className="w-28 h-11 bg-white hover:bg-canvas text-text-2 font-semibold text-[13px] rounded-lg border border-stroke transition-all active:scale-95 cursor-pointer"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {courses.length === 0 ? (
          <div className="bg-white border border-stroke rounded-xl p-12 text-center shadow-sm">
            <BookOpen className="w-12 h-12 text-text-3 mx-auto mb-4" />
            <h4 className="text-sm font-semibold text-text">No active classrooms yet</h4>
            <p className="text-text-3 max-w-xs mx-auto mt-2 text-xs leading-relaxed font-sans">
              Start by clicking the "New course" button above to establish your first quantitative learning materials.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-stroke rounded-xl overflow-hidden shadow-sm">
            <div
              className="grid border-b border-stroke px-4 py-2.5 text-[11px] uppercase tracking-wider text-text-3 font-semibold"
              style={{ gridTemplateColumns: COL_GRID }}
            >
              <span>Course</span>
              <span>Enrolled</span>
              <span>Avg. score</span>
              <span>Lessons</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>

            {courses.map((course, idx) => {
              const unitsCount = course.lessons?.length || 0;
              const isPublished = unitsCount > 0;
              const stat = courseStats[course.id];
              const enrolled = stat?.activeStudents ?? null;
              const avgScore = stat?.averageScore ?? null;
              const tint = LMS_SWATCH_TINTS[idx % LMS_SWATCH_TINTS.length];
              return (
                <div
                  key={course.id}
                  onClick={() => setSelectedCourse(course)}
                  className="grid px-4 py-3.5 border-b border-stroke items-center cursor-pointer hover:bg-canvas transition-colors last:border-b-0"
                  style={{ gridTemplateColumns: COL_GRID }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-[34px] h-[34px] rounded-md flex items-center justify-center font-mono text-[11px] font-medium flex-shrink-0"
                      style={{ background: tint.bg, color: tint.fg }}
                    >
                      {courseInitials(course.title)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-text truncate">{course.title}</div>
                      <div className="text-[11px] text-text-3">ID #{course.id}</div>
                    </div>
                  </div>
                  <div className="text-[12px] font-mono text-text-2">{enrolled === null ? '—' : enrolled}</div>
                  <div className="text-[12px] font-mono text-text-2">
                    {avgScore === null || avgScore === undefined ? '—' : `${avgScore}%`}
                  </div>
                  <div className="text-[12px] font-mono text-text-2">{unitsCount}</div>
                  <div>
                    {isPublished ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded bg-[#E8F4EC] text-success">
                        ● Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded bg-[#F0F2F5] text-text-3">
                        ○ Draft
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCourse(true);
                        setCourseForm({
                          title: course.title,
                          description: course.description,
                          thumbnail: course.thumbnail || 'teal',
                        });
                        setSelectedCourse(course);
                        setShowAddCourse(true);
                      }}
                      title="Edit details"
                      className="w-7 h-7 border border-stroke rounded-md flex items-center justify-center text-text-2 hover:bg-canvas active:scale-95 transition-all cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCourse(course.id);
                      }}
                      title="Delete"
                      className="w-7 h-7 border border-stroke rounded-md flex items-center justify-center text-text-2 hover:bg-error-bg hover:text-error active:scale-95 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Course selected — show settings sub-tab
  return (
    <div className="w-full space-y-6">
      {courseSubTab === 'settings' && (
        <div className="bg-white border border-stroke p-6 rounded-xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-steel"></div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
            <div>
              <span className="inline-block bg-steel-lt text-steel text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-steel/20 font-mono tracking-wider uppercase mb-1">
                Course Administration
              </span>
              <h3 className="text-xl font-display font-bold text-text tracking-tight">{selectedCourse.title}</h3>
              <p className="text-text-3 text-xs leading-relaxed mt-1">{selectedCourse.description}</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto self-stretch shrink-0 font-sans">
              <button
                onClick={() => {
                  setEditingCourse(true);
                  setCourseForm({
                    title: selectedCourse.title,
                    description: selectedCourse.description,
                    thumbnail: selectedCourse.thumbnail || 'teal',
                  });
                  setShowAddCourse(true);
                }}
                className="flex-1 sm:flex-initial h-10 bg-steel hover:bg-[#2d4a70] text-white font-semibold text-xs px-4 rounded-lg border border-steel flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>EDIT</span>
              </button>
              <button
                onClick={() => handleDeleteCourse(selectedCourse.id)}
                className="flex-1 sm:flex-initial h-10 bg-white hover:bg-error-bg text-error font-semibold text-xs px-4 rounded-lg border border-stroke flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>DELETE</span>
              </button>
            </div>
          </div>

          {showAddCourse && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-stroke pt-4"
              >
                <h4 className="font-semibold text-text text-sm mb-4">✏️ Modify Course</h4>
                <form onSubmit={handleSaveCourse} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                      Course Title:
                    </label>
                    <input
                      type="text"
                      required
                      value={courseForm.title}
                      onChange={(e) => setCourseForm((c) => ({ ...c, title: e.target.value }))}
                      className="w-full p-3 border-[1.5px] border-stroke rounded-lg text-sm text-text outline-none focus:border-steel focus:ring-2 focus:ring-steel/10 transition-all font-medium bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                      Short Description / Summary:
                    </label>
                    <textarea
                      required
                      value={courseForm.description}
                      onChange={(e) => setCourseForm((c) => ({ ...c, description: e.target.value }))}
                      className="w-full p-3 border-[1.5px] border-stroke rounded-lg text-sm text-text-2 h-24 outline-none focus:border-steel focus:ring-2 focus:ring-steel/10 transition-all leading-relaxed"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-grow h-11 bg-steel hover:bg-[#2d4a70] font-semibold text-white text-[13px] rounded-lg transition-all shadow-sm active:scale-95 border border-steel cursor-pointer"
                    >
                      SAVE CHANGES
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddCourse(false)}
                      className="w-28 h-11 bg-white hover:bg-canvas text-text-2 font-semibold text-[13px] rounded-lg border border-stroke transition-all active:scale-95 cursor-pointer"
                    >
                      CANCEL
                    </button>
                  </div>
                </form>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  );
};
