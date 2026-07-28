// src/App.tsx
import { useState, useEffect, useCallback, lazy, Suspense, FormEvent } from 'react';
import { AnimatePresence } from 'motion/react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { Course, QuizAttempt, User } from './types.ts';
import { PouchDBService } from './lib/pouchdb-service.ts';
import { LearnerDashboard } from './components/LearnerDashboard.tsx';
import { LearnerCoursePlayer } from './components/LearnerCoursePlayer.tsx';
const AdminLMS = lazy(() => import('./components/AdminLMS.tsx').then((m) => ({ default: m.AdminLMS })));
import { BannerOffline } from './components/BannerOffline.tsx';
import { ProfileEditModal } from './components/ProfileEditModal.tsx';
import { apiFetch, setApiToken } from './lib/api.ts';
import {
  Compass,
  LogIn,
  LogOut,
  User as UserIcon,
  RefreshCw,
  HelpCircle,
  Sparkles,
  Star,
  ShieldAlert,
  Monitor,
  CheckCircle,
} from 'lucide-react';

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

  const isLmsPath = currentPath === '/lms' || currentPath.startsWith('/lms');

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-emerald-500 selection:text-slate-900 flex flex-col font-sans">
      {/* Dynamic Navigation Top Header */}
      <header
        className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm select-none"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 p-2.5 rounded-xl text-emerald-600 flex items-center justify-center font-semibold text-lg border border-emerald-500/20">
            <Compass className="w-6 h-6 animate-spin-slow text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-sans tracking-tight leading-none text-slate-900">AQS Learning</h1>
            <p className="text-[10px] font-bold text-slate-500 font-mono tracking-wider mt-1 uppercase">
              Africa Quantitative Sciences
            </p>
          </div>
        </div>

        {/* Auth details & grading switcher tools */}
        {firebaseUser && dbUser && (
          <div className="flex items-center gap-4">
            {/* Decoupled Route Navigation Tabs */}
            {firebaseUser && dbUser && (dbUser.role === 'admin' || dbUser.role === 'instructor') && (
              <div className="hidden sm:flex bg-slate-100 p-1 rounded-xl border border-slate-200 h-11 items-center font-mono">
                <button
                  onClick={() => {
                    navigateTo('/study');
                  }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    !isLmsPath ? 'bg-emerald-650 text-white shadow-sm' : 'text-slate-550 hover:text-slate-800'
                  }`}
                >
                  STUDENT APP
                </button>
                <button
                  onClick={() => navigateTo('/lms')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    isLmsPath ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-550 hover:text-slate-800'
                  }`}
                >
                  ADMIN PORTAL
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="text-right hidden md:block">
                <p
                  onClick={() => setShowProfileEdit(true)}
                  className="text-xs font-bold text-slate-800 hover:text-indigo-600 transition-colors leading-none cursor-pointer"
                >
                  {dbUser.name || dbUser.email}
                </p>
                <div className="flex items-center gap-1.5 justify-end mt-1">
                  <span className="text-[9px] font-semibold font-mono text-slate-500 uppercase tracking-widest">
                    ROLE: {dbUser.role}
                  </span>
                </div>
              </div>

              {/* Circular Avatar Badge in Header */}
              <div
                onClick={() => setShowProfileEdit(true)}
                className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0 select-none shadow-sm mr-1 cursor-pointer hover:ring-2 hover:ring-indigo-500/30 transition-all animate-none"
              >
                {dbUser.avatarUrl ? (
                  <img
                    src={dbUser.avatarUrl}
                    alt={dbUser.name || 'Profile'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-emerald-650 text-white font-extrabold text-[13px] flex items-center justify-center">
                    {dbUser.name ? dbUser.name.slice(0, 1).toUpperCase() : dbUser.email.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>

              <button
                onClick={handleLogout}
                title="Sign Out of Account"
                className="h-11 w-11 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Space */}
      <main className="flex-grow py-8 flex flex-col justify-center">
        {authLoading ? (
          <div className="flex flex-col items-center justify-center p-12 min-h-[60vh] text-slate-805">
            <RefreshCw className="w-12 h-12 animate-spin text-emerald-650 mb-4" />
            <h2 className="text-xl font-bold font-sans tracking-tight text-slate-800">Verifying account...</h2>
            <p className="text-slate-500 font-mono text-xs mt-1">Connecting to authentication keys</p>
          </div>
        ) : !firebaseUser ? (
          /* Visual Landing and Google Signup Module */
          <div className="w-full max-w-lg mx-auto px-6" id="welcome-login-screen">
            <div className="bg-white border border-slate-150 p-8 rounded-3xl shadow-lg hover:shadow-xl transition-all duration-300 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500"></div>

              <div className="bg-indigo-50/65 border border-indigo-100 aspect-square w-20 h-20 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-sm">
                <Compass className="w-10 h-10 text-indigo-600 animate-spin-slow" />
              </div>

              <h2 className="text-3xl font-bold text-slate-900 font-sans tracking-tight">AQS Digital Classroom</h2>
              <p className="text-slate-500 font-medium text-sm leading-relaxed mt-3 px-2">
                Welcome to Africa Quantitative Sciences. Our digital classroom lets rural students study complete
                analytics courseware offline, track progress under poor network, and verify quiz evaluations seamlessly.
              </p>

              <div className="my-6 border-b border-slate-100"></div>

              {!showRegisterForm ? (
                <>
                  {/* Explicit 56px Google login button */}
                  <button
                    onClick={handleLogin}
                    className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg px-6 rounded-2xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-3 border border-indigo-700/20"
                    style={{ minHeight: '56px' }}
                  >
                    <LogIn className="w-6 h-6 shrink-0" />
                    <span>SIGN IN WITH GOOGLE</span>
                  </button>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <button
                      onClick={() => {
                        setShowRegisterForm(true);
                        setRegError('');
                        setRegSuccess('');
                      }}
                      className="w-full h-12 bg-white border-2 border-emerald-500 text-emerald-700 font-bold text-sm px-6 rounded-2xl hover:bg-emerald-50 transition-all cursor-pointer"
                    >
                      JOIN WITH A CLASS CODE
                    </button>
                  </div>
                </>
              ) : regSuccess ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-sm text-emerald-800 text-left">
                    <p className="font-bold mb-1">Account created!</p>
                    <p>Now sign in with Google using this same email to activate your account.</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowRegisterForm(false);
                      setRegSuccess('');
                    }}
                    className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg px-6 rounded-2xl shadow-md active:scale-[0.98] transition-all cursor-pointer"
                  >
                    SIGN IN WITH GOOGLE
                  </button>
                </div>
              ) : (
                <div className="text-left space-y-4">
                  {regError && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
                      {regError}
                    </div>
                  )}
                  <form onSubmit={handleRegister} className="space-y-4">
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Full name"
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                      required
                      autoFocus
                    />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                      required
                    />
                    <input
                      type="text"
                      value={regCode}
                      onChange={(e) => setRegCode(e.target.value)}
                      placeholder="Class code (e.g. A1B2C3D4)"
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-base text-slate-800 placeholder:text-slate-400 font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                      required
                    />
                    <button
                      type="submit"
                      disabled={regLoading || !regName.trim() || !regEmail.trim() || !regCode.trim()}
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-sm px-6 rounded-2xl transition-all cursor-pointer disabled:cursor-not-allowed"
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
                    className="w-full text-sm text-slate-500 underline cursor-pointer"
                  >
                    Back to sign in
                  </button>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-600 font-mono uppercase bg-slate-50 border border-slate-100 p-3 rounded-2xl">
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle className="w-4 h-4 fill-emerald-50/50" /> Offline Compatible
                </span>
                <span className="text-slate-300">|</span>
                <span className="flex items-center gap-1.5 text-indigo-600">
                  <Sparkles className="w-4 h-4" /> Sync Progress
                </span>
              </div>
            </div>
          </div>
        ) : appLoading ? (
          <div className="flex flex-col items-center justify-center p-12 min-h-[60vh] text-slate-800">
            <RefreshCw className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
            <h2 className="text-xl font-bold font-sans tracking-tight text-slate-800">Compiling Study Schedule...</h2>
            <p className="text-slate-500 font-mono text-xs mt-1">Acquiring cached lectures and assessment records</p>
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
                  />
                </Suspense>
              ) : (
                /* LMS Access Guard fallback */
                <div className="w-full max-w-lg mx-auto px-6 text-center py-12" id="lms-access-denied-view">
                  <div className="bg-white border border-slate-150 p-8 rounded-3xl shadow-lg">
                    <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-900">LMS Access Denied</h2>
                    <p className="text-slate-505 text-sm mt-2 font-medium">
                      Your current user account ({dbUser?.email}) does not possess Admin access.
                    </p>
                    <button
                      onClick={() => navigateTo('/study')}
                      className="mt-6 h-12 w-full bg-indigo-650 hover:bg-indigo-600 text-white font-bold rounded-xl transition-all shadow-md cursor-pointer"
                    >
                      Go back to Student PWA
                    </button>
                  </div>
                </div>
              )
            ) : (
              /* WORKSPACE B: STUDENT LEARNER MODULES */
              <div className="w-full">
                {/* Connection check sync status monitor */}
                <BannerOffline onSyncComplete={loadAppData} token={token} />

                {activeCourseId === null ? (
                  /* Learner discovery home lists available courses bento stats */
                  <LearnerDashboard
                    courses={courses}
                    completedLessonIds={completedLessonIds}
                    quizAttempts={quizAttempts}
                    onSelectCourse={setActiveCourseId}
                    user={dbUser}
                    token={token}
                    onProfileUpdated={() => token && syncUserProfile(token)}
                  />
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
            )}

            {/* Float Mobile Route switcher helper */}
            {firebaseUser && dbUser && (dbUser.role === 'admin' || dbUser.role === 'instructor') && (
              <div
                className="block sm:hidden fixed bottom-6 right-6 z-50"
                style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
              >
                <button
                  onClick={() => {
                    navigateTo(isLmsPath ? '/study' : '/lms');
                  }}
                  style={{ height: '56px' }}
                  className="bg-slate-900 border-4 border-slate-950 p-4 rounded-2xl flex items-center gap-2 text-white font-black text-sm active:translate-y-1 shadow-lg cursor-pointer"
                >
                  <RefreshCw className="w-5 h-5 animate-spin-slow text-pink-400" />
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
          />
        )}
      </AnimatePresence>

      {/* Decorative footer */}
      <footer className="bg-slate-900 border-t-4 border-slate-950 text-slate-400 py-6 text-center text-xs font-mono select-none mt-auto">
        <p className="font-extrabold uppercase tracking-widest text-slate-200">
          Africa Quantitative Sciences (AQS) Platform
        </p>
        <p className="mt-1 pb-2 text-slate-500">
          PWA Offline learning engine • Server-side secure scoring and sync encryption
        </p>
      </footer>
    </div>
  );
}
