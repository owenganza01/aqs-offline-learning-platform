// src/components/AdminLMS.tsx
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Course } from '../types.ts';
import { apiFetch } from '../lib/api.ts';
import { Layout, Activity, Users, GraduationCap, RefreshCw, ArrowLeft, BookOpen, Award, Settings } from 'lucide-react';
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

  useEffect(() => {
    if (selectedCourse) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadCourseFullDetails(selectedCourse.id);

      setCourseSubTab('lessons');
    }
    // Intentionally depend only on the course ID, not the entire object.
    // The selectedCourse reference is replaced after loading full details;
    // depending on the whole object would reset the active tab and trigger
    // redundant data loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourse?.id]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6" id="admin-lms-container">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Sidebar Navigation */}
        <div className="w-full lg:w-64 shrink-0" id="lms-sidebar">
          <div className="bg-slate text-white rounded-3xl p-6 shadow-md border border-slate-2 space-y-6 lg:sticky lg:top-6">
            <div className="space-y-1.5 pb-4 border-b border-slate-3">
              <span className="bg-steel/25 text-steel-lt text-[10px] font-bold px-2.5 py-1 rounded-full border border-steel/30 uppercase tracking-widest font-mono">
                Control Center
              </span>
              <h3 className="text-base font-black tracking-tight text-white mt-2">Admin Portal</h3>
              <p className="text-steel-lt/60 text-[11px] leading-relaxed">QuantSyllabus Admin Workspace & Analytics</p>
            </div>

            <div className="space-y-1 flex flex-row lg:flex-col gap-2 lg:gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scrollbar-none">
              <button
                onClick={() => {
                  setActiveTab('courses');
                  setSelectedCourse(null);
                }}
                className={`flex-1 lg:flex-initial h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center lg:justify-start gap-3 cursor-pointer shrink-0 ${activeTab === 'courses' ? 'bg-steel text-white shadow-md font-black scale-100' : 'text-steel-lt/60 hover:text-white hover:bg-slate-3/60'}`}
              >
                <Layout className="w-4 h-4 text-steel-lt/80" />
                <span>Course factory</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('analytics');
                  setSelectedCourse(null);
                }}
                className={`flex-1 lg:flex-initial h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center lg:justify-start gap-3 cursor-pointer shrink-0 ${activeTab === 'analytics' ? 'bg-steel text-white shadow-md font-black scale-100' : 'text-steel-lt/60 hover:text-white hover:bg-slate-3/60'}`}
              >
                <Activity className="w-4 h-4 text-steel-lt/80" />
                <span>Analytics</span>
              </button>
              {(userRole === 'admin' || userRole === 'instructor') && (
                <button
                  onClick={() => {
                    setActiveTab('cohorts');
                    setSelectedCourse(null);
                  }}
                  className={`flex-1 lg:flex-initial h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center lg:justify-start gap-3 cursor-pointer shrink-0 ${activeTab === 'cohorts' ? 'bg-steel text-white shadow-md font-black scale-100' : 'text-steel-lt/60 hover:text-white hover:bg-slate-3/60'}`}
                >
                  <GraduationCap className="w-4 h-4 text-steel-lt/80" />
                  <span>My Cohorts</span>
                </button>
              )}
              <button
                onClick={() => {
                  setActiveTab('users');
                  setSelectedCourse(null);
                }}
                className={`flex-1 lg:flex-initial h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center lg:justify-start gap-3 cursor-pointer shrink-0 ${activeTab === 'users' ? 'bg-steel text-white shadow-md font-black scale-100' : 'text-steel-lt/60 hover:text-white hover:bg-slate-3/60'}`}
              >
                <Users className="w-4 h-4 text-steel-lt/80" />
                <span>Manage Users</span>
              </button>
            </div>

            <div className="hidden lg:block bg-slate-3/40 rounded-2xl p-4 border border-slate-3 text-[11px] text-steel-lt/70 leading-relaxed space-y-1.5 font-sans">
              <p className="font-bold text-steel-lt">Target Student Base:</p>
              <p>
                Aimed at students with low digital literacy. Keep syllabus topics, descriptions, and exam questions
                human-centric, short, and very direct.
              </p>
            </div>
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
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-stroke p-6 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setSelectedCourse(null)}
                        className="h-11 bg-white hover:bg-canvas text-steel font-bold rounded-xl border border-stroke px-4 flex items-center justify-center gap-2 active:scale-95 transition-all text-xs shadow-sm cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4 text-steel" />
                        <span>BACK TO COURSES</span>
                      </button>
                      <div>
                        <span className="bg-steel-lt text-steel text-[9px] uppercase font-bold px-2.5 py-0.5 rounded-full font-mono tracking-wider">
                          CURRICULUM BUILDER
                        </span>
                        <h3 className="text-base font-display font-bold text-text leading-tight mt-1">
                          {selectedCourse.title}
                        </h3>
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-steel/70 font-mono">
                      ID #{selectedCourse.id} • {selectedCourse.lessons?.length || 0} units
                    </div>
                  </div>

                  <div className="flex bg-stroke/60 p-1.5 rounded-2xl gap-1 max-w-md" id="course-admin-tabs">
                    <button
                      type="button"
                      onClick={() => setCourseSubTab('lessons')}
                      className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${courseSubTab === 'lessons' ? 'bg-steel text-white shadow-sm font-black' : 'text-steel/70 hover:text-text hover:bg-canvas'}`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Lessons</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCourseSubTab('exam')}
                      className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${courseSubTab === 'exam' ? 'bg-steel text-white shadow-sm font-black' : 'text-steel/70 hover:text-text hover:bg-canvas'}`}
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>Exam & Quiz</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCourseSubTab('settings')}
                      className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${courseSubTab === 'settings' ? 'bg-steel text-white shadow-sm font-black' : 'text-steel/70 hover:text-text hover:bg-canvas'}`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Settings</span>
                    </button>
                  </div>

                  <div className="w-full space-y-6">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`lms-course-${selectedCourse.id}-${courseSubTab}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-8"
                        id="selected-lms-course-stage"
                      >
                        {courseSubTab === 'lessons' && (
                          <LessonManager
                            token={token}
                            selectedCourse={selectedCourse}
                            onRefreshCourses={onRefreshCourses}
                            loadCourseFullDetails={loadCourseFullDetails}
                          />
                        )}
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
