// src/App.tsx
import { useState, useEffect, useCallback, lazy, Suspense, FormEvent } from 'react';
import { AnimatePresence } from 'motion/react';
import { auth, googleAuthProvider } from './lib/firebase.js';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { Course, QuizAttempt, User } from './types.js';
import { PouchDBService } from './lib/pouchdb-service.js';
import { LearnerDashboard } from './components/LearnerDashboard.tsx';
import { LearnerProgress } from './components/LearnerProgress.tsx';
import { LearnerCoursePlayer } from './components/LearnerCoursePlayer.tsx';
const AdminLMS = lazy(() => import('./components/AdminLMS.tsx').then((m) => ({ default: m.AdminLMS })));
import { BannerOffline } from './components/BannerOffline.tsx';
import { ProfileEditModal } from './components/ProfileEditModal.tsx';
import { apiFetch, setApiToken } from './lib/api.js';
import { useOnlineStatus } from './hooks/useOnlineStatus.js';
import {
  BookOpen,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  CheckCircle,
  CirclePlay,
  CircleCheck,
  LayoutGrid,
  Search,
} from 'lucide-react';

interface SyncBadgeProps {
  syncInProgress: boolean;
  pendingSyncCount: number;
}

function SyncBadge({ syncInProgress, pendingSyncCount }: SyncBadgeProps) {
  const isOnline = useOnlineStatus();

  const state: 'offline' | 'syncing' | 'synced' = !isOnline
    ? 'offline'
    : syncInProgress || pendingSyncCount > 0
      ? 'syncing'
      : 'synced';

  const dotColor = state === 'offline' ? 'var(--ochre)' : state === 'syncing' ? 'var(--ochre)' : 'var(--success)';
  const label =
    state === 'offline'
      ? 'Offline — saved locally'
      : state === 'syncing'
        ? `Syncing ${pendingSyncCount > 0 ? `${pendingSyncCount} ` : ''}items…`
        : 'Synced just now';

  return (
    <button
      type="button"
      title="Sync status"
      className="hidden md:flex items-center gap-1.5 border border-white/10 rounded px-2.5 py-1 text-navtext text-[11px] font-mono cursor-default select-none"
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
      <span>{label}</span>
    </button>
  );
}

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { key: 'progress', label: 'Progress', icon: CircleCheck },
  { key: 'discover', label: 'Discover', icon: Search },
] as const;

type LearnerNavKey = (typeof NAV_ITEMS)[number]['key'];

export default function App() {
  // Authentication status
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [showProfileEdit, setShowProfileEdit] = useState<boolean>(false);

  // Registration form state
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCode, setRegCode] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  // Application Data Caching
  const [courses, setCourses] = useState<Course[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<number[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [appLoading, setAppLoading] = useState<boolean>(false);

  // UI state routing
  const [activeCourseId, setActiveCourseId] = useState<number | null>(null);
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname);

  // Learner left-nav destination state (dashboard + sub-tab, or Progress view)
  const [learnerNav, setLearnerNav] = useState<'dashboard' | 'progress'>('dashboard');
  const [dashboardTab, setDashboardTab] = useState<'browse' | null>(null);

  // Lifted AdminLMS tab state
  const [adminActiveTab, setAdminActiveTab] = useState<'courses' | 'analytics' | 'cohorts' | 'users'>('courses');

  // Sync badge state (lifted from BannerOffline + pending queue poll)
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Simple router popstate listener
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const isLmsPath =
    currentPath === '/lms' ||
    currentPath.startsWith('/lms') ||
    currentPath === '/cms' ||
    currentPath.startsWith('/cms') ||
    currentPath === '/admin' ||
    currentPath.startsWith('/admin');

  // Synchronize database user profile and pull remote statistics
  const syncUserProfile = async (_idToken: string) => {
    try {
      const { ok, data } = await apiFetch('/api/auth/me');
      if (ok) {
        setDbUser(data.dbUser);
      }
    } catch (error) {
      console.warn('Network error synchronizing credentials; defaulting to local schema role representation.', error);
    }
  };

  // 2. Load Core Application study data (Offline / Online adaptive) — hoisted before effects
  const loadAppData = useCallback(
    async (overrideToken?: string) => {
      setAppLoading(true);
      const activeToken = overrideToken ?? token;

      // Offline pre-fetch: Read cache first (parallel reads)
      const [cachedCourses, cachedProgress] = await Promise.all([
        PouchDBService.getCachedCourses(),
        PouchDBService.getUserProgress(),
      ]);

      setCourses(cachedCourses);
      setCompletedLessonIds(cachedProgress.completedLessonIds);
      setQuizAttempts(cachedProgress.quizAttempts);

      // Online upgrade: Fetch latest from PG when connected!
      if (navigator.onLine && activeToken) {
        try {
          // Fire courses, sync, and enrollments in parallel — none depends on the other
          const [coursesResult, syncResult, enrollResult] = await Promise.all([
            apiFetch('/api/courses'),
            apiFetch('/api/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lessonCompletions: [], quizSubmissions: [] }),
            }),
            apiFetch<{ courseIds: number[] }>('/api/enrollments'),
          ]);

          const { ok: coursesOk, data: remoteCourses } = coursesResult;
          if (coursesOk) {
            setCourses(remoteCourses);
            await PouchDBService.cacheCourses(remoteCourses);
          }

          const { ok: syncOk, data: syncData } = syncResult;
          if (syncOk) {
            setCompletedLessonIds(syncData.syncedCompletions);
            setQuizAttempts(syncData.syncedAttempts);
            await PouchDBService.saveUserProgress(syncData.syncedCompletions, syncData.syncedAttempts);
          }

          // Sync server enrollments into localStorage for cross-device persistence
          const { ok: enrollOk, data: enrollData } = enrollResult;
          if (enrollOk && enrollData) {
            const existing: number[] = JSON.parse(localStorage.getItem('aqs_enrolled_courses') ?? '[]');
            const merged = Array.from(new Set([...existing, ...enrollData.courseIds]));
            localStorage.setItem('aqs_enrolled_courses', JSON.stringify(merged));
          }
        } catch (err) {
          console.warn(
            'Unable to pull remote database course records; working with cached PouchDB offline materials.',
            err,
          );
        }
      }

      setAppLoading(false);
    },
    [token],
  );

  // 1. Firebase auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      if (user) {
        setFirebaseUser(user);
        const idToken = await user.getIdToken();
        setToken(idToken);
        setApiToken(idToken);
        // Fire these in parallel — neither depends on the other
        syncUserProfile(idToken);
        loadAppData(idToken);
      } else {
        setFirebaseUser(null);
        setDbUser(null);
        setToken(null);
        // Clear caching on logout
        setCourses([]);
        setCompletedLessonIds([]);
        setQuizAttempts([]);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [loadAppData]);

  // (token-change reload handled by auth listener + child component callbacks)

  // Lightweight pending-sync poll for the topbar badge (learner only).
  // The interval only runs while the device is online; it is cleared when going
  // offline or unmounting, and offline resets the count to 0 so offline always
  // renders as authoritative ("Offline — saved locally") with no stale queue data.
  useEffect(() => {
    if (isLmsPath || !firebaseUser) return;

    let cancelled = false;
    let intervalId: number | undefined;

    const poll = async () => {
      if (cancelled || !navigator.onLine) return;
      try {
        const queue = await PouchDBService.getSyncQueue();
        if (!cancelled) {
          setPendingSyncCount(queue.lessonCompletions.length + queue.quizSubmissions.length);
        }
      } catch {
        // Non-critical — badge just keeps its last known value.
      }
    };

    const handleOnline = () => {
      setPendingSyncCount(0);
      poll();
      if (intervalId === undefined) {
        intervalId = window.setInterval(poll, 5000);
      }
    };
    const handleOffline = () => {
      setPendingSyncCount(0);
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) {
      poll();
      intervalId = window.setInterval(poll, 5000);
    }

    return () => {
      cancelled = true;
      if (intervalId !== undefined) clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isLmsPath, firebaseUser, syncInProgress]);

  // Auth Operations
  const handleLogin = async () => {
    try {
      setAuthLoading(true);
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error: any) {
      console.error('Google popup login failed. Point to signInWithRedirect:', error);
      alert('Login error. Please ensure popups are allowed and retry.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setAuthLoading(true);
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');
    setRegLoading(true);
    try {
      const { ok, data } = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim().toLowerCase(),
          inviteCode: regCode.trim().toUpperCase(),
        }),
      });
      if (ok) {
        setRegSuccess('Account created! Now sign in with Google using this same email to activate your account.');
        setRegName('');
        setRegEmail('');
        setRegCode('');
      } else {
        setRegError(data?.error || 'Registration failed — please try again.');
      }
    } catch (err) {
      setRegError('Network error — please try again.');
    } finally {
      setRegLoading(false);
    }
  };

  // Left-nav active destination (dashboard sub-tab drives Dashboard/My courses/Discover highlight)
  const activeNavItem: LearnerNavKey =
    learnerNav === 'progress' ? 'progress' : dashboardTab === 'browse' ? 'discover' : 'dashboard';

  const handleNavClick = (key: LearnerNavKey) => {
    if (key === 'progress') {
      setLearnerNav('progress');
      return;
    }
    setLearnerNav('dashboard');
    setDashboardTab(key === 'discover' ? 'browse' : null);
  };

  return (
    <div
      className={`min-h-screen ${isLmsPath ? 'theme-lms' : 'theme-learner'} ${isLmsPath ? 'bg-lms' : 'bg-appbg'} text-ink selection:bg-ochre selection:text-white flex flex-col font-sans`}
    >
      {/* Dynamic Navigation Top Header */}
      <header
        className={`sticky top-0 z-50 border-b px-7 py-3 flex items-center justify-between shadow-sm select-none ${
          isLmsPath ? 'bg-lms text-white border-white/[0.06]' : 'bg-navy text-navtext border-white/[0.08]'
        }`}
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`text-white rounded w-8 h-8 flex items-center justify-center shrink-0 ${
              isLmsPath ? 'bg-steel' : 'bg-ochre'
            }`}
          >
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] font-display font-semibold tracking-tight leading-none text-white truncate">
              AQS Learning
            </h1>
            {isLmsPath && (
              <p className="text-[10px] font-bold font-mono tracking-wider mt-1 uppercase truncate text-white/60">
                Instructor Portal
              </p>
            )}
          </div>
        </div>

        {/* Auth details & navigation header center tools */}
        {firebaseUser && dbUser && (
          <div className="flex items-center gap-3 sm:gap-6">
            {/* Portal switcher for admin/instructor users */}
            {(dbUser.role === 'admin' || dbUser.role === 'instructor') && (
              <div
                className={`hidden lg:flex items-center gap-1 rounded-lg p-0.5 border ${
                  isLmsPath ? 'border-white/[0.12] bg-lms-3/50' : 'border-white/[0.12] bg-navy-3/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => navigateTo('/study')}
                  className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors cursor-pointer ${
                    !isLmsPath ? 'bg-ochre text-white' : 'text-white/70 hover:text-white'
                  }`}
                >
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo('/lms')}
                  className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors cursor-pointer ${
                    isLmsPath ? 'bg-steel text-white' : 'text-white/70 hover:text-white'
                  }`}
                >
                  Admin
                </button>
              </div>
            )}

            {/* Contextual Navigation Tabs */}
            <div className="hidden sm:flex items-center gap-1">
              {isLmsPath ? (
                <>
                  <button
                    onClick={() => setAdminActiveTab('courses')}
                    className={`px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-all cursor-pointer ${
                      adminActiveTab === 'courses'
                        ? 'bg-lms-2 text-white font-semibold'
                        : 'text-white/70 hover:bg-lms-3 hover:text-white'
                    }`}
                  >
                    Courses
                  </button>
                  <button
                    onClick={() => setAdminActiveTab('analytics')}
                    className={`px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-all cursor-pointer ${
                      adminActiveTab === 'analytics'
                        ? 'bg-lms-2 text-white font-semibold'
                        : 'text-white/70 hover:bg-lms-3 hover:text-white'
                    }`}
                  >
                    Analytics
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setActiveCourseId(null)}
                    className={`px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-all cursor-pointer ${
                      activeCourseId === null
                        ? 'bg-navy-2 text-navactive font-semibold'
                        : 'text-navtext hover:bg-navy-3 hover:text-navactive'
                    }`}
                  >
                    Dashboard
                  </button>
                  {activeCourseId !== null && (
                    <span className="px-3.5 py-1.5 text-[13px] font-medium text-white/90 bg-navy-2 rounded-md">
                      Lesson
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {/* Sync status badge (learner only) */}
              {!isLmsPath && <SyncBadge syncInProgress={syncInProgress} pendingSyncCount={pendingSyncCount} />}

              <div className="text-right hidden md:block">
                <p
                  onClick={() => setShowProfileEdit(true)}
                  className={`text-xs font-semibold transition-colors leading-none cursor-pointer ${
                    isLmsPath ? 'text-white/80 hover:text-white' : 'text-navtext hover:text-navactive'
                  }`}
                >
                  {(dbUser.name || dbUser.email).trim().split(/\s+/)[0]}
                </p>
              </div>

              {/* Circular Avatar Badge in Header */}
              <div
                onClick={() => setShowProfileEdit(true)}
                className={`w-[30px] h-[30px] rounded-full overflow-hidden border border-white/15 flex items-center justify-center shrink-0 select-none shadow-sm cursor-pointer hover:ring-2 transition-all ${
                  isLmsPath ? 'bg-lms-3 hover:ring-steel/50' : 'bg-navy-3 hover:ring-ochre/40'
                }`}
              >
                {dbUser.avatarUrl ? (
                  <img
                    src={dbUser.avatarUrl}
                    alt={dbUser.name || 'Profile'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-accent text-white font-extrabold text-[11px] flex items-center justify-center">
                    {dbUser.name ? dbUser.name.slice(0, 1).toUpperCase() : dbUser.email.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Space */}
      <main className="flex-grow flex flex-col justify-center">
        {authLoading ? (
          <div className="flex flex-col items-center justify-center p-12 min-h-[60vh] text-ink">
            <RefreshCw className="w-12 h-12 animate-spin text-accent mb-4" />
            <h2 className="text-xl font-display font-bold tracking-tight text-ink">Verifying account...</h2>
            <p className="text-ink-3 font-mono text-xs mt-1">Connecting to authentication keys</p>
          </div>
        ) : !firebaseUser ? (
          /* Visual Landing and Google Signup Module */
          <div className="w-full max-w-lg mx-auto px-6 py-8" id="welcome-login-screen">
            <div className="bg-paper-2 border border-rule p-8 rounded-3xl shadow-lg text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-accent"></div>

              <div className="bg-paper border border-rule aspect-square w-20 h-20 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-sm">
                <BookOpen className="w-10 h-10 text-accent" />
              </div>

              <h2 className="text-3xl font-display font-bold text-ink tracking-tight">AQS Digital Classroom</h2>
              <p className="text-ink-2 font-medium text-sm leading-relaxed mt-3 px-2">
                Welcome to Africa Quantitative Sciences. Our digital classroom lets rural students study complete
                analytics courseware offline, track progress under poor network, and verify quiz evaluations seamlessly.
              </p>

              <div className="my-6 border-b border-rule"></div>

              {!showRegisterForm ? (
                <>
                  {/* Explicit 56px Google login button */}
                  <button
                    onClick={handleLogin}
                    className="w-full h-14 bg-accent hover:opacity-90 text-white font-bold text-lg px-6 rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    style={{ minHeight: '56px' }}
                  >
                    <LogIn className="w-6 h-6 shrink-0" />
                    <span>SIGN IN WITH GOOGLE</span>
                  </button>

                  <div className="mt-4 border-t border-rule pt-4">
                    <button
                      onClick={() => {
                        setShowRegisterForm(true);
                        setRegError('');
                        setRegSuccess('');
                      }}
                      className="w-full h-12 bg-paper border-2 border-accent text-accent font-bold text-sm px-6 rounded-xl hover:bg-ochre-dim/40 transition-all cursor-pointer"
                    >
                      JOIN WITH A CLASS CODE
                    </button>
                  </div>
                </>
              ) : regSuccess ? (
                <div className="space-y-4">
                  <div className="bg-success/10 border border-success/30 rounded-xl p-5 text-sm text-ink text-left">
                    <p className="font-bold mb-1">Account created!</p>
                    <p>Now sign in with Google using this same email to activate your account.</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowRegisterForm(false);
                      setRegSuccess('');
                    }}
                    className="w-full h-14 bg-accent hover:opacity-90 text-white font-bold text-lg px-6 rounded-xl shadow-md active:scale-[0.98] transition-all cursor-pointer"
                  >
                    SIGN IN WITH GOOGLE
                  </button>
                </div>
              ) : (
                <div className="text-left space-y-4">
                  {regError && (
                    <div className="bg-error-bg border border-error/20 rounded-xl p-4 text-sm text-error">
                      {regError}
                    </div>
                  )}
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                      <label
                        htmlFor="reg-name"
                        className="block text-[10px] font-bold uppercase text-ink-3 mb-1.5 font-mono"
                      >
                        Full Name
                      </label>
                      <input
                        id="reg-name"
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Full name"
                        className="w-full h-12 px-4 rounded-xl border border-rule bg-paper text-base text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ochre/30 focus:border-ochre"
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="reg-email"
                        className="block text-[10px] font-bold uppercase text-ink-3 mb-1.5 font-mono"
                      >
                        Email Address
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="Email address"
                        className="w-full h-12 px-4 rounded-xl border border-rule bg-paper text-base text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ochre/30 focus:border-ochre"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="reg-code"
                        className="block text-[10px] font-bold uppercase text-ink-3 mb-1.5 font-mono"
                      >
                        Class Code
                      </label>
                      <input
                        id="reg-code"
                        type="text"
                        value={regCode}
                        onChange={(e) => setRegCode(e.target.value)}
                        placeholder="Class code (e.g. A1B2C3D4)"
                        className="w-full h-12 px-4 rounded-xl border border-rule bg-paper text-base text-ink placeholder:text-ink-3 font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-ochre/30 focus:border-ochre"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={regLoading || !regName.trim() || !regEmail.trim() || !regCode.trim()}
                      className="w-full h-12 bg-accent hover:opacity-90 disabled:bg-ink-3/40 disabled:text-white/60 text-white font-bold text-sm px-6 rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed"
                    >
                      {regLoading ? 'Joining...' : 'JOIN CLASS'}
                    </button>
                  </form>
                  <button
                    onClick={() => {
                      setShowRegisterForm(false);
                      setRegError('');
                      setRegSuccess('');
                    }}
                    className="w-full text-sm text-ink-3 underline cursor-pointer"
                  >
                    Back to sign in
                  </button>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-ink-2 font-mono uppercase bg-paper border border-rule p-3 rounded-xl">
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle className="w-4 h-4" /> Offline Compatible
                </span>
                <span className="text-ink-3/50">|</span>
                <span className="flex items-center gap-1.5 text-accent">
                  <Sparkles className="w-4 h-4" /> Sync Progress
                </span>
              </div>
            </div>
          </div>
        ) : appLoading ? (
          <div className="flex flex-col items-center justify-center p-12 min-h-[60vh] text-ink">
            <RefreshCw className="w-12 h-12 animate-spin text-accent mb-4" />
            <h2 className="text-xl font-display font-bold tracking-tight text-ink">Compiling Study Schedule...</h2>
            <p className="text-ink-3 font-mono text-xs mt-1">Acquiring cached lectures and assessment records</p>
          </div>
        ) : (
          /* AUTHENTICATED CLASS WORKSPACES */
          <div className="w-full">
            {/* Render LMS if the path is /lms, otherwise default to Student Learner PWA */}
            {isLmsPath ? (
              dbUser?.role === 'admin' || dbUser?.role === 'instructor' ? (
                /* WORKSPACE A: ADMIN LMS */
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center p-12 text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading Admin Portal...
                    </div>
                  }
                >
                  <AdminLMS
                    token={token}
                    courses={courses}
                    onRefreshCourses={loadAppData}
                    currentUserId={dbUser?.id}
                    userRole={dbUser?.role}
                    activeTab={adminActiveTab}
                    onActiveTabChange={setAdminActiveTab}
                  />
                </Suspense>
              ) : (
                /* LMS Access Guard fallback */
                <div className="w-full max-w-lg mx-auto px-6 text-center py-12" id="lms-access-denied-view">
                  <div className="bg-paper-2 border border-rule p-8 rounded-3xl shadow-lg">
                    <ShieldAlert className="w-16 h-16 text-error mx-auto mb-4" />
                    <h2 className="text-2xl font-display font-bold text-ink">LMS Access Denied</h2>
                    <p className="text-ink-2 text-sm mt-2 font-medium">
                      Your current user account ({dbUser?.email}) does not possess Admin access.
                    </p>
                    <button
                      onClick={() => navigateTo('/study')}
                      className="mt-6 h-12 w-full bg-accent hover:opacity-90 text-white font-bold rounded-xl transition-all shadow-md cursor-pointer"
                    >
                      Go back to Student PWA
                    </button>
                  </div>
                </div>
              )
            ) : (
              /* WORKSPACE B: STUDENT LEARNER MODULES */
              <div className={`w-full ${activeCourseId === null ? 'pb-24 lg:pb-0' : ''}`}>
                <div className="flex gap-6">
                  {/* Left navigation — visible on dashboard views only (hidden inside course player, hidden on mobile) */}
                  {activeCourseId === null && (
                    <aside
                      id="leftnav"
                      className="hidden md:flex flex-col gap-0.5 w-[220px] shrink-0 bg-navy border-r border-white/[0.07] px-3 py-5"
                    >
                      <p className="text-[10px] uppercase tracking-[0.08em] text-white/30 px-2.5 pb-1.5 pt-3.5 select-none">
                        Learning
                      </p>
                      {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
                        const isActive = activeNavItem === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleNavClick(key)}
                            className={`flex items-center gap-[9px] px-2.5 py-2 rounded-[7px] text-[13px] font-medium transition-colors cursor-pointer select-none ${
                              isActive ? 'bg-ochre text-white' : 'text-navtext hover:bg-navy-3 hover:text-white'
                            }`}
                          >
                            <Icon className={`w-[15px] h-[15px] shrink-0 ${isActive ? 'opacity-100' : 'opacity-65'}`} />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </aside>
                  )}

                  <div className="flex-1 min-w-0">
                    {/* Connection check sync status monitor */}
                    <BannerOffline
                      onSyncComplete={loadAppData}
                      onSyncStateChange={(state) => setSyncInProgress(state.syncing)}
                      token={token}
                    />

                    {activeCourseId === null ? (
                      learnerNav === 'progress' ? (
                        /* Learner Progress view (real existing completion/quiz data via ProgressTree) */
                        <LearnerProgress
                          courses={courses}
                          completedLessonIds={completedLessonIds}
                          quizAttempts={quizAttempts}
                          onSelectCourse={setActiveCourseId}
                          onGoDiscover={() => {
                            setLearnerNav('dashboard');
                            setDashboardTab('browse');
                          }}
                        />
                      ) : (
                        /* Learner discovery home lists available courses bento stats */
                        <LearnerDashboard
                          key={dashboardTab ?? 'default'}
                          initialTab={dashboardTab ?? undefined}
                          courses={courses}
                          completedLessonIds={completedLessonIds}
                          quizAttempts={quizAttempts}
                          onSelectCourse={setActiveCourseId}
                          user={dbUser}
                          token={token}
                          onProfileUpdated={() => token && syncUserProfile(token)}
                        />
                      )
                    ) : (
                      /* Focused course drawer / curriculum player */
                      <LearnerCoursePlayer
                        courseId={activeCourseId}
                        token={token}
                        onBack={() => setActiveCourseId(null)}
                        onProgressUpdated={loadAppData}
                      />
                    )}
                  </div>
                </div>

                {/* Mobile learner bottom navigation (hidden on lg+; hidden inside the course player) */}
                {activeCourseId === null && (
                  <nav
                    aria-label="Learner navigation"
                    className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-navy border-t border-white/10"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                  >
                    <div className="flex items-stretch justify-around px-1">
                      {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
                        const isActive = activeNavItem === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleNavClick(key)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`flex flex-col items-center justify-center gap-1 py-2.5 px-3 min-w-0 flex-1 cursor-pointer select-none transition-colors ${
                              isActive ? 'text-ochre' : 'text-navtext hover:text-white'
                            }`}
                          >
                            <Icon className="w-5 h-5 shrink-0" />
                            <span className="text-[10px] font-bold leading-none truncate">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </nav>
                )}
              </div>
            )}

            {/* Float Mobile Route switcher helper */}
            {firebaseUser && dbUser && (dbUser.role === 'admin' || dbUser.role === 'instructor') && (
              <div
                className="block sm:hidden fixed bottom-6 right-6 z-50"
                style={{
                  bottom:
                    !isLmsPath && activeCourseId === null
                      ? 'calc(max(1.5rem, env(safe-area-inset-bottom)) + 4.5rem)'
                      : 'max(1.5rem, env(safe-area-inset-bottom))',
                }}
              >
                <button
                  onClick={() => {
                    navigateTo(isLmsPath ? '/study' : '/lms');
                  }}
                  style={{ height: '56px' }}
                  className={`border-4 p-4 rounded-2xl flex items-center gap-2 text-white font-black text-sm active:translate-y-1 shadow-lg cursor-pointer ${
                    isLmsPath ? 'bg-lms border-lms-2' : 'bg-navy border-navy-2'
                  }`}
                >
                  <RefreshCw className="w-5 h-5 animate-spin-slow text-accent" />
                  <span>SWITCH TO {isLmsPath ? 'STUDENT APP' : 'ADMIN PORTAL'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <AnimatePresence>
        {showProfileEdit && (
          <ProfileEditModal
            user={dbUser}
            token={token}
            onClose={() => setShowProfileEdit(false)}
            onProfileUpdated={() => token && syncUserProfile(token)}
            onLogout={handleLogout}
          />
        )}
      </AnimatePresence>

      {/* Decorative footer */}
      <footer className="bg-navy border-t border-white/10 text-navtext/60 py-6 text-center text-xs font-mono select-none mt-auto">
        <p className="font-extrabold uppercase tracking-widest text-navtext">
          Africa Quantitative Sciences (AQS) Platform
        </p>
        <p className="mt-1 pb-2 text-navtext opacity-50">
          PWA Offline learning engine • Server-side secure scoring and sync encryption
        </p>
      </footer>
    </div>
  );
}
