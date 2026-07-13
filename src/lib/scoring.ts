// src/lib/scoring.ts
// Pure quiz scoring module — extracts the duplicated algorithm from server.ts routes.

export interface ScorableQuestion {
  correctOptionIndex: number;
}

export interface ScoreResult {
  correctCount: number;
  totalQuestions: number;
  score: number;
  passed: boolean;
}

const PASS_THRESHOLD = 70;

export const scoreQuiz = (questions: ScorableQuestion[], answers: (number | undefined)[]): ScoreResult => {
  const totalQuestions = questions.length;

  if (totalQuestions === 0) {
    return { correctCount: 0, totalQuestions: 0, score: 0, passed: false };
  }

  let correctCount = 0;

  questions.forEach((q, idx) => {
    const submittedAnswer = answers[idx];
    if (submittedAnswer !== undefined && submittedAnswer === q.correctOptionIndex) {
      correctCount++;
    }
  });

  const rawScore = (correctCount / totalQuestions) * 100;
  const score = Math.round(rawScore);
  const passed = score >= PASS_THRESHOLD;

  return { correctCount, totalQuestions, score, passed };
};
