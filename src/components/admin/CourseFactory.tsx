// src/components/admin/CourseFactory.tsx
import React, { useState } from 'react';
import { Course } from '../../types.ts';
import { getCourseImage } from '../../lib/utils.ts';
import { apiFetch } from '../../lib/api.ts';
import { BookOpen, Plus, Trash2, Edit3, ArrowLeft, FileText, Settings } from 'lucide-react';
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

export const CourseFactory: React.FC<CourseFactoryProps> = ({
  token,
  courses,
  selectedCourse,
  setSelectedCourse,
  onRefreshCourses,
  loadCourseFullDetails,
  courseSubTab,
  setCourseSubTab,
}) => {
  const [showAddCourse, setShowAddCourse] = useState<boolean>(false);
  const [editingCourse, setEditingCourse] = useState<boolean>(false);
  const [courseForm, setCourseForm] = useState({ title: '', description: '', thumbnail: 'teal' });

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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-slate-150 p-6 rounded-3xl shadow-sm">
          <div>
            <h3 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-pink-600" />
              <span>Course factory</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Establish, configure, and manage active quantitative lecture chambers.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingCourse(false);
              setCourseForm({ title: '', description: '', thumbnail: 'teal' });
              setShowAddCourse(true);
            }}
            className="h-11 bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs px-5 rounded-xl border border-pink-700/25 flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap self-stretch sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>CREATE NEW COURSE</span>
          </button>
        </div>

        <AnimatePresence>
          {showAddCourse && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm font-sans"
            >
              <h4 className="font-bold text-slate-900 text-sm mb-4 border-b border-slate-100 pb-2">
                {editingCourse ? '✏️ Modify Course Container' : '✨ Formulate New Course'}
              </h4>
              <form onSubmit={handleSaveCourse} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">
                    Course Title:
                  </label>
                  <input
                    type="text"
                    required
                    value={courseForm.title}
                    onChange={(e) => setCourseForm((c) => ({ ...c, title: e.target.value }))}
                    className="w-full p-3 border border-slate-155 rounded-xl text-xs bg-slate-50/55 outline-none focus:bg-white focus:ring-2 focus:ring-pink-500/15 focus:border-pink-500 transition-all font-semibold text-slate-850"
                    placeholder="e.g. Statistical Inference & Regression"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">
                    Short Description / Summary:
                  </label>
                  <textarea
                    required
                    value={courseForm.description}
                    onChange={(e) => setCourseForm((c) => ({ ...c, description: e.target.value }))}
                    className="w-full p-3 border border-slate-155 rounded-xl text-xs bg-slate-50/55 h-24 outline-none focus:bg-white focus:ring-2 focus:ring-pink-500/15 focus:border-pink-500 transition-all text-slate-750 leading-relaxed"
                    placeholder="Explain the quantitative metrics students will learn in simple terms..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-grow h-11 bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-xs rounded-xl transition-all shadow-sm active:scale-95 border border-emerald-700/20 cursor-pointer"
                  >
                    SAVE COURSE
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddCourse(false)}
                    className="w-28 h-11 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl border border-slate-200 transition-all active:scale-95 cursor-pointer"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {courses.length === 0 ? (
          <div className="bg-white border border-slate-150 rounded-[2rem] p-12 text-center shadow-sm">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h4 className="text-sm font-bold text-slate-700">No active classrooms yet</h4>
            <p className="text-slate-500 max-w-xs mx-auto mt-2 text-xs leading-relaxed font-sans">
              Start by clicking the "CREATE NEW COURSE" button above to establish your first quantitative learning
              materials.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => {
              const unitsCount = course.lessons?.length || 0;
              return (
                <motion.div
                  key={course.id}
                  whileHover={{ y: -4 }}
                  className="bg-white border border-slate-150 rounded-[2rem] overflow-hidden shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="relative h-40 bg-slate-100 overflow-hidden">
                      <img
                        src={getCourseImage(course)}
                        alt={course.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-3 left-3 bg-pink-600 text-white text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono">
                        ID #{course.id}
                      </div>
                    </div>
                    <div className="p-5 space-y-2">
                      <h4 className="font-bold text-slate-900 text-base leading-snug line-clamp-1">{course.title}</h4>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{course.description}</p>
                      <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-[10px] font-bold text-slate-500 font-mono flex items-center justify-between mt-2">
                        <span>SYLLABUS UNITS:</span>
                        <span className="text-pink-600 font-bold">{unitsCount} units</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 pt-0 space-y-2 border-t border-slate-50 mt-2">
                    <button
                      onClick={() => setSelectedCourse(course)}
                      className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Manage Curriculum & Exam</span>
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingCourse(true);
                          setCourseForm({
                            title: course.title,
                            description: course.description,
                            thumbnail: course.thumbnail || 'teal',
                          });
                          setSelectedCourse(course);
                          setShowAddCourse(true);
                        }}
                        className="flex-1 h-9 bg-slate-50 hover:bg-slate-100 text-slate-705 text-[10px] font-bold rounded-lg border border-slate-200 flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3 text-slate-500" />
                        <span>Edit details</span>
                      </button>
                      <button
                        onClick={() => handleDeleteCourse(course.id)}
                        className="w-20 h-9 bg-red-50 hover:bg-red-100 text-red-650 text-[10px] font-bold rounded-lg border border-red-150 flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-slate-150 p-6 rounded-3xl shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setSelectedCourse(null);
              setShowAddCourse(false);
            }}
            className="h-11 bg-white hover:bg-slate-50 text-slate-750 font-bold rounded-xl border border-slate-200 px-4 flex items-center justify-center gap-2 active:scale-95 transition-all text-xs shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>BACK TO COURSES</span>
          </button>
          <div>
            <span className="bg-pink-100 text-pink-800 text-[9px] uppercase font-bold px-2.5 py-0.5 rounded-full font-mono tracking-wider">
              CURRICULUM BUILDER
            </span>
            <h3 className="text-base font-black text-slate-900 leading-tight mt-1">{selectedCourse.title}</h3>
          </div>
        </div>
        <div className="text-[10px] font-bold text-slate-500 font-mono">
          ID #{selectedCourse.id} • {selectedCourse.lessons?.length || 0} units
        </div>
      </div>

      <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 max-w-md" id="course-admin-tabs">
        <button
          type="button"
          onClick={() => setCourseSubTab('lessons')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${courseSubTab === 'lessons' ? 'bg-pink-600 text-white shadow-sm font-black' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Lessons</span>
        </button>
        <button
          type="button"
          onClick={() => setCourseSubTab('exam')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${courseSubTab === 'exam' ? 'bg-pink-600 text-white shadow-sm font-black' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Exam & Quiz</span>
        </button>
        <button
          type="button"
          onClick={() => setCourseSubTab('settings')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${courseSubTab === 'settings' ? 'bg-pink-600 text-white shadow-sm font-black' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </div>

      {courseSubTab === 'settings' && (
        <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-pink-500"></div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
            <div>
              <span className="inline-block bg-pink-50 text-pink-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-pink-100 font-mono tracking-wider uppercase mb-1">
                Course Administration
              </span>
              <h3 className="text-xl font-bold text-slate-900 font-sans tracking-tight">{selectedCourse.title}</h3>
              <p className="text-slate-500 text-xs leading-relaxed mt-1">{selectedCourse.description}</p>
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
                className="flex-1 sm:flex-initial h-10 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 rounded-xl border border-indigo-700/25 flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>EDIT</span>
              </button>
              <button
                onClick={() => handleDeleteCourse(selectedCourse.id)}
                className="flex-1 sm:flex-initial h-10 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs px-4 rounded-xl border border-red-200 flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>DELETE</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
