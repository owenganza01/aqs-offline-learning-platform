// src/components/LearnerCoursePlayer.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Course, Lesson, Quiz, QuizAttempt } from '../types.ts';
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
  FileText,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  WifiOff,
  Award,
  RefreshCw,
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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);

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
      <div className="flex flex-col items-center justify-center p-12 text-ink min-h-[60vh]" id="loading-stage">
        <RefreshCw className="w-12 h-12 animate-spin text-ochre mb-4" />
        <h2 className="text-xl font-display font-bold tracking-tight">Compiling Lecture Terminal...</h2>
        <p className="text-ink-3 font-mono text-xs mt-1">
          Preparing high-contrast lessons, video components & tree visuals
        </p>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div
        className="bg-paper-2 border border-error/30 p-8 rounded-2xl max-w-lg mx-auto my-12 text-center shadow-lg"
        id="error-stage"
      >
        <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
        <h2 className="text-xl font-display font-bold text-ink tracking-tight">Error Loading Classroom</h2>
        <p className="text-ink-2 font-medium mt-2 text-sm">
          {error || 'Course details missing in local offline storage.'}
        </p>
        <button
          onClick={onBack}
          className="mt-6 h-12 w-full bg-navy text-white rounded-xl hover:bg-navy-2 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
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
  const quizQuestions = quiz?.questions ?? [];

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
            className="h-11 bg-paper hover:bg-paper-2 text-ink-2 font-bold rounded-xl border border-rule px-4 flex items-center justify-center gap-2 active:scale-95 transition-all text-xs shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-ink-3" />
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
            <div className="bg-paper border border-rule rounded-2xl overflow-hidden shadow-sm">
              <div className="h-48 md:h-56 bg-navy relative">
                <img
                  src={getCourseImage(course)}
                  alt={course.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/30 to-transparent flex items-end p-6 md:p-8">
                  <div className="text-white space-y-1">
                    <span className="bg-ochre text-white text-[9px] uppercase px-2.5 py-0.5 rounded-full font-mono tracking-wider">
                      Active Syllabus
                    </span>
                    <h2 className="text-xl md:text-2xl font-display font-bold tracking-tight">{course.title}</h2>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-8 space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-ink-3 uppercase tracking-widest font-mono mb-2">
                    About This Course
                  </h3>
                  <p className="text-ink-2 text-sm font-medium leading-relaxed">{course.description}</p>
                </div>

                {/* Syllabus Progress */}
                <div className="bg-paper-2 border border-rule rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center text-xs font-mono font-bold text-ink-2">
                    <span>COURSE PROGRESS</span>
                    <span>
                      {courseCompletedCount} of {lessons.length} units completed ({progressPct}%)
                    </span>
                  </div>
                  <div className="w-full bg-rule rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-ochre h-full rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    ></div>
                  </div>
                </div>

                {/* Completion Banner */}
                {allLessonsCompleted && isQuizPassed && completionData && (
                  <div className="bg-success/10 border border-success/30 rounded-2xl p-5 flex items-start gap-4">
                    <div className="bg-success text-white p-2.5 rounded-xl shrink-0">
                      <Award className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-display font-bold text-success tracking-tight">
                        Course Completed!
                      </h3>
                      <p className="text-sm font-medium text-ink-2 mt-1">
                        You have successfully completed this course.
                        {completionData.completedAt && (
                          <span className="block text-xs font-mono mt-0.5 text-ink-3">
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
            <div className="bg-paper border border-rule rounded-2xl p-6 md:p-8 shadow-sm">
              <h3 className="text-lg font-display font-bold text-ink tracking-tight mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-ochre" />
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
                      className="w-full bg-paper border border-rule hover:border-ochre/40 p-4 rounded-2xl text-left flex items-center justify-between gap-4 transition-all shadow-sm hover:shadow active:scale-[0.99] cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {isDone ? (
                          <div className="w-6 h-6 rounded-full bg-success/15 border border-success/30 flex items-center justify-center text-success shrink-0">
                            <Check className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-rule shrink-0 bg-paper-2"></div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-ink text-sm truncate leading-snug">{lesson.title}</p>
                          <p className="text-[10px] font-semibold text-ink-3 mt-1 flex items-center gap-1 font-mono uppercase">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Topic {idx + 1} • Lecture Reading & Video</span>
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-ink-3 font-mono shrink-0">15 min</span>
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
                        ? 'bg-success/10 border-success/30 text-success'
                        : !allLessonsCompleted
                          ? 'bg-paper-2 border-rule text-ink-3 cursor-not-allowed opacity-60'
                          : 'bg-ochre-dim/50 border-ochre/40 hover:border-ochre text-ink cursor-pointer hover:shadow active:scale-[0.99]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                          isQuizPassed ? 'bg-success border-success text-white' : 'bg-paper border-ochre/40 text-ochre'
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
                      <span className="bg-success text-white rounded-full text-[9px] font-bold px-2.5 py-1 uppercase tracking-wider font-mono">
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
            className="h-11 bg-paper hover:bg-paper-2 text-ink-2 font-bold rounded-xl border border-rule px-4 flex items-center justify-center gap-2 active:scale-95 transition-all text-xs shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-ink-3" />
            <span className="hidden sm:inline">BACK TO SYLLABUS</span>
            <span className="sm:hidden">BACK</span>
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-11 bg-paper hover:bg-paper-2 text-ink-2 font-bold rounded-xl border border-rule px-3 flex items-center justify-center gap-2 active:scale-95 transition-all text-xs shadow-sm cursor-pointer lg:hidden"
          >
            <BookOpen className="w-4 h-4 text-ink-3" />
          </button>
        </div>

        <div className="bg-navy border border-navy-2 px-4 py-2.5 rounded-2xl flex items-center gap-2 text-white shadow-sm overflow-hidden text-ellipsis whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-ochre animate-pulse"></span>
          <span className="text-xs font-display font-bold tracking-tight text-paper truncate">{course.title}</span>
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
              <h4 className="font-display font-bold text-ink text-sm">Navigation</h4>
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
                className="p-2 hover:bg-paper-2 rounded-lg"
              >
                <X className="w-5 h-5 text-ink-3" />
              </button>
            </div>

            {/* Curriculum Index Cards */}
            <div className="bg-paper rounded-2xl p-5 border border-rule shadow-sm">
              <h4 className="text-sm font-display font-bold text-ink mb-3 tracking-tight flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-ochre" />
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
                        setCurrentQuestionIndex(0);
                      }}
                      className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                        isActive
                          ? 'bg-ochre-dim/60 border-ochre/40 text-ink font-bold shadow-inner'
                          : 'bg-paper-2/60 border-rule hover:bg-ochre-dim/25 text-ink-2'
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="font-mono font-bold text-ink-3 text-[10px] shrink-0 mt-0.5">{index + 1}.</span>
                        <div className="min-w-0">
                          <p
                            className={`text-[11px] leading-snug truncate ${isActive ? 'font-bold text-ink' : 'font-medium text-ink'}`}
                          >
                            {lesson.title}
                          </p>
                          <p className="text-[9px] text-ink-3 mt-0.5 flex items-center gap-1 font-mono uppercase font-semibold">
                            <Clock className="w-2.5 h-2.5 text-ink-3" />
                            <span>Reading & Video</span>
                          </p>
                        </div>
                      </div>

                      {isCompleted ? (
                        <Check className="w-3.5 h-3.5 text-success shrink-0 bg-success/15 rounded-full p-0.5 border border-success/30" />
                      ) : (
                        <span className="w-3 h-3 rounded-full border border-rule inline-block shrink-0 bg-paper-2"></span>
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
                      setCurrentQuestionIndex(0);
                    }}
                    disabled={!allLessonsCompleted && !isQuizPassed}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                      viewingQuiz
                        ? 'bg-ochre-dim/70 border-ochre/50 font-bold text-ink shadow-inner'
                        : !allLessonsCompleted && !isQuizPassed
                          ? 'bg-paper-2/60 border-rule text-ink-3 cursor-not-allowed opacity-50'
                          : 'bg-ochre-dim/40 border-ochre/30 hover:bg-ochre-dim/60 text-ink cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Award className="w-3.5 h-3.5 text-ochre shrink-0" />
                      <div>
                        <p className="font-bold text-[11px] text-ink">Course Assessment Quiz</p>
                        <p className="text-[9px] mt-0.5 text-ink-3 font-medium">
                          {isQuizPassed
                            ? 'Congratulations, passed!'
                            : allLessonsCompleted
                              ? 'Quiz Unlocked!'
                              : 'Complete lessons to unlock'}
                        </p>
                      </div>
                    </div>

                    {isQuizPassed ? (
                      <span className="bg-success text-white rounded-full text-[8px] font-bold px-2 py-0.5 shrink-0 border border-success/30 uppercase tracking-wider font-mono">
                        Pass
                      </span>
                    ) : (
                      <span className="w-3 h-3 rounded-full border border-ochre/40 inline-block shrink-0 bg-paper"></span>
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
                <div className="bg-paper border border-rule rounded-2xl p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="inline-block bg-ochre-dim/50 text-ochre text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-md border border-ochre/30 font-mono mb-2">
                        Lesson {activeLessonIndex + 1} of {lessons.length}
                      </span>
                      <h3 className="text-lg font-display font-bold text-ink tracking-tight leading-snug">
                        {activeLesson.title}
                      </h3>
                    </div>

                    {completedLessonIds.includes(activeLesson.id) && (
                      <span className="bg-success/15 text-success border border-success/30 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest font-mono">
                        Completed
                      </span>
                    )}
                  </div>
                </div>

                {/* Video Player — constrained height */}
                {activeLesson.videoUrl && (
                  <div
                    className="rounded-2xl overflow-hidden border border-navy bg-navy relative shadow-lg group animate-fade-in"
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
                          className="flex flex-col items-center justify-center bg-navy text-paper p-8 text-center"
                          style={{ minHeight: '225px' }}
                        >
                          <RefreshCw className="w-8 h-8 text-ink-3 animate-spin mb-3" />
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
                        className="flex flex-col items-center justify-center bg-navy text-paper p-8 text-center"
                        style={{ minHeight: '225px' }}
                      >
                        <div className="bg-navy-2/60 p-4 rounded-full border border-navy-3 mb-3 animate-pulse">
                          <WifiOff className="w-8 h-8 text-ochre" />
                        </div>
                        <h3 className="text-base font-display font-bold tracking-tight">Video Unavailable Offline</h3>
                        <p className="text-ink-3 font-medium max-w-sm text-xs mt-1 leading-relaxed">
                          No internet detected. Standard video features are paused. Please restore connection to view
                          lesson material.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Lesson Content Card */}
                <div className="bg-paper border border-rule rounded-2xl p-5 shadow-sm">
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
                        <div className="mb-6 bg-ochre-dim/30 border border-ochre/30 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div
                              className={`p-2.5 rounded-xl ${showLiveLink ? 'bg-ochre text-white' : 'bg-paper-2 text-ink-3'}`}
                            >
                              <FileText className={`w-5 h-5 ${showLiveLink ? 'animate-pulse' : ''}`} />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold uppercase text-ink font-mono tracking-wider">
                                {isDocRef ? 'Uploaded Document' : 'Presentation Slides Included'}
                              </h4>
                              <p className="text-ink-3 text-[11px] mt-1 font-medium">
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
                              className="px-4 h-10 bg-ochre hover:bg-ochre/90 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 shrink-0"
                            >
                              <span>{isDocRef ? 'View / Download Document' : 'Open Slides / PDF'}</span>
                              <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                            </a>
                          ) : (
                            <span className="px-4 h-10 bg-paper-2 text-ink-3 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shrink-0 cursor-not-allowed">
                              <WifiOff className="w-3.5 h-3.5" />
                              <span>Offline</span>
                            </span>
                          )}
                        </div>
                      );
                    })()}

                  {/* Lesson Readings and Lecture Notes */}
                  <div className="mb-8 prose prose-slate max-w-none text-ink-2 text-sm leading-relaxed font-sans">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-ink-3 mb-3 font-mono">
                      📖 Course Readings & Lecture Notes
                    </h4>
                    <div className="bg-paper-2 border border-rule p-5 rounded-2xl font-medium whitespace-pre-wrap whitespace-pre-line text-ink text-sm leading-relaxed">
                      {activeLesson.content || 'No textbook or study summaries provided for this topic.'}
                    </div>
                  </div>

                  {/* Action Buttons Area: mark-complete as ghost + quiz CTA */}
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {completedLessonIds.includes(activeLesson.id) ? (
                      <div className="w-full h-12 bg-success/10 border border-success/30 text-success font-bold px-4 text-xs rounded-xl flex items-center justify-center gap-2">
                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                        <span>COURSE UNIT MASTERED</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleMarkAsComplete(activeLesson.id)}
                        className="w-full h-12 bg-transparent hover:bg-ochre-dim/40 text-ochre font-bold text-xs px-4 rounded-xl transition-all flex items-center justify-center gap-2 border-2 border-ochre/40 active:scale-[0.98] cursor-pointer"
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
                        className="h-12 w-12 bg-paper border border-rule hover:bg-paper-2 rounded-xl flex items-center justify-center active:scale-95 disabled:opacity-40 shadow-sm cursor-pointer"
                        title="Previous Lesson"
                      >
                        <ChevronLeft className="w-5 h-5 text-ink-2" />
                      </button>
                      {activeLessonIndex < lessons.length - 1 ? (
                        <button
                          onClick={() => setActiveLessonIndex((prev) => prev + 1)}
                          style={{ height: '48px' }}
                          className="h-12 text-ink-2 bg-paper border border-rule hover:bg-paper-2 rounded-xl flex items-center justify-center px-4 font-bold text-xs gap-1 active:scale-95 shadow-sm cursor-pointer"
                        >
                          <span>NEXT UNIT</span>
                          <ChevronRight className="w-4 h-4 text-ink-2" />
                        </button>
                      ) : quiz ? (
                        <button
                          onClick={() => setViewingQuiz(true)}
                          disabled={!allLessonsCompleted && !isQuizPassed}
                          style={{ height: '48px' }}
                          className="h-12 text-white bg-ochre hover:bg-ochre/90 rounded-xl flex items-center justify-center px-4 font-bold text-xs gap-2 active:scale-95 disabled:opacity-40 shadow-sm cursor-pointer"
                        >
                          <Award className="w-4 h-4 text-white" />
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
                className="bg-paper border border-rule rounded-2xl p-6 shadow-sm"
                id="quiz-player-stage"
              >
                <div className="flex items-center gap-3.5 bg-gradient-to-r from-ochre-dim/70 to-ochre-dim/30 border border-ochre/40 rounded-2xl p-5 mb-6">
                  <div className="bg-ochre/15 p-3 rounded-xl text-ochre border border-ochre/20">
                    <HelpCircle className="w-6 h-6 shrink-0" />
                  </div>
                  <div>
                    <h4 className="text-base font-display font-bold text-ink tracking-tight">Examination Workspace</h4>
                    <p className="text-xs font-semibold text-ink-2 mt-1 leading-relaxed">
                      Complete all questions to certify course completion. Standard passing score is 70%.
                    </p>
                  </div>
                </div>

                {quizPendingSync && (
                  <div className="flex items-start gap-2.5 bg-[#FBF5E6] border-l-[3px] border-ochre rounded-r-lg px-3.5 py-3 mb-6 max-w-[560px]">
                    <AlertCircle className="w-3.5 h-3.5 text-ochre shrink-0 mt-0.5" />
                    <p className="text-[12.5px] leading-relaxed text-[#7A5E18]">
                      You're offline. Your answers are saved to this device and will be submitted and scored the next
                      time you're online.
                    </p>
                  </div>
                )}

                {quizResult ? (
                  /* EXAM SUBMISSION RESPONSE BOX */
                  <div className="bg-paper-2 border border-rule p-8 rounded-2xl text-ink mb-6 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-ochre"></div>
                    <div className="bg-ochre-dim/60 text-ochre w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 border border-ochre/30 shadow-inner">
                      <Award className="w-8 h-8" />
                    </div>

                    {quizPendingSync ? (
                      <div>
                        <h3 className="text-lg font-display font-bold text-ink">Quiz Logged Offline</h3>
                        <p className="text-xs font-semibold text-ink-3 mt-2 max-w-sm mx-auto leading-relaxed">
                          Your submission has been safely saved locally to local databases. It will be validated and
                          synced automatically when signal resumes.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <h3 className="text-xl font-display font-bold text-ink">
                          {quizResult.passed ? '🎉 Congratulations, You Passed!' : 'Requires Further Study'}
                        </h3>
                        <p className="text-4.5xl font-black font-mono text-ochre">{quizResult.score}%</p>
                        <p className="text-xs font-bold text-ink-3 font-mono">
                          ({quizResult.correctCount} of {quizResult.totalQuestions} answers correct)
                        </p>

                        {quizResult.passed ? (
                          <div className="mt-4 bg-success/10 border border-success/30 text-success p-4 rounded-2xl font-bold max-w-md mx-auto text-xs leading-relaxed font-sans">
                            Outstanding performance! Your Progress Tree now boasts a golden flower of achievement.
                          </div>
                        ) : (
                          <div className="mt-4 bg-error-bg border border-error/30 text-error p-4 rounded-2xl font-bold max-w-md mx-auto text-xs leading-relaxed font-sans">
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
                        setCurrentQuestionIndex(0);
                        loadCourseData();
                      }}
                      style={{ height: '48px' }}
                      className="mt-6 bg-navy hover:bg-navy-2 text-white font-bold text-xs px-6 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      ACKNOWLEDGE & RESET
                    </button>
                  </div>
                ) : (
                  /* INTERACTIVE QUESTION LIST — ONE QUESTION AT A TIME */
                  <div>
                    {/* Quiz masthead */}
                    <div className="flex items-center justify-between mb-7">
                      <h4 className="font-display text-xl font-bold text-ink tracking-tight">{quiz.title}</h4>
                      <span className="font-mono text-xs text-ink-3">
                        Question {currentQuestionIndex + 1} of {quizQuestions.length}
                      </span>
                    </div>

                    {quizQuestions.length > 0 ? (
                      <>
                        {/* Progress track (6px, ochre fill by current position) */}
                        <div className="h-[6px] bg-rule rounded-[3px] overflow-hidden mb-7 max-w-[500px]">
                          <div
                            className="h-full bg-ochre rounded-[3px] transition-all duration-300"
                            style={{
                              width: `${((currentQuestionIndex + 1) / quizQuestions.length) * 100}%`,
                            }}
                          />
                        </div>

                        {/* Question card */}
                        <div className="bg-white border border-rule rounded-xl p-6 max-w-[560px]">
                          <p className="font-mono text-[11px] text-ink-3 mb-2">Question {currentQuestionIndex + 1}</p>
                          <h4 className="font-display text-[17px] font-semibold text-ink leading-relaxed mb-5">
                            {quizQuestions[currentQuestionIndex].questionText}
                          </h4>

                          {/* Radio options — selected state is the only in-quiz feedback */}
                          <div>
                            {quizQuestions[currentQuestionIndex].options.map((opt, optIdx) => {
                              const isSelected = selectedAnswers[quizQuestions[currentQuestionIndex].id] === optIdx;
                              return (
                                <button
                                  key={optIdx}
                                  onClick={() => handleOptionSelect(quizQuestions[currentQuestionIndex].id, optIdx)}
                                  className={`w-full flex items-center gap-3 px-3.5 py-3 border-[1.5px] rounded-lg mb-2 text-left text-[13.5px] text-ink transition-all cursor-pointer ${
                                    isSelected
                                      ? 'border-ochre bg-[#FBF5E6]'
                                      : 'border-rule bg-paper hover:border-[#b0aca2] hover:bg-[#f6f5f0]'
                                  }`}
                                >
                                  <span
                                    className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                                      isSelected ? 'border-ochre' : 'border-[#c8c4bb]'
                                    }`}
                                  >
                                    {isSelected && <span className="w-2 h-2 rounded-full bg-ochre" />}
                                  </span>
                                  {opt}
                                </button>
                              );
                            })}
                          </div>

                          {/* Footer navigation */}
                          <div className="flex justify-end gap-2 mt-5">
                            {currentQuestionIndex > 0 && (
                              <button
                                onClick={() => setCurrentQuestionIndex((i) => i - 1)}
                                className="bg-paper border border-rule hover:border-[#b0aca2] text-ink font-semibold text-[13px] px-5 py-2.5 rounded-lg transition-all cursor-pointer"
                              >
                                Previous
                              </button>
                            )}

                            {currentQuestionIndex < quizQuestions.length - 1 ? (
                              <button
                                onClick={() => setCurrentQuestionIndex((i) => i + 1)}
                                className="bg-navy hover:bg-navy-2 text-white font-semibold text-[13px] px-5 py-2.5 rounded-lg transition-all cursor-pointer"
                              >
                                Next question →
                              </button>
                            ) : (
                              <button
                                onClick={handleQuizSubmit}
                                disabled={quizLoading}
                                style={{ minHeight: '48px' }}
                                className="bg-navy hover:bg-navy-2 disabled:opacity-60 text-white font-semibold text-[13px] px-6 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                {quizLoading ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4 shrink-0" />
                                )}
                                Submit quiz
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-ink-2">This quiz has no questions yet.</div>
                    )}
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="bg-paper-2 border border-dashed border-rule p-12 text-center rounded-2xl">
                <GraduationCap className="w-10 h-10 text-ink-3 mx-auto mb-3" />
                <span className="italic text-ink-3 text-sm">Select a curriculum roadmap node to begin study.</span>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
