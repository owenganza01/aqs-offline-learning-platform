// src/components/ProgressTree.tsx
import React from 'react';
import { Lesson } from '../types.ts';
import { Leaf, Award, Compass, Info } from 'lucide-react';

interface ProgressTreeProps {
  lessons: Lesson[];
  completedLessonIds: number[];
  quizPassed: boolean;
  courseTitle: string;
}

export const ProgressTree: React.FC<ProgressTreeProps> = ({
  lessons,
  completedLessonIds,
  quizPassed,
  courseTitle
}) => {
  const totalLessons = lessons.length;
  const completedCount = lessons.filter(l => completedLessonIds.includes(l.id)).length;
  const completionPercentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  // Render an SVG based on completed lessons
  // We will build a central trunk and branches curving off left and right for each lesson
  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-md" id="progress-tree-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Compass className="w-8 h-8 text-emerald-600 animate-spin-slow" />
          <h3 className="text-xl font-bold text-slate-800 tracking-tight font-sans">
            Progress Tree of Growth
          </h3>
        </div>
        <span className="bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-1.5 rounded-full border border-emerald-500/20 font-mono">
          {completedCount}/{totalLessons} Tasks
        </span>
      </div>

      <div className="relative flex flex-col items-center bg-slate-50/60 rounded-2xl p-4 border border-slate-150 overflow-hidden h-[340px]">
        {/* Dynamic SVG Drawing */}
        <svg
          viewBox="0 0 200 240"
          className="w-full h-full max-w-[280px]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Ground / Roots area */}
          <path
            d="M 20 220 C 60 215, 140 215, 180 220"
            stroke="#94a3b8"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M 100 200 C 100 215, 80 225, 70 230"
            stroke="#78350f"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M 100 200 C 100 215, 120 225, 130 230"
            stroke="#78350f"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Central Trunk */}
          {/* Base thickness and height */}
          <path
            d="M 100 205 L 100 45"
            stroke="#78350f"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Internal wood grains for aesthetic details */}
          <path
            d="M 100 180 L 100 70"
            stroke="#451a03"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="4 8"
          />

          {/* Render Branches for each lesson */}
          {lessons.map((lesson, index) => {
            const isLeft = index % 2 === 0;
            // Place branches progressively higher up the trunk
            const startY = 175 - index * (110 / Math.max(totalLessons, 1));
            const controlX = isLeft ? 40 : 160;
            const endX = isLeft ? 55 : 145;
            const endY = startY - 15;

            const isCompleted = completedLessonIds.includes(lesson.id);

            return (
              <g key={lesson.id} className="transition-all duration-500">
                {/* Branch Stem */}
                <path
                  d={`M 100 ${startY} Q ${controlX} ${startY}, ${endX} ${endY}`}
                  stroke={isCompleted ? "#10b981" : "#a1a1aa"}
                  strokeWidth={isCompleted ? "5" : "3"}
                  strokeLinecap="round"
                  fill="none"
                />

                {/* If completed, sprout multiple bright leaves on the branch */}
                {isCompleted ? (
                  <g>
                    {/* Leaf 1 */}
                    <path
                      d={`M ${endX} ${endY} Q ${endX + (isLeft ? -12 : 12)} ${endY - 6}, ${endX + (isLeft ? -10 : 10)} ${endY - 16} Q ${endX + (isLeft ? -2 : 2)} ${endY - 10}, ${endX} ${endY}`}
                      fill="#059669"
                      stroke="#047857"
                      strokeWidth="1"
                    />
                    {/* Leaf 2 */}
                    <path
                      d={`M ${endX - (isLeft ? 8 : -8)} ${endY - 4} Q ${endX + (isLeft ? -18 : 18)} ${endY + 6}, ${endX + (isLeft ? -14 : 14)} ${endY - 4} Q ${endX + (isLeft ? -6 : 6)} ${endY - 4}, ${endX - (isLeft ? 8 : -8)} ${endY - 4}`}
                      fill="#34d399"
                      stroke="#059669"
                      strokeWidth="1"
                    />
                    {/* Completion indicator node */}
                    <circle
                      cx={endX}
                      cy={endY}
                      r="4"
                      fill="#fbbf24"
                      stroke="#d97706"
                      strokeWidth="1"
                    />
                  </g>
                ) : (
                  // Dormant small grey/brown bud if lesson incompleted
                  <circle
                    cx={endX}
                    cy={endY}
                    r="3.5"
                    fill="#94a3b8"
                    stroke="#64748b"
                    strokeWidth="1"
                  />
                )}

                {/* Lesson number visual text floating on the side */}
                <text
                  x={isLeft ? endX - 16 : endX + 16}
                  y={endY + 4}
                  textAnchor="middle"
                  className="font-mono font-black text-[9px] fill-slate-700 bg-white"
                >
                  L{index + 1}
                </text>
              </g>
            );
          })}

          {/* Apex Golden flower if quiz is passed! */}
          {quizPassed ? (
            <g className="animate-bounce">
              {/* Stem linking apex to top trunk */}
              <path d="M 100 45 L 100 30" stroke="#10b981" strokeWidth="4" />
              {/* Flower Center */}
              <circle cx="100" cy="24" r="9" fill="#fbbf24" stroke="#d97706" strokeWidth="2.5" />
              {/* Petal Top */}
              <circle cx="100" cy="11" r="6" fill="#fef08a" stroke="#fbbf24" strokeWidth="1.5" />
              {/* Petal Bottom */}
              <circle cx="100" cy="37" r="6" fill="#fef08a" stroke="#fbbf24" strokeWidth="1.5" />
              {/* Petal Left */}
              <circle cx="87" cy="24" r="6" fill="#fef08a" stroke="#fbbf24" strokeWidth="1.5" />
              {/* Petal Right */}
              <circle cx="113" cy="24" r="6" fill="#fef08a" stroke="#fbbf24" strokeWidth="1.5" />
              {/* Little crown award */}
              <path d="M 97 22 L 100 18 L 103 22" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" />
            </g>
          ) : (
            // A closed green bud at apex if course not fully completed/quiz not passed yet
            <g>
              <path d="M 100 45 L 100 34" stroke="#78350f" strokeWidth="4" />
              {/* Closed green/amber bud ready to bloom */}
              <path
                d="M 100 34 C 92 34, 94 20, 100 16 C 106 20, 108 34, 100 34"
                fill={completionPercentage > 60 ? "#d97706" : "#64748b"}
                stroke={completionPercentage > 60 ? "#b45309" : "#475569"}
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {/* Tree Key Info */}
        <div className="absolute bottom-2 left-2 right-2 bg-white/95 border border-slate-200 px-3 py-1.5 rounded-xl flex items-center justify-between text-[11px] text-slate-550 font-mono shadow-sm">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-650 inline-block"></span>
            <span>Leaves = Lessons</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-amber-400 border border-amber-500 inline-block animate-pulse"></span>
            <span>Flower = Quiz passed!</span>
          </div>
        </div>
      </div>

      {/* Narrative Progress Text Helper for clarity without needing high-literacy */}
      <div className="mt-4 flex items-start gap-2 bg-emerald-50 rounded-2xl px-4 py-3 border border-emerald-200">
        <Info className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
        <p className="text-sm font-sans font-medium leading-relaxed text-emerald-900">
          {quizPassed 
            ? "Congratulations! Your tree of knowledge is fully grown with a beautiful yellow blossom. You have passed this course!"
            : `Keep growing! You completed ${completedCount} lessons out of ${totalLessons}. Read all lessons to turn branches green, then take the test to bloom your golden flower.`}
        </p>
      </div>
    </div>
  );
};
