// src/types.ts

export type OnboardingStatus = 'onboarding' | 'pending_approval' | 'active' | 'rejected';

export interface User {
  id: number;
  uid: string;
  email: string;
  name: string | null;
  role: 'learner' | 'instructor' | 'admin';
  onboardingStatus?: OnboardingStatus;
  bio?: string | null;
  organization?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  closureStatus?: 'pending' | 'closed' | null;
  closureStartedAt?: string | null;
  closureRetentionDays?: number | null;
  closureReason?: string | null;
  closureEffective?: 'pending' | 'closed' | null;
  closureDeadline?: string | null;
  avatarUrl?: string | null;
  createdAt?: string;
}

export interface Course {
  id: number;
  title: string;
  description: string;
  thumbnail: string | null;
  createdBy?: number | null;
  createdByName?: string | null;
  isArchived?: boolean;
  instructorClosureStatus?: 'pending' | 'closed' | null;
  instructorClosureDeadline?: string | null;
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

export interface Message {
  id: number;
  conversationId: number;
  senderId: number | null;
  senderName?: string | null;
  senderNameSnapshot?: string | null;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface Conversation {
  id: number;
  courseId: number;
  courseTitle?: string;
  learnerId: number | null;
  learnerName?: string | null;
  instructorId: number | null;
  instructorName?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount?: number;
}
