// src/components/admin/AnalyticsDashboard.tsx
import React, { useState, useEffect } from 'react';
import { Course } from '../../types.js';
import { apiFetch } from '../../lib/api.js';
import { RefreshCw, BarChart2, Download, Sparkles, Activity, Users, Layout } from 'lucide-react';
import { motion } from 'motion/react';

interface AnalyticsDashboardProps {
  token: string | null;
  courses: Course[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ token, courses }) => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);

  const loadAnalytics = async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const { ok, data } = await apiFetch('/api/admin/analytics');
      if (ok) {
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to retrieve analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAnalytics();
  }, [courses]);

  const handleExportCSV = () => {
    if (!analytics || !analytics.courseStats) return;

    const exportDate = new Date();
    const formattedDate = exportDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = exportDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const globalCompletionRate =
      analytics.courseStats?.length > 0
        ? Math.round(
            analytics.courseStats.reduce((acc: number, item: any) => acc + (item.completionRate || 0), 0) /
              analytics.courseStats.length,
          )
        : 0;

    const totalLessons = analytics.courseStats.reduce((acc: number, s: any) => acc + (s.lessonsCount || 0), 0);
    const totalActiveLearners = analytics.courseStats.reduce((acc: number, s: any) => acc + (s.activeStudents || 0), 0);
    const totalCompletions = analytics.courseStats.reduce((acc: number, s: any) => acc + (s.completions || 0), 0);
    const totalPassed = analytics.courseStats.reduce((acc: number, s: any) => acc + (s.passedQuizzes || 0), 0);

    const blank = '\r\n';

    let csv = '';

    // ── Report Header ──
    csv += 'AQS LEARNING PLATFORM  —  ANALYTICS REPORT\r\n';
    csv += `Report Date:,"${formattedDate}"\r\n`;
    csv += `Report Time:,"${formattedTime}"\r\n`;
    csv += blank;
    csv += blank;
    csv += blank;

    // ── Dashboard Summary ──
    csv += 'DASHBOARD SUMMARY\r\n';
    csv += blank;
    csv += 'Metric,Value\r\n';
    csv += `Total Enrolled Learners,${analytics.totalLearnersCount}\r\n`;
    csv += `Active Courses,${courses.length}\r\n`;
    csv += `Global Completion Rate,${globalCompletionRate}%\r\n`;
    csv += blank;
    csv += blank;
    csv += blank;

    // ── Course Statistics ──
    csv += 'COURSE STATISTICS\r\n';
    csv += blank;
    csv += '#,Course ID,Course Title,Lessons,Active Learners,Completions,Passed Quiz,Avg Score,Completion Rate\r\n';
    analytics.courseStats.forEach((stat: any, index: number) => {
      const escapedTitle = stat.title ? `"${stat.title.replace(/"/g, '""')}"` : '""';
      const avgScore = stat.averageScore !== null ? `${stat.averageScore}%` : 'N/A';
      csv += `${index + 1},${stat.id},${escapedTitle},${stat.lessonsCount},${stat.activeStudents},${stat.completions},${stat.passedQuizzes},${avgScore},${stat.completionRate}%\r\n`;
    });
    csv += blank;
    csv += `,TOTALS,,${totalLessons},${totalActiveLearners},${totalCompletions},${totalPassed},,${globalCompletionRate}%\r\n`;
    csv += blank;
    csv += blank;
    csv += blank;

    // ── Recent Activity ──
    if (analytics.recentActivity?.length > 0) {
      csv += 'RECENT ACTIVITY\r\n';
      csv += blank;
      csv += '#,Student,Type,Item,Score,Passed,Date,Time\r\n';
      analytics.recentActivity.forEach((act: any, index: number) => {
        const studentName = act.studentName ? `"${act.studentName.replace(/"/g, '""')}"` : '""';
        const itemName =
          act.type === 'quiz'
            ? `"${(act.quizTitle || '').replace(/"/g, '""')}"`
            : `"${(act.lessonTitle || '').replace(/"/g, '""')}"`;
        const score = act.type === 'quiz' ? `${act.score}%` : '';
        const passed = act.type === 'quiz' ? (act.passed ? 'Yes' : 'No') : '';
        const actDate = new Date(act.completedAt || act.attemptedAt);
        const dateStr = actDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = actDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const typeLabel = act.type === 'quiz' ? 'Quiz' : 'Lesson';
        csv += `${index + 1},${studentName},${typeLabel},${itemName},${score},${passed},"${dateStr}","${timeStr}"\r\n`;
      });
      csv += blank;
      csv += `Total Activities:,${analytics.recentActivity.length}\r\n`;
      csv += blank;
      csv += blank;
      csv += blank;
    }

    // ── Footer ──
    csv += 'END OF REPORT\r\n';
    csv += '"Generated by AQS Offline Learning Platform"\r\n';

    // Add BOM for proper Unicode support in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `aqs_admin_analytics_${exportDate.toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (analyticsLoading || !analytics) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-text-2 h-[30vh]">
        <RefreshCw className="w-10 h-10 animate-spin text-steel mb-4" />
        <p className="font-bold font-sans">Compiling student engagement metrics...</p>
      </div>
    );
  }

  const avgQuizScore =
    analytics.courseStats?.length > 0
      ? Math.round(
          analytics.courseStats.reduce((acc: number, item: any) => acc + (item.averageScore ?? 0), 0) /
            analytics.courseStats.length,
        )
      : null;
  const totalLessonsCompleted = analytics.courseStats?.reduce((acc: number, s: any) => acc + (s.lessonsCount || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 font-sans"
      id="analytics-command-center"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stroke pb-5">
        <div>
          <h3 className="text-lg font-display font-bold text-text tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-steel" />
            <span>Analytics</span>
          </h3>
          <p className="text-xs text-text-3 mt-1 font-medium">
            Export student graduation stats, curriculum completed nodes, and recent active assessments.
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2.5 bg-steel hover:bg-[#2d4a70] text-white font-semibold text-xs rounded-lg shadow-md transition-all hover:shadow-lg active:scale-95 border border-steel cursor-pointer"
          title="Export all data to CSV"
          id="export-csv-btn"
        >
          <Download className="w-4 h-4" />
          <span>EXPORT STATS (.CSV)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-stroke rounded-lg px-[18px] py-4 relative overflow-hidden">
          <p className="font-display text-[28px] text-text leading-none mb-1.5">{analytics.totalLearnersCount}</p>
          <p className="text-[12px] text-text-3 font-medium">Total learners</p>
          <p className="font-mono text-[11px] text-success mt-2">
            <Users className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Unique profiles
          </p>
        </div>
        <div className="bg-white border border-stroke rounded-lg px-[18px] py-4 relative overflow-hidden">
          <p className="font-display text-[28px] text-text leading-none mb-1.5">
            {avgQuizScore === null ? '—' : `${avgQuizScore}%`}
          </p>
          <p className="text-[12px] text-text-3 font-medium">Avg. quiz score</p>
          <p className="font-mono text-[11px] text-success mt-2">
            <Sparkles className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Best attempts
          </p>
        </div>
        <div className="bg-white border border-stroke rounded-lg px-[18px] py-4 relative overflow-hidden">
          <p className="font-display text-[28px] text-text leading-none mb-1.5">{totalLessonsCompleted || 0}</p>
          <p className="text-[12px] text-text-3 font-medium">Lessons completed</p>
          <p className="font-mono text-[11px] text-success mt-2">
            <Layout className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Syllabus units
          </p>
        </div>
        <div className="bg-white border border-stroke rounded-lg px-[18px] py-4 relative overflow-hidden">
          <p className="font-display text-[28px] text-text leading-none mb-1.5">
            {analytics.courseStats?.length > 0
              ? Math.round(
                  analytics.courseStats.reduce((acc: number, item: any) => acc + (item.completionRate || 0), 0) /
                    analytics.courseStats.length,
                )
              : 0}
            %
          </p>
          <p className="text-[12px] text-text-3 font-medium">Course completion</p>
          <p className="font-mono text-[11px] text-success mt-2">
            <Activity className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Passing rate
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-stroke p-5 rounded-lg">
          <h4 className="text-sm font-display font-bold text-text mb-1 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-steel" />
            <span>Quiz scores by course</span>
          </h4>
          <p className="text-xs text-text-3 mb-6 font-medium">Top performing courses by average quiz score.</p>

          <div className="space-y-4">
            {(analytics.courseStats || [])
              .slice()
              .sort((a: any, b: any) => (b.averageScore || 0) - (a.averageScore || 0))
              .slice(0, 6)
              .map((s: any) => (
                <div key={s.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[13px] font-medium text-text">
                    <span className="truncate pr-2">{s.title}</span>
                    <span className="text-text-3 font-mono">
                      {s.averageScore !== null ? `${s.averageScore}%` : '—'}
                    </span>
                  </div>
                  <div className="h-2 bg-[#eef1f6] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-steel rounded-full"
                      style={{ width: `${Math.max(0, s.averageScore || 0)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white border border-stroke p-5 rounded-lg flex flex-col items-center justify-center">
          <h4 className="text-sm font-display font-bold text-text mb-1 flex items-center gap-2">
            <Activity className="w-4 h-4 text-steel" />
            <span>Learner status</span>
          </h4>
          <p className="text-xs text-text-3 mb-6 font-medium">Overview of enrolled learners and progress states.</p>

          {/* Simple donut using conic-gradient */}
          {(() => {
            const total = analytics.totalLearnersCount || 0;
            const totalCompletions = (analytics.courseStats || []).reduce(
              (acc: number, s: any) => acc + (s.completions || 0),
              0,
            );
            const totalActive = (analytics.courseStats || []).reduce(
              (acc: number, s: any) => acc + (s.activeStudents || 0),
              0,
            );
            const completed = Math.min(total, totalCompletions);
            const inProgress = Math.max(0, totalActive - completed);
            const notStarted = Math.max(0, total - totalActive);
            const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
            const inProgressPct = total > 0 ? Math.round((inProgress / total) * 100) : 0;
            const notStartedPct = Math.max(0, 100 - completedPct - inProgressPct);

            const gradient = `conic-gradient(#1d6b45 0 ${completedPct}%, #3d5a80 ${completedPct}% ${completedPct + inProgressPct}%, #eef1f6 ${completedPct + inProgressPct}% 100%)`;

            return (
              <div className="w-full flex items-center gap-6">
                <div style={{ width: 120 }} className="flex items-center justify-center">
                  <div
                    style={{ width: 110, height: 110, borderRadius: '50%', background: gradient }}
                    className="relative flex items-center justify-center"
                  >
                    <div
                      style={{ width: 66, height: 66, borderRadius: '50%', background: 'white' }}
                      className="flex items-center justify-center"
                    >
                      <div className="text-sm font-semibold">{total}</div>
                    </div>
                  </div>
                </div>

                <div className="flex-1">
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full" style={{ background: '#1d6b45' }}></span>
                      <span className="flex-1">{completed} completed</span>
                      <span className="font-mono text-text-3">{completedPct}%</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full" style={{ background: '#3d5a80' }}></span>
                      <span className="flex-1">{inProgress} in progress</span>
                      <span className="font-mono text-text-3">{inProgressPct}%</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full" style={{ background: '#eef1f6' }}></span>
                      <span className="flex-1">{notStarted} not started</span>
                      <span className="font-mono text-text-3">{notStartedPct}%</span>
                    </li>
                  </ul>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white border border-stroke p-5 rounded-lg font-sans">
          <h4 className="font-display font-bold text-text text-sm mb-4 border-b border-stroke pb-2 flex items-center gap-2">
            <Layout className="w-4.5 h-4.5 text-steel" />
            <span>Academic Matrix Ledger</span>
          </h4>
          {analytics.courseStats?.length === 0 ? (
            <p className="text-text-3 italic text-xs">No metrics records.</p>
          ) : (
            <div className="space-y-3 font-mono text-[11px] text-text-2">
              {analytics.courseStats.map((stat: any) => (
                <div key={stat.id} className="border-b border-stroke pb-3 flex flex-col gap-1.5 last:border-none">
                  <p className="font-bold text-xs text-text font-sans">{stat.title}</p>
                  <div className="flex items-center justify-between">
                    <span>Syllabus Size:</span>
                    <span className="font-semibold text-text-2">{stat.lessonsCount} lessons</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Engaged Active Learners:</span>
                    <span className="font-semibold text-steel">{stat.activeStudents} active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Passed Quiz (Completed):</span>
                    <span className="font-semibold text-success">{stat.passedQuizzes} graduated</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Best Class Quiz Average:</span>
                    <span className="font-semibold text-steel">
                      {stat.averageScore !== null ? `${stat.averageScore}%` : 'N/A'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-stroke p-5 rounded-lg font-sans">
          <h4 className="font-display font-bold text-text text-sm mb-4 border-b border-stroke pb-2 flex items-center gap-2">
            <Activity className="w-4.5 h-4.5 text-steel" />
            <span>Live Student Activity Feed</span>
          </h4>
          {analytics.recentActivity?.length === 0 ? (
            <p className="text-text-3 italic text-[11px] py-12 text-center">No student activity logged yet.</p>
          ) : (
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
              {analytics.recentActivity.map((act: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-canvas/60 border border-stroke p-3.5 rounded-lg flex items-start gap-2.5 text-xs"
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${act.type === 'quiz' ? (act.passed ? 'bg-success animate-pulse' : 'bg-error') : 'bg-steel animate-pulse'}`}
                  ></span>
                  <div>
                    <p className="text-text font-semibold leading-tight text-xs">{act.studentName}</p>
                    <p className="text-text-2 mt-1 text-[11px] leading-relaxed">
                      {act.type === 'quiz' ? (
                        <span>
                          Completed Exam: <strong className="text-text">{act.quizTitle}</strong> scoring{' '}
                          <strong className="font-mono text-text">{act.score}%</strong> (
                          {act.passed ? 'PASSED' : 'FAILED'})
                        </span>
                      ) : (
                        <span>
                          Completed lecture: <strong className="text-text">{act.lessonTitle}</strong>
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-text-3 font-mono mt-1 font-semibold">
                      {new Date(act.completedAt || act.attemptedAt).toLocaleTimeString()} •{' '}
                      {new Date(act.completedAt || act.attemptedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
