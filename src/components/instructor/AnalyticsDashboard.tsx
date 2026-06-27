// src/components/instructor/AnalyticsDashboard.tsx
import React, { useState, useEffect } from 'react';
import { Course } from '../../types.ts';
import { authHeaders } from '../../lib/utils.ts';
import { RefreshCw, BarChart2, Download, Sparkles, Activity, Users, Layout } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
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
      const response = await fetch('/api/instructor/analytics', { headers: authHeaders(token) });
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to retrieve analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => { loadAnalytics(); }, [courses]);

  const handleExportCSV = () => {
    if (!analytics || !analytics.courseStats) return;

    let csvContent = "=== DASHBOARD METRICS SUMMARY ===\r\n";
    csvContent += `Total Enrolled Learners,${analytics.totalLearnersCount}\r\n`;
    csvContent += `Active Classes,${courses.length}\r\n`;
    const globalCompletionRate = analytics.courseStats?.length > 0 
      ? Math.round(analytics.courseStats.reduce((acc: number, item: any) => acc + (item.completionRate || 0), 0) / analytics.courseStats.length) 
      : 0;
    csvContent += `Global Completion Rate,${globalCompletionRate}%\r\n\r\n`;
    csvContent += "=== COURSE COMPLETION & ENGAGEMENT STATISTICS ===\r\n";
    csvContent += "Course ID,Course Title,Syllabus Lessons Count,Engaged Active Learners,Syllabus fully completed,Passed Quiz,Best Quiz Score Average (%),Completion Rate (%)\r\n";

    analytics.courseStats.forEach((stat: any) => {
      const escapedTitle = stat.title ? stat.title.replace(/"/g, '""') : "";
      csvContent += `${stat.id},"${escapedTitle}",${stat.lessonsCount},${stat.activeStudents},${stat.completions},${stat.passedQuizzes},${stat.averageScore !== null ? `${stat.averageScore}%` : "N/A"},${stat.completionRate}%\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `aqs_instructor_analytics_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (analyticsLoading || !analytics) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-705 h-[30vh]">
        <RefreshCw className="w-10 h-10 animate-spin text-pink-500 mb-4" />
        <p className="font-bold font-sans">Compiling student engagement metrics...</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 font-sans" id="analytics-command-center">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-150 pb-5">
        <div>
          <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-pink-600" /><span>Academic Engagement Center</span>
          </h3>
          <p className="text-xs text-slate-505 mt-1 font-medium">Export student graduation stats, curriculum completed nodes, and recent active assessments.</p>
        </div>
        <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-all hover:shadow-lg active:scale-95 border border-indigo-700/20 cursor-pointer" title="Export all data to CSV" id="export-csv-btn">
          <Download className="w-4 h-4" /><span>EXPORT STATS (.CSV)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-pink-50/50 border border-pink-100/70 rounded-[2rem] p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-pink-100 rounded-full -mr-8 -mt-8 opacity-40"></div>
          <p className="text-[10px] uppercase font-bold tracking-widest text-pink-700 font-mono flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /><span>Gross Enrolled Learners</span></p>
          <p className="text-3.5xl font-black text-pink-950 font-mono mt-4">{analytics.totalLearnersCount}</p>
          <p className="text-[11px] font-medium text-pink-850/80 mt-2 leading-relaxed">Unique profiles registered automatically upon portal login.</p>
        </div>
        <div className="bg-violet-50/50 border border-violet-100/70 rounded-[2rem] p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-100 rounded-full -mr-8 -mt-8 opacity-40"></div>
          <p className="text-[10px] uppercase font-bold tracking-widest text-violet-700 font-mono flex items-center gap-1.5"><Layout className="w-3.5 h-3.5" /><span>Active Lectures</span></p>
          <p className="text-3.5xl font-black text-violet-950 font-mono mt-4">{courses.length}</p>
          <p className="text-[11px] font-medium text-violet-850/80 mt-2 leading-relaxed">Registered curriculum databases currently online.</p>
        </div>
        <div className="bg-emerald-50/50 border border-emerald-100/70 rounded-[2rem] p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100 rounded-full -mr-8 -mt-8 opacity-40"></div>
          <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-700 font-mono flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /><span>Average Graduation Rate</span></p>
          <p className="text-3.5xl font-black text-emerald-950 font-mono mt-4">
            {analytics.courseStats?.length > 0 ? Math.round(analytics.courseStats.reduce((acc: number, item: any) => acc + (item.completionRate || 0), 0) / analytics.courseStats.length) : 0}%
          </p>
          <p className="text-[11px] font-medium text-emerald-850/80 mt-2 leading-relaxed">Proportion of active students who passed the course exams.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm">
          <h4 className="text-sm font-bold text-slate-900 mb-1 font-sans flex items-center gap-2"><BarChart2 className="w-4 h-4 text-pink-600" /><span>Course Engagement Distribution</span></h4>
          <p className="text-xs text-slate-500 mb-6 font-medium">Comparison of engaged student users against quiz graduation counts.</p>
          <div className="h-80 w-full" id="engagement-recharts-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.courseStats} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                <XAxis dataKey="title" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px 0 rgba(0, 0, 0, 0.05)', fontSize: '11px', fontFamily: 'sans-serif' }} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="activeStudents" fill="#3b82f6" name="Active Learners" radius={[4, 4, 0, 0]} />
                <Bar dataKey="passedQuizzes" fill="#10b981" name="Passed Exams" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm">
          <h4 className="text-sm font-bold text-slate-900 mb-1 font-sans flex items-center gap-2"><Activity className="w-4 h-4 text-pink-600" /><span>Course Completion Rates (%)</span></h4>
          <p className="text-xs text-slate-500 mb-6 font-medium">Visualizing curriculum completion percentages across active courses.</p>
          <div className="h-80 w-full" id="completion-rates-recharts-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.courseStats} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorCompletion" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0.01}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                <XAxis dataKey="title" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px 0 rgba(0, 0, 0, 0.05)', fontSize: '11px', fontFamily: 'sans-serif' }} formatter={(value) => [`${value}%`, 'Completion Rate']} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Area type="monotone" dataKey="completionRate" stroke="#ec4899" fillOpacity={1} fill="url(#colorCompletion)" name="Completion Rate" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm font-sans">
          <h4 className="font-bold text-slate-900 text-sm mb-4 border-b border-slate-100 pb-2 flex items-center gap-2"><Layout className="w-4.5 h-4.5 text-pink-600" /><span>Academic Matrix Ledger</span></h4>
          {analytics.courseStats?.length === 0 ? (<p className="text-slate-400 italic text-xs">No metrics records.</p>) : (
            <div className="space-y-3 font-mono text-[11px] text-slate-550">
              {analytics.courseStats.map((stat: any) => (
                <div key={stat.id} className="border-b border-slate-100 pb-3 flex flex-col gap-1.5 last:border-none">
                  <p className="font-bold text-xs text-slate-800 font-sans">{stat.title}</p>
                  <div className="flex items-center justify-between"><span>Syllabus Size:</span><span className="font-bold text-slate-700">{stat.lessonsCount} lessons</span></div>
                  <div className="flex items-center justify-between"><span>Engaged Active Learners:</span><span className="font-bold text-blue-650">{stat.activeStudents} active</span></div>
                  <div className="flex items-center justify-between"><span>Passed Quiz (Completed):</span><span className="font-bold text-emerald-650">{stat.passedQuizzes} graduated</span></div>
                  <div className="flex items-center justify-between"><span>Best Class Quiz Average:</span><span className="font-bold text-indigo-650">{stat.averageScore !== null ? `${stat.averageScore}%` : 'N/A'}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm font-sans">
          <h4 className="font-bold text-slate-900 text-sm mb-4 border-b border-slate-100 pb-2 flex items-center gap-2"><Activity className="w-4.5 h-4.5 text-pink-600" /><span>Live Student Activity Feed</span></h4>
          {analytics.recentActivity?.length === 0 ? (<p className="text-slate-400 italic text-[11px] py-12 text-center">No student activity logged yet.</p>) : (
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
              {analytics.recentActivity.map((act: any, idx: number) => (
                <div key={idx} className="bg-slate-50/50 border border-slate-100 p-3.5 rounded-xl flex items-start gap-2.5 text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${act.type === 'quiz' ? (act.passed ? 'bg-emerald-500 animate-pulse' : 'bg-red-500') : 'bg-blue-500 animate-pulse'}`}></span>
                  <div>
                    <p className="text-slate-800 font-bold leading-tight text-xs">{act.studentName}</p>
                    <p className="text-slate-605 mt-1 text-[11px] leading-relaxed">
                      {act.type === 'quiz' ? (<span>Completed Exam: <strong className="text-slate-800">{act.quizTitle}</strong> scoring <strong className="font-mono text-slate-900">{act.score}%</strong> ({act.passed ? 'PASSED' : 'FAILED'})</span>) : (<span>Completed lecture: <strong className="text-slate-800">{act.lessonTitle}</strong></span>)}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-1 font-semibold">
                      {new Date(act.completedAt || act.attemptedAt).toLocaleTimeString()} • {new Date(act.completedAt || act.attemptedAt).toLocaleDateString()}
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
