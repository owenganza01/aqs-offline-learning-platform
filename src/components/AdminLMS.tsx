// src/components/AdminLMS.tsx
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Course, Lesson } from '../types.ts';
import { apiFetch } from '../lib/api.ts';
import {
  Plus,
  ChartLine,
  SquareUser,
  Users,
  RefreshCw,
  ArrowLeft,
  BookOpen,
  ArrowUp,
  ArrowDown,
  Edit3,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

const CourseFactory = lazy(() => import('./admin/CourseFactory.tsx').then((m) => ({ default: m.CourseFactory })));
const LessonManager = lazy(() => import('./admin/LessonManager.tsx').then((m) => ({ default: m.LessonManager })));
const QuizBuilder = lazy(() => import('./admin/QuizBuilder.tsx').then((m) => ({ default: m.QuizBuilder })));
const AnalyticsDashboard = lazy(() =>
  import('./admin/AnalyticsDashboard.tsx').then((m) => ({ default: m.AnalyticsDashboard })),
);
const UserManagement = lazy(() => import('./admin/UserManagement.tsx').then((m) => ({ default: m.UserManagement })));
const CohortManager = lazy(() => import('./admin/CohortManager.tsx').then((m) => ({ default: m.CohortManager })));

interface AdminLMSProps {
  token: string | null;
  courses: Course[];
  onRefreshCourses: () => void;
  currentUserId?: number;
  userRole?: string;
}

export const AdminLMS: React.FC<AdminLMSProps> = ({ token, courses, onRefreshCourses, currentUserId, userRole }) => {
  const [activeTab, setActiveTab] = useState<'courses' | 'analytics' | 'cohorts' | 'users'>('courses');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [courseSubTab, setCourseSubTab] = useState('lessons');
  const [lessonEditor, setLessonEditor] = useState<{ open: boolean; lesson: Lesson | null }>({
    open: false,
    lesson: null,
  });
  const [quizForm, setQuizForm] = useState<{
    title: string;
    questions: { questionText: string; options: string[]; correctOptionIndex: number }[];
  }>({ title: '', questions: [] });

  const loadCourseFullDetails = async (courseId: number) => {
    if (!token) return;
    try {
      const { ok, data } = await apiFetch(`/api/courses/${courseId}`);
      if (ok) {
        const quizObj = data.quiz || { title: `${data.course.title} Exam`, questions: [] };
        setQuizForm({ title: quizObj.title, questions: quizObj.questions || [] });
        setSelectedCourse({ ...data.course, lessons: data.lessons, quiz: quizObj });
      }
    } catch (err) {
      console.error('Error fetching course details:', err);
    }
  };

  const hasLessonContent = (lesson: Lesson) =>
    Boolean((lesson.content && lesson.content.trim()) || lesson.videoUrl || lesson.slidesUrl);

  const lessonMeta = (lesson: Lesson) =>
    lesson.videoUrl ? 'Video lesson' : lesson.content && lesson.content.trim() ? 'Reading' : 'No content yet';

  const openLessonEditor = (lesson: Lesson) => setLessonEditor({ open: true, lesson });
  const openAddLesson = () => setLessonEditor({ open: true, lesson: null });
  const closeLessonEditor = () => setLessonEditor({ open: false, lesson: null });

  const changeSubTab = (tab: 'lessons' | 'exam' | 'settings') => {
    setCourseSubTab(tab);
    closeLessonEditor();
  };

  const handleDeleteLesson = async (lessonId: number) => {
    if (!token || !selectedCourse) return;
    if (!confirm('Are you sure you want to delete this syllabus lesson?')) return;

    try {
      const { ok } = await apiFetch(`/api/admin/courses/${selectedCourse.id}/lessons/${lessonId}`, {
        method: 'DELETE',
      });
      if (ok) {
        await loadCourseFullDetails(selectedCourse.id);
        onRefreshCourses();
      }
    } catch (e) {
      console.error('Failed to delete lesson:', e);
    }
  };

  const handleMoveLesson = async (index: number, direction: 'up' | 'down') => {
    if (!selectedCourse || !token) return;
    const currentLessons = selectedCourse.lessons ? [...selectedCourse.lessons] : [];
    if (currentLessons.length === 0) return;

    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentLessons.length) return;

    const firstLesson = currentLessons[index];
    const secondLesson = currentLessons[targetIdx];
    const originalFirstOrder = firstLesson.sortOrder;
    firstLesson.sortOrder = secondLesson.sortOrder;
    secondLesson.sortOrder = originalFirstOrder;
    currentLessons[index] = secondLesson;
    currentLessons[targetIdx] = firstLesson;

    try {
      const { ok } = await apiFetch(`/api/admin/courses/${selectedCourse.id}/lessons/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: currentLessons.map((l) => l.id) }),
      });

      if (ok) {
        await loadCourseFullDetails(selectedCourse.id);
        onRefreshCourses();
      }
    } catch (e) {
      console.error('Failed to reorder lessons:', e);
    }
  };

  useEffect(() => {
    if (selectedCourse) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadCourseFullDetails(selectedCourse.id);

      setCourseSubTab('lessons');
      setLessonEditor({ open: false, lesson: null });
    }
    // Intentionally depend only on the course ID, not the entire object.
    // The selectedCourse reference is replaced after loading full details;
    // depending on the whole object would reset the active tab and trigger
    // redundant data loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourse?.id]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6" id="admin-lms-container">
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-0">
        {/* Left Rail Navigation */}
        <div className="w-full lg:w-[200px] shrink-0" id="lms-sidebar">
          <div className="bg-slate text-white flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-y-auto scrollbar-none px-2.5 py-2 lg:py-3.5 lg:border-r lg:border-white/[0.06] lg:h-full lg:sticky lg:top-6">
            <p className="hidden lg:block text-[10px] uppercase tracking-[0.09em] text-white/25 px-2 pt-3 pb-[5px] select-none">
              Manage
            </p>
            <button
              onClick={() => {
                setActiveTab('courses');
                setSelectedCourse(null);
              }}
              className={`group flex items-center gap-[9px] px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer select-none shrink-0 ${activeTab === 'courses' ? 'bg-steel text-white' : 'text-navtext hover:bg-slate-3 hover:text-white'}`}
            >
              <BookOpen
                className={`w-[15px] h-[15px] shrink-0 ${activeTab === 'courses' ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}
              />
              <span>Courses</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('analytics');
                setSelectedCourse(null);
              }}
              className={`group flex items-center gap-[9px] px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer select-none shrink-0 ${activeTab === 'analytics' ? 'bg-steel text-white' : 'text-navtext hover:bg-slate-3 hover:text-white'}`}
            >
              <ChartLine
                className={`w-[15px] h-[15px] shrink-0 ${activeTab === 'analytics' ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}
              />
              <span>Analytics</span>
            </button>
            {(userRole === 'admin' || userRole === 'instructor') && (
              <button
                onClick={() => {
                  setActiveTab('cohorts');
                  setSelectedCourse(null);
                }}
                className={`group flex items-center gap-[9px] px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer select-none shrink-0 ${activeTab === 'cohorts' ? 'bg-steel text-white' : 'text-navtext hover:bg-slate-3 hover:text-white'}`}
              >
                <Users
                  className={`w-[15px] h-[15px] shrink-0 ${activeTab === 'cohorts' ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}
                />
                <span>Cohorts</span>
              </button>
            )}
            <button
              onClick={() => {
                setActiveTab('users');
                setSelectedCourse(null);
              }}
              className={`group flex items-center gap-[9px] px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer select-none shrink-0 ${activeTab === 'users' ? 'bg-steel text-white' : 'text-navtext hover:bg-slate-3 hover:text-white'}`}
            >
              <SquareUser
                className={`w-[15px] h-[15px] shrink-0 ${activeTab === 'users' ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}
              />
              <span>Manage users</span>
            </button>

            <p className="hidden lg:block text-[10px] uppercase tracking-[0.09em] text-white/25 px-2 pt-3 pb-[5px] select-none">
              Create
            </p>
            <button
              onClick={() => {
                setActiveTab('courses');
                setSelectedCourse(null);
              }}
              className="group flex items-center gap-[9px] px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer select-none shrink-0 text-navtext hover:bg-slate-3 hover:text-white"
            >
              <Plus className="w-[15px] h-[15px] shrink-0 opacity-60 group-hover:opacity-100" />
              <span>New course</span>
            </button>
          </div>
        </div>

        {/* Right Content Panels */}
        <div className="flex-grow min-w-0" id="lms-main-content">
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-12 text-steel">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
              </div>
            }
          >
            {activeTab === 'courses' ? (
              !selectedCourse ? (
                <CourseFactory
                  token={token}
                  courses={courses}
                  selectedCourse={null}
                  setSelectedCourse={setSelectedCourse}
                  onRefreshCourses={onRefreshCourses}
                  loadCourseFullDetails={loadCourseFullDetails}
                  courseSubTab={courseSubTab}
                  setCourseSubTab={setCourseSubTab}
                />
              ) : (
                <>
                  {/* Two-Pane Course Builder */}
                  <div className="flex flex-col lg:flex-row items-start gap-0">
                    {/* LEFT — Outline Panel */}
                    <div
                      className="w-full lg:w-[240px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-stroke flex flex-col"
                      id="course-outline-panel"
                    >
                      <div className="px-4 py-3.5 border-b border-stroke">
                        <button
                          onClick={() => setSelectedCourse(null)}
                          className="flex items-center gap-[5px] text-[12px] text-text-3 hover:text-text transition-colors cursor-pointer select-none"
                        >
                          <ArrowLeft className="w-[13px] h-[13px]" />
                          <span>All courses</span>
                        </button>
                        <div className="font-display text-[14px] text-text leading-snug mt-[7px]">
                          {selectedCourse.title}
                        </div>
                        <div className="text-[11px] text-text-3 mt-[3px]">
                          ID #{selectedCourse.id} · {selectedCourse.lessons?.length || 0} units
                        </div>
                      </div>

                      <div className="flex border-b border-stroke" id="course-outline-tabs">
                        <button
                          type="button"
                          onClick={() => changeSubTab('lessons')}
                          className={`flex-1 text-center py-[9px] text-[12px] font-semibold cursor-pointer border-b-2 transition-colors select-none ${courseSubTab === 'lessons' ? 'text-steel border-steel' : 'text-text-3 border-transparent hover:text-text'}`}
                        >
                          Lessons
                        </button>
                        <button
                          type="button"
                          onClick={() => changeSubTab('exam')}
                          className={`flex-1 text-center py-[9px] text-[12px] font-semibold cursor-pointer border-b-2 transition-colors select-none ${courseSubTab === 'exam' ? 'text-steel border-steel' : 'text-text-3 border-transparent hover:text-text'}`}
                        >
                          Quiz
                        </button>
                        <button
                          type="button"
                          onClick={() => changeSubTab('settings')}
                          className={`flex-1 text-center py-[9px] text-[12px] font-semibold cursor-pointer border-b-2 transition-colors select-none ${courseSubTab === 'settings' ? 'text-steel border-steel' : 'text-text-3 border-transparent hover:text-text'}`}
                        >
                          Settings
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto scrollbar-none" id="course-outline-list">
                        {courseSubTab === 'lessons' && (
                          <>
                            <div className="flex items-center justify-between px-4 pt-3 pb-1">
                              <span className="text-[10px] uppercase tracking-[0.07em] text-text-3 font-semibold">
                                Unit 1
                              </span>
                              <span
                                onClick={openAddLesson}
                                className="text-steel text-[12px] font-semibold cursor-pointer select-none hover:text-text transition-colors"
                              >
                                + Add
                              </span>
                            </div>
                            {(selectedCourse.lessons || []).length === 0 && (
                              <div className="px-4 py-3 text-[11px] text-text-3 italic">No lessons yet.</div>
                            )}
                            {(selectedCourse.lessons || []).map((lesson, index) => {
                              const isActive = lessonEditor.open && lessonEditor.lesson?.id === lesson.id;
                              return (
                                <div
                                  key={lesson.id}
                                  onClick={() => openLessonEditor(lesson)}
                                  className={`flex items-center gap-[9px] px-4 py-[9px] cursor-pointer border-l-[3px] transition-colors ${isActive ? 'bg-steel-lt border-l-steel' : 'border-l-transparent hover:bg-canvas'}`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasLessonContent(lesson) ? 'bg-[#1d6b45]' : 'bg-[#dde2ea]'}`}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[12.5px] text-text font-medium truncate leading-snug">
                                      {lesson.title}
                                    </div>
                                    <div className="text-[11px] text-text-3">{lessonMeta(lesson)}</div>
                                  </div>
                                  <div className="flex items-center gap-[2px] shrink-0 font-mono">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveLesson(index, 'up');
                                      }}
                                      disabled={index === 0}
                                      title="Move up"
                                      className="w-6 h-6 bg-white border border-stroke hover:bg-canvas rounded-[5px] disabled:opacity-30 active:scale-95 cursor-pointer flex items-center justify-center"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5 text-text-2" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveLesson(index, 'down');
                                      }}
                                      disabled={index === (selectedCourse.lessons || []).length - 1}
                                      title="Move down"
                                      className="w-6 h-6 bg-white border border-stroke hover:bg-canvas rounded-[5px] disabled:opacity-30 active:scale-95 cursor-pointer flex items-center justify-center"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5 text-text-2" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openLessonEditor(lesson);
                                      }}
                                      title="Edit"
                                      className="w-6 h-6 bg-steel-lt border border-steel/30 hover:bg-steel/20 rounded-[5px] active:scale-95 cursor-pointer flex items-center justify-center ml-[2px]"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-steel" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteLesson(lesson.id);
                                      }}
                                      title="Delete"
                                      className="w-6 h-6 bg-error-bg border border-error/20 hover:bg-error/15 rounded-[5px] active:scale-95 cursor-pointer flex items-center justify-center"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-error" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            <div
                              onClick={openAddLesson}
                              className="mx-3 mt-2 mb-3 flex items-center justify-center gap-1.5 text-[12px] text-steel py-[7px] px-[10px] rounded-[5px] cursor-pointer border border-dashed border-stroke hover:bg-steel-lt transition-colors select-none"
                            >
                              <Plus className="w-[13px] h-[13px]" />
                              <span>Add lesson or quiz</span>
                            </div>
                          </>
                        )}

                        {courseSubTab === 'exam' && (
                          <>
                            <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-[0.07em] text-text-3 font-semibold">
                              Unit 1
                            </div>
                            <div className="flex items-center gap-[9px] px-4 py-[9px] bg-steel-lt border-l-[3px] border-l-steel">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-steel" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[12.5px] text-text font-medium truncate leading-snug">
                                  {selectedCourse.quiz?.title || `${selectedCourse.title} Exam`}
                                </div>
                                <div className="text-[11px] text-text-3">
                                  {selectedCourse.quiz?.questions?.length || 0} questions
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {courseSubTab === 'settings' && (
                          <div className="px-4 pt-3 pb-1 text-[11px] text-text-3 italic">Course settings.</div>
                        )}
                      </div>
                    </div>

                    {/* RIGHT — Editor Panel */}
                    <div className="flex-1 min-w-0" id="course-editor-panel">
                      <div className="p-6 md:p-7">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={`lms-course-${selectedCourse.id}-${courseSubTab}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            id="selected-lms-course-stage"
                          >
                            {courseSubTab === 'lessons' &&
                              (lessonEditor.open ? (
                                <LessonManager
                                  key={`${selectedCourse.id}-${lessonEditor.lesson?.id ?? 'new'}`}
                                  token={token}
                                  selectedCourse={selectedCourse}
                                  onRefreshCourses={onRefreshCourses}
                                  loadCourseFullDetails={loadCourseFullDetails}
                                  activeLesson={lessonEditor.lesson}
                                  addMode={!lessonEditor.lesson}
                                  onClose={closeLessonEditor}
                                />
                              ) : (
                                <div className="text-center py-16 border border-dashed border-stroke rounded-xl bg-white/60">
                                  <p className="text-sm text-text-3">
                                    Select a lesson from the outline, or add a new one.
                                  </p>
                                </div>
                              ))}
                            {courseSubTab === 'exam' && (
                              <QuizBuilder
                                token={token}
                                selectedCourse={selectedCourse}
                                onRefreshCourses={onRefreshCourses}
                                loadCourseFullDetails={loadCourseFullDetails}
                                initialQuizForm={quizForm}
                              />
                            )}
                            {courseSubTab === 'settings' && (
                              <CourseFactory
                                token={token}
                                courses={courses}
                                selectedCourse={selectedCourse}
                                setSelectedCourse={setSelectedCourse}
                                onRefreshCourses={onRefreshCourses}
                                loadCourseFullDetails={loadCourseFullDetails}
                                courseSubTab={courseSubTab}
                                setCourseSubTab={setCourseSubTab}
                              />
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </>
              )
            ) : activeTab === 'analytics' ? (
              <AnalyticsDashboard token={token} courses={courses} />
            ) : activeTab === 'cohorts' ? (
              <CohortManager token={token} />
            ) : activeTab === 'users' ? (
              <UserManagement token={token} currentUserId={currentUserId} />
            ) : null}
          </Suspense>
        </div>
      </div>
    </div>
  );
};
