// src/components/LearnerDashboard.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Course, QuizAttempt, User } from '../types.ts';
import { Search, X, Inbox, Plus, BookOpen, Clock, CheckCircle, ArrowRight, Flame } from 'lucide-react';
import { PouchDBService } from '../lib/pouchdb-service.ts';
import { apiFetch } from '../lib/api.ts';

interface LearnerDashboardProps {
  courses: Course[];
  completedLessonIds: number[];
  quizAttempts: QuizAttempt[];
  onSelectCourse: (courseId: number) => void;
  user: User | null;
  token: string | null;
  onProfileUpdated: () => void;
  initialTab?: 'my-courses' | 'browse';
}

const CAP_TINTS = ['bg-[#E8F0EE]', 'bg-[#EEE8E0]', 'bg-[#E0E8EE]', 'bg-[#EFE4EC]', 'bg-[#E9EEE0]'];

const toDayStr = (d: Date) => d.toISOString().slice(0, 10);

const getCourseInitials = (title: string): string => {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'AQ';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

const hasRealThumbnail = (course: Course): boolean => {
  const t = course.thumbnail;
  return !!t && (t.startsWith('http') || t.startsWith('data:'));
};

const greetingForHour = (): string => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export const LearnerDashboard: React.FC<LearnerDashboardProps> = ({
  courses,
  completedLessonIds,
  quizAttempts,
  onSelectCourse,
  user,
  token,
  initialTab,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<number[]>([]);
  const [dayStreak, setDayStreak] = useState(0);

  useEffect(() => {
    const loadEnrolled = async () => {
      const ids = await PouchDBService.getEnrolledCourseIds();
      setEnrolledCourseIds(ids);
    };
    loadEnrolled();
  }, []);

  // Best-effort day streak: consecutive days of quiz attempts / queued lesson completions
  useEffect(() => {
    const computeStreak = async () => {
      const queue = await PouchDBService.getSyncQueue();
      const dates: string[] = [];
      quizAttempts.forEach((a) => {
        if (a.attemptedAt) dates.push(String(a.attemptedAt).slice(0, 10));
      });
      queue.lessonCompletions.forEach((c: any) => {
        if (c.completedAt) dates.push(String(c.completedAt).slice(0, 10));
      });
      const days = Array.from(new Set(dates)).sort().reverse();
      if (days.length === 0) {
        setDayStreak(0);
        return;
      }
      const dayMs = 86400000;
      const today = toDayStr(new Date());
      let idx = days.indexOf(today);
      if (idx === -1) {
        idx = days.indexOf(toDayStr(new Date(Date.now() - dayMs)));
        if (idx === -1) {
          setDayStreak(0);
          return;
        }
      }
      let streak = 1;
      let prev = days[idx];
      for (let i = idx + 1; i < days.length; i++) {
        const expected = toDayStr(new Date(new Date(prev + 'T00:00:00Z').getTime() - dayMs));
        if (days[i] === expected) {
          streak++;
          prev = days[i];
        } else {
          break;
        }
      }
      setDayStreak(streak);
    };
    computeStreak();
  }, [quizAttempts]);

  const handleEnroll = async (courseId: number) => {
    await PouchDBService.enrollInCourse(courseId);
    // Persist enrollment to server (best-effort — offline will sync later)
    if (token) {
      apiFetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      }).catch(() => {});
    }
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

  // Show search/filter toolbar only in Discover view
  const showSearchToolbar = initialTab === 'browse';

  // Filter courses based on active search state and category filter
  const filteredCourses = courses.filter((course) => {
    const categoryName = getCourseCategory(course);
    const categoryMatch = selectedCategory === 'All' || categoryName === selectedCategory;
    const searchLow = searchQuery.toLowerCase().trim();
    const searchMatch =
      !searchLow ||
      course.title.toLowerCase().includes(searchLow) ||
      course.description.toLowerCase().includes(searchLow) ||
      categoryName.toLowerCase().includes(searchLow);

    return categoryMatch && searchMatch;
  });

  // Split into "My Courses" (Enrolled) and "Explore" (un-enrolled available courses)
  const enrolledCourses = filteredCourses.filter((c) => isEnrolled(c.id));
  const exploreCourses = filteredCourses.filter((c) => !isEnrolled(c.id));

  // Limit My Courses to exactly 5 display entries as requested
  const displayEnrolledCourses = enrolledCourses.slice(0, 5);

  // Categories helper
  const dynamicCategories = Array.from(new Set(courses.map(getCourseCategory))) as string[];
  const categoryCounts = dynamicCategories.reduce(
    (acc, cat) => {
      const count = courses.filter((c) => {
        const isCat = getCourseCategory(c) === cat;
        const searchLow = searchQuery.toLowerCase().trim();
        const isSearchMatch =
          !searchLow ||
          c.title.toLowerCase().includes(searchLow) ||
          c.description.toLowerCase().includes(searchLow) ||
          cat.toLowerCase().includes(searchLow);
        return isCat && isSearchMatch;
      }).length;
      acc[cat] = count;
      return acc;
    },
    {} as Record<string, number>,
  );

  const totalMatchingCount = courses.filter((c) => {
    const cat = getCourseCategory(c);
    const searchLow = searchQuery.toLowerCase().trim();
    return (
      !searchLow ||
      c.title.toLowerCase().includes(searchLow) ||
      c.description.toLowerCase().includes(searchLow) ||
      cat.toLowerCase().includes(searchLow)
    );
  }).length;

  const completedIn = (c: Course) => (c.lessons || []).filter((l) => completedLessonIds.includes(l.id)).length;
  const continueCourse = (() => {
    if (enrolledCourses.length === 0) return null;
    return (
      enrolledCourses.find((c) => (c.lessons || []).some((l) => !completedLessonIds.includes(l.id))) ||
      enrolledCourses[0]
    );
  })();
  const continueTotal = continueCourse?.lessons?.length || 0;
  const continueDone = continueCourse ? completedIn(continueCourse) : 0;
  const continuePct = continueTotal > 0 ? Math.round((continueDone / continueTotal) * 100) : 0;
  const nextLessonIndex = continueCourse
    ? (continueCourse.lessons || []).findIndex((l) => !completedLessonIds.includes(l.id))
    : -1;
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'learner';

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-4" id="learner-dashboard">
      {/* Greeting */}
      <div className="greeting mb-5">
        <h2 className="font-display text-2xl font-bold text-ink tracking-tight leading-snug">
          {greetingForHour()}, {firstName}.
        </h2>
        <p className="text-sm text-ink-2 mt-1">
          {continueCourse
            ? nextLessonIndex >= 0
              ? `You have ${continueTotal - nextLessonIndex} lesson${continueTotal - nextLessonIndex > 1 ? 's' : ''} left in your current course.`
              : 'You finished all lessons in your current course.'
            : 'Pick a course below to start your learning journey.'}
        </p>
      </div>

      {/* Day streak */}
      {dayStreak > 0 && (
        <div className="flex items-center gap-3 bg-ochre-dim rounded-lg px-4 py-3 mb-6">
          <span className="font-display text-2xl font-bold text-ochre leading-none">{dayStreak}</span>
          <div className="text-xs text-[#8A6B20]">
            <strong className="block text-sm text-[#6B5010] font-semibold flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-ochre" /> Day streak
            </strong>
            Keep going — you're building a habit.
          </div>
        </div>
      )}

      {/* Continue Learning — always visible at top when a course is in progress */}
      {continueCourse && (
        <div className="bg-navy rounded-xl p-5 flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-lg bg-navy-2 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 text-navtext/60" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-navtext/50 mb-1">Continue learning</div>
            <div className="font-display text-base text-white font-semibold truncate">{continueCourse.title}</div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden max-w-[280px] my-1.5">
              <div className="h-full bg-ochre rounded-full" style={{ width: `${continuePct}%` }}></div>
            </div>
            <div className="text-[11px] font-mono text-navtext/50">
              {nextLessonIndex >= 0
                ? `Lesson ${nextLessonIndex + 1} of ${continueTotal} · ${(continueCourse.lessons || [])[nextLessonIndex]?.title}`
                : `All ${continueTotal} lessons complete`}
            </div>
          </div>
          <button
            onClick={() => onSelectCourse(continueCourse.id)}
            className="bg-ochre text-white font-semibold text-[13px] px-5 py-2.5 rounded-lg whitespace-nowrap shrink-0 hover:brightness-95 transition-all cursor-pointer"
          >
            Continue →
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar — only visible in Discover view */}
      {showSearchToolbar && (
        <div className="bg-paper-2 border border-rule rounded-xl p-5 shadow-sm mb-6" id="course-filter-panel">
          <label
            htmlFor="course-search-field"
            className="block text-xs font-bold text-ink-2 mb-2 font-mono uppercase tracking-wider"
          >
            Discover classes &amp; syllabus chapters
          </label>

          <div className="relative w-full mb-4">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-ink-3">
              <Search className="w-4 h-4" />
            </div>
            <input
              id="course-search-field"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search classes by title, topic, syllabus keywords..."
              className="w-full h-11 pl-10 pr-10 bg-paper border border-rule rounded-lg text-ink placeholder:text-ink-3 font-medium text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-ochre/30 focus:border-ochre transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-ink-3 hover:text-ink transition-colors cursor-pointer"
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  selectedCategory === 'All'
                    ? 'bg-navy text-white shadow-sm'
                    : 'bg-paper text-ink-2 hover:bg-white border border-rule'
                }`}
                id="category-pill-all"
              >
                <span>All Courses</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono leading-none ${
                    selectedCategory === 'All' ? 'bg-white/20 text-white' : 'bg-rule text-ink-3'
                  }`}
                >
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-ochre text-white shadow-sm'
                        : 'bg-paper text-ink-2 hover:bg-white border border-rule'
                    }`}
                    id={`category-pill-${cat.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                  >
                    <span>{cat}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono leading-none ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-rule text-ink-3'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === Flat layout: My courses section → Explore section === */}
      <div className="space-y-8">
        {/* My Courses Section */}
        <section id="my-courses-section">
          <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-4 flex items-center gap-2">
            My courses
            {enrolledCourses.length > 0 && (
              <span className="bg-ochre-dim text-ochre text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
                {enrolledCourses.length}
              </span>
            )}
          </h3>

          {enrolledCourses.length === 0 ? (
            <div
              className="bg-paper-2 border border-dashed border-rule p-10 text-center rounded-xl"
              id="empty-my-courses"
            >
              <Inbox className="w-10 h-10 text-ink-3 mx-auto mb-2" />
              <p className="text-sm font-bold text-ink">You haven't chosen any courses yet.</p>
              <p className="text-xs text-ink-3 mt-1 max-w-sm mx-auto">
                Our content team has uploaded world-class study materials. Browse the courses below to choose what you
                want to learn!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {displayEnrolledCourses.map((course) => {
                const courseLessons = course.lessons || [];
                const courseCompletedCount = courseLessons.filter((l) => completedLessonIds.includes(l.id)).length;
                const progressPct =
                  courseLessons.length > 0 ? Math.round((courseCompletedCount / courseLessons.length) * 100) : 0;
                const showImg = hasRealThumbnail(course);

                return (
                  <div
                    key={`my-course-${course.id}`}
                    onClick={() => onSelectCourse(course.id)}
                    className="bg-paper border border-rule rounded-lg overflow-hidden cursor-pointer transition-colors hover:border-ink-3/60"
                    id={`my-course-card-${course.id}`}
                  >
                    <div className="h-20 relative flex items-center justify-center overflow-hidden">
                      {showImg ? (
                        <img
                          src={course.thumbnail || ''}
                          alt={course.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className={`w-full h-full ${CAP_TINTS[course.id % CAP_TINTS.length]} flex items-center justify-center`}
                        >
                          <span className="font-mono text-2xl font-medium text-ink opacity-30">
                            {getCourseInitials(course.title)}
                          </span>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/10">
                        <div className="h-full bg-ochre" style={{ width: `${progressPct}%` }}></div>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1 truncate">
                        {getCourseCategory(course)}
                      </div>
                      <div className="text-[13px] font-semibold text-ink leading-snug mb-1 line-clamp-2 min-h-[34px]">
                        {course.title}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-ink-3">
                        <span>
                          {courseCompletedCount} of {courseLessons.length} lessons
                        </span>
                        <span className="font-mono text-ochre font-medium">{progressPct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Explore Section — courses not yet enrolled */}
        <section id="explore-courses-section">
          <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-4">Explore</h3>

          {courses.length === 0 ? (
            <div className="bg-paper-2 border border-dashed border-rule p-10 text-center rounded-xl">
              <Inbox className="w-10 h-10 text-ink-3 mx-auto mb-2" />
              <p className="text-sm font-bold text-ink">No courses available.</p>
              <p className="text-xs text-ink-3 mt-1 max-w-sm mx-auto">
                Log in as an Admin to create custom courses, syllabus reading chapters, and secure exam quizzes.
              </p>
            </div>
          ) : exploreCourses.length === 0 ? (
            <div
              className="bg-success/5 border border-dashed border-success/30 p-10 text-center rounded-xl"
              id="all-courses-enrolled"
            >
              <CheckCircle className="w-10 h-10 text-success mx-auto mb-2" />
              <p className="text-sm font-bold text-ink">You have accepted all available courses!</p>
              <p className="text-xs text-ink-2 mt-1 max-w-sm mx-auto font-medium">
                They are now safe inside your "My courses" list. Let's start studying!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {exploreCourses.map((course) => {
                const courseLessons = course.lessons || [];
                const estMinutes = courseLessons.length * 20;
                const hours = Math.floor(estMinutes / 60);
                const mins = estMinutes % 60;
                const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                const showImg = hasRealThumbnail(course);

                return (
                  <div
                    key={`explore-${course.id}`}
                    className="bg-paper border border-rule rounded-lg overflow-hidden flex flex-col"
                    id={`course-card-${course.id}`}
                  >
                    <div className="h-20 relative flex items-center justify-center overflow-hidden">
                      {showImg ? (
                        <img
                          src={course.thumbnail || ''}
                          alt={course.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className={`w-full h-full ${CAP_TINTS[course.id % CAP_TINTS.length]} flex items-center justify-center`}
                        >
                          <span className="font-mono text-2xl font-medium text-ink opacity-30">
                            {getCourseInitials(course.title)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-3 flex flex-col flex-1">
                      <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1 truncate">
                        {getCourseCategory(course)}
                      </div>
                      <div className="text-[13px] font-semibold text-ink leading-snug line-clamp-2 min-h-[34px]">
                        {course.title}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-ink-3 mt-1 mb-3">
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {courseLessons.length} lessons
                        </span>
                        {courseLessons.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {durationStr}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleEnroll(course.id)}
                        className="mt-auto w-full h-9 bg-accent hover:opacity-90 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Choose Course</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
