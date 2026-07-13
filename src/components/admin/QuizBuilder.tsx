// src/components/admin/QuizBuilder.tsx
import React, { useState } from 'react';
import { Course } from '../../types.ts';
import { apiFetch } from '../../lib/api.ts';
import { CheckSquare, Award, Plus, Trash2, Check } from 'lucide-react';

interface QuizBuilderProps {
  token: string | null;
  selectedCourse: Course;
  onRefreshCourses: () => void;
  loadCourseFullDetails: (id: number) => Promise<void>;
  initialQuizForm: {
    title: string;
    questions: { questionText: string; options: string[]; correctOptionIndex: number }[];
  };
}

export const QuizBuilder: React.FC<QuizBuilderProps> = ({
  token,
  selectedCourse,
  onRefreshCourses,
  loadCourseFullDetails,
  initialQuizForm,
}) => {
  const [quizForm, setQuizForm] = useState(initialQuizForm);
  const [newQuestion, setNewQuestion] = useState({
    questionText: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0,
  });
  const [directQuestion, setDirectQuestion] = useState({
    questionText: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0,
  });
  const [directIsLoading, setDirectIsLoading] = useState(false);
  const [directSuccessMsg, setDirectSuccessMsg] = useState('');

  const handleAddQuestion = () => {
    if (!newQuestion.questionText.trim() || newQuestion.options.some((opt) => !opt.trim())) {
      alert('All question choices and descriptions must be filled.');
      return;
    }
    setQuizForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          questionText: newQuestion.questionText.trim(),
          options: newQuestion.options.map((o) => o.trim()),
          correctOptionIndex: newQuestion.correctOptionIndex,
        },
      ],
    }));
    setNewQuestion({ questionText: '', options: ['', '', '', ''], correctOptionIndex: 0 });
  };

  const handleRemoveQuestion = (idx: number) => {
    setQuizForm((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== idx) }));
  };

  const handleSaveQuiz = async () => {
    if (!token || !selectedCourse || quizForm.questions.length === 0) return;

    try {
      const { ok } = await apiFetch(`/api/admin/courses/${selectedCourse.id}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: selectedCourse.id,
          title: quizForm.title || `${selectedCourse.title} Exam`,
          questions: quizForm.questions,
        }),
      });

      if (ok) {
        alert('Course exam and grading answers published successfully!');
        await loadCourseFullDetails(selectedCourse.id);
        onRefreshCourses();
      }
    } catch (error) {
      console.error('Failed to save quiz:', error);
    }
  };

  const handleSaveDirectQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !token) return;
    if (!directQuestion.questionText.trim()) return;

    setDirectIsLoading(true);
    setDirectSuccessMsg('');

    try {
      const { ok, data, status } = await apiFetch(`/api/admin/courses/${selectedCourse.id}/quiz/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: selectedCourse.id,
          questionText: directQuestion.questionText.trim(),
          options: directQuestion.options.map((o) => o.trim()),
          correctOptionIndex: directQuestion.correctOptionIndex,
        }),
      });

      if (ok) {
        setDirectSuccessMsg(`Successfully saved! Total Course MCQs now: ${data.totalMCQsCount}.`);
        setDirectQuestion({ questionText: '', options: ['', '', '', ''], correctOptionIndex: 0 });
        await loadCourseFullDetails(selectedCourse.id);
      } else {
        alert(`Failed: ${data?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error inserting MCQ:', error);
      alert('Network exception saving MCQ.');
    } finally {
      setDirectIsLoading(false);
    }
  };

  return (
    <>
      {/* Direct MCQ Database Injector */}
      <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm font-sans bg-gradient-to-br from-white to-pink-50/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-pink-50">
          <div>
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-pink-600" />
              <span>Direct MCQ Database Injector</span>
            </h4>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Deploy a single multiple-choice question instantly to this course's live database.
            </p>
          </div>
          <span className="bg-pink-100 text-pink-800 text-[10px] uppercase font-mono font-bold px-2.5 py-0.5 rounded-full self-start sm:self-center tracking-wider">
            Live Engine
          </span>
        </div>

        <form onSubmit={handleSaveDirectQuestion} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">
              Question Prompt:
            </label>
            <input
              type="text"
              required
              value={directQuestion.questionText}
              onChange={(e) => setDirectQuestion((q) => ({ ...q, questionText: e.target.value }))}
              placeholder="e.g. Which metric represents the variance in sample metrics?"
              className="w-full p-2.5 border border-slate-155 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-pink-500/15 focus:border-pink-500 transition-all font-semibold text-slate-855"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans">
            {directQuestion.options.map((option, oIdx) => (
              <div key={oIdx}>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 font-mono">
                  Choice {String.fromCharCode(65 + oIdx)}:
                </label>
                <input
                  type="text"
                  required
                  value={option}
                  onChange={(e) => {
                    const opts = [...directQuestion.options];
                    opts[oIdx] = e.target.value;
                    setDirectQuestion((q) => ({ ...q, options: opts }));
                  }}
                  placeholder={`Option ${String.fromCharCode(65 + oIdx)}...`}
                  className="w-full p-2.5 border border-slate-155 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-pink-500/15 focus:border-pink-500 transition-all font-semibold text-slate-700"
                />
              </div>
            ))}
          </div>

          <div className="pt-2 font-sans">
            <label className="block text-[10px] font-bold text-slate-500 mb-2 font-mono">
              Mark the correct option index:
            </label>
            <div className="flex flex-wrap gap-4 font-bold font-mono text-xs text-slate-700">
              {directQuestion.options.map((_, oIdx) => (
                <label
                  key={oIdx}
                  className="flex items-center gap-2 cursor-pointer hover:text-pink-600 transition-colors"
                >
                  <input
                    type="radio"
                    name="directCorrectIdx"
                    value={oIdx}
                    checked={directQuestion.correctOptionIndex === oIdx}
                    onChange={() => setDirectQuestion((q) => ({ ...q, correctOptionIndex: oIdx }))}
                    className="w-4 h-4 text-pink-600 focus:ring-0 cursor-pointer"
                  />
                  <span className="font-sans font-bold text-slate-755">Option {String.fromCharCode(65 + oIdx)}</span>
                </label>
              ))}
            </div>
          </div>

          {directSuccessMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-150 text-emerald-800 text-xs font-semibold rounded-2xl flex items-center gap-2 animate-fade-in font-sans">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping shrink-0" />
              <span>{directSuccessMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={directIsLoading}
            className="w-full h-11 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 border border-pink-700/20 cursor-pointer"
          >
            {directIsLoading ? (
              <span className="font-mono text-xs animate-pulse">SAVING TO DATABASE...</span>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>INJECT MCQ AND SYNC CATALOG</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Course Exam Publisher */}
      <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm font-sans">
        <div className="border-b border-slate-100 pb-3 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Award className="w-4.5 h-4.5 text-indigo-600" />
              <span>Course Exam Publisher</span>
            </h4>
            <p className="text-slate-505 text-[11px] mt-0.5">
              Assemble comprehensive multi-question evaluation assessments.
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">Exam Title:</label>
            <input
              type="text"
              value={quizForm.title}
              onChange={(e) => setQuizForm((q) => ({ ...q, title: e.target.value }))}
              className="w-full p-2.5 border border-slate-155 rounded-xl text-xs bg-slate-50/55 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-bold text-slate-800"
              placeholder="e.g. Calculus & Inference Final Exam"
            />
          </div>

          <div className="bg-slate-50/60 border border-slate-200 p-5 rounded-2.5xl">
            <h5 className="font-bold text-slate-800 text-xs mb-3 flex items-center gap-1.5 uppercase tracking-tight">
              <CheckSquare className="w-4 h-4 text-indigo-600" />
              <span>Formulate Question Node</span>
            </h5>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 font-mono">Question Text:</label>
                <input
                  type="text"
                  value={newQuestion.questionText}
                  onChange={(e) => setNewQuestion((q) => ({ ...q, questionText: e.target.value }))}
                  placeholder="e.g. Which coefficient measures direct correlation?"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-semibold text-slate-850"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {newQuestion.options.map((option, oIdx) => (
                  <div key={oIdx}>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 font-mono">
                      Option {String.fromCharCode(65 + oIdx)}:
                    </label>
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => {
                        const opts = [...newQuestion.options];
                        opts[oIdx] = e.target.value;
                        setNewQuestion((q) => ({ ...q, options: opts }));
                      }}
                      placeholder={`Alternative Choice ${String.fromCharCode(65 + oIdx)}...`}
                      className="w-full p-2.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-semibold text-slate-700"
                    />
                  </div>
                ))}
              </div>
              <div className="pt-2 font-sans">
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 font-mono">
                  Select the correct alternative answer:
                </label>
                <div className="flex flex-wrap gap-4 font-bold font-mono text-[11px] text-slate-600">
                  {newQuestion.options.map((_, oIdx) => (
                    <label key={oIdx} className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-600">
                      <input
                        type="radio"
                        name="correctIdx"
                        value={oIdx}
                        checked={newQuestion.correctOptionIndex === oIdx}
                        onChange={() => setNewQuestion((q) => ({ ...q, correctOptionIndex: oIdx }))}
                        className="w-4 h-4 text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Choice {String.fromCharCode(65 + oIdx)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddQuestion}
                className="h-10 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border border-indigo-700/20"
              >
                <Plus className="w-4 h-4" />
                <span>ADD QUESTION UNIT</span>
              </button>
            </div>
          </div>

          {quizForm.questions.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-2">
                Quiz Inscription Queue:
              </p>
              {quizForm.questions.map((q, idx) => (
                <div
                  key={idx}
                  className="bg-indigo-50/40 border border-indigo-100 p-4 rounded-xl flex items-center justify-between gap-4 text-xs shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-indigo-950 font-sans leading-snug truncate">
                      {idx + 1}. {q.questionText}
                    </p>
                    <p className="text-slate-500 font-medium mt-1 truncate">
                      Options: {q.options.join(' | ')} (Correct: Choice {String.fromCharCode(65 + q.correctOptionIndex)}
                      )
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveQuestion(idx)}
                    className="p-1 px-1.5 text-red-500 hover:bg-red-50 rounded transition-colors active:scale-95 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSaveQuiz}
          disabled={quizForm.questions.length === 0}
          className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 shadow-sm active:scale-95 transition-all outline-none border border-indigo-700/20 cursor-pointer"
        >
          <Check className="w-5 h-5" />
          <span>PUBLISH COMPLETE COURSE EXAM SHEET</span>
        </button>
      </div>
    </>
  );
};
