// src/components/LearnerCoursePlayer.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Course, Lesson, Quiz, Question, QuizAttempt } from '../types.ts';
import { PouchDBService, getDocMimeType } from '../lib/pouchdb-service.ts';
import { getCourseImage, toYouTubeEmbed } from '../lib/utils.ts';
import { apiFetch } from '../lib/api.ts';
import { withBackoff } from '../lib/retry.ts';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { ProgressTree } from './ProgressTree.tsx';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  Play,
  FileText,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  WifiOff,
  Award,
  RefreshCw,
  Sparkles,
  Check,
  GraduationCap,
  Clock,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LearnerCoursePlayerProps {
  courseId: number;
  token: string | null;
  onBack: () => void;
  onProgressUpdated: () => void;
}

export const LearnerCoursePlayer: React.FC<LearnerCoursePlayerProps> = ({
  courseId,
  token,
  onBack,
  onProgressUpdated,
}) => {
  // Loading & Data states
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<number[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Course Player Navigation state
  const [activeLessonIndex, setActiveLessonIndex] = useState<number>(-1);
  const [viewingQuiz, setViewingQuiz] = useState<boolean>(false);

  // Interactive Quiz Engine state
  const [selectedAnswers, setSelectedAnswers] = useState<{ [qId: number]: number }>({});
  const [quizResult, setQuizResult] = useState<{
    score: number;
    passed: boolean;
    correctCount: number;
    totalQuestions: number;
  } | null>(null);
  const [quizLoading, setQuizLoading] = useState<boolean>(false);
  const [quizPendingSync, setQuizPendingSync] = useState<boolean>(false);

  const [completionData, setCompletionData] = useState<{ completionId: string; completedAt: string } | null>(null);
  const completionInFlight = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState<string>('video/mp4');

  const isOnline = useOnlineStatus();

  const loadCourseData = async () => {
    setLoading(true);
    setError('');

    // Fetch from PouchDB/local first regardless, so we have offline compatibility
    const localCourse = await PouchDBService.getCachedCourseById(courseId);
    if (localCourse) {
      setCourse(localCourse);
      setLessons(localCourse.lessons || []);
      setQuiz(localCourse.quiz || null);
    }

    const localProgress = await PouchDBService.getUserProgress();
    setCompletedLessonIds(localProgress.completedLessonIds);

    if (localCourse?.quiz) {
      const filteredAttempts = localProgress.quizAttempts.filter((a) => a.quizId === localCourse.quiz!.id);
      setQuizAttempts(filteredAttempts);
    }

    // Try sync online if possible
    if (navigator.onLine && token) {
      try {
        const { ok, data } = await apiFetch(`/api/courses/${courseId}`);
        if (ok) {
          setCourse(data.course);
          setLessons(data.lessons);
          setQuiz(data.quiz);
          setCompletedLessonIds(data.completedLessonIds);
          setQuizAttempts(data.quizAttempts);

          // Update offline cache
          const courseToCache: Course = {
            ...data.course,
            lessons: data.lessons,
            quiz: data.quiz,
          };
          await PouchDBService.cacheCourses([courseToCache]);
          await PouchDBService.saveUserProgress(data.completedLessonIds, data.quizAttempts);
        }
      } catch (err) {
        console.warn('Network fetch failed; continuing with offline cached data.', err);
      }
    }

    const queue = await PouchDBService.getSyncQueue();
    if (localCourse?.quiz) {
      const pending = queue.quizSubmissions.some((s) => s.quizId === localCourse.quiz!.id);
      setQuizPendingSync(pending);
    }

    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCourseData();
  }, [courseId, token]);

  useEffect(() => {
    if (!course || completionData || completionInFlight.current) return;
    const allLessonsDone = lessons.length > 0 && lessons.every((l) => completedLessonIds.includes(l.id));
    const quizAlreadyPassed = quizAttempts.some((a) => a.passed);
    if (allLessonsDone && quizAlreadyPassed && navigator.onLine && token) {
      completionInFlight.current = true;
      withBackoff(() =>
        apiFetch<{ completionId: string; completedAt: string }>(`/api/courses/${courseId}/complete`, {
          method: 'POST',
        }),
      )
        .then(({ ok, data }) => {
          if (ok && data) {
            setCompletionData(data);
          }
        })
        .catch(() => {
          // Non-critical — completion will sync later
        })
        .finally(() => {
          completionInFlight.current = false;
        });
    }
  }, [course, lessons, completedLessonIds, quizAttempts, courseId, token]);

  useEffect(() => {
    let cancelled = false;
    const updateVideo = async () => {
      const lesson = lessons[activeLessonIndex];
      if (!lesson?.videoUrl) {
        if (!cancelled) setVideoSrc(null);
        return;
      }
      if (lesson.videoUrl.startsWith('doc:')) {
        const docId = lesson.videoUrl.slice(4);
        const mimeType = await getDocMimeType(docId, token ?? '');
        if (!cancelled) {
          setVideoMime(mimeType);
          setVideoSrc(`/api/documents/${docId}/file${token ? `?token=${encodeURIComponent(token)}` : ''}`);
        }
      } else {
        if (!cancelled) {
          setVideoSrc(null);
          setVideoMime('video/mp4');
        }
      }
    };
    updateVideo();
    return () => {
      cancelled = true;
    };
  }, [activeLessonIndex, lessons, token]);

  const handleMarkAsComplete = async (lessonId: number) => {
    if (!completedLessonIds.includes(lessonId)) {
      const updated = [...completedLessonIds, lessonId];
      setCompletedLessonIds(updated);
    }

    await PouchDBService.queueLessonCompletionOffline(lessonId);

    if (navigator.onLine && token) {
      try {
        await withBackoff(() =>
          apiFetch(`/api/lessons/${lessonId}/complete`, {
            method: 'POST',
          }),
        );
      } catch (e) {
        console.warn('Server completion post skipped offline; queued in PouchDB.');
      }
    }

    onProgressUpdated();
  };

  const handleOptionSelect = (questionId: number, optionIndex: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const handleQuizSubmit = async () => {
    if (!quiz) return;

    const questions = quiz.questions || [];
    const answersArray: number[] = [];

    let allAnswered = true;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const answer = selectedAnswers[q.id];
      if (answer === undefined) {
        allAnswered = false;
        break;
      }
      answersArray[i] = answer;
    }

    if (!allAnswered) {
      alert('Please answer all questions before submitting.');
      return;
    }

    setQuizLoading(true);

    if (navigator.onLine && token) {
      try {
        const { ok, data } = await withBackoff(() =>
          apiFetch(`/api/quizzes/${quiz.id}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: answersArray }),
          }),
        );

        if (ok) {
          setQuizResult({
            score: data.score,
            passed: data.passed,
            correctCount: data.correctCount,
            totalQuestions: data.totalQuestions,
          });

          await loadCourseData();
          onProgressUpdated();
        } else {
          throw new Error('Server submission error');
        }
      } catch (err) {
        console.error('Quiz submission network error; fallback to offline queue:', err);
        await queueQuizOffline(quiz.id, answersArray);
      } finally {
        setQuizLoading(false);
      }
    } else {
      await queueQuizOffline(quiz.id, answersArray);
      setQuizLoading(false);
    }
  };

  const queueQuizOffline = async (quizId: number, answers: number[]) => {
    await PouchDBService.queueQuizSubmissionOffline(quizId, answers);
    setQuizPendingSync(true);
    setQuizResult({
      score: 0,
      passed: false,
      correctCount: 0,
      totalQuestions: quiz?.questions?.length || 0,
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-800 min-h-[60vh]" id="loading-stage">
        <RefreshCw className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
        <h2 className="text-xl font-bold font-sans">Compiling Lecture Terminal...</h2>
        <p className="text-slate-500 font-mono text-xs mt-1">
          Preparing high-contrast lessons, video components & tree visuals
        </p>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div
        className="bg-red-50 border border-red-200 p-8 rounded-[2rem] max-w-lg mx-auto my-12 text-center shadow-lg"
        id="error-stage"
      >
        <AlertCircle className="w-12 h-12 text-red-650 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-red-950 font-sans">Error Loading Classroom</h2>
        <p className="text-red-900 font-medium mt-2 text-sm">
          {error || 'Course details missing in local offline storage.'}
        </p>
        <button
          onClick={onBack}
          className="mt-6 h-12 w-full bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
        >
          Return to Portal
        </button>
      </div>
    );
  }

  const activeLesson: Lesson | undefined = lessons[activeLessonIndex];
  const allLessonsCompleted = lessons.length > 0 && lessons.every((l) => completedLessonIds.includes(l.id));
  const latestAttempt = quizAttempts[0] || null;
  const isQuizPassed = quizAttempts.some((a) => a.passed);

  const isSyllabusView = activeLessonIndex === -1 && !viewingQuiz;

  if (isSyllabusView) {
    const courseCompletedCount = lessons.filter((l) => completedLessonIds.includes(l.id)).length;
    const progressPct = lessons.length > 0 ? Math.round((courseCompletedCount / lessons.length) * 100) : 0;

    return (
      <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-4" id="learner-syllabus-view">
        {/* Header Back Link */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="h-11 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-200 px-4 flex items-center justify-center gap-2 active:scale-95 transition-all text-xs shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>BACK TO DASHBOARD</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: Progress Tree */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-4">
              <ProgressTree
                lessons={lessons}
                completedLessonIds={completedLessonIds}
                quizPassed={isQuizPassed}
                courseTitle={course.title}
              />
            </div>
          </div>

          {/* RIGHT COLUMN: Course Content */}
          <div className="lg:col-span-8 space-y-6">
            {/* Course Banner Card */}
            <div className="bg-white border border-slate-150 rounded-[2rem] overflow-hidden shadow-sm">
              <div className="h-48 md:h-56 bg-slate-100 relative">
                <img
                  src={getCourseImage(course)}
                  alt={course.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent flex items-end p-6 md:p-8">
                  <div className="text-white space-y-1">
                    <span className="bg-emerald-500 text-white text-[9px] uppercase px-2.5 py-0.5 rounded-full font-mono tracking-wider">
                      Active Syllabus
                    </span>
                    <h2 className="text-xl md:text-2xl font-black tracking-tight">{course.title}</h2>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-8 space-y-5">
                <div>
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest font-mono mb-2">
                    About This Course
                  </h3>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed">{course.description}</p>
                </div>

                {/* Syllabus Progress */}
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center text-xs font-mono font-black text-slate-700">
                    <span>COURSE PROGRESS</span>
                    <span>
                      {courseCompletedCount} of {lessons.length} units completed ({progressPct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    ></div>
                  </div>
                </div>

                {/* Completion Banner */}
                {allLessonsCompleted && isQuizPassed && completionData && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-4">
                    <div className="bg-emerald-500 text-white p-2.5 rounded-xl shrink-0">
                      <Award className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-emerald-900 font-sans">Course Completed!</h3>
                      <p className="text-sm font-medium text-emerald-700 mt-1">
                        You have successfully completed this course.
                        {completionData.completedAt && (
                          <span className="block text-xs font-mono mt-0.5 text-emerald-600">
                            Completed {new Date(completionData.completedAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Course Topics List */}
            <div className="bg-white border border-slate-150 rounded-[2rem] p-6 md:p-8 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <span>Course Topics</span>
              </h3>

              <div className="space-y-3">
                {lessons.map((lesson, idx) => {
                  const isDone = completedLessonIds.includes(lesson.id);
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => {
                        setActiveLessonIndex(idx);
                        setViewingQuiz(false);
                      }}
                      className="w-full bg-white border border-slate-150 hover:border-slate-250 p-4 rounded-2xl text-left flex items-center justify-between gap-4 transition-all shadow-sm hover:shadow active:scale-[0.99] cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {isDone ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                            <Check className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-slate-200 shrink-0 bg-white"></div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate leading-snug">{lesson.title}</p>
                          <p className="text-[10px] font-semibold text-slate-500 mt-1 flex items-center gap-1 font-mono uppercase">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Topic {idx + 1} • Lecture Reading & Video</span>
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-450 font-mono shrink-0">15 min</span>
                    </button>
                  );
                })}

                {quiz && (
                  <button
                    onClick={() => {
                      setViewingQuiz(true);
                      setActiveLessonIndex(-1);
                    }}
                    disabled={!allLessonsCompleted && !isQuizPassed}
                    className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between gap-4 transition-all ${
                      isQuizPassed
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : !allLessonsCompleted
                          ? 'bg-slate-50 border-slate-150 text-slate-500 cursor-not-allowed opacity-60'
                          : 'bg-amber-50 border-amber-200 hover:border-amber-300 text-amber-955 cursor-pointer hover:shadow active:scale-[0.99]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                          isQuizPassed
                            ? 'bg-emerald-500 border-emerald-600 text-white'
                            : 'bg-white border-amber-300 text-amber-600'
                        }`}
                      >
                        <Award className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm leading-snug truncate">Final Assessment Quiz</p>
                        <p className="text-[10px] font-semibold mt-1 font-mono uppercase">
                          {isQuizPassed
                            ? 'Graduated'
                            : !allLessonsCompleted
                              ? 'Complete all topics to unlock'
                              : 'Ready to start'}
                        </p>
                      </div>
                    </div>
                    {isQuizPassed && (
                      <span className="bg-emerald-600 text-white rounded-full text-[9px] font-bold px-2.5 py-1 uppercase tracking-wider font-mono">
                        Pass
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-2" id="learner-course-player">
      {/* 1. Header Navigation Rail */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setActiveLessonIndex(-1);
              setViewingQuiz(false);
            }}
            className="h-11 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-200 px-4 flex items-center justify-center gap-2 active:scale-95 transition-all text-xs shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">BACK TO SYLLABUS</span>
            <span className="sm:hidden">BACK</span>
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-11 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-200 px-3 flex items-center justify-center gap-2 active:scale-95 transition-all text-xs shadow-sm cursor-pointer lg:hidden"
          >
            <BookOpen className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="bg-slate-950 border border-slate-900 px-4 py-2.5 rounded-2xl flex items-center gap-2 text-white shadow-sm overflow-hidden text-ellipsis whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-xs font-bold font-sans tracking-tight text-slate-200 truncate">{course.title}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
        {/* LEFT COLUMN: Syllabus Outline — toggleable on mobile, persistent on desktop */}
        <div
          className={`${sidebarOpen ? 'fixed inset-0 z-40 bg-black/30 lg:relative lg:bg-transparent' : 'hidden lg:block'} lg:col-span-4`}
        >
          <div
            className={`${sidebarOpen ? 'absolute left-0 top-0 h-full w-80 overflow-y-auto bg-white shadow-2xl lg:relative lg:shadow-none lg:w-full' : 'hidden lg:block'} lg:sticky lg:top-4`}
          >
            {/* Mobile close button */}
            <div className="flex items-center justify-between lg:hidden mb-2 p-4 pb-0">
              <h4 className="font-bold text-slate-800 text-sm">Navigation</h4>
              <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* Curriculum Index Cards */}
            <div className="bg-white rounded-[2rem] p-5 border border-slate-150 shadow-sm">
              <h4 className="text-sm font-bold text-slate-900 mb-3 tracking-tight font-sans flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600" />
                <span>Syllabus Outline</span>
              </h4>

              <div className="space-y-2">
                {lessons.map((lesson, index) => {
                  const isCompleted = completedLessonIds.includes(lesson.id);
                  const isActive = activeLessonIndex === index && !viewingQuiz;

                  return (
                    <button
                      key={lesson.id}
                      onClick={() => {
                        setActiveLessonIndex(index);
                        setViewingQuiz(false);
                        setQuizResult(null);
                      }}
                      className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-bold shadow-inner'
                          : 'bg-slate-50/50 border-slate-100 hover:bg-slate-100/70 text-slate-750'
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="font-mono font-bold text-slate-500 text-[10px] shrink-0 mt-0.5">
                          {index + 1}.
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`text-[11px] leading-snug truncate ${isActive ? 'font-bold text-indigo-950' : 'font-medium text-slate-800'}`}
                          >
                            {lesson.title}
                          </p>
                          <p className="text-[9px] text-slate-500 mt-0.5 flex items-center gap-1 font-mono uppercase font-semibold">
                            <Clock className="w-2.5 h-2.5 text-slate-500" />
                            <span>Reading & Video</span>
                          </p>
                        </div>
                      </div>

                      {isCompleted ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 bg-emerald-50 rounded-full p-0.5 border border-emerald-200" />
                      ) : (
                        <span className="w-3 h-3 rounded-full border border-slate-250 inline-block shrink-0 bg-white"></span>
                      )}
                    </button>
                  );
                })}

                {/* Quiz Module Row trigger */}
                {quiz && (
                  <button
                    onClick={() => {
                      setViewingQuiz(true);
                      setQuizResult(null);
                    }}
                    disabled={!allLessonsCompleted && !isQuizPassed}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                      viewingQuiz
                        ? 'bg-amber-50 border-amber-250 font-bold text-amber-950 shadow-inner'
                        : !allLessonsCompleted && !isQuizPassed
                          ? 'bg-slate-50 border-slate-150 text-slate-350 cursor-not-allowed opacity-50'
                          : 'bg-amber-50/40 border-amber-100 hover:bg-amber-50 text-amber-900 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-bold text-[11px] text-slate-850">Course Assessment Quiz</p>
                        <p className="text-[9px] mt-0.5 text-slate-450 font-medium">
                          {isQuizPassed
                            ? 'Congratulations, passed!'
                            : allLessonsCompleted
                              ? 'Quiz Unlocked!'
                              : 'Complete lessons to unlock'}
                        </p>
                      </div>
                    </div>

                    {isQuizPassed ? (
                      <span className="bg-emerald-600 text-white rounded-full text-[8px] font-bold px-2 py-0.5 shrink-0 border border-emerald-700/10 uppercase tracking-wider font-mono">
                        Pass
                      </span>
                    ) : (
                      <span className="w-3 h-3 rounded-full border border-amber-300 inline-block shrink-0 bg-white"></span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Player Active Screen (Video + Lesson Content or Quiz Sheet) */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {!viewingQuiz && activeLesson ? (
              /* MODULE B: FOCUSED LESSON STUDY STAGE */
              <motion.div
                key={`lesson-${activeLesson.id}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
                id="lesson-study-stage"
              >
                {/* Lesson Title Header */}
                <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="inline-block bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-md border border-slate-200 font-mono mb-2">
                        Lesson {activeLessonIndex + 1} of {lessons.length}
                      </span>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight leading-snug">
                        {activeLesson.title}
                      </h3>
                    </div>

                    {completedLessonIds.includes(activeLesson.id) && (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-150 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest font-mono">
                        Completed
                      </span>
                    )}
                  </div>
                </div>

                {/* Video Player — constrained height */}
                {activeLesson.videoUrl && (
                  <div
                    className="rounded-2xl overflow-hidden border border-slate-900 bg-slate-950 relative shadow-lg group animate-fade-in"
                    style={{ maxHeight: '400px' }}
                  >
                    {isOnline ? (
                      activeLesson.videoUrl.startsWith('doc:') && videoSrc ? (
                        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                          <video className="absolute inset-0 w-full h-full" controls preload="metadata" playsInline>
                            <source src={videoSrc} type={videoMime} />
                          </video>
                        </div>
                      ) : activeLesson.videoUrl.startsWith('doc:') ? (
                        <div
                          className="flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-8 text-center"
                          style={{ minHeight: '225px' }}
                        >
                          <RefreshCw className="w-8 h-8 text-slate-500 animate-spin mb-3" />
                          <h3 className="text-base font-bold font-sans">Loading Video...</h3>
                        </div>
                      ) : (
                        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                          <iframe
                            src={toYouTubeEmbed(activeLesson.videoUrl) || ''}
                            title="AQS Lecture Lesson Video"
                            className="absolute inset-0 w-full h-full"
                            allowFullScreen
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          ></iframe>
                        </div>
                      )
                    ) : (
                      <div
                        className="flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-8 text-center"
                        style={{ minHeight: '225px' }}
                      >
                        <div className="bg-slate-900/60 p-4 rounded-full border border-slate-800 mb-3 animate-pulse">
                          <WifiOff className="w-8 h-8 text-amber-500" />
                        </div>
                        <h3 className="text-base font-bold font-sans">Video Unavailable Offline</h3>
                        <p className="text-slate-500 font-medium max-w-sm text-xs mt-1 leading-relaxed">
                          No internet detected. Standard video features are paused. Please restore connection to view
                          lesson material.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Lesson Content Card */}
                <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm">
                  {/* Slides Document Link */}
                  {activeLesson.slidesUrl &&
                    (() => {
                      const isDocRef = activeLesson.slidesUrl.startsWith('doc:');
                      const docId = isDocRef ? activeLesson.slidesUrl.slice(4) : null;
                      const href = isDocRef
                        ? `/api/documents/${docId}/file${token ? `?token=${encodeURIComponent(token)}` : ''}`
                        : activeLesson.slidesUrl;
                      // Self-hosted (doc:) files may already be cached by the service worker
                      // from a prior online view, so the link should still render offline —
                      // only external (non-doc:) links truly require a live network connection.
                      const canAccessOffline = isDocRef;
                      const showLiveLink = isOnline || canAccessOffline;
                      return (
                        <div className="mb-6 bg-indigo-50/50 border border-indigo-100 p-5 rounded-2.5xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div
                              className={`p-2.5 rounded-xl ${showLiveLink ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}
                            >
                              <FileText className={`w-5 h-5 ${showLiveLink ? 'animate-pulse' : ''}`} />
                            </div>
                            <div>
                              <h4 className="text-xs font-black uppercase text-indigo-950 font-mono tracking-wider">
                                {isDocRef ? 'Uploaded Document' : 'Presentation Slides Included'}
                              </h4>
                              <p className="text-slate-500 text-[11px] mt-1 font-medium">
                                {isOnline
                                  ? isDocRef
                                    ? 'A document file is attached for this topic. Click to view or download.'
                                    : 'A lecture slideshow/PDF file is attached for this topic.'
                                  : isDocRef
                                    ? 'Offline — available if previously viewed, otherwise reconnect to access.'
                                    : 'Slides unavailable offline. Reconnect to access.'}
                              </p>
                            </div>
                          </div>
                          {showLiveLink ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 h-10 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 shrink-0"
                            >
                              <span>{isDocRef ? 'View / Download Document' : 'Open Slides / PDF'}</span>
                              <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                            </a>
                          ) : (
                            <span className="px-4 h-10 bg-slate-100 text-slate-400 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shrink-0 cursor-not-allowed">
                              <WifiOff className="w-3.5 h-3.5" />
                              <span>Offline</span>
                            </span>
                          )}
                        </div>
                      );
                    })()}

                  {/* Lesson Readings and Lecture Notes */}
                  <div className="mb-8 prose prose-slate max-w-none text-slate-700 text-sm leading-relaxed font-sans">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-3 font-mono">
                      📖 Course Readings & Lecture Notes
                    </h4>
                    <div className="bg-slate-50 border border-slate-150 p-5 rounded-2.5xl font-medium whitespace-pre-wrap whitespace-pre-line text-slate-800 text-sm leading-relaxed">
                      {activeLesson.content || 'No textbook or study summaries provided for this topic.'}
                    </div>
                  </div>

                  {/* Action Buttons Area: 48px height complete button */}
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {completedLessonIds.includes(activeLesson.id) ? (
                      <div className="w-full h-12 bg-emerald-50 border border-emerald-250 text-emerald-800 font-bold px-4 text-xs rounded-xl flex items-center justify-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>COURSE UNIT MASTERED</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleMarkAsComplete(activeLesson.id)}
                        className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 rounded-xl transition-all flex items-center justify-center gap-2 border border-emerald-700/20 active:scale-[0.98] shadow-md cursor-pointer"
                        style={{ minHeight: '48px' }}
                      >
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        <span>MARK LESSON AS COMPLETE</span>
                      </button>
                    )}

                    {/* Next/Previous linear navigation helper */}
                    <div className="flex gap-2 w-full sm:w-auto shrink-0 font-mono">
                      <button
                        disabled={activeLessonIndex === 0}
                        onClick={() => setActiveLessonIndex((prev) => prev - 1)}
                        style={{ height: '48px' }}
                        className="h-12 w-12 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl flex items-center justify-center active:scale-95 disabled:opacity-40 shadow-sm cursor-pointer"
                        title="Previous Lesson"
                      >
                        <ChevronLeft className="w-5 h-5 text-slate-700" />
                      </button>
                      {activeLessonIndex < lessons.length - 1 ? (
                        <button
                          onClick={() => setActiveLessonIndex((prev) => prev + 1)}
                          style={{ height: '48px' }}
                          className="h-12 text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl flex items-center justify-center px-4 font-bold text-xs gap-1 active:scale-95 shadow-sm cursor-pointer"
                        >
                          <span>NEXT UNIT</span>
                          <ChevronRight className="w-4 h-4 text-slate-700" />
                        </button>
                      ) : quiz ? (
                        <button
                          onClick={() => setViewingQuiz(true)}
                          disabled={!allLessonsCompleted && !isQuizPassed}
                          style={{ height: '48px' }}
                          className="h-12 text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-xl flex items-center justify-center px-4 font-bold text-xs gap-2 active:scale-95 disabled:opacity-40 shadow-sm cursor-pointer"
                        >
                          <Award className="w-4 h-4 text-amber-950" />
                          <span>UNLOCKED QUIZ</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : viewingQuiz && quiz ? (
              /* MODULE C: ASSESSMENT ENGINE SHEETS */
              <motion.div
                key="quiz-panel"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="bg-white border border-slate-150 rounded-[2rem] p-6 shadow-sm"
                id="quiz-player-stage"
              >
                <div className="flex items-center gap-3.5 bg-gradient-to-r from-amber-50 to-amber-100/40 border border-amber-200 rounded-2.5xl p-5 mb-6">
                  <div className="bg-amber-500/15 p-3 rounded-2xl text-amber-700 border border-amber-500/10">
                    <HelpCircle className="w-6 h-6 shrink-0" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-amber-950 font-sans tracking-tight">
                      Examination Workspace
                    </h4>
                    <p className="text-xs font-semibold text-amber-850 mt-1 leading-relaxed">
                      Complete all questions to certify course completion. Standard passing score is 70%.
                    </p>
                  </div>
                </div>

                {quizPendingSync && (
                  <div className="bg-indigo-50 border border-indigo-150 p-4 rounded-2xl text-indigo-950 mb-6 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                    <p className="text-xs font-bold font-mono uppercase tracking-wide">
                      Notice: Offline test score cached locally. Will synch on network.
                    </p>
                  </div>
                )}

                {quizResult ? (
                  /* EXAM SUBMISSION RESPONSE BOX */
                  <div className="bg-slate-50 border border-slate-150 p-8 rounded-2.5xl text-slate-800 mb-6 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500"></div>
                    <div className="bg-indigo-50 text-indigo-600 w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 border border-indigo-100 shadow-inner">
                      <Award className="w-8 h-8" />
                    </div>

                    {quizPendingSync ? (
                      <div>
                        <h3 className="text-lg font-black font-sans text-slate-900">Quiz Logged Offline</h3>
                        <p className="text-xs font-semibold text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
                          Your submission has been safely saved locally to local databases. It will be validated and
                          synced automatically when signal resumes.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <h3 className="text-xl font-black font-sans text-slate-900">
                          {quizResult.passed ? '🎉 Congratulations, You Passed!' : 'Requires Further Study'}
                        </h3>
                        <p className="text-4.5xl font-black font-mono text-indigo-600">{quizResult.score}%</p>
                        <p className="text-xs font-bold text-slate-500 font-mono">
                          ({quizResult.correctCount} of {quizResult.totalQuestions} answers correct)
                        </p>

                        {quizResult.passed ? (
                          <div className="mt-4 bg-emerald-50 border border-emerald-150 text-emerald-800 p-4 rounded-2xl font-bold max-w-md mx-auto text-xs leading-relaxed font-sans">
                            Outstanding performance! Your Progress Tree now boasts a golden flower of achievement.
                          </div>
                        ) : (
                          <div className="mt-4 bg-red-50 border border-red-150 text-red-800 p-4 rounded-2xl font-bold max-w-md mx-auto text-xs leading-relaxed font-sans">
                            A minimum score of 70% is required. Review the curriculum text, check video components, and
                            retry anytime.
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        setQuizResult(null);
                        setSelectedAnswers({});
                        loadCourseData();
                      }}
                      style={{ height: '48px' }}
                      className="mt-6 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-6 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      ACKNOWLEDGE & RESET
                    </button>
                  </div>
                ) : (
                  /* INTERACTIVE QUESTION LIST */
                  <div className="space-y-6">
                    {quiz.questions &&
                      quiz.questions.map((q, qIdx) => (
                        <div key={q.id || qIdx} className="bg-slate-50/50 border border-slate-150 p-5 rounded-2.5xl">
                          <p className="font-mono font-black text-[9px] text-indigo-600 uppercase tracking-widest">
                            Syllabus Question {qIdx + 1} of {quiz.questions?.length}
                          </p>
                          <h4 className="text-base font-black text-slate-900 font-sans tracking-tight mt-1 mb-4 leading-relaxed">
                            {q.questionText}
                          </h4>

                          {/* Large Touch-Target Options (FR-08 / 56px requirement) */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {q.options &&
                              q.options.map((opt, optIdx) => {
                                const isSelected = selectedAnswers[q.id] === optIdx;
                                return (
                                  <button
                                    key={optIdx}
                                    onClick={() => handleOptionSelect(q.id, optIdx)}
                                    style={{ minHeight: '56px' }}
                                    className={`w-full p-4 text-left rounded-xl border font-bold text-xs tracking-tight transition-all flex items-center justify-between gap-3 cursor-pointer ${
                                      isSelected
                                        ? 'bg-indigo-600 border-indigo-700 text-white shadow-md'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50/30 hover:border-indigo-100'
                                    }`}
                                  >
                                    <span>{opt}</span>
                                    <span
                                      className={`w-6 h-6 rounded-full border flex items-center justify-center font-mono text-[10px] font-black shrink-0 ${
                                        isSelected ? 'bg-white text-indigo-600 border-white' : 'border-slate-200'
                                      }`}
                                    >
                                      {String.fromCharCode(65 + optIdx)}
                                    </span>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      ))}

                    {/* Submit explicit 56px action button */}
                    <button
                      onClick={handleQuizSubmit}
                      disabled={quizLoading}
                      style={{ minHeight: '56px' }}
                      className="w-full h-14 bg-amber-400 hover:bg-amber-300 text-amber-955 font-black text-sm px-6 rounded-2xl border border-amber-300 transition-all flex items-center justify-center gap-2 mt-4 shadow-md cursor-pointer"
                    >
                      {quizLoading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Check className="w-5 h-5 shrink-0" />
                      )}
                      <span>SUBMIT COMPLETED EXAMINATION</span>
                    </button>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-200 p-12 text-center rounded-[2rem]">
                <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <span className="italic text-slate-500 text-sm">Select a curriculum roadmap node to begin study.</span>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
