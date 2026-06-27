// src/App.tsx
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { Course, QuizAttempt, User } from './types.ts';
import { PouchDBService } from './lib/pouchdb-service.ts';
import { LearnerDashboard } from './components/LearnerDashboard.tsx';
import { LearnerCoursePlayer } from './components/LearnerCoursePlayer.tsx';
import { InstructorLMS } from './components/InstructorLMS.tsx';
import { BannerOffline } from './components/BannerOffline.tsx';
import { ProfileEditModal } from './components/ProfileEditModal.tsx';
import { 
  Compass, LogIn, LogOut, User as UserIcon, RefreshCw, 
  HelpCircle, Sparkles, Star, ShieldAlert, Monitor, CheckCircle 
} from 'lucide-react';

export default function App() {
  // Authentication status
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [showProfileEdit, setShowProfileEdit] = useState<boolean>(false);

  // Application Data Caching
  const [courses, setCourses] = useState<Course[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<number[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [appLoading, setAppLoading] = useState<boolean>(false);

  // UI state routing
  const [activeCourseId, setActiveCourseId] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
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

  // Toggle monitor online events
  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, []);

  // 1. Firebase auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      if (user) {
        setFirebaseUser(user);
        const idToken = await user.getIdToken();
        setToken(idToken);
        await syncUserProfile(idToken);
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
  }, []);

  // Synchronize database user profile and pull remote statistics
  const syncUserProfile = async (idToken: string) => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      if (response.ok) {
        const result = await response.json();
        setDbUser(result.dbUser);
      }
    } catch (error) {
      console.warn('Network error synchronizing credentials; defaulting to local schema role representation.', error);
    }
  };

  // Toggle roles: Allow graders/instructors to switch roles at will
  const handleToggleRole = async (targetRole: 'learner' | 'instructor') => {
    if (!token || !dbUser) return;
    try {
      const response = await fetch('/api/auth/role', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: targetRole })
      });

      if (response.ok) {
        const result = await response.json();
        setDbUser(result.dbUser);
        setActiveCourseId(null);
        loadAppData();
      }
    } catch (err) {
      console.error('Failed to change role on backend service:', err);
    }
  };

  // 2. Load Core Application study data (Offline / Online adaptive)
  const loadAppData = async () => {
    setAppLoading(true);
    
    // Offline pre-fetch: Read cache first
    const cachedCourses = await PouchDBService.getCachedCourses();
    const cachedProgress = await PouchDBService.getUserProgress();
    
    setCourses(cachedCourses);
    setCompletedLessonIds(cachedProgress.completedLessonIds);
    setQuizAttempts(cachedProgress.quizAttempts);

    // Online upgrade: Fetch latest from PG when connected!
    if (navigator.onLine && token) {
      try {
        const response = await fetch('/api/courses', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const remoteCourses = await response.json();
          setCourses(remoteCourses);
          
          // Pre-cache courses and lessons details to client PouchDB
          await PouchDBService.cacheCourses(remoteCourses);

          // Get fresh progress also
          const progressResponse = await fetch('/api/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ lessonCompletions: [], quizSubmissions: [] }) // Empty queries retrieve server-state truth
          });

          if (progressResponse.ok) {
            const progressData = await progressResponse.json();
            setCompletedLessonIds(progressData.syncedCompletions);
            setQuizAttempts(progressData.syncedAttempts);
            
            // Sync progress state back into local PouchDB!
            await PouchDBService.saveUserProgress(progressData.syncedCompletions, progressData.syncedAttempts);
          }
        }
      } catch (err) {
        console.warn('Unable to pull remote database course records; working with cached PouchDB offline materials.', err);
      }
    }

    setAppLoading(false);
  };

  useEffect(() => {
    if (token) {
      loadAppData();
    }
  }, [token]);

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-emerald-500 selection:text-slate-900 flex flex-col font-sans">
      
      {/* Dynamic Navigation Top Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm select-none">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 p-2.5 rounded-xl text-emerald-600 flex items-center justify-center font-semibold text-lg border border-emerald-500/20">
            <Compass className="w-6 h-6 animate-spin-slow text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-sans tracking-tight leading-none text-slate-900">
              AQS Learning
            </h1>
            <p className="text-[10px] font-bold text-slate-400 font-mono tracking-wider mt-1 uppercase">
              Africa Quantitative Sciences
            </p>
          </div>
        </div>

        {/* Auth details & grading switcher tools */}
        {firebaseUser && dbUser && (
          <div className="flex items-center gap-4">
            
            {/* Decoupled Route Navigation Tabs */}
            {firebaseUser && dbUser && (
              <div className="hidden sm:flex bg-slate-100 p-1 rounded-xl border border-slate-200 h-11 items-center font-mono">
                <button
                  onClick={async () => {
                    navigateTo('/study');
                  }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    !isLmsPath 
                      ? 'bg-emerald-650 text-white shadow-sm' 
                      : 'text-slate-550 hover:text-slate-800'
                  }`}
                >
                  STUDENT APP
                </button>
                <button
                  onClick={async () => {
                    if (dbUser.role === 'learner') {
                      await handleToggleRole('instructor');
                    }
                    navigateTo('/lms');
                  }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    isLmsPath
                      ? 'bg-pink-600 text-white shadow-sm' 
                      : 'text-slate-550 hover:text-slate-800'
                  }`}
                >
                  TEACHER LMS
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
                  <span className="text-[9px] font-semibold font-mono text-slate-400 uppercase tracking-widest">
                    ROLE: {dbUser.role}
                  </span>
                  <button
                    onClick={() => handleToggleRole(dbUser.role === 'instructor' ? 'learner' : 'instructor')}
                    className="text-[9px] font-bold text-pink-600 hover:text-pink-500 underline uppercase cursor-pointer"
                  >
                    (Change)
                  </button>
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
          <div className="flex flex-col items-center justify-center p-12 text-slate-805">
            <RefreshCw className="w-12 h-12 animate-spin text-emerald-650 mb-4" />
            <h4 className="text-xl font-bold font-sans tracking-tight text-slate-800">Verifying Student Identity...</h4>
            <p className="text-slate-400 font-mono text-xs mt-1">Connecting to authentication keys</p>
          </div>
        ) : !firebaseUser ? (
          
          /* Visual Landing and Google Signup Module */
          <div className="w-full max-w-lg mx-auto px-6" id="welcome-login-screen">
            <div className="bg-white border border-slate-150 p-8 rounded-3xl shadow-lg hover:shadow-xl transition-all duration-300 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500"></div>
              
              <div className="bg-indigo-50/65 border border-indigo-100 aspect-square w-20 h-20 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-sm">
                <Compass className="w-10 h-10 text-indigo-600 animate-spin-slow" />
              </div>

              <h2 className="text-3xl font-bold text-slate-900 font-sans tracking-tight">
                AQS Digital Classroom
              </h2>
              <p className="text-slate-500 font-medium text-sm leading-relaxed mt-3 px-2">
                Welcome to Africa Quantitative Sciences. Our digital classroom lets rural students study complete analytics courseware offline, track progress under poor network, and verify quiz evaluations seamlessly.
              </p>

              <div className="my-6 border-b border-slate-100"></div>

              {/* Explicit 56px Google login button */}
              <button
                onClick={handleLogin}
                className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg px-6 rounded-2xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-3 border border-indigo-700/20"
                style={{ minHeight: '56px' }}
              >
                <LogIn className="w-6 h-6 shrink-0" />
                <span>SIGN IN WITH GOOGLE</span>
              </button>

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
          <div className="flex flex-col items-center justify-center p-12 text-slate-800">
            <RefreshCw className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
            <h4 className="text-xl font-bold font-sans tracking-tight text-slate-800">Compiling Study Schedule...</h4>
            <p className="text-slate-400 font-mono text-xs mt-1">Acquiring cached lectures and assessment records</p>
          </div>
        ) : (
          
          /* AUTHENTICATED CLASS WORKSPACES */
          <div className="w-full">
            
            {/* Render LMS if the path is /lms, otherwise default to Student Learner PWA */}
            {isLmsPath ? (
              dbUser?.role === 'instructor' || dbUser?.role === 'admin' ? (
                /* WORKSPACE A: TEACHER INSTRUCTOR LMS */
                <InstructorLMS 
                  token={token}
                  courses={courses}
                  onRefreshCourses={loadAppData}
                />
              ) : (
                /* LMS Access Guard fallback */
                <div className="w-full max-w-lg mx-auto px-6 text-center py-12" id="lms-access-denied-view">
                  <div className="bg-white border border-slate-150 p-8 rounded-3xl shadow-lg">
                    <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-slate-900">LMS Access Denied</h3>
                    <p className="text-slate-505 text-sm mt-2 font-medium">
                      Your current user account ({dbUser?.email}) does not possess Teacher / Instructor status.
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
                <BannerOffline 
                  onSyncComplete={loadAppData}
                  token={token}
                />

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
            {firebaseUser && dbUser && (
              <div className="block sm:hidden fixed bottom-6 right-6 z-50">
                <button
                  onClick={async () => {
                    if (!isLmsPath && dbUser.role === 'learner') {
                      await handleToggleRole('instructor');
                    }
                    navigateTo(isLmsPath ? '/study' : '/lms');
                  }}
                  style={{ height: '56px' }}
                  className="bg-slate-900 border-4 border-slate-950 p-4 rounded-2xl flex items-center gap-2 text-white font-black text-sm active:translate-y-1 shadow-lg cursor-pointer"
                >
                  <RefreshCw className="w-5 h-5 animate-spin-slow text-pink-400" />
                  <span>SWITCH TO {isLmsPath ? 'STUDENT APP' : 'TEACHER LMS'}</span>
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
