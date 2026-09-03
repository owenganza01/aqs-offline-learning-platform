import { useState, useEffect, useCallback, FormEvent } from 'react';
import { PublicCourse } from '../types.js';
import { apiFetch } from '../lib/api.js';
import {
  BookOpen,
  LogIn,
  RefreshCw,
  Sparkles,
  CheckCircle,
  WifiOff,
  ShieldCheck,
  GraduationCap,
  ArrowRight,
  Users,
  FileText,
  AlertCircle,
} from 'lucide-react';

export type LandingView = 'home' | 'login' | 'signup-role' | 'signup-learner' | 'signup-instructor';

export interface LandingPageProps {
  initialCourses?: PublicCourse[];
  onLogin: () => void;
  authLoading?: boolean;
  onRegister: (e: FormEvent) => void;
  regName: string;
  setRegName: (val: string) => void;
  regEmail: string;
  setRegEmail: (val: string) => void;
  regError: string;
  regSuccess: string;
  regLoading: boolean;
  onClearRegForm?: () => void;
}

const CARD_ACCENT_STRIPS = ['bg-emerald-500/30', 'bg-sky-500/30', 'bg-amber-500/30'];

/* =========================================================================
   HEADER COMPONENT
   ========================================================================= */
interface HeaderProps {
  onNav: (view: LandingView) => void;
  onHome: () => void;
  onExploreCourses: () => void;
  onLoginClick: () => void;
}

function Header({ onNav, onHome, onExploreCourses, onLoginClick }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-50 bg-navy border-b border-white/[0.08] text-navtext shadow-sm select-none"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand logo & title */}
        <button
          type="button"
          onClick={onHome}
          className="flex items-center gap-2.5 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre rounded-lg p-1"
          aria-label="AQS Learning Home"
        >
          <div className="w-8 h-8 rounded bg-ochre flex items-center justify-center text-white font-bold text-sm shadow-sm transition-transform group-hover:scale-105">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="text-white font-display font-semibold text-lg tracking-tight">AQS Learning</span>
        </button>

        {/* Navigation links */}
        <nav aria-label="Landing page navigation" className="hidden sm:flex items-center gap-6">
          <button
            type="button"
            className="text-sm text-navtext hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre rounded px-2 py-1"
            onClick={onHome}
          >
            Home
          </button>
          <button
            type="button"
            className="text-sm text-navtext hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre rounded px-2 py-1"
            onClick={onExploreCourses}
          >
            Explore Courses
          </button>
        </nav>

        {/* Auth CTA button pair */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onLoginClick}
            className="text-sm font-medium text-white/90 hover:text-white hover:bg-white/5 px-3 py-2 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => onNav('signup-role')}
            className="text-sm font-bold bg-ochre hover:bg-ochre/90 active:scale-[0.98] text-white px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
          >
            Sign Up
          </button>
        </div>
      </div>
    </header>
  );
}

/* =========================================================================
   HERO COMPONENT
   ========================================================================= */
interface HeroProps {
  onExplore: () => void;
  onGetStarted: () => void;
}

function Hero({ onExplore, onGetStarted }: HeroProps) {
  return (
    <section className="bg-navy text-white border-b border-white/[0.06]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-20 flex flex-col md:flex-row items-center gap-10 md:gap-12">
        {/* Left Column: Headline, pitch, and CTA buttons */}
        <div className="flex-1 max-w-xl text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-ochre/15 text-ochre border border-ochre/30 mb-5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Digital Classroom for Africa</span>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl leading-tight font-bold tracking-tight text-white">
            Learn at your pace. Build skills that matter.
          </h1>

          <p className="mt-5 text-navtext text-base sm:text-lg leading-relaxed">
            AQS gives you structured courses, practical lessons, and self-paced learning, including lessons you can keep
            working through when your connection can&apos;t.
          </p>

          <div className="mt-8 flex flex-wrap justify-center md:justify-start gap-3.5">
            <button
              type="button"
              onClick={onExplore}
              className="bg-ochre hover:bg-ochre/90 active:scale-[0.98] text-white font-bold px-6 py-3.5 rounded-xl shadow-md transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
            >
              Explore Courses
            </button>
            <button
              type="button"
              onClick={onGetStarted}
              className="border border-white/20 hover:border-white/40 hover:bg-white/[0.06] active:scale-[0.98] text-white font-semibold px-6 py-3.5 rounded-xl transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
            >
              Get Started
            </button>
          </div>
        </div>

        {/* Right Column: Polished Offline Capability Feature Card (No fake user/progress data) */}
        <div className="flex-1 w-full max-w-md">
          <div className="bg-navy-2 border border-white/10 rounded-2xl p-6 sm:p-7 shadow-2xl relative overflow-hidden backdrop-blur-sm">
            {/* Top status bar */}
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-ochre animate-pulse" />
                <span className="text-[11px] uppercase tracking-wider font-mono font-bold text-white/80">
                  Offline-First Architecture
                </span>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-success/20 text-success border border-success/30">
                <CheckCircle className="w-3 h-3" /> PWA Ready
              </span>
            </div>

            {/* Card Content Body */}
            <div className="mt-5 space-y-4">
              <div>
                <h3 className="font-display text-lg font-bold text-white tracking-tight">Study Without Interruption</h3>
                <p className="mt-1 text-xs text-navtext leading-relaxed">
                  Lectures, notes, and interactive quizzes are securely cached on your device for instant offline
                  access.
                </p>
              </div>

              {/* 3 Pillars */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-start gap-3 bg-navy-3/60 border border-white/[0.06] rounded-xl p-3">
                  <div className="w-7 h-7 rounded-lg bg-ochre/15 text-ochre flex items-center justify-center shrink-0 mt-0.5">
                    <WifiOff className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Local-First Storage</p>
                    <p className="text-[11px] text-navtext/80 leading-snug">
                      Continue coursework seamlessly when bandwidth drops or network goes down.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-navy-3/60 border border-white/[0.06] rounded-xl p-3">
                  <div className="w-7 h-7 rounded-lg bg-success/15 text-success flex items-center justify-center shrink-0 mt-0.5">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Automatic Cloud Sync</p>
                    <p className="text-[11px] text-navtext/80 leading-snug">
                      Lesson completions and quiz evaluations sync automatically when back online.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-navy-3/60 border border-white/[0.06] rounded-xl p-3">
                  <div className="w-7 h-7 rounded-lg bg-ochre/15 text-ochre flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Verified Assessments</p>
                    <p className="text-[11px] text-navtext/80 leading-snug">
                      Server-side score validation and tamper-resistant milestone tracking.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom highlight label */}
            <div className="mt-5 pt-4 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-white/50 font-mono">
              <span>Zero data consumed while reviewing</span>
              <span className="text-ochre font-semibold">100% Free</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   HOW IT WORKS COMPONENT
   ========================================================================= */
function HowItWorks() {
  const steps = [
    {
      title: 'Discover',
      copy: 'Browse available courses and find analytics curriculum matched to your cohort.',
    },
    {
      title: 'Learn',
      copy: 'Work through structured video lessons, lecture slides, and notes at your own pace.',
    },
    {
      title: 'Practice',
      copy: 'Complete interactive quizzes and evaluations to test comprehension.',
    },
    {
      title: 'Progress',
      copy: 'Track course milestones, earn certifications, and pick up where you left off.',
    },
  ];

  return (
    <section className="bg-paper border-b border-rule py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center md:text-left max-w-2xl">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">
            Learn without the friction
          </h2>
          <p className="mt-2 text-ink-2 text-sm sm:text-base leading-relaxed">
            Engineered specifically for students and practitioners across Africa studying under constrained
            connectivity.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {steps.map(({ title, copy }, index) => (
            <div
              key={title}
              className="bg-paper-2 border border-rule rounded-2xl p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-3 h-3 rounded-full bg-ochre" />
                  <span className="text-[10px] font-mono font-bold text-ink-3">STEP 0{index + 1}</span>
                </div>
                <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
                <p className="mt-2 text-xs text-ink-2 leading-relaxed">{copy}</p>
              </div>
            </div>
          ))}

          {/* 5th Step: Learn Offline */}
          <div className="bg-paper-2 border-2 border-dashed border-ochre/60 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-3 h-3 rounded-full border-2 border-ochre bg-ochre/20" />
                <span className="text-[10px] font-mono font-bold text-ochre">OFFLINE</span>
              </div>
              <h3 className="font-display text-lg font-bold text-ink">Learn Offline</h3>
              <p className="mt-2 text-xs text-ink-2 leading-relaxed">
                Download lessons and keep studying uninterrupted when connectivity is unavailable.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   COURSE DISCOVERY COMPONENT (Using real PublicCourse[] data)
   ========================================================================= */
interface CourseDiscoveryProps {
  courses: PublicCourse[];
  coursesLoading?: boolean;
  coursesError?: string | null;
  onRetry?: () => void;
}

function CourseDiscovery({ courses, coursesLoading, coursesError, onRetry }: CourseDiscoveryProps) {
  return (
    <section id="courses" className="bg-paper-2 border-b border-rule py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-widest text-ochre font-bold block mb-1">
              Curriculum Directory
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">Explore courses</h2>
            <p className="mt-1.5 text-ink-2 text-sm">
              Structured learning tracks designed for quantitative analytics, data science, and development.
            </p>
          </div>
          <div className="text-xs font-mono font-semibold text-ink-3">
            {!coursesLoading &&
              !coursesError &&
              `${courses.length} ${courses.length === 1 ? 'course' : 'courses'} available`}
          </div>
        </div>

        {/* 1. Loading Skeleton State */}
        {coursesLoading && courses.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="border border-rule rounded-2xl bg-paper p-6 animate-pulse space-y-4 shadow-xs">
                <div className="h-2 bg-rule rounded-full w-1/3" />
                <div className="h-6 bg-rule rounded w-3/4" />
                <div className="space-y-2">
                  <div className="h-3 bg-rule rounded w-full" />
                  <div className="h-3 bg-rule rounded w-5/6" />
                </div>
                <div className="pt-4 border-t border-rule h-4 bg-rule rounded w-1/4" />
              </div>
            ))}
          </div>
        )}

        {/* 2. Error State */}
        {!coursesLoading && coursesError && courses.length === 0 && (
          <div className="border border-error/20 rounded-2xl bg-paper p-8 text-center max-w-md mx-auto shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-error-bg text-error mx-auto flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="font-display text-base font-bold text-ink">Unable to load courses</h3>
            <p className="mt-1.5 text-ink-2 text-xs leading-relaxed">{coursesError}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 inline-flex items-center gap-2 bg-paper-2 hover:bg-paper border border-rule px-4 py-2 rounded-xl text-xs font-semibold text-ink transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            )}
          </div>
        )}

        {/* 3. Empty State */}
        {!coursesLoading && !coursesError && courses.length === 0 && (
          <div className="border border-rule rounded-2xl bg-paper p-10 text-center max-w-lg mx-auto shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-ochre/15 text-ochre mx-auto flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="font-display text-lg font-bold text-ink">No published courses available yet</h3>
            <p className="mt-2 text-ink-2 text-xs leading-relaxed">
              New analytics and quantitative curriculum is currently being prepared by AQS instructors. Sign up with
              your cohort code to get notified upon release.
            </p>
          </div>
        )}

        {/* 4. Populated Real Course Grid */}
        {!coursesLoading && courses.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course, index) => {
              const lessonCount = course.lessonCount ?? 0;
              const hasQuiz = course.hasQuiz;
              const accentStrip = CARD_ACCENT_STRIPS[index % CARD_ACCENT_STRIPS.length];

              return (
                <div
                  key={course.id}
                  className="border border-rule rounded-2xl bg-paper overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between group"
                >
                  <div>
                    <div className={`h-1.5 w-full ${accentStrip}`} />
                    <div className="p-6">
                      <div className="flex items-center justify-between text-[11px] font-mono text-ink-3 uppercase font-semibold mb-2">
                        <span>Course #{course.id}</span>
                        {hasQuiz && (
                          <span className="text-ochre bg-ochre/10 px-2 py-0.5 rounded text-[10px] font-bold">
                            Quiz included
                          </span>
                        )}
                      </div>
                      <h3 className="font-display text-lg font-bold text-ink group-hover:text-ochre transition-colors line-clamp-2">
                        {course.title}
                      </h3>
                      <p className="mt-2 text-xs text-ink-2 leading-relaxed line-clamp-3">
                        {course.description || 'Comprehensive curriculum with video lessons and interactive exercises.'}
                      </p>
                    </div>
                  </div>

                  <div className="px-6 py-3.5 bg-paper-2 border-t border-rule flex items-center justify-between text-xs font-mono text-ink-3">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-ochre" />
                      <span>
                        {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
                      </span>
                    </span>
                    <span className="text-success font-semibold flex items-center gap-1 text-[11px]">
                      <CheckCircle className="w-3.5 h-3.5" /> Offline ready
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/* =========================================================================
   ROLE SELECT COMPONENT
   ========================================================================= */
interface RoleSelectProps {
  onNav: (view: LandingView) => void;
}

function RoleSelect({ onNav }: RoleSelectProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-paper px-4 py-16">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-10">
          <span className="text-[10px] uppercase font-mono tracking-widest text-ochre font-bold block mb-1">
            Get Started with AQS
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">How will you use AQS?</h1>
          <p className="mt-2 text-ink-2 text-sm max-w-md mx-auto">
            Choose your profile to begin studying courses or learn about institutional instructor access.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Card A: Learner (Self-Service) */}
          <button
            type="button"
            onClick={() => onNav('signup-learner')}
            className="text-left border-2 border-rule hover:border-ochre rounded-2xl bg-paper-2 p-6 sm:p-7 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-ochre/15 text-ochre flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <GraduationCap className="w-6 h-6" />
              </div>
              <h2 className="font-display text-xl font-bold text-ink">Learner</h2>
              <p className="mt-2 text-xs sm:text-sm text-ink-2 leading-relaxed">
                Learn new quantitative skills at your own pace. Browse courses, download lessons offline, complete
                assessments, and track certified progress.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-rule/60 flex items-center gap-2 text-sm font-bold text-ochre group-hover:translate-x-1 transition-transform">
              <span>Continue as Learner</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          {/* Card B: Instructor / Admin (Informational Access) */}
          <button
            type="button"
            onClick={() => onNav('signup-instructor')}
            className="text-left border-2 border-rule hover:border-navy rounded-2xl bg-paper-2 p-6 sm:p-7 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-navy/10 text-navy flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <Users className="w-6 h-6" />
              </div>
              <h2 className="font-display text-xl font-bold text-ink">Instructor / Admin</h2>
              <p className="mt-2 text-xs sm:text-sm text-ink-2 leading-relaxed">
                Manage cohorts, author video courses, create quizzes, and monitor learner analytics. Instructor accounts
                are provisioned by AQS administrators.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-rule/60 flex items-center gap-2 text-sm font-bold text-navy group-hover:translate-x-1 transition-transform">
              <span>Instructor Access Info</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   LOGIN VIEW COMPONENT
   ========================================================================= */
interface LoginViewProps {
  onLogin: () => void;
  authLoading?: boolean;
  onSwitchToSignup: () => void;
}

function LoginView({ onLogin, authLoading, onSwitchToSignup }: LoginViewProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-paper px-4 py-16">
      <div className="max-w-md w-full text-center bg-paper-2 border border-rule p-8 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-ochre" />

        <div className="bg-paper border border-rule w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-5 shadow-xs">
          <BookOpen className="w-8 h-8 text-ochre" />
        </div>

        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">Welcome back</h1>
        <p className="mt-2 text-ink-2 text-sm">
          Sign in to access your enrolled courses, offline downloads, and study history.
        </p>

        <div className="mt-8 space-y-4">
          <button
            type="button"
            onClick={onLogin}
            disabled={authLoading}
            style={{ minHeight: '54px' }}
            className="w-full bg-ochre hover:bg-ochre/90 active:scale-[0.98] text-white font-bold text-base px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
          >
            {authLoading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Connecting to Google...</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5 shrink-0" />
                <span>SIGN IN WITH GOOGLE</span>
              </>
            )}
          </button>

          <div className="border-t border-rule pt-4 text-xs text-ink-3">
            <span>Don&apos;t have an account? </span>
            <button
              type="button"
              onClick={onSwitchToSignup}
              className="text-ochre font-bold hover:underline cursor-pointer focus:outline-none"
            >
              Join with Class Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   LEARNER SIGNUP VIEW COMPONENT
   ========================================================================= */
interface LearnerSignupProps {
  onRegister: (e: FormEvent) => void;
  onLogin: () => void;
  regName: string;
  setRegName: (val: string) => void;
  regEmail: string;
  setRegEmail: (val: string) => void;
  regError: string;
  regSuccess: string;
  regLoading: boolean;
  onSwitchToLogin: () => void;
}

function LearnerSignup({
  onRegister,
  onLogin,
  regName,
  setRegName,
  regEmail,
  setRegEmail,
  regError,
  regSuccess,
  regLoading,
  onSwitchToLogin,
}: LearnerSignupProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-paper px-4 py-16">
      <div className="max-w-md w-full bg-paper-2 border border-rule p-8 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-ochre" />

        <div className="text-center mb-6">
          <div className="bg-paper border border-rule w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-xs">
            <GraduationCap className="w-7 h-7 text-ochre" />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink tracking-tight">Join as a Learner</h1>
          <p className="mt-1.5 text-xs sm:text-sm text-ink-2">
            Enter your details to create a free account and start learning.
          </p>
        </div>

        {/* Success Flow: Prompts Google Sign-In with Registered Email */}
        {regSuccess ? (
          <div className="space-y-4">
            <div className="bg-success/10 border border-success/30 rounded-xl p-5 text-sm text-ink text-left">
              <p className="font-bold text-success mb-1 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Account registered!
              </p>
              <p className="text-xs text-ink-2 leading-relaxed mt-1">
                {regSuccess} Sign in with Google using this email to activate your account.
              </p>
            </div>

            <button
              type="button"
              onClick={onLogin}
              style={{ minHeight: '52px' }}
              className="w-full bg-ochre hover:bg-ochre/90 active:scale-[0.98] text-white font-bold text-base px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-2.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
            >
              <LogIn className="w-5 h-5" />
              <span>SIGN IN WITH GOOGLE</span>
            </button>
          </div>
        ) : (
          /* Form: name + email (no invite code) */
          <form onSubmit={onRegister} className="space-y-4 text-left">
            {regError && (
              <div className="bg-error-bg border border-error/20 rounded-xl p-4 text-xs font-semibold text-error">
                {regError}
              </div>
            )}

            <div>
              <label htmlFor="reg-name" className="block text-[10px] font-bold uppercase text-ink-3 mb-1.5 font-mono">
                Full Name <span className="text-error">*</span>
              </label>
              <input
                id="reg-name"
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="e.g. Amina Diallo"
                className="w-full h-11 px-4 rounded-xl border border-rule bg-paper text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ochre/30 focus:border-ochre"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-[10px] font-bold uppercase text-ink-3 mb-1.5 font-mono">
                Email Address <span className="text-error">*</span>
              </label>
              <input
                id="reg-email"
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="e.g. amina@example.com"
                className="w-full h-11 px-4 rounded-xl border border-rule bg-paper text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ochre/30 focus:border-ochre"
                required
              />
            </div>

            <button
              type="submit"
              disabled={regLoading || !regName.trim() || !regEmail.trim()}
              style={{ minHeight: '48px' }}
              className="w-full bg-ochre hover:bg-ochre/90 disabled:bg-ink-3/40 disabled:text-white/60 text-white font-bold text-sm px-6 rounded-xl transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
            >
              {regLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <span>CREATE ACCOUNT</span>
              )}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="text-xs text-ink-3 hover:text-ink underline cursor-pointer focus:outline-none"
              >
                Already have an account? Sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   INSTRUCTOR ONBOARDING COMPONENT (Informational Access Guidance)
   ========================================================================= */
interface InstructorOnboardingProps {
  onLogin: () => void;
  onBack: () => void;
}

function InstructorOnboarding({ onLogin, onBack }: InstructorOnboardingProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-paper px-4 py-16">
      <div className="max-w-lg w-full bg-paper-2 border border-rule p-8 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-navy" />

        <div className="bg-paper border border-rule w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-5 shadow-xs text-navy">
          <Users className="w-7 h-7" />
        </div>

        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink text-center tracking-tight">
          Instructor & Admin Portal
        </h1>

        <div className="mt-5 space-y-3.5 text-left text-xs text-ink-2 leading-relaxed">
          <div className="bg-paper border border-rule rounded-xl p-4">
            <h4 className="font-bold text-ink text-sm mb-1">Institutional Provisioning</h4>
            <p>
              To maintain accredited course standards and secure student data, instructor and administrator accounts are
              provisioned directly by AQS administrators or affiliated institutions.
            </p>
          </div>

          <div className="bg-paper border border-rule rounded-xl p-4">
            <h4 className="font-bold text-ink text-sm mb-1">Instructor Capabilities</h4>
            <ul className="list-disc list-inside space-y-1 text-ink-3">
              <li>Course Factory & rich Markdown/video syllabus publishing</li>
              <li>Interactive quiz authoring & scoring rules</li>
              <li>Cohort management with auto-generated class invite codes</li>
              <li>Cohort gradebooks & real-time offline-sync analytics</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={onLogin}
            style={{ minHeight: '48px' }}
            className="w-full bg-navy hover:bg-navy-2 text-white font-bold text-sm px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            <LogIn className="w-4 h-4" />
            <span>SIGN IN TO INSTRUCTOR PORTAL</span>
          </button>

          <button
            type="button"
            onClick={onBack}
            className="w-full text-xs text-ink-3 hover:text-ink underline cursor-pointer py-1.5 focus:outline-none"
          >
            ← Back to role selection
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   FOOTER COMPONENT
   ========================================================================= */
function Footer() {
  return (
    <footer className="bg-navy border-t border-white/10 text-navtext py-8 select-none">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div>
          <p className="font-extrabold uppercase tracking-widest text-xs text-white">
            Africa Quantitative Sciences (AQS)
          </p>
          <p className="text-xs text-navtext/70 mt-0.5">Learning shouldn&apos;t depend on perfect connectivity.</p>
        </div>
        <p className="text-[11px] font-mono text-navtext/50">
          © {new Date().getFullYear()} AQS Platform • Offline-first LMS engine
        </p>
      </div>
    </footer>
  );
}

/* =========================================================================
   MAIN EXPORT: LANDING PAGE COMPONENT
   ========================================================================= */
export function LandingPage({
  initialCourses,
  onLogin,
  authLoading = false,
  onRegister,
  regName,
  setRegName,
  regEmail,
  setRegEmail,
  regError,
  regSuccess,
  regLoading,
  onClearRegForm,
}: LandingPageProps) {
  const [view, setView] = useState<LandingView>('home');
  const [courses, setCourses] = useState<PublicCourse[]>(initialCourses ?? []);
  const [coursesLoading, setCoursesLoading] = useState<boolean>(!initialCourses || initialCourses.length === 0);
  const [coursesError, setCoursesError] = useState<string | null>(null);

  const fetchCoursesData = useCallback(async () => {
    try {
      const { ok, data } = await apiFetch<PublicCourse[]>('/api/public/courses');
      if (ok && Array.isArray(data)) {
        setCourses(data);
        setCoursesError(null);
      } else {
        setCoursesError('Unable to load the latest course catalogue. Please check your connection and try again.');
      }
    } catch {
      setCoursesError('Unable to load the latest course catalogue. Please check your connection and try again.');
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  const handleRetry = useCallback(() => {
    setCoursesLoading(true);
    setCoursesError(null);
    fetchCoursesData();
  }, [fetchCoursesData]);

  useEffect(() => {
    if (initialCourses && initialCourses.length > 0) {
      return;
    }

    let isMounted = true;

    apiFetch<PublicCourse[]>('/api/public/courses')
      .then(({ ok, data }) => {
        if (!isMounted) return;
        if (ok && Array.isArray(data)) {
          setCourses(data);
          setCoursesError(null);
        } else {
          setCoursesError('Unable to load the latest course catalogue. Please check your connection and try again.');
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setCoursesError('Unable to load the latest course catalogue. Please check your connection and try again.');
      })
      .finally(() => {
        if (isMounted) {
          setCoursesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [initialCourses]);

  const goHome = () => {
    if (onClearRegForm) onClearRegForm();
    setView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExploreCourses = () => {
    if (view !== 'home') {
      setView('home');
      setTimeout(() => {
        const el = document.getElementById('courses');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById('courses');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-appbg text-ink flex flex-col font-sans selection:bg-ochre selection:text-white">
      {/* Landing Header */}
      <Header
        onNav={(v) => {
          if (onClearRegForm) onClearRegForm();
          setView(v);
        }}
        onHome={goHome}
        onExploreCourses={handleExploreCourses}
        onLoginClick={() => setView('login')}
      />

      {/* Main Content Space based on current view */}
      <main className="flex-grow flex flex-col">
        {view === 'home' && (
          <>
            <Hero
              onExplore={handleExploreCourses}
              onGetStarted={() => {
                if (onClearRegForm) onClearRegForm();
                setView('signup-role');
              }}
            />
            <HowItWorks />
            <CourseDiscovery
              courses={courses}
              coursesLoading={coursesLoading}
              coursesError={coursesError}
              onRetry={handleRetry}
            />
          </>
        )}

        {view !== 'home' && (
          <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 w-full">
            <button
              type="button"
              onClick={goHome}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ochre transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre rounded px-2 py-1"
            >
              ← Back to Home
            </button>
          </div>
        )}

        {view === 'login' && (
          <LoginView
            onLogin={onLogin}
            authLoading={authLoading}
            onSwitchToSignup={() => {
              if (onClearRegForm) onClearRegForm();
              setView('signup-role');
            }}
          />
        )}

        {view === 'signup-role' && <RoleSelect onNav={setView} />}

        {view === 'signup-learner' && (
          <LearnerSignup
            onRegister={onRegister}
            onLogin={onLogin}
            regName={regName}
            setRegName={setRegName}
            regEmail={regEmail}
            setRegEmail={setRegEmail}
            regError={regError}
            regSuccess={regSuccess}
            regLoading={regLoading}
            onSwitchToLogin={() => {
              if (onClearRegForm) onClearRegForm();
              setView('login');
            }}
          />
        )}

        {view === 'signup-instructor' && (
          <InstructorOnboarding onLogin={onLogin} onBack={() => setView('signup-role')} />
        )}
      </main>

      {/* Landing Footer */}
      <Footer />
    </div>
  );
}
