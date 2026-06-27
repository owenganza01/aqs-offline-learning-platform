// src/components/InstructorLMS.tsx
import React, { useState, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase.ts';
import { Course, Lesson, Quiz, Question } from '../types.ts';
import { PouchDBService } from '../lib/pouchdb-service.ts';
import { 
  Building2, BookOpen, Plus, Trash2, ArrowUp, ArrowDown, Edit3, 
  CheckSquare, Award, ArrowLeft, RefreshCw, BarChart2, Star, Check, Download,
  Sparkles, FileText, Layout, Settings, Activity, Users, HelpCircle
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, AreaChart, Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

const getCourseImage = (course: Course): string => {
  const title = (course.title || '').toLowerCase();
  const desc = (course.description || '').toLowerCase();
  const text = `${title} ${desc}`;
  
  if (text.includes('web development') || text.includes('html') || text.includes('css') || text.includes('javascript') || text.includes('frontend')) {
    return 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('react') || text.includes('component') || text.includes('hook')) {
    return 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('design') || text.includes('ui/ux') || text.includes('interface') || text.includes('figma')) {
    return 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('agri') || text.includes('crop') || text.includes('soil') || text.includes('farm') || text.includes('field')) {
    return 'https://images.unsplash.com/photo-1560493676-04071c5f467b?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('math') || text.includes('quant') || text.includes('stat') || text.includes('model') || text.includes('estim')) {
    return 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=600&q=80';
  }
  return 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80';
};

interface InstructorLMSProps {
  token: string | null;
  courses: Course[];
  onRefreshCourses: () => void;
}

export const InstructorLMS: React.FC<InstructorLMSProps> = ({
  token,
  courses,
  onRefreshCourses
}) => {
  // Navigation
  const [activeTab, setActiveTab] = useState<'courses' | 'analytics'>('courses');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [courseSubTab, setCourseSubTab] = useState<'lessons' | 'exam' | 'settings'>('lessons');
  
  // Analytics State
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);

  // Forms / Editing states
  const [editingCourse, setEditingCourse] = useState<boolean>(false);
  const [courseForm, setCourseForm] = useState({ title: '', description: '', thumbnail: 'teal' });
  const [showAddCourse, setShowAddCourse] = useState<boolean>(false);

  // Lesson Forms
  const [showAddLesson, setShowAddLesson] = useState<boolean>(false);
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [lessonForm, setLessonForm] = useState({ title: '', content: '', videoUrl: '', slidesUrl: '', sortOrder: 0 });
  const [uploadingSlides, setUploadingSlides] = useState<boolean>(false);

  // Quiz Editor
  const [quizForm, setQuizForm] = useState<{
    title: string;
    questions: { questionText: string; options: string[]; correctOptionIndex: number }[];
  }>({ title: '', questions: [] });
  const [newQuestion, setNewQuestion] = useState({
    questionText: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0
  });

  // Direct single MCQ creation
  const [directQuestion, setDirectQuestion] = useState({
    questionText: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0
  });
  const [directIsLoading, setDirectIsLoading] = useState(false);
  const [directSuccessMsg, setDirectSuccessMsg] = useState('');

  // Load Course and Quiz details on selection
  useEffect(() => {
    if (selectedCourse) {
      loadCourseFullDetails(selectedCourse.id);
      setCourseSubTab('lessons');
    }
  }, [selectedCourse]);

  const loadCourseFullDetails = async (courseId: number) => {
    if (!token) return;
    try {
      const response = await fetch(`/api/courses/${courseId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const fullData = await response.json();
        const quizObj = fullData.quiz || { title: `${fullData.course.title} Exam`, questions: [] };
        
        setQuizForm({
          title: quizObj.title,
          questions: quizObj.questions || []
        });

        setSelectedCourse({
          ...fullData.course,
          lessons: fullData.lessons,
          quiz: quizObj
        });
      }
    } catch (err) {
      console.error('Error fetching LMS course full details:', err);
    }
  };

  // Load Analytics Command Center
  const loadAnalytics = async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const response = await fetch('/api/instructor/analytics', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to retrieve analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'analytics') {
      loadAnalytics();
    }
  }, [activeTab, courses]);

  const handleExportCSV = () => {
    if (!analytics || !analytics.courseStats) return;

    let csvContent = "";

    csvContent += "=== DASHBOARD METRICS SUMMARY ===\r\n";
    csvContent += `Total Enrolled Learners,${analytics.totalLearnersCount}\r\n`;
    csvContent += `Active Classes,${courses.length}\r\n`;
    const globalCompletionRate = analytics.courseStats?.length > 0 
      ? Math.round(analytics.courseStats.reduce((acc: number, item: any) => acc + (item.completionRate || 0), 0) / analytics.courseStats.length) 
      : 0;
    csvContent += `Global Completion Rate,${globalCompletionRate}%\r\n\r\n`;

    csvContent += "=== COURSE COMPLETION & ENGAGEMENT STATISTICS ===\r\n";
    const courseHeaders = [
      "Course ID",
      "Course Title",
      "Syllabus Lessons Count",
      "Engaged Active Learners",
      "Syllabus fully completed (Learners)",
      "Passed Quiz (Completed Learners)",
      "Best Quiz Score Average (%)",
      "Completion Rate (%)"
    ];
    csvContent += courseHeaders.join(",") + "\r\n";

    analytics.courseStats.forEach((stat: any) => {
      const escapedTitle = stat.title ? stat.title.replace(/"/g, '""') : "";
      const row = [
        stat.id,
        `"${escapedTitle}"`,
        stat.lessonsCount,
        stat.activeStudents,
        stat.completions,
        stat.passedQuizzes,
        stat.averageScore !== null ? `${stat.averageScore}%` : "N/A",
        `${stat.completionRate}%`
      ];
      csvContent += row.join(",") + "\r\n";
    });

    // Create file attachment for the browser client to download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `aqs_instructor_analytics_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const payload = {
      title: courseForm.title,
      description: courseForm.description,
      thumbnail: courseForm.thumbnail
    };

    try {
      const url = editingCourse && selectedCourse 
        ? `/api/instructor/courses/${selectedCourse.id}` 
        : '/api/instructor/courses';
      const method = editingCourse && selectedCourse ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const saved = await response.json();
        onRefreshCourses();
        setShowAddCourse(false);
        setEditingCourse(false);
        setCourseForm({ title: '', description: '', thumbnail: 'teal' });
        
        if (method === 'PUT') {
          await loadCourseFullDetails(selectedCourse!.id);
        } else {
          setSelectedCourse(saved);
        }
      }
    } catch (error) {
      console.error('Failed to preserve academic course container:', error);
    }
  };

  const handleDeleteCourse = async (courseId: number) => {
    if (!token) return;
    if (!confirm('Are you absolutely certain you want to delete this course, along with ALL its curriculum chapters, lessons, and exam quiz sheets? This action is irreversible.')) {
      return;
    }

    try {
      const response = await fetch(`/api/instructor/courses/${courseId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setSelectedCourse(null);
        onRefreshCourses();
      }
    } catch (e) {
      console.error('Failed to drop academic course:', e);
    }
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedCourse) return;

    const payload = {
      courseId: selectedCourse.id,
      title: lessonForm.title,
      content: lessonForm.content,
      videoUrl: lessonForm.videoUrl || null,
      slidesUrl: lessonForm.slidesUrl || null,
      sortOrder: lessonForm.sortOrder
    };

    try {
      const url = editingLessonId 
        ? `/api/instructor/courses/${selectedCourse.id}/lessons/${editingLessonId}` 
        : `/api/instructor/courses/${selectedCourse.id}/lessons`;
      const method = editingLessonId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowAddLesson(false);
        setEditingLessonId(null);
        setLessonForm({ title: '', content: '', videoUrl: '', slidesUrl: '', sortOrder: 0 });
        await loadCourseFullDetails(selectedCourse.id);
        onRefreshCourses();
      }
    } catch (err) {
      console.error('Failed to update curriculum lesson materials:', err);
    }
  };

  const handleUploadSlides = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSlides(true);
    try {
      const storageRef = ref(storage, `slides/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      setLessonForm(l => ({ ...l, slidesUrl: downloadUrl }));
    } catch (err) {
      console.error('Failed to upload slide document:', err);
      alert('Failed to upload slide document. Please try again.');
    } finally {
      setUploadingSlides(false);
    }
  };

  const handleEditLessonSetup = (lesson: Lesson) => {
    setEditingLessonId(lesson.id);
    setLessonForm({
      title: lesson.title,
      content: lesson.content,
      videoUrl: lesson.videoUrl || '',
      slidesUrl: lesson.slidesUrl || '',
      sortOrder: lesson.sortOrder
    });
    setShowAddLesson(true);
  };

  const handleDeleteLesson = async (lessonId: number) => {
    if (!token || !selectedCourse) return;
    if (!confirm('Are you sure you want to delete this syllabus lesson?')) {
      return;
    }

    try {
      const response = await fetch(`/api/instructor/courses/${selectedCourse.id}/lessons/${lessonId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        await loadCourseFullDetails(selectedCourse.id);
        onRefreshCourses();
      }
    } catch (e) {
      console.error('Failed to remove lesson node:', e);
    }
  };

  const handleMoveLesson = async (index: number, direction: 'up' | 'down') => {
    if (!selectedCourse || !token) return;
    const currentLessons = selectedCourse.lessons ? [...selectedCourse.lessons] : [];
    if (currentLessons.length === 0) return;

    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentLessons.length) return;

    // Swap sortOrder fields in client UI state
    const firstLesson = currentLessons[index];
    const secondLesson = currentLessons[targetIdx];

    const originalFirstOrder = firstLesson.sortOrder;
    firstLesson.sortOrder = secondLesson.sortOrder;
    secondLesson.sortOrder = originalFirstOrder;

    // Reorder array list locally
    currentLessons[index] = secondLesson;
    currentLessons[targetIdx] = firstLesson;

    try {
      // Post actual sort reorder payload
      const response = await fetch(`/api/instructor/courses/${selectedCourse.id}/lessons/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orderedIds: currentLessons.map(l => l.id)
        })
      });

      if (response.ok) {
        await loadCourseFullDetails(selectedCourse.id);
        onRefreshCourses();
      }
    } catch (e) {
      console.error('Failed to update curriculum sort logs:', e);
    }
  };

  // Add Question to client local Quiz creator state
  const handleAddQuestion = () => {
    if (!newQuestion.questionText.trim() || newQuestion.options.some(opt => !opt.trim())) {
      alert("All question choices and descriptions must be filled.");
      return;
    }

    const qPayload = {
      questionText: newQuestion.questionText.trim(),
      options: newQuestion.options.map(o => o.trim()),
      correctOptionIndex: newQuestion.correctOptionIndex
    };

    setQuizForm(prev => ({
      ...prev,
      questions: [...prev.questions, qPayload]
    }));

    setNewQuestion({
      questionText: '',
      options: ['', '', '', ''],
      correctOptionIndex: 0
    });
  };

  const handleRemoveQuestion = (idx: number) => {
    setQuizForm(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx)
    }));
  };

  const handleSaveQuiz = async () => {
    if (!token || !selectedCourse || quizForm.questions.length === 0) return;

    const payload = {
      courseId: selectedCourse.id,
      title: quizForm.title || `${selectedCourse.title} Exam`,
      questions: quizForm.questions
    };

    try {
      const response = await fetch(`/api/instructor/courses/${selectedCourse.id}/quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        alert('Course exam and grading answers published successfully! Updated in active catalogs.');
        await loadCourseFullDetails(selectedCourse.id);
        onRefreshCourses();
      }
    } catch (error) {
      console.error('Failed to drop quiz configurations:', error);
    }
  };

  // Single Direct MCQ database injector save operations (FR-11)
  const handleSaveDirectQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !token) return;
    if (!directQuestion.questionText.trim()) return;

    setDirectIsLoading(true);
    setDirectSuccessMsg('');

    const payload = {
      courseId: selectedCourse.id,
      questionText: directQuestion.questionText.trim(),
      options: directQuestion.options.map(o => o.trim()),
      correctOptionIndex: directQuestion.correctOptionIndex
    };

    try {
      const response = await fetch(`/api/instructor/courses/${selectedCourse.id}/quiz/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        setDirectSuccessMsg(`Successfully saved! Total Course MCQs now: ${data.totalMCQsCount}. Saved straight to remote server schema.`);
        
        // Reset single direct form
        setDirectQuestion({
          questionText: '',
          options: ['', '', '', ''],
          correctOptionIndex: 0
        });

        // Refresh selected details
        await loadCourseFullDetails(selectedCourse.id);
      } else {
        const err = await response.json();
        alert(`Failed: ${err.error}`);
      }
    } catch (error) {
      console.error('Error inserting live MCQ:', error);
      alert('Network exception saving MCQ.');
    } finally {
      setDirectIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6" id="instructor-lms-container">
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Left Sidebar Navigation */}
        <div className="w-full lg:w-64 shrink-0" id="lms-sidebar">
          <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 shadow-md border border-slate-800 space-y-6 lg:sticky lg:top-6">
            <div className="space-y-1.5 pb-4 border-b border-slate-800">
              <span className="bg-pink-500/10 text-pink-450 text-[10px] font-bold px-2.5 py-1 rounded-full border border-pink-500/20 uppercase tracking-widest font-mono">
                Control Center
              </span>
              <h3 className="text-base font-black tracking-tight text-white font-sans mt-2">Instructor Portal</h3>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                QuantSyllabus LMS Workspace & Analytics
              </p>
            </div>

            {/* Navigation Sidebar Tabs */}
            <div className="space-y-1 flex flex-row lg:flex-col gap-2 lg:gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scrollbar-none">
              <button
                onClick={() => {
                  setActiveTab('courses');
                  setSelectedCourse(null);
                  setShowAddCourse(false);
                }}
                className={`flex-1 lg:flex-initial h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center lg:justify-start gap-3 cursor-pointer shrink-0 ${
                  activeTab === 'courses'
                    ? 'bg-pink-600 text-white shadow-md font-black scale-100'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                }`}
              >
                <Layout className="w-4 h-4 text-pink-500" />
                <span>Course factory</span>
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('analytics');
                  setSelectedCourse(null);
                }}
                className={`flex-1 lg:flex-initial h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center lg:justify-start gap-3 cursor-pointer shrink-0 ${
                  activeTab === 'analytics'
                    ? 'bg-pink-600 text-white shadow-md font-black scale-100'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                }`}
              >
                <Activity className="w-4 h-4 text-pink-500" />
                <span>Analytics</span>
              </button>
            </div>

            {/* Quick Design Helper info card */}
            <div className="hidden lg:block bg-slate-800/30 rounded-2xl p-4 border border-slate-800/50 text-[11px] text-slate-400 leading-relaxed space-y-1.5 font-sans">
              <p className="font-bold text-slate-300">Target Student Base:</p>
              <p>
                Aimed at students with low digital literacy. Keep syllabus topics, descriptions, and exam questions human-centric, short, and very direct.
              </p>
            </div>
          </div>
        </div>

        {/* Right Content Panels */}
        <div className="flex-grow min-w-0" id="lms-main-content">
          {activeTab === 'courses' ? (
            /* ======================== COURSE WORKSHOP TAB ======================== */
            !selectedCourse ? (
              /* Course Grid list (Course Factory list view) */
              <div className="space-y-6" id="course-factory-catalog-grid">
                
                {/* Visual Header card */}
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

                {/* Create/Edit Course Form Card inline */}
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
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 font-mono">Course Title:</label>
                          <input
                            type="text"
                            required
                            value={courseForm.title}
                            onChange={e => setCourseForm(c => ({ ...c, title: e.target.value }))}
                            className="w-full p-3 border border-slate-155 rounded-xl text-xs bg-slate-50/55 outline-none focus:bg-white focus:ring-2 focus:ring-pink-500/15 focus:border-pink-500 transition-all font-semibold text-slate-850"
                            placeholder="e.g. Statistical Inference & Regression"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 font-mono">Short Description / Summary:</label>
                          <textarea
                            required
                            value={courseForm.description}
                            onChange={e => setCourseForm(c => ({ ...c, description: e.target.value }))}
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

                {/* Courses Grid List */}
                {courses.length === 0 ? (
                  <div className="bg-white border border-slate-150 rounded-[2rem] p-12 text-center shadow-sm">
                    <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h4 className="text-sm font-bold text-slate-700">No active classrooms yet</h4>
                    <p className="text-slate-500 max-w-xs mx-auto mt-2 text-xs leading-relaxed font-sans">
                      Start by clicking the "CREATE NEW COURSE" button above to establish your first quantitative learning materials.
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
                            {/* Card Cover Thumbnail */}
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

                            {/* Card Body */}
                            <div className="p-5 space-y-2">
                              <h4 className="font-bold text-slate-900 text-base leading-snug line-clamp-1">
                                {course.title}
                              </h4>
                              <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                                {course.description}
                              </p>
                              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-[10px] font-bold text-slate-500 font-mono flex items-center justify-between mt-2">
                                <span>SYLLABUS UNITS:</span>
                                <span className="text-pink-600 font-bold">{unitsCount} units</span>
                              </div>
                            </div>
                          </div>

                          {/* Card Action footer */}
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
                                    thumbnail: course.thumbnail || 'teal'
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
            ) : (
              /* If a course is selected, take full screen and show back link */
              <div className="w-full space-y-6">
                
                {/* Back Link Header Bar */}
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
                  <div className="text-[10px] font-bold text-slate-400 font-mono">
                    ID #{selectedCourse.id} • {selectedCourse.lessons?.length || 0} units
                  </div>
                </div>

                {/* Simplified Segmented control tabs for Course Administry */}
                <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 max-w-md" id="course-admin-tabs">
                  <button
                    type="button"
                    onClick={() => setCourseSubTab('lessons')}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      courseSubTab === 'lessons'
                        ? 'bg-pink-600 text-white shadow-sm font-black'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Lessons</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCourseSubTab('exam')}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      courseSubTab === 'exam'
                        ? 'bg-pink-600 text-white shadow-sm font-black'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>Exam & Quiz</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCourseSubTab('settings')}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      courseSubTab === 'settings'
                        ? 'bg-pink-600 text-white shadow-sm font-black'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Settings</span>
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div 
                    key={`lms-course-${selectedCourse.id}-${courseSubTab}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-8" 
                    id="selected-lms-course-stage"
                  >
                  
                  {/* A. Course Info & Setup operations */}
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
                                thumbnail: selectedCourse.thumbnail || 'teal'
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

                  {/* B. Curriculum Lesson sorting dashboard */}
                  {courseSubTab === 'lessons' && (
                    <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 right-0 h-1 bg-pink-500"></div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-2 border-b border-slate-100">
                        <h4 className="font-bold text-slate-800 text-xs font-sans uppercase tracking-widest font-mono flex items-center gap-2">
                          <FileText className="w-4 h-4 text-indigo-600" />
                          <span>Curriculum Syllabus Chapters ({selectedCourse.lessons?.length || 0})</span>
                        </h4>
                        <button
                          onClick={() => {
                            setEditingLessonId(null);
                            setLessonForm({ title: '', content: '', videoUrl: '', sortOrder: (selectedCourse.lessons?.length || 0) });
                            setShowAddLesson(true);
                          }}
                          className="w-full sm:w-auto h-10 bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs px-4 rounded-xl border border-pink-700/20 flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>ADD LESSON MATERIAL</span>
                        </button>
                      </div>

                      <AnimatePresence>
                        {showAddLesson && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-slate-50 border border-slate-200 p-5 rounded-2.5xl mb-4 font-sans text-sm shadow-inner"
                          >
                            <h5 className="font-bold text-slate-800 mb-3 text-xs tracking-tight uppercase border-b border-slate-200 pb-1.5">
                              {editingLessonId ? '✏️ Modify Lesson Unit' : '✨ Formulate New Curriculum Unit'}
                            </h5>
                            <form onSubmit={handleSaveLesson} className="space-y-4">
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">Lesson Title:</label>
                                <input
                                  type="text" required value={lessonForm.title}
                                  onChange={e => setLessonForm(l => ({ ...l, title: e.target.value }))}
                                  placeholder="e.g. Quantitative Assessment Metrics"
                                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-semibold text-slate-855"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">YouTube embed presentation URL (Optional):</label>
                                <input
                                  type="text" value={lessonForm.videoUrl}
                                  onChange={e => setLessonForm(l => ({ ...l, videoUrl: e.target.value }))}
                                  placeholder="e.g. https://www.youtube.com/embed/dQw4w9WgXcQ"
                                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-semibold text-slate-855"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">PowerPoint / Slides Link or Upload Document (Optional):</label>
                                <div className="flex flex-col md:flex-row gap-2">
                                  <input
                                    type="text" value={lessonForm.slidesUrl}
                                    onChange={e => setLessonForm(l => ({ ...l, slidesUrl: e.target.value }))}
                                    placeholder="e.g. Google Slides link, OneDrive PowerPoint embed URL, PDF link"
                                    className="flex-grow p-2.5 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-semibold text-slate-855"
                                  />
                                  <div className="relative shrink-0">
                                    <input
                                      type="file"
                                      id="slides-file-upload"
                                      onChange={handleUploadSlides}
                                      accept=".pdf,.ppt,.pptx,.key,.odp"
                                      className="hidden"
                                      disabled={uploadingSlides}
                                    />
                                    <label
                                      htmlFor="slides-file-upload"
                                      className={`h-10 px-4 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 select-none ${uploadingSlides ? 'opacity-50 pointer-events-none' : ''}`}
                                    >
                                      {uploadingSlides ? (
                                        <>
                                          <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                                          <span>Uploading...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Download className="w-4 h-4 text-slate-500 rotate-180" />
                                          <span>Upload PPT/PDF</span>
                                        </>
                                      )}
                                    </label>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">Detailed Course Readings Summary (Content Text/Markdown):</label>
                                <textarea
                                  required value={lessonForm.content}
                                  onChange={e => setLessonForm(l => ({ ...l, content: e.target.value }))}
                                  placeholder="Provide student reference textbooks or technical content summaries..."
                                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-white h-44 outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all text-slate-755 font-medium leading-relaxed"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  className="bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs px-4 h-10 rounded-xl transition-all shadow-sm active:scale-95 border border-pink-700/20 cursor-pointer"
                                >
                                  SAVE MATERIALS
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setShowAddLesson(false); setEditingLessonId(null); }}
                                  className="bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs px-4 h-10 rounded-xl border border-slate-200 transition-all shadow-sm cursor-pointer"
                                >
                                  ABANDON
                                </button>
                              </div>
                            </form>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {(selectedCourse.lessons || []).length === 0 ? (
                        <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                          <p className="text-xs italic text-slate-400">No lessons built yet. Click ADD LESSON MATERIAL above.</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {(selectedCourse.lessons || []).map((lesson, index) => (
                            <div 
                              key={lesson.id}
                              className="bg-slate-50/60 border border-slate-150 p-4 rounded-2xl flex items-center justify-between gap-4 font-sans shadow-sm"
                            >
                              <div className="flex items-center gap-3 min-w-0 pr-2">
                                <span className="font-mono font-black text-slate-450 text-xs shrink-0">{index + 1}.</span>
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-800 text-xs truncate">{lesson.title}</p>
                                  <p className="text-[10px] text-slate-400 font-mono font-semibold mt-1">ID #{lesson.id} • Order index: {lesson.sortOrder}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 font-mono">
                                <button
                                  onClick={() => handleMoveLesson(index, 'up')}
                                  disabled={index === 0}
                                  title="Move Syllabus node up"
                                  className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg disabled:opacity-30 active:scale-95 cursor-pointer shadow-sm"
                                >
                                  <ArrowUp className="w-3.5 h-3.5 text-slate-600" />
                                </button>
                                <button
                                  onClick={() => handleMoveLesson(index, 'down')}
                                  disabled={index === (selectedCourse.lessons || []).length - 1}
                                  title="Move Syllabus node down"
                                  className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg disabled:opacity-30 active:scale-95 cursor-pointer shadow-sm"
                                >
                                  <ArrowDown className="w-3.5 h-3.5 text-slate-600" />
                                </button>
                                <button
                                  onClick={() => handleEditLessonSetup(lesson)}
                                  title="Edit materials"
                                  className="p-1.5 bg-indigo-50 border border-indigo-150 hover:bg-indigo-100 rounded-lg ml-1 active:scale-95 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-indigo-650" />
                                </button>
                                <button
                                  onClick={() => handleDeleteLesson(lesson.id)}
                                  title="Drop lesson"
                                  className="p-1.5 bg-red-50 border border-red-150 hover:bg-red-100 rounded-lg active:scale-95 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* C. Course QA Quiz Creator */}
                  {courseSubTab === 'exam' && (
                    <>
                      {/* Direct MCQ Database Injector */}
                      <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm font-sans bg-gradient-to-br from-white to-pink-50/10">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-pink-50">
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <CheckSquare className="w-4 h-4 text-pink-600" />
                              <span>Direct MCQ Database Injector</span>
                            </h4>
                            <p className="text-slate-500 text-[11px] mt-0.5">
                              Deploy a single multiple-choice question instantly to this course's live database.
                            </p>
                          </div>
                          <span className="bg-pink-100 text-pink-800 text-[10px] uppercase font-mono font-bold px-2.5 py-0.5 rounded-full self-start sm:self-center tracking-wider">
                            Live Engine
                          </span>
                        </div>

                        <form onSubmit={handleSaveDirectQuestion} className="space-y-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 font-mono">
                              Question Prompt:
                            </label>
                            <input
                              type="text"
                              required
                              value={directQuestion.questionText}
                              onChange={e => setDirectQuestion(q => ({ ...q, questionText: e.target.value }))}
                              placeholder="e.g. Which metric represents the variance in sample metrics?"
                              className="w-full p-2.5 border border-slate-155 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-pink-500/15 focus:border-pink-500 transition-all font-semibold text-slate-855"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans">
                            {directQuestion.options.map((option, oIdx) => (
                              <div key={oIdx}>
                                <label className="block text-[10px] font-bold text-slate-400 mb-1 font-mono">
                                  Choice {String.fromCharCode(65 + oIdx)}:
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={option}
                                  onChange={e => {
                                    const opts = [...directQuestion.options];
                                    opts[oIdx] = e.target.value;
                                    setDirectQuestion(q => ({ ...q, options: opts }));
                                  }}
                                  placeholder={`Option ${String.fromCharCode(65 + oIdx)}...`}
                                  className="w-full p-2.5 border border-slate-155 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-pink-500/15 focus:border-pink-500 transition-all font-semibold text-slate-700"
                                />
                              </div>
                            ))}
                          </div>

                          <div className="pt-2 font-sans">
                            <label className="block text-[10px] font-bold text-slate-400 mb-2 font-mono">
                              Mark the correct option index:
                            </label>
                            <div className="flex flex-wrap gap-4 font-bold font-mono text-xs text-slate-700">
                              {directQuestion.options.map((_, oIdx) => (
                                <label key={oIdx} className="flex items-center gap-2 cursor-pointer hover:text-pink-600 transition-colors">
                                  <input
                                    type="radio"
                                    name="directCorrectIdx"
                                    value={oIdx}
                                    checked={directQuestion.correctOptionIndex === oIdx}
                                    onChange={() => setDirectQuestion(q => ({ ...q, correctOptionIndex: oIdx }))}
                                    className="w-4 h-4 text-pink-600 focus:ring-0 cursor-pointer"
                                  />
                                  <span className="font-sans font-bold text-slate-755">
                                    Option {String.fromCharCode(65 + oIdx)}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {directSuccessMsg && (
                            <div className="p-3.5 bg-emerald-50 border border-emerald-150 text-emerald-800 text-xs font-semibold rounded-2xl flex items-center gap-2 animate-fade-in font-sans">
                              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping shrink-0" />
                              <span>{directSuccessMsg}</span>
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={directIsLoading}
                            className="w-full h-11 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 border border-pink-700/20 cursor-pointer"
                          >
                            {directIsLoading ? (
                              <span className="font-mono text-xs animate-pulse">SAVING TO DATABASE...</span>
                            ) : (
                              <>
                                <Plus className="w-4 h-4" />
                                <span>INJECT MCQ AND SYNC CATALOG</span>
                              </>
                            )}
                          </button>
                        </form>
                      </div>

                      {/* Course QA Quiz Creator */}
                      <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm font-sans">
                        <div className="border-b border-slate-100 pb-3 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <Award className="w-4.5 h-4.5 text-indigo-600" />
                              <span>Course Exam Publisher</span>
                            </h4>
                            <p className="text-slate-505 text-[11px] mt-0.5">Assemble comprehensive multi-question evaluation assessments for local client storage.</p>
                          </div>
                        </div>

                        <div className="space-y-4 mb-6">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 font-mono">Exam Title:</label>
                            <input
                              type="text"
                              value={quizForm.title}
                              onChange={e => setQuizForm(q => ({ ...q, title: e.target.value }))}
                              className="w-full p-2.5 border border-slate-155 rounded-xl text-xs bg-slate-50/55 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-bold text-slate-800"
                              placeholder="e.g. Calculus & Inference Final Exam"
                            />
                          </div>

                          {/* Question Addition Sub Form */}
                          <div className="bg-slate-50/60 border border-slate-200 p-5 rounded-2.5xl">
                            <h5 className="font-bold text-slate-800 text-xs mb-3 flex items-center gap-1.5 uppercase tracking-tight">
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                              <span>Formulate Question Node</span>
                            </h5>

                            <div className="space-y-3">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1 font-mono">Question Text:</label>
                                <input
                                  type="text" value={newQuestion.questionText}
                                  onChange={e => setNewQuestion(q => ({ ...q, questionText: e.target.value }))}
                                  placeholder="e.g. Which coefficient measures direct correlation?"
                                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-semibold text-slate-850"
                                />
                              </div>

                              {/* Options A, B, C, D */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {newQuestion.options.map((option, oIdx) => (
                                  <div key={oIdx}>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1 font-mono">Option {String.fromCharCode(65 + oIdx)}:</label>
                                    <input
                                      type="text" value={option}
                                      onChange={e => {
                                        const opts = [...newQuestion.options];
                                        opts[oIdx] = e.target.value;
                                        setNewQuestion(q => ({ ...q, options: opts }));
                                      }}
                                      placeholder={`Alternative Choice ${String.fromCharCode(65 + oIdx)}...`}
                                      className="w-full p-2.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-semibold text-slate-700"
                                    />
                                  </div>
                                ))}
                              </div>

                              <div className="pt-2 font-sans">
                                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 font-mono">Select the correct alternative answer:</label>
                                <div className="flex flex-wrap gap-4 font-bold font-mono text-[11px] text-slate-600">
                                  {newQuestion.options.map((_, oIdx) => (
                                    <label key={oIdx} className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-600">
                                      <input
                                        type="radio"
                                        name="correctIdx"
                                        value={oIdx}
                                        checked={newQuestion.correctOptionIndex === oIdx}
                                        onChange={() => setNewQuestion(q => ({ ...q, correctOptionIndex: oIdx }))}
                                        className="w-4 h-4 text-indigo-600 focus:ring-0 cursor-pointer"
                                      />
                                      <span>Choice {String.fromCharCode(65 + oIdx)}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={handleAddQuestion}
                                className="h-10 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border border-indigo-700/20"
                              >
                                <Plus className="w-4 h-4" />
                                <span>ADD QUESTION UNIT</span>
                              </button>
                            </div>
                          </div>

                          {/* Display added questions */}
                          {quizForm.questions.length > 0 && (
                            <div className="space-y-2 border-t border-slate-100 pt-4">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono mb-2">Syllabus Quiz Inscription Queue:</p>
                              {quizForm.questions.map((q, idx) => (
                                <div 
                                  key={idx}
                                  className="bg-indigo-50/40 border border-indigo-100 p-4 rounded-xl flex items-center justify-between gap-4 text-xs shadow-sm"
                                >
                                  <div className="min-w-0">
                                    <p className="font-bold text-indigo-950 font-sans leading-snug truncate">
                                      {idx + 1}. {q.questionText}
                                    </p>
                                    <p className="text-slate-500 font-medium mt-1 truncate">
                                      Options: {q.options.join(' | ')} (Correct: Choice {String.fromCharCode(65 + q.correctOptionIndex)})
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveQuestion(idx)}
                                    className="p-1 px-1.5 text-red-500 hover:bg-red-50 rounded transition-colors active:scale-95 cursor-pointer shrink-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Save complete quiz parameters */}
                        <button
                          onClick={handleSaveQuiz}
                          disabled={quizForm.questions.length === 0}
                          className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 shadow-sm active:scale-95 transition-all outline-none border border-indigo-700/20 cursor-pointer"
                        >
                          <Check className="w-5 h-5" />
                          <span>PUBLISH COMPLETE COURSE EXAM SHEET</span>
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          )
        ) : (
        /* ======================== ANALYTICS DASHBOARD CENTER ======================== */
        <div className="space-y-8" id="analytics-command-center">
          
          {analyticsLoading || !analytics ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-705 h-[30vh]">
              <RefreshCw className="w-10 h-10 animate-spin text-pink-500 mb-4" />
              <p className="font-bold font-sans">Compiling student engagement metrics...</p>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8 font-sans"
            >
              
              {/* Header Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-150 pb-5" id="analytics-header-export-row">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <Activity className="w-5 h-5 text-pink-600" />
                    <span>Academic Engagement Center</span>
                  </h3>
                  <p className="text-xs text-slate-505 mt-1 font-medium">
                    Export student graduation stats, curriculum completed nodes, and recent active assessments.
                  </p>
                </div>
                <div>
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-all hover:shadow-lg active:scale-95 border border-indigo-700/20 cursor-pointer"
                    title="Export all data to a standard CSV sheet"
                    id="export-csv-btn"
                  >
                    <Download className="w-4 h-4" />
                    <span>EXPORT STATS (.CSV)</span>
                  </button>
                </div>
              </div>

              {/* Stats overview row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-pink-50/50 border border-pink-100/70 rounded-[2rem] p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-pink-100 rounded-full -mr-8 -mt-8 opacity-40"></div>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-pink-700 font-mono flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>Gross Enrolled Learners</span>
                  </p>
                  <p className="text-3.5xl font-black text-pink-950 font-mono mt-4">{analytics.totalLearnersCount}</p>
                  <p className="text-[11px] font-medium text-pink-850/80 mt-2 leading-relaxed">Unique profiles registered automatically upon portal login.</p>
                </div>
                
                <div className="bg-violet-50/50 border border-violet-100/70 rounded-[2rem] p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-violet-100 rounded-full -mr-8 -mt-8 opacity-40"></div>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-violet-700 font-mono flex items-center gap-1.5">
                    <Layout className="w-3.5 h-3.5" />
                    <span>Active Lectures</span>
                  </p>
                  <p className="text-3.5xl font-black text-violet-950 font-mono mt-4">{courses.length}</p>
                  <p className="text-[11px] font-medium text-violet-850/80 mt-2 leading-relaxed">Registered curriculum databases currently online.</p>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-100/70 rounded-[2rem] p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100 rounded-full -mr-8 -mt-8 opacity-40"></div>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-700 font-mono flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Average Graduation Rate</span>
                  </p>
                  <p className="text-3.5xl font-black text-emerald-950 font-mono mt-4">
                    {analytics.courseStats?.length > 0 
                      ? Math.round(analytics.courseStats.reduce((acc: number, item: any) => acc + (item.completionRate || 0), 0) / analytics.courseStats.length) 
                      : 0}%
                  </p>
                  <p className="text-[11px] font-medium text-emerald-850/80 mt-2 leading-relaxed">Proportion of active students who passed the course exams.</p>
                </div>
              </div>

              {/* Recharts Graphical Visualisation Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Engagement counts */}
                <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm">
                  <h4 className="text-sm font-bold text-slate-900 mb-1 font-sans flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-pink-600" />
                    <span>Course Engagement Distribution</span>
                  </h4>
                  <p className="text-xs text-slate-500 mb-6 font-medium">Comparison of engaged student users against quiz graduation counts.</p>
                  
                  <div className="h-80 w-full" id="engagement-recharts-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={analytics.courseStats}
                        margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                        <XAxis dataKey="title" stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px 0 rgba(0, 0, 0, 0.05)', fontSize: '11px', fontFamily: 'sans-serif' }} />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        <Bar dataKey="activeStudents" fill="#3b82f6" name="Active Learners" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="passedQuizzes" fill="#10b981" name="Passed Exams" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Course Completion Percentage Area Chart */}
                <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm">
                  <h4 className="text-sm font-bold text-slate-900 mb-1 font-sans flex items-center gap-2">
                    <Activity className="w-4 h-4 text-pink-600" />
                    <span>Course Completion Rates (%)</span>
                  </h4>
                  <p className="text-xs text-slate-500 mb-6 font-medium">Visualizing curriculum completion percentages across active courses.</p>
                  
                  <div className="h-80 w-full" id="completion-rates-recharts-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={analytics.courseStats}
                        margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                      >
                        <defs>
                          <linearGradient id="colorCompletion" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ec4899" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#ec4899" stopOpacity={0.01}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                        <XAxis dataKey="title" stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <YAxis 
                          stroke="#94a3b8" 
                          fontSize={9} 
                          tickLine={false} 
                          domain={[0, 100]}
                          tickFormatter={(val) => `${val}%`} 
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px 0 rgba(0, 0, 0, 0.05)', fontSize: '11px', fontFamily: 'sans-serif' }} 
                          formatter={(value) => [`${value}%`, 'Completion Rate']}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        <Area 
                          type="monotone" 
                          dataKey="completionRate" 
                          stroke="#ec4899" 
                          fillOpacity={1} 
                          fill="url(#colorCompletion)" 
                          name="Completion Rate" 
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Student activity feeds */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Course Metrics Detail table */}
                <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm font-sans">
                  <h4 className="font-bold text-slate-900 text-sm mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <Layout className="w-4.5 h-4.5 text-pink-600" />
                    <span>Academic Matrix Ledger</span>
                  </h4>
                  
                  {analytics.courseStats?.length === 0 ? (
                    <p className="text-slate-400 italic text-xs">No metrics records.</p>
                  ) : (
                    <div className="space-y-3 font-mono text-[11px] text-slate-550">
                      {analytics.courseStats.map((stat: any) => (
                        <div key={stat.id} className="border-b border-slate-100 pb-3 flex flex-col gap-1.5 last:border-none">
                          <p className="font-bold text-xs text-slate-800 font-sans">{stat.title}</p>
                          <div className="flex items-center justify-between">
                            <span>Syllabus Size:</span>
                            <span className="font-bold text-slate-700">{stat.lessonsCount} lessons</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Engaged Active Learners:</span>
                            <span className="font-bold text-blue-650">{stat.activeStudents} active</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Passed Quiz (Completed):</span>
                            <span className="font-bold text-emerald-650">{stat.passedQuizzes} graduated</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Best Class Quiz Average:</span>
                            <span className="font-bold text-indigo-650">{stat.averageScore !== null ? `${stat.averageScore}%` : 'N/A'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Activities list */}
                <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm font-sans">
                  <h4 className="font-bold text-slate-900 text-sm mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <Activity className="w-4.5 h-4.5 text-pink-600" />
                    <span>Live Student Activity Feed</span>
                  </h4>

                  {analytics.recentActivity?.length === 0 ? (
                    <p className="text-slate-400 italic text-[11px] py-12 text-center">No student activity logged yet. Share app to learners to collect records!</p>
                  ) : (
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                      {analytics.recentActivity.map((act: any, idx: number) => (
                        <div key={idx} className="bg-slate-50/50 border border-slate-100 p-3.5 rounded-xl flex items-start gap-2.5 text-xs">
                          <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                            act.type === 'quiz' ? (act.passed ? 'bg-emerald-500 animate-pulse' : 'bg-red-500') : 'bg-blue-500 animate-pulse'
                          }`}></span>
                          <div>
                            <p className="text-slate-800 font-bold leading-tight text-xs">
                              {act.studentName}
                            </p>
                            <p className="text-slate-605 mt-1 text-[11px] leading-relaxed">
                              {act.type === 'quiz' ? (
                                <span>Completed Exam: <strong className="text-slate-800">{act.quizTitle}</strong> scoring <strong className="font-mono text-slate-900">{act.score}%</strong> ({act.passed ? 'PASSED' : 'FAILED'})</span>
                              ) : (
                                <span>Completed lecture: <strong className="text-slate-800">{act.lessonTitle}</strong></span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono mt-1 font-semibold">
                              {new Date(act.completedAt || act.attemptedAt).toLocaleTimeString()} • {new Date(act.completedAt || act.attemptedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

            </motion.div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
};
