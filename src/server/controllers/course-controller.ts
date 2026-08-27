import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import * as courseListService from '../services/course-list-service.js';
import * as lessonService from '../services/lesson-service.js';
import { completeCourse } from '../services/course-service.js';

export async function listPublicCourses(_req: Request, res: Response): Promise<void> {
  try {
    const courses = await courseListService.listPublicCourses();
    res.json(courses);
  } catch (error: any) {
    console.error('Error fetching public courses:', error);
    res.status(500).json({ error: 'Failed to retrieve course catalogue.' });
  }
}

export async function listCourses(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { limit, offset } = courseListService.parsePagination(req);
    const { courses, count } = await courseListService.listCourses(limit, offset);
    res.setHeader('X-Total-Count', count);
    res.json(courses);
  } catch (error: any) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Failed to retrieve courses.' });
  }
}

export async function getCourseById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.id);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }
    const detail = await courseListService.getCourseDetail(courseId, req.dbUser!.id);
    if (!detail) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    res.json(detail);
  } catch (error: any) {
    console.error('Error loading course details:', error);
    res.status(500).json({ error: 'Failed to load course details.' });
  }
}

export async function completeCourseHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.id);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }
    const result = await completeCourse(req.dbUser!.id, courseId);
    res.json({ success: true, completionId: result.completionId, completedAt: result.completedAt.toISOString() });
  } catch (error: any) {
    if (error.message?.startsWith('Course not completable:')) {
      res.status(422).json({ error: error.message });
      return;
    }
    console.error('Error in /api/courses/:id/complete:', error);
    res.status(500).json({ error: error.message || 'Failed to complete course.' });
  }
}

export async function completeLesson(req: AuthRequest, res: Response): Promise<void> {
  try {
    const lessonId = parseInt(req.params.id);
    if (isNaN(lessonId)) {
      res.status(400).json({ error: 'Invalid lesson ID' });
      return;
    }
    await lessonService.completeLesson(req.dbUser!.id, lessonId);
    res.json({ success: true, lessonId });
  } catch (error: any) {
    console.error('Error checking/creating lesson completion:', error);
    res.status(500).json({ error: 'Failed to complete lesson.' });
  }
}
