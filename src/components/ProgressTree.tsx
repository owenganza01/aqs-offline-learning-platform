// src/components/ProgressTree.tsx
import React from 'react';
import { Lesson } from '../types.ts';
import { Compass, Info } from 'lucide-react';

interface ProgressTreeProps {
  lessons: Lesson[];
  completedLessonIds: number[];
  quizPassed: boolean;
  courseTitle: string;
}

export const ProgressTree: React.FC<ProgressTreeProps> = ({ lessons, completedLessonIds, quizPassed, courseTitle }) => {
  const totalLessons = lessons.length;
  const completedCount = lessons.filter((l) => completedLessonIds.includes(l.id)).length;
  const completionPercentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  // Render an SVG based on completed lessons
  // We will build a central trunk and branches curving off left and right for each lesson
  return (
    <div className="bg-paper rounded-3xl p-4 border border-rule shadow-md" id="progress-tree-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-6 h-6 text-ochre" />
          <h3 className="text-base font-display font-bold text-ink tracking-tight">Progress Tree</h3>
        </div>
        <span className="bg-ochre-dim text-ochre text-[11px] font-bold px-3 py-1 rounded-full border border-ochre/30 font-mono">
          {completedCount}/{totalLessons}
        </span>
      </div>

      <div className="relative flex flex-col items-center bg-paper-2/60 rounded-2xl p-3 border border-rule overflow-hidden h-[260px]">
        {/* Dynamic SVG Drawing */}
        <svg
          viewBox="0 0 200 240"
          className="w-full h-full max-w-[220px]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Ground / Roots area */}
          <path d="M 20 220 C 60 215, 140 215, 180 220" stroke="#8B9490" strokeWidth="4" strokeLinecap="round" />
          <path d="M 100 200 C 100 215, 80 225, 70 230" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
          <path d="M 100 200 C 100 215, 120 225, 130 230" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />

          {/* Central Trunk */}
          {/* Base thickness and height */}
          <path d="M 100 205 L 100 45" stroke="#78350f" strokeWidth="10" strokeLinecap="round" />
          {/* Internal wood grains for aesthetic details */}
          <path d="M 100 180 L 100 70" stroke="#451a03" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 8" />

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
                  stroke={isCompleted ? '#2A6644' : '#8B9490'}
                  strokeWidth={isCompleted ? '5' : '3'}
                  strokeLinecap="round"
                  fill="none"
                />

                {/* If completed, sprout multiple bright leaves on the branch */}
                {isCompleted ? (
                  <g>
                    {/* Leaf 1 */}
                    <path
                      d={`M ${endX} ${endY} Q ${endX + (isLeft ? -12 : 12)} ${endY - 6}, ${endX + (isLeft ? -10 : 10)} ${endY - 16} Q ${endX + (isLeft ? -2 : 2)} ${endY - 10}, ${endX} ${endY}`}
                      fill="#2A6644"
                      stroke="#2A6644"
                      strokeWidth="1"
                    />
                    {/* Leaf 2 */}
                    <path
                      d={`M ${endX - (isLeft ? 8 : -8)} ${endY - 4} Q ${endX + (isLeft ? -18 : 18)} ${endY + 6}, ${endX + (isLeft ? -14 : 14)} ${endY - 4} Q ${endX + (isLeft ? -6 : 6)} ${endY - 4}, ${endX - (isLeft ? 8 : -8)} ${endY - 4}`}
                      fill="#2A6644"
                      stroke="#2A6644"
                      strokeWidth="1"
                    />
                    {/* Completion indicator node */}
                    <circle cx={endX} cy={endY} r="4" fill="#D4922B" stroke="#D4922B" strokeWidth="1" />
                  </g>
                ) : (
                  // Dormant small grey/brown bud if lesson incompleted
                  <circle cx={endX} cy={endY} r="3.5" fill="#8B9490" stroke="#8B9490" strokeWidth="1" />
                )}

                {/* Lesson number visual text floating on the side */}
                <text
                  x={isLeft ? endX - 16 : endX + 16}
                  y={endY + 4}
                  textAnchor="middle"
                  className="font-mono font-black text-[9px] fill-ink bg-white"
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
              <path d="M 100 45 L 100 30" stroke="#2A6644" strokeWidth="4" />
              {/* Flower Center */}
              <circle cx="100" cy="24" r="9" fill="#D4922B" stroke="#D4922B" strokeWidth="2.5" />
              {/* Petal Top */}
              <circle cx="100" cy="11" r="6" fill="#F0DEB6" stroke="#D4922B" strokeWidth="1.5" />
              {/* Petal Bottom */}
              <circle cx="100" cy="37" r="6" fill="#F0DEB6" stroke="#D4922B" strokeWidth="1.5" />
              {/* Petal Left */}
              <circle cx="87" cy="24" r="6" fill="#F0DEB6" stroke="#D4922B" strokeWidth="1.5" />
              {/* Petal Right */}
              <circle cx="113" cy="24" r="6" fill="#F0DEB6" stroke="#D4922B" strokeWidth="1.5" />
              {/* Little crown award */}
              <path d="M 97 22 L 100 18 L 103 22" stroke="#D4922B" strokeWidth="1.5" strokeLinecap="round" />
            </g>
          ) : (
            // A closed green bud at apex if course not fully completed/quiz not passed yet
            <g>
              <path d="M 100 45 L 100 34" stroke="#78350f" strokeWidth="4" />
              {/* Closed green/amber bud ready to bloom */}
              <path
                d="M 100 34 C 92 34, 94 20, 100 16 C 106 20, 108 34, 100 34"
                fill={completionPercentage > 60 ? '#D4922B' : '#8B9490'}
                stroke={completionPercentage > 60 ? '#D4922B' : '#8B9490'}
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {/* Tree Key Info */}
        <div className="absolute bottom-2 left-2 right-2 bg-paper/95 border border-rule px-3 py-1.5 rounded-xl flex items-center justify-between text-[11px] text-ink-3 font-mono shadow-sm">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-success border border-success/60 inline-block"></span>
            <span>Leaves = Lessons</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-ochre border border-ochre inline-block animate-pulse"></span>
            <span>Flower = Quiz passed!</span>
          </div>
        </div>
      </div>

      {/* Narrative Progress Text Helper for clarity without needing high-literacy */}
      <div className="mt-3 flex items-start gap-2 bg-ochre-dim/40 rounded-xl px-3 py-2 border border-ochre/30">
        <Info className="w-4 h-4 text-ochre shrink-0 mt-0.5" />
        <p className="text-[11px] font-sans font-medium leading-relaxed text-ink-2">
          {quizPassed
            ? 'Congratulations! Your tree is fully grown with a beautiful blossom. You have passed this course!'
            : `Keep growing! You completed ${completedCount} of ${totalLessons} lessons. Read all lessons to turn branches green, then take the test to bloom your golden flower.`}
        </p>
      </div>
    </div>
  );
};
