// src/components/InstructorLMS.tsx
import React, { useState, useEffect } from 'react';
import { Course } from '../types.ts';
import { authHeaders } from '../lib/utils.ts';
import { Layout, Activity } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CourseFactory } from './instructor/CourseFactory.tsx';
import { LessonManager } from './instructor/LessonManager.tsx';
import { QuizBuilder } from './instructor/QuizBuilder.tsx';
import { AnalyticsDashboard } from './instructor/AnalyticsDashboard.tsx';

interface InstructorLMSProps {
  token: string | null;
  courses: Course[];
  onRefreshCourses: () => void;
}

export const InstructorLMS: React.FC<InstructorLMSProps> = ({ token, courses, onRefreshCourses }) => {
  const [activeTab, setActiveTab] = useState<'courses' | 'analytics'>('courses');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [courseSubTab, setCourseSubTab] = useState('lessons');
  const [quizForm, setQuizForm] = useState<{ title: string; questions: { questionText: string; options: string[]; correctOptionIndex: number }[] }>({ title: '', questions: [] });

  const loadCourseFullDetails = async (courseId: number) => {
    if (!token) return;
    try {
      const response = await fetch(`/api/courses/${courseId}`, { headers: authHeaders(token) });
      if (response.ok) {
        const fullData = await response.json();
        const quizObj = fullData.quiz || { title: `${fullData.course.title} Exam`, questions: [] };
        setQuizForm({ title: quizObj.title, questions: quizObj.questions || [] });
        setSelectedCourse({ ...fullData.course, lessons: fullData.lessons, quiz: quizObj });
      }
    } catch (err) {
      console.error('Error fetching course details:', err);
    }
  };

  useEffect(() => {
    if (selectedCourse) {
      loadCourseFullDetails(selectedCourse.id);
      setCourseSubTab('lessons');
    }
  }, [selectedCourse]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6" id="instructor-lms-container">
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Left Sidebar Navigation */}
        <div className="w-full lg:w-64 shrink-0" id="lms-sidebar">
          <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 shadow-md border border-slate-800 space-y-6 lg:sticky lg:top-6">
            <div className="space-y-1.5 pb-4 border-b border-slate-800">
              <span className="bg-pink-500/10 text-pink-450 text-[10px] font-bold px-2.5 py-1 rounded-full border border-pink-500/20 uppercase tracking-widest font-mono">Control Center</span>
              <h3 className="text-base font-black tracking-tight text-white font-sans mt-2">Instructor Portal</h3>
              <p className="text-slate-400 text-[11px] leading-relaxed">QuantSyllabus LMS Workspace & Analytics</p>
            </div>

            <div className="space-y-1 flex flex-row lg:flex-col gap-2 lg:gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scrollbar-none">
              <button
                onClick={() => { setActiveTab('courses'); setSelectedCourse(null); }}
                className={`flex-1 lg:flex-initial h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center lg:justify-start gap-3 cursor-pointer shrink-0 ${activeTab === 'courses' ? 'bg-pink-600 text-white shadow-md font-black scale-100' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'}`}
              >
                <Layout className="w-4 h-4 text-pink-500" /><span>Course factory</span>
              </button>
              <button
                onClick={() => { setActiveTab('analytics'); setSelectedCourse(null); }}
                className={`flex-1 lg:flex-initial h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center lg:justify-start gap-3 cursor-pointer shrink-0 ${activeTab === 'analytics' ? 'bg-pink-600 text-white shadow-md font-black scale-100' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'}`}
              >
                <Activity className="w-4 h-4 text-pink-500" /><span>Analytics</span>
              </button>
            </div>

            <div className="hidden lg:block bg-slate-800/30 rounded-2xl p-4 border border-slate-800/50 text-[11px] text-slate-400 leading-relaxed space-y-1.5 font-sans">
              <p className="font-bold text-slate-300">Target Student Base:</p>
              <p>Aimed at students with low digital literacy. Keep syllabus topics, descriptions, and exam questions human-centric, short, and very direct.</p>
            </div>
          </div>
        </div>

        {/* Right Content Panels */}
        <div className="flex-grow min-w-0" id="lms-main-content">
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
            )
          ) : (
            <AnalyticsDashboard token={token} courses={courses} />
          )}
        </div>
      </div>
    </div>
  );
};
