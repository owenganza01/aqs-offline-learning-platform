// src/lib/pouchdb-service.ts
import { Course } from '../types.ts';

// We implement an ultra-reliable, zero-dependency LocalStorage backend with exactly the same
// Promise-based interface as PouchDB, eliminating third-party modules that break in modern ESM environments.
const STORAGE_KEYS = {
  COURSES: 'aqs_local_courses',
  PROGRESS: 'aqs_local_progress',
  SYNC_QUEUE: 'aqs_sync_queue',
  ENROLLED_COURSES: 'aqs_enrolled_courses',
};

interface ProgressState {
  completedLessonIds: number[];
  quizAttempts: any[];
}

interface SyncQueueState {
  lessonCompletions: { lessonId: number; completedAt: string }[];
  quizSubmissions: { quizId: number; answers: number[]; attemptedAt: string }[];
}

export class PouchDBService {
  /**
   * Caches a list of courses (along with their lessons and quiz details) locally.
   * Errors are propagated so callers know when caching fails — silent data loss is a risk.
   */
  static async cacheCourses(courses: Course[]): Promise<void> {
    const existing = await this.getCachedCourses();
    const merged = [...existing];
    for (const incoming of courses) {
      const idx = merged.findIndex((c) => c.id === incoming.id);
      if (idx >= 0) {
        merged[idx] = incoming;
      } else {
        merged.push(incoming);
      }
    }
    localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(merged));
    console.log('Courses cached to local storage successfully!');
  }

  /**
   * Retrieves the offline cached courses.
   */
  static async getCachedCourses(): Promise<Course[]> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.COURSES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.warn(
        '[PouchDB] Failed to read courses from local storage — returning empty cache. Data may be corrupted:',
        error,
      );
      return [];
    }
  }

  /**
   * Load a single course from local storage by its ID.
   */
  static async getCachedCourseById(courseId: number): Promise<Course | null> {
    try {
      const courses = await this.getCachedCourses();
      const course = courses.find((c) => c.id === courseId);
      return course || null;
    } catch (error) {
      console.warn(`[PouchDB] Course ${courseId} not found in local storage cache`);
      return null;
    }
  }

  /**
   * Saves synced completions and attempts from the server to local storage.
   * Errors propagate — callers must handle failures to avoid data loss.
   */
  static async saveUserProgress(completedLessonIds: number[], quizAttempts: any[]): Promise<void> {
    const progress: ProgressState = {
      completedLessonIds,
      quizAttempts,
    };
    localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(progress));
    console.log('User progress synchronized to local storage.');
  }

  /**
   * Reads completed lesson IDs and quiz attempts from local storage.
   */
  static async getUserProgress(): Promise<{ completedLessonIds: number[]; quizAttempts: any[] }> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROGRESS);
      if (data) {
        const state: ProgressState = JSON.parse(data);
        return {
          completedLessonIds: state.completedLessonIds || [],
          quizAttempts: state.quizAttempts || [],
        };
      }
    } catch (e) {
      console.warn(
        '[PouchDB] Failed to read progress from local storage — returning empty state. Progress may be lost:',
        e,
      );
    }
    return { completedLessonIds: [], quizAttempts: [] };
  }

  /**
   * Queues a completed lesson locally when the learner is offline.
   * Errors propagate to avoid silent data loss.
   */
  static async queueLessonCompletionOffline(lessonId: number): Promise<void> {
    // 1. Add to local completions in progress so it is visible immediately offline
    const progress = await this.getUserProgress();
    if (!progress.completedLessonIds.includes(lessonId)) {
      progress.completedLessonIds.push(lessonId);
      await this.saveUserProgress(progress.completedLessonIds, progress.quizAttempts);
    }

    // 2. Queue in offline write sync list
    const queue = await this.getSyncQueue();
    const completions = queue.lessonCompletions || [];
    if (!completions.some((c: any) => c.lessonId === lessonId)) {
      completions.push({
        lessonId,
        completedAt: new Date().toISOString(),
      });
    }

    const updatedQueue: SyncQueueState = {
      ...queue,
      lessonCompletions: completions,
    };
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(updatedQueue));
    console.log(`Queued lesson ${lessonId} completion offline.`);
  }

  /**
   * Queues a quiz submission locally when the learner is offline.
   * Errors propagate to avoid silent data loss.
   */
  static async queueQuizSubmissionOffline(quizId: number, answers: number[]): Promise<void> {
    const queue = await this.getSyncQueue();
    const submissions = queue.quizSubmissions || [];
    // Replace previous un-synced offline submission if it exists
    const filtered = submissions.filter((s: any) => s.quizId !== quizId);
    filtered.push({
      quizId,
      answers,
      attemptedAt: new Date().toISOString(),
    });

    const updatedQueue: SyncQueueState = {
      ...queue,
      quizSubmissions: filtered,
    };
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(updatedQueue));
    console.log(`Queued quiz ${quizId} submissions offline with answers:`, answers);
  }

  /**
   * Fetches the local sync queue.
   */
  static async getSyncQueue(): Promise<{ lessonCompletions: any[]; quizSubmissions: any[] }> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
      if (data) {
        const state: SyncQueueState = JSON.parse(data);
        return {
          lessonCompletions: state.lessonCompletions || [],
          quizSubmissions: state.quizSubmissions || [],
        };
      }
    } catch (e) {
      console.warn(
        '[PouchDB] Failed to read sync queue from local storage — returning empty queue. Pending sync items may be lost:',
        e,
      );
    }
    return { lessonCompletions: [], quizSubmissions: [] };
  }

  /**
   * Clears the synced actions from the offline queue.
   * Errors propagate to avoid silent data loss.
   */
  static async clearSyncQueue(): Promise<void> {
    const queue: SyncQueueState = {
      lessonCompletions: [],
      quizSubmissions: [],
    };
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));
    console.log('Local sync queue cleared.');
  }

  /**
   * Retrieves list of course IDs the user has enrolled in.
   */
  static async getEnrolledCourseIds(): Promise<number[]> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ENROLLED_COURSES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('[PouchDB] Error reading enrolled course IDs from local storage:', e);
      return [];
    }
  }

  /**
   * Enrolls in a course. Errors propagate to avoid silent data loss.
   */
  static async enrollInCourse(courseId: number): Promise<void> {
    const enrolled = await this.getEnrolledCourseIds();
    if (!enrolled.includes(courseId)) {
      enrolled.push(courseId);
      localStorage.setItem(STORAGE_KEYS.ENROLLED_COURSES, JSON.stringify(enrolled));
    }
  }
}
