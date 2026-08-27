// src/types.ts

export interface User {
  id: number;
  uid: string;
  email: string;
  name: string | null;
  role: 'learner' | 'instructor' | 'admin';
  avatarUrl?: string | null;
  cohortId?: number | null;
  createdAt?: string;
}

export interface Course {
  id: number;
  title: string;
  description: string;
  thumbnail: string | null;
  lessons?: Lesson[];
  quiz?: Quiz | null;
}

export interface PublicCourse {
  id: number;
  title: string;
  description: string;
  thumbnail: string | null;
  lessonCount: number;
  hasQuiz: boolean;
}

export interface Lesson {
  id: number;
  courseId: number;
  title: string;
  content: string;
  videoUrl: string | null;
  slidesUrl: string | null;
  sortOrder: number;
  createdAt?: string;
}

export interface Quiz {
  id: number;
  courseId: number;
  title: string;
  questions?: Question[];
  createdAt?: string;
}

export interface Question {
  id: number;
  quizId: number;
  questionText: string;
  options: string[]; // Options array
}

export interface QuizAttempt {
  id: number;
  userId: number;
  quizId: number;
  score: number;
  passed: boolean;
  attemptedAt: string;
}

export interface DocumentMetadata {
  id: string;
  lessonId: number;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}
