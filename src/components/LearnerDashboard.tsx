// src/components/LearnerDashboard.tsx
import React, { useState, useEffect } from 'react';
import { Course, Lesson, QuizAttempt, User } from '../types.ts';
import { 
  BookOpen, CheckCircle, ArrowRight, Search, X, 
  Inbox, Sparkles, Plus, GraduationCap, Clock, Check
} from 'lucide-react';
import { PouchDBService } from '../lib/pouchdb-service.ts';
import { getCourseImage } from '../lib/utils.ts';
import { motion, AnimatePresence } from 'motion/react';

interface LearnerDashboardProps {
  courses: Course[];
  completedLessonIds: number[];
  quizAttempts: QuizAttempt[];
  onSelectCourse: (courseId: number) => void;
  user: User | null;
  token: string | null;
  onProfileUpdated: () => void;
}

export const LearnerDashboard: React.FC<LearnerDashboardProps> = ({
  courses,
  completedLessonIds,
  onSelectCourse,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<number[]>([]);
  
  // Tab/navigation state for the minimal student app
  const [activeTab, setActiveTab] = useState<'my-courses' | 'browse'>('my-courses');
  const [hasSetDefaultTab, setHasSetDefaultTab] = useState(false);

  useEffect(() => {
    const loadEnrolled = async () => {
      const ids = await PouchDBService.getEnrolledCourseIds();
      setEnrolledCourseIds(ids);
    };
    loadEnrolled();
  }, []);

  const handleEnroll = async (courseId: number) => {
    await PouchDBService.enrollInCourse(courseId);
    const ids = await PouchDBService.getEnrolledCourseIds();
    setEnrolledCourseIds(ids);
  };

  const getCourseCategory = (course: Course): string => {
    if ((course as any).category) {
      return (course as any).category;
    }
    const text = `${course.title} ${course.description}`.toLowerCase();
    if (
      text.includes('quant') || 
      text.includes('math') || 
      text.includes('stat') || 
      text.includes('calculus') || 
      text.includes('probab') || 
      text.includes('algebra') ||
      text.includes('model') ||
      text.includes('science')
    ) {
      return 'Quantitative Sciences';
    }
    if (
      text.includes('agri') || 
      text.includes('crop') || 
      text.includes('soil') || 
      text.includes('farm') || 
      text.includes('estim') ||
      text.includes('yield')
    ) {
      return 'Agricultural Estimation';
    }
    if (
      text.includes('scale') || 
      text.includes('system') || 
      text.includes('dynamic') || 
      text.includes('tech') || 
      text.includes('digit') ||
      text.includes('programm')
    ) {
      return 'Systems & Technology';
    }
    return 'General Education';
  };

  const isEnrolled = (courseId: number) => {
    return enrolledCourseIds.includes(courseId);
  };

  // Filter courses based on active search state and category filter
  const filteredCourses = courses.filter(course => {
    const categoryName = getCourseCategory(course);
    const categoryMatch = selectedCategory === 'All' || categoryName === selectedCategory;
    const searchLow = searchQuery.toLowerCase().trim();
    const searchMatch = !searchLow || 
      course.title.toLowerCase().includes(searchLow) || 
      course.description.toLowerCase().includes(searchLow) ||
      categoryName.toLowerCase().includes(searchLow);
      
    return categoryMatch && searchMatch;
  });

  // Split into "My Courses" (Enrolled) and "Featured Courses" (un-enrolled available courses)
  const enrolledCourses = filteredCourses.filter(c => isEnrolled(c.id));
  const featuredCourses = filteredCourses.filter(c => !isEnrolled(c.id));

  // Limit My Courses to exactly 5 display entries as requested
  const displayEnrolledCourses = enrolledCourses.slice(0, 5);

  // Auto-switch tabs for new students: if 0 enrolled, default to 'browse', otherwise default to 'my-courses'
  useEffect(() => {
    if (courses.length > 0 && !hasSetDefaultTab) {
      if (enrolledCourseIds.length === 0) {
        setActiveTab('browse');
      } else {
        setActiveTab('my-courses');
      }
      setHasSetDefaultTab(true);
    }
  }, [enrolledCourseIds, courses, hasSetDefaultTab]);

  // Categories helper
  const dynamicCategories = Array.from(new Set(courses.map(getCourseCategory))) as string[];
  const categoryCounts = dynamicCategories.reduce((acc, cat) => {
    const count = courses.filter(c => {
      const isCat = getCourseCategory(c) === cat;
      const searchLow = searchQuery.toLowerCase().trim();
      const isSearchMatch = !searchLow || 
        c.title.toLowerCase().includes(searchLow) || 
        c.description.toLowerCase().includes(searchLow) ||
        cat.toLowerCase().includes(searchLow);
      return isCat && isSearchMatch;
    }).length;
    acc[cat] = count;
    return acc;
  }, {} as Record<string, number>);

  const totalMatchingCount = courses.filter(c => {
    const cat = getCourseCategory(c);
    const searchLow = searchQuery.toLowerCase().trim();
    return !searchLow || 
      c.title.toLowerCase().includes(searchLow) || 
      c.description.toLowerCase().includes(searchLow) ||
      cat.toLowerCase().includes(searchLow);
  }).length;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-4" id="learner-dashboard">
      
      {/* Search & Filter Toolbar: Discover Classes & Syllabus Chapters */}
      <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm mb-6" id="course-filter-panel">
        <label htmlFor="course-search-field" className="block text-sm font-bold text-slate-800 mb-2 font-sans uppercase tracking-wider text-xs">
          🔍 Discover Classes & Syllabus Chapters
        </label>
        
        <div className="relative w-full mb-4">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="course-search-field"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search classes by title, topic, syllabus keywords..."
            className="w-full h-11 pl-10 pr-10 bg-slate-50 border border-slate-150 rounded-2xl text-slate-800 placeholder-slate-400 font-sans font-semibold text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              title="Clear search context"
              id="clear-search-btn"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {courses.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              onClick={() => setSelectedCategory('All')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-155 cursor-pointer ${
                selectedCategory === 'All'
                  ? 'bg-slate-900 text-white shadow-sm scale-100'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
              id="category-pill-all"
            >
              <span>All Courses</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono leading-none ${
                selectedCategory === 'All' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {totalMatchingCount}
              </span>
            </button>

            {dynamicCategories.map((cat) => {
              const isSelected = selectedCategory === cat;
              const count = categoryCounts[cat] || 0;
              
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-155 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm scale-100'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                  id={`category-pill-${cat.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                >
                  <span>{cat}</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono leading-none ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modern Canvas-style Tab Navigation (Extremely Minimal & Legible) */}
      <div className="flex border-b border-slate-200 mb-6 font-sans">
        <button
          onClick={() => setActiveTab('my-courses')}
          className={`pb-3 px-5 text-sm font-bold relative transition-all cursor-pointer ${
            activeTab === 'my-courses' ? 'text-indigo-600 font-extrabold' : 'text-slate-500 hover:text-slate-800'
          }`}
          id="tab-btn-my-courses"
        >
          <span>My courses</span>
          {enrolledCourses.length > 0 && (
            <span className="ml-1.5 bg-indigo-50 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
              {enrolledCourses.length}
            </span>
          )}
          {activeTab === 'my-courses' && (
            <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('browse')}
          className={`pb-3 px-5 text-sm font-bold relative transition-all cursor-pointer ${
            activeTab === 'browse' ? 'text-indigo-600 font-extrabold' : 'text-slate-500 hover:text-slate-800'
          }`}
          id="tab-btn-featured-courses"
        >
          <span>Featured courses</span>
          {featuredCourses.length > 0 && (
            <span className="ml-1.5 bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold animate-pulse">
              {featuredCourses.length}
            </span>
          )}
          {activeTab === 'browse' && (
            <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
          )}
        </button>
      </div>

      {/* Main Container rendering tabs dynamically */}
      <div className="min-h-[350px]">
        
        {/* Tab 1: My Courses */}
        {activeTab === 'my-courses' && (
          <div id="my-courses-tab-view">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-850 uppercase tracking-wider font-sans">
                📚 Active Enrolled Classes
              </h3>
              {enrolledCourses.length > 5 && (
                <span className="text-[11px] font-mono text-amber-600 font-semibold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100">
                  Showing 5 of {enrolledCourses.length} classes
                </span>
              )}
            </div>

            {enrolledCourses.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-200 p-10 text-center rounded-3xl" id="empty-my-courses">
                <Inbox className="w-10 h-10 text-slate-350 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">You haven't chosen any courses yet.</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Instructors have uploaded world-class study materials. Select "Featured courses" to choose what you want to learn!
                </p>
                <button
                  onClick={() => setActiveTab('browse')}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Choose Available Courses</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayEnrolledCourses.map((course) => {
                  const courseLessons = course.lessons || [];
                  const courseCompletedCount = courseLessons.filter(l => completedLessonIds.includes(l.id)).length;
                  const progressPct = courseLessons.length > 0 
                    ? Math.round((courseCompletedCount / courseLessons.length) * 100) 
                    : 0;

                  return (
                    <motion.div 
                      key={`my-course-${course.id}`}
                      whileHover={{ y: -3 }}
                      transition={{ duration: 0.15 }}
                      className="bg-white border border-slate-150 rounded-[2rem] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                      id={`my-course-card-${course.id}`}
                    >
                      <div>
                        <div className="relative h-40 overflow-hidden bg-slate-50">
                          <img 
                            src={getCourseImage(course)} 
                            alt={course.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-4 left-4 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider font-mono shadow-sm">
                            My Course
                          </div>
                        </div>

                        <div className="p-5 space-y-3">
                          <div className="flex items-center gap-1.5">
                            <span className="bg-indigo-50 text-indigo-700 font-bold text-[9px] uppercase px-2 py-0.5 rounded-full border border-indigo-100 font-mono tracking-wider">
                              Course #{course.id}
                            </span>
                            <span className="bg-slate-100 text-slate-600 font-bold text-[9px] uppercase px-2 py-0.5 rounded-full border border-slate-200 font-mono tracking-wider">
                              {getCourseCategory(course)}
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-slate-900 tracking-tight leading-snug line-clamp-1">
                            {course.title}
                          </h4>
                          <p className="text-slate-500 text-xs leading-relaxed line-clamp-2">
                            {course.description}
                          </p>

                          <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between items-center text-xs font-mono font-bold text-slate-600">
                              <span>Progress</span>
                              <span>{progressPct}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-emerald-500 h-full rounded-full transition-all duration-300" 
                                style={{ width: `${progressPct}%` }}
                              ></div>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 font-mono">
                              {courseCompletedCount} of {courseLessons.length} chapters completed
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-5 pt-0">
                        <button
                          onClick={() => onSelectCourse(course.id)}
                          className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer font-sans"
                        >
                          <span>Start Learning</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* "+ Get/Add More Courses" simple navigation link */}
            {enrolledCourses.length > 0 && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={() => setActiveTab('browse')}
                  className="px-5 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-250 text-indigo-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer uppercase tracking-wider"
                >
                  <Plus className="w-4 h-4 text-indigo-650" />
                  <span>+ Get / Add More Courses</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Browse & Choose Courses (Featured Courses) */}
        {activeTab === 'browse' && (
          <div id="featured-courses-tab-view">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-850 uppercase tracking-wider font-sans">
                ✨ Featured Academic Courses (Choose to Study)
              </h3>
            </div>

            {courses.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-200 p-10 text-center rounded-3xl">
                <Inbox className="w-10 h-10 text-slate-350 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">No courses available.</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Log in as an Instructor / Teacher to create custom courses, syllabus reading chapters, and secure exam quizzes.
                </p>
              </div>
            ) : featuredCourses.length === 0 ? (
              <div className="bg-emerald-50/50 border border-dashed border-emerald-200 p-10 text-center rounded-3xl" id="all-courses-enrolled">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-bold text-emerald-800">🎉 You have accepted all available courses!</p>
                <p className="text-xs text-emerald-600 mt-1 max-w-sm mx-auto font-medium">
                  They are now safe inside your "My courses" list. Let's start studying!
                </p>
                <button
                  onClick={() => setActiveTab('my-courses')}
                  className="mt-4 h-10 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 mx-auto"
                >
                  <span>Go to My courses</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {featuredCourses.map((course) => {
                    const courseLessons = course.lessons || [];
                    const estMinutes = courseLessons.length * 20;
                    const hours = Math.floor(estMinutes / 60);
                    const mins = estMinutes % 60;
                    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

                    return (
                      <motion.div 
                        key={`featured-browse-${course.id}`}
                        whileHover={{ y: -3 }}
                        transition={{ duration: 0.15 }}
                        className="bg-white border border-slate-150 rounded-[2rem] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                        id={`course-card-${course.id}`}
                      >
                        <div>
                          <div className="relative h-40 overflow-hidden bg-slate-50">
                            <img 
                              src={getCourseImage(course)} 
                              alt={course.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-4 left-4 bg-indigo-650 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider font-mono shadow-sm">
                              Featured
                            </div>
                          </div>

                          <div className="p-5 space-y-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="bg-indigo-50 text-indigo-700 font-bold text-[9px] uppercase px-2 py-0.5 rounded-full border border-indigo-100 font-mono tracking-wider">
                                Course #{course.id}
                              </span>
                              <span className="bg-slate-100 text-slate-600 font-bold text-[9px] uppercase px-2 py-0.5 rounded-full border border-slate-200 font-mono tracking-wider">
                                {getCourseCategory(course)}
                              </span>
                            </div>
                            <h4 className="text-base font-bold text-slate-900 tracking-tight leading-snug line-clamp-1">
                              {course.title}
                            </h4>
                            <p className="text-slate-500 text-xs leading-relaxed line-clamp-2">
                              {course.description}
                            </p>

                            <div className="flex items-center gap-3.5 text-xs font-semibold text-slate-400 pt-1.5 font-sans">
                              <span className="flex items-center gap-1 text-[11px]">
                                <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                                <span>{courseLessons.length} lessons</span>
                              </span>
                              {courseLessons.length > 0 && (
                                <span className="flex items-center gap-1 text-[11px]">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{durationStr}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="p-5 pt-0">
                          <button
                            onClick={() => handleEnroll(course.id)}
                            className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer font-sans"
                          >
                            <Plus className="w-4 h-4 text-white" />
                            <span>+ Choose Course</span>
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Big Visual "Start Learning" Button after choosing courses */}
                {enrolledCourses.length > 0 && (
                  <div className="mt-10 bg-slate-50 border border-slate-200 p-6 rounded-[2rem] text-center max-w-lg mx-auto">
                    <p className="text-xs font-extrabold text-indigo-700 uppercase tracking-widest mb-1.5">
                      Ready to study?
                    </p>
                    <p className="text-slate-600 text-xs font-medium max-w-sm mx-auto mb-4 leading-relaxed">
                      You have selected <strong>{enrolledCourses.length}</strong> dynamic course topics to study. Click below to begin learning right away!
                    </p>
                    <button
                      onClick={() => setActiveTab('my-courses')}
                      className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <span>✨ Start Learning (Go to My Courses)</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
