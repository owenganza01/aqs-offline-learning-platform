// src/components/LearnerBadges.tsx
import React from 'react';
import { Course, QuizAttempt } from '../types.ts';
import { Award, Trophy, Sparkles, BookOpen, Clock, Zap, Star, ShieldCheck } from 'lucide-react';

interface LearnerBadgesProps {
  courses: Course[];
  completedLessonIds: number[];
  quizAttempts: QuizAttempt[];
}

interface BadgeConfig {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string; // Tailwind color class for border/bg when unlocked
  unlockedColor: string; // Text / Icon theme color
  isUnlocked: boolean;
  progress: number; // 0 to 1
  progressText: string;
}

export const LearnerBadges: React.FC<LearnerBadgesProps> = ({
  courses,
  completedLessonIds,
  quizAttempts
}) => {
  // Compute badge unlock logic
  const totalLessons = courses.reduce((sum, c) => sum + (c.lessons?.length || 0), 0);
  const totalQuizzes = courses.filter(c => c.quiz).length;
  const passedQuizzes = quizAttempts.filter(a => a.passed).length;

  const badges: BadgeConfig[] = [
    {
      id: 'enrolled',
      title: 'AQS Pioneer',
      description: 'Unlock your educational journey by accessing the AQS Digital platform.',
      icon: BookOpen,
      color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
      unlockedColor: 'from-indigo-400 to-indigo-600 text-indigo-600',
      isUnlocked: courses.length > 0,
      progress: courses.length > 0 ? 1 : 0,
      progressText: courses.length > 0 ? 'Enrolled' : 'Not started'
    },
    {
      id: 'first_lesson',
      title: 'First Milestone',
      description: 'Successfully read and master your first curriculum syllabus lesson.',
      icon: Star,
      color: 'bg-emerald-50 border-emerald-200 text-emerald-705',
      unlockedColor: 'from-emerald-400 to-emerald-600 text-emerald-600',
      isUnlocked: completedLessonIds.length >= 1,
      progress: Math.min(completedLessonIds.length / 1, 1),
      progressText: `${Math.min(completedLessonIds.length, 1)}/1 lesson`
    },
    {
      id: 'dedicated_student',
      title: 'Dedicated Reader',
      description: 'Complete 5 quantitative core lessons across any course syllabus.',
      icon: Clock,
      color: 'bg-amber-50 border-amber-200 text-amber-700',
      unlockedColor: 'from-amber-400 to-amber-600 text-amber-600',
      isUnlocked: completedLessonIds.length >= 5,
      progress: Math.min(completedLessonIds.length / 5, 1),
      progressText: `${Math.min(completedLessonIds.length, 5)}/5 lessons`
    },
    {
      id: 'syllabus_conqueror',
      title: 'Syllabus Conqueror',
      description: 'Complete 10 qualitative or quantitative lessons in total.',
      icon: Zap,
      color: 'bg-pink-50 border-pink-200 text-pink-700',
      unlockedColor: 'from-pink-400 to-pink-600 text-pink-600',
      isUnlocked: completedLessonIds.length >= 10,
      progress: Math.min(completedLessonIds.length / 10, 1),
      progressText: `${Math.min(completedLessonIds.length, 10)}/10 lessons`
    },
    {
      id: 'quiz_master',
      title: 'Quiz Academic',
      description: 'Unlock this badge by getting a passing grade (70%+) on any quiz.',
      icon: Award,
      color: 'bg-sky-50 border-sky-200 text-sky-700',
      unlockedColor: 'from-sky-400 to-sky-600 text-sky-600',
      isUnlocked: passedQuizzes >= 1,
      progress: Math.min(passedQuizzes / 1, 1),
      progressText: `${Math.min(passedQuizzes, 1)}/1 passed`
    },
    {
      id: 'perfect_score',
      title: 'Century Master',
      description: 'Earn a flawless score of 100% on any of the course assessments.',
      icon: Sparkles,
      color: 'bg-purple-50 border-purple-200 text-purple-700',
      unlockedColor: 'from-purple-400 to-purple-600 text-purple-600',
      isUnlocked: quizAttempts.some(a => a.score === 100),
      progress: quizAttempts.some(a => a.score === 100) ? 1 : 0,
      progressText: quizAttempts.some(a => a.score === 100) ? '100% Earned' : '0/1 flawless'
    },
    {
      id: 'quiz_crusher',
      title: 'Quiz Overlord',
      description: 'Log passing grades on at least 3 separate curriculum quizzes.',
      icon: Trophy,
      color: 'bg-rose-50 border-rose-200 text-rose-700',
      unlockedColor: 'from-rose-400 to-rose-600 text-rose-600',
      isUnlocked: passedQuizzes >= 3,
      progress: Math.min(passedQuizzes / 3, 1),
      progressText: `${Math.min(passedQuizzes, 3)}/3 passed`
    },
    {
      id: 'valedictorian',
      title: 'AQS Graduate',
      description: 'Accomplish completion of all available course lessons & quizzes.',
      icon: ShieldCheck,
      color: 'bg-teal-50 border-teal-200 text-teal-705',
      unlockedColor: 'from-teal-400 to-teal-600 text-teal-600',
      isUnlocked: totalLessons > 0 && completedLessonIds.length >= totalLessons && passedQuizzes >= totalQuizzes,
      progress: totalLessons > 0 ? (completedLessonIds.length + passedQuizzes) / (totalLessons + totalQuizzes) : 0,
      progressText: totalLessons > 0 ? `${Math.round((completedLessonIds.length + passedQuizzes) / (totalLessons + totalQuizzes) * 100)}% Done` : '0%'
    }
  ];

  const unlockedCount = badges.filter(b => b.isUnlocked).length;

  return (
    <div className="bg-white border border-slate-150 p-6 rounded-3xl shadow-sm mb-8 font-sans" id="scholar-badge-case">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-105 pb-4">
        <div>
          <h4 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500 fill-amber-100" />
            <span>Syllabus Milestone Badges</span>
          </h4>
          <p className="text-xs text-slate-500 font-medium">
            Unlock achievements by reading articles, attending lessons, and passing quizzes.
          </p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-2xl text-xs font-bold text-indigo-705 flex items-center gap-2 font-mono shrink-0">
          <Sparkles className="w-4 h-4 text-indigo-500 fill-indigo-150 animate-bounce" />
          <span>{unlockedCount} of {badges.length} Unlocked</span>
        </div>
      </div>

      {/* Grid of badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {badges.map((badge) => {
          const Icon = badge.icon;
          return (
            <div 
              key={badge.id}
              className={`relative border p-4 rounded-2xl flex flex-col items-center text-center transition-all duration-300 ${
                badge.isUnlocked 
                  ? `${badge.color} shadow-sm hover:scale-[1.02]` 
                  : 'bg-slate-50/50 border-slate-100 text-slate-400'
              }`}
              id={`badge-item-${badge.id}`}
            >
              {/* Badge Icon Display Circle */}
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 border relative ${
                badge.isUnlocked 
                  ? 'bg-white shadow-inner border-current'
                  : 'bg-slate-100 border-slate-200 text-slate-300'
              }`}>
                <Icon className={`w-7 h-7 ${badge.isUnlocked ? 'text-current fill-current/10' : ''}`} />
                {badge.isUnlocked && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-current"></span>
                  </span>
                )}
              </div>

              {/* Text content */}
              <h5 className="text-sm font-bold tracking-tight mb-1 text-slate-800 line-clamp-1">
                {badge.title}
              </h5>
              <p className="text-[11px] leading-snug font-medium text-slate-500 mb-3 min-h-[32px] line-clamp-2">
                {badge.description}
              </p>

              {/* Progress Bar / Locked Status Label */}
              <div className="w-full mt-auto">
                <div className="flex justify-between items-center text-[10px] font-bold font-mono mb-1">
                  <span>{badge.isUnlocked ? 'UNLOCKED' : 'PROGRESS'}</span>
                  <span>{badge.progressText}</span>
                </div>
                <div className="w-full bg-slate-200/60 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      badge.isUnlocked ? 'bg-current' : 'bg-slate-300'
                    }`}
                    style={{ width: `${badge.progress * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
